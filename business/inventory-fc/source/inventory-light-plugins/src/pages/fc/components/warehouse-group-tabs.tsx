import { useEffect } from 'react';

export type FcWarehouseGroup = 'branch' | 'base';

export function WarehouseGroupTabs({
  value,
  onChange,
  id,
}: {
  value: FcWarehouseGroup;
  onChange: (value: FcWarehouseGroup) => void;
  id: string;
}) {
  useEffect(() => {
    if (!Object.hasOwn(HTMLElement.prototype, 'focusGroup'))
      void import('@microsoft/focusgroup-polyfill').then(({ polyfill }) => polyfill());
  }, []);
  return (
    <div
      className="warehouse-group-tabs"
      role="tablist"
      aria-label="仓库类型"
      {...{ focusgroup: 'tablist nomemory' }}
    >
      {(['branch', 'base'] satisfies FcWarehouseGroup[]).map((group) => (
        <button
          key={group}
          id={`${id}-${group}`}
          type="button"
          role="tab"
          aria-selected={value === group}
          {...(value === group ? { focusgroupstart: '' } : {})}
          onClick={() => onChange(group)}
        >
          {group === 'branch' ? '分仓' : '基地仓'}
        </button>
      ))}
    </div>
  );
}
