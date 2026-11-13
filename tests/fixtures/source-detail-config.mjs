export function sourceDetailConfig(config) {
  const source = structuredClone(config);
  delete source.dailySummary;
  return source;
}
