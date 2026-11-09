import { buildMpsWorkflow } from './workflow-inputs.js';
import { changeAdjustment, quantityAdjustmentKey } from './local-draft.js';
import { createInlineEdit } from './inline-edit.js';

const number = (value) =>
  value == null ? '—' : new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 }).format(value);
const sum = (rows, field) =>
  rows.length && rows.every((row) => row[field] != null)
    ? rows.reduce((total, row) => total + row[field], 0)
    : null;
const known = (rows, field) => {
  const available = rows.filter((row) => row[field] != null);
  return available.length
    ? `${number(available.reduce((total, row) => total + row[field], 0))}${available.length < rows.length ? '（已知小计）' : ''}`
    : '—';
};
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

export function createProcessedDemand(react, { downloadCsv }) {
  const h = react.createElement;
  const { EditButton, QuantityEditor } = createInlineEdit(react);
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
    onEditingChange,
  }) {
    const [editing, setEditing] = react.useState(null);
    const [error, setError] = react.useState('');
    react.useEffect(() => {
      onEditingChange?.(Boolean(editing));
      return () => onEditingChange?.(false);
    }, [Boolean(editing), onEditingChange]);
    const [expanded, setExpanded] = react.useState(() => new Set());
    const editorRef = react.useRef(null);
    const triggerRef = react.useRef(null);
    const [notice, setNotice] = react.useState('');
    const closeEditor = () => {
      setEditing(null);
      setError('');
      requestAnimationFrame(() => triggerRef.current?.focus({ preventScroll: true }));
    };
    react.useEffect(() => {
      if (editing) {
        editorRef.current?.scrollIntoView({ block: 'nearest' });
        editorRef.current?.querySelector('input')?.focus({ preventScroll: true });
      }
    }, [
      editing?.kind,
      editing?.month,
      editing?.category,
      editing?.group,
      editing?.code,
      editing?.base,
    ]);
    react.useEffect(() => {
      setEditing(null);
      setError('');
      setExpanded(new Set());
    }, [draft.id, draft.month]);
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
        rows.map((row) => row.category).concat(result.categoryRows.map((row) => row.category)),
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
    const save = (entry, undo = false) => {
      try {
        if (entry.kind === 'shipment') {
          const failure = shipmentSnapshot?.adjustForecast?.(
            entry.keys,
            entry.value,
            `第三步 ${label(entry)} ${entry.reason}`.trim(),
          );
          if (failure || !shipmentSnapshot?.adjustForecast)
            throw Error(failure || '第二步同版预估发货尚未就绪。');
          closeEditor();
          setNotice('已保存到本地草稿');
          return;
        }
        const kind = entry.kind === 'categoryDemand' ? 'categoryDemand' : 'quantities';
        const {
          kind: level,
          value: _value,
          changed: _changed,
          editorRow: _editorRow,
          ...fields
        } = entry;
        delete fields.effectiveValue;
        const input = { ...fields, ...(kind === 'quantities' ? { kind: level } : {}) };
        const provisional = changeAdjustment(draft.adjustments, kind, input, undo);
        const candidate = buildMpsWorkflow(
          { ...draft, adjustments: provisional },
          relations,
          shipmentSnapshot,
        );
        const introduced = (candidate.adjustmentIssues ?? []).filter(
          (issue) => !(result.adjustmentIssues ?? []).includes(issue),
        );
        if (introduced.length) throw Error(introduced.join('；'));
        if (
          kind === 'quantities' &&
          !undo &&
          !candidate.rows.some((row) => matches(row, entry) && row.quantityAdjusted)
        )
          throw Error(
            candidate.adjustmentIssues?.join('；') ||
              '当前分层数量未生效，请先补齐权重或撤销冲突调整。',
          );
        update({
          adjustments: undo
            ? changeAdjustment(
                draft.adjustments,
                kind,
                { ...input, effectiveValue: effective(candidate, entry) },
                true,
              )
            : provisional,
        });
        closeEditor();
        setNotice(undo ? '已撤销本地调整' : '已保存到本地草稿');
      } catch (failure) {
        setError(failure.message);
      }
    };
    const controls = (entry, systemValue, value, prefix = '', compact = false) => {
      const fixed = saved(entry);
      const shareConflict =
        entry.kind !== 'categoryDemand' &&
        (draft.adjustments?.shares ?? []).some((item) =>
          result.rows.some(
            (row) =>
              row.id === item.rowId && row.month === entry.month && row.category === entry.category,
          ),
        );
      const active = editing?.editorRow === entry.editorRow && editing?.month === entry.month;
      const edit = (event) => {
        if (editing) {
          editorRef.current?.querySelector('input')?.focus();
          return;
        }
        triggerRef.current = event.currentTarget;
        setEditing({
          ...entry,
          systemValue,
          value: value == null ? '' : String(value),
          reason: fixed?.reason ?? '',
        });
        setError('');
        setNotice('');
      };
      if (entry.kind !== 'categoryDemand' && !months.slice(0, 2).includes(entry.month))
        return h('strong', null, number(value));
      return h(
        'div',
        { className: 'wf-quantity-cell' },
        h(
          EditButton,
          {
            label: `${prefix}调整数量 ${label(entry)}`,
            active,
            disabled: Boolean(
              (editing && !active) ||
              shareConflict ||
              (entry.kind !== 'categoryDemand' && (!entry.group || value == null)),
            ),
            onClick: edit,
          },
          number(value),
        ),
        fixed && h('small', null, '已调整'),
        fixed &&
          h(
            'button',
            {
              className: 'dc-link',
              disabled: Boolean(editing),
              'aria-label': `${prefix}撤销数量 ${label(entry)}`,
              onClick: () => save(entry, true),
            },
            compact ? '撤销固定' : '撤销',
          ),
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
      for (const row of result.rows) for (const entry of path(row)) add(all, entry, row);
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
    const sourceSummary = (values) => {
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
        number(value.quantity ?? value.knownQuantity),
        sourceStatus(value) && h('small', null, sourceStatus(value)),
      );
    const nodeData = (entry) => {
      const full = indexed.all.get(nodeKey(entry)) ?? [];
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
            identities.map((row) => {
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
    const editorFor = (key, count) =>
      editing?.editorRow === key
        ? h(
            'tr',
            { className: 'mps-inline-edit-row' },
            h(
              'td',
              { colSpan: count },
              h(QuantityEditor, {
                editorRef,
                title:
                  editing.kind === 'shipment' ? `本月预估发货 ${label(editing)}` : label(editing),
                groupLabel: '分层需求数量调整',
                quantityLabel: editing.kind === 'shipment' ? '本月预估发货数量' : '有效需求数量',
                reasonLabel: '数量调整原因',
                min: editing.kind === 'shipment' ? null : 0,
                value:
                  editing.changed || editing.value === ''
                    ? editing.value
                    : String(Math.round(Number(editing.value))),
                reason: editing.reason,
                error,
                onChange: (value) => setEditing({ ...editing, value, changed: true }),
                onReasonChange: (reason) => setEditing({ ...editing, reason }),
                onSave: () => {
                  if (editing.value.trim() === '') {
                    setError('请填写数量，留空不代表0。');
                    return;
                  }
                  save({ ...editing, quantity: Number(editing.value) });
                },
                onCancel: closeEditor,
              }),
            ),
          )
        : null;
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
                    disabled: Boolean(editing),
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
              ? h('small', { className: 'wf-note' }, `历史参考 · ${processRow.historyCode}`)
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
          h(
            'button',
            {
              className: 'wf-edit-number',
              'aria-label': `调整本月预估 ${label(entry)}`,
              disabled:
                Boolean(editing) || currentShipment == null || !shipmentSnapshot?.adjustForecast,
              onClick: (event) => {
                triggerRef.current = event.currentTarget;
                setNotice('');
                setError('');
                setEditing({
                  ...entry,
                  kind: 'shipment',
                  editorRow: key,
                  month: result.shipmentMonth,
                  keys: data.identities.map((row) => productKey(row.base, row.code)),
                  systemValue: data.shipmentSystem.quantity,
                  value: String(currentShipment),
                  reason: '',
                });
              },
            },
            number(data.shipmentEffective.quantity ?? data.shipmentEffective.knownQuantity),
          ),
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
              : h('strong', { title: `当前基地汇总；系统数量 ${number(system)}` }, number(value)),
            value == null &&
              known(selected, 'demand') !== '—' &&
              h('small', null, known(selected, 'demand')),
          );
          return index < 2
            ? [h('td', { key: `${month}-model` }, sourceCell(data.forecasts[index])), cell]
            : [cell];
        }),
      );
      return h(react.Fragment, { key }, rendered, editorFor(key, detailColumns.length));
    });
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
        h(
          react.Fragment,
          null,
          h('p', { className: 'wf-note' }, '单位：件'),
          table('大类需求总表', summaryColumns, summaryRows, (row) =>
            editorFor(`summary:${row[0]}`, summaryColumns.length),
          ),
        ),
        h('button', { onClick: exportSummary }, '下载大类需求总表'),
      ),
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
          'span',
          { className: 'wf-note' },
          `${new Set(rows.map((row) => row.code)).size}个单品 · ${new Set(rows.map((row) => row.base)).size}个基地 · 单位：件`,
        ),
      ),
      notice && h('p', { role: 'status', className: 'mps-edit-notice' }, notice),
      !editing && error && h('p', { role: 'alert' }, error),
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
                  disabled: Boolean(editing),
                  onClick: () => save(item, true),
                },
                '撤销',
              ),
            ]),
          ),
      ),
    );
  };
}
