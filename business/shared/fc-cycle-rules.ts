export type FcCycleRule = {
  status?: 'effective' | 'paused';
  level: 'sku' | 'material-group' | 'category' | 'warehouse';
  object: string;
  days: number;
  from: string;
  to: string;
};
export const FC_CYCLE_LIMIT = 12;
const levels = ['sku', 'material-group', 'category', 'warehouse'];
export function validateFcCycleRules(value: unknown): FcCycleRule[] {
  if (!Array.isArray(value) || value.length > FC_CYCLE_LIMIT) throw Error('周期规则最多12条');
  const seen = new Set<string>();
  for (const rule of value) {
    if (
      !rule ||
      !levels.includes(rule.level) ||
      ![undefined, 'effective', 'paused'].includes(rule.status) ||
      typeof rule.object !== 'string' ||
      !rule.object.trim() ||
      rule.object.length > 100 ||
      !Number.isInteger(rule.days) ||
      rule.days < 1 ||
      rule.days > 365 ||
      ![rule.from, rule.to].every(
        (day) =>
          typeof day === 'string' &&
          (day === '' ||
            (/^20\d{2}-\d{2}-\d{2}$/.test(day) &&
              new Date(day + 'T00:00:00Z').toISOString().slice(0, 10) === day)),
      ) ||
      (rule.from && rule.to && rule.from > rule.to)
    )
      throw Error('周期规则对象、天数或生效日期无效');
    const key = JSON.stringify([rule.level, rule.object.trim()]);
    if (seen.has(key)) throw Error('同层级对象只能设置一条周期规则');
    seen.add(key);
  }
  return value
    .map((rule) => ({ ...rule, object: rule.object.trim() }))
    .sort((a, b) => levels.indexOf(a.level) - levels.indexOf(b.level));
}
export function fcCycleParameters(rules: FcCycleRule[] = []) {
  const ordered = validateFcCycleRules(rules).filter((rule) => rule.status !== 'paused');
  return Object.fromEntries(
    Array.from({ length: FC_CYCLE_LIMIT }, (_, index) => {
      const rule = ordered[index];
      return Object.entries({
        level: rule?.level ?? '',
        object: rule?.object ?? '',
        days: rule?.days ?? 7,
        from: rule?.from ?? '',
        to: rule?.to ?? '',
      }).map(([field, value]) => [`fc_cycle_${index}_${field}`, value]);
    }).flat(),
  );
}
