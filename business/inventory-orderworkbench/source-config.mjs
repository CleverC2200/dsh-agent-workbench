import { addWorkbenchSummaryQueries } from './summary-queries.mjs';
import { addWorkbenchQueries } from './queries.mjs';
import { bindPlanPolicy, publishedPlanPolicyQuery } from './plan-policy.mjs';
export function orderWorkbenchSourceConfig(source) {
  const names = ['orders', 'orders-month', 'shippable'];
  const bindings = Object.fromEntries(
    names.map((name) => [name, source.workspaceSummaryBindings[name]]),
  );
  const ids = new Set(['source.stock-date']);
  for (const binding of Object.values(bindings)) {
    ids.add(binding.queryId);
    ids.add(source.queries[binding.queryId].pagination.countQuery);
  }
  const policySource = source.planVersionPolicy
    ? source
    : {
        ...source,
        planVersionPolicy: { queryId: 'workbench.plan-policy' },
        queries: { ...source.queries, 'workbench.plan-policy': publishedPlanPolicyQuery },
      };
  return bindPlanPolicy(
    addWorkbenchSummaryQueries(
      addWorkbenchQueries({
        schemaVersion: source.schemaVersion,
        agentId: 'inventory-orderworkbench',
        label: '订单工作台',
        source: source.source,
        templates: {},
        queries: Object.fromEntries([...ids].map((id) => [id, source.queries[id]])),
        workspaceBindings: bindings,
        workspaceSummaryBindings: bindings,
      }),
    ),
    policySource,
  );
}
