import { useStepViewField } from './step-view-state.js';
import { createReportPage } from './report-page.js';

export const historyColumns = [
  '历史期间',
  '物料组',
  '自身原始数量',
  '自身计算用数量',
  '替换品编码',
  '替换系数',
  '替换品原始数量',
  '替换品计算用数量',
  '计算用历史数量',
  '补0状态',
  '历史分类',
  '来源状态',
  '实际处理',
  '来源',
  '原因',
];
const identity = (row) => JSON.stringify([row.base, row.code]);
const uniqueRows = (rows) => [...new Map(rows.map((row) => [identity(row), row])).values()];
const statusText = (status) =>
  ({ ready: '读取完整', partial: '读取不完整', failed: '读取失败', unread: '未读取' })[status] ||
  status;
const reason = (row) =>
  [
    ...new Set([
      ...(row.historyAudit?.reasons ?? []),
      ...(row.historyAudit?.months ?? []).flatMap((month) =>
        month.reasons.map((reason) => `${month.month}：${reason}`),
      ),
      ...(row.historyAudit?.classification === '疑似新品或重新上市'
        ? ['连续12个完整历史月无实际发货，需核对产品身份']
        : []),
      ...(row.historyAudit?.classification === '短期断档数据异常'
        ? ['最近1至2个完整历史月无发货，此前有发货']
        : []),
      ...(row.historyAudit?.classification === '来源异常或其他历史异常' &&
      !row.historyAudit.months.some((month) => month.reasons.length)
        ? ['历史无发货模式不符合前两类，请核对原始历史']
        : []),
    ]),
  ].join('；');
export function historyExportRows(rows, context, period, includeMonths = true) {
  return uniqueRows(rows).flatMap((row) => {
    const common = {
      ...context,
      基地: row.base,
      产品编码: row.code,
      产品名称: row.name,
      大类: row.category,
      物料组: row.group,
    };
    return [
      {
        ...common,
        粒度: '财年历史',
        历史期间: `${period.start}至${period.end}`,
        自身原始数量: row.historyOwnQuantity,
        自身计算用数量: row.historyOwnCalculationQuantity,
        替换品计算用数量: row.historyReferenceCalculationQuantity,
        替换品编码: row.historyCode,
        替换系数: row.historyFactor === undefined ? 1 : row.historyFactor,
        替换品原始数量: row.historyReferenceQuantity,
        计算用历史数量: row.historyQuantity,
        补0状态: row.historyAudit?.zeroFilled ? '缺失数量补0' : '原始有效数量',
        历史分类: row.historyAudit?.classification,
        来源状态: `${statusText(row.historyAudit.sourceStatus)}${row.historyAudit.zeroFilled ? '，缺失数量补0' : ''}`,
        实际处理:
          row.historyQuantity === null
            ? '数量或替换依据待补'
            : '保留独立有效数量，缺失数量补0；零分母占比仍待补',
        来源: 'ai_db.agents_scm_cust_deliv_daily_di.act_dl_qty_total',
        原因: reason(row),
      },
      ...(includeMonths
        ? (row.historyAudit?.months ?? []).map((month) => ({
            ...common,
            粒度: '完整历史月',
            历史期间: month.month,
            自身原始数量: month.ownQuantity,
            替换品编码: row.historyCode,
            替换系数: row.historyFactor === undefined ? 1 : row.historyFactor,
            替换品原始数量: month.referenceQuantity,
            原始历史数量: month.quantity,
            历史分类: row.historyAudit.classification,
            来源状态: statusText(month.status),
            实际处理:
              month.quantity === null ? '原始状态保留，不用于无发货分类' : '原始可确认历史用于分类',
            来源: 'ai_db.agents_scm_cust_deliv_daily_di.act_dl_qty_total',
            原因: month.reasons.join('；'),
          }))
        : []),
    ];
  });
}
export function createHistoryReport(react, { downloadCsv }) {
  const h = react.createElement;
  const formatNumber = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format;
  const number = (value) => (value == null ? '待补' : formatNumber(value));
  const ReportPage = createReportPage(react);
  return function HistoryReport({ view, draft, rows, period, card, table }) {
    const entries = react.useMemo(() => uniqueRows(rows), [rows]);
    const [selected, setSelected] = useStepViewField(react, view, 'HistoryReport.selection', '');
    const current = entries.find((row) => identity(row) === selected) ?? entries[0];
    const context = { 评估版本: draft.name, 评估月份: draft.month };
    const scrollTable = (name, columns, values) =>
      react.cloneElement(table(name, columns, values), {
        tabIndex: 0,
        role: 'region',
        'aria-label': `${name}，可横向滚动`,
      });
    return card(
      '历史发货分类与补0',
      h(
        react.Fragment,
        null,
        h(
          'p',
          { className: 'wf-note' },
          '分类使用实际已结束的完整月原始历史。上一完整财年按同基地自身＋替换品×系数展示和计算，缺失数量补0，来源异常保留；0÷0仍待补。',
        ),
        h(
          ReportPage,
          { view, stateKey: 'HistoryReport.page', label: '财年历史', rows: entries },
          (visible) =>
            scrollTable(
              '历史发货分类及财年数量',
              [
                '基地',
                '产品编码',
                '历史分类',
                '自身原始数量',
                '自身计算用数量',
                '替换品编码',
                '替换品原始数量',
                '替换品计算用数量',
                '替换系数',
                '计算用历史数量',
                '补0状态',
                '来源状态',
                '原因',
              ],
              historyExportRows(visible, context, period, false).map((row) => [
                row.基地,
                row.产品编码,
                row.历史分类,
                number(row.自身原始数量),
                number(row.自身计算用数量),
                row.替换品编码 || '无',
                row.替换品编码 ? number(row.替换品原始数量) : '不适用',
                row.替换品编码 ? number(row.替换品计算用数量) : '不适用',
                row.替换品编码 ? number(row.替换系数) : '不适用',
                number(row.计算用历史数量),
                row.补0状态,
                row.来源状态,
                row.原因 || '无异常',
              ]),
            ),
        ),
        h(
          'label',
          null,
          '核对近24个月历史',
          h(
            'select',
            {
              'aria-label': '核对历史基地SKU',
              value: current ? identity(current) : '',
              onChange: (event) => setSelected(event.target.value),
            },
            entries.map((row) =>
              h(
                'option',
                { key: identity(row), value: identity(row) },
                `${row.base} ${row.code} ${row.name}`,
              ),
            ),
          ),
        ),
        current &&
          scrollTable(
            '近24个月原始历史',
            ['月份', '自身数量', '替换品数量', '原始历史数量', '来源状态', '原因'],
            current.historyAudit.months.map((month) => [
              month.month,
              number(month.ownQuantity),
              current.historyCode ? number(month.referenceQuantity) : '不适用',
              number(month.quantity),
              statusText(month.status),
              month.reasons.join('；') || '完整读取，可确认无记录月份为无实际发货',
            ]),
          ),
      ),
      h(
        'button',
        {
          onClick: () =>
            downloadCsv(
              `${draft.month}-历史及异常明细.csv`,
              [
                '评估版本',
                '评估月份',
                '粒度',
                '基地',
                '产品编码',
                '产品名称',
                '大类',
                ...historyColumns,
                '原始历史数量',
              ],
              historyExportRows(entries, context, period),
            ),
        },
        '下载当前历史及异常明细',
      ),
    );
  };
}
