import React from 'react';
type Rpc = <T>(endpoint: string, payload?: object, signal?: AbortSignal) => Promise<T>;
type Props = {
    environment: 'production' | 'test';
    onClose(): void;
    request: Rpc;
};
export declare function ApiLogCenter({ environment, onClose, request }: Props): React.JSX.Element;
export {};
