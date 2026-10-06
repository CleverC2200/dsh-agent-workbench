import type { Context } from '@deepseek-ai/cordis';
import React, { Fragment } from 'react';
import type {} from '@deepseek-ai/dsh-client-ui-chat/client';
import type { ChatNodeViewProps } from '@deepseek-ai/dsh-client-ui-chat/src/client/contract/slots.ts';
import { UserMessageNodeView } from '@deepseek-ai/dsh-client-ui-chat/src/client/chat/MessageItem.tsx';
import { MessageIconActions } from '@deepseek-ai/dsh-client-ui-chat/src/client/chat/MessageIconActions.tsx';
import {
  FileTypeIcon,
  fileExtension,
  fileSizeText,
  JsonBlock,
  projectUserText,
} from '@deepseek-ai/dsh-client-ui-primitives';
import css from '@deepseek-ai/dsh-client-ui-chat/src/client/chat/MessageItem.module.css';
import { projectReferenceText } from './reference.ts';

/** Display contribution only; Core continues to own node data and message actions. */
export function mountReferenceMessages(ctx: Context): void {
  for (const key of ['user', 'steering'] as const) {
    ctx.slots.inject('conversation.chat.node', () =>
      ctx.slots.register(
        { name: 'conversation.chat.node', key, priority: -1, locale: 'chat' },
        ReferenceMessage,
      ),
    );
  }
}

/** Project page receipts without changing the durable content sent to models or Copy. */
export function ReferenceMessage(props: ChatNodeViewProps<'user' | 'steering'>) {
  const { node, t, renderMessageImages, openFile, openSkill } = props;
  const { content, time, referenceLabels = [], skillNames = [] } = node.data;
  const raw = content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('');
  const display = projectReferenceText(raw);
  if (!display.ranges.length) return <UserMessageNodeView {...props} />;
  const attachments = content.filter(
    (block) => (block.type === 'image' || block.type === 'file') && 'attachment' in block,
  );
  const rest = content.filter(
    (block) => block.type !== 'text' && block.type !== 'image' && block.type !== 'file',
  );
  const decorate = (text: string) =>
    projectUserText(text, referenceLabels, skillNames, 'skill', { openFile, openSkill });
  const runs: React.ReactNode[] = [];
  let cursor = 0;
  for (const range of display.ranges) {
    runs.push(
      <Fragment key={`text:${cursor}`}>
        {decorate(display.text.slice(cursor, range.start))}
      </Fragment>,
    );
    runs.push(
      <span key={`reference:${range.start}`} data-page-reference-label>
        {display.text.slice(range.start, range.end)}
      </span>,
    );
    cursor = range.end;
  }
  runs.push(<Fragment key={`text:${cursor}`}>{decorate(display.text.slice(cursor))}</Fragment>);
  return (
    <div className={css.userRow} data-page-reference-message>
      <div className={css.userStack}>
        {attachments.length > 0 && (
          <div className={css.attachmentRow} data-message-attachments>
            {attachments.map((block, index) =>
              block.type === 'image' ? (
                <Fragment key={index}>
                  {renderMessageImages({
                    images: [{ attachment: block.attachment }],
                    align: 'end',
                    compact: attachments.length > 1,
                  })}
                </Fragment>
              ) : block.type === 'file' ? (
                <span key={index} className={css.fileCard} title={block.attachment.name}>
                  <FileTypeIcon path={block.attachment.name} className={css.fileIcon} />
                  <span className={css.fileContent}>
                    <span className={css.fileName}>{block.attachment.name}</span>
                    <span className={css.fileMeta}>
                      {[
                        fileExtension(block.attachment.name).toUpperCase().slice(0, 8),
                        fileSizeText(block.attachment.bytes),
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    </span>
                  </span>
                </span>
              ) : null,
            )}
          </div>
        )}
        <div className={css.bubble}>
          {runs}
          {rest.map((block, index) => (
            <JsonBlock
              key={index}
              label={t('message.extraBlock')}
              payload={block}
              truncatedLabel={(total) => t('json.truncated', { total })}
            />
          ))}
        </div>
        {referenceLabels.length > 0 && (
          <div className={css.referenceSummary}>
            {t('message.referenceSummary', {
              labels: referenceLabels.join(t('message.referenceSeparator')),
            })}
          </div>
        )}
      </div>
      <MessageIconActions text={raw} time={time} clock="start" className={css.actions} t={t} />
    </div>
  );
}
