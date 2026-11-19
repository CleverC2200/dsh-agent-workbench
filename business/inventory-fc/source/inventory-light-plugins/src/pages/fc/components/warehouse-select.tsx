import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export function WarehouseSelect({
  value,
  values,
  onValuesChange,
  options,
  disabled,
  onChange,
  label = '选择分仓',
  compact = false,
}: {
  value: string;
  values?: string[];
  onValuesChange?: (values: string[]) => void;
  options: { id: string; name: string; status?: string }[];
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
  const isSelected = (id: string) =>
    values ? (id ? values.includes(id) : values.length === 0) : id === value;
  const selected = options.find((option) => option.id === value);
  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  const show = () => {
    setActive(
      Math.max(
        0,
        options.findIndex((o) => isSelected(o.id)),
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
    if (!option) return;
    if (values && onValuesChange) {
      const next =
        option.id === ''
          ? []
          : isSelected(option.id)
            ? values.filter((id) => id !== option.id)
            : [...values, option.id];
      if (option.id && next.length === 0) return;
      onValuesChange(next);
    } else {
      onChange(option.id);
      close();
    }
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
        <span className="warehouse-select-label">
          <span className="warehouse-select-name">
            {values?.length ? `已选 ${values.length} 个分仓` : (selected?.name ?? '选择分仓')}
          </span>
          {selected?.status && <span className="warehouse-select-status">{selected.status}</span>}
        </span>
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
            aria-multiselectable={values ? true : undefined}
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
                aria-selected={isSelected(o.id)}
                data-value={o.id}
                data-active={active === i}
                onMouseMove={() => setActive(i)}
                onClick={() => choose(i)}
              >
                <span className="warehouse-select-label">
                  <span className="warehouse-select-name">{o.name}</span>
                  {o.status && <span className="warehouse-select-status">{o.status}</span>}
                </span>
                <span aria-hidden="true">{isSelected(o.id) ? '✓' : ''}</span>
              </div>
            ))}
          </div>,
          trigger.current?.closest('dialog') ?? document.body,
        )}
    </>
  );
}
