import { mpsLocalStateSchema } from '../../../src/mps-local-draft.ts';

export const emptyAdjustments = () => ({ categoryDemand: [], shares: [], history: [] });
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
              safetyDays: draft.constraints.safetyDays ?? [],
              rules: {
                local: (draft.constraints.rules?.local ?? []).map((row) =>
                  Object.fromEntries(
                    ['description', 'target', 'strength', 'until'].map((key) => [
                      key,
                      row[key] ?? '',
                    ]),
                  ),
                ),
              },
            },
          }
        : {}),
      ...fields(draft, ['productionDays', 'unitWeights', 'resources', 'resourceAssignments']),
      ...(draft.shipment
        ? {
            shipment: {
              ...fields(draft.shipment, ['cutoff', 'activeSource', 'values', 'remaining']),
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
export function changeAdjustment(adjustments, kind, input, undo = false) {
  const state = adjustments ?? emptyAdjustments();
  const key =
    kind === 'categoryDemand' ? JSON.stringify([input.month, input.category]) : input.rowId;
  const keyOf = (entry) =>
    kind === 'categoryDemand' ? JSON.stringify([entry.month, entry.category]) : entry.rowId;
  const previous = state[kind].find((entry) => keyOf(entry) === key);
  if (undo && !previous) return state;
  const entry = undo
    ? previous
    : {
        ...input,
        reason: String(input.reason ?? '').trim(),
        at: new Date().toISOString(),
      };
  const value = kind === 'categoryDemand' ? entry.quantity : entry.share;
  if (
    !undo &&
    (!entry.reason || !Number.isFinite(value) || value < 0 || (kind === 'shares' && value > 1))
  )
    throw Error('调整值须为非负有限数，占比不得超过1，并填写调整原因。');
  return {
    ...state,
    [kind]: [...state[kind].filter((entry) => keyOf(entry) !== key), ...(undo ? [] : [entry])],
    history: [
      ...state.history,
      {
        kind,
        key,
        action: undo ? 'undo' : 'set',
        systemValue: entry.systemValue ?? null,
        value: undo ? (entry.systemValue ?? null) : value,
        reason: entry.reason,
        at: new Date().toISOString(),
      },
    ],
  };
}
