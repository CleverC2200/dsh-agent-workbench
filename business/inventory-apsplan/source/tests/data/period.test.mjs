import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from './public-build.mjs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = await mkdtemp(join(tmpdir(), 'aps-period-'));
await build({
  entryPoints: [fileURLToPath(new URL('../../app/data/period.ts', import.meta.url))],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: join(dir, 'period.mjs'),
});
const { effectivePeriodEnd, isFutureCalendarDay } = await import(join(dir, 'period.mjs'));
const today = new Date(2026, 8, 22, 15);

test('当前自然周跨到未来时，查询截止日截到今天', () => {
  assert.deepEqual(effectivePeriodEnd(2026, 9, 27, today), {
    year: 2026,
    month: 9,
    day: 22,
    iso: '2026-09-22',
  });
});

test('历史周期保留原截止日，未来日期可用于禁用筛选项', () => {
  assert.equal(effectivePeriodEnd(2026, 9, 20, today).iso, '2026-09-20');
  assert.equal(isFutureCalendarDay(2026, 9, 23, today), true);
  assert.equal(isFutureCalendarDay(2026, 9, 22, today), false);
});

await rm(dir, { recursive: true, force: true });
