import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain';
import { z } from 'zod';
import type { BoundReference } from './reference.ts';

/** Explicitly selected evidence is a Session sidecar, never a grant or restored page fact. */
export type StoredReference = BoundReference & { principal: string };

export const storedReferenceSchema = z
  .object({
    sessionId: z.string().regex(/^session-[a-z0-9-]+$/i),
    principal: z.string().min(1).max(2000),
    surface: z.string().max(200),
    tool: z.string().max(100).optional(),
    page: z.string().max(160),
    kind: z.enum(['row', 'table', 'block']).optional(),
    label: z.string().max(160),
    text: z.string().min(1).max(6000),
    row: z.string().max(200).optional(),
    column: z.string().max(200).optional(),
    scope: z.string().max(1000).optional(),
    targets: z.array(z.string().max(200)),
    capturedAt: z.string().max(64),
    truncated: z.boolean().optional(),
  })
  .strict();

export const referenceDomain = defineDomain({
  name: 'workbench_page_references',
  version: 1,
  layout: 'per-record',
  tables: { references: domainTable(storedReferenceSchema) },
});
