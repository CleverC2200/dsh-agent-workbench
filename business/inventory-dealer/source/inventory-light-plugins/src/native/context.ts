import { publish } from '../channel.js';
const parts = new Map<string, unknown>();
let timer: ReturnType<typeof setTimeout> | undefined;
function bounded(value: any, depth = 0): any {
  if (depth > 7) return '[已省略深层字段]';
  if (typeof value === 'string') return value.slice(0, 3000);
  if (Array.isArray(value))
    return value.length > 30
      ? {
          rows: value.slice(0, 30).map((v) => bounded(v, depth + 1)),
          totalRows: value.length,
          truncated: true,
        }
      : value.map((v) => bounded(v, depth + 1));
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 40)
        .map(([k, v]) => [k, bounded(v, depth + 1)]),
    );
  return value;
}
export function pageContext() {
  const state = parts.get('queryState') as { state: string; message?: string } | undefined;
  return {
    source: 'GEA_GOVERNED_SQL',
    mock: false,
    realData: state?.state === 'ready',
    capturedAt: new Date().toISOString(),
    parts: Object.fromEntries(parts),
    visibleText:
      state?.state === 'ready'
        ? document.getElementById('app')?.innerText.slice(0, 16000)
        : state?.message,
    coverage: '当前页面与已读取结果摘要；截断的行不能用于全量汇总',
  };
}
export function updateContext(key: string, value: unknown) {
  const limited = bounded(value),
    serialized = JSON.stringify(limited);
  parts.set(
    key,
    serialized?.length > 18000 ? { truncated: true, preview: serialized.slice(0, 18000) } : limited,
  );
  clearTimeout(timer);
  timer = setTimeout(() => void publish(pageContext()).catch(() => {}), 350);
}
export function clearContext() {
  parts.clear();
  clearTimeout(timer);
}

export function beginQuery(scope: unknown) {
  for (const key of [
    'dealer',
    'dealerVisiblePage',
    'dealerOrderSuggestions',
    'purchaseDraft',
    'dealerOrderHeader',
  ])
    parts.delete(key);
  parts.set('queryState', { state: 'loading', scope });
  parts.set('pageFilters', scope);
  clearTimeout(timer);
  void publish(pageContext()).catch(() => {});
}
export function removeContextPart(key: string) {
  parts.delete(key);
}
if (typeof window !== 'undefined') {
  window.addEventListener('gea-session-changing', clearContext);
  window.addEventListener('gea-session-changed', () => void publish(pageContext()).catch(() => {}));
}
