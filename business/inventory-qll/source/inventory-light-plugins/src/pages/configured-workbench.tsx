import { useDashboardInsight } from '../../../../../shared/use-dashboard-insight';
import {
  chainDashboardEvidence,
  chainStockMetrics,
  chainFulfillmentMetrics,
} from '../../../../../shared/qll-dashboard-insight';
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
    () =>
      config.overviewViewIds.filter(
        (id) => id !== 'orders' && (channel || id !== 'channel-overview'),
      ),
    [channel],
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
  const branch = parts['branch-stock']?.summary;
  const customer = parts['channel-overview']?.summary;
  const baseQty = knownNumber(parts.health?.summary?.total_qty),
    branchAvailable = knownNumber(branch?.available_qty);
  const stockMetrics = chainStockMetrics(parts, channel);
  const { company: companyQty, baseTurnover, branchTurnover } = stockMetrics;
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
      factory: {
        rate: fulfillmentPercent(parts['factory-overview']?.summary),
        shippedQty: knownNumber(parts['factory-overview']?.summary?.fulfillment_shipped_quantity),
      },
      branch: {
        rate: fulfillmentPercent(parts['branch-overview']?.summary),
        shippedQty: knownNumber(parts['branch-overview']?.summary?.fulfillment_shipped_quantity),
      },
    },
    orderExecution: {
      currentOrderQty: currentShortageSum(parts['current-shortage']?.rows, 'demand'),
      currentBaseOrderQty: currentShortageSum(parts['current-shortage']?.rows, 'demand', '基地'),
      currentBranchOrderQty: currentShortageSum(parts['current-shortage']?.rows, 'demand', '分仓'),
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
        current: stockMetrics.inventory,
        companyCurrent: companyQty,
        planCustomerTotal: channel ? knownNumber(customer?.inventory) : null,
        planCustomerDate: parts['channel-overview']?.snapshotDate,
        unit: '件',
      },
      turnover: {
        current: stockMetrics.turnover,
        unit: '天',
        explanation: '库存合计÷近30日日均动销合计。',
      },
      aging: {
        current: companyAverageAge(parts.health, parts['branch-stock']),
        unit: '天',
        explanation:
          '同一快照日的基地、分仓批次按库存数量加权；批次货龄为快照日减生产日。最大货龄见库存库龄明细。',
      },
      fulfillment: { current: chainFulfillmentMetrics(parts).rate, unit: '%' },
      orderGap: {
        current: currentShortageSum(parts['current-shortage']?.rows, 'demand'),
        unit: '件',
        explanation: '基地与分仓当前未完成客户订单。',
      },
    },
  };
  const evidence = chainDashboardEvidence(parts, date, channel);
  const modelInsight = useDashboardInsight(evidence, !busy && Object.keys(parts).length > 0);
  const insightAnswer = modelInsight.status === 'ready' ? modelInsight.answer : undefined;
  useEffect(() => {
    updateContext('chainInsight', {
      status: modelInsight.status,
      evidence: !busy ? evidence : null,
      answer: insightAnswer,
    });
  }, [modelInsight.status, insightAnswer, JSON.stringify(evidence), busy]);
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
                  title="含渠道时库存纳入客户在仓；客户使用所选日期之前最近快照，快照日期单独列示"
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
                      stockDays: knownNumber(customer?.onhand_days),
                      date: parts['channel-overview']?.snapshotDate,
                    }}
                    onOpen={() => setTab('structure')}
                  />
                ),
              )}
            </div>
            <section
              className={styles.aiInsight}
              aria-label="AI 洞察"
              aria-busy={modelInsight.status === 'loading'}
            >
              <div className={styles.aiInsightHeading}>
                <span className={styles.aiInsightIcon} aria-hidden="true" />
                <strong>AI 洞察</strong>
              </div>
              <p>
                {modelInsight.status === 'ready'
                  ? modelInsight.answer
                  : modelInsight.status === 'error'
                    ? '-'
                    : '正在分析当前库存…'}
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
