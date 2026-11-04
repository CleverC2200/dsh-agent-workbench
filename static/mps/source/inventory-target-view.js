const text = (value) => (value == null ? '—' : String(value));
const number = (value) =>
  value == null ? '—' : new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 4 }).format(value);
const sources = {
  source: '月表计算',
  manual: '基地人工覆盖',
  rule: '库存下限规则',
  missing: '缺输入',
};
export function createInventoryTargetPanel(react, { downloadCsv }) {
  const h = react.createElement;
  return function InventoryTargetPanel({
    draft,
    result,
    update,
    sync,
    busy,
    table,
    card,
    overrideRows,
  }) {
    const [month, setMonth] = react.useState(draft.month);
    const [base, setBase] = react.useState('');
    const [search, setSearch] = react.useState('');
    const [page, setPage] = react.useState(0);
    const version = draft.constraints?.targetVersion ?? 'auto';
    const bases = [...new Set(result.rows.map((row) => row.base))].sort();
    const rows = result.rows.filter(
      (row) =>
        row.month === month &&
        (!base || row.base === base) &&
        (!search || [row.code, row.name].some((value) => value?.includes(search))),
    );
    const change = (setter) => (event) => {
      setter(event.target.value);
      setPage(0);
    };
    const read = draft.inventoryTargetsRead;
    const missing = result.rows.filter((row) => row.inventoryTarget.days === null).length;
    const fields = [
      '月份',
      '基地',
      '产品编码',
      '产品名称',
      '目标版本',
      '源最终目标库存',
      '源日均计划需求',
      '源目标周转天数',
      '有效安全天数',
      '天数来源',
      '推导目标库存',
      '源缺项',
    ];
    const values = (row) => [
      row.month,
      row.base,
      row.code,
      row.name,
      row.inventoryTarget.version,
      row.inventoryTarget.finalTarget,
      row.inventoryTarget.dailyDemand,
      row.inventoryTarget.days,
      row.safetyDays,
      sources[row.safetyDaysSource],
      row.targetInventory,
      row.inventoryTarget.missing.join('；'),
    ];
    return card(
      '基地与单品目标库存',
      h(
        react.Fragment,
        null,
        h(
          'div',
          { className: 'wf-actions' },
          h(
            'label',
            null,
            '目标库存版本 ',
            h(
              'select',
              {
                'aria-label': '目标库存版本',
                value: version,
                onChange: (event) => {
                  setPage(0);
                  update({
                    constraints: {
                      ...draft.constraints,
                      safetyDays: draft.constraints?.safetyDays ?? [],
                      rules: draft.constraints?.rules ?? { local: [] },
                      targetVersion: event.target.value,
                    },
                  });
                },
              },
              [
                ['auto', '自动：纠偏 → 月初 → 滚动'],
                ['纠偏', '纠偏版'],
                ['月初', '月初版'],
                ['滚动', '滚动版'],
              ].map(([value, title]) => h('option', { key: value, value }, title)),
            ),
          ),
          h('button', { onClick: sync, disabled: busy }, busy ? '读取目标库存中…' : '同步目标库存'),
          h(
            'button',
            {
              disabled: !rows.length,
              onClick: () =>
                downloadCsv(
                  '目标库存与周转天数',
                  fields,
                  rows.map((row) =>
                    Object.fromEntries(fields.map((field, index) => [field, values(row)[index]])),
                  ),
                ),
            },
            '下载目标库存明细',
          ),
        ),
        h(
          'p',
          { className: 'wf-note', role: 'status' },
          read?.status === 'ready'
            ? `来源：ai_db.agents_scm_goods_inventory_turnover_data_m；已读取${draft.inventoryTargets?.length ?? 0}条版本记录，当前计算范围有${missing}个基地单品月份缺源天数。`
            : read?.error ||
                (busy ? '正在读取目标库存，旧来源暂不参与计算。' : '目标库存尚未同步。'),
        ),
        h(
          'p',
          { className: 'wf-note' },
          '按基地、单品、月份和版本匹配；自动选版在同基地同月统一生效，缺单品不跨版本补齐。源目标周转天数＝最终目标库存÷日均计划需求；同键多行数值完整且一致时去重采用，不累加；数值冲突、日均需求为空或为0时保留缺项。',
        ),
        table(
          '目标库存来源汇总',
          [
            '基地',
            '月份',
            '有效版本',
            '已知目标库存',
            '已知日均计划需求',
            '已知配对周转天数',
            '源缺项单品',
            '推导库存缺项单品',
          ],
          bases.flatMap((base) =>
            result.months.slice(0, 3).map((month) => {
              const group = result.rows.filter((row) => row.base === base && row.month === month);
              const known = group.filter((row) => row.inventoryTarget.days !== null);
              const target = known.length
                ? known.reduce((sum, row) => sum + row.inventoryTarget.finalTarget, 0)
                : null;
              const daily = known.length
                ? known.reduce((sum, row) => sum + row.inventoryTarget.dailyDemand, 0)
                : null;
              return [
                base,
                month,
                [...new Set(group.map((row) => row.inventoryTarget.version).filter(Boolean))].join(
                  '、',
                ) || '—',
                number(target),
                number(daily),
                number(daily > 0 ? target / daily : null),
                group.length - known.length,
                group.filter((row) => row.targetInventory === null).length,
              ];
            }),
          ),
        ),
        h(
          'p',
          { className: 'wf-note' },
          '汇总只统计分子、分母有效配对的单品，周转天数按合计目标库存÷合计日均需求计算。推导目标库存＝有效安全天数×下月需求÷下月自然日天数。',
        ),
        h(
          'div',
          { className: 'wf-actions' },
          h(
            'label',
            null,
            '明细月份 ',
            h(
              'select',
              { 'aria-label': '目标明细月份', value: month, onChange: change(setMonth) },
              result.months
                .slice(0, 3)
                .map((month) => h('option', { key: month, value: month }, month)),
            ),
          ),
          h(
            'label',
            null,
            '基地 ',
            h(
              'select',
              { 'aria-label': '目标明细基地', value: base, onChange: change(setBase) },
              [['', '全部基地'], ...bases.map((base) => [base, base])].map(([value, name]) =>
                h('option', { key: value, value }, name),
              ),
            ),
          ),
          h('input', {
            'aria-label': '搜索目标单品',
            placeholder: '搜索物料编码或名称',
            value: search,
            onChange: change(setSearch),
          }),
        ),
        table(
          '目标库存单品明细',
          fields,
          rows
            .slice(page * 25, (page + 1) * 25)
            .map((row) =>
              values(row).map((value, index) =>
                (index >= 5 && index <= 8) || index === 10 ? number(value) : text(value),
              ),
            ),
        ),
        h(
          'div',
          { className: 'wf-actions' },
          h('span', null, `共${rows.length}条，第${page + 1}页，每页25条`),
          h('button', { disabled: page === 0, onClick: () => setPage(page - 1) }, '上一页目标明细'),
          h(
            'button',
            { disabled: (page + 1) * 25 >= rows.length, onClick: () => setPage(page + 1) },
            '下一页目标明细',
          ),
        ),
        h(
          'details',
          null,
          h('summary', null, '基地人工覆盖（可选）'),
          h(
            'p',
            { className: 'wf-note' },
            '留空时使用各单品源目标周转天数。填值将覆盖该基地当前评估各月的安全天数，库存下限规则仍有效；不会改写源月表。单品特例可在约束列表维护。',
          ),
          table('本地安全天数', ['基地', '人工覆盖天数', '来源', '计算口径'], overrideRows),
        ),
      ),
    );
  };
}
