import type { GeaSalesPlanListItem } from '../../../bridge.ts';

export type SalesPlanProgressNode = {
  key: string;
  level: 'area' | 'province' | 'region' | 'customer';
  code?: string;
  name?: string;
  total: number;
  pending: number;
  completed: number;
  children: SalesPlanProgressNode[];
};

export const salesPlanProgressBarColor = (percent: number | undefined): string =>
  percent === undefined || percent < 95
    ? 'rgb(var(--danger-6))'
    : percent < 100
      ? 'rgb(var(--warning-6))'
      : 'rgb(var(--success-6))';

export const buildSalesPlanProgressTree = (
  records: readonly GeaSalesPlanListItem[],
): SalesPlanProgressNode[] => {
  const roots: SalesPlanProgressNode[] = [];
  const nodes = new Map<string, SalesPlanProgressNode>();
  for (const row of records) {
    if (row.status === 0) continue;
    const levels = [
      ['area', row.areaCode, row.areaName ?? row.regionName],
      ['province', row.provinceCode, row.provinceName ?? row.provinceRegionName],
      ['region', row.orgCode, row.orgName ?? row.salesGroupName],
      ['customer', row.dealerCode, row.dealerName],
    ] as const;
    let siblings = roots;
    const path: Array<string | null> = [];
    for (const [level, rawCode, rawName] of levels) {
      const code = rawCode?.trim() || undefined;
      path.push(code ?? null);
      const key = JSON.stringify(path);
      let node = nodes.get(key);
      if (!node) {
        node = {
          key,
          level,
          code,
          name: code ? rawName?.trim() || undefined : undefined,
          total: 0,
          pending: 0,
          completed: 0,
          children: [],
        };
        nodes.set(key, node);
        siblings.push(node);
      }
      node.total++;
      if (row.status === 10) node.completed++;
      else node.pending++;
      siblings = node.children;
    }
  }
  return roots;
};
