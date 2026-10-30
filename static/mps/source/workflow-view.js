import { buildMpsWorkflow } from './workflow-inputs.js';

const titles = {
  process: '需求加工与收敛',
  constraints: '约束与配置',
  capacity: '产能评估与缺口',
  report: '产销存报告',
};
const labels = {
  reportQuantity: '提报数量',
  historyQuantity: '历史发货数量',
  reportShare: '提报占比',
  historyShare: '历史占比',
  share: '平均占比',
  demand: '需求数量',
  openingInventory: '期初库存',
  safetyDays: '安全天数',
  targetInventory: '目标库存',
  monthlyCapacity: '月产能',
  load: '负荷',
  mainPlan: '主计划',
  gap: '缺口',
  transfer: '调拨',
};
const identityColumns = [
  ['month', '月份'],
  ['base', '基地'],
  ['category', '大类'],
  ['series', '系列'],
  ['group', '物料组'],
  ['code', '产品编码'],
  ['name', '产品名称'],
];
const processFields = [
  'reportQuantity',
  'historyQuantity',
  'reportShare',
  'historyShare',
  'share',
  'demand',
];
const planFields = [
  'demand',
  'openingInventory',
  'safetyDays',
  'targetInventory',
  'monthlyCapacity',
  'load',
  'mainPlan',
  'gap',
  'transfer',
];
const display = (value) => (value == null || value === '' ? '—' : String(value));
const numberText = (value, percent = false) =>
  value == null
    ? '—'
    : new Intl.NumberFormat('zh-CN', {
        minimumFractionDigits: percent ? 2 : 0,
        maximumFractionDigits: percent ? 2 : 0,
      }).format(percent ? value * 100 : value) + (percent ? '%' : '');
const reasons = (row, fields) => [...new Set(fields.flatMap((field) => row.missing[field] ?? []))];
const status = (row, fields) => reasons(row, fields).join('、') || '已计算';
const sourceText = '①大类需求；②月末结存；③两路占比；④源产能；⑤本地配置';

export function createWorkflow(react, useMpsPart, { downloadCsv, Dialog }) {
  const h = react.createElement;
  return function Workflow({ step, draft, update, relations, shipmentSnapshot, onNext }) {
    const [search, setSearch] = react.useState('');
    const [base, setBase] = react.useState('');
    const [category, setCategory] = react.useState('');
    const [month, setMonth] = react.useState('');
    const [onlyMissing, setOnlyMissing] = react.useState(false);
    const [page, setPage] = react.useState(0);
    const [formula, setFormula] = react.useState(null);
    const result = react.useMemo(
      () => buildMpsWorkflow(draft, relations, shipmentSnapshot),
      [draft, relations, shipmentSnapshot],
    );
    const fields = step === 'process' ? processFields : planFields;
    const bases = [
      ...new Set(
        [
          ...result.rows.map((row) => row.base),
          ...result.constraints.safetyDays.map((row) => row.base),
        ].filter(Boolean),
      ),
    ];
    const categories = [...new Set(result.categoryRows.map((row) => row.category))];
    const filtered = result.rows.filter(
      (row) =>
        (!base || row.base === base) &&
        (!category || row.category === category) &&
        (!month || row.month === month) &&
        (!onlyMissing || reasons(row, fields).length) &&
        (!search || identityColumns.some(([key]) => display(row[key]).includes(search))),
    );
    const categoryRows = result.categoryRows.filter(
      (row) => (!category || row.category === category) && (!month || row.month === month),
    );
    const pageIndex = Math.min(page, Math.max(0, Math.ceil(filtered.length / 25) - 1));
    const visible = filtered.slice(pageIndex * 25, (pageIndex + 1) * 25);
    const scopeKey = JSON.stringify([draft.id, draft.month, step]);
    const [shownScope, setShownScope] = react.useState(scopeKey);
    if (shownScope !== scopeKey) {
      setShownScope(scopeKey);
      setSearch('');
      setBase('');
      setCategory('');
      setMonth('');
      setOnlyMissing(false);
      setPage(0);
      setFormula(null);
    }
    useMpsPart(
      react,
      step,
      {
        evaluation: result.context,
        months: result.months,
        shipmentMonth: result.shipmentMonth,
        filter: { search, base, category, month, onlyMissing },
        categoryRows,
        rows: visible,
        total: result.rows.length,
        filteredTotal: filtered.length,
        page: pageIndex + 1,
        constraints: result.constraints,
        missing: result.missing,
        businessSave: 'not-connected',
      },
      titles[step],
    );
    const table = (name, columns, rows) =>
      h(
        'div',
        { className: 'dc-table-scroll wf-table-scroll' },
        h(
          'table',
          { 'aria-label': name },
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
                    cells.map((cell, position) => h('td', { key: position }, cell)),
                  ),
                )
              : h(
                  'tr',
                  null,
                  h('td', { colSpan: columns.length, className: 'wf-empty' }, '暂无记录 · 未评估'),
                ),
          ),
        ),
      );
    const card = (name, body, actions) =>
      h(
        'section',
        { className: 'dc-card', 'aria-label': name },
        h('div', { className: 'dc-card-head' }, h('h3', null, name), actions),
        body,
      );
    const next =
      step === 'process'
        ? '主数据对应关系'
        : step === 'constraints'
          ? '产能评估与缺口'
          : '产销存报告';
    const select = (label, value, values, setter) =>
      h(
        'label',
        null,
        label,
        h(
          'select',
          {
            'aria-label': label,
            value,
            onChange: (event) => {
              setter(event.target.value);
              setPage(0);
            },
          },
          h('option', { value: '' }, '全部'),
          values.map((item) => h('option', { key: item, value: item }, item)),
        ),
      );
    const explain = (row, field) => {
      const missing = row.missing[field] ?? [];
      let expression = missing.join('、');
      if (!missing.length && field === 'share')
        expression = `(${row.reportShare} + ${row.historyShare}) ÷ 2 = ${row.share}`;
      if (!missing.length && field === 'demand') {
        const total = result.categoryRows.find(
          (item) => item.month === row.month && item.category === row.category,
        )?.quantity;
        expression = `${total} × ${row.share} = ${row.demand}`;
      }
      if (!missing.length && field === 'reportShare')
        expression = '同月同大类提报数量 ÷ 同月同大类提报总量';
      if (!missing.length && field === 'historyShare')
        expression = '去年同月同大类发货数量 ÷ 去年同月同大类发货总量';
      if (!missing.length && field === 'openingInventory')
        expression = `${result.shipmentMonth}月末结存 = ${row.openingInventory}`;
      setFormula({
        title: `${row.base} ${row.code} ${row.month} ${labels[field]} 计算过程`,
        expression,
        value: row[field],
        missing,
      });
    };
    const numericCell = (row, field) =>
      h(
        'button',
        {
          className: `dc-link wf-value${row[field] == null ? ' wf-unavailable' : ''}`,
          'aria-label': `${row.base} ${row.code} ${row.month} ${labels[field]} 计算过程`,
          onClick: () => explain(row, field),
        },
        numberText(row[field], field.endsWith('Share') || field === 'share'),
      );
    const exportRows = (name, exportFields, includeCategory = false) => {
      const columns = [
        '评估版本',
        '评估月份',
        '粒度',
        ...identityColumns.map(([, label]) => label),
        ...exportFields.map((key) => labels[key]),
        '源产能候选',
        '来源',
        '未评估原因',
      ];
      const rows = filtered.map((row) => ({
        评估版本: draft.name,
        评估月份: draft.month,
        粒度: '基地×物料组×SKU',
        ...Object.fromEntries(identityColumns.map(([key, label]) => [label, row[key]])),
        ...Object.fromEntries(exportFields.map((key) => [labels[key], row[key]])),
        源产能候选: row.capacities
          .map(
            (item) =>
              `${display(item.line)}：${display(item.dailyPieces)}件/日，${display(item.dailyTons)}吨/日`,
          )
          .join('；'),
        来源: sourceText,
        未评估原因: status(row, exportFields),
      }));
      if (includeCategory)
        rows.unshift(
          ...categoryRows.map((row) => ({
            评估版本: draft.name,
            评估月份: draft.month,
            粒度: '大类',
            月份: row.month,
            大类: row.category,
            需求数量: row.quantity,
            来源: '①大类需求',
            未评估原因: row.missing.join('、') || '已计算',
          })),
        );
      if (!rows.length)
        rows.push({
          评估版本: draft.name,
          评估月份: draft.month,
          来源: sourceText,
          未评估原因: result.missing.join('、') || '暂无输入，未评估',
        });
      downloadCsv(`${draft.month}-${name}.csv`, columns, rows);
    };
    const filterBar = h(
      'div',
      { className: 'wf-filters' },
      select('月份筛选', month, result.months, setMonth),
      select('基地筛选', base, bases, setBase),
      select('大类筛选', category, categories, setCategory),
      h(
        'label',
        null,
        '搜索',
        h('input', {
          type: 'search',
          'aria-label': '搜索当前步骤',
          placeholder: '编码、名称、系列、物料组',
          value: search,
          onChange: (event) => {
            setSearch(event.target.value);
            setPage(0);
          },
        }),
      ),
      h(
        'label',
        { className: 'wf-check' },
        h('input', {
          type: 'checkbox',
          checked: onlyMissing,
          onChange: (event) => {
            setOnlyMissing(event.target.checked);
            setPage(0);
          },
        }),
        '仅未评估',
      ),
    );
    const footer = h(
      'div',
      { className: 'dc-card-foot' },
      h('span', null, `共${filtered.length}条 · 第${pageIndex + 1}页`),
      h('button', { disabled: pageIndex === 0, onClick: () => setPage(pageIndex - 1) }, '上一页'),
      h(
        'button',
        {
          disabled: (pageIndex + 1) * 25 >= filtered.length,
          onClick: () => setPage(pageIndex + 1),
        },
        '下一页',
      ),
    );
    const rowsTable = (name, selectedFields) =>
      table(
        name,
        [
          ...identityColumns.map(([, label]) => label),
          ...selectedFields.map((field) => labels[field]),
          '未评估原因',
        ],
        visible.map((row) => [
          ...identityColumns.map(([key]) => display(row[key])),
          ...selectedFields.map((field) => numericCell(row, field)),
          h(
            'span',
            {
              className: `wf-reasons${reasons(row, selectedFields).length ? ' wf-unavailable' : ''}`,
              title: status(row, selectedFields),
            },
            status(row, selectedFields),
          ),
        ]),
      );
    const constraintRows = bases
      .filter(
        (sourceBase) => (!base || sourceBase === base) && (!search || sourceBase.includes(search)),
      )
      .map((sourceBase) => {
        const current = result.constraints.safetyDays.find((item) => item.base === sourceBase);
        return [
          sourceBase,
          h('input', {
            type: 'number',
            min: 0,
            step: 'any',
            value: current?.days ?? '',
            'aria-label': `${sourceBase} 安全天数`,
            onChange: (event) => {
              const text = event.target.value;
              if (
                text !== '' &&
                (!Number.isFinite(Number(text)) ||
                  Number(text) < 0 ||
                  Number(text) > Number.MAX_SAFE_INTEGER)
              )
                return;
              update({
                constraints: {
                  ...result.constraints,
                  safetyDays: [
                    ...result.constraints.safetyDays.filter((item) => item.base !== sourceBase),
                    { base: sourceBase, days: text === '' ? null : Number(text) },
                  ],
                },
              });
            },
          }),
          '本地隔离草稿',
          '目标库存公式待确认',
        ];
      });
    const localRules = result.constraints.rules.local ?? [];
    const updateRules = (entries) =>
      update({
        constraints: {
          ...result.constraints,
          rules: { ...result.constraints.rules, local: entries },
        },
      });
    const ruleRows = localRules.flatMap((rule, index) => {
      if (
        search &&
        ![rule.description, rule.target, rule.strength, rule.until].some((value) =>
          String(value ?? '').includes(search),
        )
      )
        return [];
      const input = (key, label, type = 'text') =>
        h('input', {
          type,
          'aria-label': `约束${index + 1} ${label}`,
          value: rule[key] ?? '',
          onChange: (event) =>
            updateRules(
              localRules.map((item, position) =>
                position === index ? { ...item, [key]: event.target.value } : item,
              ),
            ),
        });
      return [
        [
          input('description', '内容'),
          input('target', '作用对象'),
          h(
            'select',
            {
              'aria-label': `约束${index + 1} 强度`,
              value: rule.strength,
              onChange: (event) =>
                updateRules(
                  localRules.map((item, position) =>
                    position === index ? { ...item, strength: event.target.value } : item,
                  ),
                ),
            },
            h('option', { value: '硬' }, '硬'),
            h('option', { value: '软' }, '软'),
          ),
          input('until', '生效至', 'date'),
          '本地草稿 · 未参与计算',
          h(
            'button',
            {
              'aria-label': `删除约束${index + 1}`,
              onClick: () => updateRules(localRules.filter((_, position) => position !== index)),
            },
            '删除',
          ),
        ],
      ];
    });
    return h(
      'section',
      { className: 'wf-page', 'aria-label': titles[step] },
      h(
        'div',
        { className: 'wf-scope' },
        h('strong', null, `${draft.name} · ${draft.month}`),
        h('span', null, `发货所属月 ${result.shipmentMonth}`),
      ),
      filterBar,
      step === 'process'
        ? h(
            react.Fragment,
            null,
            card(
              '大类需求',
              table(
                '大类需求',
                ['月份', '大类', '需求数量', '未评估原因'],
                categoryRows.map((row) => [
                  row.month,
                  row.category,
                  numberText(row.quantity),
                  row.missing.join('、') || '已计算',
                ]),
              ),
            ),
            card(
              '基地单品需求拆分',
              h(react.Fragment, null, rowsTable('基地单品需求拆分', processFields), footer),
              h(
                'button',
                { onClick: () => exportRows('需求拆分', processFields, true) },
                '下载需求拆分',
              ),
            ),
          )
        : step === 'constraints'
          ? h(
              react.Fragment,
              null,
              card(
                '安全天数',
                table('本地安全天数', ['基地', '安全天数', '来源', '未评估原因'], constraintRows),
              ),
              card(
                '本地约束',
                table(
                  '本地约束',
                  ['约束内容', '作用对象', '强度', '生效至', '状态', '操作'],
                  ruleRows,
                ),
                h(
                  'button',
                  {
                    onClick: () =>
                      updateRules([
                        ...localRules,
                        { description: '', target: '', strength: '硬', until: '' },
                      ]),
                  },
                  '新增本地约束',
                ),
              ),
              card(
                '正式约束来源',
                table(
                  '正式约束来源',
                  ['项目', '正式来源', '状态'],
                  [
                    ['安全天数', '—', '正式来源未就绪'],
                    ['约束规则', '—', '正式来源未就绪'],
                  ],
                ),
                h('button', { disabled: true }, '保存正式配置'),
              ),
              h(
                'button',
                {
                  onClick: () =>
                    downloadCsv(
                      `${draft.month}-本地约束.csv`,
                      [
                        '评估版本',
                        '评估月份',
                        '基地',
                        '安全天数',
                        '约束内容',
                        '作用对象',
                        '强度',
                        '生效至',
                        '来源',
                        '状态',
                      ],
                      [
                        ...result.constraints.safetyDays.map((row) => ({
                          评估版本: draft.name,
                          评估月份: draft.month,
                          基地: row.base,
                          安全天数: row.days,
                          来源: '本地隔离草稿',
                        })),
                        ...localRules.map((rule) => ({
                          评估版本: draft.name,
                          评估月份: draft.month,
                          约束内容: rule.description,
                          作用对象: rule.target,
                          强度: rule.strength,
                          生效至: rule.until,
                          来源: '本地隔离草稿',
                          状态: '未参与计算',
                        })),
                      ],
                    ),
                },
                '下载本地配置',
              ),
            )
          : h(
              react.Fragment,
              null,
              card(
                titles[step],
                h(
                  react.Fragment,
                  null,
                  rowsTable(step === 'report' ? '产销存报告' : '产能评估明细', planFields),
                  footer,
                ),
                h(
                  'button',
                  {
                    onClick: () =>
                      exportRows(step === 'report' ? '产销存报告' : '产能评估', planFields),
                  },
                  step === 'report' ? '下载产销存报告' : '下载产能评估',
                ),
              ),
              step === 'capacity'
                ? card(
                    '源产能候选',
                    table(
                      '源产能候选',
                      [
                        '月份',
                        '基地',
                        '产品编码',
                        '产线',
                        '标准日产/件',
                        '标准日产/吨',
                        '未评估原因',
                      ],
                      visible.flatMap((row) =>
                        row.capacities.map((item) => [
                          row.month,
                          row.base,
                          row.code,
                          display(item.line),
                          numberText(item.dailyPieces),
                          numberText(item.dailyTons),
                          item.missing.join('、') || '源值；月产能规则待确认',
                        ]),
                      ),
                    ),
                  )
                : card(
                    '报告来源',
                    table(
                      '报告来源',
                      ['来源', '状态'],
                      [
                        ['①需求确认', '大类需求与缺项随当前版本重算'],
                        ['②本月预估发货', `${result.shipmentMonth}月末结存，缺数留空`],
                        ['③需求加工与收敛', '同月同大类两占比平均拆分'],
                        [
                          '④主数据对应关系',
                          relations?.sources ? '已接当前关系结果' : '关系尚未读取',
                        ],
                        ['⑤约束与配置', '本地隔离草稿；正式保存未就绪'],
                        ['⑥产能评估与缺口', '未裁定规则留空'],
                      ],
                    ),
                  ),
            ),
      result.missing.length
        ? h('div', { className: 'wf-limitations', role: 'status' }, result.missing.join('；'))
        : null,
      h(
        'div',
        { className: 'wf-actions' },
        step !== 'report'
          ? h('button', { className: 'dc-primary', onClick: onNext }, `下一步：${next}`)
          : h('button', { disabled: true }, '保存正式报告'),
      ),
      formula
        ? h(
            Dialog,
            { title: formula.title, close: () => setFormula(null) },
            h('p', null, formula.expression || '当前输入源值'),
            h(
              'p',
              { className: formula.missing.length ? 'wf-unavailable' : undefined },
              `${formula.value == null ? '未评估' : `结果：${formula.value}`}`,
            ),
          )
        : null,
    );
  };
}
