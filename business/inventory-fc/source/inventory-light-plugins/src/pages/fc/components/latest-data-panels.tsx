import type {
  MonthlyBudget,
  PlanRow,
  WarehouseSnapshot,
} from '../../../../../fc/src/lib/domain.ts';
import { budgetPercent, budgetStatus } from '../../../../../fc/src/lib/budget-display.ts';

const qty = (value: number | null) =>
  value === null
    ? '待核实'
    : new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 3 }).format(value);
const money = (value: number | null) =>
  value === null
    ? '待核实'
    : new Intl.NumberFormat('zh-CN', {
        style: 'currency',
        currency: 'CNY',
        maximumFractionDigits: 2,
      }).format(value);

export function EffectivePlansTable({
  rows,
  currentMonth,
  nextMonth,
}: {
  rows: readonly PlanRow[];
  currentMonth: string;
  nextMonth: string;
}) {
  return (
    <div className="table-scroll">
      <table className="data-table">
        <caption>当前使用计划 · 数量单位：件</caption>
        <thead>
          <tr>
            <th>SKU</th>
            <th>产品名称</th>
            <th>{currentMonth}出库</th>
            <th>{currentMonth}调拨</th>
            <th>本月来源</th>
            <th>{nextMonth}出库</th>
            <th>{nextMonth}调拨</th>
            <th>次月来源</th>
            <th>状态</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.sku}>
              <td>{row.sku}</td>
              <td>{row.productName}</td>
              <td>{qty(row.currentAvailable === false ? null : row.currentOutboundQty)}</td>
              <td>
                {qty(
                  row.currentTransferAvailable === false || row.currentAvailable === false
                    ? null
                    : row.currentTransferQty,
                )}
              </td>
              <td>{row.currentSource ?? row.source}</td>
              <td>{qty(row.nextAvailable === false ? null : row.nextOutboundQty)}</td>
              <td>
                {qty(
                  row.nextTransferAvailable === false || row.nextAvailable === false
                    ? null
                    : row.nextTransferQty,
                )}
              </td>
              <td>{row.nextSource ?? row.source}</td>
              <td>
                <span className={`status ${row.status === 'incomplete' ? 'warning' : 'success'}`}>
                  {row.status === 'incomplete' ? '待补齐 / 确认' : '已确认'}
                </span>
              </td>
            </tr>
          ))}
          {!rows.length && (
            <tr>
              <td colSpan={9}>
                <div className="inventory-empty-state" role="status">
                  当前范围暂无计划数据
                </div>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export function MonthlyBudgetPanel({ rows, month }: { rows: MonthlyBudget[]; month?: string }) {
  const current = rows.find((row) => row.month === month);
  return (
    <section aria-label="分仓月度预算">
      <div className="inline-note">
        月度预算按 shipping_code 独立统计，不按 SKU 重复累加。增长系数权重：环比 40% + 同比 40% +
        近三月环比均值 20%；原始缺项保留待核实，缺项贡献按入库规则处理。
      </div>
      <div className="resource-grid">
        {[
          ['当期预算', money(current?.budget ?? null)],
          ['预算环比', budgetPercent(current?.monthRate ?? null)],
          ['预算同比', budgetPercent(current?.yearRate ?? null)],
          ['近三月环比均值', budgetPercent(current?.recentRate ?? null)],
          ['加权增长系数', budgetPercent(current?.growthFactor ?? null)],
        ].map(([label, value]) => (
          <article className="resource-card" key={label}>
            <div>
              <strong>{label}</strong>
            </div>
            <p>{value}</p>
          </article>
        ))}
      </div>
      <details>
        <summary>
          月度预算历史（{rows.length} 个月） ·{' '}
          {current ? budgetStatus(current.status) : '当期预算缺失'}
        </summary>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>月份</th>
                <th>shipping_code</th>
                <th>预算金额</th>
                <th>上月预算</th>
                <th>去年同月预算</th>
                <th>环比</th>
                <th>同比</th>
                <th>近三月环比均值</th>
                <th>有效环比月数</th>
                <th>加权增长系数</th>
                <th>数据状态</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.month + row.shippingCode}>
                  <td>{row.month}</td>
                  <td>{row.shippingCode}</td>
                  <td>{money(row.budget)}</td>
                  <td>{money(row.previousBudget)}</td>
                  <td>{money(row.lastYearBudget)}</td>
                  <td>{budgetPercent(row.monthRate)}</td>
                  <td>{budgetPercent(row.yearRate)}</td>
                  <td>{budgetPercent(row.recentRate)}</td>
                  <td>{row.recentRateCount} / 3</td>
                  <td>{budgetPercent(row.growthFactor)}</td>
                  <td>{budgetStatus(row.status)}</td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={11}>
                    <div className="inventory-empty-state" role="status">
                      当前分仓暂无预算数据
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
export function BusinessPeriodNote({
  periods,
  kind,
}: {
  periods?: WarehouseSnapshot['businessPeriods'];
  kind: 'operations' | 'production';
}) {
  return (
    <div className="inline-note">
      {kind === 'operations'
        ? `运营统计月份：${periods?.operationsMonth ?? '待核实'}（按昨日所属月份取数）；订单量、发货量与备单分配缺口分开统计。`
        : `排产范围：${periods?.productionStart ?? '待核实'} 至 ${periods?.productionEnd ?? '待核实'}（含首尾）；按基地汇总相关 SKU 的生产计划，不代表可承诺产能。基地可用库存、提前期仍待核实。`}
    </div>
  );
}
