import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { migrationHistory } from './helpers/migration-history.mjs';

test('cold migration fixtures preserve fixed original Git blobs and reject altered or missing bytes', (t) => {
  assert.equal(migrationHistory('dealer').commit, '67e1007aa400a8a9c65c132f144dabd5168a49df');
  assert.equal(migrationHistory('personal').commit, '15def488134527647a819812a4b6657ecf9772fe');
  const root = mkdtempSync(join(tmpdir(), 'migration-history-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'helpers'));
  mkdirSync(join(root, 'fixtures'));
  cpSync('tests/helpers/migration-history.mjs', join(root, 'helpers/migration-history.mjs'));
  const file = join(root, 'fixtures/migration-history.raw');
  cpSync('tests/fixtures/migration-history.raw', file);
  const run = () =>
    spawnSync(process.execPath, [join(root, 'helpers/migration-history.mjs')], {
      encoding: 'utf8',
    });
  assert.equal(run().status, 0);
  const bytes = readFileSync(file);
  writeFileSync(file, Buffer.concat([bytes, Buffer.from('tamper')]));
  assert.match(run().stderr, /HISTORY_FIXTURE_CHANGED/);
  rmSync(file);
  assert.notEqual(run().status, 0);
});
