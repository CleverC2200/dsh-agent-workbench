import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from './public-build.mjs';
const output = await build({
  entryPoints: [fileURLToPath(new URL('../../app/data/budget-progress.ts', import.meta.url))],
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
});
const { budgetProgress } = await import(
  'data:text/javascript;base64,' + Buffer.from(output.outputFiles[0].text).toString('base64')
);
test('month-to-date budget compares against elapsed calendar days including the cutoff day', () => {
  const progress = budgetProgress(
    { start: '2026-11-01', end: '2026-11-16', granularity: 'month', sections: [] },
    48.55,
  );
  assert.equal(progress.target.toFixed(2), '53.33');
  assert.equal(progress.gap.toFixed(2), '-4.78');
  assert.equal(progress.achieved, false);
  assert.equal(
    budgetProgress(
      { start: '2026-11-01', end: '2026-11-16', granularity: 'month', sections: [] },
      54,
    ).achieved,
    true,
  );
});
test('complete months retain final targets and leap-month progress uses the real month length', () => {
  assert.equal(
    budgetProgress(
      { start: '2026-11-01', end: '2026-11-30', granularity: 'month', sections: [] },
      94,
    ),
    null,
  );
  const leap = budgetProgress(
    { start: '2024-02-01', end: '2024-02-14', granularity: 'month', sections: [] },
    50,
  );
  assert.equal(leap.days, 29);
  assert.equal(leap.target, 1400 / 29);
  assert.equal(
    budgetProgress(
      { start: '2026-01-01', end: '2026-11-16', granularity: 'year', sections: [] },
      48.55,
    ),
    null,
  );
});
