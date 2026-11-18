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
  await expect(frame.getByLabel('评估月份选择', { exact: true })).toBeVisible();
}

export async function seedNoExistingMovements(frame, rows) {
  const page = frame.locator('body').page();
  await page.evaluate(async (rows) => {
    const seed = structuredClone(window.readView());
    const state = seed.localDrafts;
    const draft = state.drafts.find((row) => row.id === state.selected);
    draft.inventoryMovements = rows.map((row) => ({
      ...row,
      productionInbound: 0,
      inTransitInbound: 0,
      transferIn: 0,
      transferOut: 0,
      source: '既有计划核对夹具',
      reason: '明确确认当前期间无既有库存变动',
      at: '2026-11-17T00:00:00.000Z',
    }));
    await window.openAuthor('mps', 1200, seed);
  }, rows);
  await expect(frame.getByLabel('评估月份选择', { exact: true })).toBeVisible();
}
