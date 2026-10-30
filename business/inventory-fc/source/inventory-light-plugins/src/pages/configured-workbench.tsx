import { useDashboardInsight } from '../../../../../shared/use-dashboard-insight';
import { branchDashboardEvidence } from '../../../../../shared/fc-dashboard-insight';
import {
  formatChainValue as show,
  formatChainValueParts,
} from '../../../../../shared/full-chain-display';
import { readFcWarehouseDirectory, type FcWarehouse } from './fc-warehouse-directory';
import { refreshConfiguredQueries } from '../../../../../shared/query-cache';
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
import { WarehouseSelect } from './fc/components/warehouse-select';
import { BusinessToolbar } from '../../../../../shared/business-toolbar';
import { LocalQueryForm } from '../../../../../shared/local-query-form';
import { QueryErrors } from '../../../../../shared/query-errors';
import { BusinessDateInput } from '../../../../../shared/business-date-input';
import { Fragment, useState, useEffect, useRef, useMemo } from 'react';
import config from '../../../../sql.config.json';
import { readConfiguredFacts } from '../../../../../shared/configured-facts';
import { fcCurrentMetric } from '../../../../../shared/fc-current-metrics';
import { currentShortageSum } from '../../../../../shared/current-shortage';
import { fcPlannedReader } from './fc-planned-page';
import { MonthlyBudgetPanel } from './fc/components/latest-data-panels';
import { FcCurrentOrders } from './fc-current-orders';
import { originalFcView } from '../../../../../shared/original-business-views';
import {
  ConfiguredFactsPage,
  type ConfiguredListState,
} from '../../../../../shared/configured-facts-page';
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
  const {
    trial,
    setTrial,
    planningPlans,
    setPlanningPlans,
    recordVersion,
    listSearch,
    setListSearch,
  } = useFcWorkflow();
  const readPlannedFacts = useMemo(() => fcPlannedReader(planningPlans), [planningPlans]);
  const [warehouse, setWarehouse] = useState('');
  const listStates = useRef<Record<string, ConfiguredListState>>({});
  const orderStates = useRef<Record<string, { warehouse: string; shortageOnly: boolean }>>({});
  const searches = useRef<Record<string, string>>({});
  const changeWarehouse = (next: string) => {
    searches.current[warehouse] = listSearch;
    setListSearch(searches.current[next] ?? '');
    setWarehouse(next);
  };
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
        if (!controller.signal.aborted) {
          const calculated = rows.map((row) => applyFcPlan(row, plans, date, cycleDays));
          const key = (row: (typeof calculated)[number]) =>
            `${String(row.warehouse_code).length}:${row.warehouse_code}${row.sku}`;
          setTrial({
            scope: fcTrialScope(date, cycleDays, warehouse),
            plans,
            positivePlanKeys: calculated.filter((row) => Number(row.recommended_qty) > 0).map(key),
            zeroPlanKeys: calculated.filter((row) => !(Number(row.recommended_qty) > 0)).map(key),
            ...summarizeFcRows(calculated),
          });
        }
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
          directoryCache.current = rows.length ? { key, rows, at: Date.now() } : null;
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
      listStates.current = {};
      orderStates.current = {};
      searches.current = {};
      setWarehouses([]);
      reloadWarehouses((n) => n + 1);
    };
    window.addEventListener('gea-identity-changed', clear);
    return () => window.removeEventListener('gea-identity-changed', clear);
  }, []);
  const scopeFilters: Record<string, string> = warehouse ? { warehouse_code: warehouse } : {};
  const { parts, errors, busy } = useConfiguredOverview(
    config,
    date,
    '',
    revision,
    (value) => updateContext('overview', value),
    cycleDays,
    config.overviewViewIds.filter(
      (id) => !['shipments', 'orders', 'branch-supply-current'].includes(id),
    ),
    cycleRules,
    warehouse,
    cycleWarehouse,
  );
  const order = parts['branch-supply']?.summary,
    plan = parts.replenishment?.summary;
  const trialActive = trial?.scope === fcTrialScope(date, cycleDays, warehouse);
  const recommended = trialActive
    ? trial.recommended
    : (knownNumber(plan?.recommended_qty) ?? knownNumber(plan?.known_recommended_qty));
  const missingRecommendations = trialActive
    ? trial.missingCount
    : (knownNumber(plan?.missing_calculation_count) ?? 0);
  const branchStock = parts['branch-stock']?.summary;
  const insightEvidence = branchDashboardEvidence({
    warehouseCode: warehouse,
    warehouseName:
      warehouses.find((item) => item.warehouse_code === warehouse)?.warehouse_name || '全部分仓',
    asOf: date,
    cycleDays,
    parts,
    localPlanTrial: !!trialActive,
    recommendedQty: recommended,
    missingCalculationCount: missingRecommendations,
    currentOrderShortageQty: currentShortageSum(parts['current-shortage']?.rows, 'shortage'),
  });
  const modelInsight = useDashboardInsight(insightEvidence, !busy && Object.keys(parts).length > 0);
  const insightAnswer = modelInsight.status === 'ready' ? modelInsight.answer : undefined;
  useEffect(() => {
    updateContext('dashboardAIInsight', {
      scope: warehouse || '全部分仓',
      status: modelInsight.status,
      source: 'model',
      text: modelInsight.status === 'ready' ? modelInsight.answer : undefined,
    });
  }, [warehouse, modelInsight.status, insightAnswer]);
  const currentDemand = fcCurrentMetric(parts['current-shortage']?.rows, 'demand');
  const currentAllocated = fcCurrentMetric(parts['current-shortage']?.rows, 'allocated');
  const currentGap = fcCurrentMetric(parts['current-shortage']?.rows, 'shortage');
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
      description: '当月基地已向分仓发货的调拨订单履约，按收货分仓归属，数量单位为件。',
      value: fulfillmentPercent(order),
      unit: '%',
      color: 'green',
      details: [
        ['补货订货量', completeValue(order, 'demand'), '件'],
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
      value: currentDemand.value,
      partial: currentDemand.partial,
      unit: '件',
      color: 'amber',
      description:
        '分仓向基地下单的有效未收货ASN，按预期数量扣已收数量统计当前需求。缺货先减基地已占用，再按基地与SKU扣共享可用库存，依订单创建时间分配。',
      details: [
        ['缺货量', currentGap.value, '件'],
        ['基地已占用', currentAllocated.value, '件'],
      ],
    },
  ];
  return (
    <main className={`agent-root ${common.root}`}>
      <div className="agent-shell">
        <BusinessToolbar
          filters={
            <>
              <WarehouseSelect
                label="选择分仓"
                value={warehouse}
                disabled={warehouseLoading}
                options={[
                  { id: '', name: warehouseLoading ? '分仓加载中…' : '全部分仓' },
                  ...(warehouse && !warehouses.some((item) => item.warehouse_code === warehouse)
                    ? [{ id: warehouse, name: warehouse }]
                    : []),
                  ...warehouses.map((item) => ({
                    id: item.warehouse_code,
                    name: `${item.warehouse_name || item.warehouse_code}（${item.warehouse_code}）`,
                  })),
                ]}
                onChange={(value) => {
                  changeWarehouse(value);
                  setTrial(null);
                }}
              />
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
                    onClick={() => {
                      if (i === 1) setTab('orders');
                      if (i >= 2) setTab('replenishment');
                    }}
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
                  {c.title === '当前订单' &&
                    Number(parts['current-shortage']?.rows?.[0]?.invalid) > 0 && (
                      <small>
                        {c.partial ? '已核实部分；' : ''}部分占用或缺货待核实，请查看订单明细。
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
            <section
              className="priority-analysis fc-dashboard-insight"
              aria-label="AI 洞察"
              aria-busy={modelInsight.status === 'loading'}
            >
              <h3>
                <span className="analysis-label">AI 洞察</span>
              </h3>
              <p role={modelInsight.status === 'error' ? 'status' : undefined}>
                {modelInsight.status === 'ready'
                  ? modelInsight.answer?.replace(/\s*\n+\s*/g, ' ')
                  : modelInsight.status === 'error'
                    ? 'AI 洞察暂时生成失败，可刷新后重试。'
                    : 'AI 洞察生成中…'}
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
                    initialFilter={orderStates.current[warehouse]}
                    rememberFilter={(filter) => {
                      orderStates.current[warehouse] = filter;
                    }}
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
                    search={listSearch}
                    onSearch={setListSearch}
                    observations={[
                      {
                        severity: missingRecommendations > 0 ? '中' : '高',
                        title: '按有效周期与计划联动补货',
                        detail: `建议补货 ${show(cards.find((card) => card.title === '待补货量')?.value ?? null, '件')}；待核实 ${missingRecommendations} 项。`,
                        suggestedAction: '核对计划来源、实际补货量和调减原因后确认。',
                      },
                      {
                        severity:
                          (currentShortageSum(parts['current-shortage']?.rows, 'shortage') ?? 0) > 0
                            ? '高'
                            : '低',
                        title: '待处理调拨订单缺口',
                        detail: `分仓向基地的当前调拨缺货 ${show(currentShortageSum(parts['current-shortage']?.rows, 'shortage'), '件')}；优先核对基地占用及共享可用库存。`,
                        suggestedAction: '按订单创建先后核查基地配单及补货。',
                      },
                    ]}
                  />
                ) : (
                  <FcConfirmationDirectory.Provider
                    value={{
                      rows: warehouses,
                      loading: warehouseLoading,
                      error: warehouseError,
                      retry: () => {
                        directoryCache.current = null;
                        refreshConfiguredQueries();
                        reloadWarehouses((value) => value + 1);
                      },
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
                      scopeFilters={tab === 'base' ? {} : scopeFilters}
                      initialState={
                        tab === 'base'
                          ? undefined
                          : listStates.current[JSON.stringify([warehouse, tab])]
                      }
                      rememberState={
                        tab === 'base'
                          ? undefined
                          : (state) => {
                              listStates.current[JSON.stringify([warehouse, tab])] = state;
                            }
                      }
                      initialFilters={tab === 'base' ? {} : { search: listSearch }}
                      presentation={originalFcView(config, tab, date)}
                      businessList={FcConfiguredList}
                      readFacts={readPlannedFacts}
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

                <WarehouseSelect
                  label={`规则${index + 1}层级`}
                  compact
                  disabled={false}
                  value={rule.level}
                  options={[
                    { id: 'sku', name: 'SKU' },
                    { id: 'material-group', name: '物料组' },
                    { id: 'category', name: '品类' },
                    { id: 'warehouse', name: '分仓' },
                  ]}
                  onChange={(value) =>
                    setRuleDraft(
                      ruleDraft.map((r, i) =>
                        i === index ? { ...r, level: value as FcCycleRule['level'] } : r,
                      ),
                    )
                  }
                />
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
                  <BusinessDateInput
                    aria-label={`规则${index + 1}生效日`}
                    avoidTriggerOverlap
                    value={rule.from}
                    onValueChange={(value) =>
                      setRuleDraft(
                        ruleDraft.map((r, i) => (i === index ? { ...r, from: value } : r)),
                      )
                    }
                  />
                </label>
                <label>
                  失效日
                  <BusinessDateInput
                    aria-label={`规则${index + 1}失效日`}
                    avoidTriggerOverlap
                    value={rule.to}
                    onValueChange={(value) =>
                      setRuleDraft(ruleDraft.map((r, i) => (i === index ? { ...r, to: value } : r)))
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

function OriginalOperations({
  config,
  date,
  revision,
  observations,
  warehouse,
  search,
  onSearch,
}: any) {
  const [{ parts, errors }, setState] = useState<any>({ parts: {}, errors: [] });
  useEffect(() => {
    const task = new AbortController();
    setState({ parts: {}, errors: [] });
    void Promise.all(
      ['branch-operations', 'warehouse-outbound'].map(async (id) => {
        try {
          const result = await readConfiguredFacts(
            config,
            id,
            {
              asOf: date,
              filters: warehouse
                ? id === 'branch-operations'
                  ? { warehouse_id: warehouse }
                  : { warehouse_code: warehouse }
                : {},
            },
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
  const cost = parts['branch-operations']?.summary;
  useEffect(() => {
    updateContext('branchOperations', {
      scope: { warehouseCode: warehouse || '全部分仓', asOf: date },
      inbound: parts['warehouse-outbound']?.summary?.incoming_qty ?? null,
      outbound: parts['warehouse-outbound']?.summary?.outgoing_qty ?? null,
      cost: cost ?? null,
      errors,
      definitions:
        '入出库按实际仓库与业务日期，出库为WMS关单delivery_qty件；费用独立，不以源缺失代零。',
    });
  }, [warehouse, date, parts, errors]);
  const entries = [
    ...observations,
    {
      severity: '低',
      title: '仓库流量事实',
      detail: `本月入库 ${show(knownNumber(parts['warehouse-outbound']?.summary?.incoming_qty), '件')}，出库 ${show(knownNumber(parts['warehouse-outbound']?.summary?.outgoing_qty), '件')}。`,
      suggestedAction: '结合库存水位和出库节奏持续观察周转变化。',
    },
  ];
  const filtered = entries.filter((item) =>
    `${item.title} ${item.detail} ${item.suggestedAction}`
      .toLowerCase()
      .includes((search ?? '').trim().toLowerCase()),
  );
  const exportOperations = () => {
    const rows = [
      ['级别', '标题', '详情', '建议动作'],
      ...entries.map((item) => [item.severity, item.title, item.detail, item.suggestedAction]),
    ];
    const content = rows
      .map((row) => row.map((value) => '"' + String(value).replaceAll('"', '""') + '"').join(','))
      .join('\r\n');
    const url = URL.createObjectURL(
      new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = `分仓-运营观察-${date}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <>
      <QueryErrors errors={errors} scope="inventory-fc-resources" />
      <LocalQueryForm className="panel-actions" onSubmit={(event) => event.preventDefault()}>
        <label>
          SKU／产品名称
          <input
            aria-label="运营观察搜索"
            placeholder="搜索 SKU／产品名称"
            value={search ?? ''}
            onChange={(event) => onSearch(event.target.value)}
          />
        </label>
        <button type="button" className="secondary-button" onClick={() => onSearch('')}>
          清空筛选
        </button>
        <button type="button" className="secondary-button" onClick={exportOperations}>
          CSV
        </button>
      </LocalQueryForm>
      {warehouse && (
        <p>按实际出库仓库和WMS关单日期统计，发货量以件计，含赠品；费用与考核按所选分仓编码统计。</p>
      )}
      <MonthlyBudgetPanel rows={[]} month={date.slice(0, 7)} />
      <div className="resource-grid">
        {[
          ['本月入库', knownNumber(parts['warehouse-outbound']?.summary?.incoming_qty), '件'],
          ['本月出库', knownNumber(parts['warehouse-outbound']?.summary?.outgoing_qty), '件'],
          ['本月仓储费', knownNumber(cost?.ccfje), '元'],
          ['本月运输费', knownNumber(cost?.ysfje), '元'],
          ['分仓过仓量', knownNumber(cost?.fc_act_dl_qty), '件'],
          ['分仓自身出货', null, '件'],
        ].map(([label, value, unit]) => (
          <article className="resource-card" key={String(label)}>
            <div>
              <strong
                title={
                  label === '本月出库'
                    ? `按实际出库仓库统计${date.slice(0, 7)}-01至${date}（含当日）的WMS关单发货件数，包含赠品。`
                    : label === '本月入库'
                      ? `按所选分仓统计${date.slice(0, 7)}-01至${date}（含当日）出入库台账交易日期的入库件数，包含台账调整。`
                      : undefined
                }
              >
                {label}
              </strong>
            </div>
            <p>{show(value as number | null, String(unit))}</p>
          </article>
        ))}
      </div>
      <div className="resource-grid" aria-label="分仓运营考核">
        {(
          [
            ['jfjsl', '交付及时率'],
            ['llfhl', '冷链符合率'],
            ['zqjfl', '准确交付率'],
            ['kwfhl', '库温符合率'],
            ['hdqrjsl', '回单确认及时率'],
            ['xxdzb', '新鲜度占比'],
          ] as const
        ).map(([field, label]) => (
          <article className="resource-card" key={field}>
            <div>
              <strong>{label}</strong>
            </div>
            <p>
              {knownNumber(cost?.[field]) === null
                ? '-'
                : `${((knownNumber(cost[field]) ?? 0) * 100).toLocaleString('zh-CN', { maximumFractionDigits: 2 })}%`}
            </p>
          </article>
        ))}
      </div>
      <div className="observation-list">
        {filtered.map((item) => (
          <article key={item.title}>
            <span className={`severity ${item.severity}`}>{item.severity}</span>
            <div>
              <strong>{item.title}</strong>
              <p>{item.detail}</p>
              <small>建议：{item.suggestedAction}</small>
            </div>
          </article>
        ))}
        {!filtered.length && <p>没有符合当前筛选条件的运营观察。</p>}
      </div>
    </>
  );
}
