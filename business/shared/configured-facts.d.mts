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

/** Base shortage views follow the page's authorized daily snapshot without raw fallback. */
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

/** Base SKU ranking follows the authorized daily snapshot; no raw-order fallback. */
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

/** Shared base/orchestration monthly metrics; unknown coverage remains explicit. */
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
