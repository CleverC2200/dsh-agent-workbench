export function draftProblems(rows: any[]) {
  return rows.flatMap((row) => {
    const prefix = `${row.customerCode}/${row.code}`;
    if (
      !Number.isFinite(row.quantity) ||
      row.quantity <= 0 ||
      row.quantity > 1e9
    )
      return [prefix + "：数量须大于 0 且不超过 10 亿"];
    if (
      (row.source === "manual" || row.quantity < row.suggestedQuantity) &&
      !row.reason?.trim()
    )
      return [prefix + "：人工选品或调减建议量必须填写理由"];
    return [];
  });
}
export function makeDraft(
  row: any,
  customerCode: string,
  manual: boolean,
  now = new Date(),
) {
  if (
    !customerCode ||
    !row.code ||
    (row.dealerCode && row.dealerCode !== customerCode)
  )
    throw Error("请在对应客户明细中选品");
  if (
    !manual &&
    (!Number.isFinite(row.suggestedStockQty) || row.suggestedStockQty <= 0)
  )
    throw Error("建议量未核实，不能采纳");
  return {
    key: customerCode + ":" + row.code,
    customerCode,
    code: row.code,
    name: row.sku,
    quantity: manual ? 1 : row.suggestedStockQty,
    suggestedQuantity: row.suggestedStockQty ?? null,
    reason: "",
    evidence: row.liveReason,
    source: manual ? "manual" : "suggestion",
    status: "local-only",
    selectedAt: now.toISOString(),
  };
}
