import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash as nodeHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { build } from 'esbuild';
const compile = async (contents) => {
  const result = await build({
    stdin: { contents, loader: 'ts' },
    write: false,
    format: 'esm',
    platform: 'browser',
  });
  return import(
    'data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64')
  );
};
const current = await compile(await readFile('business/shared/browser-crypto.ts', 'utf8'));
const original = await compile(
  execFileSync(
    'git',
    [
      'show',
      'ed643025d95ca188f3bd55d3a37dffc800a76b40:business/inventory-qll/source/inventory-light-plugins/src/browser-crypto.ts',
    ],
    { encoding: 'utf8' },
  ),
);
test('the shared browser SHA256 keeps original QLL Unicode, chunks and block-boundary outputs', () => {
  for (const chunks of [
    [''],
    ['abc'],
    ['郑州', '库存', '😀'],
    ['x'.repeat(55)],
    ['x'.repeat(56)],
    ['x'.repeat(64)],
    ['x'.repeat(65)],
    ['x'.repeat(100), 'y'.repeat(100)],
    ['["郑州","AGE","60天以上库存"]'],
  ]) {
    const expected = nodeHash('sha256').update(chunks.join('')).digest('hex');
    for (const module of [original, current]) {
      const hash = module.createHash('sha256');
      for (const chunk of chunks) hash.update(chunk);
      assert.equal(hash.digest('hex'), expected);
    }
  }
});
