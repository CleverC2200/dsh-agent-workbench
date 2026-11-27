export function normalizeOperationsTableCell(value) {
  if (value == null || (typeof value === 'number' && !Number.isFinite(value))) return '—';
  const html = String(value)
    .split(/(<[^>]*>)/g)
    .map((part, index) =>
      index % 2
        ? part
        : part.replace(/\b(?:undefined|null|NaN|-?Infinity)\b|\[object Object\]/g, '—'),
    )
    .join('');
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim()
    ? html
    : '—';
}
export function templateOperationsTableCell(value) {
  const content = normalizeOperationsTableCell(value);
  let scope;
  const html = String(content)
    .split(/(<[^>]*>)/g)
    .map((part, index) => {
      if (index % 2) return part;
      const match = part.match(/^(已知|共享仓库) ([-+\d,.]+(?:万|亿|件|个SKU)?)$/);
      if (!match) return part;
      scope = match[1];
      return match[2];
    })
    .join('');
  if (!scope || /\btitle=/.test(html)) return html;
  const title =
    scope === '共享仓库'
      ? '当前授权唯一仓库库存池，不代表订单基地独占库存，不能跨基地重复累加'
      : '已关联来源小计，未匹配部分未知';
  return '<span title="' + title + '">' + html + '</span>';
}
