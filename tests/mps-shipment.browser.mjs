import test from 'node:test';
import assert from 'node:assert/strict';
import { expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { mpsPage } from './helpers/mps-page.mjs';
import { authorPage } from './helpers/author-page.mjs';

const columns =
  '月份,基地,产品编码,产品名称,大类,系列,物料组,本月已发货,已备,未备,近三天日均发货量,月初库存,本月生产入库,剩余天数入库';
async function shipment(t, month = '2026-10') {
  const page = await authorPage(t);
  await page.evaluate(() => window.openAuthor('mps', 1200));
  const frame = page.frameLocator('iframe');
  await frame.getByRole('button', { name: '新建评估版本', exact: true }).click();
  const dialog = frame.getByRole('dialog', { name: '新建评估版本', exact: true });
  await dialog.getByLabel('评估月份', { exact: true }).fill(month);
  await dialog.getByRole('button', { name: '创建本地版本', exact: true }).click();
  await frame.locator('.ap-page-tab').filter({ hasText: '本月预估发货' }).click();
  return { page, frame, table: frame.getByRole('table', { name: '本月预估发货明细' }) };
}
async function upload(frame, rows) {
  await frame.getByLabel('选择发货输入CSV', { exact: true }).setInputFiles({
    name: '发货核对.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(columns + '\n' + rows.join('\n')),
  });
}

test('MPS shipment recalculates local warehouse inputs in pieces and explains the aggregated forecast separately from SKU totals', async (t) => {
  const { frame, table } = await shipment(t);
  await upload(frame, [
    '2026-09,郑州,A,产品A,汤圆,系列,组,220,10,10,10,100,200,80',
    '2026-09,郑州,B,产品B,汤圆,系列,组,110,0,0,0,10,20,8',
  ]);
  await expect(frame.getByLabel('数据截止日')).toHaveValue('2026-09-22');
  await expect(
    table
      .getByRole('row', { name: /全国合计/ })
      .getByLabel('全国合计 整月预估发货', { exact: true }),
  ).toHaveValue('450');
  await frame.getByRole('button', { name: '展开 郑州', exact: true }).click();
  await expect(table.getByLabel('郑州 A 整月预估发货', { exact: true })).toHaveValue('300');
  await expect(table.getByLabel('郑州 B 整月预估发货', { exact: true })).toHaveValue('150');
  await table.getByRole('button', { name: '郑州 A 本月预测量 计算过程', exact: true }).click();
  const formula = frame.getByRole('dialog', { name: /计算过程/ });
  await expect(formula).toContainText('(240 ÷ (22 + 2)) × max(0, 30 − 22 − 2) + 240');
  await expect(formula).toContainText('300');
  await frame.getByRole('button', { name: '关闭弹窗', exact: true }).click();
  await table.getByRole('button', { name: '全国合计 本月预测量 计算过程', exact: true }).click();
  await expect(formula).toContainText('438');
});

async function edit(table, label, value) {
  const input = table.getByLabel(label, { exact: true });
  await input.fill(String(value));
  await input.press('Enter');
}
async function exported(page, frame) {
  const waiting = page.waitForEvent('download');
  await frame.getByRole('button', { name: '下载明细', exact: true }).click();
  const chunks = [];
  for await (const chunk of await (await waiting).createReadStream()) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}
test('MPS shipment applies SKU, base and national adjustments to current effective values with exact totals, residuals and signed export evidence', async (t) => {
  const { page, frame, table } = await shipment(t);
  await upload(frame, [
    '2026-09,郑州,A,=1+1,汤圆,系列,组,220,10,10,10,100,200,80',
    '2026-09,郑州,B,产品B,汤圆,系列,组,110,0,0,0,10,20,8',
    '2026-09,华东,C,产品C,汤圆,系列,组,110,0,0,0,10,20,8',
    '2026-09,濮阳,D,不计入全国,汤圆,系列,组,999,0,0,1,0,0,0',
  ]);
  await frame.getByRole('button', { name: '展开 郑州', exact: true }).click();
  await edit(table, '郑州 A 整月预估发货', 301);
  await expect(table.getByLabel('郑州 B 整月预估发货', { exact: true })).toHaveValue('150');
  await edit(table, '郑州 整月预估发货', 100);
  await expect(table.getByLabel('郑州 A 整月预估发货', { exact: true })).toHaveValue('67');
  await expect(table.getByLabel('郑州 B 整月预估发货', { exact: true })).toHaveValue('33');
  await edit(table, '郑州 B 整月预估发货', 34);
  await expect(table.getByLabel('郑州 A 整月预估发货', { exact: true })).toHaveValue('67');
  await edit(table, '全国合计 整月预估发货', 101);
  await expect(table.getByLabel('郑州 整月预估发货', { exact: true })).toHaveValue('41');
  await expect(table.getByLabel('华东 整月预估发货', { exact: true })).toHaveValue('60');
  await expect(table.getByLabel('郑州 A 整月预估发货', { exact: true })).toHaveValue('27');
  await expect(table.getByLabel('郑州 B 整月预估发货', { exact: true })).toHaveValue('14');
  await edit(table, '郑州 剩余天数入库', 11);
  await expect(
    table.getByRole('button', { name: '郑州 A 剩余天数入库 计算过程', exact: true }),
  ).toHaveText('10');
  await expect(
    table.getByRole('button', { name: '郑州 B 剩余天数入库 计算过程', exact: true }),
  ).toHaveText('1');
  await edit(table, '郑州 A 整月预估发货', -3);
  await edit(table, '华东 整月预估发货', 1000);
  await expect(table.getByRole('row').filter({ hasText: '华东' }).first()).toContainText(
    '需含调拨',
  );
  await table.getByLabel('郑州 B 整月预估发货', { exact: true }).dblclick();
  await expect(frame.getByRole('dialog', { name: /计算过程/ })).toContainText('全国合计覆盖101件');
  await frame.getByRole('button', { name: '关闭弹窗', exact: true }).click();
  const csv = await exported(page, frame);
  assert.match(csv, /截止日/);
  assert.match(csv, /2026-09-22/);
  assert.match(csv, /'=1\+1/);
  assert.match(csv, /,-3,/);
  assert.doesNotMatch(csv, /不计入全国/);
  await frame.getByRole('button', { name: '重置', exact: true }).click();
  await expect(table.getByLabel('全国合计 整月预估发货', { exact: true })).toHaveValue('600');
});

test('MPS shipment keeps positive equal-weight residuals nonnegative and allocates signed targets exactly', async (t) => {
  const { frame, table } = await shipment(t);
  await upload(
    frame,
    ['A', 'B', 'C', 'D'].map(
      (code) => `2026-09,郑州,${code},产品${code},汤圆,系列,组,22,0,0,1,0,0,1`,
    ),
  );
  await frame.getByRole('button', { name: '展开 郑州', exact: true }).click();
  await edit(table, '郑州 整月预估发货', 2);
  const amounts = async () =>
    Promise.all(
      ['A', 'B', 'C', 'D'].map((code) =>
        table.getByLabel(`郑州 ${code} 整月预估发货`, { exact: true }).inputValue(),
      ),
    );
  await expect.poll(amounts).toEqual(['1', '1', '0', '0']);
  await edit(table, '郑州 剩余天数入库', 2);
  for (const [index, code] of ['A', 'B', 'C', 'D'].entries())
    await expect(
      table.getByRole('button', { name: `郑州 ${code} 剩余天数入库 计算过程`, exact: true }),
    ).toHaveText(index < 2 ? '1' : '0');
  await frame.getByRole('button', { name: '重置', exact: true }).click();
  await edit(table, '郑州 整月预估发货', -2);
  await expect.poll(amounts).toEqual(['-1', '-1', '0', '0']);
  await expect(table.getByLabel('全国合计 整月预估发货', { exact: true })).toHaveValue('-2');
});

test('MPS shipment distinguishes missing input from zero, uses the monthly fallback and keeps orders beyond month end without fabricated data', async (t) => {
  const { frame, table } = await shipment(t);
  await upload(frame, [
    '2026-09,西南,Z,零输入,汤圆,系列,组,0,0,0,0,0,0,0',
    '2026-09,郑州,F,回退日均,汤圆,系列,组,220,10,10,0,0,0,0',
    '2026-09,郑州,U,无可用日均,汤圆,系列,组,0,1,1,0,0,0,0',
    '2026-09,郑州,M,缺已备,汤圆,系列,组,220,,0,1,0,0,0',
    '2026-09,郑州,L,订单覆盖月底,汤圆,系列,组,22,100,0,1,0,0,0',
  ]);
  await frame.getByRole('button', { name: '展开 郑州', exact: true }).click();
  await expect(table.getByLabel('郑州 F 整月预估发货', { exact: true })).toHaveValue('300');
  await expect(table.getByLabel('郑州 U 整月预估发货', { exact: true })).toHaveAttribute(
    'placeholder',
    '待定',
  );
  await expect(table.getByLabel('郑州 M 整月预估发货', { exact: true })).toHaveValue('');
  await expect(table.getByLabel('郑州 L 整月预估发货', { exact: true })).toHaveValue('122');
  await expect(table.getByLabel('西南 整月预估发货', { exact: true })).toHaveValue('0');
  await edit(table, '西南 整月预估发货', 1);
  await expect(frame.getByRole('alert')).toContainText('非零目标的分摊口径待确认');
  await expect(table.getByLabel('西南 整月预估发货', { exact: true })).toHaveValue('0');
  await edit(table, '西南 剩余天数入库', 1);
  await expect(frame.getByRole('alert')).toContainText('非零目标的分摊口径待确认');
  await edit(table, '郑州 剩余天数入库', -1);
  await expect(frame.getByRole('alert')).toContainText('须大于或等于0');
  await table
    .getByRole('button', { name: '郑州 F 已备未备预估发运天数 计算过程', exact: true })
    .click();
  await expect(frame.getByRole('dialog', { name: /计算过程/ })).toContainText(
    '近三天为0，使用本月已发货÷已过天数',
  );
  await frame.getByRole('button', { name: '关闭弹窗', exact: true }).click();
  await upload(frame, ['2026-09,郑州,BAD,无效替换,汤圆,系列,组,NaN,0,0,1,0,0,0']);
  await expect(frame.getByRole('alert')).toContainText('未替换原输入');
  await expect(table.getByLabel('郑州 F 整月预估发货', { exact: true })).toHaveValue('300');
  await frame.getByLabel('选择发货输入CSV', { exact: true }).setInputFiles({
    name: 'over.csv',
    mimeType: 'text/csv',
    buffer: Buffer.alloc(5 * 1024 * 1024 + 1),
  });
  await expect(frame.getByRole('alert')).toContainText('超过5 MiB');
  await upload(
    frame,
    Array.from(
      { length: 10001 },
      (_, index) => `2026-09,郑州,P${index},产品,汤圆,系列,组,0,0,0,1,0,0,0`,
    ),
  );
  await expect(frame.getByRole('alert')).toContainText('超过10000条');
  await expect(table.getByLabel('郑州 F 整月预估发货', { exact: true })).toHaveValue('300');
});

test('MPS shipment calendars cross the year and leap February while shared evaluation versions keep inputs isolated', async (t) => {
  const { frame, table } = await shipment(t, '2024-03');
  await expect(frame.getByRole('region', { name: '发货本地核对' })).toContainText('暂无数据');
  await expect(frame.getByLabel('数据截止日')).toHaveValue('2024-02-22');
  await expect(frame.getByRole('region', { name: '发货本地核对' })).toContainText(
    '本月共计天数 29 天',
  );
  await upload(frame, ['2024-02,郑州,A,二月,汤圆,系列,组,220,0,0,0,0,0,0']);
  await expect(table.getByLabel('郑州 整月预估发货', { exact: true })).toHaveValue('290');
  await edit(table, '郑州 整月预估发货', 291);
  await frame.getByRole('button', { name: '新建评估版本', exact: true }).click();
  const creation = frame.getByRole('dialog', { name: '新建评估版本', exact: true });
  await creation.getByLabel('评估月份', { exact: true }).fill('2027-01');
  await creation.getByLabel('参考版本', { exact: true }).selectOption('local-2');
  await creation.getByRole('button', { name: '创建本地版本', exact: true }).click();
  await expect(frame.getByLabel('数据截止日')).toHaveValue('2026-12-22');
  await expect(frame.getByRole('region', { name: '发货本地核对' })).toContainText(
    '本月共计天数 31 天',
  );
  await expect(table.getByLabel('郑州 整月预估发货', { exact: true })).toHaveValue('');
  await upload(frame, ['2026-12,郑州,B,十二月,汤圆,系列,组,220,0,0,0,0,0,0']);
  await expect(table.getByLabel('郑州 整月预估发货', { exact: true })).toHaveValue('310');
  await frame.getByLabel('评估版本选择').selectOption('local-2');
  await expect(table.getByLabel('郑州 整月预估发货', { exact: true })).toHaveValue('291');
  await frame.getByRole('button', { name: '下一步：需求加工与收敛', exact: true }).click();
  await expect(frame.locator('.ap-app')).toHaveAttribute('data-step', 'process');
  await frame.locator('.ap-page-tab').filter({ hasText: '本月预估发货' }).click();
  await expect(table.getByLabel('郑州 整月预估发货', { exact: true })).toHaveValue('291');
});

const sourceConfig = JSON.parse(await readFile('static/mps/sql.config.json', 'utf8'));
const factPrefix = 'agents_scm_cust_deliv_daily_di.';
function shipmentFacts(query) {
  if (query.queryId !== 'facts.shipment')
    return {
      rows: query.queryId.endsWith('.count') ? [{ total: 0 }] : [],
      returnedColumns: sourceConfig.queries[query.queryId].columns,
      configVersion: 'ship-v1',
      totalRowCount: 0,
      offset: query.parameters.offset,
      hasMorePages: false,
    };
  const recent = query.parameters.start === '2026-09-20';
  const rows = [
    {
      [factPrefix + 'belong_base']: '郑州',
      [factPrefix + 'material_code']: 'A',
      [factPrefix + 'material_name']: null,
      [factPrefix + 'product_categ_name']: null,
      [factPrefix + 'material_group_name']: null,
      [factPrefix + 'act_dl_qty_total']: recent ? 12 : 220,
    },
  ];
  return {
    rows,
    returnedColumns: sourceConfig.queries[query.queryId].columns,
    configVersion: 'ship-v1',
    totalRowCount: 1,
    offset: 0,
    hasMorePages: false,
  };
}
async function businessShipment(t, execute = shipmentFacts) {
  const result = await mpsPage(t, sourceConfig, execute);
  const { frame } = result;
  await frame.getByRole('button', { name: '新建评估版本', exact: true }).click();
  const dialog = frame.getByRole('dialog', { name: '新建评估版本', exact: true });
  await dialog.getByLabel('评估月份', { exact: true }).fill('2026-10');
  await dialog.getByRole('button', { name: '创建本地版本', exact: true }).click();
  await frame.locator('.ap-page-tab').filter({ hasText: '本月预估发货' }).click();
  return { ...result, table: frame.getByRole('table', { name: '本月预估发货明细' }) };
}
test('MPS shipment reads actual quantities through cutoff and a separate complete three-day range without replacing missing inputs', async (t) => {
  const { page, frame, table, calls } = await businessShipment(t);
  await frame.getByRole('button', { name: '同步实际发货', exact: true }).click();
  await expect(
    table.getByRole('button', { name: '郑州 本月已发货 计算过程', exact: true }),
  ).toHaveText('220');
  await expect(
    table.getByRole('button', { name: '郑州 近三天日均发货量 计算过程', exact: true }),
  ).toHaveText('4');
  await expect(table.getByRole('button', { name: '郑州 已备 计算过程', exact: true })).toHaveText(
    '待定',
  );
  await expect(table.getByLabel('郑州 整月预估发货', { exact: true })).toHaveValue('');
  const queries = calls.filter((call) => call.queryId === 'facts.shipment');
  assert.deepEqual(queries.map((call) => [call.parameters.start, call.parameters.end]).sort(), [
    ['2026-09-01', '2026-09-22'],
    ['2026-09-20', '2026-09-22'],
  ]);
  await frame.getByRole('button', { name: '展开 郑州', exact: true }).click();
  await expect(table.getByRole('row').filter({ hasText: 'A' })).toContainText('产品名称未提供');
  const csv = await exported(page, frame);
  assert.match(csv, /220,,,4,,,,/);
  assert.match(csv, /业务来源/);
});
test('MPS actual shipment failure withdraws prior business output and switches explicitly between preserved CSV and current business rows', async (t) => {
  let denied = false;
  const { frame, table } = await businessShipment(t, (query) => {
    if (denied && query.queryId === 'facts.shipment') throw Error('AGENT_ACCESS_DENIED');
    return shipmentFacts(query);
  });
  await frame.getByRole('button', { name: '同步实际发货', exact: true }).click();
  await expect(
    table.getByRole('button', { name: '郑州 本月已发货 计算过程', exact: true }),
  ).toHaveText('220');
  denied = true;
  await frame.getByRole('button', { name: '同步实际发货', exact: true }).click();
  await expect(
    frame.getByRole('region', { name: '发货本地核对' }).getByRole('alert'),
  ).toContainText('暂无数据权限');
  await expect(
    table.getByRole('button', { name: '郑州 本月已发货 计算过程', exact: true }),
  ).toHaveText('待定');
  await upload(frame, ['2026-09,郑州,CSV,本地产品,汤圆,系列,组,22,0,0,1,0,0,0']);
  denied = false;
  await frame.getByRole('button', { name: '同步实际发货', exact: true }).click();
  await expect(frame.getByRole('button', { name: '同步实际发货', exact: true })).toBeEnabled();
  await expect(
    table.getByRole('button', { name: '郑州 本月已发货 计算过程', exact: true }),
  ).toHaveText('220');
  await expect(frame.getByLabel('发货数据来源', { exact: true })).toHaveValue('business');
  await frame.getByLabel('发货数据来源', { exact: true }).selectOption('local-file');
  await expect(
    table.getByRole('button', { name: '郑州 本月已发货 计算过程', exact: true }),
  ).toHaveText('22');
  await expect(frame.getByRole('region', { name: '发货本地核对' })).toContainText(
    '本地CSV：发货核对.csv',
  );
  await frame.getByLabel('发货数据来源', { exact: true }).selectOption('business');
  await expect(
    table.getByRole('button', { name: '郑州 本月已发货 计算过程', exact: true }),
  ).toHaveText('220');
  denied = true;
  await frame.getByRole('button', { name: '同步实际发货', exact: true }).click();
  await expect(
    frame.getByRole('region', { name: '发货本地核对' }).getByRole('alert'),
  ).toContainText('暂无数据权限');
  await expect(
    table.getByRole('button', { name: '郑州 本月已发货 计算过程', exact: true }),
  ).toHaveText('待定');
  await frame.getByLabel('发货数据来源', { exact: true }).selectOption('local-file');
  await expect(
    table.getByRole('button', { name: '郑州 本月已发货 计算过程', exact: true }),
  ).toHaveText('22');
});
test('MPS actual shipment preserves full paging, zero and NULL while a failed recent range does not block cutoff quantities', async (t) => {
  const { frame, table, calls } = await businessShipment(t, (query) => {
    if (query.queryId !== 'facts.shipment') return shipmentFacts(query);
    if (query.parameters.start !== '2026-09-01') throw Error('RECENT_SOURCE_FAILED');
    const records = Array.from({ length: 202 }, (_, i) => ({
      [factPrefix + 'belong_base']: i === 201 ? null : '郑州',
      [factPrefix + 'material_code']: String(i).padStart(5, '0'),
      [factPrefix + 'material_name']: '真实产品' + i,
      [factPrefix + 'product_categ_name']: '汤圆',
      [factPrefix + 'material_group_name']: '组',
      [factPrefix + 'act_dl_qty_total']: i === 200 ? null : 0,
    }));
    return {
      rows: records.slice(query.parameters.offset, query.parameters.offset + 200),
      returnedColumns: sourceConfig.queries[query.queryId].columns,
      configVersion: 'ship-v1',
      totalRowCount: records.length,
      offset: query.parameters.offset,
      hasMorePages: query.parameters.offset + 200 < records.length,
    };
  });
  await frame.getByRole('button', { name: '同步实际发货', exact: true }).click();
  const region = frame.getByRole('region', { name: '发货本地核对' });
  await expect(region.getByRole('alert')).toContainText('实际发货已读取；近三天读取失败');
  await expect(region).toContainText('源数据1条缺基地或产品编码');
  await frame.getByRole('button', { name: '展开 郑州', exact: true }).click();
  await expect(
    table.getByRole('button', { name: '郑州 00000 本月已发货 计算过程', exact: true }),
  ).toHaveText('0');
  await expect(
    table.getByRole('button', { name: '郑州 00200 本月已发货 计算过程', exact: true }),
  ).toHaveText('待定');
  await expect(
    table.getByRole('button', { name: '郑州 00000 近三天日均发货量 计算过程', exact: true }),
  ).toHaveText('待定');
  assert.deepEqual(
    calls
      .filter((q) => q.queryId === 'facts.shipment' && q.parameters.start === '2026-09-01')
      .map((q) => q.parameters.offset),
    [0, 200],
  );
});
test('MPS cutoff changes invalidate a pending earlier read and incomplete pages never become current business data', async (t) => {
  let release;
  const pending = new Promise((resolve) => {
    release = resolve;
  });
  let started = false;
  let incomplete = false;
  const { frame, table } = await businessShipment(t, async (query) => {
    if (
      query.queryId === 'facts.shipment' &&
      query.parameters.end === '2026-09-22' &&
      query.parameters.start === '2026-09-01'
    ) {
      started = true;
      await pending;
    }
    const result = shipmentFacts(query);
    if (query.queryId === 'facts.shipment' && query.parameters.end === '2026-09-25') {
      result.rows[0][factPrefix + 'act_dl_qty_total'] = 250;
      if (incomplete) result.totalRowCount = 2;
    }
    return result;
  });
  await frame.getByRole('button', { name: '同步实际发货', exact: true }).click();
  await expect.poll(() => started).toBe(true);
  await frame.getByLabel('数据截止日').fill('2026-09-25');
  await frame.getByRole('button', { name: '同步实际发货', exact: true }).click();
  await expect(
    table.getByRole('button', { name: '郑州 本月已发货 计算过程', exact: true }),
  ).toHaveText('250');
  release();
  await expect(frame.getByLabel('数据截止日')).toHaveValue('2026-09-25');
  await expect(
    table.getByRole('button', { name: '郑州 本月已发货 计算过程', exact: true }),
  ).toHaveText('250');
  incomplete = true;
  await frame.getByRole('button', { name: '同步实际发货', exact: true }).click();
  await expect(
    frame.getByRole('region', { name: '发货本地核对' }).getByRole('alert'),
  ).toContainText('未采用不完整结果');
  await expect(
    table.getByRole('button', { name: '郑州 本月已发货 计算过程', exact: true }),
  ).toHaveText('待定');
});
test('MPS shipment conflicting source product dimensions remain unresolved after quantity aggregation', async (t) => {
  const { page, frame, table } = await businessShipment(t, (query) => {
    const result = shipmentFacts(query);
    if (query.queryId === 'facts.shipment') {
      result.rows[0][factPrefix + 'product_categ_name'] = '汤圆';
      result.rows.push({ ...result.rows[0], [factPrefix + 'product_categ_name']: '水饺' });
      result.totalRowCount = 2;
    }
    return result;
  });
  await frame.getByRole('button', { name: '同步实际发货', exact: true }).click();
  await expect(
    table.getByRole('button', { name: '郑州 本月已发货 计算过程', exact: true }),
  ).toHaveText('440');
  const csv = await exported(page, frame);
  assert.doesNotMatch(csv, /水饺|汤圆/);
});
