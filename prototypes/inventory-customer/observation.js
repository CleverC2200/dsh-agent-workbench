/** A page observation is not an immutable upstream database snapshot. */
export function customerObservationNotice(value) {
  const total = value.summary?.customerCodes?.length ?? 0;
  const filtered = value.totalFilteredRows ?? total;
  return {
    filtered: filtered !== total,
    text: '顶部卡片统计范围不随下方列表筛选变化。',
  };
}

export function customerObservationChange(previous, current) {
  return previous && previous.scope === current.scope && previous.at !== current.at &&
    Number.isFinite(previous.quantity) && Number.isFinite(current.quantity) &&
    previous.quantity !== current.quantity
    ? `数据已刷新：大日期数量由 ${previous.quantity} 箱变为 ${current.quantity} 箱（上次接收 ${previous.at}）。`
    : '';
}

export function showCustomerObservation(value, capturedAt, document, change) {
  const cards = document.querySelector('.metric-section');
  if (!cards) return;
  let notice = cards.querySelector('.customer-observation-notice');
  if (!notice) {
    notice = document.createElement('div');
    notice.className = 'customer-observation-notice';
    notice.setAttribute('role', 'note');
    cards.append(notice);
  }
  const state = customerObservationNotice(value, capturedAt, change);
  notice.textContent = state.text;
  notice.style.cssText = '';
}
