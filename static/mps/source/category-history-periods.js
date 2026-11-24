export function historyMonthOffset(month, offset) {
  const date = new Date(`${month}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + offset);
  return date.toISOString().slice(0, 7);
}

export function historyFiscalMonths(month) {
  const year = Number(month.slice(0, 4)) - (Number(month.slice(5)) < 7 ? 1 : 0);
  return Array.from({ length: 12 }, (_, index) => historyMonthOffset(`${year}-07`, index));
}

export function categoryHistoryMonths(month) {
  return [
    ...new Set([
      ...Array.from({ length: 15 }, (_, index) => historyMonthOffset(month, index - 11)),
      ...historyFiscalMonths(historyMonthOffset(month, -4)),
      ...historyFiscalMonths(historyMonthOffset(month, 3)),
    ]),
  ].sort();
}

export function historyComparisonMonths(month) {
  return Array.from({ length: 8 }, (_, index) => historyMonthOffset(month, index - 4));
}
