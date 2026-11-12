const monthOf = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

export function defaultInventoryMonth(today = new Date()) {
  const date = new Date(today.getFullYear(), today.getMonth(), 1);
  if (today.getDate() > 20) date.setMonth(date.getMonth() + 1);
  return monthOf(date);
}

export function inventoryVersionOrder(month, today = new Date()) {
  return month > monthOf(today) ? ['月初', '滚动'] : ['纠偏', '月初'];
}

export function selectedInventoryMonth(draft) {
  return draft.inventoryTargetsRead?.status === 'ready'
    ? (draft.inventoryTargetsRead.metadata?.start_month ?? draft.month)
    : draft.month;
}
