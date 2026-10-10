// Narrow OOXML table import/export using Web APIs. No spreadsheet runtime.
const encoder = new TextEncoder(),
  decoder = new TextDecoder();
const xml = (s: unknown) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&apos;',
      })[c]!,
  );
const col = (n: number): string =>
  n < 26
    ? String.fromCharCode(65 + n)
    : col(Math.floor(n / 26) - 1) + String.fromCharCode(65 + (n % 26));
function crc(bytes: Uint8Array) {
  let v = 0xffffffff;
  for (const b of bytes) {
    v ^= b;
    for (let j = 0; j < 8; j++) v = (v >>> 1) ^ (v & 1 ? 0xedb88320 : 0);
  }
  return (v ^ 0xffffffff) >>> 0;
}
export function zipStored(files: Record<string, string>) {
  const locals: Uint8Array[] = [],
    central: Uint8Array[] = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const n = encoder.encode(name),
      b = encoder.encode(text),
      c = crc(b);
    const l = new Uint8Array(30 + n.length + b.length),
      v = new DataView(l.buffer);
    v.setUint32(0, 0x04034b50, true);
    v.setUint16(4, 20, true);
    v.setUint32(14, c, true);
    v.setUint32(18, b.length, true);
    v.setUint32(22, b.length, true);
    v.setUint16(26, n.length, true);
    l.set(n, 30);
    l.set(b, 30 + n.length);
    locals.push(l);
    const d = new Uint8Array(46 + n.length),
      dv = new DataView(d.buffer);
    dv.setUint32(0, 0x02014b50, true);
    dv.setUint16(4, 20, true);
    dv.setUint16(6, 20, true);
    dv.setUint32(16, c, true);
    dv.setUint32(20, b.length, true);
    dv.setUint32(24, b.length, true);
    dv.setUint16(28, n.length, true);
    dv.setUint32(42, offset, true);
    d.set(n, 46);
    central.push(d);
    offset += l.length;
  }
  const end = new Uint8Array(22),
    e = new DataView(end.buffer),
    size = central.reduce((n, b) => n + b.length, 0);
  e.setUint32(0, 0x06054b50, true);
  e.setUint16(8, central.length, true);
  e.setUint16(10, central.length, true);
  e.setUint32(12, size, true);
  e.setUint32(16, offset, true);
  const out = new Uint8Array(offset + size + 22);
  let p = 0;
  for (const part of [...locals, ...central, end]) {
    out.set(part, p);
    p += part.length;
  }
  return out;
}
export function workbookBytes(rows: unknown[][], sheetName = '业务数据') {
  const ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  return zipStored({
    '[Content_Types].xml':
      '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
    '_rels/.rels':
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml': `<workbook xmlns="${ns}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xml(sheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    'xl/_rels/workbook.xml.rels':
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    'xl/worksheets/sheet1.xml': `<worksheet xmlns="${ns}"><sheetData>${rows.map((r, i) => `<row r="${i + 1}">${r.map((v, j) => (typeof v === 'number' && Number.isFinite(v) ? `<c r="${col(j)}${i + 1}"><v>${v}</v></c>` : `<c r="${col(j)}${i + 1}" t="inlineStr"><is><t xml:space="preserve">${xml(v)}</t></is></c>`)).join('')}</row>`).join('')}</sheetData></worksheet>`,
  });
}
export function downloadWorkbook(rows: unknown[][], name: string, sheetName?: string) {
  const url = URL.createObjectURL(
    new Blob([workbookBytes(rows, sheetName)], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function unzipWorkbook(buffer: ArrayBuffer) {
  if (buffer.byteLength > 20 * 1024 * 1024) throw Error('工作簿不能超过 20 MB');
  const bytes = new Uint8Array(buffer),
    v = new DataView(buffer);
  let end = -1;
  for (let p = bytes.length - 22; p >= Math.max(0, bytes.length - 65557); p--)
    if (v.getUint32(p, true) === 0x06054b50) {
      end = p;
      break;
    }
  if (end < 0) throw Error('请使用 .xlsx 工作簿；旧版 .xls 请在 Excel 中另存为 .xlsx');
  const count = v.getUint16(end + 10, true);
  if (count > 300) throw Error('工作簿结构过大');
  let p = v.getUint32(end + 16, true),
    total = 0;
  const files = new Map<string, Uint8Array>();
  for (let i = 0; i < count; i++) {
    if (p + 46 > bytes.length || v.getUint32(p, true) !== 0x02014b50) throw Error('工作簿目录损坏');
    const flags = v.getUint16(p + 8, true),
      method = v.getUint16(p + 10, true),
      sum = v.getUint32(p + 16, true),
      size = v.getUint32(p + 20, true),
      raw = v.getUint32(p + 24, true),
      n = v.getUint16(p + 28, true),
      extra = v.getUint16(p + 30, true),
      comment = v.getUint16(p + 32, true),
      offset = v.getUint32(p + 42, true);
    const name = decoder.decode(bytes.slice(p + 46, p + 46 + n));
    p += 46 + n + extra + comment;
    if (!name.startsWith('xl/') || (!name.endsWith('.xml') && !name.endsWith('.rels'))) continue;
    if (flags & 1 || ![0, 8].includes(method)) throw Error('不支持加密工作簿');
    total += raw;
    if (raw > 20 * 1024 * 1024 || total > 40 * 1024 * 1024) throw Error('工作簿解压后过大');
    if (offset + 30 > bytes.length || v.getUint32(offset, true) !== 0x04034b50)
      throw Error('工作簿数据损坏');
    const start = offset + 30 + v.getUint16(offset + 26, true) + v.getUint16(offset + 28, true);
    if (start + size > bytes.length) throw Error('工作簿数据不完整');
    let b = bytes.slice(start, start + size);
    if (method === 8) {
      const reader = new Blob([b])
        .stream()
        .pipeThrough(new DecompressionStream('deflate-raw'))
        .getReader();
      const chunks: Uint8Array[] = [];
      let length = 0;
      try {
        while (true) {
          const r = await reader.read();
          if (r.done) break;
          length += r.value.length;
          if (length > raw) throw Error('工作簿解压大小异常');
          chunks.push(r.value);
        }
      } finally {
        await reader.cancel();
      }
      b = new Uint8Array(length);
      let j = 0;
      for (const c of chunks) {
        b.set(c, j);
        j += c.length;
      }
    }
    if (b.length !== raw || crc(b) !== sum) throw Error('工作簿校验失败');
    files.set(name, b);
  }
  return files;
}
function documentXml(bytes: Uint8Array | undefined) {
  if (!bytes) throw Error('工作簿缺少工作表信息');
  const text = decoder.decode(bytes);
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw Error('不支持外部 XML 定义');
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw Error('工作簿 XML 损坏');
  return doc;
}
export async function readWorkbook(file: File) {
  const files = await unzipWorkbook(await file.arrayBuffer());
  const book = documentXml(files.get('xl/workbook.xml')),
    sheet = book.getElementsByTagName('sheet')[0];
  if (!sheet) throw Error('工作簿无工作表');
  const id = sheet.getAttribute('r:id');
  const rel = Array.from(
    documentXml(files.get('xl/_rels/workbook.xml.rels')).getElementsByTagName('Relationship'),
  ).find((e) => e.getAttribute('Id') === id);
  const target = rel?.getAttribute('Target') ?? '';
  if (!target || target.includes('..') || rel?.getAttribute('TargetMode') === 'External')
    throw Error('工作表地址无效');
  const filename = target.startsWith('/') ? target.slice(1) : 'xl/' + target;
  const doc = documentXml(files.get(filename));
  const strings = files.has('xl/sharedStrings.xml')
    ? Array.from(documentXml(files.get('xl/sharedStrings.xml')).getElementsByTagName('si')).map(
        (si) =>
          Array.from(si.getElementsByTagName('t'))
            .map((t) => t.textContent ?? '')
            .join(''),
      )
    : [];
  const rows = Array.from(doc.getElementsByTagName('row'));
  if (rows.length > 50001) throw Error('最多导入 50000 条计划');
  const values = rows.map((row) => {
    const out: (string | number)[] = [];
    for (const c of Array.from(row.getElementsByTagName('c'))) {
      if (c.getElementsByTagName('f').length)
        throw Error('计划模板包含公式，请先粘贴为数值后导入，避免使用过期的公式缓存');
      const ref = c.getAttribute('r') ?? '',
        letters = ref.match(/^[A-Z]+/)?.[0];
      if (!letters) throw Error('单元格坐标缺失');
      let index = 0;
      for (const l of letters) index = index * 26 + l.charCodeAt(0) - 64;
      if (index > 200) throw Error('工作表列数过多');
      const type = c.getAttribute('t'),
        v = c.getElementsByTagName('v')[0]?.textContent ?? '';
      if (type === 'e') throw Error('工作表包含错误单元格');
      out[index - 1] =
        type === 's'
          ? (strings[Number(v)] ?? '')
          : type === 'inlineStr'
            ? Array.from(c.getElementsByTagName('t'))
                .map((t) => t.textContent ?? '')
                .join('')
            : type === 'str'
              ? v
              : v === ''
                ? ''
                : Number(v);
    }
    return out;
  });
  const headers = (values.shift() ?? []).map(String);
  if (headers.length === 0 || new Set(headers).size !== headers.length)
    throw Error('工作表表头为空或重复');
  return values
    .filter((r) => r.some((v) => v !== '' && v !== undefined))
    .map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ''])));
}
