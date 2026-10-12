import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
  existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { test } from 'node:test';

const writer = resolve('scripts/write-hosted-group.mjs');
const core = '639ed015397290b3745d163aafe02ffee4aa3f84';
const group = [
  ['dsh-agent-manage', 'a'.repeat(40)],
  ['dsh-agent-workbench', 'b'.repeat(40)],
  ['dsh-gea-plugin', 'c'.repeat(40)],
];
const groupId = createHash('sha256').update(JSON.stringify(group)).digest('hex');
function fixture(repo) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'hosted-group-')));
  const source = repo === 'dsh-gea-plugin';
  const repositories = group.map(([name, head]) => {
    const path = join(
      root,
      name === 'dsh-agent-workbench' && source ? 'source' : 'candidate',
      name,
    );
    mkdirSync(path, { recursive: true });
    return { repo: name, head, path };
  });
  const gea = repositories.find((entry) => entry.repo === 'dsh-gea-plugin');
  mkdirSync(join(gea.path, 'scripts'));
  writeFileSync(join(gea.path, 'scripts/supported-cores.json'), JSON.stringify([{ head: core }]));
  const own = repositories.find((entry) => entry.repo === repo);
  const env = {
    ...process.env,
    QUALITY_GROUP_MANAGE: group[0][1],
    QUALITY_GROUP_WORKBENCH: group[1][1],
    QUALITY_GROUP_GEA: group[2][1],
    QUALITY_GROUP_ID: groupId,
    QUALITY_EXPECTED_SHA: own.head,
    GITHUB_OUTPUT: join(root, 'output'),
  };
  return {
    root,
    repositories,
    call: (changes = {}, tail = []) =>
      spawnSync(
        process.execPath,
        [
          writer,
          '--root',
          root,
          '--repo',
          repo,
          '--core-head',
          core,
          ...(source ? ['--workbench-source'] : []),
          ...tail,
        ],
        { cwd: own.path, env: { ...env, ...changes }, encoding: 'utf8' },
      ),
  };
}

test('one frozen tuple binds all runner roles while candidate byte hashes include lane paths', () => {
  const receipts = [];
  for (const [repo] of group) {
    const f = fixture(repo);
    try {
      const result = f.call();
      assert.equal(result.status, 0, result.stderr);
      const bytes = readFileSync(join(f.root, 'candidate-input.json'));
      assert.deepEqual(JSON.parse(bytes), { core, repositories: f.repositories });
      const receipt = JSON.parse(readFileSync(join(f.root, 'candidate-group.json')));
      assert.equal(receipt.groupId, groupId);
      assert.deepEqual(receipt.group, group);
      assert.equal(receipt.quality, 'not-observed');
      assert.equal(receipt.inputSha256, createHash('sha256').update(bytes).digest('hex'));
      assert.equal(
        readFileSync(join(f.root, 'output'), 'utf8'),
        `input-sha256=${receipt.inputSha256}\n`,
      );
      const original = Buffer.from(bytes);
      assert.notEqual(f.call().status, 0, 'existing evidence must not be overwritten');
      assert.deepEqual(readFileSync(join(f.root, 'candidate-input.json')), original);
      receipts.push(receipt);
    } finally {
      rmSync(f.root, { recursive: true, force: true });
    }
  }
  assert.equal(new Set(receipts.map((entry) => entry.inputSha256)).size, 3);
});

test('partial groups, mutable refs, changed tuple, own event mismatch and unknown Core create no candidate', () => {
  const f = fixture('dsh-agent-workbench');
  try {
    for (const name of ['QUALITY_GROUP_GEA', 'QUALITY_GROUP_WORKBENCH', 'QUALITY_GROUP_MANAGE']) {
      for (const value of [
        '',
        'main',
        'A'.repeat(40),
        'a'.repeat(40) + '\n',
        '$(touch injected)',
      ]) {
        const bad = f.call({ [name]: value });
        assert.equal(bad.status, 1);
        assert.match(bad.stderr, /CANDIDATE_GROUP_REQUIRED/);
      }
    }
    assert.match(f.call({ QUALITY_GROUP_ID: '0'.repeat(64) }).stderr, /CANDIDATE_GROUP_HASH/);
    assert.match(
      f.call({ QUALITY_EXPECTED_SHA: '0'.repeat(40) }).stderr,
      /CANDIDATE_EVENT_MISMATCH/,
    );
    assert.match(f.call({}, ['--core-head', '0'.repeat(40)]).stderr, /CANDIDATE_CORE/);
    assert.equal(existsSync(join(f.root, 'candidate-input.json')), false);
    assert.equal(existsSync(join(f.root, 'candidate-group.json')), false);
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test('workflow dispatch admission rejects unsafe inputs before peer checkout and produces the writer tuple', () => {
  const workflow = readFileSync('.github/workflows/quality.yml', 'utf8');
  assert.match(
    workflow,
    /run: node scripts\/read-hosted-peer-input.mjs --repo dsh-agent-workbench/,
  );
  const reader = resolve('scripts/read-hosted-peer-input.mjs');
  const directory = mkdtempSync(join(tmpdir(), 'workbench-dispatch-'));
  try {
    const git = (...args) =>
      execFileSync('git', ['-C', directory, ...args], { encoding: 'utf8' }).trim();
    git('init', '--quiet');
    writeFileSync(join(directory, 'source'), 'scope fixture');
    git('add', '.');
    git(
      '-c',
      'user.name=Fixture',
      '-c',
      'user.email=fixture@example.invalid',
      'commit',
      '--quiet',
      '-m',
      'actual event',
    );
    const head = git('rev-parse', 'HEAD');
    const output = join(directory, 'scope-output');
    const valid = {
      QUALITY_GROUP_MANAGE: group[0][1],
      QUALITY_GROUP_WORKBENCH: head,
      QUALITY_GROUP_GEA: group[2][1],
      QUALITY_EXPECTED_SHA: head,
      QUALITY_SCOPE_ALLOWED: 'true',
      GITHUB_EVENT_NAME: 'workflow_dispatch',
      GITHUB_REPOSITORY: 'CleverC2200/dsh-agent-workbench',
    };
    const call = (changes = {}) =>
      spawnSync(process.execPath, [reader, '--repo', 'dsh-agent-workbench'], {
        cwd: directory,
        env: { ...process.env, ...valid, ...changes, GITHUB_OUTPUT: output },
        encoding: 'utf8',
      });
    for (const key of ['QUALITY_GROUP_GEA', 'QUALITY_GROUP_WORKBENCH', 'QUALITY_GROUP_MANAGE']) {
      for (const value of ['', 'main', 'a'.repeat(40) + '\n', '$(touch injected)'])
        assert.equal(call({ [key]: value }).status, 1);
    }
    assert.match(call({ QUALITY_EXPECTED_SHA: '0'.repeat(40) }).stderr, /CANDIDATE_EVENT_MISMATCH/);
    const result = call();
    assert.equal(result.status, 0, result.stderr);
    const tuple = [
      [group[0][0], group[0][1]],
      [group[1][0], head],
      [group[2][0], group[2][1]],
    ];
    const expected = createHash('sha256').update(JSON.stringify(tuple)).digest('hex');
    assert.match(readFileSync(output, 'utf8'), new RegExp(`group-id=${expected}\\n`));
    assert.match(
      workflow,
      /cancel-in-progress: \$\{\{ github.event_name != 'workflow_dispatch' \}\}/,
    );
    assert.match(workflow, /--browser --prepare-browser --final-group-sha256/);
    assert.match(workflow, /candidate-group\.json/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('source-event receipts preserve baseline provenance without declaring a joint run', () => {
  const f = fixture('dsh-agent-workbench');
  try {
    const baselineId = 'd'.repeat(64);
    const result = f.call({
      QUALITY_SOURCE_KIND: 'source-event',
      QUALITY_BASELINE_ID: baselineId,
      GITHUB_EVENT_NAME: 'push',
    });
    assert.equal(result.status, 0, result.stderr);
    const receipt = JSON.parse(readFileSync(join(f.root, 'candidate-group.json')));
    assert.equal(receipt.sourceKind, 'source-event');
    assert.equal(receipt.baselineId, baselineId);
    assert.deepEqual(receipt.group, group);
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test('missing or mismatched hosted source provenance cannot create candidate evidence', () => {
  const f = fixture('dsh-agent-workbench');
  try {
    for (const env of [
      { QUALITY_SOURCE_KIND: 'source-event', QUALITY_BASELINE_ID: '' },
      { QUALITY_SOURCE_KIND: 'joint-group', QUALITY_BASELINE_ID: 'd'.repeat(64) },
      {
        QUALITY_SOURCE_KIND: 'source-event',
        QUALITY_BASELINE_ID: 'd'.repeat(64),
        GITHUB_EVENT_NAME: 'workflow_dispatch',
      },
      { QUALITY_SOURCE_KIND: 'joint-group', GITHUB_EVENT_NAME: 'push' },
      { QUALITY_SOURCE_KIND: 'source-event', QUALITY_BASELINE_ID: 'd'.repeat(64) + '\n' },
    ])
      assert.equal(f.call(env).status, 1);
    assert.equal(existsSync(join(f.root, 'candidate-input.json')), false);
    assert.equal(existsSync(join(f.root, 'candidate-group.json')), false);
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});
