import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { IconSearchOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives/src/icons/index.tsx';

export interface SearchableSession {
  id: string;
  displayTitle: string;
  updatedAt: number;
}

interface ContentHit {
  sessionId: string;
  snippet: string;
}

interface SearchCopy {
  title: string;
  placeholder: string;
  recent: string;
  results: string;
  empty: string;
  loading: string;
  failed: string;
  more: string;
  close: string;
  clear: string;
}

export function SessionSearchDialog({
  sessions,
  searchMessages,
  openSession,
  onClose,
  copy,
}: {
  sessions: readonly SearchableSession[];
  searchMessages: (
    query: string,
    signal: AbortSignal,
  ) => Promise<{ items: readonly ContentHit[]; hasMore: boolean }>;
  openSession: (id: string) => void;
  onClose: () => void;
  copy: SearchCopy;
}) {
  const [query, setQuery] = useState('');
  const [remote, setRemote] = useState<{
    query: string;
    status: 'loading' | 'ready' | 'error';
    items: readonly ContentHit[];
    hasMore: boolean;
  }>({ query: '', status: 'ready', items: [], hasMore: false });
  const dialog = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const rows = useRef<Array<HTMLButtonElement | null>>([]);
  const normalized = query.trim().toLocaleLowerCase();

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const keepFocus = (event: FocusEvent) => {
      if (dialog.current && !dialog.current.contains(event.target as Node)) input.current?.focus();
    };
    document.addEventListener('focusin', keepFocus, true);
    input.current?.focus();
    const animation = requestAnimationFrame(() => input.current?.focus());
    return () => {
      cancelAnimationFrame(animation);
      document.removeEventListener('focusin', keepFocus, true);
      previous?.focus();
    };
  }, []);

  useEffect(() => {
    if (!normalized) return;
    const controller = new AbortController();
    setRemote({ query: normalized, status: 'loading', items: [], hasMore: false });
    const timer = window.setTimeout(() => {
      void searchMessages(normalized, controller.signal)
        .then(({ items, hasMore }) => {
          if (!controller.signal.aborted)
            setRemote({ query: normalized, status: 'ready', items, hasMore });
        })
        .catch(() => {
          if (!controller.signal.aborted)
            setRemote({ query: normalized, status: 'error', items: [], hasMore: false });
        });
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [normalized, searchMessages]);

  const sorted = [...sessions].sort((a, b) => b.updatedAt - a.updatedAt);
  const sessionById = new Map(sorted.map((session) => [session.id, session]));
  const titleMatches = normalized
    ? sorted.filter((session) => session.displayTitle.toLocaleLowerCase().includes(normalized))
    : sorted.slice(0, 12);
  const currentRemote = remote.query === normalized ? remote : null;
  const snippets = new Map(
    normalized && currentRemote?.status === 'ready'
      ? currentRemote.items.map((item) => [item.sessionId, item.snippet] as const)
      : [],
  );
  const results = [...titleMatches];
  if (normalized)
    for (const id of snippets.keys()) {
      const session = sessionById.get(id);
      if (session && !results.some((item) => item.id === id)) results.push(session);
    }
  const visible = results.slice(0, 50);
  const choose = (id: string) => {
    onClose();
    openSession(id);
  };
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    } else if (event.key === 'ArrowDown') {
      const index = rows.current.indexOf(document.activeElement as HTMLButtonElement);
      if (event.target === input.current || index >= 0) {
        event.preventDefault();
        rows.current[Math.min(index + 1, visible.length - 1)]?.focus();
      }
    } else if (event.key === 'ArrowUp') {
      const index = rows.current.indexOf(document.activeElement as HTMLButtonElement);
      if (index >= 0) {
        event.preventDefault();
        if (index === 0) input.current?.focus();
        else rows.current[index - 1]?.focus();
      }
    } else if (event.key === 'Enter' && event.target === input.current && visible[0]) {
      event.preventDefault();
      choose(visible[0].id);
    } else if (event.key === 'Tab') {
      const focusable = Array.from(
        dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input') ?? [],
      );
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
  };

  return createPortal(
    <div
      className="gea-session-search-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialog}
        className="gea-session-search-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="gea-session-search-title"
        onKeyDown={onKeyDown}
      >
        <header className="gea-session-search-heading">
          <h2 id="gea-session-search-title">{copy.title}</h2>
          <button
            type="button"
            className="gea-session-search-close"
            onClick={onClose}
            aria-label={copy.close}
          >
            <span aria-hidden="true">×</span>
            <kbd>Esc</kbd>
          </button>
        </header>
        <div className="gea-session-search-field">
          <IconSearchOutlineRegular size={19} />
          <input
            ref={input}
            type="search"
            value={query}
            aria-label={copy.title}
            placeholder={copy.placeholder}
            onChange={(event) => setQuery(event.target.value)}
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                input.current?.focus();
              }}
              aria-label={copy.clear}
            >
              ×
            </button>
          )}
        </div>
        <div className="gea-session-search-results">
          <div className="gea-session-search-section-label">
            {normalized ? copy.results : copy.recent}
          </div>
          {visible.map((session, index) => (
            <button
              key={session.id}
              ref={(node) => {
                rows.current[index] = node;
              }}
              type="button"
              className="gea-session-search-result"
              onClick={() => choose(session.id)}
            >
              <span className="gea-session-search-result-title">{session.displayTitle}</span>
              {snippets.get(session.id) && (
                <span className="gea-session-search-result-snippet">
                  {snippets.get(session.id)}
                </span>
              )}
            </button>
          ))}
          {normalized && currentRemote?.status === 'loading' && (
            <p role="status" className="gea-session-search-state">
              {copy.loading}
            </p>
          )}
          {normalized && currentRemote?.status === 'error' && (
            <p role="alert" className="gea-session-search-state">
              {copy.failed}
            </p>
          )}
          {normalized && currentRemote?.status === 'ready' && !visible.length && (
            <p className="gea-session-search-state">{copy.empty}</p>
          )}
          {normalized &&
            currentRemote?.status === 'ready' &&
            (currentRemote.hasMore || results.length > visible.length) && (
              <p className="gea-session-search-state">{copy.more}</p>
            )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
