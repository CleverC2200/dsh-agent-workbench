import type { ObjectData } from "./model";
/** Describe only evidence available to this consumer; absence never proves a source-wide zero. */
export function coverageNotes(o: ObjectData): string[] {
  if (o.error) return [o.error];
  const notes: string[] = [];
  if (o.inventory === null) notes.push("库存：当前查询未返回可用库存值");
  if (o.target === null)
    notes.push(
      o.kind === "base"
        ? "目标：当前结果无可用目标值"
        : "目标：补货目标未覆盖全部有库存的 SKU，不能计算完整差额",
    );
  else if (o.partial?.target)
    notes.push("目标：部分 SKU 目标为空，仅汇总已知目标");
  if (o.age === null)
    notes.push(
      o.ageWeight === 0
        ? "货龄：没有可用于加权的正库存，平均值不适用"
        : "货龄：当前授权结果没有可用于计算的货龄记录",
    );
  else if (o.partial?.age)
    notes.push("货龄：部分库存缺少有效批次/日期，仅汇总可核验库存");
  if (o.over30 == null)
    notes.push(
      o.kind === "base"
        ? "31天以上：日报分段缺失、无效或含未知货龄，数量待核验"
        : "31天以上：分仓来源未提供分段数量，保持未知",
    );
  if (o.shortage === null)
    notes.push("缺货：未返回完整的可用订单/缺口明细，不能认定为零");
  if (o.stagnant === null || o.partial?.stagnant)
    notes.push(
      o.kind === "base"
        ? "滞库：目标或近 30 天动销数据不完整"
        : "滞库：当前返回数据不足以核验全量滞库",
    );
  return notes;
}
