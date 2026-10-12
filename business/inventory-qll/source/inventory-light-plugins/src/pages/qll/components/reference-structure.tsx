import { reportElements } from '../../../channel.js';
import { structureReferences, structureViewEvidence } from './structure-evidence';
import { ownContextPart } from '../../../native/context';
import { createPortal } from 'react-dom';
import { useEffect, useMemo, useState } from 'react';
import { Button, Modal, Tag } from '../../../dsh-ui/controls';
import { Table } from './viewport-table';
import { useTreePages } from './use-tree-pages';
import {
  summarizeStructure,
  completeTotal,
} from 'dsh-agent-manage/inventory-compute/full-chain-category-structure';
import type {
  FullChainWorkspace,
  StructureRow,
} from 'dsh-agent-manage/inventory-compute/full-chain-types';
import styles from './full-chain-workbench.module.css';
const layerName = { base: '基地', branch: '分仓', customer: '渠道观察' };
const number = (n: number | null | undefined, digits = 0) =>
  n == null
    ? '-'
    : n.toLocaleString('zh-CN', { maximumFractionDigits: digits, minimumFractionDigits: digits });
export const rowStatus = (row: StructureRow) =>
  row.confidence.includes('冲突')
    ? '数据待复核'
    : (row.bigDateQty ?? 0) > 0
      ? '大日期'
      : row.targetQty == null
        ? '数据待复核'
        : (row.differenceQty ?? 0) < 0
          ? '低库存'
          : '未命中风险';
type Node = {
  key: string;
  label: string;
  rows: StructureRow[];
  source?: StructureRow;
  children?: Node[];
};
function groups(rows: StructureRow[], key: (r: StructureRow) => string) {
  const map = new Map<string, StructureRow[]>();
  for (const r of rows) {
    const k = key(r);
    map.set(k, [...(map.get(k) ?? []), r]);
  }
  return [...map];
}
function orgKey(r: StructureRow) {
  return JSON.stringify([r.layer, r.objectId ?? r.objectName]);
}
export function ReferenceStructure({
  workspace,
  mode,
  sku,
  onSku,
  status,
  onStatus,
  toolbar,
  filters,
  onFilters,
}: {
  toolbar: HTMLElement | null;
  filters: { category: string; org: string };
  onFilters: (filters: { category: string; org: string }) => void;
  status: string;
  onStatus: (value: string) => void;
  workspace: FullChainWorkspace;
  mode: 'category' | 'organization';
  sku: string;
  onSku: (value: string) => void;
}) {
  const { category, org } = filters;
  const setCategory = (category: string) => onFilters({ ...filters, category });
  const setOrg = (org: string) => onFilters({ ...filters, org });
  const [search, setSearch] = useState(sku),
    [expanded, setExpanded] = useState<(string | number)[]>([]),
    [selected, setSelected] = useState<StructureRow | null>(null);
  const pages = useTreePages(workspace, 'structure');
  useEffect(() => {
    setExpanded([]);
    setSelected(null);
    setSearch(sku);
  }, [workspace.workspaceId, sku, mode]);
  const all = workspace.categoryStructure ?? [];
  const categories = [...new Set(all.map((r) => r.category))].sort();
  const organizations = [...new Map(all.map((r) => [orgKey(r), r])).values()];
  const filtered = all.filter(
    (r) =>
      (!category || r.category === category) &&
      (!org || orgKey(r) === org) &&
      (!status || rowStatus(r) === status),
  );
  const roots = useMemo(() => {
    const leaf = (row: StructureRow): Node => ({
      key: row.key,
      label: sku ? row.sku : row.objectName,
      rows: [row],
      source: row,
    });
    if (mode === 'category')
      return groups(filtered, (r) => r.category).map(([cat, rows]): Node => ({
        key: 'cat:' + cat,
        label: cat || '未分类',
        rows,
        children: groups(rows, (r) => r.layer).map(([layer, children]) => ({
          key: 'cat-layer:' + JSON.stringify([cat, layer]),
          label: layerName[layer as StructureRow['layer']],
          rows: children,
          children: children.map(leaf),
        })),
      }));
    return groups(filtered, (r) => r.layer).map(([layer, rows]): Node => ({
      key: 'layer:' + layer,
      label: layerName[layer as StructureRow['layer']],
      rows,
      children: groups(rows, orgKey).map(([id, children]) => ({
        key: 'org:' + id,
        label: children[0].objectName,
        rows: children,
        children: children.map((row) => ({ ...leaf(row), label: sku ? row.sku : row.category })),
      })),
    }));
  }, [all, category, org, status, mode, sku]);
  const attach = (node: Node): Node =>
    node.source
      ? {
          ...node,
          children:
            node.source.sku === '全部SKU'
              ? (pages.attach(node.source).children ?? []).map((r: StructureRow) => ({
                  key: r.key,
                  label: r.sku,
                  rows: [r],
                  source: r,
                }))
              : undefined,
        }
      : { ...node, children: node.children?.map(attach) };
  const toggle = (node: Node) => {
    if (node.source && node.source.sku !== '全部SKU') {
      setSelected(node.source);
      return;
    }
    const opening = !expanded.includes(node.key);
    setExpanded((keys) => (opening ? [...keys, node.key] : keys.filter((k) => k !== node.key)));
    if (opening && node.source) pages.activate(node.source);
  };
  const visible: StructureRow[] = [];
  const visit = (node: Node) => {
    if (node.source) visible.push(node.source);
    if (expanded.includes(node.key)) {
      node.children?.forEach(visit);
    }
  };
  roots.map(attach).forEach(visit);
  if (selected && !visible.some((row) => row.key === selected.key)) visible.push(selected);
  const references = structureReferences(workspace.workspaceId, visible, selected, 298);
  useEffect(() => {
    pages.retainVisible(roots.map(attach), expanded);
    const unregister = reportElements('chain-structure', references.elements);
    const releaseView = ownContextPart('structureView', {
      ...structureViewEvidence(workspace, filtered, filters, status, mode),
      referenceCoverage: references.coverage,
    });
    const release = selected ? ownContextPart('selectedStock', selected) : undefined;
    const withdraw = () => {
      unregister();
      release?.();
      releaseView();
    };
    window.addEventListener('gea-session-changing', withdraw);
    return () => {
      window.removeEventListener('gea-session-changing', withdraw);
      withdraw();
    };
  }, [workspace, roots, pages, expanded, selected, filters, status, mode]);
  const total = (n: Node, layer: StructureRow['layer']) =>
    completeTotal(n.rows.filter((r) => r.layer === layer).map((r) => r.currentQty));
  const company = (n: Node) =>
    completeTotal(n.rows.filter((r) => r.layer !== 'customer').map((r) => r.currentQty));
  const companyRows = (n: Node) => n.rows.filter((r) => r.layer !== 'customer');
  const metricRows = (n: Node) => (companyRows(n).length ? companyRows(n) : n.rows);
  const sameLayer = (n: Node) => new Set(n.rows.map((r) => r.layer)).size === 1;
  const summary = (n: Node) => summarizeStructure(n.rows, n.key, n.label);
  const companyGap = (n: Node) => {
    const rows = n.rows.filter((r) => r.layer !== 'customer');
    const targets = completeTotal(rows.map((r) => r.targetQty));
    return targets == null ? null : rows.reduce((s, r) => s + r.currentQty, 0) - targets;
  };
  const columns: any[] = [
    {
      title: mode === 'category' ? '品类 / 层级 / 组织 / SKU' : '组织 / 品类 / SKU',
      dataIndex: 'label',
      width: 250,
      render: (_: unknown, n: Node) => (
        <button
          className={styles.treeName}
          onClick={(e) => {
            e.stopPropagation();
            toggle(n);
          }}
        >
          {n.label}
        </button>
      ),
    },
    {
      title: '经营状态',
      width: 130,
      render: (_: unknown, n: Node) => {
        const labels = [...new Set(n.rows.map(rowStatus))];
        return labels.map((label) => (
          <span key={label} className={styles.stateBadge} data-state={label}>
            {label}
          </span>
        ));
      },
    },
    {
      title: '公司实物库存（件）',
      width: 140,
      align: 'right',
      render: (_: unknown, n: Node) => number(company(n)),
    },
    {
      title: '基地库存（件）',
      width: 125,
      align: 'right',
      render: (_: unknown, n: Node) => number(total(n, 'base')),
    },
    {
      title: '分仓库存（件）',
      width: 125,
      align: 'right',
      render: (_: unknown, n: Node) => number(total(n, 'branch')),
    },
    ...(workspace.scope === 'all-channel'
      ? [
          {
            title: '渠道日快照库存（件）',
            width: 160,
            align: 'right',
            render: (_: unknown, n: Node) => number(total(n, 'customer')),
          },
        ]
      : []),
    {
      title: '公司目标差额（件）',
      width: 145,
      align: 'right',
      render: (_: unknown, n: Node) => number(companyGap(n)),
    },
    {
      title: '周转（天）',
      width: 110,
      align: 'right',
      render: (_: unknown, n: Node) => (
        <span
          title={
            sameLayer(n)
              ? '基地使用计划日均；分仓使用实际日均出库；渠道仅作观察'
              : '各层分母不同，不合成周转天数'
          }
        >
          {number(sameLayer(n) ? summary(n).turnoverDays : null, 1)}
        </span>
      ),
    },
    {
      title: '平均货龄（天）',
      width: 125,
      align: 'right',
      render: (_: unknown, n: Node) =>
        number(summarizeStructure(metricRows(n), n.key, n.label).averageAgeDays, 1),
    },
    {
      title: '大日期库存（件）',
      width: 135,
      align: 'right',
      render: (_: unknown, n: Node) => (
        <span title="基地>60天、分仓及渠道≥60天；跨层汇总不含客户">
          {number(completeTotal(metricRows(n).map((r) => r.bigDateQty)))}
        </span>
      ),
    },
    {
      title: '目标周转（天）',
      width: 125,
      align: 'right',
      render: (_: unknown, n: Node) =>
        number(
          sameLayer(n) && n.rows[0].layer !== 'customer' ? summary(n).targetTurnoverDays : null,
          1,
        ),
    },
    {
      title: '数据日期',
      width: 120,
      render: (_: unknown, n: Node) => {
        const dates = [...new Set(n.rows.map((r) => r.sourceDate))].sort();
        return dates.length > 1 ? `${dates[0]} ～ ${dates.at(-1)}` : dates[0] || '-';
      },
    },
  ];
  const submitSku = () => onSku(search.trim());
  const filterControls = (
    <div className={styles.referenceFilters} role="group" aria-label="库存结构筛选">
      <label>
        {'品类'}
        <select
          aria-label="品类筛选"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="">{'全部品类'}</option>
          {categories.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </label>
      <label>
        {'SKU'}
        <input
          aria-label="SKU编码筛选"
          placeholder="输入完整SKU编码"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              submitSku();
            }
          }}
        />
      </label>
      <Button onClick={submitSku}>{'查询'}</Button>
      <label>
        {'组织'}
        <select aria-label="组织筛选" value={org} onChange={(e) => setOrg(e.target.value)}>
          <option value="">{'全部组织'}</option>
          {(['base', 'branch', 'customer'] as const)
            .filter((l) => l !== 'customer' || workspace.scope === 'all-channel')
            .map((l) => (
              <optgroup key={l} label={layerName[l]}>
                {organizations
                  .filter((r) => r.layer === l)
                  .map((r) => (
                    <option key={orgKey(r)} value={orgKey(r)}>
                      {r.objectName}
                    </option>
                  ))}
              </optgroup>
            ))}
        </select>
      </label>
      <label>
        {'状态'}
        <select aria-label="状态筛选" value={status} onChange={(e) => onStatus(e.target.value)}>
          <option value="">{'全部状态'}</option>
          {['低库存', '大日期', '数据待复核', '未命中风险'].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </label>
      <Button
        onClick={() => {
          onFilters({ category: '', org: '' });
          onStatus('');
          setSearch('');
          onSku('');
        }}
      >
        {'重置'}
      </Button>
      <span className={styles.filteredCount}>
        {filtered.length}
        {' 个品类×组织'}
      </span>
    </div>
  );
  return (
    <div className={styles.referenceStructure}>
      {toolbar ? createPortal(filterControls, toolbar) : filterControls}
      <Table
        rowKey="key"
        columns={columns}
        data={roots.map(attach)}
        scroll={{ x: columns.reduce((s: number, c: any) => s + c.width, 0) }}
        pagination={false}
        expandedRowKeys={expanded}
        onExpandedRowsChange={setExpanded}
        onExpand={(n: Node, open: boolean) => {
          if (open && n.source) pages.activate(n.source);
        }}
        onRow={(n: Node) => ({ onClick: () => toggle(n) })}
        renderChildFooter={(n: Node) => (n.source ? pages.footer(n.source) : null)}
      />
      {references.coverage.omittedRows > 0 && (
        <div role="status">
          {'当前可引用 '}
          {references.coverage.referencedRows}
          {'/'}
          {references.coverage.visibleRows}
          {' 行；请收窄筛选以引用其余行。'}
        </div>
      )}
      <div className={styles.referenceFoot}>
        {
          '品类 / 组织行点击展开；SKU 点击查看详情。公司实物库存与渠道观察分列；低于目标不代表已发生缺货。各层周转、货龄按各自口径展示。'
        }
      </div>
      <Modal
        visible={!!selected}
        title={selected ? `SKU ${selected.sku}` : ''}
        footer={null}
        onCancel={() => setSelected(null)}
        style={{
          width: 480,
          maxWidth: '95vw',
          height: '100dvh',
          maxHeight: '100dvh',
          margin: 0,
          marginLeft: 'auto',
          borderRadius: 0,
        }}
      >
        {selected && (
          <div className={styles.skuDetail}>
            <h3>
              {selected.objectName}
              {' · '}
              {selected.category}
            </h3>
            <Tag>{rowStatus(selected)}</Tag>
            <dl>
              {[
                ['库存', number(selected.currentQty) + ' 件'],
                [
                  '可用库存',
                  selected.availableQty == null ? '-' : number(selected.availableQty) + ' 件',
                ],
                ['目标库存', selected.targetQty == null ? '-' : number(selected.targetQty) + ' 件'],
                [
                  '平均货龄',
                  selected.averageAgeDays == null
                    ? '-'
                    : number(selected.averageAgeDays, 1) + ' 天',
                ],
                ['数据日期', selected.sourceDate],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
            <p>{selected.confidence}</p>
            <p>{selected.suggestedAction}</p>
          </div>
        )}
      </Modal>
    </div>
  );
}
