import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sourceIdentity, reusableSource, readSourceArchive } from '../scripts/source-result.mjs';

const repository = 'CleverC2200/dsh-agent-workbench';
function producer() {
  const identity = {
    repository,
    tree: 'tree',
    locks: { lock: 'digest' },
    checks: { files: ['test'] },
    toolchain: { node: '24' },
  };
  const context = {
    eventName: 'push',
    ref: 'refs/heads/main',
    sha: 'merge',
    now: Date.parse('2026-10-22T02:00:00Z'),
  };
  const pr = {
    number: 1,
    merged_at: 'now',
    merge_commit_sha: 'merge',
    base: { ref: 'main', repo: { full_name: repository } },
    head: { sha: 'head', ref: 'branch', repo: { full_name: repository } },
  };
  const run = {
    id: 12,
    workflow_id: 7,
    event: 'pull_request',
    status: 'completed',
    conclusion: 'success',
    head_sha: 'head',
    head_branch: 'branch',
    head_repository: { full_name: repository },
    path: '.github/workflows/source-quality.yml',
    updated_at: '2026-10-22T01:00:00Z',
    run_attempt: 2,
  };
  const jobs = ['source-plan', 'source-checks', 'dependency-review', 'candidate-quality'].map(
    (name) => ({ name, conclusion: 'success' }),
  );
  const artifact = {
    id: 23,
    name: 'source-result-2',
    expired: false,
    size_in_bytes: 1024,
    digest: 'sha256:' + 'a'.repeat(64),
  };
  const receipt = {
    schemaVersion: 1,
    runId: 12,
    attempt: 2,
    pr: 1,
    head: 'head',
    status: 'success',
    identity: structuredClone(identity),
  };
  const state = {
    prs: [pr],
    commit: { tree: { sha: 'tree' } },
    workflow: { id: 7 },
    runs: [run],
    jobs,
    artifacts: [artifact],
  };
  const calls = [];
  const request = async (path) => {
    calls.push(path);
    if (path.endsWith('/pulls?per_page=10')) return state.prs;
    if (path.includes('/git/commits/')) return state.commit;
    if (path.endsWith('/workflows/source-quality.yml')) return state.workflow;
    if (path.includes('/runs?event=')) return { workflow_runs: state.runs };
    if (path.includes('/attempts/')) return { jobs: state.jobs };
    if (path.includes('/artifacts?')) return { artifacts: state.artifacts };
    throw Error(path);
  };
  return {
    identity,
    context,
    state,
    receipt,
    calls,
    check: () => reusableSource(identity, context, request, async () => JSON.stringify(receipt)),
  };
}

test('matching merged PR uses its latest successful attempt and all required jobs', async () => {
  const f = producer();
  assert.deepEqual(await f.check(), {
    hit: true,
    reason: 'matching-pr-result',
    runId: 12,
    attempt: 2,
    pr: 1,
    artifactId: 23,
  });
  assert.ok(f.calls.some((path) => path.includes('/attempts/2/jobs')));
});

test('different inputs, untrusted origins and incomplete evidence never authorize reuse', async () => {
  const changes = [
    (f) => {
      f.context.eventName = 'pull_request';
    },
    (f) => {
      f.context.ref = 'refs/heads/other';
    },
    (f) => {
      f.state.prs[0].merged_at = null;
    },
    (f) => {
      f.state.prs[0].merge_commit_sha = 'old';
    },
    (f) => {
      f.state.prs[0].head.repo.full_name = 'foreign/repo';
    },
    (f) => {
      f.state.prs[0].base.ref = 'other';
    },
    (f) => {
      f.state.commit.tree.sha = 'other';
    },
    (f) => {
      f.state.runs[0].conclusion = 'failure';
    },
    (f) => {
      f.state.runs[0].status = 'in_progress';
    },
    (f) => {
      f.state.runs[0].workflow_id = 9;
    },
    (f) => {
      f.state.runs[0].head_sha = 'old';
    },
    (f) => {
      f.state.runs[0].head_repository.full_name = 'fork/repo';
    },
    (f) => {
      f.state.runs[0].path = '.github/workflows/other.yml';
    },
    (f) => {
      f.state.runs[0].updated_at = '2026-10-20T00:00:00Z';
    },
    (f) => {
      f.state.runs[0].updated_at = '2026-10-23T00:00:00Z';
    },
    (f) => {
      f.state.runs[0].updated_at = 'invalid';
    },
    (f) => {
      f.state.jobs[1].conclusion = 'skipped';
    },
    (f) => {
      f.state.jobs.pop();
    },
    (f) => {
      f.state.artifacts = [];
    },
    (f) => {
      f.state.artifacts[0].expired = true;
    },
    (f) => {
      f.state.artifacts[0].digest = null;
    },
    (f) => {
      f.state.artifacts[0].size_in_bytes = 100000;
    },
    (f) => {
      f.state.artifacts.push(f.state.artifacts[0]);
    },
    (f) => {
      f.receipt.attempt = 1;
    },
    (f) => {
      f.receipt.runId = 11;
    },
    (f) => {
      f.receipt.pr = 2;
    },
    (f) => {
      f.receipt.head = 'old';
    },
    (f) => {
      f.receipt.status = 'failure';
    },
    (f) => {
      f.receipt.identity.locks.lock = 'other';
    },
    (f) => {
      f.receipt.identity.checks.files.push('other');
    },
    (f) => {
      f.receipt.identity.toolchain.node = 'other';
    },
  ];
  for (const change of changes) {
    const f = producer();
    change(f);
    assert.equal((await f.check()).hit, false, change.toString());
  }
});

test('Manage additionally requires successful CodeQL while main still runs its own analysis', async () => {
  const f = producer();
  f.identity.repository = 'CleverC2200/dsh-agent-manage';
  f.state.prs[0].base.repo.full_name = f.identity.repository;
  f.state.prs[0].head.repo.full_name = f.identity.repository;
  f.state.runs[0].head_repository.full_name = f.identity.repository;
  f.receipt.identity = structuredClone(f.identity);
  assert.equal((await f.check()).hit, false);
  f.state.jobs.push({ name: 'codeql / Analyze (javascript-typescript)', conclusion: 'success' });
  assert.equal((await f.check()).hit, true);
});

test('tree identity tolerates squash commit metadata but binds base, peers, locks, image and check set', (t) => {
  const parent = mkdtempSync(join(tmpdir(), 'source-result-identity-'));
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  const root = join(parent, 'dsh-agent-workbench');
  mkdirSync(join(root, 'scripts'), { recursive: true });
  const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
  const put = (file, value) =>
    writeFileSync(join(root, file), typeof value === 'string' ? value : JSON.stringify(value));
  git('init', '-q');
  git('config', 'user.name', 'fixture');
  git('config', 'user.email', 'fixture@invalid');
  put('.gitignore', '.runtime/\n');
  put('package.json', { packageManager: 'npm@11.11.0' });
  put('package-lock.json', '{}');
  put('scripts/quality-peer-baseline.json', {
    repositories: [
      { repo: 'dsh-agent-manage', head: 'a'.repeat(40) },
      { repo: 'dsh-gea-plugin', head: 'b'.repeat(40) },
    ],
  });
  put('case.test.mjs', 'before');
  git('add', '.');
  git('commit', '-qm', 'base');
  const base = git('rev-parse', 'HEAD');
  put('case.test.mjs', 'after');
  git('add', '.');
  git('commit', '-qm', 'PR');
  let head = git('rev-parse', 'HEAD');
  mkdirSync(join(root, '.runtime'));
  const plan = {
    diffBase: base,
    files: ['case.test.mjs'],
    tools: ['oxlint'],
    core: false,
    sdk: false,
    typecheck: false,
    joint: false,
    runtime: false,
    browser: false,
    build: false,
  };
  put('.runtime/source-checks-plan.json', plan);
  const eventPath = join(parent, 'event.json');
  const env = {
    GITHUB_REPOSITORY: repository,
    GITHUB_EVENT_PATH: eventPath,
    ImageOS: 'ubuntu24',
    ImageVersion: 'v1',
  };
  const event = () => writeFileSync(eventPath, JSON.stringify({ before: base, after: head }));
  event();
  const identity = sourceIdentity(root, env);
  assert.ok(identity);
  git('commit', '--amend', '-qm', 'squash');
  head = git('rev-parse', 'HEAD');
  event();
  assert.deepEqual(sourceIdentity(root, env), identity);
  assert.notDeepEqual(sourceIdentity(root, { ...env, ImageVersion: 'v2' }), identity);
  put('.runtime/source-checks-plan.json', { ...plan, files: ['other.test.mjs'] });
  assert.notDeepEqual(sourceIdentity(root, env), identity);
  put('.runtime/source-checks-plan.json', { ...plan, sdk: true });
  assert.equal(sourceIdentity(root, env), null);
  put('.runtime/source-checks-plan.json', plan);
  put('scripts/gate.mjs', 'changed');
  git('add', '.');
  git('commit', '-qm', 'gate');
  head = git('rev-parse', 'HEAD');
  event();
  assert.equal(sourceIdentity(root, env), null);
});

test('API and malformed receipt failures return to the original checks', async () => {
  const f = producer();
  assert.equal(
    (
      await reusableSource(
        f.identity,
        f.context,
        async () => {
          throw Error('HTTP_403');
        },
        () => '',
      )
    ).hit,
    false,
  );
  const run = producer();
  run.receipt.identity = null;
  assert.equal((await run.check()).hit, false);
});

test('receipt archive accepts only the digest-bound bounded JSON member', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'source-result-archive-test-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const file = join(directory, 'source-result.json'),
    archive = join(directory, 'result.zip');
  writeFileSync(file, '{"status":"success"}');
  execFileSync('zip', ['-q', '-j', archive, file]);
  const bytes = readFileSync(archive);
  const digest = (value) => 'sha256:' + createHash('sha256').update(value).digest('hex');
  assert.equal(readSourceArchive(bytes, digest(bytes)), '{"status":"success"}');
  assert.throws(() => readSourceArchive(bytes, 'sha256:' + '0'.repeat(64)), /ARCHIVE_REJECTED/);
  const extra = join(directory, 'other.json');
  writeFileSync(extra, '{}');
  execFileSync('zip', ['-q', '-j', archive, extra]);
  const invalid = readFileSync(archive);
  assert.throws(() => readSourceArchive(invalid, digest(invalid)), /ARCHIVE_CONTENTS/);
});
