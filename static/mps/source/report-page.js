import { useStepViewField } from './step-view-state.js';

const pageSize = 25;

export function renderTablePagination(
  h,
  {
    label,
    page,
    total,
    onPageChange,
    rowsPerPage = pageSize,
    pageSizeLabel,
    onPageSizeChange,
    buttonLabels = [],
    disabled = false,
  },
) {
  if (!total && !onPageSizeChange) return null;
  const pages = Math.max(1, Math.ceil(total / rowsPerPage));
  const current = Math.min(page, pages - 1);
  return h(
    'nav',
    { className: 'mps-table-pagination', 'aria-label': `${label}分页` },
    onPageSizeChange &&
      h(
        'select',
        {
          'aria-label': pageSizeLabel,
          value: rowsPerPage,
          onChange: (event) => onPageSizeChange(Number(event.target.value)),
        },
        [10, 25, 50].map((size) => h('option', { key: size, value: size }, `每页${size}条`)),
      ),
    h('span', { role: 'status' }, total ? `第${current + 1}/${pages}页 · 共${total}条` : '共0条'),
    h(
      'button',
      {
        type: 'button',
        'aria-label': buttonLabels[0],
        disabled: disabled || current === 0,
        onClick: () => onPageChange(current - 1),
      },
      '上一页',
    ),
    h(
      'button',
      {
        type: 'button',
        'aria-label': buttonLabels[1],
        disabled: disabled || current === pages - 1,
        onClick: () => onPageChange(current + 1),
      },
      '下一页',
    ),
  );
}

export function createReportPage(react) {
  const h = react.createElement;
  return function ReportPage({ view, stateKey, label, rows, children }) {
    const [page, setPage] = useStepViewField(react, view, stateKey, 0);
    const lastPage = Math.max(0, Math.ceil(rows.length / pageSize) - 1);
    const currentPage = Math.min(page, lastPage);
    return h(
      react.Fragment,
      null,
      children(rows.slice(currentPage * pageSize, (currentPage + 1) * pageSize)),
      lastPage > 0 &&
        renderTablePagination(h, {
          label,
          page: currentPage,
          total: rows.length,
          onPageChange: setPage,
          buttonLabels: [`${label}上一页`, `${label}下一页`],
        }),
    );
  };
}
