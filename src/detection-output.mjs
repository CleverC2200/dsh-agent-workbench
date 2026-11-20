export function normalizeDetectionScope(value) {
  return typeof value === 'string'
    ? value.trim().replace(/品类\s*[×＊*]\s*基地/g, '品类*基地')
    : value;
}
export function parseDetectionOutput(texts, reason) {
  if (reason?.kind === 'error') {
    const detail = reason.error || {};
    const error = new Error(
      [
        detail.code,
        detail.message || '问数执行失败',
        detail.requestId && `requestId=${detail.requestId}`,
      ]
        .filter(Boolean)
        .join('；'),
    );
    error.code = detail.code;
    throw error;
  }
  if (reason?.kind && reason.kind !== 'completed' && reason.kind !== 'stop')
    throw new Error(`问数执行未完成：${reason.kind}`);
  const text = texts.at(-1)?.trim() || '';
  const unwrapped = text.replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/i, '$1');
  try {
    return JSON.parse(unwrapped);
  } catch {}
  const blocks = [
    ...text.matchAll(/^[ \t]*```(?:json)?[ \t]*\r?\n([\s\S]*?)^[ \t]*```[ \t]*(?=\r?$)/gim),
  ];
  if (blocks.length === 1) {
    try {
      return JSON.parse(blocks[0][1]);
    } catch {}
  }
  throw new Error('问数最终回复未返回有效JSON');
}
