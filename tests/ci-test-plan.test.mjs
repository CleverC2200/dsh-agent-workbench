import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { selectCiTests } from '../scripts/ci-test-plan.mjs';

function fixture(t, repo = 'dsh-agent-workbench') {
  const directory = mkdtempSync(join(tmpdir(), 'ci-impact-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const git = (root, ...args) =>
    execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
  const put = (root, file, text) => {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), text);
  };
  const commit = (root) => {
    git(root, 'add', '.');
    git(
      root,
      '-c',
      'user.name=fixture',
      '-c',
      'user.email=fixture@invalid',
      'commit',
      '-qm',
      'input',
    );
    return git(root, 'rev-parse', 'HEAD');
  };
  const repositories = ['dsh-agent-workbench', 'dsh-agent-manage', 'dsh-gea-plugin'].map((repo) => {
    const path = join(directory, repo);
    mkdirSync(path);
    git(path, 'init', '-q');
    put(path, 'src/value.ts', 'export const value = 1;\n');
    return { repo, path, head: commit(path) };
  });
  const own = repositories.find((entry) => entry.repo === repo),
    root = own.path;
  const policy = {
    schemaVersion: 1,
    required: ['tests/required.test.mjs'],
    tests: ['tests/*.test.mjs'],
    rules: [{ pattern: '^scripts/ci-test-policy\\.json$', tests: ['tests/required.test.mjs'] }],
  };
  put(root, 'scripts/ci-test-policy.json', JSON.stringify(policy));
  put(root, 'scripts/quality-peer-baseline.json', JSON.stringify({ repositories }));
  put(root, 'tests/required.test.mjs', 'export const required = true;');
  put(root, 'tests/affected.test.mjs', 'import "../src/consumer.js";');
  put(root, 'src/consumer.ts', 'import "./value.js";');
  put(root, 'tests/peer.test.mjs', 'import "../../dsh-agent-manage/src/value.js";');
  put(root, 'tests/unrelated.test.mjs', 'export const unrelated = true;');
  let base = commit(root);
  own.head = base;
  return {
    root,
    repositories,
    policy,
    put,
    commit,
    checkpoint: () => {
      base = commit(root);
      own.head = base;
    },
    plan: () => selectCiTests({ repositories, repo: own.repo, base }),
  };
}

test('required checks run for a docs-only change without selecting the full pool', (t) => {
  const f = fixture(t);
  f.put(f.root, 'README.md', 'documentation');
  f.repositories[0].head = f.commit(f.root);
  const plan = f.plan();
  assert.deepEqual(plan.files, ['tests/required.test.mjs']);
  assert.equal(plan.fullSuite, 'not-run');
  assert.equal(plan.runtime, false);
});
test('transitive authored imports select the affected file and exclude unrelated tests', (t) => {
  const f = fixture(t);
  f.put(f.root, 'src/value.ts', 'export const value = 2;');
  f.repositories[0].head = f.commit(f.root);
  assert.deepEqual(f.plan().files, ['tests/affected.test.mjs', 'tests/required.test.mjs']);
});
test('deleted source remains an affected dependency, and peer changes are bound to the committed baseline', (t) => {
  const f = fixture(t);
  unlinkSync(join(f.root, 'src/value.ts'));
  f.repositories[0].head = f.commit(f.root);
  const peer = f.repositories[1];
  f.put(peer.path, 'src/value.ts', 'export const value = 3;');
  peer.head = f.commit(peer.path);
  assert.deepEqual(f.plan().files, [
    'tests/affected.test.mjs',
    'tests/peer.test.mjs',
    'tests/required.test.mjs',
  ]);
});
test('unmapped runtime source refuses before preparation; no full-suite fallback is allowed', (t) => {
  const f = fixture(t);
  f.put(f.root, 'src/unmapped.ts', 'export const uncovered = true;');
  f.repositories[0].head = f.commit(f.root);
  assert.throws(f.plan, /CI_TEST_IMPACT_UNMAPPED/);
});
test('explicit dynamic-consumer rules select real files and missing required files refuse', (t) => {
  const f = fixture(t);
  f.policy.rules.push({ pattern: '^src/dynamic\\.ts$', tests: ['tests/peer.test.mjs'] });
  f.put(f.root, 'scripts/ci-test-policy.json', JSON.stringify(f.policy));
  f.put(f.root, 'src/dynamic.ts', 'export const dynamic = true;');
  f.repositories[0].head = f.commit(f.root);
  assert.deepEqual(f.plan().files, ['tests/peer.test.mjs', 'tests/required.test.mjs']);
  unlinkSync(join(f.root, 'tests/required.test.mjs'));
  assert.throws(f.plan, /CI_TEST_FILE_REQUIRED/);
});
test('invalid base commits and policy paths refuse rather than interpreting refs or traversal', (t) => {
  const f = fixture(t);
  assert.throws(
    () =>
      selectCiTests({ repositories: f.repositories, repo: 'dsh-agent-workbench', base: 'main' }),
    /CI_TEST_BASE_REQUIRED/,
  );
  f.policy.required = ['../other.test.mjs'];
  f.put(f.root, 'scripts/ci-test-policy.json', JSON.stringify(f.policy));
  assert.throws(f.plan, /CI_TEST_PATH_REJECTED/);
});

test('a fixed file reference does not request a Profile, while an actual imported Profile does', (t) => {
  const f = fixture(t, 'dsh-gea-plugin');
  f.put(f.root, 'tests/profile.mjs', 'export const profile = true;');
  f.put(f.root, 'tests/required.test.mjs', "export const fixturePath = 'tests/profile.mjs';");
  const own = f.repositories.find((entry) => entry.repo === 'dsh-gea-plugin');
  own.head = f.commit(f.root);
  assert.equal(f.plan().runtime, false);
  f.put(f.root, 'tests/required.test.mjs', "import './profile.mjs';");
  own.head = f.commit(f.root);
  assert.equal(f.plan().runtime, true);
});

test('an empty required policy cannot invoke a runner with no file arguments', (t) => {
  const f = fixture(t);
  f.policy.required = [];
  f.put(f.root, 'scripts/ci-test-policy.json', JSON.stringify(f.policy));
  assert.throws(f.plan, /CI_TEST_POLICY_REQUIRED/);
});

test('an affected public contract file remains selectable alongside ordinary tests', (t) => {
  const f = fixture(t);
  f.policy.tests.push('tests/*.contract.mjs');
  f.put(f.root, 'scripts/ci-test-policy.json', JSON.stringify(f.policy));
  f.put(f.root, 'tests/loader.contract.mjs', 'import "../src/value.js";');
  f.put(f.root, 'src/value.ts', 'export const value = 2;');
  f.repositories[0].head = f.commit(f.root);
  assert.deepEqual(f.plan().files, [
    'tests/affected.test.mjs',
    'tests/loader.contract.mjs',
    'tests/required.test.mjs',
  ]);
});

test('script-only source policy and task status changes select their direct public consumers', async (t) => {
  const production = JSON.parse(
    readFileSync(new URL('../scripts/ci-test-policy.json', import.meta.url)),
  );
  for (const [source, consumer] of [
    ['scripts/ci-source-policy.mjs', 'scripts/business-profile-ci.test.mjs'],
    ['scripts/business-profile-ci.mjs', 'scripts/business-profile-ci.test.mjs'],
    ['scripts/task-status.mjs', 'tests/task-status.test.mjs'],
  ])
    await t.test(source, (t) => {
      const f = fixture(t);
      f.policy.rules = production.rules;
      f.policy.tests.push('scripts/*.test.mjs');
      f.put(f.root, 'scripts/ci-test-policy.json', JSON.stringify(f.policy));
      for (const file of [
        consumer,
        'scripts/business-profile-ci.test.mjs',
        'tests/quality-ci.test.mjs',
        'tests/candidate-input.test.mjs',
      ])
        f.put(f.root, file, 'export const fixture = true;');
      f.put(f.root, source, 'export const revision = 1;');
      f.checkpoint();
      f.put(f.root, source, 'export const revision = 2;');
      f.repositories[0].head = f.commit(f.root);
      const plan = f.plan();
      assert.deepEqual(plan.changes, [{ repo: 'dsh-agent-workbench', file: source }]);
      assert.ok(
        plan.reasons['dsh-agent-workbench/' + source].includes(consumer),
        JSON.stringify(plan),
      );
      assert.ok(plan.files.includes('tests/required.test.mjs'));
      assert.ok(plan.files.includes('tests/quality-ci.test.mjs'));
      assert.ok(!plan.files.includes('tests/unrelated.test.mjs'));
    });
});
