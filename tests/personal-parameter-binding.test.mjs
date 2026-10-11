import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const output = await build({
  entryPoints: ['business/shared/governed-parameters.ts'],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
});
const { bindGovernedSql } = await import(
  'data:text/javascript;base64,' + Buffer.from(output.outputFiles[0].text).toString('base64')
);
test('current branch order and SKU lists keep paired membership and quote-bearing values in scalar parameters', () => {
  const input =
    'SELECT f.executeorderno FROM orders f WHERE f.executeorderno = ANY($1::text[]) AND f.pickup=$2 AND ((f.executeorderno=$3 AND f.sku=$4) OR (f.executeorderno=$5 AND f.sku=$6))';
  const bound = bindGovernedSql(input, [["O'1", 'O2'], '0101', "O'1", 'SKU1', 'O2', 'SKU2']);
  assert.equal(
    bound.sql,
    'SELECT f.executeorderno FROM orders f WHERE f.executeorderno IN (:list_1_0, :list_1_1) AND f.pickup=:gea_p2 AND ((f.executeorderno=:gea_p3 AND f.sku=:gea_p4) OR (f.executeorderno=:gea_p5 AND f.sku=:gea_p6))',
  );
  assert.equal(bound.parameters.list_1_0, "O'1");
  assert.equal(bound.parameters.gea_p4, 'SKU1');
  assert.equal(bound.parameters.gea_p6, 'SKU2');
  const quoted =
    "SELECT '= ANY($1::text[])' AS label WHERE sku = ANY($1::text[]) -- = ANY($1::text[])";
  assert.equal(
    bindGovernedSql(quoted, [['SKU1']]).sql,
    "SELECT '= ANY($1::text[])' AS label WHERE sku IN (:list_1_0) -- = ANY($1::text[])",
  );
  assert.throws(
    () => bindGovernedSql(input, [[], '0101', 'O1', 'SKU1', 'O2', 'SKU2']),
    /GEA_SQL_PARAMETER_INVALID/,
  );
});
