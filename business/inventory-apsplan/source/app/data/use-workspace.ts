import { useEffect, useRef, useState } from 'react';
import { request, setLiveContext, onRefresh } from './host-bridge';
import { createGeaWorkspace } from './gea-workspace';
import { readMockWorkspace } from './mock-workspace';
import { deriveMetrics, type MetricData } from 'dsh-agent-manage/aps-compute/metrics';
type Data = MetricData & { readAt: string; limitations: string[] };
type ProductScope = { mode: 'category' | 'base'; categories: string[]; items: string[] };

type Result = {
  loadedScope?: ProductScope;
  sourcePending?: { current?: string[]; previous?: string[]; annual?: string[] };
  key: string;
  data: Data | null;
  previous: Data | null;
  annual: Data | null;
  error: string;
  busy: boolean;
  comparisonBusy: boolean;
};

function retainLoadingSections(next: Data, previous: Data | null): Data {
  if (!previous) return next;
  return {
    ...next,
    sections: next.sections.map((section) =>
      section.status === 'loading'
        ? (previous.sections.find((old) => old.id === section.id) ?? section)
        : section,
    ),
  };
}
export function useWorkspace(
  enabled: boolean,
  date: string,
  granularity: string,
  summary = false,
  detailMode?: 'organization' | 'product',
  productScope?: ProductScope,
  { paused = false }: { paused?: boolean } = {},
) {
  const periodKey = JSON.stringify([date, granularity, summary, detailMode, productScope?.mode]);

  const requested = useRef({ periodKey, categories: new Set<string>(), items: new Set<string>() });
  if (requested.current.periodKey !== periodKey)
    requested.current = { periodKey, categories: new Set(), items: new Set() };
  for (const category of productScope?.categories ?? []) requested.current.categories.add(category);
  for (const item of productScope?.items ?? []) requested.current.items.add(item);
  const requestedScope = productScope && {
    mode: productScope.mode,
    categories: [...requested.current.categories].sort(),
    items: [...requested.current.items].sort(),
  };
  const key = JSON.stringify([periodKey, requestedScope]);
  const samePeriod = (otherKey: string) => !!otherKey && JSON.parse(otherKey)[0] === periodKey;
  const [result, setResult] = useState<Result>({
    key: '',
    data: null,
    previous: null,
    annual: null,
    error: '',
    busy: false,
    comparisonBusy: false,
  });
  const reader = useRef<{
    periodKey: string;
    workspace: ReturnType<typeof createGeaWorkspace>;
  } | null>(null);
  const generation = useRef(0);
  const lastData = useRef({ key: result.key, data: result.data });
  lastData.current = { key: result.key, data: result.data };
  useEffect(() => {
    if (!enabled) {
      reader.current = null;
      lastData.current = { key: '', data: null };
      setResult((old) =>
        old.data
          ? {
              ...old,
              data: null,
              previous: null,
              annual: null,
              error: '',
              busy: false,
              comparisonBusy: false,
            }
          : old,
      );
      return;
    }
    let active = true;
    let controller: AbortController | undefined;
    const input = {
      date,
      granularity,
      summary,
      detailMode,
      productScope: requestedScope,
      version: '滚动',
      orderType: 'M',
    };
    async function load(refresh = false, externalSignal?: AbortSignal) {
      if (paused) return;
      controller?.abort();
      controller = new AbortController();
      const signal = externalSignal
        ? AbortSignal.any([controller.signal, externalSignal])
        : controller.signal;
      if (refresh || reader.current?.periodKey !== periodKey)
        reader.current = { periodKey, workspace: createGeaWorkspace(request) };
      const workspace = APS_MOCK ? readMockWorkspace : reader.current!.workspace;
      const id = ++generation.current;
      const current = () => active && id === generation.current && !signal.aborted;
      let loaded: Data | null = samePeriod(lastData.current.key) ? lastData.current.data : null;
      function publish(data: Data, busy: boolean) {
        const sourcePending = data.sections
          .filter(
            (section) =>
              busy &&
              (section.status === 'loading' ||
                ((section as { partial?: boolean }).partial && !section.error)),
          )
          .map((section) => section.id);
        data = retainLoadingSections(data, loaded);
        loaded = data;
        const failures = data.sections.filter((section) => section.status === 'error');
        const error = failures
          .map(
            (section: {
              id: string;
              label?: string;
              error?: { code?: string; message?: string };
            }) =>
              `${section.label || section.id}：${section.error?.message || '读取失败'}（${section.error?.code || 'QUERY_FAILED'}）`,
          )
          .join('；');
        setResult((old) => ({
          key,
          data,
          error,
          busy,
          loadedScope: samePeriod(old.key) ? old.loadedScope : undefined,
          sourcePending: { ...old.sourcePending, current: sourcePending },
          comparisonBusy: samePeriod(old.key) && old.comparisonBusy,
          previous: samePeriod(old.key) ? old.previous : null,
          annual: samePeriod(old.key) ? old.annual : null,
        }));
        setLiveContext(
          {
            realData: !APS_MOCK,
            simulated: APS_MOCK,
            status: busy ? 'loading' : failures.length ? 'partial' : APS_MOCK ? 'mock' : 'ready',
            period: input,
            readAt: data.readAt,
            metrics: deriveMetrics(data),
            sources: data.sections.map(({ rows, ...section }) => ({
              ...section,
              groups: rows.length,
            })),
            limitations: data.limitations,
          },
          data,
        );
      }
      setResult((old) =>
        samePeriod(old.key)
          ? { ...old, key, sourcePending: undefined, error: '', busy: true, comparisonBusy: true }
          : {
              key,
              data: null,
              previous: null,
              annual: null,
              error: '',
              busy: true,
              comparisonBusy: true,
            },
      );
      setLiveContext({ realData: !!loaded, status: 'loading', period: input });
      try {
        const dataRead = workspace({
          ...input,
          refresh,
          signal,
          onProgress: (data: Data) => {
            if (current()) publish(data, true);
          },
        });
        const comparisonRead = workspace({
          ...input,
          comparison: true,
          refresh,
          signal,
          onComparison: (comparison: any) => {
            if (current())
              setResult((r) => ({
                ...r,
                sourcePending: {
                  ...r.sourcePending,
                  ...(comparison.previous && {
                    previous: comparison.previous.sections
                      .filter((section: any) => section.status === 'loading')
                      .map((section: any) => section.id),
                  }),
                  ...(comparison.annual && {
                    annual: comparison.annual.sections
                      .filter((section: any) => section.status === 'loading')
                      .map((section: any) => section.id),
                  }),
                },
                ...(comparison.previous && {
                  previous: retainLoadingSections(comparison.previous, r.previous),
                }),
                ...(comparison.annual && {
                  annual: retainLoadingSections(comparison.annual, r.annual),
                }),
              }));
          },
        }).then(
          (comparison) => ({ comparison }),
          (error) => ({ error }),
        );
        const data: Data = await dataRead;
        if (!current()) return;
        publish(data, false);
        const comparisonResult = await comparisonRead;
        if (!current()) return;
        if ('comparison' in comparisonResult)
          setResult((r) => ({
            ...r,
            ...comparisonResult.comparison,
            comparisonBusy: false,
            loadedScope: requestedScope,
            sourcePending: { ...r.sourcePending, previous: [], annual: [] },
          }));
        else
          setResult((r) => ({
            ...r,
            comparisonBusy: false,
            loadedScope: requestedScope,
            sourcePending: { ...r.sourcePending, previous: [], annual: [] },
            error: [r.error, '对比期读取失败：' + String(comparisonResult.error)]
              .filter(Boolean)
              .join('；'),
          }));
      } catch (error) {
        if (signal.aborted && active && id === generation.current) {
          setResult({
            key,
            data: null,
            previous: null,
            annual: null,
            error: '读取已取消',
            busy: false,
            comparisonBusy: false,
          });
          setLiveContext({ realData: false, status: 'cancelled', period: input });
        } else if (current()) {
          setResult({
            key,
            data: loaded,
            previous: null,
            annual: null,
            error: String(error),
            busy: false,
            comparisonBusy: false,
          });
          setLiveContext({
            realData: !!loaded,
            status: 'error',
            period: input,
            error: String(error),
          });
        }
      }
    }
    const logout = () => {
      reader.current = null;
      lastData.current = { key: '', data: null };
      controller?.abort();
      ++generation.current;
      setLiveContext({ realData: false, status: 'identity-changed', period: input });
      setResult({
        key,
        data: null,
        previous: null,
        annual: null,
        error: '登录状态变化，请重新打开工作台',
        busy: false,
        comparisonBusy: false,
      });
    };
    window.addEventListener('aps-identity-changed', logout);
    const sessionChanged = () => {
      logout();
      void load();
    };
    window.addEventListener('gea-session-changing', logout);
    window.addEventListener('gea-session-changed', sessionChanged);
    const releaseRefresh = onRefresh((signal) => load(true, signal));
    void load();
    return () => {
      active = false;
      releaseRefresh();
      controller?.abort();
      ++generation.current;
      window.removeEventListener('aps-identity-changed', logout);
      window.removeEventListener('gea-session-changing', logout);
      window.removeEventListener('gea-session-changed', sessionChanged);
    };
  }, [enabled, key, date, granularity, summary, detailMode, paused]);
  const visible =
    result.key === key
      ? result
      : samePeriod(result.key)
        ? { ...result, key, sourcePending: undefined, busy: enabled, comparisonBusy: enabled }
        : {
            key,
            data: null,
            previous: null,
            annual: null,
            error: '',
            busy: enabled,
            comparisonBusy: enabled,
          };
  return {
    ...visible,
    loadingScope:
      enabled && (visible.busy || visible.comparisonBusy) && requestedScope
        ? {
            mode: requestedScope.mode,
            categories: requestedScope.categories.filter(
              (value) => !visible.loadedScope?.categories.includes(value),
            ),
            items: requestedScope.items.filter(
              (value) => !visible.loadedScope?.items.includes(value),
            ),
          }
        : undefined,
  };
}
