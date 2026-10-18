/** 桌面消息消费界面；只接收安全投影，不接触原始链接或凭证。 */
import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { BusinessAccount } from '../company/account.ts';
import { z } from 'zod';
import type { CopyKey } from './locales.ts';
const navigationStage = z.enum(['poll', 'resolve', 'open', 'finish', 'retry', 'dismiss']);
const navigationCode = z.string().regex(/^[A-Z][A-Z0-9_]{0,80}$/);
const navigationView = z
  .union([
    z.object({ state: z.enum(['idle', 'unavailable', 'login']) }),
    z.object({
      state: z.literal('error'),
      receipt: z.string().min(1).optional(),
      code: navigationCode,
      stage: navigationStage.optional(),
    }),
    z.object({
      state: z.literal('ready'),
      receipt: z.string().min(1),
      panel: z.string().min(1),
      notificationId: z.string().optional(),
      interactionRequestId: z.string().optional(),
    }),
  ])
  .and(z.object({ identityRevision: z.number().int().nonnegative().optional() }));
export type NavigationView = z.infer<typeof navigationView>;
type NavigationStage = z.infer<typeof navigationStage>;
type NavigationObservation = { deadline: number; ended: boolean };

export type ReadyNavigation = Extract<NavigationView, { state: 'ready' }>;
export type PageNavigation = ReadyNavigation & {
  visible(): void;
  failed(error: Error): void;
};

/** 业务页面订阅当前导航；以实际渲染回执完成等待。 */
export function createNavigationSelection() {
  let value: PageNavigation | null = null;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => value,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    set(next: PageNavigation | null) {
      value = next;
      listeners.forEach((listener) => listener());
    },
  };
}

class NavigationRequestError extends Error {
  readonly code: string;
  readonly stage: NavigationStage;
  readonly recoverable: boolean;
  constructor(code: string, stage: NavigationStage, recoverable = false) {
    super(code);
    this.code = code;
    this.stage = stage;
    this.recoverable = recoverable;
  }
}

async function request(
  action: 'poll' | 'finish' | 'retry',
  body: object = {},
  signal?: AbortSignal,
): Promise<NavigationView> {
  if (action !== 'poll') return readNavigationResponse(action, body, signal);
  const timeout = AbortSignal.timeout(5000);
  try {
    return await readNavigationResponse(
      action,
      body,
      signal ? AbortSignal.any([signal, timeout]) : timeout,
    );
  } catch (error) {
    signal?.throwIfAborted();
    if (timeout.aborted) throw new NavigationRequestError('NAVIGATION_TIMEOUT', action, true);
    throw error;
  }
}

async function readNavigationResponse(
  action: 'poll' | 'finish' | 'retry',
  body: object,
  signal?: AbortSignal,
): Promise<NavigationView> {
  let response: Response;
  try {
    response = await fetch('/api/gea-proof/navigation/' + action, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    signal?.throwIfAborted();
    throw new NavigationRequestError(
      'NAVIGATION_TRANSPORT_UNAVAILABLE',
      action,
      error instanceof TypeError,
    );
  }
  if (!response.ok)
    throw new NavigationRequestError(
      `NAVIGATION_HTTP_${response.status}`,
      action,
      response.status === 404 ||
        response.status === 408 ||
        response.status === 429 ||
        response.status >= 500,
    );
  let result: unknown;
  try {
    result = await response.json();
  } catch {
    throw new NavigationRequestError('NAVIGATION_RESPONSE_INVALID', action);
  }
  signal?.throwIfAborted();
  const envelope = z
    .object({
      ok: z.boolean(),
      value: z.unknown().optional(),
      error: z.object({ code: navigationCode.optional() }).optional(),
    })
    .safeParse(result);
  if (!envelope.success) throw new NavigationRequestError('NAVIGATION_RESPONSE_INVALID', action);
  if (!envelope.data.ok) {
    const code = envelope.data.error?.code ?? 'NAVIGATION_BUSINESS_REJECTED';
    if (action === 'poll' && code === 'GEA_SALES_READONLY_OPERATION')
      return { state: 'unavailable' };
    throw new NavigationRequestError(code, action);
  }
  const next = navigationView.safeParse(envelope.data.value);
  if (!next.success) throw new NavigationRequestError('NAVIGATION_RESPONSE_INVALID', action);
  return next.data;
}

/** 独立提示条不阻断正常业务；轮询持续观察身份变化，已处理 receipt 不重复打开。 */
export function DesktopNavigation({
  t,
  open,
  login,
  identity,
  observation,
}: {
  t: (key: CopyKey) => string;
  open: (target: ReadyNavigation, signal: AbortSignal) => Promise<void>;
  login: () => void;
  identity: Pick<BusinessAccount, 'getSnapshot' | 'subscribe'>;
  observation?: NavigationObservation;
}) {
  const observed = useSyncExternalStore(identity.subscribe, identity.getSnapshot);
  const lifetime = useRef({ deadline: Date.now() + 5000, ended: false });
  const startup = observation ?? lifetime.current;
  const [view, setView] = useState<NavigationView>({ state: 'idle' });
  const active = useRef<{
    receipt: string;
    controller: AbortController;
    done: boolean;
    failed: boolean;
  }>();
  const owner = useRef<AbortController>();
  const actionEpoch = useRef(0);
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    owner.current = controller;
    setBusy(false);
    if (observed.state !== 'confirmed' || observed.error) {
      active.current?.controller.abort();
      active.current = undefined;
      setView({ state: 'idle' });
      return () => controller.abort();
    }
    let timer: ReturnType<typeof setTimeout>;
    let startupTimer: ReturnType<typeof setTimeout> | undefined;
    let initialFailure: Extract<NavigationView, { state: 'error' }> | undefined;
    let identityRevision: number | undefined;
    const consume = (next: NavigationView) => {
      if (controller.signal.aborted) return;
      if (
        identityRevision !== undefined &&
        next.identityRevision !== undefined &&
        identityRevision !== next.identityRevision
      ) {
        active.current?.controller.abort();
        active.current = undefined;
      }
      if (next.identityRevision !== undefined) identityRevision = next.identityRevision;
      if (
        active.current?.done &&
        active.current.failed &&
        (next.state === 'idle' || next.state === 'ready')
      )
        return;
      actionEpoch.current++;
      if (
        next.state !== 'error' ||
        next.receipt ||
        !/^(NAVIGATION_CONTROL_UNAVAILABLE|NAVIGATION_CONTROL_REQUEST_FAILED)$/.test(next.code)
      )
        startup.ended = true;
      if (next.state !== 'ready') {
        if (
          next.state !== 'error' &&
          active.current &&
          (next.state !== 'idle' || !active.current.done)
        ) {
          active.current.controller.abort();
          active.current = undefined;
        }
        if (
          next.state === 'error' &&
          !next.receipt &&
          !startup.ended &&
          Date.now() < startup.deadline
        ) {
          initialFailure = next;
          return;
        }
        clearTimeout(startupTimer);
        setView(next);
        return;
      }
      clearTimeout(startupTimer);
      if (active.current?.receipt === next.receipt) return;
      active.current?.controller.abort();
      const task = {
        receipt: next.receipt,
        controller: new AbortController(),
        done: false,
        failed: false,
      };
      active.current = task;
      setView(next);
      void open(next, task.controller.signal)
        .then(async () => {
          if (
            controller.signal.aborted ||
            task.controller.signal.aborted ||
            active.current !== task
          )
            return;
          task.done = true;
          const completed = await request(
            'finish',
            { receipt: next.receipt, outcome: 'visible' },
            controller.signal,
          );
          if (!controller.signal.aborted && active.current === task) setView(completed);
        })
        .catch((error: unknown) => {
          if (
            controller.signal.aborted ||
            task.controller.signal.aborted ||
            active.current !== task
          )
            return;
          task.failed = true;
          setView({
            state: 'error',
            receipt: next.receipt,
            stage: task.done ? 'finish' : 'open',
            code:
              error instanceof NavigationRequestError
                ? error.code
                : 'NAVIGATION_TARGET_UNAVAILABLE',
          });
        });
    };
    const poll = async () => {
      try {
        consume(await request('poll', {}, controller.signal));
      } catch (error) {
        if (!controller.signal.aborted) {
          if (active.current?.done && active.current.failed) return;
          const failure: Extract<NavigationView, { state: 'error' }> = {
            state: 'error',
            stage: 'poll',
            code:
              error instanceof NavigationRequestError ? error.code : 'NAVIGATION_REQUEST_FAILED',
            ...(active.current ? { receipt: active.current.receipt } : {}),
          };
          if (
            !active.current &&
            !startup.ended &&
            error instanceof NavigationRequestError &&
            error.recoverable &&
            Date.now() < startup.deadline
          )
            initialFailure = failure;
          else {
            startup.ended = true;
            clearTimeout(startupTimer);
            setView(failure);
          }
        }
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(poll, 1500);
      }
    };
    if (!startup.ended)
      startupTimer = setTimeout(
        () => {
          startup.ended = true;
          if (!controller.signal.aborted && initialFailure) setView(initialFailure);
        },
        Math.max(0, startup.deadline - Date.now()),
      );
    void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
      clearTimeout(startupTimer);
      active.current?.controller.abort();
      active.current = undefined;
    };
  }, [
    open,
    revision,
    observed.state,
    observed.scope,
    observed.subject,
    observed.error,
    observed.status?.authenticated,
    startup,
  ]);
  const action = async (dismiss: boolean) => {
    if (busy || !owner.current || owner.current.signal.aborted) return;
    const controller = owner.current;
    const epoch = ++actionEpoch.current;
    setBusy(true);
    const task = active.current;
    const finishVisible =
      !dismiss && view.state === 'error' && task?.done && view.receipt === task.receipt;
    try {
      const next = finishVisible
        ? await request('finish', { receipt: task.receipt, outcome: 'visible' }, controller.signal)
        : dismiss && view.state === 'error' && view.receipt
          ? await request(
              'finish',
              { receipt: view.receipt, outcome: 'dismissed' },
              controller.signal,
            )
          : await request('retry', {}, controller.signal);
      if (controller.signal.aborted || epoch !== actionEpoch.current) return;
      if (finishVisible) {
        task.failed = next.state === 'error';
        setView(next);
        return;
      }
      active.current?.controller.abort();
      active.current = undefined;
      setView(next);
      setRevision((value) => value + 1);
    } catch (error) {
      if (controller.signal.aborted || epoch !== actionEpoch.current) return;
      setView({
        state: 'error',
        code: error instanceof NavigationRequestError ? error.code : 'NAVIGATION_REQUEST_FAILED',
        stage: dismiss ? 'dismiss' : finishVisible ? 'finish' : 'retry',
        ...(view.state === 'error' && view.receipt ? { receipt: view.receipt } : {}),
      });
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  };
  if (observed.state !== 'confirmed' || observed.error) return null;
  if (view.state === 'idle' || view.state === 'unavailable') return null;
  const code = view.state === 'error' ? view.code : '';
  const message =
    view.state === 'login'
      ? 'navigationLogin'
      : view.state === 'ready'
        ? 'navigationOpening'
        : view.state === 'error' && !view.receipt
          ? 'navigationServiceUnavailable'
          : /EXPIRED|REVOKED/.test(code)
            ? 'navigationExpired'
            : /FORBIDDEN/.test(code)
              ? 'navigationForbidden'
              : /UNSUPPORTED|UNAVAILABLE|INCOMPLETE/.test(code)
                ? 'navigationUnavailable'
                : 'navigationFailed';
  return (
    <div
      role={view.state === 'error' ? 'alert' : 'status'}
      data-navigation-code={view.state === 'error' ? view.code : undefined}
      data-navigation-stage={view.state === 'error' ? view.stage : undefined}
      style={{
        position: 'fixed',
        bottom: 24,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 10000,
        padding: '12px 18px',
        border: '1px solid #cbd5e1',
        borderRadius: 8,
        background: 'var(--background,#fff)',
        color: 'var(--foreground,#182230)',
        boxShadow: '0 4px 16px #0002',
        maxWidth: '80vw',
      }}
    >
      <span>{t(message)}</span>{' '}
      {view.state === 'login' && <button onClick={login}>{t('navigationLoginAction')}</button>}
      {view.state === 'error' && (
        <>
          <button disabled={busy} onClick={() => void action(false)}>
            {t('retry')}
          </button>{' '}
          {view.receipt && (
            <button disabled={busy} onClick={() => void action(true)}>
              {t('close')}
            </button>
          )}
        </>
      )}
    </div>
  );
}
