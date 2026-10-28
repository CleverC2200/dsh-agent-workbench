import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import css from './plan-pagination.module.css';

type Props = {
  ariaLabel?: string;
  maxPageSize?: number;
  totalCount: number;
  page: number;
  pageSize: number;
  loading: boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
};

export function PlanPagination({
  ariaLabel = '全链库存列表分页',
  maxPageSize = 100,
  totalCount,
  page,
  pageSize,
  loading,
  onPageChange,
  onPageSizeChange,
}: Props) {
  const [open, setOpen] = useState(false);
  const [editingPage, setEditingPage] = useState(false);
  const [pageDraft, setPageDraft] = useState('');
  const [pageError, setPageError] = useState('');
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const pageInput = useRef<HTMLInputElement>(null);
  const menuId = useId();
  const sizes = [10, 20, 50, 100].filter((size) => size <= maxPageSize);
  const pages = Math.max(1, Math.ceil(totalCount / pageSize));
  const current = totalCount === 0 ? 0 : Math.min(Math.max(1, page), pages);
  const startPageEdit = () => {
    setOpen(false);
    setPageDraft(String(current));
    setPageError('');
    setEditingPage(true);
  };
  const commitPageEdit = () => {
    const draft = pageDraft.trim();
    const target = Number(draft);
    if (!/^[1-9]\d*$/.test(draft) || !Number.isSafeInteger(target) || target > pages) {
      setPageError(`请输入 1–${pages} 页`);
      pageInput.current?.select();
      return;
    }
    setEditingPage(false);
    setPageError('');
    if (target !== current) onPageChange(target);
  };
  useEffect(() => {
    if (editingPage) pageInput.current?.select();
  }, [editingPage]);
  useEffect(() => {
    setEditingPage(false);
    setPageError('');
  }, [page, pageSize, totalCount]);
  const openMenu = () => {
    const box = trigger.current?.getBoundingClientRect();
    if (!box) return;
    const height = Math.min(sizes.length * 34 + 12, window.innerHeight - 24);
    const above = box.top;
    const below = window.innerHeight - box.bottom;
    setPosition({
      top: Math.max(
        12,
        above > below && above >= height + 7
          ? box.top - height - 7
          : Math.min(box.bottom + 7, window.innerHeight - height - 12),
      ),
      left: Math.max(12, Math.min(box.right - 120, window.innerWidth - 132)),
    });
    setOpen(true);
  };
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (
        !trigger.current?.contains(event.target as Node) &&
        !menu.current?.contains(event.target as Node)
      )
        setOpen(false);
    };
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    const reposition = (event: Event) => {
      if (!menu.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', keyboard);
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    menu.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]')?.focus();
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', keyboard);
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [open]);
  useEffect(() => {
    if (loading) {
      setOpen(false);
      setEditingPage(false);
      setPageError('');
    }
  }, [loading]);

  return (
    <nav className={css.footer} aria-label={ariaLabel}>
      <span className={css.total}>共 {totalCount.toLocaleString('zh-CN')} 条</span>
      <div className={css.controls}>
        <span className={css.sizeLabel}>每页条数</span>
        <button
          ref={trigger}
          type="button"
          className={css.sizeTrigger}
          aria-label="每页条数"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? menuId : undefined}
          disabled={loading}
          onClick={() => (open ? setOpen(false) : openMenu())}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              openMenu();
            }
          }}
        >
          {pageSize} 条/页 <span className={css.chevron} aria-hidden="true" />
        </button>
        {open &&
          createPortal(
            <div
              ref={menu}
              id={menuId}
              className={css.menu}
              role="listbox"
              aria-label="每页条数"
              style={position}
              onKeyDown={(event) => {
                if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
                event.preventDefault();
                const options = Array.from(
                  event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="option"]'),
                );
                const index = options.indexOf(document.activeElement as HTMLButtonElement);
                const next =
                  event.key === 'Home'
                    ? 0
                    : event.key === 'End'
                      ? options.length - 1
                      : (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) %
                        options.length;
                options[next]?.focus();
              }}
            >
              {sizes.map((size) => (
                <button
                  type="button"
                  role="option"
                  aria-selected={size === pageSize}
                  key={size}
                  className={css.option}
                  onClick={() => {
                    setOpen(false);
                    trigger.current?.focus();
                    if (size !== pageSize) onPageSizeChange(size);
                  }}
                >
                  {size} 条/页
                </button>
              ))}
            </div>,
            document.body,
          )}
        <div className={css.navigation}>
          <button
            type="button"
            className={css.arrowButton}
            aria-label="上一页"
            disabled={loading || current <= 1}
            onClick={() => onPageChange(current - 1)}
          >
            <span className={`${css.arrowIcon} ${css.previous}`} aria-hidden="true" />
          </button>
          <span className={css.currentSlot}>
            {editingPage ? (
              <input
                ref={pageInput}
                className={css.pageInput}
                type="text"
                inputMode="numeric"
                autoComplete="off"
                aria-label="输入页码"
                aria-invalid={Boolean(pageError)}
                aria-describedby={pageError ? `${menuId}-page-error` : undefined}
                value={pageDraft}
                onChange={(event) => {
                  setPageDraft(event.target.value);
                  setPageError('');
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') commitPageEdit();
                  if (event.key === 'Escape') {
                    setEditingPage(false);
                    setPageError('');
                  }
                }}
                onBlur={() => {
                  setEditingPage(false);
                  setPageError('');
                }}
                style={{ width: `${Math.max(36, String(pages).length * 12 + 20)}px` }}
              />
            ) : (
              <button
                type="button"
                className={css.currentPage}
                aria-label={`当前第 ${current} 页，点击输入页码`}
                disabled={loading || current === 0}
                onClick={startPageEdit}
              >
                {current}
              </button>
            )}
            {pageError && (
              <span id={`${menuId}-page-error`} className={css.pageError} role="alert">
                {pageError}
              </span>
            )}
          </span>
          <button
            type="button"
            className={css.arrowButton}
            aria-label="下一页"
            disabled={loading || current === 0 || current >= pages}
            onClick={() => onPageChange(current + 1)}
          >
            <span className={`${css.arrowIcon} ${css.next}`} aria-hidden="true" />
          </button>
          <span className={css.pages}>共 {totalCount === 0 ? 0 : pages} 页</span>
        </div>
      </div>
    </nav>
  );
}
