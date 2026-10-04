/** 改编自 AionUi（Apache-2.0）：已替换为本地导入并使用显式 DSH Host 适配器，见 SOURCE.md。 */
import type { GeaSalesPlanListItem } from '../../../bridge.ts';
export type SalesPlanProgressNode = {
    key: string;
    level: 'area' | 'province' | 'region' | 'customer';
    code?: string;
    name?: string;
    total: number;
    pending: number;
    completed: number;
    children: SalesPlanProgressNode[];
};
/**
 * 达成率进度条配色（V1.8 #09，D23 采用业务文档推荐口径）：
 * <95% 红、95–100% 橙、≥100% 绿；取不到数值时按红色处理（和其它缺失态一致地显眼）。
 */
export declare const salesPlanProgressBarColor: (percent: number | undefined) => string;
/** 列表已由 GEA 限定范围；只聚合返回的标识，绝不虚构缺失客户。 */
export declare const buildSalesPlanProgressTree: (records: readonly GeaSalesPlanListItem[]) => SalesPlanProgressNode[];
