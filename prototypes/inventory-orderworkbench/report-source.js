import { applyPeriodAttributions, collectDirectorMembers } from './period-attributions.mjs';
import { createAgentQueries } from '../../business/shared/agent-query.ts';
import { workbenchQueries } from '../../business/inventory-orderworkbench/queries.mjs';
import { decodeScalarArray, unpackRowPackets } from '../../business/shared/row-packets.mjs';
import { workbenchPeriodPacketSize, workbenchDirectorPeriodColumns } from '../../business/inventory-orderworkbench/period-summary-contract.mjs';
import {
  computeWorkbenchMetrics, dayOffset, reportPeriods, metricCalculationVersion,
} from './metric-model.mjs';

const defaultConfig = typeof ORDER_WORKBENCH_APS_CONFIG === 'undefined' ? null : ORDER_WORKBENCH_APS_CONFIG;
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
  const config = options.config ?? defaultConfig;
  if (!config) throw Error('ORDER_METRIC_CONFIG_REQUIRED');
  const client = createAgentQueries(config, options.execute);
  const specs = options.singlePeriod
    ? { selected: 'month', month: options.singlePeriod }
    : reportPeriods(start, end, options.now);
  const primaryNames = ['month', 'week'].filter(name => specs[name]);
  const sectionIds = options.sections ?? ['orders', 'ontime', 'changes', 'stock', 'ages', 'directors'];
  const calculate = period => computeWorkbenchMetrics(period, undefined, { turnoverScope: options.turnoverScope ?? 'national' });
  const restoredPeriod = spec => options.summary && (options.seedFacts ?? []).flatMap(facts =>
    facts.metricCalculationVersion === metricCalculationVersion && facts.sqlSummary === true && facts.attributionVersion === 2
      ? Object.values(facts.periods ?? {}) : [],
  ).find(period => period.start === spec.start && period.end === spec.end &&
    period.kind === spec.kind && (period.inventoryEnd ?? period.end) === (spec.inventoryEnd ?? spec.end));
  const ontimeWindows = Object.entries(specs).filter(([name]) => name !== 'selected').map(([, spec]) => ({
    ...spec, enabled: spec.start < spec.end && !restoredPeriod(spec)?.sections?.some(part => part.id === 'ontime' && part.status === 'ready'),
  }));
  let ontimePeriods;
  const periodWindows = Object.entries(specs).filter(([name]) => name !== 'selected').map(([, spec]) => spec);
  const needs = (spec, id) => spec.start < spec.end && !restoredPeriod(spec)?.sections?.some(part => part.id === id && part.status === 'ready');
  const periodParameters = id => {
    const first = periodWindows.find(spec => needs(spec, id)) ?? specs.month;
    const values = { start: first.start, end_exclusive: first.end,
      period_start: first.start, period_end: first.end, owner_start: first.start, owner_end: first.end,
      report_base: options.base ?? '', page_size: 200, offset: 0 };
    for (const [index, spec] of periodWindows.entries()) {
      values[`period_${index}_start`] = spec.start;
      values[`period_${index}_end`] = spec.end;
      values[`period_${index}_inventory_end`] = spec.inventoryEnd ?? spec.end;
      values[`period_${index}_director_start`] = dayOffset(spec.end,-1).slice(0,7) + '-01';
      values[`period_${index}_enabled`] = id === 'snapshots' ? needs(spec, 'stock') || needs(spec, 'ages') : needs(spec, id);
      for (const suffix of ['stock_date', 'age_day', 'age_date', 'mapping_start', 'mapping_end']) values[`period_${index}_${suffix}`] = null;
    }
    return values;
  };
  let snapshots;
  const readSnapshots = priority => snapshots ??= client.read('workbench.period-snapshots', periodParameters('snapshots'), {
    signal, priority, requiredColumns: periodWindows.flatMap((_, index) => ['stock_' + index, 'age_' + index]),
  }).then(result => {
    if (result.rows.length !== 1) throw Object.assign(Error('库存快照结果不完整'), { code: 'INVALID_SNAPSHOT' });
    for (const [key, value] of Object.entries(result.rows[0]))
      if ((key.startsWith('stock_') && value !== null && !/^\d{4}-\d{2}-\d{2}$/.test(value)) ||
          (key.startsWith('age_') && value !== null && !/^\d{8}$/.test(value)))
        throw Object.assign(Error('库存快照日期无效'), { code: 'INVALID_SNAPSHOT' });
    return result.rows[0];
  });
  const periodReads = new Map();
  const readPeriodSummary = async (name, values, priority) => {
    if (!periodReads.has(name)) periodReads.set(name, (async () => {
      const parameters = periodParameters(name);
      if (['stock','ages'].includes(name)) {
        const days = await readSnapshots(priority);
        for (let index = 0; index < periodWindows.length; index++) {
          const day = days['age_' + index];
          const iso = day ? `${day.slice(0,4)}-${day.slice(4,6)}-${day.slice(6,8)}` : null;
          parameters[`period_${index}_stock_date`] = days['stock_' + index];
          parameters[`period_${index}_age_day`] = day;
          parameters[`period_${index}_age_date`] = iso;
          parameters[`period_${index}_mapping_start`] = iso ? iso.slice(0,7) + '-01' : null;
          parameters[`period_${index}_mapping_end`] = iso ? dayOffset(iso,1) : null;
        }
      }
      const result = await client.readAll(`workbench.${name}.periods.summary`, parameters, {
        signal, priority, singlePageFirst: true, keyFields: name === 'orders' ? ['section_id','packet_index'] : ['packet_index'],
        requiredColumns: [...(name === 'orders' ? ['section_id'] : []),'packet_index','packet_count','packet_scope_total','packet_rows'],
      });
      if (name === 'orders' && result.rows.some(row => ![0,1].includes(Number(row.section_id))))
        throw Object.assign(Error('指标与归属分组不完整'), { code: 'INVALID_PERIOD_PACKETS' });
      const directors = name === 'orders' ? unpackRowPackets(result.rows.filter(row => Number(row.section_id) === 1),
        workbenchDirectorPeriodColumns, ['period_index','base','sku','director_value','item_value'],100000,workbenchPeriodPacketSize) : [];
      return { ...result, directors, rows: unpackRowPackets(name === 'orders' ? result.rows.filter(row => Number(row.section_id) === 0) : result.rows,
        ['period_index', ...config.queries[name === 'changes' ? 'workbench.changes' : `workbench.${name}.summary`].resultColumns],
        name === 'changes' ? ['period_index','kind','region','province'] : ['period_index','base','category','item','director','names'],100000,workbenchPeriodPacketSize) };
    })());
    const result = await periodReads.get(name);
    const index = periodWindows.findIndex(spec => needs(spec, name) &&
      spec.start === (values.period_start ?? values.start) && spec.end === (values.period_end ?? values.end_exclusive));
    if (index < 0 || result.rows.some(row => !Number.isInteger(Number(row.period_index)) || !periodWindows[Number(row.period_index)] || !needs(periodWindows[Number(row.period_index)], name)))
      throw Object.assign(Error('统计周期分组不完整'), { code: 'INVALID_PERIOD_PACKETS' });
    return { ...result, rows: result.rows.filter(row => Number(row.period_index) === index).map(({period_index:_period,...row}) =>
      name === 'stock' ? row : name === 'changes' ? { ...row, unknown_quantity: row.unknown_quantity === null ? null : Number(row.unknown_quantity) } : { ...row, summary: Number(row.summary),
        ...(name === 'ages' ? { active_records: Number(row.active_records) } : {}) }) };
  };
  const readOntimePeriods = async (values, priority) => {
    if (!ontimePeriods) {
      const parameters = { ...values, report_base: options.base ?? '', page_size: 200, offset: 0 };
      for (const [index, window] of ontimeWindows.entries()) {
        parameters[`period_${index}_start`] = window.start;
        parameters[`period_${index}_end`] = window.end;
        parameters[`period_${index}_enabled`] = window.enabled;
      }
      ontimePeriods = client.readAll('workbench.ontime.periods.summary', parameters, {
        signal, priority, singlePageFirst: true,
        keyFields: ['period_index', 'base', 'invalid', 'ontime'],
        requiredColumns: ['period_index', 'base', 'invalid', 'ontime', 'packed_orders'],
      });
    }
    const result = await ontimePeriods;
    const index = ontimeWindows.findIndex(window => window.enabled && window.start === values.start && window.end === values.end_exclusive);
    if (index < 0 || result.rows.some(row => !Number.isInteger(Number(row.period_index)) || !ontimeWindows[Number(row.period_index)]?.enabled))
      throw Object.assign(Error('准交统计周期不完整'), { code: 'INVALID_PERIOD_PACKETS' });
    return { ...result, rows: result.rows.filter(row => Number(row.period_index) === index) };
  };
  const reads = new Map();
  const read = async (name, values, priority = 0) => {
    signal?.throwIfAborted();
    const key = JSON.stringify([name, Object.entries(values).sort(([a], [b]) => a.localeCompare(b))]);
    if (!reads.has(key)) {
      const pending = readSource(name, values, priority).catch(error => {
        reads.delete(key);
        throw error;
      });
      reads.set(key, pending);
    }
    const rows = await reads.get(key);
    signal?.throwIfAborted();
    return structuredClone(rows);
  };
  const readSource = async (name, values, priority) => {
    signal?.throwIfAborted();
    if (name === 'directors' && options.summary && options.periodQueries && periodReads.has('orders')) {
      const index = periodWindows.findIndex(spec => needs(spec, 'orders') &&
        dayOffset(spec.end,-1).slice(0,7)+'-01' === values.start && spec.end === values.end_exclusive);
      if (index >= 0) {
        const result = await periodReads.get('orders');
        return collectDirectorMembers(result.directors.filter(row => Number(row.period_index) === index)
          .map(({period_index:_period,...row}) => row));
      }
    }
    if (name === 'ageDate' && options.summary && options.periodQueries) {
      const index = periodWindows.findIndex(spec => spec.start.replaceAll('-','') === values.start &&
        (spec.inventoryEnd ?? spec.end).replaceAll('-','') === values.end_exclusive);
      if (index < 0) throw Error('INVALID_SNAPSHOT_PERIOD');
      return [{ day: (await readSnapshots(priority))['age_' + index] }];
    }
    const definition = workbenchQueries[name],
      logicalId = 'workbench.' + name.toLowerCase()+(options.summary && ['orders','stock','ages','ontime'].includes(name)?'.summary':'');
    const summarized=logicalId.endsWith('.summary');
    const packeted = (summarized && name === 'stock') || (options.summary && ['directors', 'customers', 'customerManagers'].includes(name));
    const id = logicalId + (packeted ? '.packets' : '');
    if(summarized)values={...values,period_start:values.period_start??values.start,period_end:values.period_end??values.end_exclusive,owner_start:values.period_start??values.start,owner_end:values.period_end??values.end_exclusive};
    const periodSummary = options.periodQueries && options.summary && ['orders','stock','ages','changes'].includes(name);
    const result = periodSummary ? await readPeriodSummary(name, values, priority)
      : name === 'ontime' && options.periodQueries && options.summary
      ? await readOntimePeriods(values, priority)
      : definition.keys
      ? await client.readAll(
          id,
          { ...values, report_base: options.base ?? '', page_size: 200, offset: 0 },
          {
            signal,
            priority,
            keyFields: packeted?['packet_index']:summarized?(name==='ontime'?['base','invalid','ontime']:['base','category','item','director','names']):definition.keys,
            requiredColumns: packeted||summarized?config.queries[id].resultColumns:definition.columns,
            singlePageFirst: true,
          },
        )
      : await client.read(
          id,
          { ...values, report_base: options.base ?? '' },
          { signal, priority, requiredColumns: definition.columns },
        );
    const sourceRows = packeted && !periodSummary ? unpackRowPackets(result.rows,
      config.queries[name === 'directors'?'workbench.directormembers':logicalId].resultColumns,
      name === 'directors' ? ['base','sku','director_value','item_value'] : name === 'stock' ? ['base','category','item','director','names'] : definition.keys) : result.rows;
    const rows = name === 'ontime' && summarized ? sourceRows.flatMap((row) => {
      const packed = typeof row.packed_orders === 'string' ? JSON.parse(row.packed_orders) : row.packed_orders;
      if (!Array.isArray(packed)) throw Object.assign(Error('准交订单分组不完整'), {code:'INVALID_ORDER_PACKETS'});
      return packed.map(order => {
        const tuple = decodeWorkbenchTuple(order, 7);
        if (!tuple) throw Object.assign(Error('准交订单分组字段不完整'), {code:'INVALID_ORDER_PACKETS'});
        const [order_no,customer,arrival_date,...member] = tuple;
        return {order_no,customer,arrival_date,invalid:row.invalid,ontime:row.ontime,members:[member]};
      });
    }) : sourceRows;
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
    if (name === 'directors' && packeted) return collectDirectorMembers(normalized);
    if (name === 'directors') return normalized.map(row => row.director_encoding === 'nullable-utf8-v1'
      ? {...row,directors:decodeScalarArray(row.directors)} : row);
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
  const readBatchSnapshot = async (values, priority) => {
    signal?.throwIfAborted();
    const key = JSON.stringify(values);
    if (!batchSnapshots.has(key)) {
      const pending = read('ages', values, priority).catch((error) => {
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
    const priority = name === 'month' ? 30 : name === 'week' ? 20 : -10;
    if (spec.start >= spec.end)
      return { ...spec, sections: [], metrics: calculate({ ...spec, sections: [] }) };
    const restored = restoredPeriod(spec);
    const pending = sectionIds.map((id) =>
      restored?.sections?.find(part => part.id === id && part.status === 'ready') ?? { id, status: 'loading', rows: [] });
    const update = () => {
      periods[name] = {
        ...spec,
        sections: [...pending],
        metrics: calculate({ ...spec, sections: pending }),
      };
      progress();
    };
    if (pending.some(part => part.status === 'ready')) update();
    const [sections, attribution, sharedItems] = await Promise.all([Promise.all(
      sectionIds.map((id) =>
        section(id, async () => {
          const cached = pending.find(part => part.id === id && part.status === 'ready');
          if (cached) return cached.rows;
          if (id === 'directors')
            return read(id, {
              start: dayOffset(spec.end, -1).slice(0, 7) + '-01',
              end_exclusive: spec.end,
            }, priority);
          if (id !== 'ages') return read(id, values, priority);
          const dates = await read('ageDate', {
            start: spec.start.replaceAll('-', ''),
            end_exclusive: (spec.inventoryEnd ?? spec.end).replaceAll('-', ''),
          }, priority);
          const raw = dates[0]?.day;
          if (!raw) return [];
          if (!/^\d{8}$/.test(raw))
            throw Object.assign(Error('快照日期无效'), { code: 'INVALID_SNAPSHOT' });
          const snapshot = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
          return readBatchSnapshot({ start: raw, snapshot,mapping_start:snapshot.slice(0,7)+'-01',mapping_end:dayOffset(snapshot,1),...(options.summary?{period_start:spec.start,period_end:spec.end}: {}) }, priority);
        }).then(part => { pending[pending.findIndex(item => item.id === id)] = part; update(); return part; }),
      ),
    ), options.summary ? null : section('directors', () => read('directors', values)),
      options.summary ? null : section('items', () => read('items', values))]);
    if (!options.summary) applyPeriodAttributions(sections, attribution.rows, sharedItems.rows);
    return { ...spec, sections, metrics: calculate({ ...spec, sections }) };
  };
  const periods = {};
  const selected = specs.selected;
  const metadata = Object.fromEntries(
    ['directors', 'customers', 'customerManagers'].map((id) => [
      id,
      { id, status: 'loading', rows: [] },
    ]),
  );
  const restoredMetadata = options.summary && (options.seedFacts ?? []).find(facts =>
    facts.metricCalculationVersion === metricCalculationVersion && facts.sqlSummary === true &&
    facts.attributionVersion === 2 && facts.start === start && facts.end === end);
  const snapshot = (complete = false) => ({
    metricCalculationVersion,
    displayMode: 'governed-live',
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
    if (periods.month || periods[selected]) options.onProgress?.(snapshot());
  };
  const primary = Promise.all(primaryNames.map(async name => {
    periods[name] = await load(specs[name], name);
    progress();
  }));
  if (!options.periodQueries) await primary;
  signal?.throwIfAborted();
  const entries = Object.entries(specs).filter(
    ([name]) => name !== 'selected' && !['month', 'week'].includes(name),
  );
  const values = { start: specs[selected].start, end_exclusive: specs[selected].end };
  const loadMetadata = async () =>
    Promise.all(
      ['directors', 'customers', 'customerManagers'].map(async (id) => {
        if (options.metadata === false) { metadata[id] = { id, status: 'ready', rows: [] }; return; }
        if (id === 'directors') await primary;
        const range = id === 'directors' ? specs.month : specs[selected];
        metadata[id] = restoredMetadata?.[id]?.status === 'ready'
          ? restoredMetadata[id]
          : id === 'directors'
          ? periods.month.sections.find(part => part.id === 'directors') ?? { id, status: 'ready', rows: [] }
          : await section(id, () =>
          range.start >= range.end ? [] : read(
            id,
            id === 'directors'
              ? { start: specs.month.start, end_exclusive: specs.month.end }
              : values,
          ),
        );
        progress();
      }),
    );
  await Promise.all([
    primary,
    loadMetadata(),
    ...entries.map(async ([name, spec]) => {
      periods[name] = await load(spec, name);
      progress();
    }),
  ]);
  signal?.throwIfAborted();
  return snapshot(true);
}
export async function loadWorkbenchSkuPage(start,end,category,page,signal,base='',options={}) {
 const config = options.config ?? defaultConfig;
 if (!config) throw Error('ORDER_METRIC_CONFIG_REQUIRED');
 const client=createAgentQueries(config,options.execute);
 const periods=reportPeriods(start,end,options.now);
 const dates=await client.read('workbench.agedate',{start:start.replaceAll('-',''),end_exclusive:(periods[periods.selected].inventoryEnd??end).replaceAll('-',''),report_base:base},{signal,priority:20,requiredColumns:['day']});
 const raw=dates.rows[0]?.day??'';
 if(raw&&!/^\d{8}$/.test(raw))throw Error('INVALID_SNAPSHOT');
 const snapshot=raw?`${raw.slice(0,4)}-${raw.slice(4,6)}-${raw.slice(6,8)}`:start;
 const values={start,end_exclusive:end,report_base:base,period_start:start,period_end:end,owner_start:start,owner_end:end,batch_start:raw||'00000000',snapshot,mapping_start:snapshot.slice(0,7)+'-01',mapping_end:dayOffset(snapshot,1),category,page_size:20,offset:page*20,sku_page_size:20,sku_offset:page*20};
 const pick=(id,input=values)=>Object.fromEntries(Object.values(config.queries[id].parameterSpec).map(spec=>[spec.name,input[spec.name]]));
 const [keys,count]=await Promise.all([
  client.read('workbench.sku.keys',pick('workbench.sku.keys'),{signal,priority:20,requiredColumns:['base','sku']}),
  client.read('workbench.sku.keys.count',pick('workbench.sku.keys.count'),{signal,priority:20,requiredColumns:['total']}),
 ]);
 const total=Number(count.rows[0]?.total);
 if(!Number.isSafeInteger(total)||total<0||keys.rows.length!==Math.max(0,Math.min(20,total-page*20))||keys.configVersion!==count.configVersion)throw Error('SKU_PAGE_INCOMPLETE');
 if(dates.configVersion!==keys.configVersion)throw Error('QUERY_CONFIG_CHANGED');
 const sections=await Promise.all(['orders','stock','ages'].map(async id=>{
  const result=await client.readAll('workbench.'+id+'.page',pick('workbench.'+id+'.page',{...values,page_size:200,offset:0}),{signal,priority:20,keyFields:workbenchQueries[id].keys,requiredColumns:workbenchQueries[id].columns,singlePageFirst:true});
  if(result.configVersion!==keys.configVersion)throw Error('QUERY_CONFIG_CHANGED');
  return{id,status:'ready',rows:result.rows};
 }));
 const period={...periods[periods.selected],sections};period.metrics=computeWorkbenchMetrics(period);
 return {period,keys:keys.rows,total,page,size:20};
}
