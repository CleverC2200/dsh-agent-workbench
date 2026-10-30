import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as XLSX from 'xlsx-republish';

export async function mpsDownloadText(path) {
  const data = await readFile(path);
  if (data[0] !== 0x50 || data[1] !== 0x4b) return data.toString('utf8');
  const zip = XLSX.CFB.read(data, { type: 'buffer' });
  for (const path of zip.FullPaths.filter((path) => /\/worksheets\/sheet\d+\.xml$/.test(path))) {
    assert.match(new TextDecoder().decode(XLSX.CFB.find(zip, path).content), /state="frozen"/);
  }
  const book = XLSX.read(data, { type: 'buffer' });
  return XLSX.utils.sheet_to_csv(book.Sheets[book.SheetNames[0]]);
}
