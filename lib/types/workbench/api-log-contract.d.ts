export type ApiReplayPolicy = 'safe' | 'idempotent' | 'blocked';
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
export type ApiLogContext = {
    source: 'daily' | 'replay' | 'api-batch' | 'permission';
    runId?: string;
    scenarioId?: string;
    stepId?: string;
};
export type ApiReplayResult = {
    outcome: 'replayed';
    recordId: string;
} | {
    outcome: 'failed' | 'cancelled';
    recordId: string;
    reason: string;
    resultUnknown: boolean;
} | {
    outcome: 'rejected';
    recordId: null;
    reason: string;
};
export type ApiLogRecord = ApiLogContext & {
    id: string;
    sequence: number;
    catalogId: string | null;
    catalogName: string;
    group: string;
    environment: string;
    startedAt: string;
    endedAt?: string;
    durationMs?: number;
    outcome: 'pending' | 'success' | 'error';
    replayPolicy: ApiReplayPolicy;
    replayAvailable: boolean;
    replayUnavailableReason?: string;
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
    error?: {
        name: string;
        message: string;
    };
};
export type ApiLogSnapshot = {
    revision: number;
    limit: number;
    catalog: ApiCatalogEntry[];
    records: ApiLogRecord[];
};
export type ApiBatchSelection = {
    catalogId: string;
    recordId: string | null;
};
export type ApiBatchRequest = {
    items: ApiBatchSelection[];
    confirmedWriteIds: string[];
};
export type ApiBatchItem = ApiBatchSelection & {
    status: 'queued' | 'running' | 'replayed' | 'failed' | 'skipped' | 'not-run' | 'cancelled';
    reason?: string;
    logRecordId?: string;
    resultUnknown?: boolean;
};
export type ApiBatchRun = {
    runId: string;
    source: 'api-batch';
    startedAt: string;
    endedAt?: string;
    status: 'running' | 'ended' | 'stopped';
    items: ApiBatchItem[];
};
