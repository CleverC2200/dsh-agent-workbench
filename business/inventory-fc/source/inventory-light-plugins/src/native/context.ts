import { publish } from '../channel.js';
declare const PLUGIN_ID: string;
const parts = new Map<string, unknown>();
let timer: ReturnType<typeof setTimeout> | undefined;
if (typeof window !== 'undefined')
  window.addEventListener('gea-session-changed', () => refreshContext());
function bounded(value: any, depth = 0): any {
  if (depth > 7) return '[已省略深层字段]';
  if (typeof value === 'string') return value.slice(0, 3000);
  if (Array.isArray(value))
    return value.length > 30
      ? {
          rows: value.slice(0, 30).map((v) => bounded(v, depth + 1)),
          totalRows: value.length,
          truncated: true,
        }
      : value.map((v) => bounded(v, depth + 1));
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 40)
        .map(([k, v]) => [k, bounded(v, depth + 1)]),
    );
  return value;
}
export function pageContext() {
  const queryState = parts.get('queryState') as { state: string; message?: string } | undefined;
  // A same-warehouse refresh may leave the previous KPI visible while its query is pending or failed.
  const visibleText =
    PLUGIN_ID === 'fc' && queryState?.state !== 'ready'
      ? queryState?.message
      : document.getElementById('app')?.innerText.slice(0, 16000);
  return {
    source: 'GEA',
    businessDefinitions:
      PLUGIN_ID === 'fc'
        ? {
            localWorkflow: {
              excelTemplate: '已实现，HTML 从 GEA 基线生成模板',
              excelImportPreview:
                '已实现：用户在 HTML 上传 Excel、校验、应用本页预览并重算；不需要 GEA 写接口',
              cyclePreview: '已实现：用户在 HTML 配置周期并重算；不需要 GEA 写接口',
              resetPreview: '已实现：撤销本页计划和周期预览，恢复 GEA 基线',
              dmsExport:
                '已实现：完整分仓系统建议合并人工草稿，调减需理由；导出前用户确认，未知数量不进入文件，不代表已提交DMS',
              formalSaveAndSubmit: '未实现，需要 GEA 正式写入接口；不可与本页导入预览混淆',
              modelActions: '模型可执行 filter/refresh/draft；文件上传与周期预览由用户在页面操作',
            },
            navigation:
              '监控指标、缺货订单、补货下单、滞库消化、大日期处理旁的1至5是步骤序号，不是业务数量',
            replenishment:
              'order-net-gap-v3：订单扣减后可供库存=可用库存−(备单中量−已占用量)；目标=(周期+3)×ceil(本月出货计划/月天数)；建议=ceil(max(0,max(缺货量,目标−订单扣减后可供库存)−所有月份未完成调拨量))；必要输入缺失时未知，不按零处理',
            coverage:
              '正建议SKU数 skuCount 不等于已计算SKU数 computedCount；缺失数量使用 computedOverview.calculated.missingCount，不用总数减正建议数',
            periods:
              '当前待分配订单是近60天口径；订单满足率是本月履约口径，不可互减推算未解释的缺口',
            aging: '滞库与大日期集合可能重叠，不能将两个指标直接相加；缺少SKU交集就保留未知',
            metricLabels: {
              bigDateQty: '超龄库存量（大日期库存），不是待发订单量',
              stagnantQty: '滞库风险量，不是待发订单量',
              orderQty:
                '本月履约口径订单量，月份和来源以 metricScopes.fulfillment 为准；不是近60天待分配订单量。缺失时保持未知，不能用超龄或滞库库存量替代',
              inventoryQty: '全仓库存量；页面向上取整为件，正文原值与显示值分开引用',
            },
            plan: 'BI表示同步来源，其来源细分仍以sourceTrace为准，可能是历史估算；人工计划和周期仅本页预览，查看 localPreview 标识，不是 GEA 正式配置',
            actions:
              '支持读取上下文、刷新、filter 和文字草稿；filter 参数见 pageFilters；没有正式提交动作',
          }
        : undefined,
    capturedAt: new Date().toISOString(),
    parts: Object.fromEntries(parts),
    visibleText,
    coverage: '当前页面与已读取结果摘要；截断的行不能用于全量汇总',
  };
}
export function updateContext(key: string, value: unknown) {
  const limited = bounded(value),
    serialized = JSON.stringify(limited);
  parts.set(
    key,
    serialized?.length > 18000 ? { truncated: true, preview: serialized.slice(0, 18000) } : limited,
  );
  refreshContext();
}
/** Re-read current context after UI work without accepting another response as business facts. */
export function refreshContext() {
  clearTimeout(timer);
  timer = setTimeout(() => void publish(pageContext()).catch(() => {}), 350);
}
export function clearContext(options: { keepPageFilters?: boolean } = {}) {
  const filters = options.keepPageFilters ? parts.get('pageFilters') : undefined;
  parts.clear();
  if (filters !== undefined) parts.set('pageFilters', filters);
  clearTimeout(timer);
}
