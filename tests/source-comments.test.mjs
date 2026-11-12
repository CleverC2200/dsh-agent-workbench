import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, renameSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { sourceComments } from '../scripts/source-comments.mjs';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const cli = resolve('scripts/check-source-comments.mjs');
const NODE_PATH = dirname(dirname(require.resolve('typescript/package.json')));

test('syntax identifies real comments while preserving strings, regex, JSX text and templates', () => {
  const text = [
    'const url = "https://example.invalid/@license";',
    'const expression = /https?:\\/\\//;',
    'const template = `/* prompt */ // text ${1 /* expression */}`;',
    'const jsx = <div title="/* attribute */">https://example.invalid{/* JSX */}</div>;',
    'const text = <div>/* body text */</div>;',
    'const lineText = <div>// body text</div>;',
    '// trailing line',
  ].join('\n');
  assert.deepEqual(
    sourceComments(ts, 'sample.tsx', text).map(({ pos, end }) => text.slice(pos, end)),
    ['/* expression */', '/* JSX */', '// trailing line'],
  );
  assert.throws(() => sourceComments(ts, 'broken.ts', 'export const = ;'), /SOURCE_COMMENTS_PARSE/);
});

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'source-comments-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const put = (file, text) => {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), text);
  };
  const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
  put('package.json', '{}');
  put('old.ts', '// original backlog\nexport const value = 1;\n');
  git('init', '-q');
  git('add', '.');
  git(
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.invalid',
    'commit',
    '-qm',
    'base',
  );
  const base = git('rev-parse', 'HEAD');
  const run = (...args) =>
    spawnSync(process.execPath, [cli, '--root', root, ...args], {
      encoding: 'utf8',
      env: { ...process.env, NODE_PATH, QUALITY_BASE_SHA: '', GITHUB_ACTIONS: '' },
    });
  return { root, put, git, base, run };
}

test('normal checks reject comments in changed and untracked files; all exposes the existing backlog', (t) => {
  const { put, run } = fixture(t);
  assert.equal(run().status, 0);
  assert.equal(run('--all').status, 1);
  put('new.mjs', 'export const url = "https://example.invalid";\n');
  assert.equal(run().status, 0);
  put('new.mjs', '/* new prose */\nexport const value = 1;\n');
  const added = run();
  assert.equal(added.status, 1, added.stderr);
  assert.match(added.stderr, /new.mjs:1/);
  put('new.mjs', 'export const value = 1;\n');
  put('old.ts', '// original backlog\nexport const value = 2;\n');
  assert.equal(run().status, 1);
});

test('base checks include committed changes and handle renamed and deleted files', (t) => {
  const { root, put, git, base, run } = fixture(t);
  renameSync(join(root, 'old.ts'), join(root, 'renamed.ts'));
  git('add', '.');
  git(
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.invalid',
    'commit',
    '-qm',
    'rename',
  );
  assert.equal(run('--base', base).status, 1);
  rmSync(join(root, 'renamed.ts'));
  assert.equal(run('--base', base).status, 0);
  assert.equal(run('--all').status, 0);
  put('bad.ts', 'const =');
  assert.match(run().stderr, /SOURCE_COMMENTS_PARSE/);
  assert.notEqual(run('../outside.ts').status, 0);
});

test('tool and legal directives remain comments, while comment examples in Prompt data remain strings', () => {
  const text =
    '// SPDX-License-Identifier: MIT\n// @ts-ignore\nexport const prompt = "/* business text */";';
  assert.equal(sourceComments(ts, 'directives.ts', text).length, 2);
});

test('CI refuses an absent base and uses the existing peer baseline for manual runs', (t) => {
  const { root, put, git, base } = fixture(t);
  const run = () =>
    spawnSync(process.execPath, [cli, '--root', root], {
      encoding: 'utf8',
      env: { ...process.env, NODE_PATH, QUALITY_BASE_SHA: '', GITHUB_ACTIONS: 'true' },
    });
  assert.match(run().stderr, /SOURCE_COMMENTS_BASE/);
  put(
    'scripts/quality-peer-baseline.json',
    JSON.stringify({ repositories: [{ repo: basename(root), head: base }] }),
  );
  put('committed.mjs', '// committed comment\nexport const value = 1;\n');
  git('add', '.');
  git(
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.invalid',
    'commit',
    '-qm',
    'manual candidate',
  );
  const result = run();
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /committed.mjs:1/);
});
