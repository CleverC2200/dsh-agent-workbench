import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

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

function resumeFixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'workbench-resume-'));
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
  const executionFile = join(directory, 'execution.json');
  const inputBytes = JSON.stringify({
    task: 'R1-fixture',
    repositories,
    execution: './execution.json',
  });
  writeFileSync(input, inputBytes);
  writeFileSync(join(directory, 'human-authorization.md'), 'Fixture human authorization');
  writeFileSync(join(directory, 'handoff.md'), 'Fixture current task handoff');
  const execution = {
    task: 'R1-fixture',
    owner: 'current-owner',
    state: 'in-progress',
    inputSha256: createHash('sha256').update(inputBytes).digest('hex'),
    authorization: {
      path: './human-authorization.md',
      sha256: createHash('sha256').update('Fixture human authorization').digest('hex'),
    },
    handoff: {
      path: './handoff.md',
      sha256: createHash('sha256').update('Fixture current task handoff').digest('hex'),
    },
    stopMarkers: ['./STOP', './HANDED_OFF'],
    pullRequests: [
      {
        repo: 'dsh-agent-workbench',
        repository: 'fixture/dsh-agent-workbench',
        number: 12,
        head: repositories[0].head,
        base: 'a'.repeat(40),
        headRef: 'fixture-branch',
        baseRef: 'main',
      },
    ],
  };
  const remote = {
    state: 'open',
    number: 12,
    head: { sha: repositories[0].head, ref: 'fixture-branch' },
    base: { sha: 'a'.repeat(40), ref: 'main', repo: { full_name: 'fixture/dsh-agent-workbench' } },
  };
  const responseFile = join(directory, 'remote.json');
  const requests = join(directory, 'requests.jsonl');
  const bin = join(directory, 'bin');
  mkdirSync(bin);
  writeFileSync(
    join(bin, 'gh'),
    `#!${process.execPath}
import fs from 'node:fs';
const args = process.argv.slice(2);
fs.appendFileSync(process.env.FIXTURE_REQUESTS, JSON.stringify(args) + '\\n');
if (args[0] !== 'api' || args[1] !== '--method' || args[2] !== 'GET' || args[3] !== 'repos/fixture/dsh-agent-workbench/pulls/12') process.exit(2);
if (process.env.FIXTURE_MUTATION) {
  await new Promise((resolve) => setTimeout(resolve, 50));
  const change = JSON.parse(process.env.FIXTURE_MUTATION);
  fs.writeFileSync(change.path, change.content);
}
process.stdout.write(fs.readFileSync(process.env.FIXTURE_RESPONSE));
`,
    { mode: 0o755 },
  );
  const save = () => {
    writeFileSync(executionFile, JSON.stringify(execution));
    writeFileSync(responseFile, JSON.stringify(remote));
  };
  save();
  const env = {
    ...process.env,
    PATH: `${bin}:${process.env.PATH}`,
    FIXTURE_RESPONSE: responseFile,
    FIXTURE_REQUESTS: requests,
  };
  const invoke = (...args) =>
    spawnSync(process.execPath, ['scripts/task-status.mjs', '--input', input, ...args], {
      encoding: 'utf8',
      env,
    });
  const check = () => invoke('--check-resume', '--owner', 'current-owner');
  return {
    directory,
    repositories,
    input,
    executionFile,
    execution,
    remote,
    requests,
    responseFile,
    bin,
    env,
    git,
    save,
    invoke,
    check,
  };
}

test('resume check accepts the current owner with clean matching sources and live open PR', (t) => {
  const fixture = resumeFixture(t);
  const result = fixture.check();
  assert.equal(result.status, 0, result.stderr);
  const receipt = JSON.parse(result.stdout);
  assert.equal(receipt.scope, 'resume-check');
  assert.equal(receipt.resume.allowed, true);
  assert.equal(receipt.resume.owner, 'current-owner');
  assert.equal(receipt.resume.lock, false);
  assert.equal(receipt.resume.pullRequests[0].matches, true);
  assert.ok(Number.isFinite(Date.parse(receipt.observedAt)));
  assert.equal(
    readFileSync(fixture.requests, 'utf8').trim(),
    JSON.stringify(['api', '--method', 'GET', 'repos/fixture/dsh-agent-workbench/pulls/12']),
  );
});

test('resume check rereads the current owner and refuses transferred or inactive execution', (t) => {
  const fixture = resumeFixture(t);
  assert.equal(fixture.check().status, 0);
  fixture.execution.owner = 'new-owner';
  fixture.save();
  let result = fixture.check();
  assert.notEqual(result.status, 0);
  assert.equal(JSON.parse(result.stdout).resume.allowed, false);
  assert.match(result.stdout, /OWNER_MISMATCH/);
  fixture.execution.owner = 'current-owner';
  for (const state of ['handed-off', 'paused', 'done', 'unknown', undefined]) {
    fixture.execution.state = state;
    fixture.save();
    result = fixture.check();
    assert.notEqual(result.status, 0, String(state));
    assert.match(result.stdout, /EXECUTION_INACTIVE/);
  }
});

test('resume check requires a current task-bound execution projection and traceable sources', (t) => {
  const fixture = resumeFixture(t);
  for (const [field, value] of [
    ['inputSha256', 'b'.repeat(64)],
    ['task', 'other-task'],
    ['authorization', { ...fixture.execution.authorization, path: './missing.md' }],
    ['handoff', { ...fixture.execution.handoff, path: './missing.md' }],
    ['authorization', { path: './human-authorization.md' }],
    ['handoff', { path: './handoff.md', sha256: 'invalid' }],
    ['stopMarkers', []],
    ['pullRequests', undefined],
  ]) {
    const old = fixture.execution[field];
    fixture.execution[field] = value;
    fixture.save();
    const result = fixture.check();
    assert.notEqual(result.status, 0, field);
    assert.match(result.stderr + result.stdout, /EXECUTION_INVALID/);
    fixture.execution[field] = old;
  }
  fixture.save();
  rmSync(fixture.executionFile);
  assert.notEqual(fixture.check().status, 0);
});

test('resume check rereads explicit stop and handoff markers', (t) => {
  const fixture = resumeFixture(t);
  assert.equal(fixture.check().status, 0);
  for (const marker of ['STOP', 'HANDED_OFF']) {
    const file = join(fixture.directory, marker);
    writeFileSync(file, 'Execution must stop');
    const result = fixture.check();
    assert.notEqual(result.status, 0);
    assert.match(result.stdout, /STOP_MARKER/);
    rmSync(file);
  }
});

test('resume check refuses dirty, changed or misidentified local checkouts', (t) => {
  const fixture = resumeFixture(t);
  const [workbench, manage, gea] = fixture.repositories;
  const dirty = join(workbench.path, 'untracked.txt');
  writeFileSync(dirty, 'Dirty source');
  let result = fixture.check();
  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /SOURCE_DIRTY/);
  rmSync(dirty);
  fixture.git(manage.path, 'commit', '--quiet', '--allow-empty', '-m', 'Local drift');
  result = fixture.check();
  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /SOURCE_HEAD_MISMATCH/);
  writeFileSync(join(gea.path, 'package.json'), JSON.stringify({ name: 'wrong-package' }));
  result = fixture.check();
  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /CANDIDATE_PACKAGE_IDENTITY/);
});

test('resume check refuses live PR drift, closed state or unknown remote fields', (t) => {
  const fixture = resumeFixture(t);
  const original = structuredClone(fixture.remote);
  for (const change of [
    (pr) => {
      pr.head.sha = 'b'.repeat(40);
    },
    (pr) => {
      pr.base.sha = 'b'.repeat(40);
    },
    (pr) => {
      pr.state = 'closed';
    },
    (pr) => {
      pr.head.ref = 'other-branch';
    },
    (pr) => {
      pr.base.ref = 'other-base';
    },
    (pr) => {
      pr.base.repo.full_name = 'other/repository';
    },
    (pr) => {
      delete pr.head;
    },
    (pr) => {
      pr.number = 999;
    },
  ]) {
    Object.assign(fixture.remote, structuredClone(original));
    change(fixture.remote);
    fixture.save();
    const result = fixture.check();
    assert.notEqual(result.status, 0);
    assert.equal(JSON.parse(result.stdout).resume.allowed, false);
    assert.match(result.stdout, /PR_MISMATCH/);
  }
});

test('resume check requires complete PR expectations bound to the local input', (t) => {
  const fixture = resumeFixture(t);
  const original = structuredClone(fixture.execution.pullRequests[0]);
  for (const field of Object.keys(original)) {
    fixture.execution.pullRequests = [{ ...original }];
    delete fixture.execution.pullRequests[0][field];
    fixture.save();
    const result = fixture.check();
    assert.notEqual(result.status, 0, field);
    assert.match(result.stderr + result.stdout, /EXECUTION_INVALID/);
  }
  fixture.execution.pullRequests = [{ ...original, head: 'b'.repeat(40) }];
  fixture.save();
  assert.match(fixture.check().stderr, /EXECUTION_INVALID/);
});

test('resume check refuses unavailable or failed remote queries', (t) => {
  const fixture = resumeFixture(t);
  writeFileSync(fixture.responseFile, 'not JSON');
  let result = fixture.check();
  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /PR_QUERY_FAILED/);
  writeFileSync(join(fixture.bin, 'gh'), `#!${process.execPath}\nprocess.exit(4);\n`, {
    mode: 0o755,
  });
  result = fixture.check();
  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /PR_QUERY_FAILED/);
  rmSync(join(fixture.bin, 'gh'));
  symlinkSync(
    execFileSync('which', ['git'], { encoding: 'utf8' }).trim(),
    join(fixture.bin, 'git'),
  );
  fixture.env.PATH = fixture.bin;
  result = fixture.check();
  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /PR_QUERY_FAILED/);
});

test('an explicit empty PR registration works before PR creation and source summaries stay offline', (t) => {
  const fixture = resumeFixture(t);
  fixture.execution.pullRequests = [];
  fixture.save();
  const checked = fixture.check();
  assert.equal(checked.status, 0, checked.stderr);
  assert.deepEqual(JSON.parse(checked.stdout).resume.pullRequests, []);
  assert.match(JSON.parse(checked.stdout).resume.remoteScope, /registered PRs only/);
  assert.throws(() => readFileSync(fixture.requests));
  rmSync(fixture.executionFile);
  const observed = fixture.invoke();
  assert.equal(observed.status, 0, observed.stderr);
  assert.equal(JSON.parse(observed.stdout).scope, 'source-observation');
  assert.throws(() => readFileSync(fixture.requests));
});

test('resume check refuses a handoff or stop written while the PR query is running', (t) => {
  const fixture = resumeFixture(t);
  for (const change of [
    {
      path: fixture.executionFile,
      content: JSON.stringify({ ...fixture.execution, owner: 'new-owner' }),
    },
    { path: join(fixture.directory, 'STOP'), content: 'Stop during query' },
    { path: join(fixture.directory, 'handoff.md'), content: 'Handoff updated during query' },
  ]) {
    fixture.save();
    fixture.env.FIXTURE_MUTATION = JSON.stringify(change);
    const result = fixture.check();
    assert.notEqual(result.status, 0);
    assert.match(result.stdout, /EXECUTION_CHANGED|STOP_MARKER|SOURCE_RECORD_CHANGED/);
    if (change.path.endsWith('/STOP')) rmSync(change.path);
  }
});

test('resume check refuses local source changes made during a PR query', (t) => {
  const fixture = resumeFixture(t);
  fixture.env.FIXTURE_MUTATION = JSON.stringify({
    path: join(fixture.repositories[0].path, 'during-query.txt'),
    content: 'Source changed during remote observation',
  });
  const result = fixture.check();
  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /SOURCE_DIRTY/);
});

test('resume check refuses sources changed before invocation without refreshing execution', (t) => {
  const fixture = resumeFixture(t);
  const executionBytes = readFileSync(fixture.executionFile);
  for (const file of ['handoff.md', 'human-authorization.md']) {
    const path = join(fixture.directory, file);
    const original = readFileSync(path);
    writeFileSync(path, 'Changed source version before resume');
    const result = fixture.check();
    assert.notEqual(result.status, 0, file);
    assert.match(result.stdout, /SOURCE_VERSION_MISMATCH/);
    assert.equal(JSON.parse(result.stdout).resume.allowed, false);
    assert.deepEqual(readFileSync(fixture.executionFile), executionBytes);
    writeFileSync(path, original);
  }
});

test('resume check reports only the PR identity and revision fields needed for diagnosis', (t) => {
  const fixture = resumeFixture(t);
  fixture.remote.body = 'Unrelated PR body';
  fixture.remote.user = { login: 'Unrelated user', details: 'Omitted profile' };
  fixture.remote.head.repo = {
    full_name: 'fixture/dsh-agent-workbench',
    owner: fixture.remote.user,
  };
  fixture.remote.base.repo.owner = fixture.remote.user;
  fixture.save();
  const result = fixture.check();
  assert.equal(result.status, 0, result.stderr);
  const observed = JSON.parse(result.stdout).resume.pullRequests[0];
  assert.deepEqual(observed.actual, {
    number: 12,
    state: 'open',
    head: {
      sha: fixture.repositories[0].head,
      ref: 'fixture-branch',
      repository: 'fixture/dsh-agent-workbench',
    },
    base: { sha: 'a'.repeat(40), ref: 'main', repository: 'fixture/dsh-agent-workbench' },
  });
  assert.ok(Number.isFinite(Date.parse(observed.observedAt)));
});
