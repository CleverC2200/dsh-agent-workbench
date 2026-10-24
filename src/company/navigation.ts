import type { BusinessNavigationCatalog } from './business-navigation.ts';
import type { CopyKey } from './locales.ts';

const DESKTOP_GROUPS = [
  { key: 'supply', title: 'menuSupply', icon: 'synergy' },
  { key: 'plan', title: 'menuPlan', icon: 'calendar' },
  { key: 'inventory', title: 'menuInventory', icon: 'warehouse' },
  { key: 'customer', title: 'menuCustomer', icon: 'users' },
  { key: 'orders', title: 'menuOrders', icon: 'orders' },
] as const;
type DesktopGroup = (typeof DESKTOP_GROUPS)[number]['key'];
type DesktopAgent = { group: DesktopGroup; title: CopyKey; pageId?: string };
const DESKTOP_AGENTS = new Map<string, DesktopAgent>([
  ['aps', { group: 'supply', title: 'menuSupplyPage', pageId: 'inventory-apsplan' }],
  ['04', { group: 'plan', title: 'menuCategoryPage' }],
  ['sales_forecast', { group: 'plan', title: 'menuSalesPage', pageId: 'gea-proof' }],
  ['area_plan', { group: 'plan', title: 'menuRegionalPage' }],
  ['mps', { group: 'plan', title: 'menuMpsPage', pageId: 'plan-category-production' }],
  ['03', { group: 'plan', title: 'prototypeCapacity' }],
  ['02', { group: 'plan', title: 'menuCategoryProductionPage' }],
  [
    'full-chain-inventory',
    { group: 'inventory', title: 'menuFullInventoryPage', pageId: 'inventory-qll' },
  ],
  [
    'base-safety-stock',
    { group: 'inventory', title: 'menuBaseInventoryPage', pageId: 'inventory-aqkc' },
  ],
  [
    'branch-inventory',
    { group: 'inventory', title: 'menuBranchInventoryPage', pageId: 'inventory-fc' },
  ],
  [
    'dealer-inventory-replenishment-stock',
    { group: 'inventory', title: 'menuDealerInventoryPage' },
  ],
  [
    'customer_inventory',
    { group: 'inventory', title: 'menuCustomerInventoryPage', pageId: 'inventory-customer' },
  ],
  ['dealer-workbench', { group: 'customer', title: 'menuDealerAssistantPage' }],
  [
    'dealer-inventory-replenishment',
    { group: 'customer', title: 'menuDealerReplenishmentPage', pageId: 'inventory-dealer' },
  ],
  ['order', { group: 'orders', title: 'menuOrderPage', pageId: 'inventory-orderworkbench' }],
  [
    'order01',
    { group: 'orders', title: 'menuFulfillmentPage', pageId: 'inventory-orderfulfillment' },
  ],
]);

export type BusinessMenuEntry = {
  id: string;
  pageId?: string;
  title: string;
  disabled: boolean;
  reason?: string;
};
export type ResolvedBusinessMenuGroup = {
  key: string;
  title: string;
  icon: string;
  flat: boolean;
  entries: BusinessMenuEntry[];
};

export function resolveBusinessMenu(
  catalog: BusinessNavigationCatalog | undefined,
  available: ReadonlyMap<string, string>,
  t: (key: CopyKey) => string,
): ResolvedBusinessMenuGroup[] {
  if (!catalog) return [];
  const groups: ResolvedBusinessMenuGroup[] = DESKTOP_GROUPS.map((group) => ({
    ...group,
    title: t(group.title),
    flat: false,
    entries: [],
  }));
  const desktopGroups = new Map(groups.map((group) => [group.key, group]));
  const byDomain = new Map<string, ResolvedBusinessMenuGroup>(
    catalog.domains.kind === 'available'
      ? catalog.domains.items.map((domain) => [
          domain.value,
          {
            key: `domain:${domain.value}`,
            title: domain.text,
            icon: domain.description ?? '',
            flat: false,
            entries: [],
          },
        ])
      : [],
  );
  const other: ResolvedBusinessMenuGroup = {
    key: 'other',
    title: t('businessOther'),
    icon: '',
    flat: catalog.domains.kind === 'unavailable',
    entries: [],
  };
  const order = [...DESKTOP_AGENTS.keys()];
  const agents = catalog.agents.slice().sort((a, b) => {
    const aOrder = a.agentCode ? order.indexOf(a.agentCode) : -1;
    const bOrder = b.agentCode ? order.indexOf(b.agentCode) : -1;
    return (aOrder < 0 ? order.length : aOrder) - (bOrder < 0 ? order.length : bOrder);
  });
  for (const agent of agents) {
    if (agent.agentCode === 'workbench') continue;
    const desktop = agent.agentCode ? DESKTOP_AGENTS.get(agent.agentCode) : undefined;
    const pageId = desktop?.pageId;
    let reason: string | undefined;
    if (!agent.agentCode) reason = t('businessConfigurationIncomplete');
    else if (!pageId) reason = t('businessNotConnected');
    else if (!available.has(pageId)) reason = t('businessPageUnavailable');
    const group =
      (desktop && desktopGroups.get(desktop.group)) ||
      (agent.businessDomain && byDomain.get(agent.businessDomain)) ||
      other;
    group.entries.push({
      id: agent.id,
      pageId,
      title: desktop
        ? t(desktop.title)
        : agent.agentName?.trim().replace(/\s*Agent(?=\s*\(|$)/i, '') || t('businessUnnamed'),
      disabled: reason !== undefined,
      reason,
    });
  }
  return [...groups, ...byDomain.values(), other].filter((group) => group.entries.length > 0);
}

export function localPrototypeMenu(
  available: ReadonlyMap<string, string>,
  t: (key: CopyKey) => string,
): ResolvedBusinessMenuGroup {
  const prototypes = [
    { id: 'plan-region-category', title: t('prototypeCategory') },
    { id: 'gea-regional-plan', title: t('prototypeRegional') },
    ...(available.has('inventory-dms') ? [{ id: 'inventory-dms', title: t('prototypeDms') }] : []),
    { id: 'plan-capacity-assessment', title: t('prototypeCapacity') },
  ];
  return {
    key: 'local-prototypes',
    title: t('localPrototypes'),
    icon: '',
    flat: false,
    entries: prototypes.map(({ id, title }) => ({
      id,
      pageId: id,
      title,
      disabled: id === 'plan-capacity-assessment' || !available.has(id),
      reason: !available.has(id) ? t('businessPageUnavailable') : undefined,
    })),
  };
}
