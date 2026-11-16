import catalog from './warning-metric-catalog.json' with { type: 'json' };

const normalized = (value) =>
  String(value || '')
    .trim()
    .normalize('NFC');
export const warningMetricNames = [...new Set(catalog.records.map((r) => r.name))];
export function warningMetricInfo(name) {
  const key = normalized(name);
  const exact = catalog.records.filter((r) => normalized(r.name) === key);
  const matches = exact.length
    ? exact
    : catalog.records.filter((r) =>
        r.aliases.split(/[、，,；;\n]/).some((a) => normalized(a) === key),
      );
  const source = { source: catalog.source, sourceUrl: catalog.sourceUrl, version: catalog.version };
  if (!matches.length)
    return {
      name: key,
      status: 'unavailable',
      ...source,
      message: '指标登记表中没有匹配的名称，请核对指标名称或定义。',
    };
  const definitions = new Set(
    matches.map(({ module: _module, recordId: _recordId, aliases: _aliases, ...definition }) =>
      JSON.stringify(definition),
    ),
  );
  if (definitions.size > 1)
    return {
      name: key,
      status: 'unavailable',
      ...source,
      message: '同名指标存在不同口径，请先明确业务模块。',
      variants: matches,
    };
  const metric = matches[0];
  const ruleText = metric.measureRules.replace(/(?:健康|预警|严重)[：:]?|[\s；;，,、。-]/g, '');
  const hasRules = !!ruleText && !/^(待确认|待维护|未维护|待补充|暂无|未配置)$/.test(ruleText);
  return {
    ...metric,
    ...source,
    status: 'available',
    rulesStatus: hasRules ? 'configured' : 'unconfigured',
    measureRules: hasRules
      ? metric.measureRules
      : '指标库尚未维护健康、预警、严重阈值；请在任务说明中明确判断规则，未明确时不判定风险等级。',
  };
}
export function warningMetricContext(metric) {
  return Object.fromEntries(
    [
      'name',
      'status',
      'message',
      'version',
      'source',
      'sourceUrl',
      'recordId',
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
