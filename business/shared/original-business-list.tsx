import { formatChainValue } from './full-chain-display';
import { formatFactValue } from './fact-display';
import { QueryErrors } from './query-errors';
import React, { useLayoutEffect, useRef, useState } from 'react';
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
import { ColumnFilterControl, ColumnResizeHandle } from './table-column-controls';

const optionalLabelNames: Record<string, string> = {
  material_name: '产品名称',
  warehouse_name: '分仓名称',
  category: '品类',
  material_group: '物料组',
  page_scope_has_material_group: '物料组覆盖情况',
};

/** Only presentation: the caller owns governed reads, errors and server pagination. */
export function OriginalBusinessList({
  agentId,
  view,
  columns: selectedColumns,
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
  renderSummaryCell,
  toolbarActions,
  quickFilterActions,
  emptyMessage = '暂无符合条件的数据。',
  getRowKey,
  retry,
  onSort,
  renderRowDetails,
  frozenColumns,
  onFrozenColumns,
  columnWidths = {},
  onColumnWidths,
  onColumnFilter,
}: any) {
  const fc = agentId === 'inventory-fc',
    qll = agentId === 'inventory-qll',
    aqkc = agentId === 'inventory-aqkc';
  const [localFrozen, setLocalFrozen] = useState<string[]>(
    fc && view.id === 'replenishment' ? ['sku', 'material_name', 'missing_actualQty'] : [],
  );
  const frozen: string[] = frozenColumns ?? localFrozen;
  const setFrozen = (change: React.SetStateAction<string[]>) => {
    const next = typeof change === 'function' ? change(frozen) : change;
    setLocalFrozen(next);
    onFrozenColumns?.(next);
  };
  const [draggedColumn, setDraggedColumn] = useState<string | null>(null);
  const columns = fc
    ? [
        ...selectedColumns.filter(
          (c: any) => frozen.includes(c.field) && c.field !== 'missing_actualQty',
        ),
        ...selectedColumns.filter((c: any) => !frozen.includes(c.field)),
        ...selectedColumns.filter(
          (c: any) => frozen.includes(c.field) && c.field === 'missing_actualQty',
        ),
      ]
    : selectedColumns;
  const table = useRef<HTMLTableElement>(null);
  const resizable = Boolean(view.resizableColumns);
  const widthOf = (column: { field: string; format?: string }) =>
    columnWidths[column.field] ??
    (column.field === 'material_name'
      ? 280
      : column.field === 'material_group_name'
        ? 220
        : column.field === 'missing_age_13'
          ? 240
          : column.format === 'quantity-share'
            ? 170
            : 140);
  const [offsets, setOffsets] = useState<Record<string, number>>({});
  const columnKey = columns.map((column: any) => column.field).join(':');
  useLayoutEffect(() => {
    if (!fc || !table.current) return;
    const element = table.current;
    const measure = () => {
      let left = 0;
      const next: Record<string, number> = {};
      for (const header of element.querySelectorAll<HTMLTableCellElement>('thead th')) {
        const field = header.dataset.field;
        if (field && frozen.includes(field) && field !== 'missing_actualQty') {
          next[field] = left;
          left += header.getBoundingClientRect().width;
        }
      }
      setOffsets((old) => (JSON.stringify(old) === JSON.stringify(next) ? old : next));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [fc, columnKey, frozen]);
  const fixedStyle = (field: string): React.CSSProperties | undefined =>
    fc && frozen.includes(field)
      ? {
          position: 'sticky',
          ...(field === 'missing_actualQty' ? { right: 0 } : { left: offsets[field] ?? 0 }),
          zIndex: 2,
          background: 'var(--ui-surface)',
        }
      : undefined;
  const displayCell = (row: any, column: any, summary = false) => {
    if (summary && renderSummaryCell) return renderSummaryCell(row, column);
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
  const headerLabel = (column: { field: string; label: string }) =>
    fc && view.sortFields?.[column.field] && onSort ? (
      <button
        type="button"
        className={css.sortHeader}
        onClick={() => onSort(view.sortFields[column.field])}
      >
        {column.label}{' '}
        {view.sortFields[column.field] === appliedFilters?.sort_field
          ? appliedFilters.sort_direction === 'desc'
            ? '↓'
            : '↑'
          : '↕'}
      </button>
    ) : (
      column.label
    );
  const rawTable = (
    <table
      ref={table}
      data-resizable={resizable || undefined}
      style={
        resizable
          ? {
              width: columns.reduce((sum: number, column: any) => sum + widthOf(column), 0),
              minWidth: 0,
            }
          : undefined
      }
      title={
        fc && view.id === 'inventory'
          ? '货龄分段按[0,30)、[30,60)、[60,90)、≥90天统计正库存批次，占比以该SKU正库存为分母'
          : undefined
      }
      className={
        fc
          ? `data-table ${view.id === 'replenishment' ? 'replenishment-table' : view.id === 'inventory' ? 'aging-table' : ''}`
          : undefined
      }
    >
      {resizable && (
        <colgroup>
          {columns.map((column: any) => (
            <col key={column.field} style={{ width: widthOf(column) }} />
          ))}
        </colgroup>
      )}
      {fc && view.id === 'base-resources' && (
        <caption>
          基地排产资源监控 · {filters.sku ? `SKU ${filters.sku}` : '按基地汇总'} · T～T+6
        </caption>
      )}
      <thead>
        <tr>
          {columns.map((c: any) => (
            <th
              key={c.field}
              data-field={c.field}
              data-column={c.field}
              draggable={fc}
              onDragStart={fc ? () => setDraggedColumn(c.field) : undefined}
              onDragOver={fc ? (event) => event.preventDefault() : undefined}
              onDrop={
                fc
                  ? (event) => {
                      event.preventDefault();
                      if (!draggedColumn || draggedColumn === c.field) return;
                      const next = chosenColumns.filter((field: string) => field !== draggedColumn);
                      next.splice(next.indexOf(c.field), 0, draggedColumn);
                      onColumns(next);
                      setDraggedColumn(null);
                    }
                  : undefined
              }
              scope="col"
              aria-label={resizable ? c.label : undefined}
              title={c.reason}
              style={{ ...fixedStyle(c.field), ...(resizable ? { width: widthOf(c) } : {}) }}
              aria-sort={
                fc && view.sortFields?.[c.field] === appliedFilters?.sort_field
                  ? appliedFilters.sort_direction === 'desc'
                    ? 'descending'
                    : 'ascending'
                  : undefined
              }
            >
              {resizable ? (
                <div className={css.columnHeader}>
                  <span>{headerLabel(c)}</span>
                  {view.columnFilters?.[c.field] && onColumnFilter && (
                    <ColumnFilterControl
                      label={c.label}
                      definition={view.columnFilters[c.field]}
                      values={appliedFilters ?? {}}
                      onApply={onColumnFilter}
                    />
                  )}
                </div>
              ) : (
                headerLabel(c)
              )}
              {resizable && (
                <ColumnResizeHandle
                  label={c.label}
                  width={widthOf(c)}
                  onResize={(width) => onColumnWidths?.({ ...columnWidths, [c.field]: width })}
                />
              )}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {result?.rows?.map((row: any, i: number) => (
          <React.Fragment key={getRowKey?.(row) ?? i}>
            <tr>
              {columns.map((c: any) => (
                <td key={c.field} data-column={c.field} style={fixedStyle(c.field)}>
                  {displayCell(row, c)}
                </td>
              ))}
            </tr>
            {renderRowDetails?.(row) && (
              <tr className="detail-row fc-expanded-row">
                <td colSpan={columns.length}>{renderRowDetails(row)}</td>
              </tr>
            )}
          </React.Fragment>
        ))}
      </tbody>
      {result?.tableSummary && !error && !loading && (
        <tfoot>
          <tr>
            {columns.map((column: any, index: number) => {
              const field = column.valueField ?? column.field;
              return (
                <td key={column.field} data-column={column.field} style={fixedStyle(column.field)}>
                  {index === 0 && (
                    <span>合计{Object.hasOwn(result.tableSummary, field) ? ' · ' : ''}</span>
                  )}
                  {Object.hasOwn(result.tableSummary, field)
                    ? displayCell(result.tableSummary, column, true)
                    : index === 0
                      ? null
                      : '-'}
                </td>
              );
            })}
          </tr>
        </tfoot>
      )}
    </table>
  );
  const data = ['available', 'empty'].includes(result?.status) ? result.rows : [];
  const BusinessTable = qll ? ChainTable : Table;
  const renderTable =
    fc || aqkc ? (
      <div className={fc ? 'table-scroll' : base.tableCard}>
        {rawTable}
        {!loading && !error && !data.length && (
          <p className={css.empty}>
            {emptyMessage}
            {fc && retry && (
              <button type="button" className="secondary-button" onClick={retry}>
                重新加载数据
              </button>
            )}
          </p>
        )}
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
  const quickFilters = view.filters
    .filter((f: any) => f.options && !f.hidden)
    .map((f: any) => (
      <div key={f.name} className={css.quickFilters} role="group" aria-label={f.label}>
        {f.options.map((option: any) =>
          f.multiple ? (
            <label key={option.value}>
              <input
                type="checkbox"
                checked={(appliedFilters?.[f.name] ?? '').split(',').includes(option.value)}
                onChange={(event) => {
                  const values = new Set(
                    (appliedFilters?.[f.name] ?? '').split(',').filter(Boolean),
                  );
                  if (event.target.checked) values.add(option.value);
                  else values.delete(option.value);
                  onQuickFilter(
                    f.name,
                    f.options
                      .map((item: any) => item.value)
                      .filter((value: string) => values.has(value))
                      .join(','),
                  );
                }}
              />
              {option.label}
            </label>
          ) : (
            <button
              type="button"
              key={option.value}
              aria-pressed={(appliedFilters?.[f.name] ?? '') === option.value}
              onClick={() => onQuickFilter(f.name, option.value)}
            >
              {option.label}
            </button>
          ),
        )}
      </div>
    ));

  return (
    <section className={css.list} aria-label={view.title} aria-busy={loading}>
      {fc && (
        <div className={css.quickBar}>
          {quickFilters}
          {quickFilterActions}
        </div>
      )}
      {(view.filters.length > 0 || fc) && (
        <LocalQueryForm
          className={`${fc ? 'panel-actions' : qll ? chain.referenceFilters : dealer.toolbar} ${css.toolbar} ${fc ? css.fcToolbar : qll ? css.qllToolbar : ''}`}
          data-business-filters={fc ? 'fc' : qll ? 'qll' : undefined}
          onSubmit={submit}
        >
          {view.filters
            .filter((f: any) => !f.options && !f.hidden)
            .map((f: any) => (
              <label key={f.name} className={fc ? css.filterField : undefined}>
                <span>{f.label}</span>
                {f.selectOptions ? (
                  <select
                    aria-label={f.label}
                    value={filters[f.name] ?? ''}
                    onChange={(event) => onFilter(f.name, event.target.value)}
                  >
                    <option value="">全部</option>
                    {f.selectOptions.map((value: string) => (
                      <option key={value}>{value}</option>
                    ))}
                  </select>
                ) : (
                  <Input
                    aria-label={f.label}
                    placeholder={f.placeholder ?? (fc ? `请输入${f.label}` : undefined)}
                    maxLength={100}
                    value={filters[f.name] ?? ''}
                    onChange={(value: string) => onFilter(f.name, value)}
                  />
                )}
              </label>
            ))}
          {!fc && quickFilters}
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
                  <div key={c.field} className={css.columnChoice}>
                    <label>
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
                    <label>
                      <input
                        type="checkbox"
                        aria-label={`冻结${c.label}`}
                        checked={frozen.includes(c.field)}
                        disabled={!chosenColumns.includes(c.field)}
                        onChange={(event) =>
                          setFrozen((old) =>
                            event.target.checked
                              ? [...old, c.field]
                              : old.filter((field) => field !== c.field),
                          )
                        }
                      />
                      冻结
                    </label>
                    {['上移', '下移'].map((label, direction) => {
                      const index = chosenColumns.indexOf(c.field),
                        nextIndex = index + (direction ? 1 : -1);
                      return (
                        <button
                          type="button"
                          key={label}
                          aria-label={`${label}${c.label}`}
                          disabled={index < 0 || nextIndex < 0 || nextIndex >= chosenColumns.length}
                          onClick={() => {
                            const next = [...chosenColumns];
                            [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
                            onColumns(next);
                          }}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                ))}
                <Button
                  size="small"
                  onClick={() => {
                    onColumns(view.defaultColumns ?? view.columns.map((c: any) => c.field));
                    setFrozen(['sku', 'material_name', 'missing_actualQty']);
                  }}
                >
                  恢复默认顺序
                </Button>
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
          result?.supplementaryError
            ? `${result.supplementaryError.message}（${result.supplementaryError.code}）`
            : '',
        ].filter(Boolean)}
        scope={agentId}
      />
      {result?.unavailableLabels?.length > 0 && (
        <p role="status" className={css.empty}>
          当前账号部分展示字段未获返回权限：
          {result.unavailableLabels
            .map((field: string) => optionalLabelNames[field] ?? field)
            .join('、')}
          。已授权的数据仍可查看，缺失字段不代表零值。
        </p>
      )}
      {result?.status === 'select_customer' ? (
        <p className={css.empty}>请选择客户。</p>
      ) : result?.status === 'select_sku' ? (
        <p className={css.empty}>请输入SKU后查询基地资源。</p>
      ) : fc && ['SUMMARY_NOT_AVAILABLE', 'SUMMARY_SCOPE_NOT_COVERED'].includes(error?.code) ? (
        <p className={css.empty}>-</p>
      ) : fc && error ? (
        <div role="alert" className={css.empty}>
          <p>该列表读取失败：{error.message}</p>
          {retry && (
            <button type="button" className="secondary-button" onClick={retry}>
              重新加载数据
            </button>
          )}
        </div>
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
