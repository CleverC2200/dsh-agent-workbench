import type { ImportedPlan } from '../inventory-fc/source/fc/src/lib/planning';

/** Imports update only the warehouse/month/SKU keys present in the file. */
export function mergeFcPlans(
  previous: readonly ImportedPlan[],
  incoming: readonly ImportedPlan[],
): ImportedPlan[] {
  const key = (plan: ImportedPlan) => JSON.stringify([plan.warehouseCode, plan.month, plan.sku]);
  const rows = new Map(previous.map((plan) => [key(plan), plan]));
  for (const plan of incoming) rows.set(key(plan), plan);
  return [...rows.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, plan]) => plan);
}
