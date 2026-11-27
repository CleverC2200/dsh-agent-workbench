import ts from 'typescript';
export function enumerateOperationsSurfaces(html) {
  const app = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].at(-1)[1];
  const start = app.indexOf('const D = '),
    end = app.indexOf('\n', start);
  const code = app.slice(end);
  const tree = ts.createSourceFile(
    'original.js',
    code,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  const ctx = (node) => {
    for (let p = node.parent; p; p = p.parent)
      if (ts.isFunctionDeclaration(p)) return p.name?.text ?? 'anonymous';
    return 'global';
  };
  const literal = (node, env = {}) =>
    !node
      ? ''
      : ts.isStringLiteral(node) || ts.isNumericLiteral(node)
        ? node.text
        : ts.isIdentifier(node) && Object.hasOwn(env, node.text)
          ? env[node.text]
          : ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken
            ? literal(node.left, env) + literal(node.right, env)
            : node.getText(tree);
  const property = (node, key) => {
    const p = node.properties?.find((p) => p.name?.getText(tree) === key);
    return p?.initializer ?? (p && ts.isShorthandPropertyAssignment(p) ? p.name : undefined);
  };
  const rateKeys = ['rate95', 'rate90_95', 'rate80_90', 'rate70_80', 'rateBelow70', 'unallocated'];
  const arrays = (node, name) => {
    const out = [];
    for (let p = node.parent; p; p = p.parent) {
      if (ts.isBlock(p) || ts.isSourceFile(p)) {
        for (const statement of p.statements ?? [])
          if (ts.isVariableStatement(statement))
            for (const decl of statement.declarationList.declarations)
              if (
                decl.name.getText(tree) === name &&
                decl.initializer &&
                ts.isArrayLiteralExpression(decl.initializer)
              )
                out.push(decl.initializer);
        if (out.length) return out;
      }
    }
    return out;
  };
  function columns(node, env = {}) {
    if (!node) return [];
    if (ts.isParenthesizedExpression(node)) return columns(node.expression, env);
    if (ts.isArrayLiteralExpression(node)) return node.elements.flatMap((e) => columns(e, env));
    if (ts.isObjectLiteralExpression(node) && property(node, 'k'))
      return [
        {
          key: literal(property(node, 'k'), env),
          label: literal(property(node, 'label'), env),
          binding: property(node, 'fmt')?.getText(tree) ?? '',
        },
      ];
    if (ts.isSpreadElement(node)) return columns(node.expression, env);
    if (ts.isIdentifier(node)) {
      const vars = arrays(node, node.text);
      if (vars.length) return vars.flatMap((n) => columns(n, env));
      let results = [];
      function scan(n) {
        if (
          ts.isBinaryExpression(n) &&
          n.left.getText(tree) === node.text &&
          ts.isArrayLiteralExpression(n.right)
        )
          results.push(...columns(n.right, env));
        ts.forEachChild(n, scan);
      }
      let owner = node.parent;
      while (owner && !ts.isFunctionDeclaration(owner)) owner = owner.parent;
      if (owner) scan(owner);
      return results;
    }
    if (ts.isCallExpression(node)) {
      const call = node.expression.getText(tree);
      if (['qtyCol', 'cntCol', 'skuCol', 'pctCol'].includes(call))
        return [
          {
            key: literal(node.arguments[0], env),
            label:
              literal(node.arguments[1], env) +
              (call === 'qtyCol'
                ? '(万)'
                : call === 'pctCol'
                  ? '(%)'
                  : call === 'skuCol'
                    ? '(个)'
                    : '(张)'),
            binding: node.arguments[2]?.getText(tree) ?? '',
          },
        ];
      if (call === 'rateCols')
        return rateKeys.map((key) => ({
          key,
          label: '满足率区间 ' + key,
          binding: node.arguments[0]?.getText(tree) ?? '',
        }));
      if (call === 'ageCols') {
        const pre = literal(node.arguments[0], env);
        return ['qty', 'orders', 'd3', 'd3_6', 'd6_10', 'd10p'].map((key) => ({
          key,
          label: '账龄 ' + key,
          binding: 'x.' + pre + '.' + key,
        }));
      }
      if (ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'map') {
        const arr = node.expression.expression,
          fn = node.arguments[0];
        if (ts.isIdentifier(arr) && fn && fn.parameters?.[0]) {
          const options = arrays(arr, arr.text).flatMap((a) =>
            a.elements.map((v) => literal(v, env)),
          );
          return options.flatMap((value) =>
            columns(fn.body, { ...env, [fn.parameters[0].name.text]: value }),
          );
        }
      }
    }
    return [];
  }
  const tables = [],
    charts = [],
    cards = [],
    drillMetrics = [];
  function visit(node) {
    if (
      ts.isVariableDeclaration(node) &&
      node.initializer &&
      ts.isArrayLiteralExpression(node.initializer)
    ) {
      const name = node.name.getText(tree),
        context = ctx(node);
      if (context === 'drillSku' && ['kv', 'prod'].includes(name))
        node.initializer.elements.forEach((entry, index) => {
          if (ts.isArrayLiteralExpression(entry))
            drillMetrics.push({
              id: 'drill:' + name + ':' + index,
              kind: 'drillMetric',
              context,
              host: name === 'kv' ? 'sd_kpi' : 'sd_prod',
              title: literal(entry.elements[0]),
              key: entry.elements[1].getText(tree).replace(/^x\./, ''),
              binding: entry.elements[1].getText(tree),
            });
        });
      if (context === 'drillWh' && name === 'vals')
        node.initializer.elements.forEach((entry, index) =>
          drillMetrics.push({
            id: 'drill:warehouse:' + index,
            kind: 'drillMetric',
            context,
            host: 'wd_trend',
            title: index === 10 ? '今日开单' : 'T-' + (10 - index) + '开单',
            key: entry.getText(tree).replace(/^x\.total\./, ''),
            binding: entry.getText(tree),
          }),
        );
    }
    if (ts.isCallExpression(node)) {
      const name = node.expression.getText(tree),
        host = node.arguments[0];
      if (name === 'Table' && ts.isStringLiteral(host)) {
        const config = node.arguments[1];
        tables.push({
          id:
            'table:' +
            ctx(node) +
            ':' +
            host.text +
            ':' +
            (tree.getLineAndCharacterOfPosition(node.pos).line + 1),
          kind: 'table',
          context: ctx(node),
          host: host.text,
          title: literal(property(config, 'title')),
          columns: columns(property(config, 'cols')),
        });
      }
      if (['chart', 'catBar', 'pieChart'].includes(name) && host && ts.isStringLiteral(host))
        charts.push({
          id: 'chart:' + host.text,
          kind: 'chart',
          context: ctx(node),
          host: host.text,
          title: host.text,
        });
    }
    if (
      ts.isVariableDeclaration(node) &&
      ['k', 'kpiCards'].includes(node.name.getText(tree)) &&
      ts.isArrayLiteralExpression(node.initializer) &&
      ['renderKPI', 'renderShortage'].includes(ctx(node))
    )
      for (const [i, card] of node.initializer.elements.entries()) {
        cards.push({
          id: 'card:' + ctx(node) + ':' + i,
          kind: 'card',
          context: ctx(node),
          key: literal(property(card, 'v')),
          title: literal(property(card, 'lbl') ?? property(card, 'l')),
          binding: property(card, 'v')?.getText(tree),
        });
        const foot = property(card, 'foot') ?? property(card, 'f'),
          refs = new Set();
        function scanFoot(n) {
          if (
            ts.isPropertyAccessExpression(n) &&
            !/^(T|M|D\.rate90above|D)\.$/.test(n.getText(tree))
          ) {
            const text = n.getText(tree);
            if (
              /^(T|M)\.[a-zA-Z0-9_]+$|^D\.(correctionPlan|rate90above\.[a-zA-Z0-9_]+)$/.test(text)
            )
              refs.add(text.replace(/^(T|M)\./, '').replace(/^D\./, ''));
          }
          if (ts.isIdentifier(n) && ['orderShould', 'orderGap', 'fullLack'].includes(n.text))
            refs.add(n.text);
          ts.forEachChild(n, scanFoot);
        }
        if (foot) scanFoot(foot);
        for (const key of refs)
          drillMetrics.push({
            id: 'cardFoot:' + ctx(node) + ':' + i + ':' + key,
            kind: 'cardDetail',
            context: ctx(node),
            host: 'kpis',
            key,
            title: literal(property(card, 'lbl') ?? property(card, 'l')) + ' / ' + key,
            binding: foot?.getText(tree),
          });
      }
    ts.forEachChild(node, visit);
  }
  visit(tree);
  return { cards, tables, charts, drillMetrics };
}
