import { springFestivalCalendar } from './spring-festival-dates.js';

export const productionCalendarRule =
  '每月默认25天，春节前5天及后5天按自然日期归属月份扣减，共扣10天，春节当天不额外扣减；人工生产天数为最终覆盖值。';

const calendars = new Map();

export function defaultProductionCalendar(month) {
  if (calendars.has(month)) return calendars.get(month);
  const valid = /^\d{4}-(0[1-9]|1[0-2])$/.test(month);
  const date = valid ? springFestivalCalendar.dates[month.slice(0, 4)] : undefined;
  const springFestival = date ? `${month.slice(0, 4)}-${date}` : null;
  const holidayDates = springFestival
    ? [-5, -4, -3, -2, -1, 1, 2, 3, 4, 5]
        .map((offset) => {
          const day = new Date(`${springFestival}T00:00:00Z`);
          day.setUTCDate(day.getUTCDate() + offset);
          return day.toISOString().slice(0, 10);
        })
        .filter((day) => day.startsWith(month))
    : [];
  const days =
    !valid || (!springFestival && ['01', '02'].includes(month.slice(5)))
      ? null
      : 25 - holidayDates.length;
  const result = { days, holidayDates, springFestival };
  calendars.set(month, result);
  return result;
}

export function productionCalendarDays(base, month, overrides = []) {
  const selected = overrides.filter((row) => row.base === base && row.month === month);
  if (!selected.length) return defaultProductionCalendar(month).days;
  if (selected.length !== 1) return null;
  const value = selected[0].days;
  if (
    typeof value !== 'number' &&
    !(typeof value === 'string' && /^\d+(\.\d+)?$/.test(value.trim()))
  )
    return null;
  const days = Number(value);
  return Number.isFinite(days) && days >= 0 && days <= 31 ? days : null;
}
