import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/** Single selection; portal keeps the list outside the scrolling workbench. */
export function WarehouseSelect({
  value,
  options,
  disabled,
  onChange,
  label = '选择分仓',
  compact = false,
}: {
  value: string;
  options: { id: string; name: string }[];
  disabled: boolean;
  onChange: (value: string) => void;
  label?: string;
  compact?: boolean;
}) {
  const trigger = useRef<HTMLButtonElement>(null),
    list = useRef<HTMLDivElement>(null);
  const id = useId();
  const [open, setOpen] = useState(false),
    [active, setActive] = useState(0);
  const [position, setPosition] = useState({ left: 0, top: 0, width: 180, maxHeight: 280 });
  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  const show = () => {
    setActive(
      Math.max(
        0,
        options.findIndex((o) => o.id === value),
      ),
    );
    setOpen(true);
  };
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);
  useEffect(() => {
    if (!open) return;
    const place = () => {
      const r = trigger.current!.getBoundingClientRect();
      const topEdge = 0,
        bottomEdge = innerHeight;
      const width = Math.min(
        compact ? Math.max(132, r.width) : Math.max(220, r.width),
        innerWidth - 16,
      );
      const below = bottomEdge - r.bottom - 12,
        above = r.top - topEdge - 12;
      const desired = Math.min(280, options.length * 34 + 10);
      const placeAbove = below < desired && above > below;
      const maxHeight = Math.max(80, Math.min(280, placeAbove ? above : below));
      setPosition({
        left: Math.max(8, Math.min(r.left, innerWidth - width - 8)),
        top: placeAbove
          ? Math.max(topEdge + 6, r.top - 7 - Math.min(desired, maxHeight))
          : r.bottom + 7,
        width,
        maxHeight,
      });
    };
    const outside = (e: PointerEvent) => {
      if (!trigger.current?.contains(e.target as Node) && !list.current?.contains(e.target as Node))
        setOpen(false);
    };
    place();
    list.current?.focus();
    document.addEventListener('pointerdown', outside);
    window.addEventListener('resize', place);
    document.addEventListener('scroll', place, true);
    return () => {
      document.removeEventListener('pointerdown', outside);
      window.removeEventListener('resize', place);
      document.removeEventListener('scroll', place, true);
    };
  }, [open, compact, options.length]);
  useEffect(() => {
    if (open) list.current?.children[active]?.scrollIntoView({ block: 'nearest' });
  }, [open, active]);
  const choose = (index: number) => {
    const option = options[index];
    if (option) onChange(option.id);
    close();
  };
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="warehouse-select-trigger"
        disabled={disabled}
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => (open ? close() : show())}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            show();
          }
        }}
      >
        <span>{options.find((o) => o.id === value)?.name ?? '选择分仓'}</span>
        <svg
          className="warehouse-select-chevron"
          aria-hidden="true"
          viewBox="0 0 16 16"
          fill="none"
        >
          <path
            d="m4 6 4 4 4-4"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {open &&
        createPortal(
          <div
            ref={list}
            id={id}
            role="listbox"
            tabIndex={-1}
            aria-label={label}
            aria-activedescendant={`${id}-${active}`}
            className="warehouse-select-list"
            style={position}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                close();
              } else if (e.key === 'Tab') {
                close();
              } else if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                choose(active);
              } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
                e.preventDefault();
                setActive((i) =>
                  e.key === 'Home'
                    ? 0
                    : e.key === 'End'
                      ? options.length - 1
                      : Math.max(
                          0,
                          Math.min(options.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)),
                        ),
                );
              }
            }}
          >
            {options.map((o, i) => (
              <div
                key={o.id}
                id={`${id}-${i}`}
                role="option"
                aria-selected={o.id === value}
                data-value={o.id}
                data-active={active === i}
                onMouseMove={() => setActive(i)}
                onClick={() => choose(i)}
              >
                <span>{o.name}</span>
                <span aria-hidden="true">{o.id === value ? '✓' : ''}</span>
              </div>
            ))}
          </div>,
          trigger.current?.closest('dialog') ?? document.body,
        )}
    </>
  );
}
