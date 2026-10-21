import React, { type InputHTMLAttributes } from 'react';
import styles from './business-date-input.module.css';

/** Keep ISO filter values and native calendar/keyboard support with a fixed display locale. */
export function BusinessDateInput({
  className,
  value,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  const date = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : '';
  return (
    <span
      className={`${styles.control} ${className ?? ''}`}
      data-disabled={props.disabled || undefined}
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
      <span aria-hidden="true">
        {date ? `${date.slice(0, 4)}年${date.slice(5, 7)}月${date.slice(8, 10)}日` : '选择日期'}
      </span>
      <input {...props} type="date" lang="zh-CN" value={value} />
    </span>
  );
}
