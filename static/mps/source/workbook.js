export async function workbookBytes(tables) {
  const XLSX = await import('xlsx-republish');
  const book = XLSX.utils.book_new();
  for (const { name, columns, rows } of tables) {
    const sheet = XLSX.utils.aoa_to_sheet([
      columns,
      ...rows.map((row) => columns.map((column) => row[column] ?? '')),
    ]);
    sheet['!cols'] = columns.map((column) => ({ wch: column.includes('名称') ? 36 : 18 }));
    columns.forEach((column, index) => {
      if (!column.endsWith('环比')) return;
      rows.forEach((_row, row) => {
        const cell = sheet[XLSX.utils.encode_cell({ r: row + 1, c: index })];
        if (cell?.t === 'n') cell.z = '0.00%';
      });
    });
    XLSX.utils.book_append_sheet(book, sheet, name);
  }
  const zip = XLSX.CFB.read(new Uint8Array(XLSX.write(book, { type: 'array', bookType: 'xlsx' })), {
    type: 'array',
  });
  for (const path of zip.FullPaths.filter((path) => /\/worksheets\/sheet\d+\.xml$/.test(path))) {
    const entry = XLSX.CFB.find(zip, path);
    const xml = new TextDecoder().decode(entry.content);
    entry.content = new TextEncoder().encode(
      xml.replace(
        /<sheetViews>[\s\S]*?<\/sheetViews>/,
        '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>',
      ),
    );
    entry.size = entry.content.length;
  }
  return new Uint8Array(XLSX.CFB.write(zip, { type: 'array', fileType: 'zip', compression: true }));
}
