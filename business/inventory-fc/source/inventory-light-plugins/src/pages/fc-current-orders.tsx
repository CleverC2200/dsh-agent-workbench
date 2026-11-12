import React, { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import type { AgentSqlConfig } from '../../../../../shared/sql-config';
import { LocalQueryForm } from '../../../../../shared/local-query-form';
import { currentOrderStatus, ORDER_STATUSES } from '../../../fc/src/lib/current-orders';
import { useFcWorkflow } from './configured-fc-list';
import { PlanPagination } from '../../../../../shared/plan-pagination';
import { DashboardTableSkeleton } from '../dsh-ui/workbench-loading';
import { ColumnResizeHandle } from '../../../../../shared/table-column-controls';
import { downloadWorkbook } from '../dsh-ui/workbook';
import {
  readPage,
  orderSchema,
  lineSchema,
  orderKey,
  readOrderExport,
  type Order,
  type Line,
  type ReadState,
} from './fc-current-orders-data';
import css from './fc-current-orders.module.css';
import filtersCss from '../../../../../shared/original-business-list.module.css';

const text = (value: string | null) => value || '-';
const qty = (value: number | null) =>
  value === null ? '-' : value.toLocaleString('zh-CN', { maximumFractionDigits: 2 });
const errorText = (error: unknown) =>
  error instanceof Error ? error.message : '订单读取失败，请重试';

const orderLabels = [
  '订单号',
  '分仓',
  '下游客户',
  '订单日期',
  'SKU个数',
  '需求量（件）',
  '分仓已占用（件）',
  '剩余需求量（件）',
  '缺货量（件）',
  '状态',
];
const lineLabels = ['产品', '需求量（件）', '分仓已占用（件）', '剩余需求量（件）', '缺货量（件）'];
const widthOf = (widths: Record<string, number>, label: string) =>
  widths[label] ?? (['产品', '订单号', '下游客户'].includes(label) ? 220 : 140);
function SelectionCheckbox({
  mixed = false,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { mixed?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = mixed;
  }, [mixed]);
  return <input {...props} type="checkbox" ref={ref} />;
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
  const [widths, setWidths] = useState<Record<string, number>>({});
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
          <div className="table-scroll">
            <table
              className="data-table"
              data-resizable
              style={{
                width: lineLabels.reduce((n, label) => n + widthOf(widths, label), 0),
                minWidth: 0,
              }}
            >
              <colgroup>
                {lineLabels.map((label) => (
                  <col key={label} style={{ width: widthOf(widths, label) }} />
                ))}
              </colgroup>
              <thead>
                <tr>
                  {lineLabels.map((label) => (
                    <th
                      key={label}
                      scope="col"
                      aria-label={label}
                      style={{ width: widthOf(widths, label) }}
                    >
                      {label}
                      <ColumnResizeHandle
                        label={label}
                        width={widthOf(widths, label)}
                        onResize={(width) => setWidths((old) => ({ ...old, [label]: width }))}
                      />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {state.data.rows.map((row) => (
                  <tr key={row.sku}>
                    <td>
                      {text(row.sku)} {text(row.material_name)}
                    </td>
                    {[row.demand, row.allocated, row.remaining, row.shortage].map(
                      (value, index) => (
                        <td key={index}>{qty(value)}</td>
                      ),
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
  const [widths, setWidths] = useState<Record<string, number>>({});
  const [selection, setSelection] = useState<
    { kind: 'selected'; keys: Set<string> } | { kind: 'all'; excluded: Set<string> }
  >({ kind: 'selected', keys: new Set() });
  const exportRequest = useRef<AbortController | null>(null);
  const [exportState, setExportState] = useState<
    { kind: 'idle' | 'loading' } | { kind: 'done' | 'failed'; message: string }
  >({ kind: 'idle' });
  const queryValues = useMemo(
    () => ({
      warehouse_code: warehouseCode || null,
      warehouse_search_pattern: filters.warehouse.trim()
        ? '%' + filters.warehouse.trim().replace(/[\\%_]/g, '\\$&') + '%'
        : null,
      customer_code: null,
      search_pattern: filters.search.trim()
        ? '%' + filters.search.trim().replace(/[\\%_]/g, '\\$&') + '%'
        : null,
      shortage_only: filters.shortageOnly,
    }),
    [warehouseCode, filters],
  );
  useEffect(() => {
    setSelection({ kind: 'selected', keys: new Set() });
    setExportState({ kind: 'idle' });
    return () => {
      exportRequest.current?.abort();
    };
  }, [config, warehouseCode, filters, revision, identityRevision]);
  const selected = (row: Order) =>
    selection.kind === 'selected'
      ? selection.keys.has(orderKey(row))
      : !selection.excluded.has(orderKey(row));
  const selectRows = (rows: Order[], checked: boolean) =>
    setSelection((previous) => {
      if (previous.kind === 'selected') {
        const keys = new Set(previous.keys);
        for (const row of rows) {
          if (checked) keys.add(orderKey(row));
          else keys.delete(orderKey(row));
        }
        return { kind: 'selected', keys };
      }
      const excluded = new Set(previous.excluded);
      for (const row of rows) {
        if (checked) excluded.delete(orderKey(row));
        else excluded.add(orderKey(row));
      }
      return { kind: 'all', excluded };
    });
  const selectedCount =
    selection.kind === 'selected'
      ? selection.keys.size
      : Math.max(0, (state.kind === 'ready' ? state.data.total : 0) - selection.excluded.size);
  const exportOrders = async (all: boolean) => {
    if (exportRequest.current || state.kind !== 'ready') return;
    const controller = new AbortController();
    exportRequest.current = controller;
    setExportState({ kind: 'loading' });
    try {
      const result = await readOrderExport(
        config,
        queryValues,
        all ? { kind: 'all', excluded: new Set() } : selection,
        controller.signal,
      );
      controller.signal.throwIfAborted();
      downloadWorkbook(result.rows, '分仓当前订单产品明细.xlsx', '订单产品明细');
      setExportState({
        kind: 'done',
        message: `已导出${result.orderCount}个订单、${result.lineCount}条产品明细`,
      });
    } catch (error: unknown) {
      if (!controller.signal.aborted) setExportState({ kind: 'failed', message: errorText(error) });
    } finally {
      controller.abort();
      if (exportRequest.current === controller) exportRequest.current = null;
    }
  };

  useEffect(() => {
    const clear = () => {
      exportRequest.current?.abort();
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
    void readPage(
      config,
      'branch-current-orders.page',
      queryValues,
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
  }, [config, warehouseCode, revision, filters, page, pageSize, identityRevision, queryValues]);
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
          客户订单号／下游客户／SKU
          <input
            aria-label="客户订单号或下游客户"
            placeholder="客户订单号／下游客户／SKU／产品名称"
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
      <div className={css.exportToolbar}>
        <button
          type="button"
          disabled={state.kind !== 'ready' || !state.data.total || exportState.kind === 'loading'}
          onClick={() => setSelection({ kind: 'all', excluded: new Set() })}
        >
          全选筛选结果
        </button>
        <button
          type="button"
          disabled={!selectedCount || exportState.kind === 'loading'}
          onClick={() => setSelection({ kind: 'selected', keys: new Set() })}
        >
          取消选择
        </button>
        <span>已选 {selectedCount} 个订单</span>
        <button
          type="button"
          disabled={!selectedCount || state.kind !== 'ready' || exportState.kind === 'loading'}
          onClick={() => void exportOrders(false)}
        >
          导出已选明细
        </button>
        <button
          type="button"
          disabled={state.kind !== 'ready' || !state.data.total || exportState.kind === 'loading'}
          onClick={() => void exportOrders(true)}
        >
          导出全部明细
        </button>
        {exportState.kind === 'loading' && <span role="status">正在读取完整订单明细…</span>}
        {'message' in exportState && (
          <span role={exportState.kind === 'failed' ? 'alert' : 'status'}>
            {exportState.message}
          </span>
        )}
      </div>
      {state.kind === 'loading' ? (
        <DashboardTableSkeleton label="当前订单加载中" embedded />
      ) : state.kind === 'failed' ? (
        <p className={css.error} role="alert">
          {state.message}
        </p>
      ) : (
        <>
          <div className="table-scroll">
            <table
              className="data-table"
              data-resizable
              style={{
                width: 48 + orderLabels.reduce((n, label) => n + widthOf(widths, label), 0),
                minWidth: 0,
              }}
            >
              <colgroup>
                <col style={{ width: 48 }} />
                {orderLabels.map((label) => (
                  <col key={label} style={{ width: widthOf(widths, label) }} />
                ))}
              </colgroup>
              <thead>
                <tr>
                  <th className={css.selection}>
                    <SelectionCheckbox
                      aria-label="全选本页订单"
                      checked={state.data.rows.length > 0 && state.data.rows.every(selected)}
                      mixed={state.data.rows.some(selected) && !state.data.rows.every(selected)}
                      onChange={(event) => selectRows(state.data.rows, event.target.checked)}
                    />
                  </th>
                  {orderLabels.map((label) => (
                    <th
                      key={label}
                      scope="col"
                      aria-label={label}
                      style={{ width: widthOf(widths, label) }}
                    >
                      {label}
                      <ColumnResizeHandle
                        label={label}
                        width={widthOf(widths, label)}
                        onResize={(width) => setWidths((old) => ({ ...old, [label]: width }))}
                      />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {state.data.rows.map((row) => (
                  <React.Fragment key={orderKey(row)}>
                    <tr
                      aria-selected={selected(row)}
                      className={selected(row) ? css.selectedRow : undefined}
                    >
                      <td className={css.selection}>
                        <SelectionCheckbox
                          aria-label={`选择订单${row.order_no}`}
                          checked={selected(row)}
                          onChange={(event) => selectRows([row], event.target.checked)}
                        />
                      </td>
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
                      <td>{text(row.warehouse_name || row.warehouse_code)}</td>
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
                      <tr className="detail-row">
                        <td colSpan={11}>
                          <OrderLines config={config} order={row} revision={revision} />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
              {state.data.totals && (
                <tfoot aria-label="当前筛选合计">
                  <tr>
                    <td>-</td>
                    <td>合计</td>
                    <td>-</td>
                    <td>-</td>
                    <td>-</td>
                    <td>{qty(state.data.totals.sku_count)}</td>
                    <td>{qty(state.data.totals.demand)}</td>
                    <td>{qty(state.data.totals.allocated)}</td>
                    <td>{qty(state.data.totals.remaining)}</td>
                    <td>{qty(state.data.totals.shortage)}</td>
                    <td>-</td>
                  </tr>
                </tfoot>
              )}
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
