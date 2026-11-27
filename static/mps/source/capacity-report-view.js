import { createCalculationHelp } from './calculation-help.js';
import { compareBusinessRows } from './table-presentation.js';
import { useStepViewField } from './step-view-state.js';
import { createReportPage, renderTableFooter, renderTablePagination } from './report-page.js';
import { defaultProductionCalendar, productionCalendarRule } from './production-calendar.js';
import { odmDemandFooter, odmDemandLabel, odmDemandText, odmDemandTotal } from './odm-demand.js';

const offset = (month, count) => {
  const date = new Date(`${month}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + count);
  return date.toISOString().slice(0, 7);
};

export function createCapacityReport(react, { Dialog, downloadCsv: downloadRawCsv }) {
  const h = react.createElement;
  const CalculationHelp = createCalculationHelp(react);
  const ReportPage = createReportPage(react);
  return function CapacityReport({
    plan,
    draft,
    stamp,
    filters,
    card,
    table,
    numberText,
    active,
    view,
  }) {
    const [rulesOpen, setRulesOpen] = useStepViewField(
      react,
      view,
      'CapacityReport.rulesOpen',
      false,
    );
    const [openSeries, setOpenSeries] = useStepViewField(
      react,
      view,
      'CapacityReport.openSeries',
      '',
    );
    const [openLines, setOpenLines] = useStepViewField(react, view, 'CapacityReport.openLines', {});
    const [openTransfers, setOpenTransfers] = useStepViewField(
      react,
      view,
      'CapacityReport.openTransfers',
      {},
    );
    const [issuePage, setIssuePage] = useStepViewField(react, view, 'CapacityReport.issuePage', 0);
    const inputScope = JSON.stringify([
      filters.month,
      filters.base,
      filters.category,
      filters.search,
    ]);
    const [shownInput, setShownInput] = useStepViewField(
      react,
      view,
      'CapacityReport.input',
      inputScope,
    );
    react.useEffect(() => {
      if (shownInput === inputScope) return;
      setShownInput(inputScope);
      setIssuePage(0);
    }, [shownInput, inputScope, setShownInput]);
    const [disclosures, setDisclosures] = useStepViewField(
      react,
      view,
      'CapacityReport.disclosures',
      {},
    );
    const disclosure = (key) => ({
      className: 'wf-plan-disclosure mps-report-details',
      open: Boolean(disclosures[key]),
      onToggle: (event) => {
        if (event.target === event.currentTarget)
          setDisclosures((current) => ({ ...current, [key]: event.currentTarget.open }));
      },
    });
    const report = plan.capacityReport;
    if (!report) return null;
    const downloadCsv = (name, columns, rows) =>
      downloadRawCsv(
        name,
        ['本轮预测计算范围', '排除单品记录数', ...columns],
        rows.map((row) => ({
          本轮预测计算范围: plan.partial
            ? '部分可计算，待定单品已排除，完整范围总量未知'
            : '当前参与范围',
          排除单品记录数: plan.excludedShipments?.length ?? 0,
          ...row,
        })),
      );
    const month = filters.month || report.referenceMonth;
    const next = offset(month, 1);
    const byBase = (row) => !filters.base || row.base === filters.base;
    const odmDetails = (report.productDetails ?? []).filter((row) => row.odm && byBase(row));
    const odmDemand = odmDemandTotal(odmDetails, { ...filters, month });
    const groupKey = (row) => JSON.stringify([row.month, row.base, row.category]);
    const internalGroups = Map.groupBy(
      (report.productDetails ?? []).filter((row) => !row.odm),
      groupKey,
    );
    const isInternalGroup = (row) => !report.productDetails || internalGroups.has(groupKey(row));
    const groups = report.rccp
      .filter(
        (row) =>
          row.month === month &&
          byBase(row) &&
          isInternalGroup(row) &&
          (!filters.category || row.category === filters.category),
      )
      .sort(compareBusinessRows);
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
    const annualOdm = report.fiscalMonths
      .map((period) => annualIndex.get(JSON.stringify([period, filters.base || '全国']))?.odmDemand)
      .filter(Boolean);
    const annualOdmKnown = annualOdm.reduce((total, item) => total + item.known, 0);
    const annualOdmMissing = annualOdm.some((item) => item.missing > 0);
    const annualOdmDemand =
      annualOdmKnown || annualOdmMissing || odmDemand
        ? {
            value:
              annualOdmMissing || !report.annualSource.records || report.annualSource.error
                ? null
                : annualOdmKnown,
            known: annualOdmKnown,
          }
        : null;
    const metric = (value) =>
      value.value === null
        ? value.missing
          ? `${numberText(value.known)} · ${value.missing}项待补`
          : '缺本月需求来源'
        : numberText(value.value);
    const load = (row) => {
      if (row.load !== null)
        return h(
          'span',
          { className: 'wf-capacity-load', 'data-band': row.band },
          numberText(row.load, true),
        );
      if (row.capacity === null)
        return h(
          'span',
          { className: 'wf-capacity-load', 'data-band': 'unknown' },
          '无本基地可用产能',
        );
      if (row.capacity === 0)
        return h(
          'span',
          { className: 'wf-capacity-load', 'data-band': 'unknown' },
          '本月可用产能为0',
        );
      return row.knownLoad !== null && row.demand.missing
        ? h(
            'span',
            {
              className: 'wf-capacity-partial',
              title: '仅用已知需求除以产能；缺项未计入，完整隧道利用率仍未知',
            },
            `已知需求隧道利用率 ${numberText(row.knownLoad, true)}`,
            h('small', null, `缺需求或折吨${row.demand.missing}项，完整隧道利用率待补`),
          )
        : row.demand.missing
          ? `缺需求或折吨${row.demand.missing}项，完整隧道利用率待补`
          : '未取得需求来源';
    };
    const demandIssues = (report.demandIssues ?? []).filter(
      (row) =>
        byBase(row) &&
        (!filters.month || row.month === filters.month) &&
        (!filters.category || row.category === filters.category) &&
        (!filters.search || `${row.code} ${row.name}`.includes(filters.search)),
    );
    const shownIssues = demandIssues.filter((row) => row.month === month);
    const annualIssues = report.annualIssues.filter(byBase);
    const odmArrivals = (plan.odmArrivals ?? []).filter(
      (row) => !filters.base || row.base === filters.base || row.demandBase === filters.base,
    );
    const issueIndex = Math.min(issuePage, Math.max(0, Math.ceil(shownIssues.length / 25) - 1));
    const dataState = (row) =>
      row.capacity === null
        ? '无本基地可用产能，需求单列核对'
        : row.capacity === 0
          ? '本月可用产能为0'
          : row.demand.value === null
            ? `缺${row.demand.missing}项归属需求或折吨，已知小计可查看`
            : '口径齐全';
    const baseRows = report.totals.filter(
      (row) => row.month === month && (filters.base ? row.base === filters.base : true),
    );
    const gaps = report.gaps.filter(
      (row) =>
        byBase(row) &&
        (!filters.month || row.month === filters.month) &&
        (!filters.category || row.category === filters.category),
    );
    const exportRows = report.rccp
      .filter((row) => byBase(row) && isInternalGroup(row))
      .map((row) => ({
        评估版本: draft.name,
        结果时间: stamp,
        月份: row.month,
        基地: row.base,
        大类: row.category,
        归属需求吨数: row.demand.value,
        已知归属需求吨数: row.demand.known,
        ODM需求吨数: null,
        已知ODM需求吨数: null,
        ODM未计入折吨项数: null,
        无归属需求吨数: row.unassigned.value,
        已知无归属需求吨数: row.unassigned.known,
        日产吨数: row.dailyTons,
        月产能: row.capacity,
        隧道利用率: row.load,
        已知需求对应隧道利用率: row.knownLoad,
        未计入归属需求项数: row.demand.missing,
        未计入无归属需求项数: row.unassigned.missing,
        余量吨数: row.margin,
        缺口吨数: row.gap,
        数据状态: dataState(row),
      }));
    const toggle = (setter, key, open) => setter((value) => ({ ...value, [key]: open }));
    const rccpTable = (columns, rows, footer) =>
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
              : !footer &&
                  h('tr', null, h('td', { colSpan: columns.length }, '当前范围没有需求明细')),
          ),
          renderTableFooter(h, columns, footer),
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
    const hasForming =
      plan.resourceSchedules.some((row) => row.kind === 'forming') ||
      (draft.resources ?? []).some((row) => row.kind === 'forming');
    const formingSchedules = plan.resourceSchedules.filter(
      (row) =>
        row.kind === 'forming' &&
        (!filters.month || row.month === filters.month) &&
        (!filters.base || row.base === filters.base),
    );
    const lineDetails = new Map(
      (plan.capacityLineDetails ?? []).map((row) => [row.resourceId, row]),
    );
    return h(
      react.Fragment,
      null,
      h(
        'div',
        { className: 'dc-card-head mps-report-heading' },
        h('h3', null, '产能评估报告'),
        h('span', null, `${month} · 吨`),
        h('button', { onClick: () => setRulesOpen(true) }, '口径与规则'),
        h(
          'button',
          {
            className: 'mps-download',
            disabled: !active || (!exportRows.length && !odmDetails.length),
            onClick: () => {
              const odmRows = [...Map.groupBy(odmDetails, (row) => row.month)].map(
                ([period, items]) => {
                  const demand = odmDemandTotal(items);
                  return {
                    评估版本: draft.name,
                    结果时间: stamp,
                    月份: period,
                    基地: odmDemandLabel,
                    ODM需求吨数: demand.value,
                    已知ODM需求吨数: demand.value === null ? demand.known : null,
                    ODM未计入折吨项数: demand.missing || null,
                  };
                },
              );
              const rows = [...exportRows, ...odmRows];
              downloadCsv(`${draft.month}-产能评估报告.csv`, Object.keys(rows[0] ?? {}), rows);
            },
          },
          '导出产能评估报告',
        ),
      ),
      card(
        '需求与月总产能',
        table(
          '基地需求与月总产能',
          [
            '基地',
            '物理隧道数',
            `${month}需求（吨）`,
            '生产天数',
            '日标准产能（吨/日）',
            '月总产能（吨）',
            '隧道利用率',
            '余量（吨）',
            ...Array.from(
              { length: 4 },
              (_, index) =>
                `${offset(month, index + 1)}隧道利用率${plan.months.includes(offset(month, index + 1)) ? '' : '（年度参考）'}`,
            ),
          ],
          baseRows.map((row) => [
            row.base,
            row.lines,
            metric(row.demand),
            row.days ?? '待补',
            numberText(row.dailyTons),
            numberText(row.capacity),
            load(row),
            numberText(row.margin),
            ...Array.from({ length: 4 }, (_, index) => {
              const period = offset(month, index + 1);
              const reference = !plan.months.includes(period);
              const item = (reference ? annualIndex : totalIndex).get(
                JSON.stringify([period, row.base]),
              );
              return item ? load(item) : '缺需求来源';
            }),
          ]),
          undefined,
          odmDemandFooter(odmDemand, 2, numberText),
        ),
      ),
      card(
        '基地 × 大类 RCCP',
        h(
          react.Fragment,
          null,
          rccpTable(
            [
              '基地',
              '大类',
              `${month}需求（吨）`,
              '日产能（吨/日）',
              '月产能（吨）',
              `${month}隧道利用率`,
              '余量（吨）',
              `${next}隧道利用率`,
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
                  numberText(row.dailyTons),
                  numberText(row.capacity),
                  load(row),
                  numberText(row.margin),
                  later ? load(later) : '缺需求来源',
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
                                `${month}需求（吨）`,
                                '占大类',
                                '产能配额（吨）',
                                '超配额（吨）',
                                `${next}归属需求（吨）`,
                                '无归属需求（吨）',
                              ],
                              [
                                ...row.series
                                  .toSorted(compareBusinessRows)
                                  .filter(
                                    (item) =>
                                      !report.productDetails ||
                                      internalGroups
                                        .get(key)
                                        ?.some((detail) => detail.group === item.group),
                                  )
                                  .map((item) => {
                                    const future = later?.series.find(
                                      (other) => other.group === item.group,
                                    );
                                    return [
                                      `${item.group} ${item.name}`,
                                      metric(item.demand),
                                      item.share === null
                                        ? row.demand.value === 0
                                          ? '大类需求为0'
                                          : '大类需求未齐'
                                        : numberText(item.share, true),
                                      item.quota === null ? '暂不分摊' : numberText(item.quota),
                                      item.excess === null ? '暂不计算' : numberText(item.excess),
                                      future ? metric(future.demand) : '缺需求来源',
                                      metric(item.unassigned),
                                    ];
                                  }),
                                [
                                  '合计',
                                  metric(row.demand),
                                  row.demand.value !== null && row.demand.value > 0
                                    ? numberText(1, true)
                                    : '—',
                                  numberText(row.demand.value > 0 ? row.capacity : null),
                                  numberText(
                                    row.demand.value > 0 && row.margin !== null
                                      ? -row.margin
                                      : null,
                                  ),
                                  later ? metric(later.demand) : '缺需求来源',
                                  metric(row.unassigned),
                                ],
                              ],
                              undefined,
                              odmDemandFooter(
                                odmDemandTotal(odmDetails, {
                                  ...filters,
                                  month,
                                  base: row.base,
                                  category: row.category,
                                }),
                                1,
                                numberText,
                              ),
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
            odmDemandFooter(odmDemand, 2, numberText),
          ),
        ),
      ),
      card(
        '需求与折吨缺项',
        shownIssues.length
          ? h(
              'details',
              disclosure('issues'),
              h('summary', null, `查看${month}缺项明细 ${shownIssues.length}项`),
              shownIssues.length
                ? table(
                    '需求与折吨缺项',
                    ['基地', '大类', 'SKU', '问题分类', '具体原因', '历史参考物料'],
                    shownIssues
                      .slice(issueIndex * 25, (issueIndex + 1) * 25)
                      .map((row) => [
                        row.base,
                        row.category,
                        `${row.code} ${row.name}`,
                        row.kind,
                        row.reason,
                        row.referenceCode,
                      ]),
                  )
                : null,
              shownIssues.length > 25
                ? renderTablePagination(h, {
                    label: '需求与折吨缺项',
                    page: issueIndex,
                    total: shownIssues.length,
                    onPageChange: setIssuePage,
                  })
                : null,
            )
          : h('p', { role: 'status' }, '当前范围暂无缺项'),
        h(
          'button',
          {
            className: 'mps-download',
            disabled: !active || !shownIssues.length,
            onClick: () => {
              const rows = shownIssues.map((row) => ({
                月份: row.month,
                基地: row.base,
                大类: row.category,
                物料组: row.group,
                产品编码: row.code,
                产品名称: row.name,
                问题分类: row.kind,
                具体原因: row.reason,
                历史参考物料: row.referenceCode,
                来源: row.sourceTable,
                字段: row.fields,
              }));
              downloadCsv(`${draft.month}-需求与折吨缺项.csv`, Object.keys(rows[0] ?? {}), rows);
            },
          },
          '导出需求与折吨缺项',
        ),
      ),
      card(
        'ODM默认计划到货',
        h(
          react.Fragment,
          null,
          table(
            'ODM供方SKU月度默认计划',
            ['月份', '供方口径', 'SKU', '收货基地', '默认计划到货量（件/月）', '默认计划到货吨数'],
            (plan.odmSchedules ?? [])
              .filter(
                (row) =>
                  row.month === month && (!filters.base || row.receiptBases.includes(filters.base)),
              )
              .map((row) => [
                row.month,
                'ODM默认供给，实际供方待确认',
                row.code,
                row.receiptBases.join('、'),
                numberText(row.quantity),
                numberText(row.tons),
              ]),
          ),
        ),
        h(
          'button',
          {
            className: 'mps-download',
            disabled: !active || !odmArrivals.length,
            onClick: () =>
              downloadCsv(
                `${draft.month}-ODM默认计划到货.csv`,
                [
                  '月份',
                  '供方口径',
                  '产品编码',
                  '收货基地',
                  '需求基地',
                  '默认计划到货量（件）',
                  '默认计划到货吨数',
                  '后续调拨路径',
                  '说明',
                ],
                odmArrivals.map((row) => ({
                  月份: row.month,
                  供方口径: 'ODM默认供给，实际供方待确认',
                  产品编码: row.code,
                  收货基地: row.base,
                  需求基地: row.demandBase,
                  '默认计划到货量（件）': row.quantity,
                  默认计划到货吨数: row.tons,
                  后续调拨路径: row.path.map((leg) => `${leg.from}→${leg.to}`).join('；'),
                  说明: '默认估算；外部到货仅在收货基地记录一次；未验证供方真实能力、交期及实际到货',
                })),
              ),
          },
          '导出ODM默认计划到货',
        ),
      ),
      card(
        '调拨计划',
        h(
          react.Fragment,
          null,
          transferGroups.size
            ? [...transferGroups].map(([period, rows]) =>
                h(
                  'details',
                  {
                    key: period,
                    className: 'wf-plan-disclosure mps-report-details',
                    open: Boolean(openTransfers[period]),
                    onToggle: (event) => {
                      if (event.target === event.currentTarget)
                        toggle(setOpenTransfers, period, event.currentTarget.open);
                    },
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
                              className: 'wf-plan-disclosure mps-report-details',
                              open: Boolean(openTransfers[key]),
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
                                      numberText(item.quantity),
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
        '全年月度隧道利用率',
        h(
          react.Fragment,
          null,
          h(
            'div',
            { className: 'dc-card-head mps-report-heading' },
            h('h3', null, `年度评估缺项 · ${numberText(annualIssues.length)} 项`),
            h(
              'button',
              {
                className: 'mps-download',
                disabled: !active || !annualIssues.length,
                onClick: () => {
                  const rows = annualIssues.map((row) => ({
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
          ),
          annualIssues.length > 0 &&
            h(
              ReportPage,
              {
                view,
                stateKey: 'CapacityReport.annualIssuesPage',
                label: '年度评估缺项',
                rows: annualIssues,
              },
              (rows) =>
                table(
                  '年度评估缺项',
                  ['基地', 'SKU', '适用月份', '待补原因', '源表 / 字段'],
                  rows.map((row) => [
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
                disclosure('unmappedAnnual'),
                h('summary', null, `年度来源维度待核对 ${report.annualSource.unmappedCount}行`),
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
              '全年月度隧道利用率矩阵',
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
                          ? `年度需求已知小计${numberText(row.demand.known)}吨；${row.demand.missing}项缺需求或有效件吨系数`
                          : '未取得年度需求',
                      },
                      row ? load(row) : '缺来源',
                    ),
                  ),
                  items.every(
                    (row) => row?.demand.value !== null && row?.demand.value !== undefined,
                  )
                    ? numberText(items.reduce((total, row) => total + row.demand.value, 0))
                    : `全年已知${numberText(
                        items.reduce((total, row) => total + (row?.demand.known ?? 0), 0),
                      )}吨；${items.reduce((total, row) => total + (row?.demand.missing ?? 0), 0)}项月待补`,
                ];
              }),
              undefined,
              odmDemandFooter(annualOdmDemand, report.fiscalMonths.length + 1, numberText),
            ),
          ),
        ),
      ),
      card(
        '物理隧道产能明细',
        h(
          react.Fragment,
          null,
          report.bases
            .filter((base) => !filters.base || filters.base === base)
            .map((base) => {
              const lines = report.lines.filter((row) => row.month === month && row.base === base);
              return h(
                'details',
                {
                  key: base,
                  className: 'wf-plan-disclosure mps-report-details',
                  open: Boolean(openLines[base]),
                  onToggle: (event) => {
                    if (event.target === event.currentTarget)
                      toggle(setOpenLines, base, event.currentTarget.open);
                  },
                },
                h('summary', null, `${base} · ${lines.length}条物理隧道`),
                openLines[base]
                  ? table(
                      '物理隧道产能明细',
                      [
                        '车间',
                        '隧道号',
                        '隧道吨位（规格）',
                        '日标准产能（吨/日）',
                        '生产天数',
                        '月产能（吨）',
                        '设备类型',
                      ],
                      lines.map((row) => {
                        const info = lineDetails.get(row.resourceId);
                        return [
                          info?.workshop || '待补',
                          info?.tunnel || '待补',
                          info?.specification || '待补',
                          numberText(row.dailyTons),
                          row.days ?? '待补',
                          numberText(row.capacity),
                          info?.outsourced ? '代工厂' : '隧道',
                        ];
                      }),
                    )
                  : null,
              );
            }),
          odmDemand &&
            table(
              'ODM需求汇总',
              ['供给方式', '需求总量（吨）'],
              [[odmDemandLabel, odmDemandText(odmDemand, numberText)]],
            ),
        ),
      ),
      hasForming &&
        card(
          '成型机实际占用',
          h(
            react.Fragment,
            null,
            formingSchedules.length
              ? table(
                  '成型机实际占用',
                  ['月份', '基地', '成型机', '月产能（吨）', '实际占用（吨）', '负荷率', '缺项'],
                  formingSchedules.map((row) => [
                    row.month,
                    row.base,
                    row.name,
                    numberText(row.capacity),
                    numberText(row.scheduledTons),
                    row.load === null ? '待补' : `${(row.load * 100).toFixed(2)}%`,
                    row.missing.join('；') || '—',
                  ]),
                )
              : h(
                  'p',
                  { role: 'status' },
                  '当前筛选范围没有有效的已配置成型机占用记录，请核对已有配置及筛选范围。',
                ),
          ),
          h(
            'div',
            { className: 'mps-report-actions' },
            h(
              CalculationHelp,
              { title: '成型机占用 · 口径说明' },
              h('p', null, '按基地、SKU、月份的批准比例分配。同一产量同时占用隧道和成型机。'),
            ),
            h(
              'button',
              {
                className: 'mps-download',
                disabled: !active || !formingSchedules.length,
                onClick: () => {
                  const rows = formingSchedules.map((row) => ({
                    月份: row.month,
                    基地: row.base,
                    资源编号: row.resourceId,
                    成型机: row.name,
                    日产吨数: row.dailyTons,
                    生产天数: row.days,
                    月产能吨数: row.capacity,
                    实际占用吨数: row.scheduledTons,
                    负荷率: row.load,
                    缺项: row.missing.join('；'),
                  }));
                  downloadCsv(
                    `${draft.month}-成型机实际占用.csv`,
                    [
                      '月份',
                      '基地',
                      '资源编号',
                      '成型机',
                      '日产吨数',
                      '生产天数',
                      '月产能吨数',
                      '实际占用吨数',
                      '负荷率',
                      '缺项',
                    ],
                    rows,
                  );
                },
              },
              '导出成型机实际占用',
            ),
          ),
        ),
      card(
        '缺口明细',
        h(
          react.Fragment,
          null,
          gaps.length
            ? table(
                '月产能缺口明细',
                [
                  '基地',
                  '大类',
                  '计划月',
                  '需求（吨）',
                  '月产能上限（吨）',
                  '缺口（吨）',
                  '隧道利用率',
                  '瓶颈类型',
                ],
                gaps.map((row) => [
                  row.base,
                  row.category,
                  row.month,
                  numberText(row.demand.value),
                  numberText(row.capacity),
                  numberText(row.gap),
                  load(row),
                  '隧道；处置类型待人工确认',
                ]),
              )
            : h('p', { className: 'wf-note' }, '已评估范围暂无超产缺口'),
        ),
      ),
      rulesOpen
        ? h(
            Dialog,
            { title: '口径与规则', close: () => setRulesOpen(false) },
            h(
              'p',
              null,
              `月产能＝去重后的物理隧道日产吨数×有效生产天数。${productionCalendarRule}已采用停线约束继续生效。`,
            ),
            h(
              'p',
              null,
              'RCCP只用有有效本基地产线的需求评估本基地隧道利用率；无归属需求单列。组合柔线可在不同大类引用，全国物理总产能去重。',
            ),
            h(
              'p',
              null,
              '隧道利用率90%至105%为黄色，超过105%为红色。系列配额＝大类月产能×归属需求占比，保留超配额正负值以对平大类余量。',
            ),
            h(
              'p',
              null,
              '生产达成率＝实际发货加调出量后除以实际生产量；计划达成率＝实际发货÷预测。两者只用于对应复盘口径，不与隧道利用率混算。',
            ),
            h(
              'p',
              null,
              '调拨采用最新来源日期的完整关系，覆盖后续评估月，允许沿已配置路径中转并逐段记录。ODM默认计划到货单列，不占内部产能。0.5调拨库存修正系数尚未确认，本轮未采用。全年未取得的需求月份及缺件吨系数保持待补。',
            ),
          )
        : null,
    );
  };
}
