import type { InputState } from '@deepseek-ai/dsh-client-ui-conversation/client';
/** Translate owned chip occurrences from clipboard offsets to the Core's atomic edit coordinates. */
export declare function ownedReferenceSpans(state: Pick<InputState, 'occurrences'>, owned: ReadonlySet<string>): Array<{
    start: number;
    end: number;
}>;
