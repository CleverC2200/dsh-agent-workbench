import { renderTablePagination } from './report-page.js';
import { createBatchEdit } from './batch-edit.js';
import { createStepViewState, useStepViewField } from './step-view-state.js';
import {
  compareBusinessRows,
  compareBusinessValues,
  orderedTableEntries,
  createTablePresentation,
  isSkuColumn,
} from './table-presentation.js';
import { categorySourceInputs } from './category-source-inputs.js';
import { createCategoryFilter, matchesCategories } from './category-filter.js';
import { canonicalBaseName } from './relations.js';
import { buildMpsWorkflow, submittedPoolExceptions } from './workflow-inputs.js';
import { buildCategoryDemand } from './category-demand.js';
import { encodeLocalDrafts, decodeLocalDrafts, changeAdjustment } from './local-draft.js';
import { nextMpsDraftId } from '../../../src/mps-local-draft.ts';
import { createCategoryDemand } from './category-demand-view.js';
import { createCalculationHelp } from './calculation-help.js';
import { currentSessionId, ready } from '../../../business/shared/channel.js';
import { registerMpsRefresh } from './context.js';
import { useMpsEvaluation } from './evaluation-storage.js';
import { createShipment } from './shipment.js';
import { mpsBusinessDate } from './business-date.js';
import { defaultInventoryMonth } from './inventory-selection.js';
import {
  hasMpsSource,
  readProducts,
  readProductSnapshot,
  readProductPrices,
  readAnnualDetails,
  productRows,
} from './master-data.js';
import { createMasterData } from './master-data-view.js';
import { readFactMonth, readInventoryTargets, readReportAmounts } from './facts.js';
import { readSourceTable, forecastDimensions, hasSourceCalculation } from './source-tables.js';
import { createDeliveryMetrics } from './delivery-metrics.js';
import { createMonthPicker } from './month-picker.js';
import { createWorkflow } from './workflow-view.js';
import {
  productProjections,
  productSourceColumns,
  productSourceRows,
  sourceDimensions,
  sourceProductMappings,
  createSourceProductMatcher,
  scopedProductRows,
} from './source-projections.js';
import { createSourceInputs } from './source-input-view.js';
import { productFileText, productReplacementErrors } from './product-file.js';
import { sumSourceAmounts } from './source-money.js';
import { downloadFile, downloadWorkbook, workbookBytes } from './workbook.js';
import { annualWorkbookTables } from './annual-workbook.js';
import { poolSubmissionRows } from './pool-exception-view.js';
import { canPrefetchMps, readFailureText } from './mps-read.js';
import {
  createLoadingProgress,
  demandLoadingItems,
  isReading,
  loadingItem,
} from './loading-progress.js';
import { createProductScopeReport } from './product-scope-view.js';
const productColumns = [
  '基地',
  '产品编码',
  '产品名称',
  '大类',
  '系列',
  '物料组',
  '物料组名称',
  '老品编码',
  '老品名称',
];
const annualColumns = ['月份', '大类', '数量'];
const dimensions = ['基地', '大类', '系列', '产品编码'];
const sourceColumns = ['月份', ...productColumns.slice(0, 6)];
const sourceDefinitions = {
  report: {
    title: '计划提报数据',
    short: '计划提报',
    columns: [...sourceColumns, '月初数量', '纠偏数量'],
  },
  forecast: { title: '模型双期预测', short: '模型预测', columns: [...sourceColumns, '数量'] },
  history: { title: '历史同期发货', short: '历史发货', columns: [...sourceColumns, '数量'] },
};
const monthOffset = (month, offset) => {
  const [year, number] = month.split('-').map(Number);
  const date = new Date(year, number - 1 + offset, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};
function parseCsv(text, columns, rowLimit = 10000) {
  const table = [];
  let row = [],
    cell = '',
    quoted = false,
    closed = false;
  const finish = () => {
    row.push(cell);
    if (row.some((value) => value.trim())) table.push(row);
    row = [];
    cell = '';
    closed = false;
  };
  text = text.replace(/^\uFEFF/, '');
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        cell += '"';
        index++;
      } else if (char === '"') {
        quoted = false;
        closed = true;
      } else cell += char;
    } else if (char === ',' || char === '\n' || char === '\r') {
      if (char === ',') {
        row.push(cell);
        cell = '';
        closed = false;
      } else {
        if (char === '\r' && text[index + 1] === '\n') index++;
        finish();
      }
    } else if (char === '"' && !cell && !closed) quoted = true;
    else {
      if (char === '"' || closed) throw Error('CSV引号格式错误，请使用模板重新导出文件。');
      cell += char;
    }
  }
  if (quoted) throw Error('CSV引号未闭合。');
  if (cell || row.length) finish();
  if (
    columns === productColumns &&
    table[0]?.join('\u0000') === [...productColumns, '未税到岸单价'].join('\u0000')
  ) {
    for (const row of table) if (row.length === productColumns.length + 1) row.pop();
  }
  const legacyProductColumns = productColumns.filter((column) => column !== '物料组名称');
  if (
    columns === productColumns &&
    table[0]?.join('\u0000') === legacyProductColumns.join('\u0000')
  ) {
    for (const row of table) row.splice(6, 0, row === table[0] ? '物料组名称' : '');
  }
  if (!table.length || table[0].join('\u0000') !== columns.join('\u0000'))
    throw Error(`表头必须依模板排列：${columns.join('、')}。`);
  if (table.length - 1 > rowLimit)
    throw Error(`超过${rowLimit}条上限，未读取任何行，请拆分文件后核对。`);
  const errors = [];
  const rows = table.slice(1).map((values, index) => {
    if (values.length !== columns.length) errors.push(`第${index + 2}行列数不符`);
    const record = Object.fromEntries(
      columns.map((column, position) => [column, (values[position] ?? '').trim()]),
    );
    for (const column of columns) {
      const value = record[column];
      if (column === '月份') {
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value) || Number(value.slice(0, 4)) < 1000)
          errors.push(`第${index + 2}行月份须为YYYY-MM`);
      } else if (column.includes('数量')) {
        if (value !== '' && (!/^[-+]?\d+(\.\d+)?$/.test(value) || !Number.isFinite(Number(value))))
          errors.push(`第${index + 2}行${column}须为有限数或留空`);
      } else if (
        columns === productColumns &&
        column !== '基地' &&
        column !== '物料组名称' &&
        !column.startsWith('老品') &&
        !value
      )
        errors.push(`第${index + 2}行${column}不能为空`);
    }
    if (columns === productColumns && !!record['老品编码'] !== !!record['老品名称'])
      errors.push(`第${index + 2}行老品编码和名称须同时填写或留空`);
    return record;
  });
  if (columns === productColumns) {
    const seen = new Set();
    rows.forEach((record, index) => {
      const key = JSON.stringify([record['基地'], record['产品编码']]);
      if (seen.has(key)) errors.push(`第${index + 2}行同一基地产品编码重复`);
      seen.add(key);
    });
  }
  for (const column of columns.filter((name) => name.includes('数量'))) {
    if (!Number.isFinite(quantity(rows, column))) errors.push(`${column}合计超出可核对范围`);
  }
  if (errors.length)
    throw Error(
      `${errors.slice(0, 20).join('；')}${errors.length > 20 ? `；另有${errors.length - 20}项错误` : ''}。未替换原输入。`,
    );
  return rows;
}
function downloadCsvLegacy(name, columns, rows) {
  const cell = (value, column) => {
    let text = String(value ?? '');
    if (typeof value !== 'number' && !column?.includes('数量') && /^[\s]*[=+\-@\t\r\n]/.test(text))
      text = "'" + text;
    return /[",\r\n]/.test(text) ? '"' + text.replaceAll('"', '""') + '"' : text;
  };
  const csv =
    '\uFEFF' +
    [columns, ...rows.map((row) => columns.map((column) => row[column]))]
      .map((row) => row.map((value, index) => cell(value, columns[index])).join(','))
      .join('\r\n');
  downloadFile(name, 'text/csv;charset=utf-8', csv);
}
export function downloadCsv(name, columns, rows) {
  if (
    rows.some((row) =>
      columns.some((column) => typeof row[column] === 'string' && row[column].length > 32767),
    )
  )
    return downloadCsvLegacy(name.replace(/\.xlsx$/i, '.csv'), columns, rows);
  return downloadWorkbook(name.replace(/\.csv$/i, '.xlsx'), [{ name: '数据', columns, rows }]);
}
const integer = new Intl.NumberFormat('zh-CN', {
  useGrouping: false,
  maximumFractionDigits: 0,
}).format;
const amount = new Intl.NumberFormat('zh-CN', {
  useGrouping: false,
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
}).format;
const quantity = (rows, column) =>
  rows.reduce((sum, row) => (row[column] === '' ? sum : sum + Number(row[column])), 0);
const currentMonth = () => mpsBusinessDate().slice(0, 7);
const versionLabel = (name) => name.replace(/^\d{1,2}月滚动评估\s*·\s*/u, '') || name;
const blankProduct = () => Object.fromEntries(productColumns.map((column) => [column, '']));
const makeDraft = (id, month) => ({
  id,
  name: `${Number(month.slice(5))}月滚动评估 · 第${id.split('-')[1]}版`,
  month,
  products: [],
  productRaw: [],
  productSource: 'business-unread',
  annual: [],
  report: [],
  forecast: [],
  delivery: [],
  history: [],
  files: {},
  pull: 'monthly',
  forecastOffset: 1,
  historyYears: 1,
});
function annualSelection(draft) {
  const scoped =
    draft.annualSource === 'business'
      ? categorySourceInputs({
          ...draft,
          historicalIndicatorsRead: { status: 'ready', month: draft.month },
          historicalIndicators: { periods: [], annual: { rows: draft.annual } },
        }).annual
      : draft.annual;
  const nationwide =
    draft.annualSource === 'business'
      ? [...Map.groupBy(scoped, (row) => JSON.stringify([row['月份'], row['大类']])).values()].map(
          (rows) => ({
            月份: rows[0]['月份'],
            大类: rows[0]['大类'],
            基地: '全国',
            数量: rows.every((row) => row['数量'] !== null)
              ? rows.reduce((sum, row) => sum + row['数量'], 0)
              : '',
          }),
        )
      : [];
  const rows = [...nationwide, ...scoped];
  const bases = [...new Set(rows.map((row) => row['基地']).filter(Boolean))];
  const base =
    (bases.includes(draft.annualBase) ? draft.annualBase : undefined) ??
    (bases.includes('全国') ? '全国' : bases[0]);
  return {
    bases,
    base,
    rows: draft.annualSource === 'business' ? rows.filter((row) => row['基地'] === base) : rows,
  };
}
function forecastSourceRows(draft, rows = draft.forecast) {
  const productsReady = !['loading', 'failed'].includes(draft.productsRead?.status);
  return (
    draft.forecastSource === 'business' && productsReady
      ? forecastDimensions(scopedProductRows(rows, draft.products), draft.products)
      : scopedProductRows(rows, draft.products)
  ).map((row) => ({ ...row, 读取状态: draft.forecastRead?.status ?? 'unread' }));
}
function sourcePeriod(draft, type) {
  if (type === 'report') return draft.month;
  if (type === 'forecast') return monthOffset(draft.month, draft.forecastOffset - 1);
  return monthOffset(draft.month, -12 * draft.historyYears);
}
function sourceSelection(draft, type) {
  const period = sourcePeriod(draft, type);
  const column = type === 'report' ? (draft.pull === 'monthly' ? '月初数量' : '纠偏数量') : '数量';
  const rows = draft[type].filter((row) => row['月份'] === period);
  return {
    period,
    column,
    rows:
      type === 'forecast'
        ? forecastSourceRows(draft, rows)
        : sourceDimensions(
            scopedProductRows(rows, draft.products),
            ['loading', 'failed'].includes(draft.productsRead?.status) ? [] : draft.products,
          ),
  };
}
function reportAmountSource(draft, period) {
  return draft.reportSource === 'business' &&
    draft.reportRead?.periods?.[period]?.status === 'ready' &&
    draft.reportAmounts?.[period]?.period === period
    ? draft.reportAmounts[period]
    : null;
}

export function createDemandConfirmation(react, useMpsPart, view, Button, createPortal) {
  const h = react.createElement;
  const { Provider, Code } = createTablePresentation(react);
  const CategoryFilter = createCategoryFilter(react);
  const CalculationHelp = createCalculationHelp(react);
  const LoadingProgress = createLoadingProgress(react);
  const CategoryDemand = createCategoryDemand(react, {
    table: (...args) => table(...args),
    downloadCsv,
    downloadExceptions: downloadCsvLegacy,
    useMpsPart,
  });
  function Dialog({ title, children, footer, close, className = '' }) {
    const element = react.useRef();
    react.useLayoutEffect(() => {
      const dialog = element.current;
      dialog.showModal();
      return () => {
        const owner = dialog.ownerDocument;
        if (owner.hasFocus() && dialog.contains(owner.activeElement)) dialog.close();
      };
    }, []);
    return h(
      'dialog',
      {
        ref: element,
        className: `dc-dialog ${className}`,
        'aria-label': title,
        onCancel: (event) => {
          event.preventDefault();
          close();
        },
      },
      h(
        'div',
        { className: 'dc-dialog-head' },
        h('h2', {}, title),
        h('button', { type: 'button', onClick: close, 'aria-label': '关闭弹窗' }, '关闭'),
      ),
      h(
        'div',
        { className: 'dc-dialog-body' },
        h('div', { className: 'dc-dialog-content' }, children),
      ),
      footer && h('div', { className: 'dc-dialog-footer' }, footer),
    );
  }
  function Upload({ label, text = '上传', read, accept = '.csv,text/csv' }) {
    const input = react.useRef();
    return h(
      react.Fragment,
      {},
      h('button', { onClick: () => input.current.click() }, text),
      h('input', {
        ref: input,
        type: 'file',
        hidden: true,
        accept,
        'aria-label': label,
        onChange: (event) => {
          const file = event.target.files[0];
          if (file) read(file);
          event.target.value = '';
        },
      }),
    );
  }
  const table = (columns, rows, headers = {}, renderDetail) =>
    h(
      'div',
      { className: 'dc-table-scroll', tabIndex: 0 },
      h(
        'table',
        {},
        h(
          'thead',
          {},
          h(
            'tr',
            {},
            columns.map((column) =>
              h('th', { key: column, scope: 'col' }, headers[column] ?? column),
            ),
          ),
        ),
        h(
          'tbody',
          {},
          orderedTableEntries(columns, rows).map(({ row, index }) =>
            h(
              react.Fragment,
              { key: index },
              h(
                'tr',
                {},
                columns.map((column) =>
                  h(
                    'td',
                    { key: column },
                    isSkuColumn(column) && typeof row[column] === 'string' && row[column]
                      ? h(Code, { row })
                      : row[column] === '' || row[column] == null
                        ? column === '新品标记'
                          ? ''
                          : '-'
                        : /收入|金额/.test(column) && Number.isFinite(Number(row[column]))
                          ? amount(row[column])
                          : (/数量|合计/.test(column) ||
                                /^M\+\d$/.test(column) ||
                                [
                                  '① 环比法',
                                  '② 占比法',
                                  '加权',
                                  '两法平均量',
                                  '销售提报量',
                                  '销售校正量',
                                  '系统值',
                                  '有效值',
                                  '组合标准日产/件',
                                  '组合标准日产/吨',
                                ].includes(column)) &&
                              Number.isFinite(Number(row[column]))
                            ? integer(row[column])
                            : [
                                  '历史平均环比',
                                  '年度环比',
                                  '近三月达成率',
                                  '同期平均占比',
                                  '三年月占比',
                                  '月发货占财年比例',
                                  '同比增长率',
                                  '环比增长率',
                                ].includes(column) && Number.isFinite(Number(row[column]))
                              ? new Intl.NumberFormat('zh-CN', {
                                  style: 'percent',
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                }).format(Number(row[column]))
                              : row[column],
                  ),
                ),
              ),
              renderDetail?.(row, index),
            ),
          ),
        ),
      ),
    );
  function Source({
    type,
    draft,
    selection,
    read,
    sync,
    update,
    error,
    busy,
    progressive,
    productsPending,
    selectedCategories = [],
  }) {
    const definition = sourceDefinitions[type];
    const [preview, setPreview] = react.useState(null);
    const [page, setPage] = react.useState(0);
    const { period, column, rows: fullRows } = selection;
    const matchProduct = react.useMemo(
      () => createSourceProductMatcher(draft.products),
      [draft.products],
    );
    const rows = !selectedCategories.length
      ? fullRows
      : fullRows.filter((row) => matchesCategories(row['大类'], selectedCategories));
    const business = draft[type + 'Source'] === 'business';
    const reportRead = draft.reportRead;
    const reportPeriodStatus = reportRead?.periods?.[period]?.status;
    const sourceRead =
      type === 'forecast'
        ? draft.forecastRead
        : (draft[type + 'Read']?.periods?.[period] ?? draft[type + 'Read']);
    const sourcePending =
      progressive && !draft.files[type] && (isReading(sourceRead) || productsPending);
    const showSourceData = !sourcePending && (sourceRead?.status !== 'failed' || rows.length > 0);
    const reportLoading =
      (reportRead?.periods ? reportPeriodStatus : reportRead?.status) === 'loading';
    const visibleColumns =
      type === 'forecast' && business
        ? ['月份', '基地', '产品编码', '产品名称', '物料组', '物料组名称', '大类', '系列']
        : type === 'report' && business
          ? ['月份', '大区', '基地', '产品编码', '产品名称', '大类', '系列', '物料组', '物料组名称']
          : sourceColumns;
    const detailColumns = business
      ? [
          ...visibleColumns,
          ...(type === 'report'
            ? ['月初数量', '纠偏数量']
            : type === 'forecast'
              ? [
                  '数量',
                  '预测批次',
                  '源批次月份',
                  '源当月预测数量',
                  '源下一月预测数量',
                  '源记录数',
                  '读取状态',
                ]
              : ['数量', '含赠品数量', '不含税收入']),
          '源大类',
          '源系列',
          '源物料组',
          '缺项原因',
        ]
      : [...sourceColumns, column];
    react.useEffect(() => setPage(0), [draft[type], selectedCategories]);
    const amountRead = type === 'report' ? reportAmountSource(draft, period) : null;
    const amountRows = scopedProductRows(
      amountRead?.status === 'ready' ? amountRead.rows : [],
      draft.products,
    ).filter(
      (row) =>
        !selectedCategories.length ||
        matchesCategories(matchProduct(row['产品编码'], row['基地']).category, selectedCategories),
    );
    const monthlyAmount = sumSourceAmounts(amountRows, '月初计划金额');
    const finalAmount = sumSourceAmounts(amountRows, '最终计划金额');
    const amountText = `月初计划总金额：${monthlyAmount.amount === null ? '待补' : monthlyAmount.amount + '元'}；最终计划总金额：${finalAmount.amount === null ? '待补' : finalAmount.amount + '元'}`;
    const amountSummary =
      type === 'report' &&
      h(
        'div',
        { 'aria-label': '计划提报金额' },
        h('p', {}, amountText),
        amountRead?.status === 'loading' && h('p', { role: 'status' }, '正在读取金额…'),
        amountRows.some((row) => row['缺项原因']) &&
          h(
            'p',
            { className: 'dc-muted' },
            `金额来源有${amountRows.filter((row) => row['缺项原因']).length}条缺基地或产品编码。`,
          ),
        amountRead?.error &&
          h('p', { role: amountRead.status === 'failed' ? 'alert' : undefined }, amountRead.error),
        amountRead?.status === 'ready' && (monthlyAmount.missing || finalAmount.missing)
          ? h(
              'p',
              {},
              `月初金额缺${monthlyAmount.missing}条，最终金额缺${finalAmount.missing}条；已知小计分别为${monthlyAmount.knownAmount ?? '待补'}、${finalAmount.knownAmount ?? '待补'}元。`,
            )
          : null,
      );
    const downloadSource = (name, records, includeAll = false) => {
      const columns = business ? detailColumns : definition.columns;
      const sheets = [{ name: '当前明细', columns, rows: records }];
      if (includeAll) {
        const allRows = (
          type === 'forecast'
            ? forecastSourceRows(draft)
            : sourceDimensions(scopedProductRows(draft[type], draft.products), draft.products)
        ).filter((row) => matchesCategories(row['大类'], selectedCategories));
        if (allRows.some((row) => row['月份'] !== period))
          sheets.push({
            name: '全部已读明细',
            columns,
            rows: allRows,
          });
      }
      if (type === 'report' && amountRows.length)
        sheets.push(
          {
            name: '提报金额汇总',
            columns: [
              '评估月份',
              '来源',
              '读取状态',
              '月初计划总金额',
              '最终计划总金额',
              '月初已知小计',
              '最终已知小计',
              '月初缺项数',
              '最终缺项数',
              '读取说明',
            ],
            rows: [
              {
                评估月份: period,
                来源: amountRead?.sourceTable ?? 'ai_db.agents_scm_dws_scm_cust_plan_exe_di',
                读取状态: amountRead?.status ?? 'unread',
                月初计划总金额: monthlyAmount.amount ?? '',
                最终计划总金额: finalAmount.amount ?? '',
                月初已知小计: monthlyAmount.knownAmount ?? '',
                最终已知小计: finalAmount.knownAmount ?? '',
                月初缺项数: monthlyAmount.missing,
                最终缺项数: finalAmount.missing,
                读取说明: amountRead?.error ?? '',
              },
            ],
          },
          {
            name: '提报金额来源',
            columns: [
              '月份',
              '基地',
              '产品编码',
              '大类',
              '月初计划金额',
              '最终计划金额',
              '缺项原因',
            ],
            rows: sourceDimensions(amountRows, draft.products),
          },
        );
      return sheets.length === 1
        ? downloadCsv(name, columns, records)
        : downloadWorkbook(name.replace(/\.csv$/i, '.xlsx'), sheets);
    };
    const missing = rows.filter((row) => row[column] === '').length;
    const forecastReady =
      type !== 'forecast' || !business || draft.forecastRead?.status === 'ready';
    const unit = type === 'forecast' && business ? '（单位待确认）' : '件';
    const total =
      forecastReady && rows.some((row) => row[column] !== '') && (!business || !missing)
        ? quantity(rows, column)
        : null;
    const change = (changes) => {
      update(changes);
      setPage(0);
    };
    const grouped = dimensions.includes(preview)
      ? [...new Set(rows.map((row) => row[preview]))].map((name) => {
          const records = rows.filter((row) => row[preview] === name);
          return {
            名称: name,
            数量合计:
              forecastReady &&
              records.some((row) => row[column] !== '') &&
              (!business || records.every((row) => row[column] !== ''))
                ? quantity(records, column)
                : '',
          };
        })
      : [];
    const displayed = preview === '明细' ? rows : grouped;
    const columns = preview === '明细' ? detailColumns : ['名称', '数量合计'];
    return h(
      'section',
      { 'aria-label': definition.title, className: 'dc-card dc-source' },
      h(
        'div',
        { className: 'dc-card-head' },
        h('h3', {}, definition.title),
        h(
          'span',
          { className: 'dc-status' },
          sourcePending
            ? '加载中'
            : sourceRead?.status === 'failed'
              ? '读取失败'
              : draft.files[type]
                ? '本地文件'
                : business
                  ? '业务来源'
                  : '待同步',
        ),
        showSourceData &&
          rows.length > 0 &&
          h(
            'div',
            { className: 'mps-report-actions' },
            h(
              CalculationHelp,
              { title: definition.title + ' · 口径说明' },
              draft.files[type] && h('p', {}, `${draft.files[type]} · ${draft[type].length}条`),
              amountRead?.status === 'ready' &&
                h(
                  'p',
                  {},
                  `金额来源 ${amountRead.sourceTable ?? 'ai_db.agents_scm_dws_scm_cust_plan_exe_di'} · ${amountRows.length}条`,
                ),
              h(
                'p',
                {},
                `当前期间${rows.length}条，数量合计${total === null ? '未提供' : integer(total) + unit}，缺失数量${missing}条`,
              ),
              h(
                'p',
                {},
                dimensions
                  .map(
                    (dimension) =>
                      `${dimension}缺失${rows.filter((row) => !row[dimension]).length}条`,
                  )
                  .join('、'),
              ),
            ),
          ),
      ),
      h(
        'div',
        { className: 'dc-source-body' },
        h(
          'div',
          { className: 'dc-toolbar dc-period' },
          type === 'report' &&
            h(
              'label',
              {},
              '取数口径',
              h(
                'select',
                {
                  'aria-label': '提报口径',
                  value: draft.pull,
                  onChange: (event) => change({ pull: event.target.value }),
                },
                h('option', { value: 'monthly' }, '月初'),
                h('option', { value: 'adjust' }, '纠偏'),
              ),
            ),
          type === 'forecast' &&
            h(
              'label',
              {},
              '预测期间',
              h(
                'select',
                {
                  'aria-label': '预测期间',
                  value: draft.forecastOffset,
                  onChange: (event) => change({ forecastOffset: Number(event.target.value) }),
                },
                [1, 2].map((offset) =>
                  h(
                    'option',
                    { key: offset, value: offset },
                    `M+${offset} · ${monthOffset(draft.month, offset - 1)}`,
                  ),
                ),
              ),
            ),
          type === 'history' &&
            h(
              'label',
              {},
              '历史同期',
              h(
                'select',
                {
                  'aria-label': '历史同期',
                  value: draft.historyYears,
                  onChange: (event) => change({ historyYears: Number(event.target.value) }),
                },
                [1, 2, 3].map((years) =>
                  h(
                    'option',
                    { key: years, value: years },
                    `${['去年', '前年', '大前年'][years - 1]} · ${monthOffset(draft.month, -12 * years)}`,
                  ),
                ),
              ),
            ),
          type === 'report' && h('span', { className: 'dc-muted' }, period),
        ),
        showSourceData && business && amountSummary,
        showSourceData &&
          business &&
          type === 'history' &&
          h(
            'p',
            {},
            ['数量', '含赠品数量', '不含税收入']
              .map((field) => {
                const known = rows.length && rows.every((row) => row[field] !== '');
                return `${field === '数量' ? '发货数量' : field}：${known ? (field === '不含税收入' ? amount(quantity(rows, field)) + '元' : integer(quantity(rows, field)) + '件') : '未提供'}`;
              })
              .join('；'),
          ),
        showSourceData &&
          h(
            'div',
            { className: 'dc-coverage' },
            dimensions.map((dimension) =>
              h(
                'button',
                {
                  key: dimension,
                  disabled: !rows.length,
                  onClick: () => {
                    setPreview(dimension);
                    setPage(0);
                  },
                },
                h('span', {}, dimension === '产品编码' ? '产品' : dimension),
                ' ',
                h('b', {}, new Set(rows.map((row) => row[dimension]).filter(Boolean)).size),
              ),
            ),
          ),
        showSourceData &&
          !rows.length &&
          h(
            'p',
            { className: 'dc-empty' },
            type === 'report' && business && reportPeriodStatus === 'ready'
              ? '当前期间提报源未返回记录，数量待补。'
              : '当前期间无已读取记录，不能判定业务数据为零。',
          ),
        (sourcePending || (busy && (type !== 'report' || reportLoading))) &&
          h(
            'p',
            { role: 'status', className: 'dc-muted' },
            `正在读取 ${period} 的${definition.short}。`,
          ),
        error && h('p', { role: 'alert' }, error),
        !forecastReady &&
          rows.length > 0 &&
          h('p', {}, '保留上次预测证据，当前读取未成功，合计暂不可用。'),
      ),
      h(
        'div',
        { className: 'dc-source-actions' },
        h(
          'button',
          {
            disabled: !hasMpsSource() || busy,
            onClick: () => sync(type),
          },
          '同步',
        ),
        h(Upload, { label: `选择${definition.short}CSV`, read: (file) => read(type, file) }),
        h(
          'button',
          {
            'aria-label': '预览当前明细',
            disabled: !rows.length,
            onClick: () => {
              setPreview('明细');
              setPage(0);
            },
          },
          '预览',
        ),
        h(
          'button',
          {
            className: 'mps-download',
            'aria-label': `下载${definition.title}`,
            disabled: !rows.length && !draft[type].length,
            onClick: () => downloadSource(`${definition.short}-${period}.csv`, rows, true),
          },
          '下载',
        ),
      ),
      preview &&
        showSourceData &&
        rows.length > 0 &&
        h(
          Dialog,
          {
            title: `${definition.short} · ${period} · ${preview}核对`,
            className: preview === '明细' ? 'dc-source-detail' : '',
            close: () => setPreview(null),
            footer: h(
              'button',
              {
                className: 'dc-primary mps-download',
                onClick: () =>
                  preview === '明细'
                    ? downloadSource(`${definition.short}-${period}.csv`, rows)
                    : downloadCsv(
                        `${definition.short}-${period}-${preview}汇总.csv`,
                        columns,
                        grouped,
                      ),
              },
              preview === '明细' ? '下载明细' : '导出维度汇总',
            ),
          },
          amountSummary,
          table(
            columns,
            displayed.slice(page * 25, (page + 1) * 25),
            Object.fromEntries(
              columns.map((column) => [
                column,
                /收入|金额/.test(column)
                  ? `${column}（元）`
                  : /数量/.test(column)
                    ? `${column}（${unit === '件' ? '件' : '单位待确认'}）`
                    : column,
              ]),
            ),
          ),
          renderTablePagination(h, {
            label: definition.title,
            page,
            total: displayed.length,
            onPageChange: setPage,
          }),
        ),
    );
  }
  function Annual({
    draft,
    selection,
    read,
    sync,
    readAnnualPool,
    update,
    error,
    busy,
    exportAnnual,
    exporting,
    exportError,
    progressive,
    selectedCategories = [],
  }) {
    const [expanded, setExpanded] = react.useState(false);
    const [preview, setPreview] = react.useState(null);
    const [previewAttempt, setPreviewAttempt] = react.useState(0);
    const live = draft.annualSource === 'business';
    const initialPending = progressive && !draft.files.annual && isReading(draft.annualRead);
    react.useEffect(() => {
      if (!expanded || !live) return;
      let current = true;
      setPreview(null);
      void readAnnualPool(false, { full: true }).then(
        ({ rows }) => {
          if (current) setPreview({ rows });
        },
        (error) => {
          if (current) setPreview({ error: error.message });
        },
      );
      return () => {
        current = false;
      };
    }, [expanded, live, previewAttempt]);
    const unit = live ? '源数量' : '件';
    const {
      bases,
      base,
      rows: allAnnual,
    } = react.useMemo(
      () =>
        live && preview?.rows ? annualSelection({ ...draft, annual: preview.rows }) : selection,
      [live, preview, selection, draft.products, draft.productRaw, draft.annualBase],
    );
    const annual = allAnnual.filter((row) => matchesCategories(row['大类'], selectedCategories));
    const start = Number(draft.month.slice(0, 4)) - (Number(draft.month.slice(5)) < 7 ? 1 : 0);
    const months = Array.from({ length: 12 }, (_value, index) => monthOffset(`${start}-07`, index));
    const recordsFor = (category, month) =>
      annual.filter((row) => row['大类'] === category && row['月份'] === month);
    const missingReasons = (records) =>
      [
        ...new Set(
          records
            .filter((row) => row['数量'] === '')
            .map((row) => (row['重复记录数'] ? '源粒度重复' : '数量缺失')),
        ),
      ].join('、');
    const absolute = (category, month) => {
      const records = recordsFor(category, month);
      if (!records.length) return '-';
      const missing = records.filter((row) => row['数量'] === '').length;
      const total = quantity(records, '数量');
      return h(
        'details',
        {},
        h(
          'summary',
          {},
          `${missing === records.length ? '-' : integer(total)}${missing ? `（缺${missing}条）` : ''}`,
        ),
        h(
          'p',
          {},
          `公式：同月同大类有效数量相加；结果：${missing === records.length ? '-' : integer(total) + unit}。${missing ? `缺项：${missingReasons(records)}。` : ''}`,
        ),
      );
    };
    const ratio = (category, month) => {
      const current = recordsFor(category, month),
        previous = recordsFor(category, monthOffset(month, -1));
      if (
        !current.length ||
        !previous.length ||
        [...current, ...previous].some((row) => row['数量'] === '')
      )
        return h('span', { title: '缺少完整相邻月数据' }, '-');
      const before = quantity(previous, '数量'),
        after = quantity(current, '数量');
      if (!before) return '分母为0';
      const result = ((after / before - 1) * 100).toLocaleString('zh-CN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
      return h(
        'details',
        {},
        h('summary', {}, `${result}%`),
        h(
          'p',
          {},
          `公式：（本月数量÷上月数量－1）×100%；结果：${result}%。仅用于文件环比核对，显示保留两位小数。`,
        ),
      );
    };
    const annualTotal = (category) => {
      const records = annual.filter(
        (row) => row['大类'] === category && months.includes(row['月份']),
      );
      if (!records.some((row) => row['数量'] !== '')) return '-';
      const total = quantity(records, '数量');
      const missing = missingReasons(records);
      return h(
        'details',
        {},
        h('summary', {}, `${integer(total)}（已读）`),
        h(
          'p',
          {},
          `公式：7月至次年6月同大类已读有效数量相加；结果：${integer(total)}${unit}。${missing ? `缺项：${missing}。` : ''}未覆盖月份不补零，完整年度仍需核齐。`,
        ),
      );
    };
    const displayedCategories = [
      ...new Set(
        annual
          .map((row) => row['大类'])
          .concat(draft.products.map((row) => row['大类']))
          .filter(Boolean),
      ),
    ];
    const previewReady = expanded && !initialPending && (!live || preview?.rows);
    const rows = (previewReady ? displayedCategories : [])
      .filter((category) => matchesCategories(category, selectedCategories))
      .map((category) => ({
        大类: category || '-',
        ...Object.fromEntries(
          months.map((month) => [
            month,
            h(
              'div',
              { className: 'dc-annual-cell' },
              absolute(category, month),
              h('small', {}, ratio(category, month)),
            ),
          ]),
        ),
        全年合计: annualTotal(category),
      }));
    return h(
      'section',
      { 'aria-label': '年度销售计划' },
      h(
        'details',
        {
          className: 'dc-card dc-annual mps-report-details',
          open: expanded,
          onToggle: (event) => {
            if (event.target === event.currentTarget) setExpanded(event.currentTarget.open);
          },
        },
        h(
          'summary',
          null,
          h('span', null, '年度销售计划（分月）'),
          h('span', { className: 'dc-count' }, `${start}年7月–${start + 1}年6月`),
        ),
        h(
          'div',
          { className: 'dc-toolbar dc-report-filters mps-disclosure-toolbar' },
          live &&
            h(
              'select',
              {
                'aria-label': '年度需求基地',
                value: base,
                onChange: (event) => update({ annualBase: event.target.value }),
              },
              bases.map((name) => h('option', { key: name, value: name }, name)),
            ),
          !live &&
            h('span', { className: 'dc-status' }, draft.files.annual ? '本地文件' : '未接入'),
          h(
            'div',
            { className: 'mps-report-actions' },
            h(
              CalculationHelp,
              { title: '年度销售计划 · 口径说明' },
              h('p', null, '每月先列计划量，再列较上月的增减幅度。'),
            ),
            h(
              'button',
              {
                disabled: !hasMpsSource() || busy,
                onClick: () => {
                  void sync('annual', undefined, { refreshAnnualPool: true });
                  setPreviewAttempt((attempt) => attempt + 1);
                },
              },
              busy ? '同步中…' : '同步数据源',
            ),
            h(Upload, { label: '选择年度计划CSV', read: (file) => read('annual', file) }),
            h(
              'button',
              {
                className: 'mps-download',
                disabled: (!draft.annual.length && !preview?.rows?.length) || exporting || busy,
                onClick: () =>
                  live
                    ? exportAnnual(months, base)
                    : downloadCsvLegacy('年度计划-全部已读.csv', annualColumns, annual),
              },
              exporting ? '正在导出…' : live ? '下载年度SKU模板' : '下载',
            ),
          ),
        ),
        initialPending && expanded && h('p', { role: 'status' }, '正在读取年度计划。'),
        error && h('p', { role: 'alert' }, error),
        exportError && h('p', { role: 'alert' }, exportError),
        previewReady
          ? table(['大类', ...months, '全年合计'], rows)
          : expanded &&
              !initialPending &&
              live &&
              (preview?.error
                ? h(
                    'p',
                    { role: 'alert' },
                    preview.error,
                    ' ',
                    h(
                      'button',
                      {
                        onClick: () => setPreviewAttempt((attempt) => attempt + 1),
                      },
                      '重试全年预览',
                    ),
                  )
                : h('p', { role: 'status' }, '正在读取全年销售计划…')),
      ),
    );
  }
  const MasterData = createMasterData(react, { Dialog, table, downloadCsv, useMpsPart });
  const ProductScopeReport = createProductScopeReport(react, {
    table,
    downloadCsv: downloadCsvLegacy,
  });
  const DeliveryMetrics = createDeliveryMetrics(react, { table, downloadCsv, useMpsPart });
  const MonthPicker = createMonthPicker(react);
  const { useBatchEdit, Actions } = createBatchEdit(react);
  const Workflow = createWorkflow(react, useMpsPart, {
    createPortal,
    Dialog,
    Upload,
    parseCsv,
    downloadCsv: downloadCsvLegacy,
    downloadAmounts: downloadCsv,
  });
  const SourceInputs = createSourceInputs(react, {
    Dialog,
    table,
    downloadCsv,
    useMpsPart,
  });
  const Shipment = createShipment(react, useMpsPart, {
    createPortal,
    Button,
    Dialog,
    Upload,
    parseCsv,
    downloadCsv: downloadCsvLegacy,
    monthOffset,
  });
  return function DemandConfirmation({
    active: requestedActive = true,
    step = 'check',
    onScopeChange,
    relations,
    masterData,
    onEditingChange,
  }) {
    const canPersistLocal = react.useRef(true);
    const restoredView = react.useRef(false);
    const active = requestedActive && canPersistLocal.current;
    const initialDrafts = () => ({
      drafts: [{ ...makeDraft('local-1', currentMonth()), productPeriod: null }],
      selected: 'local-1',
    });
    const [localState, setLocalState] = react.useState(() =>
      decodeLocalDrafts(view.get().localDrafts, makeDraft, initialDrafts),
    );
    const { drafts, selected } = localState;
    const localRef = react.useRef(localState);
    const [adjusting, setAdjusting] = react.useState(false);
    const [adjustmentActionsTarget, setAdjustmentActionsTarget] = react.useState(null);
    react.useEffect(() => {
      onEditingChange?.(adjusting);
      return () => onEditingChange?.(false);
    }, [adjusting, onEditingChange]);
    const [retentionError, setRetentionError] = react.useState('');
    const saveLocal = (next) => {
      if (!canPersistLocal.current) return;
      localRef.current = next;
      setLocalState(next);
      try {
        view.update({ localDrafts: encodeLocalDrafts(next.drafts, next.selected) });
        setRetentionError('');
      } catch {
        setRetentionError('本地草稿尚未保存，请导出核对底稿后再离开页面。');
      }
    };
    const setDrafts = (next) => {
      const current = localRef.current;
      saveLocal({ ...current, drafts: typeof next === 'function' ? next(current.drafts) : next });
    };
    const setSelected = (selected) => saveLocal({ ...localRef.current, selected });
    const [actualMonth, setActualMonth] = react.useState(currentMonth);
    const evaluationMonths = [
      actualMonth,
      monthOffset(actualMonth, 1),
      monthOffset(actualMonth, 2),
    ];
    const savedMonths = [...new Set(drafts.map((entry) => entry.month))]
      .filter((month) => !evaluationMonths.includes(month))
      .sort()
      .reverse();
    const [month, setMonth] = react.useState(currentMonth);
    const [product, setProduct] = react.useState(blankProduct);
    const [editing, setEditing] = react.useState(null);
    const [editorOpen, setEditorOpen] = react.useState(false);
    const [versionOpen, setVersionOpen] = react.useState(false);
    const [versionName, setVersionName] = react.useState('');
    const [reference, setReference] = react.useState('');
    const [compareOpen, setCompareOpen] = react.useState(false);
    const [compareId, setCompareId] = react.useState('local-1');
    const [helpOpen, setHelpOpen] = react.useState(false);
    const helpId = react.useId();
    const [submissionWarningOpen, setSubmissionWarningOpen] = react.useState(false);
    const [error, setError] = react.useState('');
    const [search, setSearch] = react.useState('');
    const [sharedCategories, setSharedCategories] = react.useState([]);
    const [productPage, setProductPage] = react.useState(0);
    const [productPageSize, setProductPageSize] = react.useState(10);
    const [productDetails, setProductDetails] = react.useState(null);
    const [masterOpen, setMasterOpen] = react.useState(false);
    const [errors, setErrors] = react.useState({});
    const [busy, setBusy] = react.useState({});
    const [scopeGeneration, setScopeGeneration] = react.useState(0);
    const renewScope = () => setScopeGeneration((generation) => generation + 1);
    const refreshPage = react.useRef(null);
    const refreshShipment = react.useRef(null);
    const [refreshingStep, setRefreshingStep] = react.useState(null);
    const refreshInProgress = react.useRef(null);
    const [relationsRefresh, refreshRelations] = react.useReducer((attempt) => attempt + 1, 0);
    const [refreshNotice, setRefreshNotice] = react.useState(null);
    const [shipmentSnapshot, setShipmentSnapshot] = react.useState(null);
    const [sourceProgress, setSourceProgress] = react.useState(null);
    const [retrying, setRetrying] = react.useState(false);
    const [readAttempts, setReadAttempts] = react.useState({});
    const unstableRead = react.useRef(false);
    const inventoryPrefetchScope = react.useRef(null);
    const inventoryReadScope = react.useRef(null);
    const loadingClock = react.useRef(null);
    const workflowStep = react.useRef({ scope: '', step: null });
    const receiveShipment = react.useCallback(
      (snapshot) => {
        if (snapshot.shipmentMonth !== monthOffset(snapshot.month, -1)) return;
        if (snapshot.status === 'cancelled') {
          setShipmentSnapshot((current) =>
            current?.requestId === snapshot.requestId && current.scopeGeneration === scopeGeneration
              ? null
              : current,
          );
          return;
        }
        setShipmentSnapshot({ ...snapshot, scopeGeneration });
      },
      [scopeGeneration],
    );
    const generation = react.useRef(0),
      requests = react.useRef({}),
      controllers = react.useRef({});
    const annualPools = react.useRef({});
    const clearFiles = () => {
      generation.current++;
      refreshInProgress.current = null;
      setRefreshingStep(null);
      setRefreshNotice(null);
      Object.values(controllers.current).forEach((controller) => controller.abort());
      controllers.current = {};
      annualPools.current = {};
      requests.current = {};
      setErrors({});
      setBusy({});
      setSourceProgress(null);
      setRetrying(false);
      unstableRead.current = false;
    };
    const sourceRead = (entry, type, period, read) =>
      period
        ? {
            ...entry[type + 'Read'],
            periods: {
              ...entry[type + 'Read']?.periods,
              ...Object.fromEntries(
                (Array.isArray(period) ? period : [period]).map((month) => [month, read]),
              ),
            },
          }
        : read;
    const begin = (type, period) => {
      if (!canPersistLocal.current) return { signal: AbortSignal.abort(), valid: () => false };
      controllers.current[type]?.abort();
      const controller = new AbortController();
      controllers.current[type] = controller;
      const epoch = generation.current;
      const request = (requests.current[type] ?? 0) + 1;
      requests.current[type] = request;
      setBusy((state) => ({ ...state, [type]: true }));
      if (!Array.isArray(period)) setErrors((state) => ({ ...state, [type]: '' }));
      setDrafts((entries) =>
        entries.map((entry) =>
          entry.id === selected
            ? { ...entry, [type + 'Read']: sourceRead(entry, type, period, { status: 'loading' }) }
            : entry,
        ),
      );
      return {
        signal: controller.signal,
        valid: () =>
          canPersistLocal.current &&
          !controller.signal.aborted &&
          epoch === generation.current &&
          requests.current[type] === request,
      };
    };
    const exportAnnual = async (months, base) => {
      const { signal, valid } = begin('annualExport');
      try {
        const products = sourceProductMappings(draft.products, draft.productRaw);
        const bases =
          base === '全国'
            ? [...new Set(products.map((product) => product['基地']).filter(Boolean))]
            : [base];
        const [skuRows, fullAnnual] = await Promise.all([
          Promise.all(bases.map((sourceBase) => readAnnualDetails(months, sourceBase, signal))),
          readAnnualPool(false, { full: true }),
        ]);
        const rows = skuRows.flat();
        const matchProduct = createSourceProductMatcher(products);
        const projected = rows.flatMap((row) => {
          const { category } = matchProduct(row.material_code, row.belong_base);
          if (!category) return [];
          return [
            {
              ...row,
              source_sub_category: row.sub_category,
              sub_category: category,
            },
          ];
        });
        const tables = annualWorkbookTables(
          projected.filter((row) => matchesCategories(row.sub_category, selectedCategories)),
          months,
          base,
          annualSelection({ ...draft, annual: fullAnnual.rows }).rows.filter((row) =>
            matchesCategories(row['大类'], selectedCategories),
          ),
          bases,
        );
        const bytes = await workbookBytes(tables);
        if (valid())
          downloadFile(
            `年度销售计划-${base}-${months[0]}至${months.at(-1)}.xlsx`,
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            bytes,
          );
      } catch (failure) {
        if (valid()) setErrors((state) => ({ ...state, annualExport: failure.message }));
      } finally {
        if (valid()) setBusy((state) => ({ ...state, annualExport: false }));
      }
    };
    const readAnnualPool = (refresh = false, { full = false } = {}) => {
      const key = full && hasSourceCalculation('annual-pool') ? 'full' : 'calculation';
      if (refresh && !full && annualPools.current.full?.settled) delete annualPools.current.full;
      const current = annualPools.current[key];
      if (current && (!refresh || !current.settled)) return current.result;
      const controller = new AbortController();
      controllers.current['annualPool-' + key] = controller;
      const entry = { settled: false };
      entry.result = readSourceTable(
        'annual-pool',
        draft.month,
        controller.signal,
        undefined,
        full ? -1 : undefined,
        { full },
      ).then(
        (result) => {
          entry.settled = true;
          return result;
        },
        (error) => {
          if (annualPools.current[key] === entry) delete annualPools.current[key];
          throw error;
        },
      );
      annualPools.current[key] = entry;
      return entry.result;
    };
    const sync = async (
      type,
      requestedPeriods,
      { restoreProducts = false, retainPeriod = true, refreshAnnualPool = false } = {},
    ) => {
      const id = draft.id;
      const fact = ['report', 'history', 'delivery'].includes(type);
      const sourceTable = type === 'forecast' || type === 'delivery';
      const period =
        type === 'delivery'
          ? (draft.deliveryMonth ?? draft.month)
          : fact
            ? sourcePeriod(draft, type)
            : undefined;
      const periods = requestedPeriods
        ? [...requestedPeriods]
        : type === 'report'
          ? [period, monthOffset(period, 1), monthOffset(period, 2)]
          : [period];
      if (type === 'report' && requestedPeriods) {
        const current = localRef.current.drafts.find((entry) => entry.id === id);
        for (const [month, read] of Object.entries(current?.reportRead?.periods ?? {})) {
          if (read.status === 'loading' && !periods.includes(month)) periods.push(month);
        }
      }
      const { signal, valid } = begin(
        type,
        type === 'report' ? periods : (requestedPeriods ?? period),
      );
      const syncAmounts = async (month) => {
        let amounts;
        try {
          amounts = await readReportAmounts(month, signal);
        } catch (error) {
          if (!valid()) return;
          amounts = { period: month, rows: [], status: 'failed', error: readFailureText(error) };
        }
        if (valid())
          setDrafts((entries) =>
            entries.map((entry) =>
              entry.id === id
                ? { ...entry, reportAmounts: { ...entry.reportAmounts, [month]: amounts } }
                : entry,
            ),
          );
      };
      for (const readPeriod of periods) {
        if (!valid()) return;
        try {
          const result =
            type === 'products'
              ? restoreProducts && (draft.productReadPeriod ?? draft.productPeriod)
                ? await readProductSnapshot(draft.productReadPeriod ?? draft.productPeriod, signal)
                : await readProducts(draft.productMonth ?? draft.month, signal)
              : type === 'annual'
                ? (await readAnnualPool(refreshAnnualPool)).rows
                : sourceTable
                  ? await readSourceTable(
                      type,
                      type === 'forecast' ? draft.month : readPeriod,
                      signal,
                      undefined,
                      -1,
                    )
                  : await readFactMonth(
                      type,
                      readPeriod,
                      signal,
                      type === 'history' ? -1 : readPeriod === draft.month ? 3 : undefined,
                    );
          if (!valid()) return;
          if (readPeriod === period)
            setErrors((state) => (state[type] ? { ...state, [type]: '' } : state));
          setDrafts((entries) =>
            entries.map((entry) =>
              entry.id === id
                ? {
                    ...entry,
                    [type]: fact
                      ? [
                          ...(entry[type + 'Source'] === 'business'
                            ? entry[type].filter((row) => row['月份'] !== readPeriod)
                            : []),
                          ...result.rows,
                        ]
                      : type === 'products' || type === 'forecast'
                        ? result.rows
                        : result,
                    ...(fact || sourceTable
                      ? {
                          [type + 'Source']: 'business',
                          ...(readPeriod === period || !fact
                            ? { [type + 'Metadata']: result.metadata }
                            : {}),
                        }
                      : {}),
                    ...(type === 'report'
                      ? {
                          reportAmounts: {
                            ...entry.reportAmounts,
                            [readPeriod]: { period: readPeriod, rows: [], status: 'loading' },
                          },
                        }
                      : {}),
                    ...(type === 'products'
                      ? {
                          productSource: 'business',
                          productRaw: result.raw,
                          productReadPeriod: result.period,
                          ...(retainPeriod
                            ? {
                                productPeriod: {
                                  targetMonth: result.period.targetMonth,
                                  adoptedMonth: result.period.adoptedMonth,
                                },
                              }
                            : {}),
                          productPrices: result.period.adoptedMonth
                            ? { status: 'loading' }
                            : undefined,
                        }
                      : type === 'annual'
                        ? { annualSource: 'business' }
                        : {}),
                    files: { ...entry.files, [type]: null },
                    [type + 'Read']: sourceRead(entry, type, readPeriod, {
                      status: 'ready',
                      metadata: result.metadata,
                    }),
                  }
                : entry,
            ),
          );
          if (type === 'report') void syncAmounts(readPeriod);
          if (type === 'products') {
            resetEditor();
            controllers.current.productPrices?.abort();
            if (result.period.adoptedMonth) {
              const priceController = new AbortController();
              controllers.current.productPrices = priceController;
              void readProductPrices(priceController.signal).then(
                (prices) => {
                  if (!priceController.signal.aborted && canPersistLocal.current)
                    setDrafts((entries) =>
                      entries.map((entry) =>
                        entry.id === id ? { ...entry, productPrices: prices } : entry,
                      ),
                    );
                },
                () => {},
              );
            }
          }
        } catch (failure) {
          if (valid()) {
            const error = readFailureText(failure);
            if (readPeriod === period) setErrors((state) => ({ ...state, [type]: error }));
            setDrafts((entries) =>
              entries.map((entry) =>
                entry.id === id
                  ? {
                      ...entry,
                      [type + 'Read']: sourceRead(entry, type, readPeriod, {
                        status: 'failed',
                        error,
                      }),
                    }
                  : entry,
              ),
            );
          }
        }
      }
      if (valid()) setBusy((state) => ({ ...state, [type]: false }));
    };
    const syncInventoryTargets = async ({ prefetch = false } = {}) => {
      const id = draft.id;
      inventoryReadScope.current = workflowScope;
      if (prefetch) inventoryPrefetchScope.current = workflowScope;
      const { signal, valid } = begin('inventoryTargets');
      try {
        const businessDate = mpsBusinessDate();
        const sourceMonth = defaultInventoryMonth(businessDate);
        const result = await readInventoryTargets(
          sourceMonth,
          sourceMonth,
          signal,
          prefetch ? -2 : undefined,
        );
        result.metadata.businessDate = businessDate;
        if (valid())
          setDrafts((entries) =>
            entries.map((entry) =>
              entry.id === id
                ? {
                    ...entry,
                    inventoryTargets: result.rows,
                    inventoryTargetsRead: { status: 'ready', metadata: result.metadata },
                  }
                : entry,
            ),
          );
      } catch (failure) {
        if (valid()) {
          if (prefetch) inventoryReadScope.current = null;
          setDrafts((entries) =>
            entries.map((entry) =>
              entry.id === id
                ? {
                    ...entry,
                    inventoryTargets: [],
                    inventoryTargetsRead: { status: 'failed', error: readFailureText(failure) },
                  }
                : entry,
            ),
          );
        }
      } finally {
        if (valid()) setBusy((state) => ({ ...state, inventoryTargets: false }));
      }
    };
    const read = async (type, file) => {
      const id = draft.id;
      const previousRead = draft[type + 'Read'];
      const { valid } = begin(type);
      try {
        if (file.size > 5 * 1024 * 1024) throw Error('文件超过5 MiB上限，未读取任何行。');
        const rows = parseCsv(
          type === 'products' ? await productFileText(file) : await file.text(),
          type === 'products'
            ? productColumns
            : type === 'annual'
              ? annualColumns
              : sourceDefinitions[type].columns,
        );
        if (type === 'products') {
          const errors = productReplacementErrors(rows, [
            ...draft.products,
            ...productRows(draft.productRaw ?? []),
          ]);
          if (errors.length)
            throw Error(
              errors
                .slice(0, 20)
                .map(({ index, message }) => `第${index + 2}行${message}`)
                .join('；') + '。未替换原输入。',
            );
        }
        if (!valid()) return;
        setDrafts((entries) =>
          entries.map((entry) =>
            entry.id === id
              ? {
                  ...entry,
                  [type]: rows,
                  ...(type === 'products'
                    ? {
                        productSource: 'local-file',
                        productRaw: [],
                        productPeriod: undefined,
                        productReadPeriod: undefined,
                      }
                    : type === 'annual'
                      ? { annualSource: 'local-file' }
                      : { [type + 'Source']: 'local-file', [type + 'Metadata']: null }),
                  files: { ...entry.files, [type]: file.name },
                  [type + 'Read']: { status: 'ready' },
                }
              : entry,
          ),
        );
        setErrors((state) => ({ ...state, [type]: '' }));
        if (type === 'products') resetEditor();
      } catch (failure) {
        if (valid()) {
          setErrors((state) => ({ ...state, [type]: failure.message }));
          setDrafts((entries) =>
            entries.map((entry) =>
              entry.id === id
                ? { ...entry, [type + 'Read']: previousRead ?? { status: 'ready' } }
                : entry,
            ),
          );
        }
      } finally {
        if (valid()) setBusy((state) => ({ ...state, [type]: false }));
      }
    };
    const draft = drafts.find((entry) => entry.id === selected) ?? drafts[0];
    const {
      evaluation,
      save: setEvaluation,
      error: evaluationStorageError,
      loading: evaluationLoading,
    } = useMpsEvaluation(
      react,
      view,
      draft,
      scopeGeneration,
      active && ['capacity', 'report'].includes(step),
    );
    const productPricesLoading =
      draft.productSource === 'business' && draft.productPrices?.status === 'loading';
    const productMonth = draft.productMonth ?? draft.month;
    const activeProductPeriod = draft.productReadPeriod ?? draft.productPeriod;
    const adoptedMonth = activeProductPeriod?.adoptedMonth;
    let productPeriodNote;
    if (activeProductPeriod && productMonth !== activeProductPeriod.targetMonth) {
      productPeriodNote = `待同步 ${productMonth}，当前显示上次同步的清单`;
    } else if (adoptedMonth === null) {
      productPeriodNote = `目标 ${productMonth}，无可用产品清单`;
    } else if (adoptedMonth && adoptedMonth !== productMonth) {
      const missingStart = monthOffset(adoptedMonth, 1);
      const missingPeriod =
        missingStart === productMonth ? productMonth : `${missingStart} 至 ${productMonth}`;
      productPeriodNote = `目标 ${productMonth}，实际采用 ${adoptedMonth}${
        adoptedMonth < productMonth ? `，${missingPeriod} 无产品清单` : ''
      }`;
    }
    react.useEffect(() => setSubmissionWarningOpen(false), [draft.id, step]);
    const workflowScope = JSON.stringify([draft.id, draft.month, scopeGeneration]);
    const businessReadsReady = restoredView.current && Boolean(currentSessionId());
    const workflowViews = react.useRef(new Map());
    if (!workflowViews.current.has(workflowScope))
      workflowViews.current.set(workflowScope, new Map());
    const stepViews = workflowViews.current.get(workflowScope);
    if (!stepViews.has('process')) stepViews.set('process', createStepViewState());
    const [processCategories, setProcessCategories] = useStepViewField(
      react,
      stepViews.get('process'),
      'selectedCategories',
      () => [],
    );
    const processBatch = useBatchEdit({
      scope: workflowScope,
      view: stepViews.get('process'),
      requireReason: true,
      onStart: () => setProcessCategories(sharedCategories),
    });
    const processCategoryEditing = step === 'process' && processBatch.active;
    const selectedCategories = processCategoryEditing ? processCategories : sharedCategories;
    const setSelectedCategories = processCategoryEditing
      ? setProcessCategories
      : setSharedCategories;
    if (workflowStep.current.scope !== workflowScope)
      workflowStep.current = { scope: workflowScope, step: null };
    const workflowActive =
      active && ['process', 'constraints', 'capacity', 'report'].includes(step);
    if (workflowActive) workflowStep.current.step = step;
    const demandReadScope = react.useRef(null);
    const checkActive = active && step === 'check';
    if (businessReadsReady && (view.get().tab ?? step) === step && (checkActive || workflowActive))
      demandReadScope.current = workflowScope;
    const demandSourcesActive = active && demandReadScope.current === workflowScope;
    if (demandSourcesActive && loadingClock.current?.scope !== workflowScope)
      loadingClock.current = { scope: workflowScope, started: performance.now() };
    const reportReadProgress = (kind, progress) =>
      setSourceProgress((previous) => ({
        ...(previous?.scope === workflowScope ? previous : { scope: workflowScope }),
        [kind]: progress,
      }));
    const retrySource = (kind) =>
      setReadAttempts((previous) => ({ ...previous, [kind]: (previous[kind] ?? 0) + 1 }));
    react.useEffect(() => {
      const queries = new Set();
      const onRetry = ({ detail: { retry, active } }) => {
        if (active) {
          queries.add(retry);
          unstableRead.current = true;
        } else queries.delete(retry);
        setRetrying(queries.size > 0);
      };
      window.addEventListener('mps-read-retry', onRetry);
      return () => window.removeEventListener('mps-read-retry', onRetry);
    }, []);
    const secondaryReadScope = react.useRef(null);
    const readSettled = (read) =>
      read?.month === draft.month && ['ready', 'failed'].includes(read.status);
    if (
      demandSourcesActive &&
      (workflowActive ||
        (readSettled(draft.sourceChecksRead) && readSettled(draft.historicalIndicatorsRead)))
    )
      secondaryReadScope.current = workflowScope;
    const secondarySourcesActive =
      demandSourcesActive && secondaryReadScope.current === workflowScope;
    react.useEffect(() => {
      onScopeChange?.({
        id: draft.id,
        month: draft.month,
        name: draft.name,
        generation: scopeGeneration,
      });
    }, [draft.id, draft.month, draft.name, scopeGeneration, onScopeChange]);
    const resetEditor = () => {
      setProductDetails(null);
      setProduct(blankProduct());
      setEditing(null);
      setEditorOpen(false);
      setError('');
      setSearch('');
      setProductPage(0);
    };
    react.useEffect(() => {
      const reset = () => {
        restoredView.current = false;
        canPersistLocal.current = false;
        clearFiles();
        renewScope();
        const empty = initialDrafts();
        localRef.current = empty;
        setLocalState(empty);
        resetEditor();
        setVersionOpen(false);
        setCompareOpen(false);
        setHelpOpen(false);
        setMasterOpen(false);
        setReference('');
        setVersionName('');
      };
      const restore = (snapshot) => {
        restoredView.current = true;
        clearFiles();
        const restored = decodeLocalDrafts(snapshot.localDrafts, makeDraft, initialDrafts);
        canPersistLocal.current = true;
        localRef.current = restored;
        setLocalState(restored);
        renewScope();
      };
      const stop = view.subscribe((snapshot, event) => {
        if (event === 'released') reset();
        else if (event === 'rejected')
          setRetentionError('工作台未能保存本地草稿，请导出核对底稿后再离开页面。');
        else restore(snapshot);
      });
      if (view.get().localDrafts) restore(view.get());
      const reconnect = () => {
        if (restoredView.current) renewScope();
      };
      window.addEventListener('gea-session-changing', reset);
      window.addEventListener('gea-session-changed', reconnect);
      window.addEventListener('gea-identity-changed', reset);
      window.addEventListener('pagehide', reset);
      return () => {
        clearFiles();
        stop();
        window.removeEventListener('gea-session-changing', reset);
        window.removeEventListener('gea-session-changed', reconnect);
        window.removeEventListener('gea-identity-changed', reset);
        window.removeEventListener('pagehide', reset);
      };
    }, []);
    react.useEffect(() => {
      if (!active) return;
      return registerMpsRefresh(() => refreshPage.current());
    }, [active]);
    react.useEffect(() => {
      if (!active) {
        clearFiles();
        setMasterOpen(false);
      }
    }, [active]);
    react.useEffect(() => {
      let current = true;
      if (
        active &&
        businessReadsReady &&
        hasMpsSource() &&
        (draft.productSource === 'business-unread' ||
          (draft.productSource === 'business' && draft.productsRead?.status === 'loading'))
      ) {
        ready.then(() => {
          if (current && canPersistLocal.current) {
            void sync('products', undefined, {
              restoreProducts: true,
              retainPeriod: Object.hasOwn(draft, 'productPeriod'),
            });
          }
        });
      }
      return () => {
        current = false;
      };
    }, [draft.id, draft.month, active, businessReadsReady, scopeGeneration]);
    react.useEffect(() => {
      let current = true;
      if (demandSourcesActive && hasMpsSource())
        ready.then(() => {
          if (
            current &&
            (!draft.annualSource ||
              (draft.annualSource === 'business' && draft.annualRead?.status === 'loading'))
          )
            void sync('annual');
        });
      return () => {
        current = false;
      };
    }, [draft.id, draft.month, demandSourcesActive, scopeGeneration]);
    react.useEffect(() => {
      let current = true;
      if (demandSourcesActive && hasMpsSource())
        ready.then(() => {
          if (current && canPersistLocal.current && !draft.files.report) void sync('report');
        });
      return () => {
        current = false;
      };
    }, [draft.id, draft.month, demandSourcesActive, scopeGeneration]);
    react.useEffect(() => {
      let current = true;
      if (secondarySourcesActive && hasMpsSource())
        ready.then(() => {
          if (current && canPersistLocal.current && !draft.files.history) void sync('history');
        });
      return () => {
        current = false;
      };
    }, [draft.id, draft.month, draft.historyYears, secondarySourcesActive, scopeGeneration]);
    react.useEffect(() => {
      let current = true;
      if (secondarySourcesActive && hasMpsSource())
        ready.then(() => {
          if (current && canPersistLocal.current && !draft.files.forecast) void sync('forecast');
        });
      return () => {
        current = false;
      };
    }, [draft.id, draft.month, secondarySourcesActive, scopeGeneration]);
    react.useEffect(() => {
      let current = true;
      if (secondarySourcesActive && hasMpsSource())
        ready.then(() => {
          if (current) void sync('delivery');
        });
      return () => {
        current = false;
      };
    }, [draft.id, draft.month, draft.deliveryMonth, secondarySourcesActive, scopeGeneration]);
    const readEpoch = generation.current;
    const update = (changes) =>
      setDrafts((entries) =>
        entries.map((entry) => (entry.id === draft.id ? { ...entry, ...changes } : entry)),
      );
    const updateSourceInputs = (changes) => {
      if (generation.current === readEpoch) update(changes);
    };
    const festivalEnabled = Boolean(draft.festivalBasis);
    const [festivalReadAttempt, retryFestivalHistory] = react.useReducer(
      (attempt) => attempt + 1,
      0,
    );
    react.useEffect(() => {
      if (!demandSourcesActive || !festivalEnabled) return;
      const controller = new AbortController();
      const month = draft.month;
      if (!hasMpsSource()) {
        update({ festivalHistoryRead: { month, status: 'failed', error: '节日发货来源尚未连接' } });
        return;
      }
      update({ festivalHistoryRead: { month, status: 'loading' } });
      ready
        .then(() => readSourceTable('festival-history', month, controller.signal))
        .then(({ rows }) => {
          if (!controller.signal.aborted)
            update({ festivalHistoryRead: { month, status: 'ready', rows } });
        })
        .catch((error) => {
          if (!controller.signal.aborted)
            update({
              festivalHistoryRead: { month, status: 'failed', error: readFailureText(error) },
            });
        });
      return () => controller.abort();
    }, [
      demandSourcesActive,
      festivalEnabled,
      draft.id,
      draft.month,
      scopeGeneration,
      festivalReadAttempt,
    ]);
    const refreshing =
      refreshingStep === step ||
      (step === 'ship' && shipmentSnapshot?.status === 'loading') ||
      (step === 'masterdata' && relations?.scopeKey === workflowScope && relations.busy);
    react.useEffect(() => {
      if (!refreshNotice) return;
      const timer = setTimeout(() => setRefreshNotice(null), 3000);
      return () => clearTimeout(timer);
    }, [refreshNotice]);
    refreshPage.current = () => {
      if (adjusting || refreshing || refreshInProgress.current) return;
      if (['capacity', 'report'].includes(step)) {
        const resultAvailable =
          evaluation?.draft.id === draft.id && evaluation.scopeGeneration === scopeGeneration;
        setRefreshNotice({
          step,
          text: resultAvailable ? '已显示最近一次评估结果' : '请先运行产能评估',
        });
        return;
      }
      if (!canPersistLocal.current || !hasMpsSource())
        throw Error('页面数据尚未连接，请先重新连接页面能力。');
      if (step === 'masterdata') {
        refreshRelations();
        return;
      }
      const shipment = step === 'ship' ? refreshShipment.current : null;
      if (step === 'ship' && !shipment) return;
      const refresh = async () => {
        switch (step) {
          case 'check':
            retrySource('basic');
            retrySource('parameters');
            if (festivalEnabled) retryFestivalHistory();
            await Promise.all([
              ['business', 'business-unread'].includes(draft.productSource) &&
                !busy.products &&
                sync('products', undefined, { restoreProducts: true }),
              (!draft.annualSource || draft.annualSource === 'business') &&
                !busy.annual &&
                sync('annual', undefined, { refreshAnnualPool: true }),
              !draft.files.report && !busy.report && sync('report', [draft.month]),
              !draft.files.history && !busy.history && sync('history'),
              !draft.files.forecast && !busy.forecast && sync('forecast'),
              !busy.delivery && sync('delivery'),
            ]);
            break;
          case 'ship':
            await shipment();
            break;
          case 'process':
            await Promise.all([
              !draft.files.report && !busy.report && sync('report'),
              !draft.files.forecast && !busy.forecast && sync('forecast'),
            ]);
            break;
          case 'constraints':
            if (!busy.inventoryTargets) await syncInventoryTargets();
            break;
        }
      };
      const request = Symbol();
      refreshInProgress.current = request;
      setRefreshingStep(step);
      void refresh()
        .catch((failure) => {
          if (refreshInProgress.current === request)
            setRefreshNotice({ step, text: failure.message });
        })
        .finally(() => {
          if (refreshInProgress.current !== request) return;
          refreshInProgress.current = null;
          setRefreshingStep(null);
        });
    };
    const editProducts = (products) =>
      update({
        products,
        productSource: draft.productSource.startsWith('demo') ? 'demo-edited' : 'local-edited',
      });
    const categorySources = react.useMemo(
      () => categorySourceInputs(draft),
      [
        draft.month,
        draft.products,
        draft.productRaw,
        draft.historicalIndicators,
        draft.historicalIndicatorsRead,
      ],
    );
    const currentRelations = relations?.scopeKey === workflowScope ? relations : null;
    const currentShipment =
      shipmentSnapshot?.scopeGeneration === scopeGeneration ? shipmentSnapshot : null;
    const primaryReads = demandLoadingItems(
      draft,
      currentShipment,
      sourceProgress?.scope === workflowScope ? sourceProgress : {},
      {
        products: () =>
          void sync('products', undefined, {
            restoreProducts:
              (draft.productMonth ?? draft.month) === activeProductPeriod?.targetMonth,
          }),
        shipment: () => retrySource('shipment'),
        report: () => void sync('report', [draft.month]),
        annual: () => void sync('annual', undefined, { refreshAnnualPool: true }),
        parameters: () => retrySource('parameters'),
        basic: () => retrySource('basic'),
      },
    );
    const governedCheck = checkActive && hasMpsSource();
    const demandLoading = governedCheck && primaryReads.some((item) => item.pending);
    const targetNeeded =
      active && businessReadsReady && ['constraints', 'capacity', 'report'].includes(step);
    const fastReady =
      checkActive &&
      demandSourcesActive &&
      !demandLoading &&
      draft.products.length > 0 &&
      currentShipment?.rows?.length > 0 &&
      primaryReads.every((item) => !item.issue && item.status !== '缺少输入');
    react.useEffect(() => {
      if (!hasMpsSource() || !targetNeeded || inventoryReadScope.current === workflowScope) return;
      let current = true;
      ready.then(() => {
        if (current && inventoryReadScope.current !== workflowScope) void syncInventoryTargets();
      });
      return () => {
        current = false;
      };
    }, [targetNeeded, workflowScope, draft.inventoryTargetsRead?.status]);
    react.useEffect(() => {
      if (!hasMpsSource() || !fastReady || !loadingClock.current || unstableRead.current) return;
      if (performance.now() - loadingClock.current.started > 20000) return;
      if (
        inventoryReadScope.current === workflowScope ||
        inventoryPrefetchScope.current === workflowScope
      )
        return;
      let idle;
      const cancel = () => {
        if (idle !== undefined) window.cancelIdleCallback(idle);
        idle = undefined;
      };
      const schedule = () => {
        cancel();
        if (!window.requestIdleCallback || !canPrefetchMps() || unstableRead.current) return;
        idle = window.requestIdleCallback(() => {
          idle = undefined;
          if (
            generation.current === readEpoch &&
            inventoryReadScope.current !== workflowScope &&
            inventoryPrefetchScope.current !== workflowScope &&
            canPrefetchMps() &&
            !unstableRead.current
          )
            void syncInventoryTargets({ prefetch: true });
        });
      };
      schedule();
      document.addEventListener('visibilitychange', schedule);
      window.addEventListener('offline', cancel);
      navigator.connection?.addEventListener?.('change', schedule);
      return () => {
        cancel();
        document.removeEventListener('visibilitychange', schedule);
        window.removeEventListener('offline', cancel);
        navigator.connection?.removeEventListener?.('change', schedule);
      };
    }, [fastReady, workflowScope]);
    const secondaryReads = governedCheck
      ? [
          loadingItem(
            '模型双期预测',
            draft.files.forecast ? { status: 'ready' } : draft.forecastRead,
            `${draft.month} 批次`,
            () => void sync('forecast'),
          ),
          loadingItem(
            '历史同期发货',
            draft.files.history
              ? { status: 'ready' }
              : draft.historyRead?.periods?.[sourcePeriod(draft, 'history')],
            sourcePeriod(draft, 'history'),
            () => void sync('history'),
          ),
          loadingItem(
            '基地多维发货指标',
            draft.deliveryRead?.periods?.[draft.deliveryMonth ?? draft.month],
            draft.deliveryMonth ?? draft.month,
            () => void sync('delivery'),
          ),
          loadingItem('上一财年发运占比', draft.historyAnnualRead),
          loadingItem('后续步骤的目标库存', draft.inventoryTargetsRead),
        ]
      : [];
    const hasBaseSkuAdjustment = (draft.adjustments?.quantities ?? []).some(
      (entry) => entry.kind === 'base-sku',
    );
    const needsWorkflow =
      step !== 'ship' &&
      (Boolean(workflowStep.current.step) || step === 'masterdata' || hasBaseSkuAdjustment);
    const workflowResult = react.useMemo(
      () =>
        needsWorkflow
          ? buildMpsWorkflow(draft, currentRelations, currentShipment, undefined, categorySources)
          : null,
      [needsWorkflow, draft, currentRelations, currentShipment, categorySources],
    );
    const lastWorkflowResult = react.useRef(null);
    if (workflowResult)
      lastWorkflowResult.current = { scope: workflowScope, result: workflowResult };
    const retainedWorkflowResult =
      lastWorkflowResult.current?.scope === workflowScope
        ? lastWorkflowResult.current.result
        : null;
    const submissionWarnings =
      checkActive &&
      draft.productSource !== 'business-unread' &&
      !['loading', 'failed'].includes(draft.productsRead?.status)
        ? poolSubmissionRows(
            workflowResult?.poolExceptions ?? submittedPoolExceptions(draft),
            draft.productRaw,
            currentRelations,
            selectedCategories,
          )
        : [];
    const categoryComputation = react.useMemo(() => {
      const result =
        workflowResult?.categoryComputation ??
        buildCategoryDemand(draft, currentShipment, undefined, categorySources);
      if (!hasBaseSkuAdjustment || !workflowResult) return result;
      return {
        ...result,
        rows: result.rows.map((row) => {
          const effective = workflowResult.categoryRows.find(
            (entry) => entry.month === row.month && entry.category === row.category,
          );
          return effective?.adjusted
            ? { ...row, quantity: effective.quantity, adjusted: true }
            : row;
        }),
      };
    }, [draft, currentShipment, categorySources, hasBaseSkuAdjustment, workflowResult]);
    const calculatedRows = categoryComputation.rows.filter((row) => row.quantity !== null).length;
    const demandBlocked =
      governedCheck &&
      !demandLoading &&
      calculatedRows === 0 &&
      primaryReads.some(
        ({ issue }) =>
          issue &&
          ['network', 'offline', 'connection', 'permission', 'unavailable'].includes(issue.kind),
      );
    const calculation = {
      status: !calculatedRows
        ? 'pending-inputs'
        : calculatedRows < categoryComputation.rows.length ||
            !categoryComputation.shipmentScope.ready ||
            categoryComputation.shipmentScope.excluded.length ||
            categoryComputation.shipmentScope.issues.length
          ? 'partially-calculated'
          : 'calculated',
      totalRows: categoryComputation.rows.length,
      calculatedRows,
      pendingRows: categoryComputation.rows.length - calculatedRows,
      excludedShipmentRows: categoryComputation.shipmentScope.excluded.length,
      monthlyCalculation: 'derived-from-current-inputs',
    };
    const productViews = react.useMemo(
      () =>
        productProjections(
          draft.products,
          ['loading', 'failed'].includes(draft.productsRead?.status) ? [] : draft.productRaw,
          ['report', 'history'].flatMap((source) =>
            sourceSelection(draft, source).rows.filter(
              (row) => draft[source + 'Read']?.periods?.[row['月份']]?.status === 'ready',
            ),
          ),
          ['loading', 'failed'].includes(draft.productsRead?.status)
            ? []
            : (draft.productPrices?.rows ?? []),
        ),
      [
        draft.productPrices,
        draft.products,
        draft.productRaw,
        draft.productsRead,
        draft.report,
        draft.history,
        draft.reportRead,
        draft.historyRead,
        draft.pull,
        draft.historyYears,
        draft.month,
      ],
    );
    const categoryProducts = productViews.filter(
      ({ display }) =>
        canonicalBaseName(display['基地']) !== 'ODM' &&
        matchesCategories(display['大类'], selectedCategories),
    );
    const exportedProductSourceRows = react.useMemo(
      () =>
        productSourceRows(draft.productRaw ?? []).filter((row) =>
          matchesCategories(row['大类'], selectedCategories),
        ),
      [draft.productRaw, selectedCategories],
    );
    const filteredProducts = [...categoryProducts]
      .sort((left, right) => compareBusinessRows(left.display, right.display))
      .filter(({ display, labels, replacementCodes, targetBases, sourcePeriods }) =>
        [
          ...Object.values(display),
          ...labels,
          ...replacementCodes,
          ...targetBases,
          ...sourcePeriods,
        ].some((value) => value.includes(search)),
      );
    const selectedProduct = productDetails === null ? null : productViews[productDetails];
    react.useEffect(
      () => setProductPage(0),
      [draft.id, draft.products, productPageSize, selectedCategories],
    );
    const saveProduct = (event) => {
      event.preventDefault();
      const normalized = Object.fromEntries(
        productColumns.map((column) => [column, product[column].trim()]),
      );
      if (editing === null) normalized['基地'] = '';
      if (productColumns.slice(1, 6).some((column) => !normalized[column])) {
        setError('产品编码、产品名称、大类、系列和物料组不能为空；全国产品基地可留空。');
        return;
      }
      const replacementErrors = productReplacementErrors(
        [normalized],
        [...draft.products, ...productRows(draft.productRaw ?? [])],
      );
      if (replacementErrors.length) {
        setError(replacementErrors[0].message + '。');
        return;
      }
      if (
        draft.products.some(
          (row, index) =>
            index !== editing &&
            row['基地'] === normalized['基地'] &&
            row['产品编码'] === normalized['产品编码'],
        )
      ) {
        setError('同一基地的产品编码重复，请编辑已有关系。');
        return;
      }
      editProducts(
        editing === null
          ? [{ ...normalized }, ...draft.products]
          : draft.products.map((row, index) => (index === editing ? { ...normalized } : row)),
      );
      resetEditor();
    };
    const sourceCategory = react.useMemo(
      () => createSourceProductMatcher(draft.products),
      [draft.products],
    );
    const sourceSelections = react.useMemo(
      () =>
        Object.fromEntries(
          Object.keys(sourceDefinitions).map((type) => [type, sourceSelection(draft, type)]),
        ),
      [draft],
    );
    const sourceSummaries =
      checkActive &&
      Object.fromEntries(
        Object.keys(sourceDefinitions).map((type) => {
          const { period, column, rows: fullRows } = sourceSelections[type];
          const rows = !selectedCategories.length
            ? fullRows
            : fullRows.filter((row) => matchesCategories(row['大类'], selectedCategories));
          const amountRead = type === 'report' ? reportAmountSource(draft, period) : null;
          const amountRows = scopedProductRows(
            amountRead?.status === 'ready' ? amountRead.rows : [],
            draft.products,
          ).filter(
            (row) =>
              !selectedCategories.length ||
              matchesCategories(
                sourceCategory(row['产品编码'], row['基地']).category,
                selectedCategories,
              ),
          );
          return [
            type,
            {
              period,
              column,
              businessSource:
                draft[type + 'Source'] === 'business'
                  ? type === 'forecast'
                    ? 'governed-sql'
                    : 'cube'
                  : 'not-read',
              localFile: draft.files[type] ?? null,
              rowCount: rows.length,
              quantity:
                (type !== 'forecast' ||
                  draft.forecastSource !== 'business' ||
                  draft.forecastRead?.status === 'ready') &&
                rows.some((row) => row[column] !== '') &&
                (draft[type + 'Source'] !== 'business' || rows.every((row) => row[column] !== ''))
                  ? quantity(rows, column)
                  : null,
              metadata: draft[type + 'Metadata'] ?? null,
              read: draft[type + 'Read'] ?? null,
              versions: type === 'report' ? ['月初数量', '纠偏数量'] : undefined,
              amounts:
                type === 'report'
                  ? {
                      period,
                      unit: '元',
                      status: amountRead?.status ?? 'unread',
                      sourceTable:
                        amountRead?.sourceTable ?? 'ai_db.agents_scm_dws_scm_cust_plan_exe_di',
                      rowCount: amountRows.length,
                      initialPlan: sumSourceAmounts(amountRows, '月初计划金额'),
                      finalPlan: sumSourceAmounts(amountRows, '最终计划金额'),
                      missingDimensions: amountRows.filter((row) => row['缺项原因']).length,
                      error: amountRead?.error ?? null,
                    }
                  : undefined,
              shipmentMetrics:
                type === 'history' && draft.historySource === 'business'
                  ? ['数量', '含赠品数量', '不含税收入']
                  : undefined,
              missingQuantity: rows.filter((row) => row[column] === '').length,
              missingReasons:
                type === 'forecast'
                  ? [...new Set(rows.map((row) => row['缺项原因']).filter(Boolean))]
                  : undefined,
              dimensions: Object.fromEntries(
                dimensions.map((dimension) => [
                  dimension,
                  {
                    count: new Set(rows.map((row) => row[dimension]).filter(Boolean)).size,
                    missing: rows.filter((row) => !row[dimension]).length,
                  },
                ]),
              ),
            },
          ];
        }),
      );
    const annualContext = react.useMemo(
      () => annualSelection(draft),
      [
        draft.month,
        draft.annual,
        draft.annualSource,
        draft.annualBase,
        draft.products,
        draft.productRaw,
      ],
    );
    useMpsPart(
      react,
      'check',
      {
        scope: hasMpsSource() ? 'business-read-local-draft' : 'local-check-only',
        annualSource: draft.annualSource ?? null,
        annualRowCount: draft.annual.length,
        annualSelection: {
          ...annualContext,
          rows: annualContext.rows.slice(0, 120),
          rowCount: annualContext.rows.length,
          truncated: annualContext.rows.length > 120,
        },
        visibleProducts: filteredProducts
          .slice(productPage * productPageSize, (productPage + 1) * productPageSize)
          .map(
            ({
              display,
              children,
              labels,
              replacementCodes,
              replacementNames,
              candidateBases,
              targetBases,
              sourcePeriods,
            }) => ({
              ...display,
              记录层级: children.length ? '物料组' : 'SKU或本地记录',
              源产品标签: labels.join(' / '),
              源替换物料编码: replacementCodes.join(' / '),
              源替换品名称: replacementNames.join(' / '),
              事实候选基地: candidateBases.join(' / '),
              源目标基地: targetBases.join(' / '),
              源统计月份: sourcePeriods.join(' / '),
            }),
          ),
        draft: { id: draft.id, name: draft.name, month: draft.month },
        productCount: draft.products.length,
        productSource: draft.productSource,
        productTargetMonth: draft.productMonth ?? draft.month,
        productPeriod: activeProductPeriod,
        sourceSummaries,
        calculation,
        businessSave: 'not-connected',
        retention: retentionError ? 'local-save-failed' : 'subject-session-scoped-local-draft',
      },
      '需求确认',
      checkActive,
    );
    const filterStep = ['check', 'ship', 'process', 'masterdata', 'constraints'].includes(step);
    const content = h(
      'div',
      { className: 'dc-page', hidden: !active },
      retentionError && h('p', { role: 'alert' }, retentionError),
      h(
        'header',
        {
          className: filterStep ? 'dc-page-head dc-page-head-sticky' : 'dc-page-head',
          onKeyDown: step === 'process' ? processBatch.keyDown : undefined,
        },
        h(
          'div',
          { className: 'dc-title-row' },
          h(
            'div',
            { className: 'dc-heading' },
            h(
              'h1',
              { className: active ? 'ap-board-title' : undefined },
              {
                check: '需求确认',
                ship: '本月预估发货',
                process: '需求加工与收敛',
                masterdata: '主数据对应关系',
                constraints: '约束与配置',
                capacity: '产能评估与缺口',
                report: '产销存报告',
              }[step],
            ),
            h(
              'button',
              {
                className: 'dc-help',
                type: 'button',
                'aria-label': '页面说明',
                'aria-expanded': helpOpen,
                'aria-controls': helpId,
                title: '页面说明',
                onClick: () => setHelpOpen((open) => !open),
              },
              h(
                'svg',
                {
                  width: 16,
                  height: 16,
                  viewBox: '0 0 24 24',
                  fill: 'none',
                  stroke: 'currentColor',
                  strokeWidth: 1.5,
                  'aria-hidden': true,
                },
                h('circle', { cx: 12, cy: 12, r: 9 }),
                h('path', { d: 'M12 10v7M12 7v1' }),
              ),
            ),
          ),
          h(
            'div',
            { className: 'dc-version-switch' },
            h(
              'div',
              { className: 'dc-version-fields' },
              filterStep &&
                h(CategoryFilter, {
                  key: step,
                  categories: [
                    ...new Set(
                      [
                        ...draft.products.map((row) => row['大类']),
                        ...categoryComputation.bases.map((row) => row.category),
                        ...(draft.shipment?.rows ?? []).map((row) => row.category),
                      ].filter(Boolean),
                    ),
                  ].sort((left, right) => compareBusinessValues('category', left, right)),
                  selected: selectedCategories,
                  change: setSelectedCategories,
                  disabled: adjusting,
                }),
              submissionWarnings.length > 0 &&
                h(
                  'button',
                  {
                    className: 'dc-submission-alert',
                    type: 'button',
                    'aria-label': `池外销售提报，${submissionWarnings.length} 条`,
                    onClick: () => setSubmissionWarningOpen(true),
                  },
                  h(
                    'svg',
                    {
                      viewBox: '0 0 24 24',
                      width: 16,
                      height: 16,
                      fill: 'none',
                      stroke: 'currentColor',
                      'aria-hidden': true,
                    },
                    h('path', {
                      d: 'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4',
                      strokeWidth: 1.5,
                      strokeLinecap: 'round',
                    }),
                  ),
                  submissionWarnings.length,
                ),
              h(
                'select',
                {
                  'aria-label': '评估月份选择',
                  disabled: adjusting,
                  value: draft.month,
                  onFocus: () => setActualMonth(currentMonth()),
                  onPointerDown: () => setActualMonth(currentMonth()),
                  onKeyDown: () => setActualMonth(currentMonth()),
                  onChange: (event) => {
                    const month = event.target.value;
                    const current = localRef.current;
                    if (
                      current.drafts.find((entry) => entry.id === current.selected)?.month === month
                    )
                      return;
                    const existing = current.drafts.find((entry) => entry.month === month);
                    const start = currentMonth();
                    if (!existing && (month < start || month > monthOffset(start, 2))) return;
                    const next = existing ?? {
                      ...makeDraft(
                        nextMpsDraftId(new Set(current.drafts.map((row) => row.id))),
                        month,
                      ),
                      productPeriod: null,
                    };
                    clearFiles();
                    saveLocal({
                      drafts: existing ? current.drafts : [...current.drafts, next],
                      selected: next.id,
                    });
                    resetEditor();
                  },
                },
                evaluationMonths.map((month) => h('option', { key: month, value: month }, month)),
                savedMonths.length > 0 &&
                  h(
                    'optgroup',
                    { label: '已保存月份' },
                    savedMonths.map((month) => h('option', { key: month, value: month }, month)),
                  ),
              ),
              h(
                'select',
                {
                  'aria-label': '评估版本选择',
                  className: 'dc-version-select',
                  title: versionLabel(draft.name),
                  disabled: adjusting,
                  value: draft.id,
                  onChange: (event) => {
                    if (event.target.value === localRef.current.selected) return;
                    clearFiles();
                    setSelected(event.target.value);
                    resetEditor();
                  },
                },
                drafts
                  .filter((entry) => entry.month === draft.month)
                  .map((entry) =>
                    h('option', { key: entry.id, value: entry.id }, versionLabel(entry.name)),
                  ),
              ),
            ),
            h(
              'div',
              { className: 'dc-version-actions' },
              h(
                'button',
                {
                  className: 'dc-version-new',
                  disabled: adjusting,
                  onClick: () => {
                    setVersionName('');
                    setActualMonth(currentMonth());
                    setMonth(currentMonth());
                    setReference('');
                    setVersionOpen(true);
                  },
                },
                '新建评估版本',
              ),
              h(
                'button',
                {
                  onClick: () => {
                    setCompareId(drafts.find((entry) => entry.id !== draft.id)?.id ?? draft.id);
                    setCompareOpen(true);
                  },
                },
                '版本对比',
              ),
              h(
                Button,
                {
                  type: 'default',
                  size: 'small',
                  loading: refreshing,
                  'aria-busy': refreshing,
                  loadingFixedWidth: true,
                  disabled:
                    adjusting ||
                    refreshingStep !== null ||
                    (!hasMpsSource() && !['capacity', 'report'].includes(step)),
                  onClick: () => {
                    try {
                      refreshPage.current();
                    } catch (failure) {
                      setRefreshNotice({ step, text: failure.message });
                    }
                  },
                },
                '刷新',
              ),
              h(
                'div',
                { ref: setAdjustmentActionsTarget, className: 'dc-adjustment-actions' },
                step === 'process' &&
                  h(Actions, {
                    batch: processBatch,
                    requireReason: true,
                    hint: '留空恢复人工导入，无导入时恢复系统值',
                  }),
              ),
            ),
          ),
        ),
        refreshNotice?.step === step &&
          h('p', { role: 'status', className: 'dc-report-message' }, refreshNotice.text),
        h(
          'section',
          { id: helpId, className: 'dc-page-help', hidden: !helpOpen, 'aria-label': '页面说明' },
          h(
            'div',
            { className: 'dc-page-help-copy' },
            h(
              'p',
              {},
              '评估版本、导入数据、约束与调整自动保存在本机。同一账号新建对话后，可以继续使用这些版本。业务数据按来源重新读取。',
            ),
            h(
              'p',
              {},
              '业务数据由月主计划授权读取。产品关系调整保留在本地版本，自身历史与替换品历史按系数合计。冲突口径和正式保存待接入。',
            ),
            h(
              'p',
              {},
              '底稿JSON保留当前版本全部已读输入，供人工核对；正式导入与底稿重载尚未接入。',
            ),
          ),
          h(
            'button',
            {
              className: 'mps-download',
              type: 'button',
              onClick: () =>
                downloadFile(
                  `MPS-${draft.month}-${draft.id}-核对底稿.json`,
                  'application/json',
                  JSON.stringify(
                    {
                      format: 'mps-local-review-v1',
                      scope: 'local-check-only',
                      exportedAt: new Date().toISOString(),
                      draft,
                      businessSave: 'not-connected',
                      calculation,
                    },
                    null,
                    2,
                  ),
                ),
            },
            '导出核对底稿',
          ),
        ),
        adjusting &&
          h(
            'p',
            { role: 'status', className: 'dc-card-note' },
            '请保存或取消当前调整，再切换步骤、月份或版本。',
          ),
      ),
      step === 'check' &&
        submissionWarningOpen &&
        h(
          Dialog,
          { title: '池外销售提报', close: () => setSubmissionWarningOpen(false) },
          table(['基地', 'SKU', '大类', '月份', '销售提报量', '原因'], submissionWarnings),
        ),
      versionOpen &&
        h(
          Dialog,
          {
            title: '新建评估版本',
            close: () => setVersionOpen(false),
            footer: h(
              react.Fragment,
              {},
              h('button', { onClick: () => setVersionOpen(false) }, '取消'),
              h(
                'button',
                {
                  className: 'dc-primary',
                  disabled: !evaluationMonths.includes(month),
                  onClick: () => {
                    const start = currentMonth();
                    if (month < start || month > monthOffset(start, 2)) return;
                    const id = nextMpsDraftId(new Set(drafts.map((row) => row.id))),
                      base = drafts.find((entry) => entry.id === reference);
                    const next = {
                      ...(base ? structuredClone(base) : makeDraft(id, month)),
                      id,
                      month,
                      productPeriod: null,
                      ...(base?.productSource.startsWith('business')
                        ? {
                            productSource: 'business-unread',
                            productReadPeriod: undefined,
                            products: [],
                            productRaw: [],
                            productPrices: undefined,
                            productsRead: undefined,
                          }
                        : {}),
                      ...(base
                        ? {
                            shipment: base.shipment?.rows
                              ? {
                                  rows: structuredClone(base.shipment.rows),
                                  file: base.shipment.file,
                                  values: {},
                                  remaining: {},
                                }
                              : undefined,
                          }
                        : {}),
                      ...(base && base.month !== month
                        ? {
                            adjustments: undefined,
                            demandImports: undefined,
                          }
                        : {}),
                      name: versionName.trim() || makeDraft(id, month).name,
                    };
                    clearFiles();
                    saveLocal({ drafts: [...drafts, next], selected: id });
                    resetEditor();
                    setVersionOpen(false);
                  },
                },
                '创建本地版本',
              ),
            ),
          },
          h(
            'div',
            { className: 'dc-product-form' },
            h(MonthPicker, {
              label: '评估月份',
              name: 'evaluationMonth',
              min: evaluationMonths[0],
              max: evaluationMonths[2],
              value: month,
              onChange: setMonth,
            }),
            h(
              'label',
              {},
              '版本名称',
              h('input', {
                'aria-label': '版本名称',
                value: versionName,
                placeholder: '如：10月滚动评估 · 第2版',
                onChange: (event) => setVersionName(event.target.value),
              }),
            ),
            h(
              'label',
              {},
              '参考版本',
              h(
                'select',
                {
                  'aria-label': '参考版本',
                  value: reference,
                  onChange: (event) => setReference(event.target.value),
                },
                h(
                  'option',
                  { value: '' },
                  hasMpsSource() ? '不复制已读输入' : '不复制本地输入，使用演示产品',
                ),
                drafts.map((entry) => h('option', { key: entry.id, value: entry.id }, entry.name)),
              ),
            ),
          ),
          h('p', { className: 'dc-muted' }, '评估版本自动保存在本机，同一账号的新对话可继续使用。'),
        ),
      compareOpen &&
        h(
          Dialog,
          {
            title: '版本对比',
            close: () => setCompareOpen(false),
          },
          h('p', {}, '仅对比本地草稿输入，不代表业务版本快照或已确认计划。'),
          h(
            'label',
            {},
            '对比版本',
            h(
              'select',
              {
                'aria-label': '对比版本选择',
                value: compareId,
                onChange: (event) => setCompareId(event.target.value),
              },
              drafts.map((entry) => h('option', { key: entry.id, value: entry.id }, entry.name)),
            ),
          ),
          h(
            'p',
            {},
            `当前：${draft.name}；参考：${drafts.find((entry) => entry.id === compareId)?.name}`,
          ),
          table(
            ['项目', '当前版本', '参考版本'],
            ['month', 'products', 'annual', 'report', 'forecast', 'history'].map((key) => ({
              项目: {
                month: '评估月份',
                products: '产品关系数量',
                annual: '年度计划记录',
                report: '计划提报记录',
                forecast: '模型预测记录',
                history: '历史发货记录',
              }[key],
              当前版本: key === 'month' ? draft.month : draft[key].length,
              参考版本:
                key === 'month'
                  ? drafts.find((entry) => entry.id === compareId)?.month
                  : drafts.find((entry) => entry.id === compareId)?.[key].length,
            })),
          ),
        ),
      masterOpen &&
        h(MasterData, {
          key: draft.id,
          month: draft.month,
          productMonth: draft.productMonth ?? draft.month,
          productPeriod: activeProductPeriod,
          demandOnly: ['check', 'ship', 'process'].includes(step),
          close: () => setMasterOpen(false),
        }),
      h(
        'div',
        { hidden: step !== 'ship' },
        h(Shipment, {
          selectedCategories,
          key: `${draft.id}-${generation.current}`,
          scopeGeneration: generation,
          draft,
          update,
          active: active && step === 'ship',
          autoRead: active && draft.productSource === 'business',
          autoReadCalculation:
            (demandSourcesActive || (active && step === 'ship' && businessReadsReady)) &&
            draft.productSource.startsWith('business'),
          calculationRetry: readAttempts.shipment ?? 0,
          onSnapshot: receiveShipment,
          refreshRef: refreshShipment,
          calculationSnapshot:
            shipmentSnapshot?.scopeGeneration === scopeGeneration ? shipmentSnapshot : null,
          onEditingChange: setAdjusting,
          adjustmentActionsTarget: step === 'ship' ? adjustmentActionsTarget : null,
        }),
      ),
      step === 'masterdata' &&
        h(ProductScopeReport, {
          key: draft.id,
          result: workflowResult,
          productReadFailed: draft.productsRead?.status === 'failed',
          selectedCategories,
        }),
      h(
        'div',
        { hidden: step !== 'masterdata' },
        react.cloneElement(masterData, {
          selectedCategories,
          products: draft.products,
          refresh: relationsRefresh,
          openSource: hasMpsSource() ? () => setMasterOpen(true) : undefined,
        }),
      ),
      h(
        'div',
        { hidden: !workflowActive },
        workflowStep.current.step &&
          retainedWorkflowResult &&
          h(Workflow, {
            selectedCategories,
            stepViews,
            processBatch,
            key: workflowScope,
            active: workflowActive,
            result: retainedWorkflowResult,
            evaluation,
            setEvaluation,
            evaluationStorageError,
            evaluationLoading,
            syncInventoryTargets,
            inventoryTargetsBusy: busy.inventoryTargets,
            step: workflowStep.current.step,
            draft,
            scopeGeneration,
            update,
            onEditingChange: setAdjusting,
            adjustmentActionsTarget: workflowActive ? adjustmentActionsTarget : null,
            onUndoShareAdjustment: (input) =>
              update({ adjustments: changeAdjustment(draft.adjustments, 'shares', input, true) }),
            relations:
              relations?.scopeKey === JSON.stringify([draft.id, draft.month, scopeGeneration])
                ? relations
                : null,
            shipmentSnapshot:
              shipmentSnapshot?.scopeGeneration === scopeGeneration ? shipmentSnapshot : null,
          }),
      ),
      h(
        'div',
        { hidden: step !== 'check' },
        governedCheck &&
          h(LoadingProgress, {
            key: 'loading-' + workflowScope,
            primary: primaryReads,
            secondary: secondaryReads,
            retrying,
            connected: businessReadsReady,
          }),
        h(CategoryDemand, {
          selectedCategories,
          result: categoryComputation,
          categorySources,
          readAnnualPool,
          shipmentSnapshot:
            shipmentSnapshot?.scopeGeneration === scopeGeneration ? shipmentSnapshot : null,
          key: `${draft.id}-${scopeGeneration}`,
          draft,
          update,
          retryFestivalHistory,
          loading: demandLoading,
          blocked: demandBlocked,
          showLoadingProgress: governedCheck,
          basisDisabled: adjusting,
          active: active && step === 'check',
          onEditingChange: setAdjusting,
        }),
        h(SourceInputs, {
          selectedCategories,
          key: draft.id + '-' + scopeGeneration + '-basic-' + draft.pull,
          kind: 'basic',
          categorySources,
          draft,
          update: updateSourceInputs,
          relations:
            relations?.scopeKey === JSON.stringify([draft.id, draft.month, scopeGeneration])
              ? relations
              : null,
          active: demandSourcesActive,
          contextActive: checkActive,
          onProgress: (progress) => reportReadProgress('basic', progress),
          retry: readAttempts.basic ?? 0,
        }),
        h(
          'section',
          { 'aria-label': '产品明细' },
          h(
            'details',
            { className: 'dc-card dc-products mps-report-details' },
            h(
              'summary',
              null,
              '产品明细',
              h(
                'span',
                { className: 'dc-count' },
                governedCheck && primaryReads[0].pending
                  ? '正在读取'
                  : `${filteredProducts.length === draft.products.length ? draft.products.length : filteredProducts.length + ' / ' + draft.products.length} 个产品`,
              ),
            ),
            h(
              'div',
              {
                className: 'dc-toolbar dc-report-filters dc-product-toolbar mps-disclosure-toolbar',
              },
              h(MonthPicker, {
                label: '产品统计期',
                name: 'productMonth',
                value: productMonth,
                disabled: adjusting || busy.products,
                onChange: (month) => update({ productMonth: month }),
              }),
              h('input', {
                className: 'dc-product-search',
                type: 'search',
                value: search,
                'aria-label': '搜索产品',
                placeholder: '编码、名称、基地或替换品',
                onChange: (event) => {
                  setSearch(event.target.value);
                  setProductPage(0);
                },
              }),
              h(
                'div',
                { className: 'mps-report-actions' },
                hasMpsSource() &&
                  h(
                    'button',
                    { disabled: busy.products, onClick: () => sync('products') },
                    busy.products ? '同步中…' : '同步产品',
                  ),
                hasMpsSource() && h('button', { onClick: () => setMasterOpen(true) }, '查看源表'),
                draft.productSource.startsWith('demo') &&
                  h('span', { className: 'dc-demo' }, '演示数据'),
                h(Upload, {
                  label: '选择产品关系CSV或Excel',
                  accept:
                    '.csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                  read: (file) => read('products', file),
                }),
                h(
                  'button',
                  {
                    className: 'dc-primary',
                    onClick: () => {
                      resetEditor();
                      setEditorOpen(true);
                    },
                  },
                  '新增产品',
                ),
                h(
                  'button',
                  {
                    className: 'mps-download',
                    disabled:
                      productPricesLoading ||
                      (!categoryProducts.length && !exportedProductSourceRows.length),
                    onClick: () =>
                      downloadWorkbook(
                        draft.productSource.startsWith('demo')
                          ? '产品明细-演示数据.xlsx'
                          : '产品明细.xlsx',
                        [
                          {
                            name: '产品关系',
                            columns: [...productColumns, '未税到岸单价'],
                            rows: categoryProducts.map(({ display }) => display),
                          },
                          {
                            name: '产品源字段',
                            columns: productSourceColumns,
                            rows: exportedProductSourceRows,
                          },
                        ].filter(({ rows }) => rows.length),
                      ),
                  },
                  '下载产品明细',
                ),
              ),
            ),
            productPeriodNote &&
              h('p', { role: 'status', className: 'dc-report-message' }, productPeriodNote),
            errors.products &&
              h('p', { role: 'alert', className: 'dc-report-message' }, errors.products),
            productPricesLoading &&
              h('p', { role: 'status', className: 'dc-report-message' }, '正在读取未税到岸单价。'),
            draft.productPrices?.error &&
              h(
                'p',
                { role: 'alert', className: 'dc-report-message' },
                `单价读取失败：${draft.productPrices.error}`,
              ),
            (!governedCheck || !primaryReads[0].pending || draft.products.length > 0) &&
              h(
                'div',
                { className: 'dc-table-scroll' },
                h(
                  'table',
                  { className: 'dc-product-table' },
                  h(
                    'colgroup',
                    {},
                    [9, 16, 7, 8, 8, 10, 9, 9, 9, 8, 10].map((width, index) =>
                      h('col', { key: index, style: { width: width + '%' } }),
                    ),
                  ),
                  h(
                    'thead',
                    {},
                    h(
                      'tr',
                      {},
                      [
                        '物料编码',
                        '物料名称',
                        '大类',
                        '系列',
                        '物料组编码',
                        '物料组名称',
                        '替换物料编码',
                        '替换品名称',
                        '未税到岸单价',
                        '新品标记',
                        '操作',
                      ].map((column) => h('th', { key: column }, column)),
                    ),
                  ),
                  h(
                    'tbody',
                    {},
                    filteredProducts
                      .slice(productPage * productPageSize, (productPage + 1) * productPageSize)
                      .map(({ row, index, display, children, inherited }) =>
                        h(
                          'tr',
                          { key: index },
                          [
                            ...productColumns.filter((column) => column !== '基地'),
                            '未税到岸单价',
                            '新品标记',
                          ].map((column) =>
                            h(
                              'td',
                              {
                                key: column,
                                'aria-label': ['产品名称', '产品编码'].includes(column)
                                  ? display[column] || '-'
                                  : undefined,
                                title: inherited.includes(column)
                                  ? '同物料组SKU的唯一源值，仅用于展示'
                                  : row[column] || '',
                              },
                              column === '产品编码' && children.length
                                ? h(
                                    'button',
                                    {
                                      className: 'dc-link',
                                      onClick: () => setProductDetails(index),
                                      'aria-label': `查看物料组 ${row['物料组']} 的${children.length}个SKU`,
                                    },
                                    `物料组 · ${children.length} SKU`,
                                  )
                                : column === '产品编码' && row['产品编码']
                                  ? h(
                                      'button',
                                      {
                                        className: 'dc-link',
                                        'aria-label': `查看产品 ${row['产品编码']} 的源字段`,
                                        onClick: () => setProductDetails(index),
                                      },
                                      h(Code, { row: display }),
                                    )
                                  : column === '新品标记'
                                    ? (display[column] ?? '')
                                    : display[column] || '-',
                            ),
                          ),
                          h(
                            'td',
                            { className: 'dc-row-actions' },
                            h(
                              'button',
                              {
                                className: 'dc-link',
                                'aria-label': `编辑 ${row['产品编码']}`,
                                onClick: () => {
                                  setProduct({ ...row });
                                  setEditing(index);
                                  setError('');
                                  setEditorOpen(true);
                                },
                              },
                              '编辑',
                            ),
                            h(
                              'button',
                              {
                                className: 'dc-link dc-danger',
                                'aria-label': `删除 ${row['产品编码']}`,
                                onClick: () => {
                                  editProducts(
                                    draft.products.filter((_row, rowIndex) => rowIndex !== index),
                                  );
                                  resetEditor();
                                },
                              },
                              '删除',
                            ),
                          ),
                        ),
                      ),
                  ),
                ),
              ),
            (!governedCheck || !primaryReads[0].pending) &&
              !filteredProducts.length &&
              h(
                'p',
                { className: 'dc-empty' },
                search
                  ? `没有匹配“${search}”的产品`
                  : !hasMpsSource() && draft.productSource === 'business-unread'
                    ? '月主计划数据源尚未装载，产品列表为空。可重新打开页面，或上传本地核对文件。'
                    : '未提供产品关系。',
              ),
            renderTablePagination(h, {
              label: '产品明细',
              page: productPage,
              total: filteredProducts.length,
              rowsPerPage: productPageSize,
              onPageChange: setProductPage,
              pageSizeLabel: '每页产品条数',
              onPageSizeChange: setProductPageSize,
            }),
            editorOpen &&
              h(
                Dialog,
                {
                  title: editing === null ? '新增产品' : '修改产品',
                  close: resetEditor,
                  footer: h(
                    react.Fragment,
                    {},
                    h('button', { onClick: resetEditor }, '取消'),
                    h(
                      'button',
                      { className: 'dc-primary', onClick: saveProduct },
                      editing === null ? '新增' : '保存',
                    ),
                  ),
                },
                h(
                  'div',
                  { className: 'dc-product-form' },
                  productColumns
                    .filter((column) => editing !== null || column !== '基地')
                    .map((column) =>
                      h(
                        'label',
                        { key: column },
                        column === '基地'
                          ? '基地名称'
                          : column === '老品编码'
                            ? '替换物料编码'
                            : column === '老品名称'
                              ? '替换品名称'
                              : column,
                        h('input', {
                          'aria-label':
                            column === '基地'
                              ? '基地名称'
                              : column === '老品编码'
                                ? '替换物料编码'
                                : column === '老品名称'
                                  ? '替换品名称'
                                  : column,
                          value: product[column],
                          onChange: (event) =>
                            setProduct({ ...product, [column]: event.target.value }),
                        }),
                      ),
                    ),
                ),
                editing === null &&
                  h(
                    'p',
                    { className: 'dc-muted' },
                    '默认适用五基地：郑州、遂平、华东、华南、西南。全国只保留一条产品关系，需求按现有基地数据分配。',
                  ),
                error && h('p', { role: 'alert' }, error),
                h(
                  'p',
                  { className: 'dc-muted' },
                  '历史量为同基地同财年的当前SKU自身历史加替换品历史×替换系数。缺源行不覆盖另一品已有历史，同码只计一次、不递归；已有源行数量空值仍待补，原始记录保留。',
                ),
              ),
          ),
          selectedProduct &&
            h(
              Dialog,
              {
                title: '产品源字段与物料组SKU',
                className: 'dc-source-detail',
                close: () => setProductDetails(null),
              },
              h(
                'p',
                {},
                `${selectedProduct.row['产品名称']} · 物料组 ${selectedProduct.row['物料组'] || '-'}`,
              ),
              h(
                'p',
                { className: 'dc-muted' },
                '替换物料编码、替换品名称分别读取源表的替换编码及替换品名称。物料组分类和系列只在子SKU源值唯一时展示，多值分别列出。',
              ),
              table(
                ['字段', '源值'],
                [
                  { 字段: '源产品标签', 源值: selectedProduct.labels.join(' / ') || '-' },
                  {
                    字段: '源替换物料编码',
                    源值: selectedProduct.replacementCodes.join(' / ') || '-',
                  },
                  {
                    字段: '源替换品名称',
                    源值: selectedProduct.replacementNames.join(' / ') || '-',
                  },
                  { 字段: '子SKU源分类', 源值: selectedProduct.categoryValues.join(' / ') || '-' },
                  { 字段: '子SKU源系列', 源值: selectedProduct.seriesValues.join(' / ') || '-' },
                  { 字段: '事实候选基地', 源值: selectedProduct.candidateBases.join(' / ') || '-' },
                ],
              ),
              selectedProduct.children.length > 0 &&
                table(
                  [
                    '产品编码',
                    '产品名称',
                    '源分类',
                    '源系列',
                    '源产品标签',
                    '源替换物料编码',
                    '源替换品名称',
                  ],
                  selectedProduct.children.map((index) => {
                    const child = productViews[index];
                    return {
                      产品编码: child.row['产品编码'],
                      产品名称: child.row['产品名称'],
                      源分类: child.row['大类'],
                      源系列: child.row['系列'],
                      源产品标签: child.labels.join(' / '),
                      源替换物料编码: child.replacementCodes.join(' / '),
                      源替换品名称: child.replacementNames.join(' / '),
                    };
                  }),
                ),
              h(
                'p',
                { className: 'dc-muted' },
                '以下为最新统计月份的源记录。历史合计量＝同基地当前SKU自身历史量＋替换品历史量×替换系数；净重为每个计量单位的重量。缺值保留为空，不按0计算。',
              ),
              table(productSourceColumns, selectedProduct.sourceDetails),
            ),
        ),
        h(Annual, {
          key: `annual-${draft.id}-${scopeGeneration}`,
          selectedCategories,
          draft,
          selection: annualContext,
          read,
          sync,
          readAnnualPool,
          update,
          error: errors.annual,
          busy: busy.annual,
          exportAnnual,
          exporting: busy.annualExport,
          exportError: errors.annualExport,
          progressive: governedCheck,
        }),
        h(
          'div',
          { className: 'dc-source-grid' },
          ...Object.keys(sourceDefinitions).map((type) =>
            h(Source, {
              selectedCategories,
              key: `${draft.id}-${type}`,
              type,
              draft,
              selection: sourceSelections[type],
              read,
              sync,
              update,
              error: errors[type],
              busy: busy[type],
              progressive: governedCheck,
              productsPending: primaryReads[0].pending,
            }),
          ),
        ),
        hasMpsSource() &&
          h(DeliveryMetrics, {
            selectedCategories,
            key: draft.id,
            draft,
            update,
            sync,
            busy: busy.delivery,
            error: errors.delivery,
            active: active && step === 'check',
          }),
        h(SourceInputs, {
          selectedCategories,
          key: draft.id + '-' + scopeGeneration + '-parameters',
          kind: 'parameters',
          categorySources,
          readAnnualPool,
          draft,
          update: updateSourceInputs,
          relations:
            relations?.scopeKey === JSON.stringify([draft.id, draft.month, scopeGeneration])
              ? relations
              : null,

          active: demandSourcesActive,
          contextActive: checkActive,
          onProgress: (progress) => reportReadProgress('parameters', progress),
          retry: readAttempts.parameters ?? 0,
        }),
      ),
    );
    return h(Provider, { draft }, content);
  };
}
