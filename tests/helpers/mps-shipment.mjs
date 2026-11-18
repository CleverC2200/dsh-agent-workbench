export async function expandShipmentBase(frame, base) {
  const table = frame.getByRole('table', { name: '本月预估发货明细' });
  const expand = table.getByRole('button', { name: `展开 ${base}`, exact: true });
  if (await expand.count()) await expand.press('Enter');
  const descendants = table.getByRole('button', { name: new RegExp(`^展开 ${base} `) });
  while (await descendants.count()) await descendants.first().press('Enter');
}
