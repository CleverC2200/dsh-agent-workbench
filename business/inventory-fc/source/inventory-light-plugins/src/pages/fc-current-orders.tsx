import React, { useEffect, useState, type FormEvent } from 'react';
import { z } from 'zod';
import { createAgentQueries } from '../../../../../shared/agent-query';
import { unpackAtomicPage } from '../../../../../shared/atomic-page';
import type { AgentSqlConfig } from '../../../../../shared/sql-config';
import { LocalQueryForm } from '../../../../../shared/local-query-form';
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
                  '订单量（件）',
                  '需求量（件）',
                  '占用量（件）',
                  '实际发货量（件）',
                  '未备量（件）',
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
                  {[row.ordered, row.demand, row.allocated, row.shipped, row.remaining].map(
                    (value, index) => (
                      <td key={index}>{qty(value)}</td>
                    ),
                  )}
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
}: {
  config: AgentSqlConfig;
  warehouseCode?: string;
  revision?: number;
  onRead?: (value: unknown) => void;
}) {
  const empty = { warehouse: '', customer: '', search: '', shortageOnly: false };
  const [draft, setDraft] = useState(empty),
    [filters, setFilters] = useState(empty);
  const [page, setPage] = useState(1),
    [pageSize, setPageSize] = useState(10);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [state, setState] = useState<ReadState<Order>>({ kind: 'loading' });
  const [identityRevision, reloadIdentity] = useState(0);
  useEffect(() => {
    const clear = () => {
      setState({ kind: 'loading' });
      setExpanded(null);
      setDraft(empty);
      setFilters(empty);
      setPage(1);
      reloadIdentity((value) => value + 1);
    };
    window.addEventListener('gea-identity-changed', clear);
    return () => window.removeEventListener('gea-identity-changed', clear);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setState({ kind: 'loading' });
    setExpanded(null);
    const escaped = filters.search.trim().replace(/[\\%_]/g, '\\$&');
    void readPage(
      config,
      'branch-current-orders.page',
      {
        warehouse_code: warehouseCode || filters.warehouse.trim() || null,
        customer_code: filters.customer.trim() || null,
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
          <label className={filtersCss.filterField}>
            <span>分仓编码</span>
            <input
              aria-label="分仓编码"
              placeholder="请输入分仓编码"
              value={draft.warehouse}
              onChange={(event) => setDraft({ ...draft, warehouse: event.target.value })}
            />
          </label>
        )}
        <label className={filtersCss.filterField}>
          <span>客户编码</span>
          <input
            aria-label="客户编码"
            placeholder="全部客户"
            value={draft.customer}
            onChange={(event) => setDraft({ ...draft, customer: event.target.value })}
          />
        </label>
        <label className={filtersCss.filterField}>
          <span>订单号／客户</span>
          <input
            aria-label="订单号或客户名称"
            placeholder="订单号／客户搜索"
            value={draft.search}
            onChange={(event) => setDraft({ ...draft, search: event.target.value })}
          />
        </label>
        <button type="submit" className={filtersCss.filterQuery}>
          查询
        </button>
        <button
          type="button"
          className={filtersCss.filterReset}
          aria-pressed={filters.shortageOnly}
          onClick={() => {
            const next = { ...draft, shortageOnly: !filters.shortageOnly };
            setDraft(next);
            setFilters(next);
            setPage(1);
          }}
        >
          {filters.shortageOnly ? '全部订单' : '看缺货订单'}
        </button>
        <button
          type="button"
          className={filtersCss.filterReset}
          onClick={() => {
            setDraft(empty);
            setFilters(empty);
            setPage(1);
          }}
        >
          清空筛选
        </button>
      </LocalQueryForm>
      {state.kind === 'loading' ? (
        <DashboardTableSkeleton label="当前订单加载中" />
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
                    '客户',
                    '订单号',
                    '需求时间',
                    '下单时间',
                    '订单量（件）',
                    '未备量（件）',
                    'SKU个数',
                    '满足率',
                    '备注',
                  ].map((label) => (
                    <th key={label}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {state.data.rows.map((row) => (
                  <React.Fragment key={orderKey(row)}>
                    <tr>
                      <td>{text(row.customer_name || row.customer_code)}</td>
                      <td>
                        <button
                          type="button"
                          className={css.order}
                          aria-label={`${expanded === orderKey(row) ? '收起' : '展开'}订单${row.order_no}`}
                          aria-expanded={expanded === orderKey(row)}
                          onClick={() =>
                            setExpanded(expanded === orderKey(row) ? null : orderKey(row))
                          }
                        >
                          {row.order_no}
                        </button>
                      </td>
                      <td>{text(row.requested_at)}</td>
                      <td>{text(row.created_at)}</td>
                      <td>{qty(row.ordered)}</td>
                      <td>{qty(row.remaining)}</td>
                      <td>{qty(row.sku_count)}</td>
                      <td>
                        {row.satisfaction === null
                          ? '-'
                          : `${(row.satisfaction * 100).toFixed(1)}%`}
                      </td>
                      <td>
                        {row.remaining === null ? '-' : row.remaining > 0 ? '存在未备量' : '正常'}
                      </td>
                    </tr>
                    {expanded === orderKey(row) && (
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
