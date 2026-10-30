import { buildCategoryDemand } from './category-demand.js';
import { computeMpsWorkflow } from 'dsh-agent-manage/mps-compute/workflow';

const number = (value) => {
  if (
    value === null ||
    value === undefined ||
    (typeof value !== 'number' &&
      !(typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value.trim())))
  )
    return null;
  const result = Number(value);
  return Number.isFinite(result) && Math.abs(result) <= Number.MAX_SAFE_INTEGER ? result : null;
};
const text = (value) => (typeof value === 'string' ? value.trim() : '');
const demo = (value) => /demo|演示|原型/i.test(String(value ?? ''));
const rowKey = (row) => JSON.stringify([row.base, row.code]);
const sourceIssues = (draft, source, month) => {
  const current = draft[source + 'Read'];
  const read = current?.periods?.[month] ?? current;
  const status = typeof read === 'string' ? read : read?.status;
  return [
    ...(status === 'loading' ? ['当前来源正在读取，旧数据暂不参与计算'] : []),
    ...(['failed', 'denied', 'error'].includes(status)
      ? [text(read?.error) || text(draft[source + 'Error']) || '当前来源读取失败或无权限']
      : []),
    ...(demo(draft[source + 'Source']) ? ['演示来源不参与后续计算'] : []),
  ];
};

export function buildMpsWorkflow(draft, relations, shipmentSnapshot) {
  const context = { id: draft.id, name: draft.name, month: draft.month };
  const reportColumn = draft.pull === 'monthly' ? '月初数量' : '纠偏数量';
  const readQuantity = (rows, column) =>
    (rows ?? []).map((row) => ({
      month: text(row['月份']),
      base: text(row['基地']),
      code: text(row['产品编码']),
      quantity: number(row[column]),
    }));
  const availableQuantity = (source, column) =>
    readQuantity(draft[source], column).map((row) => ({
      ...row,
      quantity: sourceIssues(draft, source, row.month).length ? null : row.quantity,
    }));
  const report = availableQuantity('report', reportColumn);
  const history = availableQuantity('history', '数量');
  const relationSources =
    relations && (!relations.month || relations.month === draft.month) ? relations.sources : null;
  const capacities = (relationSources?.sku_capacity ?? []).map((row) => ({
    base: text(row.belong_base),
    code: text(row.material_code),
    line: [text(row.workshop), text(row.tunnel_no)].filter(Boolean).join(' / '),
    dailyPieces: number(row.standard_daily_output_pc),
    dailyTons: number(row.standard_daily_output_ton),
    missing: [
      ...(!text(row.belong_base) ? ['缺源基地'] : []),
      ...(!text(row.material_code) ? ['缺源物料编码'] : []),
      ...(!text(row.tunnel_no) ? ['缺隧道号'] : []),
      ...(number(row.standard_daily_output_pc) === null ? ['缺标准日产件数'] : []),
      ...(number(row.standard_daily_output_ton) === null ? ['缺标准日产吨数'] : []),
    ],
  }));
  const date = new Date(`${draft.month}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() - 1);
  const shipmentMonth = date.toISOString().slice(0, 7);
  const validShipment =
    shipmentSnapshot?.draftId === draft.id &&
    shipmentSnapshot.month === draft.month &&
    shipmentSnapshot.shipmentMonth === shipmentMonth &&
    shipmentSnapshot.sourceKind !== 'demo' &&
    !demo(shipmentSnapshot.source) &&
    !['loading', 'failed', 'error', 'denied'].includes(shipmentSnapshot.status);
  const openingInventory = validShipment
    ? (shipmentSnapshot.rows ?? []).map((row) => ({
        base: text(row.base),
        code: text(row.code),
        quantity: number(row.end),
      }))
    : [];
  const candidates = [...report, ...history, ...capacities, ...openingInventory];
  const products = demo(draft.productSource)
    ? []
    : (draft.products ?? []).flatMap((row) => {
        const product = {
          base: text(row['基地']),
          code: text(row['产品编码']),
          name: text(row['产品名称']),
          category: text(row['大类']),
          series: text(row['系列']),
          group: text(row['物料组']),
        };
        const bases = product.base
          ? [product.base]
          : [
              ...new Set(
                candidates
                  .filter((candidate) => candidate.code === product.code && candidate.base)
                  .map((candidate) => candidate.base),
              ),
            ];
        return bases.length ? bases.map((base) => ({ ...product, base })) : [product];
      });
  const productIssues = sourceIssues(draft, 'products');
  const result = computeMpsWorkflow({
    context,
    products,
    categoryDemand: (draft.categoryDemand ?? buildCategoryDemand(draft, []).rows).map((row) => ({
      month: text(row.month),
      category: text(row.category),
      quantity: number(row.quantity),
    })),
    report,
    history,
    sourceIssues: {
      report: productIssues,
      history: productIssues,
    },
    openingInventory,
    capacities,
    constraints: {
      safetyDays: (draft.constraints?.safetyDays ?? []).map((row) => ({
        base: text(row.base),
        days: number(row.days),
      })),
      rules: structuredClone(draft.constraints?.rules ?? {}),
    },
  });
  for (const row of result.rows) {
    const date = new Date(`${row.month}-01T00:00:00Z`);
    date.setUTCFullYear(date.getUTCFullYear() - 1);
    for (const source of ['report', 'history']) {
      const issues = sourceIssues(
        draft,
        source,
        source === 'report' ? row.month : date.toISOString().slice(0, 7),
      );
      for (const field of [source + 'Quantity', source + 'Share', 'share', 'demand'])
        row.missing[field] = [...new Set([...row.missing[field], ...issues])];
    }
  }
  const knownProducts = new Set(products.map(rowKey));
  result.missing.push(...productIssues);
  if (demo(draft.productSource)) result.missing.push('原型产品清单未接入后续计算');
  if (validShipment && openingInventory.some((row) => !knownProducts.has(rowKey(row))))
    result.missing.push('部分发货结存尚无本版本产品对应');
  return result;
}
