import { readMasterPage, resolveProductPeriod, sourceNames } from './master-data.js';
import { canonicalBaseName } from './relations.js';
const labels = {
  belong_base: '基地',
  sub_category: '大类',
  old_category: '老大类',
  series: '系列',
  product_item: '物料组',
  product_item_name: '物料组名称',
  material_code: '物料编码',
  material_name: '物料名称',
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
  return function MasterData({
    month,
    productMonth = month,
    productPeriod,
    close,
    demandOnly = false,
  }) {
    const [kind, setKind] = react.useState('products');
    const [page, setPage] = react.useState(0);
    const [attempt, setAttempt] = react.useState(0);
    const preview = !productPeriod || productPeriod.targetMonth !== productMonth;
    const productScope = JSON.stringify([productMonth, productPeriod]);
    const pinned = react.useRef(null);
    const scope = JSON.stringify([kind, kind === 'products' ? productScope : month, page]);
    const [loaded, setState] = react.useState({});
    const state = loaded.scope === scope ? loaded : { busy: true };
    react.useEffect(() => {
      const controller = new AbortController();
      setState({ scope, busy: true });
      const load = async () => {
        if (kind !== 'products')
          return {
            ...(await readMasterPage(kind, month, page, controller.signal)),
            sourceMonth: month,
          };
        let period = pinned.current?.scope === productScope ? pinned.current.period : null;
        if (!period) {
          period = preview
            ? await resolveProductPeriod(productMonth, controller.signal)
            : productPeriod;
          if (controller.signal.aborted) return;
          pinned.current = { scope: productScope, period };
        }
        if (period.adoptedMonth === null)
          return { rows: [], total: 0, columns: [], sourceMonth: null };
        const result = await readMasterPage(
          'products',
          period.adoptedMonth,
          page,
          controller.signal,
          { configVersion: period.configVersion },
        );
        if (!controller.signal.aborted)
          pinned.current = {
            scope: productScope,
            period: { ...period, configVersion: result.configVersion },
          };
        return { ...result, sourceMonth: period.adoptedMonth };
      };
      load().then(
        (result) => {
          if (!controller.signal.aborted) setState({ ...result, scope });
        },
        (error) => {
          if (!controller.signal.aborted) setState({ error: error.message, scope });
        },
      );
      return () => controller.abort();
    }, [kind, productScope, month, page, attempt]);
    const sourceMonth = kind === 'products' ? state.sourceMonth : month;
    const columnLabels =
      kind === 'products'
        ? { ...labels, sub_category: '源大类', responsible_item: '大类' }
        : labels;
    const sourceColumns = (state.columns ?? []).filter(
      (column) => !demandOnly || column !== 'transfer_tag',
    );
    const sourceRows = (state.rows ?? []).filter(
      (row) => !demandOnly || canonicalBaseName(row.target_base ?? row.belong_base) !== 'ODM',
    );
    const columns = sourceColumns.map((column) => columnLabels[column] ?? column);
    const rows = sourceRows.map((row) =>
      Object.fromEntries(sourceColumns.map((column, index) => [columns[index], row[column]])),
    );
    useMpsPart(
      react,
      'master-data',
      {
        source: sourceNames[kind],
        month: sourceMonth,
        ...(kind === 'products'
          ? { targetMonth: productMonth, adoptedMonth: sourceMonth, preview }
          : {}),
        page: page + 1,
        status: state.busy ? 'loading' : state.error ? 'failed' : 'loaded',
        error: state.error,
        total: state.total,
        rows: sourceRows.map((row) =>
          Object.fromEntries(sourceColumns.map((column) => [column, row[column]])),
        ),
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
              downloadCsv(`${sourceNames[kind]}-${sourceMonth}-第${page + 1}页.csv`, columns, rows),
          },
          '下载当前页',
        ),
      },
      h(
        'div',
        { className: 'dc-master-tabs', role: 'tablist', 'aria-label': '主数据表' },
        Object.entries(sourceNames)
          .filter(([key]) => !demandOnly || ['products', 'annual'].includes(key))
          .map(([key, name]) =>
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
      kind === 'products' &&
        h(
          'p',
          {},
          preview
            ? `预览目标 ${productMonth}，评估已采用 ${productPeriod?.adoptedMonth ?? '未同步'}`
            : `评估目标 ${productPeriod.targetMonth}，实际采用 ${productPeriod.adoptedMonth ?? '无可用产品清单'}`,
        ),
      ['products', 'annual', 'transfers'].includes(kind) &&
        sourceMonth &&
        h('p', {}, `统计月 ${sourceMonth}`),
      kind === 'products' &&
        !state.busy &&
        !state.error &&
        sourceMonth === null &&
        h('p', { role: 'status' }, '无可用产品清单'),
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
