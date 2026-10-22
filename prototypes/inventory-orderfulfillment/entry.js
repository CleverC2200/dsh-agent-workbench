import { createPageViewState } from '../../business/shared/view-state.js';
import { quotePage } from '../../src/page-interaction/quote.ts';
const view = createPageViewState('inventory-orderfulfillment');
let restoringView = false;
view.subscribe((state) => {
  restoringView = true;
  if (state.order !== undefined) orderNumberSearch.value = state.order;
  if (state.customer !== undefined) customerSearch.value = state.customer;
  if (state.warehouse !== undefined) {
    selectedWarehouse = state.warehouse;
    warehouseSearch.value = state.warehouse;
  }
  if (state.status !== undefined) omsStatusFilter.value = state.status;
  if (state.size !== undefined) ordersPageSize.value = String(state.size);
  if (state.page !== undefined) currentOrderPage = state.page;
  filterFulfillmentRows();
  for (const [field, id] of Object.entries({
    order: 'deliveryOrderNumberQuery',
    customer: 'deliveryCustomerQuery',
    warehouse: 'deliveryBaseQuery',
    status: 'deliveryStatusQuery',
  })) {
    if (state[field] !== undefined) {
      const input = document.getElementById(id);
      input.value = state[field];
      input.dispatchEvent(
        new Event(input.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }),
      );
    }
  }
  restoringView = false;
});
import { ready, publish, reportElements, action } from '../../business/shared/channel.js';

const status = document.getElementById('prototypeStatus');
let connected = false;
let revision = 0;
let publication = Promise.resolve();
let withdraw = () => {};

function withdrawReferences() {
  withdraw();
  withdraw = () => {};
}

/** Publish application state directly; only the committed current page is referenceable. */
function sync() {
  if (!restoringView) {
    const state = fulfillmentSnapshot();
    view.update({ ...state.filters, page: state.page.number, size: state.page.size });
  }
  if (!connected) return;
  const current = ++revision;
  withdrawReferences();
  status.textContent = '模拟数据 · 正在同步当前页引用';
  publication = publication.then(async () => {
    if (!connected || current !== revision) return;
    try {
      const state = fulfillmentSnapshot();
      await publish(state);
      if (!connected || current !== revision) return;
      const rows = state.rows.map((row) => ({
        id: 'order:' + row.sourceOrder,
        role: 'row',
        label: '模拟订单 ' + row.sourceOrder + ' · ' + row.customer,
        value: row.status + ' · ' + row.goods + ' · ' + row.warehouse + ' · ' + row.attention,
      }));
      withdraw = reportElements('orders', [
        {
          id: 'summary:orders',
          role: 'field',
          label: `完整模拟集合汇总（${state.summary.received}条，非真实数据）`,
          value: `演示履约${state.summary.received} · 未开${state.summary.unopened} · 超时${state.summary.overdue} · 预警${state.summary.warning} · 终缺${state.summary.shortage}件`,
        },
        {
          id: 'table:orders',
          role: 'collection',
          label: '当前分页模拟订单',
          value: `第${state.page.number}/${state.page.count}页 · 命中${state.page.matched}条 · 当前${state.page.visible}条`,
          members: rows.map((row) => row.id),
        },
        ...rows,
      ]);
      status.textContent = '模拟数据 · 当前页引用已同步 · 未连接真实履约系统';
    } catch (error) {
      if (!connected || current !== revision) return;
      status.textContent = '模拟数据 · 当前页引用同步失败，请重新打开页面：' + error.message;
    }
  });
  return publication;
}

window.addEventListener('fulfillment-state-changed', sync);
let syncScheduled = false;
function schedulePresentationSync(event) {
  if (!event.target.closest('#fulfillmentView, #salesConfirmOverlay, #confirmationHistoryOverlay'))
    return;
  if (syncScheduled) return;
  syncScheduled = true;
  queueMicrotask(() => {
    syncScheduled = false;
    sync();
  });
}
for (const type of ['input', 'change', 'click'])
  document.addEventListener(type, schedulePresentationSync);

// Same public insertion contract as AuthorQuestions in category/MPS pages.
// No private transcript, fake reply, Session creation or automatic model send.
let quoteTask;
async function transferQuestion(button, text) {
  if (quoteTask) return;
  const controller = new AbortController();
  quoteTask = controller;
  const notice = document.getElementById('fulfillmentQuoteStatus');
  button.disabled = true;
  notice.textContent = '正在转入当前对话草稿…';
  try {
    await quotePage({ label: '订单履约分析', text }, controller.signal);
    if (!controller.signal.aborted) notice.textContent = '已转入当前对话草稿，确认后再发送。';
  } catch (error) {
    if (!controller.signal.aborted)
      notice.textContent = error instanceof Error ? error.message : String(error);
  } finally {
    if (quoteTask === controller) quoteTask = undefined;
    button.disabled = false;
  }
}
document.addEventListener('click', (event) => {
  const button = event.target.closest(
    '[data-fulfillment-question], #fulfillmentAnalysisChat, #itemAnalysisChat',
  );
  if (!button) return;
  const text =
    button.dataset.fulfillmentQuestion ||
    `请根据当前订单履约页面分析${button.id === 'itemAnalysisChat' ? '品项、缺货及排产' : '订单质量、供应满足和交付时效'}。当前为模拟数据，请勿当作真实业务结果。`;
  void transferQuestion(button, text);
});
window.addEventListener('pagehide', () => quoteTask?.abort());
window.addEventListener('gea-identity-changed', () => quoteTask?.abort());
window.addEventListener('gea-session-changed', sync);
action('context', '读取当前模拟订单与筛选分页，不执行履约', () => {
  if (!connected) throw Error('PAGE_CONTEXT_NOT_READY');
  return {
    ...fulfillmentSnapshot(),
    viewRevision: revision,
    synchronization: status.textContent,
  };
});
function suspend() {
  connected = false;
  revision++;
  withdrawReferences();
  status.textContent = '模拟数据 · 页面连接已失效，请重新打开';
}
window.addEventListener('gea-identity-changed', suspend);
window.addEventListener('pagehide', suspend);
void ready.then(() => {
  connected = true;
  return sync();
});
