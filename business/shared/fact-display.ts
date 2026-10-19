/** Display only declared numeric fields. Do not coerce identifiers or lose DECIMAL precision. */
export function formatFactValue(value: unknown, format?: string): string {
  if (value == null || value === '') return '-';
  if (format === 'percent') {
    const n = Number(value);
    return String(value).trim() !== '' && Number.isFinite(n)
      ? (n * 100).toLocaleString('zh-CN', { maximumFractionDigits: 2 }) + '%'
      : '-';
  }
  if (format === 'decimal2') {
    const n = Number(value);
    return typeof value !== 'boolean' && String(value).trim() !== '' && Number.isFinite(n)
      ? n.toLocaleString('en-US', { maximumFractionDigits: 2 })
      : '-';
  }
  if (format !== 'decimal') return String(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '-';
    return (Object.is(value, -0) ? 0 : value).toLocaleString('en-US', {
      maximumSignificantDigits: 21,
    });
  }
  let decimalText = String(value);
  const scientific = /^(-?)(\d+)(?:\.(\d+))?[eE]([+-]?\d+)$/.exec(decimalText);
  if (scientific) {
    const exponent = Number(scientific[4]);
    if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 1000) return '-';
    const digits = scientific[2] + (scientific[3] ?? '');
    const point = scientific[2].length + exponent;
    decimalText =
      scientific[1] +
      (point <= 0
        ? '0.' + '0'.repeat(-point) + digits
        : point >= digits.length
          ? digits + '0'.repeat(point - digits.length)
          : digits.slice(0, point) + '.' + digits.slice(point));
  }
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(decimalText);
  if (!match) return '-';
  const integer = match[2].replace(/^0+(?=\d)/, '');
  const fraction = (match[3] ?? '').replace(/0+$/, '');
  const sign = match[1] && (integer !== '0' || fraction) ? '-' : '';
  return sign + integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (fraction ? '.' + fraction : '');
}
