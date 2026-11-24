import { mpsLocalDraftSchema } from '../../../src/mps-local-draft.ts';
import { createDemandAdjustmentUpload } from './demand-adjustment-upload.js';
import { historyColumns, historyExportRows } from './history-report-view.js';
import { createUpperAdjustmentConflicts } from './upper-adjustment-conflicts.js';
import { useStepViewField } from './step-view-state.js';
import { demandBasisLabel } from './festival-demand.js';
import { createProcessedDemandEvidence } from './processed-demand-evidence-view.js';
import { createDemandDiagnostics } from './demand-diagnostics-view.js';
import { buildMpsWorkflow } from './workflow-inputs.js';
import {
  changeAdjustment,
  matchesQuantityAdjustment,
  quantityAdjustmentKey,
} from './local-draft.js';
import { createBatchEdit } from './batch-edit.js';
import { createAmountReconciliation } from './amount-reconciliation-view.js';

const formatInteger = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 }).format;
const number = (value) => (value == null ? '—' : formatInteger(value));
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
const forecastQuantity = (value) => value?.quantity ?? value?.knownQuantity ?? null;
const adjustmentDepth = { 'category-total': 0, 'group-total': 2, 'base-sku': 4 };
const label = (entry) =>
  [entry.category, entry.group, entry.code, entry.base, entry.month].filter(Boolean).join(' ');

export function createProcessedDemand(
  react,
  { downloadCsv, downloadAmounts, Upload, Dialog, parseCsv },
) {
  const h = react.createElement;
  const { Field } = createBatchEdit(react);
  const DemandAdjustmentUpload = createDemandAdjustmentUpload(react, {
    Upload,
    Dialog,
    parseCsv,
    downloadCsv,
  });
  const AmountReconciliation = createAmountReconciliation(react, { downloadCsv: downloadAmounts });
  const UpperAdjustmentConflicts = createUpperAdjustmentConflicts(react);
  const Evidence = createProcessedDemandEvidence(react, { downloadCsv });
  const DemandDiagnostics = createDemandDiagnostics(react, { downloadCsv });
  return function ProcessedDemand({
    view,
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
    const [expanded, setExpanded] = useStepViewField(
      react,
      view,
      'ProcessedDemand.expanded',
      () => new Set(),
    );
    const [hierarchy, setHierarchy] = useStepViewField(
      react,
      view,
      'ProcessedDemand.hierarchy',
      'all',
    );
    const hierarchyId = react.useId();
    const [fixedQuantitiesOpen, setFixedQuantitiesOpen] = useStepViewField(
      react,
      view,
      'ProcessedDemand.fixedQuantitiesOpen',
      false,
    );
    const restoreTableScroll = react.useCallback(
      (element) => {
        if (element) element.scrollLeft = view.get()['ProcessedDemand.scrollLeft'] ?? 0;
      },
      [view],
    );
    const quantities = draft.adjustments?.quantities ?? [];
    const fixedQuantities = quantities.filter((item) => item.kind === 'base-sku');
    const toggle = (key, entry) => {
      setExpanded((previous) => {
        const next = new Set(previous);
        if (!next.has(key)) {
          next.add(key);
          if (entry.kind.endsWith('category'))
            for (const childKey of indexed.children.get(key)?.keys() ?? []) next.add(childKey);
        } else next.delete(key);
        return next;
      });
    };
    const months = result.months;
    const categories = [
      ...new Set(
        rows
          .map((row) => row.category)
          .concat(
            Object.values(filters).some((value) => (Array.isArray(value) ? value.length : value))
              ? []
              : result.categoryRows.map((row) => row.category),
          ),
      ),
    ];
    const categoryValue = (category, month) =>
      result.categoryRows.find((row) => row.category === category && row.month === month);
    const saved = (entry) =>
      quantities.find((item) => quantityAdjustmentKey(item) === quantityAdjustmentKey(entry));
    const effective = (computed, entry) =>
      sum(
        [...computed.rows, ...(computed.referenceRows ?? [])].filter((row) =>
          matchesQuantityAdjustment(row, entry),
        ),
        'demand',
      );
    const fieldKey = quantityAdjustmentKey;
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
      const quantities = entries
        .filter((entry) => entry.meta.kind !== 'shipment')
        .sort(
          (a, b) =>
            adjustmentDepth[a.meta.kind] +
            Number(Boolean(a.meta.base)) -
            (adjustmentDepth[b.meta.kind] + Number(Boolean(b.meta.base))),
        );
      for (const entry of quantities) {
        const { editorRow: _editorRow, ...fields } = entry.meta;
        const input = { ...fields, quantity: entry.value, reason: entry.reason ?? reason };
        const before = adjustments?.history?.length ?? 0;
        adjustments = changeAdjustment(adjustments, 'quantities', input, entry.value === null);
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
          ![...candidate.rows, ...(candidate.referenceRows ?? [])].some(
            (row) => matchesQuantityAdjustment(row, entry.meta) && row.quantityAdjusted,
          )
        )
          throw Error('当前需求调整未生效，请核对月份、产品范围和拆分依据。');
      }
      if (undos.size)
        adjustments = {
          ...adjustments,
          history: adjustments.history.map((item, index) =>
            undos.has(index) ? { ...item, value: effective(candidate, undos.get(index)) } : item,
          ),
        };
      if (!mpsLocalDraftSchema.shape.adjustments.safeParse(adjustments).success)
        throw Error('修正及完整历史超出本地草稿可保存范围。请先导出核对，未应用本次修正。');
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
      const disabled =
        !months.includes(entry.month) ||
        (entry.kind !== 'base-sku' &&
          (Boolean(filters.search) || Boolean(filters.base && !entry.base)));
      return h(
        'div',
        { className: 'wf-quantity-cell' },
        h(Field, {
          batch,
          id: fieldKey(entry),
          label: `${label(entry)} 需求数量`,
          value,
          meta: { ...entry, systemValue: systemValue ?? null },
          disabled,
          format: number,
          editFormat: (value) => String(Math.round(value)),
          title: '留空恢复系统值',
        }),
        fixed && h('small', null, '已调整'),
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
          { kind: 'category-total', category, month, editorRow: `summary:${category}` },
          row?.systemQuantity,
          row?.quantity,
        );
      };
      return [
        category,
        comparison(compare?.shipment),
        ...months.slice(0, 2).flatMap((month) => {
          const quantity = forecastQuantity(compare?.forecast[month]);
          return [demand(month), quantity === null ? '' : number(quantity)];
        }),
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
      const roots = new Map();
      const groupNames = new Map();
      for (const product of draft.products ?? []) {
        const key = JSON.stringify([product['大类'], product['物料组']]);
        if (!groupNames.has(key)) groupNames.set(key, new Set());
        if (product['物料组名称']) groupNames.get(key).add(product['物料组名称']);
      }
      const path = (row, scope) =>
        scope === 'national'
          ? [
              { kind: 'national-category', category: row.category },
              { kind: 'national-group', category: row.category, group: row.group },
              { kind: 'national-sku', category: row.category, group: row.group, code: row.code },
            ]
          : [
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
      const scopes = hierarchy === 'all' ? ['national', 'base'] : [hierarchy];
      for (const scope of scopes) {
        const branches = new Map();
        for (const row of rows) {
          const identity = JSON.stringify([row.category, row.group, row.code, row.base]);
          let buckets = branches.get(identity);
          if (!buckets) {
            const entries = path(row, scope);
            const keys = entries.map(nodeKey);
            roots.set(keys[0], entries[0]);
            buckets = keys.map((key, index) => {
              if (!all.has(key)) all.set(key, []);
              if (index < keys.length - 1) {
                if (!children.has(key)) children.set(key, new Map());
                children.get(key).set(keys[index + 1], entries[index + 1]);
              }
              return all.get(key);
            });
            branches.set(identity, buckets);
          }
          for (const bucket of buckets) bucket.push(row);
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
      return { all, children, roots, groupNames, shipment, forecasts };
    }, [result, rows, draft.products, hierarchy]);
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
    const forecastReference = (value) => {
      const quantity = forecastQuantity(value);
      return quantity === null
        ? null
        : h(
            'div',
            { className: 'wf-demand-reference' },
            h('span', null, '模型预测'),
            h('div', { className: 'wf-source-value' }, number(quantity)),
          );
    };
    const nodeData = (entry) => {
      const full = entry ? (indexed.all.get(nodeKey(entry)) ?? []) : rows;
      const current = full.filter((row) => row.month === months[0]);
      const identities = [
        ...new Map(
          [...full, ...current].map((row) => [productKey(row.base, row.code), row]),
        ).values(),
      ];
      const first = identities;
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
            full.some((row) => row.month === month)
              ? identities.map((row) => {
                  const values = indexed.forecasts.get(JSON.stringify([month, row.base, row.code]));
                  return values?.length === 1 ? values[0]['数量'] : null;
                })
              : [],
          ),
        ),
      };
    };
    const nodeName = (entry, data) => {
      if (entry.kind === 'base') return `基地 · ${entry.base || '基地缺失'}`;
      if (entry.kind === 'base-category' || entry.kind === 'national-category')
        return `大类 · ${entry.category}`;
      if (entry.kind === 'base-group' || entry.kind === 'national-group') {
        const names = indexed.groupNames.get(JSON.stringify([entry.category, entry.group]));
        return `物料组 · ${[entry.group || '物料组缺失', names?.size === 1 ? [...names][0] : ''].filter(Boolean).join(' ')}`;
      }
      return `SKU · ${entry.code} ${data.full[0]?.name ?? ''}`;
    };
    const detailColumns = [
      hierarchy === 'national'
        ? '全国 / 大类 / 物料组 / SKU'
        : hierarchy === 'base'
          ? '基地 / 大类 / 物料组 / SKU'
          : '全国 / 基地 / 大类 / 物料组 / SKU',
      `${result.shipmentMonth} 本月预估发货（可调整）`,
      `M+1 ${months[0]} 计划提报`,
      `M+1 ${months[0]} 需求（可调整）`,
      `M+2 ${months[1]} 需求（可调整）`,
      `M+3 ${months[2]} 需求（可调整）`,
      `M+4 ${months[3]} 库存参考（可调整）`,
    ];
    const isExpanded = (key) => Boolean(filters.search) || expanded.has(key);
    const orderedEntries = (showAll) => {
      const roots = [...indexed.roots.values()];
      const collect = (entries) => {
        const ordered = [];
        let level = entries;
        for (let depth = 0; level.length; depth++) {
          ordered.push(...level.map((entry) => ({ entry, depth })));
          level = level.flatMap((entry) => {
            const key = nodeKey(entry);
            return showAll || isExpanded(key)
              ? [...(indexed.children.get(key)?.values() ?? [])]
              : [];
          });
        }
        return ordered;
      };
      return [
        ...collect(roots.filter((entry) => !entry.base)),
        ...roots.filter((entry) => entry.base).flatMap((entry) => collect([entry])),
      ];
    };
    const detailRows = orderedEntries(false).map(({ entry, depth }) => {
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
                    disabled: Boolean(filters.search),
                    'aria-label': entry.kind === 'base' ? name : `${entry.base || '全国'} ${name}`,
                    'aria-expanded': isExpanded(key),
                    onClick: () => toggle(key, entry),
                  },
                  h(
                    'svg',
                    { viewBox: '0 0 12 12', width: 12, height: 12, 'aria-hidden': true },
                    h('path', {
                      d: isExpanded(key) ? 'M2 4 L6 8 L10 4' : 'M4 2 L8 6 L4 10',
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
                  `历史合计 · 自身＋替换品 ${processRow.historyCode}，折算倍率${processRow.historyFactor === null ? '待补' : new Intl.NumberFormat('zh-CN', { style: 'percent', maximumSignificantDigits: 4 }).format(processRow.historyFactor ?? 1)}`,
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
            disabled: !entry.base || currentShipment == null || !shipmentSnapshot?.prepareForecast,
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
          h(
            'div',
            { className: 'wf-demand-reference' },
            h('span', null, '系统预估'),
            sourceCell(data.shipmentSystem),
          ),
        ),
        h('td', null, sourceCell(data.report)),
        ...months.flatMap((month, index) => {
          const selected = data.full.filter((row) => row.month === month);
          const value = sum(selected, 'demand');
          const system = sum(selected, 'systemDemand');
          const editingKind =
            entry.kind === 'base-category'
              ? 'category-total'
              : ['base-group', 'national-group'].includes(entry.kind)
                ? 'group-total'
                : entry.kind === 'base-sku'
                  ? 'base-sku'
                  : null;
          return h(
            'td',
            { key: month },
            editingKind
              ? controls({ ...entry, kind: editingKind, month, editorRow: key }, system, value)
              : sourceCell(sourceSummary(selected.map((row) => row.demand))),
            forecastReference(data.forecasts[index]),
          );
        }),
      );
      return rendered;
    });
    const scopeLabel = Object.values(filters).some((value) =>
      Array.isArray(value) ? value.length : value,
    )
      ? '当前范围合计'
      : '全国合计';
    const total = nodeData();
    detailRows.unshift(
      h(
        'tr',
        { key: 'scope-total', className: 'wf-demand-row wf-demand-total' },
        h('th', { scope: 'row' }, scopeLabel),
        h(
          'td',
          null,
          sourceCell(total.shipmentEffective),
          h(
            'div',
            { className: 'wf-demand-reference' },
            h('span', null, '系统预估'),
            sourceCell(total.shipmentSystem),
          ),
        ),
        h('td', null, sourceCell(total.report)),
        ...months.map((month, index) =>
          h(
            'td',
            { key: month },
            sourceCell(
              sourceSummary(rows.filter((row) => row.month === month).map((row) => row.demand)),
            ),
            forecastReference(total.forecasts[index]),
          ),
        ),
      ),
    );
    const exportScope = () => {
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
      const festival = result.categoryComputation?.festival;
      const columns = [
        '评估版本',
        '评估月份',
        '粒度',
        '月份',
        ...(festival ? ['推算口径'] : []),
        '基地',
        '产品编码',
        '产品名称',
        '大类',
        '物料组',
        '计划提报已知小计',
        '计划提报待补数',
        '模型预测已知小计',
        '模型预测待补数',
        '有效需求数量',
        '有效需求已知小计',
        '有效需求待补数',
        '缺项指标',
        '原因',
        ...historyColumns.filter((column) => column !== '原因'),
        '系统需求数量',
        '人工修正状态',
        '调整原因',
        '原始历史数量',
      ];
      const context = { 评估版本: draft.name, 评估月份: draft.month };
      const leaf = (row) => ({
        ...context,
        月份: row.month,
        推算口径: demandBasisLabel(festival, row.month),
        基地: row.base,
        产品编码: row.code,
        产品名称: row.name,
        大类: row.category,
        物料组: row.group,
        有效需求数量: row.demand,
        ...historyExportRows([row], {}, result.comparisonSources.historyPeriod, false)[0],
        粒度: '基地SKU',
        系统需求数量: row.systemDemand,
        人工修正状态: row.quantityAdjusted ? '有效人工修正' : '系统值',
        调整原因: row.quantityAdjusted
          ? quantities.findLast((item) => matchesQuantityAdjustment(row, item))?.reason
          : undefined,
      });
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
              推算口径: demandBasisLabel(festival, month),
              计算用历史数量: total.history.quantity,
              历史期间: `${result.comparisonSources.historyPeriod.start}至${result.comparisonSources.historyPeriod.end}`,
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
        ...orderedEntries(true).flatMap(({ entry }) => {
          const data = nodeData(entry);
          if (entry.kind === 'base-sku') return data.full.map(leaf);
          const level =
            entry.kind === 'base'
              ? '基地汇总'
              : entry.kind.endsWith('category')
                ? '大类汇总'
                : entry.kind.endsWith('group')
                  ? '物料组汇总'
                  : '全国SKU汇总';
          return months
            .filter((month) => !filters.month || filters.month === month)
            .map((month) => {
              const demand = sourceSummary(
                data.full.filter((row) => row.month === month).map((row) => row.demand),
              );
              return {
                ...context,
                粒度: level,
                月份: month,
                推算口径: demandBasisLabel(festival, month),
                基地: entry.base || '全国',
                大类: entry.category,
                物料组: entry.group,
                产品编码: entry.code,
                计算用历史数量: data.history.quantity,
                历史期间: `${result.comparisonSources.historyPeriod.start}至${result.comparisonSources.historyPeriod.end}`,
                有效需求数量: demand.quantity,
                有效需求已知小计: demand.knownQuantity,
                有效需求待补数: demand.missing,
              };
            });
        }),
        ...historyExportRows(rows, context, result.comparisonSources.historyPeriod),
        ...missingRows.map((row) => ({ ...context, 粒度: '缺项报告', ...row })),
      ]);
    };
    const detailTable = h(
      'div',
      {
        className: 'dc-table-scroll wf-table-scroll wf-processed-scroll',
        tabIndex: 0,
        role: 'region',
        'aria-label': '加工后的需求横向滚动区',
        ref: restoreTableScroll,
        onScroll: (event) =>
          view.update({ 'ProcessedDemand.scrollLeft': event.currentTarget.scrollLeft }),
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
                forecastQuantity(compare?.forecast[month]),
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
      h(DemandDiagnostics, { view, draft, result, rows, filters, table }),
      h(Evidence, { view, draft, result: result.categoryComputation, rows, filters, table }),
      card(
        '加工后的需求',
        h(
          react.Fragment,
          null,
          h(DemandAdjustmentUpload, { draft, result, batch, table, apply: applyBatch }),
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
          h('label', { htmlFor: hierarchyId }, '需求层级视角'),
          h(
            'select',
            {
              id: hierarchyId,
              value: hierarchy,
              disabled: batch.active,
              onChange: (event) => setHierarchy(event.target.value),
            },
            h('option', { value: 'all' }, '全国和基地'),
            h('option', { value: 'base' }, '按基地查看'),
            h('option', { value: 'national' }, '全国汇总查看'),
          ),
          h('button', { onClick: exportScope }, '下载当前范围需求'),
        ),
      ),
      h(UpperAdjustmentConflicts, { draft, update }),
      h(AmountReconciliation, { draft, result, rows, filters, card, table }),
      fixedQuantities.length > 0 &&
        h(
          'details',
          {
            className: 'wf-disclosure',
            open: fixedQuantitiesOpen,
            onToggle: (event) => {
              if (event.target === event.currentTarget)
                setFixedQuantitiesOpen(event.currentTarget.open);
            },
          },
          h('summary', null, '当前固定数量'),
          table(
            '当前固定数量',
            ['对象', '固定数量', '原因', '时间', '操作'],
            fixedQuantities.map((item) => [
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
