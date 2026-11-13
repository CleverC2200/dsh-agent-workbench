import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, renameSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { sourceComments } from '../scripts/source-comments.mjs';
import { formatComments } from '../scripts/format-comments.mjs';

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

test('default checks include unchanged comments; explicit base checks retain a narrow feedback option', (t) => {
  const { put, run, base } = fixture(t);
  assert.equal(run().status, 1);
  assert.equal(run('--base', base).status, 0);
  assert.equal(run('--all').status, 1);
  put('new.mjs', 'export const url = "https://example.invalid";\n');
  assert.equal(run('--base', base).status, 0);
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

test('CI checks committed comments without a base or peer baseline', (t) => {
  const { root, put, git } = fixture(t);
  put('committed.mjs', '// committed comment\nexport const value = 1;\n');
  git('add', '.');
  git(
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.invalid',
    'commit',
    '-qm',
    'candidate',
  );
  const result = spawnSync(process.execPath, [cli, '--root', root], {
    encoding: 'utf8',
    env: { ...process.env, NODE_PATH, QUALITY_BASE_SHA: '', GITHUB_ACTIONS: 'true' },
  });
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /committed.mjs:1/);
});

const parsers = {
  ts,
  html: require('parse5'),
  css: require('postcss'),
  cssTokens: require('postcss/lib/tokenize'),
  yaml: require('yaml'),
  scripts: require('highlight.js/lib/core'),
};
for (const language of ['bash', 'powershell', 'nsis', 'sql', 'java', 'dos', 'ini'])
  parsers.scripts.registerLanguage(language, require('highlight.js/lib/languages/' + language));
const comments = (file, text) =>
  formatComments(parsers, file, text).map((c) => text.slice(c.pos, c.end));

test('HTML scans embedded code, inline attributes and CRLF without treating text as code', () => {
  const html =
    '<!-- page --><style>.a{/* css */color:red;background:url(data:image/x,/*data*/)}</style>\r\n' +
    '<script>const url="https://example.invalid"; // script\r\n</script>' +
    '<div onclick="/* event */ run()" style="color:red;/* attr */">// text</div>' +
    '<script type="text/plain">// prompt</script>';
  assert.deepEqual(comments('page.html', html), [
    '<!-- page -->',
    '/* css */',
    '// script',
    '/* event */',
    '/* attr */',
  ]);
});

test('CSS, YAML, JSONC and Python preserve quoted and literal data', () => {
  assert.deepEqual(comments('style.css', '.a{/* css */content:"/* text */"}'), ['/* css */']);
  assert.deepEqual(
    comments('data.yaml', 'url: "https://example.invalid/#text" # prose\nbody: |\n  # data\n'),
    ['# prose'],
  );
  assert.deepEqual(comments('data.jsonc', '{"url":"https://example.invalid" /* prose */}'), [
    '/* prose */',
  ]);
  assert.deepEqual(comments('tool.py', '#!/usr/bin/env python3\ntext="🐱 # data" # prose\n'), [
    '# prose',
  ]);
});

test('script lexers preserve strings, here strings and heredoc payloads', () => {
  const shell = '#!/bin/bash\necho "# text" # prose\ncat <<\'EOF\'\n# data\nEOF\n# after\n';
  assert.deepEqual(comments('tool.sh', shell), ['# prose', '# after']);
  assert.deepEqual(comments('tool.sh', 'echo "<<EOF" # prose\n# after\n'), ['# prose', '# after']);
  assert.deepEqual(comments('tool.ps1', '$x = @"\n# data\n"@\n# prose\n'), ['# prose']);
  assert.deepEqual(comments('setup.nsh', 'DetailPrint "; text"\n; prose\n'), ['; prose']);
  assert.deepEqual(comments('query.sql', "select '-- text'; -- prose\n/* block */"), [
    '-- prose',
    '/* block */',
  ]);
});

test('ownership exclusions remain visible in an audit report', (t) => {
  const { root, put, run } = fixture(t);
  put('old.ts', 'export const value = 1;\n');
  put('third-party/vendor.js', '/* retained license */\nexport const value=1;');
  put(
    'source-comments.json',
    JSON.stringify({
      assets: [{ path: 'third-party/vendor.js', kind: 'third-party', source: 'NOTICE.md' }],
    }),
  );
  const report = join(root, 'report.json');
  const result = run('--report', report);
  assert.equal(result.status, 0, result.stderr);
  const audit = JSON.parse(readFileSync(report));
  assert.equal(audit.scope, 'all-owned');
  assert.deepEqual(audit.excluded, [
    { file: 'third-party/vendor.js', kind: 'third-party', source: 'NOTICE.md' },
  ]);
});

test('workflow run comments are code while ordinary YAML block data stays intact', () => {
  const text =
    'jobs:\n  check:\n    runs-on: ubuntu-latest\n    steps:\n      - run: |\n          echo "# data" # script\n          # explanation\n';
  assert.deepEqual(comments('.github/workflows/check.yml', text), ['# script', '# explanation']);
  assert.deepEqual(comments('data.yml', text), []);
});

test('line configuration comments preserve escaped patterns and literal values', () => {
  assert.deepEqual(comments('.gitignore', '# prose\n\\#file\nfile#name\n'), ['# prose']);
  assert.deepEqual(comments('.npmrc', '; prose\nregistry=https://example.invalid/#part\n'), [
    '; prose',
  ]);
});

test('received input and fixture manifests preserve exact bytes without exempting new own files', (t) => {
  for (const layout of ['map', 'provenance']) {
    const { put, run } = fixture(t);
    const input = '/* received instruction */\nexport const value=1;';
    const sha256 = createHash('sha256').update(input).digest('hex');
    put('old.ts', 'export const value=1;');
    put('received/input.js', input);
    put(
      'received/SOURCE.json',
      JSON.stringify({
        files: layout === 'map' ? { 'input.js': sha256 } : [{ path: 'input.js', sha256 }],
      }),
    );
    put(
      'source-comments.json',
      JSON.stringify({
        assets: [],
        manifests: [{ root: 'received', path: 'received/SOURCE.json' }],
      }),
    );
    assert.equal(run().status, 0, layout);
    put('received/input.js', input + '\n');
    assert.match(run().stderr, /SOURCE_COMMENTS_RECEIVED_BYTES_CHANGED/, layout);
    put('received/input.js', input);
    put('received/own.js', '// own comment\nexport const value=2;');
    const result = run();
    assert.equal(result.status, 1, layout);
    assert.match(result.stderr, /received\/own.js:1/, layout);
  }
});
