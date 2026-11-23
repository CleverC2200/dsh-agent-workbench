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
  return function ProductScopeReport({ result, selectedCategories = [] }) {
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
        { className: 'dc-card-head' },
        h('h3', null, '产品范围对账'),
        h(
          'button',
          {
            disabled: !rows.length,
            onClick: () => downloadCsv(`${scope.month}-产品范围对账.csv`, exportColumns, rows),
          },
          '下载产品范围对账CSV',
        ),
      ),
      h(
        'p',
        { className: 'dc-card-note' },
        `评估月${scope.month}，源统计期${scope.periods.join('、') || '未提供'}。源清单${scope.sourceRows}条，有效基地SKU ${scope.expectedCount}项，实际参与${scope.participatingCount}项。已覆盖${scope.coveredCount}项，主动排除${scope.excludedCount}项，遗漏${scope.missingCount}项，额外组合${scope.extraCount}项，冲突${scope.conflictCount}项，主数据缺项${scope.invalidCount}项。`,
      ),
      h(
        'p',
        { className: 'dc-card-note' },
        `实际参与范围：${scope.bases.join('、') || '无有效基地'}。${scope.coverageIssues.join('；')}。范围对账不替代全国完整性证明；已参与的组合仍可能有需求或主数据缺项。`,
      ),
      h(
        'div',
        { className: 'dc-toolbar' },
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
      ),
      h(
        'p',
        { className: 'dc-card-note', role: 'status' },
        `当前筛选${rows.length}项，页面与CSV使用相同筛选`,
      ),
      react.cloneElement(table(columns, rows.slice(pageIndex * 25, (pageIndex + 1) * 25)), {
        tabIndex: 0,
        role: 'region',
        'aria-label': '产品范围对账明细，可横向滚动',
      }),
      rows.length > 25 &&
        h(
          'div',
          { className: 'dc-toolbar' },
          h(
            'button',
            { disabled: pageIndex === 0, onClick: () => setPage(pageIndex - 1) },
            '上一页产品范围',
          ),
          h('span', null, `第${pageIndex + 1}页，共${rows.length}项`),
          h(
            'button',
            {
              disabled: (pageIndex + 1) * 25 >= rows.length,
              onClick: () => setPage(pageIndex + 1),
            },
            '下一页产品范围',
          ),
        ),
    );
  };
}
