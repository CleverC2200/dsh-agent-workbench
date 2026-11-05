const text = (value) => (value == null ? '—' : String(value));
const number = (value) =>
  value == null ? '—' : new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 4 }).format(value);
const sources = {
  'base-policy': '基地安全天数策略',
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
    policyRows,
  }) {
    const [month, setMonth] = react.useState(draft.month);
    const [base, setBase] = react.useState('');
    const [search, setSearch] = react.useState('');
    const [page, setPage] = react.useState(0);
    const [sourcePage, setSourcePage] = react.useState(0);
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
    const missing = result.rows.filter((row) => row.safetyDays === null).length;
    const policyBases = policyRows.map((row) => row[0]);
    const configured = policyBases.filter((base) => {
      const matches = result.constraints.safetyDays.filter((row) => row.base === base);
      return matches.length === 1 && Number.isFinite(matches[0].days) && matches[0].days >= 0;
    }).length;
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
      '源记录状态',
      '源缺项代码',
      '推导依赖缺项',
      '推导缺项代码',
      '基地策略安全天数',
      '下一月需求参考',
      '下月自然天数',
      '安全天数策略所属月',
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
      {
        valid: '有效',
        missing: '缺源记录或版本',
        invalid: '源数值无效',
        conflict: '源值冲突',
        'read-failed': '读取失败',
      }[row.inventoryTarget.status] ?? '待核对',
      row.inventoryTarget.missingCodes?.join('；'),
      row.missing.targetInventory?.join('；'),
      row.targetInventoryMissing?.join('；'),
      row.baseSafetyDays,
      row.nextMonthDemand,
      row.nextMonthDays,
      draft.month,
    ];
    const mainColumns = [
      '月份',
      '基地',
      '产品编码',
      '产品名称',
      '基地策略安全天数',
      '有效安全天数',
      '天数来源',
      '下一月需求参考',
      '下月自然天数',
      '推导目标库存',
      '推导依赖缺项',
    ];
    const numericColumns = new Set([
      '基地策略安全天数',
      '有效安全天数',
      '下一月需求参考',
      '下月自然天数',
      '推导目标库存',
    ]);
    const sourceColumns = [
      '月份',
      '基地',
      '产品编码',
      '目标版本',
      '源最终目标库存',
      '源日均计划需求',
      '源记录数',
      '目标不同值数',
      '日均不同值数',
      '目标空值行',
      '日均空值行',
      '源冲突字段',
      '业务键核对',
    ];
    const sourceRows = (read?.status === 'ready' ? (draft.inventoryTargets ?? []) : []).map(
      (row) => ({
        月份: row.month,
        基地: row.base,
        产品编码: row.code,
        目标版本: row.version,
        源最终目标库存: row.finalTarget,
        源日均计划需求: row.dailyDemand,
        源记录数: row.sourceRows,
        目标不同值数: row.finalTargetValueCount,
        日均不同值数: row.dailyDemandValueCount,
        目标空值行: row.missingTargetRows,
        日均空值行: row.missingDailyRows,
        源冲突字段: row.conflictFields?.join('；'),
        业务键核对: result.rows.some(
          (item) => item.month === row.month && item.base === row.base && item.code === row.code,
        )
          ? '月份、基地、SKU匹配；版本按当前规则选择'
          : '月份、基地或SKU不在当前评估明细，未参与计算',
      }),
    );
    return card(
      '基地与单品目标库存',
      h(
        react.Fragment,
        null,
        h(
          'p',
          { className: 'wf-note', role: 'status' },
          `基地安全天数已维护${configured}/${policyBases.length}个基地；当前${missing}个基地单品月份缺有效安全天数。`,
        ),
        table('基地安全天数策略', ['基地', '安全天数（天）', '维护状态', '适用范围'], policyRows),
        h(
          'p',
          { className: 'wf-note' },
          '安全天数按当前评估版本、基地维护，同一策略用于M+1至M+3。目标库存＝有效安全天数×下月需求÷下月自然天数。留空表示待维护，明确填0时目标库存为0；已采用的库存下限规则仍参与计算。',
        ),
        h(
          'div',
          { className: 'wf-actions' },
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
          h(
            'button',
            {
              disabled: !result.rows.length,
              onClick: () =>
                downloadCsv(
                  `${draft.month}-三个月完整目标库存`,
                  ['评估版本', ...fields],
                  result.rows.map((row) => ({
                    评估版本: draft.name,
                    ...Object.fromEntries(
                      fields.map((field, index) => [field, values(row)[index]]),
                    ),
                  })),
                ),
            },
            '下载三个月完整目标库存',
          ),
        ),
        table(
          '三个月目标库存汇总',
          [
            '基地',
            '月份',
            '有效安全天数',
            '下月需求已知小计',
            '下月自然天数',
            '推导目标库存已知小计',
            '缺下月需求单品',
            '推导库存缺项单品',
          ],
          bases.flatMap((base) =>
            result.months.slice(0, 3).map((month) => {
              const group = result.rows.filter((row) => row.base === base && row.month === month);
              const days = [...new Set(group.map((row) => row.safetyDays))];
              const demand = group.filter((row) => row.nextMonthDemand !== null);
              const targets = group.filter((row) => row.targetInventory !== null);
              return [
                base,
                month,
                days.length === 1 ? number(days[0]) : '按已采用规则，见单品明细',
                number(
                  demand.length ? demand.reduce((sum, row) => sum + row.nextMonthDemand, 0) : null,
                ),
                group[0]?.nextMonthDays ?? '—',
                number(
                  targets.length
                    ? targets.reduce((sum, row) => sum + row.targetInventory, 0)
                    : null,
                ),
                group.length - demand.length,
                group.filter((row) => row.targetInventory === null).length,
              ];
            }),
          ),
        ),
        h(
          'p',
          { className: 'wf-note' },
          '汇总为已知小计，缺项数量单列。M+1使用M+2需求，M+2使用M+3需求，M+3使用M+4大类及拆分系数形成的库存参考；M+4不生成第四个月排产。',
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
          mainColumns,
          rows.slice(page * 25, (page + 1) * 25).map((row) => {
            const record = Object.fromEntries(
              fields.map((field, index) => [field, values(row)[index]]),
            );
            return mainColumns.map((column) =>
              numericColumns.has(column) ? number(record[column]) : text(record[column]),
            );
          }),
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
          { className: 'wf-disclosure' },
          h('summary', null, `SKU源库存与周转天数对照（${sourceRows.length}条）`),
          h(
            'div',
            { className: 'wf-actions' },
            h(
              'label',
              null,
              '源库存版本 ',
              h(
                'select',
                {
                  'aria-label': '目标库存版本',
                  value: version,
                  onChange: (event) => {
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
            h(
              'button',
              { onClick: sync, disabled: busy },
              busy ? '读取目标库存中…' : '同步目标库存',
            ),
          ),
          h(
            'p',
            { className: 'wf-note', role: 'status' },
            read?.status === 'ready'
              ? `对照来源：ai_db.agents_scm_goods_inventory_turnover_data_m；已读取${draft.inventoryTargets?.length ?? 0}条版本记录。`
              : read?.error || (busy ? '正在读取SKU源库存对照。' : 'SKU源库存对照尚未同步。'),
          ),
          h(
            'p',
            { className: 'wf-note' },
            '源最终目标库存÷源日均需求是SKU周转天数，仅供对照，不代替基地安全天数策略。保留各月源记录、版本和缺项；后月没有源库存记录，不阻断已有基地策略计算目标库存。',
          ),
          table(
            '目标库存源记录',
            sourceColumns,
            sourceRows
              .slice(sourcePage * 25, (sourcePage + 1) * 25)
              .map((row) => sourceColumns.map((column) => text(row[column]))),
          ),
          h(
            'div',
            { className: 'wf-actions' },
            h('span', null, `共${sourceRows.length}条，第${sourcePage + 1}页`),
            h(
              'button',
              { disabled: sourcePage === 0, onClick: () => setSourcePage(sourcePage - 1) },
              '上一页目标源记录',
            ),
            h(
              'button',
              {
                disabled: (sourcePage + 1) * 25 >= sourceRows.length,
                onClick: () => setSourcePage(sourcePage + 1),
              },
              '下一页目标源记录',
            ),
            h(
              'button',
              {
                disabled: !sourceRows.length,
                onClick: () =>
                  downloadCsv(
                    `${draft.month}-目标库存完整源记录`,
                    ['评估版本', ...sourceColumns],
                    sourceRows.map((row) => ({ 评估版本: draft.name, ...row })),
                  ),
              },
              '下载完整目标源记录',
            ),
          ),
        ),
      ),
    );
  };
}
