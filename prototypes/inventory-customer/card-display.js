export function customerCardStatusLabel(status, originalLabel) {
  return status === 'unassessed' ? '当前范围' : originalLabel;
}
