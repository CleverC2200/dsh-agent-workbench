import { normalizeCompanySource, type CompanySourceRows } from 'dsh-agent-manage/inventory-compute/full-chain-source-rows';
import type { BuildWorkspaceRequest } from 'dsh-agent-manage/inventory-compute/full-chain-types';
import { bindGovernedSql } from '../../../../shared/governed-parameters';
import { companySqlTemplates } from './qll-sql';
import { call } from './channel.js';

type Row = Record<string, unknown>;
async function query(name: keyof typeof companySqlTemplates, values: unknown[], signal: AbortSignal): Promise<Row[]> {
  const input = bindGovernedSql(companySqlTemplates[name], values);
  const parameters = {...input, sql: `/*full-chain:${name}*/\n${input.sql}`, pageSize: 200, resultShape: 'rows'};
  const first = await call('sql', {...parameters, pageNo: 1}, {signal});
  signal.throwIfAborted();
  if (!Array.isArray(first.rows) || !Number.isSafeInteger(first.total) || first.total < 0) throw Error('GEA_SQL_RESULT_INCOMPLETE');
  const metadata = JSON.stringify([first.returnedColumns ?? [], first.rejectedColumns ?? []]);
  if (first.rejectedColumns?.length && typeof window !== 'undefined') {
    signal.throwIfAborted();
    window.dispatchEvent(new CustomEvent('gea-query-warning', {detail: {message: '部分字段未获读取授权，缺失项保留未知。'}}));
  }
  const validate = (page: any, pageNo: number): Row[] => {
    if (page.total !== first.total || JSON.stringify([page.returnedColumns ?? [], page.rejectedColumns ?? []]) !== metadata) throw Error('GEA_SQL_COLUMN_OR_TOTAL_CHANGED');
    if (!Array.isArray(page.rows) || page.rows.length !== Math.min(200, Math.max(0, first.total - (pageNo - 1) * 200))) throw Error('GEA_SQL_RESULT_INCOMPLETE');
    return page.rows;
  };
  const rows = validate(first, 1);
  const count = Math.ceil(first.total / 200);
  // Keep the original complete-read bound: two logical reads, up to three pages each.
  for (let start = 2; start <= count; start += 3) {
    const pages = await Promise.all(Array.from({length: Math.min(3, count - start + 1)}, (_, i) => start + i)
      .map(async pageNo => validate(await call('sql', {...parameters, pageNo}, {signal}), pageNo)));
    signal.throwIfAborted();
    rows.push(...pages.flat());
  }
  return rows;
}

/** Page IO only. Role scope comes from the current GEA grant; computation belongs to Manage. */
export async function readCompanySource(request: BuildWorkspaceRequest, part: 'current' | 'history', caller?: AbortSignal) {
  const controller = new AbortController();
  const signal = caller ? AbortSignal.any([caller, controller.signal]) : controller.signal;
  const now = request.now ?? new Date();
  const asOf = now.toLocaleDateString('en-CA', {timeZone: 'Asia/Shanghai'});
  const month = `${request.filters.month ?? asOf.slice(0, 7)}-01`;
  const {filters: f, access} = request;
  const bases = f.branch ? [] : access.allowedBases ?? null;
  const branches = f.base ? [] : access.allowedBranches ?? null;
  const previousMonth = new Date(now.getTime() - 86400000).toLocaleDateString('en-CA', {timeZone: 'Asia/Shanghai'}).slice(0, 7) + '-01';
  const rows: CompanySourceRows = {base: [], branch: [], baseAge: [], branchAge: [], orders: [], pending: [], orders7d: [], outbound: [], branchFulfillment: [], baseCurrentOrders: [], trend: [], orderHistory: [], agingHistory: []};
  const reads: Array<[keyof CompanySourceRows, keyof typeof companySqlTemplates, unknown[]]> = part === 'current' ? [
    ['base', 'BASE_SQL', [asOf, month, bases, f.base ?? null, f.category ?? null, f.sku ?? null, !f.month]],
    ['branch', 'BRANCH_SQL', [asOf, month, branches, f.branch ?? null, f.category ?? null, f.sku ?? null]],
    ['baseAge', 'BASE_AGE_SQL', [asOf, bases, f.base ?? null, f.category ?? null, f.sku ?? null]],
    ['branchAge', 'BRANCH_AGE_SQL', [asOf, branches, f.branch ?? null, f.category ?? null, f.sku ?? null]],
    ['orders', 'ORDER_SQL', [asOf, month, bases, f.base ?? null, f.branch ?? null, f.category ?? null, f.sku ?? null, branches]],
    ['pending', 'PENDING_SQL', [asOf, branches, f.branch ?? null, f.sku ?? null, f.category ?? null]],
    ['orders7d', 'ORDER_7D_SQL', [asOf, month, bases, f.base ?? null, f.branch ?? null, f.category ?? null, f.sku ?? null, branches]],
    ['outbound', 'BRANCH_OUTBOUND_SQL', [asOf, branches, f.branch ?? null, f.category ?? null, f.sku ?? null]],
    ['branchFulfillment', 'BRANCH_FULFILLMENT_SQL', [asOf, f.month ? month : previousMonth, branches, f.branch ?? null, f.category ?? null, f.sku ?? null]],
    ['baseCurrentOrders', 'BASE_CURRENT_ORDER_SQL', [asOf, bases, f.base ?? null, f.category ?? null, f.sku ?? null]],
  ] : [
    ['trend', 'COMPANY_TREND_SQL', [asOf, bases, branches, f.base ?? null, f.branch ?? null, f.category ?? null, f.sku ?? null]],
    ['orderHistory', 'ORDER_TREND_SQL', [asOf, month, bases, f.base ?? null, f.branch ?? null, f.category ?? null, f.sku ?? null, branches]],
    ['agingHistory', 'AGING_TREND_SQL', [asOf, bases, branches, f.base ?? null, f.branch ?? null, f.category ?? null, f.sku ?? null]],
  ];
  const selected = reads.filter(([key]) =>
    !(f.base && ['branch', 'branchAge', 'pending', 'outbound', 'branchFulfillment'].includes(key)) &&
    !(f.branch && ['base', 'baseAge', 'baseCurrentOrders'].includes(key)));
  let active = 0;
  const waiting: Array<() => void> = [];
  const read = async ([key, name, values]: typeof reads[number]) => {
    if (active >= 2) await new Promise<void>(resolve => waiting.push(resolve)); else active++;
    try { signal.throwIfAborted(); rows[key] = await query(name, values, signal); }
    finally { const next = waiting.shift(); if (next) next(); else active--; }
  };
  try {
    await Promise.all(selected.map(read));
    signal.throwIfAborted();
    return {...normalizeCompanySource(rows), ...(part === 'current' ? {historyDeferred: true} : {})};
  } catch (error) {
    controller.abort(error);
    throw error;
  }
}
