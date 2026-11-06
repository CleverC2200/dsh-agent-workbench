import { inventoryVersionOrder } from './inventory-selection.js';

const number = (value) =>
  value == null ? '—' : new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 4 }).format(value);
export const turnoverDaysSources = {
  'target-turnover-days': '源最终目标周转天数',
  'manual-turnover-days': '人工补充目标周转天数',
  'missing-turnover-days-zero': '源天数待补，临时按0天',
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
    const [supplementPage, setSupplementPage] = react.useState(0);
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
      setSupplementPage(0);
    };
    const read = draft.inventoryTargetsRead;
    const missing = result.rows.filter((row) => row.safetyDays === null).length;
    const temporaryZero = result.rows.filter(
      (row) => row.safetyDaysSource === 'missing-turnover-days-zero',
    ).length;
    const policyBases = policyRows.map((row) => row[0]);
    const configured = policyBases.filter((base) => {
      const matches = result.constraints.safetyDays.filter((row) => row.base === base);
      return matches.length === 1 && Number.isFinite(matches[0].days) && matches[0].days >= 0;
    }).length;
    const supplementKey = (row) => JSON.stringify([row.base, row.code]);
    const supplements = new Map(
      (draft.constraints?.turnoverDays ?? []).map((row) => [supplementKey(row), row]),
    );
    const pending = [
      ...new Map(result.rows.map((row) => [supplementKey(row), row])).values(),
    ].filter(
      (row) =>
        row.turnoverPolicy.sourceDays === null &&
        (!base || row.base === base) &&
        (!search || [row.code, row.name].some((value) => value?.includes(search))),
    );
    const supplementIndex = Math.min(
      supplementPage,
      Math.max(0, Math.ceil(pending.length / 25) - 1),
    );
    const supplementRows = pending
      .slice(supplementIndex * 25, (supplementIndex + 1) * 25)
      .map((row) => [
        row.base,
        row.category,
        row.group,
        row.code,
        row.name,
        row.turnoverPolicy.missing.join('；'),
        h('input', {
          type: 'number',
          min: 0,
          max: Number.MAX_SAFE_INTEGER,
          step: 'any',
          'aria-label': `${row.base} ${row.code} 补充目标周转天数`,
          value: supplements.get(supplementKey(row))?.days ?? '',
          onChange: (event) => {
            const value = event.target.value;
            if (
              value !== '' &&
              (!Number.isFinite(Number(value)) ||
                Number(value) < 0 ||
                Number(value) > Number.MAX_SAFE_INTEGER)
            )
              return;
            update({
              constraints: {
                ...draft.constraints,
                safetyDays: draft.constraints?.safetyDays ?? [],
                rules: draft.constraints?.rules ?? { local: [] },
                turnoverDays: [
                  ...(draft.constraints?.turnoverDays ?? []).filter(
                    (item) => supplementKey(item) !== supplementKey(row),
                  ),
                  { base: row.base, code: row.code, days: value === '' ? null : Number(value) },
                ],
              },
            });
          },
        }),
        number(row.safetyDays),
        turnoverDaysSources[row.safetyDaysSource],
      ]);
    const fields = [
      '月份',
      '基地',
      '产品编码',
      '产品名称',
      '目标版本',
      '源最终目标库存',
      '源日均计划需求',
      '源库存除日均对照天数',
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
      '源最终目标周转天数',
      '周转天数来源月份',
      '周转天数来源版本',
      '本轮参与计算',
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
      turnoverDaysSources[row.safetyDaysSource],
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
      row.turnoverPolicy.sourceDays,
      row.turnoverPolicy.sourceMonths.join('、'),
      row.turnoverPolicy.sourceVersion,
      row.safetyDaysSource === 'missing-turnover-days-zero'
        ? '源天数待补，临时按0天参与；其他依赖另行核对'
        : row.safetyDays === null
          ? '暂不参与，补充后重新评估'
          : '天数已齐，其他依赖另行核对',
    ];
    const sourceColumns = [
      '月份',
      '基地',
      '产品编码',
      '目标版本',
      '源最终目标库存',
      '源日均计划需求',
      '源最终目标周转天数',
      '源记录数',
      '目标不同值数',
      '日均不同值数',
      '目标空值行',
      '日均空值行',
      '源冲突字段',
      '业务键核对',
    ];
    const evaluatedKeys = new Set(
      result.rows.map((row) => JSON.stringify([row.month, row.base, row.code])),
    );
    const sourceRows = (read?.status === 'ready' ? (draft.inventoryTargets ?? []) : []).map(
      (row) => ({
        月份: row.month,
        基地: row.base,
        产品编码: row.code,
        目标版本: row.version,
        源最终目标库存: row.finalTarget,
        源日均计划需求: row.dailyDemand,
        源最终目标周转天数: row.finalTurnoverDays,
        源记录数: row.sourceRows,
        目标不同值数: row.finalTargetValueCount,
        日均不同值数: row.dailyDemandValueCount,
        目标空值行: row.missingTargetRows,
        日均空值行: row.missingDailyRows,
        源冲突字段: row.conflictFields?.join('；'),
        业务键核对: evaluatedKeys.has(JSON.stringify([row.month, row.base, row.code]))
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
          busy
            ? '正在读取目标库存…'
            : `基地安全天数已维护${configured}/${policyBases.length}个基地；${missing}个单品月份缺有效天数，${temporaryZero}个单品月份缺源天数、临时按0天计算。`,
        ),
        read?.status === 'failed' &&
          h('p', { role: 'alert' }, read.error || '目标库存读取失败，请重试'),
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
                ['auto', `自动：${inventoryVersionOrder(draft.month).join(' → ')}`],
                ['纠偏', '纠偏版'],
                ['月初', '月初版'],
                ['滚动', '滚动版'],
              ].map(([value, title]) => h('option', { key: value, value }, title)),
            ),
          ),
          h('button', { onClick: sync, disabled: busy }, busy ? '读取目标库存中…' : '同步目标库存'),
        ),
        table(
          '基地安全天数策略',
          ['基地', '缺源时基地补充天数（天）', '维护状态', '适用范围'],
          policyRows,
        ),
        h(
          'p',
          { className: 'wf-note' },
          '缺源天数且无人工补充时暂按0天；源缺项保留，补齐后重新评估。',
        ),
        h(
          'div',
          { className: 'wf-actions' },
          h(
            'label',
            null,
            '月份 ',
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
        h('h3', { className: 'wf-target-heading' }, '目标周转天数待补'),
        h(
          'p',
          { className: 'wf-note' },
          `当前筛选有${pending.length}个基地SKU的源天数待核对或补充，具体原因见表；补充值对M+1至M+3共用，明确填0有效。`,
        ),
        table(
          '目标周转天数待补',
          [
            '基地',
            '大类',
            '物料组',
            '产品编码',
            '产品名称',
            '待补原因',
            '人工补充天数',
            '有效天数',
            '天数来源',
          ],
          supplementRows,
        ),
        pending.length > 25 &&
          h(
            'div',
            { className: 'wf-actions' },
            h(
              'button',
              {
                disabled: supplementIndex === 0,
                onClick: () => setSupplementPage(supplementIndex - 1),
              },
              '上一页待补天数',
            ),
            h('span', null, `第${supplementIndex + 1}页，共${pending.length}项`),
            h(
              'button',
              {
                disabled: (supplementIndex + 1) * 25 >= pending.length,
                onClick: () => setSupplementPage(supplementIndex + 1),
              },
              '下一页待补天数',
            ),
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
                days.length === 1 ? number(days[0]) : '按单品天数',
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
        h('p', { className: 'wf-note' }, '已知小计，缺项未计入。'),
        h(
          'div',
          { className: 'wf-actions' },
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
    );
  };
}
