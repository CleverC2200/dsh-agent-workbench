import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
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
  const directory = mkdtempSync(join(tmpdir(), 'workbench-active-knowledge-'));
  const fixture = join(directory, 'candidate/dsh-agent-workbench');
  mkdirSync(join(directory, 'candidate'));
  try {
    const cloned = spawnSync(
      'git',
      ['clone', '--quiet', '--no-hardlinks', process.cwd(), fixture],
      {
        encoding: 'utf8',
      },
    );
    assert.equal(cloned.status, 0, cloned.stderr);
    const peer = spawnSync(
      'git',
      [
        'clone',
        '--quiet',
        '--no-hardlinks',
        resolve('../dsh-gea-plugin'),
        join(directory, 'candidate/dsh-gea-plugin'),
      ],
      { encoding: 'utf8' },
    );
    assert.equal(peer.status, 0, peer.stderr);
    // Source only; the gate must diagnose missing references before requiring dependency installation.
    const sourceManifest = JSON.parse(readFileSync('package.json'));
    // This source-reference fixture has no build stage; prepared outputs are checked separately.
    sourceManifest.exports = { './package.json': './package.json' };
    writeFileSync(join(fixture, 'package.json'), JSON.stringify(sourceManifest));
    for (const file of [
      'run-quality-fast.mjs',
      'run-quality-checks.mjs',
      'check-agent-knowledge.mjs',
    ])
      cpSync(join('scripts', file), join(fixture, 'scripts', file));
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
    mkdirSync(join(fixture, 'locale'), { recursive: true });
    writeFileSync(join(fixture, 'locale/en.json'), '{}');
    manifest.exports['./locale/*.json'] = './locale/*.json';
    writeFileSync(join(fixture, 'package.json'), JSON.stringify(manifest));
    result = run(fixture, 'check:knowledge');
    assert.equal(result.status, 0, result.stdout + result.stderr);
    manifest.exports['./locale/*.json'] = './locale/missing-*.json';
    writeFileSync(join(fixture, 'package.json'), JSON.stringify(manifest));
    result = run(fixture, 'check:knowledge');
    assert.notEqual(result.status, 0);
    assert.match(result.stdout + result.stderr, /AGENT_REFERENCE_MISSING: export/);
    manifest.exports['./locale/*.json'] = './locale/*.json';
    manifest.exports['./quality-missing'] = './lib/quality-export-missing.js';
    writeFileSync(join(fixture, 'package.json'), JSON.stringify(manifest));
    result = run(fixture, 'quality:fast');
    assert.notEqual(result.status, 0);
    assert.match(
      result.stdout + result.stderr,
      /AGENT_REFERENCE_MISSING: export.*quality-export-missing/,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
