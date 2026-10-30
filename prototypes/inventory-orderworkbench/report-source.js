import { applyPeriodAttributions } from './period-attributions.mjs';
import { createAgentQueries } from '../../business/shared/agent-query.ts';
import { workbenchQueries } from '../../business/inventory-orderworkbench/queries.mjs';
import {
  computeWorkbenchMetrics, dayOffset, reportPeriods, metricCalculationVersion,
} from './metric-model.mjs';

const config = ORDER_WORKBENCH_APS_CONFIG;
const numbers = new Set([
  'demand',
  'shortage',
  'sample_demand',
  'sample_shortage',
  'sample_records',
  'sample_numerator',
  'sample_denominator',
  'records',
  'invalid',
  'ontime',
  'judged',
  'unjudged',
  'invalid_judgment',
  'numerator',
  'denominator',
  'source_rows',
  'available',
  'inventory',
  'aged',
  'sales_plan',
  'transfer_plan',
  'daily_demand',
  'missing_ship_date',
  'unmatched_order',
  'missing_trace',
  'missing_ship_time',
  'stock_qty',
  'aged_qty',
  'excluded',
  'names',
  'items',
]);
// Doris LENGTH counts UTF-8 bytes; Chinese/emoji must not use JS string offsets.
export function decodeWorkbenchTuple(value, count) {
  const bytes = new TextEncoder().encode(String(value)), tuple = [];
  let cursor = 0;
  for (let field = 0; field < count; field++) {
    const colon = bytes.indexOf(58, cursor);
    const raw = new TextDecoder().decode(bytes.slice(cursor, colon));
    if (colon < cursor || !/^\d+$/.test(raw) || Number(raw) > bytes.length-colon-1) return null;
    const length = Number(raw);
    tuple.push(new TextDecoder('utf-8', {fatal:true}).decode(bytes.slice(colon+1,colon+1+length)));
    cursor = colon+1+length;
  }
  return cursor === bytes.length ? tuple : null;
}
export async function loadWorkbenchReport(start, end, signal, options = {}) {
  const client = createAgentQueries(config, options.execute);
  const specs = reportPeriods(start, end, options.now);
  const read = async (name, values) => {
    signal?.throwIfAborted();
    const definition = workbenchQueries[name],
      id = 'workbench.' + name.toLowerCase()+(options.summary && ['orders','stock','ages','ontime'].includes(name)?'.summary':'');
    const summarized=id.endsWith('.summary');
    if(summarized)values={...values,period_start:values.period_start??values.start,period_end:values.period_end??values.end_exclusive,owner_start:values.period_start??values.start,owner_end:values.period_end??values.end_exclusive};
    const result = definition.keys
      ? await client.readAll(
          id,
          { ...values, report_base: options.base ?? '', page_size: 200, offset: 0 },
          {
            signal,
            keyFields: summarized?(name==='ontime'?['base','invalid','ontime']:['base','category','item','director','names']):definition.keys,
            requiredColumns: summarized?config.queries[id].resultColumns:definition.columns,
            singlePageFirst: true,
          },
        )
      : await client.read(
          id,
          { ...values, report_base: options.base ?? '' },
          { signal, requiredColumns: definition.columns },
        );
    const rows = name === 'ontime' && summarized ? result.rows.flatMap((row) => {
      const packed = typeof row.packed_orders === 'string' ? JSON.parse(row.packed_orders) : row.packed_orders;
      if (!Array.isArray(packed)) throw Object.assign(Error('准交订单分组不完整'), {code:'INVALID_ORDER_PACKETS'});
      return packed.map(order => {
        const tuple = decodeWorkbenchTuple(order, 7);
        if (!tuple) throw Object.assign(Error('准交订单分组字段不完整'), {code:'INVALID_ORDER_PACKETS'});
        const [order_no,customer,arrival_date,...member] = tuple;
        return {order_no,customer,arrival_date,invalid:row.invalid,ontime:row.ontime,members:[member]};
      });
    }) : result.rows;
    const normalized = rows.map((row) =>
      Object.fromEntries(
        Object.entries(row).map(([key, value]) => [
          key,
          numbers.has(key) &&
          typeof value === 'string' &&
          value.trim() !== '' &&
          Number.isFinite(Number(value))
            ? Number(value)
            : value,
        ]),
      ),
    );
    if (name !== 'ontime') return normalized;
    return normalized.flatMap((row) => {
      let members;
      try {
        members = Array.isArray(row.members) ? row.members : JSON.parse(row.members);
      } catch {
        throw Object.assign(Error('准交订单维度不完整'), { code: 'INVALID_ORDER_DIMENSIONS' });
      }
      if (Array.isArray(members))
        members = members.map((member) => {
          if (Array.isArray(member)) return member;
          return decodeWorkbenchTuple(member, 4);
        });
      if (
        !Array.isArray(members) ||
        !members.length ||
        members.some((tuple) => !Array.isArray(tuple) || tuple.length !== 4)
      )
        throw Object.assign(Error('准交订单维度不完整'), { code: 'INVALID_ORDER_DIMENSIONS' });
      const { members: _members, ...order } = row;
      return members.map(([base, category, item, sku]) => ({ ...order, base, category, item, sku }));
    });
  };
  const section = async (id, action) => {
    try {
      return { id, status: 'ready', rows: await action() };
    } catch (error) {
      signal?.throwIfAborted();
      return { id, status: 'error', rows: [], code: error.code ?? 'QUERY_FAILED',
        detail: typeof error.message === 'string' ? error.message.slice(0, 800) : '',
        rejectedColumns: error.rejectedColumns ?? error.failure?.rejectedColumns ?? [] };
    }
  };
  // Share only a fully validated collection inside this one identity-bound load.
  // Each period gets its own rows because its product-item mapping may differ.
  const batchSnapshots = new Map();
  const readBatchSnapshot = async (values) => {
    signal?.throwIfAborted();
    const key = JSON.stringify(values);
    if (!batchSnapshots.has(key)) {
      const pending = read('ages', values).catch((error) => {
        batchSnapshots.delete(key);
        throw error;
      });
      batchSnapshots.set(key, pending);
    }
    const rows = await batchSnapshots.get(key);
    signal?.throwIfAborted();
    return structuredClone(rows);
  };
  const load = async (spec, name) => {
    const values = { start: spec.start, end_exclusive: spec.end };
    if (spec.start >= spec.end)
      return { ...spec, sections: [], metrics: computeWorkbenchMetrics({ ...spec, sections: [] }) };
    const pending = ['orders', 'ontime', 'changes', 'stock', 'ages', 'directors'].map((id) => ({
      id,
      status: 'loading',
      rows: [],
    }));
    const update = () => {
      periods[name] = {
        ...spec,
        sections: [...pending],
        metrics: computeWorkbenchMetrics({ ...spec, sections: pending }),
      };
      progress();
    };
    const [sections, attribution, sharedItems] = await Promise.all([Promise.all(
      ['orders', 'ontime', 'changes', 'stock', 'ages', 'directors'].map((id) =>
        section(id, async () => {
          if (id === 'directors')
            return read(id, {
              start: dayOffset(spec.end, -1).slice(0, 7) + '-01',
              end_exclusive: spec.end,
            });
          if (id !== 'ages') return read(id, values);
          const dates = await read('ageDate', {
            start: spec.start.replaceAll('-', ''),
            end_exclusive: (spec.inventoryEnd ?? spec.end).replaceAll('-', ''),
          });
          const raw = dates[0]?.day;
          if (!raw) return [];
          if (!/^\d{8}$/.test(raw))
            throw Object.assign(Error('快照日期无效'), { code: 'INVALID_SNAPSHOT' });
          const snapshot = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
          return readBatchSnapshot({ start: raw, age_cutoff: dayOffset(snapshot, -60), snapshot,mapping_start:snapshot.slice(0,7)+'-01',mapping_end:dayOffset(snapshot,1),...(options.summary?{period_start:spec.start,period_end:spec.end}: {}) });
        }).then(part => { pending[pending.findIndex(item => item.id === id)] = part; update(); return part; }),
      ),
    ), options.summary ? null : section('directors', () => read('directors', values)),
      options.summary ? null : section('items', () => read('items', values))]);
    if (!options.summary) applyPeriodAttributions(sections, attribution.rows, sharedItems.rows);
    return { ...spec, sections, metrics: computeWorkbenchMetrics({ ...spec, sections }) };
  };
  const periods = {};
  const selected = specs.selected;
  const metadata = Object.fromEntries(
    ['directors', 'customers', 'customerManagers'].map((id) => [
      id,
      { id, status: 'loading', rows: [] },
    ]),
  );
  const snapshot = (complete = false) => ({
    metricCalculationVersion,
    start,
    end,
    selected,
    periods: { ...periods },
    ...metadata,
    complete,
    sqlSummary:options.summary===true,
    attributionVersion:2,
    pendingPeriods: Object.keys(specs).filter((name) => name !== 'selected' && !periods[name]),
    pendingSources: Object.keys(metadata).filter((name) => metadata[name].status === 'loading'),
    readAt: new Date().toISOString(),
    source: 'gea-governed-sql',
    metricRegister: 'https://klvcodtump.feishu.cn/docx/S7zwdltIaoKfZ0x8oqHcStqQnGg',
  });
  const progress = () => {
    signal?.throwIfAborted();
    options.onProgress?.(snapshot());
  };
  periods[selected] = await load(specs[selected], selected);
  progress();
  const entries = Object.entries(specs).filter(
    ([name]) => name !== 'selected' && name !== selected,
  );
  const values = { start: specs[selected].start, end_exclusive: specs[selected].end };
  const loadMetadata = async () =>
    Promise.all(
      ['directors', 'customers', 'customerManagers'].map(async (id) => {
        metadata[id] = await section(id, () =>
          read(
            id,
            id === 'directors'
              ? { start: specs.month.start, end_exclusive: specs.month.end }
              : values,
          ),
        );
        progress();
      }),
    );
  let next = 0;
  await Promise.all([
    loadMetadata(),
    ...Array.from({ length: 2 }, async () => {
      while (next < entries.length) {
        const [name, spec] = entries[next++];
        periods[name] = await load(spec, name);
        progress();
      }
    }),
  ]);
  signal?.throwIfAborted();
  return snapshot(true);
}
export async function loadWorkbenchSkuPage(start,end,category,page,signal,base='',options={}) {
 const client=createAgentQueries(config,options.execute);
 const periods=reportPeriods(start,end,options.now);
 const dates=await client.read('workbench.agedate',{start:start.replaceAll('-',''),end_exclusive:(periods[periods.selected].inventoryEnd??end).replaceAll('-',''),report_base:base},{signal,requiredColumns:['day']});
 const raw=dates.rows[0]?.day??'';
 if(raw&&!/^\d{8}$/.test(raw))throw Error('INVALID_SNAPSHOT');
 const snapshot=raw?`${raw.slice(0,4)}-${raw.slice(4,6)}-${raw.slice(6,8)}`:start;
 const values={start,end_exclusive:end,report_base:base,period_start:start,period_end:end,owner_start:start,owner_end:end,batch_start:raw||'00000000',age_cutoff:dayOffset(snapshot,-60),snapshot,mapping_start:snapshot.slice(0,7)+'-01',mapping_end:dayOffset(snapshot,1),category,page_size:20,offset:page*20,sku_page_size:20,sku_offset:page*20};
 const pick=(id,input=values)=>Object.fromEntries(Object.values(config.queries[id].parameterSpec).map(spec=>[spec.name,input[spec.name]]));
 const keys=await client.read('workbench.sku.keys',pick('workbench.sku.keys'),{signal,requiredColumns:['base','sku']});
 const count=await client.read('workbench.sku.keys.count',pick('workbench.sku.keys.count'),{signal,requiredColumns:['total']});
 const total=Number(count.rows[0]?.total);
 if(!Number.isSafeInteger(total)||total<0||keys.rows.length!==Math.max(0,Math.min(20,total-page*20))||keys.configVersion!==count.configVersion)throw Error('SKU_PAGE_INCOMPLETE');
 const sections=await Promise.all(['orders','stock','ages'].map(async id=>{
  const result=await client.readAll('workbench.'+id+'.page',pick('workbench.'+id+'.page',{...values,page_size:200,offset:0}),{signal,keyFields:workbenchQueries[id].keys,requiredColumns:workbenchQueries[id].columns,singlePageFirst:true});
  if(result.configVersion!==keys.configVersion)throw Error('QUERY_CONFIG_CHANGED');
  return{id,status:'ready',rows:result.rows};
 }));
 const period={...periods[periods.selected],sections};period.metrics=computeWorkbenchMetrics(period);
 return {period,keys:keys.rows,total,page,size:20};
}
