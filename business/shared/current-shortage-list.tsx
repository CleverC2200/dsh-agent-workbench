import { useEffect, useState } from 'react';
import type { AgentSqlConfig } from './sql-config';
import { readCurrentShortage } from './current-shortage';
import { LocalQueryForm } from './local-query-form';
import common from './restored-workbench.module.css';

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
  onRead,
}: {
  config: AgentSqlConfig;
  revision?: number;
  onRead?: (value: unknown) => void;
}) {
  const [filters, setFilters] = useState({ base: '', warehouse_code: '', sku: '' });
  const [draft, setDraft] = useState(filters),
    [page, setPage] = useState(1),
    [result, setResult] = useState<{ rows: Array<Record<string, unknown>>; total: number } | null>(
      null,
    ),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setBusy(true);
    setResult(null);
    readCurrentShortage(config, 'current-shortage.detail', filters, {
      signal: controller.signal,
      page,
    })
      .then((value) => {
        if (!controller.signal.aborted) {
          setResult(value);
          onRead?.({
            status: 'available',
            viewId: 'current-shortage',
            rows: value.rows,
            total: value.total,
            page,
            pageSize: 10,
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
  }, [config, filters, page, revision]);
  return (
    <section className={common.root} aria-busy={busy}>
      <LocalQueryForm
        className={`${common.controls} ${common.shortageControls}`}
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          setFilters({ ...draft });
        }}
      >
        {(
          [
            ['base', '基地'],
            ['warehouse_code', '分仓编码'],
            ['sku', 'SKU'],
          ] as const
        )
          .filter(([key]) => config.agentId !== 'inventory-aqkc' || key !== 'warehouse_code')
          .map(([key, label]) => (
            <label key={key}>
              {label}
              <input
                aria-label={label}
                value={draft[key]}
                onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
              />
            </label>
          ))}
        <button>查询</button>
        <button
          type="button"
          onClick={() => {
            setDraft({ base: '', warehouse_code: '', sku: '' });
            setFilters({ base: '', warehouse_code: '', sku: '' });
            setPage(1);
          }}
        >
          清空筛选
        </button>
      </LocalQueryForm>
      <div style={{ overflowX: 'auto' }}>
        <table className={common.currentShortageTable}>
          <thead>
            <tr>
              {columns
                .filter(([key]) => config.agentId !== 'inventory-aqkc' || key !== 'warehouse_code')
                .map(([key, label]) => (
                  <th key={key}>{label}</th>
                ))}
            </tr>
          </thead>
          <tbody>
            {result?.rows.map((row, index) => (
              <tr key={JSON.stringify([row.location_type, row.location_code, row.sku, index])}>
                {columns
                  .filter(
                    ([key]) => config.agentId !== 'inventory-aqkc' || key !== 'warehouse_code',
                  )
                  .map(([key]) => (
                    <td key={key}>
                      {row[key] == null
                        ? '-'
                        : ['demand', 'allocated', 'remaining', 'available', 'shortage'].includes(
                              key,
                            ) && Number.isFinite(Number(row[key]))
                          ? Number(row[key]).toLocaleString('zh-CN', { maximumFractionDigits: 2 })
                          : String(row[key])}
                    </td>
                  ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!result?.rows.length && <p>{busy ? '加载中…' : '暂无数据'}</p>}
      <div className={common.controls}>
        <span>共 {result?.total ?? '-'} 条，每页 10 条</span>
        <button disabled={busy || page === 1} onClick={() => setPage((p) => p - 1)}>
          上一页
        </button>
        <span>第 {page} 页</span>
        <button
          disabled={busy || !result || page * 10 >= result.total}
          onClick={() => setPage((p) => p + 1)}
        >
          下一页
        </button>
      </div>
    </section>
  );
}
