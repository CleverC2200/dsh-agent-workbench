import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';

const run = (cwd, ...args) => {
  const windows = process.platform === 'win32';
  return spawnSync(windows ? 'npm.cmd' : 'npm', ['run', ...args], {
    cwd,
    encoding: 'utf8',
    shell: windows,
  });
};

test('public fast quality checks its active documentation, declarations and actual export targets', () => {
  const fixture = mkdtempSync(join(tmpdir(), 'workbench-active-knowledge-'));
  try {
    const cloned = spawnSync(
      'git',
      ['clone', '--quiet', '--no-hardlinks', process.cwd(), fixture],
      {
        encoding: 'utf8',
      },
    );
    assert.equal(cloned.status, 0, cloned.stderr);
    // Source only; the gate must diagnose missing references before requiring dependency installation.
    cpSync('package.json', join(fixture, 'package.json'));
    const good = run(fixture, 'check:knowledge');
    assert.equal(good.status, 0, good.stdout + good.stderr);
    const readme = readFileSync(join(fixture, 'README.md'));
    writeFileSync(
      join(fixture, 'README.md'),
      readme + '\n[Missing active input](docs/quality-missing.md)\n',
    );
    let result = run(fixture, 'quality:fast');
    assert.notEqual(result.status, 0);
    assert.match(result.stdout + result.stderr, /AGENT_REFERENCE_MISSING.*quality-missing/);
    writeFileSync(join(fixture, 'README.md'), readme);
    const configuration = readFileSync(join(fixture, 'agent-knowledge.json'));
    const declared = JSON.parse(configuration);
    declared.paths.push('src/quality-declaration-missing.ts');
    writeFileSync(join(fixture, 'agent-knowledge.json'), JSON.stringify(declared));
    result = run(fixture, 'quality:fast');
    assert.notEqual(result.status, 0);
    assert.match(
      result.stdout + result.stderr,
      /AGENT_REFERENCE_MISSING.*quality-declaration-missing/,
    );
    writeFileSync(join(fixture, 'agent-knowledge.json'), configuration);
    const manifest = JSON.parse(readFileSync(join(fixture, 'package.json')));
    manifest.exports['./quality-missing'] = './lib/quality-export-missing.js';
    writeFileSync(join(fixture, 'package.json'), JSON.stringify(manifest));
    result = run(fixture, 'quality:fast');
    assert.notEqual(result.status, 0);
    assert.match(
      result.stdout + result.stderr,
      /AGENT_REFERENCE_MISSING: export.*quality-export-missing/,
    );
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});
