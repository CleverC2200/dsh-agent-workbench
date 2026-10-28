import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
const config = JSON.parse(await readFile('business/inventory-fc/sql.config.json', 'utf8'));
const output = await build({
  entryPoints: [
    'business/inventory-fc/source/inventory-light-plugins/src/pages/fc-warehouse-directory.ts',
  ],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
});
const { readFcWarehouseDirectory } = await import(
  'data:text/javascript;base64,' + Buffer.from(output.outputFiles[0].contents).toString('base64')
);
const success = {
  rows: [{ warehouse_code: 'A020', warehouse_name: '长沙', base: '遂平' }],
  configVersion: 'same',
  returnedColumns: config.queries['branch-warehouse.directory'].resultColumns,
  rejectedColumns: [],
};
test('directory recovers once from a transient transport timeout', async () => {
  let calls = 0;
  const rows = await readFcWarehouseDirectory(
    config,
    '2026-10-28',
    new AbortController().signal,
    async () => {
      if (++calls === 1) throw Object.assign(Error('timeout'), { code: 'GEA_SQL_QUERY_TIMEOUT' });
      return success;
    },
  );
  assert.equal(calls, 2);
  assert.equal(rows[0].warehouse_code, 'A020');
});
for (const code of ['ROW_SCOPE_DENIED', 'FIELD_NOT_PUBLISHED', 'RESOURCE_NOT_IN_DATASET'])
  test('directory never retries ' + code, async () => {
    let calls = 0;
    const error = Object.assign(Error('wrapped timeout'), {
      code: 'GEA_SQL_UNAVAILABLE',
      cause: Object.assign(Error(code), { code }),
    });
    await assert.rejects(
      readFcWarehouseDirectory(config, '2026-10-28', new AbortController().signal, async () => {
        calls++;
        throw error;
      }),
      (e) => e === error,
    );
    assert.equal(calls, 1);
  });
test('leaving during recovery cancels the retry', async () => {
  const abort = new AbortController();
  let calls = 0;
  const pending = readFcWarehouseDirectory(config, '2026-10-28', abort.signal, async () => {
    calls++;
    setTimeout(() => abort.abort(), 20);
    throw Object.assign(Error('timeout'), { code: 'GEA_SQL_QUERY_TIMEOUT' });
  });
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(calls, 1);
});
