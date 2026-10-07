/** No internal service calls or credentials may enter an HTML plugin. */
export type SapPricingResult = {
  ok: boolean;
  data: { prices: Array<{ materialCode: string; price: number }> } | null;
  _error: { code: string; message: string; retryable: false };
};
export async function loadDealerSapPrices(
  _customer: string,
  _materials: string[],
  _options: { signal?: AbortSignal; traceId?: string } = {},
): Promise<SapPricingResult> {
  return {
    ok: false,
    data: null,
    _error: {
      code: "GEA_CAPABILITY_PENDING",
      message: "SAP 定价尚未接入 GEA 公共能力；价格未知",
      retryable: false,
    },
  };
}
