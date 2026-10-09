import { useEffect, useRef } from "react";
import { action, ask } from "../channel.js";
import { pageContext, updateContext } from "./context";
export function usePageFilter(current: any, apply: (args: any) => void) {
  const ref = useRef({ current, apply });
  ref.current = { current, apply };
  useEffect(() => {
    updateContext("pageFilters", current);
  }, [JSON.stringify(current)]);
  useEffect(() => {
    action(
      "filter",
      "筛选本页；先读 context.parts.pageFilters 的 allowedFields、可选范围和当前值，仅传需要改变的字段。不会修改业务数据。",
      (input: any) => {
        if (!input || typeof input !== "object" || Array.isArray(input))
          throw Error("筛选参数必须为对象");
        const { current: c, apply } = ref.current;
        if (Object.keys(input).some((k) => !c.allowedFields.includes(k)))
          throw Error("不支持的筛选字段");
        if (input.tab !== undefined && !c.tabs.includes(input.tab))
          throw Error("页签无效");
        if (
          input.warehouseId !== undefined &&
          !c.warehouses.includes(input.warehouseId)
        )
          throw Error("分仓不在当前授权范围");
        if (
          input.bases !== undefined &&
          (!Array.isArray(input.bases) ||
            input.bases.some((b: any) => !c.bases.includes(b)))
        )
          throw Error("基地不在当前可见范围");
        if (
          input.search !== undefined &&
          (typeof input.search !== "string" || input.search.length > 100)
        )
          throw Error("搜索词无效");
        for (const k of ["urgentOnly", "riskOnly", "businessOnly"])
          if (input[k] !== undefined && typeof input[k] !== "boolean")
            throw Error("筛选开关无效");
        if (input.urgentOnly && input.riskOnly)
          throw Error("紧急与低于建议筛选不能同时开启");
        if (
          input.scope !== undefined &&
          !["company", "all-channel"].includes(input.scope)
        )
          throw Error("查询范围无效");
        if (
          input.month !== undefined &&
          (typeof input.month !== "string" ||
            !/^20\d{2}-(0[1-9]|1[0-2])$/.test(input.month))
        )
          throw Error("月份无效");
        apply(input);
        return {
          querying: true,
          requested: input,
          notice: "等待页面查询完成后再读取上下文",
        };
      },
    );
  }, []);
}
export function exportLocalJson(value: unknown, name: string) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function reviewLocalDraft() {
  return ask(
    "核对本页补货草稿、计算范围和缺失信息，提出人工确认清单；人工计划和周期为本页预览时不得当作正式方案，不得宣称已提报。",
    pageContext(),
  );
}
