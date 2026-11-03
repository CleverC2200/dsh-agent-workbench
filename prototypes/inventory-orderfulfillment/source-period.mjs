export function fulfillmentSourcePeriod(row, today) {
  if (!row || !Object.hasOwn(row, 'latest_created') || !Object.hasOwn(row, 'latest_load'))
    throw Error('SOURCE_PERIOD_UNAVAILABLE');
  const raw = row?.latest_created;
  if (raw !== null && typeof raw !== 'string') throw Error('INVALID_SOURCE_PERIOD');
  const day = typeof raw === 'string' ? raw.slice(0, 10) : null;
  if (day !== null && (!/^\d{4}-\d{2}-\d{2}$/.test(day) ||
    !Number.isFinite(Date.parse(day + 'T00:00:00Z')) ||
    new Date(day + 'T00:00:00Z').toISOString().slice(0, 10) !== day || day > today))
    throw Error('INVALID_SOURCE_PERIOD');
  return {
    day: today,
    sourceDay: day,
    latestCreated: raw,
    latestLoad: row.latest_load,
    empty: day === null,
    historical: day !== null && day < today,
    delayed: day !== null && day < today && typeof row.latest_load === 'string' &&
      /^\d{4}-\d{2}-\d{2}/.test(row.latest_load) && row.latest_load.slice(0,10) < today,
  };
}

export function fulfillmentSourceDescription(period) {
  if (!period) return '数据截止时间待核实；不是全部历史在办订单';
  if (period.empty) return '当前授权源表无可见订单记录；不能推断其他授权范围没有订单';
  const reason=period.delayed?'源最新入库尚未到今天；':'';
  return `${reason}源最新下单 ${period.latestCreated}；最新入库 ${period.latestLoad ?? '未知'}；仅统计当天创建的订单，不展示历史订单`;
}
