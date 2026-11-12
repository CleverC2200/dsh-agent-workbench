import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { expect } from '@playwright/test';
import { mpsPage } from './helpers/mps-page.mjs';

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
            },
          ]
        : queryId.endsWith('.count')
          ? [{ total: queryId === 'facts.shipment.count' ? 1 : 0 }]
          : [];
  return {
    rows,
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
  const { page, frame, calls } = await mpsPage(t, config, fixture);
  await create(frame);
  await expect(frame.getByLabel('数据截止日')).toHaveValue('2026-10-31');
  assert.deepEqual(calls.find((row) => row.queryId === 'facts.shipment-latest').parameters, {
    month: '2026-10-01',
    month_end: '2026-10-31',
  });
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
  const { page, frame, calls } = await mpsPage(t, config, (query) => fixture(query, latest));
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
  const { frame, calls } = await mpsPage(t, config, async (query) => {
    if (query.queryId === 'facts.shipment-latest') await waiting;
    return fixture(query);
  });
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
  const { page, frame, calls } = await mpsPage(t, config, async (query) => {
    if (query.queryId === 'facts.shipment-latest' && query.parameters.month === '2026-10-01') {
      await waiting;
      return fixture(query, '2026-10-31');
    }
    return fixture(query, '2026-11-08');
  });
  await create(frame);
  await expect.poll(() => calls.some((row) => row.queryId === 'facts.shipment-latest')).toBe(true);
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
    const { frame } = await mpsPage(t, config, (query) => {
      if (query.queryId === 'facts.shipment-latest' && latest === 'failure')
        throw Error('SOURCE_UNAVAILABLE');
      return fixture(query, latest);
    });
    await create(frame);
    const view = frame.getByRole('region', { name: '发货本地核对' });
    await expect(view.getByRole('alert')).toContainText(/日期|SOURCE_UNAVAILABLE/);
    await expect(frame.getByLabel('数据截止日')).toHaveValue('');
    await expect(frame.getByRole('button', { name: '同步实际发货', exact: true })).toBeDisabled();
  });
}
