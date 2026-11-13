const INFRASTRUCTURE_TERMS = [
  [/\bCube(?:\.js)?\b/gi, '库存数据服务'],
  [/\bMCP\b/gi, '数据服务'],
  [/\bSQL\b/gi, '查询语句'],
  [/数据仓库/g, '数据服务'],
  [/语义层/g, '数据口径'],
];

export function sanitizeUserVisibleCopy(value) {
  let copy = typeof value === 'string' ? value : String(value ?? '');
  for (const [pattern, replacement] of INFRASTRUCTURE_TERMS) {
    copy = copy.replace(pattern, replacement);
  }
  return copy;
}
