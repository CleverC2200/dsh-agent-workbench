import type { BusinessNavigationCatalog } from './business-navigation.ts';
import type { CopyKey } from './locales.ts';

const LOCAL_AGENT_PAGES = new Map<string, string>([
  ['base-safety-stock', 'inventory-aqkc'],
  ['sales_forecast', 'gea-proof'],
  ['branch-inventory', 'inventory-fc'],
  ['full-chain-inventory', 'inventory-qll'],
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
  const items = catalog.agents.map((agent) => {
    const pageId = agent.agentCode ? LOCAL_AGENT_PAGES.get(agent.agentCode) : undefined;
    let reason: string | undefined;
    if (!agent.agentCode) reason = t('businessConfigurationIncomplete');
    else if (!pageId) reason = t('businessNotConnected');
    else if (!available.has(pageId)) reason = t('businessPageUnavailable');
    return {
      domain: agent.businessDomain,
      entry: {
        id: agent.id,
        pageId,
        title: agent.agentName?.trim() || t('businessUnnamed'),
        disabled: reason !== undefined,
        reason,
      },
    };
  });
  if (catalog.domains.kind === 'unavailable')
    return [
      { key: 'market', title: '', icon: '', flat: true, entries: items.map(({ entry }) => entry) },
    ];
  const byDomain = new Map<string, ResolvedBusinessMenuGroup>(
    catalog.domains.items.map((domain) => [
      domain.value,
      {
        key: `domain:${domain.value}`,
        title: domain.text,
        icon: domain.description ?? '',
        flat: false,
        entries: [],
      },
    ]),
  );
  const other: ResolvedBusinessMenuGroup = {
    key: 'other',
    title: t('businessOther'),
    icon: '',
    flat: false,
    entries: [],
  };
  for (const { domain, entry } of items)
    (domain ? (byDomain.get(domain) ?? other) : other).entries.push(entry);
  return [...byDomain.values(), other].filter((group) => group.entries.length > 0);
}

export function localPrototypeMenu(
  available: ReadonlyMap<string, string>,
  t: (key: CopyKey) => string,
): ResolvedBusinessMenuGroup {
  const prototypes = [
    { id: 'plan-region-category', title: t('prototypeCategory') },
    { id: 'gea-regional-plan', title: t('prototypeRegional') },
    { id: 'inventory-orderworkbench', title: t('prototypeOrders') },
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
