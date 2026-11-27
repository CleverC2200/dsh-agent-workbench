export function operationsExportCell(column, value, row) {
  const original = row && Object.hasOwn(row, column.k) ? row[column.k] : value;
  const formatted = column.fmt?.(original, row);
  const text =
    formatted == null
      ? null
      : String(formatted)
          .replace(/<[^>]*>/g, '')
          .trim();
  if (text === '—' || text === 'NaN' || text === 'undefined') return '';
  let result = value;
  if (result && typeof result === 'object' && 'qty' in result) result = result.qty;
  if (result === undefined || result === null || result === '') {
    if (text != null) result = text;
  }
  if (typeof result === 'number' && !Number.isFinite(result)) return '';
  if (result === '—' || result === 'NaN' || result == null) return '';
  const scale = (number) =>
    String(column.label).includes('(万)')
      ? number / 10000
      : String(column.label).includes('(%)')
        ? number * 100
        : number;
  if (typeof result === 'number') return scale(result);
  const known =
    typeof result === 'string' ? result.match(/^(已知|共享仓库) (-?\d+(?:\.\d+)?)$/) : null;
  if (known) return known[1] + ' ' + scale(Number(known[2]));
  return result;
}
