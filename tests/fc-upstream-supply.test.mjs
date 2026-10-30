import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('FC upstream SQL preserves receiving scope, units, latest state, unknowns and paging', () => {
  const run = spawnSync('python3', ['scripts/test_fc_upstream_supply.py'], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.error?.message ?? run.stdout + run.stderr);
});
