/**
 * V1.8 #14：差额配色口径——正数红、负数绿，颜色只作用于差额数值本身，正负号保留。
 * 与达成率的阈值分档（D23）是两套独立口径（D24 推荐），这里只负责差额。
 */
export type SalesPlanVarianceSign = 'positive' | 'negative' | 'zero';
/** 只有合法的十进制差额才有符号；缺值（如「—」）不下结论，交给调用方保持中性。 */
export declare const salesPlanVarianceSign: (value: string | null | undefined) => SalesPlanVarianceSign | undefined;
/** 正数用红色类、负数用绿色类；零和缺值不加类，保持默认字色。 */
export declare const salesPlanVarianceClass: (value: string | null | undefined, positiveClass: string, negativeClass: string) => string | undefined;
