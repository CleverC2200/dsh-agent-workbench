/** Browser-only counterpart of the original commerce policy guard. No inferred discounts. */
export function applicablePolicies(
  policies: any[],
  customerCode: string,
  sku: string,
  pickupCode: string,
  now = new Date(),
) {
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const active = (p: any) =>
    (!p.start || p.start <= date) && (!p.end || p.end >= date);
  return policies.filter(
    (p) =>
      !p.mock &&
      p.customerCode === customerCode &&
      active(p) &&
      pickupCode &&
      Array.isArray(p.verifiedPickupCodes) &&
      p.verifiedPickupCodes.includes(pickupCode) &&
      p.scopes?.some(
        (scope: any) =>
          scope.productCode === sku &&
          active(scope) &&
          (Array.isArray(scope.verifiedPickupCodes)
            ? scope.verifiedPickupCodes.includes(pickupCode)
            : scope.pickupCode === pickupCode),
      ),
  );
}
export function orderTotals(rows: any[]) {
  const quantity = rows.reduce(
    (total, r) => total + (Number.isFinite(r.quantity) ? r.quantity : 0),
    0,
  );
  const priceComplete =
    rows.length > 0 &&
    rows.every(
      (r) =>
        typeof r.unitPrice === "number" &&
        Number.isFinite(r.unitPrice) &&
        r.unitPrice >= 0,
    );
  return {
    count: rows.length,
    quantity,
    amount: priceComplete
      ? rows.reduce((sum, r) => sum + r.unitPrice * r.quantity, 0)
      : null,
  };
}
