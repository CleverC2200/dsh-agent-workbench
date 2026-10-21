import { LocalQueryForm } from '../../../../../shared/local-query-form';
import { QueryErrors } from '../../../../../shared/query-errors';
import { BusinessDateInput } from '../../../../../shared/business-date-input';
import { Fragment, useState, useEffect } from 'react';
import config from '../../../../sql.config.json';
import { readConfiguredFacts } from '../../../../../shared/configured-facts';
import { originalFcView } from '../../../../../shared/original-business-views';
import { ConfiguredFactsPage } from '../../../../../shared/configured-facts-page';
import { useConfiguredOverview } from '../../../../../shared/use-configured-overview';
import {
  businessDay,
  fulfillmentPercent,
  completeValue,
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
  replenishment: ['replenishment'],
  orders: ['orders'],
  structure: ['inventory'],
  plan: ['plan'],
  base: ['base-resources'],
  operations: ['cost'],
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
    plan = parts.replenishment?.summary;
  const branchStock = parts['branch-stock']?.summary;
  const cards = [
    {
      title: '当前库存',
      value: knownNumber(branchStock?.total_qty),
      unit: '箱',
      color: 'blue',
      details: [
        ['回顾周转', knownNumber(plan?.historical_turnover_days), '天'],
        ['展望周转', null, '天'],
      ],
    },
    {
      title: '当前货龄',
      value: knownNumber(branchStock?.max_age),
      unit: '天',
      color: 'purple',
      details: [
        ['超龄库存量', knownNumber(branchStock?.overaged_qty), '箱'],
        ['滞库风险量', null, '箱'],
      ],
    },
    {
      title: '订单满足率',
      value: fulfillmentPercent(order),
      unit: '%',
      color: 'green',
      details: [
        ['已发订单量', completeValue(order, 'shipped_order_quantity'), '箱'],
        ['实际发货量', completeValue(order, 'shipped'), '箱'],
      ],
    },
    {
      title: '待补货量',
      value: knownNumber(plan?.recommended_qty),
      unit: '箱',
      color: 'red',
      details: [
        ['调拨备单量', knownNumber(plan?.known_preparing), '箱'],
        ['调拨在途量', knownNumber(plan?.known_in_transit), '箱'],
      ],
    },
    {
      title: '当前订单',
      value: null,
      unit: '箱',
      color: 'amber',
      details: [
        ['缺货量', null, '箱'],
        ['备单量', null, '箱'],
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
              <BusinessDateInput
                aria-label="读取时点"
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
              title="沿用原分仓固化规则默认7天，备货3天；个别仓库/SKU配置仍需业务配置接入"
            >
              补货周期 <strong>{config.replenishmentPolicy.defaultCycleDays}天（默认）</strong>
            </button>
          </div>
        </header>
        <div className="agent-layout without-ai workspace-only">
          <section className="workspace">
            <QueryErrors errors={errors} />
            <div className={`kpi-grid safety-stock-kpis ${common.kpis}`} aria-busy={busy}>
              {cards.map((c) => (
                <article
                  key={c.title}
                  className={`kpi-card ${c.color}`}
                  title={
                    c.title === '当前货龄'
                      ? '当前货龄取分仓库存最大库龄；平均货龄未提供。'
                      : undefined
                  }
                >
                  <div className="kpi-title">
                    <span>{c.title}</span>
                  </div>
                  <div className={`kpi-value ${c.color}`}>
                    {show(c.value)}
                    {c.value != null && <small>{c.unit}</small>}
                  </div>
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
                <b>核心判断：</b>当前库存 {show(knownNumber(branchStock?.total_qty), '箱')}
                ，建议补货 {show(knownNumber(plan?.recommended_qty), '箱')}。
              </p>
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
              {tab === 'operations' ? (
                <OriginalOperations config={config} date={date} revision={revision} />
              ) : (
                <ConfiguredFactsPage
                  key={[tab, date, revision].join(':')}
                  config={config}
                  embedded
                  presentation={originalFcView(config, tab)}
                  viewIds={views[tab]}
                  date={date}
                  onRead={(v) => updateContext('data', v)}
                />
              )}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

function OriginalOperations({ config, date, revision }: any) {
  const [{ parts, errors }, setState] = useState<any>({ parts: {}, errors: [] });
  useEffect(() => {
    const task = new AbortController();
    setState({ parts: {}, errors: [] });
    void Promise.all(
      ['cost', 'shipments'].map(async (id) => {
        try {
          const result = await readConfiguredFacts(
            config,
            id,
            { asOf: date },
            { signal: task.signal, summaryOnly: true },
          );
          if (result.summaryError)
            throw Object.assign(Error(result.summaryError.message), result.summaryError);
          if (!task.signal.aborted)
            setState((old: any) => ({ ...old, parts: { ...old.parts, [id]: result } }));
        } catch (error) {
          if (!task.signal.aborted)
            setState((old: any) => ({ ...old, errors: [...old.errors, (error as Error).message] }));
        }
      }),
    );
    return () => task.abort();
  }, [date, revision]);
  const cost = parts.cost?.summary;
  return (
    <>
      {errors.map((error: string) => (
        <p role="alert" key={error}>
          {error}
        </p>
      ))}
      <div className="resource-grid">
        {[
          ['本月入库', null, '箱'],
          ['本月出库', knownNumber(parts.shipments?.summary?.month_ship_positive), '箱'],
          ['本月仓储费', knownNumber(cost?.ccfje), '元'],
          ['本月运输费', knownNumber(cost?.ysfje), '元'],
          ['分仓过仓量', knownNumber(cost?.fc_act_dl_qty), '箱'],
          ['省区整体出货', null, '箱'],
        ].map(([label, value, unit]) => (
          <article className="resource-card" key={String(label)}>
            <div>
              <strong>{label}</strong>
            </div>
            <p>{show(value as number | null, String(unit))}</p>
          </article>
        ))}
      </div>
      <div className="observation-list">
        <p className="empty-state">暂无运营观察。</p>
      </div>
    </>
  );
}
