export const BRANCH_RULESET = {
  solidifiedVersion: "V0.6-260828",
  businessVersion: "V0.6-260828",
  defaultCycleDays: 7,
  preparationDays: 3,
  bigDateDays: 60,
  stagnantDays: 90,
} as const;

export type RuleLifecycle = "draft" | "pending" | "effective" | "paused" | "expired";
export type CycleRuleLevel = "sku" | "material-group" | "category" | "warehouse" | "default";

export type CycleRule = {
  id: string;
  level: CycleRuleLevel;
  objectId?: string;
  cycleDays: number;
  status: RuleLifecycle;
  effectiveFrom?: string;
  effectiveTo?: string;
  reason?: string;
  temporary?: boolean;
};

export type CyclePreviewConfiguration = {
  sku: string;
  materialGroup: string;
  category: string;
  warehouse: string;
  default: string;
  effectiveFrom: string;
  effectiveTo: string;
  reason: string;
  temporary: boolean;
};

export const DEFAULT_CYCLE_PREVIEW: CyclePreviewConfiguration = {
  sku: "7",
  materialGroup: "10",
  category: "14",
  warehouse: "21",
  default: String(BRANCH_RULESET.defaultCycleDays),
  effectiveFrom: "",
  effectiveTo: "",
  reason: "当前业务预览",
  temporary: true,
};

type CycleRuleInput = {
  warehouseId: string;
  sku: string;
  materialGroup: string;
  category: string;
  asOf: string;
  rules: CycleRule[];
  mode?: "preview" | "scheduled";
};

const LEVEL_PRIORITY: CycleRuleLevel[] = ["sku", "material-group", "category", "warehouse", "default"];

function matchesObject(rule: CycleRule, input: CycleRuleInput): boolean {
  if (rule.level === "sku") return rule.objectId === input.sku;
  if (rule.level === "material-group") return rule.objectId === input.materialGroup;
  if (rule.level === "category") return rule.objectId === input.category;
  if (rule.level === "warehouse") return rule.objectId === input.warehouseId;
  return true;
}

function isEffective(rule: CycleRule, input: CycleRuleInput): boolean {
  if (rule.status !== "effective") return false;
  if (input.mode === "scheduled" && rule.temporary) return false;
  if (rule.effectiveFrom && rule.effectiveFrom > input.asOf) return false;
  if (rule.effectiveTo && rule.effectiveTo < input.asOf) return false;
  return matchesObject(rule, input);
}

export function resolveCycleRule(input: CycleRuleInput): CycleRule {
  const selected = [...input.rules]
    .filter((rule) => isEffective(rule, input))
    .sort((left, right) => LEVEL_PRIORITY.indexOf(left.level) - LEVEL_PRIORITY.indexOf(right.level))[0];
  return selected ?? {
    id: "CFG-CYCLE-05",
    level: "default",
    cycleDays: BRANCH_RULESET.defaultCycleDays,
    status: "effective",
    reason: "系统默认",
  };
}

export function calculateTargetInventory(plannedDailyShipment: number, cycleDays: number): number {
  return Math.round((cycleDays + BRANCH_RULESET.preparationDays) * plannedDailyShipment);
}

export function applyCyclePreview<T extends { sku: string; materialGroup: string; category: string; plannedDailyShipment: number }>(
  rows: T[],
  context: { warehouseId: string; asOf: string },
  configuration: CyclePreviewConfiguration,
): Array<T & { cycleDays: number; cycleRuleLevel: CycleRuleLevel; targetInventoryQty: number }> {
  const common = { status: "effective" as const, temporary: configuration.temporary, effectiveFrom: configuration.effectiveFrom || undefined, effectiveTo: configuration.effectiveTo || undefined, reason: configuration.reason };
  const rules: CycleRule[] = [
    { ...common, id: "CFG-CYCLE-01", level: "sku", objectId: "SKU-1001", cycleDays: Number(configuration.sku) || BRANCH_RULESET.defaultCycleDays },
    { ...common, id: "CFG-CYCLE-02", level: "material-group", objectId: "酱料", cycleDays: Number(configuration.materialGroup) || BRANCH_RULESET.defaultCycleDays },
    { ...common, id: "CFG-CYCLE-03", level: "category", objectId: "火锅底料", cycleDays: Number(configuration.category) || BRANCH_RULESET.defaultCycleDays },
    { ...common, id: "CFG-CYCLE-04", level: "warehouse", objectId: context.warehouseId, cycleDays: Number(configuration.warehouse) || BRANCH_RULESET.defaultCycleDays },
    { id: "CFG-CYCLE-05", level: "default", cycleDays: BRANCH_RULESET.defaultCycleDays, status: "effective", reason: "系统默认" },
  ];
  return rows.map((row) => {
    const resolved = resolveCycleRule({ warehouseId: context.warehouseId, sku: row.sku, materialGroup: row.materialGroup, category: row.category, asOf: context.asOf, rules, mode: "preview" });
    return { ...row, cycleDays: resolved.cycleDays, cycleRuleLevel: resolved.level, targetInventoryQty: calculateTargetInventory(row.plannedDailyShipment, resolved.cycleDays) };
  });
}

export function applyPlanToReplenishments<
  T extends { sku: string; cycleDays: number; availableQty: number; inTransitQty: number | null; plannedDailyShipment: number; targetInventoryQty: number; recommendedQty: number | null },
  P extends { sku: string; currentOutboundQty: number; currentTransferQty: number },
>(rows: T[], plans: P[], planningDays = 30): T[] {
  const planBySku = new Map(plans.map((plan) => [plan.sku, plan]));
  return rows.map((row) => {
    const plan = planBySku.get(row.sku);
    if (!plan) return row;
    const plannedDailyShipment = (plan.currentOutboundQty + plan.currentTransferQty) / Math.max(1, planningDays);
    const targetInventoryQty = calculateTargetInventory(plannedDailyShipment, row.cycleDays);
    const recommendedQty = row.inTransitQty === null ? null : Math.max(0, targetInventoryQty - row.availableQty - row.inTransitQty);
    return { ...row, plannedDailyShipment, targetInventoryQty, recommendedQty };
  });
}

export type PlanVersion = {
  id: string;
  month: string;
  kind: "month-start" | "rolling";
  source: "BI" | "human";
  status: "draft" | "confirmed" | "incomplete";
  createdAt: string;
  rows: Array<{ sku: string; quantity: number }>;
};

export function selectPlanVersion(versions: PlanVersion[], month: string, requiredSkus: string[]): PlanVersion | null {
  const complete = versions.filter((version) => {
    if (version.month !== month || version.status !== "confirmed") return false;
    const covered = new Set(version.rows.map((row) => row.sku));
    return requiredSkus.every((sku) => covered.has(sku));
  });
  const byCreatedAt = (left: PlanVersion, right: PlanVersion) => right.createdAt.localeCompare(left.createdAt);
  for (const kind of ["month-start", "rolling"] as const) {
    const candidates = complete.filter((version) => version.kind === kind);
    const human = candidates.filter((version) => version.source === "human").sort(byCreatedAt)[0];
    if (human) return human;
    const bi = candidates.filter((version) => version.source === "BI").sort(byCreatedAt)[0];
    if (bi) return bi;
  }
  return null;
}

export function findConsumptionFirstSkus(
  batches: Array<{ sku: string; ageDays: number; quantity?: number }>,
  shortages: Array<{ sku: string; shortageQty: number }>,
): string[] {
  const bigDateSkus = new Set(batches.filter((batch) => (batch.quantity === undefined || batch.quantity > 0) && batch.ageDays >= BRANCH_RULESET.bigDateDays).map((batch) => batch.sku));
  return [...new Set(shortages.filter((row) => row.shortageQty > 0 && bigDateSkus.has(row.sku)).map((row) => row.sku))];
}

export function canConfirmReplenishment(consumptionFirstSkus: string[], consumptionReviewed: boolean): boolean {
  return consumptionFirstSkus.length === 0 || consumptionReviewed;
}

export const BUSINESS_EXCEPTIONS = {
  seasonSwitch: "标记并人工确认，不自动改变计划或目标",
  substitution: "关系缺失时不自动冲抵，转人工维护",
  newProduct: "仅标记，不自动生成计划",
  activityOrLargeOrder: "单独人工确认",
  clearance: "控制新增补货并转消费处理",
} as const;

export const BUSINESS_EVENT_CODES = ["EVT-BRANCH-01", "EVT-BRANCH-02", "EVT-BRANCH-03", "EVT-BRANCH-04", "EVT-BRANCH-05", "EVT-BRANCH-06", "EVT-BRANCH-07"] as const;
export const BUSINESS_MESSAGE_CODES = ["MSG-BRANCH-01", "MSG-BRANCH-02", "MSG-BRANCH-03", "MSG-BRANCH-04", "MSG-BRANCH-05", "MSG-BRANCH-06"] as const;

export type BusinessTrigger = "urgent-replenishment" | "big-date" | "stagnant" | "order-shortage" | "low-fulfillment" | "stale-data" | "submission-failure" | "resource-infeasible";

export function shouldCreateExternalTouch(trigger: BusinessTrigger, severity: "low" | "medium" | "high"): boolean {
  if (["stale-data", "submission-failure", "resource-infeasible"].includes(trigger)) return severity !== "low";
  return false;
}
