import { FullChainTrends } from './qll/components/full-chain-trends';
import { scopeDescription } from './qll/components/structure-evidence';
import { ReferenceStructure, rowStatus } from './qll/components/reference-structure';
import { customerMetrics } from 'dsh-agent-manage/inventory-compute/full-chain-customer-metrics';
import { WorkbenchLoading } from '../dsh-ui/workbench-loading';
import { reportElements as _reportElements } from '../channel.js';
import { updateContext, removeContextPart } from '../native/context';
import { usePageFilter } from '../native/page-filter.tsx';

import * as React from 'react';
import { createPageViewState, usePageViewField } from '../../../../../shared/view-state.js';
const view = createPageViewState('inventory-qll');
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  Alert,
  Button,
  Card,
  DatePicker,
  Input,
  Modal,
  Message as _Message,
  Radio as _Radio,
  Skeleton as _Skeleton,
  Space as _Space,
  Tabs,
  Tag,
  Tooltip,
  Typography,
} from '../dsh-ui/controls';

import { Table } from './qll/components/viewport-table';

import { IconInfoCircle, IconRefresh } from '../dsh-ui/icons';

import { z as _z } from 'zod';

import type {
  FullChainWorkspace,
  MetricValue,
  StructureRow,
  WorkspaceScope,
} from 'dsh-agent-manage/inventory-compute/full-chain-types';

import { appPath } from '../../../qll/src/lib/app-path.ts';

import {
  readWorkspaceResponse,
  workspaceViewKey,
  type CompanyWorkspace,
} from '../../../qll/src/lib/workspace-stream.ts';

import styles from './qll/components/full-chain-workbench.module.css';

import { WorkspaceDetailTree } from './qll/components/workspace-detail-tree.tsx';
import { useTreePages } from './qll/components/use-tree-pages';

const { Text } = Typography;

type KpiKey = keyof FullChainWorkspace['kpis'];

const KPI_COPY: Record<KpiKey, { title: string; eyebrow: string; target: string }> = {
  inventoryLevel: {
    title: '当前库存',
    eyebrow: '公司系统 / 全渠道观察',
    target: '目标库存',
  },
  turnover: { title: '库存周转', eyebrow: '去除内部流转', target: '参考口径' },
  aging: { title: '当前货龄', eyebrow: '公司体系平均货龄', target: '分层规则' },
  fulfillment: {
    title: '订单满足率',
    eyebrow: '本自然月',
    target: '目标满足率',
  },
  orderGap: { title: '当前订单', eyebrow: '当前备单量', target: '本月发货量' },
};

function formatMetric(value: number | null, unit: MetricValue['unit'], compact = false) {
  if (value == null) return '-';
  if (unit === '件' && compact && Math.abs(value) >= 10_000)
    return `${(value / 10_000).toFixed(2)} 万箱`;
  if (unit === '%') return `${value.toFixed(2)}%`;
  if (unit === '天') return `${value.toFixed(1)} 天`;
  return `${Math.round(value).toLocaleString('zh-CN')} ${unit === '件' ? '箱' : unit}`;
}

export function KpiCard({
  metricKey,
  metric,
  workspace,
  onOpen,
  maximumAges,
  periodShortages,
  channelSnapshot,
}: {
  metricKey: KpiKey;
  metric: MetricValue;
  workspace: FullChainWorkspace;
  onOpen: () => void;
  maximumAges?: { base: number | null; branch: number | null };
  periodShortages?: { base: number | null; branch: number | null };
  channelSnapshot?: {
    inventory: number | null;
    inTransit: number | null;
    stockDays: number | null;
    date?: string;
  };
}) {
  const copy = KPI_COPY[metricKey];
  const inventoryMetric =
    metricKey === 'inventoryLevel'
      ? (metric as FullChainWorkspace['kpis']['inventoryLevel'])
      : null;
  const primaryValue =
    metricKey === 'orderGap'
      ? (workspace.orderExecution?.currentOrderQty ?? null)
      : (inventoryMetric?.companyCurrent ?? metric.current);
  const cardValue = (value: number | null, unit: MetricValue['unit']) =>
    value == null ? '-' : formatMetric(value, unit, true).replace(/\s+/g, '');
  const splitValues =
    metricKey === 'turnover'
      ? [
          {
            label: '基地',
            value: workspace.layerMetrics?.base.turnoverDays ?? null,
            unit: '天' as const,
          },
          {
            label: '分仓',
            value: workspace.layerMetrics?.branch.turnoverDays ?? null,
            unit: '天' as const,
          },
        ]
      : metricKey === 'fulfillment'
        ? [
            { label: '基地', value: workspace.fulfillment.factory.rate, unit: '%' as const },
            { label: '分仓', value: workspace.fulfillment.branch.rate, unit: '%' as const },
          ]
        : null;
  const inventoryByLayer = (['base', 'branch'] as const).map((layer) => {
    const rows = workspace.structure.filter((row) => row.layer === layer);
    const values = rows.map((row) => (layer === 'base' ? row.currentQty : row.availableQty));
    return {
      label: layer === 'base' ? '基地库存' : '分仓可用',
      value:
        values.length && values.every((value) => value != null)
          ? values.reduce<number>((sum, value) => sum + value!, 0)
          : null,
    };
  });
  const customer = customerMetrics(workspace);
  const customerValue =
    metricKey === 'inventoryLevel'
      ? cardValue(customer.inventory, '箱')
      : metricKey === 'aging'
        ? `${cardValue(customer.averageAge, '天')} / ${cardValue(customer.over30, '件')}`
        : metricKey === 'turnover'
          ? customer.turnover != null
            ? cardValue(customer.turnover, '天')
            : customer.demandIncomplete
              ? '动销不全'
              : '-'
          : metricKey === 'orderGap'
            ? `复核 ${customer.reviewCount} 项`
            : '仅观测';
  const customerHelper =
    workspace.scope === 'all-channel' ? (
      <div>
        <dt>
          {metricKey === 'inventoryLevel'
            ? '客户库存总量'
            : metricKey === 'aging'
              ? '客户货龄 / >30天'
              : '客户'}
        </dt>
        <dd>
          {metricKey === 'inventoryLevel' ? (
            <>
              <span>{cardValue(customer.inventory, '箱')}</span>
            </>
          ) : (
            customerValue
          )}
        </dd>
      </div>
    ) : null;
  const channelRows =
    workspace.scope === 'all-channel' && channelSnapshot ? (
      metricKey === 'inventoryLevel' ? (
        <>
          <div title={channelSnapshot.date ? `客户库存快照：${channelSnapshot.date}` : undefined}>
            <dt>{'客户在仓'}</dt>
            <dd>{cardValue(channelSnapshot.inventory, '件')}</dd>
          </div>
          <div>
            <dt>{'客户在途'}</dt>
            <dd>{cardValue(channelSnapshot.inTransit, '件')}</dd>
          </div>
        </>
      ) : metricKey === 'turnover' ? (
        <div title="客户在仓及在途库存÷同范围近30日日均动销">
          <dt>{'客户库存支撑'}</dt>
          <dd>{cardValue(channelSnapshot.stockDays, '天')}</dd>
        </div>
      ) : null
    ) : null;
  const valueText = cardValue(primaryValue, metric.unit);
  const unavailable = primaryValue == null;
  const statusClass = metric.state === 'risk' ? styles.kpiStatusRisk : styles.kpiStatusCurrent;
  const layerSummary = (
    <div className={styles.kpiAuxiliary}>
      {(['base', 'branch'] as const).map((layer) => {
        const rows = workspace.structure.filter((row) => row.layer === layer);
        const total =
          rows.length && rows.every((row) => layer === 'base' || row.availableQty != null)
            ? rows.reduce(
                (sum, row) => sum + (layer === 'base' ? row.currentQty : row.availableQty!),
                0,
              )
            : null;
        const order = workspace.fulfillment[layer === 'base' ? 'factory' : 'branch'];
        const age = maximumAges
          ? maximumAges[layer]
          : (workspace.layerMetrics?.[layer].averageAgeDays ?? null);
        const value =
          metricKey === 'inventoryLevel'
            ? `${total != null && primaryValue ? ((total / primaryValue) * 100).toFixed(1) + '%' : '—'} / ${formatMetric(total, '件', true)}`
            : metricKey === 'turnover'
              ? formatMetric(workspace.layerMetrics?.[layer].turnoverDays ?? null, '天')
              : metricKey === 'aging'
                ? `${formatMetric(age, '天')} / ${formatMetric(workspace.aging.over30ByLayer?.[layer] ?? null, '件', true)}`
                : metricKey === 'fulfillment'
                  ? `${formatMetric(order.rate, '%')} / ${formatMetric(order.shippedQty ?? null, '件', true)}`
                  : formatMetric(
                      layer === 'branch'
                        ? (workspace.orderExecution?.currentBranchOrderQty ?? null)
                        : (workspace.orderExecution?.currentBaseOrderQty ?? null),
                      '件',
                      true,
                    );
        const explanation =
          metricKey === 'inventoryLevel'
            ? '占公司库存比例 / 库存量'
            : metricKey === 'turnover'
              ? '基地按计划日均需求；分仓按可用库存及实际出库'
              : metricKey === 'aging'
                ? `${maximumAges ? '最大库龄' : '平均货龄'} / >30天库存量；分层展示`
                : metricKey === 'fulfillment'
                  ? '基地按需求减缺口；分仓按运营事实发货÷订单'
                  : '最新备单快照的当前订单量';
        return (
          <div key={layer}>
            <span>{layer === 'base' ? '基地' : '分仓'}</span>
            <strong>{value}</strong>
            <small>{explanation}</small>
          </div>
        );
      })}
    </div>
  );
  return (
    <button
      type="button"
      className={`${styles.kpiButton} ${metric.state === 'risk' ? styles.kpiRisk : ''}`}
      onClick={onOpen}
    >
      <div className={styles.kpiCard}>
        <div className={styles.kpiTop}>
          <span className={styles.kpiTitle}>{copy.title}</span>
          {!unavailable && (
            <b className={`${styles.kpiStatus} ${statusClass}`}>
              {metric.state === 'risk' ? '需关注' : '当前值'}
            </b>
          )}
        </div>
        <Tooltip
          content={
            <>
              {metric.explanation}
              {metricKey === 'orderGap' && (
                <div>{'当前备单量来自基地与分仓最新备单快照，不以月累计订单替代'}</div>
              )}
              {inventoryMetric && inventoryMetric.planCustomerDate && (
                <div>
                  {'客户总量快照：'}
                  {inventoryMetric.planCustomerDate}
                  {'；在仓 + 在途'}
                </div>
              )}
              {inventoryMetric && inventoryMetric.observedCustomer > 0 && (
                <div>
                  {'客户日快照观察：'}
                  {cardValue(inventoryMetric.observedCustomer, '件')}
                </div>
              )}
              {layerSummary}
              {customerHelper && <dl className={styles.kpiHelpers}>{customerHelper}</dl>}
            </>
          }
        >
          {splitValues ? (
            <strong className={styles.kpiValue}>
              {cardValue(splitValues[0].value, splitValues[0].unit)}
              <small className={styles.kpiScopeLabel}>{'基地'}</small>
            </strong>
          ) : (
            <strong
              className={`${styles.kpiValue} ${unavailable ? styles.kpiUnavailable : metric.state === 'risk' ? styles.kpiValueRisk : ''}`}
            >
              {valueText}
            </strong>
          )}
        </Tooltip>
        {splitValues && (
          <dl className={styles.kpiHelpers}>
            <div>
              <dt>
                {'基地'}
                {metricKey === 'turnover' ? '周转' : '满足率'}
              </dt>
              <dd>{cardValue(splitValues[0].value, splitValues[0].unit)}</dd>
            </div>
            <div>
              <dt>
                {'分仓'}
                {metricKey === 'turnover' ? '周转' : '满足率'}
              </dt>
              <dd>{cardValue(splitValues[1].value, splitValues[1].unit)}</dd>
            </div>
            {channelRows}
          </dl>
        )}
        {!splitValues && (
          <dl className={styles.kpiHelpers}>
            {metricKey === 'inventoryLevel' ? (
              inventoryByLayer.map(({ label, value }) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{cardValue(value, '件')}</dd>
                </div>
              ))
            ) : metricKey === 'aging' ? (
              <>
                <div>
                  <dt>{'基地货龄'}</dt>
                  <dd>
                    {cardValue(
                      maximumAges
                        ? maximumAges.base
                        : (workspace.layerMetrics?.base.averageAgeDays ?? null),
                      '天',
                    )}
                  </dd>
                </div>
                <div>
                  <dt>{'分仓货龄'}</dt>
                  <dd>
                    {cardValue(
                      maximumAges
                        ? maximumAges.branch
                        : (workspace.layerMetrics?.branch.averageAgeDays ?? null),
                      '天',
                    )}
                  </dd>
                </div>
              </>
            ) : metricKey === 'turnover' ? (
              <>
                <div>
                  <dt>{'基地周转'}</dt>
                  <dd>{cardValue(workspace.layerMetrics?.base.turnoverDays ?? null, '天')}</dd>
                </div>
                <div>
                  <dt>{'分仓周转'}</dt>
                  <dd>{cardValue(workspace.layerMetrics?.branch.turnoverDays ?? null, '天')}</dd>
                </div>
              </>
            ) : metricKey === 'fulfillment' ? (
              <>
                <div>
                  <dt>{'基地满足率'}</dt>
                  <dd>{cardValue(workspace.fulfillment.factory.rate, '%')}</dd>
                </div>
                <div>
                  <dt>{'分仓满足率'}</dt>
                  <dd>{cardValue(workspace.fulfillment.branch.rate, '%')}</dd>
                </div>
              </>
            ) : metricKey === 'orderGap' ? (
              <>
                <div>
                  <dt>{periodShortages ? '基地本月缺货量' : '基地缺货量'}</dt>
                  <dd>
                    {cardValue(
                      periodShortages
                        ? periodShortages.base
                        : (workspace.orderExecution?.currentBaseShortageQty ?? null),
                      '件',
                    )}
                  </dd>
                </div>
                <div>
                  <dt>{periodShortages ? '分仓本月缺货量' : '分仓缺货量'}</dt>
                  <dd>
                    {cardValue(
                      periodShortages
                        ? periodShortages.branch
                        : (workspace.orderExecution?.currentBranchShortageQty ?? null),
                      '件',
                    )}
                  </dd>
                </div>
              </>
            ) : (
              <>
                <div>
                  <dt>{copy.target}</dt>
                  <dd>{cardValue(metric.target, metric.unit)}</dd>
                </div>
                <div>
                  <dt>{'较目标差异'}</dt>
                  <dd>
                    {metric.current == null || metric.target == null
                      ? '-'
                      : `${metric.current > metric.target ? '+' : ''}${metric.unit === '%' ? `${(metric.current - metric.target).toFixed(2)}个百分点` : cardValue(metric.current - metric.target, metric.unit)}`}
                  </dd>
                </div>
              </>
            )}
            {channelRows}
          </dl>
        )}
      </div>
    </button>
  );
}

function LayerTag({ layer }: { layer: StructureRow['layer'] }) {
  const config =
    layer === 'base'
      ? ['基地', 'blue']
      : layer === 'branch'
        ? ['分仓', 'gray']
        : ['客户观察', 'gray'];
  return <Tag color={config[1]}>{config[0]}</Tag>;
}

function groupBy<T>(rows: T[], key: (row: T) => string) {
  const groups = new Map<string, T[]>();
  for (const row of rows) groups.set(key(row), [...(groups.get(key(row)) ?? []), row]);
  return groups;
}

function aggregateStructureNode(
  key: string,
  layer: StructureRow['layer'],
  objectName: string,
  category: string,
  rows: StructureRow[],
  children: StructureRow[],
): StructureRow {
  const currentQty = rows.reduce((total, row) => total + row.currentQty, 0);
  const targets = rows.map((row) => row.targetQty);
  const targetQty =
    targets.length > 0 && targets.every((value) => value != null)
      ? targets.reduce<number>((total, value) => total + (value ?? 0), 0)
      : null;
  const ageQty = rows.reduce(
    (total, row) => total + (row.averageAgeDays == null ? 0 : row.currentQty),
    0,
  );
  const averageAgeDays =
    ageQty > 0
      ? rows.reduce((total, row) => total + (row.averageAgeDays ?? 0) * row.currentQty, 0) / ageQty
      : null;
  const dated = rows.filter((row) => row.bigDateQty != null);
  const bigDateQty =
    dated.length === rows.length
      ? dated.reduce((total, row) => total + (row.bigDateQty ?? 0), 0)
      : null;
  const hasAgeRisk = rows.some((row) => row.judgment === '存在大日期库存');
  const turnoverDemand30d =
    rows.length && rows.every((row) => row.turnoverDemand30d != null)
      ? rows.reduce((total, row) => total + row.turnoverDemand30d!, 0)
      : null;
  const plannedDailyQty =
    rows.length && rows.every((row) => row.plannedDailyQty != null)
      ? rows.reduce((sum, row) => sum + row.plannedDailyQty!, 0)
      : null;
  const forecastInventoryQty =
    rows.length &&
    rows.every((row) => row.forecastInventoryQty != null && row.forecastInventoryQty >= 0)
      ? rows.reduce((sum, row) => sum + row.forecastInventoryQty!, 0)
      : null;
  return {
    key,
    layer,
    objectName,
    objectId: rows.every((row) => row.objectId === rows[0]?.objectId)
      ? rows[0]?.objectId
      : undefined,
    parentName: null,
    category,
    sku: '全部SKU',
    currentQty,
    availableQty: rows.every((row) => row.availableQty != null)
      ? rows.reduce((total, row) => total + (row.availableQty ?? 0), 0)
      : null,
    targetQty,
    differenceQty: targetQty == null ? null : currentQty - targetQty,
    turnoverDemand30d,
    plannedDailyQty,
    forecastInventoryQty,
    targetTurnoverDays:
      plannedDailyQty != null && plannedDailyQty > 0 && targetQty != null
        ? targetQty / plannedDailyQty
        : null,
    projectedTurnoverDays:
      plannedDailyQty != null &&
      plannedDailyQty > 0 &&
      forecastInventoryQty != null &&
      forecastInventoryQty >= 0
        ? forecastInventoryQty / plannedDailyQty
        : null,
    turnoverDays:
      turnoverDemand30d != null && turnoverDemand30d > 0
        ? Number(
            (
              (layer === 'branch'
                ? rows.reduce((sum, row) => sum + (row.availableQty ?? 0), 0)
                : currentQty) /
              (turnoverDemand30d / 30)
            ).toFixed(2),
          )
        : null,
    averageAgeDays: averageAgeDays == null ? null : Number(averageAgeDays.toFixed(1)),
    bigDateQty,
    judgment: hasAgeRisk
      ? '下级存在大日期库存'
      : targetQty == null
        ? '部分目标不可用'
        : '查看下级明细',
    suggestedAction: hasAgeRisk ? '展开定位并按层处理' : '展开查看品类与 SKU',
    owner: layer === 'base' ? '基地计划' : layer === 'branch' ? '分仓运营' : '经销商运营',
    sourceDate:
      rows
        .map((row) => row.sourceDate)
        .sort()
        .at(-1) ?? '',
    confidence: '下级真实记录汇总',
    children,
  };
}

function buildStructureTree(rows: StructureRow[], scoped = false) {
  return [...groupBy(rows, (row) => row.layer).entries()].map(([layer, layerRows]) => {
    const objectNodes = [
      ...groupBy(layerRows, (row) => `${row.objectId ?? ''}\u0000${row.objectName}`).entries(),
    ].map(([objectKey, objectRows]) => {
      const objectName = objectKey.split('\u0000').at(-1) ?? objectKey;
      const objectId = objectRows[0]?.objectId ?? objectName;
      if (
        objectRows.length === 1 &&
        objectRows[0]!.category === '全部品类' &&
        objectRows[0]!.sku === '全部SKU'
      ) {
        return { ...objectRows[0]!, children: [] };
      }
      const categoryNodes = [...groupBy(objectRows, (row) => row.category).entries()].map(
        ([category, categoryRows]) =>
          categoryRows.length === 1 && categoryRows[0]!.sku === '全部SKU'
            ? { ...categoryRows[0]!, children: [] }
            : aggregateStructureNode(
                `group:${layer}:${objectId}:${objectName}:${category}`,
                layer as StructureRow['layer'],
                objectName,
                category,
                categoryRows,
                categoryRows,
              ),
      );
      return aggregateStructureNode(
        `group:${layer}:${objectId}:${objectName}`,
        layer as StructureRow['layer'],
        objectName,
        '全部品类',
        objectRows,
        categoryNodes,
      );
    });
    const label = `${scoped ? '当前范围 · ' : '全国'}${layer === 'base' ? '基地' : layer === 'branch' ? '分仓' : '客户观察'}`;
    return aggregateStructureNode(
      `group:${layer}`,
      layer as StructureRow['layer'],
      label,
      '全部品类',
      layerRows,
      objectNodes,
    );
  });
}

function InventoryKpiDetail({
  workspace,
  metricKey,
}: {
  workspace: FullChainWorkspace;
  metricKey: 'inventoryLevel' | 'turnover' | 'aging';
}) {
  const viewKey = workspaceViewKey(workspace);
  const [selection, setSelection] = useState<StructureRow | null>(null);
  const [_result, setResult] = useState(workspace);
  const [_busy, setBusy] = useState(false);
  const [_failed, setFailed] = useState('');
  const [attempt, _setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setFailed('');
    if (!selection || selection.key.startsWith('group:')) {
      setResult(workspace);
      setBusy(false);
      return;
    }
    setBusy(true);
    const params = new URLSearchParams({
      scope: workspace.scope,
      ...workspace.filters,
    });
    params.delete('base');
    params.delete('branch');
    params.delete('customerId');
    params.set(
      selection.layer === 'base' ? 'base' : selection.layer === 'branch' ? 'branch' : 'customerId',
      selection.layer === 'customer' ? selection.objectId! : selection.objectName,
    );
    void fetch(appPath(`/api/workspace?${params}`), {
      signal: controller.signal,
      cache: 'no-store',
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok || data.contractVersion !== 'full-chain-workspace/v1')
          throw new Error(data.error || '当前对象趋势加载失败，未沿用其他对象数据。');
        if (!controller.signal.aborted) setResult(data);
      })
      .catch((error) => {
        if (!controller.signal.aborted) setFailed(error.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [viewKey, selection, attempt]);
  useEffect(() => {
    if (!selection || selection.key.startsWith('group:')) setResult(workspace);
  }, [workspace, selection]);
  const layers = buildStructureTree(workspace.structure).map((row) => ({
    ...row,
    ...(row.layer !== 'customer'
      ? {
          averageAgeDays: workspace.layerMetrics?.[row.layer].averageAgeDays ?? null,
          turnoverDays: workspace.layerMetrics?.[row.layer].turnoverDays ?? null,
        }
      : {}),
    children: row.children?.map((child) => ({ ...child, children: undefined })),
  }));
  const company = workspace.structure.filter((row) => row.layer !== 'customer');
  const national = {
    ...aggregateStructureNode(
      'national',
      'base',
      '全国汇总（公司体系）',
      '全部品类',
      company,
      layers,
    ),
    targetQty: workspace.kpis.inventoryLevel.target,
    turnoverDays: workspace.kpis.turnover.current,
    averageAgeDays: workspace.kpis.aging.current,
  };
  const qty = (value: number | null) =>
    value == null ? '—' : value.toLocaleString('zh-CN', { maximumFractionDigits: 2 });
  const columns = [
    { title: '对象', dataIndex: 'objectName', width: 230 },
    {
      title: '库存明细/件',
      dataIndex: 'currentQty',
      width: 140,
      render: (value: number) => qty(value),
    },
    ...(metricKey === 'inventoryLevel'
      ? [
          {
            title: '目标库存/件',
            dataIndex: 'targetQty',
            width: 140,
            render: (_: unknown, row: StructureRow) =>
              row.layer === 'customer' ? '不参与' : qty(row.targetQty),
          },
          {
            title: '偏差/件',
            dataIndex: 'differenceQty',
            width: 140,
            render: (_: unknown, row: StructureRow) =>
              row.layer === 'customer' || row.targetQty == null || row.currentQty == null
                ? '—'
                : qty(row.currentQty - row.targetQty),
          },
          {
            title: '占比',
            width: 100,
            render: (_: unknown, row: StructureRow) => {
              if (row.layer === 'customer') return '仅观测';
              const denominator =
                row.key === 'national' || row.key.startsWith('group:')
                  ? national.currentQty
                  : layers.find((layer) => layer.layer === row.layer)?.currentQty;
              return row.currentQty != null && denominator != null && denominator > 0
                ? `${((row.currentQty / denominator) * 100).toFixed(1)}%`
                : '—';
            },
          },
        ]
      : metricKey === 'turnover'
        ? [
            {
              title: '当前周转/天',
              dataIndex: 'turnoverDays',
              width: 140,
              render: qty,
            },
            {
              title: '目标周转/天',
              dataIndex: 'targetTurnoverDays',
              width: 140,
              render: (v: number | null) => qty(v ?? null),
            },
            {
              title: '月末预估周转/天',
              dataIndex: 'projectedTurnoverDays',
              width: 160,
              render: (v: number | null) => qty(v ?? null),
            },
          ]
        : [
            {
              title: '平均货龄/天',
              dataIndex: 'averageAgeDays',
              width: 140,
              render: qty,
            },
            {
              title: '分层大日期/件',
              dataIndex: 'bigDateQty',
              width: 160,
              render: (_: unknown, row: StructureRow) =>
                row.key === 'national' ? '不跨阈值合计' : qty(row.bigDateQty),
            },
            {
              title: '超期阈值',
              width: 180,
              render: (_: unknown, row: StructureRow) =>
                row.key === 'national'
                  ? '按层独立判断'
                  : row.layer === 'base'
                    ? '>60天'
                    : row.layer === 'branch'
                      ? '≥90天'
                      : '60/90/120天分级',
            },
          ]),
  ];
  return (
    <>
      <Table
        rowKey="key"
        data={[national]}
        columns={columns}
        pagination={false}
        defaultExpandedRowKeys={['national']}
        scroll={{ x: 800, y: 300 }}
        rowClassName={(row) =>
          (selection?.key ?? 'national') === row.key ? styles.selectedRow : ''
        }
        onRow={(row) => ({
          onClick: () => setSelection(row.key === 'national' ? null : (row as StructureRow)),
        })}
      />
    </>
  );
}

export function FullChainWorkbench() {
  const [scope, setScope] = usePageViewField(React, view, 'scope', 'company') as [
    WorkspaceScope,
    React.Dispatch<React.SetStateAction<WorkspaceScope>>,
  ];
  const [asOf, setAsOf] = usePageViewField(React, view, 'asOf', '');
  const [month, setMonth] = usePageViewField(React, view, 'month', '2026-09');
  const [workspace, setWorkspace] = useState<
    (CompanyWorkspace & { channelUnavailable?: string }) | null
  >(null);
  const _structurePages = useTreePages(workspace, 'structure');
  const viewKey = workspaceViewKey(workspace);
  const [loading, setLoading] = useState(true);
  const loadController = useRef<AbortController | null>(null);
  useEffect(() => () => loadController.current?.abort(), []);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = usePageViewField(React, view, 'tab', 'category');
  const [skuFilter, setSkuFilter] = usePageViewField(React, view, 'sku', '');
  const [queryDraft, setQueryDraft] = useState(() => ({ asOf, month, sku: skuFilter }));
  useEffect(() => setQueryDraft({ asOf, month, sku: skuFilter }), [asOf, month, skuFilter]);
  const submitQuery = () => {
    setAsOf(queryDraft.asOf);
    setMonth(queryDraft.month);
    setSkuFilter(queryDraft.sku.trim());
  };
  const [riskFilter, setRiskFilter] = usePageViewField(React, view, 'risk', '');
  const [filterToolbar, setFilterToolbar] = useState<HTMLDivElement | null>(null);
  const [structureFilters, setStructureFilters] = usePageViewField(
    React,
    view,
    'structureFilters',
    () => ({ category: '', org: '' }),
  );
  const [detailKpi, setDetailKpi] = useState<KpiKey | null>(null);

  const [_boardWidth, _setBoardWidth] = useState<number | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const boardScrollRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;
    const observer = new ResizeObserver(() => {
      boardScrollRef.current?.style.setProperty(
        '--workbench-header-height',
        `${header.getBoundingClientRect().height}px`,
      );
    });
    observer.observe(header);
    return () => observer.disconnect();
  }, []);
  const showDetailTab = useCallback((tab: string) => {
    setActiveTab(tab);
    requestAnimationFrame(() => {
      const board = boardScrollRef.current;
      const scroll = window.innerWidth <= 760 ? panelRef.current : board;
      const tabs = board?.querySelector<HTMLElement>('.dsh-tabs');
      if (!scroll || !tabs) return;
      const headerHeight =
        window.innerWidth <= 760 ? (headerRef.current?.getBoundingClientRect().height ?? 0) : 0;
      scroll.scrollTo({
        top: Math.max(
          0,
          scroll.scrollTop +
            tabs.getBoundingClientRect().top -
            scroll.getBoundingClientRect().top -
            headerHeight,
        ),
        behavior: 'instant',
      });
    });
  }, []);
  const [_expandedRows, setExpandedRows] = useState<(string | number)[]>([]);
  const [_detailLoading, setDetailLoading] = useState(false);
  const detailRequest = useRef<AbortController | null>(null);
  useEffect(() => {
    detailRequest.current?.abort();
    setExpandedRows([]);
    setDetailLoading(false);
    return () => detailRequest.current?.abort();
  }, [viewKey]);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      loadController.current?.abort();
      const controller = new AbortController();
      loadController.current = controller;
      const requestSignal = signal
        ? AbortSignal.any([signal, controller.signal])
        : controller.signal;
      setLoading(true);
      setWorkspace(null);
      removeContextPart('fullChainWorkspace');
      removeContextPart('structureView');
      removeContextPart('detail');
      removeContextPart('trendView');
      updateContext('queryState', { state: 'loading', scope, month, sku: skuFilter });
      setError(null);
      try {
        const params = new URLSearchParams({
          asOf,
          scope,
          month,
          part: 'current',
          ...(skuFilter ? { sku: skuFilter } : {}),
        });

        const response = await fetch(appPath(`/api/workspace?${params}`), {
          signal: requestSignal,
          cache: 'no-store',
          headers: { accept: 'application/json' },
        });
        await readWorkspaceResponse(
          response,
          (payload) => {
            setWorkspace(payload);
            setLoading(false);
          },
          requestSignal,
        );
      } catch (caught) {
        if (requestSignal.aborted) return;
        const message = caught instanceof Error ? caught.message : '全链路库存加载失败';
        setWorkspace(null);
        setError(message);
      } finally {
        if (!requestSignal.aborted) setLoading(false);
      }
    },
    [month, scope, skuFilter, asOf],
  );
  const changeScope = (next: WorkspaceScope) => {
    if (next === scope) return;
    loadController.current?.abort();
    detailRequest.current?.abort();
    setScope(next);
    setWorkspace(null);
    setLoading(true);
    setError(null);
    setDetailKpi(null);
  };
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);
  useEffect(() => {
    detailRequest.current?.abort();
    setDetailLoading(false);
  }, [scope, month]);
  const _structureColumns = useMemo(
    () => [
      {
        title: '对象 / 大类 / SKU',
        dataIndex: 'objectName',
        width: 210,
        render: (_: unknown, row: StructureRow) => (
          <strong className={styles.objectName}>
            {row.sku !== '全部SKU'
              ? row.sku
              : row.category !== '全部品类'
                ? row.category || '未分类'
                : row.objectName}
          </strong>
        ),
      },
      {
        title: '当前库存（件）',
        dataIndex: 'currentQty',
        width: 132,
        align: 'right' as const,
        sorter: (a: StructureRow, b: StructureRow) => a.currentQty - b.currentQty,
        render: (value: number) => Math.round(value).toLocaleString('zh-CN'),
      },
      {
        title: '目标库存（件）',
        dataIndex: 'targetQty',
        width: 132,
        align: 'right' as const,
        render: (value: number | null, row: StructureRow) =>
          row.layer === 'customer' ? (
            '不参与'
          ) : value == null ? (
            <Text type="secondary">{'不可用'}</Text>
          ) : (
            Math.round(value).toLocaleString('zh-CN')
          ),
      },
      {
        title: '差异（件）',
        dataIndex: 'differenceQty',
        width: 112,
        align: 'right' as const,
        render: (value: number | null, row: StructureRow) =>
          row.layer === 'customer' || value == null ? (
            '—'
          ) : (
            <span className={styles.directional}>{Math.round(value).toLocaleString('zh-CN')}</span>
          ),
      },
      {
        title: '库存占比',
        width: 88,
        align: 'right' as const,
        render: (_: unknown, row: StructureRow) => {
          const total =
            workspace?.scope === 'all-channel'
              ? workspace.kpis.inventoryLevel.observedTotal
              : workspace?.kpis.inventoryLevel.companyCurrent;
          return total != null && total > 0
            ? `${((row.currentQty / total) * 100).toFixed(1)}%`
            : '—';
        },
      },
      {
        title: '周转（天）',
        dataIndex: 'turnoverDays',
        width: 104,
        align: 'right' as const,
        render: (value: number | null) => (value == null ? '—' : value.toFixed(1)),
      },
      {
        title: '平均货龄（天）',
        dataIndex: 'averageAgeDays',
        width: 112,
        align: 'right' as const,
        render: (value: number | null) => (value == null ? '—' : value.toFixed(1)),
      },
      {
        title: '目标周转（天）',
        dataIndex: 'targetTurnoverDays',
        width: 128,
        align: 'right' as const,
        render: (value: number | null) => (value == null ? '—' : value.toFixed(1)),
      },
      {
        title: '月末预估周转（天）',
        dataIndex: 'projectedTurnoverDays',
        width: 156,
        align: 'right' as const,
        render: (value: number | null, row: StructureRow) =>
          value == null ? (
            <Tooltip
              content={
                row.layer === 'base'
                  ? '基地来源尚未提供月末预测库存'
                  : '预计月末库存或计划日均不完整，或不满足计算条件'
              }
            >
              <span>{row.layer === 'base' ? '未接入' : '数据不完整'}</span>
            </Tooltip>
          ) : (
            value.toFixed(1)
          ),
      },
      {
        title: '大日期库存（件）',
        dataIndex: 'bigDateQty',
        width: 140,
        align: 'right' as const,
        render: (value: number | null) =>
          value == null ? (
            <Tooltip content="未匹配到货龄批次，或批次货龄不完整">
              <span>{'货龄待补齐'}</span>
            </Tooltip>
          ) : (
            Math.round(value).toLocaleString('zh-CN')
          ),
      },
      {
        title: '层级',
        dataIndex: 'layer',
        width: 72,
        render: (_: unknown, row: StructureRow) => <LayerTag layer={row.layer} />,
      },
      { title: '判断', dataIndex: 'judgment', width: 160 },
      { title: '负责人', dataIndex: 'owner', width: 104 },
      { title: '建议动作', dataIndex: 'suggestedAction', width: 220 },
      { title: '数据日期', dataIndex: 'sourceDate', width: 112 },
      { title: '数据说明', dataIndex: 'confidence', width: 180 },
    ],
    [workspace?.kpis.inventoryLevel, workspace?.scope],
  );
  const _structureTree = useMemo(() => {
    return buildStructureTree(
      workspace?.structure ?? [],
      Boolean(
        workspace?.filters.base || workspace?.filters.branch || workspace?.filters.customerId,
      ),
    ).map((row) =>
      row.layer === 'customer'
        ? row
        : {
            ...row,
            turnoverDays: workspace?.layerMetrics?.[row.layer].turnoverDays ?? row.turnoverDays,
          },
    );
  }, [workspace?.structure, workspace?.filters, workspace?.layerMetrics]);
  const agingRows = workspace
    ? (
        [
          'base',
          'branch',
          ...(workspace.scope === 'all-channel' ? ['customer' as const] : []),
        ] as const
      ).map((layer) => ({
        key: layer,
        layer,
        name:
          layer === 'base'
            ? '基地（>60天）'
            : layer === 'branch'
              ? '分仓（60–89天关注，≥90天超期）'
              : '客户（60/90/120天分级）',
        current: workspace.aging.byLayer[layer],
        attention: workspace.aging.attentionByLayer[layer],
        highRisk: workspace.aging.highRiskByLayer[layer],
        day7: workspace.aging.projections.day7.byLayer[layer],
        day14: workspace.aging.projections.day14.byLayer[layer],
      }))
    : [];
  const completeAvailable = (layer: StructureRow['layer']) => {
    const rows = workspace?.structure.filter((row) => row.layer === layer) ?? [];
    return rows.length > 0 && rows.every((row) => row.availableQty != null)
      ? rows.reduce((total, row) => total + (row.availableQty ?? 0), 0)
      : null;
  };
  const baseAvailable = completeAvailable('base');
  const branchAvailable = completeAvailable('branch');
  const shortageRows = workspace
    ? [
        {
          key: 'factory',
          path: '基地工厂提货',
          ...workspace.fulfillment.factory,
          pending: null,
          available: baseAvailable,
          collaborative: null,
          action: '核对缺口订单与基地可用库存',
          owner: '基地订单运营',
        },
        {
          key: 'branch',
          path: '分仓提货',
          ...workspace.fulfillment.branch,
          pending: workspace.pendingOrderGap,
          available: branchAvailable,
          collaborative: null,
          action: '核对待分配与可用库存，评估跨仓协同',
          owner: '分仓订单运营',
        },
        {
          key: 'national',
          path: '全国需求加权',
          ...workspace.fulfillment.national,
          pending: workspace.pendingOrderGap,
          available:
            baseAvailable != null && branchAvailable != null
              ? baseAvailable + branchAvailable
              : null,
          collaborative: null,
          action: '按缺口贡献下钻到履约路径',
          owner: '供应链运营',
        },
      ]
    : [];
  const selectedMetric = detailKpi && workspace ? workspace.kpis[detailKpi] : null;
  useEffect(() => {
    const current =
      !loading &&
      !error &&
      workspace &&
      workspace.filters.month === month &&
      (workspace.filters.sku ?? '') === skuFilter &&
      workspace.generatedAt.slice(0, 10) === asOf;
    updateContext('queryState', {
      state: loading || (!error && !current) ? 'loading' : error ? 'error' : 'ready',
      message: error ?? undefined,
      requestedScope: scope,
      asOf,
      month,
      sku: skuFilter,
    });
    if (!current) {
      removeContextPart('fullChainWorkspace');
      removeContextPart('structureView');
      removeContextPart('detail');
      removeContextPart('selectedStock');
      return;
    }
    updateContext('fullChainWorkspace', {
      dataMode: workspace.dataMode,
      realData: workspace.realData === true,
      requestedScope: scope,
      channelUnavailable: workspace.channelUnavailable,
      scope: workspace.scope,
      scopeDescription: scopeDescription(workspace.scope),
      requestedScopeDescription: scopeDescription(scope),
      filters: workspace.filters,
      workspaceId: workspace.workspaceId,
      source: workspace.freshness,
      coverage: workspace.coverage,
      confidence: workspace.confidence,
      kpis: workspace.kpis,
      layerMetrics: workspace.layerMetrics,
      orderExecution: workspace.orderExecution,
      visibleFilters: structureFilters,
      skuFilter,
      riskFilter,
      evidence: workspace.evidence,
      risks: workspace.risks,
      fullScopeStructureRowCount: workspace.structure.length,
      tab: activeTab,
    });
  }, [
    workspace,
    activeTab,
    loading,
    error,
    scope,
    month,
    skuFilter,
    structureFilters,
    riskFilter,
    asOf,
  ]);
  usePageFilter(
    {
      allowedFields: ['tab', 'scope', 'asOf', 'month', 'search'],
      tabs: ['category', 'structure', 'aging', 'shortage'],
      tab: activeTab,
      scope,
      asOf,
      month,
      search: skuFilter,
    },
    (args) => {
      if (args.scope !== undefined) changeScope(args.scope);
      if (args.asOf !== undefined) setAsOf(args.asOf);
      if (args.month !== undefined) setMonth(args.month);
      if (args.tab !== undefined) setActiveTab(args.tab);
      if (args.search !== undefined) setSkuFilter(args.search.trim());
    },
  );
  return (
    <main className={styles.shell}>
      <div className={styles.workspacePanels}>
        <section className={styles.workbench}>
          <header ref={headerRef} className={styles.header}>
            <h1 className={styles.title}>{'全链路库存'}</h1>
            <div className={styles.controls}>
              <label className={styles.channelSwitch}>
                <input
                  type="checkbox"
                  aria-label="含渠道"
                  checked={scope === 'all-channel'}
                  disabled={scope === 'company'}
                  onChange={() => changeScope('company')}
                  title="渠道读取未启用"
                />
                <span aria-hidden="true" />
                {'含渠道'}
              </label>
              <span className={styles.objectCount}>
                {workspace
                  ? `${new Set(workspace.structure.filter((r) => r.layer === 'base').map((r) => r.objectName)).size} 个基地 · ${new Set(workspace.structure.filter((r) => r.layer === 'branch').map((r) => r.objectName)).size} 个分仓${workspace.scope === 'all-channel' ? ` · ${workspace.coverage.coveredCustomers} 家客户` : ''}`
                  : '正在读取库存范围'}
              </span>
              <div className={styles.headerActions} role="group" aria-label="库存查询条件">
                <Input
                  aria-label="查询 SKU"
                  placeholder="SKU 编码，留空读全部"
                  value={queryDraft.sku}
                  maxLength={100}
                  onChange={(value) => setQueryDraft((draft) => ({ ...draft, sku: value }))}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      submitQuery();
                    }
                  }}
                  style={{ width: 180 }}
                />
                <DatePicker.DayPicker
                  aria-label="读取时点"
                  placeholder="读取时点"
                  value={queryDraft.asOf}
                  onChange={(value) => setQueryDraft((draft) => ({ ...draft, asOf: value ?? '' }))}
                />
                <DatePicker.MonthPicker
                  aria-label="库存查询月份"
                  size="small"
                  value={queryDraft.month}
                  onChange={(value) =>
                    value && setQueryDraft((draft) => ({ ...draft, month: value }))
                  }
                  allowClear={false}
                  style={{ width: 120 }}
                />
                <Button size="small" onClick={submitQuery}>
                  {'查询'}
                </Button>
                <Tooltip content="刷新库存数据">
                  <Button
                    aria-label="刷新库存数据"
                    size="small"
                    icon={<IconRefresh />}
                    loading={loading}
                    onClick={() => void load()}
                  />
                </Tooltip>
              </div>
            </div>
          </header>

          <div ref={boardScrollRef} className={styles.boardScroll}>
            {error && (
              <Alert
                type="error"
                content={error}
                action={<Button onClick={() => void load()}>{'重试'}</Button>}
              />
            )}
            {workspace?.channelUnavailable && (
              <Alert type="warning" content={workspace.channelUnavailable} />
            )}

            <div
              role={loading && !workspace ? 'status' : undefined}
              aria-label={
                loading && !workspace
                  ? `正在加载${scope === 'company' ? '公司系统' : '全渠道观察'}数据`
                  : undefined
              }
              aria-busy={loading && !workspace}
            >
              {loading && !workspace ? (
                <WorkbenchLoading compact embedded />
              ) : (
                <>
                  {workspace && (
                    <>
                      <div className={styles.kpiGrid}>
                        {(Object.keys(KPI_COPY) as KpiKey[]).map((key) => (
                          <KpiCard
                            key={key}
                            metricKey={key}
                            metric={workspace.kpis[key]}
                            workspace={workspace}
                            onOpen={() => setDetailKpi(key)}
                          />
                        ))}
                      </div>

                      <section className={styles.aiInsight} role="region" aria-label="AI 洞察">
                        <div className={styles.aiInsightHeading}>
                          <span className={styles.aiInsightIcon}>
                            <IconInfoCircle />
                          </span>
                          <strong>{'AI 洞察'}</strong>
                          <span className={styles.aiInsightBadge}>{'经营洞察'}</span>
                        </div>
                        <p>
                          <b>{'核心判断：'}</b>
                          {'公司库存 '}
                          {formatMetric(workspace.kpis.inventoryLevel.companyCurrent, '件', true)}
                          {'，当前订单缺口 '}
                          {formatMetric(workspace.kpis.orderGap.current, '件', true)}
                          {'。'}
                          {workspace.kpis.orderGap.current == null
                            ? '当前缺口证据不足，不能判断实际缺货。'
                            : workspace.kpis.orderGap.current > 0
                              ? '已有订单交付压力，需结合品类与组织定位。'
                              : '当前未见订单缺口，低库存仍需与实际缺货区分。'}
                        </p>
                        <p>
                          <b>{'关系分析：'}</b>
                          {workspace.risks.length
                            ? workspace.risks
                                .slice(0, 2)
                                .map((r) => `${r.title}：${r.detail}`)
                                .join('；')
                            : '当前未命中公司系统规则风险。'}
                          {workspace.scope === 'all-channel'
                            ? '客户库存仅作渠道观察，不计入公司库存合计。'
                            : ''}
                        </p>
                        <p>
                          <b>{'数据边界：'}</b>
                          {workspace.confidence.summary}
                        </p>
                        <div className={styles.statusFilters} aria-label="经营状态快速筛选">
                          {['', '低库存', '大日期', '数据待复核'].map((status) => (
                            <button
                              key={status}
                              aria-pressed={riskFilter === status}
                              onClick={() => {
                                setRiskFilter(status);
                                setActiveTab('category');
                              }}
                            >
                              {status || '全部'}
                              <i>
                                {
                                  (workspace.categoryStructure ?? []).filter(
                                    (r) => !status || rowStatus(r) === status,
                                  ).length
                                }
                              </i>
                            </button>
                          ))}
                        </div>
                      </section>

                      <details className={styles.confidence}>
                        <summary>{'数据取值说明与各层日期'}</summary>
                        <div className={styles.headerMeta}>
                          <span>
                            {'基地库存：'}
                            {workspace.freshness.byDomain.baseInventory ?? '不可用'}
                          </span>
                          <span>
                            {'分仓库存：'}
                            {workspace.freshness.byDomain.branchInventory ?? '不可用'}
                          </span>
                          {workspace.scope === 'all-channel' && (
                            <>
                              <span>
                                {'客户统计日：'}
                                {workspace.freshness.byDomain.customerStatistics ?? '不可用'}
                              </span>
                              <span>
                                {'客户上传范围：'}
                                {workspace.freshness.byDomain.customerOldestUpload ?? '未知'} {'至'}{' '}
                                {workspace.freshness.byDomain.customer ?? '未知'}
                              </span>
                            </>
                          )}
                        </div>
                        {(workspace.evidence.dataNotes ?? []).map((note) => (
                          <Alert key={note} type="info" showIcon content={note} />
                        ))}
                        {workspace.customerObservationRisks.length > 0 && (
                          <div className={styles.observationStrip}>
                            <strong>{'客户观察信号 · 不计入公司主判断'}</strong>
                            {workspace.customerObservationRisks.map((r) => (
                              <p key={r.code}>
                                {r.title}
                                {'：'}
                                {r.detail}
                              </p>
                            ))}
                          </div>
                        )}
                        <p className={styles.referenceFoot}>
                          {
                            '公司数量为件；客户预订单总量为箱，渠道日快照为件，未做跨单位加总。基地周转使用计划日均、分仓使用实际日均出库，不合成公司回顾周转。大区、省区、物料组暂无对应来源，不展示演示归属。'
                          }
                        </p>
                      </details>
                      <Card className={styles.detailCard} bordered={false}>
                        <div
                          ref={setFilterToolbar}
                          hidden={activeTab !== 'category' && activeTab !== 'structure'}
                        />
                        <Tabs activeTab={activeTab} onChange={showDetailTab} destroyOnHide={false}>
                          <Tabs.TabPane key="category" title="品类结构">
                            <ReferenceStructure
                              workspace={workspace}
                              mode="category"
                              sku={skuFilter}
                              onSku={setSkuFilter}
                              status={riskFilter}
                              onStatus={setRiskFilter}
                              toolbar={filterToolbar}
                              filters={structureFilters}
                              onFilters={setStructureFilters}
                            />
                          </Tabs.TabPane>
                          <Tabs.TabPane key="structure" title="组织结构">
                            <ReferenceStructure
                              workspace={workspace}
                              mode="organization"
                              sku={skuFilter}
                              onSku={setSkuFilter}
                              status={riskFilter}
                              onStatus={setRiskFilter}
                              toolbar={filterToolbar}
                              filters={structureFilters}
                              onFilters={setStructureFilters}
                            />
                          </Tabs.TabPane>
                          <Tabs.TabPane key="aging" title="库存库龄">
                            {workspace.agingDetails ? (
                              <WorkspaceDetailTree workspace={workspace} kind="aging" />
                            ) : (
                              <>
                                <div className={styles.tabIntro}>
                                  <div>
                                    <strong>{'分层库龄判断'}</strong>
                                    <span>
                                      {'基地、分仓、客户阈值不同，不合并成一个全国“超期”定义。'}
                                    </span>
                                  </div>
                                  <Tag
                                    color={
                                      workspace.aging.projections.day14.state === 'available'
                                        ? 'green'
                                        : 'orange'
                                    }
                                  >
                                    {'FIFO 14天预测：'}
                                    {workspace.aging.projections.day14.state === 'available'
                                      ? '可用'
                                      : '部分可用'}
                                  </Tag>
                                </div>
                                <Table
                                  rowKey="key"
                                  data={agingRows}
                                  scroll={{ x: 1100 }}
                                  pagination={false}
                                  columns={[
                                    {
                                      title: '层级口径',
                                      dataIndex: 'name',
                                      width: 300,
                                    },
                                    {
                                      title: '超期/熔断（件）',
                                      dataIndex: 'current',
                                      align: 'right',
                                      render: (v: number | null) =>
                                        v == null
                                          ? '不适用/不可用'
                                          : Math.round(v).toLocaleString('zh-CN'),
                                    },
                                    {
                                      title: '60–89天关注带（件）',
                                      dataIndex: 'attention',
                                      align: 'right',
                                      render: (v: number | null) =>
                                        v == null
                                          ? '不适用/不可用'
                                          : Math.round(v).toLocaleString('zh-CN'),
                                    },
                                    {
                                      title: '客户90–119天高风险带',
                                      dataIndex: 'highRisk',
                                      align: 'right',
                                      render: (v: number | null) =>
                                        v == null
                                          ? '不适用/不可用'
                                          : Math.round(v).toLocaleString('zh-CN'),
                                    },
                                    {
                                      title: '7天后（件）',
                                      dataIndex: 'day7',
                                      align: 'right',
                                      render: (v: number | null) =>
                                        v == null ? (
                                          <Tag color="gray">{'缺少批次/速度'}</Tag>
                                        ) : (
                                          Math.round(v).toLocaleString('zh-CN')
                                        ),
                                    },
                                    {
                                      title: '14天后（件）',
                                      dataIndex: 'day14',
                                      align: 'right',
                                      render: (v: number | null) =>
                                        v == null ? (
                                          <Tag color="gray">{'缺少批次/速度'}</Tag>
                                        ) : (
                                          Math.round(v).toLocaleString('zh-CN')
                                        ),
                                    },
                                  ]}
                                />
                              </>
                            )}
                          </Tabs.TabPane>
                          <Tabs.TabPane key="shortage" title="订单缺口">
                            {workspace.orderDetails ? (
                              <WorkspaceDetailTree workspace={workspace} kind="orders" />
                            ) : (
                              <>
                                <div className={styles.tabIntro}>
                                  <div>
                                    <strong>{'订单满足率与缺口'}</strong>
                                    <span>{'当月履约和当前待分配是两个概念，分别展示。'}</span>
                                  </div>
                                  <Tag color="red">{'缺口目标 0 件'}</Tag>
                                </div>
                                <Table
                                  rowKey="key"
                                  data={shortageRows}
                                  scroll={{ x: 1700 }}
                                  pagination={false}
                                  columns={[
                                    {
                                      title: '履约路径',
                                      dataIndex: 'path',
                                      width: 240,
                                    },
                                    {
                                      title: '原始需求（件）',
                                      dataIndex: 'demandQty',
                                      align: 'right',
                                      render: (v: number) => Math.round(v).toLocaleString('zh-CN'),
                                    },
                                    {
                                      title: '发运后缺口（件）',
                                      dataIndex: 'shortageQty',
                                      align: 'right',
                                      render: (v: number) => (
                                        <span className={v > 0 ? styles.negative : ''}>
                                          {Math.round(v).toLocaleString('zh-CN')}
                                        </span>
                                      ),
                                    },
                                    {
                                      title: '满足率',
                                      dataIndex: 'rate',
                                      align: 'right',
                                      render: (v: number | null) =>
                                        v == null ? '不可用' : `${v.toFixed(2)}%`,
                                    },
                                    {
                                      title: '可用库存（件）',
                                      dataIndex: 'available',
                                      align: 'right',
                                      render: (v: number | null) =>
                                        v == null
                                          ? '不可用'
                                          : Math.round(v).toLocaleString('zh-CN'),
                                    },
                                    {
                                      title: '协同库存（件）',
                                      dataIndex: 'collaborative',
                                      align: 'right',
                                      render: (v: number | null) =>
                                        v == null ? (
                                          <Tag color="gray">{'待匹配'}</Tag>
                                        ) : (
                                          Math.round(v).toLocaleString('zh-CN')
                                        ),
                                    },
                                    {
                                      title: '受影响订单',
                                      dataIndex: 'affectedOrders',
                                      align: 'right',
                                    },
                                    {
                                      title: '当前待分配（件）',
                                      dataIndex: 'pending',
                                      align: 'right',
                                      render: (v: number | null) =>
                                        v == null ? '—' : Math.round(v).toLocaleString('zh-CN'),
                                    },
                                    {
                                      title: '建议动作',
                                      dataIndex: 'action',
                                      width: 220,
                                    },
                                    {
                                      title: '负责人',
                                      dataIndex: 'owner',
                                      width: 130,
                                    },
                                  ]}
                                />
                              </>
                            )}
                          </Tabs.TabPane>
                        </Tabs>
                      </Card>
                      <FullChainTrends
                        key={JSON.stringify([viewKey, structureFilters])}
                        workspace={workspace}
                        filters={structureFilters}
                      />
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </section>
        <Modal
          visible={Boolean(detailKpi && selectedMetric)}
          title={detailKpi ? `${KPI_COPY[detailKpi].title}详情` : '指标详情'}
          footer={null}
          unmountOnExit
          onCancel={() => setDetailKpi(null)}
          style={{ width: 'min(1040px, calc(100vw - 32px))' }}
        >
          {selectedMetric && workspace && (
            <div className={styles.modalContent}>
              <div className={styles.modalSummary}>
                <div>
                  <span>{detailKpi === 'orderGap' ? '当前备单量' : '当前值'}</span>
                  <strong>
                    {formatMetric(
                      detailKpi === 'orderGap'
                        ? (workspace.orderExecution?.currentOrderQty ?? null)
                        : selectedMetric.current,
                      selectedMetric.unit,
                      true,
                    )}
                  </strong>
                </div>
                <div>
                  <span>{detailKpi === 'orderGap' ? '本月发运后缺口' : '目标/参考'}</span>
                  <strong>
                    {formatMetric(
                      detailKpi === 'orderGap' ? selectedMetric.current : selectedMetric.target,
                      selectedMetric.unit,
                      true,
                    )}
                  </strong>
                </div>
                <div>
                  <span>{'数据日期'}</span>
                  <strong>{selectedMetric.sourceDate ?? '不可用'}</strong>
                </div>
              </div>
              <Alert
                type={selectedMetric.state === 'risk' ? 'warning' : 'info'}
                showIcon
                content={selectedMetric.explanation}
              />
              {detailKpi === 'aging' && workspace.agingDetails ? (
                <WorkspaceDetailTree workspace={workspace} kind="aging" />
              ) : detailKpi === 'inventoryLevel' ||
                detailKpi === 'turnover' ||
                detailKpi === 'aging' ? (
                <InventoryKpiDetail
                  key={`${workspace.workspaceId}:${detailKpi}`}
                  workspace={workspace}
                  metricKey={detailKpi}
                />
              ) : workspace.orderDetails ? (
                <WorkspaceDetailTree workspace={workspace} kind="orders" />
              ) : (
                <>
                  <Table
                    rowKey="key"
                    data={shortageRows}
                    pagination={false}
                    scroll={{ x: 650 }}
                    columns={[
                      { title: '对象', dataIndex: 'path', width: 200 },
                      { title: '本月原始需求/件', dataIndex: 'demandQty' },
                      { title: '发运后缺口/件', dataIndex: 'shortageQty' },
                      {
                        title: '满足率',
                        dataIndex: 'rate',
                        render: (value: number | null) => formatMetric(value, '%'),
                      },
                    ]}
                  />

                  <p className={styles.evidenceLine}>
                    {'旧快照仅保存履约路径汇总，刷新工作台可获取新版逐仓明细。'}
                  </p>
                </>
              )}
              <div className={styles.evidenceLine}>
                {'结果快照 '}
                {workspace.workspaceId}
                {' · '}
                {workspace.contractVersion}
                {' · 只读'}
              </div>
            </div>
          )}
        </Modal>
      </div>
    </main>
  );
}
export default FullChainWorkbench;
