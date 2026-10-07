import {mountCustomerPrototype} from './application.js';
import {ready, publish, reportElements} from '../../business/shared/channel.js';

let snapshot;
let unregister = () => {};
let attached = true;
let publication = 0;
let publishing = false;
function syncStatus(message) {
  const status = document.getElementById('prototype-sync-status');
  if (status) status.textContent = message;
}
async function publishLatest() {
  publishing = true;
  try {
    let current;
    do {
      current = publication;
      const value = snapshot;
      try {
        // One in-flight context prevents older transport requests from overwriting newer facts.
        await publish(value);
        if (!attached) return;
        if (current !== publication) continue;
        unregister = reportElements('customer-prototype', [
          {id:'prototype:notice', role:'field', label:'客户库存原型', value:'开发中 · 模拟数据 · 无真实查询或写入'},
          ...value.rows.map(row=>({id:`customer:${row.code}`,role:'row',label:row.name,value:`模拟库存 ${row.quantity} 箱 · ${row.region}`})),
        ], undefined);
        syncStatus('');
      } catch (error) {
        if (!attached) return;
        if (current === publication)
          syncStatus(`原型上下文同步失败：${error.message.slice(0, 300)}。请重新进入，或调整筛选后重试。`);
      }
    } while (current !== publication);
  } finally {
    publishing = false;
  }
}
function report(value) {
  snapshot = {...value, source:'mock', development:true, dataAuthority:'local-prototype', pageId:'inventory-customer', capturedAt:new Date().toISOString()};
  if (!attached) return;
  unregister();
  publication++;
  syncStatus('原型上下文同步中…');
  if (!publishing) void publishLatest();
}
ready.then(() => mountCustomerPrototype(report)).catch(error => {
  document.getElementById('app').textContent = `原型连接失败：${error.message}，请重新进入。`;
});
window.addEventListener('gea-session-changed', () => {attached = true; if(snapshot) report(snapshot);});
window.addEventListener('gea-identity-changed', () => {attached = false; publication++; unregister(); syncStatus('页面连接已变化，请重新进入。');});
window.addEventListener('pagehide', () => {attached = false; publication++; unregister();}, {once:true});
