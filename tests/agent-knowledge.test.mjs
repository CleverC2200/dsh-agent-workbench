import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const cli = resolve(import.meta.dirname, '../scripts/check-agent-knowledge.mjs');
function fixture(t) {
  const temporary = resolve(import.meta.dirname, '../.scratch');
  mkdirSync(temporary, { recursive: true });
  const root = mkdtempSync(resolve(temporary, 'agent-knowledge-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const config = {
    entries: ['AGENTS.md', 'README.md'],
    paths: [],
    scripts: [],
    peers: [],
    history: [],
  };
  writeFileSync(resolve(root, 'AGENTS.md'), '[Current guide](README.md)\n');
  writeFileSync(resolve(root, 'README.md'), '# Current guide\n');
  writeFileSync(
    resolve(root, 'package.json'),
    JSON.stringify({ scripts: { test: 'node --test' } }),
  );
  const run = (args = []) => {
    writeFileSync(resolve(root, 'agent-knowledge.json'), JSON.stringify(config));
    return spawnSync(
      process.execPath,
      [cli, '--root', root, '--config', resolve(root, 'agent-knowledge.json'), ...args],
      { encoding: 'utf8' },
    );
  };
  return { root, config, run };
}
test('an active guide cannot send an Agent to a deleted local implementation', (t) => {
  const { root, run } = fixture(t);
  writeFileSync(resolve(root, 'README.md'), '[Session implementation](src/removed-session.ts)\n');
  const result = run();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /AGENT_REFERENCE_MISSING.*removed-session.ts/);
});

test('a guide cannot advertise an absent package script', (t) => {
  const { root, run } = fixture(t);
  writeFileSync(resolve(root, 'README.md'), 'Run `npm run build:obsolete`.\n');
  const result = run();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /AGENT_COMMAND_MISSING.*build:obsolete/);
});

test('a declared current implementation path must exist', (t) => {
  const { root: _root, config, run } = fixture(t);
  config.paths = ['src/current.ts'];
  const missing = run();
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /AGENT_REFERENCE_MISSING.*current.ts/);
});

test('a prepared package cannot advertise an absent exported declaration', (t) => {
  const { root, config, run } = fixture(t);
  writeFileSync(
    resolve(root, 'package.json'),
    JSON.stringify({ exports: { '.': { types: './lib/missing.d.ts' } } }),
  );
  config.exports = true;
  const missing = run();
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /AGENT_REFERENCE_MISSING.*missing.d.ts/);
});

test('historical evidence must exist but its obsolete commands and links do not become current', (t) => {
  const { root, config, run } = fixture(t);
  mkdirSync(resolve(root, 'history'));
  writeFileSync(
    resolve(root, 'history/original.md'),
    'Use `npm run removed:command` and [old implementation](missing.ts).\n',
  );
  writeFileSync(resolve(root, 'README.md'), '[Historical original](history/original.md)\n');
  config.history = ['history'];
  const result = run();
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout).history, [resolve(root, 'history/original.md')]);
});

test('a guide cannot silently consume an undeclared peer checkout', (t) => {
  const { root, run } = fixture(t);
  writeFileSync(resolve(root, 'README.md'), '[Another checkout](../)\n');
  const result = run();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /AGENT_PEER_REQUIRED/);
});

test('a documented Node command must have its script', (t) => {
  const { root, run } = fixture(t);
  writeFileSync(resolve(root, 'README.md'), 'Run `node scripts/removed.mjs`.\n');
  const result = run();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /AGENT_REFERENCE_MISSING.*removed.mjs/);
});

test('valid navigation, commands and declarations pass without executing commands', (t) => {
  const { root, config, run } = fixture(t);
  mkdirSync(resolve(root, 'src'));
  mkdirSync(resolve(root, 'scripts'));
  writeFileSync(resolve(root, 'src/current.ts'), 'export {};\n');
  writeFileSync(
    resolve(root, 'scripts/do-not-run.mjs'),
    'throw Error("knowledge checks must never execute commands");\n',
  );
  writeFileSync(
    resolve(root, 'README.md'),
    '[Current source](src/current.ts)\nRun `npm run test` and `node scripts/do-not-run.mjs`.\n',
  );
  config.paths = ['src/current.ts'];
  config.scripts = ['test'];
  const result = run();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).status, 'passed');
});

function git(root, ...args) {
  const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}
test('comment-only comparison refuses an actual executable change through its public CLI', (t) => {
  const { root, run } = fixture(t);
  mkdirSync(resolve(root, 'src'));
  writeFileSync(
    resolve(root, 'src/current.ts'),
    '/** Business reason. */\nexport const amount = 1;\n',
  );
  git(root, 'init', '-q');
  git(root, 'add', '.');
  git(
    root,
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.invalid',
    'commit',
    '-qm',
    'known executable',
  );
  const ref = git(root, 'rev-parse', 'HEAD');
  writeFileSync(
    resolve(root, 'src/current.ts'),
    '/** Updated reason. */\nexport const amount = 2;\n',
  );
  const result = run(['--compare-ref', ref]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /AGENT_COMMENT_ONLY_REQUIRED.*current.ts/);
});

test('comment-only comparison preserves legal and tool directives while accepting prose cleanup', (t) => {
  const { root, run } = fixture(t);
  mkdirSync(resolve(root, 'src'));
  const baseline =
    '// SPDX-License-Identifier: MIT\n// oxlint-disable-next-line no-console -- CLI output\n/** Before wording. */\nexport const amount = 1;\n';
  writeFileSync(resolve(root, 'src/current.ts'), baseline);
  git(root, 'init', '-q');
  git(root, 'add', '.');
  git(
    root,
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.invalid',
    'commit',
    '-qm',
    'protected directives',
  );
  const ref = git(root, 'rev-parse', 'HEAD');
  writeFileSync(
    resolve(root, 'src/current.ts'),
    baseline.replace('/** Before wording. */', '/** Current business reason. */'),
  );
  assert.equal(run(['--compare-ref', ref]).status, 0);
  writeFileSync(
    resolve(root, 'src/current.ts'),
    baseline.replace('// SPDX-License-Identifier: MIT\n', ''),
  );
  const missingLicense = run(['--compare-ref', ref]);
  assert.notEqual(missingLicense.status, 0);
  assert.match(missingLicense.stderr, /AGENT_PROTECTED_COMMENT.*current.ts/);
});

test('Markdown link examples inside code are preserved without becoming active references', (t) => {
  const { root, run } = fixture(t);
  writeFileSync(
    resolve(root, 'README.md'),
    'Use `[topic](../../implemented/architecture/missing.md)` as syntax.\n```md\n[example](missing.md)\n```\n',
  );
  const result = run();
  assert.equal(result.status, 0, result.stderr);
});

test('official core build refuses absent SDK before generating any output', (t) => {
  const { root } = fixture(t);
  mkdirSync(resolve(root, 'scripts'));
  for (const file of ['build.mjs', 'verify-official-input.mjs']) {
    writeFileSync(
      resolve(root, 'scripts', file),
      readFileSync(resolve(import.meta.dirname, '../scripts', file)),
    );
  }
  writeFileSync(
    resolve(root, 'tsconfig.official.json'),
    JSON.stringify({
      compilerOptions: { paths: { '@deepseek-ai/cordis': ['missing/lib/types/index.d.ts'] } },
    }),
  );
  const result = spawnSync(process.execPath, ['scripts/build.mjs', '--target', 'core'], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, DSH_TYPECHECK_PROJECT: 'tsconfig.official.json' },
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /OFFICIAL_MATERIAL_REQUIRED/);
  assert.equal(existsSync(resolve(root, 'lib')), false);
});

test('a compact pnpm command for a removed target is refused', (t) => {
  const { root, run } = fixture(t);
  writeFileSync(resolve(root, 'README.md'), 'Run `corepack pnpm build:workbench`.\n');
  const result = run();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /AGENT_COMMAND_MISSING.*build:workbench/);
});

test('a declared peer link is checked without treating the peer scripts as this repository scripts', (t) => {
  const { root, config, run } = fixture(t);
  mkdirSync(resolve(root, 'peer'));
  writeFileSync(
    resolve(root, 'peer/package.json'),
    JSON.stringify({ scripts: { 'peer:check': 'node --test' } }),
  );
  writeFileSync(resolve(root, 'peer/README.md'), 'Run `npm run peer:check`.\n');
  writeFileSync(resolve(root, 'README.md'), '[Peer development](peer/README.md)\n');
  config.peers = ['peer'];
  const result = run();
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout).peerReferences, [resolve(root, 'peer/README.md')]);
});

test('a document can explicitly use Core commands while the same undeclared command remains refused', (t) => {
  const { root, config, run } = fixture(t);
  mkdirSync(resolve(root, 'core'));
  writeFileSync(
    resolve(root, 'core/package.json'),
    JSON.stringify({ scripts: { 'dev:desktop': 'node do-not-run.mjs' } }),
  );
  writeFileSync(resolve(root, 'README.md'), 'Run `corepack pnpm dev:desktop`.\n');
  const undeclared = run();
  assert.notEqual(undeclared.status, 0);
  assert.match(undeclared.stderr, /AGENT_COMMAND_MISSING.*dev:desktop/);
  config.peers = ['core'];
  config.commandRoots = { 'README.md': ['core'] };
  const declared = run();
  assert.equal(declared.status, 0, declared.stderr);
});

test('ordinary package-manager prose is not mistaken for a compact script command', (t) => {
  const { root, run } = fixture(t);
  writeFileSync(resolve(root, 'README.md'), 'The repository uses a pnpm workspace.\n');
  const result = run();
  assert.equal(result.status, 0, result.stderr);
});

test('documented npm deprecate is recognized as a package-manager action and never executed', (t) => {
  const { root, run } = fixture(t);
  writeFileSync(
    resolve(root, 'README.md'),
    'Historical policy uses `npm deprecate package@version "reason"`.\n',
  );
  const result = run();
  assert.equal(result.status, 0, result.stderr);
});

test('package-manager version options are not interpreted as script names', (t) => {
  const { root, run } = fixture(t);
  writeFileSync(resolve(root, 'README.md'), '```sh\ncorepack pnpm --version\n```\n');
  const result = run();
  assert.equal(result.status, 0, result.stderr);
});

test('npm metadata actions pass but their explicit run forms still require project scripts', (t) => {
  const { root, run } = fixture(t);
  for (const command of ['shrinkwrap', 'unpublish', 'publish']) {
    writeFileSync(resolve(root, 'README.md'), `Use \`npm ${command}\`.\n`);
    const metadata = run();
    assert.equal(metadata.status, 0, metadata.stderr);
    writeFileSync(resolve(root, 'README.md'), `Use \`npm run ${command}\`.\n`);
    const script = run();
    assert.notEqual(script.status, 0);
    assert.match(script.stderr, new RegExp(`AGENT_COMMAND_MISSING.*${command}`));
  }
});

test('compact metadata commands follow their own package manager and explicit run never borrows them', (t) => {
  const { root, run } = fixture(t);
  writeFileSync(resolve(root, 'README.md'), 'Use `pnpm store path` and `pnpm dlx do-not-run`.\n');
  assert.equal(run().status, 0);
  for (const command of ['npm store', 'npm dlx', 'pnpm shrinkwrap', 'pnpm run store']) {
    writeFileSync(resolve(root, 'README.md'), `Use \`${command}\`.\n`);
    const result = run();
    assert.notEqual(result.status, 0, command);
    assert.match(result.stderr, /AGENT_COMMAND_MISSING/);
  }
});

test('lifecycle commands require declared project scripts instead of passing as metadata commands', (t) => {
  const { root, run } = fixture(t);
  writeFileSync(resolve(root, 'package.json'), JSON.stringify({ scripts: {} }));
  for (const manager of ['npm', 'pnpm'])
    for (const command of ['start', 'test', 'stop', 'restart']) {
      writeFileSync(resolve(root, 'README.md'), `Use \`${manager} ${command}\`.\n`);
      const missing = run();
      assert.notEqual(missing.status, 0);
      assert.match(missing.stderr, new RegExp(`AGENT_COMMAND_MISSING.*${command}`));
    }
  writeFileSync(
    resolve(root, 'package.json'),
    JSON.stringify({ scripts: { start: 'node never-execute.mjs' } }),
  );
  writeFileSync(resolve(root, 'README.md'), 'Use `npm start` and `pnpm start`.\n');
  assert.equal(run().status, 0);
});

test('separate code spans naming npm and pip sources cannot be joined into a command', (t) => {
  const { root, run } = fixture(t);
  writeFileSync(resolve(root, 'README.md'), '`npm`/`pip` sources are documented as metadata.\n');
  const result = run();
  assert.equal(result.status, 0, result.stderr);
});
