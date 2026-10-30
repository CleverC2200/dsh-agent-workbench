export function productReplacementErrors(rows, references) {
  const byCode = new Map();
  const byName = new Map();
  const reversedText = (code, name) => /\p{Script=Han}/u.test(code) && /^\d+$/.test(name);
  const add = (code, name) => {
    if (!code || !name) return;
    const names = byCode.get(code) ?? new Set();
    names.add(name);
    byCode.set(code, names);
    const codes = byName.get(name) ?? new Set();
    codes.add(code);
    byName.set(name, codes);
  };
  for (const row of references) {
    add(row['产品编码'], row['产品名称']);
    if (!reversedText(row['老品编码'], row['老品名称'])) add(row['老品编码'], row['老品名称']);
  }
  for (const row of rows) add(row['产品编码'], row['产品名称']);
  return rows.flatMap((row, index) => {
    const code = row['老品编码'];
    const name = row['老品名称'];
    let message;
    if (!!code !== !!name) message = '老品编码和老品名称须同时填写或同时留空';
    else if (code && name) {
      if (reversedText(code, name) || byName.get(code)?.has(name))
        message = '老品编码和老品名称填反，请分别填写编码和名称';
      else if (byCode.get(code)?.size === 1 && !byCode.get(code).has(name))
        message = '老品名称与已读取的编码不一致，请核对产品关系';
      else if (byName.get(name)?.size === 1 && !byName.get(name).has(code))
        message = '老品编码与已读取的名称不一致，请核对产品关系';
    }
    return message ? [{ index, message }] : [];
  });
}

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
