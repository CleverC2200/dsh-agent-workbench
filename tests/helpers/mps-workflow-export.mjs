import assert from 'node:assert/strict';
import * as XLSX from 'xlsx-republish';
import { mpsDownloadText } from './mps-download.mjs';

export async function workflowExportRows(frame) {
  const button = frame.getByRole('button', { name: /^(下载需求拆分|下载需求推导参考)$/ });
  const pending = button.page().waitForEvent('download');
  await button.click();
  const csv = await mpsDownloadText(await (await pending).path());
  const book = XLSX.read(csv, { type: 'string', raw: true });
  return XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]], { defval: '' });
}
export async function expectWorkflowExportValue(frame, label, expected) {
  const [, base, code, month, name] = label.match(/^(\S+) (\S+) (\d{4}-\d{2}) (.+) 计算过程$/);
  const fields = { 上一财年发货数量: '上一财年发货参考量' };
  const rows = await workflowExportRows(frame);
  const row = rows.find(
    (row) => row['基地'] === base && row['产品编码'] === code && row['月份'] === month,
  );
  assert.ok(row, label);
  const value = row[fields[name] ?? name];
  const percent = expected.endsWith('%');
  const formatted =
    value === '' || value == null
      ? '—'
      : new Intl.NumberFormat('zh-CN', {
          maximumFractionDigits: percent ? 2 : 0,
          minimumFractionDigits: percent ? 2 : 0,
        }).format(Number(value) * (percent ? 100 : 1)) + (percent ? '%' : '');
  assert.equal(formatted, expected, label);
}
