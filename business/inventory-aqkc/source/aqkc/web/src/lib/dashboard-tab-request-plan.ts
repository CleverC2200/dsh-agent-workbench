export const DASHBOARD_TAB_NAMES = ['品类结构', '货龄结构'] as const;

export type DashboardTabName = (typeof DASHBOARD_TAB_NAMES)[number];

export type DashboardTabFetchGroup = 'safety-stock' | 'inventory-age';

export function normalizeDashboardTabName(
  value: string | null,
): DashboardTabName | null | undefined {
  if (value === null) return undefined;
  const normalized = value.trim();
  return DASHBOARD_TAB_NAMES.includes(normalized as DashboardTabName)
    ? (normalized as DashboardTabName)
    : null;
}

export function dashboardTabFetchGroup(tab: DashboardTabName): DashboardTabFetchGroup {
  return tab === '货龄结构' ? 'inventory-age' : 'safety-stock';
}

export function dashboardTabResultNames(tab: DashboardTabName): readonly DashboardTabName[] {
  return [tab];
}

export function dashboardTabQueryPlan(tab?: DashboardTabName) {
  return {
    category: tab === undefined || tab === '品类结构',
    age: tab === undefined || tab === '货龄结构',
  };
}
