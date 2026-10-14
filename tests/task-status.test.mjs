import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const run = (...args) =>
  spawnSync(process.execPath, ['scripts/task-status.mjs', ...args], {
    encoding: 'utf8',
  });

test('the task status CLI observes checkout changes without rewriting the frozen input', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'workbench-task-status-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const git = (path, ...args) =>
    execFileSync('git', ['-C', path, ...args], { encoding: 'utf8' }).trim();
  const repositories = [
    ['dsh-agent-workbench', '@cleverc2200/dsh-agent-workbench'],
    ['dsh-agent-manage', 'dsh-agent-manage'],
    ['dsh-gea-plugin', '@cleverc2200/gea-dsh-prototype'],
  ].map(([repo, name]) => {
    const path = join(directory, repo);
    mkdirSync(path);
    git(path, 'init', '--quiet');
    git(path, 'config', 'user.name', 'Fixture');
    git(path, 'config', 'user.email', 'fixture@example.invalid');
    writeFileSync(join(path, 'package.json'), JSON.stringify({ name }));
    git(path, 'add', 'package.json');
    git(path, 'commit', '--quiet', '-m', 'Initial fixture');
    return { repo, path, head: git(path, 'rev-parse', 'HEAD') };
  });
  const input = join(directory, 'integration-set.json');
  const bytes = JSON.stringify({ repositories, scope: 'fixture source input' }, null, 2) + '\n';
  writeFileSync(input, bytes);
  const first = run('--input', input);
  assert.equal(first.status, 0, first.stderr);
  const initial = JSON.parse(first.stdout);
  assert.equal(initial.scope, 'source-observation');
  assert.equal(initial.input, input);
  assert.equal(initial.repositories.length, 3);
  assert.ok(initial.repositories.every((row) => row.matches && !row.dirty));
  assert.ok(Number.isFinite(Date.parse(initial.observedAt)));

  writeFileSync(
    join(repositories[0].path, 'package.json'),
    JSON.stringify({ name: '@cleverc2200/dsh-agent-workbench', description: 'edited' }),
  );
  writeFileSync(join(repositories[0].path, 'local-note.txt'), 'Untracked fixture');
  git(repositories[1].path, 'commit', '--quiet', '--allow-empty', '-m', 'Next fixture');
  const next = run('--input', input);
  assert.equal(next.status, 0, next.stderr);
  const observed = JSON.parse(next.stdout);
  assert.equal(observed.repositories[0].dirty, true);
  assert.equal(observed.repositories[0].matches, true);
  assert.ok(observed.repositories[0].changes.some((line) => line.includes('local-note.txt')));
  assert.equal(observed.repositories[1].matches, false);
  assert.equal(observed.repositories[1].expectedHead, repositories[1].head);
  assert.equal(observed.repositories[1].dirty, false);
  assert.equal(observed.repositories[2].dirty, false);
  assert.equal(readFileSync(input, 'utf8'), bytes);
});

test('the task status CLI rejects missing or ambiguous input rather than finding another task', (t) => {
  assert.notEqual(run().status, 0);
  const directory = mkdtempSync(join(tmpdir(), 'workbench-task-status-invalid-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const input = join(directory, 'input.json');
  for (const repositories of [
    [],
    [{ repo: 'dsh-agent-workbench', path: directory, head: 'main' }],
  ]) {
    writeFileSync(input, JSON.stringify({ repositories }));
    const result = run('--input', input);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /TASK_STATUS_INPUT/);
  }
});
