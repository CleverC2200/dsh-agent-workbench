import React from 'react';
import type { Context } from '@deepseek-ai/cordis';
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client';
import type { SessionId } from '@deepseek-ai/dsh-session/types';
import type { WorkbenchController } from '../workbench.ts';
export declare function CompanyWelcome({ page, onFill }: {
    page?: string;
    onFill?: (text: string) => void;
}): React.JSX.Element;
/** The company's public shell; native Workspace, Settings and Conversation remain their owners. */
export declare function mountCompanyUI(ctx: Context, workbench: WorkbenchController, Resources: React.ComponentType<{
    cwd?: string;
}>, restorePageSession?: (page: MainPanelId, sessionId: SessionId, signal: AbortSignal) => Promise<void>): void;
