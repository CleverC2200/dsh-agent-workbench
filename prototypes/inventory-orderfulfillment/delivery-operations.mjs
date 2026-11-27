import dashboard from './delivery-operations.html';
import { createOperationsReader } from './operations-data.mjs';
import { operationsDatasets } from '../../business/inventory-orderfulfillment/operations-queries.mjs';

let dashboardDocument;
const protocol = 'delivery-operations-v1';

export function mountDeliveryOperations(document, { config, execute, isConnected }) {
  const frame = document.getElementById('deliveryOperationsFrame');
  const reader = config ? createOperationsReader(config, execute) : null;
  let port,
    active = false,
    disposed = false;
  const reads = new Map();
  function abort() {
    for (const controller of reads.values()) controller.abort();
    reads.clear();
  }
  const notify = (type, connected) => port?.postMessage({ type, connected });
  function connect(event) {
    if (
      disposed ||
      event.source !== frame.contentWindow ||
      event.data?.protocol !== protocol ||
      event.data.type !== 'ready' ||
      port
    )
      return;
    const channel = new MessageChannel();
    port = channel.port1;
    port.onmessage = async ({ data }) => {
      if (data.type === 'height') {
        if (Number.isFinite(data.height) && data.height >= 1 && data.height <= 100000)
          frame.style.height = Math.ceil(data.height) + 'px';
        return;
      }
      if (data.type === 'cancel') {
        abort();
        return;
      }
      if (
        data.type !== 'query' ||
        !Number.isSafeInteger(data.id) ||
        data.id < 1 ||
        reads.has(data.id)
      )
        return;
      const controller = new AbortController();
      reads.set(data.id, controller);
      try {
        if (!active || !isConnected() || !reader) throw Error('等待当前用户业务授权与页面会话');
        if (!Object.hasOwn(operationsDatasets, data.dataset)) throw Error('未登记的数据读取');
        const input = data.filters;
        if (
          !input ||
          typeof input !== 'object' ||
          Object.keys(input).some(
            (key) =>
              ![
                'month',
                'today',
                'plan_end',
                'basis',
                'base',
                'region',
                'province',
                'sales_group',
              ].includes(key),
          )
        )
          throw Error('筛选参数无效');
        const today = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
        const result = await reader(
          data.dataset,
          {
            month: input.month,
            basis: input.basis,
            base: input.base,
            region: input.region,
            province: input.province,
            sales_group: input.sales_group,
            today,
            plan_end: new Date(Date.parse(today + 'T00:00:00Z') + 6 * 86400000)
              .toISOString()
              .slice(0, 10),
          },
          { signal: controller.signal, page: data.page, complete: true },
        );
        if (reads.get(data.id) === controller && !controller.signal.aborted)
          port.postMessage({ id: data.id, result });
      } catch (error) {
        if (reads.get(data.id) === controller && !controller.signal.aborted)
          port.postMessage({
            id: data.id,
            error: String(error.message ?? '数据读取失败').slice(0, 300),
          });
      } finally {
        if (reads.get(data.id) === controller) reads.delete(data.id);
      }
    };
    port.start();
    frame.contentWindow.postMessage({ protocol, type: 'connect', connected: isConnected() }, '*', [
      channel.port2,
    ]);
  }
  window.addEventListener('message', connect);
  return {
    async show(selected) {
      const wasActive = active;
      active = selected;
      if (!selected || disposed) return;
      if (!frame.hasAttribute('srcdoc')) {
        dashboardDocument ??= new Response(
          new Blob([Uint8Array.from(atob(dashboard), (character) => character.charCodeAt(0))])
            .stream()
            .pipeThrough(new DecompressionStream('gzip')),
        ).text();
        const html = await dashboardDocument;
        if (!disposed && !frame.hasAttribute('srcdoc')) frame.srcdoc = html;
      } else if (!wasActive && isConnected()) notify('session-ready', true);
    },
    ready() {
      if (active) notify('session-ready', true);
    },
    invalidate(connected = false) {
      abort();
      notify('reset', connected && active);
    },
    dispose() {
      disposed = true;
      abort();
      port?.close();
      window.removeEventListener('message', connect);
    },
  };
}
