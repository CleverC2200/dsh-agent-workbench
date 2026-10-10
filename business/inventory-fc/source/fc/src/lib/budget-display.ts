/** Budget rates are fractions, including values greater than 1 (= 100%). */
export function budgetPercent(value: number | null) {
  return value === null
    ? '待核实'
    : new Intl.NumberFormat('zh-CN', { style: 'percent', maximumFractionDigits: 2 }).format(value);
}
export function budgetStatus(status: string) {
  return (
    (
      {
        COMPLETE: '完整',
        HISTORY_PARTIAL: '历史不完整',
        BASE_INVALID: '基期无效',
        BUDGET_MISSING: '预算缺失',
      } as Record<string, string>
    )[status] ?? '待核实'
  );
}
