import { publish } from "../channel.js";
declare const PLUGIN_ID: string;
const parts = new Map<string, unknown>();
let timer: ReturnType<typeof setTimeout> | undefined;
function bounded(value: any, depth = 0): any {
  if (depth > 7) return "[已省略深层字段]";
  if (typeof value === "string") return value.slice(0, 3000);
  if (Array.isArray(value))
    return value.length > 30
      ? {
          rows: value.slice(0, 30).map((v) => bounded(v, depth + 1)),
          totalRows: value.length,
          truncated: true,
        }
      : value.map((v) => bounded(v, depth + 1));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 40)
        .map(([k, v]) => [k, bounded(v, depth + 1)]),
    );
  return value;
}
export function pageContext() {
  return {
    source: "GEA",
    businessDefinitions:
      PLUGIN_ID === "fc"
        ? {
            localWorkflow: {
              excelTemplate: "已实现，HTML 从 GEA 基线生成模板",
              excelImportPreview: "已实现：用户在 HTML 上传 Excel、校验、应用本页预览并重算；不需要 GEA 写接口",
              cyclePreview: "已实现：用户在 HTML 配置周期并重算；不需要 GEA 写接口",
              resetPreview: "已实现：撤销本页计划和周期预览，恢复 GEA 基线",
              dmsExport: "已实现：完整分仓系统建议合并人工草稿，调减需理由；导出前用户确认，未知数量不进入文件，不代表已提交DMS",
              formalSaveAndSubmit: "未实现，需要 GEA 正式写入接口；不可与本页导入预览混淆",
              modelActions: "模型可执行 filter/refresh/draft；文件上传与周期预览由用户在页面操作",
            },
            navigation:
              "监控指标、缺货订单、补货下单、滞库消化、大日期处理旁的1至5是步骤序号，不是业务数量",
            replenishment:
              "order-net-gap-v3：订单扣减后可供库存=可用库存−(备单中量−已占用量)；目标=(周期+3)×ceil(本月出货计划/月天数)；建议=ceil(max(0,max(缺货量,目标−订单扣减后可供库存)−所有月份未完成调拨量))；必要输入缺失时未知，不按零处理",
            coverage:
              "正建议SKU数 skuCount 不等于已计算SKU数 computedCount；缺失数量使用 computedOverview.calculated.missingCount，不用总数减正建议数",
            periods:
              "当前待分配订单是近60天口径；订单满足率是本月履约口径，不可互减推算未解释的缺口",
            aging:
              "滞库与大日期集合可能重叠，不能将两个指标直接相加；缺少SKU交集就保留未知",
            plan: "BI表示同步来源，其来源细分仍以sourceTrace为准，可能是历史估算；人工计划和周期仅本页预览，查看 localPreview 标识，不是 GEA 正式配置",
            actions:
              "支持读取上下文、刷新、filter 和文字草稿；filter 参数见 pageFilters；没有正式提交动作",
          }
        : undefined,
    capturedAt: new Date().toISOString(),
    parts: Object.fromEntries(parts),
    visibleText: document.getElementById("app")?.innerText.slice(0, 16000),
    coverage: "当前页面与已读取结果摘要；截断的行不能用于全量汇总",
  };
}
export function updateContext(key: string, value: unknown) {
  const limited = bounded(value),
    serialized = JSON.stringify(limited);
  parts.set(
    key,
    serialized?.length > 18000
      ? { truncated: true, preview: serialized.slice(0, 18000) }
      : limited,
  );
  clearTimeout(timer);
  timer = setTimeout(() => void publish(pageContext()).catch(() => {}), 350);
}
export function clearContext() {
  parts.clear();
  clearTimeout(timer);
}
