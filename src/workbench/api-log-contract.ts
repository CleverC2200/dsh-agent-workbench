export type ApiReplayPolicy = "safe" | "idempotent" | "blocked";

export type ApiCatalogEntry = {
  id: string;
  group: string;
  name: string;
  method: string;
  path: string;
  description: string;
  requestFields: string[];
  replayPolicy: ApiReplayPolicy;
  replayNote: string;
};

export type ApiLogRecord = {
  id: string;
  sequence: number;
  catalogId: string | null;
  catalogName: string;
  group: string;
  environment: string;
  startedAt: string;
  endedAt?: string;
  durationMs?: number;
  outcome: "pending" | "success" | "error";
  replayPolicy: ApiReplayPolicy;
  replayAvailable: boolean;
  replayedFrom?: string;
  request: {
    method: string;
    url: string;
    path: string;
    query: Record<string, string>;
    headers: Record<string, string>;
    body: unknown;
  };
  response?: {
    status: number;
    statusText: string;
    headers: Record<string, string>;
    body: unknown;
  };
  error?: { name: string; message: string };
};

export type ApiLogSnapshot = {
  revision: number;
  limit: number;
  catalog: ApiCatalogEntry[];
  records: ApiLogRecord[];
};
