import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';

const runner = new URL('../scripts/source-checks.mjs', import.meta.url).href;
function fixture(t, changed) {
  const parent = mkdtempSync(join(tmpdir(), 'source-checks-'));
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  const put = (root, file, text) => { mkdirSync(dirname(join(root, file)), { recursive: true }); writeFileSync(join(root, file), text); };
  const git = (root, ...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
  const commit = root => { git(root, 'add', '.'); git(root, '-c', 'user.name=fixture', '-c', 'user.email=fixture@invalid', 'commit', '-qm', 'fixture'); return git(root, 'rev-parse', 'HEAD'); };
  const repositories = ['dsh-agent-workbench', 'dsh-agent-manage', 'dsh-gea-plugin'].map(repo => {
    const path = join(parent, repo); mkdirSync(path); git(path, 'init', '-q'); put(path, 'README.md', 'fixture'); return { repo, path, head: commit(path) };
  });
  const root = repositories[0].path;
  put(root, 'scripts/quality-peer-baseline.json', JSON.stringify({ schemaVersion: 1, repositories: repositories.map(({ repo, head }) => ({ repo, head })) }));
  put(root, 'scripts/tool.mjs', 'export const value = 1;');
  put(root, 'tests/tool.test.mjs', 'import { value } from "../scripts/tool.mjs"; if(value!==2) throw Error("BEHAVIOR_NOT_FIXED");');
  put(root, 'tests/required.test.mjs', 'throw Error("UNRELATED_REQUIRED");');
  put(root, 'tests/unrelated.test.mjs', 'throw Error("UNRELATED_SUITE");');
  put(root, 'scripts/ci-test-policy.json', JSON.stringify({ schemaVersion: 1, required: ['tests/required.test.mjs'], tests: ['tests/*.test.mjs'], rules: [] }));
  const base = commit(root);
  for (const [file, text] of Object.entries(changed)) put(root, file, text);
  const head = commit(root);
  const result = { base, head, files: Object.keys(changed), mode: 'code' };
  const env = { ...process.env, SOURCE_REPOSITORY: 'dsh-agent-workbench', GITHUB_OUTPUT: '' };
  delete env.NODE_TEST_CONTEXT;
  const run = phase => spawnSync(process.execPath, ['--input-type=module', '-e', `import {sourceChecks} from ${JSON.stringify(runner)}; await sourceChecks(${JSON.stringify(result)}, ${JSON.stringify(phase)});`], { cwd: root, encoding: 'utf8', env });
  return { root, run };
}

test('a tool-only source change runs its behavior test cold and excludes unrelated required suites', t => {
  const f = fixture(t, { 'scripts/tool.mjs': 'export const value = 2;' });
  const planned = f.run('affected-plan');
  assert.equal(planned.status, 0, planned.stderr);
  const plan = JSON.parse(planned.stdout);
  assert.deepEqual(plan.files, ['tests/tool.test.mjs']);
  assert.equal(plan.sdk, false);
  assert.equal(plan.dependencies, false);
  assert.equal(plan.typecheck, false);
  const executed = f.run('affected-check');
  assert.equal(executed.status, 0, executed.stderr);
  assert.match(executed.stdout, /passed/);
});

test('affected behavior failure blocks source checks without preparing unrelated inputs', t => {
  const f = fixture(t, { 'scripts/tool.mjs': 'export const value = 3;' });
  const executed = f.run('affected-check');
  assert.notEqual(executed.status, 0, executed.stdout + executed.stderr);
  assert.match(executed.stdout + executed.stderr, /BEHAVIOR_NOT_FIXED/);
});

test('unknown TypeScript source cannot receive a syntax-only green result', t => {
  const f = fixture(t, { 'src/unknown.ts': 'export const value: number = "wrong";' });
  const planned = f.run('affected-plan');
  assert.notEqual(planned.status, 0);
  assert.match(planned.stderr, /CI_TEST_IMPACT_UNMAPPED/);
});
