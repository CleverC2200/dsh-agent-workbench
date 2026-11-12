import { reconcileDemandAmounts } from './amount-reconciliation.js';

export function createAmountReconciliation(react, { downloadCsv }) {
  const h = react.createElement;
  return function AmountReconciliation({ draft, result, rows, filters, card, table }) {
    const amounts = reconcileDemandAmounts(draft, result, rows, filters);
    const columns = [
      '月份',
      '范围 / 大类',
      '月初计划金额',
      '最终计划金额',
      '生成需求金额',
      '差额',
      '覆盖情况',
    ];
    const value = (amount, known) => amount ?? (known !== null ? `${known}（已知小计）` : '待补');
    const exported = amounts.rows.map((row) => ({
      月份: row.month,
      '范围 / 大类': row.category,
      月初计划金额: row.initial.amount ?? row.initial.knownAmount ?? '',
      最终计划金额: row.final.amount ?? row.final.knownAmount ?? '',
      生成需求金额: row.generatedAmount ?? row.generatedKnown ?? '',
      差额: row.difference ?? '',
      覆盖情况: row.coverage,
      月初金额完整性: row.initial.amount !== null ? '完整' : '待补或已知小计',
      最终金额完整性: row.final.amount !== null ? '完整' : '待补或已知小计',
      生成金额完整性: row.generatedAmount !== null ? '完整' : '待补或已知小计',
      产品池覆盖: amounts.poolComplete ? '全国' : '范围内，全国覆盖未证明',
      提报金额来源状态:
        {
          ready: '已读取',
          loading: '读取中',
          failed: '读取失败',
          unconfigured: '未配置',
          unread: '未读取',
        }[amounts.status] ?? '未读取',
      来源说明: amounts.sourceError,
      未归属当前范围源金额条数: amounts.excluded.count,
      未归属月初金额已知小计: amounts.excluded.initial ?? '',
      未归属最终金额已知小计: amounts.excluded.final ?? '',
    }));
    return card(
      '需求金额对比',
      h(
        react.Fragment,
        null,
        h(
          'p',
          { className: 'wf-note' },
          `${amounts.month} · 单位：元。差额=生成需求金额−最终计划金额；逐SKU以有效需求乘未税到岸单价，汇总后保留两位。`,
        ),
        !amounts.poolComplete &&
          h(
            'p',
            { className: 'wf-note' },
            '生成金额仅覆盖当前产品池，全国覆盖尚未证明。源金额未匹配到需求时保留源金额并标明缺项。',
          ),
        amounts.sourceError &&
          h('p', { role: 'status', className: 'wf-note' }, amounts.sourceError),
        amounts.excluded.count > 0 &&
          h(
            'p',
            { className: 'wf-note' },
            `${amounts.excluded.count}条源金额无法归属当前筛选范围，未计入对比。月初、最终已知小计分别为${amounts.excluded.initial ?? '待补'}、${amounts.excluded.final ?? '待补'}元。`,
          ),
        table(
          '需求金额对比',
          columns,
          amounts.rows.map((row) => [
            row.month,
            row.category,
            value(row.initial.amount, row.initial.knownAmount),
            value(row.final.amount, row.final.knownAmount),
            value(row.generatedAmount, row.generatedKnown),
            row.difference ?? '待补',
            row.coverage,
          ]),
        ),
      ),
      h(
        'div',
        { className: 'wf-card-actions' },
        h('span', { className: 'dc-card-note' }, '缺项时保留已知小计，差额待补'),
        h(
          'button',
          {
            onClick: () =>
              downloadCsv(
                `${amounts.month}-需求金额对比.csv`,
                [
                  ...columns,
                  ...Object.keys(exported[0]).filter((column) => !columns.includes(column)),
                ],
                exported,
              ),
          },
          '下载金额对比',
        ),
      ),
    );
  };
}
