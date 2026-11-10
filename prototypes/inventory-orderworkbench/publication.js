// State is supplied by the report renderer, never discovered from host DOM.
import { ready, call, reportElements } from '../../business/shared/channel.js';

export function publishReport(snapshot, disposePage, importer) {
  let active = true,
    connected = false,
    revision = 0,
    epoch = 0;
  let latest,
    running = false,
    timer;
  let withdraw = () => {};
  let lifetime = new AbortController();
  const status = document.getElementById('pageSyncStatus');
  function showStatus(message) {
    status.textContent = message;
    status.hidden = !message;
  }
  async function flush() {
    if (running || !active || !connected) return;
    running = true;
    while (latest && active && connected) {
      latest = undefined;
      const version = revision,
        identity = epoch;
      try {
        const next = snapshot();
        await call('context', next, { signal: lifetime.signal });
        if (!active || !connected || identity !== epoch) continue;
        if (version !== revision) continue;
        showStatus('');
        withdraw = reportElements(
          'order-report',
          [
            ...(importer?.elements() ?? []),
            { id: 'report:period', role: 'field', label: '当前统计周期', value: next.period.label },
            ...next.metrics.map((metric, index) => ({
              id: `report:metric:${index}`,
              role: 'field',
              label: metric.key,
              value: `${metric.value} · ${metric.status} · 目标${metric.target}`,
            })),
            ...next.events.map((event) => ({
              id: `report:event:${event.id}`,
              role: 'row',
              label: event.title,
              value: event.summary,
            })),
            ...next.tasks.map((task) => ({
              id: `report:task:${task.id}`,
              role: 'row',
              label: task.title,
              value: `${task.status} · ${task.role} · ${task.due}`,
            })),
          ],
          importer?.apply,
        );
      } catch (error) {
        if (active && connected && identity === epoch && version === revision) {
          const reason = String(error?.cause?.message ?? error?.message ?? error);
          showStatus(
            /SESSION_(?:EXPIRED|REJECTED|NOT_FOUND|IDENTITY_MISMATCH|MAX_LIFETIME_EXCEEDED)|PAGE_AGENT_SESSION_MISMATCH|会话已失效/.test(
              reason,
            )
              ? '页面会话已失效，请重新打开页面。'
              : `页面上下文同步失败：${error.message}；当前页仍可本地查看，请重新操作或打开页面。`,
          );
        }
      }
    }
    running = false;
  }
  function update() {
    if (!active) return;
    revision++;
    latest = true;
    if (connected) showStatus('正在同步当前报告上下文…');
    if (timer === undefined)
      timer = setTimeout(() => {
        timer = undefined;
        void flush();
      });
  }
  const changed = () => {
    withdraw();
    withdraw = () => {};
    epoch++;
    lifetime.abort();
    lifetime = new AbortController();
    connected = true;
    update();
  };
  const invalidated = () => {
    epoch++;
    lifetime.abort();
    connected = false;
    latest = undefined;
    clearTimeout(timer);
    timer = undefined;
    withdraw();
    withdraw = () => {};
    showStatus('正在重新连接订单工作台，连接完成后自动加载…');
  };
  const heartbeat = setInterval(() => {
    if (connected) update();
  }, 30000);
  function dispose() {
    if (!active) return;
    active = false;
    clearInterval(heartbeat);
    clearTimeout(timer);
    epoch++;
    lifetime.abort();
    latest = undefined;
    withdraw();
    clearTimeout(window.toastTimer);
    disposePage();
    window.removeEventListener('gea-session-changed', changed);
    window.removeEventListener('gea-session-changing', invalidated);
    window.removeEventListener('gea-identity-changed', invalidated);
    window.removeEventListener('pagehide', dispose);
    document.removeEventListener('click', update);
    document.removeEventListener('change', update);
    document.removeEventListener('submit', update);
  }
  document.addEventListener('click', update);
  document.addEventListener('change', update);
  document.addEventListener('submit', update);
  window.addEventListener('gea-session-changed', changed);
  window.addEventListener('gea-session-changing', invalidated);
  window.addEventListener('gea-identity-changed', invalidated);
  window.addEventListener('pagehide', dispose);
  void ready.then(() => {
    if (active) {
      connected = true;
      update();
    }
  });
  return update;
}
