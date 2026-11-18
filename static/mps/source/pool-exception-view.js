import { matchesCategories } from './category-filter.js';
import { useStepViewField } from './step-view-state.js';
import { previousFiscalYear } from 'dsh-agent-manage/mps-compute/workflow';

const kinds = {
  history: '历史有发货SKU',
  report: '销售提报SKU',
  other: '其他',
  total: '总异常清单',
};
const sources = {
  history: '历史发货',
  report: '销售提报',
  'opening-inventory': '期初库存',
  capacity: '产能',
  'product-list': '产品清单',
};
const columns = [
  '异常类别',
  '基地',
  'SKU',
  '月份或历史窗口',
  '原始值',
  '计算用值',
  '实际处理',
  '来源',
  '原因',
];
const value = (quantity) => (quantity === null ? '缺失或无效' : quantity);

export function createPoolExceptionReport(react, { downloadCsv }) {
  const h = react.createElement;
  return function PoolExceptionReport({ draft, result, filters, table, view }) {
    const [kind, setKind] = useStepViewField(react, view, 'poolExceptions.kind', 'total');
    const [page, setPage] = useStepViewField(react, view, 'poolExceptions.page', 0);
    const period = previousFiscalYear(draft.month);
    const records = (result.poolExceptions?.total ?? [])
      .filter(
        (row) =>
          (!filters.base || row.base === filters.base) &&
          (!filters.search || [row.base, row.code].some((text) => text.includes(filters.search))),
      )
      .map((row) => ({
        ...row,
        records: row.records.filter(
          (record) =>
            (!filters.category || record.category === filters.category) &&
            matchesCategories(record.category, filters.categories) &&
            (!filters.month || record.month === filters.month),
        ),
      }))
      .filter((row) => row.records.length);
    const groups = Object.fromEntries(
      ['history', 'report', 'other'].map((group) => [
        group,
        records.flatMap((row) => row.records.filter((record) => record.kind === group)),
      ]),
    );
    const detail = (row) => ({
      异常类别: kinds[row.kind],
      基地: row.base,
      SKU: row.code,
      月份或历史窗口: row.source === 'history' ? `${period.start}至${period.end}` : row.month,
      原始值: value(row.quantity),
      计算用值: '',
      实际处理: '保留来源，未加入产品范围',
      来源: sources[row.source],
      原因: row.reason,
    });
    const rows =
      kind === 'total'
        ? records.map((row) => ({
            异常类别: [...new Set(row.records.map((record) => kinds[record.kind]))].join('；'),
            基地: row.base,
            SKU: row.code,
            月份或历史窗口: [
              ...new Set(row.records.map((record) => detail(record).月份或历史窗口)),
            ].join('；'),
            原始值: row.records
              .map((record) => `${sources[record.source]}：${value(record.quantity)}`)
              .join('；'),
            计算用值: '',
            实际处理: '按基地SKU去重，保留全部来源，未加入产品范围',
            来源: [...new Set(row.records.map((record) => sources[record.source]))].join('；'),
            原因: [...new Set(row.records.map((record) => record.reason))].join('；'),
          }))
        : groups[kind].map(detail);
    const pageIndex = Math.min(page, Math.max(0, Math.ceil(rows.length / 25) - 1));
    return h(
      'section',
      { className: 'dc-card', 'aria-label': '产品范围与池外异常' },
      h(
        'div',
        { className: 'dc-card-head' },
        h('h3', null, '产品范围与池外异常'),
        h(
          'button',
          {
            disabled: !rows.length,
            onClick: () => downloadCsv(`${draft.month}-池外异常-${kinds[kind]}.csv`, columns, rows),
          },
          '下载当前池外异常明细',
        ),
      ),
      h(
        'p',
        { className: 'dc-card-note' },
        '产品清单的基地与SKU确定计算范围。仅用于替换历史的池外SKU不列异常；历史发货与销售提报分别保留来源，总清单按基地SKU去重。报告不自动停用有效需求。以下查看与下载使用相同筛选范围。',
      ),
      h(
        'div',
        { className: 'dc-toolbar' },
        Object.entries(kinds).map(([key, label]) =>
          h(
            'button',
            {
              key,
              'aria-pressed': kind === key,
              onClick: () => {
                setKind(key);
                setPage(0);
              },
            },
            `${label}（${key === 'total' ? records.length : groups[key].length}${key === 'total' ? '项' : '条'}）`,
          ),
        ),
      ),
      h(
        'p',
        { role: 'status', className: 'dc-card-note' },
        `当前查看${kinds[kind]}，共${rows.length}${kind === 'total' ? '项' : '条'}`,
      ),
      react.cloneElement(
        table(
          `${kinds[kind]}明细`,
          columns,
          rows
            .slice(pageIndex * 25, (pageIndex + 1) * 25)
            .map((row) => columns.map((column) => row[column])),
        ),
        { tabIndex: 0, role: 'region', 'aria-label': `${kinds[kind]}明细，可横向滚动` },
      ),
      rows.length > 25 &&
        h(
          'div',
          { className: 'dc-toolbar' },
          h(
            'button',
            { disabled: pageIndex === 0, onClick: () => setPage(pageIndex - 1) },
            '上一页池外异常',
          ),
          h('span', null, `第${pageIndex + 1}页，共${rows.length}条`),
          h(
            'button',
            {
              disabled: (pageIndex + 1) * 25 >= rows.length,
              onClick: () => setPage(pageIndex + 1),
            },
            '下一页池外异常',
          ),
        ),
    );
  };
}
