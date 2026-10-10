import { publish } from '../channel.js';
const parts = new Map<string, unknown>();
let timer: ReturnType<typeof setTimeout> | undefined;
function bounded(value: any, depth = 0): any {
  if (depth > 7) return '[omitted]';
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
    source: 'GEA',
    capturedAt: new Date().toISOString(),
    parts: Object.fromEntries(parts),
    visibleText:
      state?.state === 'ready'
        ? document.getElementById('app')?.innerText.slice(0, 16000)
        : state?.message,
    coverage: '当前页面和已读取结果摘要；截断明细不能用于全量汇总',
  };
}
export function refreshContext() {
  clearTimeout(timer);
  timer = setTimeout(() => void publish(pageContext()).catch(() => {}), 350);
}
export function updateContext(key: string, value: unknown) {
  parts.set(key, bounded(value));
  refreshContext();
}
export function clearContext() {
  parts.clear();
  clearTimeout(timer);
}
export function removeContextPart(key: string) {
  parts.delete(key);
  refreshContext();
}
if (typeof window !== 'undefined') window.addEventListener('gea-session-changed', refreshContext);
