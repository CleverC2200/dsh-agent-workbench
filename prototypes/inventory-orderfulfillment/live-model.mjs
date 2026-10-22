import {
  createQueryClient,
  QueryContractError,
} from '../../business/shared/configured-query-client.mjs';

export function shanghaiToday(now = new Date()) {
  return new Date(now.getTime() + 8 * 3600000).toISOString().slice(0, 10);
}
export function nextDay(day) {
  return new Date(Date.parse(day + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10);
}
export function batchAges(rows,asOf=null) {
  const date=value=>{
    const raw=String(value??'');
    const day=/^\d{8}$/.test(raw)?`${raw.slice(0,4)}-${raw.slice(4,6)}-${raw.slice(6,8)}`:raw.slice(0,10);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(day))return null;
    const time=Date.parse(day+'T00:00:00Z');
    return Number.isFinite(time)&&time>=Date.UTC(2000,0,1)&&new Date(time).toISOString().slice(0,10)===day?time:null;
  };
  const fields=['age_lt40','age_40_60','age_60_90','age_90_120','age_ge120'];
  const groups=new Map();
  for(const row of rows){const key=JSON.stringify([row.base,row.sku]);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);}
  return [...groups.values()].map(group=>{
    const result={base:group[0].base,sku:group[0].sku,batch_date:group[0].batch_date,...Object.fromEntries(fields.map(field=>[field,0]))};
    let valid=new Set(group.map(row=>row.batch_date)).size===1;
    for(const row of group){
      const snapshot=date(row.batch_date),production=date(row.production_date),quantity=row.quantity===null?NaN:Number(row.quantity);
      const age=snapshot!==null&&production!==null?(snapshot-production)/86400000:null;
      if(age===null||age<0||(asOf!==null&&snapshot!==date(asOf)-86400000)||!Number.isFinite(quantity)||quantity<0||row.minimum_quantity===null||!Number.isFinite(Number(row.minimum_quantity))||Number(row.minimum_quantity)<0||!(Number(row.batch_rows)>0)||Number(row.batch_rows)!==Number(row.known_quantities)){valid=false;continue;}
      result[fields[age<40?0:age<60?1:age<90?2:age<120?3:4]]+=quantity;
    }
    if(!valid)for(const field of fields)result[field]=null;
    return result;
  });
}
export function plannedShippingDays(row) {
  const number = (key) =>
    row[key] === null || row[key] === undefined || row[key] === '' ? null : Number(row[key]);
  const date = new Date(row.stock_date + 'T00:00:00Z');
  if (!Number.isFinite(date.getTime()) || number('source_rows') !== 1) return null;
  const days = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  if (number('month_days') !== days) return null;
  const effective = (name) => {
    const adjusted = number(name + '_adjusted');
    return adjusted !== null && adjusted > 0 ? adjusted : number(name + '_initial');
  };
  const main = effective('main_plan');
  const bp = effective('bp_plan');
  const sales = main === null || bp === null ? null : main + bp;
  const transfer = effective('transfer_plan');
  const available = number('available_qty');
  if (
    [available, sales, transfer].some(
      (value) => value === null || !Number.isFinite(value) || value < 0,
    )
  )
    return null;
  const daily = (sales + transfer * 0.5) / days;
  return daily > 0 ? available / daily : null;
}
const alias = (value) =>
  typeof value === 'string'
    ? value
    : (value.outputAlias ?? value.alias ?? value.name ?? value.columnName);

/** Render only granted outputs; a rejected field never becomes an empty/zero business fact. */
export function visibleResult(result) {
  const denied = new Set((result.rejectedColumns ?? []).map(alias));
  const columns = (
    result.returnedColumns ?? [...new Set(result.rows.flatMap((row) => Object.keys(row)))]
  )
    .map(alias)
    .filter((column) => typeof column === 'string' && !denied.has(column));
  return {
    ...result,
    columns,
    rows: result.rows.map((row) =>
      Object.fromEntries(
        columns
          .filter((column) => Object.hasOwn(row, column))
          .map((column) => [column, row[column]]),
      ),
    ),
  };
}

/** Each collection keeps count/page/config and permission checks separate from other cards. */
export function createFulfillmentReader(config, execute) {
  const client = createQueryClient(config, execute);
  async function collection(id, filters, { signal, page = 1, size = 20 } = {}) {
    const countId = config.queries[id].pagination.countQuery;
    const before = await client.read(countId, filters, { signal, requiredColumns: ['total'] });
    const rawTotal = before.rows.length === 1 ? before.rows[0].total : null;
    if (!/^(0|[1-9]\d*)$/.test(String(rawTotal)) || !Number.isSafeInteger(Number(rawTotal)))
      throw new QueryContractError('INVALID_COUNT', '订单分页计数无效');
    const total = Number(rawTotal);
    const currentPage = Math.min(page, Math.max(1, Math.ceil(total / size)));
    const offset = (currentPage - 1) * size;
    const result = await client.read(id, { ...filters, page_size: size, offset }, { signal });
    const after = await client.read(countId, filters, { signal, requiredColumns: ['total'] });
    if (
      before.configVersion !== result.configVersion ||
      after.configVersion !== result.configVersion
    )
      throw new QueryContractError('QUERY_CONFIG_CHANGED', '读取期间配置已变化，请刷新');
    if (
      after.rows.length !== 1 ||
      Number(after.rows[0].total) !== total ||
      result.rows.length !== Math.min(size, Math.max(total - offset, 0))
    )
      throw new QueryContractError('RESULT_INCOMPLETE', '读取期间计数或分页已变化，请刷新');
    return {
      ...visibleResult(result),
      total,
      page: currentPage,
      size,
      readAt: new Date().toISOString(),
    };
  }
  return {
    collection,
    async all(id,filters,{signal}={}) {
      const first=await collection(id,filters,{signal,size:200});
      const rows=[...first.rows];
      const columns=JSON.stringify([first.returnedColumns,first.rejectedColumns]);
      const pages=Math.ceil(first.total/200);
      for(let page=2;page<=pages;page+=4) {
        const batch=await Promise.all(Array.from({length:Math.min(4,pages-page+1)},(_,index)=>{
          const offset=(page+index-1)*200;
          return client.read(id,{...filters,page_size:200,offset},{signal}).then(result=>({result:visibleResult(result),offset}));
        }));
        for(const {result,offset} of batch) {
          if(result.configVersion!==first.configVersion||JSON.stringify([result.returnedColumns,result.rejectedColumns])!==columns||result.rows.length!==Math.min(200,first.total-offset))
            throw new QueryContractError('RESULT_INCOMPLETE','指标输入或字段权限在分页期间发生变化');
          rows.push(...result.rows);
        }
      }
      if(pages>1) {
        const after=await client.read(config.queries[id].pagination.countQuery,filters,{signal,requiredColumns:['total']});
        if(after.configVersion!==first.configVersion||after.rows.length!==1||Number(after.rows[0].total)!==first.total||rows.length!==first.total)
          throw new QueryContractError('RESULT_INCOMPLETE','指标总数在分页期间发生变化');
      }
      return {...first,rows,scope:'当前筛选与授权范围完整输入'};
    },
    async summary(id, filters, signal) {
      const result = await client.read(id, filters, { signal });
      if (result.rows.length !== 1)
        throw new QueryContractError('INVALID_QUERY_RESPONSE', '汇总结果不完整');
      return visibleResult(result);
    },
  };
}

/** A newer load owns publication, even if an old transport ignores cancellation. */
export function createLoadOwner() {
  let generation = 0,
    controller;
  return {
    begin() {
      controller?.abort();
      controller = new AbortController();
      const own = ++generation;
      return {
        signal: controller.signal,
        current: () => own === generation && !controller.signal.aborted,
      };
    },
    invalidate() {
      generation++;
      controller?.abort();
    },
  };
}
