export function projectReportImports(history = [], overrides = {}) {
  const latest = new Map();
  for (const entry of history)
    if (entry?.batch) {
      latest.delete(entry.batch.batchId);
      latest.set(entry.batch.batchId, entry.batch);
    }
  const result = { summary: {}, unmet: [], short: [], long: [] };
  for (const batch of latest.values()) {
    Object.assign(result.summary, batch.summary);
    for (const kind of ['unmet', 'short', 'long'])
      for (const row of batch[kind] ?? []) {
        const id = `import-${batch.batchId}-${kind}-${row.key}`;
        if (Object.hasOwn(overrides, id) && overrides[id] === null) continue;
        result[kind].push({ ...row, id, cells: overrides[id] });
      }
  }
  return result;
}

export function importedSummary(manual, imported, defaults) {
  return Object.fromEntries(
    Object.entries(manual).map(([key, value]) => [
      key,
      value === defaults[key] && imported[key] ? imported[key] : value,
    ]),
  );
}

export function summarySupplement(manual, imported, defaults) {
  return Object.fromEntries(
    Object.entries(imported).filter(
      ([key, value]) => value && manual[key] !== defaults[key] && manual[key] !== value,
    ),
  );
}
