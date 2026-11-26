export async function commitNumber(input, value) {
  const frame = input.page().frameLocator('iframe');
  await beginAdjustment(frame);
  await input.fill(value);
  await saveAdjustment(frame);
}
export async function openCategoryCalculation(frame) {
  const fold = frame.getByRole('region', { name: '逐月测算', exact: true }).locator('details');
  if (!(await fold.evaluate((element) => element.open)))
    await fold.locator('summary').first().click();
}

export async function selectAdjustmentReason(frame, reason) {
  const actions = frame.locator('.dc-adjustment-actions');
  const choices = ['销售变化', '促销活动', '库存调整', '供应变化', '数据纠错', '其他'];
  await actions
    .getByLabel('批量调整原因', { exact: true })
    .selectOption(choices.includes(reason) ? reason : '其他');
  if (!choices.includes(reason))
    await actions.getByLabel('其他原因说明', { exact: true }).fill(reason);
}

export async function adjustLeaf(frame, { category, group, code, base, month }, value, reason) {
  await workflowStep(frame, '需求加工与收敛');
  const view = frame.getByRole('region', { name: '需求加工与收敛', exact: true });
  await view.getByLabel('搜索当前步骤', { exact: true }).fill(code);
  await beginAdjustment(frame);
  await view
    .getByLabel(`${category} ${group} ${code} ${base} ${month} 需求数量`, { exact: true })
    .fill(String(value));
  await selectAdjustmentReason(frame, reason);
  await saveAdjustment(frame);
  await view.getByLabel('搜索当前步骤', { exact: true }).fill('');
}

export async function beginAdjustment(frame) {
  const actions = frame.locator('.dc-adjustment-actions');
  if (!(await actions.getByRole('button', { name: '保存调整', exact: true }).count()))
    await actions.getByRole('button', { name: '调整', exact: true }).click();
}
export async function saveAdjustment(frame) {
  const save = frame
    .locator('.dc-adjustment-actions')
    .getByRole('button', { name: '保存调整', exact: true });
  if (await save.count()) await save.click();
}
export async function fillTurnoverDays(frame, view, base, value) {
  const { expect } = await import('@playwright/test');
  await beginAdjustment(frame);
  const fields = view.getByRole('textbox', { name: new RegExp(`^${base} .+ 补充目标周转天数$`) });
  await expect(fields).not.toHaveCount(0);
  for (const field of await fields.all()) await field.fill(value);
  await saveAdjustment(frame);
  await beginAdjustment(frame);
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
