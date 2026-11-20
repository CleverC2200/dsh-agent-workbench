const finite = (number) =>
  Number.isFinite(number) && Math.abs(number) <= Number.MAX_SAFE_INTEGER ? number : null;

export function shipmentCoefficientPeriods(cutoff) {
  const [year, month, day] = cutoff.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day === lastDay) return { reason: '统计月已到月底' };
  if (day === 1) return { reason: '上月已过区间无天数' };
  const previousEnd = new Date(Date.UTC(year, month - 1, 0));
  const previousMonth = previousEnd.toISOString().slice(0, 7);
  const previousDays = previousEnd.getUTCDate();
  if (day > previousDays) return { reason: '上月未过区间无天数' };
  const date = (value) => `${previousMonth}-${String(value).padStart(2, '0')}`;
  return {
    elapsed: { start: date(1), end: date(day - 1), days: day - 1 },
    remaining: {
      start: date(day),
      end: date(previousDays),
      days: previousDays - day + 1,
    },
  };
}

export function deriveShipmentCoefficient(elapsed, remaining, periods) {
  const result = { factor: 1, elapsed, remaining };
  if (periods.reason) return { ...result, reason: periods.reason };
  if (elapsed == null || remaining == null)
    return { ...result, reason: '大类缺少完整的上月 BI 区间发运量' };
  if (elapsed <= 0) return { ...result, reason: '上月已过区间日均不大于 0' };
  const ratio = remaining / periods.remaining.days / (elapsed / periods.elapsed.days);
  if (finite(ratio) == null) return { ...result, reason: '系数超出有效范围' };
  return ratio < 1
    ? { ...result, reason: '日均比低于 1，按 1 计算' }
    : { ...result, factor: ratio, reason: '' };
}

export function applyShipmentCoefficient(forecast, coefficient) {
  const basePrediction = forecast.prediction;
  let shipmentFactor = coefficient.factor;
  let coefficientReason = coefficient.reason;
  let prediction = basePrediction;
  if (forecast.usedQuantityFallback || basePrediction == null) {
    shipmentFactor = 1;
    coefficientReason = forecast.usedQuantityFallback ? '已发已备未备合计' : '系统预测量待定';
  } else {
    const adjusted = Math.round(basePrediction * shipmentFactor);
    if (finite(adjusted) == null) {
      shipmentFactor = 1;
      coefficientReason = '修正预测量超出有效范围';
    } else {
      prediction = adjusted;
    }
  }
  return { ...forecast, prediction, basePrediction, shipmentFactor, coefficientReason };
}

export function deriveShipmentForecast(row, passed, total) {
  const orders =
    row.prepped == null || row.unprepped == null ? null : finite(row.prepped + row.unprepped);
  const use30DayPace = row.daily3 != null && row.daily3 <= 0 && row.average > 0;
  const useQuantities =
    row.daily3 != null && row.daily3 <= 0 && row.average != null && row.average <= 0;
  const pace = row.daily3 > 0 ? row.daily3 : use30DayPace ? row.average : null;
  const paceSource =
    orders === 0
      ? '无待发订单，无需估算'
      : use30DayPace
        ? '近30天日均'
        : row.daily3 > 0
          ? '近三天日均'
          : useQuantities
            ? '已发已备未备合计'
            : '待定';
  const shipDays = orders === 0 ? 0 : orders != null && pace > 0 ? finite(orders / pace) : null;
  const hold = row.shipped == null || orders == null ? null : finite(row.shipped + orders);
  const forecastAverage =
    hold != null && shipDays != null ? finite(hold / (passed + shipDays)) : null;
  const rest = shipDays == null ? null : Math.max(0, total - passed - shipDays);
  const noShipmentQuantities = row.shipped === 0 && row.prepped === 0 && row.unprepped === 0;
  const sourceDateIssues = [];
  if (row.sourceDays !== undefined || row.duplicateDays !== undefined) {
    const period = `${row.month}-01 至 ${row.month}-${String(passed).padStart(2, '0')}`;
    if (!Number.isSafeInteger(row.sourceDays) || row.sourceDays < 0)
      sourceDateIssues.push(`${period}来源日期天数缺失或无效`);
    else if (row.sourceDays !== passed)
      sourceDateIssues.push(
        `${period}应有${passed}天，实际${row.sourceDays}天，${row.sourceDays < passed ? `缺${passed - row.sourceDays}天，具体日期待核` : '来源日期范围冲突'}`,
      );
    if (!Number.isSafeInteger(row.duplicateDays) || row.duplicateDays < 0)
      sourceDateIssues.push(`${period}重复日期条数缺失或无效`);
    else if (row.duplicateDays > 0)
      sourceDateIssues.push(`${period}来源日期重复${row.duplicateDays}条，具体日期及数量冲突待核`);
  }
  const shipmentSourceComplete = !sourceDateIssues.length;
  const confirmedNoShipment =
    noShipmentQuantities &&
    (finite(row.daily3) != null ||
      (passed > 0 &&
        passed < 3 &&
        row.daily3 === null &&
        row.sourceDays === passed &&
        row.duplicateDays === 0)) &&
    finite(row.average) != null &&
    shipmentSourceComplete;
  const prediction = !shipmentSourceComplete
    ? null
    : useQuantities
      ? hold
      : hold === 0
        ? confirmedNoShipment
          ? 0
          : null
        : forecastAverage == null
          ? null
          : finite(Math.round(forecastAverage * rest + hold));
  const usedQuantityFallback = useQuantities && prediction != null;
  return {
    ...row,
    average: row.average ?? null,
    shipDays: usedQuantityFallback ? 0 : shipDays,
    hold,
    forecastAverage,
    rest,
    prediction,
    pace,
    paceSource,
    usedQuantityFallback,
    confirmedNoShipment,
    sourceDateIssue: sourceDateIssues.join('；'),
    forecastIssue:
      prediction == null
        ? !shipmentSourceComplete
          ? `${sourceDateIssues.join('；')}；预估保留待核`
          : `缺失或无效发货依据：${
              ['shipped', 'prepped', 'unprepped', 'daily3', 'average']
                .filter((field) => finite(row[field]) == null)
                .map(
                  (field) =>
                    ({
                      shipped: '本月已发货',
                      prepped: '已备',
                      unprepped: '未备',
                      daily3: '近三天日均',
                      average: '近30天日均',
                    })[field],
                )
                .join('、') || '预测计算超出有效范围'
            }`
        : '',
  };
}
