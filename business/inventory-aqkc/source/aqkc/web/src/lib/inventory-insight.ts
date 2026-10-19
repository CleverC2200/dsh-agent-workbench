/** Read-only interpretation of confirmed facts. No thresholds or causes are invented. */
export type InsightSku = {
  base: string;
  category: string;
  sku: string;
  current: number | null;
  target: number | null;
  dailyDemand: number | null;
  last30d: number | null;
};
type Row = Record<string, string | number | null | undefined>;
type Group = {
  base: string;
  category: string;
  current: number | null;
  target: number | null;
  gap: number | null;
  shortage: number | null;
  age60: number | null;
  future7: number | null;
  future14: number | null;
  dailyDemand: number | null;
  last30d: number | null;
};
export const numeric = (value: unknown): number | null =>
  value === null ||
  value === undefined ||
  value === '' ||
  typeof value === 'boolean' ||
  !Number.isFinite(Number(value))
    ? null
    : Number(value);
const sum = (values: (number | null)[]) =>
  values.length && values.every((value) => value !== null)
    ? values.reduce<number>((total, value) => total + value!, 0)
    : null;
const qty = (value: number) =>
  Math.abs(value) >= 10000
    ? `${(value / 10000).toFixed(1)}万箱`
    : `${Math.ceil(value).toLocaleString('zh-CN')}件`;
const key = (base: string, sku: string) => JSON.stringify([base, sku]);
export function buildInventoryInsight(input: {
  skus: InsightSku[];
  pending: Row[] | null;
  age: Row[] | null;
  bases: string[];
  shortage: number | null;
  fulfillment: number | null;
  stale?: boolean;
}) {
  const skus = input.skus.filter((row) => input.bases.includes(row.base));
  const pending =
    input.pending?.filter((row) => input.bases.includes(String(row['workbench.base']))) ?? null;
  const age =
    input.age?.filter((row) => input.bases.includes(String(row['inventory_age.base_name']))) ??
    null;
  const groups = new Map<string, InsightSku[]>();
  for (const row of skus) {
    const id = key(row.base, row.category);
    groups.set(id, [...(groups.get(id) ?? []), row]);
  }
  const pendingMap = new Map(
    pending
      ?.filter((row) => row['workbench.domain'] === 'pending_sku')
      .map((row) => [
        key(String(row['workbench.base']), String(row['workbench.material_code'])),
        row,
      ]),
  );
  const markers = new Set(
    pending
      ?.filter(
        (row) =>
          row['workbench.domain'] === 'pending_base' &&
          numeric(row['workbench.shortage_quantity']) !== null,
      )
      .map((row) => String(row['workbench.base'])),
  );
  const mappedKeys = new Set(skus.map((row) => key(row.base, row.sku)));
  const unmapped = [...pendingMap].some(
    ([id, row]) => !mappedKeys.has(id) && numeric(row['workbench.shortage_quantity']) !== 0,
  );
  const records: Group[] = [...groups.values()].map((rows) => {
    const { base, category } = rows[0],
      ids = new Set(rows.map((row) => row.sku));
    const ages =
      age?.filter(
        (row) =>
          String(row['inventory_age.base_name']) === base &&
          ids.has(String(row['inventory_age.material_code'])),
      ) ?? null;
    const current = sum(rows.map((row) => row.current)),
      target = sum(rows.map((row) => row.target));
    const shortage = markers.has(base)
      ? sum(
          rows.map((row) => {
            const p = pendingMap.get(key(base, row.sku));
            return p ? numeric(p['workbench.shortage_quantity']) : 0;
          }),
        )
      : null;
    return {
      base,
      category,
      current,
      target,
      gap: current === null || target === null ? null : current - target,
      shortage,
      age60: ages?.length
        ? sum(ages.map((row) => numeric(row['inventory_age.age_60_plus'])))
        : null,
      future7: ages?.length
        ? sum(ages.map((row) => numeric(row['inventory_age.future_7_overage'])))
        : null,
      future14: ages?.length
        ? sum(ages.map((row) => numeric(row['inventory_age.future_14_overage'])))
        : null,
      dailyDemand: sum(rows.map((row) => row.dailyDemand)),
      last30d: sum(rows.map((row) => row.last30d)),
    };
  });
  const current = sum(skus.map((row) => row.current)),
    target = sum(skus.map((row) => row.target));
  const gap = current === null || target === null ? null : current - target,
    shortage = input.shortage;
  const classified = records.filter(
    (row) => row.category && row.category !== '未分类' && row.category !== '-',
  );
  const deficit = shortage !== null && shortage > 0;
  // Ranking is dimensional and explicit: current shortage first, then target gap, then age.
  const ranking = deficit
    ? '当前订单缺口'
    : records.some((row) => row.gap !== null && row.gap !== 0)
      ? '目标库存偏差绝对值'
      : '当前60天以上库存';
  const score = (row: Group) =>
    deficit
      ? row.shortage
      : ranking === '目标库存偏差绝对值'
        ? row.gap === null
          ? null
          : Math.abs(row.gap)
        : row.age60;
  const ranked = classified
    .filter((row) => (score(row) ?? 0) > 0)
    .sort(
      (a, b) =>
        score(b)! - score(a)! ||
        key(a.base, a.category).localeCompare(key(b.base, b.category), 'zh-CN'),
    );
  const top = ranked.slice(0, 3),
    names = top.map((row) => `${row.base}×${row.category}`).join('、');
  const reconciled =
    shortage !== null &&
    sum(records.map((row) => row.shortage)) !== null &&
    Math.abs(sum(records.map((row) => row.shortage))! - shortage) < 0.01;
  const completeRanking =
    classified.length === records.length &&
    (deficit ? reconciled && !unmapped : records.every((row) => score(row) !== null));
  const core =
    gap === null
      ? `目标数据不完整，不能判断整体高低库存${shortage === null ? '' : `；当前订单缺口${qty(shortage)}`}`
      : `库存${current === null ? '未知' : qty(current)}${gap === 0 ? '与目标持平' : `${gap > 0 ? '高于' : '低于'}目标${qty(Math.abs(gap))}`}，${shortage === null ? '当前缺口未核实' : `订单缺口${qty(shortage)}`}，${deficit ? (gap >= 0 ? '总量与交付需求存在结构性矛盾' : '低库存已伴随订单交付压力') : shortage === 0 ? (gap < 0 ? '属于潜在缺货而非已发生缺货' : '当前未见已发生缺货') : '不能确认交付影响'}`;
  const lines = [
    `核心判断：${core}。${names ? `${completeRanking ? '主要对象' : '已核实对象'}：${names}。` : ''}`,
  ];
  const baseTotals = input.bases
    .map((base) => ({
      base,
      total: sum(records.filter((row) => row.base === base).map((row) => row.shortage)),
    }))
    .filter((row) => row.total !== null)
    .sort((a, b) => b.total! - a.total!);
  const highest = baseTotals[0];
  const category = highest ? ranked.find((row) => row.base === highest.base)?.category : undefined;
  const relation =
    deficit && highest && category && completeRanking
      ? `${highest.base}缺口${qty(highest.total!)}，以${category}最突出`
      : deficit
        ? '缺口集中范围尚未完整核实'
        : shortage === 0
          ? '无当前缺口，低水位不能等同交付失败'
          : '当前缺口缺少证据';
  lines.push(
    `订单影响：${relation}${input.fulfillment === null ? '' : `；满足率${(input.fulfillment * 100).toFixed(1)}%仅反映事后履约`}。`,
  );
  const shortageGroups = records.filter((row) => (row.shortage ?? 0) > 0);
  const agedGroups = records.filter((row) => (row.age60 ?? 0) > 0);
  const completeAge =
    age !== null &&
    age.length > 0 &&
    age.every(
      (row) =>
        mappedKeys.has(
          key(String(row['inventory_age.base_name']), String(row['inventory_age.material_code'])),
        ) && numeric(row['inventory_age.age_60_plus']) !== null,
    );
  const daily = sum(skus.map((row) => row.dailyDemand)),
    sales = sum(skus.map((row) => row.last30d));
  const overlap = (top.length ? top : shortageGroups).some(
    (row) => (row.age60 ?? 0) > 0 || (row.gap ?? 0) > 0,
  );
  const ageTotal = age?.length
    ? sum(age.map((row) => numeric(row['inventory_age.age_60_plus'])))
    : null;
  const future7 = age?.length
    ? sum(age.map((row) => numeric(row['inventory_age.future_7_overage'])))
    : null;
  const future14 = age?.length
    ? sum(age.map((row) => numeric(row['inventory_age.future_14_overage'])))
    : null;
  const futureDays = future7 !== null && future7 > 0 ? 7 : 14;
  const future = futureDays === 7 ? future7 : future14;
  const stockJudgment =
    deficit && overlap
      ? '主要缺货对象与高库存或高货龄品类重合，品类内原因未确认'
      : deficit && completeRanking && completeAge && agedGroups.length
        ? '主要缺货对象与高货龄品类不重合，呈品类结构错配'
        : ageTotal !== null && ageTotal > 0
          ? '当前大日期存量已有货龄压力，不能等同滞库'
          : future !== null && future > 0
            ? '未来新增超龄风险已触发，不等同当前大日期存量'
            : gap !== null &&
                gap > 0 &&
                daily !== null &&
                daily > 0 &&
                sales !== null &&
                sales / 30 < daily
              ? `近30日日均出货${qty(sales / 30)}低于计划${qty(daily)}，高库存存在消化压力，尚不能定性滞库`
              : gap !== null && gap < 0
                ? '低于目标体现库存水位压力，不能代替当前订单缺口'
                : gap === 0 && shortage === 0
                  ? '库存与目标持平且无当前缺口，未触发总量供需矛盾'
                  : '当前缺少交叉明细，不能确认缺货与高库存、高货龄品类的重合关系';
  lines.push(
    `库存结构：${stockJudgment}${ageTotal !== null && ageTotal > 0 ? `；60天以上${qty(ageTotal)}` : ''}${future !== null && future > 0 ? `，未来${futureDays}日新增超龄${qty(future)}，两者不相加` : ''}。`,
  );
  const missing: string[] = [];
  if (gap === null) missing.push('目标不全');
  if (shortage === null) missing.push('当前缺口未核实');
  if (!completeRanking || !names || top.length < 3) missing.push('不足以确认完整前三对象');
  if (!completeAge) missing.push('货龄明细不全');
  if (input.stale) missing.push('快照过期');
  // Aggregate category overlap is never evidence of a specific SKU cause.
  lines.push(
    `数据边界：${missing.length ? missing.join('、') + '；' : ''}当前只能判断到基地/品类层，不能确认具体SKU原因。`,
  );
  return {
    text: lines.join('\n'),
    ranking,
    top,
    groups: records,
    completeRanking,
    metrics: {
      current,
      target,
      gap,
      shortage,
      age60: ageTotal,
      future7,
      future14,
      fulfillment: input.fulfillment,
      dailyDemand: daily,
      last30d: sales,
    },
    completeAge,
    missing,
  };
}

/** Exact engine evidence published to the page interpreter; no model-side recomputation. */
export type InventoryRiskEvidence = Pick<
  ReturnType<typeof buildInventoryInsight>,
  'text' | 'ranking' | 'top' | 'completeRanking' | 'metrics' | 'completeAge' | 'missing'
> & {
  sources: {
    consumerCode: 'base-safety-stock';
    bases: string[];
    targetMonth: string;
    targetVersions: string[];
    targetSnapshots: string[];
    inventorySnapshots: string[];
    orderSnapshots: string[];
  };
};
