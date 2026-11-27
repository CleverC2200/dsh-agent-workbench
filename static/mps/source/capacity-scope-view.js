import { downloadWorkbook } from './workbook.js';
import { renderTablePagination } from './report-page.js';
import { selectCapacityScope } from 'dsh-agent-manage/mps-compute/capacity-report';
import { useStepViewField } from './step-view-state.js';
import { createCalculationHelp } from './calculation-help.js';
import { odmDemandFooter, odmDemandLabel, odmDemandTotal } from './odm-demand.js';

export function createCapacityScopeView(react) {
  const h = react.createElement;
  const CalculationHelp = createCalculationHelp(react);
  return function CapacityScopeView({
    plan,
    month,
    filters,
    showOdmDemand,
    isDelisted,
    view,
    active,
    card,
    table,
    numberText,
  }) {
    const [selection, setSelection] = useStepViewField(react, view, 'CapacityScope.selection', {});
    const [level, setLevel] = useStepViewField(react, view, 'CapacityScope.level', 'category');
    const [page, setPage] = useStepViewField(react, view, 'CapacityScope.page', 0);
    const report = plan.capacityReport;
    if (!report?.productDetails) return null;
    const lines = report.lines.filter(
      (row) => row.month === month && (!filters.base || row.base === filters.base),
    );
    const base =
      filters.base || (lines.some((row) => row.base === selection.base) ? selection.base : '');
    const baseLines = lines.filter((row) => !base || row.base === base);
    const workshops = [...new Set(baseLines.map((row) => row.workshop))];
    const workshop = workshops.includes(selection.workshop) ? selection.workshop : undefined;
    const workshopLines = baseLines.filter(
      (row) => workshop === undefined || row.workshop === workshop,
    );
    const resourceId = workshopLines.some((row) => row.resourceId === selection.resourceId)
      ? selection.resourceId
      : '';
    const scope = { month, base, workshop, resourceId };
    const selected = selectCapacityScope(report, scope, level);
    const odmDemand =
      showOdmDemand && workshop === undefined && !resourceId
        ? odmDemandTotal(report.productDetails, { ...filters, base, month })
        : null;
    const label = [
      base || '全国',
      workshop === '' ? '车间归属待补' : workshop,
      resourceId ? selected.lines[0]?.tunnel || '隧道号待补' : '',
    ]
      .filter((value) => value !== undefined && value !== '')
      .join(' / ');
    const productRows = selected.products.filter(
      (row) =>
        (!filters.category || row.category === filters.category) &&
        (!filters.search || `${row.code} ${row.name}`.includes(filters.search)),
    );
    const pageIndex = Math.min(page, Math.max(0, Math.ceil(productRows.length / 25) - 1));
    const shownProducts = productRows.slice(pageIndex * 25, (pageIndex + 1) * 25);
    const issues = report.hierarchyIssues.filter(
      (row) =>
        !row.reason.startsWith('产线归属待补') &&
        selected.lines.some((line) => line.resourceId === row.resourceId),
    );
    const change = (field, value) => {
      setPage(0);
      setSelection((current) => ({
        ...(field === 'base' ? {} : field === 'workshop' ? { base: current.base } : current),
        [field]: value,
      }));
    };
    const scopeTable = (name, columns, rows, footer) =>
      react.cloneElement(table(name, columns, rows, undefined, footer), {
        role: 'region',
        'aria-label': `${name}滚动区`,
        tabIndex: 0,
      });
    const selector = (name, value, options, onChange) =>
      h(
        'label',
        null,
        name,
        h(
          'select',
          { 'aria-label': name, value, onChange: (event) => onChange(event.target.value) },
          ...options.map(([value, label]) => h('option', { key: value, value }, label)),
        ),
      );
    const encodedSelector = (name, field, value, values, missing) =>
      selector(
        name,
        value === undefined ? '*' : JSON.stringify(value),
        [['*', '全部'], ...values.map((item) => [JSON.stringify(item), item || missing])],
        (value) => change(field, value === '*' ? undefined : JSON.parse(value)),
      );
    const metric = (value) =>
      value.value === null
        ? `已知${numberText(value.known)}；${value.missing}项待补`
        : numberText(value.value);
    const percent = (value) => (value === null ? '待补' : `${(value * 100).toFixed(2)}%`);
    const pairKey = (row) => JSON.stringify([row.base, row.code]);
    const productKey = (row) =>
      JSON.stringify([
        row.category,
        ...(level === 'category' ? [] : [row.group]),
        ...(level === 'sku' ? [row.base, row.code] : []),
      ]);
    const plannedRows = new Map(
      plan.rows.filter((row) => row.month === month).map((row) => [pairKey(row), row]),
    );
    const allocations = Map.groupBy(
      report.allocations.filter((row) => row.month === month),
      (row) => JSON.stringify([row.demandBase, row.code]),
    );
    const related = (row, ids) =>
      row.resourceIds.some((id) => ids.has(id)) ||
      (allocations.get(pairKey(row)) ?? []).some((allocation) => ids.has(allocation.resourceId));
    const resourceIds = selected.lines.map((row) => row.resourceId);
    const ids = new Set(resourceIds);
    const scopeDetails = report.productDetails.filter(
      (row) => row.month === month && !row.odm && related(row, ids),
    );
    const productDetails = Map.groupBy(scopeDetails, productKey);
    const scheduleState = (resourceIds, product) => {
      const ids = new Set(resourceIds);
      const details = (
        product ? (productDetails.get(productKey(product)) ?? []) : scopeDetails
      ).filter((row) => related(row, ids));
      const pending = details.filter(
        (row) => plannedRows.get(pairKey(row))?.scheduledTons == null,
      ).length;
      if (!details.length) return '本月尚未形成排产分配';
      if (pending === details.length) return `尚未形成排产分配，${pending}项待评估`;
      if (pending) return `已取得部分排产分配，${pending}项待评估`;
      const occupied = details.some((row) =>
        (allocations.get(pairKey(row)) ?? []).some(
          (allocation) => ids.has(allocation.resourceId) && allocation.tons > 0,
        ),
      );
      return occupied ? '本轮排产已计算' : '本轮排产已计算，排产占用为0';
    };
    const utilization = (demand) =>
      demand !== null && selected.capacity !== null && selected.capacity > 0
        ? demand / selected.capacity
        : null;
    const scopeColumns = {
      月份: month,
      设备范围: label,
      产品层级: { category: '大类', group: '物料组', sku: 'SKU' }[level],
    };
    const exportRows = productRows.map((row) => ({
      ...scopeColumns,
      大类: row.category || '大类待补',
      物料组: level === 'category' ? '' : row.group || '物料组待补',
      需求基地: row.base,
      SKU: row.code,
      名称: row.name,
      关联需求吨数: row.demand.value,
      已知关联需求吨数: row.demand.known,
      待补需求项数: row.demand.missing,
      实际占用吨数: row.scheduledTons,
      排产状态: scheduleState(resourceIds, row),
      范围产能占比: row.occupancy,
      范围月产能吨数: selected.capacity,
      隧道利用率: utilization(row.demand.value),
    }));
    const equipmentRows = selected.lines.map((row) => {
      const equipment = selectCapacityScope(report, { ...scope, resourceId: row.resourceId });
      return {
        月份: month,
        设备范围: label,
        基地: row.base,
        车间: row.workshop || '车间归属待补',
        隧道号: row.tunnel || '隧道号待补',
        日标准产能吨数: row.dailyTons,
        生产天数: row.days,
        月产能吨数: row.capacity,
        关联需求吨数: equipment.demand.value,
        已知关联需求吨数: equipment.demand.known,
        待补需求项数: equipment.demand.missing,
        隧道利用率: equipment.load,
        实际占用吨数: row.scheduledTons,
        排产状态: scheduleState([row.resourceId]),
      };
    });
    const issueRows = issues.map((row) => ({
      基地: row.base,
      名称: row.name,
      问题: row.reason,
      来源: row.sourceTable,
    }));
    const unassignedProducts = selected.unassigned.filter((row) => !isDelisted(row));
    const unassignedRows = report.demandIssues
      .filter(
        (row) =>
          row.kind === '无有效设备关联' &&
          row.month === month &&
          (!base || row.base === base) &&
          !isDelisted(row),
      )
      .map((row) => ({
        月份: row.month,
        基地: row.base,
        SKU: row.code,
        问题: row.reason,
        源表: row.sourceTable,
        字段: row.fields,
      }));
    const exportWorkbook = () =>
      downloadWorkbook(
        `${month}-设备范围与产品占用.xlsx`,
        [
          [
            '产品占用',
            odmDemand
              ? [
                  ...exportRows,
                  {
                    ...scopeColumns,
                    名称: odmDemandLabel,
                    关联需求吨数: odmDemand.value,
                    已知关联需求吨数: odmDemand.value === null ? odmDemand.known : null,
                    待补需求项数: odmDemand.missing || null,
                  },
                ]
              : exportRows,
          ],
          [
            '设备范围',
            odmDemand
              ? [
                  ...equipmentRows,
                  {
                    月份: month,
                    设备范围: label,
                    基地: odmDemandLabel,
                    关联需求吨数: odmDemand.value,
                    已知关联需求吨数: odmDemand.value === null ? odmDemand.known : null,
                    待补需求项数: odmDemand.missing || null,
                  },
                ]
              : equipmentRows,
          ],
          ['设备归属问题', issueRows],
          ['无设备关联需求', unassignedRows],
        ]
          .filter(([, rows]) => rows.length)
          .map(([name, rows]) => ({ name, columns: Object.keys(rows[0]), rows })),
      );
    return card(
      '设备范围与产品占用',
      h(
        react.Fragment,
        null,
        scopeTable(
          '所选设备范围汇总',
          [
            '设备范围',
            '物理隧道数',
            '关联需求（吨）',
            '日标准产能（吨/日）',
            '月产能（吨）',
            '隧道利用率',
            '排产占用（吨）',
            '排产状态',
          ],
          [
            [
              label,
              selected.lines.length,
              metric(selected.demand),
              numberText(selected.dailyTons),
              numberText(selected.capacity),
              percent(selected.load),
              numberText(selected.scheduledTons),
              scheduleState(resourceIds),
            ],
          ],
          odmDemandFooter(odmDemand, 2, numberText),
        ),
        scopeTable(
          '设备范围产品占用',
          [
            '大类',
            '物料组',
            '需求基地',
            'SKU',
            '名称',
            '关联需求（吨）',
            '隧道利用率',
            '排产占用（吨）',
            '范围产能占比',
            '排产状态',
          ],
          shownProducts.map((row) => [
            row.category || '大类待补',
            level === 'category' ? '—' : row.group || '物料组待补',
            row.base || '—',
            row.code || '—',
            row.name,
            metric(row.demand),
            percent(utilization(row.demand.value)),
            numberText(row.scheduledTons),
            percent(row.occupancy),
            scheduleState(resourceIds, row),
          ]),
          odmDemandFooter(odmDemand, 5, numberText),
        ),
        renderTablePagination(h, {
          label: '所选设备范围产品需求',
          page: pageIndex,
          total: productRows.length,
          onPageChange: setPage,
          buttonLabels: ['上一页产品', '下一页产品'],
        }),
        scopeTable(
          '设备范围明细',
          [
            '基地',
            '车间',
            '隧道号',
            '日标准产能（吨/日）',
            '生产天数',
            '月产能（吨）',
            '关联需求（吨）',
            '隧道利用率',
            '排产占用（吨）',
            '排产状态',
          ],
          equipmentRows.map((row) => [
            row.基地,
            row.车间,
            row.隧道号,
            numberText(row.日标准产能吨数),
            row.生产天数 ?? '待补',
            numberText(row.月产能吨数),
            metric({
              value: row.关联需求吨数,
              known: row.已知关联需求吨数,
              missing: row.待补需求项数,
            }),
            percent(row.隧道利用率),
            numberText(row.实际占用吨数),
            row.排产状态,
          ]),
          odmDemandFooter(odmDemand, 6, numberText),
        ),
        issues.length
          ? h(
              react.Fragment,
              null,
              h('h3', { className: 'wf-target-heading' }, '设备归属问题'),
              scopeTable(
                '设备归属问题',
                ['基地', '资源', '问题', '来源'],
                issues.map((row) => [row.base, row.name, row.reason, row.sourceTable]),
              ),
            )
          : null,
        unassignedProducts.length
          ? scopeTable(
              '无设备关联需求',
              ['基地', '大类', '物料组', 'SKU', '需求（吨）'],
              unassignedProducts.map((row) => [
                row.base,
                row.category,
                row.group,
                row.code,
                numberText(row.demandTons),
              ]),
            )
          : null,
      ),
      h(
        react.Fragment,
        null,
        h(
          'div',
          { className: 'dc-toolbar dc-report-filters mps-table-controls' },
          h('span', { className: 'dc-card-note' }, `设备数据月份 ${month}`),
          h(
            CalculationHelp,
            { title: '设备范围 · 口径说明' },
            h('p', null, '关联需求按当前设备范围去重。隧道利用率为关联需求吨数除以月产能。'),
            h(
              'p',
              null,
              '排产占用是本轮分配给隧道的生产吨数，包含供应给其他基地的调拨量。关联需求是该隧道可承接的需求，同一需求可关联多条隧道。',
            ),
          ),
          selector(
            '设备基地',
            base,
            [
              ...(!filters.base ? [['', '全国']] : []),
              ...[...new Set(lines.map((row) => row.base))].map((base) => [base, base]),
            ],
            (value) => change('base', value),
          ),
          encodedSelector('设备车间', 'workshop', workshop, workshops, '车间归属待补'),
          selector(
            '设备隧道',
            resourceId,
            [
              ['', '全部'],
              ...workshopLines.map((row) => [
                row.resourceId,
                `${row.base} / ${row.workshop || '车间待补'} / ${row.tunnel || row.name}`,
              ]),
            ],
            (value) => change('resourceId', value),
          ),
          selector(
            '产品查看层级',
            level,
            [
              ['category', '大类'],
              ['group', '物料组'],
              ['sku', 'SKU'],
            ],
            (value) => {
              setLevel(value);
              setPage(0);
            },
          ),
        ),
        h(
          'button',
          {
            className: 'mps-download',
            disabled:
              !active ||
              (!exportRows.length &&
                !equipmentRows.length &&
                !issueRows.length &&
                !unassignedRows.length &&
                !odmDemand),
            onClick: exportWorkbook,
          },
          '下载设备范围与产品占用',
        ),
      ),
    );
  };
}
