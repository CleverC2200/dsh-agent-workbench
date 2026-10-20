import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { verifyFixedAuthoredData } from '../scripts/static-author-provenance.mjs';

const ref = '9b4863692cb29a3edc8a2358e98feb7846526d1b';
for (const page of ['category', 'mps']) {
  const source = JSON.parse(readFileSync(`static/${page}/source/SOURCE.json`));
  const files = Object.fromEntries(
    ['app.js', 'data.js'].map((file) => [
      file,
      readFileSync(`static/${page}/source/${file}`, 'utf8'),
    ]),
  );
  test(`${page} original and formatted authored data preserve the same fixed provenance`, () => {
    const original = Object.fromEntries(
      Object.keys(files).map((file) => [
        file,
        execFileSync('git', ['show', `${ref}:static/${page}/source/${file}`], { encoding: 'utf8' }),
      ]),
    );
    verifyFixedAuthoredData(page, original, source);
    verifyFixedAuthoredData(page, files, source);
  });
  test(`${page} actual authored data and metadata tampering still refuse the public build verifier`, () => {
    const name = Object.keys(source.fixedAuthoredData).find(
      (name) => source.fixedAuthoredData[name].file === 'app.js',
    );
    const changed = {
      ...files,
      'app.js': files['app.js'].replace(
        new RegExp(`const ${name}\\s*=`),
        `const ${name} = null; const alteredFixedData =`,
      ),
    };
    assert.notEqual(changed['app.js'], files['app.js']);
    assert.throws(
      () => verifyFixedAuthoredData(page, changed, source),
      /STATIC_AUTHORED_DATA_CHANGED/,
    );
    const missing = {
      ...files,
      'app.js': files['app.js'].replace(
        new RegExp(`const ${name}\\s*=`),
        'const missingFixedData =',
      ),
    };
    assert.throws(
      () => verifyFixedAuthoredData(page, missing, source),
      /STATIC_AUTHORED_DATA_CHANGED/,
    );
    const metadata = structuredClone(source);
    metadata.fixedAuthoredData[name].sha256 = '0'.repeat(64);
    assert.throws(
      () => verifyFixedAuthoredData(page, files, metadata),
      /STATIC_AUTHORED_PROVENANCE_CHANGED/,
    );
  });
  test(`${page} fixed numbers, keys, strings, element order and operators cannot change`, () => {
    const text = files['app.js'];
    const ast = ts.createSourceFile('app.js', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    const names = new Set(
      Object.entries(source.fixedAuthoredData)
        .filter(([, value]) => value.file === 'app.js')
        .map(([name]) => name),
    );
    const nodes = [];
    const collect = (node) => {
      nodes.push(node);
      ts.forEachChild(node, collect);
    };
    for (const statement of ast.statements.filter(ts.isVariableStatement))
      for (const declaration of statement.declarationList.declarations)
        if (names.has(declaration.name.getText(ast))) collect(declaration.initializer);
    const number = nodes.find(ts.isNumericLiteral),
      string = nodes.find((n) => ts.isStringLiteral(n) && n.parent.name !== n),
      property = nodes.find(ts.isPropertyAssignment),
      array = nodes.find((n) => ts.isArrayLiteralExpression(n) && n.elements.length > 1);
    assert.ok(
      number && string && property && array,
      'real fixed data has all required mutation targets',
    );
    const mutations = [
      [number, String(Number(number.text) + 1)],
      [string, JSON.stringify(string.text + ' changed')],
      [property.name, 'changedFixedKey'],
      [
        array,
        '[' +
          [array.elements[1], array.elements[0], ...array.elements.slice(2)]
            .map((n) => n.getText(ast))
            .join(',') +
          ']',
      ],
      [number, `(-${number.text})`],
    ];
    for (const [node, replacement] of mutations) {
      const altered = text.slice(0, node.getStart(ast)) + replacement + text.slice(node.end);
      assert.throws(
        () => verifyFixedAuthoredData(page, { ...files, 'app.js': altered }, source),
        /STATIC_AUTHORED_DATA_CHANGED/,
      );
    }
  });
}
test('development build refuses missing fixed Git history instead of adopting current data', () => {
  const root = mkdtempSync(join(tmpdir(), 'workbench-static-history-'));
  try {
    execFileSync('git', ['init', '--quiet', root]);
    const module = pathToFileURL(resolve('scripts/static-author-provenance.mjs')).href;
    const result = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `const m=await import(${JSON.stringify(module)});m.verifyFixedAuthoredData('category',{},{});`,
      ],
      { cwd: root, encoding: 'utf8' },
    );
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /9b4863692cb29a3edc8a2358e98feb7846526d1b/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
