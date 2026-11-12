export const workflowDraft = () => ({
  id: 'v1',
  name: '本地核对',
  month: '2026-12',
  pull: 'monthly',
  productSource: 'local-file',
  products: [
    {
      基地: '',
      产品编码: 'A',
      产品名称: '产品A',
      大类: '点心',
      系列: '系列',
      物料组: '包点',
    },
    {
      基地: '',
      产品编码: 'B',
      产品名称: '产品B',
      大类: '点心',
      系列: '系列',
      物料组: '包点',
    },
  ],
  report: [
    { 月份: '2026-12', 基地: '甲', 产品编码: 'A', 月初数量: 30, 纠偏数量: 90 },
    { 月份: '2026-12', 基地: '乙', 产品编码: 'B', 月初数量: 70, 纠偏数量: 10 },
  ],
  history: [
    { 月份: '2025-12', 基地: '甲', 产品编码: 'A', 数量: 60, 不含税收入: '' },
    { 月份: '2025-12', 基地: '乙', 产品编码: 'B', 数量: 40, 不含税收入: '' },
  ],
  historyMetadata: { partial: true, warnings: ['部分收入为空'] },
  historyAnnual: {
    periods: [
      {
        start: '2025-07-01',
        end: '2026-06-30',
        rows: [
          { 基地: '甲', 产品编码: 'A', 数量: 60 },
          { 基地: '乙', 产品编码: 'B', 数量: 40 },
        ],
      },
    ],
  },
  historyAnnualRead: { status: 'ready' },
  reportRead: { status: 'ready' },
  historyRead: { status: 'ready' },
  categoryDemand: [{ month: '2026-12', category: '点心', quantity: 120 }],
  constraints: {
    safetyDays: [{ base: '甲', days: 0 }],
    rules: { local: [{ description: '本地', strength: '硬' }] },
  },
});

export function workflowPerformanceInput(size = 200) {
  const draft = workflowDraft();
  const codes = Array.from({ length: size }, (_, index) => String(index));
  const months = ['2026-12', '2027-01', '2027-02'];
  draft.products = codes.map((code) => ({ ...draft.products[0], 基地: '甲', 产品编码: code }));
  draft.report = codes.map((code) => ({
    月份: draft.month,
    基地: '甲',
    产品编码: code,
    月初数量: 1,
  }));
  draft.historyAnnual.periods[0].rows = codes.map((code) => ({
    基地: '甲',
    产品编码: code,
    数量: 1,
  }));
  draft.categoryDemand = [...months, '2027-03'].map((month) => ({
    month,
    category: '点心',
    quantity: 100,
  }));
  draft.resources = [{ id: 'R', base: '甲', kind: 'tunnel', name: '共享产线', dailyTons: 2 }];
  draft.resourceAssignments = codes.map((code) => ({
    base: '甲',
    code,
    resourceId: 'R',
    share: 1,
  }));
  draft.unitWeights = codes.map((code) => ({ base: '甲', code, tonsPerPiece: 1 }));
  draft.productionDays = months.map((month) => ({ base: '甲', month, days: 25 }));
  draft.constraints = { safetyDays: [{ base: '甲', days: 0 }], rules: { local: [] } };
  const shipment = {
    draftId: draft.id,
    month: draft.month,
    shipmentMonth: '2026-11',
    source: 'local-file',
    status: 'ready',
    rows: codes.map((code) => ({ base: '甲', code, end: 0 })),
  };
  return { draft, relations: null, shipment, evaluation: {} };
}
