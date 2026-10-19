import { LocalQueryForm } from '../../../../../shared/local-query-form';
import React, { useState, useEffect } from 'react';
import { createPageViewState, usePageViewField } from '../../../../../shared/view-state.js';
import { ConfiguredTrends } from './configured-trends';
import config from '../../../../sql.config.json';
import { ConfiguredFactsPage } from '../../../../../shared/configured-facts-page';
import { useConfiguredOverview } from '../../../../../shared/use-configured-overview';
import {
  businessDay,
  fulfillmentPercent,
  knownNumber,
} from '../../../../../shared/configured-overview';
import { fullChainCards, formatChainValue as show } from '../../../../../shared/full-chain-display';
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
  category: ['category', 'base'],
  structure: ['organization', 'branch-stock', 'plan', 'branch-shipments'],
  aging: ['aging', 'warehouse-age-detail', 'history'],
  shortage: ['fulfillment-path', 'shortage', 'orders', 'delivery'],
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
  const cards = fullChainCards(stock, orders, parts.base?.inventoryVersion);
  cards[0].title = '库存水平';
  cards[2].title = '库存库龄';
  cards[4].title = '订单执行';
  const branchStock = parts['branch-stock']?.summary;
  cards[0].details[1] = ['分仓库存', knownNumber(branchStock?.total_qty), '箱'];
  cards[0].details.push(['分仓可用', knownNumber(branchStock?.available_qty), '箱']);
  cards[1].details = [
    ['基地', cards[1].value, '天'],
    ['分仓', null, '天', '待同口径出库及期间核验'],
    ...cards[1].details,
  ];
  cards[3].details = [
    ['基地', fulfillmentPercent(parts['factory-overview']?.summary), '%'],
    ['分仓', fulfillmentPercent(parts['branch-overview']?.summary), '%'],
    ...cards[3].details,
  ];
  const branchShipments = parts['branch-shipments']?.summary;
  cards[4].details.push([
    '分仓本月正向发货',
    branchShipments?.month_ship_positive == null
      ? null
      : Number(branchShipments.month_ship_positive),
    '箱',
  ]);
  const health = parts.health?.summary,
    customerStock = parts['channel-overview'];
  if (channel && customerStock?.summary) {
    const s = customerStock.summary;
    cards[0].details.push([
      '客户库存',
      s.total_inventory == null ? null : Number(s.total_inventory),
      '箱',
    ]);
    cards[1].details.push([
      '客户库存支撑',
      s.cover_days == null ? null : Number(s.cover_days),
      '天',
    ]);
  }
  if (health && Number(health.age_valid_count) > 0) {
    cards[2] = {
      ...cards[2],
      value: health.max_age == null ? null : Number(health.max_age),
      scope: `仓库健康表 ${parts.health?.snapshotDate} · ${health.age_valid_count}/${health.row_count} 条记录 · 最大库龄`,
      details: [
        ['源超龄数量', health.overaged_qty == null ? null : Number(health.overaged_qty), '箱'],
        ['有货龄记录', Number(health.age_valid_count), '条'],
      ],
    };
  }
  return (
    <main className={`${styles.shell} ${common.root}`}>
      <div className={styles.workspacePanels}>
        <section className={styles.workbench}>
          <header className={styles.header}>
            <h1 className={styles.title}>全链路库存</h1>
            <div className={styles.controls}>
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
              <LocalQueryForm
                className={common.controls}
                onSubmit={(e) => {
                  e.preventDefault();
                  setDate(draft);
                  refresh((n) => n + 1);
                }}
              >
                <input
                  type="date"
                  aria-label="读取时点"
                  required
                  max={businessDay()}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                />
                <button>查询 / 刷新</button>
              </LocalQueryForm>
            </div>
          </header>
          <div className={styles.boardScroll}>
            {errors.map((e: string) => (
              <p key={e} role="alert" className={common.error}>
                {e}
              </p>
            ))}
            <div className={`${styles.kpiGrid} ${common.kpis}`} aria-busy={busy}>
              {cards.map((c) => (
                <button key={c.title} className={styles.kpiButton} onClick={() => setTab(c.tab)}>
                  <div className={styles.kpiCard}>
                    <div className={styles.kpiTop}>
                      <span className={styles.kpiTitle}>{c.title}</span>
                    </div>
                    <p className={common.metricScope}>{c.scope}</p>
                    <strong className={styles.kpiValue}>{show(c.value, c.unit)}</strong>
                    <dl className={styles.kpiHelpers}>
                      {c.details.map(([label, n, unit, missingReason]) => (
                        <div key={String(label)}>
                          <dt>{label}</dt>
                          <dd>
                            {show(n as number | null, String(unit))}
                            {n == null && missingReason && (
                              <small className={common.missingReason}>{missingReason}</small>
                            )}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                </button>
              ))}
            </div>
            <section className={styles.aiInsight} aria-label="AI 洞察">
              <div className={styles.aiInsightHeading}>
                <strong>AI 洞察</strong>
                <span className={styles.aiInsightBadge}>经营洞察</span>
              </div>
              <p>
                <b>核心判断：</b>
                数量统一为箱（1件=1箱），大数以万箱显示。主指标为基地范围；分仓现存和可用库存独立列示，明细见组织结构。货龄展示最大库龄，当前订单阶段仍不能由库存占用量推断。
              </p>
              <p>
                <b>数据边界：</b>基地快照 {parts.base?.snapshotDate ?? '-'}；分仓快照{' '}
                {parts['branch-stock']?.snapshotDate ?? '-'}（{branchStock?.row_count ?? '-'}
                个仓库SKU）；库存范围 {stock?.known_inventory_count ?? '-'} /{' '}
                {stock?.row_count ?? '-'}{' '}
                个基地SKU。差额与周转分别限定库存、目标或需求均有值且非负的同一批SKU，覆盖数量逐项列示；需求合计为0不计算周转。订单满足率使用本月履约，当前待发量保持未知。分仓发货来源有{' '}
                {branchShipments?.warehouse_count ?? '-'} 个仓库、
                {branchShipments?.row_count ?? '-'} 个仓库SKU，本月有值{' '}
                {branchShipments?.month_valid_skus ?? '-'} 行；可在“组织结构→分仓发货观察”查看。
              </p>
            </section>
            {channel && (
              <p className={common.note}>
                客户库存统计日：{customerStock?.snapshotDate ?? '-'}；
                {customerStock?.summary?.customer_count ?? '-'}个客户、
                {customerStock?.summary?.row_count ?? '-'}
                条记录。库存及动销单位为箱；与基地快照日期和有效记录范围不同，单独列示，不加入基地库存主值。
              </p>
            )}
            <section className={common.panel}>
              <nav className={common.tabs} aria-label="库存业务页签">
                {tabs.map(([id, label]) => (
                  <button
                    key={id}
                    aria-current={tab === id ? 'page' : undefined}
                    onClick={() => setTab(id)}
                  >
                    {label}
                  </button>
                ))}
              </nav>
              <ConfiguredFactsPage
                key={[tab, date, revision, channel].join(':')}
                config={config}
                embedded
                viewIds={
                  channel && tab === 'structure'
                    ? ['channel-stock', 'channel-sku', ...views[tab]]
                    : views[tab]
                }
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
                    scope: 'base',
                  });
                }}
              />
            </section>
            <ConfiguredTrends key={revision} date={date} />
          </div>
        </section>
      </div>
    </main>
  );
}
