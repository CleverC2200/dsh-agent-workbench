import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { expect } from '@playwright/test';
import { mpsPage } from './helpers/mps-page.mjs';

const october = { time: '2026-10-31T14:00:00+08:00' };
const november = { time: '2026-11-18T13:30:00+08:00' };
const config = JSON.parse(await readFile('static/mps/sql.config.json', 'utf8'));
function fixture({ queryId, parameters }, latest = '2026-10-31') {
  const rows =
    queryId === 'facts.shipment-latest'
      ? [{ latest_date: latest }]
      : queryId === 'facts.shipment'
        ? [
            {
              belong_base: '郑州',
              material_code: 'A',
              material_name: '产品A',
              series: '系列',
              product_item: '汤圆',
              shipped: 310,
              prepped: 0,
              unprepped: 0,
              daily3: 10,
              average: 10,
              open: 100,
              inbound: 200,
              source_days: Number(parameters.cutoff.slice(8)),
              duplicate_days: 0,
              transfer_date: parameters.cutoff,
              transfer_rows: 1,
              transfer_in_plan_v1: null,
              transfer_in_plan_adj: null,
              transfer_out_plan_v1: null,
              transfer_out_plan_adj: null,
            },
          ]
        : queryId.endsWith('.count')
          ? [{ total: queryId === 'facts.shipment.count' ? 1 : 0 }]
          : [];
  return {
    rows:
      queryId === 'products.count'
        ? [{ total: 1 }]
        : queryId === 'products.detail'
          ? [
              {
                ...Object.fromEntries(
                  config.queries[queryId].columns.map((column) => [column, null]),
                ),
                stat_period: parameters.month,
                target_base: '郑州',
                material_code: 'A',
                material_name: '产品A',
                responsible_item: '汤圆',
                series: '系列',
                product_item: '汤圆',
                source_rows: 1,
              },
            ]
          : rows,
    returnedColumns:
      queryId === 'facts.shipment-latest' ? ['latest_date'] : config.queries[queryId].columns,
    configVersion: 'cutoff-fixture',
    rejectedColumns: [],
  };
}
async function create(frame, month = '2026-11', reference) {
  await frame.getByRole('button', { name: '新建评估版本', exact: true }).click();
  const dialog = frame.getByRole('dialog', { name: '新建评估版本', exact: true });
  await dialog.getByLabel('评估月份', { exact: true }).fill(month);
  if (reference) await dialog.getByLabel('参考版本', { exact: true }).selectOption(reference);
  await dialog.getByRole('button', { name: '创建本地版本', exact: true }).click();
  await frame.locator('.ap-page-tab').filter({ hasText: '本月预估发货' }).click();
}
const selected = (page) =>
  page.evaluate(() => {
    const state = window.readView().localDrafts;
    return state.drafts.find((row) => row.id === state.selected);
  });

test('new MPS versions discover the latest source date for their statistical month and export that synchronized cutoff', async (t) => {
  const { page, frame, calls } = await mpsPage(t, config, fixture, october);
  await create(frame);
  await expect(frame.getByLabel('数据截止日')).toHaveValue('2026-10-31');
  assert.deepEqual(
    calls.find(
      (row) => row.queryId === 'facts.shipment-latest' && row.parameters.month === '2026-10-01',
    ).parameters,
    {
      month: '2026-10-01',
      month_end: '2026-10-31',
    },
  );
  await frame.getByRole('button', { name: '同步实际发货', exact: true }).click();
  await expect(
    frame.getByRole('button', { name: '郑州 本月已发货 计算过程', exact: true }),
  ).toHaveText('310');
  assert.equal((await selected(page)).shipment.cutoff, '2026-10-31');
  assert.equal(
    calls.find((row) => row.queryId === 'facts.shipment').parameters.cutoff,
    '2026-10-31',
  );
  const waiting = page.waitForEvent('download');
  await frame.getByRole('button', { name: '下载明细', exact: true }).click();
  const chunks = [];
  for await (const chunk of await (await waiting).createReadStream()) chunks.push(chunk);
  assert.match(Buffer.concat(chunks).toString('utf8'), /2026-10-31,31,31,2026-10/);
});

test('an existing explicit cutoff survives restore while a new reference copy discovers its own latest date', async (t) => {
  let latest = '2026-10-31';
  const { page, frame, calls } = await mpsPage(
    t,
    config,
    (query) => fixture(query, latest),
    october,
  );
  await create(frame);
  await expect(frame.getByLabel('数据截止日')).toHaveValue(latest);
  await frame.getByLabel('数据截止日').fill('2026-10-22');
  await expect.poll(async () => (await selected(page)).shipment.cutoff).toBe('2026-10-22');
  const snapshot = await page.evaluate(() => window.readView());
  const reads = calls.filter((row) => row.queryId === 'facts.shipment-latest').length;
  await page.evaluate((seed) => window.openAuthor('mps', 1200, seed), snapshot);
  await frame.locator('.ap-page-tab').filter({ hasText: '本月预估发货' }).click();
  await expect(frame.getByLabel('数据截止日')).toHaveValue('2026-10-22');
  assert.equal(calls.filter((row) => row.queryId === 'facts.shipment-latest').length, reads);
  latest = '2026-10-30';
  await create(frame, '2026-11', 'local-2');
  await expect(frame.getByLabel('数据截止日')).toHaveValue(latest);
  await frame.getByLabel('评估版本选择').selectOption('local-2');
  await expect(frame.getByLabel('数据截止日')).toHaveValue('2026-10-22');
});

test('a late source-date response cannot overwrite a manually selected cutoff', async (t) => {
  let release;
  const waiting = new Promise((resolve) => {
    release = resolve;
  });
  const { frame, calls } = await mpsPage(
    t,
    config,
    async (query) => {
      if (query.queryId === 'facts.shipment-latest') await waiting;
      return fixture(query);
    },
    october,
  );
  await create(frame);
  await expect.poll(() => calls.some((row) => row.queryId === 'facts.shipment-latest')).toBe(true);
  await frame.getByLabel('数据截止日').fill('2026-10-22');
  release();
  await expect(frame.getByLabel('数据截止日')).toHaveValue('2026-10-22');
  await frame.getByRole('button', { name: '同步实际发货', exact: true }).click();
  await expect
    .poll(() => calls.find((row) => row.queryId === 'facts.shipment')?.parameters.cutoff)
    .toBe('2026-10-22');
});

test('switching versions cancels an older statistical-month date read', async (t) => {
  let release;
  const waiting = new Promise((resolve) => {
    release = resolve;
  });
  const { page, frame, calls } = await mpsPage(
    t,
    config,
    async (query) => {
      if (query.queryId === 'facts.shipment-latest' && query.parameters.month === '2026-10-01') {
        await waiting;
        return fixture(query, '2026-10-31');
      }
      return fixture(query, '2026-11-08');
    },
    october,
  );
  await create(frame);
  await expect.poll(() => calls.some((row) => row.queryId === 'facts.shipment-latest')).toBe(true);
  await page.clock.setFixedTime(new Date(november.time));
  await create(frame, '2026-12');
  await expect(frame.getByLabel('数据截止日')).toHaveValue('2026-11-08');
  release();
  await expect.poll(async () => (await selected(page)).shipment.cutoff).toBe('2026-11-08');
  await frame.getByRole('button', { name: '同步实际发货', exact: true }).click();
  await expect
    .poll(() => calls.find((row) => row.queryId === 'facts.shipment')?.parameters.cutoff)
    .toBe('2026-11-08');
});

for (const [name, latest] of [
  ['empty source', null],
  ['wrong-month source date', '2026-11-08'],
  ['invalid source date', '2026-10-32'],
  ['failed source read', 'failure'],
]) {
  test(`new MPS versions keep an unknown cutoff for ${name} instead of inventing a default`, async (t) => {
    const { frame } = await mpsPage(
      t,
      config,
      (query) => {
        if (query.queryId === 'facts.shipment-latest' && latest === 'failure')
          throw Error('SOURCE_UNAVAILABLE');
        return fixture(query, latest);
      },
      october,
    );
    await create(frame);
    const view = frame.getByRole('region', { name: '发货本地核对' });
    await expect(view.getByRole('alert')).toContainText(/日期|SOURCE_UNAVAILABLE/);
    await expect(frame.getByLabel('数据截止日')).toHaveValue('');
    await expect(frame.getByRole('button', { name: '同步实际发货', exact: true })).toBeDisabled();
  });
}

test('11月评估版本可按11月截止日读取实际发货并追踪公式', async (t) => {
  const { frame, calls } = await mpsPage(
    t,
    config,
    (query) =>
      fixture(query, query.parameters.month === '2026-11-01' ? '2026-11-16' : '2026-10-31'),
    november,
  );
  await create(frame);
  const cutoff = frame.getByLabel('数据截止日');
  const view = frame.getByRole('region', { name: '发货本地核对' });
  await expect(cutoff).toHaveValue('2026-11-16');
  await expect(cutoff).toHaveAttribute('max', '2026-11-18');
  await cutoff.fill('2026-11-15');
  await view.getByRole('button', { name: '同步实际发货', exact: true }).click();
  await expect(view).toContainText('2026-11-01 至 2026-11-15');
  await expect(view).toContainText('已过天数 15 天');
  await expect(view).toContainText('本月共计天数 30 天');
  const query = calls.find(
    (row) => row.queryId === 'facts.shipment' && row.parameters.cutoff === '2026-11-15',
  );
  assert.equal(query.parameters.month, '2026-11-01');
  assert.equal(query.parameters.cutoff, '2026-11-15');
  assert.equal(query.parameters.recent_start, '2026-11-13');
  const result = view.getByRole('button', { name: '郑州 本月预测量 计算过程', exact: true });
  await expect(result).toHaveText('620');
  await result.click();
  await expect(frame.getByRole('dialog', { name: /计算过程/ })).toContainText('620');
});

test('当月发货可查看且能取得并保留上月计算快照', async (t) => {
  const { page, frame, calls } = await mpsPage(
    t,
    config,
    (query) =>
      fixture(query, query.parameters.month === '2026-10-01' ? '2026-10-31' : '2026-11-16'),
    november,
  );
  await create(frame);
  const view = frame.getByRole('region', { name: '发货本地核对' });
  await expect(view.getByLabel('数据截止日')).toHaveValue('2026-11-16');
  await expect(view).toContainText('当前展示月 2026-11');
  await expect(view).toContainText('评估所需统计基月 2026-10');
  await expect(view.getByRole('status', { name: '计算快照状态' })).toContainText(
    '2026-10-31 快照已进入评估',
  );
  await view.getByRole('button', { name: '读取 2026-10 计算快照', exact: true }).click();
  await expect(view.getByLabel('数据截止日')).toHaveValue('2026-10-31');
  await expect(view.getByRole('status', { name: '计算快照状态' })).toContainText('已进入评估');
  await expect
    .poll(async () => (await selected(page)).shipment.calculationCutoff)
    .toBe('2026-10-31');
  await view.getByLabel('数据截止日').fill('2026-11-16');
  await view.getByRole('button', { name: '同步实际发货', exact: true }).click();
  await expect(view).toContainText('当前展示月 2026-11');
  await expect(view.getByRole('status', { name: '计算快照状态' })).toContainText('2026-10-31');
  await expect(view.getByRole('status', { name: '计算快照状态' })).toContainText('已进入评估');
  assert.ok(
    calls.some((row) => row.queryId === 'facts.shipment' && row.parameters.cutoff === '2026-10-31'),
  );
});

test('重读失败清除旧快照，恢复页面后按保存的统计基月截止日自动取数', async (t) => {
  let fail = false;
  const { page, frame, calls } = await mpsPage(
    t,
    config,
    (query) => {
      if (fail && query.queryId === 'facts.shipment-latest') throw Error('BASE_MONTH_UNAVAILABLE');
      return fixture(query, query.parameters.month === '2026-10-01' ? '2026-10-31' : '2026-11-16');
    },
    november,
  );
  await create(frame);
  const view = frame.getByRole('region', { name: '发货本地核对' });
  const status = view.getByRole('status', { name: '计算快照状态' });
  await expect(view.getByLabel('数据截止日')).toHaveValue('2026-11-16');
  const read = view.getByRole('button', { name: '读取 2026-10 计算快照', exact: true });
  await read.click();
  await expect(status).toContainText('已进入评估');
  await view.getByLabel('数据截止日').fill('2026-11-16');
  fail = true;
  await read.click();
  await expect(status).toContainText('读取失败');
  await expect(status).toContainText('已失效');
  const saved = await page.evaluate(() => window.readView());
  const octoberReads = () =>
    calls.filter(
      (entry) => entry.queryId === 'facts.shipment' && entry.parameters.cutoff === '2026-10-31',
    ).length;
  const beforeRestore = octoberReads();
  await page.evaluate((seed) => window.openAuthor('mps', 1200, seed), saved);
  await frame.locator('.ap-page-tab').filter({ hasText: '本月预估发货' }).click();
  await expect(status).toContainText('2026-10-31 快照已进入评估');
  assert.equal(octoberReads(), beforeRestore + 1);
  await expect(view.getByLabel('数据截止日')).toHaveValue('2026-11-16');
  assert.equal((await selected(page)).shipment.calculationCutoff, '2026-10-31');
});

test('未到数的当日保持待补，未来评估月不读取未来实际发货', async (t) => {
  const { frame, calls } = await mpsPage(
    t,
    config,
    (query) => {
      const data = fixture(query, null);
      if (query.queryId === 'facts.shipment.count') data.rows = [{ total: 0 }];
      if (query.queryId === 'facts.shipment') data.rows = [];
      return data;
    },
    november,
  );
  await create(frame);
  const view = frame.getByRole('region', { name: '发货本地核对' });
  const cutoff = view.getByLabel('数据截止日');
  await expect(view.getByRole('alert')).toContainText('暂无可用发货日期');
  await expect(cutoff).toHaveValue('');
  await cutoff.fill('2026-11-19');
  await expect(cutoff).toHaveValue('');
  await cutoff.fill('2026-11-18');
  await expect(view).toContainText('该取数区间没有实际发货记录，预估待补');
  await expect(view).toContainText('2026-11-01 至 2026-11-18');
  const count = calls.filter((row) => row.queryId === 'facts.shipment-latest').length;
  await create(frame, '2027-01');
  await expect(cutoff).toBeDisabled();
  await expect(view).toContainText('该评估版本尚无可选截止日');
  assert.equal(calls.filter((row) => row.queryId === 'facts.shipment-latest').length, count);
  await frame.locator('.ap-page-tab').filter({ hasText: '产能评估与缺口' }).click();
  await expect(frame.getByRole('button', { name: '执行评估', exact: true })).toBeEnabled();
});

test('旧草稿跨月切换后可恢复原截止日的人工调整', async (t) => {
  const { page, frame } = await mpsPage(t, config, (query) => fixture(query, null), november);
  await create(frame);
  const oldDraft = await page.evaluate(() => window.readView());
  const draft = oldDraft.localDrafts.drafts.find((row) => row.id === oldDraft.localDrafts.selected);
  const values = { '["郑州","A"]': { value: 77, source: '本地调整', previous: 50 } };
  draft.shipment = { cutoff: '2026-10-22', activeSource: 'business', values };
  await page.evaluate((seed) => window.openAuthor('mps', 1200, seed), oldDraft);
  await frame.locator('.ap-page-tab').filter({ hasText: '本月预估发货' }).click();
  const cutoff = frame.getByLabel('数据截止日');
  await expect(cutoff).toHaveValue('2026-10-22');
  await cutoff.fill('2026-11-16');
  await expect.poll(async () => (await selected(page)).shipment.values).toEqual({});
  const saved = await page.evaluate(() => window.readView());
  await page.evaluate((seed) => window.openAuthor('mps', 1200, seed), saved);
  await frame.locator('.ap-page-tab').filter({ hasText: '本月预估发货' }).click();
  await expect(cutoff).toHaveValue('2026-11-16');
  await cutoff.fill('2026-10-22');
  await expect.poll(async () => (await selected(page)).shipment.values).toEqual(values);
  assert.equal(await page.evaluate(() => window.peerDraft), '历史草稿，请保留。');
});
