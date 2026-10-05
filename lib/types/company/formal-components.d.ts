/** Formal selected GEA0.0.135 UI, verified against shipped artifacts.
 * Source Git 508feea3b0c285a61e4c06179a705866b1429b8e; only exported for Workbench ownership. */
import React from 'react';
import { type BusinessGroupIcon } from './business-icons.ts';
import type { ConversationPromptConfig } from './conversation-prompts.ts';
export type ConversationView = 'center' | 'split' | 'chat';
type NavIconKind = 'bot' | 'bell' | 'desktop' | 'users' | 'calendar' | 'warehouse' | 'grid' | 'folder' | 'apps' | 'newChat' | BusinessGroupIcon;
export declare function AgentWelcome({ agent, onFill, }: {
    agent: ConversationPromptConfig;
    onFill: (prompt: string) => void;
}): React.JSX.Element;
export declare function GeaHomeHero({ copy, }: {
    copy: {
        label: string;
        eyebrow: string;
        title: string;
        description: string;
    };
}): React.JSX.Element;
export declare function ConversationToolbar({ view, onViewChange, onHistory, onNewConversation, error, tools, onOpenTool, onCloseTools, toolsExpanded, onAssociateCurrent, associateDisabled, }: {
    view: ConversationView;
    onViewChange: (view: ConversationView) => void;
    onHistory: () => void;
    onNewConversation: () => void;
    error: string;
    tools?: readonly {
        readonly id: string;
        readonly kind: string;
        readonly providerId: string;
        readonly title: () => string;
    }[];
    onOpenTool?: (kind: string) => void;
    onCloseTools?: () => void;
    toolsExpanded?: boolean;
    onAssociateCurrent?: () => void;
    associateDisabled?: boolean;
}): React.JSX.Element;
export declare function NavIcon({ kind }: {
    kind: NavIconKind;
}): React.JSX.Element;
export declare function Chevron({ open }: {
    open: boolean;
}): React.JSX.Element;
export declare function MenuIcon(): React.JSX.Element;
export {};
