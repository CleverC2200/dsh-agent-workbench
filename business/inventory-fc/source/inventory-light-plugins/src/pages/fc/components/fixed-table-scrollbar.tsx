'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { scrollbarGeometry } from '../../../../../fc/src/lib/table-scrollbar.ts';

/** A viewport-bottom horizontal scrollbar for the active business table. */
export function FixedTableScrollbar({
  viewKey,
  boundary = '.workspace',
  selector = '.table-scroll',
  layer = 40,
}: {
  viewKey: string;
  boundary?: string;
  selector?: string;
  layer?: number;
}) {
  const anchor = useRef<HTMLSpanElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const target = useRef<HTMLElement | null>(null);
  const [geometry, setGeometry] = useState({
    left: 0,
    width: 0,
    bottom: 0,
    maxScroll: 0,
    visible: false,
  });
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const host = anchor.current?.parentElement;
    const workspace = host?.closest<HTMLElement>(boundary);
    if (!host || !workspace) return;
    let frame = 0;
    let observed: Element | null = null;
    let observedTable: Element | null = null;
    const update = () => {
      frame = 0;
      const viewport = { width: window.innerWidth, height: window.innerHeight };
      const bounds = workspace.getBoundingClientRect();
      // Only bind visible overflowing tables; a prior answer may contain an offscreen table.
      const table = Array.from(host.querySelectorAll<HTMLElement>(selector)).find(
        (element) =>
          scrollbarGeometry(
            element.getBoundingClientRect(),
            bounds,
            viewport,
            element.clientWidth,
            element.scrollWidth,
          ).visible,
      );
      target.current = table ?? null;
      if (!table) {
        setGeometry((old) => (old.visible ? { ...old, visible: false } : old));
        return;
      }
      if (observed !== table) {
        if (observed) resize.unobserve(observed);
        observed = table;
        resize.observe(table);
      }
      const content = table.querySelector('table');
      if (content !== observedTable) {
        if (observedTable) resize.unobserve(observedTable);
        observedTable = content;
        if (content) resize.observe(content);
      }
      const next = scrollbarGeometry(
        table.getBoundingClientRect(),
        bounds,
        viewport,
        table.clientWidth,
        table.scrollWidth,
      );
      setGeometry((old) =>
        Object.keys(next).every(
          (key) => next[key as keyof typeof next] === old[key as keyof typeof old],
        )
          ? old
          : next,
      );
      if (bar.current && Math.abs(bar.current.scrollLeft - table.scrollLeft) > 1)
        bar.current.scrollLeft = table.scrollLeft;
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    const resize = new ResizeObserver(schedule);
    resize.observe(workspace);
    resize.observe(host);
    const mutation = new MutationObserver(schedule);
    mutation.observe(host, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, {
      capture: true,
      passive: true,
    });
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      mutation.disconnect();
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule, true);
      target.current = null;
    };
  }, [viewKey, boundary, selector]);

  useEffect(() => {
    if (bar.current && target.current) bar.current.scrollLeft = target.current.scrollLeft;
  }, [geometry]);

  return (
    <>
      <span ref={anchor} hidden />
      {mounted &&
        geometry.visible &&
        createPortal(
          <div
            ref={bar}
            className="fixed-table-scrollbar"
            role="region"
            aria-label="列表横向滚动条"
            tabIndex={0}
            style={{
              left: geometry.left,
              width: geometry.width,
              bottom: geometry.bottom,
              zIndex: layer,
            }}
            onScroll={(event) => {
              if (
                target.current &&
                Math.abs(target.current.scrollLeft - event.currentTarget.scrollLeft) > 1
              )
                target.current.scrollLeft = event.currentTarget.scrollLeft;
            }}
          >
            <div style={{ width: geometry.width + geometry.maxScroll, height: 1 }} />
          </div>,
          document.body,
        )}
    </>
  );
}
