import { useEffect, useRef } from "react";
import { action, reportElements } from "../channel.js";
import { updateContext } from "./context";
export function usePageFilter(current: any, apply: (input: any) => void) {
  const ref = useRef({ current, apply });
  ref.current = { current, apply };
  const filter = (input: any) => {
    const { current: scope, apply } = ref.current;
    if (!input || typeof input !== "object" || Array.isArray(input))
      throw Error("筛选参数必须为对象");
    if (Object.keys(input).some((key) => !scope.allowedFields.includes(key)))
      throw Error("不支持的筛选字段");
    if (
      input.bases !== undefined &&
      (!Array.isArray(input.bases) ||
        input.bases.some((base: string) => !scope.bases.includes(base)))
    )
      throw Error("基地不在当前可见范围");
    if (input.tab !== undefined && !scope.tabs.includes(input.tab))
      throw Error("页签无效");
    apply(input);
    return {
      querying: true,
      requested: input,
      notice: "等待页面查询完成后再读取上下文",
    };
  };
  useEffect(() => {
    updateContext("pageFilters", current);
    return reportElements(
      "filters",
      [
        {
          id: "filter:bases",
          role: "control",
          label: "基地",
          ...(current.selectedBases.length
            ? { value: current.selectedBases.join("、") }
            : {}),
          options: current.bases,
          editable: !current.loading,
        },
        {
          id: "filter:tab",
          role: "control",
          label: "库存页签",
          value: current.tab,
          options: current.tabs,
          editable: !current.loading,
        },
      ],
      (args: any) => {
        if (args.kind !== "setValue") throw Error("ACTION_NOT_ALLOWED");
        return filter(
          args.target === "filter:bases"
            ? { bases: [args.value] }
            : { tab: args.value },
        );
      },
    );
  }, [JSON.stringify(current)]);
  useEffect(() => {
    action("filter", "调整当前基地和页签筛选；不修改业务数据", filter);
  }, []);
}
