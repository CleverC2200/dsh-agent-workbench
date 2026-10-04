/** The Workbench owner token indexes page actions; destruction rejects its pending calls. */
export declare function createHtmlSessions(onClose?: (plugin: string, session: string) => void): {
    open(plugin: string, session: string, access: any, lease: string): string;
    get(lease: string, plugin?: string): any;
    /** 这个会话当前有没有打开该插件的业务页面（模型读页面之前先问一次，避免直接抛错）。 */
    has(plugin: string, session: string): boolean;
    close: (key: string) => void;
    clear(): void;
    invoke(plugin: string, session: string, name: string, args: any, signal: AbortSignal): Promise<unknown>;
    reply(lease: string, message: any): void;
};
