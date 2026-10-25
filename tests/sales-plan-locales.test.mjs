import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('sales plan overview has a display label in both supported languages', () => {
  const en = JSON.parse(
    readFileSync(new URL('../src/workbench/original/en-US.json', import.meta.url), 'utf8'),
  );
  const zh = JSON.parse(
    readFileSync(new URL('../src/workbench/original/zh-CN.json', import.meta.url), 'utf8'),
  );
  const find = (value) =>
    value &&
    typeof value === 'object' &&
    (value.scopeTotals?.overview || Object.values(value).map(find).find(Boolean));
  assert.equal(find(en), 'Plan overview');
  assert.equal(find(zh), '计划概览');
});
