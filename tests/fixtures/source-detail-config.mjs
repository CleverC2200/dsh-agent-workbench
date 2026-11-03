/** Keep historical detail-query regressions independent of the optional daily-summary route.
 * Summary routing, batching and permission failures have dedicated daily-summary tests.
 */
export function sourceDetailConfig(config) {
  const source = structuredClone(config);
  delete source.dailySummary;
  return source;
}
