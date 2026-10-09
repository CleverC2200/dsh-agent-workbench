/** 改编自 AionUi（Apache-2.0）：已替换为本地导入并使用显式 DSH Host 适配器，见 SOURCE.md。 */
import type { GeaSalesPlanListItem, GeaSalesPlanSku } from '../../../bridge.ts';
export declare const SALES_PLAN_EXPORT_AMOUNT_PAIRS: readonly [readonly ["qty", "amt"], readonly ["regionConfirmedQty", "regionConfirmedAmount"], readonly ["provinceConfirmedQty", "provinceConfirmedAmount"], readonly ["areaConfirmedQty", "areaConfirmedAmount"], readonly ["categoryConfirmedQty", "categoryConfirmedAmount"]];
type AmountField = (typeof SALES_PLAN_EXPORT_AMOUNT_PAIRS)[number][number];
export type SalesPlanExportAmounts = Record<AmountField, string | null>;
/** 导出每个节点自身的值，绝不从其他审批节点回填。 */
export declare const aggregateSalesPlanExportAmounts: (row: Pick<GeaSalesPlanListItem, "versionId" | "skuCount">, skus: readonly GeaSalesPlanSku[]) => SalesPlanExportAmounts;
export {};
