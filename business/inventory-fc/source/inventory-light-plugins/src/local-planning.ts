import { z } from "zod";
import {
  parseImportedPlans,
  type PlanningState,
} from "../../fc/src/lib/planning.ts";
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const d = new Date(value + "T00:00:00Z");
    return (
      Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value
    );
  }, "日期无效");
const rule = z
  .object({
    id: z.string().min(1).max(64),
    level: z.enum(["sku", "material-group", "category", "warehouse"]),
    objectId: z.string().trim().min(1).max(100),
    cycleDays: z.number().int().min(1).max(365),
    status: z.enum(["effective", "paused"]),
    effectiveFrom: date.optional(),
    effectiveTo: date.optional(),
  })
  .strict()
  .refine(
    (r) =>
      !r.effectiveFrom || !r.effectiveTo || r.effectiveTo >= r.effectiveFrom,
    "结束日期不能早于生效日期",
  );

// Memory belongs to this iframe only. A preview never changes the GEA baseline.
export class LocalPlanning {
  private states = new Map<string, PlanningState>();
  get(id: string): PlanningState | undefined {
    return this.states.get(id);
  }
  clear() {
    this.states.clear();
  }
  update(
    warehouse: { id: string; name: string; pickupPointCode: string },
    input: any,
    now = new Date(),
  ) {
    if (input.action === "reset") {
      this.states.delete(warehouse.id);
      return;
    }
    const before = this.states.get(warehouse.id) ?? {
      imports: [],
      rules: [],
      revision: "",
      available: false,
    };
    let next = { ...before };
    if (input.action === "import") {
      if (
        !Array.isArray(input.rows) ||
        input.rows.some(
          (r: any) => !r || typeof r !== "object" || Array.isArray(r),
        )
      )
        throw Error("计划行格式无效");
      const { plans, errors } = parseImportedPlans(
        input.rows,
        warehouse.name,
        warehouse.pickupPointCode,
        now,
      );
      if (errors.length)
        throw Object.assign(Error("计划校验失败，未应用任何行"), { errors });
      // Imported months are complete packages. Preserve other months, never fill omitted SKUs from an old package.
      const months = new Set(plans.map((p) => p.month));
      next.imports = [
        ...before.imports.filter((p) => !months.has(p.month)),
        ...plans,
      ];
    } else if (input.action === "cycle") {
      const rules = z.array(rule).max(500).parse(input.rules);
      const ids = new Set(),
        objects = new Set();
      for (const r of rules) {
        const key = r.level + ":" + r.objectId;
        if (ids.has(r.id) || objects.has(key))
          throw Error("周期规则对象或编号重复");
        if (r.level === "warehouse" && r.objectId !== warehouse.id)
          throw Error("规则不属于当前分仓");
        ids.add(r.id);
        objects.add(key);
      }
      next.rules = rules;
    } else throw Error("不支持的本页预览操作");
    next.revision = "local-preview-" + crypto.randomUUID();
    this.states.set(warehouse.id, next);
  }
}
