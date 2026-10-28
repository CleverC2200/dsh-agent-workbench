/** Isolated simulation results are embedded by the local preview helper, never fetched by the sandbox. */
export function mountSalesSimulation(document) {
  const node = document.getElementById('fulfillment-simulation-config');
  const config = node ? JSON.parse(node.textContent) : null;
  const state = config?.state;
  const valid = state?.simulation === true && state.runId === config.runId &&
    state.orderNo === config.orderNo && state.customerCode === config.customerCode &&
    state.base === config.base && Array.isArray(state.records);
  const matches = row => valid && row.order_no === config.orderNo &&
    row.customer_code === config.customerCode && row.base === config.base;
  return {
    watch(button, row) {
      if (!matches(row)) return;
      button.textContent = state.status;
      button.title = '飞书 CLI 模拟结果；重新打开页面读取最新记录，不代表真实订单确认';
    },
    resultFor(row) { return matches(row) ? state : null; },
    clear() {},
  };
}
