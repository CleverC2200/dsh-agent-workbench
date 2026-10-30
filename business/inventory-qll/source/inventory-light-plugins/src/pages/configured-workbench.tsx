import { formatChainValue as show } from '../../../../../shared/full-chain-display';
import { inventoryAverageAge, companyAverageAge } from '../../../../../shared/inventory-age';
import { BusinessToolbar } from '../../../../../shared/business-toolbar';
import { LocalQueryForm } from '../../../../../shared/local-query-form';
import { QueryErrors } from '../../../../../shared/query-errors';
import { BusinessDateInput } from '../../../../../shared/business-date-input';
import React, { useState, useEffect } from 'react';
import { createPageViewState, usePageViewField } from '../../../../../shared/view-state.js';
import { CategoryHierarchy } from './qll/components/category-hierarchy';
import config from '../../../../sql.config.json';
import { Tabs } from '../dsh-ui/controls';
import { KpiCard } from './qll';
import { originalQllLayerView } from '../../../../../shared/original-business-views';
import { ConfiguredFactsPage } from '../../../../../shared/configured-facts-page';
import { useConfiguredOverview } from '../../../../../shared/use-configured-overview';
import { currentShortageSum } from '../../../../../shared/current-shortage';
import {
  businessDay,
  fulfillmentPercent,
  knownNumber,
} from '../../../../../shared/configured-overview';
import { updateContext } from '../native/context';
import styles from './qll/components/full-chain-workbench.module.css';
import common from '../../../../../shared/restored-workbench.module.css';
const tabs = [
  ['category', '品类结构'],
  ['structure', '组织结构'],
];
const viewState = createPageViewState('inventory-qll');
export default function ConfiguredWorkbench() {
  const [channel, setChannel] = usePageViewField(
    React,
    viewState,
    'scope',
    false,
    (value) => (value ? 'all-channel' : 'company'),
    (value) => value === 'all-channel',
  );
  const [savedTab, setTab] = usePageViewField(React, viewState, 'tab', 'category'),
    [date, setDate] = usePageViewField(React, viewState, 'asOf', businessDay),
    [draft, setDraft] = useState(businessDay),
    [revision, refresh] = useState(0);
  const tab = savedTab === 'structure' ? 'structure' : 'category';
  useEffect(() => {
    if (savedTab !== tab) setTab(tab);
  }, [savedTab, tab, setTab]);
  useEffect(() => setDraft(date), [date]);
  const overviewViews = React.useMemo(
    () => config.overviewViewIds.filter((id) => id !== 'orders'),
    [],
  );
  const { parts, errors, busy } = useConfiguredOverview(
    config,
    date,
    '',
    revision,
    (v) => updateContext('overview', v),
    undefined,
    overviewViews,
  );
  const orders = parts['factory-overview']?.summary;
  const branch = parts['branch-stock']?.summary;
  const customer = parts['channel-overview']?.summary;
  const baseQty = knownNumber(parts.health?.summary?.total_qty),
    branchAvailable = knownNumber(branch?.available_qty);
  const branchCurrent = knownNumber(branch?.total_qty);
  const sameInventoryDate =
    !!parts.health?.snapshotDate &&
    parts.health.snapshotDate === parts['branch-stock']?.snapshotDate;
  const companyQty =
    !sameInventoryDate || baseQty === null || branchCurrent === null
      ? null
      : baseQty + branchCurrent;
  const shipments = parts['base-shipments']?.summary;
  const baseShipment30 = knownNumber(shipments?.rolling_ship_positive);
  const baseDaily =
    knownNumber(shipments?.rolling_missing_qty) === 0 && baseShipment30 !== null
      ? baseShipment30 / 30
      : null;
  const branchDaily = knownNumber(parts['branch-replenishment']?.summary?.rolling_ship_daily);
  const turnover = (inventory: number | null, daily: number | null) =>
    inventory !== null && inventory >= 0 && daily !== null && daily > 0 ? inventory / daily : null;
  const baseTurnover = turnover(baseQty, baseDaily);
  const branchTurnover = turnover(branchCurrent, branchDaily);
  const workspace: any = {
    scope: channel ? 'all-channel' : 'company',
    customerObservationRisks: [],
    structure: [
      {
        layer: 'base',
        currentQty: baseQty,
        availableQty: knownNumber(parts.health?.summary?.available_qty),
      },
      {
        layer: 'branch',
        currentQty: knownNumber(branch?.total_qty),
        availableQty: branchAvailable,
      },
    ],
    aging: { over30ByLayer: {} },
    agingDetails: [],
    layerMetrics: {
      base: {
        turnoverDays: baseTurnover,
        averageAgeDays: inventoryAverageAge(parts.health?.summary),
      },
      branch: {
        turnoverDays: branchTurnover,
        averageAgeDays: inventoryAverageAge(branch),
      },
    },
    fulfillment: {
      factory: { rate: fulfillmentPercent(parts['factory-overview']?.summary) },
      branch: { rate: fulfillmentPercent(parts['branch-overview']?.summary) },
    },
    orderExecution: {
      currentOrderQty: currentShortageSum(parts['current-shortage']?.rows, 'demand'),
      currentBaseShortageQty: currentShortageSum(
        parts['current-shortage']?.rows,
        'shortage',
        '基地',
      ),
      currentBranchShortageQty: currentShortageSum(
        parts['current-shortage']?.rows,
        'shortage',
        '分仓',
      ),
    },
    kpis: {
      inventoryLevel: {
        current: companyQty,
        companyCurrent: companyQty,
        planCustomerTotal: channel ? knownNumber(customer?.total_inventory) : null,
        planCustomerDate: parts['channel-overview']?.snapshotDate,
        unit: '件',
      },
      turnover: { current: baseTurnover, unit: '天' },
      aging: {
        current: companyAverageAge(parts.health, parts['branch-stock']),
        unit: '天',
        explanation:
          '同一快照日的基地、分仓批次按库存数量加权；批次货龄为快照日减生产日。最大货龄见库存库龄明细。',
      },
      fulfillment: { current: fulfillmentPercent(orders), unit: '%' },
      orderGap: {
        current: currentShortageSum(parts['current-shortage']?.rows, 'demand'),
        unit: '件',
        explanation:
          '当前有效未发货完成订单量；包含未备单需求与已备单未发货占用，基地与分仓分池汇总，不使用月累计履约订单替代。',
      },
    },
  };
  return (
    <main className={`${styles.shell} ${common.root}`}>
      <div className={styles.workspacePanels}>
        <section className={styles.workbench}>
          <BusinessToolbar
            filters={
              <label className={styles.channelSwitch}>
                <input
                  type="checkbox"
                  aria-label="含渠道"
                  checked={channel}
                  onChange={(e) => {
                    setChannel(e.target.checked);
                  }}
                  title="1件=1箱；不同日期及范围的客户库存单独查看"
                />
                <span aria-hidden="true" />
                含渠道
              </label>
            }
            actions={
              <LocalQueryForm
                className={common.controls}
                onSubmit={(e) => {
                  e.preventDefault();
                  setDate(draft);
                  refresh((n) => n + 1);
                }}
              >
                <BusinessDateInput
                  aria-label="读取时点"
                  required
                  max={businessDay()}
                  value={draft}
                  onValueChange={setDraft}
                />
                <button>查询 / 刷新</button>
              </LocalQueryForm>
            }
          />
          <div className={styles.boardScroll}>
            <QueryErrors errors={errors} />
            <div
              className={`${styles.kpiGrid} ${styles.compactKpiGrid} ${common.kpis}`}
              data-overview-cards="qll"
              aria-busy={busy}
            >
              {(['inventoryLevel', 'turnover', 'aging', 'fulfillment', 'orderGap'] as const).map(
                (key) => (
                  <KpiCard
                    key={key}
                    metricKey={key}
                    metric={workspace.kpis[key]}
                    workspace={workspace}
                    channelSnapshot={{
                      inventory: knownNumber(customer?.inventory),
                      inTransit: knownNumber(customer?.in_transit),
                      stockDays: knownNumber(customer?.cover_days),
                      date: parts['channel-overview']?.snapshotDate,
                    }}
                    onOpen={() => setTab('structure')}
                  />
                ),
              )}
            </div>
            <section className={styles.aiInsight} aria-label="AI 洞察">
              <div className={styles.aiInsightHeading}>
                <span className={styles.aiInsightIcon} aria-hidden="true" />
                <strong>AI 洞察</strong>
                <span className={styles.aiInsightBadge}>经营洞察</span>
              </div>
              <p>
                <b>核心判断：</b>公司库存 {show(companyQty, '件')}
                。结合品类结构、组织结构和订单缺口安排库存协同。
              </p>
            </section>
            <section className={styles.detailCard}>
              <Tabs activeTab={tab} onChange={setTab}>
                {tabs.map(([id, label]) => (
                  <Tabs.TabPane key={id} title={label} />
                ))}
              </Tabs>
              {tab === 'category' ? (
                <CategoryHierarchy key={[date, revision].join(':')} date={date} channel={channel} />
              ) : (
                <OrganizationHierarchy
                  date={date}
                  revision={revision}
                  channel={channel}
                  onRead={(v: any) => updateContext('data', v)}
                />
              )}
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}

function OrganizationHierarchy({ date, revision, channel, onRead }: any) {
  const [open, setOpen] = useState<string[]>(['base']);
  useEffect(() => {
    if (channel) setOpen((old) => (old.includes('customer') ? old : [...old, 'customer']));
  }, [channel]);
  return (
    <div className={common.hierarchy} aria-label="组织结构分层">
      {[
        ['base', '基地', 'organization'],
        ['branch', '分仓', 'branch-structure'],
        ...(channel ? [['customer', '渠道', 'channel-sku']] : []),
      ].map(([id, label, viewId]) => (
        <section key={id}>
          <button
            className={common.hierarchyToggle}
            aria-label={`${label}库存明细`}
            aria-expanded={open.includes(id)}
            onClick={() =>
              setOpen((old) => (old.includes(id) ? old.filter((v) => v !== id) : [...old, id]))
            }
          >
            <span aria-hidden="true">{open.includes(id) ? '▾' : '▸'}</span>
            {label}
          </button>
          {open.includes(id) && (
            <ConfiguredFactsPage
              key={[id, date, revision].join(':')}
              config={config}
              embedded
              viewIds={[viewId]}
              date={date}
              presentation={originalQllLayerView(config, id, channel)}
              onRead={onRead}
            />
          )}
        </section>
      ))}
    </div>
  );
}
