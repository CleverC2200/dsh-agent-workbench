/** Read the installed page's fixed facts through a Host-owned query executor. */
export function readConfiguredFacts(
  config: unknown,
  viewId: string,
  input: {
    asOf: string;
    cycleDays?: number;
    page?: number;
    pageSize?: number;
    filters?: Record<string, string>;
  },
  options: {
    signal: AbortSignal;
    execute: (
      request: unknown,
      options: { queryId: string; values: Record<string, unknown> },
    ) => Promise<unknown>;
    summaryOnly?: boolean;
    detailsOnly?: boolean;
  },
): Promise<unknown>;
