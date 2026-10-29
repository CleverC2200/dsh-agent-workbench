export async function productFileText(file) {
  if (/\.csv$/i.test(file.name)) return file.text();
  if (!/\.xlsx$/i.test(file.name)) throw Error('产品关系只支持CSV或Excel（.xlsx）文件。');
  const XLSX = await import('xlsx-republish');
  const book = XLSX.read(await file.arrayBuffer(), { type: 'array', sheetRows: 10002 });
  const sheet = book.Sheets[book.SheetNames[0]];
  if (!sheet?.['!ref']) throw Error('Excel首个工作表为空，未替换原输入。');
  const range = XLSX.utils.decode_range(sheet['!fullref'] ?? sheet['!ref']);
  if (range.e.r > 10000) throw Error('超过10000条上限，未读取任何行，请拆分文件后核对。');
  return XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
}
