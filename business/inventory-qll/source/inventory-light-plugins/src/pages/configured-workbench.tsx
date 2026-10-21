import { BusinessToolbar } from '../../../../../shared/business-toolbar';
import { LocalQueryForm } from '../../../../../shared/local-query-form';
import { QueryErrors } from '../../../../../shared/query-errors';
import { BusinessDateInput } from '../../../../../shared/business-date-input';
import React, { useState, useEffect } from 'react';
import { createPageViewState, usePageViewField } from '../../../../../shared/view-state.js';
import { ConfiguredTrends } from './configured-trends';
import config from '../../../../sql.config.json';
import { Tabs } from '../dsh-ui/controls';
import { KpiCard } from './qll';
import {
  originalQllView,
  originalQllLayerView,
} from '../../../../../shared/original-business-views';
import { ConfiguredFactsPage } from '../../../../../shared/configured-facts-page';
import { useConfiguredOverview } from '../../../../../shared/use-configured-overview';
import {
  businessDay,
  fulfillmentPercent,
  knownNumber,
} from '../../../../../shared/configured-overview';
import { formatChainValue as show } from '../../../../../shared/full-chain-display';
import { updateContext } from '../native/context';
import styles from './qll/components/full-chain-workbench.module.css';
import common from '../../../../../shared/restored-workbench.module.css';
const tabs = [
  ['category', '品类结构'],
  ['structure', '组织结构'],
  ['aging', '库存库龄'],
  ['shortage', '订单缺口'],
];
const views: Record<string, string[]> = {
  category: ['category'],
  structure: ['organization'],
  aging: ['aging'],
  shortage: ['fulfillment-path'],
};
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
  const [tab, setTab] = usePageViewField(React, viewState, 'tab', 'category'),
    [date, setDate] = usePageViewField(React, viewState, 'asOf', businessDay),
    [draft, setDraft] = useState(businessDay),
    [revision, refresh] = useState(0);
  useEffect(() => setDraft(date), [date]);
  const { parts, errors, busy } = useConfiguredOverview(config, date, '', revision, (v) =>
    updateContext('overview', v),
  );
  const stock = parts.base?.summary,
    orders = parts.orders?.summary;
  const branch = parts['branch-stock']?.summary;
  const customer = parts['channel-overview']?.summary;
  const baseQty = knownNumber(stock?.known_inventory),
    branchAvailable = knownNumber(branch?.available_qty);
  const companyQty =
    baseQty === null || branchAvailable === null ? null : baseQty + branchAvailable;
  const workspace: any = {
    scope: channel ? 'all-channel' : 'company',
    customerObservationRisks: [],
    structure: [
      { layer: 'base', currentQty: baseQty, availableQty: knownNumber(stock?.known_available) },
      {
        layer: 'branch',
        currentQty: knownNumber(branch?.total_qty),
        availableQty: branchAvailable,
      },
    ],
    aging: { over30ByLayer: {} },
    agingDetails: [],
    layerMetrics: {
      base: { turnoverDays: knownNumber(stock?.matched_stock_days), averageAgeDays: null },
      branch: {
        turnoverDays: knownNumber(parts['branch-replenishment']?.summary?.historical_turnover_days),
        averageAgeDays: null,
      },
    },
    fulfillment: {
      factory: { rate: fulfillmentPercent(parts['factory-overview']?.summary) },
      branch: { rate: fulfillmentPercent(parts['branch-overview']?.summary) },
    },
    orderExecution: {
      currentOrderQty: knownNumber(stock?.known_open_orders),
      currentBaseShortageQty: null,
      currentBranchShortageQty: null,
    },
    kpis: {
      inventoryLevel: {
        current: companyQty,
        companyCurrent: companyQty,
        planCustomerTotal: channel ? knownNumber(customer?.total_inventory) : null,
        planCustomerDate: parts['channel-overview']?.snapshotDate,
        unit: '件',
      },
      turnover: { current: knownNumber(stock?.matched_stock_days), unit: '天' },
      aging: {
        current: knownNumber(parts.health?.summary?.max_age),
        unit: '天',
        explanation: '当前货龄及基地、分仓货龄分别取对应库存健康快照的最大库龄，不作为平均货龄。',
      },
      fulfillment: { current: fulfillmentPercent(orders), unit: '%' },
      orderGap: {
        current: knownNumber(stock?.known_open_orders),
        unit: '件',
        explanation:
          '当前可取得的基地未备单量；不含已备单占用，分仓当前待发阶段尚无等价来源。下方缺货量为所选日期所在月截至该日的累计值。',
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
                    if (e.target.checked) setTab('structure');
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
                    maximumAges={{
                      base: knownNumber(parts.health?.summary?.base_max_age),
                      branch: knownNumber(branch?.max_age),
                    }}
                    periodShortages={{
                      base: knownNumber(parts['factory-overview']?.summary?.shortage),
                      branch: knownNumber(parts['branch-overview']?.summary?.shortage),
                    }}
                    onOpen={() =>
                      setTab(
                        key === 'aging'
                          ? 'aging'
                          : ['fulfillment', 'orderGap'].includes(key)
                            ? 'shortage'
                            : 'structure',
                      )
                    }
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
                <b>核心判断：</b>公司库存 {show(companyQty, '箱')}
                。结合品类结构、组织结构和订单缺口安排库存协同。
              </p>
            </section>
            <section className={styles.detailCard}>
              <Tabs activeTab={tab} onChange={setTab}>
                {tabs.map(([id, label]) => (
                  <Tabs.TabPane key={id} title={label} />
                ))}
              </Tabs>
              {tab === 'structure' ? (
                <OrganizationHierarchy
                  date={date}
                  revision={revision}
                  channel={channel}
                  onRead={(v: any) => updateContext('data', v)}
                />
              ) : (
                <ConfiguredFactsPage
                  key={[tab, date, revision, channel].join(':')}
                  config={config}
                  embedded
                  viewIds={views[tab]}
                  presentation={originalQllView(config, tab)}
                  date={date}
                  onRead={(v) => {
                    updateContext('data', v);
                    updateContext('queryState', {
                      state: ['available', 'empty'].includes(v.status) ? 'ready' : v.status,
                      message: v.message,
                    });
                    updateContext('fullChainWorkspace', {
                      realData: ['available', 'empty'].includes(v.status),
                      date,
                      scope: channel ? 'all-channel' : 'company',
                    });
                  }}
                />
              )}
            </section>
            <ConfiguredTrends key={revision} date={date} />
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
        ['branch', '分仓', 'branch-stock'],
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
