import React, { useEffect, useState, type FormEvent } from 'react';
import { z } from 'zod';
import { createAgentQueries } from '../../../../../shared/agent-query';
import { unpackAtomicPage } from '../../../../../shared/atomic-page';
import type { AgentSqlConfig } from '../../../../../shared/sql-config';
import { LocalQueryForm } from '../../../../../shared/local-query-form';
import { currentOrderStatus, ORDER_STATUSES } from '../../../fc/src/lib/current-orders';
import { useFcWorkflow } from './configured-fc-list';
import { PlanPagination } from '../../../../../shared/plan-pagination';
import { DashboardTableSkeleton } from '../dsh-ui/workbench-loading';
import css from './fc-current-orders.module.css';
import filtersCss from '../../../../../shared/original-business-list.module.css';

const numeric = z
  .union([
    z.number().finite(),
    z
      .string()
      .regex(/^-?\d+(\.\d+)?$/)
      .transform(Number),
  ])
  .nullable();
const lineSchema = z.object({
  warehouse_code: z.string().min(1),
  order_no: z.string().min(1),
  customer_code: z.string().nullable(),
  sku: z.string().nullable(),
  material_name: z.string().nullable(),
  ordered: numeric,
  demand: numeric,
  allocated: numeric,
  shipped: numeric,
  remaining: numeric,
  shortage: numeric,
  order_status: z.string().nullable(),
});
const orderSchema = lineSchema.omit({ sku: true, material_name: true }).extend({
  warehouse_name: z.string().nullable(),
  customer_name: z.string().nullable(),
  requested_at: z.string().nullable(),
  created_at: z.string().nullable(),
  sku_count: numeric,
  satisfaction: numeric,
});
type Order = z.infer<typeof orderSchema>;
type Line = z.infer<typeof lineSchema>;
type Page<T> = { rows: T[]; total: number };
type ReadState<T> =
  | { kind: 'loading' }
  | { kind: 'ready'; data: Page<T> }
  | { kind: 'failed'; message: string };
const text = (value: string | null) => value || '-';
const qty = (value: number | null) =>
  value === null ? '-' : value.toLocaleString('zh-CN', { maximumFractionDigits: 2 });
const errorText = (error: unknown) =>
  error instanceof Error ? error.message : '订单读取失败，请重试';
const orderKey = (row: Order) =>
  JSON.stringify([row.warehouse_code, row.order_no, row.customer_code]);

async function readPage<T>(
  config: AgentSqlConfig,
  queryId: string,
  values: Record<string, unknown>,
  schema: z.ZodType<T>,
  page: number,
  pageSize: number,
  signal: AbortSignal,
): Promise<Page<T>> {
  const definition = config.queries[queryId];
  const result = await createAgentQueries(config).read(
    queryId,
    { ...values, page_size: pageSize, offset: (page - 1) * pageSize },
    { signal, requiredColumns: definition.resultColumns },
  );
  const unpacked = unpackAtomicPage(result, page, pageSize);
  return { rows: z.array(schema).parse(unpacked.rows), total: unpacked.total };
}

function OrderLines({
  config,
  order,
  revision,
}: {
  config: AgentSqlConfig;
  order: Order;
  revision: number;
}) {
  const [page, setPage] = useState(1);
  const [state, setState] = useState<ReadState<Line>>({ kind: 'loading' });
  useEffect(() => {
    const controller = new AbortController();
    setState({ kind: 'loading' });
    void readPage(
      config,
      'branch-current-orders.lines',
      {
        warehouse_code: order.warehouse_code,
        order_no: order.order_no,
        customer_code: order.customer_code,
      },
      lineSchema,
      page,
      10,
      controller.signal,
    )
      .then((data) => {
        if (!controller.signal.aborted) setState({ kind: 'ready', data });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setState({ kind: 'failed', message: errorText(error) });
      });
    return () => controller.abort();
  }, [config, order, page, revision]);
  return (
    <section aria-label={`${order.order_no}订单明细`} className={css.details}>
      <b>订单明细</b>
      {state.kind === 'loading' ? (
        <DashboardTableSkeleton label="订单明细加载中" />
      ) : state.kind === 'failed' ? (
        <p role="alert">{state.message}</p>
      ) : (
        <>
          <table className="data-table">
            <thead>
              <tr>
                {[
                  '产品',
                  '需求量（件）',
                  '基地已占用（件）',
                  '剩余需求量（件）',
                  '缺货量（件）',
                ].map((label) => (
                  <th key={label}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {state.data.rows.map((row) => (
                <tr key={row.sku}>
                  <td>
                    {text(row.sku)} {text(row.material_name)}
                  </td>
                  {[row.demand, row.allocated, row.remaining, row.shortage].map((value, index) => (
                    <td key={index}>{qty(value)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {!state.data.rows.length && <p>暂无订单明细。</p>}
          <PlanPagination
            ariaLabel="订单明细分页"
            totalCount={state.data.total}
            page={page}
            pageSize={10}
            maxPageSize={10}
            loading={false}
            onPageChange={setPage}
            onPageSizeChange={() => setPage(1)}
          />
        </>
      )}
    </section>
  );
}

export function FcCurrentOrders({
  config,
  warehouseCode = '',
  revision = 0,
  onRead,
  initialFilter,
  rememberFilter,
}: {
  config: AgentSqlConfig;
  warehouseCode?: string;
  revision?: number;
  onRead?: (value: unknown) => void;
  initialFilter?: { warehouse: string; shortageOnly: boolean };
  rememberFilter?: (filter: { warehouse: string; shortageOnly: boolean }) => void;
}) {
  const { listSearch, setListSearch } = useFcWorkflow();
  const empty = { warehouse: '', search: listSearch, shortageOnly: false };
  const initial = { ...empty, ...initialFilter };
  const [draft, setDraft] = useState(initial),
    [filters, setFilters] = useState(initial);
  useEffect(() => {
    rememberFilter?.({ warehouse: filters.warehouse, shortageOnly: filters.shortageOnly });
  }, [filters]);
  const [page, setPage] = useState(1),
    [pageSize, setPageSize] = useState(10);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [state, setState] = useState<ReadState<Order>>({ kind: 'loading' });
  const [identityRevision, reloadIdentity] = useState(0);
  useEffect(() => {
    const clear = () => {
      setState({ kind: 'loading' });
      setExpanded(new Set());
      setDraft({ ...empty, search: '' });
      setFilters({ ...empty, search: '' });
      setPage(1);
      reloadIdentity((value) => value + 1);
    };
    window.addEventListener('gea-identity-changed', clear);
    return () => window.removeEventListener('gea-identity-changed', clear);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setState({ kind: 'loading' });
    setExpanded(new Set());
    const escaped = filters.search.trim().replace(/[\\%_]/g, '\\$&');
    void readPage(
      config,
      'branch-current-orders.page',
      {
        warehouse_code: warehouseCode || null,
        warehouse_search_pattern: filters.warehouse.trim()
          ? '%' + filters.warehouse.trim().replace(/[\\%_]/g, '\\$&') + '%'
          : null,
        customer_code: null,
        search_pattern: escaped ? `%${escaped}%` : null,
        shortage_only: filters.shortageOnly,
      },
      orderSchema,
      page,
      pageSize,
      controller.signal,
    )
      .then((data) => {
        if (controller.signal.aborted) return;
        setState({ kind: 'ready', data });
        onRead?.({
          status: 'available',
          viewId: 'branch-current-orders',
          ...data,
          page,
          pageSize,
          rowScope: 'current_server_page',
          currentState: true,
          source: 'GEA_SQL_CONFIGURED',
        });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({ kind: 'failed', message: errorText(error) });
        onRead?.({
          status: 'failed',
          viewId: 'branch-current-orders',
          rows: [],
          error: errorText(error),
        });
      });
    return () => controller.abort();
  }, [config, warehouseCode, revision, filters, page, pageSize, identityRevision]);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setPage(1);
    setFilters({ ...draft });
  };
  return (
    <section aria-label="当前订单" className={filtersCss.list}>
      <LocalQueryForm
        className={`panel-actions ${filtersCss.toolbar} ${filtersCss.fcToolbar}`}
        onSubmit={submit}
      >
        {!warehouseCode && (
          <label>
            分仓
            <input
              aria-label="分仓"
              placeholder="请输入分仓名称或编码"
              value={draft.warehouse}
              onChange={(event) => setDraft({ ...draft, warehouse: event.target.value })}
            />
          </label>
        )}
        <label>
          调拨单号／基地／SKU
          <input
            aria-label="调拨单号或供货基地"
            placeholder="调拨单号／基地／SKU／产品名称"
            value={draft.search}
            onChange={(event) => {
              setListSearch(event.target.value);
              setDraft({ ...draft, search: event.target.value });
            }}
          />
        </label>
        <button type="submit" className={filtersCss.filterQuery}>
          查询
        </button>
        <label>
          状态
          <select
            aria-label="订单状态"
            value={draft.shortageOnly ? '缺口' : '全部'}
            onChange={(event) => {
              const next = { ...draft, shortageOnly: event.target.value === '缺口' };
              setDraft(next);
              setFilters(next);
              setPage(1);
            }}
          >
            {ORDER_STATUSES.map((status) => (
              <option key={status}>{status}</option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className={filtersCss.filterReset}
          onClick={() => {
            setListSearch('');
            setDraft({ ...empty, search: '' });
            setFilters({ ...empty, search: '' });
            setPage(1);
          }}
        >
          清空筛选
        </button>
      </LocalQueryForm>
      {state.kind === 'loading' ? (
        <DashboardTableSkeleton label="当前订单加载中" embedded />
      ) : state.kind === 'failed' ? (
        <p className={css.error} role="alert">
          {state.message}
        </p>
      ) : (
        <>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  {[
                    '订单号',
                    '供货基地',
                    '订单日期',
                    'SKU个数',
                    '需求量（件）',
                    '基地已占用（件）',
                    '剩余需求量（件）',
                    '缺货量（件）',
                    '状态',
                  ].map((label) => (
                    <th key={label}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {state.data.rows.map((row) => (
                  <React.Fragment key={orderKey(row)}>
                    <tr>
                      <td>
                        <button
                          type="button"
                          className={css.order}
                          aria-label={`${expanded.has(orderKey(row)) ? '收起' : '展开'}订单${row.order_no}`}
                          aria-expanded={expanded.has(orderKey(row))}
                          onClick={() =>
                            setExpanded((previous) => {
                              const next = new Set(previous);
                              const key = orderKey(row);
                              if (next.has(key)) next.delete(key);
                              else next.add(key);
                              return next;
                            })
                          }
                        >
                          {row.order_no}
                        </button>
                      </td>
                      <td>{text(row.customer_name || row.customer_code)}</td>
                      <td>{text(row.created_at?.slice(0, 10) ?? null)}</td>
                      <td>{qty(row.sku_count)}</td>
                      <td>{qty(row.demand)}</td>
                      <td>{qty(row.allocated)}</td>
                      <td
                        className={
                          row.remaining !== null && row.remaining > 0 ? 'danger-text' : undefined
                        }
                      >
                        {qty(row.remaining)}
                      </td>
                      <td
                        className={
                          row.shortage !== null && row.shortage > 0 ? 'danger-text' : undefined
                        }
                      >
                        {qty(row.shortage)}
                      </td>
                      <td>
                        <span
                          className={`status ${currentOrderStatus(row.shortage, row.demand) === '缺口' ? 'danger' : currentOrderStatus(row.shortage, row.demand) === '正常' ? 'success' : 'warning'}`}
                        >
                          {currentOrderStatus(row.shortage, row.demand)}
                        </span>
                      </td>
                    </tr>
                    {expanded.has(orderKey(row)) && (
                      <tr>
                        <td colSpan={9}>
                          <OrderLines config={config} order={row} revision={revision} />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
          {!state.data.rows.length && <p>暂无未发货完成订单。</p>}
          <PlanPagination
            ariaLabel="当前订单分页"
            totalCount={state.data.total}
            page={page}
            pageSize={pageSize}
            maxPageSize={50}
            loading={false}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
          />
        </>
      )}
    </section>
  );
}
