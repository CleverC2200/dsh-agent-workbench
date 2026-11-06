const kinds = {
  'inventory-days': ['库存下限', '库存', '安全天数下限'],
  'resource-unavailable': ['资源停用', '产能', '停用资源'],
  'production-days': ['生产天数上限', '产能', '可用生产天数上限'],
  'self-only': ['必须自产', '工艺', '禁止委外'],
  'transfer-limit': ['调拨上限', '调拨', '单月调拨上限（吨）'],
  'cost-limit': ['代工成本上限', '成本', '成本增幅上限（%）'],
  'lead-days': ['新品提前期', '业务', '提前期下限（天）'],
};
const statuses = {
  applied: '已参与计算',
  met: '满足约束',
  conflict: '存在冲突',
  warning: '待决策建议',
  pending: '待补计算输入',
  draft: '待完善参数',
  disabled: '已停用',
  expired: '本版未生效',
};
const ruleId = (rule, index) => rule.id || `legacy-${index}`;
export function createConstraintPanel(react, { Dialog }) {
  const h = react.createElement;
  return function ConstraintPanel({
    draft,
    result,
    update,
    bases,
    table,
    card,
    previewRules,
    children,
  }) {
    const [hardOnly, setHardOnly] = react.useState(false);
    const [advancedOpen, setAdvancedOpen] = react.useState(false);
    const [editor, setEditor] = react.useState(null);
    const [error, setError] = react.useState('');
    const [proposal, setProposal] = react.useState(null);
    const rules = draft.constraints?.rules?.local ?? [];
    const evaluations = result.ruleEvaluations ?? [];
    const priority = [
      'conflict',
      'draft',
      'pending',
      'warning',
      'applied',
      'met',
      'expired',
      'disabled',
    ];
    const state = (rule, index) => {
      const rows = evaluations.filter((row) => row.ruleId === ruleId(rule, index));
      return priority.find((status) => rows.some((row) => row.status === status)) || 'draft';
    };
    const saveRules = (next, rule, action) =>
      update({
        constraints: {
          ...draft.constraints,
          safetyDays: draft.constraints?.safetyDays ?? [],
          rules: {
            ...draft.constraints?.rules,
            local: next,
            history: [
              ...(draft.constraints?.rules?.history ?? []),
              {
                at: new Date().toISOString(),
                ruleId: rule.id,
                description: rule.description,
                action,
              },
            ],
          },
        },
      });
    const edit = (rule, index) => {
      setError('');
      setEditor({
        index,
        rule: {
          ...rule,
          id: ruleId(rule, index),
          effect: rule.effect ? { ...rule.effect } : { kind: 'inventory-days', value: null },
        },
      });
    };
    const toggle = (rule, index, enabled) => {
      const next = { ...rule, id: ruleId(rule, index), enabled };
      saveRules(
        rules.map((item, position) => (position === index ? next : item)),
        next,
        enabled ? '启用' : '停用',
      );
    };
    const conflicts = evaluations.filter((row) =>
      ['conflict', 'warning', 'pending', 'draft'].includes(row.status),
    );
    const ruleOf = (entry) => rules.find((rule, index) => ruleId(rule, index) === entry.ruleId);
    const summary = (values) => {
      const loads = values.resourceLoads ?? [];
      return loads.length && loads.every((row) => row.gapTons !== null)
        ? Math.max(
            ...result.months
              .slice(0, 3)
              .map((month) =>
                Math.max(
                  0,
                  ...['tunnel', 'forming'].map((kind) =>
                    loads
                      .filter((row) => row.month === month && row.kind === kind)
                      .reduce((sum, row) => sum + row.gapTons, 0),
                  ),
                ),
              ),
          )
        : null;
    };
    const preview = (entry) => {
      const index = rules.findIndex((rule, index) => ruleId(rule, index) === entry.ruleId);
      const alternative = previewRules(
        rules.map((rule, position) => (position === index ? { ...rule, enabled: false } : rule)),
      );
      setProposal({ entry, index, before: summary(result), after: summary(alternative) });
    };
    const controls = (rule, index) =>
      h(
        'div',
        { className: 'wf-rule-actions' },
        h(
          'button',
          { onClick: () => edit(rule, index), 'aria-label': `编辑约束${index + 1}` },
          '编辑',
        ),
        h(
          'button',
          {
            onClick: () => toggle(rule, index, rule.enabled === false),
            'aria-label': `${rule.enabled === false ? '启用' : '停用'}约束${index + 1}`,
          },
          rule.enabled === false ? '启用' : '停用',
        ),
        h(
          'button',
          {
            onClick: () =>
              saveRules(
                rules.filter((_, position) => position !== index),
                { ...rule, id: ruleId(rule, index) },
                '删除',
              ),
            'aria-label': `删除约束${index + 1}`,
          },
          '删除',
        ),
      );
    const patch = (values) => setEditor({ ...editor, rule: { ...editor.rule, ...values } });
    const field = (label, key, type = 'text') =>
      h(
        'label',
        null,
        label,
        h('input', {
          type,
          'aria-label': label,
          value: editor.rule[key] ?? '',
          onChange: (event) => patch({ [key]: event.target.value }),
        }),
      );
    const select = (label, value, options, change) =>
      h(
        'label',
        null,
        label,
        h(
          'select',
          { 'aria-label': label, value, onChange: (event) => change(event.target.value) },
          options.map(([value, name]) => h('option', { key: value, value }, name)),
        ),
      );
    return h(
      react.Fragment,
      null,
      card(
        '约束列表',
        h(
          react.Fragment,
          null,
          table(
            '约束列表',
            ['类别', '约束内容', '作用对象', '强度', '来源', '生效至', '计算状态', '操作'],
            rules.flatMap((rule, index) =>
              hardOnly && rule.strength !== '硬'
                ? []
                : [
                    [
                      rule.category || kinds[rule.effect?.kind]?.[1] || '待分类',
                      rule.description || '待填写',
                      rule.target || rule.base || '全部基地',
                      h(
                        'span',
                        { className: 'wf-rule-strength', 'data-strength': rule.strength },
                        `${rule.strength}约束`,
                      ),
                      rule.source || '品类计划维护',
                      rule.until || '长期',
                      h(
                        'span',
                        { className: 'wf-rule-status', 'data-status': state(rule, index) },
                        statuses[state(rule, index)],
                      ),
                      controls(rule, index),
                    ],
                  ],
            ),
          ),
          h(
            'p',
            { className: 'wf-note' },
            `${rules.filter((rule) => rule.enabled !== false).length}条启用；具体月份的应用结果及缺项见下方。`,
          ),
        ),
        h(
          'div',
          { className: 'wf-rule-actions' },
          h(
            'label',
            { className: 'wf-check' },
            h('input', {
              type: 'checkbox',
              checked: hardOnly,
              onChange: (event) => setHardOnly(event.target.checked),
            }),
            '仅看硬约束',
          ),
          h(
            'button',
            {
              className: 'dc-primary',
              onClick: () =>
                edit(
                  {
                    id: `${draft.id}-rule-${Date.now()}`,
                    description: '',
                    target: '全部基地',
                    category: '库存',
                    source: '品类计划维护',
                    strength: '硬',
                    from: draft.month,
                    until: '',
                    enabled: true,
                    base: '',
                    code: '',
                    productCategory: '',
                    effect: { kind: 'inventory-days', value: null },
                  },
                  rules.length,
                ),
            },
            '新增约束',
          ),
        ),
      ),
      children[0],
      evaluations.length > 0 &&
        card(
          '冲突与放宽建议',
          evaluations.length
            ? table(
                '规则计算结果',
                ['规则', '月份', '结果', '影响单品', '计算依据与缺项', '处理'],
                evaluations.map((entry) => {
                  const rule = ruleOf(entry);
                  return [
                    rule?.description || '待完善规则',
                    entry.month,
                    h(
                      'span',
                      { className: 'wf-rule-status', 'data-status': entry.status },
                      statuses[entry.status],
                    ),
                    entry.affected,
                    entry.reason,
                    rule && ['conflict', 'warning'].includes(entry.status)
                      ? h(
                          'div',
                          { className: 'wf-rule-actions' },
                          h('button', { onClick: () => preview(entry) }, '预览放宽'),
                          rule.strength === '软' &&
                            !rule.accepted &&
                            h(
                              'button',
                              {
                                onClick: () =>
                                  saveRules(
                                    rules.map((item) =>
                                      item === rule ? { ...item, accepted: true } : item,
                                    ),
                                    rule,
                                    '采用软约束',
                                  ),
                              },
                              '采用建议',
                            ),
                        )
                      : '—',
                  ];
                }),
              )
            : h('p', { className: 'wf-note' }, '暂无冲突或建议'),
          h(
            'span',
            { className: 'wf-note' },
            conflicts.length ? `${conflicts.length}项冲突、建议或待补输入` : '无待处理项',
          ),
        ),
      (draft.constraints?.rules?.history?.length ?? 0) > 0 &&
        h(
          'details',
          { className: 'dc-card wf-advanced' },
          h('summary', null, `约束变更记录（${draft.constraints?.rules?.history?.length ?? 0}条）`),
          table(
            '约束变更记录',
            ['时间', '约束内容', '操作'],
            [...(draft.constraints?.rules?.history ?? [])]
              .reverse()
              .slice(0, 50)
              .map((entry) => [entry.at, entry.description, entry.action]),
          ),
        ),
      h(
        'details',
        {
          className: 'dc-card wf-advanced',
          onToggle: (event) => {
            if (event.target === event.currentTarget) setAdvancedOpen(event.currentTarget.open);
          },
        },
        h('summary', null, '高级配置：生产日历、件吨系数与资源分配'),
        advancedOpen && h('div', { className: 'wf-advanced-body' }, children.slice(1)),
      ),
      editor &&
        h(
          Dialog,
          {
            title: editor.index < rules.length ? '编辑约束' : '新增约束',
            close: () => setEditor(null),
            footer: h(
              'button',
              {
                className: 'dc-primary',
                onClick: () => {
                  if (!editor.rule.description.trim()) {
                    setError('请填写约束内容');
                    return;
                  }
                  const rule = {
                    ...editor.rule,
                    accepted: editor.rule.strength === '软' ? false : editor.rule.accepted,
                    target: [
                      editor.rule.base || '全部基地',
                      editor.rule.code || editor.rule.productCategory,
                    ]
                      .filter(Boolean)
                      .join(' / '),
                  };
                  saveRules(
                    [...rules.filter((_, index) => index !== editor.index), rule],
                    rule,
                    editor.index < rules.length ? '修改' : '新增',
                  );
                  setEditor(null);
                },
              },
              '保存约束',
            ),
          },
          h(
            'div',
            { className: 'wf-rule-form' },
            select(
              '规则类型',
              editor.rule.effect.kind,
              Object.entries(kinds).map(([value, item]) => [value, item[0]]),
              (kind) =>
                patch({
                  category: kinds[kind][1],
                  accepted: false,
                  code: '',
                  productCategory: '',
                  effect:
                    kind === 'resource-unavailable'
                      ? { kind, resourceId: '' }
                      : kind === 'self-only'
                        ? { kind }
                        : { kind, value: null },
                }),
            ),
            field('约束内容', 'description'),
            select(
              '作用基地',
              editor.rule.base || '',
              [['', '全部基地'], ...bases.map((base) => [base, base])],
              (base) => patch({ base }),
            ),
            !['resource-unavailable', 'production-days'].includes(editor.rule.effect.kind) &&
              field('产品编码（留空为全部）', 'code'),
            !['resource-unavailable', 'production-days'].includes(editor.rule.effect.kind) &&
              field('生产品类（留空为全部）', 'productCategory'),
            editor.rule.effect.kind === 'resource-unavailable'
              ? select(
                  '停用资源',
                  editor.rule.effect.resourceId,
                  [
                    ['', '请选择资源'],
                    ...(draft.resources ?? [])
                      .filter((resource) => !editor.rule.base || resource.base === editor.rule.base)
                      .map((resource) => [
                        resource.id,
                        `${resource.base} / ${resource.name || resource.id}`,
                      ]),
                  ],
                  (resourceId) => patch({ effect: { kind: 'resource-unavailable', resourceId } }),
                )
              : editor.rule.effect.kind !== 'self-only' &&
                  h(
                    'label',
                    null,
                    kinds[editor.rule.effect.kind][2],
                    h('input', {
                      type: 'number',
                      min: 0,
                      'aria-label': '规则参数',
                      value: editor.rule.effect.value ?? '',
                      onChange: (event) =>
                        patch({
                          effect: {
                            ...editor.rule.effect,
                            value: event.target.value === '' ? null : Number(event.target.value),
                          },
                        }),
                    }),
                  ),
            select(
              '约束强度',
              editor.rule.strength,
              [
                ['硬', '硬约束'],
                ['软', '软约束'],
              ],
              (strength) => patch({ strength, accepted: false }),
            ),
            field('规则来源', 'source'),
            field('生效月份', 'from', 'month'),
            field('生效至（留空为长期）', 'until', 'month'),
            ['transfer-limit', 'cost-limit', 'lead-days', 'self-only'].includes(
              editor.rule.effect.kind,
            ) &&
              h(
                'fieldset',
                { className: 'wf-rule-evidence' },
                h('legend', null, '方案核对输入'),
                h(
                  'p',
                  { className: 'wf-note' },
                  '按当前规则作用对象填写每月方案值及来源。缺值不判定通过；此处不会自动生成调拨、外协或开工方案。',
                ),
                ...result.months.slice(0, 3).map((month) => {
                  const entry = editor.rule.observations?.find((row) => row.month === month);
                  const set = (changes) =>
                    patch({
                      observations: [
                        ...(editor.rule.observations ?? []).filter((row) => row.month !== month),
                        {
                          month,
                          value: entry?.value ?? null,
                          source: entry?.source ?? '',
                          ...changes,
                        },
                      ],
                    });
                  const unit = ['transfer-limit', 'self-only'].includes(editor.rule.effect.kind)
                    ? '吨'
                    : editor.rule.effect.kind === 'cost-limit'
                      ? '%'
                      : '天';
                  return h(
                    'div',
                    { key: month, className: 'wf-rule-form' },
                    h(
                      'label',
                      null,
                      `${month} ${unit}`,
                      h('input', {
                        type: 'number',
                        'aria-label': `${month} 方案核对值`,
                        value: entry?.value ?? '',
                        onChange: (event) =>
                          set({
                            value: event.target.value === '' ? null : Number(event.target.value),
                          }),
                      }),
                    ),
                    h(
                      'label',
                      null,
                      '数值来源或计算依据',
                      h('input', {
                        'aria-label': `${month} 核对来源`,
                        value: entry?.source ?? '',
                        onChange: (event) => set({ source: event.target.value }),
                      }),
                    ),
                  );
                }),
              ),
            error && h('p', { role: 'alert' }, error),
            h(
              'p',
              { className: 'wf-note' },
              '缺参数可保存草稿，但不会参与计算。调拨、成本与新品提前期需对应方案数据，缺输入时显示待校验。',
            ),
          ),
        ),
      proposal &&
        h(
          Dialog,
          {
            title: '放宽约束预览',
            close: () => setProposal(null),
            footer: h(
              'div',
              { className: 'wf-rule-actions' },
              h('button', { onClick: () => setProposal(null) }, '保留原约束'),
              h(
                'button',
                {
                  onClick: () => {
                    toggle(rules[proposal.index], proposal.index, false);
                    setProposal(null);
                  },
                },
                '停用该约束并重算',
              ),
            ),
          },
          h('p', null, ruleOf(proposal.entry)?.description),
          h(
            'p',
            null,
            proposal.before !== null && proposal.after !== null
              ? `本版各月最大资源缺口：${proposal.before.toFixed(2)}吨；停用此规则后：${proposal.after.toFixed(2)}吨。`
              : '当前资源分配或生产输入不完整，无法量化放宽收益。停用规则也不能证明计划已可执行。',
          ),
          h(
            'p',
            { className: 'wf-note' },
            '预览不修改配置。采用后仅停用这条规则并记录变更，需求量保持不变。',
          ),
        ),
    );
  };
}
