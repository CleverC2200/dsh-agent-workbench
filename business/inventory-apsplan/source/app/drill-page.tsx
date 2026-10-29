import { useState, type ReactNode } from 'react';

/** Render only the visible leaf rows; aggregate cards still use the complete snapshot. */
export function DrillPage({
  rows,
  children,
}: {
  rows: readonly string[];
  children: (value: string, index: number) => ReactNode;
}) {
  const [requestedPage, setPage] = useState(1);
  const pages = Math.max(1, Math.ceil(rows.length / 10));
  const page = Math.min(requestedPage, pages);
  const offset = (page - 1) * 10;
  return (
    <>
      {rows.slice(offset, offset + 10).map((value, index) => children(value, offset + index))}
      {rows.length > 10 && (
        <nav className="aps-drill-pagination" aria-label="物料组分页">
          <span>共 {rows.length} 条 · 10 条/页</span>
          <button type="button" disabled={page === 1} onClick={() => setPage(page - 1)}>
            上一页
          </button>
          <span>
            {page} / {pages}
          </span>
          <button type="button" disabled={page === pages} onClick={() => setPage(page + 1)}>
            下一页
          </button>
        </nav>
      )}
    </>
  );
}
