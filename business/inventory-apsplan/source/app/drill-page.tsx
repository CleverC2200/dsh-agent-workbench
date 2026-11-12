import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { PlanPagination } from '../../../shared/plan-pagination';

export function DrillPage({
  rows,
  children,
}: {
  rows: readonly string[];
  children: (value: string, index: number) => ReactNode;
}) {
  const [requestedPage, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const page = Math.min(requestedPage, pages);
  const offset = (page - 1) * pageSize;
  const footer = useRef<HTMLDivElement>(null);
  const paged = rows.length > 10;
  useLayoutEffect(() => {
    const element = footer.current;
    const table = element?.closest<HTMLElement>('.category-drill-table');
    if (!element || !table) return;

    const align = () => {
      element.style.width = `${table.clientWidth}px`;
      element.style.transform = `translateX(${table.scrollLeft}px)`;
    };
    align();
    const observer = new ResizeObserver(align);
    observer.observe(table);
    table.addEventListener('scroll', align, { passive: true });
    return () => {
      observer.disconnect();
      table.removeEventListener('scroll', align);
    };
  }, [paged]);
  return (
    <>
      {rows.slice(offset, offset + pageSize).map((value, index) => children(value, offset + index))}
      {paged && (
        <div ref={footer} className="aps-drill-pagination">
          <PlanPagination
            ariaLabel="物料组分页"
            totalCount={rows.length}
            page={page}
            pageSize={pageSize}
            loading={false}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
          />
        </div>
      )}
    </>
  );
}
