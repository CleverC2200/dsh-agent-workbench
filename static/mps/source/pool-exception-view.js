import { renderTablePagination } from './report-page.js';
import { matchesCategories } from './category-filter.js';
import { useStepViewField } from './step-view-state.js';
import { previousFiscalYear } from 'dsh-agent-manage/mps-compute/workflow';
import { canonicalBaseName, latestTransferSnapshot } from './relations.js';

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

export function poolSubmissionRows(exceptions, products, relations, categories) {
  const tags = Map.groupBy(
    [...(products ?? []), ...latestTransferSnapshot(relations?.sources?.transfers ?? []).rows],
    (row) => JSON.stringify([canonicalBaseName(row.target_base), row.material_code?.trim()]),
  );
  return (exceptions?.report ?? [])
    .filter(
      (row) =>
        matchesCategories(row.category || row.sourceCategory, categories) &&
        !(tags.get(JSON.stringify([row.base, row.code])) ?? []).some((source) =>
          ['新品', '下市品'].includes(source.transfer_tag?.trim()),
        ),
    )
    .map((row) => ({
      基地: row.base,
      SKU: row.code,
      大类: row.category || row.sourceCategory,
      月份: row.month,
      销售提报量: row.quantity,
      原因: row.reason,
    }));
}

export function createPoolExceptionReport(react, { downloadCsv }) {
  const h = react.createElement;
  return function PoolExceptionReport({
    draft,
    result,
    filters,
    table,
    view,
    collapsible = false,
  }) {
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
    const title = '产品范围与池外异常';
    const download = h(
      'button',
      {
        className: 'mps-download',
        disabled: !rows.length,
        onClick: () => downloadCsv(`${draft.month}-池外异常-${kinds[kind]}.csv`, columns, rows),
      },
      '下载当前池外异常明细',
    );
    const content = [
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
        renderTablePagination(h, {
          label: '池外异常',
          page: pageIndex,
          total: rows.length,
          onPageChange: setPage,
          buttonLabels: ['上一页池外异常', '下一页池外异常'],
        }),
    ];
    return h(
      'section',
      { className: 'dc-card', 'aria-label': title },
      collapsible
        ? h(
            'details',
            { className: 'wf-exception-report mps-report-details', open: true },
            h('summary', null, title),
            download,
            ...content,
          )
        : h(
            react.Fragment,
            null,
            h(
              'div',
              { className: 'dc-card-head mps-report-heading' },
              h('h3', null, title),
              download,
            ),
            ...content,
          ),
    );
  };
}
