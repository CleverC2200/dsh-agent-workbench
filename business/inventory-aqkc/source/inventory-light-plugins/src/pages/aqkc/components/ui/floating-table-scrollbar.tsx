"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./floating-table-scrollbar.module.css";

type Placement = {
  left: number;
  top: number;
  width: number;
  contentWidth: number;
};

/** Share the visible table's horizontal position with a viewport-bottom scrollbar. */
export function FloatingTableScrollbar({
  bottomInset = 0,
}: {
  bottomInset?: number;
}) {
  const anchor = useRef<HTMLSpanElement>(null);
  const scrollbar = useRef<HTMLInputElement>(null);
  const target = useRef<HTMLElement | null>(null);
  const [placement, setPlacement] = useState<Placement | null>(null);

  useEffect(() => {
    const root = anchor.current?.parentElement;
    if (!root) return;
    let frame = 0;
    let containers: HTMLElement[] = [];
    let preferred: HTMLElement | null = null;
    const measure = () => {
      frame = 0;
      const bounds = root.getBoundingClientRect();
      let bottom = Math.min(window.innerHeight, bounds.bottom) - bottomInset;
      let top = Math.max(0, bounds.top);
      let viewportLeft = Math.max(0, bounds.left);
      let viewportRight = Math.min(window.innerWidth, bounds.right);
      for (
        let parent = root.parentElement;
        parent;
        parent = parent.parentElement
      ) {
        const css = getComputedStyle(parent);
        const clip = parent.getBoundingClientRect();
        if (/(auto|scroll|hidden|clip)/.test(css.overflowX)) {
          viewportLeft = Math.max(viewportLeft, clip.left);
          viewportRight = Math.min(viewportRight, clip.right);
        }
        if (/(auto|scroll|hidden|clip)/.test(css.overflowY)) {
          top = Math.max(top, clip.top);
          bottom = Math.min(bottom, clip.bottom);
        }
      }
      let selected: HTMLElement | null = null;
      let next: Placement | null = null;
      for (const container of containers) {
        const rect = container.getBoundingClientRect();
        // Native and floating tracks share explicit styling, including on macOS.
        if (
          container.scrollWidth <= container.clientWidth + 1 ||
          rect.top >= bottom - 24 ||
          rect.bottom <= top ||
          bottom <= top
        )
          continue;
        let left = Math.max(viewportLeft, rect.left);
        let right = Math.min(viewportRight, rect.right);
        let visibleTop = Math.max(top, rect.top);
        let visibleBottom = bottom;
        // Nested drill-down tables may also be clipped by an outer table.
        for (
          let parent = container.parentElement;
          parent && parent !== root;
          parent = parent.parentElement
        ) {
          const css = getComputedStyle(parent);
          const clip = parent.getBoundingClientRect();
          if (/(auto|scroll|hidden|clip)/.test(css.overflowX)) {
            left = Math.max(left, clip.left);
            right = Math.min(right, clip.right);
          }
          if (/(auto|scroll|hidden|clip)/.test(css.overflowY)) {
            visibleTop = Math.max(visibleTop, clip.top);
            visibleBottom = Math.min(visibleBottom, clip.bottom);
          }
        }
        if (
          right - left < 48 ||
          visibleTop >= visibleBottom - 24 ||
          rect.bottom <= visibleTop
        )
          continue;
        selected = container;
        // Once the native track is fully visible, do not render a second track.
        next =
          rect.bottom <= visibleBottom
            ? null
            : {
                left,
                top: visibleBottom - 8,
                width: right - left,
                contentWidth:
                  container.scrollWidth - container.clientWidth + right - left,
              };
        if (container === preferred) break;
      }
      target.current = selected;
      setPlacement((previous) =>
        JSON.stringify(previous) === JSON.stringify(next) ? previous : next,
      );
      if (scrollbar.current && selected)
        scrollbar.current.value = String(selected.scrollLeft);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    const selectTable = (event: Event) => {
      if (!(event.target instanceof Element)) return;
      // Prefer the innermost overflowing table the user points at or focuses.
      const element = event.target;
      preferred =
        containers
          .filter(
            (container) =>
              container.contains(element) &&
              container.scrollWidth > container.clientWidth + 1,
          )
          .at(-1) ?? preferred;
      cancelAnimationFrame(frame);
      measure();
    };
    const resize = new ResizeObserver(schedule);
    const discover = () => {
      const found = new Set<HTMLElement>();
      for (const table of root.querySelectorAll(
        "table:not([aria-hidden='true'])",
      )) {
        for (
          let parent = table.parentElement;
          parent && parent !== root;
          parent = parent.parentElement
        ) {
          if (/(auto|scroll)/.test(getComputedStyle(parent).overflowX)) {
            found.add(parent);
            break;
          }
        }
      }
      for (const container of containers) {
        if (!found.has(container))
          container.classList.remove(styles.nativeScrollbar);
      }
      containers = [...found];
      resize.disconnect();
      resize.observe(root);
      for (const container of containers) {
        container.classList.add(styles.nativeScrollbar);
        resize.observe(container);
        for (const table of container.querySelectorAll("table"))
          resize.observe(table);
      }
      schedule();
    };
    const mutations = new MutationObserver(discover);
    mutations.observe(root, { childList: true, subtree: true });
    document.addEventListener("scroll", schedule, true);
    root.addEventListener("pointerover", selectTable);
    root.addEventListener("focusin", selectTable);
    window.addEventListener("resize", schedule);
    discover();
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      mutations.disconnect();
      for (const container of containers)
        container.classList.remove(styles.nativeScrollbar);
      document.removeEventListener("scroll", schedule, true);
      root.removeEventListener("pointerover", selectTable);
      root.removeEventListener("focusin", selectTable);
      window.removeEventListener("resize", schedule);
      target.current = null;
    };
  }, [bottomInset]);

  useEffect(() => {
    if (scrollbar.current && target.current)
      scrollbar.current.value = String(target.current.scrollLeft);
  }, [placement]);

  return (
    <>
      <span ref={anchor} hidden />
      {placement &&
        createPortal(
          <div
            className={styles.scrollbar}
            style={{
              left: placement.left,
              top: placement.top,
              width: placement.width,
            }}
            role="region"
            aria-label="列表横向滚动"
          >
            <input
              ref={scrollbar}
              type="range"
              min={0}
              max={placement.contentWidth - placement.width}
              step={1}
              defaultValue={target.current?.scrollLeft ?? 0}
              aria-label="左右移动列表"
              style={
                {
                  "--thumb-width": `${Math.max(32, placement.width ** 2 / placement.contentWidth)}px`,
                } as React.CSSProperties
              }
              onChange={(event) => {
                if (target.current)
                  target.current.scrollLeft = Number(event.currentTarget.value);
              }}
            />
          </div>,
          document.body,
        )}
    </>
  );
}
