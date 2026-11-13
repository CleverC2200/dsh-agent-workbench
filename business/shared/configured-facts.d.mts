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

export function readBaseCurrentShortage(
  config: unknown,
  queryId: string,
  values: Record<string, unknown>,
  options: {
    signal: AbortSignal;
    execute: (
      request: unknown,
      options: { queryId: string; values: Record<string, unknown> },
    ) => Promise<unknown>;
  },
): Promise<unknown>;

export function readBaseShortageSkuRanking(
  config: unknown,
  values: Record<string, unknown>,
  options: {
    signal: AbortSignal;
    execute: (
      request: unknown,
      options: { queryId: string; values: Record<string, unknown> },
    ) => Promise<unknown>;
  },
): Promise<unknown>;

export function readBaseInventoryMetrics(
  config: unknown,
  input: { asOf: string; base?: string; category?: string; compare: boolean },
  options: {
    signal: AbortSignal;
    execute: (
      request: unknown,
      options: { queryId: string; values: Record<string, unknown> },
    ) => Promise<unknown>;
  },
): Promise<unknown>;
