import { createPageViewState } from '../../business/shared/view-state.js';
const view = createPageViewState('inventory-orderworkbench');
let restoringView = false;
import { publishReport } from "./publication.js";

    const workbenchView = document.getElementById('workbenchView');
    const activePage = 'workbench';
    let periodMode = 'month';
    let selectedMonth = '2026-09';
    let selectedWeek = '2026-09-14';
    let weekInitialized = false;
    let eventFilter = 'focus';
    let taskFilter = 'all';
    const createdWorkbenchTasks = new Map();
    const pageTimeouts = new Set(), downloadUrls = new Set();
    function schedule(callback, delay) {
      const handle = setTimeout(() => { pageTimeouts.delete(handle); callback(); }, delay);
      pageTimeouts.add(handle);
      return handle;
    }
    let pendingAdoption = null;
    let adoptReturnFocus = null;
    const metricDefinitions = [
      { key:'作废率', value:'2.05%', target:'≤6%', trend:'较上期 -3.55pp', status:'达标', tone:'', formula:'周期内作废订单数 ÷ 同期接收订单总数 × 100%', note:'报告本期 2.05%、上期 5.60%；当前值达标。' },
      { key:'改单率', value:'2.20%', target:'≤2%', trend:'较上期 -0.85pp', status:'未达标', tone:'urgent', formula:'周期内改单量 ÷ 有效投单量 × 100%', note:'报告本期 2.20%、上期 3.05%；虽有改善，仍高于目标 0.20pp。' },
      { key:'准交率', value:'95.82%', target:'>98.5%', trend:'较上期 +0.93pp', status:'未达标', tone:'urgent', formula:'周期内按约定时间交付的订单数 ÷ 当期应交付订单数 × 100%', note:'报告本期 95.82%、上期 94.89%；距 98.5% 目标差 2.68pp。' },
      { key:'超时订单数', value:'—', target:'待核算', trend:'报告未给总张数', status:'待核算', tone:'', formula:'周期内未在规定订单处理或履约时效内完成相应节点的订单累计数', note:'报告仅列出面点订单进度超时 17% 等问题，不能换算成全局超时订单张数。' },
      { key:'预警订单数', value:'—', target:'待核算', trend:'需订单级去重', status:'待核算', tone:'', formula:'周期内命中预设异常规则、需要重点关注与核实的订单数', note:'报告提供异常事项与指标风险，但未提供去重后的预警订单明细。' }
    ];
    const reportEvents = [
      { id:'west', focus:true, kind:'重点', title:'西南基地履约与满足率双低', summary:'满足率 92.24%，准交率 89.38%，可发货 8.9 天；为 9 月最大短板。', evidence:'基地维度报告：西南满足率 92.24%、准交率 89.38%、可发货天数 8.9 天。报告将冷库能力与调拨延迟列为重要约束。', action:'核实外租仓与调拨分流、生产节拍；推进 9.25 冷库立库技改可行性评估。' },
      { id:'prepared', focus:true, kind:'重点', title:'预制食材满足率为品类最低', summary:'本期 87.27%，低于 95% 目标；骨肉相连、炖馍等产能约束需跟进。', evidence:'品类报告：预制食材满足率 87.27%，为 8 个品类最低；原因包括骨肉相连与炖馍产能缺口、ODM 资源调拨。', action:'复核 9.15 炖馍双班启动与第二家代工厂产能验证，明确可交付量。' },
      { id:'noodle', focus:true, kind:'重点', title:'面点满足率未达标', summary:'本期 94.80%，报告列出缺货 2,600 件、订单进度超时 17%。', evidence:'品类报告：面点满足率 94.80%，缺货 2,600 件；订单进度超时 17% 是报告中的品类问题比例，并非全局超时订单数。', action:'核对供应与开单、派车、装车节点；明确延期原因及月内恢复节奏。' },
      { id:'change', focus:true, kind:'关注', title:'改单率仍高于目标', summary:'整体 2.20%，目标 ≤2%；高势能渠道销售改单率 27.55% 属明显异常。', evidence:'核心 KPI 报告：改单率由 3.05% 降至 2.20%，但未达 ≤2% 目标；大区/省区报告列出高势能渠道销售 27.55%。', action:'先核对渠道口径及改单原因，再分渠道复盘锁单与需求变更流程。' },
      { id:'cover', focus:false, kind:'关注', title:'火锅料与汤圆可发货天数偏高', summary:'火锅料 19.3 天、汤圆 13.4 天，均高于 <12 天目标。', evidence:'品类可发货天数报告：火锅料 19.3 天，为严重超标；汤圆 13.4 天，略超目标。', action:'复核前置备货、动销节奏与库存结构，避免单纯增加备货。' }
    ];
    const reportActions = [
      { id:'prepared', icon:'⚡', title:'复核预制食材产能补位', subtitle:'建议角色：计划与供应协同 · 待业务确认', detail:'跟进炖馍 9.15 双班启动、第二家代工厂实际月产能及 ODM 交付排期。', taskId:'capacity' },
      { id:'west', icon:'↗', title:'推进西南仓配能力改善', subtitle:'建议角色：仓配协同 · 待业务确认', detail:'外租仓与调拨分流同步评估，按报告节点推进 9.25 立库技改可行性。', taskId:'warehouse' },
      { id:'noodle', icon:'◷', title:'拆解订单节点时效', subtitle:'建议角色：订单运营 · 待业务确认', detail:'从开单、派车、装车三阶段核实延期与缺货，关联面点和郑州/遂平准交问题。', taskId:'timing' },
      { id:'cover', icon:'◈', title:'复核过量备货与动销', subtitle:'建议角色：商品计划 · 待业务确认', detail:'优先复核火锅料 19.3 天与汤圆 13.4 天的可发货天数，明确消化节奏。', taskId:'inventory' }
    ];
    const reportTasks = [
      { id:'capacity', title:'验证预制食材产能补位', issue:'预制食材 · 满足率 87.27%', role:'计划 / 供应协同', due:'09.15（报告节点）', status:'待跟进', detail:'核实炖馍双班启动、第二家代工厂实际产能及 ODM 排期。报告只提出措施，执行进度待确认。' },
      { id:'warehouse', title:'评估西南立库技改与调拨分流', issue:'西南基地 · 准交率 89.38%', role:'仓配协同', due:'09.25（报告节点）', status:'待跟进', detail:'完成冷库立库技改可行性评估，并核实外租仓、调拨分流方案。' },
      { id:'timing', title:'复核开单 / 派车 / 装车时效', issue:'面点缺货 · 郑州 / 遂平准交', role:'订单运营', due:'9 月内（报告目标）', status:'待跟进', detail:'逐节点识别超时原因、责任环节和改进空间；报告中的 17% 为面点问题比例。' },
      { id:'inventory', title:'复核火锅料与汤圆备货节奏', issue:'可发货天数 19.3 / 13.4 天', role:'商品计划', due:'待业务确认', status:'待跟进', detail:'区分前置备货与实际动销，提出库存结构和去化建议。' }
    ];
    // 周报的“本周”列独立展示；不将“本期（9.1–9.6）”累计值误作周度值。
    const weeklyMetricDefinitions = [
      { key:'作废率', value:'1.61%', target:'≤6%', trend:'周环比 -1.69pp', status:'达标', tone:'', formula:'周内作废订单数 ÷ 同周接收订单总数 × 100%', note:'9.6 周报“周度对比”本周 1.61%，上周 3.29%，同周 8.80%。周报本期累计值另为 1.53%。' },
      { key:'改单率', value:'2.00%', target:'≤2%', trend:'周环比 +0.02pp', status:'达标', tone:'', formula:'周内改单量 ÷ 同周有效投单量 × 100%', note:'本周 2.00%，恰在目标上限；上周 1.97%。周报本期累计值 2.02%，状态为基本达标，两个口径不可混用。' },
      { key:'满足率', value:'94.24%', target:'>95%', trend:'周环比 +3.43pp', status:'未达标', tone:'urgent', formula:'周内满足订单量 ÷ 同周订单需求量 × 100%', note:'本周 94.24%，上周 90.81%；周报本期累计满足率 95.13%，在报告核心 KPI 表中为达标。' },
      { key:'准交率', value:'93.14%', target:'>98.5%', trend:'周环比 +3.62pp', status:'未达标', tone:'urgent', formula:'周内按约定时间交付的订单数 ÷ 同周应交付订单数 × 100%', note:'本周 93.14%，上周 89.52%；周报本期累计准交率 93.82%，亦未达目标。' },
      { key:'可发货天数', value:'10.83 天', target:'<12 天', trend:'周环比 +0.59 天', status:'达标', tone:'', formula:'周报所示整体可发货天数；计算明细未提供', note:'本周 10.83 天，上周 10.23 天；整体低于 12 天目标，但火锅料等品类局部超标。' }
    ];
    const weeklyReportEvents = [
      { id:'west-week', focus:true, kind:'重点', title:'西南基地满足率和准交率双低', summary:'满足率 92.10%、准交率 82.90%；5 个品类满足率低于 90%。', evidence:'周报基地表：西南满足率 92.10%、准交率 82.90%。交叉表中预制食材 79.06%、馄饨 82.36%、火锅料 83.29%、面点 86.84%、水饺 89.30%。', action:'核实产能、外注调拨与订单节点延迟；优先复盘低于 90% 的基地×品类组合。' },
      { id:'zhengzhou-week', focus:true, kind:'重点', title:'郑州基地履约时效未达标', summary:'满足率 94.88%、准交率 94.65%；开单、派车和装车节点需复核。', evidence:'周报基地表：郑州满足率 94.88%、准交率 94.65%；报告指出休闲、水饺、预制食材等满足率缺口，以及开单、派车、装车超时问题。', action:'按订单节点识别缺货与延迟，核实排单、派车和装车时效，明确人工复核责任。' },
      { id:'prepared-week', focus:true, kind:'重点', title:'预制食材满足率偏低', summary:'本期满足率 91.71%，缺货 0.97 万件；骨肉相连和炖馍产能待跟进。', evidence:'周报品类表：预制食材满足率 91.71%；问题分析指出骨肉相连需补产能，炖馍仍有产能缺口。西南×预制食材仅 79.06%。', action:'复核第二家代工厂实际产能、炖馍双班启动与 ODM 交付排期。' },
      { id:'dumpling-week', focus:true, kind:'重点', title:'水饺满足率未达标', summary:'本期满足率 93.46%，缺货 3.13 万件；同比下降 2.04pp。', evidence:'周报品类表：水饺满足率 93.46%，同比 -2.04pp。报告指出冷鲜肉质量问题、订单积压与 9 月初外协产能未及时补位。', action:'核实配方质量、外协产能启动和调拨支援，按基地跟进缺货恢复。' },
      { id:'hotpot-week', focus:true, kind:'关注', title:'火锅料可发货天数严重超标', summary:'本期 16.60 天，高于 12 天目标；郑州、华东局部更高。', evidence:'周报品类表：火锅料可发货天数 16.60 天；基地×品类表中郑州 15.58 天、华东 13.07 天。报告认为 9 月产能缺失与前置备货有关。', action:'跟进 9 月中旬销售发货进度，调整产能和交付节奏，防止过量备货。' },
      { id:'leisure-week', focus:false, kind:'关注', title:'休闲品类满足率不足', summary:'本期 94.21%，缺货 2.16 万件；纸皮烧麦和酥皮馅饼是重点。', evidence:'周报品类表：休闲满足率 94.21%。问题分析列出纸皮烧麦 9,905 件、酥皮馅饼 4,691 件等缺货事项。', action:'复核订单显示与实际库存差异，按报告措施安排排产和调拨。' }
    ];
    const weeklyReportActions = [
      { id:'west-week', icon:'↗', title:'复盘西南基地低满足组合', subtitle:'建议角色：订单 / 供应协同 · 待业务确认', detail:'优先核实西南×预制食材、水饺、面点、馄饨和火锅料的缺货与交付约束。', taskId:'west-week-task' },
      { id:'zhengzhou-week', icon:'◷', title:'拆解郑州订单节点时效', subtitle:'建议角色：订单运营 / 仓配 · 待业务确认', detail:'按开单、派车、装车节点核对超时原因，结合缺货与拼车情况复核。', taskId:'zhengzhou-week-task' },
      { id:'dumpling-week', icon:'⚡', title:'核实水饺产能补位', subtitle:'建议角色：生产 / 供应协同 · 待业务确认', detail:'跟进配方质量、外协产能和调拨支援，优先处理 3.13 万件缺口。', taskId:'dumpling-week-task' },
      { id:'hotpot-week', icon:'◈', title:'调整火锅料备货节奏', subtitle:'建议角色：商品计划 · 待业务确认', detail:'在保证交付的同时跟踪火锅料 16.60 天可发货天数的消化情况。', taskId:'hotpot-week-task' }
    ];
    const weeklyReportTasks = [
      { id:'west-week-task', title:'复核西南基地低满足组合', issue:'西南基地 · 满足率 92.10% / 准交率 82.90%', role:'订单 / 供应协同', due:'待业务确认', status:'待跟进', detail:'按基地×品类明细核实五个低于 90% 的组合及对应缺货原因；不表示已下发正式任务。' },
      { id:'zhengzhou-week-task', title:'复核郑州开单 / 派车 / 装车时效', issue:'郑州基地 · 准交率 94.65%', role:'订单运营 / 仓配', due:'待业务确认', status:'待跟进', detail:'按报告列出的时效环节检查订单节点和缺货原因。' },
      { id:'dumpling-week-task', title:'跟进水饺外协与调拨产能', issue:'水饺 · 满足率 93.46% / 缺货 3.13 万件', role:'生产 / 供应协同', due:'待业务确认', status:'待跟进', detail:'确认质量复核、外协产能启动和调拨支援进度。' },
      { id:'hotpot-week-task', title:'复核火锅料前置备货', issue:'火锅料 · 可发货天数 16.60 天', role:'商品计划', due:'待业务确认', status:'待跟进', detail:'跟踪 9 月中旬发货和库存消化节奏，避免过量备货。' }
    ];
    function activeReport() {
      if (periodMode === 'month' && selectedMonth === '2026-09') return { kind:'month', metrics:metricDefinitions, events:reportEvents, actions:reportActions, tasks:reportTasks };
      if (periodMode === 'week' && selectedWeek === '2026-08-31') return { kind:'week', metrics:weeklyMetricDefinitions, events:weeklyReportEvents, actions:weeklyReportActions, tasks:weeklyReportTasks };
      return null;
    }
    function workbenchTaskKey(id) { return `${periodMode}:${periodMode === 'week' ? selectedWeek : selectedMonth}:${id}`; }
    function currentCreatedTasks() { return (activeReport()?.tasks || []).map(task => createdWorkbenchTasks.get(workbenchTaskKey(task.id))).filter(Boolean); }

    function parseIsoDate(iso) { const [year, month, day] = iso.split('-').map(Number); return new Date(year, month - 1, day); }
    function toIsoDate(date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`; }
    function addDays(iso, count) { const date = parseIsoDate(iso); date.setDate(date.getDate() + count); return toIsoDate(date); }
    function mondayOf(iso) { const date = parseIsoDate(iso); date.setDate(date.getDate() - (date.getDay() + 6) % 7); return toIsoDate(date); }
    function weeksInMonth(month) {
      const [year, number] = month.split('-').map(Number);
      const last = toIsoDate(new Date(year, number, 0));
      const weeks = [];
      for (let start = mondayOf(`${month}-01`); start <= last; start = addDays(start, 7)) weeks.push({ start, end:addDays(start, 6) });
      return weeks;
    }
    function syncWeekOptions() {
      const select = document.getElementById('periodWeek');
      const weeks = weeksInMonth(selectedMonth);
      if (!weeks.some(week => week.start === selectedWeek)) selectedWeek = weeks[0].start;
      select.replaceChildren(...weeks.map((week, index) => {
        const option = document.createElement('option');
        option.value = week.start;
        option.textContent = `第 ${index + 1} 周 · ${week.start} 至 ${week.end}`;
        return option;
      }));
      select.value = selectedWeek;
    }
    function selectedPeriodLabel() {
      if (periodMode === 'month') { const [year, month] = selectedMonth.split('-'); return `${year} 年 ${Number(month)} 月`; }
      return `${selectedWeek} 至 ${addDays(selectedWeek, 6)}`;
    }
    function hasWorkbenchReport() { return activeReport() !== null; }
    function renderSelectedPeriod() {
      document.getElementById('monthMode').classList.toggle('active', periodMode === 'month');
      document.getElementById('weekMode').classList.toggle('active', periodMode === 'week');
      document.getElementById('monthMode').setAttribute('aria-pressed', String(periodMode === 'month'));
      document.getElementById('weekMode').setAttribute('aria-pressed', String(periodMode === 'week'));
      document.getElementById('periodMonth').value = selectedMonth;
      document.getElementById('weekControl').hidden = periodMode !== 'week';
      syncWeekOptions();
      const reportAvailable = hasWorkbenchReport();
      workbenchView.querySelectorAll('.wb-context, .wb-report-date, .wb-note, .wb-section, .wb-analysis, .wb-panels, #wbTaskSection, .wb-boundary').forEach(node => { node.hidden = !reportAvailable; });
      const empty = document.getElementById('wbPeriodEmpty');
      empty.hidden = reportAvailable;
      empty.textContent = periodMode === 'week' ? `${selectedPeriodLabel()} 暂无对应周报数据。目前已收录截至 2026-09-06 的周报，不能将其他周次或月度报告数值移用至本周。` : `${selectedPeriodLabel()} 暂无月度报告数据；目前仅收录截至 2026-09-13 的 9 月报告。`;
      if (reportAvailable && activePage === 'workbench') renderWorkbench();
      document.getElementById('periodMeta').textContent = reportAvailable ? activeReport().kind === 'week' ? '周报 · 截至 09-06' : '月报 · 截至 09-13' : '暂无对应报告';
    }
    document.getElementById('monthMode').addEventListener('click', () => { if (periodMode !== 'month') { periodMode = 'month'; renderSelectedPeriod(); } });
    document.getElementById('weekMode').addEventListener('click', () => { if (periodMode !== 'week') { periodMode = 'week'; if (!weekInitialized && selectedMonth === '2026-09') selectedWeek = '2026-08-31'; weekInitialized = true; renderSelectedPeriod(); } });
    document.getElementById('periodMonth').addEventListener('change', event => { if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(event.target.value)) { event.target.value = selectedMonth; return; } selectedMonth = event.target.value; selectedWeek = ''; renderSelectedPeriod(); });
    document.getElementById('periodWeek').addEventListener('change', event => { selectedWeek = event.target.value; renderSelectedPeriod(); });

    function escapeHtml(value) { return String(value).replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char])); }
    function renderWorkbench() {
      const report = activeReport();
      if (!report) return;
      const weekly = report.kind === 'week';
      workbenchView.querySelector('.wb-report-date').textContent = weekly ? '周度报告截至 2026-09-06' : '月度报告截至 2026-09-13';
      document.getElementById('wbKpis').innerHTML = report.metrics.map(metric => `<article class="wb-kpi ${metric.tone}"><span>${metric.key}</span><strong>${metric.value}</strong><small class="wb-kpi-goal">目标 ${metric.target}</small><span class="wb-kpi-state ${metric.status === '未达标' ? 'bad' : metric.status === '待核算' ? 'unknown' : ''}">${metric.status}</span><i class="wb-kpi-trend">${metric.trend}</i></article>`).join('');
      document.getElementById('wbActions').innerHTML = report.actions.map(action => { const created = createdWorkbenchTasks.has(workbenchTaskKey(action.taskId)); return `<article class="wb-action"><div class="wb-action-main"><span class="wb-action-icon" aria-hidden="true">${action.icon}</span><div><strong>${escapeHtml(action.title)}</strong><small>${escapeHtml(action.subtitle)}</small></div></div><p>${escapeHtml(action.detail)}</p><div class="wb-action-links"><button type="button" data-wb-event-detail="${action.id}">查看依据</button><button class="primary" type="button" ${created ? `data-wb-action-task="${action.taskId}"` : `data-wb-adopt="${action.taskId}"`}>${created ? '查看已建任务' : '采纳并建任务'}</button></div></article>`; }).join('');
      workbenchView.querySelector('.wb-boundary p').textContent = weekly ? '9.6 周报本周指标与品类/基地异常 → 人工核实 → 改善建议 → 采纳后建任务；订单明细仍在“订单履约”页' : '9 月报告指标与异常事项 → 人工核实 → 改善建议 → 采纳后建任务；订单明细仍在“订单履约”页';
      workbenchView.querySelector('.wb-boundary > span').textContent = weekly ? '周报摘录 · 非实时' : '报告摘录 · 非实时';
      renderWorkbenchEvents();
      renderWorkbenchTasks();
    }
    function renderWorkbenchEvents() {
      workbenchView.querySelectorAll('[data-wb-event-filter]').forEach(button => button.classList.toggle('active', button.dataset.wbEventFilter === eventFilter));
      const events = activeReport()?.events || [];
      const shown = eventFilter === 'focus' ? events.filter(event => event.focus) : events;
      document.getElementById('wbEventCount').textContent = `${shown.length} 项事项`;
      document.getElementById('wbEvents').innerHTML = shown.map(event => `<article class="wb-event"><div class="wb-event-top"><span class="wb-event-kind ${event.kind === '关注' ? 'focus' : ''}">${event.kind}</span><strong>${escapeHtml(event.title)}</strong><time>${activeReport()?.kind === 'week' ? '9.6' : '9.13'}</time></div><p>${escapeHtml(event.summary)}</p><div class="wb-event-foot"><button type="button" data-wb-event-detail="${event.id}">查看依据</button></div></article>`).join('');
    }
    function renderWorkbenchTasks() {
      workbenchView.querySelectorAll('[data-wb-task-filter]').forEach(button => button.classList.toggle('active', button.dataset.wbTaskFilter === taskFilter));
      const tasks = currentCreatedTasks();
      const pending = tasks.filter(task => task.status !== '已完成').length;
      const done = tasks.length - pending;
      document.getElementById('wbTaskSummary').textContent = `${pending} 项待跟进 · ${done} 项已完成`;
      document.getElementById('wbTaskAllCount').textContent = tasks.length;
      document.getElementById('wbTaskPendingCount').textContent = pending;
      document.getElementById('wbTaskDoneCount').textContent = done;
      const shown = taskFilter === 'all' ? tasks : tasks.filter(task => taskFilter === 'done' ? task.status === '已完成' : task.status !== '已完成');
      document.getElementById('wbTaskRows').innerHTML = shown.length ? shown.map(task => `<tr data-wb-task-row="${task.id}"><td><strong>${escapeHtml(task.title)}</strong><small>${escapeHtml(task.issue)}</small></td><td>${escapeHtml(task.role)}</td><td>${escapeHtml(task.due)}</td><td><span class="wb-task-status ${task.status === '已完成' ? 'done' : ''}">${escapeHtml(task.status)}</span></td><td><button class="wb-task-link" type="button" data-wb-task-detail="${task.id}">查看 ›</button></td></tr>`).join('') : `<tr><td colspan="5">${tasks.length ? '当前筛选下没有任务。' : '尚未建立任务；可在上方行动建议中点击“采纳并建任务”。'}</td></tr>`;
    }
    workbenchView.addEventListener('click', event => {
      const eventTab = event.target.closest('[data-wb-event-filter]');
      if (eventTab) { eventFilter = eventTab.dataset.wbEventFilter; renderWorkbenchEvents(); return; }
      const taskTab = event.target.closest('[data-wb-task-filter]');
      if (taskTab) { taskFilter = taskTab.dataset.wbTaskFilter; renderWorkbenchTasks(); return; }
      const eventDetail = event.target.closest('[data-wb-event-detail]');
      if (eventDetail) { openWorkbenchDetail('event', eventDetail.dataset.wbEventDetail); return; }
      const taskDetail = event.target.closest('[data-wb-task-detail]');
      if (taskDetail) { openWorkbenchDetail('task', taskDetail.dataset.wbTaskDetail); return; }
      const adopt = event.target.closest('[data-wb-adopt]');
      if (adopt) { openAdoptDialog(adopt.dataset.wbAdopt, adopt); return; }
      const actionTask = event.target.closest('[data-wb-action-task]');
      if (actionTask) { focusCreatedTask(actionTask.dataset.wbActionTask); return; }
      if (event.target.closest('[data-wb-export]')) { exportWorkbenchTasks(); return; }
      if (event.target.closest('[data-order-workbench-page]')) openFulfillmentPlugin();
    });
    function focusCreatedTask(id) {
      taskFilter = 'all';
      renderWorkbenchTasks();
      const row = [...workbenchView.querySelectorAll('[data-wb-task-row]')].find(item => item.dataset.wbTaskRow === id);
      if (row) { row.classList.add('is-linked'); row.scrollIntoView({ block:'center', behavior:'smooth' }); schedule(() => row.classList.remove('is-linked'), 2800); }
    }
    const wbAdoptOverlay = document.getElementById('wbAdoptOverlay');
    const wbAdoptForm = document.getElementById('wbAdoptForm');
    function openAdoptDialog(taskId, trigger) {
      const report = activeReport();
      const action = report?.actions.find(item => item.taskId === taskId);
      const template = report?.tasks.find(item => item.id === taskId);
      if (!action || !template) return;
      const key = workbenchTaskKey(taskId);
      if (createdWorkbenchTasks.has(key)) { focusCreatedTask(taskId); return; }
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
    wbAdoptOverlay.addEventListener('click', event => { if (event.target === wbAdoptOverlay) closeAdoptDialog(); });
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && !wbAdoptOverlay.hidden) closeAdoptDialog(); });
    document.getElementById('wbAdoptConfirm').addEventListener('click', event => {
      event.preventDefault();
      if (!pendingAdoption || !wbAdoptForm.reportValidity()) return;
      const role = document.getElementById('wbAdoptRole').value.trim();
      const due = document.getElementById('wbAdoptDue').value;
      const note = document.getElementById('wbAdoptNote').value.trim();
      if (!role || !due) return;
      const { key, action, template } = pendingAdoption;
      if (createdWorkbenchTasks.has(key)) { closeAdoptDialog(); focusCreatedTask(template.id); return; }
      createdWorkbenchTasks.set(key, { ...template, role, due, note, detail:action.detail, status:'待跟进' });
      closeAdoptDialog();
      renderWorkbench();
      focusCreatedTask(template.id);
      const toast = document.getElementById('toast');
      toast.textContent = '已在本页创建跟进任务；未同步到真实任务系统。';
      toast.hidden = false;
      clearTimeout(window.toastTimer);
      window.toastTimer = schedule(() => { toast.hidden = true; }, 3000);
    });
    wbAdoptForm.addEventListener('keydown', event => {
      if (event.key === 'Enter' && event.target.tagName === 'INPUT') {
        event.preventDefault();
        document.getElementById('wbAdoptConfirm').click();
      }
    });
    const wbDetailOverlay = document.getElementById('wbDetailOverlay');
    function openWorkbenchDetail(type, id) {
      const report = activeReport();
      const item = type === 'event' ? report?.events.find(entry => entry.id === id) : createdWorkbenchTasks.get(workbenchTaskKey(id));
      if (!item) return;
      document.getElementById('wbDetailTitle').textContent = item.title;
      document.getElementById('wbDetailBody').innerHTML = type === 'event' ? `<p>${escapeHtml(item.summary)}</p><h3>报告依据</h3><p>${escapeHtml(item.evidence)}</p><h3>建议跟进</h3><p>${escapeHtml(item.action)}</p><p>此处为报告摘录与页面归纳，不表示已生成正式订单预警。</p>` : `<p>${escapeHtml(item.issue)}</p><h3>责任角色与截止日期</h3><p>${escapeHtml(item.role)} · ${escapeHtml(item.due)}</p><h3>任务说明</h3><p>${escapeHtml(item.detail)}</p>${item.note ? `<h3>确认说明</h3><p>${escapeHtml(item.note)}</p>` : ''}<p>本地状态：${escapeHtml(item.status)}；未连接真实任务系统。</p>`;
      wbDetailOverlay.hidden = false;
      document.getElementById('wbDetailClose').focus();
    }
    function closeWorkbenchDetail() { wbDetailOverlay.hidden = true; }
    document.getElementById('wbDetailClose').addEventListener('click', closeWorkbenchDetail);
    wbDetailOverlay.addEventListener('click', event => { if (event.target === wbDetailOverlay) closeWorkbenchDetail(); });
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && !wbDetailOverlay.hidden) closeWorkbenchDetail(); });
    function exportWorkbenchTasks() {
      const lines = [['任务','关联事项','责任角色','预计截止日期','本地状态'], ...currentCreatedTasks().map(task => [task.title,task.issue,task.role,task.due,task.status])];
      const csv = '\uFEFF' + lines.map(line => line.map(value => `"${String(value).replaceAll('"','""')}"`).join(',')).join('\r\n');
      const url = URL.createObjectURL(new Blob([csv], { type:'text/csv;charset=utf-8' }));
      downloadUrls.add(url);
      const link = document.createElement('a'); link.href = url; link.download = `订单工作台-${activeReport()?.kind === 'week' ? '周度' : '月度'}演示任务.csv`; document.body.appendChild(link); link.click(); link.remove();
      schedule(() => { URL.revokeObjectURL(url); downloadUrls.delete(url); }, 1000);
    }

    function openFulfillmentPlugin() {
      window.parent.postMessage({ protocol: 'gea-html-v2', type: 'navigate', panel: 'inventory-orderfulfillment' }, new URL(document.referrer).origin);
    }
    renderSelectedPeriod();
    view.subscribe(state => {
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

const updateReport = publishReport(() => {
  const report = activeReport();
  const tasks = currentCreatedTasks();
  if (!restoringView) view.update({ mode: periodMode, month: selectedMonth, week: selectedWeek, weekInitialized, event: eventFilter, task: taskFilter });
  return {
    source: '订单工作台报告摘录与本地模拟', mock: true,
    pageId: 'inventory-orderworkbench', instance: 'default',
    period: {mode: periodMode, month: selectedMonth, week: selectedWeek, label: selectedPeriodLabel(), available: Boolean(report)},
    reportDate: report ? report.kind === 'week' ? '2026-09-06' : '2026-09-13' : null,
    filters: {event: eventFilter, task: taskFilter},
    metrics: report?.metrics ?? [],
    events: (report?.events ?? []).filter(event => eventFilter !== 'focus' || event.focus),
    actions: report?.actions ?? [],
    tasks: tasks.filter(task => taskFilter === 'all' || (taskFilter === 'done' ? task.status === '已完成' : task.status !== '已完成')),
    coverage: '报告摘录非实时；无单笔订单明细、真实任务派发或业务写入。冷刷新/重新进入不保存本地演示任务。'
  };
}, () => {
  for (const handle of pageTimeouts) clearTimeout(handle);
  for (const url of downloadUrls) URL.revokeObjectURL(url);
  pageTimeouts.clear(); downloadUrls.clear();
});
