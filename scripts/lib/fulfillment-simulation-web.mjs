/** Desktop-only local Feishu acceptance UI. No business credentials or business-write APIs. */
export const simulationWebHtml = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>订单销售确认 · 模拟验收</title>
<style>
*{box-sizing:border-box}body{margin:0;font:15px/1.6 system-ui,sans-serif;color:#1d2939;background:#f5f6f8;padding:24px}main{max-width:680px;margin:auto}h1{font-size:22px}h2{font-size:20px;margin:0}p{white-space:pre-line}.notice{color:#9a5900;background:#fff7e6;padding:10px 14px;border-radius:8px}.actions{display:flex;gap:12px;justify-content:flex-end;flex-wrap:wrap}button,select{font:inherit;border:1px solid #d0d5dd;border-radius:7px;padding:9px 18px;background:white;cursor:pointer}button.primary{background:#e60023;border-color:#e60023;color:white}button:disabled{opacity:.5;cursor:default}select{width:100%;margin:12px 0 24px}dialog{border:0;border-radius:12px;box-shadow:0 12px 50px #0003;padding:0;width:min(620px,calc(100vw - 32px));max-height:90vh}dialog::backdrop{background:#10182866}.head{padding:20px 24px;border-bottom:1px solid #eaecf0}.body{padding:20px 24px;max-height:58vh;overflow:auto}.foot{padding:16px 24px;border-top:1px solid #eaecf0;background:white}article{border-bottom:1px solid #eaecf0;padding:12px 0}article strong{display:block}.muted{color:#667085;font-size:13px}#status{white-space:pre-line}#error{color:#d92d20}label{display:block}
</style></head><body><main><h1>订单销售确认</h1><p class="notice">仅模拟验收，不触发真实发货、改单或定时群消息。</p><p id="order"></p><p id="status" role="status">正在读取模拟订单…</p><p id="error" role="alert"></p><div class="actions"><button id="details">查看明细</button><button id="defer">暂缓发货</button><button id="confirm" class="primary">确认发货</button></div></main>
<dialog id="modal" aria-labelledby="title"><div class="head"><h2 id="title"></h2></div><div class="body" id="content"></div><div class="foot actions"><button id="cancel">取消</button><button id="submit" class="primary">确认</button></div></dialog>
<script>
const token=decodeURIComponent(location.hash.slice(1));history.replaceState(null,'',location.pathname+location.search);
const $=id=>document.getElementById(id);let snapshot,action,busy=false;
async function api(method,body){const response=await fetch('/simulation/api',{method,headers:{'X-Simulation-Token':token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});const data=await response.json();if(!response.ok)throw Error(data.error||'模拟服务不可用');return data;}
function render(){const s=snapshot.scope;$('order').textContent='订单号：'+s.orderNo+'\\n客户：'+s.customer+'\\n满足率：'+s.rate+'% · 总数量：'+s.quantity+' '+s.unit;$('status').textContent=snapshot.state.status+'\\n'+(snapshot.state.records.at(-1)?.summary||'尚未操作');$('confirm').disabled=!(s.rate>=90&&s.rate<=100);}
function text(tag,value,parent=$('content')){const el=document.createElement(tag);el.textContent=value;parent.append(el);return el;}
function open(kind){if(!snapshot||busy)return;action=kind;$('content').replaceChildren();$('submit').hidden=kind==='details';$('submit').disabled=false;$('cancel').textContent=kind==='details'?'返回':'取消';
if(kind==='confirm'){$('title').textContent='确认开单？';text('p','订单满足率已达到90%，是否模拟确认发货？');text('p','仅保存模拟结果，不触发真实发货或改单。');}
if(kind==='defer'){$('title').textContent='暂缓发货';const label=text('label','暂缓天数');label.htmlFor='days';const select=document.createElement('select');select.id='days';select.required=true;select.add(new Option('请选择 1—7 天',''));for(let i=1;i<=7;i++)select.add(new Option(i+' 天',String(i)));$('content').append(select);$('submit').disabled=true;select.onchange=()=>{$('submit').disabled=!select.value};text('p','确认后保存模拟暂缓截止时间，并停止模拟提醒。');}
if(kind==='details'){$('title').textContent='订单明细';for(const line of snapshot.scope.lines||[]){const item=document.createElement('article');$('content').append(item);text('strong',line.name+' / '+line.sku,item);text('p','订货：'+line.quantity+' '+line.unit+' · 缺货：'+line.shortage+' '+line.unit,item);text('p','单价：'+(line.price??'—'),item);}text('p','提货点：'+(snapshot.scope.pickup??'—')+'\\n经销商：'+snapshot.scope.customer+'\\n车型：'+(snapshot.scope.vehicle??'—'));text('p','数量沿用页面原单位，未提供的信息显示横线。').className='muted';}
$('modal').showModal();}
for(const kind of ['confirm','defer','details'])$(kind).onclick=()=>open(kind);
$('cancel').onclick=()=>{if(!busy)$('modal').close()};$('modal').addEventListener('cancel',event=>{if(busy)event.preventDefault()});
$('submit').onclick=async()=>{if(busy||!['confirm','defer'].includes(action))return;const days=action==='defer'?Number($('days').value):undefined;if(action==='defer'&&(!Number.isInteger(days)||days<1||days>7))return;busy=true;$('submit').disabled=true;$('cancel').disabled=true;$('error').textContent='';try{snapshot=await api('POST',{action,days,eventId:crypto.randomUUID()});render();$('modal').close();}catch(error){$('error').textContent=error.message;}finally{busy=false;$('submit').disabled=false;$('cancel').disabled=false;}};
api('GET').then(data=>{snapshot=data;render();const view=new URLSearchParams(location.search).get('view');if(['confirm','defer','details'].includes(view))open(view)}).catch(error=>{$('error').textContent=error.message;$('status').textContent='未读取到模拟订单';});
</script></body></html>`;

export function simulationWebSnapshot(scope, state) {
  const { orderNo, customerCode, customer, base, rate, quantity, unit, lines, pickup, vehicle } =
    scope;
  return {
    scope: { orderNo, customerCode, customer, base, rate, quantity, unit, lines, pickup, vehicle },
    state,
  };
}
