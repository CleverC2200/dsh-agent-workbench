import React from 'react';
import type { Context } from '@deepseek-ai/cordis';
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client';
import type { SessionId } from '@deepseek-ai/dsh-session/types';
import type { WorkbenchController, DocumentSession } from '../workbench.ts';
import { type CopyKey } from './locales.ts';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        companyWorkbench: CopyKey;
    }
    interface SlotMap {
        'agent-workbench.directory': {
            kind: 'single';
            scope: 'session-maybe';
        };
    }
}
/** Formal AgentWelcome/GeaHomeHero JSX; only the input action comes from the current public scope. */
export declare function CompanyWelcome({ page, onFill, language, }: {
    page?: string;
    onFill?: (text: string) => void;
    language?: string;
}): React.JSX.Element;
/** Formal selected UI; Workspace, Session, settings and GEA identity retain their existing authorities. */
export declare function mountCompanyUI(ctx: Context, workbench: WorkbenchController, Resources: React.ComponentType<{
    cwd?: string;
}>, restorePageSession?: (page: MainPanelId, sessionId: SessionId, signal: AbortSignal, expected?: Pick<DocumentSession, 'preset' | 'cwd'>) => Promise<void>): void;
