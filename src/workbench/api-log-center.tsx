import {
  Api,
  Clear,
  Close,
  Copy,
  Delete,
  Refresh,
  ReplayMusic,
  Search,
  Sync,
} from '@icon-park/react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  ApiCatalogEntry,
  ApiLogRecord,
  ApiLogSnapshot,
  ApiReplayResult,
} from './api-log-contract.ts';

import { ApiLogBatchPanel } from './api-log-batch.tsx';

type Rpc = <T>(endpoint: string, payload?: object, signal?: AbortSignal) => Promise<T>;

type Props = {
  environment: 'production' | 'test';
  onClose(): void;
  request: Rpc;
};

type OutcomeFilter = 'all' | 'error';
type MainTab = 'api' | 'permission' | 'agent';
const mainTabs = [
  { id: 'api', label: '接口' },
  { id: 'permission', label: '权限' },
  { id: 'agent', label: 'Agent' },
] satisfies { id: MainTab; label: string }[];

const methodClass = (method: string) =>
  method === 'GET' ? 'is-get' : method === 'POST' ? 'is-post' : '';

const displayTime = (value: string) =>
  new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(value));

const pretty = (value: unknown) =>
  value == null ? '无' : typeof value === 'string' ? value : JSON.stringify(value, null, 2);

const replayNote = (record: ApiLogRecord, catalog: ApiCatalogEntry | undefined) => {
  if (record.replayAvailable) return catalog?.replayNote ?? '该请求可在当前身份内重发';
  if (record.replayPolicy === 'blocked') return catalog?.replayNote ?? '该调用未登记，不能重发';
  return '当前身份、环境或原请求条件已失效，不能重发';
};

function Outcome({ record }: { record: ApiLogRecord }) {
  const label = record.response
    ? `HTTP ${record.response.status}`
    : record.outcome === 'pending'
      ? '进行中'
      : '传输失败';
  return <span className={`gea-api-outcome is-${record.outcome}`}>{label}</span>;
}

function CodeBlock({
  title,
  value,
  onCopy,
  copyValue = value,
  children,
}: {
  title: string;
  value: unknown;
  onCopy(value: unknown): void;
  copyValue?: unknown;
  children?: React.ReactNode;
}) {
  return (
    <section className="gea-api-code-section">
      <div className="gea-api-code-heading">
        <h3>{title}</h3>
        <button
          type="button"
          onClick={() => onCopy(copyValue)}
          title={`复制${title}`}
          aria-label={`复制${title}`}
        >
          <Copy size={15} />
          复制
        </button>
      </div>
      {children}
      <pre tabIndex={0}>{pretty(value)}</pre>
    </section>
  );
}

function ApiDefinition({ entry }: { entry: ApiCatalogEntry }) {
  return (
    <details className="gea-api-contract">
      <summary>查看接口定义与请求字段</summary>
      <p>{entry.description}</p>
      {entry.requestFields.length ? (
        <div className="gea-api-field-list">
          {entry.requestFields.map((field) => (
            <code key={field}>{field}</code>
          ))}
        </div>
      ) : (
        <p>无业务请求字段</p>
      )}
    </details>
  );
}

export function ApiLogCenter({ environment, onClose, request }: Props) {
  const [activeTab, setActiveTab] = useState<MainTab>('api');
  const [snapshot, setSnapshot] = useState<ApiLogSnapshot>();
  const [selectedCatalog, setSelectedCatalog] = useState<string>('all');
  const [selectedRecord, setSelectedRecord] = useState<string>();
  const [search, setSearch] = useState('');
  const [outcomeFilter, setOutcomeFilter] = useState<OutcomeFilter>('all');
  const [live, setLive] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [batchMode, setBatchMode] = useState(false);
  const [batchSelected, setBatchSelected] = useState<string[]>([]);
  const [batchBusy, setBatchBusy] = useState(false);
  const [sourceFilter, setSourceFilter] = useState('all');
  const pageController = useMemo(() => new AbortController(), [environment, request]);
  const pageSignal = pageController.signal;
  const [busyReplay, setBusyReplay] = useState('');
  const [confirmReplay, setConfirmReplay] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);
  const [copied, setCopied] = useState('');
  const refreshing = useRef(false);
  const centerRef = useRef<HTMLElement>(null);
  const detailRef = useRef<HTMLElement>(null);

  useEffect(() => () => pageController.abort(), [pageController]);
  useEffect(() => {
    centerRef.current?.focus();
  }, []);

  const refresh = useCallback(
    async (signal?: AbortSignal, silent = false) => {
      if (refreshing.current) return;
      refreshing.current = true;
      if (!silent) setLoading(true);
      try {
        const next = await request<ApiLogSnapshot>('api-log/snapshot', {}, signal);
        if (signal?.aborted || pageSignal.aborted) return;
        setSnapshot(next);
        setError('');
        setSelectedRecord((current) =>
          current && next.records.some((record) => record.id === current)
            ? current
            : next.records[0]?.id,
        );
      } catch (cause) {
        if (!signal?.aborted) setError(cause instanceof Error ? cause.message : '接口日志加载失败');
      } finally {
        refreshing.current = false;
        if (!silent && !pageSignal.aborted && !signal?.aborted) setLoading(false);
      }
    },
    [request, pageSignal],
  );

  useEffect(() => {
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, pageSignal]);
    void refresh(signal);
    const timer = live ? window.setInterval(() => void refresh(signal, true), 1500) : undefined;
    return () => {
      controller.abort();
      if (timer !== undefined) window.clearInterval(timer);
    };
  }, [live, refresh, pageSignal]);

  const counts = useMemo(() => {
    const result = new Map<string, number>();
    for (const record of snapshot?.records ?? [])
      if (record.catalogId) result.set(record.catalogId, (result.get(record.catalogId) ?? 0) + 1);
    return result;
  }, [snapshot]);

  const groups = useMemo(() => {
    const result = new Map<string, ApiCatalogEntry[]>();
    for (const entry of snapshot?.catalog ?? []) {
      const values = result.get(entry.group) ?? [];
      values.push(entry);
      result.set(entry.group, values);
    }
    return [...result];
  }, [snapshot]);

  const filteredRecords = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return (snapshot?.records ?? []).filter((record) => {
      if (sourceFilter !== 'all' && record.source !== sourceFilter) return false;
      if (selectedCatalog !== 'all' && record.catalogId !== selectedCatalog) return false;
      if (outcomeFilter === 'error' && record.outcome !== 'error') return false;
      if (!keyword) return true;
      return [
        record.catalogName,
        record.group,
        record.request.method,
        record.request.url,
        record.id,
        record.request.headers['x-request-id'],
        record.response?.headers['x-request-id'],
        record.response?.status,
        record.error?.message,
      ]
        .join(' ')
        .toLowerCase()
        .includes(keyword);
    });
  }, [outcomeFilter, search, selectedCatalog, snapshot, sourceFilter]);

  const activeRecord =
    filteredRecords.find((record) => record.id === selectedRecord) ?? filteredRecords[0];
  const activeCatalog = snapshot?.catalog.find((entry) => entry.id === activeRecord?.catalogId);
  const selectedCatalogEntry = snapshot?.catalog.find((entry) => entry.id === selectedCatalog);

  const copy = useCallback(async (value: unknown) => {
    try {
      await navigator.clipboard.writeText(pretty(value));
      setCopied('已复制');
      window.setTimeout(() => setCopied(''), 1200);
    } catch {
      setCopied('复制失败');
    }
  }, []);

  const replay = useCallback(
    async (record: ApiLogRecord) => {
      setBusyReplay(record.id);
      setError('');
      try {
        const result = await request<ApiReplayResult>(
          'api-log/replay',
          {
            id: record.id,
            confirmed: record.replayPolicy === 'idempotent',
          },
          pageSignal,
        );
        if (pageSignal.aborted) return;
        setConfirmReplay('');
        await refresh(pageSignal, true);
        if (pageSignal.aborted) return;
        if (result.recordId) {
          setSelectedCatalog('all');
          setSearch('');
          setOutcomeFilter('all');
          setSourceFilter('all');
          setSelectedRecord(result.recordId);
        }
        if (result.outcome !== 'replayed')
          setError(
            ('reason' in result ? result.reason : '重发失败') +
              (result.outcome === 'rejected'
                ? '，无调用日志'
                : result.resultUnknown
                  ? '，结果未确认'
                  : ''),
          );
      } catch (cause) {
        if (!pageSignal.aborted) setError(cause instanceof Error ? cause.message : '重发失败');
      } finally {
        if (!pageSignal.aborted) setBusyReplay('');
      }
    },
    [refresh, request, pageSignal],
  );

  const showBatchLogs = useCallback(
    (id?: string) => {
      void refresh(pageSignal, true);
      if (id && !pageSignal.aborted) {
        setSelectedCatalog('all');
        setSearch('');
        setOutcomeFilter('all');
        setSourceFilter('all');
        setSelectedRecord(id);
      }
    },
    [refresh, pageSignal],
  );

  const clear = useCallback(async () => {
    setLoading(true);
    try {
      const next = await request<ApiLogSnapshot>('api-log/clear', {}, pageSignal);
      if (pageSignal.aborted) return;
      setSnapshot(next);
      setSelectedRecord(undefined);
      setConfirmClear(false);
      setError('');
    } catch (cause) {
      if (!pageSignal.aborted) setError(cause instanceof Error ? cause.message : '清空失败');
    } finally {
      if (!pageSignal.aborted) setLoading(false);
    }
  }, [request, pageSignal]);

  const selectRecord = useCallback((id: string) => {
    setSelectedRecord(id);
    if (!window.matchMedia('(max-width: 1000px)').matches) return;
    window.requestAnimationFrame(() => {
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      detailRef.current?.scrollIntoView({
        behavior: reducedMotion ? 'auto' : 'smooth',
        block: 'start',
      });
      detailRef.current?.focus({ preventScroll: true });
    });
  }, []);

  return (
    <main ref={centerRef} className="gea-api-log-center" tabIndex={-1}>
      <header className="gea-api-main-header">
        <h1 className="sr-only">接口日志中心</h1>
        <nav className="gea-api-main-tabs" role="tablist" aria-label="调试中心">
          {mainTabs.map((tab, index) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`gea-debug-tab-${tab.id}`}
              aria-controls={`gea-debug-panel-${tab.id}`}
              aria-selected={activeTab === tab.id}
              tabIndex={activeTab === tab.id ? 0 : -1}
              onClick={() => setActiveTab(tab.id)}
              onKeyDown={(event) => {
                const next =
                  event.key === 'Home'
                    ? mainTabs[0]
                    : event.key === 'End'
                      ? mainTabs[mainTabs.length - 1]
                      : event.key === 'ArrowRight'
                        ? mainTabs[(index + 1) % mainTabs.length]
                        : event.key === 'ArrowLeft'
                          ? mainTabs[(index + mainTabs.length - 1) % mainTabs.length]
                          : undefined;
                if (!next) return;
                event.preventDefault();
                setActiveTab(next.id);
                document.getElementById(`gea-debug-tab-${next.id}`)?.focus();
              }}
            >
              {tab.label}
            </button>
          ))}
        </nav>
        <span className="gea-api-context">
          {environment === 'production' ? '生产环境' : '测试环境'} · 当前缓冲区最多{' '}
          {snapshot?.limit ?? 500} 条
        </span>
        <button
          type="button"
          className="gea-api-close"
          onClick={() => {
            pageController.abort();
            onClose();
          }}
        >
          <Close size={15} />
          返回工作台
        </button>
      </header>
      <section
        className="gea-api-panel"
        role="tabpanel"
        id="gea-debug-panel-api"
        aria-labelledby="gea-debug-tab-api"
        hidden={activeTab !== 'api'}
      >
        <header className="gea-api-log-header" aria-label="调用日志工具栏">
          <div className="gea-api-log-actions">
            <div className="gea-api-search">
              <label>
                <Search size={16} />
                <span className="sr-only">搜索调用记录</span>
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="接口、地址、状态、请求 ID"
                />
              </label>
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  title="清空搜索"
                  aria-label="清空搜索"
                >
                  <Clear size={14} />
                </button>
              )}
            </div>
            <div className="gea-api-filter-tabs" aria-label="传输状态筛选">
              <button
                type="button"
                className={outcomeFilter === 'all' ? 'is-active' : ''}
                onClick={() => setOutcomeFilter('all')}
                aria-pressed={outcomeFilter === 'all'}
              >
                全部
              </button>
              <button
                type="button"
                className={outcomeFilter === 'error' ? 'is-active' : ''}
                onClick={() => setOutcomeFilter('error')}
                aria-pressed={outcomeFilter === 'error'}
              >
                传输失败
              </button>
            </div>
            <select
              aria-label="调用来源"
              value={sourceFilter}
              onChange={(event) => setSourceFilter(event.target.value)}
            >
              <option value="all">全部来源</option>
              <option value="daily">日常调用</option>
              <option value="replay">单次重发</option>
              <option value="api-batch">批量重发</option>
            </select>
            <button
              type="button"
              className={live ? 'is-active' : ''}
              aria-pressed={live}
              onClick={() => setLive((value) => !value)}
              title={live ? '暂停实时刷新' : '开启实时刷新'}
            >
              <Sync size={16} spin={live && loading} />
              {live ? '实时' : '已暂停'}
            </button>
            <button type="button" onClick={() => void refresh()} disabled={loading}>
              <Refresh size={16} spin={loading} />
              刷新
            </button>
            <button
              type="button"
              onClick={() => setConfirmClear(true)}
              disabled={!snapshot?.records.length || batchBusy || !!busyReplay}
            >
              <Delete size={16} />
              清空
            </button>
          </div>
        </header>

        {confirmClear && (
          <div className="gea-api-inline-confirm" role="alert">
            <span>只清空当前进程内的脱敏记录，不影响接口目录和业务数据。</span>
            <button type="button" onClick={() => void clear()}>
              确认清空
            </button>
            <button type="button" onClick={() => setConfirmClear(false)}>
              取消
            </button>
          </div>
        )}
        {error && (
          <div className="gea-api-error" role="alert">
            {error}
          </div>
        )}

        <div className="gea-api-layout">
          <nav className="gea-api-catalog" aria-label="接口目录">
            <div className="gea-api-pane-heading">
              <div>
                <h2>接口目录</h2>
                <span>{snapshot?.catalog.length ?? 0} 个已登记接口</span>
              </div>
              <button
                type="button"
                aria-pressed={batchMode}
                disabled={batchBusy || !!busyReplay}
                onClick={() => setBatchMode((value) => !value)}
              >
                批量
              </button>
            </div>
            {batchMode && (
              <label className="gea-api-batch-select">
                <input
                  type="checkbox"
                  aria-label="全选接口"
                  checked={
                    !!snapshot?.catalog.length && batchSelected.length === snapshot.catalog.length
                  }
                  disabled={batchBusy}
                  onChange={(event) =>
                    setBatchSelected(
                      event.target.checked
                        ? (snapshot?.catalog.map((entry) => entry.id) ?? [])
                        : [],
                    )
                  }
                />
                全选
              </label>
            )}
            <button
              type="button"
              className={`gea-api-catalog-item${selectedCatalog === 'all' ? ' is-selected' : ''}`}
              onClick={() => setSelectedCatalog('all')}
              aria-pressed={selectedCatalog === 'all'}
            >
              <span className="gea-api-method">ALL</span>
              <span>全部调用</span>
              <strong>{snapshot?.records.length ?? 0}</strong>
            </button>
            <div className="gea-api-catalog-scroll">
              {groups.map(([group, entries]) => (
                <section key={group}>
                  <h3>{group}</h3>
                  {entries.map((entry) => (
                    <div className="gea-api-catalog-selection" key={entry.id}>
                      {batchMode && (
                        <input
                          type="checkbox"
                          aria-label={`选择${entry.name}`}
                          checked={batchSelected.includes(entry.id)}
                          disabled={batchBusy}
                          onChange={(event) =>
                            setBatchSelected(
                              event.target.checked
                                ? [...batchSelected, entry.id]
                                : batchSelected.filter((id) => id !== entry.id),
                            )
                          }
                        />
                      )}
                      <button
                        type="button"
                        className={`gea-api-catalog-item${selectedCatalog === entry.id ? ' is-selected' : ''}`}
                        onClick={() => setSelectedCatalog(entry.id)}
                        aria-pressed={selectedCatalog === entry.id}
                        title={`${entry.description} ${entry.replayNote}`}
                      >
                        <span className={`gea-api-method ${methodClass(entry.method)}`}>
                          {entry.method}
                        </span>
                        <span>{entry.name}</span>
                        <strong>{counts.get(entry.id) ?? 0}</strong>
                      </button>
                    </div>
                  ))}
                </section>
              ))}
            </div>
          </nav>

          <section className="gea-api-call-list" aria-label="调用记录">
            <div className="gea-api-pane-heading">
              <div>
                <h2>调用记录</h2>
                <span>{filteredRecords.length} 条匹配记录</span>
              </div>
            </div>
            {batchMode && (
              <ApiLogBatchPanel
                snapshot={snapshot}
                selected={batchSelected}
                request={request}
                onBusy={setBatchBusy}
                onLogs={showBatchLogs}
                onError={setError}
                pageSignal={pageSignal}
              />
            )}
            <div className="gea-api-call-scroll">
              <div className="gea-api-call-columns" aria-hidden="true">
                <span>时间</span>
                <span>接口 / 请求 ID</span>
                <span>传输状态</span>
                <span>耗时</span>
              </div>
              {loading && !snapshot ? (
                <div className="gea-api-empty" role="status">
                  正在加载接口调用…
                </div>
              ) : filteredRecords.length ? (
                filteredRecords.map((record) => (
                  <button
                    type="button"
                    key={record.id}
                    className={`gea-api-call-row${activeRecord?.id === record.id ? ' is-selected' : ''}`}
                    onClick={() => selectRecord(record.id)}
                    aria-pressed={activeRecord?.id === record.id}
                  >
                    <span className="gea-api-call-time">{displayTime(record.startedAt)}</span>
                    <span className="gea-api-call-main">
                      <strong>
                        <span className={`gea-api-method ${methodClass(record.request.method)}`}>
                          {record.request.method}
                        </span>
                        {record.catalogName}
                      </strong>
                      <small>{record.request.headers['x-request-id'] ?? record.id}</small>
                      <small>{record.request.path}</small>
                      {record.replayedFrom && <span className="gea-api-replayed">重发</span>}
                    </span>
                    <Outcome record={record} />
                    <span className="gea-api-call-duration">
                      {record.durationMs == null ? '—' : `${record.durationMs} ms`}
                    </span>
                  </button>
                ))
              ) : (
                <div className="gea-api-empty">
                  <Api size={34} />
                  <strong>{snapshot?.records.length ? '没有匹配的调用' : '还没有接口调用'}</strong>
                  <span>
                    {snapshot?.records.length
                      ? '调整接口或搜索条件'
                      : '使用工作台后，这里会自动出现真实上游记录'}
                  </span>
                </div>
              )}
            </div>
          </section>

          <aside ref={detailRef} className="gea-api-detail" aria-label="调用详情" tabIndex={-1}>
            {activeRecord ? (
              <>
                <div className="gea-api-detail-heading">
                  <div>
                    <span className="gea-api-detail-group">{activeRecord.group}</span>
                    <h2>{activeRecord.catalogName}</h2>
                    <code>{activeRecord.request.path}</code>
                  </div>
                  <div className="gea-api-detail-actions">
                    <Outcome record={activeRecord} />
                    <button
                      type="button"
                      disabled={!activeRecord.replayAvailable || busyReplay !== '' || batchBusy}
                      title={replayNote(activeRecord, activeCatalog)}
                      onClick={() =>
                        activeRecord.replayPolicy === 'idempotent'
                          ? setConfirmReplay(activeRecord.id)
                          : void replay(activeRecord)
                      }
                    >
                      <ReplayMusic size={15} />
                      {busyReplay === activeRecord.id ? '正在重发' : '重发请求'}
                    </button>
                  </div>
                </div>
                {activeCatalog ? <ApiDefinition entry={activeCatalog} /> : null}
                {!activeRecord.replayAvailable && (
                  <p className="gea-api-origin">
                    {activeRecord.replayUnavailableReason ??
                      replayNote(activeRecord, activeCatalog)}
                  </p>
                )}
                <dl className="gea-api-facts">
                  <div>
                    <dt>方法</dt>
                    <dd>{activeRecord.request.method}</dd>
                  </div>
                  <div>
                    <dt>响应</dt>
                    <dd>{activeRecord.response?.status ?? '—'}</dd>
                  </div>
                  <div>
                    <dt>耗时</dt>
                    <dd>
                      {activeRecord.durationMs == null ? '—' : `${activeRecord.durationMs} ms`}
                    </dd>
                  </div>
                  <div>
                    <dt>时间</dt>
                    <dd>
                      {new Date(activeRecord.startedAt).toLocaleString('zh-CN', {
                        hour12: false,
                      })}
                    </dd>
                  </div>
                  <div>
                    <dt>记录环境</dt>
                    <dd>{activeRecord.environment === 'production' ? '生产环境' : '测试环境'}</dd>
                  </div>
                  <div>
                    <dt>记录 ID</dt>
                    <dd>{activeRecord.id}</dd>
                  </div>
                  <div>
                    <dt>请求 ID</dt>
                    <dd>{activeRecord.request.headers['x-request-id'] ?? '未提供'}</dd>
                  </div>
                  {activeRecord.request.headers['idempotency-key'] && (
                    <div>
                      <dt>幂等键</dt>
                      <dd>{activeRecord.request.headers['idempotency-key']}</dd>
                    </div>
                  )}
                </dl>
                {confirmReplay === activeRecord.id && (
                  <div className="gea-api-write-confirm" role="alert">
                    <strong>确认重发这次写请求？</strong>
                    <span>系统会复用原请求体、请求 ID 和幂等键，不会创建新的操作意图。</span>
                    <div>
                      <button
                        type="button"
                        onClick={() => void replay(activeRecord)}
                        disabled={!!busyReplay || batchBusy}
                      >
                        {busyReplay === activeRecord.id ? '正在重发' : '确认按原幂等键重发'}
                      </button>
                      <button type="button" onClick={() => setConfirmReplay('')}>
                        取消
                      </button>
                    </div>
                  </div>
                )}
                {activeRecord.replayedFrom && (
                  <p className="gea-api-origin">
                    由记录 {activeRecord.replayedFrom.slice(0, 8)}… 重发产生
                  </p>
                )}
                <CodeBlock
                  title="请求报文"
                  value={activeRecord.request.body}
                  copyValue={activeRecord.request}
                  onCopy={copy}
                >
                  <p className="gea-api-request-line">
                    <span className={`gea-api-method ${methodClass(activeRecord.request.method)}`}>
                      {activeRecord.request.method}
                    </span>
                    <code>{activeRecord.request.url}</code>
                  </p>
                </CodeBlock>
                <details className="gea-api-payload-details">
                  <summary>请求头与 Query · 已脱敏</summary>
                  {Object.keys(activeRecord.request.query).length > 0 && (
                    <CodeBlock title="Query" value={activeRecord.request.query} onCopy={copy} />
                  )}
                  <CodeBlock title="请求头" value={activeRecord.request.headers} onCopy={copy} />
                </details>
                <CodeBlock
                  title="响应报文"
                  copyValue={activeRecord.response ?? activeRecord.error}
                  value={activeRecord.response?.body ?? activeRecord.error ?? null}
                  onCopy={copy}
                />
                <details className="gea-api-payload-details">
                  <summary>响应头 · 已脱敏</summary>
                  <CodeBlock
                    title="响应头"
                    value={activeRecord.response?.headers ?? null}
                    onCopy={copy}
                  />
                </details>
              </>
            ) : selectedCatalogEntry ? (
              <>
                <div className="gea-api-detail-heading">
                  <div>
                    <span className="gea-api-detail-group">{selectedCatalogEntry.group}</span>
                    <h2>{selectedCatalogEntry.name}</h2>
                    <code>{selectedCatalogEntry.path}</code>
                  </div>
                  <span className={`gea-api-method ${methodClass(selectedCatalogEntry.method)}`}>
                    {selectedCatalogEntry.method}
                  </span>
                </div>
                <ApiDefinition entry={selectedCatalogEntry} />
                <div className="gea-api-empty is-compact">
                  <Api size={30} />
                  <strong>当前筛选下没有调用样本</strong>
                  <span>选择已有调用后查看请求和响应</span>
                </div>
              </>
            ) : (
              <div className="gea-api-empty">
                <Api size={34} />
                <strong>选择接口或调用记录</strong>
                <span>这里会显示实际捕获的请求和响应</span>
              </div>
            )}
          </aside>
        </div>
        <div className="gea-api-copy-status" aria-live="polite">
          {copied}
        </div>
      </section>
      {mainTabs
        .filter((tab) => tab.id !== 'api')
        .map((tab) => (
          <section
            key={tab.id}
            className="gea-api-placeholder"
            role="tabpanel"
            id={`gea-debug-panel-${tab.id}`}
            aria-labelledby={`gea-debug-tab-${tab.id}`}
            hidden={activeTab !== tab.id}
          >
            <p>{tab.id === 'agent' ? 'Agent 测试暂未接入' : '权限测试暂未接入'}</p>
            <p>
              {tab.id === 'agent'
                ? '后续用于提示词调试和模型输出测试。'
                : '场景与调用路线接入后，可在这里查看实际验证结果。'}
            </p>
          </section>
        ))}
    </main>
  );
}
