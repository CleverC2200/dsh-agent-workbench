export async function commitNumber(input, value) {
  await input.fill(value);
  await input.press('Enter');
}
export async function openCategoryCalculation(frame) {
  const fold = frame.locator('details.dc-calculation-evidence');
  if (!(await fold.evaluate((element) => element.open)))
    await fold.locator('summary').first().click();
}
