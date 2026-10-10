import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const source =
  'business/inventory-qll/source/inventory-light-plugins/src/pages/qll/components/structure-evidence.ts';
const bundled = await build({
  entryPoints: [source],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
});
const { structureReferences, structureViewEvidence, referenceText } = await import(
  'data:text/javascript;base64,' + Buffer.from(bundled.outputFiles[0].text).toString('base64')
);
const row = (key, extra = {}) => ({
  key,
  layer: 'base',
  objectName: '华东',
  category: '饺子',
  sku: '全部SKU',
  currentQty: 41268,
  availableQty: 41268,
  targetQty: 46238,
  sourceDate: '2026-09-30',
  turnoverDemand30d: 122580,
  plannedDailyQty: 4090,
  averageAgeDays: 20.2,
  bigDateQty: 0,
  ...extra,
});

test('real JSON business keys get bounded legal stable reference IDs, separated by snapshot', () => {
  const keys = [
    'category-object:["base","华东","饺子"]',
    'base:华东:10006074',
    'emoji:🧊',
    'punctuation:[a,b]',
    'punctuation:_a_b_',
    '长'.repeat(10000),
  ];
  const rows = keys.map((k) =>
    row(k, { objectName: '组织'.repeat(130) + '🧊', sourceDate: '日'.repeat(250) }),
  );
  const a = structureReferences('snapshot-a', rows, null),
    again = structureReferences('snapshot-a', [...rows].reverse(), null),
    b = structureReferences('snapshot-b', rows, null);
  assert.equal(new Set(a.elements.map((e) => e.id)).size, keys.length);
  assert.deepEqual(new Set(a.elements.map((e) => e.id)), new Set(again.elements.map((e) => e.id)));
  assert.ok(
    a.elements.every(
      (e) =>
        /^[A-Za-z][A-Za-z0-9:._\-\u4e00-\u9fa5]*$/.test(e.id) &&
        e.id.length <= 120 &&
        e.label.length <= 200 &&
        e.value.length <= 200,
    ),
  );
  assert.ok(a.elements.every((e) => !b.elements.some((v) => v.id === e.id)));
  assert.equal(referenceText('a'.repeat(198) + '🧊long'), 'a'.repeat(198) + '…');
  assert.deepEqual(
    rows.map((r) => r.key),
    keys,
    'business/tree keys remain intact',
  );
});

test('oversized rendered views preserve selected SKU and disclose the reference subset within the unchanged 300-element contract', () => {
  const aggregates = Array.from({ length: 244 }, (_, i) => row('aggregate:' + i));
  const skus = Array.from({ length: 100 }, (_, i) => row('sku:' + i, { sku: String(i) }));
  const selected = skus[99],
    result = structureReferences('current', [...aggregates, ...skus], selected);
  assert.equal(result.elements.length + 1, 300, 'one slot belongs to the existing refresh control');
  assert.deepEqual(result.coverage, { visibleRows: 344, referencedRows: 299, omittedRows: 45 });
  assert.equal(result.rows[0], selected);
  assert.ok(skus.every((r) => result.rows.includes(r)));
  assert.equal(new Set(result.rows.map((r) => r.key)).size, result.rows.length);
});

test('filtered summary uses full calculated aggregates and keeps company, customer, zero and unknown separate from current SKU pages', () => {
  const rows = Array.from({ length: 40 }, (_, i) =>
    row('aggregate:' + i, {
      currentQty: i === 0 ? 0 : 100,
      availableQty: 100,
      targetQty: i === 0 ? null : 120,
    }),
  );
  rows.push(
    row('branch', { layer: 'branch', currentQty: 50, availableQty: 0, targetQty: 0 }),
    row('customer', { layer: 'customer', currentQty: 999, availableQty: null, targetQty: null }),
  );
  const view = structureViewEvidence(
    { workspaceId: 'fixed', scope: 'company', filters: { month: '2026-10' } },
    rows,
    { org: '', category: '饺子' },
    '',
    'category',
  );
  assert.equal(view.rowCount, 42);
  assert.equal(view.companyPhysicalQty, 3950);
  assert.equal(view.layers.find((r) => r.layer === 'base').targetQty, null);
  assert.equal(view.companyInventoryQty, 3900);
  assert.equal(view.layers.find((r) => r.layer === 'branch').availableQty, 0);
  assert.match(view.scopeDescription, /不含客户渠道/);
  assert.equal(
    structureViewEvidence(
      { workspaceId: 'fixed', scope: 'all-channel', filters: {} },
      rows,
      { org: '', category: '' },
      '',
      'category',
    ).companyInventoryQty,
    3900,
  );
  const filtered = structureViewEvidence(
    { workspaceId: 'fixed', scope: 'company', filters: { month: '2026-10' } },
    [row('huadong')],
    { org: '["base","华东"]', category: '饺子' },
    '',
    'category',
  );
  const unavailable = structureViewEvidence(
    { workspaceId: 'fixed', scope: 'company', filters: {} },
    [
      row('base', { currentQty: 10 }),
      row('branch', { layer: 'branch', currentQty: 50, availableQty: null }),
    ],
    { org: '', category: '' },
    '',
    'category',
  );
  assert.equal(unavailable.companyInventoryQty, null);
  assert.equal(unavailable.companyPhysicalQty, 60);
  assert.equal(filtered.companyInventoryQty, 41268);
  assert.equal(filtered.layers[0].differenceQty, -4970);
});
