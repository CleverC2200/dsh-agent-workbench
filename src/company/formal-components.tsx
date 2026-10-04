/** Formal selected GEA0.0.135 UI, verified against shipped artifacts.
 * Source Git 508feea3b0c285a61e4c06179a705866b1429b8e; only exported for Workbench ownership. */
import React from 'react';
import {AgentAvatar} from './agent-avatar.tsx';
import {BUSINESS_GROUP_ICON_PATHS,type BusinessGroupIcon} from './business-icons.ts';
import type {ConversationPromptConfig} from './conversation-prompts.ts';
import brandLogo from './brand-logo.png';
export type ConversationView = 'center'|'split'|'chat';
type NavIconKind = 'bot'|'bell'|'desktop'|'users'|'calendar'|'warehouse'|'grid'|'folder'|'apps'|'newChat'|BusinessGroupIcon;

export function AgentWelcome({
  agent,
  onFill,
}: {
  agent: ConversationPromptConfig;
  onFill: (prompt: string) => void;
}) {
  return (
    <section className="gea-agent-welcome" aria-label={agent.name}>
      <div className="gea-agent-identity">
        <AgentAvatar className="gea-agent-avatar" />
        <h2>{agent.name}</h2>
        <p className="gea-agent-intro">{agent.intro}<b>{agent.boundary}</b></p>
      </div>
      <div className="gea-agent-block gea-agent-prompts">
        <h3>你可以这样问</h3>
        {agent.prompts.map((prompt) => <button key={prompt} type="button" onClick={() => onFill(prompt)}>{prompt}</button>)}
      </div>
    </section>
  );
}

export function GeaHomeHero({
  copy,
}: {
  copy: {
    label: string;
    eyebrow: string;
    title: string;
    description: string;
  };
}) {
  return (
    <section className="gea-home-hero" aria-label={copy.label}>
      <img className="gea-home-logo" src={brandLogo} alt="" width={81} height={81} />
      <p className="gea-home-eyebrow">{copy.eyebrow}</p>
      <h1 className="gea-home-title">{copy.title}</h1>
      <p className="gea-home-description">{copy.description}</p>
    </section>
  );
}

export function ConversationToolbar({
  view,
  onViewChange,
  onHistory,
  onNewConversation,
  error,
}: {
  view: ConversationView;
  onViewChange: (view: ConversationView) => void;
  onHistory: () => void;
  onNewConversation: () => void;
  error: string;
}) {
  const choices: { view: ConversationView; label: string; icon: React.ReactNode }[] = [
    { view: "center", label: "中间区域最大，隐藏会话区", icon: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></> },
    { view: "split", label: "同时显示中间区域和会话区", icon: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M12 3v18" /></> },
    { view: "chat", label: "会话区最大，隐藏中间区域", icon: <path d="M4 4h16v13H9l-5 4V4Zm4 4h8m-8 4h6" /> },
  ];
  return <div className="gea-conversation-toolbar" role="toolbar" aria-label="对话区视图与会话操作">
    <div className="gea-conversation-view-switch" role="group" aria-label="区域显示方式">
      {choices.map((choice) => <button key={choice.view} type="button" aria-label={choice.label} title={choice.label} aria-pressed={view === choice.view} onClick={() => onViewChange(choice.view)}>
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{choice.icon}</svg>
      </button>)}
    </div>
    <button type="button" className="gea-conversation-toolbar-action" aria-label="历史对话" title="历史对话" onClick={onHistory}>
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 10a9 9 0 1 1 0 4M3 4v6h6M12 7v5l3 2" /></svg>
    </button>
    <button type="button" className="gea-conversation-toolbar-action" aria-label="新建对话" title="新建对话" onClick={onNewConversation}>
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M12 7v10M7 12h10" /></svg>
    </button>
    {error && <span className="gea-conversation-toolbar-error" role="alert" title={error}>新建对话失败</span>}
  </div>;
}

export function NavIcon({ kind }: { kind: NavIconKind }) {
  // 原型分组图标是填充路径（1024 viewBox），用 currentColor 跟随菜单文字色。
  if (kind === "synergy" || kind === "orders") {
    return (
      <svg className="gea-shell-nav-icon" aria-hidden="true" width="18" height="18" viewBox="0 0 1024 1024" fill="currentColor">
        {/* 填充图标是满幅的，缩到线框图标同一墨迹尺寸（约 13px），避免看着比其它分组图标大一圈。 */}
        <g transform="translate(512 512) scale(0.75) translate(-512 -512)">
          {BUSINESS_GROUP_ICON_PATHS[kind].map((d, index) => <path key={index} d={d} />)}
        </g>
      </svg>
    );
  }
  const paths: Record<Exclude<NavIconKind, BusinessGroupIcon>, React.ReactNode> = {
    newChat: <><path d="M20 12a7.5 7.5 0 0 1-10.6 6.8L5 20l1.3-4.1A7.5 7.5 0 1 1 20 12Z" /><path d="M12 8.8v6.4M8.8 12h6.4" /></>,
    apps: <><rect x="4" y="4" width="6.5" height="6.5" rx="1.4" /><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.4" /><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.4" /><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.4" /></>,
    bot: <><rect x="5" y="7" width="14" height="11" rx="2" /><path d="M12 4v3M8 12h.01M16 12h.01M9 18v2M15 18v2" /></>,
    bell: <><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></>,
    desktop: <><rect x="4" y="5" width="16" height="11" rx="1.5" /><path d="M9 20h6M12 16v4" /></>,
    users: <><circle cx="9" cy="9" r="3" /><path d="M3.5 19c.7-3 2.5-4.5 5.5-4.5s4.8 1.5 5.5 4.5M16 6.5a2.5 2.5 0 0 1 0 5M17 14.5c1.9.2 3.1 1.6 3.5 3.5" /></>,
    calendar: <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4M16 3v4M4 10h16M8 14h2M14 14h2M8 17h2" /></>,
    warehouse: <><path d="m3 10 9-6 9 6v10H3z" /><path d="M8 20v-6h8v6M6 10h12" /></>,
    grid: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
    folder: <><path d="M3 7V5.5A1.5 1.5 0 0 1 4.5 4h4l2 2.5h9A1.5 1.5 0 0 1 21 8v10.5A1.5 1.5 0 0 1 19.5 20h-15A1.5 1.5 0 0 1 3 18.5Z" /></>,
  };
  return <svg className="gea-shell-nav-icon" aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{paths[kind]}</svg>;
}

export function Chevron({ open }: { open: boolean }) {
  return <svg className={`gea-shell-chevron${open ? " is-open" : ""}`} aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m7 10 5 5 5-5" /></svg>;
}

export function MenuIcon() {
  return (
    <svg
      aria-hidden="true"
      data-nav-icon="menu"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="5" cy="6" r="1" />
      <circle cx="5" cy="12" r="1" />
      <circle cx="5" cy="18" r="1" />
      <path d="M9 6h11M9 12h11M9 18h11" />
    </svg>
  );
}
