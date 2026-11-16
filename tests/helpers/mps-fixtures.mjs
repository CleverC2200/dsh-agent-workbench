import { expect } from '@playwright/test';
export async function seedLeafQuantities(frame, rows) {
  const page = frame.locator('body').page();
  await page.evaluate(async (rows) => {
    const seed = structuredClone(window.readView());
    const state = seed.localDrafts;
    const draft = state.drafts.find((row) => row.id === state.selected);
    if (!draft) throw Error('Selected MPS fixture draft is missing');
    const key = (row) =>
      JSON.stringify([row.month, row.category, row.group, row.kind, row.code, row.base]);
    const entries = rows.map((row) => {
      if (
        !row.base ||
        !row.code ||
        !row.month ||
        !row.category ||
        !row.group ||
        !('systemValue' in row)
      )
        throw Error(
          'Leaf fixture requires base, SKU, month, category, group and explicit systemValue',
        );
      return {
        kind: 'base-sku',
        reason: '显式叶子输入夹具',
        at: '2026-11-16T00:00:00.000Z',
        ...row,
      };
    });
    const keys = new Set(entries.map(key));
    draft.adjustments.quantities = [
      ...draft.adjustments.quantities.filter((row) => !keys.has(key(row))),
      ...entries,
    ];
    await window.openAuthor('mps', 1200, seed);
  }, rows);
}

export async function seedNoTransferPlans(frame, rows) {
  const page = frame.locator('body').page();
  await expect
    .poll(() =>
      page.evaluate((rows) => {
        const state = window.readView()?.localDrafts;
        const draft = state?.drafts.find((row) => row.id === state.selected);
        return rows.every((input) =>
          draft?.shipment?.rows?.some((row) => row.base === input.base && row.code === input.code),
        );
      }, rows),
    )
    .toBe(true);
  await frame.locator('.ap-page-tab').filter({ hasText: '本月预估发货' }).click();
  await frame.getByRole('button', { name: '调整', exact: true }).press('Enter');
  await frame
    .getByRole('button', { name: '确认当前月份全部明细无调拨', exact: true })
    .press('Enter');
  await frame.getByRole('button', { name: '保存调整', exact: true }).press('Enter');
}
