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
  order_no: z.string(),
  order_status: z.string().nullable(),
  demand_qty: number,
  allocated_qty: number,
  shipped_qty: number,
  pending_qty: number,
  in_transit_qty: number,
  source_snapshot: z.string(),
});
type Row = z.infer<typeof rowSchema>;
type State =
  | { kind: 'loading' }
  | { kind: 'failed'; message: string }
  | { kind: 'ready'; rows: Row[]; total: number; quantity: number | null };
const qty = (value: number | null) =>
  value === null ? '-' : value.toLocaleString('zh-CN', { maximumFractionDigits: 3 });
export function FcTransferDetails({
  config,
  warehouse,
  sku,
  expected,
}: {
  config: AgentSqlConfig;
  warehouse: string;
  sku: string;
  expected: number | null;
}) {
  const [page, setPage] = useState(1),
    [revision, retry] = useState(0),
    [state, setState] = useState<State>({ kind: 'loading' });
  useEffect(() => {
    const c = new AbortController();
    setState({ kind: 'loading' });
    void createAgentQueries(config)
      .read(
        'branch-transfers.page',
        { warehouse_code: warehouse, sku, page_size: 10, offset: (page - 1) * 10 },
        {
          signal: c.signal,
          requiredColumns: config.queries['branch-transfers.page'].resultColumns,
        },
      )
      .then((result) => {
        const data = unpackAtomicPage(result, page, 10),
          rows = z.array(rowSchema).parse(data.rows),
          quantity = number.parse(result.rows[0]?.detail_qty ?? null);
        if (!c.signal.aborted) setState({ kind: 'ready', rows, total: data.total, quantity });
      })
      .catch((error: unknown) => {
        if (!c.signal.aborted)
          setState({
            kind: 'failed',
            message: error instanceof Error ? error.message : '调拨明细读取失败',
          });
      });
    return () => c.abort();
  }, [config, warehouse, sku, page, revision]);
  return (
    <section aria-label={`${sku}调拨订单明细`}>
      <p>
        调拨中汇总：{qty(expected)}
        {expected === null ? '' : '件'}
      </p>
      {state.kind === 'loading' ? (
        <p role="status">调拨明细加载中…</p>
      ) : state.kind === 'failed' ? (
        <p role="alert">
          {state.message}{' '}
          <button type="button" onClick={() => retry((x) => x + 1)}>
            重新读取调拨明细
          </button>
        </p>
      ) : (
        <>
          <p>
            明细合计：{qty(state.quantity)}
            {state.quantity === null ? '' : '件'}；同步时间：{state.rows[0]?.source_snapshot ?? '-'}
          </p>
          {expected !== null &&
            state.quantity !== null &&
            Math.abs(expected - state.quantity) > 0.0001 && (
              <p role="alert">调拨明细与当前汇总不一致，请核对同步时间。</p>
            )}
          <table className="data-table">
            <thead>
              <tr>
                {['订单号', '状态', '需求量', '占用量', '已发量', '未发量', '在途量'].map((x) => (
                  <th key={x}>{x}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {state.rows.map((row, i) => (
                <tr key={i}>
                  <td>{row.order_no}</td>
                  <td>{row.order_status ?? '-'}</td>
                  {[
                    row.demand_qty,
                    row.allocated_qty,
                    row.shipped_qty,
                    row.pending_qty,
                    row.in_transit_qty,
                  ].map((n, i) => (
                    <td key={i}>{qty(n)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {!state.rows.length && <p>当前发布批次没有该分仓SKU的未完成调拨订单。</p>}
          <PlanPagination
            ariaLabel="调拨明细分页"
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
