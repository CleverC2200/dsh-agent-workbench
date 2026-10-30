export const shippableDaysTarget = '全国<12.5天（郑州≤12.5天，其他基地<11天）';
export const performanceStyleVersion = 1;

export function shippableDaysState(value, base = '') {
  if (value === null || value === undefined || !Number.isFinite(value)) return '数据不足';
  if (base === '未映射' || base === '归属待补全') return '数据不足';
  const met = base === '郑州' ? value <= 12.5 : value < (base && base !== '合计' ? 11 : 12.5);
  return met ? '健康' : '严重';
}

export function performanceCurrentCell(name, value, text, base = '') {
  if (value === null || value === undefined || !Number.isFinite(value)) return text;
  const bad =
    name === '订单满足率'
      ? value <= 95
      : name === '准交率'
        ? value <= 98.5
        : name === '周转天数'
          ? shippableDaysState(value, base) === '严重'
          : false;
  return { text, state: bad ? 'bad' : 'good', raw: value };
}

export function highlightAgePeak(rows, ageIndex) {
  const candidates = rows.filter((row) => row[0] !== '合计' && Number.isFinite(row[ageIndex]?.raw));
  if (!candidates.length) return rows;
  const peak = Math.max(...candidates.map((row) => row[ageIndex].raw));
  for (const row of candidates) if (row[ageIndex].raw === peak) row[ageIndex].state = 'warning';
  return rows;
}
