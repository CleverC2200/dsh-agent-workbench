const formatter = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' });

export const mpsBusinessDate = () => formatter.format(new Date());

export const isBusinessDate = (value) =>
  typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value + 'T00:00:00Z')) &&
  new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;

export const isCalendarMonthEnd = (day) =>
  isBusinessDate(day) && new Date(Date.parse(day + 'T00:00:00Z') + 86400000).getUTCDate() === 1;
