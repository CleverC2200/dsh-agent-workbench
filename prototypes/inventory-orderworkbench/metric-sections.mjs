export const changeKinds = { 作废率: '1', 改单率: '2' };

export function metricSection(period, id, metric) {
  const part = period?.sections?.find((part) => part.id === id);
  return id === 'changes' && part?.parts && changeKinds[metric]
    ? part.parts.find((item) => item.id === changeKinds[metric])
    : part;
}

export function readySectionRows(period, id) {
  const part = metricSection(period, id);
  return part?.parts
    ? part.parts.filter((item) => item.status === 'ready').flatMap((item) => item.rows)
    : part?.status === 'ready'
      ? part.rows
      : [];
}

export function changesSection(parts) {
  const failed = parts.find((part) => part.status === 'error');
  return {
    id: 'changes',
    status: parts.some((part) => part.status === 'loading')
      ? 'loading'
      : failed
        ? 'error'
        : 'ready',
    ...(failed ? { code: failed.code, detail: failed.detail } : {}),
    rows: parts.filter((part) => part.status === 'ready').flatMap((part) => part.rows),
    parts: parts.map((part) => ({ ...part })),
  };
}
