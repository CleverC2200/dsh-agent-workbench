import { selectResource, type NativeResourceSelection } from './resource-selection.ts';
import type { BusinessAccount } from './company/account.ts';
import type { WorkbenchController, DocumentSession } from './workbench.ts';
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client';
import type { SessionId } from '@deepseek-ai/dsh-session/types';

/** Explicit inventory entry borrows Core selection and the existing page association owner. */
export async function startInventoryConversation({
  host,
  account,
  workbench,
  associate,
  signal,
  cwd,
  question,
}: {
  host: NativeResourceSelection;
  account: Pick<BusinessAccount, 'getSnapshot'>;
  workbench: Pick<WorkbenchController, 'getSnapshot' | 'open'>;
  associate: (
    page: MainPanelId,
    sessionId: SessionId,
    signal: AbortSignal,
    expected: Pick<DocumentSession, 'preset' | 'cwd' | 'subject'>,
  ) => Promise<void>;
  signal: AbortSignal;
  cwd?: string;
  question?: string;
}) {
  const page = workbench.getSnapshot().pages.find((item) => item.id === 'inventory-aqkc');
  if (!page) throw Error('PAGE_INTERPRETER_UNAVAILABLE');
  const owner = account.getSnapshot();
  if (owner.state !== 'confirmed' || owner.error || !owner.status?.authenticated || !owner.subject)
    throw Error('GEA_LOGIN_REQUIRED');
  const selected = await selectResource(
    host,
    'gea-html-inventory-aqkc',
    signal,
    cwd,
    async (projection) => {
      const current = account.getSnapshot();
      if (
        current.scope !== owner.scope ||
        current.subject !== owner.subject ||
        !current.status?.authenticated ||
        current.error
      )
        throw Error('PAGE_IDENTITY_CHANGED');
      await associate(page.id, projection.sessionId, signal, {
        preset: projection.preset,
        cwd: projection.cwd,
        subject: owner.subject,
      });
    },
    question,
  );
  // Commit page presentation immediately after Core navigation, without another asynchronous read.
  await workbench.open(page.id);
  return selected;
}
