/** 供复制的工作台和 Host 适配器共用的 HTTP 错误分类。 */
export declare class BackendHttpError extends Error {
    readonly status: number;
    /** 来自后端 `ErrorResponse.code` 的机器可读错误码；解析失败时为 `''`。 */
    readonly code: string;
    /** 来自 `ErrorResponse.error` 的后端可读消息；解析失败时为原始响应体。 */
    readonly backendMessage: string;
    /** 存在时，保存来自 `ErrorResponse.details` 的结构化后端元数据。 */
    readonly details: unknown;
    /** 解析后的原始响应体（JSON 响应为对象，文本或非 JSON 响应为字符串）。 */
    readonly body: unknown;
    constructor(params: {
        method: string;
        path: string;
        status: number;
        body: unknown;
    });
}
export declare function isBackendHttpError(error: unknown): error is BackendHttpError;
