import { createAgentQueries } from '../../business/shared/agent-query.ts';
import { workbenchQueries } from '../../business/inventory-orderworkbench/queries.mjs';
import { computeWorkbenchMetrics, dayOffset, reportPeriods } from './metric-model.mjs';

const config = ORDER_WORKBENCH_APS_CONFIG;
const numbers = new Set([
  'demand',
  'shortage',
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
  'stock_qty',
  'aged_qty',
  'excluded',
  'names',
]);
export async function loadWorkbenchReport(start, end, signal, options = {}) {
  const client = createAgentQueries(config, options.execute);
  const specs = reportPeriods(start, end, options.now);
  const read = async (name, values) => {
    signal?.throwIfAborted();
    const definition = workbenchQueries[name],
      id = 'workbench.' + name.toLowerCase();
    const result = definition.keys
      ? await client.readAll(
          id,
          { ...values, report_base: options.base ?? '', page_size: 200, offset: 0 },
          {
            signal,
            keyFields: definition.keys,
            requiredColumns: definition.columns,
            singlePageFirst: true,
          },
        )
      : await client.read(id, {...values, report_base: options.base ?? ''}, { signal, requiredColumns: definition.columns });
    return result.rows.map((row) =>
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
  };
  const section = async (id, action) => {
    try {
      return { id, status: 'ready', rows: await action() };
    } catch (error) {
      signal?.throwIfAborted();
      return { id, status: 'error', rows: [], code: error.code ?? 'QUERY_FAILED' };
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
  const load = async (spec) => {
    const values = { start: spec.start, end_exclusive: spec.end };
    if (spec.start >= spec.end)
      return { ...spec, sections: [], metrics: computeWorkbenchMetrics({ ...spec, sections: [] }) };
    const sections = await Promise.all(
      ['orders', 'changes', 'stock', 'ages'].map((id) =>
        section(id, async () => {
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
          return readBatchSnapshot({ start: raw, age_cutoff: dayOffset(snapshot, -60), snapshot });
        }),
      ),
    );
    // Batch material groups are not business product items. Map only a unique
    // base/SKU item already returned by the same authorized period queries.
    const items = new Map();
    for (const part of sections.filter((part) => ['orders', 'stock'].includes(part.id))) {
      for (const row of part.rows) {
        const key = JSON.stringify([row.base, row.sku]);
        if (!items.has(key)) items.set(key, new Set());
        if (row.item) items.get(key).add(row.item);
      }
    }
    for (const row of sections.find((part) => part.id === 'ages').rows) {
      const names = items.get(JSON.stringify([row.base, row.sku]));
      row.item = names?.size === 1 ? [...names][0] : null;
    }
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
    start,
    end,
    selected,
    periods: { ...periods },
    ...metadata,
    complete,
    pendingPeriods: Object.keys(specs).filter((name) => name !== 'selected' && !periods[name]),
    pendingSources: Object.keys(metadata).filter((name) => metadata[name].status === 'loading'),
    readAt: new Date().toISOString(),
    source: 'gea-governed-sql',
    metricRegister:
      'https://klvcodtump.feishu.cn/base/LikDby3IGaWeJUs11EucGA1LnAg?table=tblbISM2EhyMo9a3',
  });
  const progress = () => {
    signal?.throwIfAborted();
    options.onProgress?.(snapshot());
  };
  periods[selected] = await load(specs[selected]);
  progress();
  const entries = Object.entries(specs).filter(
    ([name]) => name !== 'selected' && name !== selected,
  );
  let next = 0;
  await Promise.all(
    Array.from({ length: 2 }, async () => {
      while (next < entries.length) {
        const [name, spec] = entries[next++];
        periods[name] = await load(spec);
        progress();
      }
    }),
  );
  const values = { start: specs[selected].start, end_exclusive: specs[selected].end };
  await Promise.all(
    ['directors', 'customers', 'customerManagers'].map(async (id) => {
      metadata[id] = await section(id, () =>
        read(
          id,
          id === 'directors'
            ? { start: specs.month.start, end_exclusive: specs.month.end }
            : values,
        ),
      );
    }),
  );
  signal?.throwIfAborted();
  return snapshot(true);
}
