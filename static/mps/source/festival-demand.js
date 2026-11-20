import { canonicalBaseName } from './relations.js';

const monthLabel = (value) => {
  const match = typeof value === 'string' && /^(\d{4})-?(0[1-9]|1[0-2])$/.exec(value);
  return match ? `${match[1]}-${match[2]}` : null;
};
const monthOffset = (month, amount) => {
  const start = new Date(month + '-01T00:00:00Z');
  start.setUTCMonth(start.getUTCMonth() + amount);
  return start.toISOString().slice(0, 7);
};
const isoDate = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
const anchorId = (name, date) => JSON.stringify([name, date]);
export const festivalOptionValue = (option) => anchorId(option.name, option.date);
export function demandBasisLabel(festival, month) {
  if (!festival) return '自然月';
  if (['loading', 'choose', 'failed'].includes(festival.status)) return '节日推算待就绪';
  return festival.months.includes(month) ? festival.selected.name : '自然月';
}

export function festivalDemandBasis(draft, calendarHistory) {
  if (!draft.festivalBasis) return { history: calendarHistory };
  const months = Array.from({ length: 8 }, (_, index) => monthOffset(draft.month, index - 4));
  const forecast = months.slice(4);
  const read = draft.festivalHistoryRead;
  const preview = { options: [], selected: null, months: [], windows: [] };
  if (read?.month !== draft.month || read.status === 'loading')
    return { history: [], festival: { ...preview, status: 'loading' } };
  if (read.status !== 'ready')
    return { history: [], festival: { ...preview, status: 'failed', error: read.error } };

  const anchors = new Map();
  for (const source of read.rows) {
    const mother = monthLabel(source.mother_month);
    const comparison = monthLabel(source.comparison_month);
    const date = source.mother_festival_date;
    const name = typeof source.festival_name === 'string' ? source.festival_name.trim() : '';
    const year = Number(source.festival_year);
    if (
      !months.includes(mother) ||
      !comparison ||
      comparison !== monthLabel(source.stat_month) ||
      !name ||
      !isoDate(date) ||
      !isoDate(source.festival_date) ||
      !isoDate(source.actual_start_date) ||
      !isoDate(source.actual_end_date) ||
      source.actual_start_date > source.actual_end_date ||
      year !== Number(source.festival_date.slice(0, 4)) ||
      year > Number(date.slice(0, 4))
    )
      return {
        history: [],
        festival: {
          ...preview,
          status: 'failed',
          error: '节日发货来源返回了无效的母期、对照月或实际日期区间',
        },
      };
    const id = anchorId(name, date);
    if (!anchors.has(id)) anchors.set(id, { name, date, rows: [] });
    anchors.get(id).rows.push({ source, mother, comparison, year });
  }
  const options = [...anchors.values()]
    .map(({ name, date }) => ({ name, date }))
    .sort(
      (left, right) => left.date.localeCompare(right.date) || left.name.localeCompare(right.name),
    );
  const persisted = festivalOptionValue(draft.festivalBasis);
  const selected =
    anchors.get(persisted) ?? (options.length === 1 ? anchors.values().next().value : null);
  if (!options.length)
    return {
      history: calendarHistory,
      festival: {
        ...preview,
        status: 'outside',
        naturalMonths: forecast,
        actualNaturalMonths: months.slice(0, 4),
      },
    };
  if (!selected) return { history: [], festival: { ...preview, status: 'choose', options } };

  const covered = [...new Set(selected.rows.map((row) => row.mother))].sort();
  const projection = new Set(
    covered.flatMap((month) => [1, 2, 3].map((year) => monthOffset(month, -12 * year))),
  );
  const motherYear = Number(selected.date.slice(0, 4));
  const history = calendarHistory.filter((row) => !projection.has(row['月份']));
  const windows = new Map();
  const actual = new Map();
  const historical = new Map();
  for (const row of selected.rows) {
    const { source, mother, comparison, year } = row;
    const difference = motherYear - year;
    if (difference > 3) continue;
    const window = {
      month: mother,
      comparison,
      year,
      start: source.actual_start_date,
      end: source.actual_end_date,
    };
    windows.set(JSON.stringify(window), window);
    const base = canonicalBaseName(source.belong_base ?? '');
    if (!base || typeof source.dimension_value !== 'string' || !source.dimension_value.trim())
      continue;
    const projected = monthOffset(mother, -12 * difference);
    const target = difference ? historical : actual;
    if (!target.has(projected)) target.set(projected, []);
    target
      .get(projected)
      .push({ source: { ...source, belong_base: base, source_rows: 1 }, comparison, window });
  }
  for (const [month, period] of historical) {
    for (const records of Map.groupBy(period, ({ source }) =>
      JSON.stringify([source.belong_base, source.dimension_value]),
    ).values()) {
      for (const { source, comparison, window } of records) {
        history.push({
          ...source.metrics,
          月份: month,
          基地: source.belong_base,
          粒度状态: records.length > 1 ? '业务键重复，仅保留源值' : source.metrics['粒度状态'],
          对照月份: comparison,
          实际开始日期: window.start,
          实际结束日期: window.end,
          推算口径: selected.name,
        });
      }
    }
  }
  return {
    history,
    actual,
    festival: {
      status: 'ready',
      options,
      selected: { name: selected.name, date: selected.date },
      months: covered,
      naturalMonths: forecast.filter((month) => !covered.includes(month)),
      actualNaturalMonths: months.slice(0, 4).filter((month) => !covered.includes(month)),
      windows: [...windows.values()].sort(
        (left, right) => left.month.localeCompare(right.month) || right.year - left.year,
      ),
    },
  };
}
