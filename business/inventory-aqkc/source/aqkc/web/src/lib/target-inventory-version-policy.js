/** @type {{ timeZone: string; nextMonthSwitchDay: number; versionPriority: string[] }} */
const DEFAULT_POLICY = Object.freeze({
  timeZone: "Asia/Shanghai",
  nextMonthSwitchDay: 21,
  versionPriority: ["纠偏", "月初", "滚动"],
});

function chinaDateParts(now, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = (type) => parts.find((part) => part.type === type)?.value ?? "";
  return {
    year: Number(value("year")),
    month: Number(value("month")),
    day: Number(value("day")),
  };
}

function monthKey(year, month) {
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

function nextMonth(year, month) {
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
}

function rowMonthKey(value) {
  const match = String(value ?? "").match(/(20\d{2}-\d{2})-\d{2}/);
  return match ? `${match[1]}-01` : null;
}

export function normalizeTargetInventoryVersion(value) {
  const normalized = String(value ?? "").replace(/\s+/g, "").replaceAll("版", "");
  if (normalized.includes("纠偏")) return "纠偏";
  if (normalized.includes("月初")) return "月初";
  if (normalized.includes("滚动")) return "滚动";
  return normalized;
}

/**
 * 从已发布/已锁定的版本清单中选择工作台默认口径。
 * 数据查询只返回已发布/已锁定记录，因此“是否可用”以返回行是否存在为准。
 */
/**
 * @param {Array<Record<string, string | number | null | undefined>>} rows
 * @param {Date} now
 * @param {{ timeZone: string; nextMonthSwitchDay: number; versionPriority: string[] }} policy
 */
export function selectDefaultPublishedTargetInventory(rows, now = new Date(), policy = DEFAULT_POLICY) {
  const effectivePolicy = { ...DEFAULT_POLICY, ...policy };
  const current = chinaDateParts(now, effectivePolicy.timeZone);
  const currentMonth = monthKey(current.year, current.month);
  const next = nextMonth(current.year, current.month);
  const nextMonthKey = monthKey(next.year, next.month);
  const published = new Map();

  for (const row of rows) {
    const targetMonth = rowMonthKey(row["safety_stock.target_month"]);
    const rawVersion = String(row["safety_stock.inventory_version"] ?? "").trim();
    if (!targetMonth || !rawVersion) continue;
    const versions = published.get(targetMonth) ?? new Map();
    versions.set(normalizeTargetInventoryVersion(rawVersion), rawVersion);
    published.set(targetMonth, versions);
  }

  const canUseNextMonth = current.day >= effectivePolicy.nextMonthSwitchDay
    && (published.get(nextMonthKey)?.size ?? 0) > 0;
  const requestedTargetMonth = current.day >= effectivePolicy.nextMonthSwitchDay
    ? nextMonthKey
    : currentMonth;
  const targetMonth = canUseNextMonth ? nextMonthKey : currentMonth;
  const available = published.get(targetMonth) ?? new Map();
  const normalizedVersion = effectivePolicy.versionPriority.find((candidate) => available.has(candidate)) ?? null;
  const inventoryVersion = normalizedVersion ? available.get(normalizedVersion) : null;

  return {
    requestedTargetMonth,
    targetMonth,
    inventoryVersion: inventoryVersion ?? null,
    normalizedVersion,
    published: Boolean(inventoryVersion),
    fallbackUsed: Boolean(
      inventoryVersion
      && (normalizedVersion !== effectivePolicy.versionPriority[0] || targetMonth !== requestedTargetMonth)
    ),
    switchedToNextMonth: canUseNextMonth,
  };
}
