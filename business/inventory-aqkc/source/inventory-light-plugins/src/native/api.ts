import { clearReadCache } from '../data';
import { startConfiguredStockReadCycle } from '../configured-stock';
import * as engines from '../aqkc-engine';
import { updateContext } from './context';
declare const PLUGIN_ID: string;
const engine = engines as any;
async function dispatch(url: URL, method: string, body: any, signal?: AbortSignal) {
  const p = url.searchParams,
    path = url.pathname;
  if (PLUGIN_ID === 'aqkc') {
    if (path === '/api/inventory/daily-report' && method === 'GET') {
      const base = p.get('base');
      if (!base || base.length > 80) throw Error('请选择日报基地');
      const report = await engine.loadDailyReport([base]);
      updateContext('dailyReport', report);
      return {
        report,
        cacheHit: false,
        feedback: {
          available: false,
          entries: [],
          warning: '暂不支持保存日报反馈。',
        },
      };
    }

    if (path === '/api/inventory/dashboard') {
      const base = p.get('base');
      return {
        workspace: await engine.load(
          undefined,
          undefined,
          signal,
          base ? base.split(',') : undefined,
        ),
      };
    }
    if (path === '/api/inventory/dashboard-tabs')
      return {
        tabs: await engine.loadInventoryDashboardTabs(
          undefined,
          p.get('base') ?? undefined,
          p.get('category') ?? undefined,
          p.get('tab') ?? undefined,
          undefined,
          signal,
          p.get('level') ?? undefined,
        ),
      };
    if (path === '/api/inventory/sku-page' && method === 'POST')
      return engine.loadInventorySkuPage(body, signal);
    if (path === '/api/inventory/details')
      return {
        page: await engine.loadSafetyStockDetailPage(
          undefined,
          body.filters,
          body.offset ?? 0,
          body.pageSize ?? 10,
          undefined,
          signal,
        ),
      };
  }
  throw Error('暂不支持此操作，业务数据未保存或提交。');
}
export async function mountBusinessFetch() {
  let lifetime = new AbortController();
  startConfiguredStockReadCycle(lifetime.signal);
  window.addEventListener('light-refresh', () => {
    lifetime.abort();
    lifetime = new AbortController();
    startConfiguredStockReadCycle(lifetime.signal);
  });
  window.addEventListener('gea-identity-changed', () => lifetime.abort());
  window.fetch = async (input: any, init: any = {}) => {
    const signal = init.signal ? AbortSignal.any([lifetime.signal, init.signal]) : lifetime.signal;
    const url = new URL(
      input instanceof Request ? input.url : String(input),
      'https://html-plugin.local',
    );
    if (url.origin !== 'https://html-plugin.local')
      throw Error('当前数据访问方式不可用，请重新打开工作台。');
    const method = init.method ?? (input instanceof Request ? input.method : 'GET');
    let body = {};
    if (init.body) body = JSON.parse(String(init.body));
    signal.throwIfAborted();
    try {
      const result = await dispatch(url, method, body, signal);
      signal.throwIfAborted();
      return Response.json(result);
    } catch (e) {
      if (signal.aborted) throw e;
      const message = (e as Error).message;
      if (typeof document !== 'undefined' && document.getElementById('agent-sql-direct'))
        console.error('LOCAL_SQL_PAGE_READ_FAILED', (e as any).code ?? 'PAGE_READ_FAILED', message);
      return Response.json(
        {
          error: message,
          message,
          code: (e as any).code ?? (e as any).errorCode,
          failure: (e as any).failure,
          returnedColumns: (e as any).returnedColumns,
          rejectedColumns: (e as any).rejectedColumns,
          errors: (e as any).errors,
          recoverable: true,
          sampleFallback: false,
        },
        { status: 503 },
      );
    }
  };
}
export function clearBusinessCache(_identityChanged = false) {
  clearReadCache();
}
