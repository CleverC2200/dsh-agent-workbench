import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { parseFragment, type DefaultTreeAdapterTypes } from 'parse5';
import { formatDate, Inbox } from './inbox.tsx';
import type { CopyKey } from './locales.ts';

const tabs = ['businessReminder', 'announcements'] as const;
type Tab = (typeof tabs)[number];
type Translate = (key: CopyKey) => string;

export function MessageCenter(props: React.ComponentProps<typeof Inbox>) {
  const id = useId();
  const [tab, setTab] = useState<Tab>('businessReminder');
  const receipt = props.navigation?.receipt;
  const [lastReceipt, setLastReceipt] = useState(receipt);
  if (receipt !== lastReceipt) {
    setLastReceipt(receipt);
    if (receipt) setTab('businessReminder');
  }

  return (
    <div className="gea-message-center">
      <div
        className="gea-message-tabs"
        role="tablist"
        aria-label={props.t('messageInbox')}
        onKeyDown={(event) => {
          const buttons = Array.from(event.currentTarget.querySelectorAll('button'));
          const index = buttons.findIndex((button) => button === event.target);
          if (index < 0) return;
          const { key } = event;
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(key)) return;
          event.preventDefault();
          buttons[key === 'Home' ? 0 : key === 'End' ? buttons.length - 1 : 1 - index]?.focus();
        }}
      >
        {tabs.map((key) => (
          <button
            key={key}
            id={id + key}
            type="button"
            role="tab"
            tabIndex={tab === key ? 0 : -1}
            aria-selected={tab === key}
            onClick={() => setTab(key)}
          >
            {props.t(key)}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        aria-labelledby={id + 'businessReminder'}
        hidden={tab !== 'businessReminder'}
      >
        <Inbox {...props} />
      </div>
      <div role="tabpanel" aria-labelledby={id + 'announcements'} hidden={tab !== 'announcements'}>
        {tab === 'announcements' && <Announcements t={props.t} />}
      </div>
    </div>
  );
}

type Announcement = {
  id: string;
  title: string | null;
  summary: string | null;
  publishTime: string | null;
  top: boolean;
};
type AnnouncementPage = { items: Announcement[]; total: number; pageNo: number; pageSize: number };
type AnnouncementDetail = Announcement & { content: string | null };
type Result<T> =
  | { kind: 'loading' }
  | { kind: 'loaded'; value: T }
  | { kind: 'failed'; error: CopyKey };

async function readAnnouncements<T>(
  query: { id: string } | { pageNo: number; title: string },
  signal: AbortSignal,
): Promise<T> {
  const response = await fetch('/api/gea-proof/announcements', {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(query),
    signal,
  });
  if (!response.ok) throw Error('GEA_HTTP_' + response.status);
  const result = await response.json();
  if (!result.ok) throw Error(result.error.code);
  return result.value;
}

function announcementError(reason: unknown, fallback: CopyKey): CopyKey {
  const code = reason instanceof Error ? reason.message : '';
  if (['LOGIN_REQUIRED', 'GEA_HTTP_401', 'ANNOUNCEMENT_UNAUTHENTICATED'].includes(code))
    return 'loginExpired';
  if (code === 'GEA_REQUEST_TIMEOUT') return 'requestTimeout';
  return fallback;
}

function Announcements({ t }: { t: Translate }) {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState({ pageNo: 1, title: '' });
  const [result, setResult] = useState<Result<AnnouncementPage>>({ kind: 'loading' });
  const [selected, setSelected] = useState<Announcement | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    const request = new AbortController();
    void readAnnouncements<AnnouncementPage>(query, request.signal).then(
      (value) => {
        if (!request.signal.aborted) setResult({ kind: 'loaded', value });
      },
      (reason) => {
        if (!request.signal.aborted)
          setResult({ kind: 'failed', error: announcementError(reason, 'announcementLoadFailed') });
      },
    );
    return () => request.abort();
  }, [query]);
  const load = (pageNo: number, title = query.title) => {
    setResult({ kind: 'loading' });
    setQuery({ pageNo, title });
  };

  return (
    <section className="gea-inbox" aria-label={t('announcements')}>
      <form
        className="gea-inbox-toolbar"
        onSubmit={(event) => {
          event.preventDefault();
          setUnavailable(false);
          load(1, search.trim());
        }}
      >
        <div className="gea-inbox-filter">
          <label>
            {t('announcementSearch')}
            <input
              type="search"
              value={search}
              maxLength={100}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <button type="submit">{t('announcementSearchSubmit')}</button>
        </div>
      </form>
      <div className="gea-inbox-content">
        {unavailable && <p role="status">{t('announcementUnavailable')}</p>}
        {result.kind === 'loading' && <p role="status">{t('busy')}</p>}
        {result.kind === 'failed' && (
          <div>
            <p role="alert">{t(result.error)}</p>
            <button type="button" onClick={() => load(query.pageNo)}>
              {t('announcementRetry')}
            </button>
          </div>
        )}
        {result.kind === 'loaded' && (
          <>
            {result.value.items.length === 0 ? (
              <p>{t('announcementEmpty')}</p>
            ) : (
              <div className="gea-inbox-table-scroll">
                <table className="gea-announcement-list">
                  <thead>
                    <tr>
                      <th scope="col">{t('notificationTitle')}</th>
                      <th scope="col">{t('inboxContent')}</th>
                      <th scope="col">{t('announcementPublishedAt')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.value.items.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <button
                            className="gea-inbox-subject"
                            type="button"
                            onClick={() => {
                              setUnavailable(false);
                              setSelected(item);
                            }}
                          >
                            {item.title || t('announcementUntitled')}
                          </button>
                          {item.top && (
                            <span className="gea-inbox-kind">{t('announcementPinned')}</span>
                          )}
                        </td>
                        <td className="gea-inbox-summary">{item.summary || '—'}</td>
                        <td className="gea-inbox-date">{formatDate(item.publishTime)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <footer className="gea-inbox-pagination">
              <span>
                {t('total')}: {result.value.total} · {t('page')}: {result.value.pageNo}
              </span>
              <div>
                <button
                  type="button"
                  disabled={result.value.pageNo <= 1}
                  onClick={() => load(query.pageNo - 1)}
                >
                  {t('previous')}
                </button>
                <button
                  type="button"
                  disabled={result.value.pageNo * result.value.pageSize >= result.value.total}
                  onClick={() => load(query.pageNo + 1)}
                >
                  {t('next')}
                </button>
              </div>
            </footer>
          </>
        )}
      </div>
      {selected && (
        <AnnouncementDrawer
          item={selected}
          t={t}
          onClose={(removed) => {
            setSelected(null);
            if (removed) {
              setUnavailable(true);
              load(query.pageNo);
            }
          }}
        />
      )}
    </section>
  );
}

function AnnouncementDrawer({
  item,
  t,
  onClose,
}: {
  item: Announcement;
  t: Translate;
  onClose: (removed?: boolean) => void;
}) {
  const titleId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const unavailable = useRef(false);
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<Result<AnnouncementDetail>>({ kind: 'loading' });
  useLayoutEffect(() => {
    dialog.current?.showModal();
  }, []);
  useEffect(() => {
    const request = new AbortController();
    void readAnnouncements<{ detail: AnnouncementDetail }>({ id: item.id }, request.signal).then(
      ({ detail }) => {
        if (!request.signal.aborted) setResult({ kind: 'loaded', value: detail });
      },
      (reason) => {
        if (request.signal.aborted) return;
        if (
          reason instanceof Error &&
          ['ANNOUNCEMENT_NOT_FOUND', 'GEA_HTTP_404'].includes(reason.message)
        ) {
          unavailable.current = true;
          dialog.current?.close();
          return;
        }
        setResult({ kind: 'failed', error: announcementError(reason, 'announcementDetailFailed') });
      },
    );
    return () => request.abort();
  }, [item.id, revision]);

  return (
    <dialog
      ref={dialog}
      className="gea-inbox-drawer"
      aria-labelledby={titleId}
      onClose={() => onClose(unavailable.current)}
    >
      <div className="gea-inbox-drawer-layout">
        <header className="gea-inbox-drawer-header">
          <h2 id={titleId}>{t('announcements')}</h2>
          <button type="button" onClick={() => dialog.current?.close()}>
            {t('close')}
          </button>
        </header>
        <div className="gea-inbox-drawer-body">
          <h3>
            {(result.kind === 'loaded' ? result.value.title : item.title) ||
              t('announcementUntitled')}
          </h3>
          {result.kind === 'loading' && <p role="status">{t('busy')}</p>}
          {result.kind === 'failed' && (
            <>
              <p role="alert">{t(result.error)}</p>
              <button
                type="button"
                onClick={() => {
                  setResult({ kind: 'loading' });
                  setRevision((value) => value + 1);
                }}
              >
                {t('announcementRetry')}
              </button>
            </>
          )}
          {result.kind === 'loaded' && (
            <div className="gea-announcement-body">
              {result.value.content?.trim()
                ? renderAnnouncementNodes(parseFragment(result.value.content).childNodes)
                : result.value.summary || t('notificationNoContent')}
            </div>
          )}
        </div>
      </div>
    </dialog>
  );
}

const formatting = new Set([
  'p',
  'br',
  'hr',
  'blockquote',
  'pre',
  'code',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'b',
  'strong',
  'i',
  'em',
  'u',
  's',
  'sub',
  'sup',
  'ul',
  'ol',
  'li',
  'table',
  'caption',
  'thead',
  'tbody',
  'tfoot',
  'tr',
  'th',
  'td',
  'div',
]);
const textWrappers = new Set(['a', 'span', 'font', 'section', 'article']);

function renderAnnouncementNodes(nodes: DefaultTreeAdapterTypes.ChildNode[]): React.ReactNode {
  return nodes.map((node, index) => {
    if ('value' in node) return node.value;
    if (!('tagName' in node) || node.namespaceURI !== 'http://www.w3.org/1999/xhtml') return null;
    if (formatting.has(node.tagName))
      return React.createElement(
        node.tagName,
        { key: index },
        node.childNodes.length ? renderAnnouncementNodes(node.childNodes) : undefined,
      );
    if (textWrappers.has(node.tagName))
      return (
        <React.Fragment key={index}>{renderAnnouncementNodes(node.childNodes)}</React.Fragment>
      );
    return null;
  });
}
