import type { ImportedPlan } from '../inventory-fc/source/fc/src/lib/planning';

export function mergeFcPlans(
  previous: readonly ImportedPlan[],
  incoming: readonly ImportedPlan[],
): ImportedPlan[] {
  const packageKey = (plan: ImportedPlan) => JSON.stringify([plan.warehouseCode, plan.month]);
  const replaced = new Set(incoming.map(packageKey));
  return [...previous.filter((plan) => !replaced.has(packageKey(plan))), ...incoming];
}
