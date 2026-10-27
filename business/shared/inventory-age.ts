import { knownNumber } from './configured-overview';

type AgeMeasures = {
  weighted_age_sum?: unknown;
  age_weight_qty?: unknown;
};

/** Combine batch sums, never averages of SKU/base averages or maximum ages. */
export function inventoryAverageAge(...groups: (AgeMeasures | null | undefined)[]): number | null {
  if (!groups.length) return null;
  let weighted = 0;
  let quantity = 0;
  for (const group of groups) {
    const sum = knownNumber(group?.weighted_age_sum);
    const weight = knownNumber(group?.age_weight_qty);
    if (sum === null || weight === null || sum < 0 || weight < 0) return null;
    weighted += sum;
    quantity += weight;
  }
  return quantity > 0 && Number.isFinite(weighted / quantity) ? weighted / quantity : null;
}

export function companyAverageAge(
  base: { summary?: AgeMeasures | null; snapshotDate?: string | null } | undefined,
  branch: { summary?: AgeMeasures | null; snapshotDate?: string | null } | undefined,
): number | null {
  if (!base?.snapshotDate || base.snapshotDate !== branch?.snapshotDate) return null;
  return inventoryAverageAge(base.summary, branch.summary);
}
