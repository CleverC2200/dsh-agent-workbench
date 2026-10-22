import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import ts from 'typescript';

// Preserve the accepted pre-format data identity; this reference never follows HEAD.
const ref = '9b4863692cb29a3edc8a2358e98feb7846526d1b';
const hash = (value) => createHash('sha256').update(value).digest('hex');
const retiredMpsStudio = new Set([
  'TV',
  'MV',
  'RV',
  '$V',
  'DV',
  'T1',
  'M1',
  'AV',
  'zV',
  'LV',
  'Gd',
  'fu',
  'Yd',
  'fH',
]);
function initializer(file, text, name, alias, retired = false) {
  const ast = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  if (ast.parseDiagnostics.length) throw Error(`STATIC_AUTHORED_DATA_CHANGED: invalid ${file}`);
  const found = ast.statements
    .filter(ts.isVariableStatement)
    .flatMap((statement) => [...statement.declarationList.declarations])
    .filter(
      (value) => value.name.getText(ast) === name || (alias && value.name.getText(ast) === alias),
    );
  if (!found.length && retired) return null;
  if (found.length !== 1 || !found[0].initializer)
    throw Error(`STATIC_AUTHORED_DATA_CHANGED: missing or ambiguous ${name}`);
  return { node: found[0].initializer, text: found[0].initializer.getText(ast) };
}
function valueAST(node) {
  if (ts.isParenthesizedExpression(node)) return valueAST(node.expression);
  if (
    node.parent?.name === node &&
    (ts.isIdentifier(node) || ts.isStringLiteral(node) || ts.isNumericLiteral(node))
  )
    return { key: node.text };
  const children = [];
  ts.forEachChild(node, (child) => {
    children.push(valueAST(child));
  });
  const result = { kind: node.kind, children };
  if (node.operator !== undefined) result.operator = node.operator;
  if (ts.isIdentifier(node)) result.name = node.text;
  if (ts.isLiteralExpression(node) || ts.isTemplateLiteralToken(node)) result.literal = node.text;
  return result;
}

/** Verify original bytes against frozen metadata, then current data semantics without evaluating it. */
export function verifyFixedAuthoredData(page, files, source) {
  if (!['category', 'mps'].includes(page)) throw Error('STATIC_AUTHORED_PROVENANCE_CHANGED: page');
  const originalSource = JSON.parse(
    execFileSync('git', ['show', `${ref}:static/${page}/source/SOURCE.json`], { encoding: 'utf8' }),
  );
  if (JSON.stringify(source.fixedAuthoredData) !== JSON.stringify(originalSource.fixedAuthoredData))
    throw Error(`STATIC_AUTHORED_PROVENANCE_CHANGED: ${page}`);
  const originals = new Map();
  for (const [name, expected] of Object.entries(originalSource.fixedAuthoredData)) {
    if (!['data.js', 'app.js'].includes(expected.file))
      throw Error(`STATIC_AUTHORED_PROVENANCE_CHANGED: ${expected.file}`);
    if (!originals.has(expected.file))
      originals.set(
        expected.file,
        execFileSync('git', ['show', `${ref}:static/${page}/source/${expected.file}`], {
          encoding: 'utf8',
        }),
      );
    const original = initializer(expected.file, originals.get(expected.file), name);
    if (hash(original.text) !== expected.sha256)
      throw Error(`STATIC_AUTHORED_PROVENANCE_CHANGED: ${page}/${name}`);
    const alias = page === 'category' && name === 'w8' ? '_w8' : undefined;
    const current = initializer(
      expected.file,
      files[expected.file],
      name,
      alias,
      page === 'mps' && retiredMpsStudio.has(name),
    );
    if (!current) continue;
    if (JSON.stringify(valueAST(current.node)) !== JSON.stringify(valueAST(original.node)))
      throw Error(`STATIC_AUTHORED_DATA_CHANGED: ${page}/${name}`);
  }
}
