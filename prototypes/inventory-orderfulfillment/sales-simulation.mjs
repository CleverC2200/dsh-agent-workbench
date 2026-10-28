import { call } from '../../business/shared/channel.js';
/** Local mock operations use the existing owned page port; the sandbox never fetches directly. */
export function mountSalesSimulation(document) {
  const node = document.getElementById('fulfillment-simulation-config');
  const config = node ? JSON.parse(node.textContent) : null;
  let state = config?.state,
    timer,
    generation = 0;
  const bindings = new Set();
  const matches = (row) =>
    !!config &&
    (config.allowedOrders ?? [config]).some(
      (order) =>
        (row.order_no ?? row.orderNo) === order.orderNo &&
        (row.customer_code ?? row.customerCode) === order.customerCode &&
        row.base === order.base,
    );
  const valid = (value) =>
    value?.simulation === true &&
    value.runId === config.runId &&
    matches(value) &&
    Array.isArray(value.records);
  const resultFor = (row) => {
    const result =
      (row.order_no ?? row.orderNo) === state?.orderNo
        ? state
        : state?.orderStates?.[row.order_no ?? row.orderNo];
    return matches(row) && valid(result) ? result : null;
  };
  const update = () => {
    for (const { button, row } of bindings) {
      const result = resultFor(row);
      if (result) {
        button.textContent = result.status;
        button.title = '仅模拟结果，点击查看记录；不代表真实订单确认';
      }
    }
  };
  async function request(operation, snapshot) {
    if (!config?.token) throw Error('SIMULATION_NOT_ENABLED');
    return call('fulfillment-simulation', {
      operation,
      runId: config.runId,
      token: config.token,
      ...(snapshot ? { snapshot } : {}),
    });
  }
  async function poll(current) {
    try {
      const result = await request('state');
      if (current !== generation) return;
      if (valid(result.state)) {
        state = result.state;
        update();
      }
    } catch {
      if (current !== generation) return;
    }
    if (current === generation) timer = setTimeout(() => poll(current), 2000);
  }
  return {
    matches: (row) => matches(row) && !!config?.token,
    async notify(snapshot) {
      const result = await request('notify', snapshot);
      if (valid(result.state)) {
        state = result.state;
        update();
      }
      return result;
    },
    watch(button, row) {
      if (!matches(row)) return;
      bindings.add({ button, row });
      update();
      if (bindings.size === 1) void poll(generation);
    },
    resultFor(row) {
      return resultFor(row);
    },
    clear() {
      generation++;
      clearTimeout(timer);
      bindings.clear();
      state = undefined;
    },
  };
}
