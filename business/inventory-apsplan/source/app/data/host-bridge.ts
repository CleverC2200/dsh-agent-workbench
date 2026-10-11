import { call, draft, publish, action, ready } from '../../../../shared/channel.js';
import { pageAnalysisPolicy } from 'dsh-agent-manage/aps-compute/page-analysis';
let query: Record<string, any> = {
  mode: 'gea-governed-sql',
  realData: false,
  status: 'loading',
};
let view: Record<string, any> | undefined;
let queryData: unknown, viewData: unknown;
let revision = 0;
let refresher: ((signal?: AbortSignal) => Promise<unknown>) | undefined;
const samePeriod = () =>
  view &&
  query.period?.date === view.period?.date &&
  query.period?.granularity === view.period?.granularity;
export function context() {
  const periodMatches = samePeriod(),
    preview = view?.preview === true;
  const isCurrentDataset =
    periodMatches &&
    !view?.pending &&
    !preview &&
    (query.realData === true || query.simulated === true) &&
    queryData !== undefined &&
    queryData === viewData;
  let status = query.status;
  if (preview) status = 'preview';
  else if (
    query.status !== 'identity-changed' &&
    (!periodMatches || view?.pending || (query.realData === true && !isCurrentDataset))
  )
    status = 'loading';
  return {
    plugin: 'inventory-apsplan',
    simulated: !!(isCurrentDataset && query.simulated),
    realWriteback: false,
    mode: preview ? 'prototype-preview' : query.simulated ? 'APS_MOCK' : 'gea-governed-sql',
    realData: !!(isCurrentDataset && query.realData),
    status,
    period: { ...query.period, ...view?.period },
    scope: view?.scope ?? {},
    selection: isCurrentDataset ? view?.selection : undefined,
    workspace: view?.workspace,
    analysisScope: view?.analysisScope,
    filters: view?.filters,
    readAt: isCurrentDataset ? query.readAt : undefined,
    metrics: isCurrentDataset ? (view?.metrics ?? query.metrics) : {},
    sources: isCurrentDataset ? (view?.sources ?? query.sources) : [],
    missing: isCurrentDataset ? view?.missing : undefined,
    comparison: isCurrentDataset ? view?.comparison : undefined,
    error: periodMatches && !preview && !view?.pending ? query.error : undefined,
    analysisPolicy: pageAnalysisPolicy,
    limitations: isCurrentDataset
      ? query.limitations
      : ['当前范围尚无可用证据；真实查询与原型预览分开。'],
    capturedAt: new Date().toISOString(),
  };
}
export function request(
  method: string,
  parameters: unknown,
  options: { signal?: AbortSignal } = {},
) {
  if (method !== 'sql') throw Error('APS_METHOD_NOT_ALLOWED');
  if (!parameters || typeof parameters !== 'object' || Array.isArray(parameters))
    throw Error('APS_SQL_REQUEST_INVALID');
  return call(method, parameters, options);
}
export async function askHost(text: string, references: unknown[] = []) {
  const evidence = { ...context(), references };
  if (!evidence.realData && !evidence.simulated) throw Error('当前页面暂无同范围可用数据');
  const captured = revision;
  await publish(evidence);
  if (captured !== revision) throw Error('APS_REFERENCE_WITHDRAWN');
  const quoted = (references as Array<{ label?: string; summary?: string }>)
    .map((item) => `【${item.label}】${item.summary}`)
    .join('\n');
  await draft(
    `${evidence.simulated ? '[APS 固定模拟数据，未真实读取或回写]\n' : ''}${text}${quoted ? '\n\n当前页面引用：\n' + quoted : ''}`,
  );
  return { text: '已加入当前会话的未发送草稿。' };
}
export function setLiveContext(value: Record<string, unknown>, data?: unknown) {
  ++revision;
  query = value;
  queryData = data;
  void publish(context()).catch(() => {});
}
export function setViewContext(value: Record<string, unknown>, data?: unknown) {
  ++revision;
  view = value;
  viewData = data;
  void publish(context()).catch(() => {});
}
export async function acknowledgePendingView(
  requested: Record<string, unknown>,
  options: { signal?: AbortSignal } = {},
) {
  const previous = view;
  const pendingRevision = ++revision;
  view = { ...view, pending: true, requested };
  try {
    await publish(context(), options);
    options.signal?.throwIfAborted();
  } catch (error) {
    if (revision === pendingRevision) {
      view = previous;
      ++revision;
      await publish(context());
    }
    throw error;
  }
}
export function onRefresh(callback: (signal?: AbortSignal) => Promise<unknown>) {
  refresher = callback;
  return () => {
    if (refresher === callback) refresher = undefined;
  };
}
async function refresh(_input: unknown = {}, options: { signal?: AbortSignal } = {}) {
  if (!refresher) throw Error('当前经营页面未就绪');
  options.signal?.throwIfAborted();
  ++revision;
  query = {
    ...query,
    realData: false,
    simulated: false,
    status: 'loading',
    metrics: {},
    sources: [],
  };
  queryData = undefined;
  await publish(context(), options);
  options.signal?.throwIfAborted();
  await refresher(options.signal);
  options.signal?.throwIfAborted();
  return { refreshed: true };
}
void ready.then(() => action('refresh', '重新读取当前范围的产销经营数据', refresh));
if (typeof window !== 'undefined') {
  window.addEventListener('gea-page-refresh', () => void refresh().catch(() => {}));
  const withdraw = () => {
    ++revision;
    queryData = undefined;
    viewData = undefined;
    query = { realData: false, status: 'identity-changed' };
    view = undefined;
    window.dispatchEvent(new Event('aps-identity-changed'));
  };
  window.addEventListener('gea-identity-changed', withdraw);
  window.addEventListener('gea-session-changing', withdraw);
}
