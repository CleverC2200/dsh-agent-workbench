import { hasMpsSource } from './master-data.js';
import { readFactMonth } from './facts.js';
import { readSourceTable } from './source-tables.js';
import { buildMpsWorkflow } from './workflow-inputs.js';
import { sourceCheckRows } from './source-projections.js';

const monthOffset = (month, offset) => {
  const date = new Date(month + '-01T00:00:00Z');
  date.setUTCMonth(date.getUTCMonth() + offset);
  return date.toISOString().slice(0, 7);
};
const number = (value) =>
  value == null || value === ''
    ? '-'
    : new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 }).format(value);
const percent = (value) =>
  value == null || value === ''
    ? '-'
    : new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 6 }).format(Number(value) * 100) +
      '%';

export function createSourceInputs(react, { Dialog, table, downloadCsv, useMpsPart, categories }) {
  const h = react.createElement;
  return function SourceInputs({ kind, draft, update, relations, active }) {
    const [endMonth, setEndMonth] = react.useState(() => monthOffset(draft.month, -1));
    const [preview, setPreview] = react.useState(null);
    const [page, setPage] = react.useState(0);
    const [dimension, setDimension] = react.useState('基地+大类');
    const [base, setBase] = react.useState('');
    const controller = react.useRef(null);
    const type = kind === 'parameters' ? 'historicalIndicators' : 'sourceChecks';
    const state = draft[type + 'Read'];
    const busy = state?.status === 'loading';
    const current = state?.status === 'ready' && state.month === draft.month;
    react.useEffect(() => {
      if (!active) {
        controller.current?.abort();
        if (state?.status === 'loading')
          update({
            [type + 'Read']: { status: 'unread', month: draft.month },
          });
      }
      return () => controller.current?.abort();
    }, [active]);
    const load = async () => {
      controller.current?.abort();
      const stop = new AbortController();
      controller.current = stop;
      update({ [type + 'Read']: { status: 'loading', month: draft.month } });
      const read = async (operation) => {
        try {
          return await operation();
        } catch (error) {
          if (stop.signal.aborted) throw error;
          return { rows: [], error: error.message };
        }
      };
      try {
        const result =
          kind === 'parameters'
            ? {
                periods: await Promise.all(
                  [1, 2, 3].map(async (year) => {
                    const month = monthOffset(draft.month, -12 * year);
                    return {
                      month,
                      ...(await read(() => readSourceTable('delivery', month, stop.signal))),
                    };
                  }),
                ),
              }
            : {
                periods: await Promise.all(
                  [-2, -1, 0].map(async (offset) => {
                    const month = monthOffset(endMonth, offset);
                    const [history, report] = await Promise.all([
                      read(() => readFactMonth('history', month, stop.signal)),
                      read(() => readFactMonth('report', month, stop.signal)),
                    ]);
                    return { month, history, report };
                  }),
                ),
              };
        const errors = result.periods.flatMap((period) =>
          kind === 'parameters'
            ? period.error
              ? [`${period.month}：${period.error}`]
              : []
            : [
                ...(period.history.error ? [`${period.month} BI：${period.history.error}`] : []),
                ...(period.report.error ? [`${period.month} DMS：${period.report.error}`] : []),
              ],
        );
        if (!stop.signal.aborted)
          update({
            [type]: result,
            [type + 'Read']: { status: 'ready', month: draft.month, error: errors.join('；') },
          });
      } catch (error) {
        if (!stop.signal.aborted)
          update({
            [type + 'Read']: { status: 'failed', month: draft.month, error: error.message },
          });
      }
    };
    const workflow = react.useMemo(
      () => (kind === 'parameters' ? buildMpsWorkflow(draft, relations, null) : null),
      [draft, relations, kind],
    );
    const shares = workflow?.rows.filter((row) => row.month === draft.month && row.code) ?? [];
    const checks = react.useMemo(
      () =>
        sourceCheckRows(
          current && kind === 'basic' ? draft.sourceChecks : null,
          ['loading', 'failed'].includes(draft.productsRead?.status) ? [] : draft.productRaw,
          draft.pull,
          categories,
        ),
      [current, draft.sourceChecks, draft.productRaw, draft.productsRead, draft.pull, kind],
    );
    const historical =
      current && kind === 'parameters'
        ? draft.historicalIndicators.periods.flatMap((period) => period.rows)
        : [];
    const historicalRows = historical.filter(
      (row) => (!dimension || row['维度类型'] === dimension) && (!base || row['基地'] === base),
    );
    const historicalColumns = [
      '月份',
      '维度类型',
      '基地',
      '维度值',
      '月发货数量',
      '上年同期月份',
      '上年同期发货数量',
      '同比增长率',
      '上月月份',
      '上月发货数量',
      '环比增长率',
      '全国维度财年发货数量',
      '月发货占财年比例',
      '粒度状态',
    ];
    const shareRows = shares.map((row) => ({
      大类: row.category,
      基地: row.base,
      产品编码: row.code,
      产品名称: row.name,
      提报数量: row.reportQuantity,
      历史发货数量: row.historyQuantity,
      提报占比: percent(row.reportShare),
      历史占比: percent(row.historyShare),
      核对状态:
        [...new Set([...row.missing.reportShare, ...row.missing.historyShare])].join('；') ||
        '已计算',
    }));
    const shareColumns = [
      '大类',
      '基地',
      '产品编码',
      '产品名称',
      '提报数量',
      '历史发货数量',
      '提报占比',
      '历史占比',
      '核对状态',
    ];
    const isShare = preview === '去年发运占比' || preview === '销售提报占比';
    const previewRows = isShare ? shareRows : historicalRows;
    const previewColumns = isShare ? shareColumns : historicalColumns;
    const pageIndex = Math.min(page, Math.max(0, Math.ceil(previewRows.length / 25) - 1));
    const totals = (category, side) => {
      const rows = checks.rows.filter((row) => row.category === category);
      const amount = rows.map((row) => row[side]);
      const complete = rows.length === 3 && amount.every((row) => row.quantity !== null);
      const known = amount.filter((row) => row.knownQuantity !== null);
      const sum = known.reduce((value, row) => value + row.knownQuantity, 0);
      const safe = Number.isFinite(sum) && Math.abs(sum) <= Number.MAX_SAFE_INTEGER;
      return {
        quantity: complete && safe ? sum : null,
        display: !safe
          ? '超出可靠范围'
          : known.length
            ? number(sum) + (complete ? '' : '（已知小计）')
            : '-',
      };
    };
    const basicRows = checks.categories.map((category) => {
      const actual = totals(category, 'actual'),
        plan = totals(category, 'plan');
      const rows = checks.rows.filter((row) => row.category === category);
      const latest = rows.find((row) => row.month === endMonth);
      const issues = [...new Set(rows.flatMap((row) => row.issues))];
      return {
        大类或源分类: category,
        核对月实绩:
          latest?.actual.knownQuantity == null
            ? '-'
            : number(latest.actual.knownQuantity) +
              (latest.actual.quantity === null ? '（已知小计）' : ''),
        三月实绩: actual.display,
        三月DMS计划: plan.display,
        核对比值:
          !issues.length && actual.quantity !== null && plan.quantity > 0
            ? percent(actual.quantity / plan.quantity)
            : '-',
        核对说明:
          issues.join('；') || (current ? '同名源分类，未用作正式预测输入' : '尚未读取核对窗口'),
      };
    });
    useMpsPart(
      react,
      'source-inputs-' + kind,
      {
        evaluationMonth: draft.month,
        read: state ?? null,
        purpose: 'source-check-only; does not produce categoryDemand',
        months:
          kind === 'basic'
            ? checks.months
            : (draft.historicalIndicators?.periods.map((row) => row.month) ?? []),
        rows:
          kind === 'basic' ? basicRows : previewRows.slice(pageIndex * 25, (pageIndex + 1) * 25),
        total: kind === 'basic' ? basicRows.length : previewRows.length,
      },
      kind === 'basic' ? '大类基础源值核对' : '派生指标源值核对',
      active,
    );
    if (kind === 'basic')
      return h(
        'section',
        {
          className: 'dc-card dc-results',
          'aria-label': '大类基础指标源值核对',
        },
        h('div', { className: 'dc-card-head' }, h('h3', {}, '大类基础指标 · 源值核对')),
        h(
          'div',
          { className: 'dc-source-body' },
          h(
            'div',
            { className: 'dc-toolbar' },
            h(
              'label',
              {},
              '核对截止月份',
              h('input', {
                type: 'month',
                'aria-label': '源值核对截止月份',
                value: endMonth,
                disabled: busy,
                onChange: (event) => {
                  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(event.target.value)) {
                    setEndMonth(event.target.value);
                    update({ sourceChecksRead: { status: 'unread', month: draft.month } });
                  }
                },
              }),
            ),
            h('span', {}, `${monthOffset(endMonth, -2)} 至 ${endMonth}`),
            h(
              'button',
              { disabled: !active || !hasMpsSource() || busy, onClick: load },
              busy ? '读取中…' : '读取三月源值',
            ),
            h(
              'button',
              {
                disabled: !current,
                onClick: () =>
                  downloadCsv(
                    '大类基础源值核对.csv',
                    [
                      '评估版本',
                      '评估月份',
                      '源月份',
                      '源分类',
                      'DMS口径',
                      'BI源数量',
                      'DMS源数量',
                      'BI已知小计',
                      'DMS已知小计',
                      '核对比值',
                      '核对说明',
                    ],
                    checks.rows.map((row) => ({
                      评估版本: draft.name,
                      评估月份: draft.month,
                      源月份: row.month,
                      源分类: row.category,
                      DMS口径: checks.column,
                      BI源数量: row.actual.quantity ?? '',
                      DMS源数量: row.plan.quantity ?? '',
                      BI已知小计: row.actual.knownQuantity ?? '',
                      DMS已知小计: row.plan.knownQuantity ?? '',
                      核对比值: row.ratio ?? '',
                      核对说明: row.issues.join('；'),
                    })),
                  ),
              },
              '下载源值核对',
            ),
          ),
          h(
            'p',
            { className: 'dc-muted' },
            'BI实绩与DMS计划按所示三个月核对，计划随月初／纠偏选择。源分类分别保留，缺值不补0。此窗口不是已确认的预测基期；不生成正式大类需求。',
          ),
          state?.error && h('p', { role: 'alert' }, state.error),
        ),
        table(
          ['大类或源分类', '核对月实绩', '三月实绩', '三月DMS计划', '核对比值', '核对说明'],
          basicRows,
        ),
      );
    return h(
      react.Fragment,
      {},
      h(
        'div',
        { className: 'dc-parameter-grid', role: 'region', 'aria-label': '系统派生口径参数' },
        ...['三年同比', '三年环比', '三年该月占比', '去年发运占比', '销售提报占比'].map(
          (name, index) => {
            const field = index === 3 ? 'historyShare' : 'reportShare';
            const available = shares.filter((row) => row[field] !== null).length;
            return h(
              'section',
              { className: 'dc-card dc-parameter', key: name },
              h(
                'div',
                { className: 'dc-card-head' },
                h('h3', {}, name),
                h(
                  'span',
                  { className: 'dc-status' },
                  index < 3
                    ? current
                      ? state.error
                        ? '部分原值已读取'
                        : '原值已读取'
                      : '待同步原值'
                    : `${available} / ${shares.length} 条可计算`,
                ),
              ),
              h(
                'div',
                { className: 'dc-source-body' },
                h(
                  'p',
                  {},
                  index < 3
                    ? '可核对各年源数量和比值，三年平均规则尚未确认。'
                    : `${draft.month}同大类基地SKU口径；复用第三步结果，缺分类、缺数或零分母逐项说明。`,
                ),
              ),
              h(
                'div',
                { className: 'dc-source-actions' },
                index < 3 &&
                  h(
                    'button',
                    {
                      disabled: !active || !hasMpsSource() || busy,
                      onClick: load,
                      'aria-label': `读取${name}源值`,
                    },
                    busy ? '读取中…' : '同步历史源值',
                  ),
                h(
                  'button',
                  {
                    onClick: () => {
                      setPreview(name);
                      setPage(0);
                    },
                  },
                  '预览',
                ),
              ),
            );
          },
        ),
      ),
      state?.error && h('p', { role: 'alert' }, state.error),
      preview &&
        h(
          Dialog,
          {
            title: preview + ' · 源值核对',
            close: () => setPreview(null),
            footer: h('button', { onClick: () => setPreview(null) }, '关闭'),
          },
          h(
            'p',
            { className: 'dc-muted' },
            isShare
              ? '与第三步使用同一计算函数。仅缺大类需求不会使已有占比消失；本页不改变拆分口径。'
              : '源同比、环比和财年比例分别保留；月占财年比例的分母是全国同维度财年量。三年均值未确认，不拿源比例替代SKU占大类。',
          ),
          !isShare &&
            h(
              'div',
              { className: 'dc-toolbar' },
              h(
                'label',
                {},
                '维度',
                h(
                  'select',
                  {
                    'aria-label': '历史指标维度',
                    value: dimension,
                    onChange: (event) => {
                      setDimension(event.target.value);
                      setPage(0);
                    },
                  },
                  ['基地+大类', '基地+产品', '基地+物料组', '基地+系列'].map((value) =>
                    h('option', { value, key: value }, value),
                  ),
                ),
              ),
              h(
                'label',
                {},
                '基地',
                h(
                  'select',
                  {
                    'aria-label': '历史指标基地',
                    value: base,
                    onChange: (event) => {
                      setBase(event.target.value);
                      setPage(0);
                    },
                  },
                  h('option', { value: '' }, '全部源基地'),
                  ...[...new Set(historical.map((row) => row['基地']).filter(Boolean))].map(
                    (value) => h('option', { value, key: value }, value),
                  ),
                ),
              ),
            ),
          table(previewColumns, previewRows.slice(pageIndex * 25, (pageIndex + 1) * 25)),
          !previewRows.length &&
            h(
              'p',
              {},
              isShare
                ? '尚无当前版本的基地SKU计算行。'
                : current
                  ? '当前筛选没有可用源记录，请查看读取状态或更换筛选。'
                  : '尚未读取当前评估月的三年源记录，请先同步历史源值。',
            ),
          h(
            'div',
            { className: 'dc-pagination' },
            h('span', {}, `共${previewRows.length}条，第${pageIndex + 1}页`),
            h('button', { disabled: !pageIndex, onClick: () => setPage(pageIndex - 1) }, '上一页'),
            h(
              'button',
              {
                disabled: (pageIndex + 1) * 25 >= previewRows.length,
                onClick: () => setPage(pageIndex + 1),
              },
              '下一页',
            ),
            h(
              'button',
              {
                disabled: !previewRows.length,
                onClick: () =>
                  downloadCsv(
                    preview + '-源值核对.csv',
                    previewColumns,
                    isShare
                      ? shareRows.map((row, index) => ({
                          ...row,
                          提报占比: shares[index].reportShare ?? '',
                          历史占比: shares[index].historyShare ?? '',
                        }))
                      : previewRows,
                  ),
              },
              '下载源值',
            ),
          ),
        ),
    );
  };
}
