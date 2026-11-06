import { sourceDimensions } from './source-projections.js';
const text = (value) => (typeof value === 'string' ? value.trim() : '');
const key = (base, code) => JSON.stringify([text(base), text(code)]);
const hasKey = (row) => text(row['基地']) && text(row['产品编码']);
const usable = (value) =>
  ['number', 'string'].includes(typeof value) &&
  String(value).trim() !== '' &&
  Number.isFinite(Number(value)) &&
  Number(value) >= 0 &&
  Number(value) <= Number.MAX_SAFE_INTEGER;
const columns = [
  '来源',
  '期间',
  '读取状态',
  '完整读取总条数',
  '池内源行',
  '可用数量键/产品池键',
  '缺数量源行',
  '缺业务键源行',
  '池外源行',
  '原因',
];

export function createSourceDiagnostics(react, { downloadCsv, Dialog }) {
  const h = react.createElement;
  return function SourceDiagnostics({ draft, result, table }) {
    const [preview, setPreview] = react.useState(null);
    const [page, setPage] = react.useState(0);
    const products = new Map();
    for (const row of ['loading', 'failed'].includes(draft.productsRead?.status)
      ? []
      : (draft.products ?? [])) {
      const code = text(row['产品编码']);
      if (code) products.set(code, [...(products.get(code) ?? []), row]);
    }
    const currentProducts = [...products.values()].flat();
    const productDetail = (row) => {
      const candidates = (products.get(text(row['产品编码'])) ?? []).filter(
        (product) => !text(product['基地']) || product['基地'] === row['基地'],
      );
      const names = [
        ...new Set(candidates.map((product) => text(product['产品名称'])).filter(Boolean)),
      ];
      return { ...row, 产品名称: text(row['产品名称']) || (names.length === 1 ? names[0] : '') };
    };
    const diagnostics = ['report', 'history'].flatMap((source) =>
      result.months.slice(0, 3).map((month) => {
        const fiscal = previousFiscalYear(month);
        const period = source === 'report' ? month : `${month}（${fiscal.start}至${fiscal.end}）`;
        const sales = source === 'report' && draft.reportSource === 'business';
        const local = draft[source + 'Source'] === 'local-file';
        const annual = draft.historyAnnual?.periods?.find(
          (entry) => entry.start === fiscal.start && entry.end === fiscal.end,
        );
        const state = sales ? draft.planRatesRead : draft.historyAnnualRead;
        const read = sales
          ? state?.month === draft.month
            ? state
            : undefined
          : source === 'history'
            ? state?.month === draft.month
              ? {
                  ...state,
                  metadata: annual?.metadata,
                  error: annual?.error || state.error,
                  status: annual?.error
                    ? 'failed'
                    : state.status === 'ready' && !annual
                      ? 'unread'
                      : state.status,
                }
              : undefined
            : (draft.reportRead?.periods?.[month] ?? (local ? draft.reportRead : undefined));
        const records = sales
          ? (draft.planRates ?? []).filter(
              (row) => row['月份'] === month && row['维度类型'] === '基地+产品',
            )
          : source === 'history'
            ? (annual?.rows ?? []).map((row) => ({ ...row, 月份: month }))
            : (draft.report ?? []).filter((row) => row['月份'] === month);
        const pool = new Set(
          result.rows.filter((row) => row.month === month).map((row) => key(row.base, row.code)),
        );
        const column = sales
          ? '当前维度计划量'
          : source === 'report'
            ? draft.pull === 'monthly'
              ? '月初数量'
              : '纠偏数量'
            : '数量';
        const quantity = (row) => row[source === 'report' ? '源' + column : column] ?? row[column];
        const matched = (row) => hasKey(row) && pool.has(key(row['基地'], row['产品编码']));
        const ready = read?.status === 'ready';
        const total =
          sales || (local && source === 'report') ? records.length : read?.metadata?.total;
        const counted = ready && Number.isSafeInteger(total) && total === records.length;
        const partial = read?.metadata?.partial;
        const complete = counted && (!partial || records.length > 0);
        let readLabel =
          { loading: '读取中', failed: '失败', denied: '失败', error: '失败' }[read?.status] ??
          '未读取';
        if (ready)
          readLabel = complete ? (records.length ? '成功有记录' : '成功空集') : '读取不完整';
        const groups = new Map();
        for (const row of records.filter(matched)) {
          const id = key(row['基地'], row['产品编码']);
          groups.set(id, (groups.get(id) ?? true) && usable(quantity(row)));
        }
        const warnings = [
          ...new Set(
            (read?.metadata?.warnings ?? []).map((warning) =>
              typeof warning === 'string' ? warning : JSON.stringify(warning),
            ),
          ),
        ];
        const reason = [
          text(read?.error),
          ready && !counted ? '来源未完整返回，不能判定空集或完整覆盖' : '',
          partial
            ? records.length
              ? '部分字段不可用，数量按当前口径独立核对'
              : '来源返回部分结果且无记录，不能判定成功空集'
            : '',
          ...warnings,
        ]
          .filter(Boolean)
          .join('；');
        const summary = {
          来源: source === 'report' ? (sales ? '销售提报占比' : '计划提报') : '上一财年发货',
          期间: period,
          读取状态: readLabel,
          完整读取总条数: complete ? total : null,
          池内源行: ready ? records.filter(matched).length : null,
          '可用数量键/产品池键': complete
            ? `${[...groups.values()].filter(Boolean).length}/${pool.size}`
            : null,
          缺数量源行: ready ? records.filter((row) => !usable(quantity(row))).length : null,
          缺业务键源行: ready ? records.filter((row) => !hasKey(row)).length : null,
          池外源行: ready ? records.filter((row) => hasKey(row) && !matched(row)).length : null,
          原因: reason,
        };
        const detailColumns = [
          '月份',
          ...(source === 'report' && !sales ? ['大区'] : []),
          '基地',
          '产品编码',
          '产品名称',
          '大类',
          '系列',
          '物料组',
          '物料组名称',
          '源大类',
          '源系列',
          '源物料组',
          '缺项原因',
          ...(sales
            ? ['当前维度计划量']
            : source === 'report'
              ? ['源月初数量', '源纠偏数量']
              : ['数量']),
          '当前口径',
          '当前数量状态',
          '产品池匹配',
          '缺项说明',
          '读取状态',
        ];
        return {
          id: source + month,
          summary,
          detailColumns,
          records: sourceDimensions(
            [...records].sort((a, b) => Number(matched(b)) - Number(matched(a))),
            currentProducts,
          ).map((row) => {
            const detail = productDetail(row);
            return {
              ...row,
              ...detail,
              ...(source === 'report' && !sales
                ? {
                    源月初数量: row['源月初数量'] ?? row['月初数量'],
                    源纠偏数量: row['源纠偏数量'] ?? row['纠偏数量'],
                  }
                : {}),
              当前口径: column,
              当前数量状态: usable(quantity(row)) ? '数量可用' : '缺数量',
              产品池匹配: !hasKey(row) ? '缺业务键' : matched(row) ? '池内' : '池外',
              缺项说明: [
                detail['缺项原因'],
                !text(row['基地']) ? '源数据缺基地' : '',
                !text(row['产品编码']) ? '源数据缺产品编码' : '',
                ...['大类', '系列', '物料组']
                  .filter((field) => !detail[field])
                  .map((field) => `${field}未能唯一匹配当前产品清单`),
              ]
                .filter(Boolean)
                .join('；'),
              读取状态: readLabel,
            };
          }),
        };
      }),
    );
    const selected = diagnostics.find((entry) => entry.id === preview);
    const download = (entry) =>
      downloadCsv(
        `${entry.summary['来源']}-${entry.summary['期间']}-来源明细.csv`,
        entry.detailColumns,
        entry.records,
      );
    return h(
      'section',
      { className: 'dc-card wf-source-diagnostics', 'aria-label': '逐期来源诊断' },
      h(
        'div',
        { className: 'dc-card-head' },
        h('h3', null, '逐期来源诊断'),
        h(
          'button',
          {
            onClick: () =>
              downloadCsv(
                '逐期来源诊断.csv',
                columns,
                diagnostics.map((entry) => entry.summary),
              ),
          },
          '导出来源诊断',
        ),
      ),
      h(
        'p',
        { className: 'wf-note' },
        `业务提报使用销售提报占比表的基地产品计划量，历史使用上一完整财年发货量，与当前计算同源；本地提报使用${draft.pull === 'monthly' ? '月初数量' : '纠偏数量'}。数量覆盖按基地与产品编码去重，产品池缺键条目仍计入分母；同键全部源行数量可用才计入覆盖，真实0有效。其他字段缺失单列警告，不影响当前数量核对；缺业务键与池外行分别统计，缺数量含无效值，可与两者重叠。未完整返回、失败、未读取或部分结果无记录时，完整总条数及覆盖留空，保留明细仅供核对。`,
      ),
      table(
        '逐期来源诊断',
        [...columns, '明细'],
        diagnostics.map((entry) => [
          ...columns.map((column) =>
            entry.summary[column] == null || entry.summary[column] === ''
              ? '—'
              : String(entry.summary[column]),
          ),
          h(
            'button',
            {
              disabled: !entry.records.length,
              onClick: () => {
                setPreview(entry.id);
                setPage(0);
              },
            },
            '明细',
          ),
        ]),
      ),
      selected &&
        h(
          Dialog,
          {
            title: `${selected.summary['来源']} · ${selected.summary['期间']} · 来源明细`,
            className: 'dc-source-detail',
            close: () => setPreview(null),
            footer: h('button', { onClick: () => download(selected) }, '下载明细'),
          },
          h(
            'p',
            null,
            `读取状态：${selected.summary['读取状态']}；${selected.summary['原因'] || '按当前产品池与口径核对'}。池内源行${selected.summary['池内源行'] ?? '—'}条，缺基地或产品编码${selected.summary['缺业务键源行'] ?? '—'}条，池外${selected.summary['池外源行'] ?? '—'}条。优先展示池内明细，产品分类按编码补充当前产品清单的唯一对应值，缺基地的源行不能参与基地单品计算。`,
          ),
          table(
            '来源明细',
            selected.detailColumns,
            selected.records
              .slice(page * 25, (page + 1) * 25)
              .map((row) =>
                selected.detailColumns.map((column) =>
                  column === '基地' && !text(row[column])
                    ? '源数据缺基地'
                    : row[column] == null || row[column] === ''
                      ? '—'
                      : String(row[column]),
                ),
              ),
          ),
          h(
            'div',
            { className: 'dc-pagination' },
            h('span', null, `共${selected.records.length}条，每页25条，第${page + 1}页`),
            h('button', { disabled: !page, onClick: () => setPage(page - 1) }, '上一页'),
            h(
              'button',
              {
                disabled: (page + 1) * 25 >= selected.records.length,
                onClick: () => setPage(page + 1),
              },
              '下一页',
            ),
          ),
        ),
    );
  };
}
import { previousFiscalYear } from 'dsh-agent-manage/mps-compute/workflow';
