type AdviceStatus = 'ready' | 'idle' | 'loading' | 'partial' | 'noAnswer' | 'noModel' | 'toolsRequired' | 'failed' | 'timeout' | 'unavailable' | 'invalidResponse' | 'authentication' | 'rateLimited';
export type SalesPlanAdviceState = {
    key: string;
    status: AdviceStatus;
    answers: Record<string, string>;
    completed: number;
    total: number;
};
/** 无状态推理：每批五行、同时运行两批，不创建聊天 Session。 */
export declare const useSalesPlanAdvice: (scope: string | undefined, prompt: string) => {
    state: SalesPlanAdviceState;
    retry: () => void;
};
export {};
