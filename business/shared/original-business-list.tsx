import { formatChainValue } from './full-chain-display';
import { formatFactValue } from './fact-display';
import { QueryErrors } from './query-errors';
import { WarehouseSelect } from '../inventory-fc/source/inventory-light-plugins/src/pages/fc/components/warehouse-select';
import React from 'react';
import { LocalQueryForm } from './local-query-form';
import { PlanPagination } from './plan-pagination';
import { DashboardTableSkeleton } from '../inventory-aqkc/source/inventory-light-plugins/src/dsh-ui/workbench-loading';
import {
  Table,
  DataPagination,
  Input,
  Button,
} from '../inventory-dealer/source/inventory-light-plugins/src/dsh-ui/controls';
import { Table as ChainTable } from '../inventory-qll/source/inventory-light-plugins/src/pages/qll/components/viewport-table';
import dealer from '../inventory-dealer/source/inventory-light-plugins/src/pages/dealer/workbench.module.css';
import chain from '../inventory-qll/source/inventory-light-plugins/src/pages/qll/components/full-chain-workbench.module.css';
import base from '../inventory-aqkc/source/inventory-light-plugins/src/pages/aqkc/components/inventory-operations-workbench.module.css';
import css from './original-business-list.module.css';

/** Only presentation: the caller owns governed reads, errors and server pagination. */
export function OriginalBusinessList({
  agentId,
  view,
  columns,
  chosenColumns,
  onColumns,
  filters,
  appliedFilters,
  onFilter,
  onQuickFilter,
  submit,
  reset,
  result,
  error,
  loading,
  page,
  pageSize,
  onPage,
  onPageSize,
  renderCell,
  toolbarActions,
}: any) {
  const fc = agentId === 'inventory-fc',
    qll = agentId === 'inventory-qll',
    aqkc = agentId === 'inventory-aqkc';
  const displayCell = (row: any, column: any) => {
    const unit = /[（(](件|箱)(?:[）)])/.exec(column.label ?? '')?.[1];
    if (!qll || !unit || column.unavailable || column.secondary) return renderCell(row, column);
    const raw =
      column.context === 'literal' ? column.value : row[column.valueField ?? column.field];
    const n = raw == null || raw === '' || typeof raw === 'boolean' ? null : Number(raw);
    return (
      <span
        title={
          n === null || !Number.isFinite(n) ? undefined : formatFactValue(raw, 'decimal') + unit
        }
      >
        {formatChainValue(n, unit)}
      </span>
    );
  };
  const rawTable = (
    <table
      className={
        fc
          ? `data-table ${view.id === 'replenishment' ? 'replenishment-table' : view.id === 'inventory' ? 'aging-table' : ''}`
          : undefined
      }
    >
      <thead>
        <tr>
          {columns.map((c: any) => (
            <th key={c.field} scope="col" title={c.reason}>
              {c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {result?.rows?.map((row: any, i: number) => (
          <tr key={i}>
            {columns.map((c: any) => (
              <td key={c.field}>{displayCell(row, c)}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
  const data = ['available', 'empty'].includes(result?.status) ? result.rows : [];
  const BusinessTable = qll ? ChainTable : Table;
  const renderTable =
    fc || aqkc ? (
      <div className={fc ? 'table-scroll' : base.tableCard}>
        {rawTable}
        {!loading && !data.length && <p className={css.empty}>暂无数据。</p>}
      </div>
    ) : (
      <BusinessTable
        columns={columns.map((c: any) => ({
          key: c.field,
          title: c.label,
          width: qll
            ? (
                {
                  base: 250,
                  category: 250,
                  warehouse_name: 250,
                  customer_name: 250,
                  missing_business_status: 130,
                  company_inventory: 140,
                  base_inventory: 125,
                  branch_inventory: 125,
                  customer_inventory: 160,
                  company_gap: 145,
                  turnover: 110,
                  average_age: 125,
                  big_date: 135,
                  target_turnover: 125,
                  source_date: 120,
                } as Record<string, number>
              )[c.field]
            : c.secondary
              ? 240
              : undefined,
          align:
            qll &&
            [
              'company_inventory',
              'base_inventory',
              'branch_inventory',
              'customer_inventory',
              'company_gap',
              'turnover',
              'average_age',
              'big_date',
              'target_turnover',
            ].includes(c.field)
              ? 'right'
              : undefined,
          render: (_: any, row: any) => displayCell(row, c),
        }))}
        data={data}
        pagination={false}
        rowKey={(row: any) => data.indexOf(row)}
        loading={loading}
        emptyText="暂无数据。"
      />
    );
  return (
    <section className={css.list} aria-label={view.title} aria-busy={loading}>
      {(view.filters.length > 0 || fc) && (
        <LocalQueryForm
          className={`${fc ? 'panel-actions' : qll ? chain.referenceFilters : dealer.toolbar} ${css.toolbar} ${fc ? css.fcToolbar : qll ? css.qllToolbar : ''}`}
          data-business-filters={fc ? 'fc' : qll ? 'qll' : undefined}
          onSubmit={submit}
        >
          {view.filters
            .filter((f: any) => !f.options)
            .map((f: any) => (
              <label key={f.name} className={fc ? css.filterField : undefined}>
                <span>{f.label}</span>
                <Input
                  aria-label={f.label}
                  placeholder={fc ? `请输入${f.label}` : undefined}
                  maxLength={100}
                  value={filters[f.name] ?? ''}
                  onChange={(value: string) => onFilter(f.name, value)}
                />
              </label>
            ))}
          {view.filters
            .filter((f: any) => f.options)
            .map((f: any) =>
              fc ? (
                <WarehouseSelect
                  key={f.name}
                  label={f.label}
                  compact
                  disabled={false}
                  value={String(appliedFilters?.[f.name] ?? '')}
                  options={f.options.map((option: any) => ({
                    id: String(option.value),
                    name: option.label,
                  }))}
                  onChange={(value) => onQuickFilter(f.name, value)}
                />
              ) : (
                <div key={f.name} className={css.quickFilters} role="group" aria-label={f.label}>
                  {f.options.map((option: any) => (
                    <button
                      type="button"
                      key={option.value}
                      aria-pressed={(appliedFilters?.[f.name] ?? '') === option.value}
                      onClick={() => onQuickFilter(f.name, option.value)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              ),
            )}
          {view.filters.length > 0 && (
            <>
              <Button
                htmlType="submit"
                size="small"
                className={css.filterQuery}
                variant={fc ? 'primary' : undefined}
              >
                查询
              </Button>
              <Button size="small" className={css.filterReset} onClick={reset}>
                清空筛选
              </Button>
            </>
          )}
          {toolbarActions}
          {fc && (
            <details className={css.columns}>
              <summary aria-label="列设置">列设置（{columns.length}）</summary>
              <div>
                {view.columns.map((c: any) => (
                  <label key={c.field}>
                    <input
                      type="checkbox"
                      checked={chosenColumns.includes(c.field)}
                      disabled={columns.length === 1 && chosenColumns.includes(c.field)}
                      onChange={(e) =>
                        onColumns(
                          e.target.checked
                            ? [...chosenColumns, c.field]
                            : chosenColumns.filter((field: string) => field !== c.field),
                        )
                      }
                    />
                    {c.label}
                  </label>
                ))}
                <Button
                  size="small"
                  onClick={() => onColumns(view.columns.map((c: any) => c.field))}
                >
                  显示全部
                </Button>
              </div>
            </details>
          )}
        </LocalQueryForm>
      )}
      <QueryErrors
        errors={[
          error ? `${error.message}（${error.code}）` : '',
          result?.summaryError?.message,
        ].filter(Boolean)}
        scope={agentId}
      />
      {result?.status === 'select_customer' ? (
        <p className={css.empty}>请选择客户。</p>
      ) : loading && (aqkc || fc) ? (
        <DashboardTableSkeleton label={`${view.title}加载中`} embedded />
      ) : (
        renderTable
      )}
      {result?.total != null &&
        !(loading && (fc || agentId === 'inventory-dealer')) &&
        (qll || aqkc || fc || agentId === 'inventory-dealer' ? (
          <PlanPagination
            ariaLabel={qll ? undefined : `${view.title}分页`}
            maxPageSize={view.maxPageSize}
            totalCount={result.total}
            page={page}
            pageSize={pageSize}
            loading={loading}
            onPageChange={onPage}
            onPageSizeChange={(size) => {
              onPageSize(size);
              onPage(1);
            }}
          />
        ) : (
          <DataPagination
            ariaLabel={view.title + '分页'}
            pageNumber={page}
            pageSize={pageSize}
            totalCount={result.total}
            disabled={loading}
            onPageChange={onPage}
            onPageSizeChange={(size: number) => {
              onPageSize(size);
              onPage(1);
            }}
          />
        ))}
    </section>
  );
}
