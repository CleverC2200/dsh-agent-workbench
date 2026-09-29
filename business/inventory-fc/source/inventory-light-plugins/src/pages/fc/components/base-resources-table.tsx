import type { BaseResource } from "../../../../../fc/src/lib/domain";

export function baseResourceHeaders(dates: string[]) {
  return ["基地", "在途", "可用库存", ...dates.map(date => `${date.slice(5).replace("-", "/")} ${new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", weekday: "short" }).format(new Date(`${date}T00:00:00+08:00`))}`), "7日合计"];
}
export function baseResourceCells(row: BaseResource, dates: string[]) {
  const number = (value: number | null | undefined) => value == null ? "待核实" : value.toLocaleString("zh-CN", { maximumFractionDigits: 1 });
  return [row.baseName, number(row.inTransitQty), number(row.availableQty), ...dates.map(date => number(row.dailyProduction?.find(day => day.date === date)?.quantity)), number(row.productionTotal)];
}
export function BaseResourcesTable({ rows, dates, sku, onAvailableClick, listOnly = false }: { rows: readonly BaseResource[]; dates: string[]; sku: string; onAvailableClick?: (row: BaseResource) => void; listOnly?: boolean }) {
  return <section className="base-resource-panel" aria-label="基地排产资源监控">
    {!listOnly && <div className="base-resource-heading"><strong>基地排产资源监控</strong><span>{sku ? `SKU ${sku}` : "按基地汇总"} · T～T+6</span></div>}
    <div className="table-scroll"><table className="data-table base-resource-table"><thead><tr>{baseResourceHeaders(dates).map((label,index) => <th key={label} title={index === 1 ? "直接汇总在途发货表中入库仓归属该基地的当前在途数量，排除历史及已关闭记录" : index === 2 ? "该基地最新库存快照的可用量，不含在途和未来排产" : undefined}>{label}</th>)}</tr></thead>
      <tbody>{rows.map(row => <tr key={row.baseName}>{baseResourceCells(row,dates).map((value,index) => <td key={index} className={index === 0 ? "base-name" : index === 2 ? "base-available" : ""}>{index === 2 && onAvailableClick && (row.availableQty ?? 0) > 0 ? <button type="button" className="quantity-link" aria-label={`查看${row.baseName}可用库存批次`} onClick={() => onAvailableClick(row)}>{value}</button> : value}</td>)}</tr>)}</tbody></table>
      {!rows.length && <div className="empty-state">{sku ? "该SKU暂无匹配的基地资源" : "当前暂无基地资源数据"}</div>}
    </div>
  </section>;
}
