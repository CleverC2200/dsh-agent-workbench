/** Read caches never extend their lifetime on a hit. Explicit refresh still bypasses them. */
export function inventoryCacheTtl(agentId: string): number {
  return (agentId === 'inventory-fc' ? 5 : 20) * 60 * 1000;
}
