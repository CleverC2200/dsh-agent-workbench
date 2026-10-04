/** 向中心文档提供 DSH Session 身份，但不导入 AionUi 聊天能力。 */
import React from 'react';
export interface WorkbenchSession {
    conversationId: string | null;
    startAnalysis?: () => void;
    preparingAnalysis?: boolean;
}
/** 传递真实绑定的 DSH Session ID；工作台不会创建会话。 */
export declare function WorkbenchSessionProvider({ value, children }: React.PropsWithChildren<{
    value: WorkbenchSession;
}>): React.JSX.Element;
/** 供原工作台上下文发布器兼容使用的 Hook。 */
export declare function useBusinessSurfaceSession(): WorkbenchSession;
