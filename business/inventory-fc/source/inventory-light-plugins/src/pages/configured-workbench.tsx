import {
  formatChainValue as show,
  formatChainValueParts,
} from '../../../../../shared/full-chain-display';
import { readFcWarehouseDirectory, type FcWarehouse } from './fc-warehouse-directory';
import { inventoryAverageAge } from '../../../../../shared/inventory-age';
import { FcPersistencePanel } from './fc-persistence-panel';
import { readFcActionRows, applyFcPlan, summarizeFcRows } from './fc-workflow';
import { validateFcCycleRules, type FcCycleRule } from '../../../../../shared/fc-cycle-rules';
import {
  FcConfiguredList,
  FcConfirmationDirectory,
  FcWorkflowProvider,
  fcTrialScope,
  useFcWorkflow,
} from './configured-fc-list';
import { configuredCycleState } from '../native/memory-storage';
import { Modal } from '../dsh-ui/controls';
import { BusinessToolbar } from '../../../../../shared/business-toolbar';
import { LocalQueryForm } from '../../../../../shared/local-query-form';
import { QueryErrors } from '../../../../../shared/query-errors';
import { BusinessDateInput } from '../../../../../shared/business-date-input';
import { Fragment, useState, useEffect, useRef } from 'react';
import config from '../../../../sql.config.json';
import { readConfiguredFacts } from '../../../../../shared/configured-facts';
import { currentShortageSum } from '../../../../../shared/current-shortage';
import { FcCurrentOrders } from './fc-current-orders';
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
export default function ConfiguredWorkbench() {
  return (
    <FcWorkflowProvider>
      <WorkbenchBody />
    </FcWorkflowProvider>
  );
}
function WorkbenchBody() {
  const { trial, setTrial, planningPlans, setPlanningPlans, recordVersion } = useFcWorkflow();
  const [warehouse, setWarehouse] = useState('');
  const [warehouses, setWarehouses] = useState<FcWarehouse[]>([]);
  const directoryCache = useRef<{ key: string; at: number; rows: FcWarehouse[] } | null>(null);
  const [warehouseLoading, setWarehouseLoading] = useState(true);
  const [warehouseRevision, reloadWarehouses] = useState(0);
  const [warehouseError, setWarehouseError] = useState('');
  const [tab, setTab] = useState('replenishment'),
    [date, setDate] = useState(businessDay),
    [draft, setDraft] = useState(businessDay),
    [revision, refresh] = useState(0),
    [cycleDays, setCycleDays] = useState(
      () => configuredCycleState.read() ?? config.replenishmentPolicy.defaultCycleDays,
    ),
    [cycleDraft, setCycleDraft] = useState(String(cycleDays)),
    [cycleOpen, setCycleOpen] = useState(false),
    [cycleWarehouse, setCycleWarehouse] = useState(() => configuredCycleState.warehouse()),
    [cycleRules, setCycleRules] = useState<FcCycleRule[]>(() => configuredCycleState.rules()),
    [ruleDraft, setRuleDraft] = useState<FcCycleRule[]>([]),
    [cycleError, setCycleError] = useState(''),
    [planningError, setPlanningError] = useState('');
  useEffect(() => {
    const plans = planningPlans;
    setTrial(null);
    setPlanningError('');
    if (!plans?.length) return;
    const controller = new AbortController();
    void readFcActionRows(
      {
        config,
        viewId: 'replenishment',
        input: {
          asOf: date,
          filters: warehouse ? { warehouse_code: warehouse } : {},
          cycleDays,
          fcCycleRules: cycleRules,
          fcCycleWarehouse: cycleWarehouse,
        },
      },
      controller.signal,
    )
      .then((rows) => {
        if (!controller.signal.aborted)
          setTrial({
            scope: fcTrialScope(date, cycleDays, warehouse),
            plans,
            ...summarizeFcRows(rows.map((row) => applyFcPlan(row, plans, date, cycleDays))),
          });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setPlanningError('重新计算失败，请重新读取计划：' + error.message);
      });
    return () => controller.abort();
  }, [
    date,
    warehouse,
    cycleDays,
    cycleWarehouse,
    JSON.stringify(cycleRules),
    revision,
    planningPlans,
    setTrial,
  ]);
  useEffect(
    () =>
      configuredCycleState.subscribe(() => {
        setCycleDays(configuredCycleState.read() ?? config.replenishmentPolicy.defaultCycleDays);
        setCycleRules(configuredCycleState.rules());
        setCycleWarehouse(configuredCycleState.warehouse());
      }),
    [],
  );
  useEffect(() => {
    const key = JSON.stringify([date, warehouseRevision]);
    const cached = directoryCache.current;
    if (cached?.key === key && Date.now() - cached.at < 20 * 60 * 1000) {
      setWarehouses(cached.rows);
      setWarehouseLoading(false);
      setWarehouseError('');
      return;
    }
    const task = new AbortController();
    setWarehouseLoading(true);
    setWarehouseError('');
    setWarehouses([]);
    void readFcWarehouseDirectory(config, date, task.signal)
      .then((rows) => {
        if (!task.signal.aborted) {
          directoryCache.current = { key, rows, at: Date.now() };
          setWarehouses(rows);
        }
      })
      .catch(() => {
        if (!task.signal.aborted) {
          setWarehouses([]);
          setWarehouseError('分仓列表加载失败，请刷新重试');
        }
      })
      .finally(() => {
        if (!task.signal.aborted) setWarehouseLoading(false);
      });
    return () => task.abort();
  }, [date, revision, warehouseRevision]);
  useEffect(() => {
    const clear = () => {
      directoryCache.current = null;
      setWarehouse('');
      setWarehouses([]);
      reloadWarehouses((n) => n + 1);
    };
    window.addEventListener('gea-identity-changed', clear);
    return () => window.removeEventListener('gea-identity-changed', clear);
  }, []);
  const scopeFilters: Record<string, string> = warehouse ? { warehouse_code: warehouse } : {};
  const selectedBase = warehouses.find((item) => item.warehouse_code === warehouse)?.base;
  const { parts, errors, busy } = useConfiguredOverview(
    config,
    date,
    '',
    revision,
    (value) => updateContext('overview', value),
    cycleDays,
    config.overviewViewIds.filter((id) => id !== 'shipments'),
    cycleRules,
    warehouse,
    cycleWarehouse,
  );
  const order = parts.orders?.summary,
    plan = parts.replenishment?.summary;
  const trialActive = trial?.scope === fcTrialScope(date, cycleDays, warehouse);
  const recommended = trialActive
    ? trial.recommended
    : (knownNumber(plan?.recommended_qty) ?? knownNumber(plan?.known_recommended_qty));
  const missingRecommendations = trialActive
    ? trial.missingCount
    : (knownNumber(plan?.missing_calculation_count) ?? 0);
  const branchStock = parts['branch-stock']?.summary;
  const cards = [
    {
      title: '当前库存',
      value: knownNumber(branchStock?.total_qty),
      unit: '件',
      color: 'blue',
      details: [
        ['回顾周转', knownNumber(plan?.historical_turnover_days), '天'],
        [
          '展望周转',
          trial?.scope === fcTrialScope(date, cycleDays, warehouse)
            ? trial.forwardTurnover
            : knownNumber(plan?.forecast_turnover_days),
          '天',
        ],
      ],
    },
    {
      title: '平均货龄',
      value: inventoryAverageAge(branchStock),
      unit: '天',
      color: 'purple',
      details: [
        ['超龄库存量', knownNumber(branchStock?.overaged_qty), '件'],
        ['滞库风险量', knownNumber(branchStock?.stagnant_qty), '件'],
      ],
    },
    {
      title: '订单满足率',
      value: fulfillmentPercent(order),
      unit: '%',
      color: 'green',
      details: [
        ['已发订单量', completeValue(order, 'shipped_order_quantity'), '件'],
        ['实际发货量', completeValue(order, 'shipped'), '件'],
      ],
    },
    {
      title: '待补货量',
      value: recommended,
      unit: '件',
      color: 'red',
      details: [
        ['调拨备单量', knownNumber(plan?.known_preparing), '件'],
        ['调拨在途量', knownNumber(plan?.known_in_transit), '件'],
      ],
    },
    {
      title: '当前订单',
      value: currentShortageSum(parts['current-shortage']?.rows, 'demand'),
      unit: '件',
      color: 'amber',
      description:
        '当前未备单订单需求；缺货由三层模型按分仓与SKU扣可用库存后汇总，不是月累计履约缺货。',
      details: [
        ['缺货量', currentShortageSum(parts['current-shortage']?.rows, 'shortage'), '件'],
        ['未备单订单占用', currentShortageSum(parts['current-shortage']?.rows, 'allocated'), '件'],
      ],
    },
  ];
  return (
    <main className={`agent-root ${common.root}`}>
      <div className="agent-shell">
        <BusinessToolbar
          filters={
            <>
              <label className="warehouse-switch">
                <select
                  aria-label="选择分仓"
                  value={warehouse}
                  disabled={warehouseLoading}
                  onChange={(event) => {
                    setWarehouse(event.target.value);
                    setTrial(null);
                  }}
                >
                  <option value="">{warehouseLoading ? '分仓加载中…' : '全部分仓'}</option>
                  {warehouse && !warehouses.some((item) => item.warehouse_code === warehouse) && (
                    <option value={warehouse}>{warehouse}</option>
                  )}
                  {warehouses.map((item) => (
                    <option key={item.warehouse_code} value={item.warehouse_code}>
                      {item.warehouse_name || item.warehouse_code}（{item.warehouse_code}）
                    </option>
                  ))}
                </select>
              </label>
              {warehouseError && <span role="status">{warehouseError}</span>}
              <button
                type="button"
                className="warehouse-cycle-context"
                aria-label="补货周期配置"
                aria-haspopup="dialog"
                onClick={() => {
                  setCycleDraft(String(cycleDays));
                  setRuleDraft(cycleRules);
                  setCycleError('');
                  setCycleOpen(true);
                }}
              >
                补货周期{' '}
                <strong>
                  {cycleDays}天
                  {cycleDays === config.replenishmentPolicy.defaultCycleDays ? '（默认）' : ''}
                </strong>
              </button>
            </>
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
                value={draft}
                max={businessDay()}
                required
                onValueChange={setDraft}
              />
              <button className="secondary-button">刷新</button>
            </LocalQueryForm>
          }
          navigation={
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
          }
        />
        <div className="agent-layout without-ai workspace-only">
          <section className="workspace">
            <QueryErrors errors={[...errors, ...(planningError ? [planningError] : [])]} />
            <FcPersistencePanel
              showControls={false}
              plans={planningPlans}
              days={cycleDays}
              rules={cycleRules}
              cycleWarehouse={cycleWarehouse}
              refreshKey={revision}
              onCycles={(days, rules, warehouse, version) => {
                configuredCycleState.save(days, rules, warehouse);
                if (version)
                  recordVersion(warehouse, 'cycles', { revision: version, value: { days, rules } });
              }}
              onPlans={async (plans, signal, version, warehouse) => {
                signal.throwIfAborted();
                setPlanningPlans([
                  ...planningPlans.filter((p) => p.warehouseCode !== warehouse),
                  ...plans,
                ]);
                if (version && warehouse)
                  recordVersion(warehouse, 'plans', { revision: version, value: { plans } });
              }}
            />

            <div
              className={`kpi-grid safety-stock-kpis fc-compact-kpis ${common.kpis}`}
              data-overview-cards="fc"
              aria-busy={busy}
            >
              {cards.map((c) => (
                <article
                  key={c.title}
                  className={`kpi-card ${c.color}`}
                  title={
                    c.title === '平均货龄'
                      ? '按有效批次库存数量加权；批次货龄为库存快照日减生产日。最大货龄见货龄结构明细。'
                      : c.description
                  }
                >
                  <div className="kpi-title">
                    <span>{c.title}</span>
                  </div>
                  <div className={`kpi-value ${c.color}`}>
                    {formatChainValueParts(c.value, c.unit).value}
                    {formatChainValueParts(c.value, c.unit).unit && (
                      <small>{formatChainValueParts(c.value, c.unit).unit}</small>
                    )}
                  </div>
                  {c.title === '待补货量' && missingRecommendations > 0 && (
                    <small>
                      {c.value !== null ? '已测算部分；' : ''}
                      {missingRecommendations} 项待核实
                    </small>
                  )}
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
                <b>核心判断：</b>当前库存 {show(knownNumber(branchStock?.total_qty), '件')}
                ，建议补货 {show(recommended, '件')}。
                {missingRecommendations > 0 && (
                  <span>
                    以上为可计算部分，另有 {missingRecommendations} 项要素待核实，未按0计入。
                  </span>
                )}
              </p>
            </section>
            <section className="fc-list-panel" aria-label="库存业务列表">
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
                {tab === 'orders' ? (
                  <FcCurrentOrders
                    key={warehouse}
                    warehouseCode={warehouse}
                    config={config}
                    revision={revision}
                    onRead={(value) => updateContext('data', value)}
                  />
                ) : tab === 'operations' ? (
                  <OriginalOperations
                    warehouse={warehouse}
                    config={config}
                    date={date}
                    revision={revision}
                    observations={[
                      `当前未备单缺货 ${show(currentShortageSum(parts['current-shortage']?.rows, 'shortage'), '件')}；优先核对订单剩余需求及可用库存。`,
                      `60天及以上库存 ${show(knownNumber(branchStock?.overaged_qty), '件')}，90天及以上 ${show(knownNumber(branchStock?.stagnant_qty), '件')}；结合SKU批次和订单判断是否先消化库存。`,
                      `待核实补货SKU ${show(trial?.missingCount ?? knownNumber(plan?.missing_calculation_count))}；没有计划或可靠库存时不生成确定建议。`,
                    ]}
                  />
                ) : tab === 'base' && warehouse && !selectedBase ? (
                  <p role="status">当前分仓尚未关联基地。</p>
                ) : (
                  <FcConfirmationDirectory.Provider
                    value={{
                      rows: warehouses,
                      loading: warehouseLoading,
                      error: warehouseError,
                      retry: () => reloadWarehouses((value) => value + 1),
                    }}
                  >
                    <ConfiguredFactsPage
                      key={[
                        tab,
                        date,
                        warehouse,
                        revision,
                        cycleDays,
                        JSON.stringify(cycleRules),
                        cycleWarehouse,
                      ].join(':')}
                      config={config}
                      embedded
                      scopeFilters={
                        tab === 'base'
                          ? warehouse && selectedBase
                            ? { base: selectedBase }
                            : {}
                          : scopeFilters
                      }
                      presentation={originalFcView(config, tab)}
                      businessList={FcConfiguredList}
                      viewIds={views[tab]}
                      date={date}
                      cycleDays={cycleDays}
                      fcCycleRules={cycleRules}
                      fcCycleWarehouse={cycleWarehouse}
                      onRead={(v) => updateContext('data', v)}
                    />
                  </FcConfirmationDirectory.Provider>
                )}
              </div>
            </section>
          </section>
        </div>
      </div>
      <Modal
        visible={cycleOpen}
        title="补货周期配置"
        footer={null}
        onCancel={() => setCycleOpen(false)}
        style={{ width: 'min(850px, calc(100vw - 32px))', background: '#fff' }}
      >
        <LocalQueryForm
          className={`${common.controls} ${common.cycleForm}`}
          onSubmit={(event) => {
            event.preventDefault();
            const days = Number(cycleDraft);
            if (!Number.isInteger(days) || days < 1 || days > 365) return;
            try {
              const rules = validateFcCycleRules(ruleDraft);
              configuredCycleState.save(days, rules);
              setCycleRules(rules);
            } catch (error) {
              setCycleError((error as Error).message);
              return;
            }
            setCycleDays(days);
            setCycleOpen(false);
          }}
        >
          <label>
            补货周期（天）{' '}
            <input
              aria-label="补货周期（天）"
              type="number"
              min={1}
              max={365}
              step={1}
              required
              value={cycleDraft}
              onChange={(event) => setCycleDraft(event.target.value)}
            />
          </label>
          <p>备货天数 {config.replenishmentPolicy.preparationDays} 天</p>
          <p>
            优先级：SKU → 物料组 → 品类 → 分仓 →
            默认。规则仅在当前页面会话生效；对象填写实际编码或分类名称。
          </p>
          {ruleDraft.map((rule, index) => (
            <fieldset key={index}>
              <legend>周期规则 {index + 1}</legend>
              <div className={common.cycleRuleFields}>
                <select
                  aria-label={`规则${index + 1}状态`}
                  value={rule.status ?? 'effective'}
                  onChange={(event) =>
                    setRuleDraft(
                      ruleDraft.map((r, i) =>
                        i === index
                          ? { ...r, status: event.target.value as 'effective' | 'paused' }
                          : r,
                      ),
                    )
                  }
                >
                  <option value="effective">生效</option>
                  <option value="paused">暂停</option>
                </select>

                <select
                  aria-label={`规则${index + 1}层级`}
                  value={rule.level}
                  onChange={(event) =>
                    setRuleDraft(
                      ruleDraft.map((r, i) =>
                        i === index
                          ? { ...r, level: event.target.value as FcCycleRule['level'] }
                          : r,
                      ),
                    )
                  }
                >
                  <option value="sku">SKU</option>
                  <option value="material-group">物料组</option>
                  <option value="category">品类</option>
                  <option value="warehouse">分仓</option>
                </select>
                <input
                  aria-label={`规则${index + 1}对象`}
                  placeholder="对象编码/分类名称"
                  required
                  maxLength={100}
                  value={rule.object}
                  onChange={(event) =>
                    setRuleDraft(
                      ruleDraft.map((r, i) =>
                        i === index ? { ...r, object: event.target.value } : r,
                      ),
                    )
                  }
                />
                <input
                  aria-label={`规则${index + 1}天数`}
                  type="number"
                  min={1}
                  max={365}
                  required
                  value={rule.days}
                  onChange={(event) =>
                    setRuleDraft(
                      ruleDraft.map((r, i) =>
                        i === index ? { ...r, days: Number(event.target.value) } : r,
                      ),
                    )
                  }
                />
                <label>
                  生效日
                  <input
                    type="date"
                    value={rule.from}
                    onChange={(event) =>
                      setRuleDraft(
                        ruleDraft.map((r, i) =>
                          i === index ? { ...r, from: event.target.value } : r,
                        ),
                      )
                    }
                  />
                </label>
                <label>
                  失效日
                  <input
                    type="date"
                    value={rule.to}
                    onChange={(event) =>
                      setRuleDraft(
                        ruleDraft.map((r, i) =>
                          i === index ? { ...r, to: event.target.value } : r,
                        ),
                      )
                    }
                  />
                </label>
                <button
                  type="button"
                  onClick={() => setRuleDraft(ruleDraft.filter((_, i) => i !== index))}
                >
                  删除规则
                </button>
              </div>
            </fieldset>
          ))}
          <button
            type="button"
            disabled={ruleDraft.length >= 12}
            onClick={() =>
              setRuleDraft([...ruleDraft, { level: 'sku', object: '', days: 7, from: '', to: '' }])
            }
          >
            添加周期规则
          </button>
          {cycleError && <p role="alert">{cycleError}</p>}

          <div className={common.cycleActions}>
            <button
              type="button"
              onClick={() => {
                setCycleDraft(String(config.replenishmentPolicy.defaultCycleDays));
                setRuleDraft([]);
              }}
            >
              恢复默认
            </button>
            <button type="button" onClick={() => setCycleOpen(false)}>
              取消
            </button>
            <button type="submit">应用</button>
          </div>
        </LocalQueryForm>
      </Modal>
    </main>
  );
}

function OriginalOperations({ config, date, revision, observations, warehouse }: any) {
  const [{ parts, errors }, setState] = useState<any>({ parts: {}, errors: [] });
  useEffect(() => {
    const task = new AbortController();
    setState({ parts: {}, errors: [] });
    void Promise.all(
      (warehouse ? ['shipments'] : ['cost', 'shipments']).map(async (id) => {
        try {
          const result = await readConfiguredFacts(
            config,
            id,
            { asOf: date, filters: warehouse ? { warehouse_code: warehouse } : {} },
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
  }, [date, revision, warehouse]);
  const cost = parts.cost?.summary;
  return (
    <>
      <QueryErrors errors={errors} scope="inventory-fc-resources" />
      {warehouse && <p>当前分仓的发货数据；费用使用独立仓库编码，暂不混入全部仓库费用。</p>}
      <div className="resource-grid">
        {[
          ['本月入库', null, '件'],
          ['本月出库', knownNumber(parts.shipments?.summary?.month_ship_positive), '件'],
          ['本月仓储费', knownNumber(cost?.ccfje), '元'],
          ['本月运输费', knownNumber(cost?.ysfje), '元'],
          ['分仓过仓量', knownNumber(cost?.fc_act_dl_qty), '件'],
          ['省区整体出货', null, '件'],
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
        {observations?.map((observation: string) => (
          <p key={observation}>{observation}</p>
        ))}
      </div>
    </>
  );
}
