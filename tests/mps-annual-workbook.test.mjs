import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx-republish';
import { workbookBytes } from '../static/mps/source/workbook.js';
globalThis.window = { addEventListener() {}, parent: { postMessage() {} } };
const { annualWorkbookTables } = await import('../static/mps/source/annual-workbook.js');
delete globalThis.window;

const row = (extra = {}) => ({
  belong_base: '全国',
  sub_category: '休闲',
  product_item: '101',
  product_item_name: '物料组甲',
  material_code: '0001',
  material_name: '产品甲',
  stat_month: '2026-12',
  demand_qty: 10,
  ...extra,
});

test('annual export separates group totals from SKUs and distinguishes zero, missing and conflicting months', () => {
  const tables = annualWorkbookTables(
    [
      row(),
      row(),
      row({ stat_month: '2027-1', demand_qty: 0 }),
      row({ material_code: '', material_name: '', demand_qty: 10 }),
    ],
    ['2026-12', '2027-01'],
    '全国',
  );
  assert.equal(tables[0].rows.length, 1);
  assert.equal(tables[0].rows[0]['全年合计'], 10);
  assert.equal(tables[1].rows[0]['2026-12'], 10);
  assert.equal(tables[1].rows[0]['2027-01'], 0);
  assert.equal(tables[1].rows[0]['2027-01环比'], -1);
  assert.equal(tables[2].rows[0]['2027-01'], '');
  assert.equal(tables[2].rows[0]['全年合计'], '');
  const conflict = annualWorkbookTables([row(), row({ demand_qty: 12 })], ['2026-12'], '全国');
  assert.equal(conflict[0].rows[0]['2026-12'], '');
  assert.equal(conflict[1].rows[0]['2026-12'], '');
  assert.match(conflict[0].rows[0]['核对说明'], /数量冲突/);
  assert.throws(
    () => annualWorkbookTables([row({ belong_base: '基地甲' })], ['2026-12'], '全国'),
    /范围/,
  );
});

test('xlsx output freezes every header and preserves textual identifiers and literal formula-like names', async () => {
  const bytes = await workbookBytes([
    {
      name: 'SKU',
      columns: ['编码', '名称', '数量'],
      rows: [{ 编码: '00001234', 名称: '=1+1', 数量: 0 }],
    },
    { name: '汇总', columns: ['数量'], rows: [{ 数量: '' }] },
  ]);
  const book = XLSX.read(bytes, { type: 'array' });
  assert.equal(book.Sheets.SKU.A2.v, '00001234');
  assert.equal(book.Sheets.SKU.B2.v, '=1+1');
  assert.equal(book.Sheets.SKU.B2.f, undefined);
  assert.equal(book.Sheets.SKU.C2.v, 0);
  const zip = XLSX.CFB.read(bytes, { type: 'array' });
  for (const path of zip.FullPaths.filter((path) => /\/worksheets\/sheet\d+\.xml$/.test(path))) {
    const xml = new TextDecoder().decode(XLSX.CFB.find(zip, path).content);
    assert.match(
      xml,
      /<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"\/>/,
    );
  }
});
