import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from './public-build.mjs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = await mkdtemp(join(tmpdir(), 'aps-workbench-insights-'));
await build({
  entryPoints: [fileURLToPath(new URL('../../app/data/workbench-insights.ts', import.meta.url))],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: join(dir, 'workbench-insights.mjs'),
});
const { deriveWorkbenchInsights, deriveOrderRisks } = await import(
  join(dir, 'workbench-insights.mjs')
);

const data = (rows) => ({
  start: '2026-09-01',
  end: '2026-09-22',
  granularity: 'month',
  sections: [{ id: 'orders', status: 'ready', rows }],
});

test('从订单履约事实生成品类预警和基地品类严重项', () => {
  const current = data([
    { base: '华东', category: '面点', demand: 600, shortage: 30, invalid: 0 },
    { base: '华南', category: '面点', demand: 400, shortage: 50, invalid: 0 },
    { base: '西南', category: '休闲', demand: 100, shortage: 20, invalid: 0 },
  ]);
  const previous = data([
    { base: '华东', category: '面点', demand: 1000, shortage: 50, invalid: 0 },
  ]);
  const result = deriveWorkbenchInsights(current, previous);
  assert.equal(result.warnings.length, 1);
  assert.equal(result.warnings[0].scope, '面点品类');
  assert.equal(result.warnings[0].metric, '订单满足率 92.00%');
  assert.equal(result.warnings[0].trend, '较上期 -3.00pp');
  assert.equal(result.actions[0].scope, '西南 × 休闲');
  assert.match(result.actions[0].diagnosis, /缺货0.00万件/);
});

test('缺失、异常和查询失败的数据不生成判断', () => {
  const invalid = data([
    { base: '华东', category: '面点', demand: 100, shortage: 10, invalid: 1 },
    { base: '华南', category: null, demand: 100, shortage: 20, invalid: 0 },
  ]);
  assert.deepEqual(deriveWorkbenchInsights(invalid), { warnings: [], actions: [] });
  invalid.sections[0].status = 'error';
  assert.deepEqual(deriveWorkbenchInsights(invalid), { warnings: [], actions: [] });
});

await rm(dir, { recursive: true, force: true });

test('风险清单复用订单事实，按维度加权且不截断风险项', () => {
  const current = data([
    { base: '华东', category: '面点', demand: 600, shortage: 30, invalid: 0 },
    { base: '华南', category: '面点', demand: 400, shortage: 50, invalid: 0 },
    { base: '西南', category: '休闲', demand: 100, shortage: 20, invalid: 0 },
  ]);
  const category = deriveOrderRisks(current, 'category');
  assert.deepEqual(
    category.map((x) => [x.scope, x.rate, x.risk]),
    [
      ['休闲', 80, '严重'],
      ['面点', 92, '预警'],
    ],
  );
  assert.equal(deriveOrderRisks(current, 'base').length, 2);
  assert.equal(deriveOrderRisks(current, 'cross').length, 2);
  assert.equal(
    deriveOrderRisks(
      data(
        Array.from({ length: 20 }, (_, i) => ({
          category: String(i),
          demand: 100,
          shortage: 10,
          invalid: 0,
        })),
      ),
      'category',
    ).length,
    20,
  );
});
test('风险清单排除失败、缺失维度及异常数量', () => {
  const current = data([
    { base: '华东', category: '面点', demand: 100, shortage: 200, invalid: 0 },
    { base: '华南', category: null, demand: 100, shortage: 20, invalid: 0 },
  ]);
  assert.deepEqual(deriveOrderRisks(current, 'category'), []);
  current.sections[0].status = 'error';
  assert.deepEqual(deriveOrderRisks(current, 'base'), []);
});
