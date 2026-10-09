import { z } from "zod";
import type { WarehouseSnapshot, PlanRow, ReplenishmentRow } from "./domain.ts";
import { resolveCycleRule, type CycleRule } from "./rules.ts";

export const IMPORT_FIELDS = ["仓库编号", "仓库名称", "月份", "SKU编码", "产品名称", "本月出货计划", "本月调拨计划"] as const;
const NINE_COLUMN_FIELDS = ["仓库编码", "仓库名称", "计划月份", "产品编码", "产品名称", "建议出货计划量", "建议调拨计划量", "确认出货计划量", "确认调拨计划量"];
const month = z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/);
export const importedPlanSchema = z.object({
  warehouseName: z.string().trim().min(1).max(100), sku: z.string().trim().min(1).max(64),
  productName: z.string().trim().min(1).max(200), month,
  category: z.string().trim().max(100).default(""), materialGroup: z.string().trim().max(100).default(""),
  outboundQty: z.number().finite().min(0).max(1e9), transferQty: z.number().finite().min(0).max(1e9),
  warehouseCode: z.string().trim().min(1).max(64).optional(),
  suggestedOutboundQty: z.number().finite().min(0).max(1e9).nullable().optional(),
  suggestedTransferQty: z.number().finite().min(0).max(1e9).nullable().optional(),
}).strict();
export type ImportedPlan = z.infer<typeof importedPlanSchema>;
export type PlanningState = { imports: ImportedPlan[]; rules: CycleRule[]; revision: string; available: boolean };
export function currentPlanningMonth(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit" }).format(now).slice(0, 7);
}
export function parseImportedPlans(rows: Record<string, string | number>[], warehouseName: string, warehouseCode?: string, now = new Date()) {
  const errors: { row: number; field: string; message: string }[] = [];
  const plans: ImportedPlan[] = [];
  const seen = new Set<string>();
  const current = currentPlanningMonth(now);
  if (!rows.length || rows.length > 5000) errors.push({ row: 1, field: "工作表", message: "须包含 1–5000 行数据" });
  rows.forEach((row, index) => {
    const modern = "仓库编码" in row || "确认出货计划量" in row;
    const numeric = (key: string) => row[key] === undefined || String(row[key]).trim() === "" ? 0 : Number(row[key]);
    const code = String(row["仓库编号"] ?? row["仓库编码"] ?? row["分仓编码"] ?? "").trim();
    const sku = String(row[modern ? "产品编码" : "SKU编码"] ?? "").trim();
    const targetMonth = String(row[modern ? "计划月份" : "月份"] ?? "").trim();
    const addError = (field: string, message: string) => errors.push({ row: index + 2, field, message });
    if (!code) addError("分仓编码", "分仓编码不能为空");
    else if (!warehouseCode || code !== warehouseCode) addError("分仓编码", "分仓编码必须与当前有权限的分仓一致，请保留编码前导零");
    if (!sku) addError("SKU编码", "SKU编码不能为空");
    if (!targetMonth) addError("月份", "月份不能为空");
    else if (![current, nextMonth(current)].includes(targetMonth)) addError("月份", `仅支持当前月 ${current} 或次月 ${nextMonth(current)}`);
    const parsed = importedPlanSchema.safeParse({
      warehouseName, warehouseCode: code, sku, month: targetMonth,
      productName: String(row["产品名称"] || sku), category: "", materialGroup: "",
      outboundQty: numeric(modern ? "确认出货计划量" : "本月出货计划"), transferQty: numeric(modern ? "确认调拨计划量" : "本月调拨计划"),
      ...(modern ? { suggestedOutboundQty: row["建议出货计划量"] === undefined || String(row["建议出货计划量"]).trim() === "" ? null : numeric("建议出货计划量"), suggestedTransferQty: row["建议调拨计划量"] === undefined || String(row["建议调拨计划量"]).trim() === "" ? null : numeric("建议调拨计划量") } : {}),
    });
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = ({ outboundQty: "本月出货计划", transferQty: "本月调拨计划", suggestedOutboundQty: "建议出货计划量", suggestedTransferQty: "建议调拨计划量", productName: "产品名称" } as Record<string, string>)[String(issue.path[0])];
        if (!field) addError(String(issue.path[0]), "字段格式或长度无效");
        if (field) addError(field, field.includes("计划") ? "计划量须为0至10亿的数字，留空按0处理" : "产品名称长度不能超过200字");
      }
      return;
    }
    const key = `${parsed.data.month}:${parsed.data.sku}`;
    if (seen.has(key)) addError("SKU编码", "同一月份 SKU 重复");
    seen.add(key); plans.push(parsed.data);
  });
  return { plans, errors };
}

export function defaultPlanTemplateMonth(now = new Date()) {
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  return Number(date.slice(8, 10)) >= 20 ? nextMonth(date.slice(0, 7)) : date.slice(0, 7);
}

export function buildPlanTemplateRows(snapshot: WarehouseSnapshot, warehouseCode: string, targetMonth: string) {
  const current = snapshot.planning?.calculationDate?.slice(0, 7) ?? snapshot.plans[0]?.month;
  if (!current || ![current, nextMonth(current)].includes(targetMonth)) throw new Error("所选月份暂无可测算计划，仅支持当前计算月及次月；不会用其他月份数据替代");
  if (!snapshot.replenishments.length) throw new Error("所选分仓暂无可导出的计划数据");
  return snapshot.replenishments.map(row => ({
    仓库编号: warehouseCode, 仓库名称: snapshot.warehouseName, 月份: targetMonth, SKU编码: row.sku, 产品名称: row.productName,
    本月出货计划: (targetMonth === current ? row.currentOutboundQty : row.nextOutboundQty) ?? "",
    本月调拨计划: (targetMonth === current ? row.currentTransferQty : row.nextTransferQty) ?? "",
  }));
}
export function monthDays(value: string) { const [y, m] = value.split("-").map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); }
export function nextMonth(value: string) { const [y, m] = value.split("-").map(Number); return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7); }

/** Select a whole monthly source. Formal transfers are never recomputed on a normal read. */
export function applyBusinessPlanning(base: WarehouseSnapshot, state: PlanningState, shipped: Map<string, number | null>, asOf: string): WarehouseSnapshot {
  const current = asOf.slice(0, 7), next = nextMonth(current);
  const imports = new Map(state.imports.map(row => [`${row.month}:${row.sku}`, row]));
  const humanMonths = new Set(state.imports.map(row => row.month));
  const synchronized = new Map(base.plans.map(row => [row.sku, row]));
  const inventory = new Map(base.inventory.map(row => [row.sku, row]));
  const originals = new Map(base.replenishments.map(row => [row.sku, row]));
  const shortages = new Map<string, number>();
  const orderLines = new Map<string, typeof base.orders[number]["lines"]>();
  const pendingOrders = new Map<string, Set<string>>();
  base.orders.forEach(order => order.lines.forEach(line => {
    orderLines.set(line.sku, [...(orderLines.get(line.sku) ?? []), line]);
    shortages.set(line.sku, (shortages.get(line.sku) ?? 0) + line.shortageQty);
    if (line.shortageQty > 0) {
      const numbers = pendingOrders.get(line.sku) ?? new Set<string>();
      numbers.add(order.orderNo); pendingOrders.set(line.sku, numbers);
    }
  }));
  const skuSet = new Set([...synchronized.keys(), ...state.imports.filter(row => row.month === current || row.month === next).map(row => row.sku)]);
  const replenishments: ReplenishmentRow[] = [];
  const plans: PlanRow[] = [];
  const missing: string[] = [];
  for (const sku of skuSet) {
    const sync = synchronized.get(sku), manual = imports.get(`${current}:${sku}`), future = imports.get(`${next}:${sku}`);
    const stock = inventory.get(sku), original = originals.get(sku);
    const category = manual?.category || future?.category || stock?.category || original?.category || "未分类";
    const materialGroup = manual?.materialGroup || future?.materialGroup || stock?.materialGroup || original?.materialGroup || "未分类";
    const rule = resolveCycleRule({ warehouseId: base.warehouseId, sku, category, materialGroup, asOf, rules: state.rules });
    const cycleDays = rule.cycleDays;
    const syncedOutbound = (target: string) => {
      if (sync?.month === target && sync.currentAvailable !== false) return sync.currentOutboundQty;
      if (sync && nextMonth(sync.month) === target && sync.nextAvailable !== false) return sync.nextOutboundQty;
      return null;
    };
    const outbound = humanMonths.has(current) ? manual?.outboundQty ?? null : syncedOutbound(current);
    const nextOutbound = humanMonths.has(next) ? future?.outboundQty ?? null : syncedOutbound(next);
    const available = original && 'currentAvailableQty' in original ? original.currentAvailableQty ?? null : stock?.availableQty ?? original?.availableQty ?? null;
    const qty = stock?.quantity ?? original?.inventoryQty ?? 0;
    const daily = outbound === null ? null : Math.ceil(outbound / monthDays(current));
    const nextDaily = nextOutbound === null ? null : Math.ceil(nextOutbound / monthDays(next));
    const syncedTransfer = (target: string) => {
      if (sync?.month === target && sync.currentAvailable !== false && sync.currentTransferAvailable !== false) return sync.currentTransferQty;
      if (sync && nextMonth(sync.month) === target && sync.nextAvailable !== false && sync.nextTransferAvailable !== false) return sync.nextTransferQty;
      return null;
    };
    const transfer = humanMonths.has(current) ? manual?.transferQty ?? null : syncedTransfer(current);
    const ending = !humanMonths.has(current) && original && 'expectedMonthEndInventoryQty' in original
      ? original.expectedMonthEndInventoryQty ?? null
      : available === null || transfer === null || outbound === null ? null : available + transfer - outbound;
    const nextTransfer = humanMonths.has(next) ? future?.transferQty ?? null : syncedTransfer(next);
    // Keep the existing tomorrow-start convention; use calendar plans over exactly 30 days.
    const remainingDays = Math.min(30, monthDays(current) - Number(asOf.slice(8, 10)));
    const nextDays = Math.max(0, 30 - remainingDays);
    const shippedValue = shipped.get(sku);
    const actualShipped = shippedValue !== undefined && shippedValue !== null && Number.isFinite(shippedValue) && shippedValue >= 0 ? shippedValue : null;
    // A confirmed zero plan has zero remaining demand even if shipments are unavailable.
    const remainingOutbound = outbound === 0 ? 0 : outbound === null || actualShipped === null ? null : Math.max(0, outbound - actualShipped);
    const forecast = (remainingDays > 0 && daily === null) || (nextDays > 0 && nextDaily === null) ? null : Math.ceil(((daily ?? 0) * remainingDays + (nextDaily ?? 0) * nextDays) / 30);
    const target = daily === null ? 0 : (cycleDays + 3) * daily;
    const lines = orderLines.get(sku) ?? [];
    const preparingKnown = lines.every(line => line.preparingQty != null && line.preparingAllocatedQty != null
      && Number.isFinite(line.preparingQty) && Number.isFinite(line.preparingAllocatedQty)
      && line.preparingQty >= 0 && line.preparingAllocatedQty >= 0 && line.preparingAllocatedQty <= line.preparingQty);
    const preparingQty = lines.every(line => line.preparingQty != null && Number.isFinite(line.preparingQty) && line.preparingQty >= 0)
      ? lines.reduce((sum, line) => sum + line.preparingQty!, 0) : null;
    const preparingRemainingQty = preparingKnown ? lines.reduce((sum, line) => sum + line.preparingQty! - line.preparingAllocatedQty!, 0) : null;
    const orderAdjustedAvailableQty = available === null || preparingRemainingQty === null ? null : available - preparingRemainingQty;
    const gap = orderAdjustedAvailableQty === null ? null : Math.max(0, -orderAdjustedAvailableQty);
    const targetInventoryGapQty = daily === null || orderAdjustedAvailableQty === null ? null : Math.max(0, target - orderAdjustedAvailableQty);
    // Current open transfers include all outstanding orders, not just this month's activity.
    const reportedOpenTransfer = original && "openTransferQty" in original ? original.openTransferQty ?? null : (stock?.orderedNotShippedQty != null && stock?.shippedNotReceivedQty != null
      ? stock.orderedNotShippedQty + stock.shippedNotReceivedQty : null);
    const openTransferQty = reportedOpenTransfer !== null && Number.isFinite(reportedOpenTransfer) && reportedOpenTransfer >= 0 ? reportedOpenTransfer : null;
    const safetyGap = forecast === null || available === null ? null : Math.max(0, (cycleDays + 3) * forecast - available);
    const recommendedQty = gap === null || targetInventoryGapQty === null || openTransferQty === null ? null
      : Math.ceil(Math.max(0, Math.max(gap, targetInventoryGapQty) - openTransferQty));
    const calculationMissing = [outbound === null ? "本月出货计划" : "", available === null ? "可用库存" : "",
      !preparingKnown ? "备单中需求或已占用量" : "", openTransferQty === null ? "调拨中量" : ""].filter(Boolean);
    if (recommendedQty === null) missing.push(sku);
    const productName = manual?.productName ?? future?.productName ?? sync?.productName ?? stock?.productName ?? sku;
    plans.push({ month: current, sku, productName, category, materialGroup, currentAvailable: outbound !== null, currentTransferAvailable: transfer !== null, nextTransferAvailable: nextTransfer !== null, nextAvailable: nextOutbound !== null, currentOutboundQty: outbound ?? 0, currentTransferQty: transfer ?? 0, nextOutboundQty: nextOutbound ?? 0, nextTransferQty: nextTransfer ?? 0, currentDailyOutboundQty: daily ?? 0, nextDailyOutboundQty: nextDaily ?? 0, source: manual || future ? "human" : sync?.source ?? "BI", versionKind: sync?.versionKind ?? "month-start", versionId: state.revision, status: outbound !== null && transfer !== null && nextOutbound !== null && nextTransfer !== null ? "confirmed" : "incomplete", currentSource: manual ? "人工导入" : outbound === null ? "计划未就绪" : "同步数据", nextSource: future ? "人工导入" : nextOutbound === null ? "计划未就绪" : "同步数据" });
    const transit = original ? original.inTransitQty : stock?.inTransitQty ?? null;
    replenishments.push({ sku, productName, category, materialGroup, inventoryQty: qty, availableQty: available ?? 0, inTransitQty: transit, reportedInTransitQty: original?.reportedInTransitQty ?? stock?.reportedInTransitQty ?? null, monthlyDemand: outbound ?? 0, plannedDailyShipment: daily ?? 0, cycleDays, cycleRuleLevel: rule.level, targetInventoryQty: target, recommendedQty, actualQty: recommendedQty, reason: "", urgent: gap !== null && gap > 0, dueDate: original?.dueDate ?? asOf, baseInventoryQty: original?.baseInventoryQty ?? null, baseCapacityQty: original?.baseCapacityQty ?? null, forecastDailyShipment: forecast,
      preparingQty, preparingRemainingQty, orderAdjustedAvailableQty, targetInventoryGapQty,
      shortageQty: gap, pendingOrderCount: pendingOrders.get(sku)?.size ?? 0, currentMonthShippedQty: actualShipped,
      actualDailyOutboundQty: original?.actualDailyOutboundQty ?? stock?.actualDailyOutboundQty ?? null,
      currentRemainingTransferQty: transfer === 0 ? 0 : transfer == null || original?.transferredQty == null ? null : Math.max(0, transfer - original.transferredQty),
      transferReceivedQty: original?.transferReceivedQty ?? null,
      transferPendingQty: original?.transferPendingQty ?? null,
      transferShippedQty: original?.transferShippedQty ?? null,
      openTransferQty,
      transferredQty: original?.transferredQty ?? null, historicalTurnoverDays: original?.historicalTurnoverDays ?? null,
      forecastTurnoverDays: forecast !== null && forecast > 0 ? qty / forecast : null,
      currentOutboundQty: outbound, nextOutboundQty: nextOutbound, currentTransferQty: transfer, nextTransferQty: nextTransfer,
      currentRemainingOutboundQty: remainingOutbound, nextDailyOutboundQty: nextDaily, expectedMonthEndInventoryQty: ending,
      safetyDays: cycleDays + 3, safetyStockGapQty: safetyGap, currentAvailableQty: available, calculationMissing,
      planSourceLabel: `本月：${manual ? "人工导入" : outbound === null ? "计划未就绪" : sync?.source ?? "未提供"}；次月：${future ? "人工导入" : nextOutbound === null ? "计划未就绪" : sync?.source ?? "未提供"}`,
    });
  }
  const allKnown = replenishments.length > 0 && replenishments.every(row => row.recommendedQty !== null);
  const total = allKnown ? replenishments.reduce((sum, row) => sum + row.recommendedQty!, 0) : null;
  const targetDays = resolveCycleRule({ warehouseId: base.warehouseId, sku: "", category: "", materialGroup: "", asOf, rules: state.rules }).cycleDays + 3;
  const uncoveredStock = base.inventory.filter(row => row.quantity > 0 && !skuSet.has(row.sku)).length;
  const uncoveredShortage = [...shortages].filter(([sku, gap]) => gap > 0 && !skuSet.has(sku)).length;
  const replenishmentBySku = new Map(replenishments.map(row => [row.sku, row]));
  // Every inventory SKU must be covered; a partial plan must not masquerade as a warehouse total.
  const forecastCoverage = base.inventory.length > 0 && replenishments.length > 0 && replenishments.every(plan => Number.isFinite(plan.inventoryQty) && plan.forecastDailyShipment != null) && base.inventory.every(row => {
    const plan = replenishmentBySku.get(row.sku);
    return plan && Number.isFinite(plan.inventoryQty) && plan.forecastDailyShipment != null;
  });
  const forecastTotal = replenishments.reduce((sum, row) => sum + (row.forecastDailyShipment ?? 0), 0);
  const forecastStock = replenishments.reduce((sum, row) => sum + row.inventoryQty, 0);
  return { ...base, planning: { ...state, calculationDate: asOf, formula: "order-net-gap-v3", missingCalculationSkus: missing }, plans, replenishments,
    version: `${base.version.slice(0, 80)}:plan5:${state.revision}:${asOf}`,
    dataQuality: base.dataQuality ? { ...base.dataQuality,
      inTransit: { ...base.dataQuality.inTransit, reason: "补货先扣除备单中剩余需求，再计算缺货与目标库存缺口，最后扣除未发调拨订单量及已发未收调拨量；缺项保持待核实。" },
      warnings: [...(base.dataQuality.warnings ?? []).filter(value => !value.includes("在途") && !value.includes("计划") && !value.includes("周转")), ...(missing.length ? [`${missing.length} 个 SKU 缺少本月计划、可用库存、备单数量或调拨中量，补货建议待核实；缺失未按 0 计算。`] : []), ...(uncoveredStock || uncoveredShortage ? [`${uncoveredStock} 个正库存 SKU、${uncoveredShortage} 个缺口 SKU 暂无可选计划，未进入补货计算；可按模板补充导入。`] : []), "计划日均按当月出货计划/自然日数向上取整，展望30日日均也向上取整；展望周转按现库存/展望日均计算；调拨计划不重复计入需求。未维护周期默认 7 天。", "有效在途、基地可用库存、供货关系及真实提前期仍需按源数据核实；生产计划量不等同可承诺产能。"],
    } : base.dataQuality,
    ruleTrace: { ...base.ruleTrace, sourcePriority: "分仓+月份整包：人工导入 > 同步数据；人工缺行不回补 BI", planSource: plans.some(row => row.source === "human") ? "human" : base.ruleTrace.planSource, planVersion: state.revision },
    inventory: base.inventory.map(row => {
      const plan = replenishmentBySku.get(row.sku);
      return { ...row,
        forecastDailyShipment: plan?.forecastDailyShipment ?? null, forecastTurnoverDays: plan?.forecastTurnoverDays ?? null,
        cycleDays: plan?.cycleDays ?? null, targetInventoryQty: plan?.currentOutboundQty != null ? plan.targetInventoryQty : null,
        recommendedQty: plan?.recommendedQty ?? null,
      };
    }),
    metrics: { ...base.metrics, forecastTurnoverDays: forecastCoverage && forecastTotal > 0 ? forecastStock / forecastTotal : null, targetTurnoverDays: targetDays, recommendedQty: total, replenishmentSkuCount: allKnown ? replenishments.filter(row => row.recommendedQty! > 0).length : null },
    operations: base.operations.map(row => row.id === `${base.warehouseId}-pg-replenishment` ? { ...row, title: "按有效周期与计划联动补货", detail: total === null ? `${missing.length} 个 SKU 计算要素不完整，补货合计待核实。` : `按订单扣减后的库存缺口减去调拨中量，建议补货 ${total} 件。`, suggestedAction: "核对计划来源、发货量、库存及人工实际补货量后确认。" } : row),
  };
}
