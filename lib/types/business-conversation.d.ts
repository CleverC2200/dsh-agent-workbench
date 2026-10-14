import { type NativeResourceSelection } from './resource-selection.ts';
import type { BusinessAccount } from './company/account.ts';
import type { WorkbenchController, DocumentSession } from './workbench.ts';
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client';
import type { SessionId } from '@deepseek-ai/dsh-session/types';
/** Explicit inventory entry borrows Core selection and the existing page association owner. */
export declare function startInventoryConversation({ host, account, workbench, associate, signal, cwd, question, }: {
    host: NativeResourceSelection;
    account: Pick<BusinessAccount, 'getSnapshot'>;
    workbench: Pick<WorkbenchController, 'getSnapshot' | 'open'>;
    associate: (page: MainPanelId, sessionId: SessionId, signal: AbortSignal, expected: Pick<DocumentSession, 'preset' | 'cwd' | 'subject'>) => Promise<void>;
    signal: AbortSignal;
    cwd?: string;
    question?: string;
}): Promise<{
    sessionId: string;
    preset: string;
}>;
