// Replaced only by an explicitly registered, governed policy query at assembly.
// Missing policy data must never silently become a fixed calendar or next-month plan.
export const missingPlanPolicySql =
  'SELECT NULL AS initial_day,NULL AS corrected_day,NULL AS rolling_day';

// series_sort holds the maintained day; belong_to (777/888/999) is a node code.
// Require exactly one record per node, including when duplicate values agree.
export const publishedPlanPolicyQuery = {
  resultColumns: ['initial_day', 'corrected_day', 'rolling_day'],
  request: {
    sql: `SELECT
      CASE WHEN SUM(CASE WHEN series='<=初版' THEN 1 ELSE 0 END)=1
        THEN MAX(CASE WHEN series='<=初版' THEN series_sort END) END AS initial_day,
      CASE WHEN SUM(CASE WHEN series='<=纠偏' THEN 1 ELSE 0 END)=1
        THEN MAX(CASE WHEN series='<=纠偏' THEN series_sort END) END AS corrected_day,
      CASE WHEN SUM(CASE WHEN series='<=滚动' THEN 1 ELSE 0 END)=1
        THEN MAX(CASE WHEN series='<=滚动' THEN series_sort END) END AS rolling_day
      FROM agents_dim_mark_xilie_d WHERE product_item='节点'`,
  },
};

export function selectedPlanSql(initial, corrected, rolling, next) {
  const fields = ['initial_day', 'corrected_day', 'rolling_day'];
  const valid = fields
    .map(
      (field) =>
        `plan_policy.${field} BETWEEN 1 AND 31 AND plan_policy.${field}=CAST(plan_policy.${field} AS INTEGER)`,
    )
    .concat([
      'plan_policy.initial_day<plan_policy.corrected_day',
      'plan_policy.corrected_day<plan_policy.rolling_day',
    ])
    .join(' AND ');
  const day = 'CAST(SUBSTRING(CAST(the_date AS CHAR),9,2) AS INTEGER)';
  return `CASE WHEN ${valid} THEN CASE WHEN ${day}<=plan_policy.initial_day THEN ${initial}
    WHEN ${day}<=plan_policy.corrected_day THEN ${corrected}
    WHEN ${day}<=plan_policy.rolling_day THEN ${rolling} ELSE ${next} END END`;
}

export function bindPlanPolicy(config, source) {
  const queryId = source.planVersionPolicy?.queryId;
  const query = queryId && source.queries?.[queryId];
  if (!query) {
    config.planVersionPolicy = { status: 'SOURCE_NOT_AVAILABLE', queryId: queryId ?? null };
    return config;
  }
  const columns = ['initial_day', 'corrected_day', 'rolling_day'];
  if (
    !columns.every((column) => query.resultColumns?.includes(column)) ||
    !/^\s*SELECT\b/i.test(query.request?.sql ?? '') ||
    Object.keys(query.parameterSpec ?? {}).length ||
    /;|:gea_p\d+\b/.test(query.request.sql)
  )
    throw Error('PLAN_POLICY_QUERY_CONTRACT_INVALID');
  const policy = `SELECT ${columns.map((column) => `CASE WHEN COUNT(*)=1 THEN MAX(${column}) END AS ${column}`).join(',')}
    FROM (${query.request.sql}) policy_records`;
  for (const [id, definition] of Object.entries(config.queries)) {
    if (!definition.request?.sql.includes(missingPlanPolicySql)) continue;
    config.queries[id] = {
      ...definition,
      request: {
        ...definition.request,
        sql: definition.request.sql.replaceAll(missingPlanPolicySql, policy),
      },
    };
  }
  config.planVersionPolicy = { status: 'configured', queryId };
  return config;
}
