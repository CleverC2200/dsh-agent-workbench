import { useRef } from 'react';
import './workbench-search.css';

export function WorkbenchSearch({
  label,
  value,
  onChange,
  placeholder,
  maxLength = 100,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  maxLength?: number;
}) {
  const input = useRef<HTMLInputElement>(null);
  const clear = () => {
    onChange('');
    input.current?.focus();
  };
  return (
    <span className="fc-search-control" role="search" aria-label={label}>
      <svg aria-hidden="true" viewBox="0 0 16 16" fill="none">
        <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" />
        <path d="m10.5 10.5 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <input
        ref={input}
        type="search"
        aria-label={label}
        value={value}
        placeholder={placeholder ?? '搜索名称'}
        maxLength={maxLength}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            clear();
          }
        }}
      />
      {value && (
        <button type="button" aria-label={`清空${label}`} onClick={clear}>
          ×
        </button>
      )}
    </span>
  );
}
