import { applySourcePermissions } from "./permissions";
import {
  loadDailyReportInput,
  catalog,
  load,
  clearFacts,
  clearReadCache,
} from "./mock-input";
import { buildDailyReport } from "../../../aqkc/web/src/lib/daily-report";
import { known, sum, type ObjectData, type Risk } from "./model";
export function reset() {
  clearFacts();
  clearReadCache();
}
export async function loadPersonal(
  onObjects: (o: ObjectData[]) => void,
  signal?: AbortSignal,
) {
  const objects: ObjectData[] = [];
  const errors: string[] = [];
  const push = (items: ObjectData[]) => {
    signal?.throwIfAborted();
    objects.push(...items);
    onObjects([...objects]);
  };
  await Promise.allSettled([
    (async () => {
      try {
        const input = await loadDailyReportInput();
        if (input.failedSources.length)
          errors.push(
            "基地部分数据源未返回：" + input.failedSources.join("、"),
          );
        const names = [
          ...new Set(
            [...input.stock, ...input.age].map((r) => r.base).filter(Boolean),
          ),
        ];
        push(
          names
            .map((name) => {
              const report = buildDailyReport({
                ...input,
                selectedBases: [name],
                includeAllRisks: true,
              });
              const metric = (label: string) =>
                known(report.metrics.find((m) => m.label === label)?.value);
              const id = "base:" + name;
              const unknownAgeQuantity = known(
                report.ageBands.find((band) => band.label === "货龄未知")
                  ?.quantity,
              );
              const over30 =
                input.failedSources.includes("age") || unknownAgeQuantity !== 0
                  ? null
                  : sum(
                      ["31–40天", "41–60天", "60+天"].map((label) =>
                        known(
                          report.ageBands.find((band) => band.label === label)
                            ?.quantity,
                        ),
                      ),
                    );
              return {
                id,
                name: name + "基地",
                kind: "base" as const,
                inventory: metric("当前库存"),
                target: report.missingTargetCount ? null : metric("目标库存"),
                age: metric("平均货龄"),
                ageWeight: known(report.ageInventory),
                over30,
                shortage: report.metrics
                  .find((m) => m.label === "当前缺货量")
                  ?.note?.includes("部分")
                  ? null
                  : metric("当前缺货量"),
                stagnant: report.missingMovementCount
                  ? null
                  : known(
                      report.modules
                        .find((m) => m.id === "movement")
                        ?.overview[0]?.metrics.find(
                          (m) => m.label === "风险库存",
                        )?.value,
                    ),
                snapshot: report.sources
                  .map((s) => s.snapshot)
                  .filter(Boolean)
                  .join(" / "),
                risks: report.risks
                  .filter((r) => r.module !== "quality")
                  .map((r) => ({
                    id: r.id,
                    objectId: id,
                    object: name + "基地",
                    sku: r.material,
                    category: r.category,
                    type:
                      r.module === "shortage"
                        ? r.kind.includes("潜在")
                          ? "低库存"
                          : "缺货"
                        : r.module === "movement"
                          ? "滞库"
                          : r.kind === "60天以上库存"
                            ? "大日期"
                            : "货龄",
                    tags: [],
                    priority:
                      r.module === "shortage"
                        ? r.kind.includes("潜在")
                          ? 3
                          : 1
                        : r.module === "age"
                          ? 2
                          : 4,
                    issue: r.evidence,
                    action: r.action,
                    role: r.role,
                    details: r.details,
                  })),
              };
            })
            .map((object) =>
              applySourcePermissions(object, (input as any).permissionGaps),
            ),
        );
      } catch (e) {
        errors.push("基地日监控：" + (e as Error).message);
      }
    })(),
    (async () => {
      try {
        const directory = await catalog();
        let cursor = 0;
        await Promise.all(
          [0, 1].map(async () => {
            while (cursor < directory.warehouses.length) {
              signal?.throwIfAborted();
              const warehouse = directory.warehouses[cursor++];
              const id = "branch:" + warehouse.id;
              try {
                const snapshot = await load({ warehouseId: warehouse.id });
                const m = snapshot.metrics;
                const ageWeight = sum(
                  snapshot.inventory.map(
                    (r) =>
                      r.batchSummary?.positiveQty ??
                      (r.batches.length
                        ? r.batches
                            .filter((b) => b.quantity > 0)
                            .reduce((n, b) => n + b.quantity, 0)
                        : null),
                  ),
                );
                const targetCovered = snapshot.inventory.every(
                  (r) =>
                    r.quantity <= 0 ||
                    snapshot.replenishments.some((p) => p.sku === r.sku),
                );
                const risks: Risk[] = snapshot.replenishments
                  .filter((r) => (r.shortageQty ?? 0) > 0)
                  .map((r) => ({
                    id: id + ":" + r.sku,
                    objectId: id,
                    object: warehouse.name,
                    sku: r.sku,
                    category: r.category,
                    type: "缺货",
                    tags: [],
                    priority: 1,
                    issue: `当前缺口 ${r.shortageQty} 件`,
                    action: "核对可用库存、未完成调拨与补货计划",
                    role: "区域计划员",
                    details: {
                      SKU: r.sku,
                      商品: r.productName,
                      可用库存: r.availableQty,
                      当前缺口: r.shortageQty,
                      未完成调拨: r.openTransferQty,
                      建议补货: r.recommendedQty,
                      计算依据: r.reason,
                    },
                  }));
                for (const r of snapshot.inventory) {
                  const big =
                    r.batchSummary?.bigDateQty ??
                    sum(
                      r.batches
                        .filter((b) => b.ageDays >= 60)
                        .map((b) => b.quantity),
                    );
                  const stagnant =
                    r.batchSummary?.stagnantQty ??
                    sum(
                      r.batches
                        .filter((b) => b.ageDays >= 90)
                        .map((b) => b.quantity),
                    );
                  if (big !== null && big > 0)
                    risks.push({
                      id: id + ":age:" + r.sku,
                      objectId: id,
                      object: warehouse.name,
                      sku: r.sku,
                      category: r.category,
                      type: "大日期",
                      tags: [],
                      priority: 2,
                      issue: `60天及以上库存 ${big} 件`,
                      action: "核对批次与消化路径",
                      role: "区域计划员",
                      details: {
                        SKU: r.sku,
                        商品: r.productName,
                        大日期库存: big,
                      },
                    });
                  if (stagnant !== null && stagnant > 0)
                    risks.push({
                      id: id + ":stagnant:" + r.sku,
                      objectId: id,
                      object: warehouse.name,
                      sku: r.sku,
                      category: r.category,
                      type: "滞库",
                      tags: [],
                      priority: 4,
                      issue: `90天及以上库存 ${stagnant} 件（沿用分仓口径）`,
                      action: "核对动销、调拨及接收能力",
                      role: "区域计划员",
                      details: {
                        SKU: r.sku,
                        商品: r.productName,
                        滞库库存: stagnant,
                      },
                    });
                }
                push([
                  applySourcePermissions(
                    {
                      id,
                      name: warehouse.name,
                      kind: "branch",
                      inventory: known(m.inventoryQty),
                      target: targetCovered
                        ? sum(
                            snapshot.replenishments.map((r) =>
                              known(r.targetInventoryQty),
                            ),
                          )
                        : null,
                      age:
                        ageWeight !== null && ageWeight > 0
                          ? known(m.averageAgeDays)
                          : null,
                      ageWeight,
                      shortage: known(m.shortageQty),
                      stagnant: known(m.stagnantQty),
                      snapshot: snapshot.snapshotTime,
                      risks,
                    },
                    (snapshot as any).permissionGaps,
                  ),
                ]);
              } catch (e) {
                push([
                  {
                    id,
                    name: warehouse.name,
                    kind: "branch",
                    inventory: null,
                    target: null,
                    age: null,
                    ageWeight: null,
                    shortage: null,
                    stagnant: null,
                    snapshot: "",
                    risks: [],
                    error: (e as Error).message,
                  },
                ]);
              }
            }
          }),
        );
      } catch (e) {
        errors.push("分仓日监控：" + (e as Error).message);
      }
    })(),
  ]);
  signal?.throwIfAborted();
  return { objects, errors };
}
