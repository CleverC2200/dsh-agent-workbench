export function formatCustomerQuantity(value, unit, precision = 0) {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${value.toLocaleString('zh-CN', { minimumFractionDigits: precision, maximumFractionDigits: precision })}${unit}`;
}
