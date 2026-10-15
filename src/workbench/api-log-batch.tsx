import React, { useEffect, useRef, useState } from 'react';
import type {
  ApiBatchItem,
  ApiBatchRun,
  ApiBatchSelection,
  ApiLogSnapshot,
} from './api-log-contract.ts';
export type ApiLogRpc = <T>(endpoint: string, payload?: object, signal?: AbortSignal) => Promise<T>;
const statusText: Record<ApiBatchItem['status'], string> = {
  queued: '未执行',
  running: '正在重发',
  replayed: '已重发',
  failed: '传输失败',
  skipped: '已跳过',
  'not-run': '未执行',
  cancelled: '已取消',
};
export function ApiLogBatchPanel({
  snapshot,
  selected,
  request,
  onBusy,
  onLogs,
  onError,
  pageSignal,
}: {
  snapshot: ApiLogSnapshot | undefined;
  selected: string[];
  request: ApiLogRpc;
  onBusy(value: boolean): void;
  onLogs(id?: string): void;
  onError(reason: string): void;
  pageSignal: AbortSignal;
}) {
  const [plan, setPlan] = useState<ApiBatchSelection[]>();
  const [writes, setWrites] = useState<string[]>([]);
  const [run, setRun] = useState<ApiBatchRun>();
  const [history, setHistory] = useState<ApiBatchRun[]>([]);
  const active = useRef<string>();
  const viewed = useRef<string>();
  viewed.current = run?.runId;
  const starting = useRef(false);
  const latest = useRef({ request, onBusy, onLogs, onError });
  latest.current = { request, onBusy, onLogs, onError };
  const isBusy = run?.status === 'running';
  useEffect(() => {
    const cancel = () => {
      if (active.current)
        void latest.current
          .request('api-log/batch/stop', { runId: active.current })
          .catch(() => {});
    };
    pageSignal.addEventListener('abort', cancel, { once: true });
    return () => {
      pageSignal.removeEventListener('abort', cancel);
      cancel();
    };
  }, [pageSignal]);
  useEffect(() => {
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, pageSignal]);
    let polling = false;
    const update = async () => {
      if (polling || signal.aborted) return;
      polling = true;
      try {
        const runs = await request<ApiBatchRun[]>('api-log/batch/read', {}, signal);
        if (signal.aborted) return;
        setHistory(runs);
        const current = runs.find((value) => value.runId === viewed.current);
        if (current) {
          setRun(current);
          onBusy(starting.current || current.status === 'running');
        }
        const owned = runs.find((value) => value.runId === active.current);
        if (owned && owned.status !== 'running') {
          active.current = undefined;
          onLogs(owned.items.findLast((item) => item.logRecordId)?.logRecordId);
        }
      } catch (error) {
        if (!signal.aborted) onError(error instanceof Error ? error.message : '批量进度加载失败');
      } finally {
        polling = false;
      }
    };
    void update();
    const timer = window.setInterval(() => void update(), 350);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [request, pageSignal, onBusy, onLogs, onError]);
  const prepare = () => {
    setPlan(
      selected.map((catalogId) => ({
        catalogId,
        recordId: snapshot?.records.find((record) => record.catalogId === catalogId)?.id ?? null,
      })),
    );
    setWrites([]);
  };
  const start = async () => {
    if (!plan || starting.current) return;
    starting.current = true;
    onBusy(true);
    try {
      const next = await request<ApiBatchRun>(
        'api-log/batch/start',
        { items: plan, confirmedWriteIds: writes },
        pageSignal,
      );
      if (pageSignal.aborted) {
        void request('api-log/batch/stop', { runId: next.runId }).catch(() => {});
        return;
      }
      active.current = next.runId;
      setRun(next);
      setPlan(undefined);
    } catch (error) {
      if (!pageSignal.aborted) onError(error instanceof Error ? error.message : '批量启动失败');
      onBusy(false);
    } finally {
      starting.current = false;
    }
  };
  return (
    <section className="gea-api-batch" aria-label="批量重发">
      <div className="gea-api-batch-actions">
        <button
          type="button"
          onClick={prepare}
          disabled={isBusy || !selected.length || starting.current}
        >
          开始批量重发
        </button>
        {isBusy && (
          <button
            type="button"
            onClick={() =>
              void request<ApiBatchRun>(
                'api-log/batch/stop',
                { runId: run.runId },
                pageSignal,
              ).catch((error) => onError(error.message))
            }
          >
            停止批量重发
          </button>
        )}
        {!!history.length && (
          <select
            aria-label="选择重发批次"
            value={run?.runId ?? ''}
            disabled={isBusy}
            onChange={(event) => {
              const next = history.find((value) => value.runId === event.target.value);
              setRun(next);
              onBusy(next?.status === 'running');
            }}
          >
            <option value="">选择批次</option>
            {[...history].reverse().map((value, index) => (
              <option key={value.runId} value={value.runId}>
                {index === 0 ? '最近批次' : '历史批次'} · {value.items.length} 项 ·{' '}
                {value.status === 'running'
                  ? '运行中'
                  : value.status === 'stopped'
                    ? '已停止'
                    : '已结束'}
              </option>
            ))}
          </select>
        )}
      </div>
      {plan && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="确认批量重发"
          className="gea-api-inline-confirm gea-api-batch-confirm"
        >
          <strong>确认批量重发 {plan.length} 个接口</strong>
          <span>样本已固定。重发保留原正文、请求 ID 与幂等键。</span>
          {plan.map((item) => {
            const entry = snapshot?.catalog.find((value) => value.id === item.catalogId);
            const record = snapshot?.records.find((value) => value.id === item.recordId);
            const reason =
              entry?.replayPolicy === 'blocked'
                ? entry.replayNote
                : !item.recordId
                  ? '没有已捕获样本'
                  : !record
                    ? '原样本已淘汰'
                    : !record.replayAvailable
                      ? (record.replayUnavailableReason ?? '原样本已失效')
                      : undefined;
            return (
              <div key={item.catalogId}>
                <span>
                  {entry?.name} · {reason ?? `固定记录 ${item.recordId}`}
                </span>
                {record?.replayPolicy === 'idempotent' && !reason && (
                  <label>
                    <input
                      type="checkbox"
                      checked={writes.includes(record.id)}
                      onChange={(event) =>
                        setWrites(
                          event.target.checked
                            ? [...writes, record.id]
                            : writes.filter((id) => id !== record.id),
                        )
                      }
                    />
                    确认写记录 {record.id}
                  </label>
                )}
              </div>
            );
          })}
          <button type="button" disabled={starting.current} onClick={() => void start()}>
            确认批量重发
          </button>
          <button type="button" onClick={() => setPlan(undefined)}>
            取消
          </button>
        </div>
      )}
      {run && (
        <div role="status" aria-live="polite">
          <p>
            {run.status === 'running'
              ? '批量重发中'
              : run.status === 'stopped'
                ? '批量已停止'
                : '批量已结束'}{' '}
            · 重发 {run.items.filter((item) => item.status === 'replayed').length} · 失败{' '}
            {run.items.filter((item) => item.status === 'failed').length} · 跳过{' '}
            {run.items.filter((item) => item.status === 'skipped').length} · 未执行{' '}
            {
              run.items.filter((item) => item.status === 'queued' || item.status === 'not-run')
                .length
            }
          </p>
          <ul>
            {run.items.map((item) => (
              <li key={item.catalogId}>
                <span>
                  {snapshot?.catalog.find((value) => value.id === item.catalogId)?.name ??
                    item.catalogId}{' '}
                  · {statusText[item.status]}
                  {item.resultUnknown ? ' · 结果未确认' : ''}
                  {item.reason ? ` · ${item.reason}` : ''}
                </span>
                {item.logRecordId &&
                  (snapshot?.records.some((record) => record.id === item.logRecordId) ? (
                    <button type="button" onClick={() => onLogs(item.logRecordId)}>
                      查看新日志
                    </button>
                  ) : (
                    <span>原记录不在当前缓冲区</span>
                  ))}
              </li>
            ))}
          </ul>
          <small>本批次仅重发传输，不表示权限验证通过。</small>
        </div>
      )}
    </section>
  );
}
