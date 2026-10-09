import { createPageViewState } from '../../business/shared/view-state.js';
const view = createPageViewState('inventory-orderfulfillment');
let restoringView = false;
view.subscribe(state => {
  restoringView = true;
  if (state.order !== undefined) orderNumberSearch.value = state.order;
  if (state.customer !== undefined) customerSearch.value = state.customer;
  if (state.warehouse !== undefined) { selectedWarehouse = state.warehouse; warehouseSearch.value = state.warehouse; }
  if (state.status !== undefined) omsStatusFilter.value = state.status;
  if (state.size !== undefined) ordersPageSize.value = String(state.size);
  if (state.page !== undefined) currentOrderPage = state.page;
  filterFulfillmentRows();
  restoringView = false;
});
import {
  ready,
  publish,
  reportElements,
  action,
} from "../../business/shared/channel.js";

const status = document.getElementById("prototypeStatus");
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
  if (!restoringView) { const state = fulfillmentSnapshot(); view.update({ ...state.filters, page: state.page.number, size: state.page.size }); }
  if (!connected) return;
  const current = ++revision;
  withdrawReferences();
  status.textContent = "模拟数据 · 正在同步当前页引用";
  publication = publication.then(async () => {
    if (!connected || current !== revision) return;
    try {
      const state = fulfillmentSnapshot();
      await publish(state);
      if (!connected || current !== revision) return;
      const rows = state.rows.map((row) => ({
        id: "order:" + row.sourceOrder,
        role: "row",
        label: "模拟订单 " + row.sourceOrder + " · " + row.customer,
        value:
          row.status +
          " · " +
          row.goods +
          " · " +
          row.warehouse +
          " · " +
          row.attention,
      }));
      withdraw = reportElements("orders", [
        {
          id: "summary:orders",
          role: "field",
          label: `完整模拟集合汇总（${state.summary.received}条，非真实数据）`,
          value: `接收${state.summary.received} · 校验中${state.summary.checking} · 异常${state.summary.issues} · 待推送${state.summary.ready}`,
        },
        {
          id: "table:orders",
          role: "collection",
          label: "当前分页模拟订单",
          value: `第${state.page.number}/${state.page.count}页 · 命中${state.page.matched}条 · 当前${state.page.visible}条`,
          members: rows.map((row) => row.id),
        },
        ...rows,
      ]);
      status.textContent = "模拟数据 · 当前页引用已同步 · 未连接真实履约系统";
    } catch (error) {
      if (!connected || current !== revision) return;
      status.textContent =
        "模拟数据 · 当前页引用同步失败，请重新打开页面：" + error.message;
    }
  });
  return publication;
}

window.addEventListener("fulfillment-state-changed", sync);
window.addEventListener("gea-session-changed", sync);
action("context", "读取当前模拟订单与筛选分页，不执行履约", () => {
  if (!connected) throw Error("PAGE_CONTEXT_NOT_READY");
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
  status.textContent = "模拟数据 · 页面连接已失效，请重新打开";
}
window.addEventListener("gea-identity-changed", suspend);
window.addEventListener("pagehide", suspend);
void ready.then(() => {
  connected = true;
  return sync();
});
