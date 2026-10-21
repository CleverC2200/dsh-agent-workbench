import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { expect } from '@playwright/test';
import { authorPage } from './helpers/author-page.mjs';
const config = JSON.parse(await readFile('static/mps/sql.config.json', 'utf8'));
const rows = {
  products: [
    ...Array.from({ length: 26 }, (_, index) => ({
      material_code: `P${String(index).padStart(3, '0')}`,
      material_name: `源产品${index}`,
      series: '产品系列',
      sub_category: '汤圆',
    })),
    { material_code: '', material_name: '同名空码', series: null, sub_category: null },
  ],
  sku_capacity: [
    {
      material_code: 'P000',
      material_name: '产线候选甲',
      belong_base: '四川',
      workshop: '车间甲',
      tunnel_no: '1#',
      series: '源系列甲',
      combined_series: '组合甲乙',
      production_category: '产线生产品类',
      standard_daily_output_pc: 50,
      standard_daily_output_ton: 0,
    },
    {
      material_code: 'P000',
      material_name: '产线候选乙',
      belong_base: '广州',
      workshop: '车间乙',
      tunnel_no: '1#',
      series: '源系列乙',
      combined_series: '组合甲乙',
      production_category: '产线生产品类',
      standard_daily_output_pc: 50,
    },
    { material_code: null, material_name: '同名空码' },
  ],
  tunnels: [
    {
      belong_base: '四川',
      production_unit: '生产单位甲',
      tunnel_no: '1#',
      series: '隧道源系列',
      production_category: '源品类',
      standard_daily_output_pc: 80,
    },
  ],
};
function fixture({ queryId, parameters }) {
  const kind = queryId.split('.')[0];
  const records =
    kind === 'transfers'
      ? [
          {
            stat_period: parameters.period,
            material_code: 'P000',
            material_name: '源产品0',
            series: '调拨源系列',
            target_base: '广州',
            transfer_tag: '自产',
            transfer_direction: null,
            sap_category: 'SAP品类',
            old_category: '老大类',
            production_category: '调拨生产品类',
          },
        ]
      : (rows[kind] ?? []);
  const result = queryId.endsWith('.count')
    ? [{ total: records.length }]
    : records.slice(parameters.offset, parameters.offset + parameters.page_size).map((row) => ({
        ...Object.fromEntries(config.queries[queryId].columns.map((column) => [column, null])),
        ...row,
      }));
  return {
    rows: result,
    returnedColumns: queryId.endsWith('.count') ? ['total'] : config.queries[queryId].columns,
    rejectedColumns: [],
    configVersion: 'fixture-v1',
  };
}
async function relations(t, execute = fixture) {
  const page = await authorPage(t, { mpsConfig: config });
  const calls = [],
    contexts = [];
  await page.exposeFunction('mpsRelationQuery', async (message) => {
    if (message.method === 'context') contexts.push(message.parameters);
    if (message.method !== 'sql') return {};
    calls.push(message.parameters);
    return execute(message.parameters);
  });
  await page.evaluate(() => {
    window.addEventListener('message', (event) => {
      if (event.data?.protocol !== 'gea-html-v2' || event.data.type !== 'ready') return;
      const pair = new MessageChannel();
      pair.port1.onmessage = async ({ data }) => {
        if (data.type !== 'request') return;
        try {
          pair.port1.postMessage({
            type: 'response',
            id: data.id,
            result: await window.mpsRelationQuery(data),
          });
        } catch (error) {
          pair.port1.postMessage({ type: 'response', id: data.id, error: error.message });
        }
      };
      event.source.postMessage(
        {
          protocol: 'gea-html-v2',
          type: 'connect',
          context: { session: 'fixture-mps-session', plugin: 'inventory-mps' },
        },
        '*',
        [pair.port2],
      );
    });
  });
  await page.evaluate(() => window.openAuthor('mps', 1200));
  const frame = page.frameLocator('iframe');
  await expect(frame.getByRole('heading', { name: '需求确认', exact: true })).toBeVisible();
  await version(frame, '2026-10');
  await frame.locator('.ap-page-tab').filter({ hasText: '主数据对应关系' }).click();
  return {
    page,
    frame,
    calls,
    contexts,
    view: frame.getByRole('region', { name: '主数据关系核对', exact: true }),
  };
}
async function version(frame, month) {
  await frame.getByRole('button', { name: '新建评估版本', exact: true }).click();
  const dialog = frame.getByRole('dialog', { name: '新建评估版本', exact: true });
  await dialog.getByLabel('评估月份', { exact: true }).fill(month);
  await dialog.getByRole('button', { name: '创建本地版本', exact: true }).click();
}
test('fourth MPS step uses exact-code source relations, paginates the full set and keeps unconfirmed source labels', async (t) => {
  const { view, contexts } = await relations(t);
  await expect(view).toContainText('共29条');
  await expect(view.locator('tbody tr')).toHaveCount(25);
  await expect(view.locator('tbody tr').nth(0)).toContainText('产线候选甲');
  await expect(view.locator('tbody tr').nth(1)).toContainText('产线候选乙');
  await expect(view.locator('tbody tr').nth(0)).toContainText('产品系列');
  await expect(view.locator('tbody tr').nth(0)).toContainText('源系列甲');
  await expect(view.locator('tbody tr').nth(0).locator('td').nth(12)).toHaveText('0');
  await view.getByRole('button', { name: '下一页', exact: true }).click();
  await expect(view.locator('tbody tr')).toHaveCount(4);
  await view.getByRole('searchbox', { name: '搜索关系记录' }).fill('同名空码');
  await expect(view.locator('tbody tr')).toHaveCount(2);
  await expect(view.locator('tbody tr').nth(0)).toContainText('无候选产线');
  await expect(view.locator('tbody tr').nth(1)).toContainText('无产品记录');
  await view.getByRole('searchbox', { name: '搜索关系记录' }).fill('');
  await view.getByRole('tab', { name: /产线与源系列/ }).click();
  await expect(view.locator('tbody tr')).toContainText('生产单位甲');
  await expect(view.locator('tbody tr')).toContainText('四川');
  await expect(view.locator('tbody tr')).not.toContainText('西南');
  await view.getByRole('tab', { name: /基地与调拨/ }).click();
  await expect(view.locator('tbody tr')).toContainText('2026-10');
  await expect(view.locator('tbody tr')).toContainText('自产');
  await expect(view.locator('tbody tr')).toContainText('调拨方向待确认');
  await expect(view.locator('tbody tr')).not.toContainText('缺调拨方向');
  await expect
    .poll(() =>
      contexts.some((context) => context.parts?.masterdata?.source === '调拨方向、产品清单'),
    )
    .toBe(true);
  assert(
    contexts
      .filter((context) => context.parts?.masterdata)
      .every((context) => context.parts.masterdata.rows.length <= 25),
  );
});
test('fourth MPS step clears records on failed refresh and discards a late result after version change', async (t) => {
  let denied = false,
    hold = false,
    release;
  const pending = new Promise((resolve) => {
    release = resolve;
  });
  const { view, frame, calls } = await relations(t, async (query) => {
    if (query.queryId === 'transfers.detail') {
      if (denied) throw Error('AGENT_ACCESS_DENIED');
      if (hold && query.parameters.period === '2026-10') await pending;
    }
    return fixture(query);
  });
  await expect(view).toContainText('共29条');
  denied = true;
  await view.getByRole('button', { name: '重新读取', exact: true }).click();
  await expect(view.getByRole('alert')).toContainText('AGENT_ACCESS_DENIED');
  await expect(view.locator('tbody tr')).toHaveCount(0);
  denied = false;
  hold = true;
  const before = calls.filter((query) => query.queryId === 'transfers.detail').length;
  await view.getByRole('button', { name: '重新读取', exact: true }).click();
  await expect
    .poll(() => calls.filter((query) => query.queryId === 'transfers.detail').length)
    .toBeGreaterThan(before);
  await frame.locator('.ap-page-tab').filter({ hasText: '需求确认' }).click();
  await version(frame, '2026-11');
  await frame.locator('.ap-page-tab').filter({ hasText: '主数据对应关系' }).click();
  await view.getByRole('tab', { name: /基地与调拨/ }).click();
  await expect(view.locator('tbody tr')).toContainText('2026-11');
  release();
  await expect(view.locator('tbody tr')).not.toContainText('2026-10');
});

test('source series and category gaps stay visible and filterable with a complete product match', async (t) => {
  const { view } = await relations(t, (query) => {
    const result = fixture(query);
    if (query.queryId === 'sku_capacity.detail')
      Object.assign(result.rows[0], {
        series: null,
        combined_series: '',
        production_category: null,
        standard_daily_output_pc: 0,
      });
    if (query.queryId === 'transfers.detail')
      Object.assign(result.rows[0], {
        sap_category: null,
        old_category: '',
        production_category: null,
        transfer_direction: '四川至广州',
      });
    return result;
  });
  await expect(view).toContainText('共29条');
  await view.getByRole('searchbox', { name: '搜索关系记录' }).fill('P000');
  await expect(view.locator('tbody tr')).toHaveCount(2);
  await expect(view.getByRole('columnheader', { name: '源生产品类', exact: true })).toBeVisible();
  await view.getByRole('checkbox', { name: '仅缺项或待确认' }).check();
  await expect(view.locator('tbody tr')).toHaveCount(1);
  const candidate = view.locator('tbody tr');
  await expect(candidate).toContainText('产品系列');
  await expect(candidate).toContainText('汤圆');
  await expect(candidate).toContainText('缺产线源系列、缺组合系列、缺产线生产品类');
  await expect(candidate.locator('td').nth(11)).toHaveText('0');
  await view.getByRole('tab', { name: /基地与调拨/ }).click();
  await expect(view.locator('tbody tr')).toHaveCount(1);
  for (const name of ['源SAP品类', '源老大类', '源生产品类'])
    await expect(view.getByRole('columnheader', { name, exact: true })).toBeVisible();
  await expect(view.locator('tbody tr')).toContainText('缺SAP品类、缺老大类、缺调拨生产品类');
  await expect(view.locator('tbody tr')).not.toContainText('调拨方向待确认');
});
