import { z } from 'zod';

const text = z.string().max(10000);
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const numeric = z.number().finite();
const quantity = numeric.nonnegative();
const sourceRow = z.partialRecord(
  z.enum([
    '月份',
    '基地',
    '产品编码',
    '产品名称',
    '大类',
    '系列',
    '物料组',
    '物料组名称',
    '老品编码',
    '老品名称',
    '数量',
    '月初数量',
    '纠偏数量',
  ]),
  z.union([text, numeric]),
);
const input = z.strictObject({ file: text, rows: z.array(sourceRow).max(10000) });
const audit = {
  systemValue: numeric.nullable(),
  reason: z.string().trim().min(1).max(1000),
  at: z.iso.datetime(),
};
const categoryAdjustment = z.strictObject({ month, category: text, quantity, ...audit });
const shareAdjustment = z.strictObject({ rowId: text, share: quantity.max(1), ...audit });
const quantityIdentity = { month, category: text, group: text, quantity, ...audit };
const quantityAdjustment = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('group'), ...quantityIdentity }),
  z.strictObject({ kind: z.literal('sku'), ...quantityIdentity, code: text }),
  z.strictObject({ kind: z.literal('base-sku'), ...quantityIdentity, code: text, base: text }),
]);
const adjustmentHistory = z.strictObject({
  kind: z.enum(['categoryDemand', 'shares', 'quantities']),
  key: text,
  action: z.enum(['set', 'undo']),
  value: numeric.nullable(),
  ...audit,
});
const list = <T extends z.ZodType>(item: T) => z.array(item).max(10000);
const keyedNumbers = z.record(z.string().max(10000), numeric.nullable());
const shipmentEdits = z.strictObject({
  values: z
    .record(
      text,
      z.strictObject({
        value: numeric,
        source: text,
        previous: numeric.nullable(),
        target: numeric.optional(),
        weightTotal: numeric.optional(),
      }),
    )
    .optional(),
  remaining: z.record(text, z.strictObject({ values: keyedNumbers, source: text })).optional(),
});
const shipment = z.strictObject({
  ...shipmentEdits.shape,
  sourceEdits: z
    .strictObject({
      'local-file': shipmentEdits.optional(),
      business: shipmentEdits.optional(),
    })
    .optional(),
  cutoff: text.optional(),
  file: text.optional(),
  activeSource: z.enum(['local-file', 'business']).optional(),
  rows: list(
    z.strictObject({
      month,
      base: text,
      code: text,
      name: text,
      category: text,
      series: text,
      group: text,
      shipped: numeric.nullable(),
      prepped: numeric.nullable(),
      unprepped: numeric.nullable(),
      daily3: numeric.nullable(),
      open: numeric.nullable(),
      inbound: numeric.nullable(),
      remaining: numeric.nullable(),
    }),
  ).optional(),
});
export const mpsLocalDraftSchema = z.strictObject({
  id: text,
  name: text,
  month,
  pull: z.enum(['monthly', 'adjust', 'correction']),
  inputs: z.strictObject({
    products: input.optional(),
    annual: input.optional(),
    report: input.optional(),
    forecast: input.optional(),
    history: input.optional(),
  }),
  adjustments: z.strictObject({
    categoryDemand: list(categoryAdjustment),
    shares: list(shareAdjustment),
    quantities: list(quantityAdjustment).default([]),
    history: list(adjustmentHistory),
  }),
  constraints: z
    .strictObject({
      targetVersion: z.enum(['auto', '纠偏', '月初', '滚动']).optional(),
      safetyDays: list(z.strictObject({ base: text, days: quantity.nullable() })),
      rules: z.strictObject({
        history: list(
          z.strictObject({ at: z.iso.datetime(), ruleId: text, description: text, action: text }),
        ).optional(),
        local: list(
          z.strictObject({
            description: text,
            target: text,
            strength: text,
            until: text,
            id: text.optional(),
            category: text.optional(),
            source: text.optional(),
            base: text.optional(),
            code: text.optional(),
            productCategory: text.optional(),
            observations: list(
              z.strictObject({ month, value: numeric.nullable(), source: text }),
            ).optional(),
            from: text.optional(),
            enabled: z.boolean().optional(),
            accepted: z.boolean().optional(),
            effect: z
              .discriminatedUnion('kind', [
                z.strictObject({ kind: z.literal('resource-unavailable'), resourceId: text }),
                z.strictObject({ kind: z.literal('self-only') }),
                ...(
                  [
                    'inventory-days',
                    'production-days',
                    'transfer-limit',
                    'cost-limit',
                    'lead-days',
                  ] as const
                ).map((kind) =>
                  z.strictObject({ kind: z.literal(kind), value: quantity.nullable() }),
                ),
              ])
              .optional(),
          }),
        ),
      }),
    })
    .optional(),
  productionDays: list(
    z.strictObject({ base: text, month: text, days: quantity.nullable() }),
  ).optional(),
  unitWeights: list(
    z.strictObject({
      base: text,
      code: text,
      tonsPerPiece: quantity.nullable(),
      channels: text.optional(),
      source: z.strictObject({ configVersion: text, readAt: z.iso.datetime() }).optional(),
    }),
  ).optional(),
  resources: list(
    z.strictObject({
      id: text,
      base: text,
      kind: z.enum(['tunnel', 'forming']),
      name: text,
      dailyTons: quantity.nullable(),
    }),
  ).optional(),
  resourceAssignments: list(
    z.strictObject({
      month: text,
      base: text,
      code: text,
      resourceId: text,
      share: quantity.nullable(),
    }),
  ).optional(),
  shipment: shipment.optional(),
});
export const mpsLocalStateSchema = z
  .strictObject({
    format: z.literal(1),
    selected: text,
    drafts: z.array(mpsLocalDraftSchema).min(1).max(100),
  })
  .refine(
    (state) =>
      new Set(state.drafts.map((draft) => draft.id)).size === state.drafts.length &&
      state.drafts.some((draft) => draft.id === state.selected),
  );
export type MpsLocalState = z.infer<typeof mpsLocalStateSchema>;
