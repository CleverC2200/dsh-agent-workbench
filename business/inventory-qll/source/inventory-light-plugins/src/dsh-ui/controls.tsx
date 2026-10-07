import {queryErrorText} from '../query-error.js';
import React, {
  Children,
  cloneElement,
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Button as DshButton } from "./DshButton";
import css from "./controls.module.css";
// Business controls use the same React + native HTML + CSS Modules boundary as DSH.
export function Button({
  type,
  htmlType = "button",
  size,
  loading,
  icon,
  children,
  variant,
  ...props
}: any) {
  return (
    <DshButton
      {...props}
      type={htmlType}
      variant={
        variant ??
        (type === "primary" ? "primary" : type === "text" ? "ghost" : "outline")
      }
      size={size === "small" || size === "mini" ? "sm" : "md"}
      disabled={props.disabled || loading}
      icon={icon}
    >
      {loading ? "处理中…" : children}
    </DshButton>
  );
}
export function Input({
  onChange,
  allowClear,
  prefix,
  suffix,
  autoSize,
  showWordLimit,
  children,
  ...p
}: any) {
  return (
    <input
      {...p}
      className={`${css.input} ${p.className ?? ""}`}
      onChange={(e) => onChange?.(e.target.value, e)}
    />
  );
}
Input.TextArea = ({ onChange, autoSize, showWordLimit, ...p }: any) => (
  <textarea
    {...p}
    rows={autoSize?.minRows ?? 4}
    className={css.input}
    onChange={(e) => onChange?.(e.target.value, e)}
  />
);
export function InputNumber({ onChange, precision, ...p }: any) {
  return (
    <input
      {...p}
      type="number"
      className={css.input}
      onChange={(e) =>
        onChange?.(e.target.value === "" ? undefined : Number(e.target.value))
      }
    />
  );
}
export function Select({
  options,
  children,
  onChange,
  showSearch,
  allowSearch,
  onSearch,
  filterOption,
  allowClear,
  placeholder,
  value,
  mode,
  size,
  style,
  ...p
}: any) {
  const [search, setSearch] = useState("");
  const optionsAll =
    options ??
    Children.toArray(children).map((c: any) => ({
      value: c.props.value,
      label: c.props.children,
    }));
  const opts =
    onSearch || !search
      ? optionsAll
      : optionsAll.filter((o: any) =>
          String(o.label ?? o)
            .toLowerCase()
            .includes(search.toLowerCase()),
        );
  const label = p["aria-label"] ?? placeholder ?? "选项";
  return (
    <span
      style={{
        display: "inline-flex",
        flexDirection: "column",
        gap: 4,
        ...style,
      }}
    >
      {(showSearch || allowSearch) && (
        <input
          className={css.input}
          aria-label={label + "搜索"}
          type="search"
          value={search}
          placeholder="输入名称搜索"
          disabled={p.disabled}
          onChange={(e) => {
            setSearch(e.target.value);
            onSearch?.(e.target.value);
          }}
        />
      )}
      <select
        {...p}
        aria-label={label}
        className={`${css.input} ${p.className ?? ""}`}
        multiple={mode === "multiple"}
        value={value ?? ""}
        onChange={(e) => {
          onChange?.(
            mode === "multiple"
              ? Array.from(e.target.selectedOptions).map((o) => o.value)
              : (optionsAll.find(
                  (o: any) => String(o.value ?? o) === e.target.value,
                )?.value ?? e.target.value),
          );
        }}
      >
        {(allowClear || placeholder) && (
          <option value="">{placeholder ?? "全部"}</option>
        )}
        {value &&
          mode !== "multiple" &&
          !opts.some((o: any) => String(o.value ?? o) === String(value)) && (
            <option value={value}>
              {optionsAll.find(
                (o: any) => String(o.value ?? o) === String(value),
              )?.label ?? value}
            </option>
          )}
        {opts.map((o: any) => (
          <option key={o.value ?? o} value={o.value ?? o} disabled={o.disabled}>
            {o.label ?? o}
          </option>
        ))}
      </select>
    </span>
  );
}
Select.Option = ({ children }: any) => <>{children}</>;
export function Checkbox({ onChange, children, indeterminate, ...p }: any) {
  return (
    <label className={css.inline}>
      <input
        {...p}
        type="checkbox"
        onChange={(e) => onChange?.(e.target.checked, e)}
      />
      {children}
    </label>
  );
}
export function Space({ children, direction, size, style, ...p }: any) {
  return (
    <div
      className={css.space}
      style={{
        flexDirection: direction === "vertical" ? "column" : "row",
        gap: typeof size === "number" ? size : 8,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
export function Card({ children, title, extra, style, className }: any) {
  return (
    <section className={`${css.card} ${className ?? ""}`} style={style}>
      {(title || extra) && (
        <header className={css.heading}>
          <strong>{title}</strong>
          {extra}
        </header>
      )}
      {children}
    </section>
  );
}
export function Alert({
  type = "info",
  content,
  title,
  action,
  children,
}: any) {
  return (
    <div
      className={`${css.alert} ${type === "error" ? css.error : ""}`}
      role={type === "error" ? "alert" : "status"}
    >
      {title && <strong>{title}</strong>}
      {queryErrorText(content)}
      {children}
      {action}
    </div>
  );
}
export function Tag({ children }: any) {
  return <span className={css.tag}>{children}</span>;
}
export function Tooltip({ children, content }: any) {
  return (
    <span title={typeof content === "string" ? content : undefined}>
      {children}
    </span>
  );
}
export function Spin({ children, loading = true }: any) {
  return (
    <div aria-busy={loading}>
      {loading && <span role="status">正在读取…</span>}
      {children}
    </div>
  );
}
export function Skeleton({ loading = true, children }: any) {
  if (!loading) return <>{children}</>;
  return (
    <div className={css.skeleton} role="status">
      正在读取业务数据…
    </div>
  );
}
export const Typography = {
  Text: ({ children, type, ellipsis, ...p }: any) => (
    <span {...p}>{children}</span>
  ),
};
export function Modal({
  visible,
  children,
  title,
  onCancel,
  onOk,
  footer,
  okText = "确定",
  cancelText = "取消",
  okButtonProps,
  confirmLoading,
  closable = true,
  escToExit = true,
  style,
  maskClosable = true,
}: any) {
  const ref = useRef<HTMLDialogElement>(null),
    label = useId();
  useEffect(() => {
    if (visible) {
      ref.current?.showModal();
      return () => ref.current?.close();
    }
  }, [visible]);
  if (!visible) return null;
  return createPortal(
    <dialog
      ref={ref}
      className={`${css.modal} dsh-modal dsh-modal-wrapper`}
      style={style}
      aria-labelledby={label}
      onCancel={(e) => {
        e.preventDefault();
        if (escToExit) onCancel?.();
      }}
      onClick={(e) => {
        if (maskClosable && e.target === e.currentTarget) onCancel?.();
      }}
    >
      <header className={css.heading}>
        <h2 id={label}>{title}</h2>
        {closable && (
          <Button aria-label="关闭" onClick={onCancel}>
            ×
          </Button>
        )}
      </header>
      <div className="dsh-modal-content">{children}</div>
      {footer === null ? null : (
        <footer className={css.footer}>
          {footer ?? (
            <>
              <Button onClick={onCancel}>{cancelText}</Button>
              <Button
                type="primary"
                {...okButtonProps}
                loading={confirmLoading}
                onClick={onOk}
              >
                {okText}
              </Button>
            </>
          )}
        </footer>
      )}
    </dialog>,
    document.body,
  );
}
export const Drawer = Modal;
export function Tabs({ activeTab, defaultActiveTab, onChange, children }: any) {
  const items = Children.toArray(children) as any[],
    [local, setLocal] = useState(
      defaultActiveTab ?? String(items[0]?.key ?? "").replace(/^\.\$/, ""),
    );
  const key = activeTab ?? local;
  return (
    <>
      <div className={css.tabs} role="tablist">
        {items.map((c) => {
          const id = String(c.key).replace(/^\.\$/, "");
          return (
            <button
              type="button"
              role="tab"
              key={id}
              aria-selected={key === id}
              onClick={() => {
                setLocal(id);
                onChange?.(id);
              }}
            >
              {c.props.title}
            </button>
          );
        })}
      </div>
      {items
        .filter((c) => String(c.key).replace(/^\.\$/, "") === key)
        .map((c) => (
          <div key={c.key} role="tabpanel">
            {c.props.children}
          </div>
        ))}
    </>
  );
}
Tabs.TabPane = ({ children }: any) => <>{children}</>;
export function Radio({ children }: any) {
  return <>{children}</>;
}
Radio.Group = ({ value, onChange, options, children }: any) => (
  <div className={css.tabs} role="radiogroup">
    {(
      options ??
      Children.toArray(children).map((c: any) => ({
        value: c.props.value,
        label: c.props.children,
      }))
    ).map((o: any) => (
      <button
        type="button"
        role="radio"
        key={o.value ?? o}
        aria-checked={value === (o.value ?? o)}
        onClick={() => onChange(o.value ?? o)}
      >
        {o.label ?? o}
      </button>
    ))}
  </div>
);
export const DatePicker = {
  MonthPicker: ({ onChange, allowClear, ...p }: any) => (
    <input
      {...p}
      type="month"
      className={css.input}
      onChange={(e) => onChange?.(e.target.value)}
    />
  ),
};
const MenuContext = createContext<any>(null);
export function Menu({ children, onClickMenuItem, selectedKeys, ...p }: any) {
  return (
    <MenuContext.Provider value={{ onClickMenuItem, selectedKeys }}>
      <div role="menu" {...p}>
        {Children.map(children, (c: any) =>
          cloneElement(c, { itemKey: c.key }),
        )}
      </div>
    </MenuContext.Provider>
  );
}
Menu.Item = ({ children, itemKey }: any) => {
  const c = useContext(MenuContext);
  return (
    <button
      className={css.menuItem}
      role="menuitemcheckbox"
      aria-checked={c?.selectedKeys?.includes(itemKey)}
      onClick={() => c?.onClickMenuItem(itemKey)}
    >
      {children}
    </button>
  );
};
export function Dropdown({ children, droplist }: any) {
  const [open, setOpen] = useState(false),
    ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: Event) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);
  return (
    <div
      className={css.dropdown}
      ref={ref}
      onKeyDown={(e) => {
        if (e.key === "Escape") setOpen(false);
      }}
    >
      {cloneElement(children, {
        "aria-expanded": open,
        onClick: () => setOpen(!open),
      })}
      {open && <div className={css.menu}>{droplist}</div>}
    </div>
  );
}
export type TableProps<T = any> = { columns?: any[]; [key: string]: any };
export function Table<T = any>({
  columns = [],
  data = [],
  rowKey = "key",
  pagination = false,
  loading,
  onRow,
  rowClassName,
  expandedRowKeys,
  defaultExpandedRowKeys = [],
  onExpandedRowsChange,
  onExpand,
  renderChildFooter,
  scroll,
}: TableProps<T>) {
  const [page, setPage] = useState(1),
    [localPageSize, setLocalPageSize] = useState(10),
    [sort, setSort] = useState<any>(null),
    [localExpanded, setLocalExpanded] = useState(defaultExpandedRowKeys);
  const expandedKeys = expandedRowKeys ?? localExpanded;
  const changeExpanded = (keys: any[]) => {
    setLocalExpanded(keys);
    onExpandedRowsChange?.(keys);
  };
  const count = pagination?.pageSize ?? localPageSize,
    current = pagination?.current ?? page;
  useEffect(() => setPage(1), [data]);
  let records = sort
    ? [...data].sort((a, b) => {
        const c = columns[sort.index],
          v = c.sorter(a, b);
        return sort.desc ? -v : v;
      })
    : data;
  const rows =
    pagination && pagination.total === undefined
      ? records.slice((current - 1) * count, current * count)
      : records;
  const render = (r: any, i: number, depth = 0): React.ReactNode => {
    const k = typeof rowKey === "function" ? rowKey(r) : (r[rowKey] ?? i);
    const open = expandedKeys.includes(k),
      has = Array.isArray(r.children);
    const childFooter = open ? renderChildFooter?.(r) : null;
    return (
      <React.Fragment key={k}>
        <tr className={rowClassName?.(r, i)} {...onRow?.(r, i)}>
          {columns.map((c, j) => (
            <td
              key={c.key ?? c.dataIndex ?? j}
              style={{
                textAlign: c.align,
                width: c.width,
                paddingLeft: j === 0 ? 12 + depth * 18 : undefined,
              }}
            >
              {j === 0 && has && (
                <button
                  type="button"
                  aria-label={`${open ? "收起" : "展开"} ${r.objectName ?? r.label ?? k}`}
                  aria-expanded={open}
                  onClick={(e) => {
                    e.stopPropagation();
                    changeExpanded(
                      open
                        ? expandedKeys.filter((x: any) => x !== k)
                        : [...expandedKeys, k],
                    );
                    onExpand?.(r, !open);
                  }}
                >
                  {open ? "▾" : "▸"}
                </button>
              )}
              {c.render
                ? c.render(r[c.dataIndex], r, i)
                : (r[c.dataIndex] ?? "—")}
            </td>
          ))}
        </tr>
        {open &&
          r.children?.map((ch: any, n: number) => render(ch, n, depth + 1))}
        {childFooter && <tr><td colSpan={columns.length}>{childFooter}</td></tr>}
      </React.Fragment>
    );
  };
  return (
    <div aria-busy={loading}>
      <div className={css.tableRegion}>
      {loading && <div className={css.tableLoading} role="status">正在读取…</div>}
      <div
        className={`${css.tableScroll} dsh-table-body`}
        style={{ maxHeight: scroll?.y }}
      >
        <table className={css.table} style={{ minWidth: scroll?.x }}>
          <thead>
            <tr>
              {columns.map((c, i) => (
                <th
                  key={c.key ?? c.dataIndex ?? i}
                  style={{ textAlign: c.align, width: c.width }}
                >
                  {typeof c.sorter === "function" ? (
                    <button
                      onClick={() =>
                        setSort({
                          index: i,
                          desc: sort?.index === i ? !sort.desc : false,
                        })
                      }
                    >
                      {c.title} ↕
                    </button>
                  ) : (
                    c.title
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>{rows.map((r: any, i: number) => render(r, i))}</tbody>
        </table>
        {!rows.length && !loading && <p>暂无符合条件的数据</p>}
      </div>
      </div>
      {pagination && (
        <DataPagination
          pageNumber={current}
          pageSize={count}
          totalCount={pagination.total ?? data.length}
          onPageChange={(p: number) => {
            setPage(p);
            pagination.onChange?.(p, count);
          }}
          disabled={loading}
          pageSizeOptions={pagination.pageSizeOptions}
          onPageSizeChange={(size: number) => {
            setPage(1);
            setLocalPageSize(size);
            pagination.onPageSizeChange?.(size);
            pagination.onChange?.(1, size);
          }}
        />
      )}
    </div>
  );
}
export function DataPagination({
  pageNumber = 1,
  pageSize = 10,
  totalCount = 0,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 20, 50, 100],
  disabled,
  ariaLabel = "数据分页",
}: any) {
  const max = Math.max(1, Math.ceil(totalCount / pageSize));
  return (
    <nav className={css.pagination} aria-label={ariaLabel}>
      <span>共 {totalCount} 条</span>
      <select
        aria-label="每页条数"
        disabled={disabled}
        value={pageSize}
        onChange={(e) => onPageSizeChange?.(+e.target.value)}
      >
        {pageSizeOptions.map((n: number) => (
          <option key={n} value={n}>
            {n} 条/页
          </option>
        ))}
      </select>
      <Button
        disabled={disabled || pageNumber <= 1}
        onClick={() => onPageChange(pageNumber - 1)}
      >
        上一页
      </Button>
      <span>
        {pageNumber} / {max}
      </span>
      <Button
        disabled={disabled || pageNumber >= max}
        onClick={() => onPageChange(pageNumber + 1)}
      >
        下一页
      </Button>
    </nav>
  );
}
export const Message = {
  warning: (text: string) =>
    window.dispatchEvent(
      new CustomEvent("gea-query-warning", { detail: { message: text } }),
    ),
  error: (text: string) =>
    window.dispatchEvent(
      new CustomEvent("gea-query-warning", { detail: { message: text } }),
    ),
};
