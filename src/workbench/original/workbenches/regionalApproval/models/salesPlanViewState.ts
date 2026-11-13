export type SalesPlanViewState = {
  liveInputs?: Record<string, Record<string, string>>;
};
export const liveInputKey = (
  sessionId: string,
  planId: string,
  versionId: string,
  role: string | undefined,
) => JSON.stringify([sessionId, planId, versionId, role ?? null]);
