// Attributes describe this period only, keyed by both base and SKU.
export function applyPeriodAttributions(sections, mappings, sharedItems = []) {
  const byKey = new Map(mappings.filter(row => row.base && row.sku)
    .map(row => [JSON.stringify([row.base, row.sku]), row]));
  const bySku = new Map(sharedItems.map(row => [row.sku, row]));
  const observed = new Map();
  for (const part of sections.filter(part => ['orders', 'stock'].includes(part.id)))
    for (const row of part.rows) {
      if (!row.base || !row.sku) continue;
      const key = JSON.stringify([row.base, row.sku]);
      if (!observed.has(key)) observed.set(key, new Set());
      if (row.item) observed.get(key).add(row.item);
    }
  for (const section of sections.filter(part => ['orders', 'stock', 'ages'].includes(part.id))) {
    for (const row of section.rows) {
      const key = JSON.stringify([row.base, row.sku]);
      const mapping = byKey.get(key);
      const candidates = observed.get(key);
      const shared = bySku.get(row.sku);
      const item = Number(mapping?.items) > 1 ? null
        : Number(mapping?.items) === 1 ? mapping.item
        : shared ? (Number(shared.names) === 1 ? shared.item : null)
        : (candidates?.size === 1 ? [...candidates][0] : null);
      if (section.id === 'ages') row.item = item;
      else if (!row.item) row.item = item;
      row.director = Number(mapping?.names) === 1 ? mapping.director : null;
      row.names = Number(mapping?.names) === 1 ? 1 : 0;
      row.periodAttribution = true;
    }
  }
}
