import { ready } from '../../../business/shared/channel.js';
import { createShipment } from './shipment.js';
import { hasMpsSource, readProducts, readAnnual, readAnnualDetails } from './master-data.js';
import { createMasterData } from './master-data-view.js';
import { readFactMonth } from './facts.js';
import { readSourceTable, forecastDimensions } from './source-tables.js';
import { createDeliveryMetrics } from './delivery-metrics.js';
import { createWorkflow } from './workflow-view.js';
import { mpsCategories as categories } from 'dsh-agent-manage/mps-compute/workflow';
import { productProjections } from './source-projections.js';
import { createSourceInputs } from './source-input-view.js';
import { productFileText } from './product-file.js';
import { workbookBytes } from './workbook.js';
import { annualWorkbookTables } from './annual-workbook.js';
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
function parseCsv(text, columns) {
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
  const legacyProductColumns = productColumns.filter((column) => column !== '物料组名称');
  if (
    columns === productColumns &&
    table[0]?.join('\u0000') === legacyProductColumns.join('\u0000')
  ) {
    for (const row of table) row.splice(6, 0, row === table[0] ? '物料组名称' : '');
  }
  if (!table.length || table[0].join('\u0000') !== columns.join('\u0000'))
    throw Error(`表头必须依模板排列：${columns.join('、')}。`);
  if (table.length - 1 > 10000) throw Error('超过10000条上限，未读取任何行，请拆分文件后核对。');
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
  if (columns === annualColumns && rows.some((row) => !categories.includes(row['大类'])))
    errors.push('年度计划大类须属于本页八大类范围');
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
async function downloadWorkbook(name, tables) {
  const bytes = await workbookBytes(tables);
  downloadFile(name, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', bytes);
}
function downloadCsv(name, columns, rows) {
  return downloadWorkbook(name.replace(/\.csv$/i, '.xlsx'), [{ name: '数据', columns, rows }]);
}
const integer = new Intl.NumberFormat('zh-CN', {
  useGrouping: false,
  maximumFractionDigits: 0,
}).format;
const quantity = (rows, column) =>
  rows.reduce((sum, row) => (row[column] === '' ? sum : sum + Number(row[column])), 0);
const currentMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};
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
  const bases = [...new Set(draft.annual.map((row) => row['基地']).filter(Boolean))];
  const base =
    (bases.includes(draft.annualBase) ? draft.annualBase : undefined) ??
    (bases.includes('全国') ? '全国' : bases[0]);
  return {
    bases,
    base,
    rows:
      draft.annualSource === 'business'
        ? draft.annual.filter((row) => row['基地'] === base)
        : draft.annual,
  };
}
function forecastSourceRows(draft) {
  const productsReady = !['loading', 'failed'].includes(draft.productsRead?.status);
  return (
    draft.forecastSource === 'business' && productsReady
      ? forecastDimensions(draft.forecast, draft.products)
      : draft.forecast
  ).map((row) => ({ ...row, 读取状态: draft.forecastRead?.status ?? 'unread' }));
}
function sourceSelection(draft, type) {
  const period =
    type === 'report'
      ? draft.month
      : type === 'forecast'
        ? monthOffset(draft.month, draft.forecastOffset - 1)
        : monthOffset(draft.month, -12 * draft.historyYears);
  const column = type === 'report' ? (draft.pull === 'monthly' ? '月初数量' : '纠偏数量') : '数量';
  return {
    period,
    column,
    rows: (type === 'forecast' ? forecastSourceRows(draft) : draft[type]).filter(
      (row) => row['月份'] === period,
    ),
  };
}
function downloadFile(name, mime, text) {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function createDemandConfirmation(react, useMpsPart, view) {
  const h = react.createElement;
  function Dialog({ title, children, footer, close, className = '' }) {
    const element = react.useRef();
    react.useEffect(() => {
      element.current.showModal();
      return () => element.current?.close();
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
        h('button', { onClick: close, 'aria-label': '关闭弹窗' }, '关闭'),
      ),
      h('div', { className: 'dc-dialog-body' }, children),
      h('div', { className: 'dc-dialog-footer' }, footer),
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
  const table = (columns, rows) =>
    h(
      'div',
      { className: 'dc-table-scroll' },
      h(
        'table',
        {},
        h(
          'thead',
          {},
          h(
            'tr',
            {},
            columns.map((column) => h('th', { key: column }, column)),
          ),
        ),
        h(
          'tbody',
          {},
          rows.map((row, index) =>
            h(
              'tr',
              { key: index },
              columns.map((column) =>
                h(
                  'td',
                  { key: column },
                  row[column] === '' || row[column] == null
                    ? '-'
                    : /数量|收入|金额|合计/.test(column) && Number.isFinite(Number(row[column]))
                      ? integer(row[column])
                      : row[column],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  function Source({ type, draft, read, sync, update, error, busy }) {
    const definition = sourceDefinitions[type];
    const [preview, setPreview] = react.useState(null);
    const [page, setPage] = react.useState(0);
    const { period, column, rows } = sourceSelection(draft, type);
    const business = draft[type + 'Source'] === 'business';
    const sourceDimensions =
      type === 'forecast' && business ? ['基地', '大类', '系列', '物料组'] : dimensions;
    const visibleColumns =
      type === 'forecast' && business
        ? ['月份', '基地', '物料组', '物料组名称', '大类', '系列']
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
                  '缺项原因',
                  '读取状态',
                ]
              : ['数量', '含赠品数量', '不含税收入']),
        ]
      : [...sourceColumns, column];
    react.useEffect(() => setPage(0), [draft[type]]);
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
    const grouped = sourceDimensions.includes(preview)
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
          draft.files[type] ? '本地文件' : business ? '业务来源' : '待同步',
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
          h('span', { className: 'dc-muted' }, `核对期间 ${period}`),
        ),
        business &&
          h(
            'p',
            { className: 'dc-muted' },
            type === 'report'
              ? '期初与纠偏为两个完整版本，分别使用，不相加。按大区×基地×SKU汇总；大区按客户与物料关系匹配，产品分类取产品清单。缺基地或数量不可用时留空。'
              : type === 'forecast'
                ? `预测批次 ${draft.month}：当月列对应${draft.month}，下一月列对应${monthOffset(draft.month, 1)}。按基地×物料组汇总，缺数量时不以部分合计代替完整预测。分类按同物料组SKU的一致源值补充，单位待确认。`
                : '按实际发货日期汇总同一期间。发货数量与含赠品数量分别展示，不相加；不含税收入不替代含税销售额。',
          ),
        business &&
          type === 'history' &&
          h(
            'p',
            {},
            ['数量', '含赠品数量', '不含税收入']
              .map((field) => {
                const known = rows.length && rows.every((row) => row[field] !== '');
                return `${field === '数量' ? '发货数量' : field}：${known ? integer(quantity(rows, field)) + (field === '不含税收入' ? '元' : '件') : '未提供'}`;
              })
              .join('；'),
          ),
        business &&
          draft[type + 'Metadata']?.period === period &&
          draft[type + 'Metadata']?.partial &&
          h('p', { className: 'dc-muted' }, '来源含不可用值，已知字段仍可核对；空值未补零。'),
        h(
          'div',
          { className: 'dc-coverage' },
          sourceDimensions.map((dimension) =>
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
        h(
          'details',
          { className: 'dc-source-notes' },
          h('summary', {}, '口径与统计说明'),
          draft.files[type] && h('p', {}, `${draft.files[type]}，已读取${draft[type].length}条`),
          h(
            'p',
            {},
            `当前期间${rows.length}条，数量合计${total === null ? '未提供' : integer(total) + unit}，缺失数量${missing}条`,
          ),
          h(
            'p',
            {},
            type === 'forecast'
              ? 'M+1为评估月份，M+2为下一月，后续月份依次顺延，跨年按实际年月核对。'
              : business
                ? '业务数量单位为件，收入单位为元；来源缺失的分类维度保持空。任一数量缺失时，其汇总留空。'
                : '本页CSV仅用于本地核对。数量保留文件原值，不推断正负号的业务含义。',
          ),
          h(
            'p',
            {},
            dimensions
              .map(
                (dimension) => `${dimension}缺失${rows.filter((row) => !row[dimension]).length}条`,
              )
              .join('；') + '。空字段不计入覆盖，汇总保留未提供分组。',
          ),
          h(
            'p',
            {},
            '缺失不补零，真实0参与统计。四维条目数按当前期间对应字段去重，无总量分母。系列与物料组独立展示。',
          ),
          h(
            'button',
            {
              className: 'dc-link',
              disabled: !draft[type].length,
              onClick: () =>
                downloadCsv(
                  `${definition.short}-全部已读.csv`,
                  business ? detailColumns : definition.columns,
                  type === 'forecast' ? forecastSourceRows(draft) : draft[type],
                ),
            },
            '导出全部已读明细',
          ),
        ),
        !rows.length &&
          h('p', { className: 'dc-empty' }, '当前期间无已读取记录，不能判定业务数据为零。'),
        busy && h('p', { role: 'status' }, '正在读取…'),
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
            'aria-label': '导出当前明细',
            disabled: !rows.length,
            onClick: () => downloadCsv(`${definition.short}-${period}.csv`, detailColumns, rows),
          },
          '下载',
        ),
      ),
      preview &&
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
                className: 'dc-primary',
                onClick: () =>
                  preview === '明细'
                    ? downloadCsv(`${definition.short}-${period}.csv`, detailColumns, rows)
                    : downloadCsv(
                        `${definition.short}-${period}-${preview}汇总.csv`,
                        columns,
                        grouped,
                      ),
              },
              preview === '明细' ? '下载明细' : '导出维度汇总',
            ),
          },
          table(columns, displayed.slice(page * 25, (page + 1) * 25)),
          h(
            'div',
            { className: 'dc-pagination' },
            h('span', {}, `共${displayed.length}条，每页25条，第${page + 1}页`),
            h('button', { disabled: !page, onClick: () => setPage(page - 1) }, '上一页'),
            h(
              'button',
              { disabled: (page + 1) * 25 >= displayed.length, onClick: () => setPage(page + 1) },
              '下一页',
            ),
          ),
        ),
    );
  }
  function Annual({
    draft,
    read,
    sync,
    update,
    error,
    busy,
    exportAnnual,
    exporting,
    exportError,
  }) {
    const [expanded, setExpanded] = react.useState(false);
    const live = draft.annualSource === 'business';
    const unit = live ? '源数量' : '件';
    const { bases, base, rows: annual } = annualSelection(draft);
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
        maximumFractionDigits: 6,
      });
      return h(
        'details',
        {},
        h('summary', {}, `${result}%`),
        h(
          'p',
          {},
          `公式：（本月数量÷上月数量－1）×100%；结果：${result}%。仅用于文件环比核对，显示最多六位小数。`,
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
    const displayedCategories = live ? [...new Set(annual.map((row) => row['大类']))] : categories;
    const rows = displayedCategories.map((category) => ({
      大类: category || '-',
      ...Object.fromEntries(
        months.map((month) => [
          month,
          h(
            'div',
            { className: 'dc-annual-cell' },
            absolute(category, month),
            h('small', {}, '环比增幅 ', ratio(category, month)),
          ),
        ]),
      ),
      全年合计: annualTotal(category),
    }));
    return h(
      react.Fragment,
      {},
      h(
        'div',
        { className: 'dc-section-title' },
        h('h2', {}, '年度销售计划（分月）'),
        h('span', {}, `${start}年7月 → ${start + 1}年6月 · 绝对值＋环比增幅`),
      ),
      h(
        'section',
        { 'aria-label': '年度销售计划', className: 'dc-card dc-annual' },
        h(
          'div',
          { className: 'dc-card-head' },
          h('h3', {}, '年度销售计划 · 分月明细'),
          h(
            'button',
            { disabled: !hasMpsSource() || busy, onClick: () => sync('annual') },
            busy ? '同步中…' : '同步数据源',
          ),
          h(
            'button',
            {
              'aria-label': `${expanded ? '收起' : '展开'}年度销售计划`,
              'aria-expanded': expanded,
              onClick: () => setExpanded(!expanded),
            },
            expanded ? '收起' : '展开',
          ),
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
          h(
            'span',
            { className: 'dc-status' },
            live ? '业务数据 · 源数量' : draft.files.annual ? '本地文件' : '未接入',
          ),
          h(
            'span',
            { className: 'dc-card-note' },
            live
              ? '全国年度需求表'
              : draft.files.annual
                ? `${draft.files.annual}，已读取${draft.annual.length}条`
                : '年度计划正式来源待确认',
          ),
          h(Upload, { label: '选择年度计划CSV', read: (file) => read('annual', file) }),
          h(
            'button',
            {
              disabled: !draft.annual.length || exporting || busy,
              onClick: () =>
                live
                  ? exportAnnual(months, base)
                  : downloadCsvLegacy('年度计划-全部已读.csv', annualColumns, draft.annual),
            },
            exporting ? '正在导出…' : live ? '下载年度SKU模板' : '下载',
          ),
        ),
        busy && h('p', { role: 'status' }, '正在读取…'),
        error && h('p', { role: 'alert' }, error),
        exportError && h('p', { role: 'alert' }, exportError),
        live &&
          h(
            'p',
            { className: 'dc-card-note' },
            '下载当前基地全年SKU明细、大类汇总及物料组核对表。各表冻结首行；缺失月份不补零，物料组汇总不重复计入大类。',
          ),
        h('div', { hidden: !expanded }, table(['大类', ...months, '全年合计'], rows)),
      ),
    );
  }
  const MasterData = createMasterData(react, { Dialog, table, downloadCsv, useMpsPart });
  const DeliveryMetrics = createDeliveryMetrics(react, { table, downloadCsv, useMpsPart });
  const Workflow = createWorkflow(react, useMpsPart, { Dialog, downloadCsv: downloadCsvLegacy });
  const SourceInputs = createSourceInputs(react, {
    Dialog,
    table,
    downloadCsv,
    useMpsPart,
    categories,
  });
  const Shipment = createShipment(react, useMpsPart, {
    Dialog,
    Upload,
    parseCsv,
    downloadCsv: downloadCsvLegacy,
    monthOffset,
  });
  return function DemandConfirmation({
    active = true,
    assistant,
    step = 'check',
    onNext,
    onScopeChange,
    relations,
    masterData,
  }) {
    const [drafts, setDrafts] = react.useState(() => [makeDraft('local-1', currentMonth())]);
    const [selected, setSelected] = react.useState('local-1');
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
    const [error, setError] = react.useState('');
    const [search, setSearch] = react.useState('');
    const [productPage, setProductPage] = react.useState(0);
    const [productPageSize, setProductPageSize] = react.useState(10);
    const [productsExpanded, setProductsExpanded] = react.useState(true);
    const [productDetails, setProductDetails] = react.useState(null);
    const [masterOpen, setMasterOpen] = react.useState(false);
    const [errors, setErrors] = react.useState({});
    const [busy, setBusy] = react.useState({});
    const [scopeGeneration, setScopeGeneration] = react.useState(0);
    const [shipmentSnapshot, setShipmentSnapshot] = react.useState(null);
    const receiveShipment = react.useCallback(
      (snapshot) => setShipmentSnapshot({ ...snapshot, scopeGeneration }),
      [scopeGeneration],
    );
    const generation = react.useRef(0),
      requests = react.useRef({}),
      controllers = react.useRef({});
    const clearFiles = () => {
      generation.current++;
      Object.values(controllers.current).forEach((controller) => controller.abort());
      controllers.current = {};
      requests.current = {};
      setErrors({});
      setBusy({});
    };
    const sourceRead = (entry, type, period, read) =>
      period
        ? { ...entry[type + 'Read'], periods: { ...entry[type + 'Read']?.periods, [period]: read } }
        : read;
    const begin = (type, period) => {
      controllers.current[type]?.abort();
      const controller = new AbortController();
      controllers.current[type] = controller;
      const epoch = generation.current;
      const request = (requests.current[type] ?? 0) + 1;
      requests.current[type] = request;
      setBusy((state) => ({ ...state, [type]: true }));
      setErrors((state) => ({ ...state, [type]: '' }));
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
          !controller.signal.aborted &&
          epoch === generation.current &&
          requests.current[type] === request,
      };
    };
    const exportAnnual = async (months, base) => {
      const { signal, valid } = begin('annualExport');
      try {
        const rows = await readAnnualDetails(months, base, signal);
        const tables = annualWorkbookTables(rows, months, base);
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
    const sync = async (type) => {
      const id = draft.id;
      const fact = ['report', 'history', 'delivery'].includes(type);
      const sourceTable = type === 'forecast' || type === 'delivery';
      const period =
        type === 'delivery'
          ? (draft.deliveryMonth ?? draft.month)
          : fact
            ? sourceSelection(draft, type).period
            : undefined;
      const { signal, valid } = begin(type, period);
      try {
        const result =
          type === 'products'
            ? await readProducts(signal)
            : type === 'annual'
              ? await readAnnual(signal)
              : sourceTable
                ? await readSourceTable(type, type === 'forecast' ? draft.month : period, signal)
                : await readFactMonth(type, period, signal);
        if (!valid()) return;
        setDrafts((entries) =>
          entries.map((entry) =>
            entry.id === id
              ? {
                  ...entry,
                  [type]: fact
                    ? [
                        ...(entry[type + 'Source'] === 'business'
                          ? entry[type].filter((row) => row['月份'] !== period)
                          : []),
                        ...result.rows,
                      ]
                    : type === 'products' || type === 'forecast'
                      ? result.rows
                      : result,
                  ...(fact || sourceTable
                    ? { [type + 'Source']: 'business', [type + 'Metadata']: result.metadata }
                    : {}),
                  ...(type === 'products'
                    ? { productSource: 'business', productRaw: result.raw }
                    : type === 'annual'
                      ? { annualSource: 'business' }
                      : {}),
                  files: { ...entry.files, [type]: null },
                  [type + 'Read']: sourceRead(entry, type, period, { status: 'ready' }),
                }
              : entry,
          ),
        );
        if (type === 'products') resetEditor();
      } catch (failure) {
        if (valid()) {
          setErrors((state) => ({ ...state, [type]: failure.message }));
          setDrafts((entries) =>
            entries.map((entry) =>
              entry.id === id
                ? {
                    ...entry,
                    [type + 'Read']: sourceRead(entry, type, period, {
                      status: 'failed',
                      error: failure.message,
                    }),
                  }
                : entry,
            ),
          );
        }
      } finally {
        if (valid()) setBusy((state) => ({ ...state, [type]: false }));
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
        if (!valid()) return;
        setDrafts((entries) =>
          entries.map((entry) =>
            entry.id === id
              ? {
                  ...entry,
                  [type]: rows,
                  ...(type === 'products'
                    ? { productSource: 'local-file', productRaw: [] }
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
        clearFiles();
        setScopeGeneration((value) => value + 1);
        setDrafts([makeDraft('local-1', currentMonth())]);
        setSelected('local-1');
        resetEditor();
        setVersionOpen(false);
        setCompareOpen(false);
        setHelpOpen(false);
        setMasterOpen(false);
        setReference('');
        setVersionName('');
      };
      const stop = view.subscribe((_snapshot, event) => {
        if (event === 'released') reset();
      });
      const reconnect = () => setScopeGeneration((value) => value + 1);
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
      if (!active) {
        clearFiles();
        setMasterOpen(false);
      }
    }, [active]);
    react.useEffect(() => {
      let current = true;
      if (active && hasMpsSource() && draft.productSource === 'business-unread') {
        ready.then(() => {
          if (current) {
            void sync('products');
            if (!draft.annualSource) void sync('annual');
          }
        });
      }
      return () => {
        current = false;
      };
    }, [draft.id, draft.month, active, scopeGeneration]);
    react.useEffect(() => {
      let current = true;
      if (active && hasMpsSource())
        ready.then(() => {
          if (current && !draft.files.report) void sync('report');
        });
      return () => {
        current = false;
      };
    }, [draft.id, draft.month, active, scopeGeneration]);
    react.useEffect(() => {
      let current = true;
      if (active && hasMpsSource())
        ready.then(() => {
          if (current && !draft.files.history) void sync('history');
        });
      return () => {
        current = false;
      };
    }, [draft.id, draft.month, draft.historyYears, active, scopeGeneration]);
    react.useEffect(() => {
      let current = true;
      if (active && hasMpsSource())
        ready.then(() => {
          if (current && !draft.files.forecast) void sync('forecast');
        });
      return () => {
        current = false;
      };
    }, [draft.id, draft.month, active, scopeGeneration]);
    react.useEffect(() => {
      let current = true;
      if (active && hasMpsSource())
        ready.then(() => {
          if (current) void sync('delivery');
        });
      return () => {
        current = false;
      };
    }, [draft.id, draft.month, draft.deliveryMonth, active, scopeGeneration]);
    const update = (changes) =>
      setDrafts((entries) =>
        entries.map((entry) => (entry.id === draft.id ? { ...entry, ...changes } : entry)),
      );
    const editProducts = (products) =>
      update({
        products,
        productSource: draft.productSource.startsWith('demo') ? 'demo-edited' : 'local-edited',
      });
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
        ),
      [
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
    const filteredProducts = productViews.filter(({ display, labels, replacementCodes }) =>
      [...Object.values(display), ...labels, ...replacementCodes].some((value) =>
        value.includes(search),
      ),
    );
    const selectedProduct = productDetails === null ? null : productViews[productDetails];
    react.useEffect(() => setProductPage(0), [draft.id, draft.products, productPageSize]);
    const saveProduct = (event) => {
      event.preventDefault();
      const normalized = Object.fromEntries(
        productColumns.map((column) => [column, product[column].trim()]),
      );
      if (productColumns.slice(1, 6).some((column) => !normalized[column])) {
        setError('产品编码、产品名称、大类、系列和物料组不能为空；全国产品基地可留空。');
        return;
      }
      if (!!normalized['老品编码'] !== !!normalized['老品名称']) {
        setError('老品编码和老品名称须同时填写或同时留空。');
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
    const sourceSummaries = Object.fromEntries(
      Object.keys(sourceDefinitions).map((type) => {
        const { period, column, rows } = sourceSelection(draft, type);
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
              (type === 'forecast' && draft.forecastSource === 'business'
                ? ['基地', '大类', '系列', '物料组']
                : dimensions
              ).map((dimension) => [
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
    const annualContext = annualSelection(draft);
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
            }) => ({
              ...display,
              记录层级: children.length ? '物料组' : 'SKU或本地记录',
              源产品标签: labels.join(' / '),
              源替换物料编码: replacementCodes.join(' / '),
              源替换品名称: replacementNames.join(' / '),
              事实候选基地: candidateBases.join(' / '),
            }),
          ),
        draft: { id: draft.id, name: draft.name, month: draft.month },
        productCount: draft.products.length,
        productSource: draft.productSource,
        sourceSummaries,
        calculation: {
          status:
            draft.forecastRead?.status === 'ready'
              ? 'waiting-for-business-rules'
              : 'waiting-for-forecast-and-business-rules',
          modelInput: 'forecast',
          sourceIndicators: 'delivery',
          parameterInputs: ['report', 'history'],
          basicIndicatorInputs: ['report', 'history'],
          monthlyCalculation: 'derived-from-inputs-without-result-table',
        },
        businessSave: 'not-connected',
        retention: 'memory-only',
      },
      '需求确认',
      active && step === 'check',
    );
    return h(
      'div',
      { className: 'dc-page', hidden: !active },
      h(
        'header',
        { className: 'dc-page-head' },
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
                'aria-label': '页面说明',
                title: '页面说明',
                onClick: () => setHelpOpen(true),
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
              'select',
              {
                'aria-label': '评估版本选择',
                value: draft.id,
                onChange: (event) => {
                  clearFiles();
                  setSelected(event.target.value);
                  resetEditor();
                },
              },
              drafts.map((entry) =>
                h('option', { key: entry.id, value: entry.id }, `${entry.name}（${entry.month}）`),
              ),
            ),
            h(
              'button',
              {
                onClick: () => {
                  setVersionName('');
                  setMonth(draft.month);
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
            hasMpsSource() && h('button', { onClick: () => setMasterOpen(true) }, '数据源'),
            h('button', { disabled: true, title: '正式保存合同与权限未接入' }, '保存调整'),
          ),
        ),
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
                  disabled:
                    !/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || Number(month.slice(0, 4)) < 1000,
                  onClick: () => {
                    const id = `local-${drafts.length + 1}`,
                      base = drafts.find((entry) => entry.id === reference);
                    const next = {
                      ...(base ? structuredClone(base) : makeDraft(id, month)),
                      id,
                      month,
                      ...(base && base.month !== month
                        ? {
                            shipment: {
                              rows: base.shipment?.rows ?? [],
                              file: base.shipment?.file,
                              values: {},
                              remaining: {},
                            },
                          }
                        : {}),
                      name: versionName.trim() || makeDraft(id, month).name,
                    };
                    setDrafts([...drafts, next]);
                    clearFiles();
                    setSelected(id);
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
            h(
              'label',
              {},
              '评估月份',
              h('input', {
                type: 'month',
                'aria-label': '评估月份',
                value: month,
                onChange: (event) => setMonth(event.target.value),
              }),
            ),
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
          h(
            'p',
            { className: 'dc-muted' },
            '仅创建当前页面内存中的本地版本，不是业务评估版本落库。参考复制仅复制已读取输入，刷新或切换对话会清除。',
          ),
        ),
      compareOpen &&
        h(
          Dialog,
          {
            title: '版本对比',
            close: () => setCompareOpen(false),
            footer: h(
              'button',
              { className: 'dc-primary', onClick: () => setCompareOpen(false) },
              '关闭',
            ),
          },
          h('p', {}, '仅对比本地内存输入，不代表业务版本快照、已确认计划或测算结果。'),
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
      helpOpen &&
        h(
          Dialog,
          {
            title: '页面说明',
            close: () => setHelpOpen(false),
            footer: h('button', { onClick: () => setHelpOpen(false) }, '关闭'),
          },
          h(
            'p',
            {},
            '当前版本仅在页面内存中核对。刷新或切换对话会清除本页内存输入，请先导出核对底稿。',
          ),
          h(
            'p',
            {},
            '业务数据由月主计划授权读取。产品关系调整保留在本地版本，历史继承、冲突口径和正式保存待接入。',
          ),
          h(
            'button',
            {
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
                      calculation: 'pending-business-rules',
                    },
                    null,
                    2,
                  ),
                ),
            },
            '导出核对底稿',
          ),
          h('p', {}, '底稿JSON保留当前版本全部已读输入，供人工核对；正式导入与底稿重载尚未接入。'),
          assistant,
        ),
      masterOpen &&
        h(MasterData, { key: draft.id, month: draft.month, close: () => setMasterOpen(false) }),
      h(
        'div',
        { hidden: step !== 'ship' },
        h(Shipment, {
          key: `${draft.id}-${generation.current}`,
          scopeGeneration: generation,
          draft,
          update,
          active: active && step === 'ship',
          onSnapshot: receiveShipment,
          onNext,
        }),
      ),
      h('div', { hidden: step !== 'masterdata' }, masterData),
      active &&
        ['process', 'constraints', 'capacity', 'report'].includes(step) &&
        h(Workflow, {
          step,
          draft,
          update,
          relations:
            relations?.scopeKey === JSON.stringify([draft.id, draft.month, scopeGeneration])
              ? relations
              : null,
          shipmentSnapshot:
            shipmentSnapshot?.scopeGeneration === scopeGeneration ? shipmentSnapshot : null,
          onNext,
        }),
      h(
        'div',
        { hidden: step !== 'check' },
        h(
          'section',
          { 'aria-label': '产品明细', className: 'dc-card dc-products' },
          h(
            'div',
            { className: 'dc-card-head dc-product-toolbar' },
            h(
              'h3',
              {},
              '产品明细',
              h(
                'span',
                { className: 'dc-count' },
                `${filteredProducts.length === draft.products.length ? draft.products.length : filteredProducts.length + ' / ' + draft.products.length} 个产品`,
              ),
            ),
            h(
              'button',
              {
                'aria-label': `${productsExpanded ? '收起' : '展开'}产品明细`,
                'aria-expanded': productsExpanded,
                onClick: () => setProductsExpanded(!productsExpanded),
              },
              productsExpanded ? '收起' : '展开',
            ),
            hasMpsSource() &&
              h(
                'button',
                { disabled: busy.products, onClick: () => sync('products') },
                busy.products ? '同步中…' : '同步产品',
              ),
            draft.productSource.startsWith('demo') &&
              h('span', { className: 'dc-demo' }, '演示数据'),
            h('input', {
              className: 'dc-product-search',
              value: search,
              'aria-label': '搜索产品',
              placeholder: '搜索编码 / 名称 / 基地 / 老品',
              onChange: (event) => {
                setSearch(event.target.value);
                setProductPage(0);
              },
            }),
            h(
              'button',
              {
                disabled: !draft.products.length,
                onClick: () =>
                  downloadCsv(
                    draft.productSource.startsWith('demo')
                      ? '产品关系-演示数据.csv'
                      : '产品关系.csv',
                    productColumns,
                    draft.products,
                  ),
              },
              '下载',
            ),
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
          ),
          errors.products && h('p', { role: 'alert' }, errors.products),
          h(
            'div',
            { className: 'dc-table-scroll', hidden: !productsExpanded },
            h(
              'table',
              { className: 'dc-product-table' },
              h(
                'colgroup',
                {},
                [9, 20, 7, 10, 8, 15, 9, 13, 9].map((width, index) =>
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
                    '对应老品编码',
                    '老品名称',
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
                      productColumns
                        .filter((column) => column !== '基地')
                        .map((column) =>
                          h(
                            'td',
                            {
                              key: column,
                              'aria-label':
                                column === '产品名称' ? display[column] || '-' : undefined,
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
          productsExpanded &&
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
          h(
            'div',
            { className: 'dc-card-foot', hidden: !productsExpanded },
            h(
              'span',
              {},
              draft.productSource.startsWith('demo')
                ? '产品关系起始于原型15条样例，包含2条新品。仅作演示与本地核对，不自动继承老品历史数量。'
                : `${draft.files.products ?? '本地维护'} · 当前隔离版本的产品关系`,
            ),
            h(
              'select',
              {
                'aria-label': '每页产品条数',
                value: productPageSize,
                onChange: (event) => setProductPageSize(Number(event.target.value)),
              },
              [10, 25, 50].map((size) => h('option', { key: size, value: size }, `每页${size}条`)),
            ),
            filteredProducts.length > productPageSize &&
              h(
                react.Fragment,
                {},
                h(
                  'span',
                  {},
                  `共${filteredProducts.length}条，每页${productPageSize}条，第${productPage + 1}页`,
                ),
                h(
                  'button',
                  { disabled: !productPage, onClick: () => setProductPage(productPage - 1) },
                  '上一页',
                ),
                h(
                  'button',
                  {
                    disabled: (productPage + 1) * productPageSize >= filteredProducts.length,
                    onClick: () => setProductPage(productPage + 1),
                  },
                  '下一页',
                ),
              ),
          ),
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
                productColumns.map((column) =>
                  h(
                    'label',
                    { key: column },
                    column === '基地'
                      ? '基地名称'
                      : column === '老品编码'
                        ? '对应老品编码'
                        : column,
                    h('input', {
                      'aria-label':
                        column === '基地'
                          ? '基地名称'
                          : column === '老品编码'
                            ? '对应老品编码'
                            : column,
                      value: product[column],
                      onChange: (event) => setProduct({ ...product, [column]: event.target.value }),
                    }),
                  ),
                ),
              ),
              error && h('p', { role: 'alert' }, error),
              h(
                'p',
                { className: 'dc-muted' },
                '仅维护当前本地版本的产品关系。老品历史继承规则尚未确认，本次修改不改变历史发货与需求数量。',
              ),
            ),
        ),
        selectedProduct &&
          h(
            Dialog,
            {
              title: '产品源字段与物料组SKU',
              close: () => setProductDetails(null),
              footer: h('button', { onClick: () => setProductDetails(null) }, '关闭'),
            },
            h(
              'p',
              {},
              `${selectedProduct.row['产品名称']} · 物料组 ${selectedProduct.row['物料组'] || '-'}`,
            ),
            h(
              'p',
              { className: 'dc-muted' },
              '对应老品编码、老品名称分别取替换物料编码、替换品。物料组分类和系列只在子SKU源值唯一时展示，多值分别列出。',
            ),
            table(
              ['字段', '源值'],
              [
                { 字段: '源产品标签', 源值: selectedProduct.labels.join(' / ') || '-' },
                {
                  字段: '源替换物料编码',
                  源值: selectedProduct.replacementCodes.join(' / ') || '-',
                },
                { 字段: '源替换品名称', 源值: selectedProduct.replacementNames.join(' / ') || '-' },
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
          ),
        h(Annual, {
          draft,
          read,
          sync,
          update,
          error: errors.annual,
          busy: busy.annual,
          exportAnnual,
          exporting: busy.annualExport,
          exportError: errors.annualExport,
        }),
        h(
          'div',
          { className: 'dc-source-grid' },
          ...Object.keys(sourceDefinitions).map((type) =>
            h(Source, {
              key: `${draft.id}-${type}`,
              type,
              draft,
              read,
              sync,
              update,
              error: errors[type],
              busy: busy[type],
            }),
          ),
        ),
        hasMpsSource() &&
          h(DeliveryMetrics, {
            key: draft.id,
            draft,
            update,
            sync,
            busy: busy.delivery,
            error: errors.delivery,
            active: active && step === 'check',
          }),
        h(SourceInputs, {
          key: draft.id + '-' + scopeGeneration + '-parameters',
          kind: 'parameters',
          draft,
          update,
          relations:
            relations?.scopeKey === JSON.stringify([draft.id, draft.month, scopeGeneration])
              ? relations
              : null,
          active: active && step === 'check',
        }),
        h(
          'div',
          { className: 'dc-section-title' },
          h('h2', {}, '大类预估需求数量 · 测算参考'),
          h('span', {}, '（环比法＋占比法）÷2÷计划达成率，业务冲突保留待定'),
        ),
        h(SourceInputs, {
          key: draft.id + '-' + scopeGeneration + '-basic',
          kind: 'basic',
          draft,
          update,
          relations:
            relations?.scopeKey === JSON.stringify([draft.id, draft.month, scopeGeneration])
              ? relations
              : null,
          active: active && step === 'check',
        }),
        h(
          'section',
          { 'aria-label': '逐月测算', className: 'dc-card dc-results' },
          h(
            'div',
            { className: 'dc-card-head' },
            h('h3', {}, '逐月测算（到大类预估需求数量）'),
            h(
              'span',
              { className: 'dc-card-note' },
              '环比链、同期占比与年度延展口径待确认 · 单位：件',
            ),
          ),
          table(
            [
              '大类',
              '月份',
              '历史平均环比',
              '环比链',
              '① 环比法',
              '同期平均占比',
              '② 占比法',
              '加权',
              '大类预估需求数量',
            ],
            categories.flatMap((category) =>
              [1, 2, 3, 4].map((offset) => ({
                大类: category,
                月份: `${monthOffset(draft.month, offset - 1)}（M+${offset}）`,
                历史平均环比: '待定',
                环比链: '待定',
                '① 环比法': '待定',
                同期平均占比: '待定',
                '② 占比法': '待定',
                加权: '待定',
                大类预估需求数量: '待定',
              })),
            ),
          ),
          h(
            'div',
            { className: 'dc-card-foot' },
            '主公式：（环比法＋占比法）÷2÷计划达成率。代入输入未定，结果为空。M+4仅到大类，不生成单品需求。',
          ),
        ),
        h(
          'section',
          { 'aria-label': '大类预估需求数量', className: 'dc-card dc-results' },
          h(
            'div',
            { className: 'dc-card-head' },
            h('h3', {}, '大类预估需求数量'),
            h('span', { className: 'dc-card-note' }, '测算口径待确认；调整权限与保存合同未接入'),
          ),
          table(
            ['大类', 'M+1', 'M+2', 'M+3', 'M+4', '人工调整'],
            categories.map((category) => ({
              大类: category,
              'M+1': '待定',
              'M+2': '待定',
              'M+3': '待定',
              'M+4': '待定',
              人工调整: '权限与调整合同待确认',
            })),
          ),
        ),
        step === 'check' &&
          h(
            'div',
            { className: 'dc-card-foot' },
            h('button', { className: 'dc-primary', onClick: onNext }, '下一步：本月预估发货'),
          ),
      ),
      !helpOpen && assistant,
    );
  };
}
