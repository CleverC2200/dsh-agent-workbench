import type { InventoryBatch } from '../../../../../fc/src/lib/domain';
const quantity = (value: number | null | undefined) =>
  typeof value === 'number' && Number.isFinite(value)
    ? value.toLocaleString('zh-CN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
    : '-';
export function InventoryBatchTable({ rows, error }: { rows?: InventoryBatch[]; error?: string }) {
  if (error)
    return (
      <div className="inventory-batch-panel" role="alert">
        {error}
      </div>
    );
  if (!rows)
    return (
      <div className="inventory-batch-panel" role="status">
        正在读取当前 SKU 批次…
      </div>
    );
  const visible = rows.filter((row) => row.quantity !== 0 || (row.availableQty ?? 0) !== 0);
  return (
    <div className="inventory-batch-panel">
      <div className="table-scroll">
        <table className="data-table inventory-batch-table" aria-label="库存批次明细">
          <colgroup>
            <col className="batch-date" />
            {Array.from({ length: 4 }, (_, i) => (
              <col className="batch-number" key={i} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {['生产日期', '货龄', '在库量', '占用量', '可用量'].map((label) => (
                <th key={label}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row, index) => (
              <tr key={`${row.batchNo}:${index}`}>
                <td>
                  {row.productionDate && row.productionDate !== '—'
                    ? row.productionDate.slice(0, 10)
                    : '-'}
                </td>
                <td>
                  {row.productionDate !== '—' && Number.isFinite(row.ageDays)
                    ? Math.round(row.ageDays)
                    : '-'}
                </td>
                <td>{quantity(row.quantity)}</td>
                <td>
                  {quantity(row.availableQty == null ? null : row.quantity - row.availableQty)}
                </td>
                <td>{quantity(row.availableQty)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!visible.length && <p>当前商品暂无库存批次。</p>}
    </div>
  );
}
