/** 向 Native 业务页面传递真实 Core Session 地址，不创建或管理 Session。 */
import React from 'react';
export interface WorkbenchSession {
    conversationId: string | null;
    startAnalysis?: () => void;
    preparingAnalysis?: boolean;
}
/** 传递真实绑定的 DSH Session ID；工作台不会创建会话。 */
export declare function WorkbenchSessionProvider({ value, children, }: React.PropsWithChildren<{
    value: WorkbenchSession;
}>): React.JSX.Element;
/** 当前业务页面通过此 Hook 读取已绑定的 Core Session 地址。 */
export declare function useBusinessSurfaceSession(): WorkbenchSession;
