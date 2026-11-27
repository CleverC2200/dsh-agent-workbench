export const odmLineLabel = 'ODM产线';

export function odmDemandTotal(rows, { base, month, category, search } = {}) {
  let known = 0;
  let missing = 0;
  let found = false;
  for (const row of rows ?? []) {
    if (
      !row.odm ||
      (base && row.base !== base) ||
      (month && row.month !== month) ||
      (category && row.category !== category) ||
      (search && !`${row.code} ${row.name}`.includes(search))
    )
      continue;
    found = true;
    if (Number.isFinite(row.demandTons)) known += row.demandTons;
    else missing += 1;
  }
  return found ? { value: missing ? null : known, known, missing } : null;
}

export function odmDemandText({ value, known }, numberText) {
  if (value !== null) return numberText(value);
  return known ? `已知${numberText(known)} · 部分待补` : '待补';
}

export function odmDemandFooter(demand, column, numberText) {
  return demand ? { label: odmLineLabel, column, value: odmDemandText(demand, numberText) } : null;
}
