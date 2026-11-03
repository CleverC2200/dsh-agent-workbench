import { previousFiscalYear } from 'dsh-agent-manage/mps-compute/workflow';
import { buildCategoryDemand } from './category-demand.js';
import { ready } from '../../../business/shared/channel.js';
import { createPlanRates } from './plan-rate-view.js';
import { hasMpsSource } from './master-data.js';
import { readFactMonth, readHistoryAnnual } from './facts.js';
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
    : new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
        Number(value) * 100,
      ) + '%';

export function createSourceInputs(react, { Dialog, table, downloadCsv, useMpsPart, categories }) {
  const h = react.createElement;
  const PlanRates = createPlanRates(react, { Dialog, table, downloadCsv });
  return function SourceInputs({ kind, draft, update, relations, active }) {
    const [endMonth, setEndMonth] = react.useState(() =>
      monthOffset(draft.month, draft.pull === 'monthly' ? -2 : -1),
    );
    const [preview, setPreview] = react.useState(null);
    const [page, setPage] = react.useState(0);
    const [showExcluded, setShowExcluded] = react.useState(false);
    const [showLayers, setShowLayers] = react.useState(false);
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
            ...(kind === 'parameters'
              ? { historyAnnualRead: { status: 'unread', month: draft.month } }
              : {}),
          });
      }
      return () => controller.current?.abort();
    }, [active]);
    const load = async () => {
      controller.current?.abort();
      const stop = new AbortController();
      controller.current = stop;
      update({
        [type + 'Read']: { status: 'loading', month: draft.month },
        ...(kind === 'parameters'
          ? { historyAnnualRead: { status: 'loading', month: draft.month } }
          : {}),
      });
      const read = async (operation) => {
        try {
          return await operation();
        } catch (error) {
          if (stop.signal.aborted) throw error;
          return { rows: [], error: error.message };
        }
      };
      if (kind === 'parameters')
        void (async () => {
          try {
            const periods = await Promise.all(
              [
                ...new Map(
                  [0, 1, 2].map((offset) => {
                    const month = monthOffset(draft.month, offset);
                    return [previousFiscalYear(month).start, month];
                  }),
                ).values(),
              ].map(async (month) => ({
                ...previousFiscalYear(month),
                ...(await read(() => readHistoryAnnual(month, stop.signal))),
              })),
            );
            if (!stop.signal.aborted)
              update({
                historyAnnual: { periods },
                historyAnnualRead: {
                  status: 'ready',
                  month: draft.month,
                  error: periods
                    .filter((period) => period.error)
                    .map((period) => `${period.start}至${period.end}：${period.error}`)
                    .join('；'),
                },
              });
          } catch (error) {
            if (!stop.signal.aborted)
              update({
                historyAnnualRead: { status: 'failed', month: draft.month, error: error.message },
              });
          }
        })();
      try {
        const result =
          kind === 'parameters'
            ? {
                periods: await Promise.all(
                  [1, 2, 3].map(async (year) => {
                    const month = monthOffset(draft.month, -12 * year);
                    return {
                      month,
                      ...(await read(() =>
                        readSourceTable('category-history', month, stop.signal),
                      )),
                    };
                  }),
                ),
                annual: await read(() => readSourceTable('annual-pool', draft.month, stop.signal)),
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
        if (result.annual?.error) errors.push(`年度产品池：${result.annual.error}`);
        if (!stop.signal.aborted)
          update({
            [type]:
              kind === 'parameters' ? { periods: result.periods, annual: result.annual } : result,
            [type + 'Read']: { status: 'ready', month: draft.month, error: errors.join('；') },
          });
      } catch (error) {
        if (!stop.signal.aborted)
          update({
            [type + 'Read']: { status: 'failed', month: draft.month, error: error.message },
          });
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
    const workflow = react.useMemo(
      () => (kind === 'parameters' ? buildMpsWorkflow(draft, relations, null) : null),
      [draft, relations, kind],
    );
    const shares = workflow?.rows.filter((row) => row.month === draft.month && row.code) ?? [];
    const checks = react.useMemo(
      () =>
        sourceCheckRows(
          current && kind === 'basic' ? draft.sourceChecks : null,
          ['loading', 'failed'].includes(draft.productsRead?.status) ? [] : draft.products,
          draft.pull,
          categories,
        ),
      [current, draft.sourceChecks, draft.products, draft.productsRead, draft.pull, kind],
    );
    const historical =
      current && kind === 'parameters'
        ? draft.historicalIndicators.periods.flatMap((period) => period.rows)
        : [];
    const calculated = react.useMemo(() => buildCategoryDemand(draft, categories), [draft]);
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
      物料组编码: row.group,
      提报期间: row.month,
      历史期间: `${previousFiscalYear(row.month).start}至${previousFiscalYear(row.month).end}`,
      提报数量: row.reportQuantity,
      上一财年发货数量: row.historyQuantity,
      提报大类数量: row.reportLayers.categoryQuantity,
      提报物料组数量: row.reportLayers.groupQuantity,
      提报全国SKU数量: row.reportLayers.skuQuantity,
      提报物料组占比: percent(row.reportLayers.groupShare),
      提报产品占比: percent(row.reportLayers.skuShare),
      提报基地占比: percent(row.reportLayers.baseShare),
      历史大类数量: row.historyLayers.categoryQuantity,
      历史物料组数量: row.historyLayers.groupQuantity,
      历史全国SKU数量: row.historyLayers.skuQuantity,
      历史物料组占比: percent(row.historyLayers.groupShare),
      历史产品占比: percent(row.historyLayers.skuShare),
      历史基地占比: percent(row.historyLayers.baseShare),
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
      '物料组编码',
      '提报期间',
      '历史期间',
      '提报数量',
      '上一财年发货数量',
      '提报占比',
      '历史占比',
      '提报大类数量',
      '提报物料组数量',
      '提报全国SKU数量',
      '提报物料组占比',
      '提报产品占比',
      '提报基地占比',
      '历史大类数量',
      '历史物料组数量',
      '历史全国SKU数量',
      '历史物料组占比',
      '历史产品占比',
      '历史基地占比',
      '核对状态',
    ];
    const isShare = preview === '去年发运占比' || preview === '销售提报占比';
    const excludedRows = (workflow?.excludedSources ?? [])
      .filter((row) => row.month === draft.month)
      .map((row) => ({
        来源: row.source === 'report' ? '销售提报' : '上一财年发货',
        基地: row.base,
        产品编码: row.code,
        数量: row.quantity,
        原分类: row.category ?? '',
        未对应原因: row.reason,
      }));
    const previewRows = isShare ? (showExcluded ? excludedRows : shareRows) : historicalRows;
    const previewColumns = isShare
      ? showExcluded
        ? ['来源', '基地', '产品编码', '数量', '原分类', '未对应原因']
        : showLayers
          ? shareColumns
          : [
              '大类',
              '基地',
              '产品编码',
              '物料组编码',
              '产品名称',
              '提报数量',
              '上一财年发货数量',
              '提报占比',
              '历史占比',
              '核对状态',
            ]
      : historicalColumns;
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
        基期实绩:
          latest?.actual.knownQuantity == null
            ? '-'
            : number(latest.actual.knownQuantity) +
              (latest.actual.quantity === null ? '（已知小计）' : ''),
        三月实绩: actual.display,
        三月DMS计划: plan.display,
        三月占比合计: percent(
          calculated.bases.find((row) => row.category === category)?.recentShare,
        ),
        全年预估: number(calculated.bases.find((row) => row.category === category)?.annualEstimate),
        计划达成率:
          !issues.length && actual.quantity !== null && plan.quantity > 0
            ? percent(actual.quantity / plan.quantity)
            : '-',
        核对说明: issues.join('；') || (current ? '按当前产品池SKU归类' : '尚未读取核对窗口'),
      };
    });
    useMpsPart(
      react,
      'source-inputs-' + kind,
      {
        evaluationMonth: draft.month,
        read: state ?? null,
        purpose: 'confirmed category demand and source inputs',
        factors:
          kind === 'parameters'
            ? calculated.historical.map(({ category, month, yoy, yoyYears, mom, share }) => ({
                category,
                month,
                yoy,
                yoyYears,
                mom,
                share,
              }))
            : undefined,
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
            h(
              'button',
              {
                disabled: !current || !checks.excluded.length,
                onClick: () =>
                  downloadCsv(
                    '产品池外待补清单.csv',
                    [
                      '月份',
                      '来源',
                      '基地',
                      '产品编码',
                      '产品名称',
                      '大类',
                      '月初数量',
                      '纠偏数量',
                      '数量',
                      '原因',
                    ],
                    checks.excluded,
                  ),
              },
              `下载池外待补清单（${checks.excluded.length}条）`,
            ),
          ),
          h(
            'p',
            { className: 'dc-muted' },
            'BI实绩与DMS计划按所示三个月核对，计划随月初／纠偏选择。各来源按当前产品池SKU重新归类，池外SKU另列清单，缺值不补0。期初使用评估月前4至前2月，纠偏使用前3至前1月。基期取窗口最后一月，全年预估＝三月实绩÷三月历史平均占比之和。',
          ),
          state?.error && h('p', { role: 'alert' }, state.error),
          draft.historyAnnualRead?.error &&
            h('p', { role: 'alert' }, draft.historyAnnualRead.error),
        ),
        table(
          [
            '大类或源分类',
            '基期实绩',
            '三月实绩',
            '三月DMS计划',
            '三月占比合计',
            '全年预估',
            '计划达成率',
            '核对说明',
          ],
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
            if (index === 4) return h(PlanRates, { key: name, draft, update, active, workflow });
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
                      ? index === 0
                        ? `${state.error ? '部分原值已读取 · ' : ''}${calculated.historical.filter((row) => row.yoy !== null).length} / ${calculated.historical.length} 项可计算`
                        : state.error
                          ? '部分原值已读取'
                          : '原值已读取'
                      : '待同步原值'
                    : draft.historyAnnualRead?.status === 'loading'
                      ? '全年历史读取中…'
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
                    ? index === 0
                      ? '最近三年逐年汇总同大类数量后计算同比系数，按有效年份等权平均。缺年、零分母或无效年度跳过；全部不可用时留空，实际年份见预览。'
                      : '环比和月占比仍对三个完整年份等权平均；环比为系数，月占比为月量÷对应财年全年。'
                    : `${previousFiscalYear(draft.month).start}至${previousFiscalYear(draft.month).end}全年发货；按当前物料编码、物料组编码计算物料组占大类、产品占物料组、基地产品占范围内同SKU。`,
                ),
              ),
              h(
                'div',
                { className: 'dc-source-actions' },
                h(
                  'button',
                  {
                    disabled: !active || !hasMpsSource() || busy,
                    onClick: load,
                    'aria-label': `读取${name}源值`,
                  },
                  busy ? '读取中…' : index < 3 ? '同步历史源值' : '同步全年历史占比',
                ),
                h(
                  'button',
                  {
                    onClick: () => {
                      setPreview(name);
                      setShowExcluded(false);
                      setShowLayers(false);
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
      draft.historyAnnualRead?.error && h('p', { role: 'alert' }, draft.historyAnnualRead.error),
      preview &&
        h(
          Dialog,
          {
            title: preview + ' · 源值核对',
            className: !isShare || showLayers || showExcluded ? 'dc-source-detail' : undefined,
            close: () => setPreview(null),
            footer: h('button', { onClick: () => setPreview(null) }, '关闭'),
          },
          h(
            'p',
            { className: 'dc-muted' },
            isShare
              ? `销售提报期间${draft.month}，取allnum；历史期间${previousFiscalYear(draft.month).start}至${previousFiscalYear(draft.month).end}。与第三步共用计算，以当前物料编码、物料组编码归类，缺行保留为空。`
              : '同比系数按最近三年中的有效年份等权平均，实际参与年份逐项列明；环比和月占比仍需三个完整年份。源同比、环比和财年比例分别保留。',
          ),
          isShare &&
            h(
              'div',
              { className: 'dc-toolbar' },
              h(
                'button',
                {
                  onClick: () => {
                    setShowExcluded(false);
                    setShowLayers(false);
                    setPage(0);
                  },
                },
                '占比明细',
              ),
              h(
                'button',
                {
                  onClick: () => {
                    setShowExcluded(false);
                    setShowLayers(true);
                    setPage(0);
                  },
                },
                '三层分子分母',
              ),
              h(
                'button',
                {
                  onClick: () => {
                    setShowExcluded(true);
                    setPage(0);
                  },
                },
                `未对应记录（${excludedRows.length}）`,
              ),
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
                  ['基地+大类'].map((value) => h('option', { value, key: value }, value)),
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
          !isShare &&
            table(
              ['大类', '目标月份', '同比系数', '同比有效年份', '三年环比系数', '三年月占比'],
              calculated.historical.map((row) => ({
                大类: row.category,
                目标月份: row.month,
                同比系数: row.yoy ?? '',
                同比有效年份: row.yoyYears.length
                  ? `${row.yoyYears.map((month) => month.slice(0, 4)).join('、')}（${row.yoyYears.length}年）`
                  : '无有效年份',
                三年环比系数: row.mom ?? '',
                三年月占比: row.share ?? '',
              })),
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
                    isShare && !showExcluded ? shareColumns : previewColumns,
                    isShare && !showExcluded
                      ? shareRows.map((row, index) => ({
                          ...row,
                          提报占比: shares[index].reportShare ?? '',
                          历史占比: shares[index].historyShare ?? '',
                          提报物料组占比: shares[index].reportLayers.groupShare ?? '',
                          提报产品占比: shares[index].reportLayers.skuShare ?? '',
                          提报基地占比: shares[index].reportLayers.baseShare ?? '',
                          历史物料组占比: shares[index].historyLayers.groupShare ?? '',
                          历史产品占比: shares[index].historyLayers.skuShare ?? '',
                          历史基地占比: shares[index].historyLayers.baseShare ?? '',
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
