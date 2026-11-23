import { matchesCategories } from './category-filter.js';
import { useStepViewField } from './step-view-state.js';

const labels = {
  complete: '完整可计算',
  'category-demand-missing': '大类总量未生成',
  'split-basis-missing': '拆分依据缺失',
  'calculation-missing': '需求计算缺项',
  'aggregate-missing': '计算有值，汇总漏接',
  'scope-empty': '无参与基地SKU',
};
const format = (value) =>
  value == null
    ? '待补'
    : new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 }).format(value);
export function createDemandDiagnostics(react, { downloadCsv }) {
  const h = react.createElement;
  return function DemandDiagnostics({ view, draft, result, rows, filters, table }) {
    const [open, setOpen] = useStepViewField(react, view, 'DemandDiagnostics.open', false);
    const categories = new Set(rows.map((row) => row.category));
    const scoped = Boolean(filters.base || filters.search || filters.onlyMissing);
    const selected = result.demandDiagnostics.filter(
      (row) =>
        matchesCategories(row.category, filters.categories ?? []) &&
        (!filters.category || row.category === filters.category) &&
        (!filters.month || row.month === filters.month) &&
        (!scoped || categories.has(row.category)),
    );
    const records = selected.map((row) => ({
      评估版本: draft.name,
      评估月份: draft.month,
      粒度: '大类月份',
      大类: row.category,
      月份: row.month,
      月份用途: row.inventoryReference ? 'M+4库存参考' : '有效需求',
      统计基月: row.baseMonth,
      拆分前大类需求: row.sourceQuantity,
      有效大类需求: row.effectiveQuantity,
      基地SKU已知小计: row.knownQuantity,
      应算条数: row.expected,
      已算条数: row.computed,
      待补条数: row.missing,
      参与发货记录数: row.includedShipments,
      排除发货记录数: row.excludedShipments,
      状态: labels[row.status],
      首个断点原因: row.reason,
    }));
    const columns = [...Object.keys(records[0] ?? {}), '基地', '物料组', '产品编码'];
    const exportRows = () =>
      downloadCsv(`${draft.month}-需求计算核对.csv`, columns, [
        ...records,
        ...selected.flatMap((row, index) =>
          row.firstMissing.map((leaf) => ({
            ...records[index],
            粒度: '基地SKU首个缺项',
            基地: leaf.base,
            物料组: leaf.group,
            产品编码: leaf.code,
            状态: labels[leaf.stage],
            首个断点原因: leaf.reasons.join('；'),
          })),
        ),
      ]);
    return h(
      'details',
      {
        className: 'wf-disclosure',
        open,
        onToggle: (event) => {
          if (event.target === event.currentTarget) setOpen(event.currentTarget.open);
        },
      },
      h('summary', null, '有效需求计算核对'),
      h(
        'section',
        { 'aria-label': '有效需求计算核对' },
        h(
          'p',
          { className: 'wf-note' },
          `${selected.filter((row) => row.status === 'complete').length} / ${selected.length} 个大类月份完整可计算。大类按全国参与范围核对；基地和SKU筛选决定显示哪些大类。排除发货记录不计入应算条数，已知小计不代替完整合计。M+4仅作库存参考，模型预测不参与有效需求计算。`,
        ),
        table(
          '逐类月需求核对',
          [
            '大类',
            '月份',
            '统计基月',
            '拆分前大类需求',
            '有效大类需求',
            '基地SKU已算／应算',
            '待补条数',
            '参与／排除发货记录',
            '状态',
            '首个断点原因',
          ],
          selected.map((row) => [
            row.category,
            `${row.month}${row.inventoryReference ? ' 库存参考' : ''}`,
            row.baseMonth,
            format(row.sourceQuantity),
            format(row.effectiveQuantity),
            `${row.computed} / ${row.expected}`,
            row.missing,
            `${row.includedShipments} / ${row.excludedShipments}`,
            labels[row.status],
            row.reason || '无缺项',
          ]),
        ),
        h('button', { onClick: exportRows, disabled: !selected.length }, '下载需求计算核对'),
      ),
    );
  };
}
