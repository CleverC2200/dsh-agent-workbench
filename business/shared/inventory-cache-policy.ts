export function inventoryCacheTtl(agentId: string): number {
  return (agentId === 'inventory-fc' ? 5 : 20) * 60 * 1000;
}
