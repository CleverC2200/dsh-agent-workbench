import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
const output = await build({
  entryPoints: ['../dsh-agent-manage/src/aps-compute/production-output.ts'],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
});
const { productionOutputMetric, productionOutputObservation } = await import(
  'data:text/javascript;base64,' + Buffer.from(output.outputFiles[0].text).toString('base64')
);
const row = {
  source_basis: 'MES_QUANTITY',
  records: 5,
  invalid: 1,
  valid_records: 3,
  planned: null,
  actual: null,
  known_planned: 100,
  known_actual: 110,
};
test('MES conflicts remain excluded; observed subset never supplies the complete metric', () => {
  assert.equal(productionOutputMetric([row]).value, null);
  assert.deepEqual(productionOutputObservation([row]), {
    value: 110.00000000000001,
    count: 3,
    total: 5,
    excluded: 2,
  });
  assert.equal(productionOutputObservation([{ ...row, known_planned: 0 }]), null);
  assert.equal(productionOutputObservation([{ ...row, known_actual: null }]), null);
  assert.equal(productionOutputObservation([{ ...row, valid_records: 6 }]), null);
  assert.equal(productionOutputObservation([{ ...row, invalid: 0 }]), null);
  assert.equal(
    productionOutputObservation([
      { ...row, valid_records: 0, known_planned: null, known_actual: null },
    ]),
    null,
  );
});
for (const agent of ['aqkc', 'fc', 'qll', 'apsplan'])
  test(`${agent}: health keeps warehouse identity and maximum age; never averages maximum ages`, async () => {
    const c = JSON.parse(await readFile(`business/inventory-${agent}/sql.config.json`));
    const detail = c.queries['health.detail'];
    assert.ok(detail.resultColumns.includes('warehouseid'));
    assert.ok(detail.resultColumns.includes('age_days'));
    assert.match(detail.request.sql, /GROUP BY [\s\S]*t\.warehouseid/);
    const summary = c.queries['health.summary'];
    assert.match(summary.request.sql, /MAX\(r\.age_days\) AS max_age/);
    assert.match(summary.request.sql, /NULL AS weighted_age/);
    assert.doesNotMatch(summary.request.sql, /r\.(total_qty|current_stock) \* r\.age_days/);
    for (const q of Object.values(c.queries)) assert.doesNotMatch(q.request.sql, /%\(gea_p/);
  });
test('known inputs are accessible without labeling unknown decisions as zero', async () => {
  const load = async (a) => JSON.parse(await readFile(`business/inventory-${a}/sql.config.json`));
  const dealer = await load('dealer'),
    fc = await load('fc'),
    qll = await load('qll');
  for (const id of ['shortage-stock', 'expiry'])
    assert.equal(dealer.sourceViews.views.find((v) => v.id === id).queryId, 'dealer.stock.detail');
  assert.equal(
    fc.sourceViews.views.find((v) => v.id === 'replenishment').queryId,
    'replenishment.detail',
  );
  assert.equal(
    qll.sourceViews.views.find((v) => v.id === 'channel-sku').queryId,
    'dealer.stock.detail',
  );
  const branchHealth = fc.sourceViews.views.find((v) => v.id === 'health');
  assert.equal(branchHealth.overrides.warehouse_type, undefined);
  assert.ok(branchHealth.filters.some((filter) => filter.name === 'warehouse_code'));
  assert.ok(branchHealth.filters.some((filter) => filter.name === 'base'));
});

test('base overview uses the weighted average while keeping maximum age in details', async () => {
  const source = await readFile(
    'business/inventory-aqkc/source/aqkc/web/src/lib/cube-dashboard.ts',
    'utf8',
  );
  assert.match(source, /numeric\(healthSummary\?\.average_age\)/);
  assert.match(source, /const rowAge = direct \? undefined : businessSummary.ageByBase/);
  assert.doesNotMatch(
    source,
    /healthSummary\?\.weighted_age|warehouseAge\?\.weighted_age|按仓库源库存加权/,
  );
  assert.doesNotMatch(source, /label: '最大库龄\/天'/);
  assert.match(source, /title: '平均货龄'/);
});
