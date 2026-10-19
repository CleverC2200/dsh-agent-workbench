/** Workbench Native 业务文档中的审批页面；GEA 保留认证与业务授权。 */
import { RegionalApprovalResubmitDialog } from './original/workbenches/regionalApproval/RegionalApprovalResubmitDialog.tsx';
import type { GeaSalesPlanPeriod } from './original/contracts.ts';
import { createWorkflowLoader } from './workflow-loader.ts';
import '@arco-design/web-react/dist/css/arco.css';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button } from '@arco-design/web-react';
import i18next from 'i18next';
import {
  RegionalApprovalWorkbench,
  WorkbenchSessionProvider,
  BackendHttpError,
  type WorkbenchHost,
  type RegionalApprovalWorkbenchContext,
} from './original/index.ts';
import commonEn from './original/en-US.json' with { type: 'json' };
import commonZh from './original/zh-CN.json' with { type: 'json' };

import { salesPlanStagesForRoles } from './original/workbenches/regionalApproval/models/salesPlanAccessModel.ts';
import type { NativeBusinessStatus as Status } from './business-contract.ts';
import type { CopyKey } from '../client/locales.ts';
import './workbench.css';
import { LoginSurface } from '../company/login-dialog.tsx';
import { mountPicker } from '../page-interaction/picker.ts';
import { ApiLogCenter } from './api-log-center.tsx';
import './api-log.css';
import type { PageElement } from '../page-bridge/catalog.ts';
import { workbenchCatalog } from '../shared/workbench-actions.ts';
import {
  startPageBridgeClient,
  type PageBridgeApplyResult,
} from '../page-interaction/page-bridge/client.ts';

type Translate = (key: CopyKey) => string;
type VisibleWorkbenchContext = {
  format: 'gea-workbench-visible-v1';
  sequence: number;
  view: 'regional-approval';
  scope: {
    month: string;
    planType: string;
    approvalStage: string;
    dimension: string | null;
  };
  visibleRows: Array<Record<string, string | number | null>>;
  selectedPlanIds: string[];
  expandedPlanIds: string[];
  expandedFields: Array<{
    id: string;
    label: string;
    value: string;
    editable: boolean;
  }>;
  pagination: { page: number; pageSize: number; total: number };
  evidence: {
    source: 'gea-user-session';
    completeness: 'paged-queue';
    queryState: 'success';
    dataVersion: string;
  };
};

function visibleWorkbenchContext(
  context: RegionalApprovalWorkbenchContext,
  sequence: number,
): VisibleWorkbenchContext | undefined {
  if (
    context.evidence.source !== 'gea-user-session' ||
    context.evidence.completeness !== 'paged-queue' ||
    context.evidence.queryState !== 'success'
  )
    return undefined;
  const rows = context.visibleEntities
    .filter((entity) => entity.source === 'gea')
    .map((entity) => ({
      planId: entity.id,
      organization: entity.organizationKey,
      planTypeCode: entity.planTypeCode ?? null,
      approvalState: String(entity.approvalState),
      status: entity.status ?? null,
      versionId: entity.versionId ?? null,
      seq: entity.seq ?? null,
      dealerCode: entity.dealerCode ?? null,
      orgCode: entity.orgCode ?? null,
      provinceCode: entity.provinceCode ?? null,
      areaCode: entity.areaCode ?? null,
      currentQty: entity.currentQty ?? null,
      currentAmount: entity.currentAmount ?? null,
      targetAmount: entity.targetAmount ?? null,
      skuCount: entity.skuCount ?? null,
      submitter: entity.submitter ?? null,
      returnReason: entity.returnReason ?? null,
    }));
  return {
    format: 'gea-workbench-visible-v1',
    sequence,
    view: 'regional-approval',
    scope: {
      month: context.scope.month,
      planType: context.scope.planType,
      approvalStage: context.scope.approvalStage,
      dimension: context.scope.dimension ?? null,
    },
    visibleRows: rows,
    selectedPlanIds: [
      ...new Set(
        context.selectedEntities
          .filter((entity) => entity.source === 'gea')
          .map((entity) => entity.id),
      ),
    ].sort(),
    expandedPlanIds: [...new Set(context.expandedPlanIds ?? [])].sort(),
    expandedFields: (context.expandedFields ?? []).slice(0, 120),
    pagination: context.pagination,
    evidence: {
      source: 'gea-user-session',
      completeness: 'paged-queue',
      queryState: 'success',
      dataVersion: context.evidence.dataVersion,
    },
  };
}
const locale = i18next.createInstance();
const language = (
  new URLSearchParams(window.location.search).get('locale') ?? navigator.language
).startsWith('zh')
  ? 'zh-CN'
  : 'en-US';
void locale.init({
  lng: language,
  fallbackLng: 'en-US',
  initImmediate: false,
  resources: {
    'zh-CN': { translation: { common: commonZh } },
    'en-US': { translation: { common: commonEn } },
  },
  interpolation: { escapeValue: false },
});

async function pageRpc<T>(operation: string, payload: object, signal?: AbortSignal): Promise<T> {
  const response = await fetch('/api/agent-workbench/page', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ operation, ...payload }),
    signal,
  });
  const result = await response.json();
  if (!response.ok) throw Error(result.error ?? 'PAGE_REQUEST_FAILED');
  return result;
}

async function rpc<T>(endpoint: string, payload: object = {}, signal?: AbortSignal): Promise<T> {
  const response = await fetch('/api/gea-proof/' + endpoint, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
  });
  const result = await response.json();
  if (!response.ok || result.ok !== true) {
    const code = result.error?.code ?? 'GEA_REQUEST_FAILED';
    const upstreamStatus = /^GEA_HTTP_([45]\d{2})$/.exec(code)?.[1];
    const status =
      code === 'LOGIN_REQUIRED'
        ? 401
        : upstreamStatus
          ? Number(upstreamStatus)
          : response.ok
            ? 502
            : response.status;
    throw new BackendHttpError({
      method: 'POST',
      path: endpoint,
      status,
      body: {
        code: endpoint === 'workflow/config' ? 'GEA_WORKFLOW_LOAD_FAILED' : code,
        error: result.error?.message ?? code,
        details: result.error?.details,
      },
    });
  }
  return result.value;
}
function query<T>(kind: string, input: { signal?: AbortSignal } = {}): Promise<T> {
  const { signal, ...fields } = input;
  return rpc<T>('workbench/query', { kind, query: fields }, signal);
}
const loadWorkflow = createWorkflowLoader((signal) => rpc('workflow/config', {}, signal));
export const workbenchHost: WorkbenchHost = {
  salesPlan: {
    draft: { invoke: ({ signal, ...input }) => rpc('sales-plan/draft', input, signal) },
    periods: {
      invoke: async (input) => {
        await loadWorkflow(input?.signal);
        return query('periods', input);
      },
    },
    list: { invoke: (input) => query('list', input) },
    detail: { invoke: (input) => query('detail', input) },
    versions: { invoke: (input) => query('versions', input) },
    logs: { invoke: (input) => query('logs', input) },
    versionSkus: { invoke: (input) => query('versionSkus', input) },
    compare: { invoke: (input) => query('compare', input) },
    action: { invoke: (input) => rpc('sales-plan/action', input) },
    submit: { invoke: (input) => rpc('sales-plan/submit', input) },
    approvalRoles: { invoke: (input) => rpc('approval/roles', {}, input?.signal) },
  },
  modelInference: {
    invoke: ({ signal, ...input }) => rpc('model/advice', input, signal),
  },
};
const host = workbenchHost;
const resubmitClient = {
  detail: host.salesPlan.detail,
  versionSkus: host.salesPlan.versionSkus,
  submit: host.salesPlan.submit,
  currentUser: {
    invoke: async () => {
      const state = await rpc<Status>('status');
      if (!state.user) throw new Error('LOGIN_REQUIRED');
      return { id: state.user.id, username: state.user.username };
    },
  },
};

const nativeLogin = {
  startLogin: (signal: AbortSignal, environment: Status['environment']) =>
    rpc<{ image: string; loginId: string; expiresIn: number }>(
      'login/start',
      { environment },
      signal,
    ),
  pollLogin: async (loginId: string, signal: AbortSignal) => {
    const result = await rpc<{ status: string }>('login/poll', { loginId }, signal);
    if (result.status === 'expired') throw Error('二维码已过期，请重新登录。');
    return result.status === 'authenticated';
  },
};

function requestErrorMessage(error: unknown, t: Translate): string {
  if (error instanceof BackendHttpError) {
    if (error.code === 'GEA_REQUEST_TIMEOUT') return t('requestTimeout');
    if (error.code === 'GEA_NETWORK_ERROR') return t('networkError');
    if (error.code === 'SNAPSHOT_TOO_LARGE') return t('analysisTooLarge');
    if (error.status === 401) return t('loginExpired');
    if (error.status === 403) return t('forbidden');
    if (error.code.startsWith('STALE_')) return t('stale');
  }
  return t('retry');
}

/** 只挂载真实 GEA 数据；未认证或查询失败时绝不切换到 fixture。 */
export function WorkbenchPage({ t }: { t: Translate }) {
  const [businessStatus, setBusinessStatus] = useState<{
    scope: string | null;
    value: Omit<Status, 'authenticated' | 'loginState' | 'user' | 'environment' | 'pageScope'>;
  }>();
  const setStatus = (value: Status) => {
    const {
      authenticated: _authenticated,
      loginState: _loginState,
      user: _user,
      environment: _environment,
      pageScope,
      ...business
    } = value;
    setBusinessStatus({ scope: pageScope, value: business });
  };
  const [identity, setIdentity] = useState<{
    state: 'unknown' | 'confirmed' | 'error';
    scope: string | null;
    status: Status | null;
  }>();
  const status: Status | undefined =
    identity?.state === 'confirmed' && identity.status && businessStatus?.scope === identity.scope
      ? {
          ...businessStatus.value,
          pageScope: identity.scope,
          environment: identity.status.environment,
          authenticated: identity.status.authenticated,
          loginState: identity.status.loginState,
          user: identity.status.user,
        }
      : undefined;
  const directApiLog = new URLSearchParams(window.location.search).get('view') === 'api-log';
  const [apiLogOpen, setApiLogOpen] = useState(directApiLog);
  const [workbenchRevision, setWorkbenchRevision] = useState(0);
  const [resubmit, setResubmit] = useState<{
    planId: string;
    versionId: string;
    period: GeaSalesPlanPeriod;
    visible: boolean;
    pending: boolean;
  }>();
  const updateResubmitPending = useCallback((pending: boolean) => {
    setResubmit((current) =>
      current && current.pending !== pending ? { ...current, pending } : current,
    );
  }, []);
  useEffect(() => {
    setResubmit(undefined);
    if (!directApiLog) setApiLogOpen(false);
  }, [
    directApiLog,
    status?.environment,
    status?.user?.id,
    status?.user?.tenantId,
    status?.pageScope,
  ]);
  const [statusError, setError] = useState('');
  const [pageConnection, setPageConnection] = useState<{ sessionId: string; owner: string } | null>(
    null,
  );
  const sessionId = pageConnection?.sessionId ?? null;
  const owner = pageConnection?.owner;
  useEffect(() => {
    if (!businessStatus) return;
    window.parent.postMessage(
      {
        type: 'gea:identity',
      },
      window.location.origin,
    );
  }, [businessStatus]);
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (
        event.origin === window.location.origin &&
        event.source === window.parent &&
        event.data?.type === 'gea:identity-snapshot'
      ) {
        const next = event.data.snapshot;
        if (next?.state === 'confirmed' || next?.state === 'unknown' || next?.state === 'error')
          setIdentity(next);
        return;
      }
      if (
        event.origin !== window.location.origin ||
        event.source !== window.parent ||
        event.data?.type !== 'workbench:session'
      )
        return;
      const value = event.data.sessionId;
      if (value === null) setPageConnection(null);
      else if (
        typeof value === 'string' &&
        /^session-[0-9a-f-]{36}$/.test(value) &&
        typeof event.data.owner === 'string'
      )
        setPageConnection({ sessionId: value, owner: event.data.owner });
    };
    window.addEventListener('message', onMessage);
    return () => {
      window.removeEventListener('message', onMessage);
    };
  }, []);
  const contextSequence = useRef(0);
  const contextRef = useRef('');
  const [conversationContext, setConversationContext] = useState<VisibleWorkbenchContext>();
  const [workbenchToolCall, setWorkbenchToolCall] = useState<{
    toolCallId: string;
    command: Record<string, unknown>;
  }>();
  // 页面桥的工具定义来自工作台当前这一屏上报的元素清单。
  const catalogElements = useRef<PageElement[]>([]);
  const quotedContext = useRef(conversationContext);
  quotedContext.current = conversationContext;
  useEffect(() => {
    if (!status?.authenticated || apiLogOpen) return;
    return mountPicker({
      describe: (_element, reference) => ({
        ...reference,
        scope: quotedContext.current
          ? `月份 ${quotedContext.current.scope.month} · 计划类型 ${quotedContext.current.scope.planType} · 审批阶段 ${quotedContext.current.scope.approvalStage} · 维度 ${quotedContext.current.scope.dimension ?? '当前页'}`
          : '',
      }),
    });
  }, [status?.authenticated, apiLogOpen]);
  // 组件执行完成后才向页面桥回填本次调用结果。
  const pendingToolResult = useRef<{
    toolCallId: string;
    resolve: (result: PageBridgeApplyResult) => void;
  }>();
  const onContextChange = useCallback((context: RegionalApprovalWorkbenchContext) => {
    const nextSequence = contextSequence.current + 1;
    const nextContext = visibleWorkbenchContext(context, nextSequence);
    const nextKey = nextContext ? JSON.stringify({ ...nextContext, sequence: 0 }) : '';
    if (nextKey !== contextRef.current) {
      contextRef.current = nextKey;
      contextSequence.current = nextSequence;
      setConversationContext(nextContext);
    }
  }, []);
  useEffect(() => {
    if (!sessionId) return;
    // 首次进入时 live 查询可能还在加载；不要把一个暂时为空的快照当成最终结果。
    // conversationContext 一旦产生会立即触发本 effect，后续分页/筛选也会持续同步。
    if (!conversationContext) return;
    let controller = new AbortController();
    const sync = () => {
      controller.abort();
      controller = new AbortController();
      void pageRpc(
        'context',
        { owner, parameters: conversationContext ?? null },
        controller.signal,
      ).catch(() => {
        // 上下文同步失败不能影响审批工作台；下一轮会自动重试。
      });
    };
    sync();
    // 定时重申：宿主重启或状态丢失后，页面不必等下一次操作就能恢复同步。
    const heartbeat = setInterval(sync, 15_000);
    return () => {
      clearInterval(heartbeat);
      controller.abort();
    };
  }, [conversationContext, sessionId, owner]);
  useEffect(() => {
    if (!sessionId) return;
    // 通用页面桥：取走 agent 发起的前端工具调用，交给工作台执行，再把结果回填。
    // 桥不可用不能影响审批工作台本身；参数怎么解释由本页的 apply 决定。
    return startPageBridgeClient({
      endpoint: 'catalog',
      request: (endpoint, payload) => pageRpc(endpoint, { owner, parameters: payload }),
      sessionId,
      apply: (args, meta, signal) =>
        new Promise<PageBridgeApplyResult>((resolve) => {
          const cancel = () => {
            if (pendingToolResult.current?.toolCallId !== meta.toolCallId) return;
            pendingToolResult.current = undefined;
            setWorkbenchToolCall(undefined);
          };
          signal.addEventListener('abort', cancel, { once: true });
          pendingToolResult.current = {
            toolCallId: meta.toolCallId,
            resolve: (result) => {
              signal.removeEventListener('abort', cancel);
              resolve(result);
            },
          };
          setWorkbenchToolCall({
            toolCallId: meta.toolCallId,
            command: (args ?? {}) as Record<string, unknown>,
          });
        }),
      // 页面自述能力：工具的定义与说明由桥按这份目录生成。
      // 只有"审批工作台"这一屏才报目录；切到迁移过来的插件页面时这一屏不是它，
      // 必须报 null，让宿主把上一屏的元素立刻注销（否则模型会对着上一屏下指令）。
      catalog: () => workbenchCatalog(catalogElements.current),
    });
  }, [sessionId, owner]);
  // 离开这一屏时（切页、切插件、切会话、关页面），把"当前这一屏"从宿主里撤掉：
  // 元素目录随桥的关闭撤掉，可见上下文在这里显式清空。
  useEffect(() => {
    if (!sessionId) return;
    return () => {
      void pageRpc('close', { owner }).catch(() => {});
    };
  }, [sessionId, owner]);
  useEffect(() => {
    if (identity?.state !== 'confirmed') return;
    const controller = new AbortController();
    void rpc<Status>('status', {}, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setStatus(value);
      })
      .catch((error) => {
        if (!controller.signal.aborted) setError(requestErrorMessage(error, t));
      });
    return () => {
      controller.abort();
    };
  }, [identity?.state, identity?.scope]);
  // 面板切换会重建本文档：首次 status 返回前先显示中性加载态，
  // 避免刚切进业务面板时闪出「扫码登录」页面。
  if (!status)
    return (
      <main className="gea-workbench-boot" aria-busy="true" aria-label={t('loading')}>
        {statusError && <p role="alert">{statusError}</p>}
        <span className="gea-wait-dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
      </main>
    );
  if (!status.authenticated)
    return <LoginSurface identity={identity!} account={nativeLogin} t={t} />;
  return (
    <div className="gea-workbench-document">
      {apiLogOpen ? (
        <ApiLogCenter
          key={status.pageScope ?? 'unconfirmed'}
          environment={status.environment}
          request={rpc}
          onClose={() => setApiLogOpen(false)}
        />
      ) : (
        <section className="gea-center-surface" aria-label="插件内容">
          <WorkbenchSessionProvider value={{ conversationId: sessionId }}>
            <div className="gea-original-workbench">
              {resubmit?.pending && !resubmit.visible && (
                <Alert
                  type="warning"
                  style={{ flexShrink: 0 }}
                  content={locale.t(
                    'common.assistantSurface.regionalApproval.liveSubmit.pendingNotice',
                    { plan: resubmit.planId },
                  )}
                  action={
                    <Button
                      onClick={() =>
                        setResubmit((current) =>
                          current ? { ...current, visible: true } : current,
                        )
                      }
                    >
                      {locale.t('common.assistantSurface.regionalApproval.liveSubmit.resume')}
                    </Button>
                  }
                />
              )}
              <RegionalApprovalWorkbench
                key={workbenchRevision}
                stateScope={`gea-dsh:${status.environment}:${status.user?.tenantId}:${status.user?.id}`}
                t={locale.t.bind(locale)}
                onContextChange={onContextChange}
                currentUserId={status.user?.id}
                approvalStages={salesPlanStagesForRoles(status.roles)}
                liveActionsEnabled={true}
                onResubmit={(planId, versionId, period) =>
                  setResubmit((current) =>
                    current?.pending
                      ? current.planId === planId
                        ? { ...current, visible: true }
                        : current
                      : { planId, versionId, period, visible: true, pending: false },
                  )
                }
                automaticAnalysisEnabled={true}
                onCatalogChange={(elements) => {
                  catalogElements.current = elements;
                }}
                toolCall={workbenchToolCall}
                onToolResult={(toolCallId, applied, error) => {
                  const pending = pendingToolResult.current;
                  if (!pending || pending.toolCallId !== toolCallId) return;
                  pendingToolResult.current = undefined;
                  pending.resolve({ applied, error });
                }}
              />
            </div>
          </WorkbenchSessionProvider>
        </section>
      )}
      {resubmit && (
        <RegionalApprovalResubmitDialog
          key={resubmit.versionId}
          {...resubmit}
          visible={resubmit.visible && !apiLogOpen}
          onPendingChange={updateResubmitPending}
          client={resubmitClient}
          connected={status?.resubmitConnected === true}
          t={locale.t.bind(locale)}
          onClose={(pending) =>
            setResubmit((current) =>
              pending && current ? { ...current, pending, visible: false } : undefined,
            )
          }
          onSucceeded={() => {
            setWorkbenchRevision((value) => value + 1);
          }}
        />
      )}
    </div>
  );
}
