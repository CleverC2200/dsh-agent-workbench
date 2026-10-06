import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const output = await build({
  entryPoints: ['src/page-interaction/owned-reference.ts'],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
});
const { ownedReferenceSpans } = await import(
  'data:text/javascript;base64,' + Buffer.from(output.outputFiles[0].text).toString('base64')
);

test('owned reference cleanup leaves foreign sources and edited plain text outside its edit spans', () => {
  const owned = new Set(['old-owner']);
  const state = {
    occurrences: [
      { offset: 3, length: 8, source: 'file', ref: 'attachment' },
      { offset: 12, length: 20, source: 'page-content', ref: 'other-owner' },
      { offset: 34, length: 7, source: 'page-content', ref: 'old-owner' },
    ],
  };
  assert.deepEqual(ownedReferenceSpans(state, owned), [{ start: 8, end: 9 }]);
  assert.deepEqual(
    ownedReferenceSpans({ occurrences: [] }, owned),
    [],
    'a label edited into ordinary text is no longer an owned chip',
  );
});

test('multiple owned chips are consumed backwards without moving earlier text or foreign chips', () => {
  const state = {
    occurrences: [
      { offset: 2, length: 5, source: 'page-content', ref: 'one' },
      { offset: 9, length: 4, source: 'file', ref: 'file' },
      { offset: 15, length: 9, source: 'page-content', ref: 'two' },
    ],
  };
  assert.deepEqual(ownedReferenceSpans(state, new Set(['one', 'two'])), [
    { start: 8, end: 9 },
    { start: 2, end: 3 },
  ]);
});
