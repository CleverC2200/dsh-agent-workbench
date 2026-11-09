export async function commitNumber(input, value) {
  await input.fill(value);
  await input.press('Enter');
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
