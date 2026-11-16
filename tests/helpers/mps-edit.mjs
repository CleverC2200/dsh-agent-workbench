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

export async function selectAdjustmentReason(view, reason) {
  const choices = ['销售变化', '促销活动', '库存调整', '供应变化', '数据纠错', '其他'];
  await view
    .getByLabel('批量调整原因', { exact: true })
    .selectOption(choices.includes(reason) ? reason : '其他');
  if (!choices.includes(reason))
    await view.getByLabel('其他原因说明', { exact: true }).fill(reason);
}

export async function adjustLeaf(frame, { category, group, code, base, month }, value, reason) {
  await workflowStep(frame, '需求加工与收敛');
  const view = frame.getByRole('region', { name: '需求加工与收敛', exact: true });
  await view.getByLabel('搜索当前步骤', { exact: true }).fill(code);
  await beginAdjustment(view);
  await view
    .getByLabel(`${category} ${group} ${code} ${base} ${month} 需求数量`, { exact: true })
    .fill(String(value));
  await selectAdjustmentReason(view, reason);
  await saveAdjustment(view);
  await view.getByLabel('搜索当前步骤', { exact: true }).fill('');
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
