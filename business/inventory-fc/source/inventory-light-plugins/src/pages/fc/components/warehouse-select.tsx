import {useEffect, useId, useRef, useState} from 'react';
import {createPortal} from 'react-dom';

/** Single selection; portal keeps the list outside the scrolling workbench. */
export function WarehouseSelect({value, options, disabled, onChange}: {
  value: string; options: {id: string; name: string}[]; disabled: boolean;
  onChange: (value: string) => void;
}) {
  const trigger = useRef<HTMLButtonElement>(null), list = useRef<HTMLDivElement>(null);
  const id = useId();
  const [open, setOpen] = useState(false), [active, setActive] = useState(0);
  const [position, setPosition] = useState({left: 0, top: 0, width: 180, maxHeight: 280});
  const close = () => {setOpen(false); trigger.current?.focus();};
  const show = () => {setActive(Math.max(0, options.findIndex(o => o.id === value))); setOpen(true);};
  useEffect(() => {if (disabled) setOpen(false);}, [disabled]);
  useEffect(() => {
    if (!open) return;
    const place = () => {
      const r = trigger.current!.getBoundingClientRect(), width = Math.min(220, innerWidth - 16);
      setPosition({left: Math.max(8, Math.min(r.left, innerWidth - width - 8)), top: r.bottom + 4,
        width, maxHeight: Math.max(80, Math.min(280, innerHeight - r.bottom - 12))});
    };
    const outside = (e: PointerEvent) => {if (!trigger.current?.contains(e.target as Node) && !list.current?.contains(e.target as Node)) setOpen(false);};
    place(); list.current?.focus();
    document.addEventListener('pointerdown', outside);
    window.addEventListener('resize', place);
    document.addEventListener('scroll', place, true);
    return () => {document.removeEventListener('pointerdown', outside); window.removeEventListener('resize', place); document.removeEventListener('scroll', place, true);};
  }, [open]);
  useEffect(() => {if(open) list.current?.children[active]?.scrollIntoView({block:'nearest'});}, [open, active]);
  const choose = (index: number) => {const option = options[index]; if(option) onChange(option.id); close();};
  return <>
    <button ref={trigger} type="button" className="warehouse-select-trigger" disabled={disabled}
      aria-label="选择分仓" aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? id : undefined}
      onClick={() => open ? close() : show()}
      onKeyDown={e => {if(e.key === 'ArrowDown' || e.key === 'ArrowUp') {e.preventDefault(); show();}}}>
      <span>{options.find(o => o.id === value)?.name ?? '选择分仓'}</span><span aria-hidden="true">⌄</span>
    </button>
    {open && createPortal(<div ref={list} id={id} role="listbox" tabIndex={-1} aria-label="选择分仓"
      aria-activedescendant={`${id}-${active}`} className="warehouse-select-list" style={position}
      onKeyDown={e => {
        if(e.key === 'Escape') {e.preventDefault(); close();}
        else if(e.key === 'Tab') {close();}
        else if(e.key === 'Enter' || e.key === ' ') {e.preventDefault(); choose(active);}
        else if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)) {e.preventDefault(); setActive(i => e.key === 'Home' ? 0 : e.key === 'End' ? options.length - 1 : Math.max(0, Math.min(options.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1))));}
      }}>
      {options.map((o,i) => <div key={o.id} id={`${id}-${i}`} role="option" aria-selected={o.id === value}
        data-active={active === i} onMouseMove={() => setActive(i)} onClick={() => choose(i)}>
        <span>{o.name}</span><span aria-hidden="true">{o.id === value ? '✓' : ''}</span>
      </div>)}
    </div>, document.body)}
  </>;
}
