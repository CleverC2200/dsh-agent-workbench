import { renderTablePagination } from './report-page.js';
import { matchesCategories } from './category-filter.js';

const columns = [
  '基地',
  'SKU',
  '大类',
  '物料组',
  '源统计期',
  '源明细条数',
  '源清单有效组合',
  '实际参与',
  '对账结果',
  '缺项或处理原因',
];
const exportColumns = [
  '评估月份',
  '产品统计期',
  '目标产品统计期',
  '实际采用月份',
  '覆盖声明',
  '实际参与基地',
  '清单来源',
  '源清单条数',
  '有效基地SKU数',
  '实际参与组合数',
  '缺少的覆盖证明',
  ...columns,
];

export function createProductScopeReport(react, { table, downloadCsv }) {
  const h = react.createElement;
  return function ProductScopeReport({ result, productReadFailed, selectedCategories = [] }) {
    const [base, setBase] = react.useState('');
    const [search, setSearch] = react.useState('');
    const [onlyIssues, setOnlyIssues] = react.useState(false);
    const [page, setPage] = react.useState(0);
    const scope = result.productScope;
    const records = scope.rows.filter(
      (row) =>
        (!base || row.base === base) &&
        (!search || [row.base, row.code, ...row.groups].some((value) => value.includes(search))) &&
        (!onlyIssues || row.status !== '已覆盖' || row.issues.length) &&
        (!row.categories.length ||
          row.categories.some((category) => matchesCategories(category, selectedCategories))),
    );
    const rows = records.map((row) => ({
      评估月份: scope.month,
      产品统计期: scope.productMonth,
      目标产品统计期: scope.productTargetMonth,
      实际采用月份: scope.productMonth,
      覆盖声明: '实际参与范围',
      实际参与基地: scope.bases.join('；'),
      清单来源: scope.source,
      源清单条数: scope.sourceRows,
      有效基地SKU数: scope.expectedCount,
      实际参与组合数: scope.participatingCount,
      缺少的覆盖证明: scope.coverageIssues.join('；'),
      基地: row.base,
      SKU: row.code,
      大类: row.categories.join('；'),
      物料组: row.groups.join('；'),
      源统计期: row.periods.join('；'),
      源明细条数: row.sourceRows,
      源清单有效组合: row.expected ? '是' : '否',
      实际参与: row.participating ? '是' : '否',
      对账结果: row.status,
      缺项或处理原因: row.issues.join('；'),
    }));
    const pageIndex = Math.min(page, Math.max(0, Math.ceil(rows.length / 25) - 1));
    const change = (setter, value) => {
      setter(value);
      setPage(0);
    };
    return h(
      'section',
      { className: 'dc-card', 'aria-label': '产品范围对账' },
      h(
        'div',
        { className: 'dc-card-head mps-report-heading mps-table-heading' },
        h('h3', null, '产品范围对账'),
        h(
          'div',
          { className: 'dc-toolbar dc-report-filters dc-product-scope-filters' },
          h(
            'label',
            null,
            '对账基地',
            h(
              'select',
              {
                'aria-label': '对账基地',
                value: base,
                onChange: (event) => change(setBase, event.target.value),
              },
              h('option', { value: '' }, '全部实际基地'),
              [...new Set(scope.rows.map((row) => row.base).filter(Boolean))].map((value) =>
                h('option', { key: value, value }, value),
              ),
            ),
          ),
          h('input', {
            type: 'search',
            'aria-label': '搜索对账基地或SKU',
            placeholder: '搜索基地、SKU或物料组',
            value: search,
            onChange: (event) => change(setSearch, event.target.value),
          }),
          h(
            'label',
            null,
            h('input', {
              type: 'checkbox',
              checked: onlyIssues,
              onChange: (event) => change(setOnlyIssues, event.target.checked),
            }),
            '仅看范围或主数据问题',
          ),
          scope.productMonth &&
            scope.productMonth !== scope.productTargetMonth &&
            h(
              'span',
              null,
              `产品清单采用 ${scope.productMonth}（目标 ${scope.productTargetMonth}）`,
            ),
        ),
        h(
          'button',
          {
            className: 'mps-download',
            disabled: !rows.length,
            onClick: () => downloadCsv(`${scope.month}-产品范围对账.csv`, exportColumns, rows),
          },
          '下载产品范围对账CSV',
        ),
      ),

      productReadFailed && h('p', { role: 'alert' }, '产品清单读取失败'),
      react.cloneElement(table(columns, rows.slice(pageIndex * 25, (pageIndex + 1) * 25)), {
        tabIndex: 0,
        role: 'region',
        'aria-label': '产品范围对账明细，可横向滚动',
      }),
      rows.length > 25 &&
        renderTablePagination(h, {
          label: '产品范围对账',
          page: pageIndex,
          total: rows.length,
          onPageChange: setPage,
          buttonLabels: ['上一页产品范围', '下一页产品范围'],
        }),
    );
  };
}
