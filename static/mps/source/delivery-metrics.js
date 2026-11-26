import { renderTablePagination } from './report-page.js';
import { createDimensionCategoryMatcher } from './category-filter.js';
import { deliveryColumns } from './source-tables.js';
import { growthSourceAnomalies } from './growth-anomaly-report.js';
import { createMonthPicker } from './month-picker.js';

export function createDeliveryMetrics(react, { table, downloadCsv, useMpsPart }) {
  const h = react.createElement;
  const MonthPicker = createMonthPicker(react);
  const columns = ['月份', ...Object.values(deliveryColumns), '源记录数', '粒度状态'];
  return function DeliveryMetrics({
    draft,
    update,
    sync,
    busy,
    error,
    active,
    selectedCategories = [],
  }) {
    const month = draft.deliveryMonth ?? draft.month;
    const [dimension, setDimension] = react.useState('');
    const [base, setBase] = react.useState('');
    const [page, setPage] = react.useState(0);
    const [pageSize, setPageSize] = react.useState(10);
    const matchesDimension = react.useMemo(
      () => createDimensionCategoryMatcher(draft.products, selectedCategories),
      [draft.products, selectedCategories],
    );
    const records = (draft.delivery ?? []).filter(
      (row) => row['月份'] === month && matchesDimension(row),
    );
    const types = [...new Set(records.map((row) => row['维度类型']).filter(Boolean))];
    const bases = [...new Set(records.map((row) => row['基地']).filter(Boolean))];
    const selectedType = types.includes(dimension) ? dimension : '';
    const selectedBase = bases.includes(base) ? base : '';
    const rows = records.filter(
      (row) =>
        (!selectedType || row['维度类型'] === selectedType) &&
        (!selectedBase || row['基地'] === selectedBase),
    );
    const read = draft.deliveryRead?.periods?.[month];
    react.useEffect(
      () => setPage(0),
      [month, dimension, base, draft.delivery, pageSize, selectedCategories],
    );
    useMpsPart(
      react,
      'delivery',
      {
        month,
        dimension: selectedType,
        base: selectedBase,
        read: read ?? null,
        source: 'agents_scm_base_dimension_delivery_mi',
        units: 'unconfirmed',
        rows: rows.slice(page * pageSize, (page + 1) * pageSize),
        rowCount: rows.length,
        truncated: rows.length > pageSize,
        aggregation: 'none',
        use: 'source-indicators-only; SKU mapping and historical calculation windows unconfirmed',
      },
      '基地多维发货指标',
      active,
    );
    return h(
      'section',
      { 'aria-label': '基地多维发货指标' },
      h(
        'details',
        { className: 'dc-card dc-delivery-metrics mps-report-details' },
        h(
          'summary',
          null,
          '基地多维发货指标',
          read?.status === 'failed' && h('span', { className: 'dc-status' }, '读取失败'),
        ),
        h(
          'div',
          { className: 'dc-toolbar dc-report-filters mps-disclosure-toolbar' },
          h(MonthPicker, {
            label: '发货指标月份',
            name: 'deliveryMonth',
            value: month,
            onChange: (month) => update({ deliveryMonth: month }),
          }),
          h(
            'label',
            {},
            '维度类型',
            h(
              'select',
              {
                'aria-label': '发货指标维度',
                value: selectedType,
                onChange: (event) => setDimension(event.target.value),
              },
              h('option', { value: '' }, '全部维度'),
              ...types.map((name) => h('option', { key: name, value: name }, name)),
            ),
          ),
          h(
            'label',
            {},
            '基地',
            h(
              'select',
              {
                'aria-label': '发货指标基地',
                value: selectedBase,
                onChange: (event) => setBase(event.target.value),
              },
              h('option', { value: '' }, '全部基地'),
              ...bases.map((name) => h('option', { key: name, value: name }, name)),
            ),
          ),
          h(
            'div',
            { className: 'mps-report-actions' },
            h(
              'button',
              { disabled: !active || busy, onClick: () => sync('delivery') },
              busy ? '同步中…' : '同步发货指标',
            ),
            h(
              'button',
              {
                className: 'mps-download',
                disabled: !rows.length,
                onClick: () =>
                  downloadCsv(
                    `基地多维发货-${month}.csv`,
                    [...columns, '增幅异常', '读取状态'],
                    rows.map((row) => ({
                      ...row,
                      增幅异常: growthSourceAnomalies([row])
                        .map(({ metric, reason }) => `${metric}：${reason}`)
                        .join('；'),
                      读取状态: read?.status ?? 'unread',
                    })),
                  ),
              },
              '下载当前指标',
            ),
          ),
        ),
        error && h('p', { role: 'alert', className: 'dc-report-message' }, error),
        read?.status !== 'ready' &&
          rows.length > 0 &&
          h('p', { role: 'status', className: 'dc-report-message' }, '当前显示上次读取的指标'),
        !rows.length &&
          !busy &&
          !error &&
          h(
            'p',
            { className: 'dc-report-message' },
            records.length ? '没有匹配的发货指标' : '暂无发货指标',
          ),
        table(columns, rows.slice(page * pageSize, (page + 1) * pageSize)),
        rows.length > 0 &&
          renderTablePagination(h, {
            label: '基地多维发货指标',
            page,
            total: rows.length,
            rowsPerPage: pageSize,
            onPageChange: setPage,
            pageSizeLabel: '每页发货指标条数',
            onPageSizeChange: setPageSize,
          }),
      ),
    );
  };
}
