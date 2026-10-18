type HtmlAction = {
    name: 'refresh' | 'filter' | 'draft';
    description: string;
};
type Invocation = {
    type: 'invoke';
    id: string;
    name: HtmlAction['name'];
    arguments: unknown;
};
type Pending = {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
};
type HtmlSession = {
    plugin: string;
    session: string;
    context: Record<string, unknown> | null;
    actions: HtmlAction[];
    queue: Invocation[];
    pending: Map<string, Pending>;
    expires: number;
};
/** The Workbench owner token indexes page actions; destruction rejects its pending calls. */
export declare function createHtmlSessions(): {
    open(plugin: string, session: string, lease: string): string;
    syncContext(lease: string, context: HtmlSession["context"]): void;
    registerAction(lease: string, name: unknown, description: unknown): void;
    consume(lease: string): Invocation[];
    close: (key: string) => void;
    clear(): void;
    invoke(plugin: string, session: string, name: string, args: unknown, signal: AbortSignal): Promise<unknown>;
    reply(lease: string, message: {
        id: string;
        error?: unknown;
        result?: unknown;
    }): void;
};
export {};
