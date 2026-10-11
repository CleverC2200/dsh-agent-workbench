import React, { useEffect, useRef, useState } from 'react';
import type { ObjectData } from 'dsh-agent-manage/inventory-compute/personal';
import css from './object-picker.module.css';

export function ObjectPicker({
  objects,
  selected,
  onSelect,
}: {
  objects: ObjectData[];
  selected: string;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false),
    [search, setSearch] = useState('');
  const root = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null),
    input = useRef<HTMLInputElement>(null);
  const quick = objects.slice(0, 4),
    current = objects.find((o) => o.id === selected);
  const extra = current && !quick.some((o) => o.id === selected);
  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    const close = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);
  const choose = (id: string) => {
    onSelect(id);
    setOpen(false);
    setSearch('');
    trigger.current?.focus();
  };
  return (
    <div
      ref={root}
      className={css.picker}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          setOpen(false);
          trigger.current?.focus();
        }
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false);
      }}
    >
      <nav aria-label="当前对象" className={css.shortcuts}>
        <span>当前对象</span>
        <button aria-pressed={selected === '全部'} onClick={() => onSelect('全部')}>
          全部
        </button>
        {quick.map((o) => (
          <button key={o.id} aria-pressed={selected === o.id} onClick={() => onSelect(o.id)}>
            {o.name}
          </button>
        ))}
        <button
          ref={trigger}
          aria-expanded={open}
          aria-controls="personal-object-list"
          aria-pressed={!!extra}
          onClick={() => {
            setSearch('');
            setOpen(!open);
          }}
        >
          {extra ? current.name : '更多'}
          <span aria-hidden="true">⌄</span>
        </button>
      </nav>
      {open && (
        <section id="personal-object-list" className={css.popover} aria-label="选择库存对象">
          <input
            ref={input}
            aria-label="搜索基地或分仓"
            placeholder="搜索基地或分仓"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className={css.results}>
            {(['base', 'branch'] as const).map((kind) => {
              const items = objects.filter(
                (o) => o.kind === kind && o.name.includes(search.trim()),
              );
              return items.length ? (
                <div key={kind}>
                  <h3>
                    {kind === 'base' ? '基地' : '分仓'}
                    <small>{items.length}</small>
                  </h3>
                  <div className={css.options}>
                    {items.map((o) => (
                      <button
                        key={o.id}
                        aria-pressed={selected === o.id}
                        onClick={() => choose(o.id)}
                      >
                        {o.name}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null;
            })}
            {!objects.some((o) => o.name.includes(search.trim())) && <p>没有匹配的对象</p>}
          </div>
        </section>
      )}
    </div>
  );
}
