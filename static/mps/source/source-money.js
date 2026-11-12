export function sourceDecimal(value) {
  if (value === null) return '';
  if (
    !['string', 'number'].includes(typeof value) ||
    !/^-?\d+(\.\d+)?$/.test(String(value)) ||
    (typeof value === 'number' &&
      (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER))
  )
    throw Error('来源返回了无效十进制数值');
  return String(value);
}

export function sourceAmount(value) {
  const raw = sourceDecimal(value);
  if (raw === '') return '';
  if (
    !/^-?\d+(\.\d{1,2})?$/.test(raw) ||
    (typeof value === 'number' && !Number.isSafeInteger(value * 100))
  )
    throw Error('金额来源未保留decimal两位精度');
  const [whole, fraction = ''] = raw.split('.');
  return whole + '.' + fraction.padEnd(2, '0');
}
export function sumSourceAmounts(rows, field) {
  let cents = 0n,
    missing = 0,
    known = 0;
  for (const row of rows) {
    if (row[field] === '' || row[field] == null) {
      missing++;
      continue;
    }
    const value = sourceAmount(row[field]);
    const negative = value.startsWith('-');
    const digits = value.replace('-', '').replace('.', '');
    cents += BigInt(digits) * (negative ? -1n : 1n);
    known++;
  }
  const digits = (cents < 0n ? -cents : cents).toString().padStart(3, '0');
  const total = `${cents < 0n ? '-' : ''}${digits.slice(0, -2)}.${digits.slice(-2)}`;
  return { amount: known && !missing ? total : null, knownAmount: known ? total : null, missing };
}
