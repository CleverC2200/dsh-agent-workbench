import { useEffect, useRef } from "react";
import { action, ask, reportElements } from "../channel.js";
import { pageContext, updateContext } from "./context";
export function usePageFilter(current: any, apply: (args: any) => void) {
  const ref = useRef({ current, apply });
  ref.current = { current, apply };
  const filter = (input: any) => {
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
  };
  useEffect(() => {
    updateContext("pageFilters", current);
    const labels: Record<string, string> = {warehouseId: "分仓", tab: "库存业务页签", search: "搜索SKU", urgentOnly: "紧急补货", riskOnly: "低于建议", businessOnly: "只看业务商品"};
    const elements = (current.visibleFields ?? []).map((field: string) => ({
      id: `filter:${field}`, role: field === "search" ? "field" : "control", label: labels[field] ?? field,
      ...(String(current[field] ?? "") ? {value: String(current[field])} : {}),
      editable: !current.disabledFields?.includes(field),
      ...(field === "warehouseId" ? {options: current.warehouses.slice(0,24)} : field === "tab" ? {options: current.tabs} : typeof current[field] === "boolean" ? {options: ["true", "false"]} : {}),
    }));
    return reportElements("filters", elements, (args: any) => {
      const field = args.target.slice("filter:".length);
      if (args.kind !== "setValue") throw Error("ACTION_NOT_ALLOWED");
      let value = args.value;
      if (typeof ref.current.current[field] === "boolean") {
        if (!["true", "false"].includes(value)) throw Error("筛选开关无效");
        value = value === "true";
      }
      return filter({[field]: value});
    });
  }, [JSON.stringify(current)]);
  useEffect(() => {
    action("filter", "按当前页允许的字段调整筛选；不修改业务数据", filter);
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
