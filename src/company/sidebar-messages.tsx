import React, { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  IconChevronLeftOutlineRegular,
  IconChevronRightOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives/src/icons/index.tsx';
import { notificationsChangedEvent, readNotifications } from '../client/inbox.tsx';
import { readAnnouncements, type AnnouncementPage } from '../client/message-center.tsx';
import { NavIcon } from './formal-components.tsx';
import type { CopyKey } from './locales.ts';

type Announcement = AnnouncementPage['items'][number];
type ReminderHistory = { since: number; hidden: string[] };
const announcementKey = (item: Announcement) => JSON.stringify([item.id, item.publishTime]);

function readHistory(key: string): ReminderHistory | undefined {
  if (typeof window === 'undefined') return;
  try {
    const value = JSON.parse(window.localStorage.getItem(key) ?? 'null');
    if (
      value &&
      Number.isFinite(value.since) &&
      Array.isArray(value.hidden) &&
      value.hidden.every((id: unknown) => typeof id === 'string')
    )
      return value;
  } catch (error) {
    if (!(error instanceof SyntaxError || error instanceof window.DOMException)) throw error;
  }
}

export function MessageCenterButton({
  scope,
  disabled,
  active,
  open,
  t,
}: {
  scope: string | null;
  disabled: boolean;
  active: boolean;
  open: () => void;
  t: (key: CopyKey) => string;
}) {
  const storageKey = scope ? 'gea.announcement-reminders.v1:' + scope : null;
  const [history, setHistory] = useState(() => (storageKey ? readHistory(storageKey) : undefined));
  const [items, setItems] = useState<Announcement[]>([]);
  const [unreadNotifications, setUnreadNotifications] = useState(false);
  useEffect(() => {
    if (!storageKey) return;
    let current: AbortController | undefined;
    const refresh = () => {
      if (document.visibilityState === 'hidden') return;
      current?.abort();
      const controller = new AbortController();
      current = controller;
      const { signal } = controller;
      void readAnnouncements<AnnouncementPage>({ pageNo: 1, title: '' }, signal).then(
        (page) => {
          if (signal.aborted) return;
          setItems(page.items);
          setHistory(
            (previous) =>
              previous ?? { since: Date.now(), hidden: page.items.map(announcementKey) },
          );
        },
        () => {},
      );
      void readNotifications<{ value: { count: unknown } }>(
        { operation: 'unread-count' },
        signal,
      ).then(
        ({ value }) => {
          const count = value?.count;
          if (
            !signal.aborted &&
            typeof count === 'number' &&
            Number.isSafeInteger(count) &&
            count >= 0
          )
            setUnreadNotifications(count > 0);
        },
        () => {},
      );
    };
    refresh();
    const timer = window.setInterval(refresh, 60_000);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener(notificationsChangedEvent, refresh);
    return () => {
      current?.abort();
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener(notificationsChangedEvent, refresh);
    };
  }, [storageKey]);
  useEffect(() => {
    if (!history || !storageKey) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(history));
    } catch (error) {
      if (!(error instanceof window.DOMException)) throw error;
    }
  }, [history, storageKey]);
  const newAnnouncements = history
    ? items
        .filter((item) => {
          if (history.hidden.includes(announcementKey(item))) return false;
          const published = Date.parse(item.publishTime ?? '');
          return !Number.isFinite(published) || published >= history.since;
        })
        .map(announcementKey)
    : [];
  const hasUnread = unreadNotifications || newAnnouncements.length > 0;
  return (
    <button
      type="button"
      className="gea-inbox-quick-action gea-sidebar-inbox"
      aria-label={t('messageInbox')}
      aria-description={hasUnread ? t('newInboxMessages') : undefined}
      aria-current={active ? 'page' : undefined}
      title={t('messageInbox')}
      data-unread={hasUnread ? '' : undefined}
      disabled={disabled}
      onClick={() => {
        if (history && newAnnouncements.length)
          setHistory({ ...history, hidden: [...history.hidden, ...newAnnouncements] });
        open();
      }}
    >
      <NavIcon kind="bell" />
    </button>
  );
}

export function SidebarMessages({
  children,
  t,
}: {
  children: ReactNode;
  t: (key: CopyKey) => string;
}) {
  const track = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ index: 0, total: 0 });
  const slides = (rail: HTMLDivElement) =>
    rail.querySelectorAll<HTMLElement>('.gea-sidebar-reminder');
  const currentIndex = (rail: HTMLDivElement, children: NodeListOf<HTMLElement>) => {
    const left = rail.getBoundingClientRect().left;
    let index = 0;
    let nearest = Infinity;
    for (const [offset, child] of children.entries()) {
      const distance = Math.abs(child.getBoundingClientRect().left - left);
      if (distance < nearest) {
        nearest = distance;
        index = offset;
      }
    }
    return index;
  };
  const sync = () => {
    const rail = track.current;
    if (!rail) return;
    const children = slides(rail);
    const index = currentIndex(rail, children);
    const total = children.length;
    setPosition((previous) =>
      previous.index === index && previous.total === total ? previous : { index, total },
    );
  };
  useEffect(() => {
    const rail = track.current;
    const Observer = rail?.ownerDocument.defaultView?.MutationObserver;
    if (!rail || !Observer) return;
    const observer = new Observer(sync);
    observer.observe(rail, { childList: true, subtree: true });
    sync();
    return () => observer.disconnect();
  }, []);
  const step = (delta: number) => {
    const rail = track.current;
    if (!rail) return;
    const children = slides(rail);
    const total = children.length;
    if (total < 2) return;
    const next = (currentIndex(rail, children) + delta + total) % total;
    rail.scrollBy({
      left: children[next].getBoundingClientRect().left - rail.getBoundingClientRect().left,
    });
  };
  return (
    <section className="gea-sidebar-message-card" aria-label={t('sidebarUpdateReminders')}>
      <div
        className="gea-sidebar-message-track"
        ref={track}
        tabIndex={position.total > 1 ? 0 : undefined}
        onScroll={sync}
      >
        {children}
      </div>
      {position.total > 1 && (
        <div className="gea-sidebar-message-navigation">
          <button type="button" aria-label={t('previousReminder')} onClick={() => step(-1)}>
            <IconChevronLeftOutlineRegular size={12} />
          </button>
          <span aria-live="polite">
            {position.index + 1} / {position.total}
          </span>
          <button type="button" aria-label={t('nextReminder')} onClick={() => step(1)}>
            <IconChevronRightOutlineRegular size={12} />
          </button>
        </div>
      )}
    </section>
  );
}
