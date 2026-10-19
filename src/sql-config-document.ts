/** Insert data before author scripts; escaping prevents config text becoming HTML. */
export function injectSqlConfig(html: string, config: unknown): string {
  const value = config as Record<string, unknown>;
  if (
    !value ||
    value.schemaVersion !== 1 ||
    typeof value.agentId !== 'string' ||
    !value.templates ||
    !value.queries
  )
    throw Error('INVALID_AGENT_SQL_CONFIG');
  const json = JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
  const script = `<script type="application/json" id="agent-sql-config">${json}</script>`;
  const head = /<head\b[^>]*>/i.exec(html);
  if (head)
    return (
      html.slice(0, head.index + head[0].length) + script + html.slice(head.index + head[0].length)
    );
  const first = /<script\b/i.exec(html);
  if (first) return html.slice(0, first.index) + script + html.slice(first.index);
  return html + script;
}
