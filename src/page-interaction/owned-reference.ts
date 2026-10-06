import type { InputState } from '@deepseek-ai/dsh-client-ui-conversation/client';
import { REFERENCE_SOURCE } from './reference.ts';

/** Translate owned chip occurrences from clipboard offsets to the Core's atomic edit coordinates. */
export function ownedReferenceSpans(
  state: Pick<InputState, 'occurrences'>,
  owned: ReadonlySet<string>,
): Array<{ start: number; end: number }> {
  let expanded = 0;
  const spans = [];
  for (const occurrence of state.occurrences) {
    const start = occurrence.offset - expanded;
    if (occurrence.source === REFERENCE_SOURCE && owned.has(occurrence.ref))
      spans.push({ start, end: start + 1 });
    expanded += occurrence.length - 1;
  }
  return spans.reverse();
}
