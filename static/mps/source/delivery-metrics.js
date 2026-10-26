import { deliveryColumns } from './source-tables.js';

export function createDeliveryMetrics(react, { table, downloadCsv, useMpsPart }) {
  const h = react.createElement;
  const columns = ['月份', ...Object.values(deliveryColumns), '源记录数', '粒度状态'];
  return function DeliveryMetrics({ draft, update, sync, busy, error, active }) {
    const month = draft.deliveryMonth ?? draft.month;
    const [dimension, setDimension] = react.useState('');
    const [base, setBase] = react.useState('');
    const [page, setPage] = react.useState(0);
    const records = (draft.delivery ?? []).filter((row) => row['月份'] === month);
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
    react.useEffect(() => setPage(0), [month, dimension, base, draft.delivery]);
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
        rows: rows.slice(page * 25, (page + 1) * 25),
        rowCount: rows.length,
        truncated: rows.length > 25,
        aggregation: 'none',
        use: 'source-indicators-only; SKU mapping and historical calculation windows unconfirmed',
      },
      '基地多维发货指标',
      active,
    );
    return h(
      'section',
      { className: 'dc-card', 'aria-label': '基地多维发货指标' },
      h(
        'div',
        { className: 'dc-card-head' },
        h('h3', {}, '基地多维发货指标'),
        h(
          'span',
          { className: 'dc-status' },
          read?.status === 'ready' ? '业务来源' : read?.status === 'failed' ? '读取失败' : '待同步',
        ),
        h(
          'button',
          { disabled: !active || busy, onClick: () => sync('delivery') },
          busy ? '同步中…' : '同步发货指标',
        ),
      ),
      h(
        'div',
        { className: 'dc-source-body' },
        h(
          'div',
          { className: 'dc-toolbar' },
          h(
            'label',
            {},
            '指标月份',
            h('input', {
              type: 'month',
              'aria-label': '发货指标月份',
              value: month,
              onChange: (event) => {
                if (/^\d{4}-(0[1-9]|1[0-2])$/.test(event.target.value))
                  update({ deliveryMonth: event.target.value });
              },
            }),
          ),
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
              h('option', { value: '' }, '全部维度，分行核对'),
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
            'button',
            {
              disabled: !rows.length,
              onClick: () =>
                downloadCsv(
                  `基地多维发货-${month}.csv`,
                  [...columns, '读取状态'],
                  rows.map((row) => ({ ...row, 读取状态: read?.status ?? 'unread' })),
                ),
            },
            '下载当前指标',
          ),
        ),
        h(
          'p',
          { className: 'dc-muted' },
          '大类、系列、物料组、产品按源维度分别核对，不跨维度相加。同比、环比和月发货占财年比例直接展示源值，不替代SKU分摊占比；数量单位和比例换算待确认。',
        ),
        busy && h('p', { role: 'status' }, '正在读取发货指标…'),
        error && h('p', { role: 'alert' }, error),
        read?.status !== 'ready' &&
          rows.length > 0 &&
          h('p', {}, '下表保留上次读取证据，当前读取尚未成功，不能作为当前有效结果。'),
        !rows.length &&
          !busy &&
          h('p', { className: 'dc-empty' }, '当前月份尚无已读取指标，不能判定发货为零。'),
        h(
          'p',
          {},
          `当前筛选${rows.length}条，数量与比率不作跨行合计；重复键保留源记录数和粒度状态。`,
        ),
        table(columns, rows.slice(page * 25, (page + 1) * 25)),
        h(
          'div',
          { className: 'dc-pagination' },
          h('span', {}, `每页25条，第${page + 1}页`),
          h('button', { disabled: !page, onClick: () => setPage(page - 1) }, '上一页'),
          h(
            'button',
            { disabled: (page + 1) * 25 >= rows.length, onClick: () => setPage(page + 1) },
            '下一页',
          ),
        ),
      ),
    );
  };
}
