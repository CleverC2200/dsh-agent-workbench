import React, { useSyncExternalStore } from 'react';
import type { Context } from '@deepseek-ai/cordis';
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { SessionId } from '@deepseek-ai/dsh-session/types';
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store';
import { startInventoryConversation } from './business-conversation.ts';
import type { BusinessAccount } from './company/account.ts';
import type { NativeResourceSelection } from './resource-selection.ts';
import type { WorkbenchController } from './workbench.ts';

type EntryCopyKey = 'inventoryEntry' | 'inventoryEntryHint' | 'inventoryEntryFailed';
/** Public Core input dock; the entry owns only transient creation state. */
export function mountInventoryEntry(
  ctx: Context,
  workbench: WorkbenchController,
  resources: () => NativeResourceSelection | undefined,
  associate: Parameters<typeof startInventoryConversation>[0]['associate'],
  t: (key: EntryCopyKey) => string,
): void {
  let businessAccount: BusinessAccount | undefined;
  ctx.inject(['businessAccount'], (scope) => {
    const owned = scope.businessAccount;
    businessAccount = owned;
    scope.effect(() => () => {
      if (businessAccount === owned) businessAccount = undefined;
    });
  });
  const inventoryEntryState = createSnapshotStore<
    { kind: 'idle' } | { kind: 'creating' } | { kind: 'failed'; code: string }
  >({ kind: 'idle' });
  const inventoryLifetime = new AbortController();
  ctx.effect(() => () => inventoryLifetime.abort());
  function InventoryEntry({
    sessionId,
    cwd,
    question,
  }: {
    sessionId?: SessionId;
    cwd?: string;
    question?: string;
  }) {
    const state = useSyncExternalStore(
      inventoryEntryState.subscribe,
      inventoryEntryState.getSnapshot,
      inventoryEntryState.getSnapshot,
    );
    const start = async () => {
      if (inventoryEntryState.getSnapshot().kind === 'creating') return;
      const signal = AbortSignal.any([ctx.layout.beginNavigation(), inventoryLifetime.signal]);
      inventoryEntryState.set({ kind: 'creating' });
      try {
        const host = resources();
        if (!host || !businessAccount) throw Error('PAGE_CAPABILITY_UNAVAILABLE');
        const copiedQuestion = question?.trim()
          ? question
          : sessionId
            ? await host.question?.(sessionId, signal)
            : undefined;
        await startInventoryConversation({
          host,
          account: businessAccount,
          workbench,
          associate,
          signal,
          cwd,
          question: copiedQuestion,
        });
      } catch (error) {
        if (!signal.aborted)
          inventoryEntryState.set({
            kind: 'failed',
            code: error instanceof Error ? error.message : String(error),
          });
      } finally {
        if (inventoryEntryState.getSnapshot().kind === 'creating')
          inventoryEntryState.set({ kind: 'idle' });
      }
    };
    return React.createElement(
      'section',
      { className: 'gea-home-panel' },
      React.createElement(
        'button',
        {
          type: 'button',
          className: 'gea-home-panel-item',
          disabled: state.kind === 'creating',
          onClick: () => void start(),
        },
        t('inventoryEntry'),
      ),
      React.createElement('p', null, t('inventoryEntryHint')),
      state.kind === 'failed'
        ? React.createElement('p', { role: 'alert' }, t('inventoryEntryFailed') + ' ' + state.code)
        : null,
    );
  }

  ctx.slots.inject('conversation.input.dock', () =>
    ctx.slots.register(
      { name: 'conversation.input.dock', id: 'gea-inventory-entry', locale: 'agentWorkbench' },
      function InventoryDock({
        sessionId,
        useInput,
        useSessions,
        useProjection,
      }: PropsRuntime<'conversation.input.dock'>) {
        const question = useInput((input) => input.draft);
        const cwd = useSessions((sessions) => sessions.byId[sessionId]?.cwd);
        const preset = useProjection('agentPreset');
        const document = useSyncExternalStore(workbench.subscribe, workbench.getSnapshot);
        return preset === 'gea-html-inventory-aqkc' || document.selectedDocument
          ? null
          : React.createElement(InventoryEntry, { sessionId, cwd, question });
      },
    ),
  );
}
