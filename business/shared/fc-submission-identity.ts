import { canonicalFc } from './fc-provenance';

/** Web Crypto random bytes also work in embedded pages without randomUUID support. */
export function createFcConfirmationId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-');
}

const digest = async (value: string) => {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return (
    'AI' +
    Array.from(new Uint8Array(hash), (v) => v.toString(16).padStart(2, '0'))
      .join('')
      .slice(0, 30)
  );
};

/** A confirmation round has its own identity; retries retain that round and its confirmed inputs. */
export async function fcSubmissionIdentity(input: {
  confirmationId?: string;
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
