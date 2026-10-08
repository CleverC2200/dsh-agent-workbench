import React from 'react';
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client';
import type { SessionId } from '@deepseek-ai/dsh-session/types';
import type { WorkbenchFramePage } from '../frame.ts';
/** Extra navigation for Core-owned blank Sessions omitted by the ordinary Workspace browser. */
export declare function PageUnsentHistory({ page, cwd, sessions, request, language, selectedSessionId, onChoose, }: {
    page: WorkbenchFramePage;
    cwd: string;
    sessions: Pick<ISessions, 'list' | 'refreshProjections'>;
    request: typeof fetch;
    language: string;
    selectedSessionId?: SessionId;
    onChoose(id: SessionId, preset: string, cwd: string): void;
}): React.JSX.Element;
