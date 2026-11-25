import { canonicalBaseName } from './relations.js';

export const businessCategories = [
  '水饺',
  '汤圆',
  '面点',
  '休闲',
  '饼类',
  '馄饨',
  '蒸煎饺',
  '火锅料',
  '鸡调理',
];
export const businessBases = ['郑州', '西南', '华东', '华南', '遂平'];
const fields = {
  base: ['base', '基地', '目标基地', '源基地', 'target_base', 'belong_base'],
  category: ['category', '大类', '负责品项', '产品分类', 'responsible_item'],
  group: ['group', '物料组', '物料组编码', 'product_item'],
  code: ['code', 'SKU', '产品编码', '物料编码', 'material_code'],
  name: ['name', '产品名称', '物料名称', 'material_name'],
  groupName: ['groupName', '物料组名称', 'product_item_name'],
  month: ['month', '月份', '需求月份'],
};
export const isSkuColumn = (column) => fields.code.includes(column);
const text = (value) => (typeof value === 'string' ? value.trim() : '');
const value = (row, field) => fields[field].map((name) => text(row?.[name])).find(Boolean) ?? '';
export function compareBusinessValues(field, left, right) {
  const order = field === 'base' ? businessBases : field === 'category' ? businessCategories : [];
  const a = field === 'base' ? canonicalBaseName(left) : left;
  const b = field === 'base' ? canonicalBaseName(right) : right;
  const rank = (item) => (order.includes(item) ? order.indexOf(item) : order.length);
  return rank(a) - rank(b) || a.localeCompare(b, 'zh-CN');
}
export function compareBusinessRows(
  left,
  right,
  dimensions = ['base', 'category', 'group', 'code', 'month'],
) {
  for (const field of dimensions) {
    const result = compareBusinessValues(field, value(left, field), value(right, field));
    if (result) return result;
  }
  return 0;
}
export function orderedTableEntries(columns, rows) {
  const entries = rows.map((row, index) => ({ row, index }));
  if (columns.includes('粒度')) return entries;
  const normalized = (row) =>
    Array.isArray(row)
      ? Object.fromEntries(columns.map((column, index) => [column, row[index]]))
      : row;
  return entries.sort((left, right) =>
    compareBusinessRows(normalized(left.row), normalized(right.row)),
  );
}
const contexts = new WeakMap();
export function createTablePresentation(react) {
  if (contexts.has(react)) return contexts.get(react);
  const Context = react.createContext(() => '');
  const h = react.createElement;
  function Provider({ draft, children }) {
    const resolve = react.useMemo(() => {
      const records = new Map();
      const add = (row) => {
        const code = value(row, 'code');
        if (!code) return;
        if (!records.has(code)) records.set(code, []);
        records.get(code).push(row);
      };
      for (const row of draft.products ?? []) add(row);
      for (const row of draft.productRaw ?? []) add(row);
      return (row, participants) => {
        const code = value(row, 'code');
        const base = value(row, 'base');
        const bases = participants
          ? new Set(participants.map((item) => canonicalBaseName(value(item, 'base'))))
          : base
            ? new Set([canonicalBaseName(base)])
            : null;
        const candidates = (records.get(code) ?? []).filter(
          (item) =>
            !bases || !value(item, 'base') || bases.has(canonicalBaseName(value(item, 'base'))),
        );
        if (!candidates.length) return '';
        if (candidates.some((item) => text(item.transfer_tag) === '新品')) return '新品';
        if (candidates.some((item) => ['下市品', '下市'].includes(text(item.transfer_tag))))
          return '下市';
        if (
          [...candidates, row].some((item) =>
            [value(item, 'name'), value(item, 'groupName')].some((name) => name.includes('定制')),
          )
        )
          return '定制';
        return '常规';
      };
    }, [draft.products, draft.productRaw]);
    return h(Context.Provider, { value: resolve }, children);
  }
  function Tag({ row, participants }) {
    const resolve = react.useContext(Context);
    const label = resolve(row, participants);
    return label ? h('span', { className: 'mps-sku-tag', 'data-label': label }, label) : null;
  }
  function Code({ row, participants }) {
    const code = value(row, 'code');
    return h(
      'span',
      { className: 'mps-sku-identity' },
      h(Tag, { row, participants }),
      h('span', null, code),
    );
  }
  const presentation = { Provider, Tag, Code };
  contexts.set(react, presentation);
  return presentation;
}
