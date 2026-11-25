const monthOffset = (month, amount) => {
  const start = new Date(month + '-01T00:00:00Z');
  start.setUTCMonth(start.getUTCMonth() + amount);
  return start.toISOString().slice(0, 7);
};
const anchorId = (name, date) => JSON.stringify([name, date]);
export const festivalOptionValue = (option) => anchorId(option.name, option.date);
export function demandBasisLabel(festival, month) {
  if (!festival) return '自然月';
  if (['loading', 'choose', 'failed', 'unavailable'].includes(festival.status))
    return '节日推算待就绪';
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

  if (read.rows.length)
    return {
      history: [],
      festival: {
        ...preview,
        status: 'unavailable',
        error: '节日来源仅有基地大类汇总，缺可追溯的基地SKU明细，无法确定产品范围归属',
      },
    };
  return {
    history: calendarHistory,
    festival: {
      ...preview,
      status: 'outside',
      naturalMonths: forecast,
      actualNaturalMonths: months.slice(0, 4),
    },
  };
}
