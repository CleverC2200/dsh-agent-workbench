/** Fixed widths keep frozen offsets identical for headers and cells. */
export function replenishmentColumnWidth(column: string): number {
  return column === 'sku'
    ? 120
    : column === 'productName'
      ? 320
      : column === 'actualQty'
        ? 116
        : 124;
}
export function pinReplenishmentColumns(columns: string[], frozen: string[]): string[] {
  const left = columns.filter((column) => frozen.includes(column) && column !== 'actualQty');
  return [
    ...left,
    ...columns.filter((column) => !frozen.includes(column)),
    ...columns.filter((column) => column === 'actualQty' && frozen.includes(column)),
  ];
}
export function frozenColumnOffset(
  column: string,
  columns: string[],
  frozen: string[],
): { left?: number; right?: number } {
  if (!frozen.includes(column)) return {};
  if (column === 'actualQty') return { right: 0 };
  return {
    left:
      0 +
      columns
        .slice(0, columns.indexOf(column))
        .filter((key) => frozen.includes(key) && key !== 'actualQty')
        .reduce((sum, key) => sum + replenishmentColumnWidth(key), 0),
  };
}
