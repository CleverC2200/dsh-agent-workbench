import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const { outputFiles } = await build({ stdin: { contents: "export { compressForModel } from './src/page-interaction/shared/payload-budget.ts'", resolveDir: process.cwd() }, bundle: true, write: false, platform: 'node', format: 'esm' });
const { compressForModel } = await import('data:text/javascript;base64,' + Buffer.from(outputFiles[0].contents).toString('base64'));

test('a focused row retains its independent selection and expansion identifiers', () => {
  const result = compressForModel({ visibleRows: [{ planId: 'plan-a', organization: 'Alpha group' }, { planId: 'plan-b', organization: 'Beta group' }], selectedPlanIds: ['plan-a'], expandedPlanIds: ['plan-a'], expandedFields: [{ id: 'field:plan-a:sku1:qty', label: 'sku1 quantity', value: '2' }], pagination: { total: 2 } }, { focus: 'Alpha sku1' });
  const data = JSON.parse(result.json);
  assert.deepEqual(data.visibleRows.map(row => row.planId), ['plan-a']);
  assert.deepEqual(data.expandedPlanIds, ['plan-a']);
  assert.deepEqual(data.selectedPlanIds, ['plan-a']);
  assert.equal(data.expandedFields.length, 1);
  assert.equal(data.pagination.total, 2);
  assert.equal(result.omitted, 1);
  assert.match(result.note, /1 项/);
  assert.doesNotMatch(result.note, /条未展开/);
});

test('metadata arrays still obey the item limit and report removed entries as items', () => {
  const result = compressForModel({ dimensions: ['north', 'south', 'east'] }, { focus: 'quantity', maxItems: 2 });
  assert.deepEqual(JSON.parse(result.json).dimensions, ['north', 'south']);
  assert.equal(result.omitted, 1);
});

test('omissions inside retained records count once alongside removed outer records', () => {
  const result = compressForModel({ groups: [{ organization: 'Alpha', lines: [{ name: 'Alpha detail' }, { name: 'Beta detail' }] }, { organization: 'Gamma', lines: [{ name: 'Gamma detail' }] }] }, { focus: 'Alpha' });
  const data = JSON.parse(result.json);
  assert.deepEqual(data.groups, [{ organization: 'Alpha', lines: [{ name: 'Alpha detail' }] }]);
  assert.equal(result.omitted, 2, 'one retained child and one whole outer record were removed');
});
