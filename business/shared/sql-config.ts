/** SQL lives in the installed Agent configuration. No eval or executable config. */
export type AgentSqlConfig = {
  schemaVersion: number;
  agentId: string;
  templates: Record<string, { segments: string[]; source?: string }>;
  queries: Record<string, any>;
  [key: string]: any;
};

const configs = new Map<string, AgentSqlConfig>();
export const isDirectSqlPreview = () =>
  typeof document !== 'undefined' && !!document.getElementById('agent-sql-direct');

/** Select the configured source independently of the execution transport. */
export const usesConfiguredSql = () =>
  isDirectSqlPreview() ||
  (typeof document !== 'undefined' && !!document.getElementById('agent-sql-config'));

/** The Host injects the current adjacent file before the application starts. */
export function agentSqlConfig(fallback: AgentSqlConfig): AgentSqlConfig {
  const previous = configs.get(fallback.agentId);
  if (previous) return previous;
  const element =
    typeof document === 'undefined' ? null : document.getElementById('agent-sql-config');
  const config = element ? JSON.parse(element.textContent || '') : fallback;
  if (
    config.schemaVersion !== 1 ||
    config.agentId !== fallback.agentId ||
    !config.templates ||
    !config.queries ||
    typeof config.templates !== 'object' ||
    typeof config.queries !== 'object'
  )
    throw Error('INVALID_AGENT_SQL_CONFIG');
  configs.set(config.agentId, config);
  return config;
}

/** Fixed SQL fragments retain their original composition; values stay bound separately. */
export function sqlTemplate(
  fallback: AgentSqlConfig,
  id: string,
  fragments: unknown[] = [],
): string {
  const config = agentSqlConfig(fallback);
  const template = Object.hasOwn(config.templates, id) ? config.templates[id] : undefined;
  if (
    !template ||
    !Array.isArray(template.segments) ||
    template.segments.length !== fragments.length + 1 ||
    template.segments.some((part) => typeof part !== 'string')
  )
    throw Error('SQL_TEMPLATE_NOT_CONFIGURED: ' + id);
  return template.segments
    .map((part, index) => part + (index < fragments.length ? String(fragments[index]) : ''))
    .join('');
}
