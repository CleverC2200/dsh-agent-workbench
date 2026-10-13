type SkuRow = Record<string, string | number>;

export function defaultSkuRisks(age: boolean): string[] {
  return age ? ['预警'] : ['缺货', '库存偏低', '库存偏高'];
}

export type SkuSort = { key: string; direction: 'asc' | 'desc' };
// Cells are formatted by the board. Accept only its numeric formats, never SKU text.
export function skuNumericValue(value: string | number | undefined): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const clean = (value ?? '')
    .replace(/,/g, '')
    .replace(/（部分）|\(部分\)/g, '')
    .trim();
  const match = clean.match(/^([+-]?\d+(?:\.\d+)?)(?:天|%|件)?$/);
  return match ? Number(match[1]) : null;
}

/** Filters and pages only the already-loaded SKU layer; parent totals stay intact. */
export function skuDetailPage(
  rows: SkuRow[],
  risks: string[],
  query: string,
  page: number,
  pageSize: number,
  sort?: SkuSort,
) {
  const needle = query.trim().toLocaleLowerCase('zh-CN');
  const filtered = rows.filter(
    (row) =>
      (!risks.length ||
        risks.includes(String(row.risk ?? row.warning ?? '')) ||
        (risks.includes('缺货') && (skuNumericValue(row.shortageQuantity) ?? 0) > 0)) &&
      (!needle ||
        String(row.level ?? '')
          .toLocaleLowerCase('zh-CN')
          .includes(needle)),
  );
  if (sort)
    filtered.sort((a, b) => {
      const left = skuNumericValue(a[sort.key]),
        right = skuNumericValue(b[sort.key]);
      if (left === null) return right === null ? 0 : 1;
      if (right === null) return -1;
      return (left - right) * (sort.direction === 'asc' ? 1 : -1);
    });
  const size = [10, 20, 50].includes(pageSize) ? pageSize : 20;
  const pages = Math.max(1, Math.ceil(filtered.length / size));
  const current = Math.max(1, Math.min(Number.isSafeInteger(page) ? page : 1, pages));
  return {
    rows: filtered.slice((current - 1) * size, current * size),
    total: filtered.length,
    page: current,
    pages,
    pageSize: size,
  };
}
