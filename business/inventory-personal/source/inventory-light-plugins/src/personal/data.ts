import { applySourcePermissions } from "./permissions";
import {
  loadDailyReportInput,
  catalog,
  load,
  clearReadCache,
} from "./live-input";

import {type ObjectData} from "dsh-agent-manage/inventory-compute/personal";
import {buildBasePersonalObject,buildBranchPersonalObject} from "dsh-agent-manage/inventory-compute/personal-sources";
export function reset() {
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
        const input = await loadDailyReportInput(signal);
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
              return buildBasePersonalObject(input,name);
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
        const directory = await catalog(signal);
        let cursor = 0;
        await Promise.all(
          [0, 1].map(async () => {
            while (cursor < directory.warehouses.length) {
              signal?.throwIfAborted();
              const warehouse = directory.warehouses[cursor++];
              const id = "branch:" + warehouse.id;
              try {
                const snapshot = await load({ warehouseId: warehouse.id, signal });
                push([
                  applySourcePermissions(
                    buildBranchPersonalObject(snapshot,warehouse),
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
