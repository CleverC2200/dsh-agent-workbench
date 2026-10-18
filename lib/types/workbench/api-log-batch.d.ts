import React from 'react';
import type { ApiLogSnapshot } from './api-log-contract.ts';
export type ApiLogRpc = <T>(endpoint: string, payload?: object, signal?: AbortSignal) => Promise<T>;
export declare function ApiLogBatchPanel({ snapshot, selected, request, onBusy, onLogs, onError, pageSignal, }: {
    snapshot: ApiLogSnapshot | undefined;
    selected: string[];
    request: ApiLogRpc;
    onBusy(value: boolean): void;
    onLogs(id?: string): void;
    onError(reason: string): void;
    pageSignal: AbortSignal;
}): React.JSX.Element;
