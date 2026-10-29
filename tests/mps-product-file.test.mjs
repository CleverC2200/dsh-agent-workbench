import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx-republish';
import { productFileText } from '../static/mps/source/product-file.js';

const excel = (sheet) => {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, '产品');
  const data = XLSX.write(book, { type: 'buffer', bookType: 'xlsx' });
  return { name: '产品.XLSX', arrayBuffer: async () => data };
};

test('Excel-saved products preserve formatted identifiers, quoted names, optional bases and old-product pairs', async () => {
  const sheet = XLSX.utils.aoa_to_sheet([
    ['基地', '产品编码', '产品名称', '大类', '系列', '物料组', '老品编码', '老品名称'],
    ['', 123456, '产品,甲', '汤圆', '系列甲', '101005', '00001234', '老品甲'],
  ]);
  sheet.B2.z = '00000000';
  const csv = await productFileText(excel(sheet));
  assert.match(csv, /,00123456,"产品,甲",汤圆,系列甲,101005,00001234,老品甲/);
  const savedCsv = '\uFEFF基地,产品编码\r\n,00123456';
  assert.equal(await productFileText({ name: '产品.csv', text: async () => savedCsv }), savedCsv);
});

test('empty and oversized Excel ranges fail before replacing inputs, and unknown formats are rejected', async () => {
  await assert.rejects(productFileText(excel({})), /工作表为空/);
  const sheet = XLSX.utils.aoa_to_sheet([['基地']]);
  sheet.A10002 = { t: 's', v: '越界' };
  sheet['!ref'] = 'A1:A10002';
  await assert.rejects(productFileText(excel(sheet)), /10000条上限/);
  await assert.rejects(productFileText({ name: '产品.xls' }), /只支持/);
});
