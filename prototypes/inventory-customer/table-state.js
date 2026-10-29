export const customerSortFields = ['value', 'quantity', 'structureScore', 'normalRatio', 'turnover', 'largeDateQty'];

/** Sort the complete filtered index before slicing a page. Unknowns always follow numbers. */
export function sortCustomerRows(rows, sorter) {
  if (!customerSortFields.includes(sorter?.field) || !['ascend', 'descend'].includes(sorter?.direction)) return rows;
  const sign = sorter.direction === 'ascend' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const left = a[sorter.field], right = b[sorter.field];
    const hasLeft = Number.isFinite(left), hasRight = Number.isFinite(right);
    if (hasLeft !== hasRight) return hasLeft ? -1 : 1;
    return (hasLeft ? (left - right) * sign : 0) || String(a.code).localeCompare(String(b.code));
  });
}

/** Preserve known business risks while disclosing that the overall assessment is incomplete. */
export function customerAssessmentNote(row) {
  const missing = [];
  if (!Number.isFinite(row.structureScore)) missing.push('结构分缺失');
  if (!Number.isFinite(row.largeDateRatio) || (row.largeDatePartial && row.largeDateRatio < 5)) missing.push('大日期占比不完整');
  return missing.length ? `数据不足（${missing.join('；')}）` : '';
}
