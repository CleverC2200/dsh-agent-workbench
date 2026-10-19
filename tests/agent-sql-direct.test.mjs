import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('the direct SQL executor preserves its existing read-only Python contracts', () => {
  const child = spawnSync(
    'uv',
    [
      'run',
      '--no-project',
      '--with-requirements',
      'scripts/requirements-sql.txt',
      'python',
      'scripts/test_agent_sql.py',
    ],
    {
      encoding: 'utf8',
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
    },
  );
  assert.equal(child.status, 0, child.error?.message ?? child.stdout + child.stderr);
  assert.match(child.stderr, /Ran [1-9]\d* tests/);
  assert.doesNotMatch(child.stderr, /OK\s*\(skipped=/);
});
