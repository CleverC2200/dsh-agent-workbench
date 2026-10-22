import { call, ready } from '../../../business/shared/channel.js';
import { readRelations } from './relations.js';

const groups = [
  { key: 'sku', name: '单品与候选产线', source: '产品清单、产线SKU产能' },
  { key: 'lines', name: '产线与源系列', source: '隧道产能' },
  { key: 'transfers', name: '基地与调拨', source: '调拨方向、产品清单' },
];
const display = (value) =>
  value === null || value === undefined || value === '' ? '—' : String(value);
const status = (row) => [...row.missing, ...(row.pending ?? [])].join('、') || '待核对';
const columns = {
  sku: [
    '产品编码',
    '产品名称',
    '产品系列',
    '产品分类',
    '源物料名称',
    '源基地',
    '车间',
    '隧道号',
    '源系列',
    '组合系列',
    '源生产品类',
    '组合标准日产/件',
    '组合标准日产/吨',
    '核对状态',
  ],
  lines: [
    '源基地',
    '生产单位',
    '隧道号',
    '隧道吨位',
    '隧道类型',
    '源生产品类',
    '源系列',
    '组合标准日产/件',
    '组合标准日产/吨',
    '核对状态',
  ],
  transfers: [
    '源统计期',
    '物料编码',
    '物料名称',
    '源系列',
    '目标基地',
    '调拨品标签',
    '调拨方向',
    '源SAP品类',
    '源老大类',
    '源生产品类',
    '核对状态',
  ],
};
function cells(kind, row) {
  const source = row.source ?? row.capacity ?? {},
    product = row.product ?? {};
  if (kind === 'sku')
    return [
      product.material_code ?? source.material_code,
      product.material_name,
      product.series,
      product.sub_category,
      source.material_name,
      source.belong_base,
      source.workshop,
      source.tunnel_no,
      source.series,
      source.combined_series,
      source.production_category,
      source.standard_daily_output_pc,
      source.standard_daily_output_ton,
      status(row),
    ];
  if (kind === 'lines')
    return [
      source.belong_base,
      source.production_unit,
      source.tunnel_no,
      source.tunnel_tonnage,
      source.tunnel_type,
      source.production_category,
      source.series,
      source.standard_daily_output_pc,
      source.standard_daily_output_ton,
      status(row),
    ];
  return [
    source.stat_period,
    source.material_code,
    source.material_name,
    source.series,
    source.target_base,
    source.transfer_tag,
    source.transfer_direction,
    source.sap_category,
    source.old_category,
    source.production_category,
    status(row),
  ];
}
export function createRelations(react, useMpsPart) {
  const h = react.createElement;
  return function Relations({ scope, onResult }) {
    const [kind, setKind] = react.useState('sku');
    const [search, setSearch] = react.useState('');
    const [onlyMissing, setOnlyMissing] = react.useState(false);
    const [page, setPage] = react.useState(0);
    const [attempt, setAttempt] = react.useState(0);
    const [loaded, setLoaded] = react.useState({});
    const scopeKey = JSON.stringify([scope?.id, scope?.month, scope?.generation]);
    const state = loaded.scopeKey === scopeKey ? loaded : { busy: true };
    react.useEffect(() => {
      onResult?.({ ...state, scopeKey });
    }, [loaded, scopeKey, onResult]);
    react.useEffect(() => {
      if (!scope?.month) return;
      const controller = new AbortController();
      setLoaded({ scopeKey, busy: true });
      const invalidate = () => {
        controller.abort();
        setLoaded({ scopeKey, error: '读取范围已变更，请重新打开当前步骤' });
      };
      const events = ['gea-session-changing', 'gea-identity-changed', 'pagehide'];
      events.forEach((event) => window.addEventListener(event, invalidate));
      void (async () => {
        await ready;
        controller.signal.throwIfAborted();
        const element = document.getElementById('agent-sql-config');
        if (!element) throw Error('月主计划数据源尚未装载，请重新打开页面');
        return readRelations(
          JSON.parse(element.textContent),
          (_request, options) =>
            call(
              'sql',
              { queryId: options.queryId, parameters: options.values },
              { signal: options.signal },
            ),
          scope.month,
          controller.signal,
        );
      })().then(
        (result) => {
          if (!controller.signal.aborted) setLoaded({ ...result, scopeKey });
        },
        (error) => {
          if (!controller.signal.aborted) {
            setLoaded({ scopeKey, error: error.message });
            controller.abort();
          }
        },
      );
      return () => {
        controller.abort();
        events.forEach((event) => window.removeEventListener(event, invalidate));
      };
    }, [scopeKey, attempt]);
    const records = state.records?.[kind] ?? [];
    const filtered = react.useMemo(
      () =>
        records.filter(
          (row) =>
            (!onlyMissing || row.missing.length > 0 || row.pending?.length > 0) &&
            (!search || cells(kind, row).some((value) => display(value).includes(search))),
        ),
      [records, kind, onlyMissing, search],
    );
    const pageIndex = Math.min(page, Math.max(0, Math.ceil(filtered.length / 25) - 1));
    const visible = filtered.slice(pageIndex * 25, (pageIndex + 1) * 25);
    const selected = groups.find((group) => group.key === kind);
    useMpsPart(
      react,
      'masterdata',
      {
        evaluation: scope,
        status: state.busy ? 'loading' : state.error ? 'failed' : 'loaded',
        error: state.error,
        sources: groups.map((group) => ({
          source: group.source,
          records: state.records?.[group.key].length ?? null,
        })),
        source: selected.source,
        configVersion: state.configVersion,
        filter: { search, onlyMissing, kind },
        total: records.length,
        filteredTotal: filtered.length,
        page: pageIndex + 1,
        rows: visible,
      },
      '主数据对应关系',
    );
    return h(
      'section',
      { className: 'mps-relations', 'aria-label': '主数据关系核对' },
      h(
        'div',
        { className: 'mps-relations-scope' },
        h('strong', null, scope ? `${scope.name} · ${scope.month}` : '等待评估范围'),
        h('span', null, '授权源记录 · 只读核对'),
        h(
          'button',
          { type: 'button', disabled: state.busy, onClick: () => setAttempt((value) => value + 1) },
          '重新读取',
        ),
      ),
      h(
        'div',
        { className: 'ap-grid-3 mps-relation-groups', role: 'tablist', 'aria-label': '关系分组' },
        groups.map((group) => {
          const rows = state.records?.[group.key];
          const missing = rows?.filter((row) => row.missing.length || row.pending?.length).length;
          return h(
            'button',
            {
              key: group.key,
              role: 'tab',
              type: 'button',
              className: 'ap-board-card ap-source-card',
              'aria-selected': kind === group.key,
              onClick: () => {
                setKind(group.key);
                setPage(0);
              },
            },
            h(
              'span',
              { className: 'ap-card-head' },
              h('strong', null, group.name),
              h('span', null, rows ? `${rows.length}条` : state.error ? '读取失败' : '读取中'),
            ),
            h(
              'span',
              { className: 'ap-card-body' },
              h('span', null, group.source),
              h('span', null, rows ? `缺项或待确认 ${missing}条` : '—'),
            ),
          );
        }),
      ),
      h(
        'section',
        { className: 'ap-board-card', 'aria-label': selected.name },
        h(
          'div',
          { className: 'ap-card-head mps-relations-tools' },
          h('h3', null, selected.name),
          h('input', {
            type: 'search',
            'aria-label': '搜索关系记录',
            placeholder: '搜索编码、名称、源字段',
            value: search,
            onChange: (event) => {
              setSearch(event.target.value);
              setPage(0);
            },
          }),
          h(
            'label',
            null,
            h('input', {
              type: 'checkbox',
              checked: onlyMissing,
              onChange: (event) => {
                setOnlyMissing(event.target.checked);
                setPage(0);
              },
            }),
            '仅缺项或待确认',
          ),
        ),
        state.error
          ? h('div', { className: 'ap-card-body', role: 'alert' }, state.error)
          : state.busy
            ? h('div', { className: 'ap-card-body', role: 'status' }, '正在完整读取关系源记录…')
            : h(
                react.Fragment,
                null,
                h(
                  'div',
                  { className: 'ap-table-wrap' },
                  h(
                    'table',
                    { className: 'ap-table mps-relations-table' },
                    h(
                      'thead',
                      null,
                      h(
                        'tr',
                        null,
                        columns[kind].map((column) =>
                          h('th', { key: column, scope: 'col' }, column),
                        ),
                      ),
                    ),
                    h(
                      'tbody',
                      null,
                      visible.map((row, index) =>
                        h(
                          'tr',
                          { key: pageIndex * 25 + index },
                          cells(kind, row).map((value, cell) =>
                            h('td', { key: cell }, display(value)),
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
                !filtered.length &&
                  h(
                    'p',
                    { className: 'ap-card-body', role: 'status' },
                    records.length ? '没有符合筛选的关系记录' : '源数据为空',
                  ),
                h(
                  'div',
                  { className: 'mps-relations-pagination' },
                  h(
                    'span',
                    null,
                    `${selected.source} · 共${records.length}条 · 筛选${filtered.length}条 · 第${pageIndex + 1}/${Math.max(1, Math.ceil(filtered.length / 25))}页`,
                  ),
                  h(
                    'button',
                    {
                      type: 'button',
                      disabled: pageIndex === 0,
                      onClick: () => setPage(pageIndex - 1),
                    },
                    '上一页',
                  ),
                  h(
                    'button',
                    {
                      type: 'button',
                      disabled: (pageIndex + 1) * 25 >= filtered.length,
                      onClick: () => setPage(pageIndex + 1),
                    },
                    '下一页',
                  ),
                ),
              ),
      ),
    );
  };
}
