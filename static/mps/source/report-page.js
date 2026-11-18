import { useStepViewField } from './step-view-state.js';

const pageSize = 25;

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
        h(
          'div',
          { className: 'dc-toolbar' },
          h(
            'button',
            {
              'aria-label': `${label}上一页`,
              disabled: currentPage === 0,
              onClick: () => setPage(currentPage - 1),
            },
            '上一页',
          ),
          h(
            'span',
            { role: 'status' },
            `第${currentPage + 1}/${lastPage + 1}页，共${rows.length}条`,
          ),
          h(
            'button',
            {
              'aria-label': `${label}下一页`,
              disabled: currentPage === lastPage,
              onClick: () => setPage(currentPage + 1),
            },
            '下一页',
          ),
        ),
    );
  };
}
