import type { MetricData } from 'dsh-agent-manage/aps-compute/metrics';
import type { BaseProductCategory } from 'dsh-agent-manage/aps-compute/base-product-hierarchy';

/** Project returned dimensions into the existing category → item → material-group UI. */
export function productHierarchy(data?: MetricData | null, base?: string): BaseProductCategory[] {
  const categories = new Map<string, Map<string, Set<string>>>();
  for (const section of data?.sections ?? []) {
    if (section.status !== 'ready') continue;
    for (const row of section.rows) {
      if (base && row.base !== base) continue;
      if (typeof row.category !== 'string' || !row.category.trim()) continue;
      let items = categories.get(row.category);
      if (!items) categories.set(row.category, (items = new Map()));
      if (typeof row.item !== 'string' || !row.item.trim()) continue;
      let materials = items.get(row.item);
      if (!materials) items.set(row.item, (materials = new Set()));
      if (typeof row.material === 'string' && row.material.trim()) materials.add(row.material);
    }
  }
  const sort = (a: string, b: string) => a.localeCompare(b, 'zh-CN');
  return [...categories]
    .sort(([a], [b]) => sort(a, b))
    .map(([name, items]) => ({
      name,
      items: [...items]
        .sort(([a], [b]) => sort(a, b))
        .map(([name, materials]) => ({ name, materials: [...materials].sort(sort) })),
    }));
}

export function sourceDateLabel(data: MetricData | null | undefined, id: string): string {
  return (
    [
      ...new Set(
        data?.sections
          .find((section) => section.id === id && section.status === 'ready')
          ?.rows.map((row) =>
            String(row.source_date ?? '')
              .replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3')
              .slice(0, 10),
          )
          .filter((day) => /^\d{4}-\d{2}-\d{2}$/.test(day)) ?? [],
      ),
    ]
      .sort()
      .at(-1) || '—'
  );
}
