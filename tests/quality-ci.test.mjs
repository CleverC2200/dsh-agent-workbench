import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
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
test('frozen admission requires inputs and binds the actual event before preparing anything', () => {
  assert.match(run([]).stderr, /CANDIDATE_INPUT_REQUIRED/);
  const fixture = mkdtempSync(join(tmpdir(), 'workbench-ci-'));
  try {
    const result = run(['--phase', 'input', '--root', fixture, '--sha', 'a'.repeat(40)]);
    assert.equal(result.status, 0, result.stderr);
    const file = join(fixture, 'candidate-input.json');
    const manifest = JSON.parse(readFileSync(file));
    assert.equal(manifest.repositories.length, 3);
    assert.equal(manifest.repositories[0].head, 'a'.repeat(40));
    manifest.repositories[0].path = process.cwd();
    writeFileSync(file, JSON.stringify(manifest));
    assert.match(run(['--input', file], { CI: 'true' }).stderr, /CANDIDATE_EVENT_REQUIRED/);
    assert.match(
      run(['--input', file], { CI: 'true', QUALITY_EXPECTED_SHA: 'b'.repeat(40) }).stderr,
      /CANDIDATE_EVENT_MISMATCH/,
    );
    assert.match(
      run(['--phase', 'input', '--root', fixture, '--sha', 'main']).stderr,
      /CANDIDATE_EVENT_REQUIRED/,
    );
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
  assert.equal((workflow.match(/fetch-depth: 0/g) ?? []).length, 5);
  assert.equal((workflow.match(/persist-credentials: false/g) ?? []).length, 5);
  assert.match(workflow, /npm run quality:ci -- --prepare-sdk/);
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

test('input CLI binds each registered Core and rejects unknown commits before preparation', () => {
  const fixture = mkdtempSync(join(tmpdir(), 'workbench-dual-ci-'));
  try {
    for (const core of JSON.parse(readFileSync('../dsh-gea-plugin/scripts/supported-cores.json'))) {
      const result = run([
        '--phase',
        'input',
        '--root',
        fixture,
        '--sha',
        'a'.repeat(40),
        '--core-head',
        core.head,
      ]);
      assert.equal(result.status, 0, result.stderr);
      assert.equal(JSON.parse(readFileSync(join(fixture, 'candidate-input.json'))).core, core.head);
    }
    assert.match(
      run([
        '--phase',
        'input',
        '--root',
        fixture,
        '--sha',
        'a'.repeat(40),
        '--core-head',
        'f'.repeat(40),
      ]).stderr,
      /CANDIDATE_CORE/,
    );
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});
