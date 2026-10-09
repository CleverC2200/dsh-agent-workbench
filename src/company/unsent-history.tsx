import React, { useEffect, useMemo, useState, useSyncExternalStore, useRef } from 'react';
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client';
import type {} from '@deepseek-ai/dsh-agent-preset-registry/types';
import type { SessionId } from '@deepseek-ai/dsh-session/types';
import type { WorkbenchFramePage } from '../frame.ts';
import type { ResourceSummary } from '../resource-selection.ts';
/** Extra navigation for Core-owned blank Sessions omitted by the ordinary Workspace browser. */
export function PageUnsentHistory({
  page,
  cwd,
  sessions,
  request,
  language,
  selectedSessionId,
  onChoose,
}: {
  page: WorkbenchFramePage;
  cwd: string;
  sessions: Pick<ISessions, 'list' | 'refreshProjections'>;
  request: typeof fetch;
  language: string;
  selectedSessionId?: SessionId;
  onChoose(id: SessionId, preset: string, cwd: string): void;
}) {
  const list = useSyncExternalStore(
    sessions.list.subscribe,
    sessions.list.getSnapshot,
    sessions.list.getSnapshot,
  );
  const [resources, setResources] = useState<{
    owner: string;
    rows: ResourceSummary[];
    error?: string;
  }>();
  const owner = JSON.stringify([page.id, page.resourceId, cwd]);
  const [retry, refresh] = useState(0);
  const [projectionError, setProjectionError] = useState<string>();
  useEffect(() => {
    const controller = new AbortController();
    void request('/api/agent-manage/resources?' + new URLSearchParams({ cwd }), {
      signal: controller.signal,
      cache: 'no-store',
    })
      .then(async (response) => {
        if (!response.ok) throw Error('RESOURCE_LIST_UNAVAILABLE');
        const rows = (await response.json()) as ResourceSummary[];
        controller.signal.throwIfAborted();
        setResources({ owner, rows });
      })
      .catch((error) => {
        if (!controller.signal.aborted) setResources({ owner, rows: [], error: String(error) });
      });
    return () => controller.abort();
  }, [owner, request, retry]);
  const available = resources?.owner === owner ? resources : undefined;
  const allowed = useMemo(() => {
    const resource = available?.rows.find(
      (row) => row.id === page.resourceId && row.installed && row.enabled && row.kind === 'prompt',
    );
    return new Set(
      resource
        ? (resource.interpreters ?? [resource.id]).filter((id) =>
            available!.rows.some(
              (row) => row.id === id && row.installed && row.enabled && row.kind === 'prompt',
            ),
          )
        : [],
    );
  }, [available, page.resourceId]);
  const presetOf = (state: ReturnType<ISessions['list']['getSnapshot']>, id: SessionId) => {
    const value = state.projectionsBySession[id]?.values.agentPreset;
    return value === undefined ? state.byId[id]?.projectionValues?.agentPreset : value;
  };
  // Cold list rows may lack cached preset hints. The official metadata read
  // updates the same Core list store without opening an Agent or reading a draft.
  const inspected = useRef(new Set<SessionId>());
  useEffect(() => {
    inspected.current.clear();
    setProjectionError(undefined);
  }, [owner, retry]);
  useEffect(() => {
    if (list.phase !== 'ready') return;
    for (const id of list.ids) {
      const row = list.byId[id],
        preset = presetOf(list, id);
      if (
        !row?.blank ||
        row.running ||
        row.origin === 'subagent' ||
        row.cwd !== cwd ||
        preset !== undefined ||
        inspected.current.has(id)
      )
        continue;
      inspected.current.add(id);
      void sessions.refreshProjections(id).catch(() => setProjectionError(owner));
    }
  }, [list, owner, sessions, cwd, retry]);
  const candidates = () => {
    const current = sessions.list.getSnapshot();
    return current.phase !== 'ready'
      ? []
      : current.ids
          .flatMap((id) => {
            const session = current.byId[id],
              preset = presetOf(current, id);
            return session?.blank &&
              !session.running &&
              session.origin !== 'subagent' &&
              session.cwd === cwd &&
              typeof preset === 'string' &&
              allowed.has(preset)
              ? [{ session, preset }]
              : [];
          })
          .sort((a, b) => b.session.updatedAt - a.session.updatedAt);
  };
  const rows = candidates();
  const english = language === 'en';
  const unknown = list.ids.filter((id) => {
    const row = list.byId[id];
    return (
      row?.blank &&
      !row.running &&
      row.origin !== 'subagent' &&
      row.cwd === cwd &&
      presetOf(list, id) === undefined
    );
  });
  const metadataFailed =
    projectionError === owner ||
    unknown.some((id) => list.projectionsBySession[id]?.state === 'error');
  const metadataLoading = unknown.some(
    (id) =>
      list.projectionsBySession[id]?.state !== 'ready' &&
      list.projectionsBySession[id]?.state !== 'error',
  );
  return (
    <section
      className="gea-unsent-history"
      aria-label={english ? 'Unsent page sessions' : '未发送会话'}
    >
      <header>{english ? 'Unsent page sessions' : '未发送会话'}</header>
      {metadataFailed && (
        <p role="alert">
          {english
            ? 'Some sessions lack verified preset metadata.'
            : '部分会话的解读信息读取失败。'}
          <button type="button" onClick={() => refresh((value) => value + 1)}>
            {english ? 'Retry' : '重试读取'}
          </button>
        </p>
      )}
      {available?.error ? (
        <p role="alert">
          {english ? 'Session choices are unavailable.' : '会话选项暂不可用。'}
          <button type="button" onClick={() => refresh((value) => value + 1)}>
            {english ? 'Retry' : '重试读取'}
          </button>
        </p>
      ) : !available || list.phase !== 'ready' || (metadataLoading && rows.length === 0) ? (
        <p role="status">{english ? 'Loading sessions…' : '正在读取会话…'}</p>
      ) : rows.length === 0 ? (
        <p>{english ? 'No matching unsent session' : '没有匹配的未发送会话'}</p>
      ) : (
        rows.map(({ session, preset }) => (
          <button
            type="button"
            key={session.id}
            title={session.id}
            aria-current={selectedSessionId === session.id ? true : undefined}
            disabled={selectedSessionId === session.id}
            onClick={() => {
              const current = candidates().find(
                (value) => value.session.id === session.id && value.preset === preset,
              );
              if (current) onChoose(current.session.id, current.preset, cwd);
            }}
          >
            <span>
              {session.title ?? session.displayTitle} · {session.id.slice(-8)}
              {selectedSessionId === session.id
                ? english
                  ? ' · Current page'
                  : ' · 当前页面'
                : ''}
            </span>
            <time dateTime={new Date(session.updatedAt).toISOString()}>
              {new Date(session.updatedAt).toLocaleString(english ? 'en-US' : 'zh-CN')}
            </time>
          </button>
        ))
      )}
    </section>
  );
}
