import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createQueryClient } from '../business/shared/configured-query-client.mjs';

for (const agent of ['fc', 'aqkc', 'qll', 'dealer', 'apsplan']) {
  test(`${agent}: configured pages comply with the live GEA 200-row limit`, async () => {
    const config = JSON.parse(
      await readFile(`business/inventory-${agent}/sql.config.json`, 'utf8'),
    );
    for (const [id, q] of Object.entries(config.queries)) {
      for (const [key, spec] of Object.entries(q.parameterSpec)) {
        if (spec.name !== 'page_size') continue;
        assert.ok(spec.maximum <= 200, id);
        assert.ok(q.request.parameters[key] <= 200, id);
      }
    }
    const walk = (value) => {
      if (!value || typeof value !== 'object') return;
      if ('pageSize' in value) assert.ok(value.pageSize <= 200);
      Object.values(value).forEach(walk);
    };
    walk(config);
  });
}

test('200-row batches read all 401 rows and verify the count twice', async () => {
  const config = JSON.parse(await readFile('business/inventory-apsplan/sql.config.json', 'utf8'));
  const binding = Object.values(config.workspaceBindings).find(
    (b) => b.pageSize === 200 && b.keyFields.length > 0,
  );
  assert.ok(binding);
  const q = config.queries[binding.queryId];
  const values = Object.fromEntries(
    Object.entries(q.parameterSpec).map(([key, spec]) => [spec.name, q.request.parameters[key]]),
  );
  values.page_size = binding.pageSize;
  values.offset = 0;
  const offsets = [];
  let counts = 0;
  const client = createQueryClient(config, async (request, { queryId, values }) => {
    if (queryId === q.pagination.countQuery) {
      counts++;
      return { rows: [{ total: 401 }], configVersion: 'live-limit-fixture' };
    }
    assert.equal(values.page_size, 200);
    offsets.push(values.offset);
    return {
      rows: Array.from({ length: Math.min(200, 401 - values.offset) }, (_, i) =>
        Object.fromEntries(binding.keyFields.map((key) => [key, String(values.offset + i)])),
      ),
      configVersion: 'live-limit-fixture',
    };
  });
  const result = await client.readAll(binding.queryId, values, { keyFields: binding.keyFields });
  assert.equal(result.rows.length, 401);
  assert.deepEqual(offsets, [0, 200, 400]);
  assert.equal(counts, 2);
});
