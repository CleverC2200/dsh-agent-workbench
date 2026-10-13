// State is supplied by the report renderer, never discovered from host DOM.
import { ready, call, reportElements } from '../../business/shared/channel.js';

export function publishReport(snapshot, disposePage) {
  let active = true,
    connected = false,
    revision = 0,
    epoch = 0;
  let latest,
    running = false;
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
      const next = latest;
      latest = undefined;
      const version = revision,
        identity = epoch;
      try {
        await call('context', next, { signal: lifetime.signal });
        if (!active || !connected || identity !== epoch) continue;
        if (version !== revision) continue;
        showStatus('');
        withdraw = reportElements('order-report', [
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
        ]);
      } catch (error) {
        if (active && connected && identity === epoch && version === revision)
          showStatus(
            `页面上下文同步失败：${error.message}；当前页仍可本地查看，请重新操作或打开页面。`,
          );
      }
    }
    running = false;
  }
  function update() {
    if (!active) return;
    revision++;
    withdraw();
    withdraw = () => {};
    latest = snapshot();
    if (connected) showStatus('正在同步当前报告上下文…');
    void flush();
  }
  const changed = () => {
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
    withdraw();
    withdraw = () => {};
    showStatus('页面会话已失效，请重新打开页面。');
  };
  function dispose() {
    if (!active) return;
    active = false;
    epoch++;
    lifetime.abort();
    latest = undefined;
    withdraw();
    clearTimeout(window.toastTimer);
    disposePage();
    window.removeEventListener('gea-session-changed', changed);
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
