import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const bundle = await build({
  entryPoints: [
    'src/workbench/original/workbenches/regionalApproval/models/salesPlanMonthlyReportModel.ts',
  ],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
});
const temporary = await mkdtemp(join(tmpdir(), 'sales-monthly-report-'));
await writeFile(join(temporary, 'model.mjs'), bundle.outputFiles[0].contents);
const m = await import(pathToFileURL(join(temporary, 'model.mjs')).href);
test.after(() => rm(temporary, { recursive: true, force: true }));

const plan = (orderType, dealerCode, status = 5) => ({
  planId: orderType + dealerCode,
  versionId: 'v-' + orderType + dealerCode,
  periodId: 'period',
  planTypeCode: 'Y',
  orderType,
  dealerCode,
  dealerName: '客户' + dealerCode,
  orgName: '区域',
  provinceName: '省区',
  areaName: '大区',
  baseName: '郑州',
  status,
  skuCount: 1,
});
const sku = (p, fields = {}) => ({
  id: 's-' + p.versionId,
  versionId: p.versionId,
  skuCode: '10006285',
  skuName: '汤圆',
  productCategName: '汤圆',
  baseQty: '300',
  qty: '300',
  price: '115.04',
  amtBase: '34512',
  amt: '34512',
  regionConfirmedQty: null,
  regionConfirmedAmount: null,
  provinceConfirmedQty: null,
  provinceConfirmedAmount: null,
  areaConfirmedQty: null,
  areaConfirmedAmount: null,
  categoryConfirmedQty: null,
  categoryConfirmedAmount: null,
  adjAddQty: null,
  adjCutQty: null,
  categoryAdjAddQty: null,
  categoryAdjCutQty: null,
  ...fields,
});
const dimensions = {
  grading: '工厂仓',
  inventoryOrganization: '郑州总库存组织',
  customerType: '经销商',
  customerGroup: '三级',
  materialGroupCode: '102121',
  materialGroupName: '思念312g元宝汤圆',
};
const sources = () => {
  const monthly = plan('M', '10010698');
  const correction = plan('Z', '10010698');
  return [
    { plan: monthly, skus: [sku(monthly)] },
    {
      plan: correction,
      skus: [
        sku(correction, {
          corrBaseQty: '300',
          adjAddQty: '0',
          adjCutQty: '200',
          categoryAdjAddQty: '0',
          categoryAdjCutQty: '150',
          categoryConfirmedQty: '150',
        }),
      ],
    },
  ];
};

test('monthly report merges customer SKU rows and preserves the confirmed 24 columns', () => {
  const rows = m.salesPlanMonthlyReportRows(
    '2026-11',
    sources(),
    () => dimensions,
    () => '审批完成',
  );
  assert.deepEqual(m.SALES_PLAN_MONTHLY_REPORT_HEADERS, [
    '分级',
    '所属基地',
    '库存组织',
    '大区',
    '省区',
    '区域名称',
    '客户类型',
    '客户组名称',
    '客户编码',
    '客户名称',
    '产品大类',
    '物料组编码',
    '物料组名称',
    '产品编码',
    '产品名称',
    '状态',
    '纠偏状态',
    '月份',
    '月初计划',
    '纠偏计划（客户）',
    '纠偏计划（品类）',
    '纠偏后计划',
    '月初计划额',
    '纠偏后计划额',
  ]);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].slice(18).map(Number), [300, -200, -150, 150, 34512, 17256]);
  assert.deepEqual(rows[0].slice(0, 3), ['工厂仓', '郑州', '郑州总库存组织']);
});

test('monthly report uses the existing whole-piece confirmation before computing line amounts', () => {
  const p = plan('M', '1', 1);
  const [row] = m.salesPlanMonthlyReportRows(
    '2026-11',
    [
      {
        plan: p,
        skus: [sku(p, { qty: '8420.4', price: '75' })],
      },
    ],
    () => dimensions,
    () => '待审批',
  );
  assert.equal(Number(row[18]), 8420);
  assert.equal(Number(row[22]), 631500);
  assert.equal(Number(row[23]), 631500);
});

test('an approved monthly plan rounds its saved category confirmation rather than the original submitted quantity', () => {
  const p = plan('M', '1', 5);
  const [row] = m.salesPlanMonthlyReportRows(
    '2026-11',
    [
      {
        plan: p,
        skus: [sku(p, { qty: '99', price: '75', categoryConfirmedQty: '10.6' })],
      },
    ],
    () => dimensions,
    () => '审批完成',
  );
  assert.equal(Number(row[18]), 11);
  assert.equal(Number(row[22]), 825);
});

test('report collection reads both plan types across every API page without node or selection filters', async () => {
  const calls = [];
  const all = [plan('M', '1', 1), plan('M', '2', 8), plan('Z', '1', 4)];
  const page = (records, q) => ({
    records: records.slice((q.pageNo - 1) * 1, q.pageNo),
    total: records.length,
    current: q.pageNo,
    size: 1,
    pages: records.length,
  });
  const client = {
    periods: { invoke: async (q) => page([{ periodId: 'period', periodMonth: '2026-11' }], q) },
    list: {
      invoke: async (q) => {
        calls.push(q);
        return page(
          all.filter((p) => p.orderType === q.orderType),
          q,
        );
      },
    },
    versionSkus: {
      invoke: async ({ versionId }) => [sku(all.find((p) => p.versionId === versionId))],
    },
  };
  const result = await m.readSalesPlanMonthlyReportSources(client, {
    month: '2026-11',
    signal: new AbortController().signal,
  });
  assert.deepEqual(result.map((x) => x.plan.planId).sort(), ['M1', 'M2', 'Z1']);
  assert.equal(calls.filter((q) => q.orderType === 'M' && q.pageNo === 2).length, 2);
  assert.ok(
    calls.every(
      (q) => q.status === undefined && q.approvalRole === undefined && q.versionIds === undefined,
    ),
  );
});

test('all readable months retain separate customer SKU rows across period and plan pages', async () => {
  const calls = [];
  const periods = [
    { periodId: 'october', periodMonth: '2026-10' },
    { periodId: 'november', periodMonth: '2026-11' },
  ];
  const all = [
    { ...plan('M', '1', 1), periodId: 'october' },
    { ...plan('M', '2', 8), periodId: 'october' },
    { ...plan('Z', '1', 4), periodId: 'october' },
    { ...plan('M', '1', 5), planId: 'nov-M1', versionId: 'nov-v1', periodId: 'november' },
  ];
  const page = (records, q) => ({
    records: records.slice(q.pageNo - 1, q.pageNo),
    total: records.length,
    current: q.pageNo,
    size: 1,
    pages: records.length,
  });
  const client = {
    periods: {
      invoke: async (q) => {
        calls.push(['periods', q]);
        return page(periods, q);
      },
    },
    list: {
      invoke: async (q) => {
        calls.push(['list', q]);
        return page(
          all.filter((p) => p.periodId === q.periodId && p.orderType === q.orderType),
          q,
        );
      },
    },
    versionSkus: {
      invoke: async ({ versionId }) => [sku(all.find((p) => p.versionId === versionId))],
    },
  };
  const sources = await m.readAllSalesPlanMonthlyReportSources(client, {
    signal: new AbortController().signal,
  });
  assert.deepEqual(
    sources.map((source) => [source.month, source.plan.planId]),
    [
      ['2026-10', 'M1'],
      ['2026-10', 'M2'],
      ['2026-10', 'Z1'],
      ['2026-11', 'nov-M1'],
    ],
  );
  const rows = m.salesPlanAllMonthlyReportRows(
    sources,
    () => dimensions,
    () => '审批完成',
  );
  assert.deepEqual(
    rows.map((row) => [row[17], row[8]]),
    [
      ['2026-10', '1'],
      ['2026-10', '2'],
      ['2026-11', '1'],
    ],
  );
  assert.equal(rows[2][18], '300');
  assert.ok(
    calls
      .filter(([kind]) => kind === 'periods')
      .every(([, query]) => !Object.hasOwn(query, 'periodMonth')),
  );
  assert.equal(calls.filter(([kind, q]) => kind === 'periods' && q.pageNo === 2).length, 2);
  assert.equal(
    calls.filter(
      ([kind, q]) =>
        kind === 'list' && q.periodId === 'october' && q.orderType === 'M' && q.pageNo === 2,
    ).length,
    2,
  );
  assert.ok(
    calls.every(
      ([, q]) =>
        q.status === undefined && q.approvalRole === undefined && q.versionIds === undefined,
    ),
  );
  const readSkus = client.versionSkus.invoke;
  client.versionSkus.invoke = async (query) => {
    const skus = await readSkus(query);
    if (query.versionId === 'nov-v1') periods[0].periodMonth = '2026-09';
    return skus;
  };
  await assert.rejects(
    m.readAllSalesPlanMonthlyReportSources(client, {
      signal: new AbortController().signal,
    }),
    { code: 'REPORT_VERSION_CHANGED' },
  );
});

test('new SKUs with two empty predecessor fields use the saved confirmation and the corresponding price', () => {
  const monthly = plan('M', '1', 2);
  const correction = plan('Z', '2', 5);
  const rows = m.salesPlanMonthlyReportRows(
    '2026-11',
    [
      {
        plan: monthly,
        skus: [
          sku(monthly, { qty: '0', baseQty: '0', price: '295.00', provinceConfirmedQty: '12' }),
        ],
      },
      {
        plan: correction,
        skus: [
          sku(correction, {
            qty: '0',
            baseQty: '0',
            corrBaseQty: '0',
            price: '295.00',
            regionConfirmedQty: '12',
            categoryConfirmedQty: '12',
            adjAddQty: '12',
            adjCutQty: '0',
            categoryAdjAddQty: '12',
            categoryAdjCutQty: '0',
          }),
        ],
      },
    ],
    () => dimensions,
    () => '待审批',
  );
  assert.deepEqual(rows[0].slice(18).map(Number), [12, 0, 0, 12, 3540, 3540]);
  assert.deepEqual(rows[1].slice(18).map(Number), [0, 12, 12, 12, 0, 3540]);
  assert.equal(rows[1][15], 0);
  assert.equal(rows[0][16], 0);
});

test('real null facts are zero while unavailable fields are explicit failures', () => {
  const nullFacts = Object.fromEntries(Object.keys(dimensions).map((key) => [key, null]));
  const [row] = m.salesPlanMonthlyReportRows(
    '2026-11',
    sources(),
    () => nullFacts,
    () => '审批完成',
  );
  assert.equal(row[0], 0);
  assert.deepEqual(row.slice(19, 22).map(Number), [-200, -150, 150]);
  assert.throws(
    () =>
      m.salesPlanMonthlyReportRows(
        '2026-11',
        sources(),
        () => undefined,
        () => '',
      ),
    /UNCONFIRMED_REPORT_FIELDS.*客户类型/,
  );
  assert.throws(
    () =>
      m.salesPlanMonthlyReportRows(
        '2026-11',
        sources(),
        () => ({ ...dimensions, customerType: undefined }),
        () => '',
      ),
    /UNCONFIRMED_REPORT_FIELDS.*客户类型/,
  );
});

test('collection rejects a version changed while details were being read, including cached list objects', async () => {
  const p = plan('M', '1');
  const page = (records) => ({
    records,
    total: records.length,
    current: 1,
    size: 200,
    pages: records.length ? 1 : 0,
  });
  const client = {
    periods: { invoke: async () => page([{ periodId: 'period', periodMonth: '2026-11' }]) },
    list: { invoke: async (q) => page(q.orderType === 'M' ? [p] : []) },
    versionSkus: {
      invoke: async () => {
        const s = sku(p);
        p.versionId = 'changed';
        return [s];
      },
    },
  };
  await assert.rejects(
    m.readSalesPlanMonthlyReportSources(client, {
      month: '2026-11',
      signal: new AbortController().signal,
    }),
    { code: 'REPORT_VERSION_CHANGED' },
  );
});

test('collector fails on missing pages, wrong identities, permission denial and cancellation', async () => {
  const p = plan('M', '1');
  const page = (records) => ({
    records,
    total: records.length,
    current: 1,
    size: 200,
    pages: records.length ? 1 : 0,
  });
  const client = (overrides) => ({
    periods: { invoke: async () => page([{ periodId: 'period', periodMonth: '2026-11' }]) },
    list: { invoke: async (q) => page(q.orderType === 'M' ? [p] : []) },
    versionSkus: { invoke: async () => [sku(p)] },
    ...overrides,
  });
  for (const collect of [
    (c, signal) => m.readSalesPlanMonthlyReportSources(c, { month: '2026-11', signal }),
    (c, signal) => m.readAllSalesPlanMonthlyReportSources(c, { signal }),
  ]) {
    const read = (c, signal = new AbortController().signal) => collect(c, signal);
    await assert.rejects(
      read(
        client({ list: { invoke: async () => ({ ...page([p]), size: 1, pages: 2, total: 2 }) } }),
      ),
      { code: 'INCOMPLETE_REPORT_PAGE' },
    );
    await assert.rejects(read(client({ versionSkus: { invoke: async () => [] } })), {
      code: 'INCOMPLETE_REPORT_SKUS',
    });
    await assert.rejects(
      read(client({ versionSkus: { invoke: async () => [{ ...sku(p), versionId: 'foreign' }] } })),
      { code: 'INCOMPLETE_REPORT_SKUS' },
    );
    await assert.rejects(
      read(
        client({
          list: {
            invoke: async () => {
              throw new Error('PERMISSION_DENIED');
            },
          },
        }),
      ),
      /PERMISSION_DENIED/,
    );
    const controller = new AbortController();
    await assert.rejects(
      read(
        client({
          versionSkus: {
            invoke: async () => {
              controller.abort();
              return [sku(p)];
            },
          },
        }),
        controller.signal,
      ),
      { name: 'AbortError' },
    );
  }
});

test('unrelated shipment enrichment changes do not invalidate a stable report version', async () => {
  const p = plan('M', '1');
  let read = 0;
  const page = (records) => ({
    records,
    total: records.length,
    current: 1,
    size: 200,
    pages: records.length ? 1 : 0,
  });
  const client = {
    periods: { invoke: async () => page([{ periodId: 'period', periodMonth: '2026-11' }]) },
    list: {
      invoke: async (q) => page(q.orderType === 'M' ? [{ ...p, shipAmount: String(read++) }] : []),
    },
    versionSkus: { invoke: async () => [sku(p)] },
  };
  assert.equal(
    (
      await m.readSalesPlanMonthlyReportSources(client, {
        month: '2026-11',
        signal: new AbortController().signal,
      })
    ).length,
    1,
  );
});

test('known null and blank report text are zero while an unread field still fails', () => {
  for (const grading of [null, '', '  ']) {
    const [row] = m.salesPlanMonthlyReportRows(
      '2026-11',
      sources(),
      () => ({ ...dimensions, grading }),
      () => '审批完成',
    );
    assert.equal(row[0], 0);
  }
  assert.throws(
    () =>
      m.salesPlanMonthlyReportRows(
        '2026-11',
        sources(),
        () => ({ ...dimensions, grading: undefined }),
        () => '审批完成',
      ),
    /UNCONFIRMED_REPORT_FIELDS.*分级/,
  );
});

test('category saved values remain excluded until category approval completes', () => {
  for (const status of [0, 1, 2, 3, 4, 6, 7, 8, 9]) {
    const input = sources();
    input[1].plan.status = status;
    const [row] = m.salesPlanMonthlyReportRows(
      '2026-11',
      input,
      () => dimensions,
      () => '待审批',
    );
    assert.deepEqual(row.slice(18).map(Number), [300, -200, 0, 300, 34512, 34512]);
  }
});

test('zero adjustment values are business zero and unread or malformed source fields fail', () => {
  const input = sources();
  for (const field of ['adjAddQty', 'adjCutQty']) {
    for (const value of [undefined, '', 'bad', '-1', 0]) {
      const changed = structuredClone(input);
      changed[1].skus[0][field] = value;
      assert.throws(
        () =>
          m.salesPlanMonthlyReportRows(
            '2026-11',
            changed,
            () => dimensions,
            () => '',
          ),
        { code: value === undefined ? 'UNCONFIRMED_REPORT_FIELDS' : 'INVALID_REPORT_FIELD' },
      );
    }
  }
  for (const value of [null, '0', '0.000']) {
    const changed = structuredClone(input);
    Object.assign(changed[1].skus[0], {
      adjAddQty: value,
      adjCutQty: value,
      categoryConfirmedQty: '300',
    });
    const [row] = m.salesPlanMonthlyReportRows(
      '2026-11',
      changed,
      () => dimensions,
      () => '',
    );
    assert.deepEqual(row.slice(18).map(Number), [300, 0, 0, 300, 34512, 34512]);
  }
});

test('signed decimal adjustments and each effective version price keep their exact values', () => {
  const input = sources();
  Object.assign(input[0].skus[0], { qty: '9007199254740993', price: '0.01' });
  Object.assign(input[1].skus[0], {
    adjAddQty: '0.1',
    adjCutQty: '0.3',
    corrBaseQty: '300',
    categoryConfirmedQty: '300.1',
    price: '0.02',
  });
  const [row] = m.salesPlanMonthlyReportRows(
    '2026-11',
    input,
    () => dimensions,
    () => '',
  );
  assert.deepEqual(row.slice(18), [
    '9007199254740993',
    '-0.2',
    '0.1',
    '9007199254740993.1',
    '90071992547409.93',
    '180143985094819.86',
  ]);
});

test('DMS synchronized completion retains the approved category correction', () => {
  const input = sources();
  input[1].plan.status = 10;
  const [row] = m.salesPlanMonthlyReportRows(
    '2026-11',
    input,
    () => dimensions,
    () => '已完成',
  );
  assert.deepEqual(row.slice(18).map(Number), [300, -200, -150, 150, 34512, 17256]);
});

test('approved ordinary correction derives category change from confirmed quantity and fixed baseline', () => {
  for (const fields of [
    { categoryAdjAddQty: null, categoryAdjCutQty: null },
    { categoryAdjAddQty: '77', categoryAdjCutQty: '0' },
  ]) {
    const input = sources();
    Object.assign(input[1].skus[0], fields);
    const [row] = m.salesPlanMonthlyReportRows(
      '2026-11',
      input,
      () => dimensions,
      () => '',
    );
    assert.deepEqual(row.slice(18).map(Number), [300, -200, -150, 150, 34512, 17256]);
  }
});

test('completed correction requires read category confirmation and baseline while pending nodes do not', () => {
  for (const status of [5, 10]) {
    for (const field of ['categoryConfirmedQty', 'corrBaseQty']) {
      for (const value of [undefined, null, '', 'bad', '-1', 0]) {
        const input = sources();
        input[1].plan.status = status;
        input[1].skus[0][field] = value;
        assert.throws(
          () =>
            m.salesPlanMonthlyReportRows(
              '2026-11',
              input,
              () => dimensions,
              () => '',
            ),
          { code: value === undefined ? 'UNCONFIRMED_REPORT_FIELDS' : 'INVALID_REPORT_FIELD' },
        );
      }
    }
  }
  const input = sources();
  input[1].plan.status = 4;
  Object.assign(input[1].skus[0], {
    categoryConfirmedQty: undefined,
    corrBaseQty: undefined,
    categoryAdjAddQty: undefined,
    categoryAdjCutQty: undefined,
  });
  const [row] = m.salesPlanMonthlyReportRows(
    '2026-11',
    input,
    () => dimensions,
    () => '',
  );
  assert.deepEqual(row.slice(18).map(Number), [300, -200, 0, 300, 34512, 34512]);
});
