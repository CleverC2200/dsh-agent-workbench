import { z } from 'zod';

const warningEvent = z
  .object({
    id: z.string().min(1),
    scope: z.string(),
    metric: z.string(),
    metricName: z.string().optional(),
    value: z.number().nullable().optional(),
    unit: z.string().optional(),
    level: z.string().optional(),
    eventStatus: z.string().optional(),
    pendingClose: z.boolean().optional(),
    first: z.string().optional(),
    closedAt: z.string().optional(),
    recoveredAt: z.string().optional(),
    lastChecked: z.string().optional(),
    gap: z.string().optional(),
    period: z.string().optional(),
    cutoff: z.string().optional(),
    range: z.string().optional(),
    evidence: z.string().optional(),
  })
  .passthrough();
const warningState = z.object({ events: z.array(warningEvent) });

export function parseWarningState(value: unknown) {
  return warningState.parse(value);
}
