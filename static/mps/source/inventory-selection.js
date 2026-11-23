import { mpsBusinessDate } from './business-date.js';

const businessDay = (today) =>
  typeof today === 'string'
    ? today
    : new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' }).format(today);

export function defaultInventoryMonth(today = mpsBusinessDate()) {
  const day = businessDay(today);
  const [year, month] = day.slice(0, 7).split('-').map(Number);
  const offset = month - 1 + (Number(day.slice(8, 10)) > 20 ? 1 : 0);
  return `${year + Math.floor(offset / 12)}-${String((offset % 12) + 1).padStart(2, '0')}`;
}

export function inventoryVersionOrder(_month, today = mpsBusinessDate()) {
  return Number(businessDay(today).slice(8, 10)) > 20 ? ['月初', '滚动'] : ['纠偏', '月初'];
}

export function selectedInventoryMonth(draft) {
  return draft.inventoryTargetsRead?.status === 'ready'
    ? (draft.inventoryTargetsRead.metadata?.start_month ?? draft.month)
    : defaultInventoryMonth();
}

export function selectedInventoryBusinessDate(draft) {
  return (
    draft.inventoryTargetsRead?.metadata?.businessDate ??
    (draft.inventoryTargetsRead?.metadata?.readAt
      ? businessDay(new Date(draft.inventoryTargetsRead.metadata.readAt))
      : mpsBusinessDate())
  );
}
