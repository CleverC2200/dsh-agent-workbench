export function sourceComments(ts, file, text) {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  if (source.parseDiagnostics.length) {
    const first = source.parseDiagnostics[0];
    throw Error(
      `SOURCE_COMMENTS_PARSE: ${file}: ${ts.flattenDiagnosticMessageText(first.messageText, '\n')}`,
    );
  }
  const ranges = new Map();
  const literals = [];
  const add = (comments) => {
    for (const comment of comments ?? []) ranges.set(comment.pos, comment);
  };
  const visit = (node) => {
    if (
      ts.isStringLiteral(node) ||
      ts.isRegularExpressionLiteral(node) ||
      ts.isTemplateLiteralToken(node) ||
      ts.isJsxText(node)
    )
      literals.push({ pos: ts.isJsxText(node) ? node.pos : node.getStart(source), end: node.end });
    add(ts.getLeadingCommentRanges(text, node.getFullStart()));
    add(ts.getTrailingCommentRanges(text, node.end));
    for (const child of node.getChildren(source)) visit(child);
  };
  visit(source);
  return [...ranges.values()]
    .filter((comment) => !literals.some(({ pos, end }) => pos <= comment.pos && comment.pos < end))
    .sort((a, b) => a.pos - b.pos);
}
