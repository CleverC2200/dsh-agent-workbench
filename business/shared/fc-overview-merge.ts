type Part = Record<string, any>;
const number = (value: unknown) =>
  value === null ||
  value === undefined ||
  String(value).trim() === '' ||
  !Number.isFinite(Number(value))
    ? null
    : Number(value);

export function mergeFcSummaries(rows: Part[]) {
  const sum = (key: string) => {
    const values = rows.map((row) => number(row[key]));
    return values.some((value) => value === null)
      ? null
      : values.reduce<number>((a, b) => a + (b ?? 0), 0);
  };
  const result: Part = {};
  for (const key of new Set(rows.flatMap(Object.keys))) {
    if (
      /(_qty|_quantity|_count)$/.test(key) ||
      /^(missing_|known_)/.test(key) ||
      [
        'ordered',
        'demand',
        'shortage',
        'shipped',
        'preparing',
        'in_transit',
        'source_occupied',
        'rolling_ship_positive',
        'month_ship_positive',
        'rolling_ship_daily',
        'calculation_daily',
        'target_turn_daily',
        'weighted_age_sum',
        'ccfje',
        'ysfje',
        'fc_act_dl_qty',
      ].includes(key)
    )
      result[key] = sum(key);
    else result[key] = null;
  }
  const weights = rows.map((row) => number(row.age_weight_qty));
  const ageSums = rows.map(
    (row, i) =>
      number(row.weighted_age_sum) ??
      (number(row.weighted_age) !== null && weights[i] !== null
        ? Number(row.weighted_age) * weights[i]!
        : null),
  );
  result.weighted_age_sum = ageSums.some((v) => v === null)
    ? null
    : ageSums.reduce<number>((a, b) => a + (b ?? 0), 0);
  result.weighted_age =
    result.age_weight_qty > 0 && result.weighted_age_sum !== null
      ? result.weighted_age_sum / result.age_weight_qty
      : null;
  const reviewInventory = sum('review_turn_inventory');
  const reviewDaily = sum('review_turn_daily');
  result.review_turn_inventory = reviewInventory;
  result.review_turn_daily = reviewDaily;
  result.historical_turnover_days =
    reviewInventory !== null && reviewDaily !== null && reviewDaily > 0
      ? reviewInventory / reviewDaily
      : null;
  const forecastSupply = number(result.forecast_supply_qty);
  const forecastDaily = sum('forecast_outbound_daily');
  result.forecast_outbound_daily = forecastDaily;
  result.forecast_turnover_days =
    forecastSupply !== null && forecastDaily !== null && forecastDaily > 0
      ? forecastSupply / forecastDaily
      : null;
  const ordered = number(result.fulfillment_order_quantity);
  const shipped = number(result.fulfillment_shipped_quantity);
  result.fulfillment_rate =
    ordered !== null && ordered > 0 && shipped !== null ? shipped / ordered : null;
  return result;
}

export function mergeFcOverviews(groups: Record<string, Part>[]) {
  if (groups.length === 1) return groups[0];
  return Object.fromEntries(
    [...new Set(groups.flatMap(Object.keys))].map((id) => {
      const parts = groups.map((group) => group[id]);
      const failed = parts.some((part) => !part || part.error);
      const mixed = ['snapshotDate', 'configVersion', 'inventoryVersion'].some(
        (key) => new Set(parts.map((part) => part?.[key])).size > 1,
      );
      if (failed || mixed)
        return [
          id,
          {
            error: failed ? '所选分仓数据未全部读取成功' : '所选分仓数据批次不一致，请刷新',
            partial: true,
          },
        ];
      return [
        id,
        {
          ...parts[0],
          summary: parts.every((part) => part.summary)
            ? mergeFcSummaries(parts.map((part) => part.summary))
            : undefined,
          rows: parts.flatMap((part) => part.rows ?? []),
          partial: parts.some((part) => part.partial),
        },
      ];
    }),
  );
}
