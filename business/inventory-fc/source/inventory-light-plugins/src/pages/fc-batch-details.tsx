import React, { useEffect, useState } from 'react';
import { z } from 'zod';
import { createAgentQueries } from '../../../../../shared/agent-query';
import { unpackAtomicPage } from '../../../../../shared/atomic-page';
import type { AgentSqlConfig } from '../../../../../shared/sql-config';
import { PlanPagination } from '../../../../../shared/plan-pagination';

const number = z
  .union([
    z.number().finite(),
    z.string().trim().min(1).transform(Number).pipe(z.number().finite()),
  ])
  .nullable();
const rowSchema = z.object({
  warehouse_code: z.string(),
  sku: z.string(),
  production_date: z.string().nullable(),
  quantity: number,
  available_qty: number,
  base: z.string().optional(),
});
type Batch = z.infer<typeof rowSchema>;
type State =
  | { kind: 'loading' }
  | { kind: 'failed'; message: string }
  | { kind: 'ready'; rows: Batch[]; total: number };
const date = (value: string) => {
  const day = /^\d{8}$/.test(value)
    ? `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`
    : value.slice(0, 10);
  return z.string().date().safeParse(day).success ? day : null;
};
const qty = (value: number | null) =>
  value === null ? '-' : value.toLocaleString('zh-CN', { maximumFractionDigits: 3 });
export function FcBatchDetails({
  config,
  warehouse,
  sku,
  snapshot,
  base,
}: {
  config: AgentSqlConfig;
  sku: string;
  snapshot: string;
} & ({ warehouse: string; base?: never } | { base: string; warehouse?: never })) {
  const [page, setPage] = useState(1);
  const [revision, retry] = useState(0);
  const [state, setState] = useState<State>({ kind: 'loading' });
  useEffect(() => {
    const controller = new AbortController();
    setState({ kind: 'loading' });
    void (async () => {
      const day = date(snapshot);
      if (!day) throw Error('库存快照日期无效，请重新加载货龄列表');
      const result = await createAgentQueries(config).read(
        base ? 'base-batches.page' : 'branch-batches.page',
        {
          ...(base ? { base } : { warehouse_code: warehouse }),
          sku,
          stat_date: day.replaceAll('-', ''),
          page_size: 10,
          offset: (page - 1) * 10,
        },
        {
          signal: controller.signal,
          requiredColumns:
            config.queries[base ? 'base-batches.page' : 'branch-batches.page'].resultColumns,
        },
      );
      const data = unpackAtomicPage(result, page, 10),
        rows = z.array(rowSchema).parse(data.rows);
      if (
        rows.some(
          (row) => (base ? row.base !== base : row.warehouse_code !== warehouse) || row.sku !== sku,
        )
      )
        throw Error('批次返回范围不一致');
      if (!controller.signal.aborted) setState({ kind: 'ready', rows, total: data.total });
    })().catch((error: unknown) => {
      if (!controller.signal.aborted)
        setState({
          kind: 'failed',
          message: error instanceof Error ? error.message : '批次读取失败',
        });
    });
    return () => controller.abort();
  }, [config, warehouse, base, sku, snapshot, page, revision]);
  return (
    <section aria-label={`${sku}库存批次`}>
      <strong>库存批次明细 · {sku}</strong>
      {state.kind === 'loading' ? (
        <p role="status">批次加载中…</p>
      ) : state.kind === 'failed' ? (
        <p role="alert">
          {state.message}{' '}
          <button type="button" onClick={() => retry((x) => x + 1)}>
            重新读取批次
          </button>
        </p>
      ) : (
        <>
          <table className="data-table">
            <thead>
              <tr>
                {[
                  ...(base ? ['仓库编码'] : []),
                  '生产日期',
                  '库存量（件）',
                  '可用库存（件）',
                  '货龄（天）',
                ].map((label) => (
                  <th key={label}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {state.rows.map((row, index) => {
                const produced = row.production_date ? date(row.production_date) : null,
                  at = date(snapshot);
                const age =
                  produced && at && row.quantity !== null && row.quantity > 0
                    ? Math.max(0, Math.round((Date.parse(at) - Date.parse(produced)) / 86400000))
                    : null;
                return (
                  <tr key={index}>
                    {base && <td>{row.warehouse_code}</td>}
                    <td>{produced ?? row.production_date ?? '-'}</td>
                    <td>{qty(row.quantity)}</td>
                    <td>{qty(row.available_qty)}</td>
                    <td>{age ?? '-'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!state.rows.length && <p>暂无该快照的批次数据。</p>}
          <PlanPagination
            ariaLabel="库存批次分页"
            totalCount={state.total}
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
