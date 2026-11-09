export async function commitNumber(input, value) {
  const frame = input.page().frameLocator('iframe');
  await beginAdjustment(frame);
  await input.fill(value);
  await saveAdjustment(frame);
}
export async function openCategoryCalculation(frame) {
  const fold = frame.locator('details.dc-calculation-evidence');
  if (!(await fold.evaluate((element) => element.open)))
    await fold.locator('summary').first().click();
}

export async function adjustCategory(frame, category, month, value, reason) {
  const matrix = frame.getByRole('region', { name: '大类预估需求数量', exact: true });
  await matrix.getByRole('button', { name: '调整', exact: true }).click();
  await matrix.getByLabel(`${category} ${month} 需求数量`, { exact: true }).fill(value);
  await matrix.getByLabel('批量调整原因', { exact: true }).fill(reason);
  await matrix.getByRole('button', { name: '保存调整', exact: true }).click();
}

export async function beginAdjustment(view) {
  if (!(await view.getByRole('button', { name: '保存调整', exact: true }).count()))
    await view.getByRole('button', { name: '调整', exact: true }).click();
}
export async function saveAdjustment(view) {
  const save = view.getByRole('button', { name: '保存调整', exact: true });
  if (await save.count()) await save.click();
}
export async function expectNumber(locator, expected) {
  const { expect } = await import('@playwright/test');
  await expect
    .poll(async () =>
      locator.evaluate((element) =>
        'value' in element
          ? element.value
          : element.textContent
              .trim()
              .replaceAll(',', '')
              .replace(/^(待定|待补|未填写)$/, ''),
      ),
    )
    .toBe(expected);
}
export async function workflowStep(frame, name) {
  await saveAdjustment(frame);
  await frame.locator('.ap-page-tab').filter({ hasText: name }).click();
}
