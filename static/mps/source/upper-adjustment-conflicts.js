import { archiveUpperAdjustments, isLegacyQuantityAdjustment } from './local-draft.js';
export function createUpperAdjustmentConflicts(react) {
  const h = react.createElement;
  return function UpperAdjustmentConflicts({ draft, update }) {
    const state = draft.adjustments;
    const entries = [
      ...(state?.categoryDemand ?? []),
      ...(state?.quantities ?? []).filter(isLegacyQuantityAdjustment),
    ];
    if (!entries.length) return null;
    return h(
      'section',
      { 'aria-label': '历史上层修正冲突', className: 'dc-card' },
      h('h3', null, '历史上层修正冲突'),
      h(
        'p',
        { role: 'alert' },
        '旧版上层修正保留为历史记录。归档保留原数量、原因和时间，当前需求请在调整模式重新录入。',
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
