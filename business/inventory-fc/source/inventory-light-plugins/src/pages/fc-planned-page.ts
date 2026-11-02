import { readConfiguredFacts, type FactInput } from '../../../../../shared/configured-facts';
import { knownNumber } from '../../../../../shared/configured-overview';
import { applyFcPlan, readFcActionFacts, type FcRow } from './fc-workflow';
import type { ImportedPlan } from '../../../fc/src/lib/planning';

/** As in the original page: calculate first, then filter/sort the complete scope, then paginate. */
export function projectFcPlannedRows(
  rows: FcRow[],
  plans: ImportedPlan[],
  input: FactInput,
  viewId: string,
) {
  const filters = input.filters ?? {};
  const query = filters.search?.trim().toLowerCase() ?? '';
  const mode = filters.list_mode ?? 'business';
  const measured = rows.map((row) => applyFcPlan(row, plans, input.asOf, input.cycleDays ?? 7));
  const filtered = measured.filter((row) => {
    if (viewId !== 'replenishment') return true;
    if (input.replenishment) {
      const amount = knownNumber(row.recommended_qty);
      const key = `${String(row.warehouse_code).length}:${row.warehouse_code}${row.sku}`;
      const needed =
        (amount !== null && amount > 0) || input.replenishment.positiveActualKeys.includes(key);
      const business = [
        'inventory_qty',
        'current_order_demand',
        'current_order_shortage',
        'rolling_ship_daily',
        'period_current_out',
        'period_current_transfer',
        'period_next_out',
        'period_next_transfer',
      ].some((field) => (knownNumber(row[field]) ?? 0) > 0);
      return (
        (!input.replenishment.neededOnly || needed) &&
        (!input.replenishment.businessOnly || business)
      );
    }
    if (query) return true;
    if (mode === 'urgent') return (knownNumber(row.current_order_shortage) ?? 0) > 0;
    if (mode === 'recommended') return (knownNumber(row.recommended_qty) ?? 0) > 0;
    return (
      mode === 'all' ||
      [
        'inventory_qty',
        'current_order_demand',
        'rolling_ship_daily',
        'period_current_out',
        'period_current_transfer',
        'period_next_out',
        'period_next_transfer',
      ].some((key) => (knownNumber(row[key]) ?? 0) > 0)
    );
  });
  const field =
    !query && viewId === 'replenishment' && mode === 'urgent'
      ? 'current_order_shortage'
      : !query && viewId === 'replenishment' && mode === 'recommended'
        ? 'recommended_qty'
        : (filters.sort_field ?? (viewId === 'replenishment' ? 'recommended_qty' : 'sku'));
  const direction =
    !query && viewId === 'replenishment' && ['urgent', 'recommended'].includes(mode)
      ? 'desc'
      : (filters.sort_direction ?? (viewId === 'replenishment' ? 'desc' : 'asc'));
  return filtered.sort((a, b) => {
    const left = a[field],
      right = b[field];
    if (left == null) return right == null ? tie(a, b) : 1;
    if (right == null) return -1;
    const n = knownNumber(left),
      m = knownNumber(right);
    const difference =
      ![
        'sku',
        'warehouse_code',
        'material_name',
        'warehouse_name',
        'category',
        'material_group',
        'plan_source',
        'calculation_status',
      ].includes(field) &&
      n !== null &&
      m !== null
        ? n - m
        : String(left).localeCompare(String(right), 'zh-CN');
    return (direction === 'asc' ? difference : -difference) || tie(a, b);
  });
}
function tie(a: FcRow, b: FcRow) {
  return (
    String(a.warehouse_code).localeCompare(String(b.warehouse_code)) ||
    String(a.sku).localeCompare(String(b.sku))
  );
}

/** Normal reads stay server-paged. Only active manual plans require a whole-scope recalculation. */
export function fcPlannedReader(plans: ImportedPlan[]): typeof readConfiguredFacts {
  return async (config, viewId, input, options = {}) => {
    if (!plans.length || !['replenishment', 'plan'].includes(viewId) || options.summaryOnly)
      return readConfiguredFacts(config, viewId, input, options);
    if (viewId === 'plan') {
      const page = await readConfiguredFacts(config, viewId, input, options);
      options.signal?.throwIfAborted();
      return {
        ...page,
        rows: page.rows.map((row: FcRow) =>
          applyFcPlan(row, plans, input.asOf, input.cycleDays ?? 7),
        ),
      };
    }
    const filters = Object.fromEntries(
      Object.entries(input.filters ?? {}).filter(
        ([key]) => !['list_mode', 'sort_field', 'sort_direction'].includes(key),
      ),
    );
    if (viewId === 'replenishment') filters.list_mode = 'all';
    const sourceInput = {
      ...input,
      replenishment: undefined,
      filters,
      page: 1,
      pageSize: 200,
      readContext: undefined,
    };
    const signal = options.signal ?? new AbortController().signal;
    const first = await readFcActionFacts(
      {
        config,
        viewId,
        input: {
          ...sourceInput,
          filters: viewId === 'replenishment' ? { ...filters, list_mode: 'all' } : filters,
        },
      },
      signal,
      undefined,
      options.freshAfter,
    );
    signal.throwIfAborted();
    const rows = projectFcPlannedRows(first.rows, plans, input, viewId);
    const page = input.page ?? 1,
      pageSize = input.pageSize ?? 10;
    return {
      ...first,
      status: rows.length ? 'available' : 'empty',
      total: rows.length,
      rows: rows.slice((page - 1) * pageSize, page * pageSize),
      readContext: undefined,
    };
  };
}
