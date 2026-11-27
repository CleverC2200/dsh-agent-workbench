import { mpsBusinessDate } from './business-date.js';

const monthPattern = /^(?!0000)\d{4}-(0[1-9]|1[0-2])$/;
const months = Array.from({ length: 12 }, (_, index) => index + 1);
const monthValue = (year, month) =>
  `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`;

export function createMonthPicker(react) {
  const h = react.createElement;
  const supportsPopover = 'popover' in HTMLElement.prototype;
  return function MonthPicker({ label, name, value, onChange, min, max, disabled }) {
    const id = react.useId();
    const panelId = `${id}-months`;
    const anchor = `--mps-month-${id.replace(/[^\w-]/g, '')}`;
    const panel = react.useRef(null);
    const trigger = react.useRef(null);
    const currentMonth = mpsBusinessDate().slice(0, 7);
    const firstYear = Number(min?.slice(0, 4) ?? 1);
    const lastYear = Number(max?.slice(0, 4) ?? 9999);
    const valueYear = Number((value || currentMonth).slice(0, 4));
    const selectedYear = Math.max(firstYear, Math.min(lastYear, valueYear));
    const [year, setYear] = react.useState(selectedYear);
    const [editing, setEditing] = react.useState(null);
    const allowed = (month) =>
      monthPattern.test(month) && (!min || month >= min) && (!max || month <= max);
    const change = (month) => {
      if (monthPattern.test(month)) {
        setEditing(null);
        if (month !== value) onChange(month);
      } else {
        setEditing(month);
      }
    };
    const select = (month) => {
      panel.current.hidePopover();
      change(month);
    };

    return h(
      'div',
      { className: 'mps-month-field' },
      h('label', { htmlFor: id, id: `${id}-label` }, label),
      supportsPopover
        ? h(
            'div',
            { className: 'mps-month-input', style: { anchorName: anchor } },
            h('input', {
              id,
              name,
              value: editing ?? value,
              disabled,
              placeholder: 'YYYY-MM',
              'aria-invalid': Boolean(value && !allowed(value)) || undefined,
              autoComplete: 'off',
              spellCheck: false,
              onChange: (event) => change(event.target.value),
              onBlur: () => setEditing(null),
              onKeyDown: (event) => {
                if (event.key === 'ArrowDown' && !panel.current.matches(':popover-open')) {
                  event.preventDefault();
                  trigger.current.focus();
                  trigger.current.click();
                }
              },
            }),
            h(
              'button',
              {
                ref: trigger,
                type: 'button',
                disabled,
                'aria-label': '打开月份选择',
                'aria-describedby': `${id}-label`,
                popovertarget: panelId,
                onClick: () => setYear(selectedYear),
              },
              h(
                'svg',
                { width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true },
                h('path', {
                  d: 'M5 2v3m6-3v3M2.5 6.5h11M4 3.5h8a1.5 1.5 0 0 1 1.5 1.5v7a1.5 1.5 0 0 1-1.5 1.5H4A1.5 1.5 0 0 1 2.5 12V5A1.5 1.5 0 0 1 4 3.5Z',
                  stroke: 'currentColor',
                  strokeLinecap: 'round',
                }),
              ),
            ),
            h(
              'div',
              {
                ref: panel,
                id: panelId,
                popover: 'auto',
                className: 'mps-month-panel',
                style: { positionAnchor: anchor },
              },
              h(
                'div',
                { className: 'mps-month-year' },
                ...[-1, 1].map((direction) =>
                  h('button', {
                    key: direction,
                    type: 'button',
                    className: direction < 0 ? 'mps-month-prev' : 'mps-month-next',
                    'aria-label': direction < 0 ? '上一年' : '下一年',
                    disabled:
                      disabled || year + direction < firstYear || year + direction > lastYear,
                    onClick: () => setYear(year + direction),
                  }),
                ),
                h('span', { 'aria-live': 'polite' }, `${year}年`),
              ),
              h(
                'div',
                { className: 'mps-month-options' },
                ...months.map((month) => {
                  const option = monthValue(year, month);
                  return h(
                    'button',
                    {
                      key: month,
                      type: 'button',
                      disabled: disabled || !allowed(option),
                      'aria-pressed': option === value,
                      onClick: () => select(option),
                    },
                    `${month}月`,
                  );
                }),
              ),
              allowed(currentMonth) &&
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'mps-month-today',
                    disabled,
                    onClick: () => select(currentMonth),
                  },
                  '本月',
                ),
            ),
          )
        : h('input', {
            id,
            name,
            type: 'month',
            value,
            min,
            max,
            disabled,
            onChange: (event) => change(event.target.value),
          }),
    );
  };
}
