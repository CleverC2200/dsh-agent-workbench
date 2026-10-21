import { createPageViewState } from '../../business/shared/view-state.js';
const view = createPageViewState('inventory-orderworkbench');
let restoringView = false;
import { publishReport } from './publication.js';

const workbenchView = document.getElementById('workbenchView');
const activePage = 'workbench';
const pageTimeouts = new Set(),
  downloadUrls = new Set();
function schedule(callback, delay) {
  const handle = setTimeout(() => {
    pageTimeouts.delete(handle);
    callback();
  }, delay);
  pageTimeouts.add(handle);
  return handle;
}
let periodMode = 'month';
let selectedMonth = '2026-09';
let selectedWeek = '2026-09-14';
let weekInitialized = false;
let eventFilter = 'focus';
let taskFilter = 'all';
let dimensionTab = 'category-fill';
let selectedWorkbenchBase = '';
let expandedSkuCategories = new Set();
let expandedRegionChangeGroups = new Set();
const createdWorkbenchTasks = new Map();
const improvementTasks = new Map();
const dimensionIssueEdits = new Map();
let editingWorkbenchTaskId = '';
let pendingIssueEdit = null;
const workbenchLocalStateKey = 'order-workbench-improvements-v1';
try {
  const savedWorkbenchState = JSON.parse(localStorage.getItem(workbenchLocalStateKey) || '{}');
  (savedWorkbenchState.tasks || []).forEach((task) => improvementTasks.set(task.key, task.value));
  (savedWorkbenchState.edits || []).forEach((edit) =>
    dimensionIssueEdits.set(edit.key, edit.value),
  );
} catch {}
function saveWorkbenchLocalState() {
  try {
    localStorage.setItem(
      workbenchLocalStateKey,
      JSON.stringify({
        tasks: [...improvementTasks.entries()].map(([key, value]) => ({ key, value })),
        edits: [...dimensionIssueEdits.entries()].map(([key, value]) => ({ key, value })),
      }),
    );
  } catch {}
}
let pendingAdoption = null;
let adoptReturnFocus = null;
const metricDefinitions = [
  {
    key: '作废率',
    value: '2.05%',
    display: '2.05',
    unit: '%',
    badge: '累计指标',
    scope: '本期累计',
    previous: '上期 5.60%',
    change: '↓ -3.55pp',
    changeTone: 'good',
    same: '同期 11.37%',
    sameChange: '↓ -9.33pp',
    sameTone: 'good',
    target: '≤6%',
    targetLabel: '健康 ≤ 6%',
    gap: '低于上限 3.95pp',
    gapTone: 'good',
    trend: '较上期 -3.55pp',
    status: '达标',
    tone: '',
    formula: '周期内作废订单数 ÷ 同期接收订单总数 × 100%',
    note: '报告本期 2.05%、上期 5.60%、同期 11.37%；当前值达标。',
  },
  {
    key: '改单率',
    value: '2.20%',
    display: '2.20',
    unit: '%',
    badge: '累计指标',
    scope: '本期累计',
    previous: '上期 3.05%',
    change: '↓ -0.85pp',
    changeTone: 'good',
    same: '同期 —',
    sameChange: '—',
    sameTone: '',
    target: '≤2%',
    targetLabel: '健康 ≤ 2%',
    gap: '高于上限 0.20pp',
    gapTone: 'bad',
    trend: '较上期 -0.85pp',
    status: '未达标',
    tone: 'urgent',
    formula: '周期内改单量 ÷ 有效投单量 × 100%',
    note: '报告本期 2.20%、上期 3.05%；虽有改善，仍高于目标 0.20pp。',
  },
  {
    key: '订单满足率',
    value: '94.78%',
    display: '94.78',
    unit: '%',
    badge: '累计指标',
    scope: '本期累计',
    previous: '上期 93.75%',
    change: '↑ +1.03pp',
    changeTone: 'good',
    same: '同期 92.82%',
    sameChange: '↑ +1.95pp',
    sameTone: 'good',
    target: '>95%',
    targetLabel: '健康 > 95%',
    gap: '距健康线 -0.22pp',
    gapTone: 'bad',
    trend: '较上期 +1.03pp',
    status: '未达标',
    tone: 'urgent',
    formula: '周期内满足订单量 ÷ 同期订单需求量 × 100%',
    note: '报告本期 94.78%、上期 93.75%、同期 92.82%；虽有改善，仍距 95% 健康线 0.22pp。',
  },
  {
    key: '准交率',
    value: '95.82%',
    display: '95.82',
    unit: '%',
    badge: '累计指标',
    scope: '本期累计',
    previous: '上期 94.89%',
    change: '↑ +0.93pp',
    changeTone: 'good',
    same: '同期 —',
    sameChange: '—',
    sameTone: '',
    target: '>98.5%',
    targetLabel: '健康 > 98.5%',
    gap: '距健康线 -2.68pp',
    gapTone: 'bad',
    trend: '较上期 +0.93pp',
    status: '未达标',
    tone: 'urgent',
    formula: '周期内按约定时间交付的订单数 ÷ 当期应交付订单数 × 100%',
    note: '报告本期 95.82%、上期 94.89%；距 98.5% 目标差 2.68pp。',
  },
  {
    key: '超时订单数',
    value: '—',
    display: '—',
    unit: '',
    badge: '明细指标',
    scope: '周期累计',
    previous: '上期 —',
    change: '—',
    changeTone: '',
    same: '同期 —',
    sameChange: '—',
    sameTone: '',
    target: '待核算',
    targetLabel: '规则阈值待确认',
    gap: '需补订单级明细',
    gapTone: '',
    trend: '报告未给总张数',
    status: '待核算',
    tone: '',
    formula: '周期内未在规定订单处理或履约时效内完成相应节点的订单累计数',
    note: '报告仅列出面点订单进度超时 17% 等问题，不能换算成全局超时订单张数。',
  },
  {
    key: '预警订单数',
    value: '—',
    display: '—',
    unit: '',
    badge: '明细指标',
    scope: '周期累计',
    previous: '上期 —',
    change: '—',
    changeTone: '',
    same: '同期 —',
    sameChange: '—',
    sameTone: '',
    target: '待核算',
    targetLabel: '预警规则待确认',
    gap: '需订单级去重',
    gapTone: '',
    trend: '需订单级去重',
    status: '待核算',
    tone: '',
    formula: '周期内命中预设异常规则、需要重点关注与核实的订单数',
    note: '报告提供异常事项与指标风险，但未提供去重后的预警订单明细。',
  },
  {
    key: '周转天数',
    value: '11.7 天',
    display: '11.7',
    unit: '天',
    badge: '库存指标',
    scope: '本期累计',
    previous: '上期 13.0 天',
    change: '↓ -1.3 天',
    changeTone: 'good',
    same: '同期 10.3 天',
    sameChange: '↑ +1.3 天',
    sameTone: 'bad',
    target: '<12 天',
    targetLabel: '健康 < 12 天',
    gap: '低于上限 0.3 天',
    gapTone: 'good',
    trend: '较上期 -1.3 天',
    status: '达标',
    tone: '',
    formula: '按业务定义，周转天数即可发货天数，按可用库存与日均需求测算。',
    note: '报告本期整体可发货/周转天数 11.7 天，上期 13.0 天；本指标沿用“可发货天数”口径。',
  },
  {
    key: '货龄（>60天库存占比）',
    value: '—',
    display: '—',
    unit: '',
    badge: '库存指标',
    scope: '当前库存',
    previous: '上期 —',
    change: '—',
    changeTone: '',
    same: '同期 —',
    sameChange: '—',
    sameTone: '',
    target: '待补批次数据',
    targetLabel: '按库存件数计算',
    gap: '报告未提供货龄明细',
    gapTone: '',
    trend: '需批次库存数据',
    status: '待核算',
    tone: '',
    formula: '库龄超过 60 天库存件数 ÷ 总库存件数 × 100%',
    note: '当前报告未提供按库龄拆分的库存件数，暂显示待核算。',
  },
];
const reportEvents = [
  {
    id: 'west',
    focus: true,
    kind: '重点',
    title: '西南基地履约与满足率双低',
    summary: '满足率 92.24%，准交率 89.38%，可发货 8.9 天；为 9 月最大短板。',
    evidence:
      '基地维度报告：西南满足率 92.24%、准交率 89.38%、可发货天数 8.9 天。报告将冷库能力与调拨延迟列为重要约束。',
    action: '核实外租仓与调拨分流、生产节拍；推进 9.25 冷库立库技改可行性评估。',
  },
  {
    id: 'prepared',
    focus: true,
    kind: '重点',
    title: '预制食材满足率为品类最低',
    summary: '本期 87.27%，低于 95% 目标；骨肉相连、炖馍等产能约束需跟进。',
    evidence:
      '品类报告：预制食材满足率 87.27%，为 8 个品类最低；原因包括骨肉相连与炖馍产能缺口、ODM 资源调拨。',
    action: '复核 9.15 炖馍双班启动与第二家代工厂产能验证，明确可交付量。',
  },
  {
    id: 'noodle',
    focus: true,
    kind: '重点',
    title: '面点满足率未达标',
    summary: '本期 94.80%，报告列出缺货 2,600 件、订单进度超时 17%。',
    evidence:
      '品类报告：面点满足率 94.80%，缺货 2,600 件；订单进度超时 17% 是报告中的品类问题比例，并非全局超时订单数。',
    action: '核对供应与开单、派车、装车节点；明确延期原因及月内恢复节奏。',
  },
  {
    id: 'change',
    focus: true,
    kind: '关注',
    title: '改单率仍高于目标',
    summary: '整体 2.20%，目标 ≤2%；高势能渠道销售改单率 27.55% 属明显异常。',
    evidence:
      '核心 KPI 报告：改单率由 3.05% 降至 2.20%，但未达 ≤2% 目标；大区/省区报告列出高势能渠道销售 27.55%。',
    action: '先核对渠道口径及改单原因，再分渠道复盘锁单与需求变更流程。',
  },
  {
    id: 'cover',
    focus: false,
    kind: '关注',
    title: '火锅料与汤圆可发货天数偏高',
    summary: '火锅料 19.3 天、汤圆 13.4 天，均高于 <12 天目标。',
    evidence: '品类可发货天数报告：火锅料 19.3 天，为严重超标；汤圆 13.4 天，略超目标。',
    action: '复核前置备货、动销节奏与库存结构，避免单纯增加备货。',
  },
];
const reportActions = [
  {
    id: 'prepared',
    icon: '⚡',
    title: '复核预制食材产能补位',
    subtitle: '建议角色：计划与供应协同 · 待业务确认',
    detail: '跟进炖馍 9.15 双班启动、第二家代工厂实际月产能及 ODM 交付排期。',
    taskId: 'capacity',
  },
  {
    id: 'west',
    icon: '↗',
    title: '推进西南仓配能力改善',
    subtitle: '建议角色：仓配协同 · 待业务确认',
    detail: '外租仓与调拨分流同步评估，按报告节点推进 9.25 立库技改可行性。',
    taskId: 'warehouse',
  },
  {
    id: 'noodle',
    icon: '◷',
    title: '拆解订单节点时效',
    subtitle: '建议角色：订单运营 · 待业务确认',
    detail: '从开单、派车、装车三阶段核实延期与缺货，关联面点和郑州/遂平准交问题。',
    taskId: 'timing',
  },
  {
    id: 'cover',
    icon: '◈',
    title: '复核过量备货与动销',
    subtitle: '建议角色：商品计划 · 待业务确认',
    detail: '优先复核火锅料 19.3 天与汤圆 13.4 天的可发货天数，明确消化节奏。',
    taskId: 'inventory',
  },
];
const reportTasks = [
  {
    id: 'capacity',
    title: '验证预制食材产能补位',
    issue: '预制食材 · 满足率 87.27%',
    role: '计划 / 供应协同',
    due: '09.15（报告节点）',
    status: '待跟进',
    detail: '核实炖馍双班启动、第二家代工厂实际产能及 ODM 排期。报告只提出措施，执行进度待确认。',
  },
  {
    id: 'warehouse',
    title: '评估西南立库技改与调拨分流',
    issue: '西南基地 · 准交率 89.38%',
    role: '仓配协同',
    due: '09.25（报告节点）',
    status: '待跟进',
    detail: '完成冷库立库技改可行性评估，并核实外租仓、调拨分流方案。',
  },
  {
    id: 'timing',
    title: '复核开单 / 派车 / 装车时效',
    issue: '面点缺货 · 郑州 / 遂平准交',
    role: '订单运营',
    due: '9 月内（报告目标）',
    status: '待跟进',
    detail: '逐节点识别超时原因、责任环节和改进空间；报告中的 17% 为面点问题比例。',
  },
  {
    id: 'inventory',
    title: '复核火锅料与汤圆备货节奏',
    issue: '可发货天数 19.3 / 13.4 天',
    role: '商品计划',
    due: '待业务确认',
    status: '待跟进',
    detail: '区分前置备货与实际动销，提出库存结构和去化建议。',
  },
];
// 周报的“本周”列独立展示；不将“本期（9.1–9.6）”累计值误作周度值。
const weeklyMetricDefinitions = [
  {
    key: '作废率',
    value: '1.61%',
    display: '1.61',
    unit: '%',
    badge: '周度指标',
    scope: '本周',
    previous: '上周 3.29%',
    change: '↓ -1.69pp',
    changeTone: 'good',
    same: '同期 8.80%',
    sameChange: '↓ -7.19pp',
    sameTone: 'good',
    target: '≤6%',
    targetLabel: '健康 ≤ 6%',
    gap: '低于上限 4.39pp',
    gapTone: 'good',
    trend: '周环比 -1.69pp',
    status: '达标',
    tone: '',
    formula: '周内作废订单数 ÷ 同周接收订单总数 × 100%',
    note: '9.6 周报“周度对比”本周 1.61%，上周 3.29%，同周 8.80%。周报本期累计值另为 1.53%。',
  },
  {
    key: '改单率',
    value: '2.00%',
    display: '2.00',
    unit: '%',
    badge: '周度指标',
    scope: '本周',
    previous: '上周 1.97%',
    change: '↑ +0.02pp',
    changeTone: 'bad',
    same: '同期 —',
    sameChange: '—',
    sameTone: '',
    target: '≤2%',
    targetLabel: '健康 ≤ 2%',
    gap: '位于目标上限',
    gapTone: 'good',
    trend: '周环比 +0.02pp',
    status: '达标',
    tone: '',
    formula: '周内改单量 ÷ 同周有效投单量 × 100%',
    note: '本周 2.00%，恰在目标上限；上周 1.97%。周报本期累计值 2.02%，状态为基本达标，两个口径不可混用。',
  },
  {
    key: '订单满足率',
    value: '94.24%',
    display: '94.24',
    unit: '%',
    badge: '周度指标',
    scope: '本周',
    previous: '上周 90.81%',
    change: '↑ +3.43pp',
    changeTone: 'good',
    same: '同期 —',
    sameChange: '—',
    sameTone: '',
    target: '>95%',
    targetLabel: '健康 > 95%',
    gap: '距健康线 -0.76pp',
    gapTone: 'bad',
    trend: '周环比 +3.43pp',
    status: '未达标',
    tone: 'urgent',
    formula: '周内满足订单量 ÷ 同周订单需求量 × 100%',
    note: '本周 94.24%，上周 90.81%；周报本期累计满足率 95.13%，在报告核心 KPI 表中为达标。',
  },
  {
    key: '准交率',
    value: '93.14%',
    display: '93.14',
    unit: '%',
    badge: '周度指标',
    scope: '本周',
    previous: '上周 89.52%',
    change: '↑ +3.62pp',
    changeTone: 'good',
    same: '同期 —',
    sameChange: '—',
    sameTone: '',
    target: '>98.5%',
    targetLabel: '健康 > 98.5%',
    gap: '距健康线 -5.36pp',
    gapTone: 'bad',
    trend: '周环比 +3.62pp',
    status: '未达标',
    tone: 'urgent',
    formula: '周内按约定时间交付的订单数 ÷ 同周应交付订单数 × 100%',
    note: '本周 93.14%，上周 89.52%；周报本期累计准交率 93.82%，亦未达目标。',
  },
  {
    key: '周转天数',
    value: '10.83 天',
    display: '10.83',
    unit: '天',
    badge: '库存指标',
    scope: '本周',
    previous: '上周 10.23 天',
    change: '↑ +0.59 天',
    changeTone: 'bad',
    same: '同期 —',
    sameChange: '—',
    sameTone: '',
    target: '<12 天',
    targetLabel: '健康 < 12 天',
    gap: '低于上限 1.17 天',
    gapTone: 'good',
    trend: '周环比 +0.59 天',
    status: '达标',
    tone: '',
    formula: '按业务定义即发货天数；沿用周报整体可发货天数口径。',
    note: '本周周转天数沿用可发货天数 10.83 天。',
  },
  {
    key: '货龄（>60天库存占比）',
    value: '—',
    display: '—',
    unit: '',
    badge: '库存指标',
    scope: '当前库存',
    previous: '上期 —',
    change: '—',
    changeTone: '',
    same: '同期 —',
    sameChange: '—',
    sameTone: '',
    target: '待补批次数据',
    targetLabel: '按库存件数计算',
    gap: '报告未提供货龄明细',
    gapTone: '',
    trend: '需批次库存数据',
    status: '待核算',
    tone: '',
    formula: '库龄超过 60 天库存件数 ÷ 总库存件数 × 100%',
    note: '当前报告未提供按库龄拆分的库存件数，暂显示待核算。',
  },
];
const weeklyReportEvents = [
  {
    id: 'west-week',
    focus: true,
    kind: '重点',
    title: '西南基地满足率和准交率双低',
    summary: '满足率 92.10%、准交率 82.90%；5 个品类满足率低于 90%。',
    evidence:
      '周报基地表：西南满足率 92.10%、准交率 82.90%。交叉表中预制食材 79.06%、馄饨 82.36%、火锅料 83.29%、面点 86.84%、水饺 89.30%。',
    action: '核实产能、外注调拨与订单节点延迟；优先复盘低于 90% 的基地×品类组合。',
  },
  {
    id: 'zhengzhou-week',
    focus: true,
    kind: '重点',
    title: '郑州基地履约时效未达标',
    summary: '满足率 94.88%、准交率 94.65%；开单、派车和装车节点需复核。',
    evidence:
      '周报基地表：郑州满足率 94.88%、准交率 94.65%；报告指出休闲、水饺、预制食材等满足率缺口，以及开单、派车、装车超时问题。',
    action: '按订单节点识别缺货与延迟，核实排单、派车和装车时效，明确人工复核责任。',
  },
  {
    id: 'prepared-week',
    focus: true,
    kind: '重点',
    title: '预制食材满足率偏低',
    summary: '本期满足率 91.71%，缺货 0.97 万件；骨肉相连和炖馍产能待跟进。',
    evidence:
      '周报品类表：预制食材满足率 91.71%；问题分析指出骨肉相连需补产能，炖馍仍有产能缺口。西南×预制食材仅 79.06%。',
    action: '复核第二家代工厂实际产能、炖馍双班启动与 ODM 交付排期。',
  },
  {
    id: 'dumpling-week',
    focus: true,
    kind: '重点',
    title: '水饺满足率未达标',
    summary: '本期满足率 93.46%，缺货 3.13 万件；同比下降 2.04pp。',
    evidence:
      '周报品类表：水饺满足率 93.46%，同比 -2.04pp。报告指出冷鲜肉质量问题、订单积压与 9 月初外协产能未及时补位。',
    action: '核实配方质量、外协产能启动和调拨支援，按基地跟进缺货恢复。',
  },
  {
    id: 'hotpot-week',
    focus: true,
    kind: '关注',
    title: '火锅料可发货天数严重超标',
    summary: '本期 16.60 天，高于 12 天目标；郑州、华东局部更高。',
    evidence:
      '周报品类表：火锅料可发货天数 16.60 天；基地×品类表中郑州 15.58 天、华东 13.07 天。报告认为 9 月产能缺失与前置备货有关。',
    action: '跟进 9 月中旬销售发货进度，调整产能和交付节奏，防止过量备货。',
  },
  {
    id: 'leisure-week',
    focus: false,
    kind: '关注',
    title: '休闲品类满足率不足',
    summary: '本期 94.21%，缺货 2.16 万件；纸皮烧麦和酥皮馅饼是重点。',
    evidence:
      '周报品类表：休闲满足率 94.21%。问题分析列出纸皮烧麦 9,905 件、酥皮馅饼 4,691 件等缺货事项。',
    action: '复核订单显示与实际库存差异，按报告措施安排排产和调拨。',
  },
];
const weeklyReportActions = [
  {
    id: 'west-week',
    icon: '↗',
    title: '复盘西南基地低满足组合',
    subtitle: '建议角色：订单 / 供应协同 · 待业务确认',
    detail: '优先核实西南×预制食材、水饺、面点、馄饨和火锅料的缺货与交付约束。',
    taskId: 'west-week-task',
  },
  {
    id: 'zhengzhou-week',
    icon: '◷',
    title: '拆解郑州订单节点时效',
    subtitle: '建议角色：订单运营 / 仓配 · 待业务确认',
    detail: '按开单、派车、装车节点核对超时原因，结合缺货与拼车情况复核。',
    taskId: 'zhengzhou-week-task',
  },
  {
    id: 'dumpling-week',
    icon: '⚡',
    title: '核实水饺产能补位',
    subtitle: '建议角色：生产 / 供应协同 · 待业务确认',
    detail: '跟进配方质量、外协产能和调拨支援，优先处理 3.13 万件缺口。',
    taskId: 'dumpling-week-task',
  },
  {
    id: 'hotpot-week',
    icon: '◈',
    title: '调整火锅料备货节奏',
    subtitle: '建议角色：商品计划 · 待业务确认',
    detail: '在保证交付的同时跟踪火锅料 16.60 天可发货天数的消化情况。',
    taskId: 'hotpot-week-task',
  },
];
const weeklyReportTasks = [
  {
    id: 'west-week-task',
    title: '复核西南基地低满足组合',
    issue: '西南基地 · 满足率 92.10% / 准交率 82.90%',
    role: '订单 / 供应协同',
    due: '待业务确认',
    status: '待跟进',
    detail: '按基地×品类明细核实五个低于 90% 的组合及对应缺货原因；不表示已下发正式任务。',
  },
  {
    id: 'zhengzhou-week-task',
    title: '复核郑州开单 / 派车 / 装车时效',
    issue: '郑州基地 · 准交率 94.65%',
    role: '订单运营 / 仓配',
    due: '待业务确认',
    status: '待跟进',
    detail: '按报告列出的时效环节检查订单节点和缺货原因。',
  },
  {
    id: 'dumpling-week-task',
    title: '跟进水饺外协与调拨产能',
    issue: '水饺 · 满足率 93.46% / 缺货 3.13 万件',
    role: '生产 / 供应协同',
    due: '待业务确认',
    status: '待跟进',
    detail: '确认质量复核、外协产能启动和调拨支援进度。',
  },
  {
    id: 'hotpot-week-task',
    title: '复核火锅料前置备货',
    issue: '火锅料 · 可发货天数 16.60 天',
    role: '商品计划',
    due: '待业务确认',
    status: '待跟进',
    detail: '跟踪 9 月中旬发货和库存消化节奏，避免过量备货。',
  },
];
const workbenchDimensions = {
  'category-fill': {
    title: '品类满足率（月度）',
    note: '目标线 95%；本期低于目标的品类以红色标识。',
    summary:
      '8 个品类中 5 个达标、3 个未达标；预制食材 87.27% 为最低项，水饺虽环比改善 5.54pp 仍未越过目标线。',
    columns: ['品类', '本期满足率', '上期', '环比', '同期', '同比', '状态'],
    rows: [
      ['汤圆', '97.29%', '96.50%', '+0.79pp', '95.79%', '+1.50pp', '达标'],
      ['馄饨', '95.18%', '98.67%', '-3.49pp', '92.86%', '+2.32pp', '达标'],
      ['火锅料', '95.72%', '95.64%', '+0.07pp', '91.75%', '+3.97pp', '达标'],
      ['粽子', '100.00%', '—', '—', '0%', '+100pp', '达标（季节性）'],
      ['休闲', '95.55%', '94.94%', '+0.61pp', '93.18%', '+2.37pp', '达标'],
      ['面点', '94.80%', '95.13%', '-0.33pp', '87.79%', '+7.01pp', '未达'],
      ['水饺', '94.52%', '88.97%', '+5.54pp', '93.28%', '+1.24pp', '未达'],
      ['预制食材', '87.27%', '91.25%', '-3.98pp', '85.48%', '+1.79pp', '未达（最低）'],
    ],
    risks: {
      5: {
        analysis:
          '散装圈包订单进度偏慢，山姆馒头阶段性产能不足；大师馒头跨区调拨不及时，部分原料到位滞后。',
        measure: '优先保障缺料与缺货品资源；跟进山姆产能爬坡，并建立西南调拨 48 小时响应机制。',
      },
      6: {
        analysis: '冷鲜水饺缺货延续，新品工艺与库存准备不足，外协产能未按计划到位。',
        measure: '提升郑州产线产能，跟进外协资源到位；对新品设置安全库存并逐项关闭缺货。',
      },
      7: {
        analysis: '骨肉相连等产品受 ODM 产能不足影响，部分单班产能与包装环节存在缺口。',
        measure: '完成第二家产能验证和第三家资源储备；恢复双代工并为新品设置两周安全库存。',
      },
    },
  },
  'category-days': {
    title: '品类可发货天数',
    note: '依据 9.13 库存、销售计划与计划日均测算。',
    summary:
      '整体库存保障约 11.7 天；火锅料 19.3 天严重偏高，汤圆 13.4 天略超标，其余可核算品类处于目标范围。',
    columns: ['品类', '9.13 库存', '销售计划', '计划日均', '可发货天数', '剔除大日期后', '状态'],
    rows: [
      [
        '汤圆',
        '741,135',
        '1,656,350',
        '55,212',
        '13.4 天',
        '12.1 天',
        '略超标，需关注大日期产品处理进度',
      ],
      [
        '火锅料',
        '525,522',
        '843,677',
        '27,215',
        '19.3 天',
        '19.2 天',
        '严重超标，产能不足需持续生产的周转天数标准需预警报备',
      ],
      ['休闲', '628,118', '1,625,240', '52,427', '12.0 天', '11.9 天', '达标'],
      ['预制食材', '139,920', '417,360', '13,463', '10.4 天', '10.2 天', '达标'],
      ['面点', '193,514', '582,050', '18,776', '10.3 天', '9.9 天', '达标'],
      ['水饺', '902,469', '2,968,099', '95,745', '9.4 天', '9.3 天', '达标'],
      ['馄饨', '174,603', '740,290', '23,880', '7.3 天', '7.3 天', '达标'],
      ['粽子', '18,345', '—', '—', '—', '—', '—'],
    ],
    risks: {
      0: {
        analysis:
          '汤圆库存保障 13.4 天，剔除大日期后仍为 12.1 天，前置备货与大日期库存消化节奏偏慢。',
        measure: '逐项核对大日期产品处理计划，按销售节奏压降前置备货，并建立周度库存消化跟踪。',
      },
      1: {
        analysis:
          '火锅料库存保障 19.3 天，明显高于目标；前置备货叠加产能连续生产要求，形成阶段性高库存。',
        measure: '联动销售、计划与生产控制后续排产，按订单消化库存；超标准部分纳入专项预警报备。',
      },
    },
  },
  'region-change': {
    title: '改单率—大区 / 省区聚焦',
    note: '点击首列展开客户名称、编码、客户经理、改单订单数及订单总数（演示明细）。',
    summary:
      '10 个区域或渠道改单率异常，高势能渠道销售 27.55% 为最严重项；其余区域需按客户、品类和改单原因继续拆解。',
    columns: ['大区 / 渠道', '本期改单率', '上期', '环比', '状态'],
    rows: [
      ['高势能渠道销售', '27.55%', '0.00%', '+27.55pp', '严重异常'],
      ['华南事业部', '3.50%', '2.74%', '+0.76pp', '异常'],
      ['豫北经销直营区', '3.39%', '1.68%', '+1.72pp', '异常'],
      ['粤海经销省区', '3.71%', '1.88%', '+1.83pp', '异常'],
      ['华南专客组', '2.23%', '0.00%', '+2.23pp', '异常'],
      ['广西省区', '4.48%', '7.09%', '-2.61pp', '异常'],
      ['辽宁省区', '4.60%', '0.00%', '+4.60pp', '异常'],
      ['吉林直营区', '2.48%', '0.24%', '+2.24pp', '异常'],
      ['湖南经销省区', '2.59%', '1.91%', '+0.67pp', '异常'],
      ['豫南经销省区', '2.57%', '2.11%', '+0.46pp', '异常'],
    ],
    customerDetails: [
      [
        {
          name: '演示客户-高势能001',
          code: 'CUST-DEMO-001',
          manager: '王琳',
          changedOrders: 12,
          totalOrders: 44,
        },
        {
          name: '演示客户-高势能002',
          code: 'CUST-DEMO-002',
          manager: '赵凯',
          changedOrders: 8,
          totalOrders: 29,
        },
      ],
      [
        {
          name: '演示客户-华南001',
          code: 'CUST-DEMO-003',
          manager: '刘敏',
          changedOrders: 6,
          totalOrders: 148,
        },
        {
          name: '演示客户-华南002',
          code: 'CUST-DEMO-004',
          manager: '吴凡',
          changedOrders: 4,
          totalOrders: 138,
        },
      ],
      [
        {
          name: '演示客户-豫北001',
          code: 'CUST-DEMO-005',
          manager: '许峰',
          changedOrders: 5,
          totalOrders: 120,
        },
        {
          name: '演示客户-豫北002',
          code: 'CUST-DEMO-006',
          manager: '梁静',
          changedOrders: 3,
          totalOrders: 116,
        },
      ],
      [
        {
          name: '演示客户-粤海001',
          code: 'CUST-DEMO-007',
          manager: '刘敏',
          changedOrders: 5,
          totalOrders: 108,
        },
        {
          name: '演示客户-粤海002',
          code: 'CUST-DEMO-008',
          manager: '吴凡',
          changedOrders: 3,
          totalOrders: 108,
        },
      ],
      [
        {
          name: '演示客户-华南专客001',
          code: 'CUST-DEMO-009',
          manager: '刘敏',
          changedOrders: 4,
          totalOrders: 135,
        },
        {
          name: '演示客户-华南专客002',
          code: 'CUST-DEMO-010',
          manager: '吴凡',
          changedOrders: 2,
          totalOrders: 134,
        },
      ],
      [
        {
          name: '演示客户-广西001',
          code: 'CUST-DEMO-011',
          manager: '刘敏',
          changedOrders: 3,
          totalOrders: 57,
        },
        {
          name: '演示客户-广西002',
          code: 'CUST-DEMO-012',
          manager: '吴凡',
          changedOrders: 2,
          totalOrders: 55,
        },
      ],
      [
        {
          name: '演示客户-辽宁001',
          code: 'CUST-DEMO-013',
          manager: '王琳',
          changedOrders: 4,
          totalOrders: 68,
        },
        {
          name: '演示客户-辽宁002',
          code: 'CUST-DEMO-014',
          manager: '赵凯',
          changedOrders: 2,
          totalOrders: 62,
        },
      ],
      [
        {
          name: '演示客户-吉林001',
          code: 'CUST-DEMO-015',
          manager: '王琳',
          changedOrders: 3,
          totalOrders: 102,
        },
        {
          name: '演示客户-吉林002',
          code: 'CUST-DEMO-016',
          manager: '赵凯',
          changedOrders: 2,
          totalOrders: 100,
        },
      ],
      [
        {
          name: '演示客户-湖南001',
          code: 'CUST-DEMO-017',
          manager: '陈涛',
          changedOrders: 3,
          totalOrders: 100,
        },
        {
          name: '演示客户-湖南002',
          code: 'CUST-DEMO-018',
          manager: '李倩',
          changedOrders: 2,
          totalOrders: 93,
        },
      ],
      [
        {
          name: '演示客户-豫南001',
          code: 'CUST-DEMO-019',
          manager: '许峰',
          changedOrders: 3,
          totalOrders: 98,
        },
        {
          name: '演示客户-豫南002',
          code: 'CUST-DEMO-020',
          manager: '梁静',
          changedOrders: 2,
          totalOrders: 97,
        },
      ],
    ],
    risks: {
      0: {
        analysis: '本期改单率 27.55%，较上期增加 27.55pp，社区生鲜等集中改单是主要异常来源。',
        measure: '按客户、订单与改单类型逐笔复核，优先治理集中改单客户并设置日度预警。',
      },
      1: {
        analysis: '改单率升至 3.50%，环比增加 0.76pp，超过 2% 目标线。',
        measure: '拆分数量、交期和品类变更原因，锁定高频改单客户并落实业务复核。',
      },
      2: {
        analysis: '改单率 3.39%，环比上升 1.72pp，异常增幅较大。',
        measure: '复核本期新增改单订单，按客户经理建立原因清单和整改时限。',
      },
      3: {
        analysis: '改单率 3.71%，环比上升 1.83pp，连续偏离目标。',
        measure: '聚焦高频改单客户，前置确认数量与交期，减少下单后的重复调整。',
      },
      4: {
        analysis: '上期为 0，本期升至 2.23%，出现新增改单集中。',
        measure: '逐单核查新增改单触发点，明确专客订单确认与二次复核责任。',
      },
      5: {
        analysis: '改单率虽环比下降 2.61pp，但本期 4.48% 仍高于 2% 目标。',
        measure: '保持改善动作并继续压降高频客户改单，避免阶段性反弹。',
      },
      6: {
        analysis: '本期改单率 4.60%，上期为 0，新增异常最为明显。',
        measure: '当天复盘全部改单订单，按客户和业务员核实原因并设置重点监控。',
      },
      7: {
        analysis: '改单率升至 2.48%，环比增加 2.24pp，超过目标线。',
        measure: '加强订单提交前校验，重点核对客户需求、数量和交付日期。',
      },
      8: {
        analysis: '改单率 2.59%，环比增加 0.67pp，仍处异常区间。',
        measure: '识别重复改单客户，完善下单确认动作并进行周度复盘。',
      },
      9: {
        analysis: '改单率 2.57%，环比增加 0.46pp，持续高于目标。',
        measure: '跟踪客户和品类分布，对高频改单订单开展前置确认。',
      },
    },
  },
  'base-category-days': {
    title: '可发货天数—基地 × 品类交叉分析',
    note: '单位：天；超过 12 天的交叉项以红色标识。',
    summary:
      '5 个基地共 6 个交叉项超过 12 天，华东火锅料 22.5 天、郑州火锅料 18.5 天最突出；西南各品类均未超标，需优先跟踪其余基地的备货消化节奏。',
    columns: ['基地 \\ 品类', '水饺', '面点', '休闲', '火锅料', '馄饨', '汤圆', '预制食材'],
    rows: [
      ['郑州', '7.8', '7.3', '9.5', '18.5', '3.7', '17.2', '8.2'],
      ['华东', '8.5', '9.6', '10.6', '22.5', '10.5', '11.9', '13.8'],
      ['西南', '5.8', '5.6', '7.4', '7.3', '4.4', '11.9', '7.0'],
      ['华南', '12.0', '12.9', '10.1', '10.9', '11.2', '8.2', '7.9'],
      ['遂平', '9.9', '11.8', '11.0', '9.4', '6.3', '13.2', '7.2'],
    ],
    risks: {
      0: [
        {
          category: '火锅料',
          analysis:
            '可发货天数 18.5 天，超过目标 6.5 天；9 月产能缺失前置备货及订货会政策激励压货推高库存。',
          measure: '结合销售发货节奏复核排产与备货，按实际订单安排生产，明确周度库存压降计划。',
        },
        {
          category: '汤圆',
          analysis: '可发货天数 17.2 天，超过目标 5.2 天；前置备货拉动库存，需关注大日期消化节奏。',
          measure: '逐批核对大日期库存与发货计划，优先消化存量批次，按周跟踪消化进度。',
        },
      ],
      1: [
        {
          category: '火锅料',
          analysis:
            '可发货天数 22.5 天，超过目标 10.5 天；客户发货结构变化及前置备货造成库存偏高。',
          measure: '核实客户结构变化和实际需求，协调销售消化存量，滚动调整后续备货与排产。',
        },
        {
          category: '预制食材',
          analysis: '可发货天数 13.8 天，超过目标 1.8 天；产能缺失前置备货使库存阶段性偏高。',
          measure: '跟踪备货订单兑现，结合可用产能与实际需求调整备货，按批次推进库存消化。',
        },
      ],
      3: [
        {
          category: '面点',
          analysis:
            '可发货天数 12.9 天，超过目标 0.9 天；圈包需 48 小时封存及国庆改造影响库存消化。',
          measure: '核对封存释放时间与改造期间发货安排，按批次跟进消化进度。',
        },
      ],
      4: [
        {
          category: '汤圆',
          analysis: '可发货天数 13.2 天，超过目标 1.2 天；国庆前置备货使库存阶段性偏高。',
          measure: '跟踪国庆备货订单兑现与发货节奏，滚动调整后续备货，优先消化存量批次。',
        },
      ],
    },
  },
  'base-category': {
    title: '满足率—基地 × 品类交叉分析',
    note: '低于 90% 的交叉项以红色标识。',
    summary:
      '西南基地出现 4 个低于 90% 的品类，是本期系统性短板；华东、郑州的预制食材也需重点补位。',
    columns: ['基地 \\ 品类', '休闲', '水饺', '汤圆', '火锅料', '面点', '预制食材', '馄饨'],
    rows: [
      ['华东', '92.40%', '97.57%', '97.71%', '94.51%', '98.86%', '86.83%', '98.27%'],
      ['华南', '98.31%', '94.94%', '90.96%', '93.89%', '96.54%', '91.01%', '97.29%'],
      ['西南', '91.48%', '94.58%', '97.44%', '84.47%', '85.56%', '81.58%', '74.43%'],
      ['遂平', '96.54%', '91.86%', '98.48%', '96.84%', '94.99%', '92.33%', '96.70%'],
      ['郑州', '95.20%', '95.45%', '97.04%', '96.50%', '94.81%', '86.47%', '95.60%'],
    ],
    risks: {
      0: [
        {
          category: '预制食材',
          analysis: '满足率 86.83%，盒马、烧麦等订单受 ODM 产能和调拨节奏影响。',
          measure: '核实代工产能与调拨计划，优先保障缺货订单，建立日度缺口跟踪。',
        },
      ],
      2: [
        {
          category: '火锅料',
          analysis: '满足率 84.47%，外建调拨节奏异常，ODM 新品未按时交付。',
          measure: '核实外建调拨及 ODM 交付排期，落实替代资源与补货计划，按订单跟踪恢复进度。',
        },
        {
          category: '面点',
          analysis: '满足率 85.56%，大师圈包质量封存后仍处恢复阶段。',
          measure: '核实封存释放和生产恢复进度，协调调拨补位，优先保障缺货订单。',
        },
        {
          category: '预制食材',
          analysis: '满足率 81.58%，鸡产品调拨缺货，总部代工资源产能不足。',
          measure: '协调鸡产品跨基地调拨，复核代工资源可交付量，逐项落实产能补位与交付时限。',
        },
        {
          category: '馄饨',
          analysis: '满足率 74.43%，305/500 馄饨需求集中，华南与遂平调拨缺货。',
          measure: '启动华南、遂平双向调拨支援，核实缺货订单优先级及可发数量，逐单跟踪到货。',
        },
      ],
      4: [
        {
          category: '预制食材',
          analysis: '满足率 86.47%，骨肉相连等产品受 ODM 代工产能瓶颈影响。',
          measure: '推进第二家产能验证和第三家资源储备，按订单优先级安排补产与交付。',
        },
      ],
    },
  },
};
const workbenchSkuExamples = {
  汤圆: [
    {
      name: '黑芝麻汤圆',
      code: 'SKU-DEMO-001',
      inventory: '420,000',
      salesPlan: '920,000',
      shipDays: '13.7 天',
    },
    {
      name: '花生汤圆',
      code: 'SKU-DEMO-002',
      inventory: '321,135',
      salesPlan: '736,350',
      shipDays: '13.1 天',
    },
  ],
  馄饨: [
    {
      name: '鲜肉小馄饨',
      code: 'SKU-DEMO-003',
      inventory: '91,500',
      salesPlan: '390,000',
      shipDays: '7.3 天',
    },
    {
      name: '荠菜馄饨',
      code: 'SKU-DEMO-004',
      inventory: '83,103',
      salesPlan: '350,290',
      shipDays: '7.1 天',
    },
  ],
  火锅料: [
    {
      name: '鱼豆腐 2.5kg',
      code: 'SKU-DEMO-005',
      inventory: '300,000',
      salesPlan: '480,000',
      shipDays: '19.4 天',
    },
    {
      name: '撒尿牛丸',
      code: 'SKU-DEMO-006',
      inventory: '225,522',
      salesPlan: '363,677',
      shipDays: '19.3 天',
    },
  ],
  粽子: [],
  休闲: [
    {
      name: '酥皮馅饼',
      code: 'SKU-DEMO-007',
      inventory: '315,000',
      salesPlan: '820,000',
      shipDays: '11.5 天',
    },
    {
      name: '红糖发糕',
      code: 'SKU-DEMO-008',
      inventory: '313,118',
      salesPlan: '805,240',
      shipDays: '11.7 天',
    },
  ],
  面点: [
    {
      name: '纸皮烧麦',
      code: 'SKU-DEMO-009',
      inventory: '75,000',
      salesPlan: '220,000',
      shipDays: '10.2 天',
    },
    {
      name: '春饼皮',
      code: 'SKU-DEMO-010',
      inventory: '60,000',
      salesPlan: '180,000',
      shipDays: '10.0 天',
    },
    {
      name: '手抓饼',
      code: 'SKU-DEMO-011',
      inventory: '58,514',
      salesPlan: '182,050',
      shipDays: '10.6 天',
    },
  ],
  水饺: [
    {
      name: '猪肉白菜水饺',
      code: 'SKU-DEMO-012',
      inventory: '400,000',
      salesPlan: '1,300,000',
      shipDays: '9.2 天',
    },
    {
      name: '玉米蔬菜水饺',
      code: 'SKU-DEMO-013',
      inventory: '280,000',
      salesPlan: '900,000',
      shipDays: '9.3 天',
    },
    {
      name: '三鲜水饺',
      code: 'SKU-DEMO-014',
      inventory: '222,469',
      salesPlan: '768,099',
      shipDays: '9.7 天',
    },
  ],
  预制食材: [
    {
      name: '骨肉相连 1kg',
      code: 'SKU-DEMO-015',
      inventory: '55,000',
      salesPlan: '160,000',
      shipDays: '10.3 天',
    },
    {
      name: '炖馍',
      code: 'SKU-DEMO-016',
      inventory: '42,000',
      salesPlan: '130,000',
      shipDays: '9.7 天',
    },
    {
      name: '香酥鸡排',
      code: 'SKU-DEMO-017',
      inventory: '42,920',
      salesPlan: '127,360',
      shipDays: '10.1 天',
    },
  ],
};
function activeReport() {
  if (periodMode === 'month' && selectedMonth === '2026-09')
    return {
      kind: 'month',
      metrics: metricDefinitions,
      events: reportEvents,
      actions: reportActions,
      tasks: reportTasks,
    };
  if (periodMode === 'week' && selectedWeek === '2026-08-31')
    return {
      kind: 'week',
      metrics: weeklyMetricDefinitions,
      events: weeklyReportEvents,
      actions: weeklyReportActions,
      tasks: weeklyReportTasks,
    };
  return null;
}
function workbenchTaskKey(id) {
  return `${periodMode}:${periodMode === 'week' ? selectedWeek : selectedMonth}:${id}`;
}
function currentCreatedTasks() {
  const reportTasks = (activeReport()?.tasks || [])
    .map((task) => createdWorkbenchTasks.get(workbenchTaskKey(task.id)))
    .filter(Boolean);
  const scopedImprovements = [...improvementTasks.entries()]
    .filter(([key]) =>
      key.startsWith(`${periodMode}:${periodMode === 'week' ? selectedWeek : selectedMonth}:`),
    )
    .map(([, task]) => task);
  return [...reportTasks, ...scopedImprovements];
}

function parseIsoDate(iso) {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day);
}
function toIsoDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function addDays(iso, count) {
  const date = parseIsoDate(iso);
  date.setDate(date.getDate() + count);
  return toIsoDate(date);
}
function mondayOf(iso) {
  const date = parseIsoDate(iso);
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return toIsoDate(date);
}
function weeksInMonth(month) {
  const [year, number] = month.split('-').map(Number);
  const last = toIsoDate(new Date(year, number, 0));
  const weeks = [];
  for (let start = mondayOf(`${month}-01`); start <= last; start = addDays(start, 7))
    weeks.push({ start, end: addDays(start, 6) });
  return weeks;
}
function syncWeekOptions() {
  const select = document.getElementById('periodWeek');
  const weeks = weeksInMonth(selectedMonth);
  if (!weeks.some((week) => week.start === selectedWeek)) selectedWeek = weeks[0].start;
  select.replaceChildren(
    ...weeks.map((week, index) => {
      const option = document.createElement('option');
      option.value = week.start;
      option.textContent = `第 ${index + 1} 周 · ${week.start} 至 ${week.end}`;
      return option;
    }),
  );
  select.value = selectedWeek;
}
function selectedPeriodLabel() {
  if (periodMode === 'month') {
    const [year, month] = selectedMonth.split('-');
    return `${year} 年 ${Number(month)} 月`;
  }
  return `${selectedWeek} 至 ${addDays(selectedWeek, 6)}`;
}
function hasWorkbenchReport() {
  return activeReport() !== null;
}
function renderSelectedPeriod() {
  document.getElementById('monthMode').classList.toggle('active', periodMode === 'month');
  document.getElementById('weekMode').classList.toggle('active', periodMode === 'week');
  document.getElementById('monthMode').setAttribute('aria-pressed', String(periodMode === 'month'));
  document.getElementById('weekMode').setAttribute('aria-pressed', String(periodMode === 'week'));
  document.getElementById('periodMonth').value = selectedMonth;
  document.getElementById('weekControl').hidden = periodMode !== 'week';
  syncWeekOptions();
  const reportAvailable = hasWorkbenchReport();
  workbenchView
    .querySelectorAll(
      '.wb-context, .wb-context-note, .wb-report-date, .wb-note, .wb-section, .wb-analysis, .wb-panels, #wbTaskSection, #wbDimensionSection, .wb-boundary',
    )
    .forEach((node) => {
      node.hidden = !reportAvailable;
    });
  const empty = document.getElementById('wbPeriodEmpty');
  empty.hidden = reportAvailable;
  empty.textContent =
    periodMode === 'week'
      ? `${selectedPeriodLabel()} 暂无对应周报数据。目前已收录截至 2026-09-06 的周报，不能将其他周次或月度报告数值移用至本周。`
      : `${selectedPeriodLabel()} 暂无月度报告数据；目前仅收录截至 2026-09-13 的 9 月报告。`;
  if (reportAvailable && activePage === 'workbench') renderWorkbench();
  document.getElementById('periodMeta').textContent = reportAvailable
    ? activeReport().kind === 'week'
      ? '周报 · 截至 09-06'
      : '月报 · 截至 09-13'
    : '暂无对应报告';
}
document.getElementById('monthMode').addEventListener('click', () => {
  if (periodMode !== 'month') {
    periodMode = 'month';
    renderSelectedPeriod();
  }
});
document.getElementById('weekMode').addEventListener('click', () => {
  if (periodMode !== 'week') {
    periodMode = 'week';
    if (!weekInitialized && selectedMonth === '2026-09') selectedWeek = '2026-08-31';
    weekInitialized = true;
    renderSelectedPeriod();
  }
});
document.getElementById('periodMonth').addEventListener('change', (event) => {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(event.target.value)) {
    event.target.value = selectedMonth;
    return;
  }
  selectedMonth = event.target.value;
  selectedWeek = '';
  renderSelectedPeriod();
});
document.getElementById('periodWeek').addEventListener('change', (event) => {
  selectedWeek = event.target.value;
  renderSelectedPeriod();
});

function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char],
  );
}
function renderWorkbench() {
  const report = activeReport();
  if (!report) return;
  const weekly = report.kind === 'week';
  workbenchView.querySelector('.wb-report-date').textContent = weekly
    ? '周度报告截至 2026-09-06'
    : '月度报告截至 2026-09-13';
  document.getElementById('wbKpis').innerHTML = report.metrics
    .map(
      (metric) =>
        `<button class="wb-kpi ${metric.tone}" type="button" data-metric-question="${escapeHtml(metric.key)}" aria-label="查看${escapeHtml(metric.key)}口径"><span class="wb-kpi-head"><span class="wb-kpi-title">${escapeHtml(metric.key)}</span><span class="wb-kpi-state ${metric.status === '未达标' ? 'bad' : metric.status === '待核算' ? 'unknown' : ''}">${escapeHtml(metric.status)}</span></span><span class="wb-kpi-meta"><span class="wb-kpi-badge">${escapeHtml(metric.badge)}</span><span>${escapeHtml(metric.scope)}</span></span><span class="wb-kpi-value"><strong>${escapeHtml(metric.display)}</strong>${metric.unit ? `<em>${escapeHtml(metric.unit)}</em>` : ''}</span><span class="wb-kpi-compare"><span class="wb-kpi-compare-row head"><span>对比指标</span><span>变化量</span></span><span class="wb-kpi-compare-row"><span>${escapeHtml(metric.previous)}</span><b class="${escapeHtml(metric.changeTone)}">${escapeHtml(metric.change)}</b></span><span class="wb-kpi-compare-row"><span>${escapeHtml(metric.same)}</span><b class="${escapeHtml(metric.sameTone)}">${escapeHtml(metric.sameChange)}</b></span></span><span class="wb-kpi-foot"><span>${escapeHtml(metric.targetLabel)}</span><b class="${escapeHtml(metric.gapTone)}">${escapeHtml(metric.gap)}</b></span></button>`,
    )
    .join('');
  workbenchView.querySelector('.wb-boundary p').textContent = weekly
    ? '9.6 周报本周指标与品类/基地异常 → 人工核实 → 改善建议 → 采纳后建任务；订单明细仍在“订单履约”页'
    : '9 月报告指标与异常事项 → 人工核实 → 改善建议 → 采纳后建任务；订单明细仍在“订单履约”页';
  workbenchView.querySelector('.wb-boundary > span').textContent = weekly
    ? '周报摘录 · 非实时'
    : '报告摘录 · 非实时';
  renderWorkbenchTasks();
  renderWorkbenchDimensions();
}
function renderWorkbenchEvents() {
  const events = activeReport()?.events || [];
  const shown = eventFilter === 'focus' ? events.filter((event) => event.focus) : events;
  document.getElementById('wbEventCount').textContent = `${shown.length} 项事项`;
  document.getElementById('wbEvents').innerHTML = shown
    .map(
      (event) =>
        `<article class="wb-event"><div class="wb-event-top"><span class="wb-event-kind ${event.kind === '关注' ? 'focus' : ''}">${event.kind}</span><strong>${escapeHtml(event.title)}</strong><time>${activeReport()?.kind === 'week' ? '9.6' : '9.13'}</time></div><p>${escapeHtml(event.summary)}</p><div class="wb-event-foot"><button type="button" data-wb-event-detail="${event.id}">查看依据</button><button type="button" data-wb-event-ai="${event.id}">AI 分析 ↗</button></div></article>`,
    )
    .join('');
}
function renderWorkbenchTasks() {
  workbenchView
    .querySelectorAll('[data-wb-task-filter]')
    .forEach((button) =>
      button.classList.toggle('active', button.dataset.wbTaskFilter === taskFilter),
    );
  const tasks = currentCreatedTasks();
  const pending = tasks.filter((task) => task.status !== '已完成').length;
  const done = tasks.length - pending;
  document.getElementById('wbTaskSummary').textContent = `${pending} 项待跟进 · ${done} 项已完成`;
  document.getElementById('wbTaskAllCount').textContent = tasks.length;
  document.getElementById('wbTaskPendingCount').textContent = pending;
  document.getElementById('wbTaskDoneCount').textContent = done;
  const shown =
    taskFilter === 'all'
      ? tasks
      : tasks.filter((task) =>
          taskFilter === 'done' ? task.status === '已完成' : task.status !== '已完成',
        );
  document.getElementById('wbTaskRows').innerHTML = shown.length
    ? shown
        .map(
          (task) =>
            `<tr data-wb-task-row="${escapeHtml(task.id)}"><td><strong>${escapeHtml(task.title)}</strong><small>${escapeHtml(task.issue)}</small></td><td>${escapeHtml(task.role)}</td><td>${escapeHtml(task.due)}</td><td><span class="wb-task-status ${task.status === '已完成' ? 'done' : ''}">${escapeHtml(task.status)}</span></td><td><button class="wb-task-link" type="button" data-wb-task-detail="${escapeHtml(task.id)}">查看</button> <button class="wb-task-link" type="button" data-wb-task-edit="${escapeHtml(task.id)}">修改</button></td></tr>${editingWorkbenchTaskId === task.id ? `<tr class="wb-task-edit-row"><td colspan="5"><form class="wb-task-edit-form" data-wb-task-edit-form="${escapeHtml(task.id)}"><label>任务名称<input name="title" required value="${escapeHtml(task.title)}"></label><label>关联事项<input name="issue" value="${escapeHtml(task.issue)}"></label><label>责任角色<input name="role" required value="${escapeHtml(task.role)}"></label><label>预计截止日期<input name="due" type="date" value="${/^\d{4}-\d{2}-\d{2}$/.test(task.due) ? escapeHtml(task.due) : ''}"></label><label>状态<select name="status"><option ${task.status !== '已完成' ? 'selected' : ''}>待跟进</option><option ${task.status === '已完成' ? 'selected' : ''}>已完成</option></select></label><label class="wide">问题及改进<textarea name="detail" rows="3">${escapeHtml(task.detail || task.issue || '')}</textarea></label><div class="wb-task-edit-actions"><button type="button" data-wb-task-edit-cancel>取消</button><button class="primary" type="submit">保存修改</button></div></form></td></tr>` : ''}`,
        )
        .join('')
    : `<tr><td colspan="5">${tasks.length ? '当前筛选下没有任务。' : '尚未建立任务；可在上方行动建议中点击“采纳并建任务”。'}</td></tr>`;
}
function workbenchDimensionCellClass(key, rowIndex, columnIndex, value) {
  if (key === 'category-fill') {
    if (columnIndex === 1) return parseFloat(value) < 95 ? 'risk-value' : 'good-value';
    if (columnIndex === 6) return value.startsWith('达标') ? 'status-ok' : 'status-bad';
  }
  if (key === 'category-days') {
    if ((columnIndex === 4 || columnIndex === 5) && rowIndex < 2)
      return rowIndex === 0 ? 'status-warn' : 'risk-value';
    if (columnIndex === 6)
      return rowIndex === 0
        ? 'status-warn'
        : rowIndex === 1
          ? 'status-bad'
          : rowIndex === 7
            ? 'status-muted'
            : 'status-ok';
  }
  if (key === 'region-change' && (columnIndex === 1 || columnIndex === 4)) return 'status-bad';
  if (key === 'base-category' && columnIndex > 0 && parseFloat(value) < 90) return 'risk-value';
  if (key === 'base-category-days' && columnIndex > 0 && parseFloat(value) > 12)
    return 'risk-value';
  return '';
}
function workbenchDimensionCellText(key, rowIndex, columnIndex, value) {
  if (key === 'category-fill' && columnIndex === 6)
    return `${value.startsWith('达标') ? '✓' : '✕'} ${value}`;
  if (key === 'category-days' && columnIndex === 6)
    return rowIndex === 0
      ? `▲ ${value}`
      : rowIndex === 1
        ? `✕ ${value}`
        : rowIndex === 7
          ? value
          : `✓ ${value}`;
  if (key === 'region-change' && columnIndex === 4) return `✕ ${value}`;
  return value;
}
function dimensionIssueStateKey(dimensionKey, rowIndex, entryIndex) {
  return `${periodMode}:${periodMode === 'week' ? selectedWeek : selectedMonth}:${dimensionKey}:${rowIndex}:${entryIndex}`;
}
function dimensionIssueTaskId(dimensionKey, rowIndex, entryIndex) {
  return `improvement-${dimensionKey}-${rowIndex}-${entryIndex}`;
}
function workbenchIssueCategories() {
  const categories = new Set(workbenchDimensions['category-fill'].rows.map((row) => row[0]));
  Object.values(workbenchDimensions).forEach((dimension) =>
    Object.values(dimension.risks).forEach((risk) => {
      (Array.isArray(risk) ? risk : [risk]).forEach((entry) => {
        if (entry?.category) categories.add(entry.category);
      });
    }),
  );
  return [...categories].filter((category) => category && category !== '—');
}
function renderWorkbenchDimensionIssues(risk, base, dimensionKey, rowIndex) {
  if (!risk) return '';
  const entries = Array.isArray(risk) ? risk : [risk];
  return entries
    .map((entry, index) => {
      const stateKey = dimensionIssueStateKey(dimensionKey, rowIndex, index);
      const saved = dimensionIssueEdits.get(stateKey) || {};
      const taskId = dimensionIssueTaskId(dimensionKey, rowIndex, index);
      const taskExists = improvementTasks.has(workbenchTaskKey(taskId));
      const label = entry.category ? `${base}-${entry.category}` : base;
      const encodedKey = encodeURIComponent(stateKey);
      const category =
        saved.category || entry.category || (workbenchIssueCategories().includes(base) ? base : '');
      const title = entry.category ? `${index + 1}、${label}` : label;
      const iconLabel = taskExists ? '编辑问题及改进并更新任务' : '填写问题及改进';
      return `<div class="wb-dimension-issue"><strong class="wb-dimension-issue-title">${escapeHtml(title)}</strong>${category ? `<span class="wb-issue-category-label">品类：${escapeHtml(category)}</span>` : ''}<button class="wb-issue-edit-button ${saved.analysis || saved.measure ? 'saved' : ''}" type="button" aria-label="${iconLabel}" title="${iconLabel}" data-wb-edit-issue="${encodedKey}" data-wb-edit-dimension="${dimensionKey}" data-wb-edit-row="${rowIndex}" data-wb-edit-entry="${index}" data-wb-edit-base="${encodeURIComponent(base)}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg></button></div>`;
    })
    .join('');
}
function renderWorkbenchSkuDetail(category) {
  const samples = workbenchSkuExamples[category] || [];
  if (!samples.length)
    return `<div class="wb-sku-detail"><p>${escapeHtml(category)}暂无订单样例 SKU；请接入商品主数据及订单明细。</p></div>`;
  const showOwner = Boolean(selectedWorkbenchBase);
  const baseOwners = {
    郑州: '郑州基地负责人（演示）',
    遂平: '遂平基地负责人（演示）',
    西南: '西南基地负责人（演示）',
    华东: '华东基地负责人（演示）',
    华南: '华南基地负责人（演示）',
  };
  const ownerCell = showOwner
    ? `<td>${escapeHtml(baseOwners[selectedWorkbenchBase] || '待补充')}</td>`
    : '';
  const ownerHeader = showOwner ? '<th>基地负责人</th>' : '';
  const rows = samples
    .map(
      (sku) =>
        `<tr><td>${escapeHtml(sku.name)}</td><td class="sku-code">${escapeHtml(sku.code)}</td>${ownerCell}<td>${escapeHtml(sku.inventory)}</td><td>${escapeHtml(sku.salesPlan)}</td><td>${escapeHtml(sku.shipDays)}</td></tr>`,
    )
    .join('');
  return `<div class="wb-sku-detail"><p>SKU 库存、销售计划及可发货天数为原型演示样例，实际数据需接入商品主数据及订单明细。${showOwner ? `当前筛选基地：${escapeHtml(selectedWorkbenchBase)}。` : ''}</p><table class="wb-sku-table ${showOwner ? 'has-owner' : ''}"><thead><tr><th>SKU名称</th><th>编码</th>${ownerHeader}<th>库存</th><th>销售计划</th><th>可发货天数</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}
function renderWorkbenchRegionCustomerDetail(regionIndex) {
  const dimension = workbenchDimensions['region-change'];
  const customers = dimension.customerDetails?.[regionIndex] || [];
  const rows = customers.length
    ? customers
        .map(
          (customer, customerIndex) =>
            `<tr><td>${escapeHtml(customer.name)}（<span class="customer-code">${escapeHtml(customer.code)}</span>）</td><td>${escapeHtml(customer.manager)}</td><td><button type="button" class="wb-region-order-count" data-wb-customer-orders="${regionIndex}:${customerIndex}" aria-label="查看${escapeHtml(customer.name)}的${escapeHtml(String(customer.changedOrders))}张改单订单">${escapeHtml(String(customer.changedOrders))} 张</button></td><td>${escapeHtml(String(customer.totalOrders))} 张</td></tr>`,
        )
        .join('')
    : '<tr><td class="wb-region-customer-empty" colspan="4">暂无客户明细</td></tr>';
  return `<div class="wb-region-customer-detail"><table class="wb-region-customer-table"><thead><tr><th>客户名称（编码）</th><th>客户经理</th><th>改单订单数</th><th>订单总数</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}
function renderWorkbenchDimensions() {
  const panel = document.getElementById('wbDimensionPanel');
  const tabButtons = [...workbenchView.querySelectorAll('[data-wb-dimension-tab]')];
  const selectedButton =
    tabButtons.find((button) => button.dataset.wbDimensionTab === dimensionTab) || tabButtons[0];
  if (!selectedButton) return;
  dimensionTab = selectedButton.dataset.wbDimensionTab;
  tabButtons.forEach((button) => {
    const active = button === selectedButton;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
    button.tabIndex = active ? 0 : -1;
  });
  panel.setAttribute('aria-labelledby', selectedButton.id);
  const headingMeta = workbenchView.querySelector('.wb-dimension-head > span');
  if (activeReport()?.kind !== 'month') {
    headingMeta.textContent = '周度报告 · 暂无对应维度数据';
    panel.innerHTML =
      '<div class="wb-dimension-empty">当前分析页签仅有截至 2026-09-13 的月度报告数据。<br>请切换到“月度”查看，不能将月度维度值移作周度值。</div>';
    return;
  }
  headingMeta.textContent = '月度报告 · 截至 2026-09-13';
  const dimension = workbenchDimensions[dimensionTab];
  const baseFiltered =
    ['base-category', 'base-category-days'].includes(dimensionTab) && selectedWorkbenchBase;
  const visibleRows = baseFiltered
    ? dimension.rows.filter((row) => row[0] === selectedWorkbenchBase)
    : dimension.rows;
  let summaryText = dimension.summary;
  if (baseFiltered && visibleRows[0]) {
    const row = visibleRows[0];
    const problemLimit = dimensionTab === 'base-category' ? 90 : 12;
    const problemItems = row
      .slice(1)
      .map((value, index) => ({
        category: dimension.columns[index + 1],
        value: Number.parseFloat(value),
      }))
      .filter((item) =>
        dimensionTab === 'base-category' ? item.value < problemLimit : item.value > problemLimit,
      );
    summaryText = problemItems.length
      ? `${selectedWorkbenchBase}基地有 ${problemItems.length} 项${dimensionTab === 'base-category' ? '满足率低于 90%' : '可发货天数超过 12 天'}：${problemItems.map((item) => `${item.category} ${item.value}${dimensionTab === 'base-category' ? '%' : ' 天'}`).join('、')}。`
      : `${selectedWorkbenchBase}基地当前没有${dimensionTab === 'base-category' ? '满足率低于 90%' : '可发货天数超过 12 天'}的品类。`;
  }
  const header = `${dimension.columns.map((column) => `<th scope="col">${escapeHtml(column)}</th>`).join('')}<th class="issue-col" scope="col">问题及改进</th>`;
  const body = visibleRows
    .map((row) => {
      const rowIndex = dimension.rows.indexOf(row);
      const risk = dimension.risks[rowIndex];
      const expandable = ['category-fill', 'category-days'].includes(dimensionTab);
      const regionExpandable = dimensionTab === 'region-change';
      const regionKey = String(rowIndex);
      const regionExpanded = expandedRegionChangeGroups.has(regionKey);
      const values = row
        .map((value, columnIndex) => {
          const content =
            expandable && columnIndex === 0
              ? `<button class="category-toggle" type="button" data-wb-sku-toggle="${escapeHtml(value)}" aria-expanded="${expandedSkuCategories.has(`${dimensionTab}:${value}`)}">${escapeHtml(value)}</button>`
              : regionExpandable && columnIndex === 0
                ? `<button class="region-change-toggle" type="button" data-wb-region-toggle="${regionKey}" aria-expanded="${regionExpanded}" aria-label="${regionExpanded ? '收起' : '展开'}${escapeHtml(value)}客户改单明细" title="${regionExpanded ? '收起' : '展开'}客户明细">${escapeHtml(value)}</button>`
                : escapeHtml(
                    workbenchDimensionCellText(dimensionTab, rowIndex, columnIndex, value),
                  );
          return `<td class="${workbenchDimensionCellClass(dimensionTab, rowIndex, columnIndex, value)}">${content}</td>`;
        })
        .join('');
      const detail =
        expandable && expandedSkuCategories.has(`${dimensionTab}:${row[0]}`)
          ? `<tr class="sku-detail-row"><td colspan="${dimension.columns.length + 1}">${renderWorkbenchSkuDetail(row[0])}</td></tr>`
          : '';
      const customerDetail =
        regionExpandable && regionExpanded
          ? `<tr class="region-customer-detail-row"><td colspan="${dimension.columns.length + 1}">${renderWorkbenchRegionCustomerDetail(rowIndex)}</td></tr>`
          : '';
      return `<tr>${values}<td class="issue-cell">${renderWorkbenchDimensionIssues(risk, row[0], dimensionTab, rowIndex)}</td></tr>${detail}${customerDetail}`;
    })
    .join('');
  const filterNote = baseFiltered ? `当前基地筛选：${escapeHtml(selectedWorkbenchBase)}` : '';
  panel.innerHTML = `<div class="wb-dimension-summary"><strong>${escapeHtml(dimension.title)}</strong><span>${escapeHtml(dimension.note)} ${filterNote}</span></div><div class="wb-dimension-insight"><strong>总结分析</strong><span>${escapeHtml(summaryText)}</span></div><div class="wb-dimension-table-wrap"><table class="wb-dimension-table ${dimensionTab === 'region-change' ? 'region-change-table' : ''}"><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table></div>`;
  panel.querySelectorAll('[data-wb-sku-toggle]').forEach((button) =>
    button.addEventListener('click', () => {
      const key = `${dimensionTab}:${button.dataset.wbSkuToggle}`;
      if (expandedSkuCategories.has(key)) expandedSkuCategories.delete(key);
      else expandedSkuCategories.add(key);
      renderWorkbenchDimensions();
    }),
  );
  panel.querySelectorAll('[data-wb-region-toggle]').forEach((button) =>
    button.addEventListener('click', () => {
      const key = button.dataset.wbRegionToggle;
      if (expandedRegionChangeGroups.has(key)) expandedRegionChangeGroups.delete(key);
      else expandedRegionChangeGroups.add(key);
      renderWorkbenchDimensions();
    }),
  );
}
const wbBaseFilter = document.getElementById('wbBaseFilter');
const wbOwnerFilter = document.getElementById('wbOwnerFilter');
wbBaseFilter.addEventListener('change', () => {
  selectedWorkbenchBase = wbBaseFilter.value;
  wbOwnerFilter.value = selectedWorkbenchBase;
  document.getElementById('wbContextNote').textContent =
    '基地/负责人筛选仅作用于基地交叉分析；汇总指标与品类汇总按报告整体口径显示。负责人选项为原型维度演示。';
  renderWorkbenchDimensions();
});
wbOwnerFilter.addEventListener('change', () => {
  selectedWorkbenchBase = wbOwnerFilter.value;
  wbBaseFilter.value = selectedWorkbenchBase;
  renderWorkbenchDimensions();
});
const wbDimensionTabButtons = [...workbenchView.querySelectorAll('[data-wb-dimension-tab]')];
wbDimensionTabButtons.forEach((button) => {
  button.addEventListener('click', () => {
    dimensionTab = button.dataset.wbDimensionTab;
    renderWorkbenchDimensions();
  });
});
function showWorkbenchToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(window.toastTimer);
  window.toastTimer = schedule(() => {
    toast.hidden = true;
  }, 3000);
}
function openIssueEditor(button) {
  const dimensionKey = button.dataset.wbEditDimension;
  const rowIndex = Number(button.dataset.wbEditRow);
  const entryIndex = Number(button.dataset.wbEditEntry);
  const stateKey = decodeURIComponent(button.dataset.wbEditIssue);
  const dimension = workbenchDimensions[dimensionKey];
  const risk = dimension?.risks[rowIndex];
  const entry = (Array.isArray(risk) ? risk : [risk])[entryIndex];
  if (!entry) return;
  const base = decodeURIComponent(button.dataset.wbEditBase);
  const saved = dimensionIssueEdits.get(stateKey) || {};
  const taskId = dimensionIssueTaskId(dimensionKey, rowIndex, entryIndex);
  const linkedTask = improvementTasks.get(workbenchTaskKey(taskId));
  const categories = workbenchIssueCategories();
  const selectedCategory =
    saved.category || entry.category || (categories.includes(base) ? base : '');
  const categorySelect = document.getElementById('wbIssueCategory');
  categorySelect.innerHTML = `<option value="">请选择品类</option>${categories.map((category) => `<option value="${escapeHtml(category)}" ${category === selectedCategory ? 'selected' : ''}>${escapeHtml(category)}</option>`).join('')}`;
  document.getElementById('wbIssueSubtitle').textContent =
    `${dimension.title} · ${entry.category ? `${base}-${entry.category}` : base}`;
  document.getElementById('wbIssueRole').value = saved.role || linkedTask?.role || '';
  document.getElementById('wbIssueDue').value =
    saved.due || (/^\d{4}-\d{2}-\d{2}$/.test(linkedTask?.due || '') ? linkedTask.due : '');
  document.getElementById('wbIssueAnalysis').value = saved.analysis ?? entry.analysis ?? '';
  document.getElementById('wbIssueMeasure').value = saved.measure ?? entry.measure ?? '';
  pendingIssueEdit = { dimensionKey, rowIndex, entryIndex, stateKey, base, trigger: button };
  document.getElementById('wbIssueOverlay').hidden = false;
  categorySelect.focus();
}
function closeIssueEditor() {
  document.getElementById('wbIssueOverlay').hidden = true;
  const trigger = pendingIssueEdit?.trigger;
  pendingIssueEdit = null;
  if (trigger?.isConnected) trigger.focus();
}
function syncDimensionIssueTask(context, values) {
  const dimension = workbenchDimensions[context.dimensionKey];
  const taskId = dimensionIssueTaskId(context.dimensionKey, context.rowIndex, context.entryIndex);
  const taskKey = workbenchTaskKey(taskId);
  const existing = improvementTasks.get(taskKey);
  const baseDimension = ['base-category', 'base-category-days'].includes(context.dimensionKey);
  const label =
    baseDimension || context.dimensionKey === 'region-change'
      ? `${context.base}-${values.category}`
      : values.category;
  improvementTasks.set(taskKey, {
    ...existing,
    id: taskId,
    title: existing?.title || `${label}改进任务`,
    issue: `${dimension.title} · ${label}`,
    role: values.role || existing?.role || '责任人待确认',
    due: values.due || existing?.due || '待确认',
    status: existing?.status || '待跟进',
    detail: `问题：${values.analysis}\n改进：${values.measure}`,
    period: `${periodMode}:${periodMode === 'week' ? selectedWeek : selectedMonth}`,
  });
  saveWorkbenchLocalState();
  editingWorkbenchTaskId = '';
  renderWorkbenchTasks();
  closeIssueEditor();
  renderWorkbenchDimensions();
  document.getElementById('wbTaskSection').scrollIntoView({ block: 'start', behavior: 'smooth' });
  showWorkbenchToast(
    existing ? '问题及改进已更新到任务追踪。' : '已生成改进任务，可在任务追踪中继续修改。',
  );
}
function saveIssueEditor(generateTask) {
  if (!pendingIssueEdit) return;
  const form = document.getElementById('wbIssueForm');
  if (!form.reportValidity()) return;
  const values = {
    category: document.getElementById('wbIssueCategory').value,
    role: document.getElementById('wbIssueRole').value.trim(),
    due: document.getElementById('wbIssueDue').value,
    analysis: document.getElementById('wbIssueAnalysis').value.trim(),
    measure: document.getElementById('wbIssueMeasure').value.trim(),
  };
  if (!values.category || !values.analysis || !values.measure) return;
  const context = pendingIssueEdit;
  dimensionIssueEdits.set(context.stateKey, values);
  saveWorkbenchLocalState();
  if (generateTask) {
    syncDimensionIssueTask(context, values);
    return;
  }
  closeIssueEditor();
  renderWorkbenchDimensions();
  showWorkbenchToast('问题及改进已保存。');
}
document.getElementById('wbIssueClose').addEventListener('click', closeIssueEditor);
document.getElementById('wbIssueCancel').addEventListener('click', closeIssueEditor);
document.getElementById('wbIssueSave').addEventListener('click', () => saveIssueEditor(false));
document.getElementById('wbIssueGenerate').addEventListener('click', () => saveIssueEditor(true));
document.getElementById('wbIssueOverlay').addEventListener('click', (event) => {
  if (event.target.id === 'wbIssueOverlay') closeIssueEditor();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !document.getElementById('wbIssueOverlay').hidden)
    closeIssueEditor();
});
workbenchView.addEventListener('click', (event) => {
  const customerOrders = event.target.closest('[data-wb-customer-orders]');
  if (customerOrders) {
    const [regionIndex, customerIndex] = customerOrders.dataset.wbCustomerOrders
      .split(':')
      .map(Number);
    openChangedOrderList(regionIndex, customerIndex, customerOrders);
    return;
  }
  const eventTab = event.target.closest('[data-wb-event-filter]');
  if (eventTab) {
    eventFilter = eventTab.dataset.wbEventFilter;
    workbenchView
      .querySelectorAll('[data-wb-event-filter]')
      .forEach((button) => button.classList.toggle('active', button === eventTab));
    renderWorkbenchEvents();
    return;
  }
  const taskTab = event.target.closest('[data-wb-task-filter]');
  if (taskTab) {
    taskFilter = taskTab.dataset.wbTaskFilter;
    workbenchView
      .querySelectorAll('[data-wb-task-filter]')
      .forEach((button) => button.classList.toggle('active', button === taskTab));
    renderWorkbenchTasks();
    return;
  }
  const metricQuestion = event.target.closest('[data-metric-question]');
  if (metricQuestion) {
    openMetricDetail(metricQuestion.dataset.metricQuestion);
    return;
  }
  const eventDetail = event.target.closest('[data-wb-event-detail]');
  if (eventDetail) {
    openWorkbenchDetail('event', eventDetail.dataset.wbEventDetail);
    return;
  }
  const eventAi = event.target.closest('[data-wb-event-ai]');
  if (eventAi) {
    const report = activeReport();
    const item = report?.events.find((entry) => entry.id === eventAi.dataset.wbEventAi);
    if (item) {
      openWorkbenchDetail('event', item.id);
    }
    return;
  }
  const taskDetail = event.target.closest('[data-wb-task-detail]');
  if (taskDetail) {
    openWorkbenchDetail('task', taskDetail.dataset.wbTaskDetail);
    return;
  }
  const taskEdit = event.target.closest('[data-wb-task-edit]');
  if (taskEdit) {
    editingWorkbenchTaskId = taskEdit.dataset.wbTaskEdit;
    renderWorkbenchTasks();
    return;
  }
  if (event.target.closest('[data-wb-task-edit-cancel]')) {
    editingWorkbenchTaskId = '';
    renderWorkbenchTasks();
    return;
  }
  const issueEdit = event.target.closest('[data-wb-edit-issue]');
  if (issueEdit) {
    openIssueEditor(issueEdit);
    return;
  }
  const adopt = event.target.closest('[data-wb-adopt]');
  if (adopt) {
    openAdoptDialog(adopt.dataset.wbAdopt, adopt);
    return;
  }
  const actionTask = event.target.closest('[data-wb-action-task]');
  if (actionTask) {
    focusCreatedTask(actionTask.dataset.wbActionTask);
    return;
  }
  if (event.target.closest('[data-wb-export]')) {
    exportWorkbenchTasks();
    return;
  }
  if (event.target.closest('[data-order-workbench-page]')) openFulfillmentPlugin();
});
workbenchView.addEventListener('submit', (event) => {
  const form = event.target.closest('[data-wb-task-edit-form]');
  if (!form) return;
  event.preventDefault();
  const taskId = form.dataset.wbTaskEditForm;
  const task = currentCreatedTasks().find((item) => item.id === taskId);
  if (!task) return;
  const data = new FormData(form);
  const updated = {
    ...task,
    title: String(data.get('title') || '').trim(),
    issue: String(data.get('issue') || '').trim(),
    role: String(data.get('role') || '').trim(),
    due: String(data.get('due') || '').trim() || '待确认',
    status: String(data.get('status') || '待跟进'),
    detail: String(data.get('detail') || '').trim(),
  };
  if (!updated.title || !updated.role) return;
  if (improvementTasks.has(workbenchTaskKey(taskId))) {
    improvementTasks.set(workbenchTaskKey(taskId), updated);
    saveWorkbenchLocalState();
  } else {
    createdWorkbenchTasks.set(workbenchTaskKey(taskId), updated);
  }
  editingWorkbenchTaskId = '';
  renderWorkbenchTasks();
});
workbenchView.addEventListener('keydown', (event) => {
  const current = event.target.closest('[data-wb-dimension-tab]');
  if (!current || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  const tabs = [...workbenchView.querySelectorAll('[data-wb-dimension-tab]')];
  let index = tabs.indexOf(current);
  if (event.key === 'ArrowRight') index = (index + 1) % tabs.length;
  if (event.key === 'ArrowLeft') index = (index - 1 + tabs.length) % tabs.length;
  if (event.key === 'Home') index = 0;
  if (event.key === 'End') index = tabs.length - 1;
  event.preventDefault();
  dimensionTab = tabs[index].dataset.wbDimensionTab;
  renderWorkbenchDimensions();
  tabs[index].focus();
});
function focusCreatedTask(id) {
  taskFilter = 'all';
  workbenchView
    .querySelectorAll('[data-wb-task-filter]')
    .forEach((button) => button.classList.toggle('active', button.dataset.wbTaskFilter === 'all'));
  renderWorkbenchTasks();
  const row = [...workbenchView.querySelectorAll('[data-wb-task-row]')].find(
    (item) => item.dataset.wbTaskRow === id,
  );
  if (row) {
    row.classList.add('is-linked');
    row.scrollIntoView({ block: 'center', behavior: 'smooth' });
    schedule(() => row.classList.remove('is-linked'), 2800);
  }
}
const wbAdoptOverlay = document.getElementById('wbAdoptOverlay');
const wbAdoptForm = document.getElementById('wbAdoptForm');
function openAdoptDialog(taskId, trigger) {
  const report = activeReport();
  const action = report?.actions.find((item) => item.taskId === taskId);
  const template = report?.tasks.find((item) => item.id === taskId);
  if (!action || !template) return;
  const key = workbenchTaskKey(taskId);
  if (createdWorkbenchTasks.has(key)) {
    focusCreatedTask(taskId);
    return;
  }
  pendingAdoption = { key, action, template };
  adoptReturnFocus = trigger;
  document.getElementById('wbAdoptSubtitle').textContent = action.title;
  document.getElementById('wbAdoptContent').textContent = action.detail;
  document.getElementById('wbAdoptRole').value = template.role;
  document.getElementById('wbAdoptDue').value = toIsoDate(new Date());
  document.getElementById('wbAdoptNote').value = '';
  wbAdoptOverlay.hidden = false;
  document.getElementById('wbAdoptClose').focus();
}
function closeAdoptDialog() {
  wbAdoptOverlay.hidden = true;
  pendingAdoption = null;
  if (adoptReturnFocus?.isConnected) adoptReturnFocus.focus();
  adoptReturnFocus = null;
}
document.getElementById('wbAdoptClose').addEventListener('click', closeAdoptDialog);
document.getElementById('wbAdoptCancel').addEventListener('click', closeAdoptDialog);
wbAdoptOverlay.addEventListener('click', (event) => {
  if (event.target === wbAdoptOverlay) closeAdoptDialog();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !wbAdoptOverlay.hidden) closeAdoptDialog();
});
wbAdoptForm.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!pendingAdoption || !wbAdoptForm.reportValidity()) return;
  const role = document.getElementById('wbAdoptRole').value.trim();
  const due = document.getElementById('wbAdoptDue').value;
  const note = document.getElementById('wbAdoptNote').value.trim();
  if (!role || !due) return;
  const { key, action, template } = pendingAdoption;
  if (createdWorkbenchTasks.has(key)) {
    closeAdoptDialog();
    focusCreatedTask(template.id);
    return;
  }
  createdWorkbenchTasks.set(key, {
    ...template,
    role,
    due,
    note,
    detail: action.detail,
    status: '待跟进',
  });
  closeAdoptDialog();
  renderWorkbench();
  focusCreatedTask(template.id);
  const toast = document.getElementById('toast');
  toast.textContent = '已在本页创建跟进任务；未同步到真实任务系统。';
  toast.hidden = false;
  clearTimeout(window.toastTimer);
  window.toastTimer = schedule(() => {
    toast.hidden = true;
  }, 3000);
});
const wbDetailOverlay = document.getElementById('wbDetailOverlay');
const wbDetailDialog = wbDetailOverlay.querySelector('.wb-detail-dialog');
let changedOrderListTrigger = null;
function openChangedOrderList(regionIndex, customerIndex, trigger) {
  const customer =
    workbenchDimensions['region-change'].customerDetails?.[regionIndex]?.[customerIndex];
  if (!customer) return;
  changedOrderListTrigger = trigger;
  const count = Math.max(0, Number(customer.changedOrders) || 0);
  const rows = Array.from({ length: count }, (_, index) => {
    const day = String(9 + (index % 19)).padStart(2, '0');
    const hour = String(9 + (index % 9)).padStart(2, '0');
    const minute = String((index * 7) % 60).padStart(2, '0');
    const orderNo = `${customer.code}-CHG-${String(index + 1).padStart(3, '0')}`;
    return `<tr><td class="order-code">${escapeHtml(orderNo)}</td><td>${escapeHtml(customer.manager)}</td><td>${escapeHtml(customer.name)}（${escapeHtml(customer.code)}）</td><td>2026-09-${day} ${hour}:${minute}</td><td>2026-09-${day} ${String(Number(hour) + 1).padStart(2, '0')}:${minute}</td></tr>`;
  }).join('');
  document.getElementById('wbDetailTitle').textContent = `${customer.name} · 改单订单明细`;
  document.getElementById('wbDetailBody').innerHTML =
    `<p class="wb-changed-order-note">当前为原型演示订单明细，共 ${count} 笔；订单号及时间为示例数据，接入真实订单数据后替换。</p><div class="wb-changed-order-wrap"><table class="wb-changed-order-table"><thead><tr><th>订单单号</th><th>销售人员</th><th>经销商名称及编码</th><th>订单创建时间</th><th>修改时间</th></tr></thead><tbody>${rows || '<tr><td colspan="5">暂无改单订单</td></tr>'}</tbody></table></div>`;
  wbDetailDialog.classList.add('order-list-dialog');
  wbDetailOverlay.hidden = false;
  document.getElementById('wbDetailClose').focus();
}
function openWorkbenchDetail(type, id) {
  const report = activeReport();
  const item =
    type === 'event'
      ? report?.events.find((entry) => entry.id === id)
      : createdWorkbenchTasks.get(workbenchTaskKey(id)) ||
        improvementTasks.get(workbenchTaskKey(id));
  if (!item) return;
  document.getElementById('wbDetailTitle').textContent = item.title;
  document.getElementById('wbDetailBody').innerHTML =
    type === 'event'
      ? `<p>${escapeHtml(item.summary)}</p><h3>报告依据</h3><p>${escapeHtml(item.evidence)}</p><h3>建议跟进</h3><p>${escapeHtml(item.action)}</p><p>此处为报告摘录与页面归纳，不表示已生成正式订单预警。</p>`
      : `<p>${escapeHtml(item.issue)}</p><h3>责任角色与截止日期</h3><p>${escapeHtml(item.role)} · ${escapeHtml(item.due)}</p><h3>任务说明</h3><p>${escapeHtml(item.detail)}</p>${item.note ? `<h3>确认说明</h3><p>${escapeHtml(item.note)}</p>` : ''}<p>本地状态：${escapeHtml(item.status)}；未连接真实任务系统。</p>`;
  wbDetailOverlay.hidden = false;
  document.getElementById('wbDetailClose').focus();
}
function closeWorkbenchDetail() {
  wbDetailOverlay.hidden = true;
  wbDetailDialog.classList.remove('order-list-dialog');
  if (changedOrderListTrigger?.isConnected) changedOrderListTrigger.focus();
  changedOrderListTrigger = null;
}
document.getElementById('wbDetailClose').addEventListener('click', closeWorkbenchDetail);
wbDetailOverlay.addEventListener('click', (event) => {
  if (event.target === wbDetailOverlay) closeWorkbenchDetail();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !wbDetailOverlay.hidden) closeWorkbenchDetail();
});
function exportWorkbenchTasks() {
  const lines = [
    ['任务', '关联事项', '责任角色', '预计截止日期', '本地状态'],
    ...currentCreatedTasks().map((task) => [
      task.title,
      task.issue,
      task.role,
      task.due,
      task.status,
    ]),
  ];
  const csv =
    '\uFEFF' +
    lines
      .map((line) => line.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(','))
      .join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `订单工作台-${activeReport()?.kind === 'week' ? '周度' : '月度'}演示任务.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  schedule(() => URL.revokeObjectURL(url), 1000);
}

function openMetricDetail(key) {
  const metric = activeReport()?.metrics.find((item) => item.key === key);
  if (!metric) return;
  document.getElementById('wbDetailTitle').textContent = key + '口径';
  document.getElementById('wbDetailBody').textContent = metric.formula + '；' + metric.note;
  wbDetailOverlay.hidden = false;
  document.getElementById('wbDetailClose').focus();
}
function openFulfillmentPlugin() {
  window.parent.postMessage(
    { protocol: 'gea-html-v2', type: 'navigate', panel: 'inventory-orderfulfillment' },
    new URL(document.referrer).origin,
  );
}
renderSelectedPeriod();
view.subscribe((state) => {
  restoringView = true;
  if (state.mode !== undefined) periodMode = state.mode;
  if (state.month !== undefined) selectedMonth = state.month;
  if (state.week !== undefined) selectedWeek = state.week;
  if (state.weekInitialized !== undefined) weekInitialized = state.weekInitialized;
  if (state.event !== undefined) eventFilter = state.event;
  if (state.task !== undefined) taskFilter = state.task;
  renderSelectedPeriod();
  restoringView = false;
  updateReport();
});

const updateReport = publishReport(
  () => {
    const report = activeReport();
    const tasks = currentCreatedTasks();
    if (!restoringView)
      view.update({
        mode: periodMode,
        month: selectedMonth,
        week: selectedWeek,
        weekInitialized,
        event: eventFilter,
        task: taskFilter,
      });
    return {
      source: '订单工作台报告摘录与本地模拟',
      mock: true,
      pageId: 'inventory-orderworkbench',
      instance: 'default',
      period: {
        mode: periodMode,
        month: selectedMonth,
        week: selectedWeek,
        label: selectedPeriodLabel(),
        available: Boolean(report),
      },
      reportDate: report ? (report.kind === 'week' ? '2026-09-06' : '2026-09-13') : null,
      filters: {
        event: eventFilter,
        task: taskFilter,
        dimension: dimensionTab,
        base: selectedWorkbenchBase,
      },
      metrics: report?.metrics ?? [],
      events: (report?.events ?? []).filter((event) => eventFilter !== 'focus' || event.focus),
      actions: report?.actions ?? [],
      tasks: tasks.filter(
        (task) =>
          taskFilter === 'all' ||
          (taskFilter === 'done' ? task.status === '已完成' : task.status !== '已完成'),
      ),
      coverage:
        '报告摘录非实时；无单笔订单明细、真实任务派发或业务写入。冷刷新/重新进入不保存本地演示任务。',
    };
  },
  () => {
    for (const handle of pageTimeouts) clearTimeout(handle);
    for (const url of downloadUrls) URL.revokeObjectURL(url);
    pageTimeouts.clear();
    downloadUrls.clear();
  },
);
