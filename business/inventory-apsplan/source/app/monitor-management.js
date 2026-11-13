import { describeRunResult, showRunContext, showRunResult } from './detection-record-view.js';
import { call } from '../../../shared/channel.js';
const monitorScheduleLabel = function (v) {
  const t = v.time || '09:00';
  switch (v.frequency) {
    case 'daily':
      return '每天 ' + t;
    case 'workdays':
      return '周一至周五 ' + t;
    case 'weekly':
      return (
        '每周 ' +
        (v.days || [])
          .map((d) => '周' + ['一', '二', '三', '四', '五', '六', '日'][Number(d) - 1])
          .join('、') +
        ' ' +
        t
      );
    case 'monthly':
      return '每月 ' + v.monthday + ' 日 ' + t;
    case 'interval':
      return '每隔 ' + v.interval + ' 小时';
    default:
      return '未设置';
  }
};
export const openAlertManagement = async function (events, onEvent, startNew) {
  const existing = document.querySelector('.am-mask');
  if (existing) {
    existing.querySelector('[data-close]')?.focus();
    return;
  }
  const catalog = [
      '当前库存',
      '可用库存',
      '占用库存',
      '基地目标库存',
      '基地库存差额',
      '回顾周转天数',
      '基地展望周转天数',
      '基地目标周转天数',
      '平均货龄天数',
      '基地大日期库存',
      '基地大日期库存占比',
      '基地低库存SKU数',
      '基地高库存SKU数',
      '当前订单量',
      '未开订单缺货量',
      '周转天数差额',
      '基地大日期SKU个数',
      '备单量',
      '基地未来30日日均计划',
      '分仓月度出货计划',
      '分仓月度调拨计划',
      '分仓未来30日计划量',
      '分仓建议补货量',
      '预计月末库存',
      '分仓月度剩余调拨计划',
      '分仓月度剩余出货计划',
      '分仓日均月度出货计划',
      '分仓调拨中量',
      '调拨在途量',
      '调拨备单量',
      '基地月度需求计划',
      '近30日日均发货量',
      '入库量',
      '出库量',
      '分仓仓储费',
      '分仓运输费',
      '分仓过仓量',
      '分仓交付及时率',
      '分仓冷链符合率',
      '分仓准确交付率',
      '分仓库温符合率',
      '分仓回单确认及时率',
      '分仓新鲜度占比',
      '分仓目标库存',
      '客户目标库存',
      '客户目标周转天数',
      '分仓目标周转天数',
      '客户库存差额',
      '分仓库存差额',
      '基地调拨需求计划',
      '基地销售需求计划',
      '分仓展望周转天数',
      '客户大日期库存',
      '分仓大日期库存',
      '客户大日期SKU个数',
      '分仓大日期SKU个数',
      '客户当前库存',
      '客户大日期库存占比',
      '分仓大日期库存占比',
      '客户低库存SKU数',
      '分仓低库存SKU数',
      '客户高库存SKU数',
      '分仓高库存SKU数',
      '公司体系库存',
      '全链当前库存',
      '库存结构符合率',
      '发货金额和数量',
      'GEA期初计划',
      'GEA纠偏计划',
      '客户发货金额',
      '客户发货数量',
      '期初提报准确率',
      '期初提报金额',
      '期初提报数量',
      '纠偏提报数量',
      '纠偏提报金额',
      '纠偏提报的准确率',
      '作废率',
      '改单率',
      '已开订单缺货量',
      '订单满足率',
      '准交率',
      '基地产品新鲜度',
      '生产计划达成率',
      '需求预测准确率',
      '销售预算达成率',
      '销售提报准确率',
      '超时订单数',
      '预警订单数',
      '需求预测达成率',
      '销售提报达成率',
      '库存量',
      '月度需求变化量缺货',
      '生产计划未达成缺货量',
      '产销进度比',
      '销售初始需求提报量',
      '销售纠偏需求提报量',
      '已开订单需求量',
      '已开订单发货量',
      '销售需求计划偏差量',
      '生产计划量',
      '生产执行量',
      '生产偏差量',
      '实际周转天数',
      '客户销售目标',
      '预算额完成进度（含在途）',
      '前30天日均动销量',
      '经销商库存量',
      '经销商平均货龄天数',
      '预订单',
      '客户服务频次',
      '客户月度计划量',
      '计划量完成进度（含在途）',
      '经销商标准周转天数',
      '安全库存',
      '周转天数同比',
      '经销商库存周转偏差',
      '已拉货量（含在途）',
      '采购在途量',
      '销售总价',
      '周转天数环比',
      '目标金额环比',
      '目标金额同比',
      '实际销售金额',
      '政策可用数量',
      '政策已用数量',
      '门店销售数量',
      '门店销售均价',
      '门店数量',
      '价值贡献',
      '周转库存',
      '销售计划提报覆盖率',
      '销售计划审批完成率',
      '销售计划审批时效',
      '销售计划退回率',
      '计划调整幅度',
      '基地主生产计划量',
      '主计划版本差异量',
      '主计划达成率',
      '主计划可执行率',
      '主计划发布及时率',
      '期初库存预测准确率',
      '产能利用率',
      '产能缺口量',
      'AI预测采用率',
      'AI预测准确率',
      '年度计划执行率',
    ],
    esc = (x) =>
      String(x ?? '').replace(
        /[&<>"']/g,
        (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
      ),
    _read = (k) => {
      try {
        return JSON.parse(localStorage.getItem(k) || '[]');
      } catch {
        return [];
      }
    };
  const api = (data) => call('detection', data);
  let monitors = [],
    logs = [],
    runEvents = [],
    tab = 'monitors',
    runPending = null,
    runNotice = '',
    runPage = 0;
  events = [...events];
  const mask = document.createElement('div');
  mask.className = 'am-mask';
  mask.innerHTML =
    '<section class="am-panel" role="dialog" aria-modal="true" aria-label="预警管理"><header><div><small>工作台运营</small><h2>预警管理</h2></div><button data-close>×</button></header><div class="am-notice">通过 XXL-JOB 定时执行 GEA 问数；风险规则沿用指标库。缺少规则或数据时记录失败。</div><nav role="tablist" aria-label="预警管理内容"><button role="tab" data-tab="monitors">检测任务</button><button role="tab" data-tab="logs">执行记录</button></nav><main role="tabpanel"></main></section>';
  document.body.append(mask);
  const main = mask.querySelector('main');
  const nav = mask.querySelector('nav');
  let poll;
  let loading = false;
  let canWrite = false;
  let writeReason = '';
  async function load() {
    if (loading || !mask.isConnected) return;
    loading = true;
    nav.hidden = true;
    main.setAttribute('aria-busy', 'true');
    main.innerHTML = '<div class="am-empty" role="status">正在连接预警后台…</div>';
    try {
      const state = await api({ op: 'list' });
      if (!mask.isConnected) return;
      monitors = state.tasks;
      runEvents = state.events || [];
      logs = state.runs.map((r) => ({
        ...r,
        value: r.response?.results?.length ? '检测 ' + r.response.results.length + ' 个对象' : '—',
      }));
      canWrite = state.capabilities?.write !== false;
      writeReason = canWrite ? '' : state.capabilities.reason;
      nav.hidden = false;
      if (startNew && canWrite) form();
      else render();
      scheduleRefresh();
    } catch (error) {
      if (!mask.isConnected) return;
      main.innerHTML =
        '<div class="am-connection-error" role="alert"><p>预警后台暂不可用，无法读取或保存检测任务。</p><p>' +
        esc(error instanceof Error ? error.message : '连接失败') +
        '</p></div><button data-retry>重新连接</button>';
      main.querySelector('[data-retry]').onclick = () => void load();
    } finally {
      loading = false;
      main.removeAttribute('aria-busy');
    }
  }
  function scheduleRefresh(delay = 5000) {
    poll = setTimeout(async () => {
      if (!mask.isConnected) return;
      let nextDelay = 5000;
      try {
        await refresh();
      } catch {
        nextDelay = 60000;
      }
      if (mask.isConnected) scheduleRefresh(nextDelay);
    }, delay);
  }
  const _persist = () => {};
  async function refresh() {
    const before = JSON.stringify([monitors, logs]);
    const state = await api({ op: 'list' });
    if (!mask.isConnected) return;
    monitors = state.tasks;
    runEvents = state.events || [];
    logs = state.runs.map((r) => ({
      ...r,
      value: r.response?.results?.length ? '检测 ' + r.response.results.length + ' 个对象' : '—',
    }));
    window.dispatchEvent(new Event('gea-detection-updated'));
    if (!main.classList.contains('am-editing') && before !== JSON.stringify([monitors, logs]))
      render();
  }
  async function run(m) {
    if (!m || runPending) return;
    runPending = m.id;
    runNotice = '正在提交执行请求…';
    render();
    try {
      await api({ op: 'run', id: m.id });
      runNotice = '执行请求已提交，正在等待执行记录；最终结果请以记录状态为准。';
      tab = 'logs';
      render();
      await refresh();
    } catch (e) {
      runNotice = '执行请求未确认：' + e.message + '。请先查看执行记录，再决定是否重试。';
      render();
    } finally {
      runPending = null;
      if (mask.isConnected) render();
    }
  }
  function renderActualModel(model) {
    if (!model?.model) return '未获取';
    const full = [model.provider, model.model].filter(Boolean).join(' / ');
    return (
      '<div class="am-model-value" title="' +
      esc(full) +
      '"><span>' +
      esc(model.model) +
      '</span>' +
      (model.provider ? '<small>' + esc(model.provider) + '</small>' : '') +
      '</div>'
    );
  }
  function render() {
    const pageSize = 10;
    const pageCount = Math.max(1, Math.ceil(logs.length / pageSize));
    runPage = Math.min(runPage, pageCount - 1);
    const pageLogs = logs.slice(runPage * pageSize, (runPage + 1) * pageSize);
    const previousScroll = main.querySelector('.am-table')?.scrollLeft || 0;
    main.classList.remove('am-editing');
    mask
      .querySelectorAll('[data-tab]')
      .forEach(
        (b) => (
          b.classList.toggle('active', b.dataset.tab === tab),
          b.setAttribute('aria-selected', String(b.dataset.tab === tab)),
          (b.tabIndex = b.dataset.tab === tab ? 0 : -1)
        ),
      );
    main.innerHTML =
      (writeReason
        ? '<div class="am-run-notice" role="status">' + esc(writeReason) + '</div>'
        : '') +
      (runNotice
        ? '<div class="am-run-notice" role="status" aria-live="polite">' + esc(runNotice) + '</div>'
        : '') +
      '<div class="am-toolbar"><span>' +
      (tab === 'monitors'
        ? '管理指标的检测范围、执行频次与任务说明'
        : tab === 'events'
          ? '同一指标、范围和周期持续异常时更新原事件。'
          : '每次执行单独留痕，包括持续异常的重复检查。') +
      '</span><button data-new class="am-primary">＋ 新增检测</button></div><div class="am-table"></div>';
    let html = '';
    if (tab === 'monitors')
      html =
        '<table><thead><tr><th>指标</th><th>检测范围</th><th>执行频次</th><th>任务说明</th><th>预警设置人</th><th>判定规则</th><th>操作</th></tr></thead><tbody>' +
        monitors
          .map(
            (m) =>
              '<tr><td>' +
              esc(m.metric) +
              '<small class="am-task-state ' +
              (m.enabled ? 'is-enabled' : 'is-disabled') +
              '">' +
              (m.enabled ? '● 已启用' : '○ 已停用') +
              '</small></td><td>' +
              esc(m.scope) +
              '</td><td>' +
              esc(m.frequency) +
              '<small>' +
              esc(
                m.lastRun
                  ? new Date(m.lastRun).toLocaleString('zh-CN', {
                      timeZone: 'Asia/Shanghai',
                      hour12: false,
                    })
                  : '尚未执行',
              ) +
              '</small></td><td>' +
              esc(m.description) +
              '</td><td>' +
              esc(m.definedBy || '未记录') +
              '</td><td>沿用指标库<small>执行时读取规则</small></td><td class="am-actions"><button data-edit="' +
              m.id +
              '">修改</button><button data-toggle="' +
              m.id +
              '">' +
              (m.enabled ? '停用' : '启用') +
              '</button> <button data-run="' +
              m.id +
              '" ' +
              (!m.enabled || runPending ? 'disabled' : '') +
              '>' +
              (runPending === m.id ? '提交中…' : '立即执行') +
              '</button><button data-delete="' +
              m.id +
              '">删除</button></td></tr>',
          )
          .join('') +
        '</tbody></table>';
    if (tab === 'events')
      html =
        '<table><thead><tr><th>对象 / 指标</th><th>来源</th><th>依据</th><th>首次 / 最近检查</th><th>状态</th><th>异常次数</th></tr></thead><tbody>' +
        events
          .map(
            (x) =>
              '<tr><td>' +
              esc(x.scope) +
              '<small>' +
              esc(x.metric) +
              '</small></td><td>' +
              esc(x.source || '示例') +
              '</td><td>' +
              esc(x.range) +
              '</td><td>' +
              esc(x.first || '模拟') +
              '<small>' +
              esc(x.cutoff || '模拟') +
              '</small></td><td>' +
              esc(x.eventStatus || '活跃') +
              ' / ' +
              esc(x.level || '预警') +
              '</td><td>' +
              esc(x.hits || '—') +
              '</td></tr>',
          )
          .join('') +
        '</tbody></table>';
    if (tab === 'logs')
      html =
        '<table><thead><tr><th>执行时间</th><th>检测任务</th><th>执行数字人</th><th>实际模型</th><th>检测结果</th><th>状态</th><th>AI上下文</th><th>处理结果</th></tr></thead><tbody>' +
        pageLogs
          .map(
            (x) =>
              '<tr><td>' +
              esc(
                new Date(x.at).toLocaleString('zh-CN', {
                  timeZone: 'Asia/Shanghai',
                  hour12: false,
                }),
              ) +
              '</td><td>' +
              esc(x.name) +
              '</td><td>' +
              esc(x.actualAgent?.name || x.actualAgent?.id || '未留存') +
              '</td><td>' +
              renderActualModel(x.actualModel) +
              '</td><td>' +
              esc(x.value) +
              '</td><td>' +
              esc(x.status) +
              '</td><td><button type="button" class="am-context-button" data-context="' +
              esc(x.id) +
              '" ' +
              (!(x.context || x.prompt) ? 'disabled' : '') +
              '>' +
              (x.context || x.prompt ? '查看完整上下文' : '未留存') +
              '</button></td><td><div class="am-result-cell"><span class="am-result-summary">' +
              esc(describeRunResult(x) || '—') +
              '</span>' +
              (x.result
                ? '<button type="button" class="am-result-more" data-result="' +
                  esc(x.id) +
                  '">查看</button>'
                : '') +
              '</div></td></tr>',
          )
          .join('') +
        '</tbody></table>';
    main.querySelector('.am-table').innerHTML =
      tab === 'monitors' && !monitors.length
        ? '<div class="am-empty">暂无检测任务，点击“新增检测”开始。</div>'
        : tab === 'logs' && !logs.length
          ? '<div class="am-empty">暂无执行记录。任务执行后将在这里显示。</div>'
          : html;
    main
      .querySelector('.am-table')
      .classList.add(tab === 'monitors' ? 'am-task-table' : 'am-run-table');
    main.querySelector('.am-table').scrollLeft = previousScroll;
    if (tab === 'logs' && logs.length) {
      const pager = document.createElement('div');
      pager.className = 'am-pagination';
      pager.setAttribute('aria-label', '执行记录分页');
      pager.innerHTML =
        '<span>共 ' +
        logs.length +
        ' 条 · 每页 ' +
        pageSize +
        ' 条</span><div><button type="button" data-page-prev ' +
        (runPage === 0 ? 'disabled' : '') +
        '>上一页</button><span aria-live="polite">' +
        (runPage + 1) +
        ' / ' +
        pageCount +
        '</span><button type="button" data-page-next ' +
        (runPage >= pageCount - 1 ? 'disabled' : '') +
        '>下一页</button></div>';
      main.append(pager);
      pager.querySelector('[data-page-prev]').onclick = () => {
        if (runPage > 0) {
          runPage--;
          render();
        }
      };
      pager.querySelector('[data-page-next]').onclick = () => {
        if (runPage < pageCount - 1) {
          runPage++;
          render();
        }
      };
    }
    main
      .querySelectorAll('[data-context]')
      .forEach(
        (b) => (b.onclick = () => showRunContext(logs.find((r) => r.id === b.dataset.context))),
      );
    main.querySelectorAll('[data-result]').forEach(
      (b) =>
        (b.onclick = () =>
          showRunResult(
            logs.find((r) => r.id === b.dataset.result),
            runEvents,
          )),
    );
    if (!canWrite)
      main
        .querySelectorAll('[data-new],[data-edit],[data-toggle],[data-run],[data-delete]')
        .forEach((button) => {
          button.disabled = true;
          button.title = writeReason;
        });
    main.querySelector('[data-new]').onclick = () => form();
    main
      .querySelectorAll('[data-edit]')
      .forEach((b) => (b.onclick = () => form(monitors.find((m) => m.id === b.dataset.edit))));
    main
      .querySelectorAll('[data-run]')
      .forEach((b) => (b.onclick = () => run(monitors.find((m) => m.id === b.dataset.run))));
    main.querySelectorAll('[data-delete]').forEach(
      (b) =>
        (b.onclick = async () => {
          const m = monitors.find((x) => x.id === b.dataset.delete);
          if (
            !confirm(
              '确认删除“' +
                m.metric +
                ' · ' +
                m.scope +
                '”检测任务？删除后停止后续检测，历史预警和执行记录保留。',
            )
          )
            return;
          b.disabled = true;
          try {
            await api({ op: 'delete', id: m.id });
            runNotice = '检测任务已删除，后续调度已停止；历史预警和执行记录已保留。';
            await refresh();
            render();
          } catch (e) {
            alert(e.message);
            b.disabled = false;
          }
        }),
    );
    main.querySelectorAll('[data-toggle]').forEach(
      (b) =>
        (b.onclick = async () => {
          try {
            await api({ op: 'toggle', id: b.dataset.toggle });
            await refresh();
          } catch (e) {
            alert(e.message);
          }
        }),
    );
  }

  function enhanceSelect(select, searchable) {
    select.required = false;
    select.hidden = true;
    select.style.display = 'none';
    const wrap = document.createElement('div');
    wrap.className = 'am-select';
    select.after(wrap);
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'am-select-trigger';
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute(
      'aria-label',
      {
        metric: '选择指标',
        scope: '检测范围',
        frequency: '执行频次',
        monthday: '每月日期',
        timeHour: '执行小时',
        timeMinute: '执行分钟',
        notifyRecipient: '飞书接收人',
        notifyMode: '通知频率',
        agentPreset: '执行数字人',
      }[select.name],
    );
    wrap.append(trigger);
    const menu = document.createElement('div');
    menu.className = 'am-select-menu';
    menu.hidden = true;
    wrap.append(menu);
    let search = null;
    if (searchable) {
      search = document.createElement('input');
      search.type = 'search';
      search.placeholder = '搜索指标名称';
      search.setAttribute('aria-label', '搜索指标');
      search.className = 'am-select-search';
      menu.append(search);
    }
    const list = document.createElement('div');
    list.className = 'am-options';
    list.setAttribute('role', 'listbox');
    list.setAttribute('aria-label', trigger.getAttribute('aria-label'));
    menu.append(list);
    const sync = () => {
      trigger.textContent = select.selectedOptions[0]?.textContent || '请选择';
      trigger.classList.toggle('is-placeholder', !select.value);
    };
    const close = () => {
      menu.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
    };
    const draw = () => {
      list.replaceChildren();
      const q = (search?.value || '').trim().toLowerCase();
      Array.from(select.options)
        .filter((o) => o.value && o.textContent.toLowerCase().includes(q))
        .forEach((o) => {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'am-option';
          b.disabled = o.disabled;
          b.setAttribute('role', 'option');
          b.setAttribute('aria-selected', String(o.value === select.value));
          b.textContent = o.textContent;
          b.onclick = (e) => {
            e.preventDefault();
            select.value = o.value;
            sync();
            close();
            select.dispatchEvent(new Event('change', { bubbles: true }));
            trigger.focus();
          };
          list.append(b);
        });
      if (!list.children.length) {
        const empty = document.createElement('div');
        empty.className = 'am-select-empty';
        empty.textContent = '未找到匹配的指标';
        list.append(empty);
      }
    };
    trigger.onclick = (e) => {
      e.preventDefault();
      const opening = menu.hidden;
      main.querySelectorAll('.am-select-menu').forEach((n) => (n.hidden = true));
      main
        .querySelectorAll('.am-select-trigger')
        .forEach((n) => n.setAttribute('aria-expanded', 'false'));
      if (opening) {
        if (search) search.value = '';
        draw();
        menu.hidden = false;
        trigger.setAttribute('aria-expanded', 'true');
        (
          search ||
          list.querySelector('[aria-selected="true"]') ||
          list.querySelector('button')
        )?.focus();
      } else close();
    };
    if (search) search.oninput = draw;
    wrap.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !menu.hidden) {
        e.preventDefault();
        e.stopPropagation();
        close();
        trigger.focus();
        return;
      }
      if (['ArrowDown', 'ArrowUp'].includes(e.key)) {
        e.preventDefault();
        if (menu.hidden) {
          trigger.click();
          return;
        }
        const items = [...list.querySelectorAll('button')],
          i = items.indexOf(document.activeElement);
        items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
      }
      if (e.key === 'Tab') close();
    });
    wrap.addEventListener('focusout', () =>
      setTimeout(() => {
        if (!wrap.contains(document.activeElement)) close();
      }, 0),
    );
    sync();
  }

  async function bindAgentSelect(form, api, savedAgent) {
    const select = form.elements.agentPreset;
    const status = form.querySelector('[data-agent-status]');
    const defaultAgent = 'gea-html-inventory-apsplan';
    try {
      const agents = await api({ op: 'agents' });
      if (!form.isConnected) return;
      select.replaceChildren(new Option('请选择执行数字人', ''));
      for (const agent of agents) {
        const option = new Option(agent.name + (agent.broken ? '（不可用）' : ''), agent.id);
        option.disabled = Boolean(agent.broken);
        select.add(option);
      }
      const requested = savedAgent || defaultAgent;
      const available = agents.some((agent) => agent.id === requested && !agent.broken);
      select.value = available ? requested : '';
      select.disabled = false;
      enhanceSelect(select, false);
      status.textContent = available
        ? '默认使用产销协同 Agent，也可选择其他可用数字人。'
        : '原选项或默认数字人暂不可用，请选择其他可用数字人。';
      select.addEventListener('change', () => {
        if (select.value) status.textContent = '后续检测将使用所选数字人。';
      });
    } catch {
      if (form.isConnected) status.textContent = '数字人列表读取失败，请重新打开此表单后重试。';
    }
  }

  function bindPersonnelSearch(form, api, task) {
    const picker = form.querySelector('[data-recipient-picker]');
    const keyword = picker.querySelector('[data-people-keyword]');
    const status = picker.querySelector('[data-people-status]');
    const results = picker.querySelector('[data-people-results]');
    const menu = picker.querySelector('[data-people-menu]');
    const more = picker.querySelector('[data-people-more]');
    const chips = picker.querySelector('[data-people-selected]');
    const saved =
      task?.notifyRecipients ??
      (task && task.notifyRecipient !== 'none' ? [task.notifyRecipient || 'self'] : []);
    const recipients = new Map(saved.map((id) => [id, id === 'self' ? '我' : id.slice(4)]));
    const pending = new Set();
    let people = [],
      page = 0,
      sequence = 0,
      timer;

    function drawRecipients() {
      chips.replaceChildren();
      for (const [id, name] of recipients) {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = 'notifyRecipients';
        input.value = id;
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.setAttribute('aria-label', '移除接收人 ' + name);
        chip.textContent = name + ' ×';
        chip.title = id === 'self' ? '当前用户' : name + ' · ' + id.slice(4);
        chip.onclick = () => {
          recipients.delete(id);
          drawRecipients();
          drawResults();
          keyword.focus();
        };
        chips.append(input, chip);
      }
    }

    function drawResults() {
      results.replaceChildren();
      for (const person of people) {
        const id = 'gea:' + person.username;
        const option = document.createElement('button');
        option.type = 'button';
        option.disabled = recipients.has(id) || pending.has(id);
        option.textContent =
          [person.realname, person.username, person.orgCodeTxt].filter(Boolean).join(' · ') +
          (recipients.has(id) ? '（已选）' : '');
        option.onclick = async () => {
          const term = keyword.value;
          keyword.focus();
          pending.add(id);
          picker.setAttribute('aria-busy', 'true');
          option.disabled = true;
          status.textContent = '正在核验飞书账号…';
          try {
            const { mapped } = await api({ op: 'recipient-check', username: person.username });
            if (!form.isConnected) return;
            if (!mapped) {
              status.textContent = '该人员尚未配置飞书账号映射。';
              return;
            }
            recipients.set(id, person.realname || person.username);
            drawRecipients();
            if (keyword.value === term) {
              keyword.value = '';
              resetSearch();
              keyword.focus();
            } else {
              drawResults();
            }
          } catch (error) {
            if (form.isConnected) status.textContent = error.message || '飞书账号核验失败';
          } finally {
            pending.delete(id);
            if (!pending.size) picker.removeAttribute('aria-busy');
            option.disabled = recipients.has(id);
          }
        };
        results.append(option);
      }
    }

    function resetSearch() {
      clearTimeout(timer);
      sequence++;
      people = [];
      page = 0;
      results.replaceChildren();
      more.hidden = true;
      menu.hidden = true;
      status.textContent = '';
    }

    async function search(nextPage) {
      const current = ++sequence;
      menu.hidden = false;
      status.textContent = '正在查询内部人员…';
      more.disabled = true;
      try {
        const response = await api({
          op: 'people',
          keyword: keyword.value.trim(),
          pageNo: nextPage,
          pageSize: 10,
        });
        if (current !== sequence || !form.isConnected) return;
        for (const person of response.people) {
          if (!people.some((item) => item.username === person.username)) people.push(person);
        }
        page = nextPage;
        drawResults();
        more.hidden = !response.hasMore;
        status.textContent = people.length ? '' : '没有匹配的内部人员';
      } catch (error) {
        if (current === sequence && form.isConnected)
          status.textContent = error.message || '人员查询失败，请重新输入';
      } finally {
        if (current === sequence) more.disabled = false;
      }
    }

    function queueSearch(event) {
      resetSearch();
      if (event?.isComposing || !keyword.value.trim()) return;
      timer = setTimeout(() => void search(1), 280);
    }

    keyword.addEventListener('input', queueSearch);
    keyword.addEventListener('compositionend', queueSearch);
    keyword.addEventListener('focus', () => {
      if (keyword.value.trim() && (people.length || status.textContent)) menu.hidden = false;
    });
    picker.addEventListener('focusout', (event) => {
      if (!picker.contains(event.relatedTarget)) menu.hidden = true;
    });
    picker.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.stopPropagation();
        if (event.target === keyword && !event.isComposing) {
          event.preventDefault();
          results.querySelector('button:not([disabled])')?.click();
        }
      }
      if (event.key === 'ArrowDown' && event.target === keyword && !menu.hidden) {
        event.preventDefault();
        results.querySelector('button:not([disabled])')?.focus();
      }
      if (event.key === 'Escape' && !menu.hidden) {
        event.preventDefault();
        event.stopPropagation();
        keyword.focus();
        menu.hidden = true;
      }
    });
    more.onclick = () => void search(page + 1);
    drawRecipients();

    void Promise.all(
      saved
        .filter((id) => id.startsWith('gea:'))
        .map(async (id) => {
          const username = id.slice(4);
          try {
            const response = await api({
              op: 'people',
              keyword: username,
              pageNo: 1,
              pageSize: 10,
            });
            const matches = (response.people || []).filter(
              (person) => String(person.username) === username,
            );
            if (!form.isConnected || !recipients.has(id)) return;
            if (matches.length === 1 && matches[0].realname) {
              recipients.set(id, matches[0].realname);
              drawRecipients();
            }
          } catch {}
        }),
    );
  }

  function form(edit = null) {
    const requestKey = Array.from(crypto.getRandomValues(new Uint8Array(16)), (x) =>
      x.toString(16).padStart(2, '0'),
    ).join('');
    main.classList.add('am-editing');
    main.innerHTML =
      '<h3>' +
      (edit ? '修改检测任务' : '新增检测任务') +
      '</h3><p class="am-mode-note">选择指标后沿用指标库规则，无需填写阈值。新建后按设定时间检测，可勾选保存后立即执行一次；修改仅更新配置，保留原启用状态。</p><form class="am-form"><label style="grid-column:1/-1">选择指标<select name="metric"><option value="">请选择检测指标</option>' +
      catalog.map((n) => '<option value="' + esc(n) + '">' + esc(n) + '</option>').join('') +
      '</select><small>共 ' +
      catalog.length +
      ' 个指标名称；定义与规则在执行时查询。</small></label><section class="am-metric-info" data-metric-info aria-live="polite" style="grid-column:1/-1"><p>选择指标后展示指标库的度量规则与排除逻辑。</p></section><label>检测范围<select name="scope" required><option value="">请选择范围</option><option>品类</option><option>基地</option><option>品类*基地</option><option>大区</option><option>省区</option></select></label><label>执行频次<select name="frequency"><option value="daily">每天</option><option value="workdays">工作日（周一至周五）</option><option value="weekly">每周</option><option value="monthly">每月</option><option value="interval">间隔执行</option></select></label><div class="am-schedule"><div data-time class="am-time-row"><span class="am-field-label">执行时间</span><input name="time" type="hidden" value="09:00"><div class="am-time-fields"><label>小时<select name="timeHour">' +
      Array.from(
        { length: 24 },
        (_, i) =>
          '<option value="' +
          String(i).padStart(2, '0') +
          '">' +
          String(i).padStart(2, '0') +
          '</option>',
      ).join('') +
      '</select></label><span>:</span><label>分钟<select name="timeMinute">' +
      Array.from(
        { length: 60 },
        (_, i) =>
          '<option value="' +
          String(i).padStart(2, '0') +
          '">' +
          String(i).padStart(2, '0') +
          '</option>',
      ).join('') +
      '</select></label><small>上海时间</small></div></div><fieldset data-week hidden><legend>执行星期（可多选）</legend><label><input type="checkbox" name="days" value="1" checked>周一</label><label><input type="checkbox" name="days" value="2" >周二</label><label><input type="checkbox" name="days" value="3" >周三</label><label><input type="checkbox" name="days" value="4" >周四</label><label><input type="checkbox" name="days" value="5" >周五</label><label><input type="checkbox" name="days" value="6" >周六</label><label><input type="checkbox" name="days" value="7" >周日</label></fieldset><label data-month hidden>每月日期<select name="monthday"><option>1</option><option>2</option><option>3</option><option>4</option><option>5</option><option>6</option><option>7</option><option>8</option><option>9</option><option>10</option><option>11</option><option>12</option><option>13</option><option>14</option><option>15</option><option>16</option><option>17</option><option>18</option><option>19</option><option>20</option><option>21</option><option>22</option><option>23</option><option>24</option><option>25</option><option>26</option><option>27</option><option>28</option></select><small>仅支持 1—28 日，避免部分月份跳过。</small></label><label data-interval hidden>每隔小时数<input name="interval" type="number" min="1" max="23" step="1" value="2"></label><p data-preview aria-live="polite"></p></div><label style="grid-column:1/-1">任务说明<textarea name="description" required placeholder="描述关注的问题和期望的分析" style="min-height:90px"></textarea></label><label style="grid-column:1/-1">执行数字人<select name="agentPreset" required disabled><option value="">正在读取数字人…</option></select><small data-agent-status aria-live="polite"></small></label><fieldset style="grid-column:1/-1" class="am-people"><legend>消息通知</legend><div class="am-recipient-picker" data-recipient-picker><label for="am-recipient-search">飞书接收人</label><div class="am-recipient-control"><div class="am-recipient-chips" data-people-selected></div><input id="am-recipient-search" data-people-keyword type="search" maxlength="80" placeholder="输入姓名或 GEA 账号，搜索添加"></div><div class="am-recipient-menu" data-people-menu hidden><p data-people-status role="status"></p><div data-people-results></div><button type="button" data-people-more hidden>加载更多</button></div><small>可选择多位接收人，留空不发送通知。</small></div><label>通知频率<select name="notifyMode"><option value="repeat">重复通知</option><option value="once">通知一次</option></select><small>通知一次：首次异常发送。重复通知：异常触发后，每次检测都发送，恢复后也继续，直到手动关闭预警。</small></label></fieldset><p class="am-mode-note">时间按上海时区。统计口径由指标库提供；按指标库口径获取真实统计期间。</p>' +
      (!edit
        ? '<label style="grid-column:1/-1;display:flex;align-items:center;gap:8px;flex-direction:row"><input type="checkbox" name="runImmediately" style="width:16px;height:16px;margin:0;flex:none">保存后立即执行一次</label>'
        : '') +
      '<p class="am-validation" role="alert"></p><footer><button type="button" data-cancel>取消</button><button type="submit" class="am-primary">' +
      (edit ? '保存修改' : '保存检测任务') +
      '</button></footer></form>';
    let f = main.querySelector('form');
    if (edit) {
      f.elements.notifyMode.value = edit.notifyMode || 'repeat';
      const v = edit.schedule || { frequency: 'daily', time: '09:00' };
      f.elements.metric.value = edit.metric;
      f.elements.scope.value = edit.scope;
      f.elements.description.value = edit.description;
      for (const k of ['frequency', 'time', 'monthday', 'interval'])
        if (v[k] != null) f.elements[k].value = v[k];
      f.querySelectorAll('[name=days]').forEach(
        (n) => (n.checked = (v.days || []).map(String).includes(n.value)),
      );
    }
    const savedTime = (edit?.schedule?.time || '09:00').split(':');
    f.elements.timeHour.value = savedTime[0];
    f.elements.timeMinute.value = savedTime[1];
    f.querySelectorAll('select[name]:not([name=agentPreset])').forEach((select) =>
      enhanceSelect(select, select.name === 'metric'),
    );
    bindPersonnelSearch(f, api, edit);
    void bindAgentSelect(f, api, edit?.agentPreset);
    const updateSchedule = () => {
      f.elements.time.value = f.elements.timeHour.value + ':' + f.elements.timeMinute.value;
      const v = f.elements.frequency.value;
      main.querySelector('[data-week]').hidden = v !== 'weekly';
      main.querySelector('[data-month]').hidden = v !== 'monthly';
      main.querySelector('[data-interval]').hidden = v !== 'interval';
      main.querySelector('[data-time]').hidden = v === 'interval';
      f.elements.time.disabled = v === 'interval';
      f.elements.interval.disabled = v !== 'interval';
      main.querySelector('[data-preview]').textContent =
        monitorScheduleLabel({
          frequency: v,
          time: f.elements.time.value,
          days: [...f.querySelectorAll('[name=days]:checked')].map((x) => x.value),
          monthday: f.elements.monthday.value,
          interval: f.elements.interval.value,
        }) + ' · 上海时区';
    };
    f.addEventListener('change', updateSchedule);
    updateSchedule();
    let metadataSequence = 0;
    const loadMetric = async () => {
      const seq = ++metadataSequence;
      const metric = f.elements.metric.value;
      const box = f.querySelector('[data-metric-info]');
      if (!metric) {
        box.innerHTML = '<p>选择指标后展示指标库的度量规则与排除逻辑。</p>';
        return;
      }
      box.innerHTML = '<p>正在读取指标口径…</p>';
      try {
        const m = await api({ op: 'metric', metric });
        if (seq !== metadataSequence || !main.contains(f)) return;
        if (m.status !== 'available') {
          box.innerHTML = '<h4>指标口径待核实</h4><p>' + esc(m.message) + '</p>';
          return;
        }
        box.innerHTML =
          '<div class="am-metric-heading"><h4>指标库口径</h4><span>' +
          esc(m.version) +
          '</span></div><dl><div><dt>度量规则</dt><dd>' +
          esc(m.measureRules || '指标库未维护').replace(/\n/g, '<br>') +
          '</dd></div><div><dt>排除逻辑</dt><dd>' +
          esc(m.exclusions || '指标库未维护').replace(/\n/g, '<br>') +
          '</dd></div></dl><details><summary>计算公式、时间口径与来源</summary><dl><div><dt>计算公式</dt><dd>' +
          esc(m.formula || '未维护') +
          '</dd></div><div><dt>时间口径</dt><dd>' +
          esc(m.timeBasis || '未维护') +
          '</dd></div><div><dt>单位 / 方向</dt><dd>' +
          esc(m.unit) +
          ' / ' +
          esc(m.direction) +
          '</dd></div><div><dt>底层调整说明</dt><dd>' +
          esc(m.adjustmentNotes || '未维护') +
          '</dd></div></dl><p class="am-metric-source">来源：' +
          esc(m.source) +
          ' · ' +
          esc(m.sheet) +
          ' · 第 ' +
          esc(m.row) +
          ' 行</p></details>';
      } catch (error) {
        if (seq === metadataSequence)
          box.innerHTML = '<p>指标口径读取失败：' + esc(error.message) + '</p>';
      }
    };
    f.elements.metric.addEventListener('change', loadMetric);
    void loadMetric();
    main.querySelector('[data-cancel]').onclick = render;
    f.onsubmit = async (e) => {
      e.preventDefault();
      if (f.querySelector('[data-recipient-picker][aria-busy=true]')) {
        main.querySelector('.am-validation').textContent = '正在核验飞书接收人，请稍候再保存';
        return;
      }
      const data = new FormData(f);
      let m = Object.fromEntries(data);
      if (!m.agentPreset) {
        main.querySelector('.am-validation').textContent = '请选择可用的执行数字人';
        return;
      }
      m.days = [...f.querySelectorAll('[name=days]:checked')].map((x) => x.value).join(',');
      Object.keys(m).forEach((k) => (m[k] = m[k].trim()));
      m.notifyRecipients = data.getAll('notifyRecipients');
      m.runImmediately = !edit && f.elements.runImmediately.checked;
      if (!catalog.includes(m.metric)) {
        main.querySelector('.am-validation').textContent = '请从指标清单选择有效指标';
        return;
      }
      if (!m.scope || !m.description) {
        main.querySelector('.am-validation').textContent = '请选择检测范围并填写任务说明';
        return;
      }
      if (m.frequency === 'weekly' && !m.days) {
        main.querySelector('.am-validation').textContent = '请至少选择一个执行星期';
        return;
      }
      m.schedule = {
        frequency: m.frequency,
        time: m.time,
        days: m.days ? m.days.split(',') : [],
        monthday: m.monthday,
        interval: m.interval,
        timezone: 'Asia/Shanghai',
      };
      m.frequency = monitorScheduleLabel(m.schedule);
      if (
        monitors.some(
          (x) => x.id !== edit?.id && x.metric === m.metric && x.scope === m.scope && x.enabled,
        )
      ) {
        main.querySelector('.am-validation').textContent =
          '此指标和范围已有启用的检测任务，请在列表查看，避免重复检测。';
        return;
      }
      try {
        const button =
          f.querySelector('button[type=submit]') || f.querySelector('footer button:last-child');
        button.disabled = true;
        await api({ op: 'save', task: { ...m, id: edit?.id, requestKey } });
        tab = !edit && m.runImmediately ? 'logs' : 'monitors';
        runNotice = edit
          ? '检测任务已更新。'
          : m.runImmediately
            ? '检测任务已保存，已提交立即执行。'
            : '检测任务已保存，将按设定时间执行。';
        main.classList.remove('am-editing');
        await refresh();
        render();
      } catch (error) {
        main.querySelector('.am-validation').textContent = error.message;
        f.querySelectorAll('footer button').forEach((b) => (b.disabled = false));
      }
    };
    const submit = f.querySelector('footer button:last-child');
    submit.type = 'button';
    submit.onclick = (e) => f.onsubmit(e);
    f.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') {
        e.preventDefault();
        submit.click();
      }
    });
    f.querySelector('.am-select-trigger').focus();
  }
  function close() {
    clearTimeout(poll);
    mask.remove();
    document.removeEventListener('keydown', key);
  }
  function key(e) {
    if (document.querySelector('.audit-mask')) return;
    if (e.key === 'Escape' && !e.defaultPrevented) close();
    if (e.key === 'Tab') {
      const nodes = [...mask.querySelectorAll('button,input,select,textarea')].filter(
        (x) => !x.disabled && x.getClientRects().length,
      );
      if (!nodes.length) return;
      const first = nodes[0],
        last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }
  document.addEventListener('keydown', key);
  mask.querySelector('[data-close]').onclick = close;
  mask.onclick = (e) => {
    if (e.target === mask) close();
  };
  mask.querySelectorAll('[data-tab]').forEach(
    (b) =>
      (b.onclick = () => {
        tab = b.dataset.tab;
        render();
      }),
  );
  mask.querySelector('nav').onkeydown = (e) => {
    if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
      e.preventDefault();
      tab =
        e.key === 'Home'
          ? 'monitors'
          : e.key === 'End'
            ? 'logs'
            : tab === 'monitors'
              ? 'logs'
              : 'monitors';
      render();
      mask.querySelector('[data-tab="' + tab + '"]').focus();
    }
  };
  mask.querySelector('[data-close]').focus();
  await load();
};
