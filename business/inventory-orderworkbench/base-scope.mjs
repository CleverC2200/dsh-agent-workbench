// Business-confirmed roll-up; retain unknown and other source base values.
export const workbenchBaseSql = (field) =>
  `CASE WHEN TRIM(${field}) IN ('成都分仓','上海分仓') THEN '西南' ELSE ${field} END`;

export function normalizeWorkbenchBase(value = '') {
  if (typeof value !== 'string') throw Error('INVALID_ORDER_METRIC_SCOPE');
  const base = value.trim();
  if (['全国', '全国汇总', '全部基地'].includes(base)) return '';
  if (['成都分仓', '上海分仓'].includes(base)) return '西南';
  return /^(郑州|华东|华南|西南|遂平|濮阳)基地$/.exec(base)?.[1] ?? base;
}
