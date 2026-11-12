import { createProcessedDemandEvidence } from './processed-demand-evidence-view.js';
import { buildMpsWorkflow } from './workflow-inputs.js';
import { changeAdjustment, quantityAdjustmentKey } from './local-draft.js';
import { createBatchEdit } from './batch-edit.js';
import { createAmountReconciliation } from './amount-reconciliation-view.js';

const number = (value) =>
  value == null ? '—' : new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 }).format(value);
const sum = (rows, field) =>
  rows.length && rows.every((row) => row[field] != null)
    ? rows.reduce((total, row) => total + row[field], 0)
    : null;
const comparison = (value) =>
  value?.quantity != null
    ? number(value.quantity)
    : value?.knownQuantity != null
      ? `${number(value.knownQuantity)}（已知小计）`
      : '—';
const matches = (row, entry) =>
  row.month === entry.month &&
  row.category === entry.category &&
  (entry.kind === 'categoryDemand' ||
    (row.group === entry.group &&
      (entry.kind === 'group' ||
        (row.code === entry.code && (entry.kind === 'sku' || row.base === entry.base)))));
const label = (entry) =>
  [
    entry.category,
    entry.kind !== 'categoryDemand' ? entry.group : '',
    entry.code,
    entry.base,
    entry.month,
  ]
    .filter(Boolean)
    .join(' ');

export function createProcessedDemand(react, { downloadCsv, downloadAmounts }) {
  const h = react.createElement;
  const { Field } = createBatchEdit(react);
  const AmountReconciliation = createAmountReconciliation(react, { downloadCsv: downloadAmounts });
  const Evidence = createProcessedDemandEvidence(react, { downloadCsv });
  return function ProcessedDemand({
    draft,
    result,
    rows,
    update,
    relations,
    shipmentSnapshot,
    table,
    card,
    onExplain,
    batch,
    filters = {},
  }) {
    const [expanded, setExpanded] = react.useState(() => new Set());
    react.useEffect(() => setExpanded(new Set()), [draft.id, draft.month]);
    const quantities = draft.adjustments?.quantities ?? [];
    const toggle = (key) => {
      setExpanded((previous) => {
        const next = new Set(previous);
        if (!next.has(key)) next.add(key);
        else next.delete(key);
        return next;
      });
    };
    const months = result.months.slice(0, 3);
    const categories = [
      ...new Set(
        rows
          .map((row) => row.category)
          .concat(
            Object.values(filters).some(Boolean)
              ? []
              : result.categoryRows.map((row) => row.category),
          ),
      ),
    ];
    const categoryValue = (category, month) =>
      result.categoryRows.find((row) => row.category === category && row.month === month);
    const saved = (entry) =>
      entry.kind === 'categoryDemand'
        ? draft.adjustments?.categoryDemand?.find(
            (item) => item.month === entry.month && item.category === entry.category,
          )
        : quantities.find((item) => quantityAdjustmentKey(item) === quantityAdjustmentKey(entry));
    const effective = (computed, entry) =>
      entry.kind === 'categoryDemand'
        ? (computed.categoryRows.find(
            (row) => row.month === entry.month && row.category === entry.category,
          )?.quantity ?? null)
        : sum(
            computed.rows.filter((row) => matches(row, entry)),
            'demand',
          );
    const fieldKey = (entry) =>
      entry.kind === 'categoryDemand'
        ? JSON.stringify(['categoryDemand', entry.month, entry.category])
        : quantityAdjustmentKey(entry);
    const applyBatch = (entries, reason) => {
      if (!entries.length) return;
      const shipments = entries.filter((entry) => entry.meta.kind === 'shipment');
      if (shipments.length && !shipmentSnapshot?.prepareForecast)
        throw Error('第二步同版预估发货尚未就绪。');
      const shipping = shipments.length
        ? shipmentSnapshot.prepareForecast(
            shipments
              .sort((a, b) => b.meta.keys.length - a.meta.keys.length)
              .map((entry) => ({
                keys: entry.meta.keys,
                value: entry.value,
                label: `第三步 ${entry.label} ${reason}`,
              })),
          )
        : null;
      const snapshot = shipping ? { ...shipmentSnapshot, rows: shipping.rows } : shipmentSnapshot;
      let adjustments = draft.adjustments;
      const undos = new Map();
      const quantities = entries.filter((entry) => entry.meta.kind !== 'shipment');
      for (const entry of quantities) {
        const { kind: level, editorRow: _editorRow, ...fields } = entry.meta;
        const kind = level === 'categoryDemand' ? 'categoryDemand' : 'quantities';
        const input = {
          ...fields,
          ...(kind === 'quantities' ? { kind: level } : {}),
          quantity: entry.value,
          reason,
        };
        const before = adjustments?.history?.length ?? 0;
        adjustments = changeAdjustment(adjustments, kind, input, entry.value === null);
        if (entry.value === null && adjustments.history.length > before)
          undos.set(before, entry.meta);
      }
      const candidate = buildMpsWorkflow({ ...draft, adjustments }, relations, snapshot);
      const introduced = (candidate.adjustmentIssues ?? []).filter(
        (issue) => !(result.adjustmentIssues ?? []).includes(issue),
      );
      if (introduced.length) throw Error(introduced.join('；'));
      for (const entry of quantities) {
        if (
          entry.value !== null &&
          entry.meta.kind !== 'categoryDemand' &&
          !candidate.rows.some((row) => matches(row, entry.meta) && row.quantityAdjusted)
        )
          throw Error('当前分层数量未生效，请先补齐权重或撤销冲突调整。');
      }
      if (undos.size)
        adjustments = {
          ...adjustments,
          history: adjustments.history.map((item, index) =>
            undos.has(index) ? { ...item, value: effective(candidate, undos.get(index)) } : item,
          ),
        };
      update({ adjustments, ...(shipping ? { shipment: shipping.state } : {}) });
    };
    react.useLayoutEffect(() => {
      batch.commit.current = applyBatch;
      return () => {
        if (batch.commit.current === applyBatch) batch.commit.current = null;
      };
    }, [batch.commit, applyBatch]);
    const controls = (entry, systemValue, value) => {
      const fixed = saved(entry);
      const shareConflict =
        entry.kind !== 'categoryDemand' &&
        (draft.adjustments?.shares ?? []).some((item) =>
          result.rows.some(
            (row) =>
              row.id === item.rowId && row.month === entry.month && row.category === entry.category,
          ),
        );
      const disabled =
        entry.kind !== 'categoryDemand' &&
        (!months.slice(0, 2).includes(entry.month) ||
          !entry.group ||
          value == null ||
          shareConflict);
      return h(
        'div',
        { className: 'wf-quantity-cell' },
        h(Field, {
          batch,
          id: fieldKey(entry),
          label: `${label(entry)} 需求数量`,
          value,
          meta: { ...entry, systemValue },
          disabled,
          format: number,
          editFormat: (value) => String(Math.round(value)),
          title: shareConflict ? '先撤销同月大类占比调整' : '留空恢复系统值',
        }),
        fixed && h('small', null, '已调整'),
        shareConflict && h('small', null, '先撤销同月大类占比调整'),
      );
    };
    const summaryColumns = [
      '大类',
      `${result.shipmentMonth} 本月预估发货`,
      ...months
        .slice(0, 2)
        .flatMap((month, index) => [
          `M+${index + 1} ${month} 有效需求`,
          `M+${index + 1} ${month} 模型预测`,
        ]),
      `M+3 ${months[2]} 需求`,
      `M+4 ${result.months[3]} 库存参考`,
    ];
    const summaryRows = categories.map((category) => {
      const compare = result.categoryComparisons?.find((row) => row.category === category);
      const demand = (month) => {
        const row = categoryValue(category, month);
        return controls(
          { kind: 'categoryDemand', category, month, editorRow: `summary:${category}` },
          row?.systemQuantity,
          row?.quantity,
        );
      };
      return [
        category,
        comparison(compare?.shipment),
        ...months
          .slice(0, 2)
          .flatMap((month) => [demand(month), comparison(compare?.forecast[month])]),
        demand(months[2]),
        demand(result.months[3]),
      ];
    });
    const nodeKey = (entry) =>
      JSON.stringify([entry.kind, entry.category, entry.group, entry.code, entry.base]);
    const productKey = (base, code) => JSON.stringify([base, code]);
    const indexed = react.useMemo(() => {
      const all = new Map();
      const children = new Map();
      const bases = new Map();
      const groupNames = new Map();
      for (const product of draft.products ?? []) {
        const key = JSON.stringify([product['大类'], product['物料组']]);
        if (!groupNames.has(key)) groupNames.set(key, new Set());
        if (product['物料组名称']) groupNames.get(key).add(product['物料组名称']);
      }
      const add = (map, entry, row) => {
        const key = nodeKey(entry);
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(row);
      };
      const path = (row) => [
        { kind: 'base', base: row.base },
        { kind: 'base-category', base: row.base, category: row.category },
        { kind: 'base-group', base: row.base, category: row.category, group: row.group },
        {
          kind: 'base-sku',
          category: row.category,
          group: row.group,
          code: row.code,
          base: row.base,
        },
      ];
      for (const row of rows) for (const entry of path(row)) add(all, entry, row);
      for (const row of rows) {
        const entries = path(row);
        bases.set(nodeKey(entries[0]), entries[0]);
        for (let index = 0; index < entries.length - 1; index++) {
          const parent = nodeKey(entries[index]);
          if (!children.has(parent)) children.set(parent, new Map());
          children.get(parent).set(nodeKey(entries[index + 1]), entries[index + 1]);
        }
      }
      const shipment = new Map(
        (result.comparisonSources?.shipment ?? []).map((row) => [
          productKey(row['基地'], row['产品编码']),
          row,
        ]),
      );
      const forecasts = new Map();
      for (const row of result.comparisonSources?.forecast ?? []) {
        const key = JSON.stringify([row['月份'], row['基地'], row['产品编码']]);
        if (!forecasts.has(key)) forecasts.set(key, []);
        forecasts.get(key).push(row);
      }
      return { all, children, bases, groupNames, shipment, forecasts };
    }, [result, rows, draft.products]);
    const sourceSummary = (source) => {
      const values = source.map((value) => (value == null || value === '' ? null : Number(value)));
      const available = values.filter((value) => value != null);
      return {
        quantity:
          values.length && available.length === values.length
            ? available.reduce((total, value) => total + value, 0)
            : null,
        knownQuantity: available.length
          ? available.reduce((total, value) => total + value, 0)
          : null,
        missing: values.length - available.length,
      };
    };
    const sourceStatus = (value) =>
      [
        value.quantity == null && value.knownQuantity != null ? '已知小计' : '',
        value.missing > 0 ? `${value.missing}项待补` : '',
      ]
        .filter(Boolean)
        .join(' · ');
    const sourceCell = (value) =>
      h(
        'div',
        { className: 'wf-source-value' },
        value.quantity == null && value.knownQuantity == null
          ? h(
              'span',
              { className: 'dc-demand-missing', title: sourceStatus(value) },
              value.missing ? '待补' : '—',
            )
          : number(value.quantity ?? value.knownQuantity),
        (value.quantity != null || value.knownQuantity != null) &&
          sourceStatus(value) &&
          h('small', null, sourceStatus(value)),
      );
    const nodeData = (entry) => {
      const full = entry ? (indexed.all.get(nodeKey(entry)) ?? []) : rows;
      const identities = [
        ...new Map(full.map((row) => [productKey(row.base, row.code), row])).values(),
      ];
      const first = full.filter((row) => row.month === months[0]);
      const shipment = identities.map((row) =>
        indexed.shipment.get(productKey(row.base, row.code)),
      );
      return {
        full,
        first,
        identities,
        report: sourceSummary(first.map((row) => row.reportQuantity)),
        history: sourceSummary(first.map((row) => row.historyQuantity)),
        shipmentSystem: sourceSummary(shipment.map((row) => row?.prediction ?? null)),
        shipmentEffective: sourceSummary(shipment.map((row) => row?.fin ?? null)),
        forecasts: months.slice(0, 2).map((month) =>
          sourceSummary(
            identities
              .filter(() => full.some((row) => row.month === month))
              .map((row) => {
                const values = indexed.forecasts.get(JSON.stringify([month, row.base, row.code]));
                return values?.length === 1 ? values[0]['数量'] : null;
              }),
          ),
        ),
      };
    };
    const nodeName = (entry, data) => {
      if (entry.kind === 'base') return `基地 · ${entry.base || '基地缺失'}`;
      if (entry.kind === 'base-category') return `大类 · ${entry.category}`;
      if (entry.kind === 'base-group') {
        const names = indexed.groupNames.get(JSON.stringify([entry.category, entry.group]));
        return `物料组 · ${[entry.group || '物料组缺失', names?.size === 1 ? [...names][0] : ''].filter(Boolean).join(' ')}`;
      }
      return `SKU · ${entry.code} ${data.full[0]?.name ?? ''}`;
    };
    const detailColumns = [
      '基地 / 大类 / 物料组 / SKU',
      `M+1 ${months[0]} 计划提报`,
      `上一财年发货 ${result.comparisonSources.historyPeriod.start.slice(0, 7)}至${result.comparisonSources.historyPeriod.end.slice(0, 7)}`,
      `${result.shipmentMonth} 本月预估发货（系统）`,
      `${result.shipmentMonth} 本月预估发货（可调整）`,
      `M+1 ${months[0]} 模型预测`,
      `M+1 ${months[0]} 需求（可调整）`,
      `M+2 ${months[1]} 模型预测`,
      `M+2 ${months[1]} 需求（可调整）`,
      `M+3 ${months[2]} 需求`,
    ];
    const visible = [];
    const append = (entry, depth) => {
      const key = nodeKey(entry);
      visible.push({ entry, depth });
      if (expanded.has(key))
        for (const child of indexed.children.get(key)?.values() ?? []) append(child, depth + 1);
    };
    for (const entry of indexed.bases.values()) append(entry, 0);
    const detailRows = visible.map(({ entry, depth }) => {
      const key = nodeKey(entry);
      const data = nodeData(entry);
      const children = indexed.children.get(key)?.size;
      const name = nodeName(entry, data);
      const currentShipment = data.shipmentEffective.quantity;
      const processRow = data.first[0] ?? data.full[0];
      const rendered = h(
        'tr',
        { key, className: `wf-demand-row wf-demand-level-${depth}` },
        h(
          'th',
          { scope: 'row' },
          h(
            'div',
            { className: 'wf-demand-identity', style: { paddingInlineStart: depth * 18 } },
            children
              ? h(
                  'button',
                  {
                    className: 'wf-demand-toggle',
                    'aria-label': entry.kind === 'base' ? name : `${entry.base} ${name}`,
                    'aria-expanded': expanded.has(key),
                    onClick: () => toggle(key),
                  },
                  h(
                    'svg',
                    { viewBox: '0 0 12 12', width: 12, height: 12, 'aria-hidden': true },
                    h('path', {
                      d: expanded.has(key) ? 'M2 4 L6 8 L10 4' : 'M4 2 L8 6 L4 10',
                      fill: 'none',
                      stroke: 'currentColor',
                      strokeWidth: 1.5,
                    }),
                  ),
                  h('span', null, name),
                )
              : h('span', { className: 'wf-demand-leaf' }, name),
            entry.kind === 'base-sku' && processRow?.historyCode
              ? h(
                  'small',
                  { className: 'wf-note' },
                  `历史参考 · ${processRow.historyCode} × ${processRow.historyFactor === undefined ? 1 : (processRow.historyFactor ?? '待补系数')}`,
                )
              : null,
            entry.kind === 'base-sku' &&
              processRow &&
              h(
                'button',
                {
                  className: 'wf-demand-explain',
                  'aria-label': `运算过程 ${entry.base} ${entry.code} ${processRow.month}`,
                  onClick: () => onExplain(processRow, 'demand'),
                },
                '运算过程',
              ),
          ),
        ),
        h('td', null, sourceCell(data.report)),
        h('td', null, sourceCell(data.history)),
        h('td', null, sourceCell(data.shipmentSystem)),
        h(
          'td',
          null,
          h(Field, {
            batch,
            id: `shipment:${key}`,
            label: `${label(entry)} 本月预估发货数量`,
            value: currentShipment,
            meta: {
              kind: 'shipment',
              keys: data.identities.map((row) => productKey(row.base, row.code)),
            },
            disabled: currentShipment == null || !shipmentSnapshot?.prepareForecast,
            integer: true,
            min: null,
            format: number,
            editFormat: (value) => String(Math.round(value)),
            title:
              currentShipment == null ? sourceStatus(data.shipmentEffective) : '留空恢复系统值',
          }),
          currentShipment != null &&
            sourceStatus(data.shipmentEffective) &&
            h('small', { className: 'wf-source-status' }, sourceStatus(data.shipmentEffective)),
        ),
        ...months.flatMap((month, index) => {
          const selected = data.full.filter((row) => row.month === month);
          const value = sum(selected, 'demand');
          const system = sum(selected, 'systemDemand');
          const cell = h(
            'td',
            { key: month },
            entry.kind === 'base-sku'
              ? controls({ ...entry, month, editorRow: key }, system, value, '', true)
              : sourceCell(sourceSummary(selected.map((row) => row.demand))),
          );
          return index < 2
            ? [h('td', { key: `${month}-model` }, sourceCell(data.forecasts[index])), cell]
            : [cell];
        }),
      );
      return rendered;
    });
    const scopeLabel = Object.values(filters).some(Boolean) ? '当前范围合计' : '全国合计';
    const total = nodeData();
    detailRows.unshift(
      h(
        'tr',
        { key: 'scope-total', className: 'wf-demand-row wf-demand-total' },
        h('th', { scope: 'row' }, scopeLabel),
        ...[
          total.report,
          total.history,
          total.shipmentSystem,
          total.shipmentEffective,
          ...months.flatMap((month, index) => {
            const demand = sourceSummary(
              rows.filter((row) => row.month === month).map((row) => row.demand),
            );
            return index < 2 ? [total.forecasts[index], demand] : [demand];
          }),
        ].map((value, index) => h('td', { key: index }, sourceCell(value))),
      ),
    );
    const missingRows = rows.flatMap((row) => {
      const metrics = [
        ['有效需求', row.demand, row.missing?.demand?.join('；') || '有效需求缺失'],
        ...(row.month === months[0]
          ? [
              [
                '计划提报',
                row.reportQuantity,
                row.missing?.reportQuantity?.join('；') || '本期销售提报数量缺失',
              ],
              [
                '上一财年发货',
                row.historyQuantity,
                row.missing?.historyQuantity?.join('；') || '上一财年发货缺失',
              ],
            ]
          : []),
        ...(months.slice(0, 2).includes(row.month)
          ? [
              [
                '模型预测',
                (() => {
                  const values = indexed.forecasts.get(
                    JSON.stringify([row.month, row.base, row.code]),
                  );
                  return values?.length === 1 ? values[0]['数量'] : null;
                })(),
                '模型预测缺失、读取未就绪或同键重复',
              ],
            ]
          : []),
      ];
      return metrics
        .filter(([, value]) => value == null)
        .map(([metric, , reason]) => ({
          基地: row.base,
          产品编码: row.code,
          产品名称: row.name,
          大类: row.category,
          月份: row.month,
          缺项指标: metric,
          原因: reason,
        }));
    });
    const exportScope = () => {
      const columns = [
        '评估版本',
        '评估月份',
        '粒度',
        '月份',
        '基地',
        '产品编码',
        '产品名称',
        '大类',
        '计划提报已知小计',
        '计划提报待补数',
        '模型预测已知小计',
        '模型预测待补数',
        '有效需求数量',
        '有效需求已知小计',
        '有效需求待补数',
        '缺项指标',
        '原因',
      ];
      const context = { 评估版本: draft.name, 评估月份: draft.month };
      downloadCsv(`${draft.month}-当前范围需求.csv`, columns, [
        ...months
          .filter((month) => !filters.month || filters.month === month)
          .map((month) => {
            const selected = rows.filter((row) => row.month === month);
            const demand = sourceSummary(selected.map((row) => row.demand));
            const index = months.indexOf(month);
            const model = index < 2 ? total.forecasts[index] : null;
            return {
              ...context,
              粒度: scopeLabel,
              月份: month,
              ...(index === 0
                ? {
                    计划提报已知小计: total.report.knownQuantity,
                    计划提报待补数: total.report.missing,
                  }
                : {}),
              模型预测已知小计: model?.knownQuantity,
              模型预测待补数: model?.missing,
              有效需求数量: demand.quantity,
              有效需求已知小计: demand.knownQuantity,
              有效需求待补数: demand.missing,
            };
          }),
        ...rows.map((row) => ({
          ...context,
          粒度: '基地SKU',
          月份: row.month,
          基地: row.base,
          产品编码: row.code,
          产品名称: row.name,
          大类: row.category,
          有效需求数量: row.demand,
        })),
        ...missingRows.map((row) => ({ ...context, 粒度: '缺项报告', ...row })),
      ]);
    };
    const detailTable = h(
      'div',
      {
        className: 'dc-table-scroll wf-table-scroll wf-processed-scroll',
        tabIndex: 0,
        'aria-label': '加工后的需求横向滚动区',
      },
      h(
        'table',
        { className: 'wf-processed-table', 'aria-label': '加工后的需求明细' },
        h(
          'thead',
          null,
          h(
            'tr',
            null,
            detailColumns.map((column) => h('th', { key: column, scope: 'col' }, column)),
          ),
        ),
        h('tbody', null, detailRows),
      ),
    );
    const exportSummary = () => {
      const columns = [
        '评估版本',
        ...summaryColumns,
        '本月预估发货完整性',
        'M+1模型完整性',
        'M+2模型完整性',
      ];
      downloadCsv(
        `${draft.month}-大类需求总表.csv`,
        columns,
        categories.map((category) => {
          const compare = result.categoryComparisons?.find((row) => row.category === category);
          const values = [
            category,
            compare?.shipment.quantity ?? compare?.shipment.knownQuantity,
            ...months
              .slice(0, 2)
              .flatMap((month) => [
                categoryValue(category, month)?.quantity,
                compare?.forecast[month]?.quantity ?? compare?.forecast[month]?.knownQuantity,
              ]),
            categoryValue(category, months[2])?.quantity,
            categoryValue(category, result.months[3])?.quantity,
          ];
          return {
            评估版本: draft.name,
            本月预估发货完整性:
              compare?.shipment.quantity != null
                ? '完整'
                : compare?.shipment.knownQuantity != null
                  ? '已知小计'
                  : '缺项',
            'M+1模型完整性':
              compare?.forecast[months[0]]?.quantity != null ? '完整' : '缺项或已知小计',
            'M+2模型完整性':
              compare?.forecast[months[1]]?.quantity != null ? '完整' : '缺项或已知小计',
            ...Object.fromEntries(summaryColumns.map((column, index) => [column, values[index]])),
          };
        }),
      );
    };
    return h(
      react.Fragment,
      null,
      card(
        '大类需求总表',
        h(react.Fragment, null, table('大类需求总表', summaryColumns, summaryRows)),
        h(
          'div',
          { className: 'wf-card-actions' },
          h('span', { className: 'dc-card-note' }, '单位：件'),
          h('button', { onClick: exportSummary }, '下载大类需求总表'),
        ),
      ),
      h(Evidence, { draft, result: result.categoryComputation, rows, filters, table }),
      card(
        '加工后的需求',
        h(
          react.Fragment,
          null,
          detailTable,
          !rows.length &&
            h('p', { className: 'wf-note' }, '当前筛选暂无基地SKU输入，展开来源诊断查看缺项。'),
        ),
        h(
          'div',
          { className: 'wf-card-actions' },
          h(
            'span',
            { className: 'dc-card-note' },
            `${new Set(rows.map((row) => row.code)).size}个单品 · ${new Set(rows.map((row) => row.base)).size}个基地 · 单位：件`,
          ),
          h('button', { onClick: exportScope }, '下载当前范围需求'),
        ),
      ),
      card(
        '加工需求缺项报告',
        missingRows.length
          ? table(
              '加工需求缺项报告',
              ['基地', '产品编码', '产品名称', '大类', '月份', '缺项指标', '原因'],
              missingRows.map((row) => Object.values(row)),
            )
          : h(
              'p',
              { className: 'wf-note' },
              rows.length ? '当前范围无需求和对照数量缺项。' : '当前筛选暂无输入。',
            ),
      ),
      h(AmountReconciliation, { draft, result, rows, filters, card, table }),
      h(
        'details',
        { className: 'wf-disclosure' },
        h(
          'summary',
          null,
          `数量调整与撤销记录（${draft.adjustments?.history?.filter((item) => item.kind === 'quantities').length ?? 0}）`,
        ),
        table(
          '数量调整记录',
          ['对象', '操作', '系统值', '有效值', '原因', '时间'],
          (draft.adjustments?.history ?? [])
            .filter((item) => item.kind === 'quantities')
            .map((item) => [
              item.key,
              item.action === 'undo' ? '撤销' : '调整',
              number(item.systemValue),
              number(item.value),
              item.reason,
              item.at,
            ]),
        ),
        quantities.length > 0 &&
          table(
            '当前固定数量',
            ['对象', '固定数量', '原因', '时间', '操作'],
            quantities.map((item) => [
              label(item),
              number(item.quantity),
              item.reason,
              item.at,
              h(
                'button',
                {
                  'aria-label': `撤销固定数量 ${label(item)}`,
                  disabled: !batch.active,
                  onClick: () =>
                    batch.stage(fieldKey(item), {
                      label: label(item),
                      text: '',
                      meta: item,
                      min: 0,
                    }),
                },
                '撤销',
              ),
            ]),
          ),
      ),
    );
  };
}
