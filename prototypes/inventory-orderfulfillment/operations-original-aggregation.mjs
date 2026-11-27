import { shanghaiTime } from './order-metrics.mjs';
export const operationsCustomerGroups = {
  dealer: ['jxs', 'kajxs'],
  direct: ['dc', 'kamd'],
  transfer: ['nbkhwl'],
  dc: ['nbkh'],
  export: ['hwkh'],
};
const customerLabels = {
  dealer: '经销商',
  direct: '直营',
  transfer: '调拨',
  dc: '分拨',
  export: '出口',
};
const customerGroup = (type) =>
  Object.keys(operationsCustomerGroups).find((key) => operationsCustomerGroups[key].includes(type));
export function knownOrderPlanSummary(rows) {
  let quantity = 0,
    covered = 0,
    total = 0;
  if (!rows.length) return null;
  for (const row of rows) {
    const count = Number(row.ordered_coverage),
      source = Number(row.source_rows);
    if (
      row.ordered_coverage == null ||
      row.source_rows == null ||
      !Number.isSafeInteger(count) ||
      !Number.isSafeInteger(source) ||
      count < 0 ||
      source < count ||
      source < 1
    )
      return null;
    if (count > 0) {
      if (row.ordered_known == null || !Number.isFinite(Number(row.ordered_known))) return null;
      quantity += Number(row.ordered_known);
    }
    covered += count;
    total += source;
  }
  return { quantity, covered, total };
}
const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const total = (rows, get) =>
  rows.length && rows.every((row) => finite(get(row)))
    ? rows.reduce((sum, row) => sum + get(row), 0)
    : NaN;
const group = (rows, get) => {
  const groups = new Map();
  for (const row of rows) {
    const key = JSON.stringify(get(row));
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return [...groups.values()];
};
const bands = ['d3', 'd3_6', 'd6_10', 'd10p'];
function summarize(rows, today, get = (row) => row['合计']) {
  const result = {
    qty: total(rows, (row) => get(row).qty),
    orders: rows.length,
    unprepared: total(rows, (row) => get(row).unprepared),
    ...Object.fromEntries(bands.map((key) => [key, 0])),
  };
  for (const row of rows) {
    const time = shanghaiTime(row.date);
    const day = time === null ? null : new Date(time + 8 * 3600000).toISOString().slice(0, 10);
    const age =
      day === null
        ? NaN
        : (Date.parse(today + 'T00:00:00Z') - Date.parse(day + 'T00:00:00Z')) / 86400000;
    if (!Number.isFinite(age) || age < 0) {
      for (const key of bands) result[key] = NaN;
      continue;
    }
    result[bands[age < 3 ? 0 : age < 6 ? 1 : age < 10 ? 2 : 3]]++;
  }
  return result;
}
const rateKeys = ['rate95', 'rate90_95', 'rate80_90', 'rate70_80', 'rateBelow70', 'unallocated'];
function rateGroup(rows, quantity = false) {
  const result = Object.fromEntries(rateKeys.map((key) => [key, 0]));
  if (
    !rows.length ||
    rows.some(
      (row) =>
        !finite(row['合计'].qty) ||
        row['合计'].qty <= 0 ||
        !finite(row['合计'].occupied) ||
        row['合计'].occupied < 0 ||
        row['合计'].occupied > row['合计'].qty,
    )
  )
    return Object.fromEntries(rateKeys.map((key) => [key, NaN]));
  for (const row of rows) {
    const rate = row['合计'].occupied / row['合计'].qty;
    const key =
      rate === 0
        ? 'unallocated'
        : rate >= 0.95
          ? 'rate95'
          : rate >= 0.9
            ? 'rate90_95'
            : rate >= 0.8
              ? 'rate80_90'
              : rate >= 0.7
                ? 'rate70_80'
                : 'rateBelow70';
    result[key] += quantity ? row['合计'].qty : 1;
  }
  return result;
}
export function bindPendingBreakdowns(data, template, today) {
  const rows = data.orderDetail ?? [];
  const empty = () => ({
    qty: NaN,
    orders: NaN,
    unprepared: NaN,
    ...Object.fromEntries(bands.map((key) => [key, NaN])),
  });
  const fields = [
    'total',
    'dealer',
    'direct',
    'transfer',
    'dc',
    'export',
    'lack',
    'customer',
    'other',
    'unmarked',
    'notdue',
  ];
  const build = (name, groupRows) => {
    const first = groupRows[0];
    const row = Object.assign(template(name), {
      base: first.base,
      attr: groupRows.every((row) => row.attr && row.attr === first.attr) ? first.attr : '',
      pickup: first.pickup,
      region: first.region,
      province: first.province,
      group: first.group,
      custType: first.custType,
      date: first.date.slice(0, 10) || '日期未知',
    });
    for (const field of fields) row[field] = empty();
    row.total = summarize(groupRows, today);
    for (const field of ['lack', 'notdue', 'unmarked']) {
      if (groupRows.some((order) => typeof order.reasonFlags?.[field] !== 'boolean')) continue;
      const matches = groupRows.filter((order) => order.reasonFlags[field]);
      row[field] = matches.length
        ? summarize(matches, today)
        : { qty: 0, orders: 0, unprepared: 0, ...Object.fromEntries(bands.map((key) => [key, 0])) };
    }
    if (groupRows.every((order) => customerGroup(order.custType)))
      for (const [field, types] of Object.entries(operationsCustomerGroups)) {
        const matches = groupRows.filter((order) => types.includes(order.custType));
        row[field] = matches.length
          ? summarize(matches, today)
          : {
              qty: 0,
              orders: 0,
              unprepared: 0,
              ...Object.fromEntries(bands.map((key) => [key, 0])),
            };
      }
    return row;
  };
  data.unopenPickup = group(rows, (row) => [row.base, row.pickup]).map((rows) =>
    build('unopenPickup', rows),
  );
  data.unopenOrg = group(rows, (row) => [row.region, row.province, row.group]).map((rows) =>
    build('unopenOrg', rows),
  );
  data.unopenTime = group(rows, (row) => [row.date.slice(0, 10), row.custType]).map((rows) =>
    build('unopenTime', rows),
  );
  data.unopenPickupReason = group(rows, (row) => [row.base, row.pickup]).map((rows) =>
    build('unopenPickupReason', rows),
  );
  data.unopenCustReason = group(rows, (row) => [
    customerGroup(row.custType) ?? row.custType,
    row.attr,
  ]).map((rows) =>
    Object.assign(build('unopenCustReason', rows), {
      custType: customerLabels[customerGroup(rows[0].custType)] ?? rows[0].custType,
    }),
  );
  data.unopenOrgItem = group(rows, (row) => [
    row.region,
    row.province,
    row.group,
    row.custType,
  ]).map((rows) => {
    const result = build('unopenOrgItem', rows);
    for (const item of ['水饺', '汤圆', '馄饨', '面点', '预制食材', '火锅料', '休闲', '粽子'])
      result[item] = summarize(rows, today, (row) => row[item] ?? empty());
    return result;
  });
  data.baseRate = {};
  data.baseRateOrders = {};
  data.pickupRate = {};
  for (const grouped of group(rows, (row) => [row.base || '归属未知'])) {
    const base = grouped[0].base || '归属未知';
    data.baseRate[base] = rateGroup(grouped, true);
    data.baseRateOrders[base] = rateGroup(grouped);
  }
  for (const grouped of group(rows, (row) => [row.pickup]))
    data.pickupRate[grouped[0].pickup] = rateGroup(grouped, true);
  data.globalRateOrders = rateGroup(rows);
  data.globalRateQty = rateGroup(rows, true);
  for (const region of data.areaProgress ?? []) {
    const id = JSON.stringify([region.region, region.province, region.salesGroup]);
    const candidates = rows.filter((row) => row.organizationKeys?.includes(id));
    const consistent = candidates.every((row) => row.organizationKeys.length === 1);
    Object.assign(region, rateGroup(consistent ? candidates : [], true));
  }
  data.rateDist = Object.fromEntries(
    ['custType', 'reason', 'pickup', 'group', 'date'].map((field) => [
      field,
      Object.fromEntries(
        group(rows, (row) => [field === 'date' ? row.date.slice(0, 7) : row[field]]).map(
          (grouped) => [
            field === 'date' ? grouped[0].date.slice(0, 7) : grouped[0][field],
            rateGroup(grouped),
          ],
        ),
      ),
    ]),
  );
  const known = rows.filter(
    (row) =>
      finite(row['合计'].qty) &&
      row['合计'].qty > 0 &&
      finite(row['合计'].occupied) &&
      row['合计'].occupied >= 0 &&
      row['合计'].occupied <= row['合计'].qty,
  );
  const high = known.filter((row) => row['合计'].occupied / row['合计'].qty >= 0.9);
  data.rateCoverage = {
    knownOrders: known.length,
    totalOrders: rows.length,
    highOrders: high.length,
    highQty: high.length ? total(high, (row) => row['合计'].qty) : 0,
  };
  data.rate90above =
    known.length === rows.length && rows.length
      ? {
          qty: data.rateCoverage.highQty,
          orders: high.length,
          qtyRatio: data.rateCoverage.highQty / total(rows, (row) => row['合计'].qty),
          orderRatio: high.length / rows.length,
        }
      : { qty: NaN, orders: NaN, qtyRatio: NaN, orderRatio: NaN };
  const completeRate = (group) => rateKeys.every((key) => finite(group?.[key]));
  if (Object.values(data.baseRate ?? {}).some(completeRate)) data.liveCharts.push('c_base_rate');
  if (Object.values(data.rateDist ?? {}).some((groups) => Object.values(groups).some(completeRate)))
    data.liveCharts.push('c_rate_dist');
  if (data.unopenOrg.some((row) => finite(row.total.qty))) data.liveCharts.push('c_un_org');
  if (
    data.unopenPickup.some(
      (row) =>
        finite(row.total.qty) &&
        ['dealer', 'direct', 'transfer', 'dc'].every((field) => finite(row[field].qty)),
    )
  )
    data.liveCharts.push('c_un_pk');
  if (
    data.unopenPickupReason.some((row) =>
      ['customer', 'notdue', 'unmarked'].some((field) => finite(row[field].qty)),
    )
  )
    data.liveCharts.push('c_un_rsn2');
  if (
    data.unopenCustReason.some((row) =>
      ['lack', 'customer', 'unmarked', 'other'].some((field) => finite(row[field].qty)),
    )
  )
    data.liveCharts.push('c_un_cust');
  const dates = group(data.unopenTime, (row) => [row.date]);
  if (
    dates.some((rows) =>
      ['total', 'lack', 'unmarked'].some((field) => finite(total(rows, (row) => row[field].qty))),
    )
  )
    data.liveCharts.push('c_un_time');
  const itemTotals = ['水饺', '汤圆', '馄饨', '面点', '预制食材', '火锅料', '休闲', '粽子'].map(
    (item) => ({
      qty: total(data.unopenOrgItem, (row) => row[item].qty),
      unprepared: total(data.unopenOrgItem, (row) => row[item].unprepared),
    }),
  );
  if (itemTotals.every((row) => finite(row.qty))) data.liveCharts.push('c_item_unopen');
  if (
    itemTotals.every((row) => finite(row.qty) && finite(row.unprepared)) ||
    Object.values(data.itemUnopenCoverage ?? {}).some(
      (row) => row.qty.covered > 0 || row.unprepared.covered > 0,
    )
  )
    data.liveCharts.push('c_un_item');
}
export function bindKnownShortages(data, cache, template) {
  const rows = cache.get('shortage.sku')?.rows;
  if (!rows) return;
  const groups = group(rows, (row) => [row.base, row.sku]);
  const key = (base, sku) => JSON.stringify([base, sku]);
  const escaped = (value) =>
    String(value ?? '').replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
    );
  const map = new Map(data.sku.map((sku) => [key(sku.pickup, sku.code), sku]));
  for (const source of groups) {
    const row = source[0],
      id = key(escaped(row.base), escaped(row.sku));
    const covered =
      row.inventory_coverage === undefined ? row.covered_groups : row.inventory_coverage;
    const sku =
      map.get(id) ??
      Object.assign(template('sku'), {
        pickup: escaped(row.base),
        code: escaped(row.sku),
        name: escaped(row.material_name),
        item: escaped(row.item),
      });
    const valid =
      source.length === 1 &&
      Number(row.duplicate_groups) === 0 &&
      Number(covered) === Number(row.execution_sku_groups) &&
      Number(row.execution_sku_groups) > 0 &&
      row.inventory_gap !== null &&
      Number.isFinite(Number(row.inventory_gap)) &&
      Number(row.inventory_gap) >= 0;
    sku.lackToday = valid ? -Number(row.inventory_gap) : NaN;
    sku.lackOrdersToday =
      valid &&
      row.inventory_orders != null &&
      Number.isSafeInteger(Number(row.inventory_orders)) &&
      Number(row.inventory_orders) >= 0
        ? Number(row.inventory_orders)
        : NaN;
    sku.shortageCoverage = {
      covered: Number(covered),
      matched: Number(row.execution_sku_groups),
      complete: valid,
    };
    map.set(id, sku);
  }
  data.sku = [...map.values()];
  data.shortageRead = true;
  if (data.sku.some((row) => Number.isFinite(row.lackToday))) data.liveCharts.push('c_short_top');
  if (
    data.sku.some((row) =>
      ['prodToday', 'prod1', 'prod2', 'prod3', 'prod4', 'prod5'].every((key) =>
        Number.isFinite(row[key]),
      ),
    )
  )
    data.liveCharts.push('sd_prod');
}
export function knownShortageSummary(rows) {
  const known = rows.filter((row) => Number.isFinite(row.lackToday));
  const lacking = known.filter((row) => row.lackToday < 0);
  const turn = rows.filter(
    (row) =>
      Number.isFinite(row.shipDays) && row.shipDays >= 17 && (row.prodToday > 0 || row.prod1 > 0),
  );
  const qty = lacking.reduce((sum, row) => sum - row.lackToday, 0);
  return {
    knownSkus: known.length,
    totalSkus: rows.length,
    qty: known.length ? qty : NaN,
    skus: known.length ? lacking.length : NaN,
    turnSkus: turn.length,
    turnLackQty: turn.some((row) => Number.isFinite(row.lackToday))
      ? turn
          .filter((row) => Number.isFinite(row.lackToday))
          .reduce((sum, row) => sum + Math.max(-row.lackToday, 0), 0)
      : NaN,
    turnKnown: rows.some(
      (row) =>
        Number.isFinite(row.shipDays) &&
        (Number.isFinite(row.prodToday) || Number.isFinite(row.prod1)),
    ),
  };
}
