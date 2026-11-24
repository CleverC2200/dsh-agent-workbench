import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { expect } from '@playwright/test';
import * as XLSX from 'xlsx-republish';
import { mpsDownloadText } from './helpers/mps-download.mjs';
import { mpsPage, openMpsProductDetails } from './helpers/mps-page.mjs';
import { workflowStep } from './helpers/mps-edit.mjs';
import { workflowExportRows } from './helpers/mps-workflow-export.mjs';

const config = JSON.parse(await readFile('static/mps/sql.config.json', 'utf8'));
const product = (base, code, category) => ({
  ...Object.fromEntries(config.queries['products.detail'].columns.map((field) => [field, null])),
  stat_period: '2026-12',
  target_base: base,
  material_code: code,
  material_name: `产品${code}`,
  responsible_item: category,
  series: '系列',
  product_item: 'G',
  product_item_name: '组',
  source_rows: 1,
});

test('V5同步评估月产品后，只让入池基地SKU出现在业务明细和拆分下载，失败保留产品调整', async (t) => {
  let failed = false;
  const { page, frame, calls } = await mpsPage(
    t,
    config,
    ({ queryId, parameters }) => {
      if (queryId === 'products.detail' && failed) throw Error('产品清单查询失败');
      const rows =
        queryId === 'products.detail' || queryId === 'products.count'
          ? [
              product('四川基地', 'A', '点心'),
              product('郑州', 'Z', '粽子'),
              product('ODM', 'V', '点心'),
            ].map((row) => ({ ...row, stat_period: parameters.month }))
          : queryId.startsWith('sku_capacity.')
            ? ['西南', '郑州'].map((base) => ({
                ...Object.fromEntries(
                  config.queries['sku_capacity.detail'].columns.map((field) => [field, null]),
                ),
                belong_base: base,
                material_code: 'A',
                workshop: '车间',
                tunnel_no: 'T1',
                source_rows: 1,
              }))
            : [];
      const offset = parameters.offset ?? 0;
      return {
        rows: queryId.endsWith('.count')
          ? [{ total: rows.length }]
          : rows.slice(offset, offset + (parameters.page_size ?? 5000)),
        returnedColumns: config.queries[queryId].columns ?? ['total'],
        configVersion: 'v5-scope',
        totalRowCount: rows.length,
        offset,
        hasMorePages: false,
      };
    },
    { time: '2026-11-24T12:00:00+08:00' },
  );
  await frame.getByRole('button', { name: '新建评估版本', exact: true }).click();
  await frame.getByRole('dialog').getByLabel('评估月份', { exact: true }).fill('2026-12');
  await frame.getByRole('button', { name: '创建本地版本', exact: true }).click();
  const products = await openMpsProductDetails(frame);
  await expect(products).toContainText('产品A');
  await expect(products).not.toContainText('产品Z');
  await expect(products).not.toContainText('产品V');
  assert.ok(
    calls.filter((call) => call.queryId === 'products.detail').at(-1)?.parameters.month ===
      '2026-12',
  );
  await frame.getByLabel('选择计划提报CSV', { exact: true }).setInputFiles({
    name: '提报.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      '月份,基地,产品编码,产品名称,大类,系列,物料组,月初数量,纠偏数量\n2026-12,西南,A,产品A,点心,系列,G,30,30\n2026-12,郑州,A,错误基地,点心,系列,G,999,999\n2026-12,郑州,Z,产品Z,粽子,系列,G,99,99',
    ),
  });
  await workflowStep(frame, '本月预估发货');
  await frame.getByLabel('选择发货输入CSV', { exact: true }).setInputFiles({
    name: '发货.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      '月份,基地,产品编码,产品名称,大类,系列,物料组,本月已发货,已备,未备,近三天日均发货量,月初库存,本月生产入库,剩余天数入库,近30天日均发货\n' +
        [
          '2026-11,西南,A,产品A,点心,系列,G,30,0,0,10,500,0,0,10',
          '2026-11,郑州,A,池外基地,点心,系列,G,999,0,0,10,500,0,0,10',
          '2026-11,郑州,Z,产品Z,粽子,系列,G,99,0,0,10,500,0,0,10',
        ].join('\n'),
    ),
  });
  await frame.getByLabel('数据截止日', { exact: true }).fill('2026-11-23');
  await expect(frame.getByRole('button', { name: '下载明细', exact: true })).toBeEnabled();
  const downloadRows = async (name) => {
    const pending = page.waitForEvent('download', { timeout: 5000 });
    await frame.getByRole('button', { name, exact: true }).press('Enter');
    const download = await pending;
    if (process.env.MPS_SCOPE_EVIDENCE)
      await download.saveAs(`${process.env.MPS_SCOPE_EVIDENCE}/${name}.csv`);
    const text = await mpsDownloadText(await download.path());
    const book = XLSX.read(text, { type: 'string', raw: true });
    return XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]], { defval: '' });
  };
  const shipmentRows = (await downloadRows('下载明细')).filter((row) => row.产品编码);
  assert.deepEqual(
    shipmentRows.map((row) => [row.基地, row.产品编码]),
    [['西南', 'A']],
  );
  await workflowStep(frame, '需求加工与收敛');
  const exported = await workflowExportRows(frame);
  assert.ok(exported.some((row) => row.产品编码 === 'A' && row.基地 === '西南'));
  assert.deepEqual(
    [
      ...new Set(
        exported
          .filter((row) => row.产品编码)
          .map((row) => JSON.stringify([row.基地, row.产品编码])),
      ),
    ],
    [JSON.stringify(['西南', 'A'])],
  );
  await workflowStep(frame, '主数据对应关系');
  const relations = frame.getByRole('region', { name: '单品与候选产线', exact: true });
  await expect(relations.locator('tbody tr')).toHaveCount(1);
  await expect(relations.locator('tbody')).toContainText('西南');
  await expect(relations.locator('tbody')).not.toContainText('郑州');
  for (const step of ['约束与配置', '产能评估与缺口', '产销存报告']) {
    await workflowStep(frame, step);
    const base = frame
      .getByRole('region', { name: step, exact: true })
      .getByLabel('基地筛选', { exact: true });
    await expect(base.locator('option')).not.toContainText(['郑州']);
    if (step !== '约束与配置') {
      const rows = (await workflowExportRows(frame)).filter((row) => row.产品编码);
      assert.ok(rows.length > 0);
      assert.ok(rows.every((row) => row.基地 === '西南' && row.产品编码 === 'A'));
    }
  }
  assert.equal(await page.evaluate(() => window.peerDraft), '历史草稿，请保留。');
  await workflowStep(frame, '需求确认');
  await products.getByRole('button', { name: '删除 A', exact: true }).click();
  failed = true;
  await products.getByRole('button', { name: '同步产品', exact: true }).click();
  await expect(products.getByRole('alert')).toContainText('数据读取失败');
  await expect(products.getByRole('button', { name: '删除 A', exact: true })).toHaveCount(0);
});
