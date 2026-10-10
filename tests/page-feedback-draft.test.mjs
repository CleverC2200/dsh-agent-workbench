import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const output = await build({
  entryPoints: ['src/page-feedback-draft.ts'],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
});
const { insertPageFeedbackDraft } = await import(
  'data:text/javascript;base64,' + Buffer.from(output.outputFiles[0].text).toString('base64')
);
test('feedback appends through the public Core edit event without replacing resident text or reference chips', async () => {
  let text = '原居民草稿',
    revision = 7,
    released = 0;
  const edits = [];
  const input = {
    state: {
      getSnapshot: () => ({
        draft: text,
        draftRev: revision,
        phase: 'plain',
        occurrences: [],
      }),
    },
  };
  const binding = {
    bail: (event, edit) => {
      assert.equal(event, 'slash/input-insert-text');
      edits.push(edit);
      if (edit.span.draftRev !== revision) return false;
      text += edit.text;
      revision++;
      return true;
    },
  };
  const ctx = {
    sessions: {
      retain: (id, options) => {
        assert.equal(id, 'real-session');
        assert.equal(options.source, 'pageFeedbackDraft');
        return {
          binding: { ctx: binding },
          ready: Promise.resolve(),
          release: () => released++,
        };
      },
    },
    conversation: {
      input: {
        for: (value) => {
          assert.equal(value, binding);
          return input;
        },
      },
    },
  };
  await insertPageFeedbackDraft(ctx, 'real-session', '未发送反馈', new AbortController().signal);
  assert.equal(text, '原居民草稿\n未发送反馈');
  assert.deepEqual(edits[0].span, { start: 5, end: 5, draftRev: 7 });
  assert.equal(released, 1);
  input.state.getSnapshot = () => ({
    draft: 'a[引用原文]b',
    draftRev: revision,
    phase: 'plain',
    occurrences: [{ offset: 1, length: 6 }],
  });
  await insertPageFeedbackDraft(ctx, 'real-session', '继续', new AbortController().signal);
  assert.deepEqual(edits[1].span, { start: 3, end: 3, draftRev: 8 });
  assert.equal(released, 2);
  binding.bail = () => false;
  await assert.rejects(
    insertPageFeedbackDraft(ctx, 'real-session', '第二次', new AbortController().signal),
    /RESOURCE_DRAFT_CHANGED/,
  );
  assert.equal(released, 3);
});
test('cancellation while the actual Core Session loads cannot insert text', async () => {
  const pending = Promise.withResolvers();
  let accessed = 0,
    released = 0;
  const controller = new AbortController();
  const ctx = {
    sessions: {
      retain: () => ({
        ready: pending.promise,
        binding: { ctx: {} },
        release: () => released++,
      }),
    },
    conversation: {
      input: {
        for: () => {
          accessed++;
          throw Error('late draft access');
        },
      },
    },
  };
  const work = insertPageFeedbackDraft(ctx, 'real-session', '旧动作', controller.signal);
  controller.abort();
  pending.resolve();
  await assert.rejects(work, { name: 'AbortError' });
  assert.equal(accessed, 0);
  assert.equal(released, 1);
});
test('a busy Core input keeps its resident draft intact', async () => {
  let edited = 0,
    released = 0;
  const ctx = {
    sessions: {
      retain: () => ({
        ready: Promise.resolve(),
        binding: { ctx: { bail: () => edited++ } },
        release: () => released++,
      }),
    },
    conversation: {
      input: {
        for: () => ({
          state: { getSnapshot: () => ({ phase: 'submitting' }) },
        }),
      },
    },
  };
  await assert.rejects(
    insertPageFeedbackDraft(ctx, 'real-session', '旧动作', new AbortController().signal),
    /RESOURCE_DRAFT_CHANGED/,
  );
  assert.equal(edited, 0);
  assert.equal(released, 1);
});
