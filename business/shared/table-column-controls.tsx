import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import css from './table-column-controls.module.css';

type ColumnFilter =
  | { kind: 'text'; name: string }
  | { kind: 'number'; min: string; max: string }
  | {
      kind: 'select';
      name: string;
      options: { value: string; label: string }[];
    };

export function ColumnFilterControl({
  label,
  definition,
  values,
  onApply,
}: {
  label: string;
  definition: ColumnFilter;
  values: Record<string, string>;
  onApply: (changes: Record<string, string>) => void;
}) {
  const [position, setPosition] = useState<{
    left: number;
    top: number;
  } | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const button = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLFormElement>(null);
  const names = definition.kind === 'number' ? [definition.min, definition.max] : [definition.name];
  const active = names.some((name) => values[name]?.trim());
  useEffect(() => {
    if (!position) return;
    popup.current?.querySelector<HTMLInputElement | HTMLSelectElement>('input, select')?.focus();
    const close = () => setPosition(null);
    const outside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !popup.current?.contains(event.target) &&
        !button.current?.contains(event.target)
      )
        close();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        close();
        button.current?.focus();
      }
    };
    window.addEventListener('pointerdown', outside);
    window.addEventListener('keydown', escape);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('pointerdown', outside);
      window.removeEventListener('keydown', escape);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [position]);
  const apply = (changes: Record<string, string>) => {
    onApply(changes);
    setPosition(null);
    button.current?.focus();
  };
  // 客户端页面容器禁止原生表单提交，点击和回车须直接应用筛选。
  const applyDraft = () => {
    if (popup.current?.reportValidity()) apply(draft);
  };
  return (
    <>
      <button
        ref={button}
        type="button"
        className={css.filterButton}
        data-active={active}
        aria-label={`筛选${label}`}
        aria-expanded={Boolean(position)}
        title={`筛选${label}`}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={() => {
          if (position) return setPosition(null);
          const rect = button.current?.getBoundingClientRect();
          if (!rect) return;
          setDraft(Object.fromEntries(names.map((name) => [name, values[name] ?? ''])));
          setPosition({
            left: Math.max(8, Math.min(rect.left, window.innerWidth - 268)),
            top: Math.max(8, Math.min(rect.bottom + 6, window.innerHeight - 220)),
          });
        }}
      >
        <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
          <path d="M2 3h12L9.5 8v4l-3 1V8z" fill="none" stroke="currentColor" strokeWidth="1.4" />
        </svg>
      </button>
      {position &&
        createPortal(
          <form
            ref={popup}
            className={css.filterPopup}
            style={position}
            aria-label={`${label}筛选`}
            onSubmit={(event) => {
              event.preventDefault();
              event.stopPropagation();
              applyDraft();
            }}
            onKeyDown={(event) => {
              if (
                event.key === 'Enter' &&
                !event.nativeEvent.isComposing &&
                (event.target instanceof HTMLInputElement ||
                  event.target instanceof HTMLSelectElement)
              ) {
                event.preventDefault();
                event.stopPropagation();
                applyDraft();
              }
            }}
          >
            <strong>{label}</strong>
            {definition.kind === 'number' ? (
              <div className={css.range}>
                <label>
                  最小值
                  <input
                    type="number"
                    step="any"
                    value={draft[definition.min] ?? ''}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        [definition.min]: event.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  最大值
                  <input
                    type="number"
                    step="any"
                    min={draft[definition.min] || undefined}
                    value={draft[definition.max] ?? ''}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        [definition.max]: event.target.value,
                      })
                    }
                  />
                </label>
              </div>
            ) : definition.kind === 'select' ? (
              <label>
                筛选值
                <select
                  value={draft[definition.name] ?? ''}
                  onChange={(event) => setDraft({ [definition.name]: event.target.value })}
                >
                  <option value="">全部</option>
                  {definition.options.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <label>
                包含
                <input
                  value={draft[definition.name] ?? ''}
                  maxLength={100}
                  onChange={(event) => setDraft({ [definition.name]: event.target.value })}
                />
              </label>
            )}
            <div className={css.actions}>
              <button
                type="button"
                onClick={() => apply(Object.fromEntries(names.map((name) => [name, ''])))}
              >
                清除
              </button>
              <button type="button" className={css.applyButton} onClick={applyDraft}>
                应用
              </button>
            </div>
          </form>,
          document.body,
        )}
    </>
  );
}

export function ColumnResizeHandle({
  label,
  width,
  onResize,
}: {
  label: string;
  width: number;
  onResize: (width: number) => void;
}) {
  const start = useRef<{ x: number; width: number } | null>(null);
  const resize = (value: number) => onResize(Math.max(80, Math.min(800, Math.round(value))));
  return (
    <span
      className={css.resizeHandle}
      role="separator"
      tabIndex={0}
      aria-orientation="vertical"
      aria-label={`调整${label}列宽`}
      aria-valuemin={80}
      aria-valuemax={800}
      aria-valuenow={width}
      onPointerDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
        start.current = { x: event.clientX, width };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (start.current) resize(start.current.width + event.clientX - start.current.x);
      }}
      onPointerUp={(event) => {
        start.current = null;
        event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={() => {
        start.current = null;
      }}
      onLostPointerCapture={() => {
        start.current = null;
      }}
      onDragStart={(event) => event.preventDefault()}
      onKeyDown={(event) => {
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          event.preventDefault();
          event.stopPropagation();
          resize(width + (event.key === 'ArrowRight' ? 1 : -1) * (event.shiftKey ? 50 : 10));
        }
      }}
    />
  );
}
