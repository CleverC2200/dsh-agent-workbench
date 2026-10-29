import React, { useSyncExternalStore } from 'react';
import type { Context } from '@deepseek-ai/cordis';
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store';
import { Button, Modal } from '@deepseek-ai/dsh-client-ui-primitives';
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client';
import type {} from './ui.tsx';

export function mountWorkspaceDirectoryPrompt(ctx: Context): () => Promise<string | null> {
  const visible = createSnapshotStore(false);
  const t = ctx.locale.bind('companyWorkbench');
  let respond: ((proceed: boolean) => void) | undefined;
  let pending: Promise<string | null> | undefined;
  let disposed = false;
  const finish = (proceed: boolean) => {
    visible.set(false);
    respond?.(proceed);
    respond = undefined;
  };
  ctx.effect(() => () => {
    disposed = true;
    finish(false);
  });
  ctx.slots.inject('shell.overlay', () =>
    ctx.slots.register(
      {
        name: 'shell.overlay',
        id: 'gea-workspace-directory-prompt',
        locale: 'companyWorkbench',
      },
      function WorkspaceDirectoryPrompt() {
        const open = useSyncExternalStore(
          visible.subscribe,
          visible.getSnapshot,
          visible.getSnapshot,
        );
        useSyncExternalStore(
          (listener) => ctx.locale.subscribe(listener),
          () => ctx.locale.getSnapshot().active,
          () => ctx.locale.getSnapshot().active,
        );
        return (
          <Modal
            open={open}
            onClose={() => finish(false)}
            title={t('workspaceDirectoryTitle')}
            closeLabel={t('close')}
            description={t('workspaceDirectoryDescription')}
            footer={
              <>
                <Button onClick={() => finish(false)}>{t('workspaceDirectoryCancel')}</Button>
                <Button variant="primary" data-modal-autofocus onClick={() => finish(true)}>
                  {t('workspaceDirectoryChoose')}
                </Button>
              </>
            }
          />
        );
      },
    ),
  );
  return () => {
    if (disposed) return Promise.resolve(null);
    if (pending) return pending;
    const confirmation = new Promise<boolean>((resolve) => {
      respond = resolve;
    });
    visible.set(true);
    pending = confirmation
      .then(async (proceed) => {
        if (!proceed || disposed) return null;
        const path = await ctx.uiWorkspace.pickDirectory();
        return disposed ? null : path;
      })
      .finally(() => {
        pending = undefined;
      });
    return pending;
  };
}
