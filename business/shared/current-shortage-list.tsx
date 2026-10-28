import { useEffect, useState, type FormEvent } from 'react';
import type { AgentSqlConfig } from './sql-config';
import { readCurrentShortage } from './current-shortage';
import { OriginalBusinessList } from './original-business-list';

const columns = [
  ['base', '基地'],
  ['warehouse_code', '分仓编码'],
  ['location_name', '地点'],
  ['sku', 'SKU'],
  ['material_name', '商品'],
  ['demand', '需求量（箱）'],
  ['allocated', '订单占用（箱）'],
  ['remaining', '还需满足（箱）'],
  ['available', '可用库存（箱）'],
  ['shortage', '缺货量（箱）'],
];
export function CurrentShortageList({
  config,
  revision = 0,
  initialFilters = {},
  warehouseCode,
  onRead,
}: {
  config: AgentSqlConfig;
  revision?: number;
  warehouseCode?: string;
  initialFilters?: Partial<{ base: string; warehouse_code: string; sku: string }>;
  onRead?: (value: unknown) => void;
}) {
  const [filters, setFilters] = useState({
    base: '',
    warehouse_code: '',
    sku: '',
    ...initialFilters,
  });
  const [draft, setDraft] = useState(filters),
    [page, setPage] = useState(1),
    [pageSize, setPageSize] = useState(10),
    [result, setResult] = useState<{ rows: Array<Record<string, unknown>>; total: number } | null>(
      null,
    ),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setBusy(true);
    setResult(null);
    readCurrentShortage(
      config,
      'current-shortage.detail',
      { ...filters, ...(warehouseCode ? { warehouse_code: warehouseCode } : {}) },
      {
        signal: controller.signal,
        page,
        pageSize,
      },
    )
      .then((value) => {
        if (!controller.signal.aborted) {
          setResult(value);
          onRead?.({
            status: 'available',
            viewId: 'current-shortage',
            rows: value.rows,
            total: value.total,
            page,
            pageSize,
            rowScope: 'current_server_page',
            currentState: true,
            calculation: 'order_then_pool_sku_then_sum',
            source: 'GEA_SQL_CONFIGURED',
            configVersion: value.configVersion,
          });
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setResult(null);
          onRead?.({
            status: 'failed',
            viewId: 'current-shortage',
            rows: [],
            error: error.message,
            code: error.code,
          });
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [config, filters, page, pageSize, revision, warehouseCode]);
  const allColumns = columns
    .filter(([key]) => config.agentId !== 'inventory-aqkc' || key !== 'warehouse_code')
    .map(([field, label]) => ({
      field,
      label: ['inventory-fc', 'inventory-qll'].includes(config.agentId)
        ? label.replace('（箱）', '（件）')
        : label,
    }));
  const [chosenColumns, setChosenColumns] = useState(() => columns.map(([key]) => key));
  return (
    <OriginalBusinessList
      agentId={config.agentId}
      view={{
        id: 'current-shortage',
        title: config.agentId === 'inventory-fc' ? '当前订单' : '订单缺口',
        columns: allColumns,
        filters: [
          { name: 'base', label: '基地' },
          { name: 'warehouse_code', label: '分仓编码' },
          { name: 'sku', label: 'SKU' },
        ].filter(
          (field) =>
            (config.agentId !== 'inventory-fc' || field.name !== 'base') &&
            (!warehouseCode || field.name !== 'warehouse_code'),
        ),
      }}
      columns={allColumns.filter((column) => chosenColumns.includes(column.field))}
      chosenColumns={chosenColumns}
      onColumns={setChosenColumns}
      filters={draft}
      onFilter={(name: string, value: string) =>
        setDraft((current) => ({ ...current, [name]: value }))
      }
      submit={(event: FormEvent) => {
        event.preventDefault();
        setPage(1);
        setFilters({ ...draft });
      }}
      reset={() => {
        setDraft({ base: '', warehouse_code: '', sku: '' });
        setFilters({ base: '', warehouse_code: '', sku: '' });
        setPage(1);
      }}
      result={result ? { ...result, status: result.rows.length ? 'available' : 'empty' } : null}
      loading={busy}
      page={page}
      pageSize={pageSize}
      onPage={setPage}
      onPageSize={(size: number) => {
        setPageSize(size);
        setPage(1);
      }}
      renderCell={(row: Record<string, unknown>, column: { field: string }) => {
        const value = row[column.field];
        return value == null
          ? '-'
          : ['demand', 'allocated', 'remaining', 'available', 'shortage'].includes(column.field) &&
              Number.isFinite(Number(value))
            ? Number(value).toLocaleString('zh-CN', { maximumFractionDigits: 2 })
            : String(value);
      }}
    />
  );
}
