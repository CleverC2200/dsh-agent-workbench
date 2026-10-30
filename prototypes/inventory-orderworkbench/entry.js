import { encodeReportRequest } from './report-transfer.mjs';
import { workbenchCellMissingReason } from './missing-reasons.mjs';
import { createReportPersistence } from './report-persistence.mjs';
import { createPageViewState } from '../../business/shared/view-state.js';
import { draft, ready, call } from '../../business/shared/channel.js';
import { loadWorkbenchFacts, loadWorkbenchSkuPage } from './live-source.js';
import { workbenchPresentation, workbenchEvidence, workbenchMetricDetail } from './live-presentation.mjs';
import { shippableDaysTarget, performanceStyleVersion } from './performance-rules.mjs';
import { metricCalculationVersion } from './metric-model.mjs';
import { publishReport } from './publication.js';
const view = createPageViewState('inventory-orderworkbench');
let restoringView = false;
const pageTimeouts = new Set(),
  downloadUrls = new Set();
const workbenchView = document.getElementById('workbenchView');
const activePage = 'workbench';
let periodMode = 'month';
const currentMonth = new Date(Date.now()+8*3600000).toISOString().slice(0,7);
let selectedMonth = currentMonth;
let selectedWeek = selectedMonth+'-01';
let liveFacts = null, liveReadKey = '', liveController, liveConnected = false;
let liveSkuDetails = {};
let liveSkuPagination = {};
const workbenchSkuPages = new Map();
let applyLiveFacts = () => {};
let reportLoaded = false, savedPresentation = null, reportEdited = false;
const periodCacheMaxAge = 20 * 60 * 1000;
const periodReports = new Map();
let activePeriodReport;
let eventFilter = 'focus';
let taskFilter = 'all';
let dimensionTab = 'base-performance';
let expandedSkuCategories = new Set();
let expandedRegionChangeGroups = new Set();
const createdWorkbenchTasks = new Map();
const improvementTasks = new Map();
const dimensionIssueEdits = new Map();
let editingWorkbenchTaskId = '';
let pendingIssueEdit = null;
let pendingWorkbenchUnmet = null;
const workbenchLocalStateKey = 'order-workbench-improvements-v1';
const workbenchSummaryStorageKey = 'order-workbench-summary-v1';
const defaultWorkbenchSummary = {
  positive: '暂无人工填写的正向结论。',
  risk: '暂无人工填写的风险结论。',
  rhythm: '暂无人工填写的节奏分析。',
};
let workbenchSummaryContent = { ...defaultWorkbenchSummary };
let pendingWorkbenchSummaryTrigger = null;
const workbenchUnmetEntriesKey = 'order-workbench-unmet-entries-v1';
const workbenchDirectorNotesKey = 'order-workbench-director-notes-v1';
let workbenchDirectorNotes = [];
let pendingWorkbenchDirectorNote = null;
const workbenchReferenceLinksKey = 'order-workbench-reference-links-v1';
let workbenchReferenceLinks = [];
let pendingWorkbenchReference = null;
let addedWorkbenchUnmetEntries = [];
const workbenchUnmetOverrides = new Map();
const deletedWorkbenchUnmetKeys = new Set();
let pendingWorkbenchUnmetDelete = null;
const persistenceStatus = document.createElement('span');
persistenceStatus.id = 'reportPersistenceStatus';
persistenceStatus.setAttribute('role', 'status');
persistenceStatus.hidden = true;
document.getElementById('periodMeta').after(persistenceStatus);
let persistence = createReportPersistence(
  async (request, signal) => { const encoded = await encodeReportRequest(request); signal.throwIfAborted(); return call('workspace', encoded, { signal }); },
  (state, message) => {
    persistenceStatus.textContent = ' · ' + message;
    persistenceStatus.dataset.state = state;
    if (state === 'saved') reportEdited = false;
  },
);
function reportEdits() {
  return { summary: workbenchSummaryContent, unmet: addedWorkbenchUnmetEntries,
    overrides: [...workbenchUnmetOverrides], deleted: [...deletedWorkbenchUnmetKeys],
    directors: workbenchDirectorNotes, references: workbenchReferenceLinks,
    improvements: [...workbenchView.querySelectorAll('.wb-improvement-table')].map(table => [...table.tBodies[0].rows].map(row => [...row.querySelectorAll('td:not(.actions)')].map(cell => ({text: cell.textContent, className: cell.className.replace('is-editing', '').trim()})))),
    tasks: [...improvementTasks], issues: [...dimensionIssueEdits], createdTasks: [...createdWorkbenchTasks] };
}
function restoreReportEdits(edits = {}) {
  workbenchSummaryContent = { ...defaultWorkbenchSummary, ...edits.summary };
  addedWorkbenchUnmetEntries = edits.unmet ?? [];
  workbenchDirectorNotes = edits.directors ?? [];
  workbenchReferenceLinks = edits.references ?? [];
  for (const [map, entries] of [[workbenchUnmetOverrides, edits.overrides], [improvementTasks, edits.tasks], [dimensionIssueEdits, edits.issues], [createdWorkbenchTasks, edits.createdTasks]]) {
    map.clear(); for (const [key, value] of entries ?? []) map.set(key, value);
  }
  [...workbenchView.querySelectorAll('.wb-improvement-table')].forEach((table, index) => {
    table.tBodies[0].replaceChildren();
    for (const cells of edits.improvements?.[index] ?? []) {
      const row = document.createElement('tr');
      for (const value of cells) { const cell = document.createElement('td'); cell.textContent = value.text; cell.className = value.className; row.append(cell); }
      appendImprovementActions(row); table.tBodies[0].append(row);
    }
  });
  deletedWorkbenchUnmetKeys.clear(); for (const key of edits.deleted ?? []) deletedWorkbenchUnmetKeys.add(key);
}
function saveEditedReport() { reportEdited = true; if(activePeriodReport){activePeriodReport.edits=structuredClone(reportEdits());activePeriodReport.dirty=true;} return persistence.saveEdits(reportEdits()); }
function saveWorkbenchSummary() { return saveEditedReport(); }
function saveWorkbenchDirectorNotes() { return saveEditedReport(); }
function saveWorkbenchReferenceLinks() { return saveEditedReport(); }
function saveWorkbenchUnmetState() { return saveEditedReport(); }
function saveWorkbenchLocalState() { return saveEditedReport(); }
window.addEventListener('beforeunload', event => { if (reportEdited || [...periodReports.values()].some(entry=>entry.dirty || entry.persistence.pending())) { event.preventDefault(); event.returnValue = ''; } });
document.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!reportLoaded && button && [...button.attributes].some(attribute => /^data-wb-.*(add|edit|delete)$/.test(attribute.name))) {
    event.preventDefault(); event.stopImmediatePropagation();
    showWorkbenchToast('报告尚未读取完整或未获授权，暂不能编辑保存。'); return;
  }

}, true);
// Hosted pages keep native form navigation disabled; submit only the page-owned action.
document.addEventListener('click', event => {
  const button = event.target.closest('button[type="submit"]');
  const form = button?.form;
  if (!form?.matches('.wb-adopt-form, .wb-task-edit-form')) return;
  event.preventDefault();
  if (form.reportValidity()) form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
});
document.addEventListener('keydown', event => {
  if (event.key !== 'Enter' || event.defaultPrevented || event.isComposing || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey || event.target.tagName !== 'INPUT') return;
  const form = event.target.form;
  if (!form?.matches('.wb-adopt-form, .wb-task-edit-form')) return;
  event.preventDefault();
  form.querySelector('button[type="submit"]')?.click();
});
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
    target: '<6%',
    targetLabel: '健康 < 6%',
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
    target: '<2%',
    targetLabel: '健康 < 2%',
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
    target: shippableDaysTarget,
    targetLabel: shippableDaysTarget,
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
    summary: '整体 2.20%，目标 <2%；高势能渠道销售改单率 27.55% 属明显异常。',
    evidence:
      '核心 KPI 报告：改单率由 3.05% 降至 2.20%，但未达 <2% 目标；大区/省区报告列出高势能渠道销售 27.55%。',
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
    target: '<6%',
    targetLabel: '健康 < 6%',
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
    target: '<2%',
    targetLabel: '健康 < 2%',
    gap: '达到目标边界，未满足严格小于目标',
    gapTone: 'bad',
    trend: '周环比 +0.02pp',
    status: '未达标',
    tone: 'urgent',
    formula: '周内改单量 ÷ 同周有效投单量 × 100%',
    note: '本周 2.00%，达到目标边界但不满足严格小于 2%；上周 1.97%。周报本期累计值 2.02%，两个口径不可混用。',
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
    target: shippableDaysTarget,
    targetLabel: shippableDaysTarget,
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
const performanceValue = (text, state = '') => ({ text, state });
const workbenchPerformance = {
  'base-performance': {
    title: '基地维度达成分析',
    baseColumnIndex: 0,
    summary:
      '月度满足率合计 95.3%、准交率 99.1%；郑州、遂平、华南和西南可发货天数高于基地 11 天参考线，华东为 8.2 天。周度满足率合计 96.2%，可发货天数合计 14.5 天。',
    monthly: {
      title: '基地月度达成（本期 / 环比 / 同比）',
      groups: [
        { label: '基地', rowspan: true },
        { label: '满足率 >95%', columns: ['本期', '环比', '同比'] },
        { label: '准交率 >98.5%', columns: ['本期', '环比'] },
        { label: '60天+占比', columns: ['本期', '环比'] },
        { label: `可发货天数 ${shippableDaysTarget}`, columns: ['本期', '环比', '同比'] },
      ],
      rows: [
        [
          '郑州',
          performanceValue('95.5%', 'good'),
          '+0.02pct',
          '+8.73pct',
          performanceValue('98.8%', 'good'),
          '+1.30pct',
          performanceValue('3.3%', 'warning'),
          '-1.71pct',
          performanceValue('15.3', 'bad'),
          '+4.70天',
          '+5.92天',
        ],
        [
          '遂平',
          performanceValue('95.5%', 'good'),
          '+0.46pct',
          '+8.72pct',
          performanceValue('99.1%', 'good'),
          '+2.27pct',
          performanceValue('1.7%', 'good'),
          '-2.08pct',
          performanceValue('13.7', 'bad'),
          '+2.67天',
          '+5.93天',
        ],
        [
          '华东',
          performanceValue('94.2%', 'bad'),
          '-1.39pct',
          '+4.22pct',
          performanceValue('100.0%', 'good'),
          '+0.00pct',
          performanceValue('0.2%', 'good'),
          '-3.66pct',
          performanceValue('8.2', 'good'),
          '-4.33天',
          '+2.40天',
        ],
        [
          '华南',
          performanceValue('97.0%', 'good'),
          '+1.06pct',
          '+4.16pct',
          performanceValue('98.8%', 'good'),
          '-1.18pct',
          performanceValue('1.8%', 'good'),
          '-0.05pct',
          performanceValue('13.2', 'bad'),
          '+2.69天',
          '+3.63天',
        ],
        [
          '西南',
          performanceValue('93.6%', 'bad'),
          '+4.66pct',
          '+7.60pct',
          performanceValue('99.9%', 'good'),
          '+6.71pct',
          performanceValue('1.1%', 'good'),
          '-0.06pct',
          performanceValue('16.3', 'bad'),
          '+7.16天',
          '+5.33天',
        ],
        [
          '合计',
          performanceValue('95.3%', 'good'),
          '+0.97pct',
          '+7.97pct',
          performanceValue('99.1%', 'good'),
          '+2.23pct',
          performanceValue('2.2%', 'good'),
          '-1.45pct',
          performanceValue('14.5', 'bad'),
          '+3.96天',
          '+5.50天',
        ],
      ],
    },
    weekly: {
      title: '基地周度达成（本周 / 周环比 / 周同比）',
      groups: [
        { label: '基地', rowspan: true },
        { label: '满足率', columns: ['本周', '周环比', '周同比'] },
        { label: '准交率', columns: ['本周', '周环比'] },
        { label: '60天+占比', columns: ['本周', '周环比'] },
        { label: '可发货天数', columns: ['本周', '周环比'] },
      ],
      rows: [
        [
          '郑州',
          performanceValue('95.7%', 'good'),
          '+0.00pct',
          '+9.63pct',
          performanceValue('99.3%', 'good'),
          '-0.05pct',
          performanceValue('3.3%', 'warning'),
          '-0.16pct',
          performanceValue('15.3', 'bad'),
          '+1.79天',
        ],
        [
          '遂平',
          performanceValue('96.5%', 'good'),
          '+1.88pct',
          '+9.33pct',
          performanceValue('99.8%', 'good'),
          '+0.48pct',
          performanceValue('1.7%', 'good'),
          '-0.12pct',
          performanceValue('13.7', 'bad'),
          '+1.51天',
        ],
        [
          '华东',
          performanceValue('96.4%', 'good'),
          '+2.78pct',
          '+6.74pct',
          performanceValue('100.0%', 'good'),
          '+0.00pct',
          performanceValue('0.2%', 'good'),
          '-1.31pct',
          performanceValue('8.2', 'good'),
          '+0.52天',
        ],
        [
          '华南',
          performanceValue('96.6%', 'good'),
          '-0.24pct',
          '+3.72pct',
          performanceValue('100.0%', 'good'),
          '+0.57pct',
          performanceValue('1.8%', 'good'),
          '+0.12pct',
          performanceValue('13.2', 'bad'),
          '+1.65天',
        ],
        [
          '西南',
          performanceValue('96.9%', 'good'),
          '+7.64pct',
          '+9.21pct',
          performanceValue('99.7%', 'good'),
          '-0.26pct',
          performanceValue('1.1%', 'good'),
          '+0.08pct',
          performanceValue('16.3', 'bad'),
          '+2.25天',
        ],
        [
          '合计',
          performanceValue('96.2%', 'good'),
          '+1.63pct',
          '+8.82pct',
          performanceValue('99.6%', 'good'),
          '+0.12pct',
          performanceValue('2.2%', 'good'),
          '-0.13pct',
          performanceValue('14.5', 'bad'),
          '+1.67天',
        ],
      ],
    },
  },
  'director-performance': {
    title: '应责总监维度达成分析',
    baseColumnIndex: 1,
    summary:
      '月度全国满足率 95.3%、准交率 99.1%；刘威胜满足率 92.5%，郑州三位总监可发货天数均高于 12.5 天参考线。周度全国满足率 96.2%，各总监数据按对应基地展开。',
    monthly: {
      title: '应责总监月度达成',
      groups: [
        { label: '应责总监', rowspan: true },
        { label: '对应基地', rowspan: true },
        { label: '满足率 >95%', columns: ['本期', '环比', '同比'] },
        { label: '准交率 >98.5%', columns: ['本期', '环比'] },
        { label: '60天+占比', columns: ['本期', '环比'] },
        { label: '可发货天数', columns: ['本期', '环比', '同比'] },
      ],
      rows: [
        [
          '庞丽娟',
          '郑州',
          performanceValue('96.7%', 'good'),
          '+8.32pct',
          '+10.75pct',
          performanceValue('98.8%', 'good'),
          '+1.30pct',
          performanceValue('3.8%', 'warning'),
          '-3.33pct',
          performanceValue('14.5', 'bad'),
          '+5.14天',
          '+5.79天',
        ],
        [
          '张培',
          '郑州',
          performanceValue('96.7%', 'good'),
          '+9.44pct',
          '+8.96pct',
          '—',
          '—',
          performanceValue('2.1%', 'good'),
          '-1.89pct',
          performanceValue('15.4', 'bad'),
          '+3.75天',
          '+6.73天',
        ],
        [
          '刘威胜',
          '郑州',
          performanceValue('92.5%', 'bad'),
          '-2.71pct',
          '+1.66pct',
          '—',
          '—',
          performanceValue('2.4%', 'good'),
          '+1.77pct',
          performanceValue('18.4', 'bad'),
          '+2.25天',
          '+4.43天',
        ],
        [
          '殷科培',
          '遂平',
          performanceValue('95.5%', 'good'),
          '+2.31pct',
          '+8.72pct',
          performanceValue('99.1%', 'good'),
          '+2.27pct',
          performanceValue('1.7%', 'good'),
          '-2.08pct',
          performanceValue('13.7', 'bad'),
          '+2.67天',
          '+5.93天',
        ],
        [
          '姚小伟',
          '华东',
          performanceValue('94.2%', 'bad'),
          '+2.47pct',
          '+4.22pct',
          performanceValue('100.0%', 'good'),
          '+0.00pct',
          performanceValue('0.2%', 'good'),
          '-3.66pct',
          performanceValue('8.2', 'good'),
          '-4.33天',
          '+2.40天',
        ],
        [
          '赵曼威',
          '华南',
          performanceValue('97.0%', 'good'),
          '+2.39pct',
          '+4.16pct',
          performanceValue('98.8%', 'good'),
          '-1.18pct',
          performanceValue('1.8%', 'good'),
          '-0.05pct',
          performanceValue('13.2', 'bad'),
          '+2.69天',
          '+3.63天',
        ],
        [
          '甘建勇',
          '西南',
          performanceValue('93.6%', 'bad'),
          '+5.14pct',
          '+7.60pct',
          performanceValue('99.9%', 'good'),
          '+6.71pct',
          performanceValue('1.1%', 'good'),
          '-0.06pct',
          performanceValue('16.3', 'bad'),
          '+7.16天',
          '+5.33天',
        ],
        [
          '全国合计',
          '—',
          performanceValue('95.3%', 'good'),
          '+0.97pct',
          '+7.97pct',
          performanceValue('99.1%', 'good'),
          '+2.23pct',
          performanceValue('2.2%', 'good'),
          '-1.45pct',
          performanceValue('14.5', 'bad'),
          '+3.96天',
          '+5.50天',
        ],
      ],
    },
    weekly: {
      title: '应责总监周度达成',
      groups: [
        { label: '应责总监', rowspan: true },
        { label: '对应基地', rowspan: true },
        { label: '满足率', columns: ['本周', '周环比', '周同比'] },
        { label: '准交率', columns: ['本周', '周环比'] },
        { label: '60天+占比', columns: ['本周', '周环比'] },
        { label: '可发货天数', columns: ['本周', '周环比'] },
      ],
      rows: [
        [
          '庞丽娟',
          '郑州',
          performanceValue('97.1%', 'good'),
          '+0.59pct',
          '+11.65pct',
          performanceValue('99.3%', 'good'),
          '-0.05pct',
          performanceValue('3.8%', 'warning'),
          '-0.48pct',
          performanceValue('14.5', 'bad'),
          '+1.82天',
        ],
        [
          '张培',
          '郑州',
          performanceValue('96.8%', 'good'),
          '-0.36pct',
          '+10.88pct',
          '—',
          '—',
          performanceValue('2.1%', 'good'),
          '-0.17pct',
          performanceValue('15.4', 'bad'),
          '+2.64天',
        ],
        [
          '刘威胜',
          '郑州',
          performanceValue('91.3%', 'bad'),
          '-2.40pct',
          '+2.07pct',
          '—',
          '—',
          performanceValue('2.4%', 'good'),
          '+0.77pct',
          performanceValue('18.4', 'bad'),
          '+1.42天',
        ],
        [
          '殷科培',
          '遂平',
          performanceValue('96.5%', 'good'),
          '+1.88pct',
          '+9.33pct',
          performanceValue('99.8%', 'good'),
          '+0.48pct',
          performanceValue('1.7%', 'good'),
          '-0.12pct',
          performanceValue('13.7', 'bad'),
          '+1.51天',
        ],
        [
          '姚小伟',
          '华东',
          performanceValue('96.4%', 'good'),
          '+2.78pct',
          '+6.74pct',
          performanceValue('100.0%', 'good'),
          '+0.00pct',
          performanceValue('0.2%', 'good'),
          '-1.31pct',
          performanceValue('8.2', 'good'),
          '+0.52天',
        ],
        [
          '赵曼威',
          '华南',
          performanceValue('96.6%', 'good'),
          '-0.24pct',
          '+3.72pct',
          performanceValue('100.0%', 'good'),
          '+0.57pct',
          performanceValue('1.8%', 'good'),
          '+0.12pct',
          performanceValue('13.2', 'bad'),
          '+1.65天',
        ],
        [
          '甘建勇',
          '西南',
          performanceValue('96.9%', 'good'),
          '+7.64pct',
          '+9.21pct',
          performanceValue('99.7%', 'good'),
          '-0.26pct',
          performanceValue('1.1%', 'good'),
          '+0.08pct',
          performanceValue('16.3', 'bad'),
          '+2.25天',
        ],
        [
          '全国合计',
          '—',
          performanceValue('96.2%', 'good'),
          '+1.63pct',
          '+8.82pct',
          performanceValue('99.6%', 'good'),
          '+0.12pct',
          performanceValue('2.2%', 'good'),
          '-0.13pct',
          performanceValue('14.5', 'bad'),
          '+1.67天',
        ],
      ],
    },
  },
  'item-performance': {
    title: '品项维度达成分析',
    summary:
      '月度 7 个常规品项中，火锅料、馄饨、面点和预制食材满足率未达 95%；汤圆、水饺、休闲等多个品项可发货天数超过参考线。粽子为季节性库存，报告显示可发货天数为∞。',
    monthly: {
      title: '品项月度达成',
      groups: [
        { label: '品项', rowspan: true },
        { label: '满足率 >95%', columns: ['本期', '环比', '同比'] },
        { label: '可发货天数', columns: ['本期', '环比', '同比'] },
        { label: '60天+占比', columns: ['本期', '环比', '同比'] },
        { label: '未达成项', rowspan: true },
      ],
      rows: [
        [
          '汤圆',
          performanceValue('97.2%', 'good'),
          '+0.28pct',
          '+7.94pct',
          performanceValue('19.0', 'bad'),
          '+3.59天',
          '+8.09天',
          performanceValue('3.3%', 'warning'),
          '-3.87pct',
          '+3.26pct',
          '可发货天数 19.0',
        ],
        [
          '水饺',
          performanceValue('97.2%', 'good'),
          '+3.48pct',
          '+7.47pct',
          performanceValue('15.6', 'bad'),
          '+5.11天',
          '+5.10天',
          performanceValue('1.0%', 'good'),
          '-0.54pct',
          '-0.76pct',
          '可发货天数 15.6',
        ],
        [
          '休闲',
          performanceValue('97.0%', 'good'),
          '+1.98pct',
          '+9.77pct',
          performanceValue('17.3', 'bad'),
          '+5.70天',
          '+7.46天',
          performanceValue('0.6%', 'good'),
          '-0.75pct',
          '-0.85pct',
          '可发货天数 17.3',
        ],
        [
          '火锅料',
          performanceValue('93.0%', 'bad'),
          '-2.38pct',
          '+3.58pct',
          performanceValue('22.4', 'bad'),
          '+2.17天',
          '+8.39天',
          performanceValue('2.4%', 'good'),
          '+1.54pct',
          '+0.07pct',
          '满足率 93.0%、可发货天数 22.4',
        ],
        [
          '馄饨',
          performanceValue('94.0%', 'bad'),
          '+0.44pct',
          '-0.06pct',
          performanceValue('13.6', 'bad'),
          '+5.53天',
          '+3.83天',
          performanceValue('0.5%', 'good'),
          '-4.71pct',
          '-4.43pct',
          '满足率 94.0%、可发货天数 13.6',
        ],
        [
          '面点',
          performanceValue('91.6%', 'bad'),
          '-1.98pct',
          '+26.27pct',
          performanceValue('11.7', 'good'),
          '+0.49天',
          '+3.52天',
          performanceValue('2.3%', 'good'),
          '-1.48pct',
          '+2.07pct',
          '满足率 91.6%',
        ],
        [
          '预制食材',
          performanceValue('88.8%', 'bad'),
          '+0.30pct',
          '-0.17pct',
          performanceValue('11.2', 'good'),
          '+1.96天',
          '-0.52天',
          performanceValue('1.5%', 'good'),
          '-0.28pct',
          '+0.89pct',
          '满足率 88.8%',
        ],
        [
          '粽子',
          performanceValue('100.0%', 'good'),
          '—',
          '—',
          performanceValue('∞', 'bad'),
          '—',
          '—',
          performanceValue('100.0%', 'bad'),
          '+0.00pct',
          '—',
          '可发货天数 ∞、60天+占比 100%',
        ],
      ],
    },
    weekly: {
      title: '品项周度达成',
      groups: [
        { label: '品项', rowspan: true },
        { label: '满足率', columns: ['本周', '周环比', '周同比'] },
        { label: '可发货天数', columns: ['本周', '周环比'] },
        { label: '60天+占比', columns: ['本周', '周环比'] },
      ],
      rows: [
        [
          '汤圆',
          performanceValue('98.1%', 'good'),
          '+1.94pct',
          '+8.45pct',
          performanceValue('19.0', 'bad'),
          '+2.92天',
          performanceValue('3.3%', 'warning'),
          '-1.01pct',
        ],
        [
          '水饺',
          performanceValue('98.1%', 'good'),
          '+1.72pct',
          '+8.46pct',
          performanceValue('15.6', 'bad'),
          '+1.24天',
          performanceValue('1.0%', 'good'),
          '+0.16pct',
        ],
        [
          '休闲',
          performanceValue('98.4%', 'good'),
          '+1.92pct',
          '+10.18pct',
          performanceValue('17.3', 'bad'),
          '+2.60天',
          performanceValue('0.6%', 'good'),
          '+0.13pct',
        ],
        [
          '火锅料',
          performanceValue('93.1%', 'bad'),
          '+0.14pct',
          '+4.83pct',
          performanceValue('22.4', 'bad'),
          '+3.16天',
          performanceValue('2.4%', 'good'),
          '+0.64pct',
        ],
        [
          '馄饨',
          performanceValue('95.4%', 'good'),
          '+3.18pct',
          '+2.04pct',
          performanceValue('13.6', 'bad'),
          '+2.78天',
          performanceValue('0.5%', 'good'),
          '+0.01pct',
        ],
        [
          '面点',
          performanceValue('92.4%', 'bad'),
          '+1.11pct',
          '+27.93pct',
          performanceValue('11.7', 'good'),
          '+0.81天',
          performanceValue('2.3%', 'good'),
          '+0.05pct',
        ],
        [
          '预制食材',
          performanceValue('87.7%', 'bad'),
          '-2.75pct',
          '-0.98pct',
          performanceValue('11.2', 'good'),
          '+0.03天',
          performanceValue('1.5%', 'good'),
          '-0.05pct',
        ],
        [
          '粽子',
          performanceValue('100.0%', 'good'),
          '—',
          '—',
          performanceValue('∞', 'bad'),
          '—',
          performanceValue('100.0%', 'bad'),
          '+0.00pct',
        ],
        [
          '合计',
          performanceValue('96.2%', 'good'),
          '+1.63pct',
          '+8.82pct',
          performanceValue('14.5', 'bad'),
          '+1.67天',
          performanceValue('2.2%', 'good'),
          '-0.13pct',
        ],
      ],
    },
  },
};
const workbenchBaseUnmetItems = [
  {
    title: '西南基地｜满足率 93.62%（未达标）+ 可发货天数 16.3天（超标 5.3天）',
    analysis:
      '满足率 93.62%（环比 +3.93pct，仍低于 95%）；可发货天数 16.32天（环比 +2.25天，超阈值 5.32天，全国最高）。',
    reasons: [
      '1–4号发货量均为 9 月底备单，订单率在 85% 左右，拉低满足率；鸡肉制品、面点类缺货。',
      '10 月初版计划 200 万件，产品组又追加 18 万件汤圆；截至 10 月 19 日整体下单进度 52%，实际发货进度只有 36%。因发货进度偏低，需按周对接各省区确认需求。',
    ],
    measures: [
      '自产品跟进尽快投产',
      '鸡肉制品结合排产进行调拨',
      '19 日川南省区调减 15 万件，生产对应做紧急调整',
      '过程多频次联动各省区确认需求，及时获取信息并调整',
    ],
  },
  {
    title: '华东基地｜满足率 94.16%（未达标，差距收敛）',
    analysis:
      '满足率 94.16%（环比 +1.72pct，距目标 95% 差距 0.84pct）；可发货天数 8.19天（最优，达标）。',
    reasons: [
      '订单满足率 94.16%：聚焦水饺 92.15%、预制食材 80.15%、火锅料 89.59%。',
      '水饺缺货集中在盒马水饺，缺货 6,283 件；9 月底至 10 月上旬盒马水饺持续缺货。',
      '预制食材聚焦炖馍 640 件（国庆期间调拨物流 4 号发运，造成直营缺货）、金牌鸡肉小食 763 件、BP 饭团 385 件；过程中调拨货挂单等待。',
      '火锅料：0 系列丸子 1 千件调拨缺货及计划需求偏差；牛羊肉卷 325 件调拨缺货；400g/500g 真空丸子 400 件因计划需求偏差过大造成缺货。',
    ],
    measures: [
      '盒马水饺已部分缓解',
      '预制食材有所缓解，但过程中仍有单品缺货',
      '0 系列丸子和牛羊肉卷对接直属部，部分缓解',
      '持续对接销售计划预测并调整计划需求偏差，监控发货进度',
      '缺货品前置下单等待',
    ],
  },
];
const workbenchItemUnmetItems = [
  {
    title: '预制食材｜满足率 88.76%（品项最低，缺口 6.24pct）',
    reasons: [
      '鸡调品缺货（鸡米花 / 雪花鸡柳 / 川香鸡柳）：10 月 1–18 日缺货 19,668 件，占预制食材缺货 70%；ODM 代工产能约束与订单超前是双重因素。',
      '饭团 / 糯米鸡缺货：10 月 1–18 日缺货 4,773 件，占 18%；ODM 代工产能约束，因工人问题稻圣产能仅为原产能 50%。',
      '调拨原因缺货：2,200 件，占 9%。',
    ],
    measures: [
      '挖掘现有产能，已锁定代工厂全月产能并每日跟踪日产达成；鸡米花实陈生产 1–18 日累计欠产 11,500 件',
      'ODM 管理正在推动新的代工资源补充产能',
      '泰正已增加第三条产线',
      '长期规划：ODM 管理推动新代工资源、储备备选工厂；月销量按代工厂产能 85% 下达，避免超能力接单；新品先备安全库存再开放下单权限',
    ],
  },
  {
    title: '面点｜满足率 91.56%（缺口 3.44pct，仍未修复）',
    reasons: [
      '主要集中在散装圆包 0.7 万件、寿桃包 0.6 万件、卡通包 0.25 万件、大师圆包 0.22 万件。',
      '散装圆包：郑州基地 0.4 万件，外协厂未达到规划日产目标，生产进度滞后（截至 18 日 47%，落后 10%）；遂平基地 0.22 万件未达规划日产。',
      '寿桃包：订单前置，当前订单纠偏报单进度 92%，规划本月底下市，可满足目前系统缺货订单。',
      '卡通包：湖州基地未达到规划日产，缺货预计 25 号可满足。',
      '60 天以上库存：510 圆包（遂平基地）7 月份日期产品质量问题封存，已对接遂平基地核实转中试产品。',
    ],
    measures: [
      '寿桃包 / 切黄包 10 月底消化完',
      '单品已打标签控制下单',
      '长期规划：卡通包等下市品项 10 月底清零；面点封存策略与周转平衡评估',
    ],
  },
];
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
  return {kind:periodMode,metrics:metricDefinitions,events:[],actions:[],tasks:[]};
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
function formatMonthName(month) {
  const [year, number] = month.split('-').map(Number);
  return `${year}年${number}月`;
}
function formatMonthDay(iso) {
  return iso.slice(5).replace('-', '');
}
function renderPeriodPicker() {
  const monthList = document.getElementById('periodPickerMonths');
  const weekList = document.getElementById('periodPickerWeeks');
  const monthDate = parseIsoDate(`${currentMonth}-01`);
  const months = Array.from({ length: 3 }, (_, index) => {
    const date = new Date(monthDate.getFullYear(), monthDate.getMonth() - index, 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  });
  monthList.replaceChildren(
    ...months.map((month) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'period-picker-option';
      button.dataset.periodMonth = month;
      button.setAttribute('aria-pressed', String(month === selectedMonth));
      button.textContent = formatMonthName(month);
      return button;
    }),
  );
  const allButton = document.createElement('button');
  allButton.type = 'button';
  allButton.className = 'period-picker-option';
  allButton.dataset.periodAll = '';
  allButton.setAttribute('aria-pressed', String(periodMode === 'month'));
  allButton.textContent = '全部';
  const weekButtons = weeksInMonth(selectedMonth).map((week, index) => {
    const firstInMonth = `${selectedMonth}-01`;
    const [year, number] = selectedMonth.split('-').map(Number);
    const lastInMonth = toIsoDate(new Date(year, number, 0));
    const start = week.start < firstInMonth ? firstInMonth : week.start;
    const end = week.end > lastInMonth ? lastInMonth : week.end;
    const weekNumber = ['一', '二', '三', '四', '五', '六'][index] || String(index + 1);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'period-picker-option';
    button.dataset.periodWeek = week.start;
    button.setAttribute(
      'aria-pressed',
      String(periodMode === 'week' && selectedWeek === week.start),
    );
    button.textContent = `第${weekNumber}周（${formatMonthDay(start)}–${formatMonthDay(end)}）`;
    return button;
  });
  weekList.replaceChildren(allButton, ...weekButtons);
  const currentWeekIndex = weeksInMonth(selectedMonth).findIndex(
    (week) => week.start === selectedWeek,
  );
  const selectedLabel =
    periodMode === 'month'
      ? '全部'
      : `第${['一', '二', '三', '四', '五', '六'][currentWeekIndex] || currentWeekIndex + 1}周`;
  document.getElementById('periodPickerValue').textContent =
    `${formatMonthName(selectedMonth)} · ${selectedLabel}`;
}
function selectedPeriodLabel() {
  if (periodMode === 'month') {
    const [year, month] = selectedMonth.split('-');
    return `${year} 年 ${Number(month)} 月`;
  }
  const first = selectedMonth + '-01';
  const last = toIsoDate(new Date(Number(selectedMonth.slice(0, 4)), Number(selectedMonth.slice(5)), 0));
  return `${selectedWeek < first ? first : selectedWeek} 至 ${addDays(selectedWeek, 6) > last ? last : addDays(selectedWeek, 6)}`;
}
function hasWorkbenchReport() {
  return activeReport() !== null;
}
function renderSelectedPeriod() {
  void readCurrentPeriod();
  renderPeriodPicker();
  const reportAvailable = hasWorkbenchReport();
  workbenchView
    .querySelectorAll('.wb-note, .wb-section, .wb-analysis, .wb-panels, #wbDimensionSection')
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
  document.getElementById('periodMeta').textContent = liveFacts ? 'GEA受控数据 · '+selectedPeriodLabel()+' · 订单截至 '+addDays(liveFacts.periods[liveFacts.selected].end,-1)+'；库存以来源快照日为准'+(liveFacts.complete===false?'；对比数据及明细加载中…':'') : '正在加载受控数据…';
}
const periodPicker = document.getElementById('periodPicker');
const periodPickerTrigger = document.getElementById('periodPickerTrigger');
const periodPickerMenu = document.getElementById('periodPickerMenu');
function setPeriodPickerOpen(open, returnFocus = false) {
  periodPickerMenu.hidden = !open;
  periodPickerTrigger.setAttribute('aria-expanded', String(open));
  if (returnFocus) periodPickerTrigger.focus();
}
periodPickerTrigger.addEventListener('click', () => setPeriodPickerOpen(periodPickerMenu.hidden));
periodPickerMenu.addEventListener('click', (event) => {
  const monthOption = event.target.closest('[data-period-month]');
  if (monthOption) {
    selectedMonth = monthOption.dataset.periodMonth;
    periodMode = 'month';
    const weeks = weeksInMonth(selectedMonth);
    if (!weeks.some((week) => week.start === selectedWeek)) selectedWeek = weeks[0].start;

    renderSelectedPeriod();
    periodPickerMenu.querySelector(`[data-period-month="${selectedMonth}"]`)?.focus();
    return;
  }
  if (event.target.closest('[data-period-all]')) {
    periodMode = 'month';

    renderSelectedPeriod();
    setPeriodPickerOpen(false, true);
    return;
  }
  const weekOption = event.target.closest('[data-period-week]');
  if (weekOption) {
    periodMode = 'week';
    selectedWeek = weekOption.dataset.periodWeek;

    renderSelectedPeriod();
    setPeriodPickerOpen(false, true);
  }
});
document.addEventListener('click', (event) => {
  if (!periodPicker.contains(event.target)) setPeriodPickerOpen(false);
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !periodPickerMenu.hidden) setPeriodPickerOpen(false, true);
});
function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char],
  );
}
function renderWorkbenchSummary() {
  document.querySelectorAll('[data-wb-summary-content]').forEach((node) => {
    const key = node.dataset.wbSummaryContent;
    node.textContent = workbenchSummaryContent[key] ?? '暂无人工填写的分析。';
  });
}
function renderWorkbenchReferenceLinks() {
  const list = document.getElementById('wbReferenceList');
  if (!list) return;
  const safeLinks = workbenchReferenceLinks
    .map((link) => {
      try {
        const url = new URL(link.url);
        return ['http:', 'https:'].includes(url.protocol) ? { ...link, href: url.href } : null;
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  if (!safeLinks.length) {
    list.innerHTML = '<p class="wb-reference-empty">暂无参考链接，点击“添加”填写。</p>';
    return;
  }
  list.innerHTML = safeLinks
    .map(
      (link) =>
        `<article class="wb-reference-row"><div class="wb-reference-main"><strong title="${escapeHtml(link.name)}">${escapeHtml(link.name)}</strong><a href="${escapeHtml(link.href)}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(link.href)}">${escapeHtml(link.href)}</a></div><div class="wb-reference-actions"><button type="button" data-wb-edit-reference="${escapeHtml(link.id)}" aria-label="编辑${escapeHtml(link.name)}" title="编辑"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m16 4 4 4M4 20l4.3-.9L19 8.4 15.6 5 4.9 15.7 4 20Z"/></svg></button><button class="delete" type="button" data-wb-delete-reference="${escapeHtml(link.id)}" aria-label="删除${escapeHtml(link.name)}" title="删除"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6m4-6v6M5 7l1 13h12l1-13M9 7V4h6v3"/></svg></button></div></article>`,
    )
    .join('');
}
const topMetricCards = [
  {
    key: '作废率',
    label: '作废率',
    value: '2.05',
    unit: '%',
    target: '<6%',
    status: '达标',
    footer: '本周作废率 1.90%',
  },
  {
    key: '改单率',
    label: '改单率',
    value: '2.05',
    unit: '%',
    target: '<6%',
    status: '未达',
    footer: '本周改单率 1.90%',
  },
  {
    key: '订单满足率',
    label: '满足率',
    value: '2.05',
    unit: '%',
    target: '>95%（挑战 97%）',
    status: '达标',
    footer: '本周满足率 1.90%',
  },
  {
    key: '准交率',
    label: '准交率',
    value: '2.05',
    unit: '%',
    target: '>95%（挑战 97%）',
    status: '达标',
    footer: '本周准交率 1.90%',
  },
  {
    key: '货龄（>60天库存占比）',
    label: '60天及以上货龄占比',
    value: '2.05',
    unit: '%',
    target: '越低越好',
    status: '达标',
    footer: '本周货龄占比 1.90%',
  },
  {
    key: '周转天数',
    label: '可发货天数',
    value: '14.5',
    unit: '天',
    target: shippableDaysTarget,
    status: '达标',
    footer: '本周可发货天数 14.5天',
  },
];
function clearLiveMetrics() {
  liveSkuDetails = {};
  liveSkuPagination={};workbenchSkuPages.clear();
  workbenchDimensions['region-change'].customerDetails = [];
  for (const metric of topMetricCards) Object.assign(metric,{value:'—',status:'数据不足',footer:'按文档口径；缺失依据不估算',comparison:['—','—','—','—']});
  for (const metric of metricDefinitions) Object.assign(metric,{value:'—',display:'—',previous:'上期 —',same:'同期 —',change:'—',sameChange:'—',gap:'—',trend:'—',status:'数据不足',note:'当前缺少完整口径或同范围证据，不使用演示结果。'});
  for (const dimension of Object.values(workbenchDimensions)) Object.assign(dimension,{rows:[],risks:{},summary:'缺少同范围可核验数据',note:'缺失值保持未知'});
  for (const dimension of Object.values(workbenchPerformance)) {
    dimension.summary='当前授权查询结果；未接入指标保持未知';
    dimension.monthly.rows=[];
    dimension.weekly.rows=[];
    dimension.monthly.loading=false;
    dimension.weekly.loading=false;
  }
  for (const metric of topMetricCards) {
    if (metric.label==='可发货天数') metric.target=shippableDaysTarget;
    if (metric.key==='作废率') metric.target='<6%';
    if (metric.key==='改单率') metric.target='<2%';
    if (metric.key==='订单满足率') metric.target='>95%';
    if (metric.key==='准交率') metric.target='>98.5%';
  }
}
async function loadServerSku(category,page=0){
 const entry=activePeriodReport,facts=liveFacts;
 if(!entry||!facts?.sqlSummary)return;
 entry.skuPages??=new Map();const key=category+':'+page;
 if(!entry.skuPages.has(key)){
  const selected=facts.periods[facts.selected];
  const pending=loadWorkbenchSkuPage(selected.start,selected.end,category,page,entry.controller.signal,entry.persistence.scope()?.base??'').then(result=>{
    const detailFacts={...facts,sqlSummary:false,periods:{...facts.periods,[facts.selected]:result.period}};
    const presentation=workbenchPresentation(detailFacts);
    return {rows:presentation.skus[category]??[],pagination:{page,total:result.total,size:20}};
  });
  entry.skuPages.set(key,pending);pending.catch(()=>entry.skuPages.delete(key));
 }
 try{const result=await entry.skuPages.get(key);if(activePeriodReport!==entry||entry.controller.signal.aborted)return;entry.skuStates?.set(category,'ready');liveSkuDetails[category]=result.rows;liveSkuPagination[category]=result.pagination;renderWorkbenchDimensions();}
 catch(error){if(activePeriodReport===entry&&!entry.controller.signal.aborted)showWorkbenchToast('SKU明细读取失败，未用不完整数据替代。');}
}
async function readCurrentPeriod() {
  if (!liveConnected) return;
  const key=periodMode+':'+selectedMonth+(periodMode==='week'?':'+selectedWeek:'');
  if (key===liveReadKey) return;
  if(activePeriodReport && reportLoaded) activePeriodReport.edits=structuredClone(reportEdits());
  liveReadKey=key;
  let entry=periodReports.get(key);
  if(entry && !entry.dirty && !entry.persistence.pending() && entry.finished && Date.now()-entry.finished>periodCacheMaxAge){entry.controller.abort();periodReports.delete(key);entry=null;}
  if(!entry){
    entry={controller:new AbortController(),edits:null,dirty:false,loaded:false,facts:null,started:false};
    entry.persistence=createReportPersistence(async(request,signal)=>{const encoded=await encodeReportRequest(request);signal.throwIfAborted();return call('workspace',encoded,{signal});},(state,message)=>{
      if(state==='saved')entry.dirty=false;
      entry.status={state,message};
      if(activePeriodReport===entry){persistenceStatus.textContent=' · '+message;persistenceStatus.dataset.state=state;if(state==='saved')reportEdited=false;}
    });
    periodReports.set(key,entry);
  }
  activePeriodReport=entry;persistence=entry.persistence;
  const controller=liveController=entry.controller;
  liveFacts=null;
  reportLoaded=false; savedPresentation=null; reportEdited=false;
  restoreReportEdits();
  clearLiveMetrics();
  for (const metric of topMetricCards) Object.assign(metric, { status: '加载中', footer: '正在读取所选周期数据…' });
  for (const dimension of Object.values(workbenchPerformance)) {
    dimension.monthly.loading=true;
    dimension.weekly.loading=true;
  }
  const monthStart=selectedMonth+'-01';
  const monthEnd=toIsoDate(new Date(Number(selectedMonth.slice(0,4)),Number(selectedMonth.slice(5)),1));
  const start=periodMode==='month'?monthStart:(selectedWeek<monthStart?monthStart:selectedWeek);
  const weekEnd=addDays(selectedWeek,7);
  const end=periodMode==='week'&&weekEnd<monthEnd?weekEnd:monthEnd;
  const applyFacts = (facts, storedPresentation) => {
    if (controller.signal.aborted) return;
    entry.facts=facts;
    if (liveReadKey!==key) return;
    liveFacts=facts;
    const presentation=storedPresentation&&!storedPresentation.lazy&&storedPresentation.performanceStyleVersion===performanceStyleVersion?storedPresentation:workbenchPresentation(facts,{dimension:dimensionTab,skuCategories:[...expandedSkuCategories].map(key=>key.slice(key.indexOf(':')+1)),skuPages:Object.fromEntries(workbenchSkuPages)});
    savedPresentation=presentation;
    for(const metric of topMetricCards) Object.assign(metric,presentation.cards.find(card=>card.key===metric.key));
    for(const metric of metricDefinitions) {
      const card=topMetricCards.find(item=>item.key===metric.key);
      if(card) Object.assign(metric,{value:card.value+card.unit,display:card.value,status:card.status,note:card.formula,
        formula:card.formula,change:card.comparison[0],sameChange:card.comparison[1]});
    }
    for(const [name,tables] of Object.entries(presentation.performance)) {
      workbenchPerformance[name].monthly.rows=tables.month;
      workbenchPerformance[name].weekly.rows=tables.week;
      workbenchPerformance[name].monthly.loading=facts.complete===false&&(!facts.periods.month||(name==='director-performance'&&facts.directors?.status==='loading'));
      workbenchPerformance[name].weekly.loading=facts.complete===false&&(!facts.periods.week||(name==='director-performance'&&facts.directors?.status==='loading'));
    }
    for(const [name,dimension] of Object.entries(presentation.dimensions)) Object.assign(workbenchDimensions[name],dimension);
    liveSkuDetails=facts.sqlSummary?{}:presentation.skus;
    if(facts.sqlSummary)for(const expanded of expandedSkuCategories){const category=expanded.slice(expanded.indexOf(':')+1);void loadServerSku(category,workbenchSkuPages.get(category)??0);}
    liveSkuPagination=presentation.skuPagination??{};
    renderSelectedPeriod();
    updateReport();
  };
  applyLiveFacts = applyFacts;
  entry.apply=applyFacts;
  if(entry.started){
    reportLoaded=entry.loaded;reportEdited=entry.dirty;restoreReportEdits(entry.edits??{});
    if(entry.facts)applyFacts(entry.facts);
    if(entry.status){persistenceStatus.dataset.state=entry.status.state;persistenceStatus.textContent=' · '+entry.status.message;}
    return;
  }
  entry.started=true;
  try {
    let saved;
    try {
      saved = await entry.persistence.open({type: periodMode.toUpperCase(), start, end}, controller.signal);
      entry.loaded=true;if(!entry.dirty)entry.edits=saved?.edits??{};
      if(activePeriodReport===entry){reportLoaded=true;restoreReportEdits(entry.edits);}
    } catch (error) { controller.signal.throwIfAborted(); }

    controller.signal.throwIfAborted();
    if(saved?.facts?.complete && saved.facts.attributionVersion === 2 && saved.facts.metricCalculationVersion === metricCalculationVersion) entry.apply(saved.facts,saved.presentation);
    if (saved?.facts?.complete && saved.facts.attributionVersion === 2 && saved.facts.metricCalculationVersion === metricCalculationVersion && end <= new Date(Date.now()+8*3600000).toISOString().slice(0,10)) {
      entry.apply(saved.facts, saved.presentation);entry.finished=Date.now();
      return;
    }
    const facts=await loadWorkbenchFacts(start,end,controller.signal,{onProgress:(facts)=>{if(!entry.facts?.complete)entry.apply(facts);},base:entry.persistence.scope()?.base,summary:true});
    entry.apply(facts);entry.finished=Date.now();
    if(entry.loaded){
      if(activePeriodReport===entry)entry.edits=structuredClone(reportEdits());
      entry.persistence.save({schemaVersion:1,facts,presentation:workbenchPresentation(facts),edits:entry.edits});
    }
    for(const [cachedKey,cached] of periodReports)if(periodReports.size>6&&cached!==activePeriodReport&&cached.finished&&!cached.dirty&&!cached.persistence.pending()){cached.controller.abort();periodReports.delete(cachedKey);}
  } catch (error) {
    entry.started=false;entry.facts=null;entry.loaded=false;
    if(!entry.dirty)periodReports.delete(key);
    if (!controller.signal.aborted && activePeriodReport===entry) {
      reportLoaded=false;
      clearLiveMetrics();
      document.getElementById('periodMeta').textContent='数据读取失败或未获授权';
      renderWorkbench();
      updateReport();
    }
  }
}
clearLiveMetrics();
void ready.then(()=>{liveConnected=true;liveReadKey='';renderSelectedPeriod();});
for (const name of ['gea-identity-changed','gea-session-changing','pagehide']) window.addEventListener(name,()=>{
  for(const entry of periodReports.values()){entry.controller.abort();entry.persistence.cancel();}periodReports.clear();activePeriodReport=null;
  liveConnected=false;liveController?.abort();persistence.cancel();reportEdited=false;reportLoaded=false;savedPresentation=null;restoreReportEdits();liveFacts=null;liveReadKey='';clearLiveMetrics();renderWorkbench();
});
window.addEventListener('gea-session-changed',()=>{liveConnected=true;liveReadKey='';renderSelectedPeriod();});

function renderWorkbench() {
  renderWorkbenchSummary();
  const report = activeReport();
  if (!report) return;

  document.getElementById('wbKpis').innerHTML = topMetricCards
    .map((metric) => {
      const statusClass = ['未达', '严重'].includes(metric.status) ? 'bad' : metric.status === '预警' ? 'warn' : metric.status === '健康' ? '' : 'unknown';
      return `<button class="wb-kpi" type="button" data-metric-question="${escapeHtml(metric.key)}" aria-label="查看${escapeHtml(metric.label)}口径"><span class="wb-kpi-head"><span class="wb-kpi-title">${escapeHtml(metric.label)}</span><span class="wb-kpi-state ${statusClass}">${escapeHtml(metric.status)}</span></span><span class="wb-kpi-value"><span class="wb-kpi-main"><strong title="${escapeHtml(metric.value==="—"?(metric.missingReason||workbenchCellMissingReason(liveFacts,{header:metric.key,period:liveFacts?.selected??"month"})): "")}">${escapeHtml(metric.value)}</strong><em>${escapeHtml(metric.unit)}</em></span><span class="wb-kpi-target">目标 ${escapeHtml(metric.target)}</span></span><span class="wb-kpi-compare"><span class="wb-kpi-compare-group"><span class="wb-kpi-compare-row"><span>本期环比</span><b title="${escapeHtml((metric.comparison?.[0]??"—")==="—"?workbenchCellMissingReason(liveFacts,{group:metric.key,header:"环比",period:"month"}):"")}">${escapeHtml(metric.comparison?.[0]??"—")}</b></span><span class="wb-kpi-compare-row"><span>本期同比</span><b title="${escapeHtml((metric.comparison?.[1]??"—")==="—"?workbenchCellMissingReason(liveFacts,{group:metric.key,header:"同比",period:"month"}):"")}">${escapeHtml(metric.comparison?.[1]??"—")}</b></span></span><span class="wb-kpi-compare-group"><span class="wb-kpi-compare-row"><span>周环比</span><b title="${escapeHtml((metric.comparison?.[2]??"—")==="—"?workbenchCellMissingReason(liveFacts,{group:metric.key,header:"环比",period:"week"}):"")}">${escapeHtml(metric.comparison?.[2]??"—")}</b></span><span class="wb-kpi-compare-row"><span>周同比</span><b title="${escapeHtml((metric.comparison?.[3]??"—")==="—"?workbenchCellMissingReason(liveFacts,{group:metric.key,header:"同比",period:"week"}):"")}">${escapeHtml(metric.comparison?.[3]??"—")}</b></span></span></span><span class="wb-kpi-foot"><span>${escapeHtml(metric.footer)}</span></span></button>`;
    })
    .join('');
  document.querySelectorAll('#wbKpis .wb-kpi').forEach((card,index)=>{
    const metric=topMetricCards[index];
    if(metric.coverageNote)card.querySelector('strong').title=metric.coverageNote;
    card.querySelectorAll('.wb-kpi-compare b').forEach((cell,i)=>{if(metric.comparisonNotes?.[i])cell.title=metric.comparisonNotes[i];});
    if(metric.footerNote)card.querySelector('.wb-kpi-foot').title=metric.footerNote;
  });
  renderWorkbenchTasks();
  renderWorkbenchDimensions();
  renderWorkbenchReferenceLinks();

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
  if(value==='健康')return 'status-ok';
  if(value==='预警')return 'status-warn';
  if(value==='严重')return 'status-bad';
  if(value==='数据不足'||value==='—')return 'status-muted';
  if(key==='base-category'&&columnIndex>0&&parseFloat(value)<90)return 'risk-value';
  if(key==='base-category-days'&&columnIndex>0&&parseFloat(value)>15)return 'risk-value';
  return '';
}
function workbenchDimensionCellText(key, rowIndex, columnIndex, value) {
  if(value==='健康')return '✓ '+value;
  if(value==='预警')return '▲ '+value;
  if(value==='严重')return '✕ '+value;
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
  const samples = liveSkuDetails[category] || [];
  if(liveFacts?.sqlSummary&&activePeriodReport?.skuStates?.get(category)==='loading')return '<div class="wb-sku-detail"><p>正在读取当前页 SKU 明细…</p></div>';
  if(liveFacts?.sqlSummary&&activePeriodReport?.skuStates?.get(category)==='error')return '<div class="wb-sku-detail"><p>当前页读取失败，未使用不完整数据。</p></div>';
  if (!samples.length)
    return `<div class="wb-sku-detail"><p>${escapeHtml(category)}当前范围暂无已授权 SKU 数据。</p></div>`;
  const rows = samples
    .map(
      (sku) =>
        `<tr><td>${escapeHtml(sku.name)}</td><td class="sku-code">${escapeHtml(sku.code)}</td><td title="${escapeHtml(sku.inventory==="—"?(sku.missingReasons?.inventory||"当前来源或计算条件不足，未补0"):"")}">${escapeHtml(sku.inventory)}</td><td title="${escapeHtml(sku.salesPlan==="—"?(sku.missingReasons?.salesPlan||"当前来源或计算条件不足，未补0"):"")}">${escapeHtml(sku.salesPlan)}</td><td title="${escapeHtml(sku.shipDays==="—"?(sku.missingReasons?.shipDays||"当前来源或计算条件不足，未补0"):"")}">${escapeHtml(sku.shipDays)}</td></tr>`,
    )
    .join('');
  const paging=liveSkuPagination[category];
  const nav=paging?`<nav class="wb-sku-pagination" aria-label="SKU明细分页"><span>共 ${paging.total} 条 · 第 ${paging.page+1} / ${Math.max(1,Math.ceil(paging.total/20))} 页</span><button type="button" data-wb-sku-page="${encodeURIComponent(category)}" data-page="${paging.page-1}" ${paging.page===0?'disabled':''}>上一页</button><button type="button" data-wb-sku-page="${encodeURIComponent(category)}" data-page="${paging.page+1}" ${(paging.page+1)*20>=paging.total?'disabled':''}>下一页</button></nav>`:'';
  return `<div class="wb-sku-detail"><p>当前授权范围的 SKU 数据；库存为全部库存，月度需求计划有纠偏取纠偏，否则取月初计划。</p><table class="wb-sku-table"><thead><tr><th>SKU名称</th><th>编码</th><th>库存</th><th>销售计划</th><th>可发货天数</th></tr></thead><tbody>${rows}</tbody></table>${nav}</div>`;
}
function renderWorkbenchRegionCustomerDetail(regionIndex) {
  const customers=workbenchDimensions['region-change'].customerDetails?.[regionIndex]??[];
  const count=value=>value==null?'—':escapeHtml(String(value))+' 张';
  const rows=customers.map(customer=>`<tr><td>${escapeHtml(customer.name)}（${escapeHtml(customer.code)}）</td><td>${escapeHtml(customer.manager)}</td><td>${count(customer.changedQuantity)}</td><td>${count(customer.orderedQuantity)}</td></tr>`).join('');
  return `<div class="wb-region-customer-detail"><table class="wb-region-customer-table"><thead><tr><th>客户名称（编码）</th><th>销售人员</th><th>锁定期改单订单数</th><th>有效订单数</th></tr></thead><tbody>${rows||'<tr><td colspan="4">当前范围暂无客户订单明细</td></tr>'}</tbody></table></div>`;
}
function renderWorkbenchPerformanceTable(table, selectedBase, baseColumnIndex) {
  const groups = table.groups.map(group => baseColumnIndex === 0 && group.label.startsWith('可发货天数')
    ? { ...group, label: `可发货天数 ${shippableDaysTarget}` } : group);
  const firstHeader = groups
    .map((group) =>
      group.rowspan
        ? `<th scope="col" rowspan="2">${escapeHtml(group.label)}</th>`
        : `<th scope="colgroup" colspan="${group.columns.length}">${escapeHtml(group.label)}</th>`,
    )
    .join('');
  const secondHeader = groups
    .filter((group) => !group.rowspan)
    .flatMap((group) => group.columns)
    .map((label) => `<th scope="col">${escapeHtml(label)}</th>`)
    .join('');
  const rows = table.rows.filter(
    (row) => !selectedBase || baseColumnIndex == null || row[baseColumnIndex] === selectedBase,
  );
  const body = rows
    .map((row) => {
      const cells = row
        .map((value,columnIndex) => {
          const headings=table.groups.flatMap(group=>group.rowspan?[{group:group.label,header:group.label}]:group.columns.map(header=>({group:group.label,header})));
          const unmapped=['未映射','归属待补全'].includes(value);
          const missing=unmapped||(value?.text??value)==='—';
          const title=value?.title?` title="${escapeHtml(value.title)}"`:missing?` title="${escapeHtml(workbenchCellMissingReason(liveFacts,{...headings[columnIndex],row,dimension:dimensionTab,period:table.title.includes('周度')?'week':'month'}))}"`:'';
          if (value && typeof value === 'object' && 'text' in value) {
            const marker =
              value.state && value.state !== 'good'
                ? `<span class="wb-performance-marker ${escapeHtml(value.state)}" aria-label="${value.state === 'warning' ? '关注' : '超出参考线'}">${value.state === 'warning' ? '!' : '●'}</span>`
                : '';
            return `<td${title} class="${value.state ? `performance-${escapeHtml(value.state)}` : ''}">${marker}${escapeHtml(value.text)}</td>`;
          }
          return `<td${title}>${escapeHtml(unmapped?'—':String(value))}</td>`;
        })
        .join('');
      return `<tr>${cells}</tr>`;
    })
    .join('');
  const empty = rows.length
    ? ''
    : `<tr><td class="wb-performance-empty" colspan="${table.rows[0]?.length || 1}">${table.loading ? '加载中…' : '当前基地筛选下暂无数据'}</td></tr>`;
  const tableClass = `wb-performance-table ${table.groups.length > 5 ? 'wide' : ''}`;
  return `<div class="wb-performance-table-wrap" role="region" aria-label="${escapeHtml(table.title)}表格，可横向滚动" tabindex="0"><table class="${tableClass}"><thead><tr>${firstHeader}</tr><tr>${secondHeader}</tr></thead><tbody>${body || empty}</tbody></table></div>`;
}
function renderWorkbenchUnmetCards(sectionTitle, items, emptyText) {
  const cards = items
    .map((item) => {
      const reasons = item.reasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join('');
      const measures = item.measures
        .map(
          (measure, index) =>
            `<span><i>${'①②③④⑤⑥'[index] || `${index + 1}.`}</i>${escapeHtml(measure)}</span>`,
        )
        .join('');
      const tools = `<div class="wb-unmet-card-actions"><button type="button" aria-label="编辑${escapeHtml(item.title)}" title="编辑" data-wb-edit-unmet="${encodeURIComponent(item.key)}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg></button><button class="delete" type="button" aria-label="删除${escapeHtml(item.title)}" title="删除" data-wb-delete-unmet="${encodeURIComponent(item.key)}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m19 6-1 14H6L5 6"/><path d="M10 11v5M14 11v5"/></svg></button></div>`;
      return `<article class="wb-unmet-card" data-wb-unmet-card="${encodeURIComponent(item.key)}">${tools}<h4><span class="wb-unmet-dot" aria-hidden="true">●</span>${escapeHtml(item.title)}</h4>${item.analysis ? `<p class="wb-unmet-analysis"><strong>未达成指标：</strong>${escapeHtml(item.analysis)}</p>` : ''}<ul>${reasons}</ul><div class="wb-unmet-measures"><strong><span aria-hidden="true">✓</span> 改善（执行情况）：</strong><div>${measures}</div></div></article>`;
    })
    .join('');
  const kind = sectionTitle.startsWith('基地') ? 'base' : 'item';
  return `<section class="wb-unmet-section"><div class="wb-unmet-section-head"><h3>${escapeHtml(sectionTitle)}</h3><div class="wb-unmet-section-actions"><button class="wb-unmet-ai-button" type="button" data-wb-unmet-ai="${kind}">✦ AI 分析</button><button class="wb-unmet-add-button" type="button" data-wb-add-unmet="${kind}">添加</button></div></div>${cards || `<p class="wb-unmet-empty">${escapeHtml(emptyText)}</p>`}</section>`;
}
function unmetTextLines(value) {
  return String(value || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}
function getWorkbenchUnmetItems(kind, selectedBase = '') {
  const sourceItems = kind === 'base' ? workbenchBaseUnmetItems : workbenchItemUnmetItems;
  const staticItems = sourceItems.map((item, index) => {
    const key = `${kind}:static:${index}`;
    const separator = item.title.indexOf('｜');
    const prefix = separator >= 0 ? item.title.slice(0, separator) : '';
    const entity = kind === 'base' ? prefix.replace(/基地$/, '') : prefix;
    const formTitle = separator >= 0 ? item.title.slice(separator + 1) : item.title;
    const baseReason = [item.analysis ? `未达成指标：${item.analysis}` : '', ...item.reasons]
      .filter(Boolean)
      .join('\n');
    const override = workbenchUnmetOverrides.get(key);
    const entry = override
      ? {
          ...item,
          title: `${override.entity}${kind === 'base' ? '基地｜' : '｜'}${override.title}`,
          analysis: '',
          reasons: unmetTextLines(override.reason),
          measures: unmetTextLines(override.measure),
          entity: override.entity,
          formTitle: override.title,
          formReason: override.reason,
          formMeasure: override.measure,
          key,
        }
      : {
          ...item,
          entity,
          formTitle,
          formReason: baseReason,
          formMeasure: item.measures.join('\n'),
          key,
        };
    return entry;
  });
  const addedItems = addedWorkbenchUnmetEntries
    .filter((entry) => entry.kind === kind)
    .map((entry) => {
      const key = `${kind}:added:${entry.id}`;
      const override = workbenchUnmetOverrides.get(key);
      const current = override || entry;
      return {
        title: `${current.entity}${kind === 'base' ? '基地｜' : '｜'}${current.title}`,
        reasons: unmetTextLines(current.reason),
        measures: unmetTextLines(current.measure),
        entity: current.entity,
        formTitle: current.title,
        formReason: current.reason,
        formMeasure: current.measure,
        key,
      };
    });
  return [...staticItems, ...addedItems].filter(
    (item) =>
      (!item.key.includes(':static:') || workbenchUnmetOverrides.has(item.key)) &&
      !deletedWorkbenchUnmetKeys.has(item.key) &&
      (kind !== 'base' || !selectedBase || item.entity === selectedBase),
  );
}
function renderWorkbenchBaseUnmet() {
  return renderWorkbenchUnmetCards(
    '基地未达成项：原因分析与改善措施',
    getWorkbenchUnmetItems('base'),
    '当前暂无基地未达成事项。',
  );
}
function renderWorkbenchItemUnmet() {
  return renderWorkbenchUnmetCards(
    '品项未达成项：原因分析与改善措施',
    getWorkbenchUnmetItems('item'),
    '当前暂无品项未达成事项。',
  );
}
function renderWorkbenchDirectorNotes() {
  const cards = workbenchDirectorNotes
    .map(
      (note) =>
        `<article class="wb-unmet-card wb-director-note-card" data-wb-director-note="${escapeHtml(note.id)}"><div class="wb-unmet-card-actions"><button type="button" aria-label="编辑${escapeHtml(note.title)}" title="编辑" data-wb-edit-director-note="${escapeHtml(note.id)}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg></button><button class="delete" type="button" aria-label="删除${escapeHtml(note.title)}" title="删除" data-wb-delete-director-note="${escapeHtml(note.id)}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m19 6-1 14H6L5 6"/><path d="M10 11v5M14 11v5"/></svg></button></div><h4><span class="wb-unmet-dot" aria-hidden="true">●</span>${escapeHtml(note.director)}｜${escapeHtml(note.title)}</h4><p class="wb-director-note-content">${escapeHtml(note.content)}</p></article>`,
    )
    .join('');
  return `<section class="wb-unmet-section wb-director-notes"><div class="wb-unmet-section-head"><h3>应责总监备注</h3><button class="wb-unmet-add-button" type="button" data-wb-add-director-note>添加</button></div>${cards || '<p class="wb-unmet-empty">当前暂无应责总监备注。</p>'}</section>`;
}
function renderWorkbenchPerformance(dimension) {
  const panel = document.getElementById('wbDimensionPanel');
  const bottomSection =
    dimensionTab === 'base-performance'
      ? renderWorkbenchBaseUnmet()
      : dimensionTab === 'item-performance'
        ? renderWorkbenchItemUnmet()
        : dimensionTab === 'director-performance'
          ? renderWorkbenchDirectorNotes()
          : '';
  panel.innerHTML = `<section class="wb-performance-period"><h3>${escapeHtml(dimension.monthly.title.replace(/^\d+(?:\.\d+)+\s*/, ''))}</h3>${renderWorkbenchPerformanceTable(dimension.monthly, '', dimension.baseColumnIndex)}</section><section class="wb-performance-period"><h3>${escapeHtml(dimension.weekly.title.replace(/^\d+(?:\.\d+)+\s*/, ''))}</h3>${renderWorkbenchPerformanceTable(dimension.weekly, '', dimension.baseColumnIndex)}</section>${bottomSection}<p class="wb-performance-note">当前授权范围；环比同比比较同长度已完成周期。*表示可判定样本或样本差，覆盖率见悬浮，不代表全量指标。“—”表示无有效计算依据。共同责任分别展示，不相加。</p>`;
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
  const performanceDimension = workbenchPerformance[dimensionTab];
  if (performanceDimension) {
    headingMeta.textContent = '当前授权范围 · '+selectedPeriodLabel();
    renderWorkbenchPerformance(performanceDimension);
    return;
  }
  headingMeta.textContent = '当前授权范围 · '+selectedPeriodLabel();
  const dimension = workbenchDimensions[dimensionTab];
  const visibleRows = dimension.rows;
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
          const title=value==='—'||(typeof value==='string'&&value.includes('*'))?` title="${escapeHtml(workbenchCellMissingReason(liveFacts,{header:dimension.columns[columnIndex],row,dimension:dimensionTab,period:liveFacts?.selected??'month'}))}"`:'';
          return `<td${title} class="${workbenchDimensionCellClass(dimensionTab, rowIndex, columnIndex, value)}">${content}</td>`;
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
  panel.innerHTML = `<div class="wb-dimension-table-wrap"><table class="wb-dimension-table ${dimensionTab === 'region-change' ? 'region-change-table' : ''}"><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table></div>`;
  panel.querySelectorAll('[data-wb-sku-page]').forEach(button=>button.addEventListener('click',()=>{
    workbenchSkuPages.set(decodeURIComponent(button.dataset.wbSkuPage),Number(button.dataset.page));
    if(liveFacts?.sqlSummary){void loadServerSku(decodeURIComponent(button.dataset.wbSkuPage),Number(button.dataset.page));return;}
    if(liveFacts)applyLiveFacts(liveFacts);
    renderWorkbenchDimensions();
  }));
  panel.querySelectorAll('[data-wb-sku-toggle]').forEach((button) =>
    button.addEventListener('click', () => {
      const key = `${dimensionTab}:${button.dataset.wbSkuToggle}`;
      if (expandedSkuCategories.has(key)) expandedSkuCategories.delete(key);
      else expandedSkuCategories.add(key);
      if(liveFacts?.sqlSummary){void loadServerSku(button.dataset.wbSkuToggle,workbenchSkuPages.get(button.dataset.wbSkuToggle)??0);renderWorkbenchDimensions();return;}
      if(liveFacts)applyLiveFacts(liveFacts);
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
const wbDimensionTabButtons = [...workbenchView.querySelectorAll('[data-wb-dimension-tab]')];
wbDimensionTabButtons.forEach((button) => {
  button.addEventListener('click', () => {
    dimensionTab = button.dataset.wbDimensionTab;
    if(liveFacts)applyLiveFacts(liveFacts);
    renderWorkbenchDimensions();
  });
});
function showWorkbenchToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(window.toastTimer);
  window.toastTimer = setTimeout(() => {
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
  showWorkbenchToast(existing ? '问题及改进已更新到本地改进任务。' : '已生成本地改进任务。');
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
  showWorkbenchToast('正在保存问题及改进…');
}
function openWorkbenchUnmetAdd(kind, trigger, itemKey = '') {
  const isBase = kind === 'base';
  const entitySelect = document.getElementById('wbUnmetEntity');
  const item = itemKey ? getWorkbenchUnmetItems(kind).find((entry) => entry.key === itemKey) : null;
  const options = isBase
    ? workbenchPerformance['base-performance'].monthly.rows
        .map((row) => row[0])
        .filter((base) => base !== '合计')
    : [...new Set(workbenchPerformance['item-performance'][periodMode === 'week' ? 'weekly' : 'monthly'].rows
        .map((row) => row[0]))].filter((name) => name && !['合计', '未映射', '—'].includes(name));
  document.getElementById('wbUnmetAddForm').reset();
  document.getElementById('wbUnmetAddTitle').textContent = item
    ? isBase
      ? '编辑基地未达成项'
      : '编辑品项未达成项'
    : isBase
      ? '添加基地未达成项'
      : '添加品项未达成项';
  document.getElementById('wbUnmetAddSubtitle').textContent = item
    ? '修改未达成项的原因分析与改善措施'
    : isBase
      ? '补充基地未达成原因与改善措施'
      : '补充品项未达成原因与改善措施';
  document.getElementById('wbUnmetEntityLabel').textContent = isBase ? '选择基地' : '选择品项';
  entitySelect.innerHTML = `<option value="">${isBase ? '请选择基地' : '请选择品项'}</option>${options.map((option) => `<option value="${escapeHtml(option)}" ${item?.entity === option ? 'selected' : ''}>${escapeHtml(option)}</option>`).join('')}`;
  document.getElementById('wbUnmetTitleInput').value = item?.formTitle || '';
  document.getElementById('wbUnmetReasonInput').value = item?.formReason || '';
  document.getElementById('wbUnmetMeasureInput').value = item?.formMeasure || '';
  document.getElementById('wbUnmetAddSubmit').textContent = item ? '保存' : '提交';
  pendingWorkbenchUnmet = { kind, trigger, key: itemKey };
  document.getElementById('wbUnmetAddOverlay').hidden = false;
  entitySelect.focus();
}
function closeWorkbenchUnmetAdd() {
  document.getElementById('wbUnmetAddOverlay').hidden = true;
  const { kind, trigger } = pendingWorkbenchUnmet || {};
  pendingWorkbenchUnmet = null;
  const fallback = kind ? workbenchView.querySelector(`[data-wb-add-unmet="${kind}"]`) : null;
  if (trigger?.isConnected) trigger.focus();
  else fallback?.focus();
}
document.getElementById('wbUnmetAddForm').addEventListener('submit', (event) => {
  event.preventDefault();
  if (!pendingWorkbenchUnmet || !event.currentTarget.reportValidity()) return;
  const entry = {
    id:
      globalThis.crypto?.randomUUID?.() ||
      `unmet-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind: pendingWorkbenchUnmet.kind,
    entity: document.getElementById('wbUnmetEntity').value,
    title: document.getElementById('wbUnmetTitleInput').value.trim(),
    reason: document.getElementById('wbUnmetReasonInput').value.trim(),
    measure: document.getElementById('wbUnmetMeasureInput').value.trim(),
    createdAt: new Date().toISOString(),
  };
  if (!entry.entity || !entry.title || !entry.reason || !entry.measure) {
    showWorkbenchToast('请完整填写标题、未达成原因和改善措施。');
    return;
  }
  const context = pendingWorkbenchUnmet;
  if (context.key)
    workbenchUnmetOverrides.set(context.key, {
      entity: entry.entity,
      title: entry.title,
      reason: entry.reason,
      measure: entry.measure,
    });
  else addedWorkbenchUnmetEntries.push(entry);
  const persisted = saveWorkbenchUnmetState();
  const kind = context.kind;
  const focusKey = context.key;
  document.getElementById('wbUnmetAddOverlay').hidden = true;
  pendingWorkbenchUnmet = null;
  renderWorkbenchDimensions();
  if (focusKey)
    workbenchView.querySelector(`[data-wb-edit-unmet="${encodeURIComponent(focusKey)}"]`)?.focus();
  else workbenchView.querySelector(`[data-wb-add-unmet="${kind}"]`)?.focus();
  showWorkbenchToast(
    persisted
      ? focusKey
        ? '未达成项已修改，正在保存到数据库…'
        : '未达成项已添加，正在保存到数据库…'
      : '内容已更新；数据库未保存，请查看页面保存状态。',
  );
});
document.getElementById('wbUnmetAddClose').addEventListener('click', closeWorkbenchUnmetAdd);
document.getElementById('wbUnmetAddCancel').addEventListener('click', closeWorkbenchUnmetAdd);
document.getElementById('wbUnmetAddOverlay').addEventListener('click', (event) => {
  if (event.target.id === 'wbUnmetAddOverlay') closeWorkbenchUnmetAdd();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !document.getElementById('wbUnmetAddOverlay').hidden)
    closeWorkbenchUnmetAdd();
});
const directorNoteOverlay = document.getElementById('wbDirectorNoteOverlay');
const directorNoteForm = document.getElementById('wbDirectorNoteForm');
const directorNoteDirector = document.getElementById('wbDirectorNoteDirector');
const directorNoteHeading = document.getElementById('wbDirectorNoteHeading');
const directorNoteContent = document.getElementById('wbDirectorNoteContent');
function openWorkbenchDirectorNote(trigger, id = '') {
  const existing = id ? workbenchDirectorNotes.find((note) => note.id === id) : null;
  const directors = workbenchPerformance['director-performance'].monthly.rows
    .map((row) => row[0])
    .filter((name) => name !== '全国合计');
  directorNoteForm.reset();
  directorNoteDirector.innerHTML = `<option value="">请选择应责总监</option>${directors.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('')}`;
  directorNoteDirector.value = existing?.director || '';
  directorNoteHeading.value = existing?.title || '';
  directorNoteContent.value = existing?.content || '';
  document.getElementById('wbDirectorNoteTitle').textContent = existing
    ? '编辑应责总监备注'
    : '添加应责总监备注';
  document.getElementById('wbDirectorNoteSubmit').textContent = existing ? '保存' : '提交';
  pendingWorkbenchDirectorNote = { id: existing?.id || '', trigger };
  directorNoteOverlay.hidden = false;
  directorNoteDirector.focus();
}
function closeWorkbenchDirectorNote() {
  directorNoteOverlay.hidden = true;
  const trigger = pendingWorkbenchDirectorNote?.trigger;
  pendingWorkbenchDirectorNote = null;
  if (trigger?.isConnected) trigger.focus();
}
directorNoteForm.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!pendingWorkbenchDirectorNote || !directorNoteForm.reportValidity()) return;
  const values = {
    director: directorNoteDirector.value,
    title: directorNoteHeading.value.trim(),
    content: directorNoteContent.value.trim(),
  };
  if (!values.director || !values.title || !values.content) {
    showWorkbenchToast('请完整填写应责总监、标题和内容。');
    return;
  }
  const id = pendingWorkbenchDirectorNote.id;
  if (id)
    workbenchDirectorNotes = workbenchDirectorNotes.map((note) =>
      note.id === id ? { ...note, ...values } : note,
    );
  else
    workbenchDirectorNotes.push({
      id:
        globalThis.crypto?.randomUUID?.() ||
        `director-note-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ...values,
    });
  const persisted = saveWorkbenchDirectorNotes();
  directorNoteOverlay.hidden = true;
  pendingWorkbenchDirectorNote = null;
  renderWorkbenchDimensions();
  const action = id ? '[data-wb-edit-director-note]' : '[data-wb-add-director-note]';
  if (id)
    [...workbenchView.querySelectorAll(action)]
      .find((button) => button.dataset.wbEditDirectorNote === id)
      ?.focus();
  else workbenchView.querySelector(action)?.focus();
  showWorkbenchToast(
    persisted
      ? id
        ? '应责总监备注已修改，正在保存到数据库…'
        : '应责总监备注已添加，正在保存到数据库…'
      : '备注已更新；数据库未保存，请查看页面保存状态。',
  );
});
document
  .getElementById('wbDirectorNoteClose')
  .addEventListener('click', closeWorkbenchDirectorNote);
document
  .getElementById('wbDirectorNoteCancel')
  .addEventListener('click', closeWorkbenchDirectorNote);
directorNoteOverlay.addEventListener('click', (event) => {
  if (event.target === directorNoteOverlay) closeWorkbenchDirectorNote();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !directorNoteOverlay.hidden) closeWorkbenchDirectorNote();
});
function openWorkbenchUnmetDelete(key, trigger) {
  const kind = key.startsWith('base:') ? 'base' : 'item';
  const item = getWorkbenchUnmetItems(kind).find((entry) => entry.key === key);
  if (!item) return;
  document.getElementById('wbUnmetDeleteCopy').textContent =
    `确认删除“${item.title}”吗？删除后可重新添加，但当前删除无法撤销。`;
  pendingWorkbenchUnmetDelete = { key, kind, trigger };
  document.getElementById('wbUnmetDeleteOverlay').hidden = false;
  document.getElementById('wbUnmetDeleteConfirm').focus();
}
function closeWorkbenchUnmetDelete() {
  document.getElementById('wbUnmetDeleteOverlay').hidden = true;
  const trigger = pendingWorkbenchUnmetDelete?.trigger;
  pendingWorkbenchUnmetDelete = null;
  if (trigger?.isConnected) trigger.focus();
}
function confirmWorkbenchUnmetDelete() {
  if (!pendingWorkbenchUnmetDelete) return;
  const { key, kind } = pendingWorkbenchUnmetDelete;
  deletedWorkbenchUnmetKeys.add(key);
  const persisted = saveWorkbenchUnmetState();
  document.getElementById('wbUnmetDeleteOverlay').hidden = true;
  pendingWorkbenchUnmetDelete = null;
  renderWorkbenchDimensions();
  workbenchView.querySelector(`[data-wb-add-unmet="${kind}"]`)?.focus();
  showWorkbenchToast(
    persisted ? '未达成项已删除。' : '未达成项已从当前列表移除；数据库未保存，请查看页面保存状态。',
  );
}
document.getElementById('wbUnmetDeleteClose').addEventListener('click', closeWorkbenchUnmetDelete);
document.getElementById('wbUnmetDeleteCancel').addEventListener('click', closeWorkbenchUnmetDelete);
document
  .getElementById('wbUnmetDeleteConfirm')
  .addEventListener('click', confirmWorkbenchUnmetDelete);
document.getElementById('wbUnmetDeleteOverlay').addEventListener('click', (event) => {
  if (event.target.id === 'wbUnmetDeleteOverlay') closeWorkbenchUnmetDelete();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !document.getElementById('wbUnmetDeleteOverlay').hidden)
    closeWorkbenchUnmetDelete();
});
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
const improvementEditIcon =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m16 4 4 4M4 20l4.3-.9L19 8.4 15.6 5 4.9 15.7 4 20Z"/></svg>';
const improvementSaveIcon =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>';
const improvementDeleteIcon =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6m4-6v6M5 7l1 13h12l1-13M9 7V4h6v3"/></svg>';
function createImprovementAction(label, icon, className, attribute) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `wb-improvement-action${className ? ` ${className}` : ''}`;
  button.setAttribute(attribute, '');
  button.setAttribute('aria-label', label);
  button.title = label;
  button.innerHTML = icon;
  return button;
}
function appendImprovementActions(row) {
  if (row.querySelector('td.actions')) return;
  const cell = document.createElement('td');
  cell.className = 'actions';
  const actions = document.createElement('div');
  actions.className = 'wb-improvement-actions';
  actions.append(
    createImprovementAction('编辑', improvementEditIcon, '', 'data-wb-improvement-edit'),
  );
  actions.append(
    createImprovementAction('删除', improvementDeleteIcon, 'delete', 'data-wb-improvement-delete'),
  );
  cell.append(actions);
  row.append(cell);
}
workbenchView.querySelectorAll('.wb-improvement-table').forEach((table) => {
  table.tBodies[0]?.replaceChildren();
  const header = table.tHead?.rows[0];
  if (header && !header.querySelector('.actions')) {
    const cell = document.createElement('th');
    cell.className = 'actions';
    cell.textContent = '操作';
    header.append(cell);
  }
  table.tBodies[0]?.querySelectorAll('tr').forEach((row) => {
    appendImprovementActions(row);
  });
});
const improvementAddOverlay = document.getElementById('wbImprovementAddOverlay');
const improvementAddForm = document.getElementById('wbImprovementAddForm');
const improvementAddFields = document.getElementById('wbImprovementAddFields');
const improvementAddSchemas = {
  short: [
    { key: 'direction', label: '追进方向', multiline: false },
    { key: 'measure', label: '改善措施', multiline: true },
    { key: 'issue', label: '对应问题', multiline: true },
  ],
  long: [
    { key: 'mechanism', label: '机制', multiline: false },
    { key: 'content', label: '机制内容（问题→对策）', multiline: true },
    { key: 'goal', label: '目标', multiline: true },
    { key: 'status', label: '状态', multiline: false },
  ],
};
let pendingImprovementAdd = null;
function openImprovementAdd(kind, trigger) {
  const schema = improvementAddSchemas[kind];
  if (!schema) return;
  pendingImprovementAdd = { kind, trigger };
  document.getElementById('wbImprovementAddTitle').textContent =
    kind === 'short' ? '添加短期追进措施' : '添加长期机制';
  document.getElementById('wbImprovementAddSubtitle').textContent =
    kind === 'short'
      ? '填写追进方向、改善措施及对应问题。'
      : '填写机制、机制内容（问题→对策）及目标。';
  improvementAddFields.replaceChildren();
  schema.forEach((field) => {
    const label = document.createElement('label');
    label.append(document.createTextNode(field.label));
    const control = document.createElement(field.multiline ? 'textarea' : 'input');
    control.dataset.improvementField = field.key;
    control.required = true;
    control.maxLength = field.multiline ? 4000 : 160;
    control.placeholder = `填写${field.label}`;
    label.append(control);
    improvementAddFields.append(label);
  });
  improvementAddOverlay.hidden = false;
  improvementAddFields.querySelector('input,textarea')?.focus();
}
function closeImprovementAdd() {
  improvementAddOverlay.hidden = true;
  const trigger = pendingImprovementAdd?.trigger;
  pendingImprovementAdd = null;
  if (trigger?.isConnected) trigger.focus();
}
improvementAddForm.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!pendingImprovementAdd || !improvementAddForm.reportValidity()) return;
  const { kind, trigger } = pendingImprovementAdd;
  const table = workbenchView.querySelector(
    kind === 'short' ? '.wb-improvement-table:not(.long-term)' : '.wb-improvement-table.long-term',
  );
  const row = document.createElement('tr');
  improvementAddSchemas[kind].forEach((field) => {
    const cell = document.createElement('td');
    if (field.key === 'direction' || field.key === 'mechanism') cell.className = 'direction';
    if (field.key === 'issue') cell.className = 'issue';
    if (field.key === 'goal') cell.className = 'goal';
    if (field.key === 'status') cell.className = 'status';
    cell.textContent = improvementAddFields
      .querySelector(`[data-improvement-field="${field.key}"]`)
      .value.trim();
    row.append(cell);
  });
  appendImprovementActions(row);
  table?.tBodies[0]?.append(row);
  closeImprovementAdd();
  if (!table) trigger?.focus();
  saveEditedReport(); showWorkbenchToast('正在保存改善措施…');
});
document.getElementById('wbImprovementAddClose').addEventListener('click', closeImprovementAdd);
document.getElementById('wbImprovementAddCancel').addEventListener('click', closeImprovementAdd);
improvementAddOverlay.addEventListener('click', (event) => {
  if (event.target === improvementAddOverlay) closeImprovementAdd();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !improvementAddOverlay.hidden) closeImprovementAdd();
});
const referenceOverlay = document.getElementById('wbReferenceOverlay');
const referenceForm = document.getElementById('wbReferenceForm');
const referenceNameInput = document.getElementById('wbReferenceName');
const referenceUrlInput = document.getElementById('wbReferenceUrl');
function openWorkbenchReference(trigger, id = '') {
  const existing = id ? workbenchReferenceLinks.find((link) => link.id === id) : null;
  pendingWorkbenchReference = { id: existing?.id || '', trigger };
  referenceForm.reset();
  referenceNameInput.value = existing?.name || '';
  referenceUrlInput.value = existing?.url || '';
  document.getElementById('wbReferenceFormTitle').textContent = existing
    ? '编辑参考链接'
    : '添加参考链接';
  document.getElementById('wbReferenceSubmit').textContent = existing ? '保存' : '提交';
  referenceOverlay.hidden = false;
  referenceNameInput.focus();
}
function closeWorkbenchReference() {
  referenceOverlay.hidden = true;
  const trigger = pendingWorkbenchReference?.trigger;
  pendingWorkbenchReference = null;
  if (trigger?.isConnected) trigger.focus();
}
referenceForm.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!pendingWorkbenchReference || !referenceForm.reportValidity()) return;
  const name = referenceNameInput.value.trim();
  let url;
  try {
    url = new URL(referenceUrlInput.value.trim());
  } catch {
    showWorkbenchToast('请输入有效的网页链接（需包含 https:// 或 http://）。');
    referenceUrlInput.focus();
    return;
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    showWorkbenchToast('参考链接仅支持 http 或 https 地址。');
    referenceUrlInput.focus();
    return;
  }
  const { id } = pendingWorkbenchReference;
  if (id) {
    workbenchReferenceLinks = workbenchReferenceLinks.map((link) =>
      link.id === id ? { ...link, name, url: url.href } : link,
    );
  } else {
    const newId =
      globalThis.crypto?.randomUUID?.() ||
      `reference-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    workbenchReferenceLinks.push({ id: newId, name, url: url.href });
  }
  const saved = saveWorkbenchReferenceLinks();
  closeWorkbenchReference();
  renderWorkbenchReferenceLinks();
  showWorkbenchToast(
    saved
      ? id
        ? '参考链接已更新。'
        : '参考链接已添加。'
      : '参考链接已更新，但数据库未保存，请查看页面保存状态。',
  );
});
document.getElementById('wbReferenceClose').addEventListener('click', closeWorkbenchReference);
document.getElementById('wbReferenceCancel').addEventListener('click', closeWorkbenchReference);
referenceOverlay.addEventListener('click', (event) => {
  if (event.target === referenceOverlay) closeWorkbenchReference();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !referenceOverlay.hidden) closeWorkbenchReference();
});
const summaryEditOverlay = document.getElementById('wbSummaryEditOverlay');
const summaryEditForm = document.getElementById('wbSummaryEditForm');
const summaryInputs = {
  positive: document.getElementById('wbSummaryPositiveInput'),
  risk: document.getElementById('wbSummaryRiskInput'),
  rhythm: document.getElementById('wbSummaryRhythmInput'),
};
function openWorkbenchSummaryEdit(trigger) {
  Object.entries(summaryInputs).forEach(([key, input]) => {
    input.value = workbenchSummaryContent[key];
  });
  pendingWorkbenchSummaryTrigger = trigger;
  summaryEditOverlay.hidden = false;
  summaryInputs.positive.focus();
}
function closeWorkbenchSummaryEdit() {
  summaryEditOverlay.hidden = true;
  const trigger = pendingWorkbenchSummaryTrigger;
  pendingWorkbenchSummaryTrigger = null;
  if (trigger?.isConnected) trigger.focus();
}
summaryEditForm.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!pendingWorkbenchSummaryTrigger || !summaryEditForm.reportValidity()) return;
  const updated = Object.fromEntries(
    Object.entries(summaryInputs).map(([key, input]) => [key, input.value.trim()]),
  );
  if (Object.values(updated).some((value) => !value)) {
    showWorkbenchToast('请完整填写三段摘要内容。');
    return;
  }
  workbenchSummaryContent = updated;
  const persisted = saveWorkbenchSummary();
  renderWorkbenchSummary();
  closeWorkbenchSummaryEdit();
  showWorkbenchToast(
    persisted
      ? '本期结论摘要已更新，正在保存到数据库…'
      : '摘要已暂存于当前页面，完整数据加载后自动保存；请勿离开页面。',
  );
});
document.getElementById('wbSummaryEditClose').addEventListener('click', closeWorkbenchSummaryEdit);
document.getElementById('wbSummaryEditCancel').addEventListener('click', closeWorkbenchSummaryEdit);
summaryEditOverlay.addEventListener('click', (event) => {
  if (event.target === summaryEditOverlay) closeWorkbenchSummaryEdit();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !summaryEditOverlay.hidden) closeWorkbenchSummaryEdit();
});
workbenchView.addEventListener('click', (event) => {
  const summaryAi = event.target.closest('[data-wb-summary-ai]');
  if (summaryAi) {
    send(
      `请基于订单工作台当前的本期结论摘要进行 AI 分析，梳理关键结论、主要风险、变化趋势及优先改善方向；区分报告事实与推断，不补造数据。\n\n正向：${workbenchSummaryContent.positive}\n\n风险：${workbenchSummaryContent.risk}\n\n旬/周节奏：${workbenchSummaryContent.rhythm}`,
    );
    return;
  }
  const summaryEdit = event.target.closest('[data-wb-summary-edit]');
  if (summaryEdit) {
    openWorkbenchSummaryEdit(summaryEdit);
    return;
  }
  const referenceAdd = event.target.closest('[data-wb-reference-add]');
  if (referenceAdd) {
    openWorkbenchReference(referenceAdd);
    return;
  }
  const referenceEdit = event.target.closest('[data-wb-edit-reference]');
  if (referenceEdit) {
    openWorkbenchReference(referenceEdit, referenceEdit.dataset.wbEditReference);
    return;
  }
  const referenceDelete = event.target.closest('[data-wb-delete-reference]');
  if (referenceDelete) {
    const item = workbenchReferenceLinks.find(
      (link) => link.id === referenceDelete.dataset.wbDeleteReference,
    );
    if (!item || !window.confirm(`确认删除参考链接“${item.name}”吗？`)) return;
    workbenchReferenceLinks = workbenchReferenceLinks.filter((link) => link.id !== item.id);
    const saved = saveWorkbenchReferenceLinks();
    renderWorkbenchReferenceLinks();
    document.querySelector('[data-wb-reference-add]')?.focus();
    showWorkbenchToast(
      saved ? '参考链接已删除。' : '参考链接已从当前页面移除，但数据库未保存，请查看页面保存状态。',
    );
    return;
  }
  const improvementAdd = event.target.closest('[data-wb-improvement-add]');
  if (improvementAdd) {
    openImprovementAdd(improvementAdd.dataset.wbImprovementAdd, improvementAdd);
    return;
  }
  const improvementEdit = event.target.closest('[data-wb-improvement-edit]');
  if (improvementEdit) {
    const row = improvementEdit.closest('tr');
    const isEditing = improvementEdit.dataset.editing === 'true';
    row.querySelectorAll('td:not(.actions)').forEach((cell) => {
      if (isEditing) {
        const text = String(cell.innerText || cell.textContent || '').trim();
        cell.innerHTML = escapeHtml(text).replace(/\n/g, '<br>');
        cell.contentEditable = 'false';
        cell.classList.remove('is-editing');
      } else {
        cell.contentEditable = 'true';
        cell.spellcheck = false;
        cell.classList.add('is-editing');
      }
    });
    improvementEdit.dataset.editing = String(!isEditing);
    improvementEdit.innerHTML = isEditing ? improvementEditIcon : improvementSaveIcon;
    improvementEdit.setAttribute('aria-label', isEditing ? '编辑改善措施' : '保存改善措施');
    improvementEdit.title = isEditing ? '编辑' : '保存';
    if (!isEditing) row.querySelector('td:not(.actions)')?.focus();
    else { saveEditedReport(); showWorkbenchToast('正在保存改善措施…'); }
    return;
  }
  const improvementDelete = event.target.closest('[data-wb-improvement-delete]');
  if (improvementDelete) {
    if (!window.confirm('确认删除这条改善措施吗？删除将保存到当前周期报告。')) return;
    improvementDelete.closest('tr')?.remove();
    saveEditedReport(); showWorkbenchToast('正在保存删除结果…');
    return;
  }
  const editUnmet = event.target.closest('[data-wb-edit-unmet]');
  if (editUnmet) {
    const key = decodeURIComponent(editUnmet.dataset.wbEditUnmet);
    openWorkbenchUnmetAdd(key.startsWith('base:') ? 'base' : 'item', editUnmet, key);
    return;
  }
  const deleteUnmet = event.target.closest('[data-wb-delete-unmet]');
  if (deleteUnmet) {
    openWorkbenchUnmetDelete(decodeURIComponent(deleteUnmet.dataset.wbDeleteUnmet), deleteUnmet);
    return;
  }
  const addUnmet = event.target.closest('[data-wb-add-unmet]');
  if (addUnmet) {
    openWorkbenchUnmetAdd(addUnmet.dataset.wbAddUnmet, addUnmet);
    return;
  }
  const unmetAi = event.target.closest('[data-wb-unmet-ai]');
  if (unmetAi) {
    const kind = unmetAi.dataset.wbUnmetAi;
    const items = getWorkbenchUnmetItems(kind);
    if (!items.length) {
      showWorkbenchToast('当前没有未达成项可供分析。');
      return;
    }
    const title = kind === 'base' ? '基地未达成项' : '品项未达成项';
    const details = items
      .map((item) =>
        [
          item.title,
          item.analysis ? `未达成指标：${item.analysis}` : '',
          ...item.reasons.map((reason) => `原因：${reason}`),
          ...item.measures.map((measure) => `改善措施：${measure}`),
        ]
          .filter(Boolean)
          .join('\n'),
      )
      .join('\n\n');

    send(
      `请基于订单工作台的【${title}：原因分析与改善措施】分析以下内容，归纳共性原因、优先级和可执行的改善建议。请区分报告已提供的信息与推断，不要补造事实。\n\n${details}`,
    );
    return;
  }
  const addDirectorNote = event.target.closest('[data-wb-add-director-note]');
  if (addDirectorNote) {
    openWorkbenchDirectorNote(addDirectorNote);
    return;
  }
  const editDirectorNote = event.target.closest('[data-wb-edit-director-note]');
  if (editDirectorNote) {
    openWorkbenchDirectorNote(editDirectorNote, editDirectorNote.dataset.wbEditDirectorNote);
    return;
  }
  const deleteDirectorNote = event.target.closest('[data-wb-delete-director-note]');
  if (deleteDirectorNote) {
    const note = workbenchDirectorNotes.find(
      (item) => item.id === deleteDirectorNote.dataset.wbDeleteDirectorNote,
    );
    if (!note || !window.confirm(`确认删除“${note.director}｜${note.title}”吗？`)) return;
    workbenchDirectorNotes = workbenchDirectorNotes.filter((item) => item.id !== note.id);
    const persisted = saveWorkbenchDirectorNotes();
    renderWorkbenchDimensions();
    workbenchView.querySelector('[data-wb-add-director-note]')?.focus();
    showWorkbenchToast(
      persisted
        ? '应责总监备注已删除。'
        : '备注已从当前页面移除；数据库未保存，请查看页面保存状态。',
    );
    return;
  }
  const customerOrders = event.target.closest('[data-wb-customer-orders]');
  if (customerOrders) {
    const [regionIndex, customerIndex] = customerOrders.dataset.wbCustomerOrders
      .split(':')
      .map(Number);
    openChangedOrderList(regionIndex, customerIndex, customerOrders);
    return;
  }
  if (event.target.closest('[data-wb-analysis-chat]')) {
    const report = activeReport();
    send(
      `请基于当前${report?.kind === 'week' ? '周度' : '月度'}报告，进一步分析顶部核心指标的达标情况、主要风险及改进建议。`,
    );
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
      send(`${item.title}的风险原因和改善建议`);
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
    saveEditedReport();
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
  if(liveFacts)applyLiveFacts(liveFacts);
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
    setTimeout(() => row.classList.remove('is-linked'), 2800);
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
  saveEditedReport();
  renderWorkbench();
  focusCreatedTask(template.id);
  const toast = document.getElementById('toast');
  toast.textContent = '已在本页创建跟进任务；未同步到真实任务系统。';
  toast.hidden = false;
  clearTimeout(window.toastTimer);
  window.toastTimer = setTimeout(() => {
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
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function send(text) {
  try {
    await draft(text);
    showWorkbenchToast('分析问题已填入右侧输入框，请确认后发送。');
  } catch (error) {
    showWorkbenchToast('无法填入分析问题：' + error.message);
  }
}
function openMetricDetail(key) {
  const metric = activeReport()?.metrics.find((item) => item.key === key);
  if (!metric) return;
  document.getElementById('wbDetailTitle').textContent = key + '口径';
  document.getElementById('wbDetailBody').textContent = workbenchMetricDetail(liveFacts, key);
  document.getElementById('wbDetailBody').style.whiteSpace = 'pre-line';
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
        weekInitialized: true,
        event: eventFilter,
        task: taskFilter,
      });
    return {
      source: 'gea-governed-sql',
      mock: false,
      evidence: workbenchEvidence(liveFacts),
      pageId: 'inventory-orderworkbench',
      instance: 'default',
      period: {
        mode: periodMode,
        month: selectedMonth,
        week: selectedWeek,
        label: selectedPeriodLabel(),
        available: Boolean(report),
      },
      reportDate: liveFacts?.readAt ?? null,
      filters: {
        event: eventFilter,
        task: taskFilter,
        dimension: dimensionTab,
        base: '',
      },
      consumerCode: 'order',
      metrics: report
        ? topMetricCards.map((metric) => ({
            ...metric,
            value: metric.value + metric.unit,
            note: metric.formula,
            mock: false,
            comparison: {
              periodChange: metric.comparison?.[0]??null,
              yearChange: metric.comparison?.[1]??null,
              weekChange: metric.comparison?.[2]??null,
              weekYearChange: metric.comparison?.[3]??null,
            },
          }))
        : [],
      summary: report ? { ...workbenchSummaryContent, source: '人工编辑内容，保存状态见页面提示' } : null,
      dimension: report
        ? {
            key: dimensionTab,
            report: workbenchPerformance[dimensionTab] ?? workbenchDimensions[dimensionTab] ?? null,
            unmet:
              dimensionTab === 'base-performance'
                ? getWorkbenchUnmetItems('base')
                : dimensionTab === 'item-performance'
                  ? getWorkbenchUnmetItems('item')
                  : [],
            directorNotes: dimensionTab === 'director-performance' ? workbenchDirectorNotes : [],
          }
        : null,
      improvements: report
        ? [...workbenchView.querySelectorAll('.wb-improvement-block')].map((block) => ({
            title: block.querySelector('h3').textContent,
            rows: [...block.querySelectorAll('tbody tr')].map((row) =>
              [...row.querySelectorAll('td:not(.actions)')].map((cell) => cell.textContent.trim()),
            ),
          }))
        : [],
      references: workbenchReferenceLinks,
      events: (report?.events ?? []).filter((event) => eventFilter !== 'focus' || event.focus),
      actions: report?.actions ?? [],
      tasks: tasks.filter(
        (task) =>
          taskFilter === 'all' ||
          (taskFilter === 'done' ? task.status === '已完成' : task.status !== '已完成'),
      ),
      coverage:
        '指标来自当前用户的GEA受控查询；订单累计至T-1，库存按筛选内最新实际快照，日期见evidence。缺失数据保持未知。人工结论、改进与任务随报告保存；保存状态见页面提示。',
    };
  },
  () => {
    for (const handle of pageTimeouts) clearTimeout(handle);
    for (const url of downloadUrls) URL.revokeObjectURL(url);
    pageTimeouts.clear();
    downloadUrls.clear();
  },
);
