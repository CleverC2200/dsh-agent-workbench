import type { ObjectData } from "./model";
import { DATA_PERMISSION_MESSAGE } from "../../../../../shared/query-error.js";
/** Keep independent sources visible; never calculate zero from a cropped input. */
export function applySourcePermissions(
  object: ObjectData,
  gaps: string[] = [],
  failed: string[] = [],
): ObjectData {
  const missing = [...gaps, ...failed];
  if (!missing.length) return object;
  const result = { ...object };
  const has = (...sources: string[]) =>
    sources.some((source) => missing.includes(source));
  if (has("stock", "inventory")) result.inventory = null;
  if (has("stock", "plan", "inventory")) result.target = null;
  if (has("age", "inventory")) {
    result.age = null;
    result.ageWeight = null;
    result.over30 = null;
  }
  if (has("pending", "fulfillment", "operation", "inventory", "plan"))
    result.shortage = null;
  if (has("stock", "age", "inventory")) result.stagnant = null;
  result.risks = result.risks.filter((r) =>
    ["缺货", "低库存"].includes(r.type)
      ? result.shortage !== null
      : ["货龄", "大日期"].includes(r.type)
        ? result.age !== null
        : r.type === "滞库"
          ? result.stagnant !== null
          : true,
  );
  result.error = gaps.length
    ? DATA_PERMISSION_MESSAGE
    : "数据读取失败，请刷新重试";
  return result;
}
