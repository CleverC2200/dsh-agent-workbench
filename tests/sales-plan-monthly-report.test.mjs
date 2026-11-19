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
  ...fields,
});
const dimensions = {
  grading: '工厂仓',
  inventoryOrganization: '郑州总库存组织',
  customerType: '经销商',
  customerGroup: '三级',
  productGrade: '中端',
  materialGroupCode: '102121',
  materialGroupName: '思念312g元宝汤圆',
  correctionPlanQty: '-200',
  consensusPlanQty: '-200',
  correctedPlanQty: '100',
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
          categoryConfirmedQty: '100',
        }),
      ],
    },
  ];
};

test('monthly report merges customer SKU rows and preserves the sample 25 columns', () => {
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
    '产品档次',
    '物料组编码',
    '物料组名称',
    '产品编码',
    '产品名称',
    '状态',
    '纠偏状态',
    '月份',
    '月初计划',
    '纠偏计划',
    '共识计划',
    '纠偏后计划',
    '月初计划额',
    '纠偏后计划额',
  ]);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].slice(19).map(Number), [300, -200, -200, 100, 34512, 11504]);
  assert.deepEqual(rows[0].slice(0, 3), ['工厂仓', '郑州', '郑州总库存组织']);
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

test('new SKUs with two empty predecessor fields use the saved confirmation and the corresponding price', () => {
  const monthly = plan('M', '1', 2);
  const correction = plan('Z', '2', 7);
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
          }),
        ],
      },
    ],
    () => ({
      ...dimensions,
      correctionPlanQty: '12',
      consensusPlanQty: '12',
      correctedPlanQty: '12',
    }),
    () => '待审批',
  );
  assert.deepEqual(rows[0].slice(19).map(Number), [12, 0, 0, 12, 3540, 3540]);
  assert.deepEqual(rows[1].slice(19).map(Number), [0, 12, 12, 12, 0, 3540]);
  assert.equal(rows[1][16], 0);
  assert.equal(rows[0][17], 0);
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
  assert.deepEqual(row.slice(20, 23).map(Number), [0, 0, 0]);
  assert.throws(
    () =>
      m.salesPlanMonthlyReportRows(
        '2026-11',
        sources(),
        () => undefined,
        () => '',
      ),
    /UNCONFIRMED_REPORT_FIELDS.*共识计划/,
  );
  assert.throws(
    () =>
      m.salesPlanMonthlyReportRows(
        '2026-11',
        sources(),
        () => ({ ...dimensions, consensusPlanQty: undefined }),
        () => '',
      ),
    /UNCONFIRMED_REPORT_FIELDS.*共识计划/,
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
  const read = (c, signal = new AbortController().signal) =>
    m.readSalesPlanMonthlyReportSources(c, { month: '2026-11', signal });
  await assert.rejects(
    read(client({ list: { invoke: async () => ({ ...page([p]), size: 1, pages: 2, total: 2 }) } })),
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
