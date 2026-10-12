import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  readFileSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
  mkdirSync,
  copyFileSync,
  readdirSync,
} from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { test } from 'node:test';

const run = (args, environment = {}) => {
  const env = { ...process.env };
  for (const name of [
    'QUALITY_SCOPE_ALLOWED',
    'QUALITY_SCOPE_RESULT',
    'QUALITY_GATE_RESULT',
    'QUALITY_CANDIDATE',
    'QUALITY_EXPECTED_SHA',
    'CI',
  ])
    delete env[name];
  return spawnSync(process.execPath, ['scripts/run-quality-ci.mjs', ...args], {
    encoding: 'utf8',
    env: { ...env, ...environment },
  });
};
test('retired input writer cannot create a candidate from historical peer constants', () => {
  const fixture = mkdtempSync(join(tmpdir(), 'workbench-retired-ci-input-'));
  try {
    const result = run(['--phase', 'input', '--root', fixture, '--sha', 'a'.repeat(40)]);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stderr, /CANDIDATE_FINAL_GROUP_REQUIRED/);
    assert.deepEqual(readdirSync(fixture), []);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});
test('event scope and final public CLI refuse skipped, cancelled, failed or missing gates', () => {
  assert.equal(run(['--phase', 'scope'], { QUALITY_SCOPE_ALLOWED: 'true' }).status, 0);
  for (const scope of ['', 'false'])
    assert.equal(run(['--phase', 'scope'], { QUALITY_SCOPE_ALLOWED: scope }).status, 1);
  const good = { QUALITY_SCOPE_RESULT: 'success', QUALITY_GATE_RESULT: 'success' };
  assert.equal(run(['--phase', 'final'], good).status, 0);
  for (const key of Object.keys(good)) {
    for (const result of ['', 'skipped', 'cancelled', 'failure'])
      assert.equal(run(['--phase', 'final'], { ...good, [key]: result }).status, 1);
  }
});

test('scope and final aggregation run from a cold self-only checkout without peer materials', () => {
  const fixture = mkdtempSync(join(tmpdir(), 'workbench-scope-'));
  try {
    mkdirSync(join(fixture, 'scripts'));
    for (const file of ['run-quality-ci.mjs', 'candidate-input.mjs', 'run-quality-checks.mjs'])
      copyFileSync(join('scripts', file), join(fixture, 'scripts', file));
    const call = (phase, env) =>
      spawnSync(process.execPath, ['scripts/run-quality-ci.mjs', '--phase', phase], {
        cwd: fixture,
        encoding: 'utf8',
        env: { ...process.env, ...env },
      });
    const scope = call('scope', { QUALITY_SCOPE_ALLOWED: 'true' });
    assert.equal(scope.status, 0, scope.stderr);
    const final = call('final', {
      QUALITY_SCOPE_RESULT: 'success',
      QUALITY_GATE_RESULT: 'failure',
    });
    assert.equal(final.status, 1);
    assert.match(final.stderr, /QUALITY_REQUIRED/);
    assert.doesNotMatch(final.stderr, /ENOENT/);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});
test('frozen admission requires input hash and binds the actual event before preparation', () => {
  assert.match(run([]).stderr, /CANDIDATE_FINAL_GROUP_REQUIRED/);
  assert.match(run(['--final-group-sha256', 'a'.repeat(64)]).stderr, /CANDIDATE_INPUT_REQUIRED/);
  const fixture = mkdtempSync(join(tmpdir(), 'workbench-ci-'));
  try {
    const manifest = {
      core: '5badb15009ae1756c3afe0ae0cef1faafc290ccc',
      repositories: ['dsh-agent-workbench', 'dsh-agent-manage', 'dsh-gea-plugin'].map((repo) => {
        const path = join(fixture, repo);
        mkdirSync(path);
        return {
          repo,
          path: repo === 'dsh-agent-workbench' ? process.cwd() : path,
          head: 'a'.repeat(40),
        };
      }),
    };
    const file = join(fixture, 'candidate-input.json');
    writeFileSync(file, JSON.stringify(manifest));
    const sha256 = createHash('sha256').update(readFileSync(file)).digest('hex');
    const args = ['--input', file, '--final-group-sha256', sha256];
    assert.match(run(args, { CI: 'true' }).stderr, /CANDIDATE_EVENT_REQUIRED/);
    assert.match(
      run(args, { CI: 'true', QUALITY_EXPECTED_SHA: 'b'.repeat(40) }).stderr,
      /CANDIDATE_EVENT_MISMATCH/,
    );
    for (const hash of ['', 'main', 'A'.repeat(64), 'a'.repeat(64) + '\n']) {
      const result = run(['--input', file, '--final-group-sha256', hash]);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /CANDIDATE_FINAL_GROUP_REQUIRED/);
    }
    const changedHash = run(['--input', file, '--final-group-sha256', '0'.repeat(64)]);
    assert.equal(changedHash.status, 1);
    assert.match(changedHash.stderr, /CANDIDATE_INPUT_HASH/);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});
test('hosted workflow uses actual event, full history, read-only peers and same public commands', () => {
  const workflow = readFileSync('.github/workflows/quality.yml', 'utf8');
  assert.doesNotMatch(workflow, /self-hosted|pull_request_target/);
  assert.match(workflow, /permissions:\n  contents: read/);
  assert.match(
    workflow,
    /QUALITY_EXPECTED_SHA: \$\{\{ github.event.pull_request.head.sha \|\| github.sha \}\}/,
  );
  assert.match(workflow, /ref: \$\{\{ github.event.pull_request.head.sha \|\| github.sha \}\}/);
  assert.equal(
    (workflow.match(/fetch-depth: 0/g) ?? []).length,
    (workflow.match(/uses: actions\/checkout@v7/g) ?? []).length,
  );
  assert.equal(
    (workflow.match(/persist-credentials: false/g) ?? []).length,
    (workflow.match(/uses: actions\/checkout@v7/g) ?? []).length,
  );
  assert.match(workflow, /candidate\/dsh-gea-plugin\/scripts\/supported-cores\.json/);
  assert.match(workflow, /fromJSON\(needs\.candidate-scope\.outputs\.cores\)/);
  assert.match(workflow, /npm run quality:ci -- --input "\$QUALITY_CANDIDATE" --prepare-sdk/);
  assert.doesNotMatch(workflow, /PLUGIN_SPLIT_.*_HISTORY_SOURCE/);
  assert.match(workflow, /if: always\(\)/);
  assert.match(workflow, /needs: \[candidate-scope, gates\]/);
  assert.match(workflow, /run: node scripts\/run-quality-ci.mjs --phase final/);
  assert.match(workflow, /PLUGIN_SPLIT_READ_TOKEN/);
  const scripts = JSON.parse(readFileSync('package.json')).scripts;
  assert.doesNotMatch(scripts['quality:fast'], /candidate:verify|run-quality-ci/);
  assert.equal(scripts['quality:ci'], 'node scripts/run-quality-ci.mjs');
  assert.ok(scripts['test:browser']);
});

test('candidate execution cannot use an ambient input without an explicit --input', () => {
  const result = run(['--final-group-sha256', 'a'.repeat(64)], {
    QUALITY_CANDIDATE: '/ambient/candidate-input.json',
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /CANDIDATE_INPUT_REQUIRED/);
});

test('hosted events and local execution share the admitted frozen group contract', () => {
  const workflow = readFileSync('.github/workflows/quality.yml', 'utf8');
  assert.match(
    workflow,
    /run: node scripts\/read-hosted-peer-input.mjs --repo dsh-agent-workbench/,
  );
  for (const [repo, output] of [
    ['dsh-agent-manage', 'manage-sha'],
    ['dsh-gea-plugin', 'gea-sha'],
  ]) {
    const refs = [
      ...workflow.matchAll(new RegExp('repository: CleverC2200/' + repo + '\\s+ref: (.*)', 'g')),
    ].map((match) => match[1]);
    assert.ok(refs.length > 0, repo + ' must be checked out');
    assert.ok(
      refs.every(
        (ref) =>
          ref === '${{ needs.candidate-scope.outputs.' + output + ' }}' ||
          ref === '${{ steps.group.outputs.' + output + ' }}',
      ),
    );
    assert.ok(refs.every((ref) => !ref.includes('||')));
  }
  assert.match(
    workflow,
    /QUALITY_SOURCE_KIND: \$\{\{ needs.candidate-scope.outputs.source-kind \}\}/,
  );
  assert.match(
    workflow,
    /QUALITY_BASELINE_ID: \$\{\{ needs.candidate-scope.outputs.baseline-id \}\}/,
  );
  assert.match(workflow, /--final-group-sha256 "\$INPUT_SHA256"/);
  assert.doesNotMatch(workflow, /--phase input/);
});
