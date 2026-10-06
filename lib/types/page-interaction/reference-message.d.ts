import type { Context } from '@deepseek-ai/cordis';
import React from 'react';
import type { ChatNodeViewProps } from '@deepseek-ai/dsh-client-ui-chat/src/client/contract/slots.ts';
/** Display contribution only; Core continues to own node data and message actions. */
export declare function mountReferenceMessages(ctx: Context): void;
/** Project page receipts without changing the durable content sent to models or Copy. */
export declare function ReferenceMessage(props: ChatNodeViewProps<'user' | 'steering'>): React.JSX.Element;
