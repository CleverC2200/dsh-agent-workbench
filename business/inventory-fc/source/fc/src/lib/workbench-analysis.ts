import type { WarehouseSnapshot } from "./domain.ts";
import { summarizeCalculatedReplenishment } from "./replenishment-summary.ts";
export const known = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
export const quantity = (value: number | null | undefined) => known(value) ? Math.ceil(value).toLocaleString("zh-CN") : "-";
export const decimal = (value: number | null | undefined) => known(value) ? value.toFixed(1) : "-";
export function fulfillment(value: string) {
  const match = /^\s*(\d+(?:\.\d+)?)\s*%\s*$/.exec(value ?? "");
  return match ? `${Number(match[1]).toFixed(1)}%` : "-";
}
export function currentOrderMetrics(snapshot: WarehouseSnapshot) {
  const lines = snapshot.orders.flatMap(order => order.lines);
  const sum = (values: (number | null | undefined)[]) => values.every(known) ? values.reduce<number>((total, value) => total + (value as number), 0) : null;
  return snapshot.page ? { quantity: snapshot.page.overview.currentOrderQty ?? null, preparing: snapshot.page.overview.preparingQty ?? null }
    : { quantity: sum(lines.map(line => line.orderedQty)), preparing: sum(lines.map(line => line.preparingQty)) };
}
export type WorkbenchAnalysis = { judgment: string; relationship: string; boundary: string; summary: string };
/** Evaluate whole-warehouse evidence before list pagination. No causal inference from missing SKU detail. */
export function buildWorkbenchAnalysis(snapshot: WarehouseSnapshot): WorkbenchAnalysis {
  if (snapshot.page?.overview.insight) return snapshot.page.overview.insight;
  const m = snapshot.metrics, calculated = summarizeCalculatedReplenishment(snapshot);
  const stock = m.inventoryQty, gap = m.shortageQty, replenishment = calculated.quantity;
  const risk = m.bigDateQty, riskSkus = m.bigDateSkuCount;
  let judgment = "当前暂无可确认的库存经营指标。", relationship = "", boundary = "";
  const scope = calculated.partial ? "已核实范围" : "";
  if (known(replenishment) && replenishment > 0 && known(risk) && risk > 0) {
    judgment = `补货需求与货龄风险并存：${scope}补货量${quantity(replenishment)}件，大日期库存${quantity(risk)}件。`;
    relationship = `补货涉及${quantity(calculated.skuCount)}个SKU，大日期涉及${quantity(riskSkus)}个SKU${known(gap) ? `，当前订单缺口${quantity(gap)}件` : ""}；${known(gap) && replenishment > gap ? "补货高于当前缺口，两者不能互相替代。" : "缺口、补货与大日期不能互相替代。"}缺少SKU交集证据，不能把并存归因为计算错误。`;
    boundary = "当前只能判断现象，不能确认具体SKU原因。";
  } else if (known(gap) && gap > 0 && known(stock)) {
    judgment = `库存与订单缺口并存：当前库存${quantity(stock)}件，仍有${quantity(gap)}件缺口。`;
    relationship = known(replenishment) ? `${scope}补货量${quantity(replenishment)}件，涉及${quantity(calculated.skuCount)}个SKU；补货覆盖订单与目标库存需求，不能用全仓库存抵减SKU缺口，也不能把补货量等同于缺口。` : "全仓库存不能代表缺货SKU的可供量，订单缺口也不能替代目标库存差额。";
    boundary = "当前只能判断现象，不能确认具体SKU原因。";
  } else if (known(replenishment) && replenishment > 0 && known(m.shippedNotReceivedQty)) {
    judgment = `${scope}补货需求${quantity(replenishment)}件与调拨在途${quantity(m.shippedNotReceivedQty)}件并存。`;
    relationship = `补货涉及${quantity(calculated.skuCount)}个SKU；计算已扣除调拨供给，不能再将两者相减。在途并非现货，数量并存不能证明供给已满足当前需求。`;
    boundary = "当前只能判断现象，不能确认具体SKU原因。";
  } else if (known(stock)) {
    judgment = `当前库存${quantity(stock)}件${known(gap) ? `，订单缺口${quantity(gap)}件` : ""}。`;
    relationship = known(replenishment) ? `${scope}补货量${quantity(replenishment)}件；订单缺口只衡量当前订单压力，与目标库存及货龄风险属于不同范围，不能据此推断库存结构健康。` : "缺少可比的目标库存与补货范围，当前库存总量不足以证明供需平衡。";
    boundary = "当前只能判断现象，不能确认具体SKU原因。";
  }
  if (calculated.partial && relationship && !judgment.includes("已核实范围") && !relationship.includes("已核实范围")) boundary += "补货仅含已核实范围。";
  const summary = relationship ? `核心判断：${judgment}关系分析：${relationship}${boundary ? `数据边界：${boundary}` : ""}` : judgment;
  return { judgment, relationship, boundary, summary };
}
