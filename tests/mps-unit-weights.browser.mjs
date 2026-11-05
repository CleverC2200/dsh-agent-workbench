import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { expect } from '@playwright/test';
import { mpsPage } from './helpers/mps-page.mjs';

const config = JSON.parse(await readFile('static/mps/sql.config.json', 'utf8'));
async function showAdvanced(view) {
  const summary = view.locator('summary').filter({ hasText: '高级配置：' });
  if ((await summary.locator('..').getAttribute('open')) === null) await summary.click();
}

const records = [
  { material_code: 'A', channel_name: '思念', ton_per_piece: 0.00576 },
  { material_code: 'B', channel_name: '思念', ton_per_piece: null },
  { material_code: 'C', channel_name: '思念', ton_per_piece: 0.003 },
  { material_code: 'C', channel_name: '思念', ton_per_piece: 0.004 },
];
test('MPS coefficient candidates expire on same-draft restore and Session reconnection', async (t) => {
  const { page, frame } = await mpsPage(t, config, ({ queryId }) => {
    const rows = queryId.startsWith('unit-weights.') ? [records[0]] : [];
    return {
      rows: queryId.endsWith('.count') ? [{ total: rows.length }] : rows,
      returnedColumns: queryId.endsWith('.count') ? ['total'] : config.queries[queryId].columns,
      rejectedColumns: [],
      configVersion: 'restore-weights-v1',
    };
  });
  await page.evaluate(() => {
    window.addEventListener('message', ({ data }) => {
      if (data?.protocol === 'dsh-workbench-view-v1' && data.type === 'save')
        window.lastMpsSave = data;
    });
  });
  await frame.getByLabel('选择产品关系CSV或Excel', { exact: true }).setInputFiles({
    name: 'weights.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      '基地,产品编码,产品名称,大类,系列,物料组,老品编码,老品名称\n郑州,A,产品A,汤圆,系列,组,,',
    ),
  });
  await frame.locator('.ap-page-tab').filter({ hasText: '约束与配置' }).click();
  const view = frame.getByRole('region', { name: '约束与配置', exact: true });
  await showAdvanced(view);
  await view.getByLabel('郑州 A 适用渠道', { exact: true }).fill('思念');
  const adopt = view.getByRole('button', { name: '郑州 A 使用来源系数', exact: true });
  await showAdvanced(view);
  await view.getByRole('button', { name: '读取件吨系数', exact: true }).click();
  await expect(adopt).toBeEnabled();
  await page.evaluate(() => {
    document
      .querySelector('iframe')
      .contentWindow.postMessage(
        { ...window.lastMpsSave, type: 'restore', state: window.readView() },
        '*',
      );
  });
  await showAdvanced(view);
  await expect(adopt).toBeDisabled();
  await expect(view.getByRole('button', { name: '下载系数来源', exact: true })).toHaveCount(0);
  await expect(view.getByLabel('郑州 A 件吨系数', { exact: true })).toHaveValue('');
  await showAdvanced(view);
  await view.getByRole('button', { name: '读取件吨系数', exact: true }).click();
  await expect(adopt).toBeEnabled();
  await view.evaluate(() => window.dispatchEvent(new Event('gea-session-changed')));
  await showAdvanced(view);
  await expect(adopt).toBeDisabled();
  await expect(view.getByRole('button', { name: '下载系数来源', exact: true })).toHaveCount(0);
  await expect(view.getByLabel('郑州 A 件吨系数', { exact: true })).toHaveValue('');
});

for (const event of [
  'gea-session-changed',
  'gea-session-changing',
  'gea-identity-changed',
  'pagehide',
]) {
  test(`MPS discards a held coefficient response after ${event}`, async (t) => {
    let release;
    let received = false;
    let returned = false;
    const held = new Promise((resolve) => {
      release = resolve;
    });
    t.after(() => release());
    const { frame } = await mpsPage(t, config, async ({ queryId }) => {
      const rows = queryId.startsWith('unit-weights.') ? [records[0]] : [];
      if (queryId === 'unit-weights.detail') {
        received = true;
        await held;
        returned = true;
      }
      return {
        rows: queryId.endsWith('.count') ? [{ total: rows.length }] : rows,
        returnedColumns: queryId.endsWith('.count') ? ['total'] : config.queries[queryId].columns,
        rejectedColumns: [],
        configVersion: 'late-weights-v1',
      };
    });
    await frame.getByLabel('选择产品关系CSV或Excel', { exact: true }).setInputFiles({
      name: 'weights.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(
        '基地,产品编码,产品名称,大类,系列,物料组,老品编码,老品名称\n郑州,A,产品A,汤圆,系列,组,,',
      ),
    });
    await frame.locator('.ap-page-tab').filter({ hasText: '约束与配置' }).click();
    const view = frame.getByRole('region', { name: '约束与配置', exact: true });
    await showAdvanced(view);
    await view.getByLabel('郑州 A 适用渠道', { exact: true }).fill('思念');
    await showAdvanced(view);
    await view.getByRole('button', { name: '读取件吨系数', exact: true }).click();
    await expect.poll(() => received).toBe(true);
    await view.evaluate((_element, name) => window.dispatchEvent(new Event(name)), event);
    await showAdvanced(view);
    await expect(view.getByRole('button', { name: '读取中', exact: true })).toHaveCount(0);
    release();
    await expect.poll(() => returned).toBe(true);
    await expect(view).not.toContainText('late-weights-v1');
    await expect(view.getByRole('button', { name: '下载系数来源', exact: true })).toHaveCount(0);
    await expect(
      view
        .getByRole('button', { name: '郑州 A 使用来源系数', exact: true })
        .and(view.locator(':enabled')),
    ).toHaveCount(0);
  });
}

test('MPS reads complete channel coefficients and adopts only an explicitly applicable conflict-free value', async (t) => {
  let incomplete = false;
  const { page, frame } = await mpsPage(t, config, ({ queryId, parameters }) => {
    const weights = queryId.startsWith('unit-weights.');
    const rows = weights
      ? records.filter((row) => parameters.codes.includes(row.material_code))
      : [];
    return {
      rows: queryId.endsWith('.count')
        ? [{ total: rows.length }]
        : incomplete
          ? rows.slice(0, 1)
          : rows,
      returnedColumns: queryId.endsWith('.count') ? ['total'] : config.queries[queryId].columns,
      rejectedColumns: [],
      configVersion: 'weights-test-v1',
    };
  });
  await frame.getByRole('button', { name: '新建评估版本', exact: true }).click();
  const dialog = frame.getByRole('dialog', { name: '新建评估版本', exact: true });
  await dialog.getByLabel('评估月份', { exact: true }).fill('2026-12');
  await dialog.getByRole('button', { name: '创建本地版本', exact: true }).click();
  await frame.getByLabel('选择产品关系CSV或Excel', { exact: true }).setInputFiles({
    name: 'weights.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      '基地,产品编码,产品名称,大类,系列,物料组,老品编码,老品名称\n' +
        ['A', 'B', 'C'].map((code) => `郑州,${code},产品${code},汤圆,系列,组,,`).join('\n'),
    ),
  });
  await frame.locator('.ap-page-tab').filter({ hasText: '约束与配置' }).click();
  const view = frame.getByRole('region', { name: '约束与配置', exact: true });
  await showAdvanced(view);
  await view.getByRole('button', { name: '读取件吨系数', exact: true }).click();
  await expect(view).toContainText('0.00576');
  await expect(view.getByLabel('郑州 A 件吨系数', { exact: true })).toHaveValue('');
  await expect(
    view.getByRole('button', { name: '郑州 A 使用来源系数', exact: true }),
  ).toBeDisabled();
  await view.getByLabel('郑州 A 适用渠道', { exact: true }).fill('思念');
  await view.getByRole('button', { name: '郑州 A 使用来源系数', exact: true }).click();
  await expect(view.getByLabel('郑州 A 件吨系数', { exact: true })).toHaveValue('0.00576');
  for (const code of ['B', 'C']) {
    await view.getByLabel(`郑州 ${code} 适用渠道`, { exact: true }).fill('思念');
    await expect(
      view.getByRole('button', { name: `郑州 ${code} 使用来源系数`, exact: true }),
    ).toBeDisabled();
  }
  await expect(view).toContainText('缺正数吨/件系数');
  await expect(view).toContainText('系数冲突');
  await expect(view.getByLabel('郑州 2026-12 生产天数', { exact: true })).toHaveValue('');
  await view.getByLabel('郑州 安全天数', { exact: true }).fill('0');
  const waiting = page.waitForEvent('download');
  await view.getByRole('button', { name: '下载本地配置', exact: true }).click();
  const chunks = [];
  for await (const chunk of await (await waiting).createReadStream()) chunks.push(chunk);
  const csv = Buffer.concat(chunks).toString('utf8');
  assert.match(csv, /思念/);
  assert.match(csv, /weights-test-v1/);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const state = window.readView()?.localDrafts;
        return state?.drafts
          ?.find((draft) => draft.id === state.selected)
          ?.unitWeights?.find((row) => row.code === 'A')?.source?.configVersion;
      }),
    )
    .toBe('weights-test-v1');
  await page.locator('iframe').evaluate((element) => element.setAttribute('src', element.src));
  await frame.locator('.ap-page-tab').filter({ hasText: '约束与配置' }).click();
  await showAdvanced(view);
  await expect(view.getByLabel('郑州 A 件吨系数', { exact: true })).toHaveValue('0.00576');
  await expect(view.getByLabel('郑州 A 适用渠道', { exact: true })).toHaveValue('思念');
  await expect(view).toContainText('weights-test-v1');
  incomplete = true;
  await showAdvanced(view);
  await view.getByRole('button', { name: '读取件吨系数', exact: true }).click();
  await expect(view).toContainText('分页与计数不一致');
  await expect(
    view.getByRole('button', { name: '郑州 A 使用来源系数', exact: true }),
  ).toBeDisabled();
});

test('MPS coefficient batches cover the whole product pool and discard cross-batch configuration changes', async (t) => {
  let changed = false;
  let batches = [];
  const { frame } = await mpsPage(t, config, ({ queryId, parameters }) => {
    const weights = queryId.startsWith('unit-weights.');
    const rows = weights
      ? parameters.codes.map((code) => ({
          material_code: code,
          channel_name: '思念',
          ton_per_piece: 0.003,
        }))
      : [];
    if (weights && !queryId.endsWith('.count')) batches.push(parameters.codes);
    return {
      rows: queryId.endsWith('.count') ? [{ total: rows.length }] : rows,
      returnedColumns: queryId.endsWith('.count') ? ['total'] : config.queries[queryId].columns,
      rejectedColumns: [],
      configVersion: changed && weights && parameters.codes.length === 1 ? 'v2' : 'v1',
    };
  });
  await frame.getByLabel('选择产品关系CSV或Excel', { exact: true }).setInputFiles({
    name: 'pool.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      '基地,产品编码,产品名称,大类,系列,物料组,老品编码,老品名称\n' +
        Array.from(
          { length: 101 },
          (_, index) => `郑州,A${index},产品${index},汤圆,系列,组,,`,
        ).join('\n'),
    ),
  });
  await frame.locator('.ap-page-tab').filter({ hasText: '约束与配置' }).click();
  const view = frame.getByRole('region', { name: '约束与配置', exact: true });
  await showAdvanced(view);
  await view.getByRole('button', { name: '读取件吨系数', exact: true }).click();
  await expect(view).toContainText('已完整读取101个产品编码、101条渠道系数来源');
  assert.deepEqual(
    batches.map((batch) => batch.length),
    [100, 1],
  );
  await expect(view.getByLabel('郑州 A0 件吨系数', { exact: true })).toHaveValue('');
  changed = true;
  batches = [];
  await showAdvanced(view);
  await view.getByRole('button', { name: '读取件吨系数', exact: true }).click();
  await expect(view).toContainText('件吨系数读取期间查询配置版本变化');
  await view.getByLabel('郑州 A0 适用渠道', { exact: true }).fill('思念');
  await expect(
    view.getByRole('button', { name: '郑州 A0 使用来源系数', exact: true }),
  ).toBeDisabled();
});
