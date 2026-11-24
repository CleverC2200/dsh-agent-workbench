import test from 'node:test';
import assert from 'node:assert/strict';
import { read, CFB } from 'xlsx-republish';
import { achievementWorkbook } from '../prototypes/inventory-orderworkbench/achievement-workbook.mjs';
import { saveAchievementFile } from '../prototypes/inventory-orderworkbench/achievement-export.mjs';

const monthly = {
  title: '基地月度达成（本期 / 环比 / 同比）',
  groups: [
    { label: '基地', rowspan: true },
    { label: '满足率 >95%', columns: ['本期', '环比', '同比'] },
  ],
  rows: [
    ['华东', { text: '98.41%', state: 'good' }, '+3.52%', '—'],
    ['合计', { text: '94.20%*', state: 'bad' }, '-1.20%*', '—'],
  ],
};
const request = {
  dimension: '基地维度达成分析',
  period: '2026年11月 · 第三周',
  tables: [monthly, { ...monthly, title: '基地周度达成（本周 / 周环比 / 周同比）' }],
};
const xml = (zip, path) =>
  new TextDecoder().decode(
    zip.FileIndex[zip.FullPaths.findIndex((name) => name.endsWith('/' + path))].content,
  );

test('Excel has separate monthly and weekly sheets with page headers, formats and frozen names', () => {
  const file = achievementWorkbook(request),
    workbook = read(file.content, { type: 'array' });
  assert.deepEqual(workbook.SheetNames, ['基地月度达成', '基地周度达成']);
  assert.equal(file.rowCount, 4);
  assert.ok(file.filename.endsWith('.xlsx'));
  const sheet = workbook.Sheets['基地月度达成'];
  assert.equal(sheet.A3.v, '基地');
  assert.equal(sheet.B3.v, '满足率 >95%');
  assert.equal(sheet.B4.v, '本期');
  assert.equal(sheet.B5.v, '98.41%');
  assert.equal(sheet.B6.v, '● 94.20%*');
  assert.equal(sheet.C6.v, '-1.20%*');
  assert.equal(sheet.D5.v, '—');
  assert.ok(sheet['!merges'].some((m) => m.s.r === 2 && m.s.c === 0 && m.e.r === 3));
  assert.ok(sheet['!merges'].some((m) => m.s.r === 2 && m.s.c === 1 && m.e.c === 3));
  const zip = CFB.read(file.content, { type: 'array' }),
    styles = xml(zip, 'xl/styles.xml'),
    worksheet = xml(zip, 'xl/worksheets/sheet1.xml');
  assert.match(styles, /FFF2F3F5/);
  assert.match(styles, /FFC8112A/);
  assert.match(styles, /FFE3E6EA/);
  assert.match(worksheet, /<c r="B6"[^>]*s="3"/);
  assert.match(worksheet, /<pane xSplit="1" ySplit="4" topLeftCell="B5"/);
});

test('flat province tables remain separate sheets and text never becomes a formula', () => {
  const file = achievementWorkbook({
    ...request,
    frozenColumns: 2,
    tables: [
      {
        title: '省区作废率',
        groups: ['省区', '所属大区', '作废率'].map((label) => ({ label, rowspan: true })),
        rows: [['=1+1', '客户,"甲"\n乙', '2.30%']],
      },
    ],
  });
  const workbook = read(file.content, { type: 'array' }),
    sheet = workbook.Sheets['省区作废率'];
  assert.equal(sheet.A4.v, '=1+1');
  assert.equal(sheet.A4.f, undefined);
  assert.equal(sheet.B4.v, '客户,"甲"\n乙');
  assert.match(
    xml(CFB.read(file.content, { type: 'array' }), 'xl/worksheets/sheet1.xml'),
    /xSplit="2" ySplit="3"/,
  );
  assert.throws(() => achievementWorkbook({ ...request, tables: [] }), /暂无/);
});

test('save picker writes Excel bytes and cancellation does not download', async () => {
  const file = achievementWorkbook(request);
  let written,
    options,
    closed = false;
  assert.equal(
    await saveAchievementFile(file, {
      showSaveFilePicker: async (input) => {
        options = input;
        return {
          createWritable: async () => ({
            write: async (blob) => {
              written = new Uint8Array(await blob.arrayBuffer());
            },
            close: async () => {
              closed = true;
            },
          }),
        };
      },
    }),
    'saved',
  );
  assert.deepEqual(written, file.content);
  assert.equal(closed, true);
  assert.equal(options.suggestedName, file.filename);
  assert.deepEqual(options.types[0].accept[file.mime], ['.xlsx']);
  assert.equal(
    await saveAchievementFile(file, {
      showSaveFilePicker: async () => {
        throw new DOMException('cancel', 'AbortError');
      },
    }),
    'cancelled',
  );
  await assert.rejects(
    saveAchievementFile(file, {
      showSaveFilePicker: async () => ({
        createWritable: async () => {
          throw Error('磁盘写入失败');
        },
      }),
    }),
    /磁盘写入失败/,
  );
});

test('sandbox fallback downloads the same workbook bytes', async () => {
  const file = achievementWorkbook(request);
  let blob;
  const actions = [];
  const link = { click: () => actions.push('click'), remove: () => actions.push('remove') };
  assert.equal(
    await saveAchievementFile(file, {
      showSaveFilePicker: async () => {
        throw new DOMException('sandbox', 'SecurityError');
      },
      URL: {
        createObjectURL: (value) => {
          blob = value;
          return 'blob:xlsx';
        },
        revokeObjectURL: (value) => actions.push(value),
      },
      document: { createElement: () => link, body: { appendChild: () => actions.push('append') } },
      setTimeout: (fn) => fn(),
    }),
    'download',
  );
  assert.deepEqual(new Uint8Array(await blob.arrayBuffer()), file.content);
  assert.equal(blob.type, file.mime);
  assert.equal(link.download, file.filename);
  assert.deepEqual(actions, ['append', 'click', 'remove', 'blob:xlsx']);
});
