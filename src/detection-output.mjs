export function normalizeDetectionScope(value) {
  return typeof value === 'string' ? value.trim().replace(/品类\s*[×＊*]\s*基地/g, '品类*基地') : value;
}
export function parseDetectionOutput(texts, reason) {
  if (reason?.kind === 'error') {
    const detail = reason.error || {};
    const error = new Error([detail.code, detail.message || '问数执行失败', detail.requestId && `requestId=${detail.requestId}`].filter(Boolean).join('；'));
    error.code = detail.code;
    throw error;
  }
  if (reason?.kind && reason.kind !== 'completed' && reason.kind !== 'stop') throw new Error(`问数执行未完成：${reason.kind}`);
  const text = texts.at(-1) || '';
  const raw = text.trim().replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
  try { return JSON.parse(raw); } catch { throw new Error('问数最终回复未返回有效JSON'); }
}
