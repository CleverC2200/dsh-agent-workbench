'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Table as NativeTable, type TableProps } from '../../../dsh-ui/controls';
import styles from './viewport-table.module.css';

/** Keep the horizontal control within the table's visible scroll panel. */
export function Table<T>(props: TableProps<T>) {
  const root = useRef<HTMLDivElement>(null);
  const proxy = useRef<HTMLInputElement>(null);
  const source = useRef<HTMLElement | null>(null);
  const [geometry, setGeometry] = useState<{
    left: number;
    top: number;
    width: number;
    content: number;
    modal: boolean;
  } | null>(null);

  useEffect(() => {
    const host = root.current!;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const body = host.querySelector<HTMLElement>('.dsh-table-body, .dsh-table-content-inner');
      // With fixed headers the body, not content-inner, owns scrollLeft.
      source.current = host.querySelector<HTMLElement>('.dsh-table-body') ?? body;
      const target = source.current;
      const modal = !!host.closest('.dsh-modal');
      const covered =
        !modal &&
        [...document.querySelectorAll<HTMLElement>('.dsh-modal-wrapper, .dsh-drawer-wrapper')].some(
          (overlay) =>
            overlay.getClientRects().length && getComputedStyle(overlay).visibility !== 'hidden',
        );
      if (!target || !host.getClientRects().length || covered) {
        setGeometry(null);
        return;
      }
      const rect = target.getBoundingClientRect();
      const viewport = window.visualViewport;
      let left = viewport?.offsetLeft ?? 0,
        right = left + (viewport?.width ?? innerWidth);
      let top = viewport?.offsetTop ?? 0,
        bottom = top + (viewport?.height ?? innerHeight);
      for (let parent = host.parentElement; parent; parent = parent.parentElement) {
        const style = getComputedStyle(parent),
          bounds = parent.getBoundingClientRect();
        if (/(auto|scroll|hidden|clip)/.test(style.overflowY)) {
          top = Math.max(top, bounds.top);
          bottom = Math.min(bottom, bounds.bottom);
        }
        if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) {
          left = Math.max(left, bounds.left);
          right = Math.min(right, bounds.right);
        }
      }
      left = Math.max(left, rect.left);
      right = Math.min(right, rect.right);
      // Handoff when the top of the native scrollbar enters view, not its bottom.
      // Overlay scrollbars do not reduce clientHeight; reserve their hit area too.
      const scrollbarHeight = Math.max(
        8,
        target.offsetHeight - target.clientHeight - target.clientTop * 2,
      );
      const nativeBarTop = rect.bottom - scrollbarHeight;
      const visible =
        target.scrollWidth > target.clientWidth + 1 &&
        rect.top < bottom - 32 &&
        nativeBarTop > bottom + 1 &&
        rect.bottom > top &&
        right > left;
      const next = visible
        ? {
            left,
            top: bottom - 8,
            width: right - left,
            content: target.scrollWidth - target.clientWidth + right - left,
            modal,
          }
        : null;
      setGeometry((previous) =>
        JSON.stringify(previous) === JSON.stringify(next) ? previous : next,
      );
      if (proxy.current && Math.abs(Number(proxy.current.value) - target.scrollLeft) > 1)
        proxy.current.value = String(target.scrollLeft);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    const resize = new ResizeObserver(schedule);
    resize.observe(host);
    for (let parent = host.parentElement; parent; parent = parent.parentElement)
      resize.observe(parent);
    const mutation = new MutationObserver(schedule);
    mutation.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'hidden'],
    });
    document.addEventListener('scroll', schedule, true);
    window.addEventListener('resize', schedule);
    window.visualViewport?.addEventListener('resize', schedule);
    window.visualViewport?.addEventListener('scroll', schedule);
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      mutation.disconnect();
      document.removeEventListener('scroll', schedule, true);
      window.removeEventListener('resize', schedule);
      window.visualViewport?.removeEventListener('resize', schedule);
      window.visualViewport?.removeEventListener('scroll', schedule);
    };
  }, []);

  useEffect(() => {
    if (proxy.current && source.current) proxy.current.value = String(source.current.scrollLeft);
  }, [geometry]);

  return (
    <div ref={root} className={styles.root} data-viewport-table>
      <NativeTable<T>
        {...props}
        onRow={
          props.onRow
            ? (row: T, index: number) => {
                const events = props.onRow(row, index);
                return { ...events, 'data-interactive-row': events?.onClick ? 'true' : undefined };
              }
            : undefined
        }
      />
      {geometry &&
        createPortal(
          <div
            className={styles.scrollbar}
            role="region"
            aria-label="表格横向滚动条"
            style={{
              left: geometry.left,
              top: geometry.top,
              width: geometry.width,
              zIndex: geometry.modal ? 1050 : 20,
            }}
          >
            <input
              ref={proxy}
              type="range"
              min={0}
              max={geometry.content - geometry.width}
              step={1}
              defaultValue={0}
              aria-label="表格横向滚动"
              style={
                {
                  '--thumb-width': `${Math.min(geometry.width, Math.max(24, (geometry.width * geometry.width) / geometry.content))}px`,
                } as CSSProperties
              }
              onKeyDown={(event) => {
                const target = source.current;
                if (!target) return;
                const max = target.scrollWidth - target.clientWidth;
                const page = target.clientWidth * 0.8;
                const next = (
                  {
                    ArrowLeft: target.scrollLeft - 40,
                    ArrowRight: target.scrollLeft + 40,
                    PageUp: target.scrollLeft - page,
                    PageDown: target.scrollLeft + page,
                    Home: 0,
                    End: max,
                  } as Record<string, number>
                )[event.key];
                if (next == null) return;
                event.preventDefault();
                target.scrollLeft = Math.max(0, Math.min(max, next));
                event.currentTarget.value = String(target.scrollLeft);
              }}
              onInput={(event) => {
                if (source.current) source.current.scrollLeft = Number(event.currentTarget.value);
              }}
            />
          </div>,
          document.body,
        )}
    </div>
  );
}
