import { prototypeShipments } from './prototype-shipments.js';
import { readShipmentInputs } from './facts.js';
import { hasMpsSource } from './master-data.js';
import { createInlineEdit } from './inline-edit.js';
const emptyRows = [];
const bases = ['西南', '郑州', '遂平', '华东', '华南'];
const fields = [
  'shipped',
  'prepped',
  'unprepped',
  'daily3',
  'shipDays',
  'average',
  'prediction',
  'fin',
  'open',
  'inbound',
  'remaining',
  'end',
];
const names = [
  '本月已发货',
  '已备',
  '未备',
  '近三天日均发货量',
  '已备未备预估发运天数',
  '日均',
  '本月预测量',
  '整月预估发货',
  '月初库存',
  '本月生产入库',
  '剩余天数入库',
  '预计月末结存',
];
const inputFields = ['shipped', 'prepped', 'unprepped', 'daily3', 'open', 'inbound', 'remaining'];
const columns = [
  '月份',
  '基地',
  '产品编码',
  '产品名称',
  '大类',
  '系列',
  '物料组',
  ...inputFields.map((field) => names[fields.indexOf(field)]),
];
const keyOf = (row) => JSON.stringify([row.base, row.code]);
const display = (value) =>
  value == null ? '待定' : value.toLocaleString('zh-CN', { maximumFractionDigits: 0 });
const knownSum = (rows, field) => {
  const known = rows.filter((row) => row[field] != null);
  return known.length ? finite(known.reduce((sum, row) => sum + row[field], 0)) : null;
};
const finite = (number) =>
  Number.isFinite(number) && Math.abs(number) <= Number.MAX_SAFE_INTEGER ? number : null;
function derive(row, passed, total) {
  const orders =
    row.prepped == null || row.unprepped == null ? null : finite(row.prepped + row.unprepped);
  const pace =
    row.daily3 > 0
      ? row.daily3
      : row.daily3 === 0 && row.shipped != null
        ? row.shipped / passed
        : null;
  const shipDays = orders === 0 ? 0 : orders != null && pace > 0 ? finite(orders / pace) : null;
  const hold = row.shipped == null || orders == null ? null : finite(row.shipped + orders);
  const average = hold != null && shipDays != null ? finite(hold / (passed + shipDays)) : null;
  const rest = shipDays == null ? null : Math.max(0, total - passed - shipDays);
  const prediction = average == null ? null : finite(Math.round(average * rest + hold));
  return { ...row, shipDays, hold, average, rest, prediction };
}
function allocate(weights, target) {
  if (weights.some((value) => value == null)) throw Error('存在待定权重，无法重摊，请先补齐输入。');
  const total = weights.reduce((sum, value) => sum + value, 0);
  if (!Number.isSafeInteger(target) || finite(total) == null)
    throw Error('调整值须为安全范围内的整数件数。');
  if (!total) {
    if (target) throw Error('当前有效量合计为0，非零目标的分摊口径待确认，未修改原值。');
    return weights.map(() => 0);
  }
  const raw = weights.map((weight) => (weight / total) * target);
  const values = raw.map(Math.trunc);
  if (values.some((value) => !Number.isSafeInteger(value)))
    throw Error('重摊结果超出安全范围，未修改原值。');
  const residual = Number(BigInt(target) - values.reduce((sum, value) => sum + BigInt(value), 0n));
  if (Math.abs(residual) > weights.length) throw Error('权重精度不足以可靠重摊，未修改原值。');
  const direction = Math.sign(residual);
  const order = raw
    .map((value, index) => ({ index, remainder: value - values[index] }))
    .sort(
      (left, right) => direction * (right.remainder - left.remainder) || left.index - right.index,
    );
  for (let index = 0; index < Math.abs(residual); index++) values[order[index].index] += direction;
  if (values.some((value) => !Number.isSafeInteger(value)))
    throw Error('重摊结果超出安全范围，未修改原值。');
  return values;
}
export function createShipment(
  react,
  useMpsPart,
  { Dialog, Upload, parseCsv, downloadCsv, monthOffset },
) {
  const h = react.createElement;
  const { NumberInput } = createInlineEdit(react);
  return function Shipment({ draft, update, active, onNext, scopeGeneration, onSnapshot }) {
    const month = monthOffset(draft.month, -1);
    const state = draft.shipment ?? {};
    const cutoff = state.cutoff ?? `${month}-22`;
    const passed = Number(cutoff.slice(8));
    const [year, monthNumber] = month.split('-').map(Number);
    const totalDays = new Date(year, monthNumber, 0).getDate();
    const demo =
      draft.productSource.startsWith('demo') &&
      state.rows == null &&
      !state.businessAttempted &&
      cutoff === '2026-09-22';
    const business =
      state.business?.month === month && state.business?.cutoff === cutoff ? state.business : null;
    const activeSource = state.activeSource ?? (state.rows != null ? 'local-file' : 'business');
    const sourceRows =
      activeSource === 'local-file'
        ? (state.rows ?? emptyRows)
        : (business?.rows ?? (demo ? prototypeShipments : emptyRows));
    const sourceKind =
      activeSource === 'local-file' && state.rows != null
        ? 'local-file'
        : business && activeSource === 'business'
          ? 'business'
          : demo
            ? 'demo'
            : 'unread';
    const stateRef = react.useRef(state);
    stateRef.current = state;
    const snapshotCallback = react.useRef(onSnapshot);
    snapshotCallback.current = onSnapshot;
    const controller = react.useRef(null);
    const [syncStatus, setSyncStatus] = react.useState('unread');
    const [expanded, setExpanded] = react.useState([]);
    const [skuSearch, setSkuSearch] = react.useState('');
    const [skuPages, setSkuPages] = react.useState({});
    const [formula, setFormula] = react.useState(null);
    const [error, setError] = react.useState('');
    const [busy, setBusy] = react.useState(false);
    const generation = react.useRef(0);
    react.useEffect(() => {
      generation.current++;
      setFormula(null);
      setError('');
      setExpanded([]);
      setBusy(false);
      setSyncStatus('unread');
      return () => {
        generation.current++;
        controller.current?.abort();
      };
    }, [draft.id, draft.month, cutoff]);
    const rows = react.useMemo(
      () =>
        sourceRows
          .filter((row) => row.month === month && bases.includes(row.base))
          .map((row) => {
            const derived = derive(row, passed, totalDays);
            const adjustment = state.values?.[keyOf(row)];
            const remainingEdit = state.remaining?.[row.base];
            const remaining = remainingEdit ? remainingEdit.values[keyOf(row)] : row.remaining;
            const fin = adjustment ? adjustment.value : derived.prediction;
            const end = [row.open, row.inbound, remaining, fin].every((value) => value != null)
              ? finite(row.open + row.inbound + remaining - fin)
              : null;
            return {
              ...derived,
              fin,
              remaining,
              inputRemaining: row.remaining,
              end,
              adjustment: adjustment ?? null,
              remainingSource: remainingEdit?.source ?? null,
              missingFields: inputFields.filter((field) => row[field] == null),
            };
          }),
      [sourceRows, month, passed, totalDays, state.values, state.remaining],
    );
    const aggregate = (children, who) => {
      const inputs = Object.fromEntries(
        inputFields.map((field) => [field, knownSum(children, field)]),
      );
      const forecastRows = children.filter((row) => row.prediction != null);
      const calculation = derive(
        Object.fromEntries(inputFields.map((field) => [field, knownSum(forecastRows, field)])),
        passed,
        totalDays,
      );
      return {
        ...calculation,
        ...inputs,
        who,
        fin: knownSum(children, 'fin'),
        end: knownSum(children, 'end'),
        calculation,
        missingCounts: Object.fromEntries(
          fields.map((field) => [field, children.filter((row) => row[field] == null).length]),
        ),
        children,
      };
    };
    const groups = bases.map((base) =>
      aggregate(
        rows.filter((row) => row.base === base),
        base,
      ),
    );
    const national = aggregate(rows, '全国合计');
    const updateState = (changes) => update({ shipment: { ...stateRef.current, ...changes } });
    const selectSource = (next) => {
      updateState({
        activeSource: next,
        sourceEdits: {
          ...state.sourceEdits,
          [activeSource]: { values: state.values, remaining: state.remaining },
        },
        values: state.sourceEdits?.[next]?.values ?? {},
        remaining: state.sourceEdits?.[next]?.remaining ?? {},
      });
      setFormula(null);
    };
    const source =
      sourceKind === 'demo'
        ? '演示数据 · 原型2026-09汤圆645条；四输入按原型确定性映射，剩余入库按本月生产入库÷22×8四舍五入演示推算'
        : sourceKind === 'local-file'
          ? `本地CSV：${state.file}`
          : business
            ? `业务来源：ai_db.agents_scm_stock_detail_d，${month}-01 至 ${cutoff}`
            : '数仓输入尚未同步';
    react.useEffect(() => {
      snapshotCallback.current?.({
        draftId: draft.id,
        month: draft.month,
        shipmentMonth: month,
        cutoff,
        source,
        sourceKind,
        status:
          sourceKind === 'business' ? (business.metadata.partial ? 'partial' : 'ok') : sourceKind,
        sourceRows,
        sourceRecords: sourceKind === 'business' ? business.sourceRecords : sourceRows,
        rows,
        adjustForecast: (keys, value, label) => {
          const selected = rows.filter((row) => keys.includes(keyOf(row)));
          if (!selected.length) return '当前对象无本月发货明细，未修改。';
          return change({ children: selected }, 'fin', value, label);
        },
        metadata: sourceKind === 'business' ? business.metadata : null,
      });
    }, [draft.id, draft.month, month, cutoff, source, sourceKind, sourceRows, rows, business]);
    const sync = async () => {
      controller.current?.abort();
      const stop = new AbortController();
      controller.current = stop;
      const request = ++generation.current;
      const scope = scopeGeneration.current;
      const valid = () =>
        !stop.signal.aborted && request === generation.current && scope === scopeGeneration.current;
      setBusy(true);
      setSyncStatus('loading');
      setError('');
      updateState({
        business: null,
        businessAttempted: true,
        activeSource: 'business',
        ...(activeSource === 'local-file'
          ? {
              sourceEdits: {
                ...state.sourceEdits,
                [activeSource]: { values: state.values, remaining: state.remaining },
              },
              values: {},
              remaining: {},
            }
          : {}),
      });
      try {
        const result = await readShipmentInputs(cutoff, stop.signal);
        if (!valid()) return;
        const actualRows = result.rows.filter(
          (row) => row.base && row.code && bases.includes(row.base),
        );
        const omitted = result.rows.length - actualRows.length;
        const missingDimensions = actualRows.filter(
          (row) => !row.name || !row.series || !row.group,
        ).length;
        const incompleteRows = actualRows.filter(
          (row) => inputFields.some((field) => row[field] == null) || row.sourceDays < passed,
        ).length;
        const duplicateRows = actualRows.filter((row) => row.duplicateDays > 0).length;
        updateState({
          business: {
            month,
            cutoff,
            rows: actualRows,
            sourceRecords: result.rows,
            metadata: {
              ...result.metadata,
              partial:
                result.metadata.partial ||
                !!(omitted || missingDimensions || incompleteRows || duplicateRows),
              recentStatus: passed < 3 ? 'insufficient-days' : 'ok',
              omittedRows: omitted,
              missingDimensions,
              incompleteRows,
              duplicateRows,
            },
          },
        });
        setSyncStatus('ok');
      } catch (failure) {
        if (!valid()) return;
        setSyncStatus('failed');
        setError(
          /AGENT_ACCESS_DENIED|PERMISSION_DENIED|RESOURCE_NOT_IN_DATASET/.test(failure.message)
            ? '当前账号暂无库存日计划数据权限'
            : failure.message,
        );
      } finally {
        if (valid()) setBusy(false);
      }
    };
    const explain = (row, field, who) => setFormula({ row, field, who });
    const change = (row, kind, text, who) => {
      try {
        if (!/^[+-]?\d+$/.test(text) || !Number.isSafeInteger(Number(text)))
          throw Error('请输入安全范围内的整数件数，留空不是0。');
        const target = Number(text);
        if (kind === 'remaining' && target < 0) throw Error('剩余天数入库须大于或等于0。');
        if (kind === 'remaining') {
          const original = row.children.map((child) => child.inputRemaining);
          const values = allocate(original, target);
          updateState({
            remaining: {
              ...state.remaining,
              [who]: {
                values: Object.fromEntries(
                  row.children.map((child, index) => [keyOf(child), values[index]]),
                ),
                source: `${who}基地覆盖${target}件，按原剩余入库权重重摊并补偿舍入残差`,
              },
            },
          });
        } else {
          const values = { ...state.values };
          const assign = (children, amount, label) => {
            const weights = children.map((child) => child.fin);
            const allocated = allocate(weights, amount);
            children.forEach((child, index) => {
              values[keyOf(child)] = {
                value: allocated[index],
                source: label,
                target: amount,
                previous: child.fin,
                weightTotal: weights.reduce((sum, value) => sum + value, 0),
              };
            });
          };
          if (who === '全国合计') {
            const present = groups.filter((group) => group.children.length);
            if (!present.length) throw Error('当前月份无明细，无法重摊。');
            const amounts = allocate(
              present.map((group) => group.fin),
              target,
            );
            present.forEach((group, index) =>
              assign(
                group.children,
                amounts[index],
                `全国合计覆盖${target}件→${group.who}分配${amounts[index]}件，按当前有效量两级重摊并补偿舍入残差`,
              ),
            );
          } else if (row.children)
            assign(
              row.children,
              target,
              `${who}覆盖${target}件，按明细当前有效量重摊并补偿舍入残差，替换单品覆盖`,
            );
          else values[keyOf(row)] = { value: target, source: '单品人工覆盖', previous: row.fin };
          updateState({ values });
        }
        setError('');
        return null;
      } catch (failure) {
        return failure.message;
      }
    };
    const read = async (file) => {
      controller.current?.abort();
      const request = ++generation.current;
      const scope = scopeGeneration.current;
      const valid = () => request === generation.current && scope === scopeGeneration.current;
      setBusy(true);
      try {
        if (file.size > 5 * 1024 * 1024) throw Error('文件超过5 MiB上限，未读取任何行。');
        const records = parseCsv(await file.text(), columns);
        const seen = new Set();
        const parsed = records.map((record, index) => {
          const row = {
            month: record['月份'],
            base: record['基地'],
            code: record['产品编码'],
            name: record['产品名称'],
            category: record['大类'],
            series: record['系列'],
            group: record['物料组'],
          };
          if (
            ![...bases, '濮阳'].includes(row.base) ||
            !row.code ||
            !row.name ||
            !row.category ||
            !row.series ||
            !row.group
          )
            throw Error(`第${index + 2}行基地或产品维度不完整，未替换原输入。`);
          const key = JSON.stringify([row.month, row.base, row.code]);
          if (seen.has(key)) throw Error(`第${index + 2}行同月同基地产品重复，未替换原输入。`);
          seen.add(key);
          inputFields.forEach((field) => {
            const value = record[names[fields.indexOf(field)]];
            if (value !== '' && (!/^\d+(\.\d+)?$/.test(value) || finite(Number(value)) == null))
              throw Error(
                `第${index + 2}行${names[fields.indexOf(field)]}须为非负有限数或留空，未替换原输入。`,
              );
            row[field] = value === '' ? null : Number(value);
          });
          return row;
        });
        for (const field of inputFields)
          if (finite(parsed.reduce((sum, row) => sum + (row[field] ?? 0), 0)) == null)
            throw Error('输入合计超出安全范围，未替换原输入。');
        if (!valid()) return;
        updateState({
          rows: parsed,
          file: file.name,
          activeSource: 'local-file',
          values: {},
          remaining: {},
        });
        setError('');
        setExpanded([]);
        setFormula(null);
      } catch (failure) {
        if (valid()) setError(failure.message);
      } finally {
        if (valid()) setBusy(false);
      }
    };
    const download = () => {
      const outputColumns = [
        '评估版本',
        '评估月份',
        '截止日',
        '已过天数',
        '本月天数',
        ...columns,
        '本月预测量',
        '整月预估发货',
        '预计月末结存',
        '输入来源',
        '调整来源',
        '剩余入库来源',
        '缺失输入',
      ];
      downloadCsv(
        `MPS-${draft.month}-${draft.id}-发货与结存.csv`,
        outputColumns,
        rows.map((row) => ({
          评估版本: draft.name,
          评估月份: draft.month,
          截止日: cutoff,
          已过天数: passed,
          本月天数: totalDays,
          月份: month,
          基地: row.base,
          产品编码: row.code,
          产品名称: row.name,
          大类: row.category,
          系列: row.series,
          物料组: row.group,
          ...Object.fromEntries(
            inputFields.map((field) => [names[fields.indexOf(field)], row[field] ?? '']),
          ),
          本月预测量: row.prediction ?? '',
          整月预估发货: row.fin ?? '',
          预计月末结存: row.end ?? '',
          输入来源: source,
          调整来源: row.adjustment ? JSON.stringify(row.adjustment) : '默认单品预测值',
          剩余入库来源:
            row.remainingSource ??
            (sourceKind === 'demo'
              ? '演示推算：生产入库÷22×8，四舍五入'
              : sourceKind === 'local-file'
                ? '本地CSV；BI排产未核齐'
                : `本月生产入库÷${passed}×${totalDays - passed}，逐SKU四舍五入`),
          缺失输入: row.missingFields.map((field) => names[fields.indexOf(field)]).join('、'),
        })),
      );
    };
    const contextFields = ['base', 'code', ...inputFields, 'prediction', 'fin', 'end'];
    const contextRows = [];
    let contextLength = 0;
    for (const row of rows) {
      const values = contextFields.map((field) => row[field]);
      contextLength += JSON.stringify(values).length + 1;
      if (contextLength > 70000) break;
      contextRows.push(values);
    }
    useMpsPart(
      react,
      'ship',
      {
        scope: 'local-check-only',
        draft: { id: draft.id, name: draft.name, month: draft.month },
        month,
        cutoff,
        passedDays: passed,
        totalDays,
        unit: '件',
        source,
        businessSave: 'not-connected',
        nextStage: 'shared-snapshot',
        sourceKind,
        metadata: sourceKind === 'business' ? business.metadata : null,
        rowFields: contextFields,
        rows: contextRows,
        rowCount: rows.length,
        omittedRows: rows.length - contextRows.length,
        fullDetail: '通过下载明细获取全部有效逐SKU输入、结存及覆盖来源',
        bases: groups.map(({ children: _children, ...group }) => group),
        totals: { ...national, children: undefined },
        carryToMonth: draft.month,
        retention: 'memory-only',
      },
      '本月预估发货',
      active,
    );
    const numberCell = (row, field, who) => {
      const editable =
        field === 'fin' || (field === 'remaining' && row.children && who !== '全国合计');
      return h(
        'td',
        {
          key: field,
          className: row[field] < 0 ? 'sp-negative' : undefined,
          title: row.missingCounts?.[field]
            ? `仅汇总已有数据，${row.missingCounts[field]}个单品待定`
            : undefined,
        },
        editable
          ? h(NumberInput, {
              value: row[field],
              integer: true,
              placeholder: '待定',
              min: field === 'remaining' ? 0 : null,
              label: `${who} ${names[fields.indexOf(field)]}`,
              commit: (text) => change(row, field, text, who),
              explain: () => explain(row, field, who),
            })
          : h(
              'button',
              {
                className: 'sp-number',
                'aria-label': `${who} ${names[fields.indexOf(field)]} 计算过程`,
                onClick: () => explain(row, field, who),
              },
              display(row[field]),
            ),
      );
    };
    const renderRow = (row, who, label, className) =>
      h(
        'tr',
        { key: who, className },
        h(
          'th',
          { scope: 'row' },
          label,
          row.children
            ? Object.values(row.missingCounts).some((count) => count > 0) &&
                h('span', { className: 'sp-warning sp-coverage' }, '部分汇总')
            : row.missingFields.length > 0 &&
                h(
                  'span',
                  {
                    className: 'sp-warning sp-coverage',
                    title: `缺失：${row.missingFields.map((field) => names[fields.indexOf(field)]).join('、')}`,
                  },
                  '缺项',
                ),
          row.end < 0 && h('span', { className: 'sp-warning' }, '需含调拨'),
        ),
        ...fields.map((field) => numberCell(row, field, who)),
      );
    const formulas =
      formula &&
      (() => {
        const { row, field, who } = formula;
        const calculation =
          row.children && ['shipDays', 'average', 'prediction'].includes(field)
            ? row.calculation
            : row;
        const raw = (key) => (calculation[key] == null ? '待定' : String(calculation[key]));
        const fallback =
          calculation.daily3 === 0
            ? `近三天为0，使用本月已发货÷已过天数：${raw('shipped')} ÷ ${passed}。`
            : '';
        const expressions = {
          shipDays: [
            '发运天数 = (已备 + 未备) ÷ 近三天日均；近三天为0时使用本月日均，无订单为0',
            `${raw('prepped')} + ${raw('unprepped')}；日均${raw('daily3')}；${fallback}`,
          ],
          average: [
            '日均 = (已发货 + 已备 + 未备) ÷ (已过天数 + 发运天数)',
            `${raw('hold')} ÷ (${passed} + ${raw('shipDays')})；${fallback}`,
          ],
          prediction: [
            '本月预测量 = 日均 × max(0,总天数 − 已过天数 − 发运天数) + 已发货 + 已备 + 未备，四舍五入为件',
            `(${calculation.hold ?? '待定'} ÷ (${passed} + ${calculation.shipDays ?? '待定'})) × max(0, ${totalDays} − ${passed} − ${calculation.shipDays ?? '待定'}) + ${calculation.hold ?? '待定'}；日均展示${raw('average')}，中间值不舍入。`,
          ],
          fin: [
            '整月预估发货 = 单品有效值之和；单品默认预测值，人工覆盖按当前有效权重重摊并补偿残差',
            row.adjustment
              ? JSON.stringify(row.adjustment)
              : row.children
                ? '下级有效值求和；重摊后单品覆盖被替换，单品后改仅改变该行'
                : '默认单品预测值',
          ],
          remaining: [
            '剩余天数入库 = 单品入库日均 × 剩余天数；基地覆盖按明细原剩余入库权重重摊并补偿残差',
            row.remainingSource ??
              (sourceKind === 'demo'
                ? '演示推算：本月生产入库 ÷ 22 × 8，逐SKU四舍五入'
                : sourceKind === 'business'
                  ? `${raw('inbound')} ÷ ${passed} × ${totalDays - passed}，逐SKU四舍五入`
                  : '本地CSV输入，BI排产未核齐'),
          ],
          end: [
            row.children
              ? '预计月末结存 = 已有单品结存之和；缺项单品保留待定'
              : '预计月末结存 = 月初库存 + 本月生产入库 + 剩余天数入库 − 整月预估发货',
            row.children
              ? `${row.children.length - row.missingCounts.end}个可计算单品结存求和 = ${raw('end')}`
              : `${raw('open')} + ${raw('inbound')} + ${raw('remaining')} − ${raw('fin')}`,
          ],
        };
        const [expression, substitution] = expressions[field] ?? [
          `${names[fields.indexOf(field)]} = ${row.children ? '下级同字段已有数据之和' : '当前月份输入原值'}`,
          `表内取值 ${raw(field)}`,
        ];
        return h(
          Dialog,
          {
            title: `计算过程 · ${who} · ${names[fields.indexOf(field)]}`,
            close: () => setFormula(null),
            footer: h('button', { onClick: () => setFormula(null) }, '关闭'),
          },
          h('div', { className: 'sp-formula' }, expression),
          row.children &&
            h(
              'p',
              {},
              ['shipDays', 'average', 'prediction'].includes(field)
                ? `按可计算的${row.children.filter((child) => child.prediction != null).length}/${row.children.length}个单品重算，缺失输入未补零。`
                : `已汇总${row.children.length - row.missingCounts[field]}/${row.children.length}个单品，待定单品未补零。`,
            ),
          h(
            'table',
            { className: 'sp-formula-inputs' },
            h(
              'tbody',
              {},
              ...(
                {
                  shipDays: ['prepped', 'unprepped', 'daily3'],
                  average: ['shipped', 'prepped', 'unprepped', 'shipDays'],
                  prediction: ['shipped', 'prepped', 'unprepped', 'shipDays'],
                  fin: ['prediction', 'fin'],
                  remaining: ['inbound', 'remaining'],
                  end: ['open', 'inbound', 'remaining', 'fin'],
                }[field] ?? [field]
              ).map((key) =>
                h(
                  'tr',
                  { key },
                  h('td', {}, names[fields.indexOf(key)]),
                  h('td', {}, display(calculation[key])),
                ),
              ),
              h('tr', {}, h('td', {}, '计算'), h('td', {}, substitution)),
            ),
          ),
          h(
            'div',
            { className: 'sp-formula-result' },
            h('span', {}, '结果'),
            h(
              'b',
              {},
              `${display(row[field])}${field === 'shipDays' ? '天' : field === 'average' || field === 'daily3' ? '件/天' : '件'}`,
            ),
          ),
          row[field] == null && h('p', {}, '输入缺失或分母为0且存在订单，结果待定；未补零。'),
          row.children &&
            ['fin', 'remaining', 'end'].includes(field) &&
            h(
              'details',
              {},
              h('summary', {}, '下级求和与调整来源'),
              ...(who === '全国合计'
                ? groups.filter((group) => group.children.length)
                : row.children.slice(0, 12)
              ).map((child, index) =>
                h(
                  'p',
                  { key: index },
                  `${child.who ?? child.code}：${display(child[field])}；${field === 'remaining' ? (child.remainingSource ?? '原输入或基地重摊，完整来源见下载明细') : (child.adjustment?.source ?? (child.children ? '基地下级有效值求和' : '默认单品预测值'))}`,
                ),
              ),
              who !== '全国合计' &&
                row.children.length > 12 &&
                h(
                  'p',
                  {},
                  `另有${row.children.length - 12}条未展开，完整输入与调整来源见下载明细。`,
                ),
            ),
          row.end < 0 && h('p', {}, '负结存保留，需含调拨。'),
        );
      })();
    return h(
      'section',
      { hidden: !active, className: 'sp-page', 'aria-label': '发货本地核对' },
      h(
        'div',
        { className: 'sp-parameters' },
        h('span', { className: 'sp-parameter-label' }, '算法参数'),
        h('span', {}, '已过天数 ', h('b', {}, `${passed} 天`)),
        h('span', {}, '本月共计天数 ', h('b', {}, `${totalDays} 天`)),
        h('span', { className: 'sp-spacer' }),
        h(
          'label',
          {},
          '数据截止',
          h('input', {
            type: 'date',
            'aria-label': '数据截止日',
            value: cutoff,
            min: `${month}-01`,
            max: `${month}-${totalDays}`,
            onChange: (event) => {
              const value = event.target.value;
              if (
                value.startsWith(month + '-') &&
                Number(value.slice(8)) >= 1 &&
                Number(value.slice(8)) <= totalDays
              ) {
                generation.current++;
                controller.current?.abort();
                updateState({ cutoff: value, business: null, values: {}, remaining: {} });
                setFormula(null);
              }
            },
          }),
        ),
        (state.rows != null || state.businessAttempted || business) &&
          h(
            'label',
            {},
            '发货数据来源',
            h(
              'select',
              {
                'aria-label': '发货数据来源',
                value: activeSource,
                disabled: busy,
                onChange: (event) => selectSource(event.target.value),
              },
              h('option', { value: 'business' }, '实际发货'),
              h('option', { value: 'local-file', disabled: state.rows == null }, '本地CSV'),
            ),
          ),
        h('span', {}, '单位 件'),
      ),
      h(
        'div',
        { className: 'dc-card sp-card' },
        h(
          'div',
          { className: 'dc-card-head sp-toolbar' },
          h('h3', {}, '本月预估发货'),
          h('input', {
            'aria-label': '搜索发货单品',
            placeholder: '搜索编码或名称',
            value: skuSearch,
            onChange: (event) => {
              setSkuSearch(event.target.value);
              setSkuPages({});
            },
          }),
          sourceKind === 'demo' && h('span', { className: 'dc-status' }, '演示数据'),
          h(
            'span',
            { className: 'dc-status' },
            sourceKind === 'business'
              ? '业务来源'
              : sourceKind === 'local-file'
                ? '本地文件'
                : '待同步',
          ),
          h(
            'span',
            { className: 'sp-shipped' },
            '本月已发 ',
            h('b', {}, display(national.shipped)),
            ' 件',
          ),
          h('span', { className: 'sp-spacer' }),
          (Object.keys(state.values ?? {}).length > 0 ||
            Object.keys(state.remaining ?? {}).length > 0) &&
            h(
              'button',
              {
                disabled:
                  !Object.keys(state.values ?? {}).length &&
                  !Object.keys(state.remaining ?? {}).length,
                onClick: () => {
                  updateState({ values: {}, remaining: {} });
                  setError('');
                  setFormula(null);
                },
              },
              '重置',
            ),
        ),
        h(
          'p',
          { role: 'status' },
          busy
            ? '正在读取或校验输入…'
            : syncStatus === 'failed'
              ? '数仓输入同步失败，未采用旧业务结果'
              : source,
        ),
        business?.metadata.omittedRows > 0 &&
          h(
            'p',
            {},
            `源数据${business.metadata.omittedRows}条缺基地或产品编码，或基地不在本表范围，未并入明细`,
          ),
        business?.metadata.missingDimensions > 0 &&
          h(
            'p',
            {},
            `源数据${business.metadata.missingDimensions}条产品名称、系列或品项缺失或冲突，保留数量与源状态`,
          ),
        business?.metadata.incompleteRows > 0 &&
          h(
            'p',
            {},
            `源数据${business.metadata.incompleteRows}个单品存在缺值或日记录不齐，缺值保留待定`,
          ),
        business?.metadata.duplicateRows > 0 &&
          h('p', {}, `源数据${business.metadata.duplicateRows}个单品有重复日期，相关输入未采用`),
        business?.metadata.recentStatus === 'insufficient-days' &&
          h('p', {}, '截止日前本月不足三天，近三天日均未提供'),
        error && h('p', { role: 'alert', className: 'sp-error' }, error),
        h(
          'div',
          { className: 'dc-table-scroll sp-scroll' },
          h(
            'table',
            { className: 'sp-table', 'aria-label': '本月预估发货明细' },
            h(
              'colgroup',
              {},
              ...[132, 72, 62, 62, 82, 94, 62, 88, 96, 68, 72, 98, 94].map((width, index) =>
                h('col', { key: index, style: { width } }),
              ),
            ),
            h(
              'thead',
              {},
              h(
                'tr',
                {},
                h('th', { rowSpan: 2, scope: 'col' }, '基地 / 单品'),
                ...[
                  ['输入（数仓）', 4],
                  ['派生', 2],
                  ['本月结果', 1],
                  ['人工覆盖', 1],
                  ['当月结存', 4],
                ].map(([label, span]) =>
                  h('th', { key: label, colSpan: span, scope: 'colgroup' }, label),
                ),
              ),
              h(
                'tr',
                {},
                ...names.map((name, index) =>
                  h(
                    'th',
                    { key: name, scope: 'col' },
                    index === 7 || index === 10
                      ? h(
                          'button',
                          {
                            className: 'sp-column-formula',
                            onClick: () => explain(national, fields[index], '全国合计'),
                          },
                          name,
                        )
                      : index === 8
                        ? '月初1号库存'
                        : name,
                    index === 7 || index === 10 ? h('small', {}, '（可改）') : null,
                  ),
                ),
              ),
            ),
            h(
              'tbody',
              {},
              ...groups.flatMap((group) => {
                const children = group.children.filter(
                  (row) =>
                    !skuSearch || [row.code, row.name].some((value) => value?.includes(skuSearch)),
                );
                const page = Math.min(
                  skuPages[group.who] ?? 0,
                  Math.max(0, Math.ceil(children.length / 25) - 1),
                );
                return [
                  renderRow(
                    group,
                    group.who,
                    h(
                      react.Fragment,
                      {},
                      h(
                        'button',
                        {
                          className: 'sp-toggle',
                          'aria-label': `${expanded.includes(group.who) ? '收起' : '展开'} ${group.who}`,
                          'aria-expanded': expanded.includes(group.who),
                          onClick: () =>
                            setExpanded(
                              expanded.includes(group.who)
                                ? expanded.filter((base) => base !== group.who)
                                : [...expanded, group.who],
                            ),
                        },
                        h(
                          'svg',
                          {
                            width: 12,
                            height: 12,
                            viewBox: '0 0 12 12',
                            fill: 'none',
                            stroke: 'currentColor',
                            style: {
                              transform: expanded.includes(group.who) ? 'rotate(90deg)' : undefined,
                            },
                            'aria-hidden': true,
                          },
                          h('path', { d: 'M4 2l4 4-4 4' }),
                        ),
                      ),
                      group.who,
                      h('span', { className: 'sp-count' }, `${group.children.length} 个单品`),
                    ),
                    'sp-base',
                  ),
                  ...(expanded.includes(group.who)
                    ? [
                        ...children.slice(page * 25, (page + 1) * 25).map((row) =>
                          renderRow(
                            row,
                            `${row.base} ${row.code}`,
                            h(
                              react.Fragment,
                              {},
                              h('span', { className: 'sp-code' }, row.code),
                              h(
                                'span',
                                {
                                  className: 'sp-product-name',
                                  title: `${row.name} · ${row.category} · ${row.series} · ${row.group}`,
                                },
                                row.name || '产品名称未提供',
                              ),
                            ),
                            'sp-sku',
                          ),
                        ),
                        h(
                          'tr',
                          { key: `${group.who}-page` },
                          h(
                            'td',
                            { colSpan: 13 },
                            h(
                              'div',
                              { className: 'sp-sku-pages' },
                              h('span', null, `共${children.length}个单品 · 第${page + 1}页`),
                              h(
                                'button',
                                {
                                  'aria-label': `${group.who} 上一页单品`,
                                  disabled: !page,
                                  onClick: () =>
                                    setSkuPages({ ...skuPages, [group.who]: page - 1 }),
                                },
                                '上一页',
                              ),
                              h(
                                'button',
                                {
                                  'aria-label': `${group.who} 下一页单品`,
                                  disabled: (page + 1) * 25 >= children.length,
                                  onClick: () =>
                                    setSkuPages({ ...skuPages, [group.who]: page + 1 }),
                                },
                                '下一页',
                              ),
                            ),
                          ),
                        ),
                      ]
                    : []),
                ];
              }),
              renderRow(national, '全国合计', '全国合计', 'sp-total'),
            ),
          ),
        ),
        !rows.length && h('p', { className: 'dc-empty' }, '暂无数据'),
        h(
          'details',
          { className: 'sp-method' },
          h('summary', {}, '本月预估发货的算法'),
          h(
            'p',
            {},
            '发运天数=(已备+未备)÷近三天日均；近三天为0时改用本月已发货÷已过天数。日均=(已发货+已备+未备)÷(已过天数+发运天数)。本月预测量=日均×max(0,总天数−已过天数−发运天数)+已发货+已备+未备，四舍五入。',
          ),
        ),
        h(
          'div',
          { className: 'dc-card-foot' },
          h('button', { onClick: sync, disabled: busy || !hasMpsSource() }, '同步实际发货'),
          h(Upload, { label: '选择发货输入CSV', text: '上传输入', read }),
          h('button', { onClick: () => downloadCsv('发货输入-模板.csv', columns, []) }, 'CSV模板'),
          h('span', { className: 'sp-spacer' }),
          h('button', { onClick: download, disabled: !rows.length }, '下载明细'),
          h('button', { className: 'dc-primary', onClick: onNext }, '下一步：需求加工与收敛'),
        ),
      ),
      formulas,
    );
  };
}
