import React, { useEffect, useId, useRef, useState, type InputHTMLAttributes } from 'react';
import styles from './business-date-input.module.css';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange'> & {
  onValueChange: (value: string) => void;
  avoidTriggerOverlap?: boolean;
};
const isoDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const readDate = (value: unknown) =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : '';
const labelDate = (value: string) =>
  `${value.slice(0, 4)}年${value.slice(5, 7)}月${value.slice(8, 10)}日`;

/** The native date field preserves ISO form validation; the calendar has an explicit Chinese UI. */
export function BusinessDateInput({
  className,
  value,
  onValueChange,
  avoidTriggerOverlap = false,
  ...props
}: Props) {
  const date = readDate(value);
  const today = isoDate(new Date());
  const [popup, setPopup] = useState<{ month: string; left: number; top: number } | null>(null);
  const root = useRef<HTMLSpanElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const calendar = useRef<HTMLSpanElement>(null);
  const id = useId();
  const min = readDate(props.min);
  const max = readDate(props.max);
  const allowed = (day: string) => (!min || day >= min) && (!max || day <= max);
  const close = () => {
    setPopup(null);
    trigger.current?.focus();
  };
  const choose = (day: string) => {
    onValueChange(day);
    close();
  };
  const open = () => {
    const rect = trigger.current?.getBoundingClientRect();
    if (!rect) return;
    const initial = date || (max && today > max ? max : min && today < min ? min : today);
    setPopup({
      month: initial.slice(0, 7),
      left: Math.max(8, Math.min(rect.left, window.innerWidth - 288)),
      top: avoidTriggerOverlap
        ? Math.max(
            8,
            window.innerHeight - rect.bottom - 8 >= Math.min(352, window.innerHeight - 16) ||
              window.innerHeight - rect.bottom - 8 >= rect.top - 8
              ? rect.bottom + 7
              : rect.top - Math.min(352, window.innerHeight - 16) - 7,
          )
        : Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - 352)),
    });
  };
  useEffect(() => {
    if (!popup) return;
    (
      calendar.current?.querySelector<HTMLButtonElement>(
        'button[aria-pressed="true"]:not(:disabled)',
      ) ??
      calendar.current?.querySelector<HTMLButtonElement>('button[data-month-day]:not(:disabled)')
    )?.focus();
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setPopup(null);
    };
    const reposition = () => setPopup(null);
    document.addEventListener('pointerdown', outside);
    window.addEventListener('resize', reposition);
    return () => {
      document.removeEventListener('pointerdown', outside);
      window.removeEventListener('resize', reposition);
    };
  }, [popup]);
  const month = popup ? new Date(`${popup.month}-01T12:00:00`) : new Date();
  const shiftMonth = (offset: number) =>
    isoDate(new Date(month.getFullYear(), month.getMonth() + offset, 1)).slice(0, 7);
  const days = Array.from({ length: 42 }, (_, i) => {
    const day = new Date(month.getFullYear(), month.getMonth(), i - month.getDay() + 1);
    return {
      value: isoDate(day),
      day: day.getDate(),
      current: day.getMonth() === month.getMonth(),
    };
  });
  return (
    <span
      ref={root}
      className={`${styles.control} ${className ?? ''}`}
      data-disabled={props.disabled || undefined}
    >
      <button
        ref={trigger}
        type="button"
        className={styles.trigger}
        disabled={props.disabled}
        aria-label={`选择日期：${date ? labelDate(date) : '未选择'}`}
        aria-haspopup="dialog"
        aria-expanded={popup !== null}
        aria-controls={popup ? id : undefined}
        onClick={() => (popup ? close() : open())}
      >
        <svg
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden="true"
        >
          <rect x="3" y="4.5" width="14" height="12.5" rx="2" />
          <path d="M6.5 2.5v4M13.5 2.5v4M3 8.5h14M6 11.5h2M10 11.5h2M6 14.5h2" />
        </svg>
        {date ? labelDate(date) : '选择日期'}
      </button>
      <input
        {...props}
        type="date"
        lang="zh-CN"
        tabIndex={-1}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        onInvalid={(event) => {
          event.preventDefault();
          open();
        }}
      />
      {popup && (
        <span
          ref={calendar}
          id={id}
          role="dialog"
          aria-label="选择日期"
          lang="zh-CN"
          className={styles.calendar}
          style={{ left: popup.left, top: popup.top }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              close();
            }
            const offset = new Map([
              ['ArrowLeft', -1],
              ['ArrowRight', 1],
              ['ArrowUp', -7],
              ['ArrowDown', 7],
            ]).get(event.key);
            if (
              offset !== undefined &&
              event.target instanceof HTMLButtonElement &&
              event.target.dataset.date
            ) {
              event.preventDefault();
              const next = new Date(`${event.target.dataset.date}T12:00:00`);
              next.setDate(next.getDate() + offset);
              calendar.current
                ?.querySelector<HTMLButtonElement>(
                  `button[data-date="${isoDate(next)}"]:not(:disabled)`,
                )
                ?.focus();
            }
          }}
        >
          <span className={styles.month}>
            <button
              type="button"
              aria-label="上个月"
              disabled={!!min && shiftMonth(-1) < min.slice(0, 7)}
              onClick={() => setPopup({ ...popup, month: shiftMonth(-1) })}
            >
              ‹
            </button>
            <strong aria-live="polite">
              {month.getFullYear()}年{month.getMonth() + 1}月
            </strong>
            <button
              type="button"
              aria-label="下个月"
              disabled={!!max && shiftMonth(1) > max.slice(0, 7)}
              onClick={() => setPopup({ ...popup, month: shiftMonth(1) })}
            >
              ›
            </button>
          </span>
          <span className={styles.weekdays} aria-hidden="true">
            {['日', '一', '二', '三', '四', '五', '六'].map((day) => (
              <span key={day}>{day}</span>
            ))}
          </span>
          <span className={styles.days}>
            {days.map((day) => (
              <button
                key={day.value}
                type="button"
                data-date={day.value}
                data-month-day={day.current || undefined}
                data-other-month={!day.current || undefined}
                data-today={day.value === today || undefined}
                aria-label={labelDate(day.value)}
                aria-pressed={day.value === date}
                disabled={!allowed(day.value)}
                onClick={() => choose(day.value)}
              >
                {day.day}
              </button>
            ))}
          </span>
          <span className={styles.footer}>
            <button type="button" onClick={() => choose('')}>
              清空
            </button>
            <button type="button" disabled={!allowed(today)} onClick={() => choose(today)}>
              今天
            </button>
          </span>
        </span>
      )}
    </span>
  );
}
