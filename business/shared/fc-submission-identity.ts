import { canonicalFc } from './fc-provenance';

const digest = async (value: string) => {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return (
    'AI' +
    Array.from(new Uint8Array(hash), (v) => v.toString(16).padStart(2, '0'))
      .join('')
      .slice(0, 30)
  );
};

/** Like gea-agent-fc, a batch follows confirmed calculation inputs, not a calendar month alone. */
export async function fcSubmissionIdentity(input: {
  warehouseCode: string;
  month: string;
  snapshotVersion: string;
  planRevision: string;
  cycleRevision: string;
  consumptionReviewed: boolean;
  rows: Array<{
    sku: string;
    recommendedQty: number;
    actualQty: number;
    reason: string;
    productName: string;
  }>;
  order: Record<string, unknown>;
}) {
  const aiPreOrderCode = await digest(
    canonicalFc({
      version: 'fc-batch-v2',
      ...input,
      rows: input.rows.slice().sort((a, b) => a.sku.localeCompare(b.sku)),
    }),
  );
  const legacyAiPreOrderCode = await digest(
    JSON.stringify([input.month, input.warehouseCode, input.order]),
  );
  return { aiPreOrderCode, legacyAiPreOrderCode };
}
