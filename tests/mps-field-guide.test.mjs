import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';

const html = readFileSync(
  new URL('../docs/mps-demand-confirmation-fields.html', import.meta.url),
  'utf8',
);

test('MPS field guide remains a standalone document with valid inline JavaScript', () => {
  assert.doesNotMatch(html, /<(?:script|link|iframe|img)\b[^>]*(?:src|href)\s*=/i);
  assert.doesNotMatch(html, /\b(?:fetch|XMLHttpRequest|WebSocket)\s*\(/);
  assert.doesNotMatch(html, /\/Users\//);
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  assert.ok(scripts.length);
  for (const [, source] of scripts) assert.doesNotThrow(() => new Script(source));
});

test('MPS field guide compares page columns with vertically merged source fields', () => {
  const tables = [...html.matchAll(/<table\b[\s\S]*?<\/table>/g)];
  assert.ok(tables.length);
  for (const [source] of tables) {
    const table = source.replace(/>\s+</g, '><').replace(/\s+/g, ' ');
    assert.match(
      table,
      /<thead><tr><th class="source-axis">来源表<\/th><th class="field-axis">来源字段<\/th>/,
    );
    assert.match(table, /class="page-field"/);
    assert.match(table, /scope="rowgroup"[^>]*data-source-heading rowspan="\d+"/);
    assert.match(table, /class="source-field g-[A-Z]"/);
    assert.match(table, /<tfoot><tr class="formula-row">/);
    assert.match(table, /class="boundary-row"/);
  }
});
