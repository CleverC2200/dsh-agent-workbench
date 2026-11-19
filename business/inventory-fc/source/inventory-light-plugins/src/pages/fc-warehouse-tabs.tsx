import { useEffect, useRef, useState } from 'react';
import type { FcWarehouse } from './fc-warehouse-directory';
import { fcWarehouseStatus } from './fc-warehouse-presentation';

export function FcWarehouseTabs({
  rows,
  value,
  onChange,
  loading,
  all,
}: {
  rows: FcWarehouse[];
  value: string;
  onChange: (value: string) => void;
  loading: boolean;
  all: boolean;
}) {
  const list = useRef<HTMLElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  useEffect(() => {
    const element = list.current;
    if (!element) return;
    const measure = () =>
      setEdges({
        left: element.scrollLeft > 1,
        right: element.scrollLeft + element.clientWidth < element.scrollWidth - 1,
      });
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    element.addEventListener('scroll', measure);
    measure();
    return () => {
      observer.disconnect();
      element.removeEventListener('scroll', measure);
    };
  }, [rows.length]);
  useEffect(() => {
    list.current
      ?.querySelector('[aria-current="page"]')
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [value, rows.length]);
  const scroll = (direction: number) =>
    list.current?.scrollBy({
      left: direction * list.current.clientWidth * 0.75,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'instant'
        : 'smooth',
    });
  return (
    <div className="fc-warehouse-row">
      <span className="fc-warehouse-caption">
        分仓{' '}
        <small>
          {all ? '全部' : '已选'} {rows.length}
        </small>
      </span>
      <button
        type="button"
        className="fc-warehouse-scroll"
        aria-label="向左滚动分仓"
        disabled={!edges.left}
        onClick={() => scroll(-1)}
      >
        ‹
      </button>
      <nav ref={list} className="fc-warehouse-chips" aria-label="操作分仓">
        {rows.map((row) => (
          <button
            type="button"
            key={row.warehouse_code}
            aria-current={row.warehouse_code === value ? 'page' : undefined}
            onClick={() => onChange(row.warehouse_code)}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              aria-hidden="true"
            >
              <path d="M3 10 12 3l9 7v11H3zM7 21V11h10v10M7 15h10" />
            </svg>
            {row.warehouse_name || row.warehouse_code}
            {fcWarehouseStatus(row.warehouse_code) && (
              <span className="warehouse-select-status">
                {fcWarehouseStatus(row.warehouse_code)}
              </span>
            )}
          </button>
        ))}
        {!rows.length && <span role="status">{loading ? '分仓加载中…' : '暂无可操作分仓'}</span>}
      </nav>
      <button
        type="button"
        className="fc-warehouse-scroll"
        aria-label="向右滚动分仓"
        disabled={!edges.right}
        onClick={() => scroll(1)}
      >
        ›
      </button>
    </div>
  );
}
