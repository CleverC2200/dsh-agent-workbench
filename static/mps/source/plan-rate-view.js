import { ready } from '../../../business/shared/channel.js';
import { hasMpsSource } from './master-data.js';
import { readSourceTable } from './source-tables.js';

export function createPlanRates(react, { Dialog, table, downloadCsv }) {
  const h = react.createElement;
  const columns = [
    '月份',
    '维度类型',
    '基地',
    '大类',
    '物料组编码',
    '产品编码',
    '产品名称',
    '当前维度计划量',
    '父级计划量',
    '计划占比',
  ];
  return function PlanRates({ draft, update, active, workflow }) {
    const [preview, setPreview] = react.useState(false);
    const [dimension, setDimension] = react.useState('大类+物料组');
    const [page, setPage] = react.useState(0);
    const controller = react.useRef(null);
    const state = draft.planRatesRead;
    const current = state?.status === 'ready' && state.month === draft.month;
    const rows = current ? planRatePreviewRows(workflow) : [];
    const selected = rows.filter((row) => row['维度类型'] === dimension);
    const pageIndex = Math.min(page, Math.max(0, Math.ceil(selected.length / 25) - 1));
    const busy = state?.status === 'loading';
    const load = async () => {
      controller.current?.abort();
      const stop = new AbortController();
      controller.current = stop;
      update({ planRatesRead: { status: 'loading', month: draft.month } });
      try {
        const result = await readSourceTable('plan-rate', draft.month, stop.signal);
        if (!stop.signal.aborted)
          update({
            planRates: result.rows,
            planRatesRead: { status: 'ready', month: draft.month },
          });
      } catch (error) {
        if (!stop.signal.aborted)
          update({ planRatesRead: { status: 'failed', month: draft.month, error: error.message } });
      }
    };
    react.useEffect(() => {
      let current = true;
      if (active && hasMpsSource())
        ready.then(() => {
          if (current) void load();
        });
      return () => {
        current = false;
        controller.current?.abort();
      };
    }, [active, draft.month]);
    const display = (row) => ({
      ...row,
      计划占比:
        row['计划占比'] === ''
          ? ''
          : new Intl.NumberFormat('zh-CN', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            }).format(Number(row['计划占比']) * 100) + '%',
    });
    return h(
      'section',
      { className: 'dc-card dc-parameter', 'aria-label': '销售提报占比' },
      h(
        'div',
        { className: 'dc-card-head' },
        h('h3', {}, '销售提报占比'),
        h(
          'span',
          { className: 'dc-status' },
          busy
            ? '读取中…'
            : current
              ? `${draft.planRates?.length ?? 0} 条源记录 · ${rows.length} 条对应结果`
              : '待同步原值',
        ),
      ),
      h(
        'div',
        { className: 'dc-source-body' },
        h(
          'p',
          {},
          '自然月当月及后两月，取销售提报allnum；按当前产品明细的物料编码、物料组编码重新汇总。物料组占大类、产品占物料组、基地产品占范围内同SKU；池外记录不混入分母。',
        ),
        state?.error && h('p', { role: 'alert' }, state.error),
      ),
      h(
        'div',
        { className: 'dc-source-actions' },
        h(
          'button',
          { disabled: !active || !hasMpsSource() || busy, onClick: load },
          '同步销售提报占比',
        ),
        h(
          'button',
          {
            disabled: !rows.length,
            onClick: () => {
              setPreview(true);
              setPage(0);
            },
          },
          '预览',
        ),
      ),
      preview &&
        h(
          Dialog,
          {
            title: '销售提报占比 · 当前物料组核对',
            className: 'dc-source-detail',
            close: () => setPreview(false),
            footer: h(
              'button',
              {
                disabled: !rows.length,
                onClick: () => downloadCsv(`销售提报占比-${draft.month}.csv`, columns, rows),
              },
              '下载源值',
            ),
          },
          h(
            'label',
            {},
            '维度',
            h(
              'select',
              {
                'aria-label': '计划占比维度',
                value: dimension,
                onChange: (event) => {
                  setDimension(event.target.value);
                  setPage(0);
                },
              },
              ...['大类+物料组', '物料组+产品', '基地+产品'].map((value) =>
                h('option', { value, key: value }, value),
              ),
            ),
          ),
          table(columns, selected.slice(pageIndex * 25, (pageIndex + 1) * 25).map(display)),
          !selected.length && h('p', {}, '当前月份和维度没有源记录。'),
          h(
            'div',
            { className: 'dc-pagination' },
            h('span', {}, `共${selected.length}条，第${pageIndex + 1}页`),
            h('button', { disabled: !pageIndex, onClick: () => setPage(pageIndex - 1) }, '上一页'),
            h(
              'button',
              {
                disabled: (pageIndex + 1) * 25 >= selected.length,
                onClick: () => setPage(pageIndex + 1),
              },
              '下一页',
            ),
          ),
        ),
    );
  };
}

export function planRatePreviewRows(workflow) {
  const rows = new Map();
  for (const row of workflow?.rows ?? []) {
    if (!workflow.months.slice(0, 3).includes(row.month)) continue;
    const layers = row.reportLayers;
    for (const dimension of ['大类+物料组', '物料组+产品', '基地+产品']) {
      const base = dimension === '基地+产品' ? row.base : '';
      const code = dimension === '大类+物料组' ? '' : row.code;
      const key = JSON.stringify([row.month, dimension, row.category, row.group, code, base]);
      rows.set(key, {
        月份: row.month,
        维度类型: dimension,
        基地: base,
        大类: row.category,
        物料组编码: row.group,
        产品编码: code,
        产品名称: code ? row.name : '',
        当前维度计划量:
          dimension === '大类+物料组'
            ? layers.groupQuantity
            : dimension === '物料组+产品'
              ? layers.skuQuantity
              : layers.baseQuantity,
        父级计划量:
          dimension === '大类+物料组'
            ? layers.categoryQuantity
            : dimension === '物料组+产品'
              ? layers.groupQuantity
              : layers.skuQuantity,
        计划占比:
          (dimension === '大类+物料组'
            ? layers.groupShare
            : dimension === '物料组+产品'
              ? layers.skuShare
              : layers.baseShare) ?? '',
      });
    }
  }
  return [...rows.values()];
}
