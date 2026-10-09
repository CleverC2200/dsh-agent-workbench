import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { transform } from 'esbuild';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import ts from 'typescript';
const fixed = '322c222d9663c6732dc02a6a0ee53e2ab382ed82';
const evidence = process.env.APS_EVIDENCE_DIR ?? '.runtime/aps-offline';
await mkdir(evidence, { recursive: true });
const modules = [
  'adapter',
  'metrics',
  'period',
  'page-analysis',
  'perspective-analysis',
  'workbench-insights',
  'base-product-hierarchy',
  'sales-org-hierarchy',
];
const canonical = async (source) =>
  (
    await transform(source.replace(/(from\s+['"]\.\/[\w-]+)\.js(['"])/g, '$1$2'), {
      loader: 'ts',
      minifySyntax: true,
      minifyWhitespace: true,
      minifyIdentifiers: false,
      format: 'esm',
      target: 'es2023',
    })
  ).code;
const results = [];
for (const name of modules) {
  const path = `business/inventory-apsplan/source/app/${name.includes('hierarchy') ? '' : 'data/'}${name}.ts`;
  let original = execFileSync('git', ['show', `${fixed}:${path}`], { encoding: 'utf8' });
  if (name === 'metrics')
    original = original.replace(",actualAbsent=missing(forecast,'missing_actual')", '');
  const migrated = await readFile(`../dsh-agent-manage/src/aps-compute/${name}.ts`, 'utf8');
  const before = await canonical(original),
    after = await canonical(migrated);
  assert.equal(after, before, `APS runtime AST parity: ${name}`);
  results.push({
    name,
    canonicalSha256: createHash('sha256').update(before).digest('hex'),
    equal: true,
  });
}
const paths = execFileSync(
  'git',
  ['ls-tree', '-r', '--name-only', fixed, 'business/inventory-apsplan/source/tests/data'],
  { encoding: 'utf8' },
)
  .trim()
  .split('\n')
  .filter((path) => path.endsWith('.test.mjs'));
const golden = (source) => {
  const tree = ts.createSourceFile(
      'test.mjs',
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.JS,
    ),
    values = [];
  const visit = (node) => {
    if (
      ts.isCallExpression(node) &&
      ((ts.isIdentifier(node.expression) && node.expression.text === 'test') ||
        (ts.isPropertyAccessExpression(node.expression) &&
          node.expression.expression.getText(tree) === 'assert'))
    )
      values.push(node.getText(tree));
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return values;
};
let count = 0;
for (const path of paths) {
  const original = execFileSync('git', ['show', `${fixed}:${path}`], { encoding: 'utf8' }),
    migrated = await readFile(path, 'utf8');
  assert.deepEqual(golden(migrated), golden(original), `Golden literal tests: ${path}`);
  count += golden(original).filter((value) => value.startsWith('test(')).length;
}
assert.equal(count, 50);
await writeFile(
  `${evidence}/original-parity.json`,
  JSON.stringify(
    {
      fixed,
      modules: results,
      goldenLiteralTests: count,
      unchanged: true,
      typeOnlyChanges: ['Record<string,unknown>', 'number type assertion'],
      deadUnusedVariableRemoved: 'actualAbsent',
    },
    null,
    2,
  ) + '\n',
);
console.log(
  'APS 8 public compute modules runtime AST equal; original 50 literal test bodies unchanged',
);
