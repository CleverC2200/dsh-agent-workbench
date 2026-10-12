import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { test } from 'node:test';

const cli = resolve('scripts/read-hosted-peer-input.mjs');
const own = 'dsh-agent-workbench';
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'hosted-peer-input-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const baseline = {
    schemaVersion: 1,
    repositories: [
      { repo: 'dsh-gea-plugin', head: 'a'.repeat(40) },
      { repo: own, head: 'b'.repeat(40) },
      { repo: 'dsh-agent-manage', head: 'c'.repeat(40) },
    ],
  };
  mkdirSync(join(root, 'scripts'));
  const file = join(root, 'scripts/quality-peer-baseline.json');
  writeFileSync(file, JSON.stringify(baseline) + '\n');
  const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
  git('init', '--quiet');
  git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'add', '.');
  git(
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.invalid',
    'commit',
    '--quiet',
    '-m',
    'frozen baseline',
  );
  const head = git('rev-parse', 'HEAD');
  const run = (extra = {}) => {
    const output = join(root, 'outputs');
    writeFileSync(output, '');
    const result = spawnSync(process.execPath, [cli, '--repo', own], {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        GITHUB_REPOSITORY: `CleverC2200/${own}`,
        GITHUB_EVENT_NAME: 'push',
        QUALITY_SCOPE_ALLOWED: 'true',
        QUALITY_EXPECTED_SHA: head,
        GITHUB_OUTPUT: output,
        QUALITY_GROUP_GEA: '',
        QUALITY_GROUP_WORKBENCH: '',
        QUALITY_GROUP_MANAGE: '',
        ...extra,
      },
    });
    return {
      ...result,
      outputs: Object.fromEntries(
        readFileSync(output, 'utf8')
          .trim()
          .split('\n')
          .filter(Boolean)
          .map((line) => line.split('=')),
      ),
    };
  };
  return { baseline, file, head, git, run };
}

test('ordinary source events keep frozen peer commits and bind only the actual own event', (t) => {
  const { run, head } = fixture(t);
  for (const event of ['push', 'pull_request']) {
    const result = run({ GITHUB_EVENT_NAME: event });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.outputs['workbench-sha'], head);
    assert.equal(result.outputs['gea-sha'], 'a'.repeat(40));
    assert.equal(result.outputs['manage-sha'], 'c'.repeat(40));
    assert.equal(result.outputs['source-kind'], 'source-event');
    assert.match(result.outputs['baseline-id'], /^[a-f0-9]{64}$/);
    assert.match(result.outputs['group-id'], /^[a-f0-9]{64}$/);
  }
});

test('joint dispatch binds a complete independent tuple without reading a baseline', (t) => {
  const { run, head, file } = fixture(t);
  writeFileSync(file, 'baseline deliberately unavailable');
  const result = run({
    GITHUB_EVENT_NAME: 'workflow_dispatch',
    QUALITY_GROUP_GEA: 'd'.repeat(40),
    QUALITY_GROUP_WORKBENCH: head,
    QUALITY_GROUP_MANAGE: 'e'.repeat(40),
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.outputs['source-kind'], 'joint-group');
  assert.equal(result.outputs['gea-sha'], 'd'.repeat(40));
  assert.equal(result.outputs['manage-sha'], 'e'.repeat(40));
  assert.equal(result.outputs['baseline-id'], '');
});

test('scope, repository, event and actual checkout mismatches fail closed', (t) => {
  const { run } = fixture(t);
  for (const env of [
    { QUALITY_SCOPE_ALLOWED: 'false' },
    { GITHUB_REPOSITORY: 'another/dsh-agent-workbench' },
    { GITHUB_EVENT_NAME: 'pull_request_target' },
    { QUALITY_EXPECTED_SHA: 'f'.repeat(40) },
    { QUALITY_EXPECTED_SHA: 'main' },
    { QUALITY_EXPECTED_SHA: 'f'.repeat(40) + '\n' },
  ])
    assert.notEqual(run(env).status, 0);
});

test('a changed or uncommitted baseline cannot select peer source', (t) => {
  const { file, run } = fixture(t);
  writeFileSync(file, '{}');
  const result = run();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /CANDIDATE_BASELINE/);
});

test('committed baselines reject floating refs, swapped roles, duplicates and added source fields', (t) => {
  const { baseline, file, run, git } = fixture(t);
  const invalid = [
    {
      ...baseline,
      repositories: baseline.repositories.map((entry, i) =>
        i === 0 ? { ...entry, head: 'a'.repeat(40) + '\n' } : entry,
      ),
    },
    {
      ...baseline,
      repositories: baseline.repositories.map((entry, i) =>
        i === 0 ? { ...entry, head: 'main' } : entry,
      ),
    },
    {
      ...baseline,
      repositories: baseline.repositories.map((entry, i) =>
        i === 0 ? { ...entry, repo: 'remote/arbitrary' } : entry,
      ),
    },
    {
      ...baseline,
      repositories: [baseline.repositories[0], baseline.repositories[0], baseline.repositories[2]],
    },
    {
      ...baseline,
      repositories: baseline.repositories.map((entry) => ({
        ...entry,
        source: 'https://example.invalid/repo',
      })),
    },
  ];
  for (const value of invalid) {
    writeFileSync(file, JSON.stringify(value));
    git('add', '.');
    git(
      '-c',
      'user.name=Fixture',
      '-c',
      'user.email=fixture@example.invalid',
      'commit',
      '--quiet',
      '-m',
      'invalid fixture',
    );
    const result = run({ QUALITY_EXPECTED_SHA: git('rev-parse', 'HEAD') });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /CANDIDATE_BASELINE/);
  }
});

test('joint dispatch rejects missing, floating or own-mismatched tuple members', (t) => {
  const { run, head } = fixture(t);
  const env = {
    GITHUB_EVENT_NAME: 'workflow_dispatch',
    QUALITY_GROUP_GEA: 'd'.repeat(40),
    QUALITY_GROUP_WORKBENCH: head,
    QUALITY_GROUP_MANAGE: 'e'.repeat(40),
  };
  for (const extra of [
    { QUALITY_GROUP_GEA: '' },
    { QUALITY_GROUP_MANAGE: 'main' },
    { QUALITY_GROUP_WORKBENCH: 'f'.repeat(40) },
  ])
    assert.notEqual(run({ ...env, ...extra }).status, 0);
});
