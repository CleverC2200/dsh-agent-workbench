import selectionPolicy from "../config/target-inventory-selection-policy.json";
import {
  normalizeTargetInventoryVersion,
  selectDefaultPublishedTargetInventory,
} from "./target-inventory-version-policy.js";

export type PublishedScopeRow = Record<string, string | number | null | undefined>;

export type SafetyStockScope = {
  targetMonth: string;
  targetMonthLabel: string;
  requestedTargetMonth: string;
  requestedTargetMonthLabel: string;
  versions: string[];
  versionLabel: string;
  selectionRule: string;
  missingVersions: string[];
  published: boolean;
  fallbackUsed: boolean;
};

function monthKey(value: unknown) {
  const match = String(value ?? "").match(/(20\d{2}-\d{2})-\d{2}/);
  return match ? `${match[1]}-01` : null;
}

function monthLabel(value: string) {
  const [year, month] = value.split("-");
  return `${year}年${Number(month)}月`;
}

export function resolveInitialSafetyStockScope(
  rows: PublishedScopeRow[],
  now = new Date(),
): SafetyStockScope {
  const selection = selectDefaultPublishedTargetInventory(rows, now, selectionPolicy);
  const versions = selection.inventoryVersion ? [selection.inventoryVersion] : [];
  const monthRule = selection.switchedToNextMonth
    ? `每月${selectionPolicy.nextMonthSwitchDay}日及以后，次月版本已发布时默认查看次月目标库存`
    : selection.targetMonth !== selection.requestedTargetMonth
      ? `次月版本尚未发布，继续查看当月最新已发布目标库存`
      : `每月1-${selectionPolicy.nextMonthSwitchDay - 1}日默认查看当月目标库存`;
  const versionRule = "同月份版本优先级：纠偏版、月初版、滚动版";
  const fallbackRule = selection.normalizedVersion && selection.normalizedVersion !== selectionPolicy.versionPriority[0]
    ? `；${monthLabel(selection.targetMonth)}没有${selectionPolicy.versionPriority[0]}版，已按规则使用${selection.inventoryVersion}`
    : "";

  return {
    targetMonth: selection.targetMonth,
    targetMonthLabel: monthLabel(selection.targetMonth),
    requestedTargetMonth: selection.requestedTargetMonth,
    requestedTargetMonthLabel: monthLabel(selection.requestedTargetMonth),
    versions,
    versionLabel: selection.inventoryVersion ?? "目标库存版本缺失/未锁定",
    selectionRule: `${monthRule}；${versionRule}${fallbackRule}`,
    missingVersions: selection.published ? [] : selectionPolicy.versionPriority,
    published: selection.published,
    fallbackUsed: selection.fallbackUsed,
  };
}

/**
 * 兼容旧工作台调用。新工作台统一使用 resolveInitialSafetyStockScope，
 * 避免脱离业务日期规则而直接选择未来月份。
 */
export function resolveLatestPublishedSafetyStockScope(
  rows: PublishedScopeRow[],
): SafetyStockScope {
  const published = new Map<string, Map<string, string>>();

  for (const row of rows) {
    const key = monthKey(row["safety_stock.target_month"]);
    const rawVersion = String(row["safety_stock.inventory_version"] ?? "").trim();
    if (!key || !rawVersion) continue;
    const versions = published.get(key) ?? new Map<string, string>();
    versions.set(normalizeTargetInventoryVersion(rawVersion), rawVersion);
    published.set(key, versions);
  }

  const targetMonth = [...published.keys()].sort().at(-1);
  if (!targetMonth) {
    return {
      targetMonth: "",
      targetMonthLabel: "暂无数据",
      requestedTargetMonth: "",
      requestedTargetMonthLabel: "暂无数据",
      versions: [],
      versionLabel: "待发布",
      selectionRule: "工作台默认展示最新已发布的安全库存数据。",
      missingVersions: ["安全库存版本"],
      published: false,
      fallbackUsed: false,
    };
  }

  const available = published.get(targetMonth)!;
  const versionPriority = selectionPolicy.versionPriority;
  const selected = versionPriority.find((version) => available.has(version));
  const selectedVersion = selected ? available.get(selected)! : [...available.values()].sort().at(-1)!;
  const fallbackUsed = selected !== "纠偏";
  const scopeLabel = monthLabel(targetMonth);

  return {
    targetMonth,
    targetMonthLabel: scopeLabel,
    requestedTargetMonth: targetMonth,
    requestedTargetMonthLabel: scopeLabel,
    versions: [selectedVersion],
    versionLabel: selectedVersion,
    selectionRule: `工作台默认展示最新已发布数据：${scopeLabel}${selected ? `，优先使用${selectedVersion}` : `，使用${selectedVersion}`}。`,
    missingVersions: [],
    published: true,
    fallbackUsed,
  };
}
