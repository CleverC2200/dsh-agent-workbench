import { readWorkspaceQuery } from '../../business/shared/workspace-query.ts';
import { deriveMetrics } from 'dsh-agent-manage/aps-compute/metrics';

const config = ORDER_WORKBENCH_APS_CONFIG;
const numbers = new Set(['demand', 'shortage', 'shipped', 'records', 'invalid', 'inventory', 'available', 'missing_demand', 'missing_target', 'covered_support_quantity', 'covered_support_demand', 'covered_support_count', 'covered_shippable_quantity', 'covered_shippable_demand', 'covered_shippable_count']);
export function workbenchApsMetrics(data, base) {
  const scoped = base === undefined ? data : { ...data, sections: data.sections.map(section => ({ ...section, rows: section.rows.filter(row => row.base === base) })) };
  return Object.fromEntries(Object.entries(deriveMetrics(scoped)).filter(([name]) => ['订单满足率', '可发货天数'].includes(name)));
}
export async function loadApsWorkbenchFacts(start, endExclusive, signal, execute) {
  const today = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
  const last = new Date(Date.parse(endExclusive + 'T00:00:00Z') - 86400000).toISOString().slice(0, 10);
  const end = last < today ? last : today;
  if (start > end) throw Object.assign(Error('所选周期尚未开始'), { code: 'SOURCE_NOT_AVAILABLE' });
  const monthly = start.endsWith('-01') && endExclusive.endsWith('-01');
  const orderSource = start.slice(0, 7) === end.slice(0, 7) ? 'orders-month' : 'orders';
  const names = [['orders', orderSource], ['shippable', 'shippable']];
  const input = { start, end, summary: true, version: '滚动', order_type: 'M' };
  const sections = await Promise.all(names.map(async ([id, name]) => {
    try {
      const rows = await readWorkspaceQuery(config, name, input, { signal, execute });
      return { id, status: 'ready', querySource: name, rows: rows.map(row => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, numbers.has(key) && typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value)) ? Number(value) : value]))) };
    } catch (error) {
      if (signal?.aborted) throw error;
      return { id, status: 'error', querySource: name, rows: [], code: error.code ?? 'QUERY_FAILED' };
    }
  }));
  signal?.throwIfAborted();
  const data = { start, end, granularity: monthly ? 'month' : 'week', sections };
  const metrics = workbenchApsMetrics(data);
  const bases = [...new Set(sections.flatMap(section => section.rows.map(row => row.base)))];
  return { data, metrics, bases: bases.map(base => ({ base, metrics: workbenchApsMetrics(data, base) })), source: 'inventory-apsplan', version: input.version };
}
