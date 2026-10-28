import type { ImportedPlan } from '../inventory-fc/source/fc/src/lib/planning';
import type { FcCycleRule } from './fc-cycle-rules';
export type FcStoredVersions = Record<
  string,
  {
    plans?: { revision: string; value: { plans: ImportedPlan[] } };
    cycles?: { revision: string; value: { days: number; rules: FcCycleRule[] } };
  }
>;
export const canonicalFc = (v: unknown): string =>
  JSON.stringify(v, (_k, x) =>
    x && typeof x === 'object' && !Array.isArray(x)
      ? Object.fromEntries(
          Object.keys(x)
            .sort()
            .map((k) => [k, x[k]]),
        )
      : x,
  );
export async function fcSubmissionProvenance(input: {
  warehouse: string;
  asOf: string;
  plans: ImportedPlan[];
  days: number;
  rules: FcCycleRule[];
  cycleWarehouse?: string;
  stored: FcStoredVersions;
  rows: Record<string, unknown>[];
}) {
  const plans = input.plans
    .filter((p) => p.warehouseCode === input.warehouse)
    .sort((a, b) => (a.month + ':' + a.sku).localeCompare(b.month + ':' + b.sku));
  const stored = input.stored[input.warehouse];
  const expectedPlans = stored?.plans?.value.plans
    .slice()
    .sort((a, b) => (a.month + ':' + a.sku).localeCompare(b.month + ':' + b.sku));
  const planRevision =
    plans.length && stored?.plans && canonicalFc(plans) === canonicalFc(expectedPlans)
      ? stored.plans.revision
      : '0';
  const cycleApplies = !input.cycleWarehouse || input.cycleWarehouse === input.warehouse;
  const cycle = { days: cycleApplies ? input.days : 7, rules: cycleApplies ? input.rules : [] };
  const cycleRevision =
    stored?.cycles && canonicalFc(cycle) === canonicalFc(stored.cycles.value)
      ? stored.cycles.revision
      : '0';
  const fields = [
    'sku',
    'stock_date',
    'stat_month',
    'inventory_qty',
    'available_qty',
    'calculation_order_remaining',
    'open_transfer_reported_qty',
    'period_current_out',
    'period_next_out',
    'cycle_days',
    'recommended_qty',
  ];
  const evidence = input.rows
    .map((row) =>
      Object.fromEntries(
        fields.map((f) => {
          const raw = row[f];
          if (raw === null || raw === undefined || raw === '') return [f, null];
          if (['sku', 'stock_date', 'stat_month'].includes(f)) return [f, String(raw)];
          const number = Number(raw);
          return [f, Number.isFinite(number) ? number : null];
        }),
      ),
    )
    .sort((a, b) => String(a.sku).localeCompare(String(b.sku)));
  const calculationContext = {
    asOf: input.asOf,
    warehouseCode: input.warehouse,
    stockDates: [
      ...new Set(
        evidence
          .map((r) => r.stock_date)
          .filter((x): x is string => typeof x === 'string')
          .map((x) => x.slice(0, 10)),
      ),
    ].sort(),
    planSource: plans.length ? (planRevision === '0' ? 'human-trial' : 'human-saved') : 'BI',
    cycleSource:
      cycleRevision === '0'
        ? cycle.days === 7 && !cycle.rules.length
          ? 'default'
          : 'page-trial'
        : 'saved',
    plans,
    cycle,
    evidence,
  };
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(canonicalFc(calculationContext)),
  );
  const hash = Array.from(new Uint8Array(digest))
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('');
  return { planRevision, cycleRevision, snapshotVersion: 'sha256:' + hash, calculationContext };
}
