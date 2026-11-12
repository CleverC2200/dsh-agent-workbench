export function openWarningDetail(item, context, onAnalyze, onCloseEvent) {
  const esc = (v) =>
    String(v ?? '—').replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
    );
  const _read = (k) => {
    try {
      return JSON.parse(localStorage.getItem(k) || '[]');
    } catch {
      return [];
    }
  };
  const task = item.task;
  const history = item.history || [];
  const previous = document.activeElement;
  const mask = document.createElement('div');
  mask.className = 'wd-mask';
  const field = (label, value) => `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`;
  const section = (title, body) => `<section><h3>${title}</h3>${body}</section>`;
  const grid = (fields) => `<dl class="wd-grid">${fields.map((x) => field(...x)).join('')}</dl>`;
  mask.innerHTML = `<aside class="wd-panel" role="dialog" aria-modal="true" aria-labelledby="wd-title"><header><div><small>事件预警</small><h2 id="wd-title">预警详情</h2><p>${esc(item.scope)} · ${esc(item.metric)}</p></div><button data-close aria-label="关闭预警详情">×</button></header><main>
 ${section(
   '预警概况',
   grid([
     ['异常对象', item.scope],
     ['风险等级', item.level || '预警'],
     ['预警状态', item.eventStatus || '当前异常'],
     ['检测范围', task?.scope || item.scopeType || '品类'],
     ['统计期间', item.period || context.period],
     ['数据截止', item.cutoff || context.cutoff],
   ]),
 )}
 ${section(
   '当前检测结果',
   grid([
     ['当前指标', item.metric],
     ['目标偏差', item.gap],
     ['目标值', item.target || '见下方触发规则'],
     ['变化趋势', item.trend],
   ]),
 )}
 ${section(
   '触发依据',
   grid([
     ['命中条件', item.range],
     ['规则版本', item.rule?.version || '待接入指标库规则版本'],
   ]),
 )}
 ${section(
   '持续情况',
   grid([
     ['首次触发', item.first || '待接入事件记录'],
     ['最近检测', item.lastChecked || '待接入执行记录'],
     ['结束时间', item.closedAt || '尚未关闭'],
     ['异常数据次数', item.hits ?? '待接入'],
     ['累计检查次数', item.checkCount ?? item.history?.length ?? '待接入'],
     ['持续时间', '待接入事件时间记录'],
   ]),
 )}
 ${section('变化趋势', history.length ? `<div class="wd-trend">${history.map((h, _i) => `<div><span>${esc(h.at)} · 截止 ${esc(h.cutoff || '—')}</span><strong>${esc(h.value)}</strong><small>${esc(h.status)}</small></div>`).join('')}</div>` : '<p class="wd-empty">暂无历史检测点，接入执行记录后展示指标趋势与风险等级变化。</p>')}
 ${section('分析说明', `<div class="wd-analysis"><b>分析线索 · 待核实</b><p>${esc(item.diagnosis)}</p></div>`)}
 ${section('检测历史', history.length ? `<div class="wd-table"><table><thead><tr><th>执行时间 / 数据截止</th><th>指标值</th><th>状态</th><th>执行结果</th></tr></thead><tbody>${history.map((h) => `<tr><td>${esc(h.at)}<small>${esc(h.cutoff || h.at)}</small></td><td>${esc(h.value)}</td><td>${esc(h.status)}</td><td>${esc(h.result)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="wd-empty">暂无可追溯的检测历史。现有汇总风险不补造历史记录。</p>')}
 ${section(
   '恢复条件',
   grid([
     [
       '恢复规则',
       item.rule
         ? `指标恢复至健康线${{ gt: '>', gte: '≥', lt: '<', lte: '≤' }[item.rule.healthyOperator] || '待确认'}${item.rule.healthy}${item.unit}`
         : '沿用指标库恢复条件，待接入',
     ],
     [
       '当前恢复结果',
       item.eventStatus === '已恢复' || item.closedRisk === '已恢复'
         ? '已恢复'
         : item.recoveredAt
           ? '曾恢复'
           : '尚无恢复判定记录',
     ],
     ['恢复时间', item.recoveredAt || '—'],
   ]),
 )}
 ${section('飞书通知', (item.notifications || []).length ? `<div class="wd-table"><table><thead><tr><th>接收人 / 时间</th><th>发送状态</th><th>消息回执 / 失败原因</th></tr></thead><tbody>${item.notifications.map((n) => `<tr><td>${esc(n.recipientName)}<small>${esc(n.sentAt || n.at)}</small></td><td>${esc(n.status)}</td><td>${esc(n.messageId || n.error || '等待发送')}</td></tr>`).join('')}</tbody></table></div>` : '<p class="wd-empty">暂无飞书发送记录；仅在配置接收账号并启用后发送。</p>')}
 ${section(
   '来源检测任务',
   task
     ? grid([
         ['任务名称', task.name],
         ['执行频次', task.frequency],
         ['任务状态', task.enabled ? '已启用' : '已停用'],
         ['任务说明', task.description],
       ])
     : '<p class="wd-empty">来自产销协同看板风险汇总，尚未关联自定义检测任务。</p>',
 )}
 </main><footer>${onCloseEvent ? '<span role="status" data-event-status></span><button data-close-event>关闭预警</button>' : ''}<button data-close>关闭</button><button class="wd-primary" data-analyze>AI分析</button></footer></aside>`;
  const close = () => {
    mask.remove();
    document.removeEventListener('keydown', key);
    previous?.focus();
  };
  const key = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
    if (e.key === 'Tab') {
      const n = [...mask.querySelectorAll('button:not(:disabled)')];
      const first = n[0],
        last = n.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };
  const closeEvent = mask.querySelector('[data-close-event]');
  if (closeEvent)
    closeEvent.onclick = async () => {
      const status = mask.querySelector('[data-event-status]');
      closeEvent.disabled = true;
      status.textContent = '';
      try {
        await onCloseEvent();
        if (mask.isConnected) close();
      } catch {
        status.textContent = '关闭失败，请稍后重试';
        closeEvent.disabled = false;
      }
    };
  mask.querySelectorAll('[data-close]').forEach((b) => (b.onclick = close));
  mask.querySelector('[data-analyze]').onclick = () => {
    close();
    onAnalyze();
  };
  mask.onclick = (e) => {
    if (e.target === mask) close();
  };
  document.body.append(mask);
  document.addEventListener('keydown', key);
  mask.querySelector('[data-close]').focus();
}
