import { refreshConfiguredQueries } from './query-cache';
import type { FcCycleRule } from './fc-cycle-rules';
import { QueryErrors } from './query-errors';
import { OriginalBusinessList } from './original-business-list';
import { LocalQueryForm } from './local-query-form';
import { PlanPagination } from './plan-pagination';
import { DashboardTableSkeleton } from '../inventory-fc/source/inventory-light-plugins/src/dsh-ui/workbench-loading';
import React, { useEffect, useRef, useState } from 'react';
import { agentSqlConfig, type AgentSqlConfig } from './sql-config';
import {
  factMetric,
  readConfiguredFacts,
  initialFiltersForView,
  type FactInput,
} from './configured-facts';
import css from './configured-facts-page.module.css';
import { formatFactValue } from './fact-display';
import { batchAgeShare } from './batch-age';

const display = (value: any) =>
  value == null || value === ''
    ? '-'
    : typeof value === 'number'
      ? value.toLocaleString('zh-CN', { maximumFractionDigits: 3 })
      : String(value);
const today = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date());
function cellValue(row: any, field: string, format?: string) {
  if (format === 'quantity-share') return batchAgeShare(row[field], row.age_weight_qty);
  if (field === 'receive_address' && typeof row[field] === 'string') {
    try {
      const addresses = JSON.parse(row[field]);
      if (
        Array.isArray(addresses) &&
        addresses.length &&
        addresses.every((a) => typeof a?.address === 'string')
      )
        return addresses.map((a) => a.address).join('；');
    } catch {
      /* Plain text addresses remain plain text. */
    }
  }
  return formatFactValue(row[field], format);
}

export type ConfiguredListState = {
  filters: Record<string, string>;
  draft: Record<string, string>;
  columns: Record<string, string[]>;
  frozen: string[];
  replenishment?: FactInput['replenishment'];
};

/** Partial source contracts for the existing plugin entry. Missing domains never block another tab. */
export function ConfiguredFactsPage({
  config: fallback,
  onRead,
  embedded,
  viewIds,
  initialFilters = {},
  scopeFilters = {},
  date,
  cycleDays,
  fcCycleRules,
  fcCycleWarehouse,
  customerCode,
  onChooseCustomer,
  currentPage,
  onPageChange,
  currentPageSize,
  onPageSizeChange,
  presentation,
  businessList,
  readFacts = readConfiguredFacts,
  initialState,
  rememberState,
}: {
  readFacts?: typeof readConfiguredFacts;
  initialState?: ConfiguredListState;
  rememberState?: (state: ConfiguredListState) => void;
  businessList?: React.ComponentType<React.ComponentProps<typeof OriginalBusinessList>>;
  config: AgentSqlConfig;
  presentation?: { title: string; columns: any[]; filters?: string[] };
  onRead?: (value: any) => void;
  embedded?: boolean;
  viewIds?: string[];
  initialFilters?: Record<string, string>;
  scopeFilters?: Record<string, string>;
  date?: string;
  cycleDays?: number;
  fcCycleRules?: FcCycleRule[];
  fcCycleWarehouse?: string;
  customerCode?: string;
  onChooseCustomer?: (code: string) => void;
  currentPage?: number;
  onPageChange?: (page: number) => void;
  currentPageSize?: number;
  onPageSizeChange?: (size: number) => void;
}) {
  const config = agentSqlConfig(fallback),
    definition = config.sourceViews;
  const visibleViews = viewIds
    ? definition.views
        .filter((v: any) => viewIds.includes(v.id))
        .sort((a: any, b: any) => viewIds.indexOf(a.id) - viewIds.indexOf(b.id))
    : definition.views;
  const [viewId, setViewId] = useState(viewIds?.[0] ?? definition.initialView);
  const [asOf, setAsOf] = useState(date ?? today()),
    [dateDraft, setDateDraft] = useState(date ?? today());
  const [customer, setCustomer] = useState(customerCode ?? ''),
    [customerDraft, setCustomerDraft] = useState(customerCode ?? '');
  const defaultsFor = (id: string) =>
    initialFiltersForView(config, id, {
      ...definition.views.find((view: any) => view.id === id)?.defaultFilters,
      ...initialFilters,
    });
  const [filters, setFilters] = useState<Record<string, string>>(() => ({
    ...defaultsFor(viewId),
    ...initialState?.filters,
    ...initialFilters,
  }));
  const [draft, setDraft] = useState<Record<string, string>>(() => ({
    ...defaultsFor(viewId),
    ...initialState?.draft,
    ...initialFilters,
  }));
  const [columnChoices, setColumnChoices] = useState<Record<string, string[]>>(
    () => initialState?.columns ?? {},
  );
  const [frozenColumns, setFrozenColumns] = useState<string[]>(
    () =>
      initialState?.frozen ??
      (config.agentId === 'inventory-fc' && viewId === 'replenishment'
        ? ['sku', 'material_name', 'missing_actualQty']
        : []),
  );
  const [replenishment, setReplenishment] = useState<FactInput['replenishment']>(() =>
    config.agentId === 'inventory-fc' && viewId === 'replenishment'
      ? (initialState?.replenishment ?? {
          neededOnly: true,
          businessOnly: false,
          positiveActualKeys: [],
        })
      : undefined,
  );
  const remember = useRef(rememberState);
  remember.current = rememberState;
  useEffect(() => {
    remember.current?.({
      filters,
      draft,
      columns: columnChoices,
      frozen: frozenColumns,
      replenishment,
    });
  }, [filters, draft, columnChoices, frozenColumns, replenishment]);
  const [localPage, setLocalPage] = useState(1),
    [localPageSize, setLocalPageSize] = useState(10),
    [revision, refresh] = useState(0);
  const pageSize = currentPageSize ?? localPageSize;
  const setPageSize = (size: number) => {
    setLocalPageSize(size);
    onPageSizeChange?.(size);
  };
  const page = currentPage ?? localPage;
  const setPage = (next: React.SetStateAction<number>) => {
    const value = typeof next === 'function' ? next(page) : next;
    setLocalPage(value);
    onPageChange?.(value);
  };
  const [result, setResult] = useState<any>(null),
    [error, setError] = useState<any>(null),
    [loading, setLoading] = useState(false);
  const sourceView = definition.views.find((v: any) => v.id === viewId);
  // Presentation is independent of the query contract: no field, parameter or
  // permission is changed when rendering the original business table.
  const view = presentation
    ? {
        ...sourceView,
        title: presentation.title,
        columns: presentation.columns,
        defaultColumns: presentation.columns.map((c: any) => c.field),
        filters: sourceView.filters.filter(
          (f: any) =>
            !scopeFilters[f.name] &&
            (!presentation.filters || presentation.filters.includes(f.name)),
        ),
        metrics: [],
      }
    : sourceView;
  const chosenColumns =
    columnChoices[viewId] ?? view.defaultColumns ?? view.columns.map((c: any) => c.field);
  const columns = chosenColumns
    .map((field: string) => view.columns.find((c: any) => c.field === field))
    .filter(Boolean);
  const snapshot = useRef<{ key: string; context: any } | undefined>(undefined);
  const scopeKey = JSON.stringify([
    config.agentId,
    viewId,
    asOf,
    customer,
    cycleDays,
    fcCycleRules,
    fcCycleWarehouse,
    filters,
    scopeFilters,
    revision,
    replenishment,
  ]);
  useEffect(() => {
    const controller = new AbortController();
    setResult(null);
    setError(null);
    setLoading(true);
    onRead?.({ plugin: config.agentId, viewId, status: 'loading', summary: null });
    const readContext = snapshot.current?.key === scopeKey ? snapshot.current.context : undefined;
    snapshot.current = undefined;
    const read = (freshAfter?: number) =>
      readFacts(
        config,
        viewId,
        {
          asOf,
          page,
          pageSize,
          filters: { ...filters, ...scopeFilters },
          customer,
          cycleDays,
          fcCycleRules,
          fcCycleWarehouse,
          replenishment,
          readContext: freshAfter ? undefined : readContext,
        },
        // Business lists display rows; their independent overview owns card totals.
        { signal: controller.signal, detailsOnly: Boolean(presentation), freshAfter },
      );
    void (async () => {
      try {
        return await read();
      } catch (failure) {
        controller.signal.throwIfAborted();
        if (
          config.agentId !== 'inventory-fc' ||
          !(failure instanceof Error) ||
          !('code' in failure) ||
          !['SOURCE_CHANGED', 'RESULT_INCOMPLETE'].includes(String(failure.code))
        )
          throw failure;
        snapshot.current = undefined;
        return read(Date.now());
      }
    })()
      .then((value) => {
        if (controller.signal.aborted) return;
        snapshot.current = { key: scopeKey, context: value.readContext };
        setResult(value);
        onRead?.({
          plugin: config.agentId,
          ...value,
          coverage: '当前来源与显示页；缺失领域不代表零，未计算全链或客户库存总量',
        });
      })
      .catch((e) => {
        if (controller.signal.aborted) return;
        const failure = {
          code: e.code || e.errorCode || 'QUERY_FAILED',
          message: e.message,
          failure: e.failure,
          returnedColumns: e.returnedColumns,
          rejectedColumns: e.rejectedColumns,
        };
        setError(failure);
        onRead?.({ plugin: config.agentId, viewId, status: 'failed', summary: null, ...failure });
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [scopeKey, page, pageSize, readFacts]);
  const navigate = (id: string) => {
    setViewId(id);
    setPage(1);
    setFilters(defaultsFor(id));
    setDraft(defaultsFor(id));
  };
  const chooseCustomer = (code: string) => {
    if (onChooseCustomer) {
      onChooseCustomer(code);
      return;
    }
    setCustomer(code);
    setCustomerDraft(code);
    setPage(1);
    navigate('orders');
  };

  const businessTitleId = React.useId();
  const titleId = presentation ? businessTitleId : 'source-view-title';
  const BusinessList = businessList ?? OriginalBusinessList;
  if (presentation)
    return (
      <BusinessList
        actionScope={{
          config,
          viewId,
          input: {
            asOf,
            filters: { ...filters, ...scopeFilters },
            cycleDays,
            fcCycleRules,
            fcCycleWarehouse,
            replenishment,
          },
        }}
        onReplenishmentFilter={(next: NonNullable<FactInput['replenishment']>) => {
          setReplenishment(next);
          setPage(1);
        }}
        agentId={config.agentId}
        view={view}
        columns={columns}
        chosenColumns={chosenColumns}
        frozenColumns={config.agentId === 'inventory-fc' ? frozenColumns : undefined}
        onFrozenColumns={config.agentId === 'inventory-fc' ? setFrozenColumns : undefined}
        onColumns={(next: string[]) => setColumnChoices((old) => ({ ...old, [viewId]: next }))}
        filters={draft}
        appliedFilters={filters}
        onFilter={(name: string, value: string) => setDraft((old) => ({ ...old, [name]: value }))}
        onQuickFilter={(name: string, value: string) => {
          const sort =
            config.agentId === 'inventory-fc' &&
            name === 'list_mode' &&
            ['urgent', 'recommended'].includes(value)
              ? {
                  sort_field: value === 'urgent' ? 'current_order_shortage' : 'recommended_qty',
                  sort_direction: 'desc',
                }
              : {};
          setDraft((old) => ({ ...old, [name]: value, ...sort }));
          setFilters((old) => ({ ...old, [name]: value, ...sort }));
          setPage(1);
        }}
        onSort={(field: string) => {
          const next = {
            sort_field: field,
            sort_direction:
              filters.sort_field === field && filters.sort_direction === 'desc' ? 'asc' : 'desc',
          };
          setFilters((old) => ({ ...old, ...next }));
          setDraft((old) => ({ ...old, ...next }));
          setPage(1);
        }}
        retry={() => {
          snapshot.current = undefined;
          refreshConfiguredQueries();
          refresh((value) => value + 1);
        }}
        submit={(event: React.FormEvent) => {
          event.preventDefault();
          setFilters({ ...draft });
          setPage(1);
          if (!(config.agentId === 'inventory-fc' && viewId === 'inventory'))
            refreshConfiguredQueries();
          refresh((n) => n + 1);
        }}
        reset={() => {
          setReplenishment((current) =>
            current ? { ...current, neededOnly: true, businessOnly: false } : current,
          );
          const defaults = defaultsFor(viewId);
          if (
            config.agentId === 'inventory-fc' &&
            view.filters.some((field: any) => field.name === 'search')
          )
            defaults.search = '';
          setDraft(defaults);
          setFilters(defaults);
          setPage(1);
        }}
        result={result}
        error={error}
        loading={loading}
        page={page}
        pageSize={pageSize}
        onPage={setPage}
        onPageSize={setPageSize}
        renderCell={(row: any, c: any) =>
          c.context ? (
            display(c.context === 'stock_date' ? result?.snapshotDate : c.value)
          ) : c.unavailable ? (
            '-'
          ) : definition.customerScope && view.id === 'customer' && c.field === 'customer' ? (
            <button className={css.link} onClick={() => chooseCustomer(String(row.customer))}>
              {display(row.customer)}
            </button>
          ) : c.secondary ? (
            <div className="agent-business-product">
              <strong>{cellValue(row, c.valueField ?? c.field, c.format)}</strong>
              {c.secondary
                .filter((field: string) => row[field] != null && row[field] !== '')
                .map((field: string) => (
                  <small key={field}>{cellValue(row, field)}</small>
                ))}
            </div>
          ) : (
            cellValue(row, c.valueField ?? c.field, c.format)
          )
        }
      />
    );
  const Container = embedded ? 'div' : 'main';
  return (
    <Container
      className={`${css.page} ${embedded ? css.embedded : ''} ${presentation ? css.business : ''}`}
    >
      {!embedded && (
        <header className={css.header}>
          <div>
            <h1>{definition.title}</h1>
          </div>
          <LocalQueryForm
            className={css.toolbar}
            onSubmit={(event) => {
              event.preventDefault();
              setAsOf(dateDraft);
              setPage(1);
              refreshConfiguredQueries();
              refresh((n) => n + 1);
            }}
          >
            <label>
              读取时点
              <input
                aria-label="读取时点"
                type="date"
                value={dateDraft}
                max={today()}
                required
                onChange={(e) => setDateDraft(e.target.value)}
              />
            </label>
            <button type="submit">刷新数据</button>
          </LocalQueryForm>
        </header>
      )}
      {definition.customerScope && !embedded && (
        <LocalQueryForm
          className={css.scope}
          onSubmit={(event) => {
            event.preventDefault();
            setCustomer(customerDraft.trim());
            setPage(1);
            refreshConfiguredQueries();
            refresh((n) => n + 1);
          }}
        >
          <label>
            客户编码
            <input
              aria-label="客户编码"
              value={customerDraft}
              maxLength={100}
              onChange={(e) => setCustomerDraft(e.target.value)}
              placeholder="从客户目录选择，或输入完整编码"
            />
          </label>
          <button type="submit">应用客户</button>
          <span>
            {customer
              ? '当前客户：' + customer
              : '客户目录与商品目录可直接查看；订单、交货、政策及车型需选择客户。'}
          </span>
        </LocalQueryForm>
      )}
      {(!embedded || visibleViews.length > 1) && (
        <nav className={css.tabs} aria-label="业务数据视图">
          {visibleViews.map((v: any) => (
            <button
              key={v.id}
              type="button"
              aria-current={v.id === viewId ? 'page' : undefined}
              onClick={() => navigate(v.id)}
            >
              {v.title}
            </button>
          ))}
        </nav>
      )}
      <section className={css.panel} aria-labelledby={titleId}>
        <div className={css.heading}>
          <h2 id={titleId}>{view.title}</h2>
          <div className={css.tableActions}>
            {!presentation && (
              <span>
                {view.timeMode === 'current'
                  ? '当前源记录 · 不应用日期筛选'
                  : view.timeMode === 'month'
                    ? '所属月份：' + asOf.slice(0, 7)
                    : result?.snapshotDate
                      ? (view.snapshotLabel ?? '快照日') + '：' + result.snapshotDate
                      : result?.parameters?.rolling_start
                        ? '本月 ' +
                          asOf.slice(0, 7) +
                          '-01 至 ' +
                          asOf +
                          '；近30日 ' +
                          String(result.parameters.rolling_start).replace(
                            /^(\d{4})(\d{2})(\d{2})$/,
                            '$1-$2-$3',
                          ) +
                          ' 至 ' +
                          asOf
                        : asOf.slice(0, 7) + '-01 至 ' + asOf}
              </span>
            )}
            <details className={css.columnPicker}>
              <summary>显示列（{columns.length}）</summary>
              <div className={css.columnOptions}>
                {view.columns.map((c: any) => (
                  <label key={c.field}>
                    <input
                      type="checkbox"
                      checked={chosenColumns.includes(c.field)}
                      disabled={columns.length === 1 && chosenColumns.includes(c.field)}
                      onChange={(event) =>
                        setColumnChoices((old) => ({
                          ...old,
                          [viewId]: event.target.checked
                            ? [...chosenColumns, c.field]
                            : chosenColumns.filter((field: string) => field !== c.field),
                        }))
                      }
                    />
                    {c.label}
                  </label>
                ))}
                <button
                  type="button"
                  onClick={() =>
                    setColumnChoices((old) => ({
                      ...old,
                      [viewId]: view.columns.map((c: any) => c.field),
                    }))
                  }
                >
                  显示全部
                </button>
              </div>
            </details>
            {!presentation && (
              <details className={css.definition}>
                <summary>统计口径</summary>
                <p>{view.description}</p>
              </details>
            )}
          </div>
        </div>
        {view.filters.length > 0 && (
          <LocalQueryForm
            className={css.filters}
            onSubmit={(event) => {
              event.preventDefault();
              setFilters({ ...draft });
              setPage(1);
              refreshConfiguredQueries();
              refresh((n) => n + 1);
            }}
          >
            {view.filters.map((field: any) => (
              <label key={field.name}>
                {field.label}
                <input
                  aria-label={field.label}
                  maxLength={100}
                  value={draft[field.name] ?? ''}
                  onChange={(e) => setDraft((old) => ({ ...old, [field.name]: e.target.value }))}
                />
              </label>
            ))}
            <button type="submit">查询</button>
            <button
              type="button"
              onClick={() => {
                setDraft(defaultsFor(viewId));
                setFilters(defaultsFor(viewId));
                setPage(1);
              }}
            >
              清空筛选
            </button>
          </LocalQueryForm>
        )}
        <QueryErrors errors={error ? [`${error.message}（${error.code}）`] : []} />
        {loading && <DashboardTableSkeleton label={`${view.title}加载中`} embedded={embedded} />}
        {!loading && result?.status === 'select_customer' && (
          <p role="status" className={css.empty}>
            请选择客户后查看该客户的{view.title}。
          </p>
        )}
        {!loading &&
          result?.status === 'unavailable' &&
          (view.columns.length ? (
            <div className={css.tableWrap}>
              <table>
                <caption className={css.caption}>{view.title}明细</caption>
                <thead>
                  <tr>
                    {columns.map((c: any) => (
                      <th key={c.field} title={c.reason} scope="col">
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td colSpan={columns.length}>
                      <p role="status" className={css.empty}>
                        {presentation ? '暂无数据。' : view.description}
                      </p>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            <p role="status" className={css.empty}>
              {presentation ? '暂无数据。' : view.description}
            </p>
          ))}
        {!loading && result && ['available', 'empty'].includes(result.status) && (
          <>
            <QueryErrors
              errors={
                result.summaryError
                  ? [`${result.summaryError.message}（${result.summaryError.code}）`]
                  : []
              }
            />
            {view.metrics?.length > 0 && (
              <div className={css.metrics}>
                {view.metrics.map((metric: any) => (
                  <article key={metric.field}>
                    <h3>{metric.label}</h3>
                    <strong>
                      {display(result.total ? factMetric(result.summary, metric) : null)}
                    </strong>
                    <p>
                      {metric.coverage
                        ? `覆盖 ${display(result.summary?.[metric.coverage])} / ${display(result.summary?.row_count)} 行${Number(result.summary?.[metric.coverage]) < Number(result.summary?.row_count) ? '；其余未知' : ''}`
                        : '当前筛选全量汇总' +
                          (Number(result.summary?.[metric.missing]) > 0
                            ? '；有来源缺值，结果未知'
                            : '')}
                    </p>
                  </article>
                ))}
              </div>
            )}
            {result.total === 0 ? (
              <p role="status" className={css.empty}>
                {presentation ? '暂无数据。' : result.message || '当前来源及筛选范围无记录。'}
              </p>
            ) : (
              <>
                <div className={css.tableWrap}>
                  <table>
                    <caption className={css.caption}>{view.title}明细</caption>
                    <thead>
                      <tr>
                        {columns.map((c: any) => (
                          <th
                            key={c.field}
                            title={c.reason}
                            scope="col"
                            className={
                              ['decimal', 'decimal2', 'percent'].includes(c.format)
                                ? css.numeric
                                : undefined
                            }
                          >
                            {c.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.rows.map((row: any, i: number) => (
                        <tr key={i}>
                          {columns.map((c: any) => (
                            <td
                              key={c.field}
                              className={
                                ['decimal', 'decimal2', 'percent'].includes(c.format)
                                  ? css.numeric
                                  : ['material_name', 'customer_name', 'receive_address'].includes(
                                        c.field,
                                      )
                                    ? css.descriptionCell
                                    : undefined
                              }
                              title={
                                c.unavailable
                                  ? c.reason || '当前来源缺少该字段'
                                  : row[c.field] == null
                                    ? undefined
                                    : String(row[c.field])
                              }
                            >
                              {c.context ? (
                                display(c.context === 'stock_date' ? result.snapshotDate : c.value)
                              ) : c.unavailable ? (
                                '-'
                              ) : definition.customerScope &&
                                view.id === 'customer' &&
                                c.field === 'customer' ? (
                                <button
                                  className={css.link}
                                  type="button"
                                  disabled={!row.customer}
                                  onClick={() => chooseCustomer(String(row.customer))}
                                >
                                  {display(row.customer)}
                                </button>
                              ) : c.secondary ? (
                                <div className={css.product}>
                                  <strong>
                                    {cellValue(row, c.valueField ?? c.field, c.format)}
                                  </strong>
                                  {c.secondary
                                    .filter(
                                      (field: string) => row[field] != null && row[field] !== '',
                                    )
                                    .map((field: string) => (
                                      <small key={field}>{cellValue(row, field)}</small>
                                    ))}
                                </div>
                              ) : (
                                cellValue(row, c.valueField ?? c.field, c.format)
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <PlanPagination
                  ariaLabel={`${view.title}分页`}
                  totalCount={result.total}
                  page={page}
                  pageSize={pageSize}
                  loading={loading}
                  onPageChange={setPage}
                  onPageSizeChange={(size) => {
                    setPageSize(size);
                    setPage(1);
                  }}
                />
              </>
            )}
          </>
        )}
        {result?.summaryError?.failure && (
          <details className={css.details}>
            <summary>查询错误详情</summary>
            <pre>{JSON.stringify(result.summaryError.failure, null, 2)}</pre>
          </details>
        )}
      </section>
    </Container>
  );
}
