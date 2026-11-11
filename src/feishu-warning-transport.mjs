import {createHash,randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
const ROOT='D:/work_project/gea-xxl-job-test';
export function resolveNotificationRecipient(config, recipient = 'self') {
  if (config.enabled !== true || recipient === 'none') return null;
  let resolved = config;
  if (recipient.startsWith('gea:')) {
    const username = recipient.slice(4);
    const mappings = config.recipientMappings;
    if (!username || !mappings || !Object.hasOwn(mappings, username)) return null;
    const mapping = mappings[username];
    if (!mapping || typeof mapping !== 'object') return null;
    // Require an explicit address for this account, never inherit the default recipient.
    resolved = { ...config, receiveId: mapping.receiveId, receiveIdType: mapping.receiveIdType, recipientName: mapping.recipientName };
  }
  if (!['open_id','user_id','email'].includes(resolved.receiveIdType) ||
      typeof resolved.receiveId !== 'string' || !resolved.receiveId.trim() || !resolved.recipientName ||
      resolved.receiveId.startsWith('cli_') ||
      (resolved.receiveIdType === 'open_id' && !/^ou_[a-zA-Z0-9]+$/.test(resolved.receiveId))) {
    throw Error('飞书接收账号映射配置不完整');
  }
  return resolved;
}
export async function notificationConfig(recipient = 'self') {
  try {
    const config = JSON.parse(await readFile(ROOT+'/config/feishu-warning.json','utf8'));
    if (config.enabled === true && recipient.startsWith('gea:')) {
      const identity = await lookupFeishuRecipient(recipient.slice(4), config.credentialProfile || 'default');
      return { ...config, ...identity };
    }
    return resolveNotificationRecipient(config, recipient);
  } catch(error) {
    if(error.code==='ENOENT') return null;
    throw error;
  }
}
function lookupFeishuRecipient(username, credentialProfile) {
  return new Promise((resolve, reject) => {
    const child = spawn('python', [ROOT + '/resolve-feishu-recipient.py'], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, PYTHONUTF8: '1' } });
    let output = '';
    const timer = setTimeout(() => { child.kill(); reject(Error('飞书身份查询超时，请重试')); }, 40000);
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', () => {});
    child.stdin.on('error', () => {});
    child.on('error', () => { clearTimeout(timer); reject(Error('飞书身份查询服务未能启动')); });
    child.on('close', () => {
      clearTimeout(timer);
      try {
        const result = JSON.parse(output);
        if (!result.ok) return reject(Error(result.error || '飞书身份查询失败'));
        if (result.receiveIdType !== 'open_id' || !/^ou_[A-Za-z0-9]+$/.test(result.receiveId) || !result.recipientName) throw Error();
        resolve({ receiveId: result.receiveId, receiveIdType: result.receiveIdType, recipientName: result.recipientName });
      } catch { reject(Error('飞书身份查询返回无效结果')); }
    });
    child.stdin.end(JSON.stringify({ username, credentialProfile }));
  });
}
const text=v=>String(v??'—').replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
export function warningCard(e,kind,senderName='未记录',runNote=''){return {config:{wide_screen_mode:true},header:{template:kind==='recovered'||e.level==='健康'?'green':e.level==='严重'?'red':'orange',title:{tag:'plain_text',content:`${kind==='recovered'?'预警已恢复':kind==='escalated'?'预警升级':kind==='test'?'预警通知联调测试':kind==='feedback'?'预警检测反馈':'指标预警'}｜${e.scope} · ${e.metricName}`}},elements:[{tag:'div',fields:[['预警设置人',senderName],['当前指标',e.metric],['风险 / 状态',e.level+' / '+e.eventStatus],['检测范围',e.scopeType],['统计期间',e.period],['数据截止',e.cutoff],['首次触发',e.first]].map(([k,v])=>({is_short:true,text:{tag:'lark_md',content:`**${k}**\n${text(v)}`}}))},{tag:'div',text:{tag:'lark_md',content:`${runNote?text(runNote)+'\n\n':''}**触发规则**\n${text(e.range)}\n\n**变化趋势**\n${text(e.trend)}${e.history?.at(-1)?.result?.includes('数据截止未变化')?'（数据尚未更新）':''}\n\n**分析线索 · 待核实**\n${text(String(e.diagnosis||'暂无分析').slice(0,1800))}`}},{tag:'note',elements:[{tag:'plain_text',content:`${kind==='test'?'本条为真实消息联调测试；':''}预警编号：${e.id}。请在 GEA 工作台查看完整数据依据。本消息不代表已创建处置任务。`}]}]}}
export function enqueueNotification(event,kind,runId,config){event.notifications??=[];const key=[config.credentialProfile||'default',event.id,kind,runId,config.receiveIdType,config.receiveId].join('|');const old=event.notifications.find(n=>n.key===key);if(old)return old;const job={id:'delivery-'+randomUUID(),key,uuid:createHash('sha256').update(key).digest('hex').slice(0,32),eventId:event.id,runId,kind,credentialProfile:config.credentialProfile||'default',status:'待发送',at:new Date().toISOString(),recipientName:config.recipientName,receiveId:config.receiveId,receiveIdType:config.receiveIdType,card:warningCard(event,kind,config.senderName,config.runNote)};event.notifications.push(job);return job}
export function enqueueChanges(state, before, run, config, task) {
  if (!config) return;
  const recipients = Array.isArray(config) ? config : [config];
  const senderName = task?.definedBy || '未记录';
  for (const event of state.events) {
    if (run.taskId && event.monitorId !== run.taskId) continue;
    const active = event.eventStatus === '活跃';
    const recovered = event.eventStatus === '已恢复' && event.pendingClose === true;
    if (!active && !recovered) continue;
    const observation = event.history?.find(item => item.runId === run.id);
    const old = before.get(event.id);
    if (task?.notifyMode === 'once') {
      if (!active || !observation || observation.status === '健康') continue;
      // A send with an uncertain receipt may already have reached the recipient.
      for (const recipient of recipients) {
        const notified = event.notifications?.some(job => job.kind !== 'test' && job.status !== '发送失败' &&
          job.receiveId === recipient.receiveId && job.receiveIdType === recipient.receiveIdType &&
          (job.credentialProfile || 'default') === (recipient.credentialProfile || 'default'));
        if (!notified) enqueueNotification(event, 'new', run.id, { ...recipient, senderName });
      }
      continue;
    }
    if (!observation && !run.taskId) continue;
    const kind = !old && active ? 'new'
      : active && old?.level !== '严重' && event.level === '严重' ? 'escalated'
      : recovered && old?.eventStatus === '活跃' ? 'recovered' : 'feedback';
    const runNote = !observation ? '本次检测未返回该预警的有效观测，以下为最近一次记录。'
      : recovered ? '指标已恢复，预警待关闭。' : '';
    for (const recipient of recipients) {
      enqueueNotification(event, kind, run.id, { ...recipient, senderName, runNote });
    }
  }
}
export async function sendPersonalNotification(job){return new Promise((resolve,reject)=>{const p=spawn('python',[ROOT+'/send-feishu-warning.py'],{windowsHide:true,stdio:['pipe','pipe','pipe'],env:{...process.env,PYTHONUTF8:'1'}});let out='';const timer=setTimeout(()=>{p.kill();reject(Object.assign(Error('飞书发送超时，结果待核实，不自动重发'),{unknown:true}))},45000);p.stdout.on('data',d=>out+=d);p.stderr.on('data',()=>{});p.on('error',()=>{clearTimeout(timer);reject(Object.assign(Error('飞书发送进程未能启动'),{unknown:false}))});p.on('close',()=>{clearTimeout(timer);try{const v=JSON.parse(out);if(v.ok&&/^om_/.test(v.messageId))resolve(v);else reject(Object.assign(Error(v.error||'飞书发送未返回有效回执'),{unknown:v.unknown!==false,providerCode:v.code}))}catch{reject(Object.assign(Error('飞书发送回执无法解析，需核实'),{unknown:true}))}});p.stdin.end(JSON.stringify({credentialProfile:job.credentialProfile||'default',receiveId:job.receiveId,receiveIdType:job.receiveIdType,uuid:job.uuid,card:job.card}))})}
export async function drainNotifications({state,save,locked,send=sendPersonalNotification}){for(const event of state.events)for(const job of event.notifications||[]){if(job.status!=='待发送')continue;const claimed=await locked(async()=>{
  if(job.status!=='待发送')return false;
  if(job.kind!=='test'&&(event.eventStatus==='已关闭'||event.eventStatus==='已合并')){
    job.status='已取消';await save();return false;
  }
  job.status='发送中';job.attemptedAt=new Date().toISOString();await save();return true;
});if(!claimed)continue;try{const receipt=await send(job);await locked(async()=>{job.status='已发送';job.messageId=receipt.messageId;job.sentAt=new Date().toISOString();await save()})}catch(e){await locked(async()=>{job.status=e.unknown?'待核实':'发送失败';job.error=e.message;job.providerCode=e.providerCode;await save()})}}}
