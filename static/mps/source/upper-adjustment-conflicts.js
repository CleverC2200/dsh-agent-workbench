import { archiveUpperAdjustments } from './local-draft.js';
export function createUpperAdjustmentConflicts(react) {
  const h = react.createElement;
  return function UpperAdjustmentConflicts({ draft, update }) {
    const state = draft.adjustments;
    const entries = [
      ...(state?.categoryDemand ?? []),
      ...(state?.quantities ?? []).filter((row) => row.kind !== 'base-sku'),
    ];
    if (!entries.length) return null;
    return h(
      'section',
      { 'aria-label': '历史上层修正冲突', className: 'dc-card' },
      h('h3', null, '历史上层修正冲突'),
      h(
        'p',
        { role: 'alert' },
        '旧大类、物料组和全国SKU修正与当前基地SKU规则冲突，未参与计算。请归档原记录，再按基地SKU重新修正；归档保留原数量、原因和时间。',
      ),
      h(
        'ul',
        null,
        entries.map((entry, index) =>
          h(
            'li',
            { key: index },
            `${entry.month} ${entry.category} ${entry.group ?? ''} ${entry.code ?? ''}：${entry.quantity}，${entry.reason}，${entry.at}`,
          ),
        ),
      ),
      h(
        'button',
        { type: 'button', onClick: () => update({ adjustments: archiveUpperAdjustments(state) }) },
        '归档历史上层修正',
      ),
    );
  };
}
