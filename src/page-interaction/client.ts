import { ownedReferenceSpans } from './owned-reference.ts';
import React, { useEffect, useRef } from 'react';
import type { Context } from '@deepseek-ai/cordis';
import type { SessionReference } from '@deepseek-ai/dsh-api-session-controller/client';
import type {} from '@deepseek-ai/dsh-client-ui-input-trigger/client';
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client';
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client';

import {
  PAGE_INTERACTION,
  REFERENCE_SOURCE,
  pageReference,
  pageQuoteReference,
  serializeReference,
  type BoundReference,
} from './reference.ts';

export type FrameBinding = {
  frame: HTMLIFrameElement;
  reference: SessionReference;
  page: string;
  inputActions: import('@deepseek-ai/dsh-client-ui-conversation/client').InputActions;
} & (
  | { mode: 'business'; surface: string; tool?: string; owner: string }
  | {
      mode: 'quote';
      isCurrentSession: () => boolean;
    }
);
export type PageInteraction = {
  bindFrame(options: FrameBinding): () => void;
  mountTrigger(container: HTMLElement, sessionId: string): () => void;
};

/** Uses the public DSH reference/input faces, without replacing the composer. */
export function installPageInteraction(ctx: Context): PageInteraction {
  try {
    const existing = ctx.get('pageInteraction');
    if (existing) return existing;
  } catch {
    /* optional service */
  }
  let ready: Context | undefined;
  let disposed = false;
  type PickerBinding = {
    frame: HTMLIFrameElement;
    sessionId: string;
    selecting: boolean;
    available: boolean;
    send: (message: object) => void;
    configure: () => void;
  };
  const bindings = new Set<PickerBinding>();
  const releases = new Set<() => void>();
  const triggers = new Set<HTMLButtonElement>();
  const currentPicker = (sessionId: string) =>
    [...bindings]
      .reverse()
      .find(
        (binding) =>
          binding.available &&
          binding.sessionId === sessionId &&
          binding.frame.isConnected &&
          binding.frame.getClientRects().length > 0,
      );
  const updateTriggers = () => {
    if (!triggers.size) return;
    for (const button of triggers) {
      const binding = currentPicker(button.dataset.sessionId!);
      button.disabled = !binding;
      button.setAttribute('aria-pressed', String(binding?.selecting === true));
      button.setAttribute('aria-label', binding?.selecting ? '退出选择' : '选择内容');
      button.title = binding?.selecting
        ? '退出选择（Esc）'
        : '选择内容（按住 Alt 临时选择，Esc 退出）';
    }
  };
  ctx.inject(['inputTriggers', 'conversation'], (scope) => {
    scope.effect(() =>
      scope.inputTriggers.registerSource({
        trigger: '@',
        name: REFERENCE_SOURCE,
        candidates: async () => [],
        onPick: () => undefined,
        codec: {
          clipboardText: (ref: string) => serializeReference(JSON.parse(ref)),
          serialize: async (ref: string) => {
            return serializeReference(JSON.parse(ref));
          },
        },
      }),
    );
    ready = scope;
    scope.effect(() => {
      const down = (event: KeyboardEvent) => {
        const paired = [...triggers].filter(
          (button) =>
            button.isConnected &&
            button.getClientRects().length > 0 &&
            currentPicker(button.dataset.sessionId!),
        );
        const sessions = new Set(paired.map((button) => button.dataset.sessionId!));
        const picker = sessions.size === 1 ? currentPicker([...sessions][0]!) : undefined;
        if (!picker || event.isComposing) return;
        if (event.key === 'Alt' && !event.ctrlKey && !event.metaKey) {
          event.preventDefault();
          picker.send({ type: 'hold-selection', held: true });
        }
        if (event.key === 'Escape') {
          if (picker.selecting) event.preventDefault();
          picker.send({ type: 'stop-selection', altHeld: event.altKey });
        }
      };
      const release = (transient = false) => {
        for (const picker of bindings)
          picker.send({
            type: transient ? 'suspend-selection' : 'hold-selection',
            held: false,
          });
      };
      const up = (event: KeyboardEvent) => {
        if (event.key === 'Alt') release();
      };
      const blur = () => {
        if (typeof document === 'undefined' || !document.hasFocus()) release(true);
      };
      const visibility = () => {
        if (document.hidden) release(true);
      };
      window.addEventListener('keydown', down, true);
      window.addEventListener('keyup', up, true);
      window.addEventListener('blur', blur);
      if (typeof document !== 'undefined')
        document.addEventListener('visibilitychange', visibility);
      return () => {
        window.removeEventListener('keydown', down, true);
        window.removeEventListener('keyup', up, true);
        window.removeEventListener('blur', blur);
        if (typeof document !== 'undefined')
          document.removeEventListener('visibilitychange', visibility);
      };
    });
    updateTriggers();
    scope.effect(() => () => {
      if (ready === scope) ready = undefined;
    });
  });
  const api: PageInteraction = {
    mountTrigger(container, sessionId) {
      if (disposed) throw new Error('页面交互已释放。');
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.sessionId = sessionId;
      button.setAttribute('aria-keyshortcuts', 'Alt Escape');
      button.setAttribute('aria-label', '选择内容');
      button.setAttribute('data-page-selection-trigger', '');
      const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      icon.setAttribute('viewBox', '0 0 24 24');
      icon.setAttribute('width', '20');
      icon.setAttribute('height', '20');
      icon.setAttribute('aria-hidden', 'true');
      const path = document.createElementNS(icon.namespaceURI, 'path');
      path.setAttribute('d', 'M3.5 3.5 21 11.5l-7.5 2-2 7.5L3.5 3.5Z');
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', 'currentColor');
      path.setAttribute('stroke-width', '1.5');
      path.setAttribute('stroke-linejoin', 'round');
      icon.append(path);
      button.append(icon);
      button.addEventListener('click', () =>
        currentPicker(sessionId)?.send({ type: 'toggle-selection' }),
      );
      container.append(button);
      triggers.add(button);
      for (const binding of bindings) binding.configure();
      updateTriggers();
      return () => {
        triggers.delete(button);
        button.remove();
        for (const binding of bindings) binding.configure();
      };
    },
    bindFrame(options) {
      if (options.mode !== 'business' && options.mode !== 'quote')
        throw Error('UNSUPPORTED_PAGE_REFERENCE_BINDING');
      const { frame, reference, page } = options;
      const business = options.mode === 'business' ? options : undefined;
      if (disposed) throw new Error('页面交互已释放。');
      const { sessionId } = reference;
      const owned = reference.binding;
      const retained = (): boolean => {
        try {
          return reference.binding === owned;
        } catch {
          return false;
        }
      };
      const paired = (): boolean =>
        retained() &&
        (options.mode !== 'quote' || options.isCurrentSession()) &&
        currentPicker(sessionId) === binding &&
        [...triggers].some(
          (button) =>
            button.dataset.sessionId === sessionId &&
            button.isConnected &&
            button.getClientRects().length > 0,
        );
      const input = () => {
        if (!ready || !retained()) throw new Error('对话已释放，请重新关联页面。');
        return ready.conversation.input.for(reference.binding.ctx);
      };
      const channel = crypto.randomUUID();
      const sandbox = frame.getAttribute('sandbox');
      const opaqueOrigin = sandbox !== null && !sandbox.split(/\s+/).includes('allow-same-origin');
      const expectedOrigin = opaqueOrigin
        ? 'null'
        : frame.src && !frame.srcdoc
          ? new URL(frame.src, window.location.href).origin
          : undefined;
      let active = true;
      let generation: string | undefined;
      const bindingRequest = new AbortController();
      const requests = new Map<string, AbortController>();
      const ownedReferences = new Set<string>();
      let invalidated = false;
      let observedInput:
        | import('@deepseek-ai/dsh-client-ui-conversation/client').SessionInput
        | undefined;
      let unobserveInput = () => {};
      let cleanupScheduled = false;
      const removeOwnedReferences = () => {
        if (!invalidated || !observedInput || !retained()) return;
        while (true) {
          const state = observedInput.state.getSnapshot();
          const span = ownedReferenceSpans(state, ownedReferences)[0];
          if (!span) return;
          if (
            !owned.ctx.bail('slash/input-consume-token', {
              guard: { kind: 'span', span: { ...span, draftRev: state.draftRev } },
            })
          )
            return;
        }
      };
      const identityChanged = () => {
        if (!business) return;
        invalidated = true;
        for (const controller of requests.values()) controller.abort();
        removeOwnedReferences();
      };
      window.addEventListener('gea-business-identity-changed', identityChanged);

      const send = (message: object) =>
        frame.contentWindow?.postMessage({ protocol: PAGE_INTERACTION, channel, ...message }, '*');
      const configure = () => {
        if (!business || generation)
          send({
            type: 'configure',
            page,
            quote: !business,
            externalTrigger: [...triggers].some((button) => button.dataset.sessionId === sessionId),
          });
      };
      const binding: PickerBinding = {
        frame,
        sessionId,
        selecting: false,
        available: false,
        send,
        configure,
      };
      bindings.add(binding);
      updateTriggers();
      const receive = async (event: MessageEvent) => {
        if (
          event.source !== frame.contentWindow ||
          (expectedOrigin !== undefined && event.origin !== expectedOrigin) ||
          event.data?.protocol !== PAGE_INTERACTION
        )
          return;
        if (event.data.type === 'ready') {
          configure();
          return;
        }
        if (!active || event.data.channel !== channel) return;
        if (event.data.type === 'selection-state') {
          binding.selecting = event.data.active === true;
          binding.available = true;
          updateTriggers();
          return;
        }
        if (event.data.type === 'selection-error') {
          if (ready && retained())
            input().notify('error', String(event.data.error || '引用未加入，请重试。'));
          return;
        }
        if (event.data.type === 'cancel-reference') {
          requests.get(event.data.requestId)?.abort();
          return;
        }
        if (
          (event.data.type !== 'reference' && event.data.type !== 'quote') ||
          typeof event.data.requestId !== 'string'
        )
          return;
        const requestId = event.data.requestId;
        const controller = new AbortController();
        requests.set(requestId, controller);
        const deadline = setTimeout(() => {
          if (!active || controller.signal.aborted) return;
          controller.abort();
          send({ type: 'result', requestId, ok: false, error: '引用未加入，请重试。' });
        }, 5000);
        try {
          if (!paired() || (business && (!ready || !generation || invalidated)))
            throw Error('请先打开当前页面的对话，再加入提问。');
          if (event.data.type === 'quote' && options.mode !== 'quote')
            throw Error('请关联当前页面的真实对话，再转入草稿。');
          const selected =
            event.data.type === 'quote'
              ? pageQuoteReference(event.data.reference)
              : pageReference(event.data.reference);
          if (!selected)
            throw Error(
              event.data.type === 'quote'
                ? '转入文字为空或超过单次引用长度上限，请检查原文后重试。'
                : '未读到选中内容，请重新选择。',
            );
          if (options.mode === 'quote') {
            const quote =
              '引用：' +
              page +
              ' · ' +
              selected.label +
              '\n' +
              selected.text
                .split('\n')
                .map((line) => '> ' + line)
                .join('\n') +
              '\n';
            const captured = options.inputActions.captureInsertion();
            const span =
              event.data.type === 'quote' ? { ...captured, end: captured.start } : captured;
            if (!active || controller.signal.aborted || !paired())
              throw Error('已切换对话，请在当前页面重新引用。');
            if (!options.inputActions.insertText(quote, span))
              throw Error('草稿已变化或正在发送，请重新选择内容。');
            // Alpha exposes an explicit flush; rc.2 publishes edits to its Core-owned writer.
            if ('persistDraft' in options.inputActions && typeof options.inputActions.persistDraft === 'function')
              options.inputActions.persistDraft();
            send({ type: 'result', requestId, ok: true });
            return;
          }
          const value: BoundReference = {
            ...selected,
            page,
            sessionId,
            surface: options.surface,
            tool: options.tool,
          };
          const response = await fetch('/api/page-interaction/reference', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ ...value, generation, owner: options.owner }),
            signal: controller.signal,
          });
          const receipt = await response.json();
          if (!active || controller.signal.aborted) return;
          if (!response.ok) throw Error(receipt.error || '引用未保存，请重试。');
          // The Host may rotate identity while a successful save response is delayed in transit.
          const bindingResponse = await fetch('/api/page-interaction/binding', {
            cache: 'no-store',
            signal: controller.signal,
          });
          const currentBinding = await bindingResponse.json();
          if (!active || controller.signal.aborted) return;
          if (!bindingResponse.ok || currentBinding.generation !== generation)
            throw Error('登录身份已变化，请重新选择引用。');
          // A Session-specific owner can be revoked without changing the global write generation.
          const access = await fetch('/api/agent-workbench/page', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ operation: 'access', owner: business!.owner }),
            signal: controller.signal,
          });
          if (!active || controller.signal.aborted) return;
          if (!access.ok || invalidated) throw Error('登录身份已变化，请重新选择引用。');
          if (!ready || !paired()) throw Error('已切换对话，请在当前页面重新引用。');
          const composer = input();
          const captured = options.inputActions.captureInsertion();
          const inserted = composer.insertReference(
            {
              source: REFERENCE_SOURCE,
              ref: JSON.stringify(receipt),
              label: receipt.label,
              appearance: 'session',
              clipboardText: serializeReference(receipt),
            },
            {
              ...captured,
              start: captured.end,
            },
          );
          if (!inserted) throw Error('草稿已变化或正在发送，请重新选择内容。');
          ownedReferences.add(JSON.stringify(receipt));
          if (!observedInput) {
            observedInput = composer;
            unobserveInput = composer.state.subscribe(() => {
              if (!invalidated || cleanupScheduled) return;
              cleanupScheduled = true;
              queueMicrotask(() => {
                cleanupScheduled = false;
                removeOwnedReferences();
              });
            });
          }
          send({ type: 'result', requestId: event.data.requestId, ok: true });
        } catch (error) {
          if (!active || controller.signal.aborted) return;
          send({
            type: 'result',
            requestId: event.data.requestId,
            ok: false,
            error: error instanceof Error ? error.message : '引用未加入，请重试。',
          });
        } finally {
          clearTimeout(deadline);
          requests.delete(requestId);
        }
      };
      const reloaded = () => {
        if (requests.size) {
          for (const controller of requests.values()) controller.abort();
          requests.clear();
          if (ready && retained()) input().notify('error', '页面已重新加载，请重新选择引用。');
        }
        configure();
      };
      window.addEventListener('message', receive);
      frame.addEventListener('load', reloaded);
      if (business)
        void fetch('/api/page-interaction/binding', {
          cache: 'no-store',
          signal: bindingRequest.signal,
        })
          .then(async (response) => {
            const value = await response.json();
            if (!response.ok || typeof value.generation !== 'string')
              throw Error('页面引用连接不可用，请重新打开页面。');
            if (!active) return;
            generation = value.generation;
            configure();
          })
          .catch((error) => {
            if (!active) return;
            if (ready && retained()) input().notify('error', String(error.message));
          });
      else configure();
      const release = () => {
        if (!active) return;
        active = false;
        releases.delete(release);
        bindingRequest.abort();
        removeOwnedReferences();
        unobserveInput();
        observedInput = undefined;
        window.removeEventListener('gea-business-identity-changed', identityChanged);
        bindings.delete(binding);
        updateTriggers();
        for (const controller of requests.values()) controller.abort();
        requests.clear();
        send({ type: 'disconnect' });
        window.removeEventListener('message', receive);
        frame.removeEventListener('load', reloaded);
      };
      releases.add(release);
      return release;
    },
  };
  ctx.provide('pageInteraction', api);
  ctx.effect(() => () => {
    disposed = true;
    for (const release of releases) release();
    for (const button of triggers) button.remove();
    triggers.clear();
  });
  ctx.inject(['slots'], (scope) => {
    if (!scope.slots?.inject) return;
    scope.effect(() =>
      scope.slots.inject('conversation.input.left', () =>
        scope.slots.register(
          { name: 'conversation.input.left', id: 'page-selection', order: 50 },
          function SelectionControl({ sessionId }: { sessionId: string }) {
            const anchor = useRef<HTMLSpanElement>(null);
            useEffect(
              () => (anchor.current ? api.mountTrigger(anchor.current, sessionId) : undefined),
              [sessionId],
            );
            return React.createElement('span', {
              ref: anchor,
              className: 'dspi-composer-trigger',
            });
          },
        ),
      ),
    );
    scope.effect(() => {
      const style = document.createElement('style');
      style.textContent =
        '.dspi-composer-trigger{display:inline-flex;align-items:center}.dspi-composer-trigger button{display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;padding:0;border:0;border-radius:50%;background:transparent;color:var(--dsw-alias-label-secondary,#606977);cursor:pointer}.dspi-composer-trigger button:hover{background:var(--dsw-alias-interactive-bg-hover,#f2f3f5)}.dspi-composer-trigger button[aria-pressed=true]{background:#fff1f1;color:#df1d28}.dspi-composer-trigger button:disabled{opacity:.4;cursor:default}.dspi-composer-trigger button:focus-visible{outline:2px solid #d0132c;outline-offset:2px}.dspi-composer-trigger svg{width:16px;height:16px}';
      document.head.append(style);
      return () => style.remove();
    });
  });
  return api;
}

export const inject = ['conversation', 'inputTriggers'];
export const apply = installPageInteraction;

declare module '@deepseek-ai/cordis' {
  interface Context {
    pageInteraction: PageInteraction;
  }
}
