import { addWorkbenchQueries } from './queries.mjs';
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
  return addWorkbenchQueries({
    schemaVersion: source.schemaVersion,
    agentId: 'inventory-orderworkbench',
    label: '订单工作台',
    source: source.source,
    templates: {},
    queries: Object.fromEntries([...ids].map((id) => [id, source.queries[id]])),
    workspaceBindings: bindings,
    workspaceSummaryBindings: bindings,
  });
}
