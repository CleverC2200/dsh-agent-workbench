import { formatChainValue } from '../../../../../../../shared/full-chain-display';
import { formatFactValue } from '../../../../../../../shared/fact-display';
import React, { useEffect, useMemo, useState } from 'react';
import {
  categorySummary,
  categoryTreeReader,
  layerLabels,
  treeNumber,
  treeRatio,
  treeRisks,
  type ChainLayer,
  type TreeRow,
} from '../../../../../../../shared/qll-category-tree';
import { ownContextPart } from '../../../native/context';
import config from '../../../../../../sql.config.json';
import css from './category-hierarchy.module.css';
import { DashboardTableSkeleton } from '../../../dsh-ui/workbench-loading';

type Page = { rows: TreeRow[]; hasNext: boolean; snapshot?: string };
type Read = ReturnType<typeof categoryTreeReader>;
const show = (value: unknown) =>
  treeNumber(value)?.toLocaleString('zh-CN', { maximumFractionDigits: 2 }) ?? '-';
function Quantity({ value }: { value: unknown }) {
  const n = treeNumber(value);
  return (
    <td title={n === null ? undefined : formatFactValue(value, 'decimal') + '件'}>
      {formatChainValue(n, '件')}
    </td>
  );
}
function Values({ row, layer, channel }: { row: TreeRow; layer?: ChainLayer; channel: boolean }) {
  const date = row.source_date
    ? row.latest_date && row.latest_date !== row.source_date
      ? `${row.source_date}～${row.latest_date}`
      : row.source_date
    : '-';
  return (
    <>
      <td>
        {treeNumber(row.risk_rank) === null ? '-' : (treeRisks[Number(row.risk_rank)] ?? '-')}
      </td>
      <Quantity value={layer === 'customer' ? 0 : row.inventory} />
      <Quantity value={layer ? (layer === 'base' ? row.inventory : 0) : row.base_inventory} />
      <Quantity value={layer ? (layer === 'branch' ? row.inventory : 0) : row.branch_inventory} />
      {channel && (
        <Quantity
          value={layer ? (layer === 'customer' ? row.inventory : 0) : row.customer_inventory}
        />
      )}
      <Quantity value={layer === 'customer' ? null : row.gap} />
      <td>{show(treeRatio(row.turnover_qty, row.daily))}</td>
      <td>{show(treeRatio(row.age_sum, row.age_qty))}</td>
      <Quantity value={row.overaged} />
      <td>{show(treeRatio(row.target_turnover_qty, row.target_daily))}</td>
      <td>{date}</td>
    </>
  );
}
function Pager({
  page,
  next,
  busy,
  setPage,
}: {
  page: number;
  next: boolean;
  busy: boolean;
  setPage: (page: number) => void;
}) {
  return (
    <div className={css.pager} aria-label="明细分页">
      <span>10 条/页</span>
      <button disabled={busy || page === 1} onClick={() => setPage(page - 1)}>
        上一页
      </button>
      <span>第 {page} 页</span>
      <button disabled={busy || !next} onClick={() => setPage(page + 1)}>
        下一页
      </button>
    </div>
  );
}
function Table({ channel, children }: { channel: boolean; children: React.ReactNode }) {
  return (
    <div className={css.scroll}>
      <table>
        <thead>
          <tr>
            {[
              '品类 / 层级 / 组织 / SKU',
              '经营状态',
              '公司实物库存（件）',
              '基地库存（件）',
              '分仓库存（件）',
              ...(channel ? ['渠道库存（件）'] : []),
              '公司目标差额（件）',
              '周转（天）',
              '平均货龄（天）',
              '大日期库存（件）',
              '目标周转（天）',
              '数据日期',
            ].map((label) => (
              <th key={label}>{label}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
function ExpandRow({
  label,
  row,
  layer,
  channel,
  children,
}: {
  label: string;
  row: TreeRow;
  layer?: ChainLayer;
  channel: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <tr>
        <td>
          <button className={css.expand} aria-expanded={open} onClick={() => setOpen(!open)}>
            <span aria-hidden="true">{open ? '▾' : '▸'}</span>
            {label}
          </button>
        </td>
        <Values row={row} layer={layer} channel={channel} />
      </tr>
      {open && (
        <tr>
          <td className={css.child} colSpan={channel ? 12 : 11}>
            {children}
          </td>
        </tr>
      )}
    </>
  );
}
function Children({
  read,
  date,
  snapshot,
  layer,
  category,
  organization,
  channel,
}: {
  read: Read;
  date: string;
  snapshot?: string;
  layer: ChainLayer;
  category: string;
  organization?: string;
  channel: boolean;
}) {
  const [page, setPage] = useState(1),
    [search, setSearch] = useState(''),
    [draft, setDraft] = useState(''),
    [risk, setRisk] = useState(''),
    [retry, setRetry] = useState(0);
  const [result, setResult] = useState<Page | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(true);
  const leaf = organization !== undefined;
  useEffect(() => {
    const controller = new AbortController();
    setBusy(true);
    setError('');
    setResult(null);
    void read(
      layer,
      {
        date,
        snapshot,
        level: leaf ? 'sku' : 'organization',
        category,
        organization,
        page,
        search,
        risk,
      },
      controller.signal,
    )
      .then((value) => {
        if (!controller.signal.aborted) setResult(value);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [read, date, snapshot, layer, category, organization, page, search, risk, retry]);
  useEffect(
    () =>
      result
        ? ownContextPart('detail', {
            kind: 'category-tree',
            layer,
            category,
            organization,
            page,
            search,
            risk,
            ...result,
            coverage: '当前展开范围分页，不能替代全量汇总',
          })
        : undefined,
    [result, layer, category, organization, page, search, risk],
  );
  return (
    <section
      aria-label={`${category} / ${layerLabels[layer]}${organization ? ` / ${organization} SKU 明细` : '组织明细'}`}
    >
      {leaf && (
        <form
          className={css.filters}
          onSubmit={(e) => {
            e.preventDefault();
            setSearch(draft);
            setPage(1);
          }}
        >
          <label>
            状态
            <select
              aria-label="状态快捷筛选"
              value={risk}
              onChange={(e) => {
                setRisk(e.target.value);
                setPage(1);
              }}
            >
              {treeRisks.map((label, i) => (
                <option key={label} value={i ? String(i) : ''}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            SKU
            <input
              aria-label="SKU 编码或名称"
              placeholder="编码或名称"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
          </label>
          <button>查询</button>
          <button
            type="button"
            onClick={() => {
              setDraft('');
              setSearch('');
              setRisk('');
              setPage(1);
            }}
          >
            重置
          </button>
        </form>
      )}
      {busy && <p role="status">正在读取{leaf ? 'SKU' : '组织'}明细…</p>}
      {error && (
        <p role="alert">
          {error} <button onClick={() => setRetry(retry + 1)}>重试</button>
        </p>
      )}
      {result && (
        <>
          <Table channel={channel}>
            {result.rows.map((row) =>
              leaf ? (
                <tr key={row.node_key}>
                  <td>
                    {row.node_key} {row.node_name !== row.node_key ? row.node_name : ''}
                  </td>
                  <Values row={row} layer={layer} channel={channel} />
                </tr>
              ) : (
                <ExpandRow
                  key={row.node_key}
                  label={row.node_name}
                  row={row}
                  layer={layer}
                  channel={channel}
                >
                  <Children
                    read={read}
                    date={date}
                    snapshot={result.snapshot}
                    category={category}
                    organization={row.node_key}
                    layer={layer}
                    channel={channel}
                  />
                </ExpandRow>
              ),
            )}
          </Table>
          {!result.rows.length && <p role="status">暂无符合条件的数据</p>}
          <Pager page={page} next={result.hasNext} busy={busy} setPage={setPage} />
        </>
      )}
    </section>
  );
}
function LayerCatalog({
  layer,
  read,
  date,
  onResult,
  onPending,
}: {
  layer: ChainLayer;
  read: Read;
  date: string;
  onResult: (layer: ChainLayer, value: Page) => void;
  onPending: (layer: ChainLayer, pending: boolean) => void;
}) {
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(true),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setBusy(true);
    onPending(layer, true);
    setError('');
    void (async () => {
      const rows: TreeRow[] = [];
      let snapshot: string | undefined;
      for (let page = 1; ; page++) {
        const value = await read(
          layer,
          { date, level: 'category', page, snapshot },
          controller.signal,
        );
        snapshot = value.snapshot;
        rows.push(...value.rows);
        if (!value.hasNext) {
          if (!controller.signal.aborted) onResult(layer, { rows, snapshot, hasNext: false });
          break;
        }
      }
    })()
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setBusy(false);
          onPending(layer, false);
        }
      });
    return () => controller.abort();
  }, [read, date, layer, retry, onResult, onPending]);
  return busy ? null : error ? (
    <p role="alert">
      {layerLabels[layer]}：{error} <button onClick={() => setRetry(retry + 1)}>重试</button>
    </p>
  ) : null;
}
export function CategoryHierarchy({ date, channel }: { date: string; channel: boolean }) {
  const read = useMemo(() => categoryTreeReader(config), []);
  const [catalog, setCatalog] = useState<Partial<Record<ChainLayer, Page>>>({}),
    [page, setPage] = useState(1);
  const [pending, setPending] = useState<Partial<Record<ChainLayer, boolean>>>({
    base: true,
    branch: true,
    customer: true,
  });
  const onPending = React.useCallback(
    (layer: ChainLayer, value: boolean) => setPending((old) => ({ ...old, [layer]: value })),
    [],
  );
  const receive = React.useCallback(
    (layer: ChainLayer, value: Page) => setCatalog((old) => ({ ...old, [layer]: value })),
    [],
  );
  const layers: ChainLayer[] = channel ? ['base', 'branch', 'customer'] : ['base', 'branch'];
  const active = Object.fromEntries(
    layers.filter((l) => catalog[l]).map((l) => [l, catalog[l]!.rows]),
  );
  const categories = [
    ...new Set(Object.values(active).flatMap((rows) => rows.map((r) => r.node_key))),
  ].sort();
  useEffect(() => setPage(1), [channel]);
  return (
    <div className={css.root} aria-label="品类结构四层下钻">
      {layers
        .filter((layer) => !catalog[layer])
        .map((layer) => (
          <LayerCatalog
            key={layer}
            layer={layer}
            read={read}
            date={date}
            onResult={receive}
            onPending={onPending}
          />
        ))}
      {!layers.some((layer) => catalog[layer]) && layers.some((layer) => pending[layer]) ? (
        <DashboardTableSkeleton label="品类结构加载中" embedded />
      ) : (
        <>
          <Table channel={channel}>
            {categories.slice((page - 1) * 10, page * 10).map((category) => (
              <ExpandRow
                key={category}
                label={category}
                row={categorySummary(category, active)}
                channel={channel}
              >
                <Table channel={channel}>
                  {layers.map((layer) => {
                    const row = catalog[layer]?.rows.find((r) => r.node_key === category);
                    return row ? (
                      <ExpandRow
                        key={layer}
                        label={layerLabels[layer]}
                        row={row}
                        layer={layer}
                        channel={channel}
                      >
                        <Children
                          read={read}
                          date={date}
                          snapshot={catalog[layer]?.snapshot}
                          category={category}
                          layer={layer}
                          channel={channel}
                        />
                      </ExpandRow>
                    ) : (
                      <tr key={layer}>
                        <td>{layerLabels[layer]}</td>
                        <td colSpan={channel ? 11 : 10}>
                          {catalog[layer] ? '该品类无数据' : '该层数据尚未取得'}
                        </td>
                      </tr>
                    );
                  })}
                </Table>
              </ExpandRow>
            ))}
          </Table>
          {layers.every((l) => catalog[l]) && categories.length === 0 && (
            <p role="status">暂无符合条件的数据</p>
          )}
          <Pager page={page} next={page * 10 < categories.length} busy={false} setPage={setPage} />
        </>
      )}
    </div>
  );
}
