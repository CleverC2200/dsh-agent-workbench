import { QueryErrors } from './query-errors';
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
  onFilter,
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
              <td key={c.field}>{renderCell(row, c)}</td>
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
          render: (_: any, row: any) => renderCell(row, c),
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
          className={`${fc ? 'panel-actions' : qll ? chain.referenceFilters : dealer.toolbar} ${css.toolbar} ${fc ? css.fcToolbar : ''}`}
          data-business-filters={fc ? 'fc' : undefined}
          onSubmit={submit}
        >
          {view.filters.map((f: any) => (
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
        <DashboardTableSkeleton label={`${view.title}加载中`} />
      ) : (
        renderTable
      )}
      {result?.total != null &&
        !(loading && (fc || agentId === 'inventory-dealer')) &&
        (qll || aqkc || fc || agentId === 'inventory-dealer' ? (
          <PlanPagination
            ariaLabel={qll ? undefined : `${view.title}分页`}
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
