import { readMasterPage, sourceNames } from './master-data.js';
const labels = {
  belong_base: '基地',
  sub_category: '大类',
  old_category: '老大类',
  series: '系列',
  product_item: '物料组',
  product_item_name: '物料组名称',
  material_code: '物料编码',
  material_name: '物料名称',
  responsible_item: '产品标签',
  replacement_product: '替换品',
  replacement_material_code: '替换物料编码',
  stat_month: '源月份',
  demand_qty: '需求数量（源单位）',
  production_unit: '生产单位',
  tunnel_no: '隧道号',
  tunnel_tonnage: '隧道吨位',
  tunnel_type: '隧道类型',
  production_category: '生产品类',
  standard_daily_output_pc: '组合标准日产/件',
  standard_daily_output_ton: '组合标准日产/吨',
  workshop: '车间',
  combined_series: '组合系列',
  stat_period: '统计期',
  sap_category: 'SAP品类',
  target_base: '目标基地',
  transfer_tag: '调拨品标签',
  transfer_direction: '调拨方向',
  update_time: '更新时间',
  source_rows: '源记录数',
};
export function createMasterData(react, { Dialog, table, downloadCsv, useMpsPart }) {
  const h = react.createElement;
  return function MasterData({ month, close }) {
    const [kind, setKind] = react.useState('products');
    const [page, setPage] = react.useState(0);
    const [attempt, setAttempt] = react.useState(0);
    const scope = JSON.stringify([kind, month, page]);
    const [loaded, setState] = react.useState({});
    const state = loaded.scope === scope ? loaded : { busy: true };
    react.useEffect(() => {
      const controller = new AbortController();
      setState({ scope, busy: true });
      readMasterPage(kind, month, page, controller.signal).then(
        (result) => {
          if (!controller.signal.aborted) setState({ ...result, scope });
        },
        (error) => {
          if (!controller.signal.aborted) setState({ error: error.message, scope });
        },
      );
      return () => controller.abort();
    }, [kind, month, page, attempt]);
    const columns = state.columns?.map((column) => labels[column] ?? column) ?? [];
    const rows =
      state.rows?.map((row) =>
        Object.fromEntries(state.columns.map((column, index) => [columns[index], row[column]])),
      ) ?? [];
    useMpsPart(
      react,
      'master-data',
      {
        source: sourceNames[kind],
        month,
        page: page + 1,
        status: state.busy ? 'loading' : state.error ? 'failed' : 'loaded',
        error: state.error,
        total: state.total,
        rows: state.rows ?? [],
      },
      '月主计划数据源',
    );
    return h(
      Dialog,
      {
        title: '月主计划数据源',
        className: 'dc-master-dialog',
        close,
        footer: h(
          'button',
          {
            disabled: !rows.length,
            onClick: () =>
              downloadCsv(`${sourceNames[kind]}-${month}-第${page + 1}页.csv`, columns, rows),
          },
          '下载当前页',
        ),
      },
      h(
        'div',
        { className: 'dc-master-tabs', role: 'tablist', 'aria-label': '主数据表' },
        Object.entries(sourceNames).map(([key, name]) =>
          h(
            'button',
            {
              key,
              role: 'tab',
              'aria-selected': key === kind,
              onClick: () => {
                setKind(key);
                setPage(0);
              },
            },
            name,
          ),
        ),
      ),
      (kind === 'annual' || kind === 'transfers') && h('p', {}, `统计月 ${month}`),
      state.busy && h('p', { role: 'status' }, '正在读取…'),
      state.error && h('p', { role: 'alert' }, state.error),
      state.rows && table(columns, rows),
      h(
        'div',
        { className: 'dc-pagination' },
        state.rows && h('span', {}, `共${state.total}条，第${page + 1}页`),
        h('button', { disabled: state.busy, onClick: () => setAttempt(attempt + 1) }, '刷新'),
        h('button', { disabled: state.busy || !page, onClick: () => setPage(page - 1) }, '上一页'),
        h(
          'button',
          {
            disabled: state.busy || !state.rows || (page + 1) * 25 >= state.total,
            onClick: () => setPage(page + 1),
          },
          '下一页',
        ),
      ),
    );
  };
}
