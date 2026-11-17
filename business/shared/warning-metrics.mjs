import catalog from './warning-metric-catalog.json' with { type: 'json' };

const normalized = (value) =>
  String(value || '')
    .trim()
    .normalize('NFC');
export const warningMetricNames = catalog.records.map((r) => r.selectionName);
export function warningMetricInfo(name) {
  const key = normalized(name);
  let metric = catalog.records.find((r) => normalized(r.selectionName) === key);
  if (!metric) {
    const aliases = catalog.records.filter((r) =>
      r.aliases.split(/[、，,；;\n]/).some((a) => normalized(a) === key),
    );
    const names = new Set(aliases.map((r) => r.name));
    if (names.size === 1)
      metric = catalog.records.find((r) => r.recordId === catalog.defaults[aliases[0].name]);
  }
  const source = { source: catalog.source, sourceUrl: catalog.sourceUrl, version: catalog.version };
  if (!metric)
    return {
      name: key,
      status: 'unavailable',
      ...source,
      message: 'V0.6 中没有该名称的唯一固定口径，请使用表内已登记的指标。',
    };
  const ruleText = metric.measureRules.replace(/(?:健康|预警|严重)[：:]?|[\s；;，,、。-]/g, '');
  const hasRules =
    !!ruleText && !/^(?:待业务确认|待确认|待维护|未维护|待补充|暂无|未配置|无)+$/.test(ruleText);
  return {
    ...metric,
    ...source,
    status: 'available',
    rulesStatus: hasRules ? 'configured' : 'unconfigured',
    measureRules: hasRules
      ? metric.measureRules
      : 'V0.6 未维护健康、预警、严重阈值；未提供明确任务规则时不判定风险等级。',
  };
}
export function warningMetricContext(metric) {
  return Object.fromEntries(
    [
      'name',
      'selectionName',
      'module',
      'status',
      'message',
      'version',
      'source',
      'sourceUrl',
      'recordId',
      'sheet',
      'row',
      'unit',
      'direction',
      'definition',
      'formula',
      'exclusions',
      'timeBasis',
      'measureRules',
      'rulesStatus',
      'dimensions',
    ].map((key) => [key, metric[key] ?? '']),
  );
}
