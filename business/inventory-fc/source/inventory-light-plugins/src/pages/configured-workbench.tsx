import { LocalQueryForm } from '../../../../../shared/local-query-form';
import { Fragment, useState } from 'react';
import config from '../../../../sql.config.json';
import { ConfiguredFactsPage } from '../../../../../shared/configured-facts-page';
import { useConfiguredOverview } from '../../../../../shared/use-configured-overview';
import {
  businessDay,
  fulfillmentPercent,
  completeValue,
  completeCount,
  knownNumber,
} from '../../../../../shared/configured-overview';
import { updateContext } from '../native/context';
import './fc.css';
import common from '../../../../../shared/restored-workbench.module.css';
const tabs = [
  ['replenishment', '补货确认'],
  ['orders', '当前订单'],
  ['structure', '货龄结构'],
  ['plan', '分仓计划'],
  ['base', '基地资源'],
  ['operations', '运营观察'],
];
const views: Record<string, string[]> = {
  replenishment: ['replenishment', 'branch-stock', 'shipments', 'flows'],
  orders: ['orders', 'shipments', 'delivery'],
  structure: ['inventory', 'health', 'flows'],
  plan: ['plan'],
  base: ['base-resources', 'base', 'base-shipments'],
  operations: ['cost', 'flows', 'shipments', 'base-stock-flows'],
};
const show = (n: number | null, unit = '') =>
  n == null ? '-' : n.toLocaleString('zh-CN', { maximumFractionDigits: 2 }) + unit;
export default function ConfiguredWorkbench() {
  const [tab, setTab] = useState('replenishment'),
    [date, setDate] = useState(businessDay),
    [draft, setDraft] = useState(businessDay),
    [revision, refresh] = useState(0);
  const { parts, errors, busy } = useConfiguredOverview(config, date, '', revision, (value) =>
    updateContext('overview', value),
  );
  const order = parts.orders?.summary,
    plan = parts.plan?.summary,
    shipments = parts.shipments?.summary;
  const branchStock = parts['branch-stock']?.summary;
  const planCoverage = (field: string) =>
    `${plan?.['known_' + field + '_count'] ?? '-'} / ${plan?.row_count ?? '-'} 个仓库SKU`;
  const cards = [
    {
      title: '当前库存',
      value: knownNumber(branchStock?.total_qty),
      unit: '箱',
      color: 'blue',
      scope: `快照 ${parts['branch-stock']?.snapshotDate ?? '-'} · ${branchStock?.warehouse_count ?? '-'}个分仓`,
      details: [
        ['可用库存', knownNumber(branchStock?.available_qty), '箱'],
        ['备单占用', knownNumber(branchStock?.pack_unit_qty), '箱'],
        ['冻结库存', knownNumber(branchStock?.freeze_qty), '箱'],
      ],
    },
    {
      title: '最大库龄',
      value: knownNumber(branchStock?.max_age),
      unit: '天',
      color: 'purple',
      scope: `最大库龄 · ${branchStock?.age_valid_count ?? '-'}个仓库SKU有值`,
      details: [
        ['超龄库存量', knownNumber(branchStock?.overaged_qty), '箱'],
        ['平均货龄', null, '天'],
      ],
    },
    {
      title: '订单满足率',
      value: fulfillmentPercent(order),
      unit: '%',
      color: 'green',
      scope: `本月截至 ${date} · 分仓履约`,
      details: [
        ['已发订单量', completeValue(order, 'shipped_order_quantity'), '箱'],
        ['订单口径发货量', completeValue(order, 'shipped'), '箱'],
        ['仓库本月正向发货', knownNumber(shipments?.month_ship_positive), '箱'],
        ['仓库近30日正向发货', knownNumber(shipments?.rolling_ship_positive), '箱'],
        ['仓库近30日净发货', knownNumber(shipments?.rolling_ship_net), '箱'],
        ['仓库近30日负向发货', knownNumber(shipments?.rolling_ship_negative), '箱'],
      ],
    },
    {
      title: '待补货量',
      value: null,
      unit: '箱',
      color: 'red',
      scope: `备单覆盖 ${planCoverage('preparing')}；在途覆盖 ${planCoverage('in_transit')} · 源单位未知`,
      details: [
        ['需补货SKU', null, '个'],
        ['紧急补货SKU', null, '个'],
        ['源备单量', knownNumber(plan?.known_preparing), ''],
        ['源在途量', knownNumber(plan?.known_in_transit), ''],
      ],
    },
    {
      title: '当前订单',
      value: null,
      unit: '箱',
      color: 'amber',
      scope: '当前待发 · 辅助项为本月累计',
      details: [
        [
          '本月涉及订单',
          completeCount(order, 'from_order_count', ['missing_order_identity']),
          '单',
        ],
        [
          '本月缺货SKU',
          completeCount(order, 'shortage_sku_count', [
            'missing_shortage',
            'missing_shortage_sku_identity',
          ]),
          '个',
        ],
        [
          '本月缺货订单',
          completeCount(order, 'affected_from_order_count', [
            'missing_order_identity',
            'missing_shortage',
            'invalid',
          ]),
          '单',
        ],
        ['本月订单量', completeValue(order, 'ordered'), '箱'],
        ['本月缺货量', completeValue(order, 'shortage'), '箱'],
      ],
    },
  ];
  return (
    <main className={`agent-root ${common.root}`}>
      <div className="agent-shell">
        <header className="agent-topbar compact-topbar">
          <div className="agent-topbar-context">
            <div className="workspace-heading">
              <strong>分仓库存经营看板</strong>
              <span>库存监控 · 补货决策 · 订单履约</span>
            </div>
            <div className="steps" aria-label="运营步骤">
              {['监控指标', '缺货订单', '补货下单', '滞库消化', '大日期处理'].map((s, i) => (
                <Fragment key={s}>
                  <button
                    className={i === 0 ? 'active' : ''}
                    onClick={() =>
                      setTab(i === 1 ? 'orders' : i > 2 ? 'structure' : 'replenishment')
                    }
                  >
                    <i>{i + 1}</i>
                    <span>{s}</span>
                  </button>
                  {i < 4 && <b aria-hidden="true">→</b>}
                </Fragment>
              ))}
            </div>
            <LocalQueryForm
              className={common.controls}
              onSubmit={(e) => {
                e.preventDefault();
                setDate(draft);
                refresh((n) => n + 1);
              }}
            >
              <input
                aria-label="读取时点"
                type="date"
                value={draft}
                max={businessDay()}
                required
                onChange={(e) => setDraft(e.target.value)}
              />
              <button className="secondary-button">刷新</button>
            </LocalQueryForm>
            <span className="warehouse-switch">全部分仓</span>
            <button
              className="warehouse-cycle-context"
              disabled
              title="补货周期属于业务配置，当前页面尚未接入有效配置"
            >
              补货周期 <strong>-</strong>
            </button>
          </div>
        </header>
        <div className="agent-layout without-ai workspace-only">
          <section className="workspace">
            {errors.map((e: string) => (
              <p key={e} role="alert" className={common.error}>
                {e}
              </p>
            ))}
            <div className={`kpi-grid safety-stock-kpis ${common.kpis}`} aria-busy={busy}>
              {cards.map((c) => (
                <article key={c.title} className={`kpi-card ${c.color}`}>
                  <div className="kpi-title">
                    <span>{c.title}</span>
                  </div>
                  <div className={`kpi-value ${c.color}`}>
                    {show(c.value)}
                    {c.value != null && <small>{c.unit}</small>}
                  </div>
                  <p className={common.metricScope}>{c.scope}</p>
                  <dl>
                    {c.details.map(([label, value, unit]) => (
                      <div key={String(label)}>
                        <dt>{label}</dt>
                        <dd>{show(value as number | null, String(unit))}</dd>
                      </div>
                    ))}
                  </dl>
                </article>
              ))}
            </div>
            <section className="priority-analysis" aria-label="AI 洞察">
              <h3>
                <span className="analysis-label">AI 洞察</span>
                <small>经营洞察</small>
              </h3>
              <p>
                <b>核心判断：</b>
                按分仓查看现存、可用、备单占用、冻结与超龄库存；货龄展示最大值。本月履约和近30日发货分别统计，库存快照日期及统计范围随指标列示。
              </p>
              <details className={common.scopeDetails}>
                <summary>统计范围与口径</summary>
                <p>
                  <b>数据边界：</b>
                  订单满足率为所选月截至读取日的分仓履约；调拨量为源计划记录；计划月份、快照日期、版本、单位尚未提供，不能当作已计算补货量。当前待发订单不以月累计订单替代。仓库发货来源涵盖{' '}
                  {shipments?.warehouse_count ?? '-'} 个仓库、{shipments?.row_count ?? '-'}{' '}
                  个仓库SKU；本月发货有值 {shipments?.month_valid_skus ?? '-'} 行、近30日有值{' '}
                  {shipments?.rolling_valid_skus ?? '-'} 行；末次发货日{' '}
                  {shipments?.last_ship_date ?? '-'}。
                </p>
              </details>
            </section>
            <nav className="tabs dealer-style-tabs" aria-label="库存业务页签">
              {tabs.map(([id, label]) => (
                <button
                  key={id}
                  className={tab === id ? 'active' : ''}
                  aria-current={tab === id ? 'page' : undefined}
                  onClick={() => setTab(id)}
                >
                  {label}
                </button>
              ))}
            </nav>
            <div className="business-panel">
              {tab === 'orders' && (
                <p className={common.note}>下方展示本月订单履约与交货记录，按所选统计日期查询。</p>
              )}
              <ConfiguredFactsPage
                key={[tab, date, revision].join(':')}
                config={config}
                embedded
                viewIds={views[tab]}
                date={date}
                onRead={(v) => updateContext('data', v)}
              />
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
