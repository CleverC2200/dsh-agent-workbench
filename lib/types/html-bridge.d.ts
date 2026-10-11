import type { PageExecutionConnection, WorkbenchPageExecution } from './frame.ts';
/** One owned HTML port/lease. Switching identity or reference destroys this exact connection. */
export declare function connectHtmlFrame(frame: HTMLIFrameElement, connection: PageExecutionConnection, execution: WorkbenchPageExecution, theme: () => {
    active: {
        colorScheme: string;
        tokens: Record<string, string>;
    };
    fontSize: number;
}, signal: AbortSignal, failed: (error: unknown) => void): {
    (): void;
    sendTheme(): void;
};
