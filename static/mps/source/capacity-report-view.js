import { defaultProductionCalendar, productionCalendarRule } from './production-calendar.js';

const offset = (month, count) => {
  const date = new Date(`${month}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + count);
  return date.toISOString().slice(0, 7);
};

export function createCapacityReport(react, { Dialog, downloadCsv }) {
  const h = react.createElement;
  return function CapacityReport({ plan, draft, stamp, filters, card, table, numberText, active }) {
    const [rulesOpen, setRulesOpen] = react.useState(false);
    const [openSeries, setOpenSeries] = react.useState('');
    const [openLines, setOpenLines] = react.useState({});
    const [openTransfers, setOpenTransfers] = react.useState({});
    const report = plan.capacityReport;
    if (!report) return null;
    const month = filters.month || report.referenceMonth;
    const next = offset(month, 1);
    const byBase = (row) => !filters.base || row.base === filters.base;
    const groups = report.rccp.filter(
      (row) =>
        row.month === month &&
        byBase(row) &&
        (!filters.category || row.category === filters.category),
    );
    const nextGroups = new Map(
      report.rccp
        .filter((row) => row.month === next)
        .map((row) => [JSON.stringify([row.base, row.category]), row]),
    );
    const totalIndex = new Map(
      report.totals.map((row) => [JSON.stringify([row.month, row.base]), row]),
    );
    const annualIndex = new Map(
      report.annualTotals.map((row) => [JSON.stringify([row.month, row.base]), row]),
    );
    const metric = (value) =>
      value.value === null
        ? value.missing
          ? `${numberText(value.known, false, 3)} · ${value.missing}项待补`
          : '缺本月需求来源'
        : numberText(value.value, false, 3);
    const load = (value, band) =>
      h(
        'span',
        { className: 'wf-capacity-load', 'data-band': band },
        value === null ? '待评估' : numberText(value, true),
      );
    const baseRows = report.totals.filter(
      (row) => row.month === month && (filters.base ? row.base === filters.base : true),
    );
    const exportRows = report.rccp
      .filter((row) => byBase(row))
      .map((row) => ({
        评估版本: draft.name,
        结果时间: stamp,
        月份: row.month,
        基地: row.base,
        大类: row.category,
        归属需求吨数: row.demand.value,
        已知归属需求吨数: row.demand.known,
        无归属需求吨数: row.unassigned.value,
        已知无归属需求吨数: row.unassigned.known,
        日产吨数: row.dailyTons,
        月产能: row.capacity,
        负荷率: row.load,
        余量吨数: row.margin,
        缺口吨数: row.gap,
        数据状态:
          row.demand.value === null || row.capacity === null
            ? '缺输入，未形成完整负荷'
            : '口径齐全',
      }));
    const toggle = (setter, key, open) => setter((value) => ({ ...value, [key]: open }));
    const rccpTable = (columns, rows) =>
      h(
        'div',
        { className: 'dc-table-scroll wf-table-scroll' },
        h(
          'table',
          { 'aria-label': '基地大类RCCP' },
          h(
            'thead',
            null,
            h(
              'tr',
              null,
              columns.map((column) => h('th', { key: column }, column)),
            ),
          ),
          h(
            'tbody',
            null,
            rows.length
              ? rows.map((cells, index) =>
                  h(
                    'tr',
                    { key: index },
                    cells.length === 1 && cells[0]?.colSpan
                      ? h('td', { colSpan: cells[0].colSpan }, cells[0].content)
                      : cells.map((cell, position) => h('td', { key: position }, cell)),
                  ),
                )
              : h('tr', null, h('td', { colSpan: 9 }, '当前范围没有需求明细')),
          ),
        ),
      );
    const transferGroups = Map.groupBy(
      plan.transfers.filter(
        (row) =>
          (!filters.month || row.month === filters.month) &&
          (!filters.base || [row.from, row.to].includes(filters.base)),
      ),
      (row) => row.month,
    );
    const lineDetails = new Map(
      (plan.capacityLineDetails ?? []).map((row) => [row.resourceId, row]),
    );
    return h(
      react.Fragment,
      null,
      h(
        'div',
        { className: 'wf-actions' },
        h(
          'span',
          null,
          `发货基准月 ${report.referenceMonth}，当前展示 ${month} · 单位：吨。基准月取年度SKU需求，M+1至M+3取本轮拆分，M+4为年度参考。`,
        ),
        h('button', { onClick: () => setRulesOpen(true) }, '口径与规则'),
        h(
          'button',
          {
            disabled: !active,
            onClick: () =>
              downloadCsv(
                `${draft.month}-产能评估报告.csv`,
                Object.keys(exportRows[0] ?? {}),
                exportRows,
              ),
          },
          '导出产能评估报告',
        ),
      ),
      card(
        '总需求 vs 月总产能',
        table(
          '基地需求与月总产能',
          [
            '基地',
            '产线条数',
            `${month}总需求（吨）`,
            '生产天数',
            '日标准产能（吨/日）',
            '月总产能（吨）',
            '负荷率',
            '余量（吨）',
            ...Array.from(
              { length: 4 },
              (_, index) =>
                `${offset(month, index + 1)}负荷率${plan.months.includes(offset(month, index + 1)) ? '' : '（年度参考）'}`,
            ),
          ],
          baseRows.map((row) => [
            row.base,
            row.lines,
            metric(row.demand),
            row.days ?? '待补',
            numberText(row.dailyTons, false, 3),
            numberText(row.capacity, false, 3),
            load(row.load, row.band),
            numberText(row.margin, false, 3),
            ...Array.from({ length: 4 }, (_, index) => {
              const period = offset(month, index + 1);
              const reference = !plan.months.includes(period);
              const item = (reference ? annualIndex : totalIndex).get(
                JSON.stringify([period, row.base]),
              );
              return item ? load(item.load, item.band) : '缺需求来源';
            }),
          ]),
        ),
      ),
      card(
        '基地 × 大类 RCCP',
        h(
          react.Fragment,
          null,
          h(
            'p',
            { className: 'wf-note' },
            '无有效本基地产线的需求单列，不计入本基地产线负荷。共享柔线在各大类作为组合能力引用，全国物理总产能只计一次。缺换算系数或有效需求时只显示已知小计。',
          ),
          rccpTable(
            [
              '基地',
              '大类',
              `${month}归属需求（吨）`,
              '日产能（吨/日）',
              '月产能（吨）',
              `${month}负荷率`,
              '余量（吨）',
              `${next}负荷率`,
              '无归属需求（吨）',
            ],
            groups.flatMap((row) => {
              const key = JSON.stringify([row.month, row.base, row.category]);
              const later = nextGroups.get(JSON.stringify([row.base, row.category]));
              return [
                [
                  row.base,
                  h(
                    react.Fragment,
                    null,
                    row.category,
                    h(
                      'button',
                      {
                        type: 'button',
                        className: 'dc-link',
                        'aria-label': `${row.base} ${row.category} 系列明细`,
                        'aria-expanded': openSeries === key,
                        onClick: () => setOpenSeries(openSeries === key ? '' : key),
                      },
                      openSeries === key ? '收起系列' : '系列 ▾',
                    ),
                  ),
                  metric(row.demand),
                  numberText(row.dailyTons, false, 3),
                  numberText(row.capacity, false, 3),
                  row.capacity === null ? '无有效产线能力' : load(row.load, row.band),
                  numberText(row.margin, false, 3),
                  later ? load(later.load, later.band) : '缺需求来源',
                  metric(row.unassigned),
                ],
                ...(openSeries === key
                  ? [
                      [
                        {
                          content: h(
                            'div',
                            { className: 'wf-capacity-series' },
                            h('h4', null, `${row.base} · ${row.category} · 系列明细`),
                            table(
                              'RCCP系列明细',
                              [
                                '系列（物料组）',
                                `${month}归属需求（吨）`,
                                '占大类',
                                '产能配额（吨）',
                                '超配额（吨）',
                                `${next}归属需求（吨）`,
                                '无归属需求（吨）',
                              ],
                              [
                                ...row.series.map((item) => {
                                  const future = later?.series.find(
                                    (other) => other.group === item.group,
                                  );
                                  return [
                                    `${item.group} ${item.name}`,
                                    metric(item.demand),
                                    numberText(item.share, true),
                                    numberText(item.quota, false, 3),
                                    numberText(item.excess, false, 3),
                                    future ? metric(future.demand) : '缺需求来源',
                                    metric(item.unassigned),
                                  ];
                                }),
                                [
                                  '合计',
                                  metric(row.demand),
                                  row.demand.value !== null && row.demand.value > 0 ? '100%' : '—',
                                  numberText(row.demand.value > 0 ? row.capacity : null, false, 3),
                                  numberText(
                                    row.demand.value > 0 && row.margin !== null
                                      ? -row.margin
                                      : null,
                                    false,
                                    3,
                                  ),
                                  later ? metric(later.demand) : '缺需求来源',
                                  metric(row.unassigned),
                                ],
                              ],
                            ),
                            h(
                              'p',
                              { className: 'wf-note' },
                              '产能配额按归属需求占比分摊，仅作组合参考；无归属需求不分配产能。真实系列级产能仍需产线系列与物料组映射。',
                            ),
                          ),
                          colSpan: 9,
                        },
                      ],
                    ]
                  : []),
              ];
            }),
          ),
        ),
      ),
      card(
        '调拨计划',
        h(
          react.Fragment,
          null,
          h(
            'p',
            { className: 'wf-note' },
            '计划月 → 发出与接收线路 → 大类、物料组、SKU。发出侧先满足自身需求；本表数量单位为件。',
          ),
          transferGroups.size
            ? [...transferGroups].map(([period, rows]) =>
                h(
                  'details',
                  {
                    key: period,
                    className: 'wf-plan-disclosure',
                    onToggle: (event) => toggle(setOpenTransfers, period, event.target.open),
                  },
                  h('summary', null, `${period} · ${rows.length}条调拨`),
                  openTransfers[period]
                    ? [...Map.groupBy(rows, (row) => JSON.stringify([row.from, row.to]))].map(
                        ([route, items]) => {
                          const from = items[0].from,
                            to = items[0].to;
                          const key = `${period}:${route}`;
                          return h(
                            'details',
                            {
                              key,
                              className: 'wf-plan-disclosure',
                              onToggle: (event) => {
                                event.stopPropagation();
                                toggle(setOpenTransfers, key, event.target.open);
                              },
                            },
                            h(
                              'summary',
                              null,
                              `${from} → ${to} · 线路小计 ${numberText(
                                items.reduce((total, row) => total + row.quantity, 0),
                                false,
                                3,
                              )}件`,
                            ),
                            openTransfers[key]
                              ? table(
                                  '线路调拨明细',
                                  ['大类', '系列（物料组）', 'SKU', '调拨数量（件）'],
                                  items.map((item) => {
                                    const product = plan.rows.find(
                                      (row) =>
                                        row.base === item.to &&
                                        row.code === item.code &&
                                        row.month === item.month,
                                    );
                                    return [
                                      product?.category ?? '待核对',
                                      product?.group ?? '待核对',
                                      item.code,
                                      numberText(item.quantity, false, 3),
                                    ];
                                  }),
                                )
                              : null,
                          );
                        },
                      )
                    : null,
                ),
              )
            : h('p', null, '本轮无可执行调拨。'),
        ),
      ),
      card(
        '全年月度负荷率',
        h(
          react.Fragment,
          null,
          h(
            'p',
            { className: 'wf-note' },
            `年度需求独立取${report.annualSource.table}，读取${report.annualSource.records}个基地SKU月份，另有${report.annualSource.excludedRows}行无SKU编码未纳入折吨、${report.annualSource.unmappedCount}行维度待核对。${report.annualSource.error || '按SKU有效吨/件折算，空值、冲突及缺件吨系数的月份保留待评估。'}${productionCalendarRule}首表超出本轮拆分的月份仅作年度需求参考，不参与排产。`,
          ),
          h(
            'button',
            {
              disabled: !active,
              onClick: () => {
                const rows = report.annualIssues
                  .filter((row) => !filters.base || row.base === filters.base)
                  .map((row) => ({
                    基地: row.base,
                    产品编码: row.code,
                    适用月份: [...new Set(row.months)].join('、'),
                    待补原因: row.reason,
                    源表: row.sourceTable,
                    字段: row.fields,
                  }));
                downloadCsv(
                  `${draft.month}-年度评估缺项.csv`,
                  ['基地', '产品编码', '适用月份', '待补原因', '源表', '字段'],
                  rows,
                );
              },
            },
            '导出年度评估缺项',
          ),
          h(
            'details',
            { className: 'wf-plan-disclosure' },
            h(
              'summary',
              null,
              `年度评估缺项 ${report.annualIssues.length}项，按基地SKU与原因分列，预览前25项`,
            ),
            table(
              '年度评估缺项',
              ['基地', 'SKU', '适用月份', '待补原因', '源表 / 字段'],
              report.annualIssues
                .slice(0, 25)
                .map((row) => [
                  row.base,
                  row.code,
                  [...new Set(row.months)].join('、'),
                  row.reason,
                  `${row.sourceTable} / ${row.fields}`,
                ]),
            ),
          ),
          report.annualSource.unmappedCount
            ? h(
                'details',
                { className: 'wf-plan-disclosure' },
                h(
                  'summary',
                  null,
                  `年度来源维度待核对 ${report.annualSource.unmappedCount}行，预览前25行`,
                ),
                table(
                  '年度来源维度待核对',
                  ['月份', 'SKU', '待补字段'],
                  report.annualSource.unmappedPreview.map((row) => [
                    row.month || '无法识别',
                    row.code,
                    row.reason,
                  ]),
                ),
              )
            : null,
          h(
            'div',
            null,
            table(
              '全年月度负荷率矩阵',
              [
                '基地',
                ...report.fiscalMonths.map((period) => {
                  const days = defaultProductionCalendar(period).holidayDates.length;
                  return h(
                    'span',
                    { key: period, className: days ? 'wf-capacity-holiday' : '' },
                    days ? `${period} 春节扣${days}天` : period,
                  );
                }),
                '全年需求（吨）',
              ],
              [
                ...(filters.base ? [filters.base] : report.bases),
                ...(!filters.base ? ['全国'] : []),
              ].map((base) => {
                const items = report.fiscalMonths.map((period) =>
                  annualIndex.get(JSON.stringify([period, base])),
                );
                return [
                  base,
                  ...items.map((row, index) =>
                    h(
                      'span',
                      {
                        className: defaultProductionCalendar(report.fiscalMonths[index])
                          .holidayDates.length
                          ? 'wf-capacity-holiday'
                          : '',
                        title: row
                          ? `年度需求已知小计${numberText(row.demand.known, false, 3)}吨；${row.demand.missing}项缺需求或有效件吨系数`
                          : '未取得年度需求',
                      },
                      row ? load(row.load, row.band) : '缺来源',
                    ),
                  ),
                  items.every(
                    (row) => row?.demand.value !== null && row?.demand.value !== undefined,
                  )
                    ? numberText(
                        items.reduce((total, row) => total + row.demand.value, 0),
                        false,
                        3,
                      )
                    : '全年来源未齐',
                ];
              }),
            ),
          ),
        ),
      ),
      card(
        '产线产能明细',
        h(
          react.Fragment,
          null,
          h(
            'p',
            { className: 'wf-note' },
            '按物理产线去重。隧道吨位为设备规格，不作为日产能；成型机产能尚未接入。',
          ),
          report.bases
            .filter((base) => !filters.base || filters.base === base)
            .map((base) => {
              const lines = report.lines.filter((row) => row.month === month && row.base === base);
              return h(
                'details',
                {
                  key: base,
                  className: 'wf-plan-disclosure',
                  onToggle: (event) => toggle(setOpenLines, base, event.target.open),
                },
                h('summary', null, `${base} · ${lines.length}条产线`),
                openLines[base]
                  ? table(
                      '物理产线产能明细',
                      [
                        '车间',
                        '隧道号',
                        '隧道吨位（规格）',
                        '产线',
                        '日标准产能（吨/日）',
                        '生产天数',
                        '月产能（吨）',
                        '产线类型',
                      ],
                      lines.map((row) => {
                        const info = lineDetails.get(row.resourceId);
                        return [
                          info?.workshop || '待补',
                          info?.tunnel || '待补',
                          info?.specification || '待补',
                          row.name,
                          numberText(row.dailyTons, false, 3),
                          row.days ?? '待补',
                          numberText(row.capacity, false, 3),
                          info?.outsourced ? '代工厂' : '隧道',
                        ];
                      }),
                    )
                  : null,
              );
            }),
        ),
      ),
      card(
        '缺口明细',
        h(
          react.Fragment,
          null,
          h(
            'p',
            { className: 'wf-note' },
            '触发口径＝归属需求超过月产能上限。吨数缺口与SKU件数未满足量分开列出。无有效产能或需求不完整的行保留为待评估，不伪造缺口。',
          ),
          table(
            '月产能缺口明细',
            [
              '基地',
              '大类',
              '计划月',
              '需求（吨）',
              '月产能上限（吨）',
              '缺口（吨）',
              '负荷率',
              '瓶颈类型',
            ],
            report.gaps
              .filter(
                (row) =>
                  byBase(row) &&
                  (!filters.month || row.month === filters.month) &&
                  (!filters.category || row.category === filters.category),
              )
              .map((row) => [
                row.base,
                row.category,
                row.month,
                numberText(row.demand.value, false, 3),
                numberText(row.capacity, false, 3),
                numberText(row.gap, false, 3),
                load(row.load, row.band),
                '隧道；处置类型待人工确认',
              ]),
          ),
          h(
            'p',
            { className: 'wf-note' },
            '处置由人工评估。需提前建库存、当月增加产能、吞吐能力瓶颈三类原因须确认后标注，系统不代做处置决定。',
          ),
        ),
      ),
      rulesOpen
        ? h(
            Dialog,
            { title: '口径与规则', close: () => setRulesOpen(false) },
            h(
              'p',
              null,
              `月产能＝去重后的物理产线日产吨数×有效生产天数。${productionCalendarRule}已采用停线约束继续生效。`,
            ),
            h(
              'p',
              null,
              'RCCP只用有有效本基地产线的需求评估本基地负荷；无归属需求单列。组合柔线可在不同大类引用，全国物理总产能去重。',
            ),
            h(
              'p',
              null,
              '负荷90%至105%为黄色，超过105%为红色。系列配额＝大类月产能×归属需求占比，保留超配额正负值以对平大类余量。',
            ),
            h(
              'p',
              null,
              '生产达成率＝实际发货加调出量后除以实际生产量；计划达成率＝实际发货÷预测。两者只用于对应复盘口径，不与需求负荷混算。',
            ),
            h(
              'p',
              null,
              '现有调拨关系仅在来源月份有效。0.5调拨库存修正系数尚未确认，本轮未采用。全年未取得的需求月份及缺件吨系数保持待补。',
            ),
          )
        : null,
    );
  };
}
