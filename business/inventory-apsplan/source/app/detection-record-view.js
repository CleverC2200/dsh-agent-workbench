import {call,ask} from '../../../shared/channel.js';
import {openWarningDetail} from './warning-detail.js';
const esc=v=>String(v??'—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date=v=>v?new Date(v).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false}):'—';
function modal(title,note){const previous=document.activeElement,mask=document.createElement('div');mask.className='am-mask audit-mask';mask.innerHTML=`<section class="am-panel audit-panel" role="dialog" aria-modal="true" aria-label="${esc(title)}"><header><div><small>工作台运营</small><h2>${esc(title)}</h2></div><button data-close aria-label="关闭${esc(title)}">×</button></header><p class="am-notice">${esc(note)}</p><main></main></section>`;const close=()=>{mask.remove();document.removeEventListener('keydown',key,true);previous?.focus()};const key=e=>{if(document.querySelector('.wd-mask'))return;if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();close()}if(e.key==='Tab'){const nodes=[...mask.querySelectorAll('button,input')].filter(x=>!x.disabled&&x.getClientRects().length);const first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}};mask.querySelector('[data-close]').onclick=close;mask.onclick=e=>{if(e.target===mask)close()};document.addEventListener('keydown',key,true);const oldClose=close;document.body.append(mask);mask.querySelector('[data-close]').focus();return{mask,main:mask.querySelector('main'),close:()=>{document.removeEventListener('keydown',key,true);oldClose()}}}
export function showRunContext(run){const view=modal('AI执行上下文','展示本次检测实际提交的业务上下文与完整提示词；GEA宿主自动加载的系统提示词和工具定义不在此记录中。');view.main.innerHTML=`<dl class="audit-summary"><div><dt>检测任务</dt><dd>${esc(run.name)}</dd></div><div><dt>提交时间</dt><dd>${esc(date(run.at))}</dd></div><div><dt>执行状态</dt><dd>${esc(run.status)}</dd></div><div><dt>执行编号</dt><dd>${esc(run.id)}</dd></div></dl>${run.context||run.prompt?`<h3>任务上下文</h3><pre class="audit-pre">${esc(JSON.stringify(run.context||{},null,2))}</pre><h3>实际提交提示词</h3><pre class="audit-pre">${esc(run.prompt||'本次未保存提示词')}</pre>`:'<div class="am-empty">该执行早于上下文留存功能，未保存原始提交内容，不补造历史上下文。</div>'}`;}
export function describeRunResult(run) {
  if (run.status !== '成功') return run.result || '';
  const legacyCounts = /新增\s*(\d+)\s*[，,]\s*更新\s*(\d+)\s*[，,]\s*恢复\s*(\d+)\s*[，,]\s*数据未更新\s*(\d+)/.exec(run.result || '');
  const labels = [
    ['created', '新建预警卡片'],
    ['updated', '更新已有预警'],
    ['recovered', '恢复健康，待关闭'],
    ['unchanged', '数据截止未变化，保留原预警'],
  ];
  const actions = labels.flatMap(([key, label], index) => {
    const count = run[key] ?? Number(legacyCounts?.[index + 1]);
    return count > 0 ? [`${label} ${count} 条`] : [];
  });
  if (actions.length) return actions.join('；');
  return legacyCounts || Number.isInteger(run.created)
    ? '本次未新建、更新或恢复预警'
    : run.result || '检测完成';
}

function detectionDetails(run) {
  if (run.status !== '成功') return '';
  const rows = run.response?.results;
  if (!Array.isArray(rows) || !rows.length) {
    return '<p class="audit-pre">本次记录未留存逐对象检测明细。</p>';
  }
  const orderedRows = [...rows].sort((a, b) => Number(a.status === '健康') - Number(b.status === '健康'));
  const healthyCount = rows.filter(row => row.status === '健康').length;
  return `<h3>AI 检测明细</h3>
    <p>共检测 ${rows.length} 个对象，异常 ${rows.length - healthyCount} 个，健康 ${healthyCount} 个。</p>
    <ul class="audit-detection-results">${orderedRows.map(row => {
      const rule = row.rule || run.response.rule;
      const operator = {gt: '>', gte: '≥', lt: '<', lte: '≤'}[rule?.healthyOperator];
      const unit = row.unit || '';
      const healthLine = operator && Number.isFinite(rule.healthy)
        ? ` · 健康条件 ${operator} ${rule.healthy}${unit}`
        : '';
      return `<li>
        <strong>${esc(row.objectName || row.objectKey)} · ${esc(row.status)}</strong>
        <p>检测值 ${esc(row.value)}${esc(unit)}${esc(healthLine)}</p>
        <p>统计期间 ${esc(row.period)} · 数据截止 ${esc(row.cutoffNote || row.cutoff)}</p>
        ${row.analysis ? `<p><b>AI 分析</b> ${esc(row.analysis)}</p>` : ''}
        ${row.evidence ? `<p><b>检测依据</b> ${esc(row.evidence)}</p>` : ''}
      </li>`;
    }).join('')}</ul>`;
}

function warningChanges(run, events) {
  const changes = events.flatMap(event =>
    (event.history || []).filter(entry => entry.runId === run.id && entry.result).map(entry =>
      `<li><strong>${esc(event.scope)}</strong><p>${esc(entry.result)} · ${esc(entry.value)}</p></li>`,
    ),
  );
  return changes.length ? `<h3>本次涉及的预警对象</h3><ul class="audit-detection-results">${changes.join('')}</ul>` : '';
}

export function showRunResult(run, events = []) {
  const view = modal('执行结果', '查看本次预警处理和 AI 逐对象检测明细。');
  view.main.innerHTML = `<dl class="audit-summary">
    <div><dt>检测任务</dt><dd>${esc(run.name)}</dd></div>
    <div><dt>执行时间</dt><dd>${esc(date(run.at))}</dd></div>
    <div><dt>执行状态</dt><dd>${esc(run.status)}</dd></div>
    </dl>
    <h3>${run.status === '失败' ? '失败原因' : '预警处理结果'}</h3>
    <pre class="audit-pre">${esc(describeRunResult(run) || '暂无处理结果')}</pre>
    ${run.status === '成功' ? warningChanges(run, events) : ''}
    ${detectionDetails(run)}`;
}
export function combineWarnings(_board,events,_range){return events.filter(e=>e.eventStatus==='活跃'||e.eventStatus==='已恢复'&&e.pendingClose===true).sort((a,b)=>(a.level==='严重'?0:1)-(b.level==='严重'?0:1)||String(b.lastChecked||b.first||'').localeCompare(String(a.lastChecked||a.first||'')));}
export async function openWarningList(board,context){const view=modal('预警列表','当前预警按严重优先、最近检测优先展示；已恢复事件待用户关闭后进入历史。仅展示检测任务生成的预警；合并留痕默认隐藏。');let state,tab='active',query='',showMerged=false,page=0;view.main.innerHTML='<p class="am-empty">正在读取预警记录…</p>';try{state=await call('detection',{op:'list'})}catch(e){view.main.innerHTML=`<p class="am-empty">${esc(e.message)}</p>`;return}
function draw(){const current=combineWarnings(board,state.events,context.cutoff);const history=state.events.filter(e=>e.eventStatus==='已关闭'||e.eventStatus==='已恢复'&&!e.pendingClose||showMerged&&e.eventStatus==='已合并').sort((a,b)=>String(b.recoveredAt||b.lastChecked||b.first).localeCompare(String(a.recoveredAt||a.lastChecked||a.first)));const all=(tab==='active'?current:history).filter(e=>(e.scope+' '+e.metric+' '+(e.period||'')).toLowerCase().includes(query.toLowerCase()));const rows=all.slice(page*10,page*10+10);view.main.innerHTML=`<div class="audit-tabs"><button data-tab="active" class="${tab==='active'?'active':''}">当前预警 <b>${current.length}</b></button><button data-tab="history" class="${tab==='history'?'active':''}">历史预警</button></div><div class="audit-tools"><input type="search" placeholder="搜索指标、对象或统计期间" aria-label="搜索预警" value="${esc(query)}">${tab==='history'?`<label><input type="checkbox" data-merged ${showMerged?'checked':''}>显示合并留痕</label>`:''}<span>共 ${all.length} 条</span></div><div class="am-table audit-event-table"><table><thead><tr><th>异常对象 / 指标</th><th>检测范围 / 期间</th><th>风险 / 状态</th><th>来源</th><th>最近检测 / 恢复时间</th><th>操作</th></tr></thead><tbody>${rows.map(e=>`<tr><td><strong>${esc(e.scope)}</strong><small>${esc(e.metric)}</small></td><td>${esc(e.scopeType)}<small>${esc(e.period)}</small></td><td><span class="audit-status ${e.level==='严重'?'risk':e.level==='健康'?'healthy':'warning'}">${esc(e.level||'预警')}</span><small>${esc(e.isSnapshot?'即时风险':e.eventStatus)}</small></td><td>${esc(e.source||'指标检测')}</td><td>${esc(date(e.recoveredAt||e.lastChecked||e.first))}</td><td><button data-detail="${esc(e.id)}">查看详情</button></td></tr>`).join('')}</tbody></table>${rows.length?'':`<div class="am-empty">${tab==='active'?'暂无活跃预警。检测到异常后将在这里展示。':'暂无已关闭的历史预警。失败执行请在“执行记录”中查看。'}</div>`}</div><footer class="audit-pagination"><span>第 ${page+1} / ${Math.max(1,Math.ceil(all.length/10))} 页</span><button data-prev ${page===0?'disabled':''}>上一页</button><button data-next ${(page+1)*10>=all.length?'disabled':''}>下一页</button></footer>`;view.main.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{tab=b.dataset.tab;page=0;draw()});const search=view.main.querySelector('[type=search]');search.oninput=()=>{query=search.value;page=0;const pos=search.selectionStart;draw();const next=view.main.querySelector('[type=search]');next.focus();next.setSelectionRange(pos,pos)};view.main.querySelector('[data-merged]')?.addEventListener('change',e=>{showMerged=e.target.checked;page=0;draw()});view.main.querySelector('[data-prev]').onclick=()=>{page--;draw()};view.main.querySelector('[data-next]').onclick=()=>{page++;draw()};view.main.querySelectorAll('[data-detail]').forEach(b=>b.onclick=()=>{const row=all.find(e=>e.id===b.dataset.detail);openWarningDetail(row,context,()=>{void ask(`请分析预警：${row.scope}，${row.metric}，统计期间${row.period}，数据截止${row.cutoff||context.cutoff}。依据：${row.range}；来源：${row.evidence}。区分事实与待核查原因。`).catch(()=>{})})});}draw();}
