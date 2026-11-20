import { mpsLocalStateSchema } from '../../../src/mps-local-draft.ts';

export const adjustmentReasons = [
  '销售变化',
  '促销活动',
  '库存调整',
  '供应变化',
  '数据纠错',
  '其他',
];

export const emptyAdjustments = () => ({
  categoryDemand: [],
  shares: [],
  quantities: [],
  history: [],
});
const sources = ['products', 'annual', 'report', 'forecast', 'history'];
const columns = [
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
];
const fields = (row, names) =>
  Object.fromEntries(
    names.filter((name) => row[name] !== undefined).map((name) => [name, row[name]]),
  );
export function encodeLocalDrafts(drafts, selected) {
  return mpsLocalStateSchema.parse({
    format: 1,
    selected,
    drafts: drafts.map((draft) => ({
      id: draft.id,
      name: draft.name,
      month: draft.month,
      pull: draft.pull,
      ...fields(draft, ['festivalBasis']),
      inputs: Object.fromEntries(
        sources.flatMap((source) => {
          const local =
            source === 'products'
              ? ['local-file', 'local-edited'].includes(draft.productSource)
              : draft[source + 'Source'] === 'local-file';
          return local
            ? [
                [
                  source,
                  {
                    file: draft.files[source] ?? '本地维护',
                    rows: draft[source].map((row) => fields(row, columns)),
                  },
                ],
              ]
            : [];
        }),
      ),
      adjustments: draft.adjustments ?? emptyAdjustments(),
      ...(draft.constraints
        ? {
            constraints: {
              ...(draft.constraints.targetVersion
                ? { targetVersion: draft.constraints.targetVersion }
                : {}),
              safetyDays: draft.constraints.safetyDays ?? [],
              ...(draft.constraints.turnoverDays
                ? { turnoverDays: draft.constraints.turnoverDays }
                : {}),
              rules: {
                ...structuredClone(draft.constraints.rules ?? { local: [] }),
              },
            },
          }
        : {}),
      ...fields(draft, [
        'productionDays',
        'unitWeights',
        'resources',
        'resourceAssignments',
        'inventoryMovements',
      ]),
      ...(draft.shipment
        ? {
            shipment: {
              ...fields(draft.shipment, [
                'cutoff',
                'activeSource',
                'values',
                'remaining',
                'transferPlans',
                'editsByCutoff',
              ]),
              ...(draft.shipment.sourceEdits
                ? {
                    sourceEdits: Object.fromEntries(
                      ['local-file', 'business'].flatMap((source) =>
                        draft.shipment.sourceEdits[source]
                          ? [
                              [
                                source,
                                fields(draft.shipment.sourceEdits[source], ['values', 'remaining']),
                              ],
                            ]
                          : [],
                      ),
                    ),
                  }
                : {}),
              ...(draft.shipment.rows ? fields(draft.shipment, ['rows', 'file']) : {}),
            },
          }
        : {}),
    })),
  });
}
export function decodeLocalDrafts(value, makeDraft, fallback) {
  const result = mpsLocalStateSchema.safeParse(value);
  if (!result.success) return fallback();
  return {
    selected: result.data.selected,
    drafts: result.data.drafts.map(({ inputs, ...saved }) => {
      const draft = { ...makeDraft(saved.id, saved.month), ...saved };
      for (const [source, input] of Object.entries(inputs)) {
        draft[source] = input.rows;
        draft.files[source] = input.file;
        draft[source === 'products' ? 'productSource' : source + 'Source'] = 'local-file';
        draft[source + 'Read'] = { status: 'ready' };
      }
      return draft;
    }),
  };
}
export const quantityAdjustmentKey = (entry) =>
  JSON.stringify([
    entry.month,
    entry.category,
    entry.group,
    entry.kind,
    entry.code ?? '',
    entry.base ?? '',
  ]);
export const isLegacyQuantityAdjustment = (entry) => entry.kind === 'group' || entry.kind === 'sku';

export const matchesQuantityAdjustment = (row, entry) =>
  !isLegacyQuantityAdjustment(entry) &&
  row.month === entry.month &&
  row.category === entry.category &&
  (entry.group === undefined || row.group === entry.group) &&
  (entry.base === undefined || row.base === entry.base) &&
  (entry.kind === 'base-sku' ? row.code === entry.code : !row.delisted);

export function changeAdjustment(adjustments, kind, input, undo = false) {
  const state = adjustments ?? emptyAdjustments();
  if (
    kind !== 'shares' &&
    (kind !== 'quantities' || !['base-sku', 'category-total', 'group-total'].includes(input.kind))
  )
    throw Error('需求调整范围无效。');
  const keyOf = kind === 'quantities' ? quantityAdjustmentKey : (entry) => entry.rowId;
  const key = keyOf(input);
  const previous = (state[kind] ?? []).find((entry) => keyOf(entry) === key);
  if (undo && !previous) return state;
  const entry = undo
    ? previous
    : {
        ...input,
        reason: String(input.reason ?? '').trim(),
        at: new Date().toISOString(),
      };
  const value = kind === 'shares' ? entry.share : entry.quantity;
  if (
    !undo &&
    (!entry.reason || !Number.isFinite(value) || value < 0 || (kind === 'shares' && value > 1))
  )
    throw Error('调整值须为非负有限数，占比不得超过1，并填写调整原因。');
  return {
    ...state,
    [kind]: [
      ...(state[kind] ?? []).filter((entry) => keyOf(entry) !== key),
      ...(undo ? [] : [entry]),
    ],
    history: [
      ...state.history,
      {
        kind,
        key,
        action: undo ? 'undo' : 'set',
        systemValue: entry.systemValue ?? null,
        value: undo ? (input.effectiveValue ?? null) : value,
        reason: entry.reason,
        at: new Date().toISOString(),
      },
    ],
  };
}

export function archiveUpperAdjustments(adjustments) {
  const state = adjustments ?? emptyAdjustments();
  const upper = [
    ...state.categoryDemand.map((entry) => ({ kind: 'categoryDemand', entry })),
    ...state.quantities
      .filter(isLegacyQuantityAdjustment)
      .map((entry) => ({ kind: 'quantities', entry })),
  ];
  if (!upper.length) return state;
  return {
    ...state,
    categoryDemand: [],
    quantities: state.quantities.filter((entry) => !isLegacyQuantityAdjustment(entry)),
    history: [
      ...state.history,
      ...upper.map(({ kind, entry }) => ({
        kind,
        key:
          kind === 'categoryDemand'
            ? JSON.stringify([entry.month, entry.category])
            : quantityAdjustmentKey(entry),
        action: 'archive',
        systemValue: entry.systemValue ?? null,
        value: entry.quantity,
        reason: entry.reason,
        at: entry.at,
        archivedAt: new Date().toISOString(),
      })),
    ],
  };
}
