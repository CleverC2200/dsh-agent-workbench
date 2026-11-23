import { selectCapacityScope } from 'dsh-agent-manage/mps-compute/capacity-report';
import { useStepViewField } from './step-view-state.js';

export function createCapacityScopeView(react, downloadCsv) {
  const h = react.createElement;
  return function CapacityScopeView({
    plan,
    month,
    filters,
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
    const productionLines = [
      ...new Set(
        workshopLines.flatMap((row) => (row.productionLines.length ? row.productionLines : [''])),
      ),
    ];
    const line = productionLines.includes(selection.line) ? selection.line : undefined;
    const lineRows = workshopLines.filter(
      (row) =>
        line === undefined ||
        (line === '' ? !row.productionLines.length : row.productionLines.includes(line)),
    );
    const resourceId = lineRows.some((row) => row.resourceId === selection.resourceId)
      ? selection.resourceId
      : '';
    const scope = { month, base, workshop, line, resourceId };
    const selected = selectCapacityScope(report, scope, level);
    const label = [
      base || '全国',
      workshop === '' ? '车间归属待补' : workshop,
      line === '' ? '产线归属待补' : line,
      resourceId ? selected.lines[0]?.tunnel || resourceId : '',
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
    const issues = report.hierarchyIssues.filter((row) =>
      selected.lines.some((line) => line.resourceId === row.resourceId),
    );
    const change = (field, value) => {
      setPage(0);
      setSelection((current) => ({
        ...(field === 'base'
          ? {}
          : field === 'workshop'
            ? { base: current.base }
            : field === 'line'
              ? { base: current.base, workshop: current.workshop }
              : current),
        [field]: value,
      }));
    };
    const scopeTable = (name, columns, rows) =>
      react.cloneElement(table(name, columns, rows), {
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
      return occupied ? '本轮排产已计算' : '本轮排产已计算，实际占用为0';
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
        产线: row.productionLines.join('、') || '产线归属待补',
        隧道号: row.tunnel || '隧道号待补',
        物理资源ID: row.resourceId,
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
    const download = (name, rows) =>
      downloadCsv(
        `${month}-${name}.csv`,
        ['本轮预测计算范围', '排除单品记录数', ...Object.keys(rows[0] ?? scopeColumns)],
        rows.map((row) => ({
          本轮预测计算范围: plan.partial ? '部分可计算，待定单品已排除' : '当前参与范围',
          排除单品记录数: plan.excludedShipments?.length ?? 0,
          ...row,
        })),
      );
    return card(
      '设备范围与产品占用',
      h(
        react.Fragment,
        null,
        h(
          'div',
          { className: 'wf-filters' },
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
          encodedSelector('设备产线', 'line', line, productionLines, '产线归属待补'),
          selector(
            '设备隧道',
            resourceId,
            [
              ['', '全部'],
              ...lineRows.map((row) => [
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
          'p',
          { className: 'wf-note' },
          '关联需求按当前设备范围的有效关联去重。多个候选设备可能对应同一需求，各设备需求不能直接相加；隧道利用率＝关联需求吨数÷月产能；实际占用来自本轮排产分配，包含调拨供给，未完成评估时的已分配量不能视为完整占用。产品占比使用当前范围去重总产能，不为各产品重复累计产能。',
        ),
        scopeTable(
          '所选设备范围汇总',
          [
            '设备范围',
            '物理隧道数',
            '关联需求（吨）',
            '日标准产能（吨/日）',
            '月产能（吨）',
            '隧道利用率',
            '实际占用（吨）',
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
        ),
        h(
          'div',
          { className: 'wf-filters' },
          h(
            'button',
            { disabled: !active, onClick: () => download('设备范围与产品占用', exportRows) },
            '下载设备范围与产品占用',
          ),
          h(
            'button',
            { disabled: !active, onClick: () => download('设备范围明细', equipmentRows) },
            '下载设备范围明细',
          ),
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
            '实际占用（吨）',
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
        ),
        h(
          'div',
          { className: 'wf-filters' },
          h(
            'span',
            null,
            `产品共${productRows.length}项，当前第${pageIndex + 1}页，每页25项；下载包含全部筛选结果`,
          ),
          h(
            'button',
            { disabled: pageIndex === 0, onClick: () => setPage(pageIndex - 1) },
            '上一页产品',
          ),
          h(
            'button',
            {
              disabled: (pageIndex + 1) * 25 >= productRows.length,
              onClick: () => setPage(pageIndex + 1),
            },
            '下一页产品',
          ),
        ),
        scopeTable(
          '设备范围明细',
          [
            '基地',
            '车间',
            '产线',
            '隧道号',
            '物理资源ID',
            '日标准产能（吨/日）',
            '生产天数',
            '月产能（吨）',
            '关联需求（吨）',
            '隧道利用率',
            '实际占用（吨）',
            '排产状态',
          ],
          equipmentRows.map((row) => [
            row.基地,
            row.车间,
            row.产线,
            row.隧道号,
            row.物理资源ID,
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
        ),
        issues.length
          ? h(
              react.Fragment,
              null,
              h(
                'button',
                {
                  disabled: !active,
                  onClick: () =>
                    download(
                      '设备归属问题',
                      issues.map((row) => ({
                        基地: row.base,
                        物理资源ID: row.resourceId,
                        名称: row.name,
                        问题: row.reason,
                        来源: row.sourceTable,
                      })),
                    ),
                },
                '下载设备归属问题',
              ),
              scopeTable(
                '设备归属问题',
                ['基地', '资源', '问题', '来源'],
                issues.map((row) => [row.base, row.name, row.reason, row.sourceTable]),
              ),
            )
          : null,
        selected.unassigned.length
          ? h(
              react.Fragment,
              null,
              h(
                'p',
                { className: 'wf-note' },
                '以下需求没有有效设备关联，未纳入设备范围需求或虚构归属；同基地的全部问题保留在此。',
              ),
              h(
                'button',
                {
                  disabled: !active,
                  onClick: () =>
                    download(
                      '无设备关联需求',
                      report.demandIssues
                        .filter(
                          (row) =>
                            row.kind === '无有效设备关联' &&
                            row.month === month &&
                            (!base || row.base === base),
                        )
                        .map((row) => ({
                          月份: row.month,
                          基地: row.base,
                          SKU: row.code,
                          问题: row.reason,
                          源表: row.sourceTable,
                          字段: row.fields,
                        })),
                    ),
                },
                '下载无设备关联需求',
              ),
              scopeTable(
                '无设备关联需求',
                ['基地', '大类', '物料组', 'SKU', '需求（吨）'],
                selected.unassigned.map((row) => [
                  row.base,
                  row.category,
                  row.group,
                  row.code,
                  numberText(row.demandTons),
                ]),
              ),
            )
          : null,
      ),
    );
  };
}
