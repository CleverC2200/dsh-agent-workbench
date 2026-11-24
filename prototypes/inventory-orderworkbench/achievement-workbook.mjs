import { utils, write, CFB } from 'xlsx-republish';

const display = (value) =>
  String(value && typeof value === 'object' && 'text' in value ? value.text : (value ?? ''));
const mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const font = (color, bold = false, size = 11) =>
  `<font><sz val="${size}"/><color rgb="FF${color}"/><name val="Microsoft YaHei"/>${bold ? '<b/>' : ''}</font>`;
const xf = (fontId, fillId = 0, borderId = 1, horizontal = 'center') =>
  `<xf numFmtId="0" fontId="${fontId}" fillId="${fillId}" borderId="${borderId}" xfId="0" applyAlignment="1"><alignment horizontal="${horizontal}" vertical="center" wrapText="1"/></xf>`;
const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="7">${font('4F5967')}${font('4D5765', true)}${font('20232A', true)}${font('C8112A', true)}${font('956900', true)}${font('303844', true, 14)}${font('858C96', false, 10)}</fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF2F3F5"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border>${['left', 'right', 'top', 'bottom'].map((side) => `<${side} style="thin"><color rgb="FFE3E6EA"/></${side}>`).join('')}<diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="7">${xf(0)}${xf(1, 2)}${xf(2)}${xf(3)}${xf(4)}${xf(5, 0, 0, 'left')}${xf(6, 0, 0, 'left')}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

export function achievementWorkbook({ dimension, period, tables, frozenColumns = 1 }) {
  if (
    !tables.length ||
    tables.some((table) => table.loading) ||
    !tables.some((table) => table.rows.length)
  )
    throw Error('当前维度暂无可下载的表格数据，请待加载完成后重试。');
  const workbook = utils.book_new(),
    cellStyles = [];
  const usedNames = new Set();
  for (const table of tables) {
    const width = table.groups.reduce(
      (total, group) => total + (group.rowspan ? 1 : group.columns.length),
      0,
    );
    const hasSubheaders = table.groups.some((group) => !group.rowspan);
    const headerRows = hasSubheaders ? 2 : 1;
    const firstDataRow = 2 + headerRows;
    const rows = Array.from({ length: firstDataRow }, () => Array(width).fill(''));
    rows[0][0] = table.title;
    rows[1][0] = `页面所选周期：${period}`;
    const merges = [0, 1].map((r) => ({ s: { r, c: 0 }, e: { r, c: width - 1 } }));
    let column = 0;
    for (const group of table.groups) {
      rows[2][column] = group.label;
      if (group.rowspan) {
        if (hasSubheaders) merges.push({ s: { r: 2, c: column }, e: { r: 3, c: column } });
        column++;
      } else {
        if (group.columns.length > 1)
          merges.push({
            s: { r: 2, c: column },
            e: { r: 2, c: column + group.columns.length - 1 },
          });
        group.columns.forEach((label, index) => {
          rows[3][column + index] = label;
        });
        column += group.columns.length;
      }
    }
    const styleMap = new Map();
    for (let r = 0; r < firstDataRow; r++)
      for (let c = 0; c < width; c++)
        styleMap.set(utils.encode_cell({ r, c }), r === 0 ? 5 : r === 1 ? 6 : 1);
    for (const sourceRow of table.rows) {
      const r = rows.length;
      rows.push(
        sourceRow.map((value, c) => {
          const state = value?.state;
          styleMap.set(
            utils.encode_cell({ r, c }),
            state === 'bad' ? 3 : state === 'warning' ? 4 : state === 'good' || c === 0 ? 2 : 0,
          );
          return (state === 'bad' ? '● ' : state === 'warning' ? '! ' : '') + display(value);
        }),
      );
    }
    const sheet = utils.aoa_to_sheet(rows);
    sheet['!merges'] = merges;
    sheet['!cols'] = Array.from({ length: width }, (_, c) => ({
      wch: c < frozenColumns ? 20 : 15,
    }));
    sheet['!rows'] = rows.map((_, r) => ({
      hpt: r === 0 ? 30 : r === 1 ? 23 : r === 2 ? 44 : r < firstDataRow ? 30 : 28,
    }));
    let name = table.title
        .split(/[（(]/)[0]
      .replace(/[[\]:*?/\\]/g, '-')
        .slice(0, 31),
      count = 1;
    const initial = name;
    while (usedNames.has(name)) name = initial.slice(0, 27) + '-' + count++;
    usedNames.add(name);
    utils.book_append_sheet(workbook, sheet, name);
    cellStyles.push({ styleMap, firstDataRow });
  }
  const zip = CFB.read(new Uint8Array(write(workbook, { type: 'array', bookType: 'xlsx' })), {
    type: 'array',
  });
  const encoder = new TextEncoder(),
    decoder = new TextDecoder();
  const replace = (path, content) => {
    const entry = zip.FileIndex[zip.FullPaths.findIndex((name) => name.endsWith('/' + path))];
    entry.content = encoder.encode(content);
    entry.size = entry.content.length;
  };
  replace('xl/styles.xml', styles);
  cellStyles.forEach(({ styleMap, firstDataRow }, index) => {
    const path = `xl/worksheets/sheet${index + 1}.xml`;
    const entry = zip.FileIndex[zip.FullPaths.findIndex((name) => name.endsWith('/' + path))];
    let xml = decoder.decode(entry.content);
    xml = xml.replace(/<c\b([^>]*)>/g, (tag, attributes) => {
      const address = attributes.match(/\br="([^"]+)"/)?.[1];
      const clean = attributes.replace(/\s+s="\d+"/g, '');
      return `<c${clean} s="${styleMap.get(address) ?? 0}">`;
    });
    const cell = utils.encode_cell({ r: firstDataRow, c: frozenColumns });
    xml = xml.replace(
      /<sheetViews>[\s\S]*?<\/sheetViews>/,
      `<sheetViews><sheetView workbookViewId="0"><pane xSplit="${frozenColumns}" ySplit="${firstDataRow}" topLeftCell="${cell}" activePane="bottomRight" state="frozen"/></sheetView></sheetViews>`,
    );
    replace(path, xml);
  });
  const filename =
    Array.from(`订单工作台-${dimension}-${period}`, (character) =>
      character.charCodeAt(0) < 32 || /[<>:"/\\|?*]/.test(character) ? '-' : character,
    ).join('') + '.xlsx';
  return {
    filename,
    mime,
    content: new Uint8Array(CFB.write(zip, { type: 'array', fileType: 'zip', compression: true })),
    rowCount: tables.reduce((sum, table) => sum + table.rows.length, 0),
  };
}
