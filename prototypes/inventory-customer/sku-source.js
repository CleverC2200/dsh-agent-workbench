import dealerConfig from '../../business/inventory-dealer/sql.config.json' with { type: 'json' };
import { readConfiguredFacts } from '../../business/shared/configured-facts.ts';
import { originalDealerView } from '../../business/shared/original-business-views.ts';
import { bindGovernedSql } from '../../business/shared/governed-parameters.ts';

// Both pages consume the dealer contract so fields, units and missing-data reasons stay aligned.
export const customerSkuView = dealerConfig.sourceViews.views.find(
  (view) => view.id === 'sku-stock',
);
export const customerSkuPresentation = originalDealerView(dealerConfig, 'sku-stock');
const queryIds = [
  customerSkuView.snapshotQuery,
  customerSkuView.queryId,
  dealerConfig.queries[customerSkuView.queryId].pagination.countQuery,
  dealerConfig.queries[customerSkuView.queryId].pagination.atomicQuery,
];
const config = {
  schemaVersion: 1,
  agentId: dealerConfig.agentId,
  templates: {},
  queries: Object.fromEntries(queryIds.map((id) => [id, dealerConfig.queries[id]])),
  sourceViews: { views: [customerSkuView] },
};

export async function readCustomerSkus(inventory, codes, input, { signal, execute } = {}) {
  signal?.throwIfAborted();
  const allowed = new Set(inventory.rows.map((row) => row.code));
  if (
    (input.customer && !codes.includes(input.customer)) ||
    codes.some((code) => !allowed.has(code))
  )
    throw Error('CUSTOMER_SKU_SCOPE_INVALID');
  if (!codes.length) return { rows: [], total: 0, page: input.page, pageSize: 10, status: 'empty' };
  if (!inventory.snapshot) throw Error('CUSTOMER_SKU_SNAPSHOT_UNAVAILABLE');
  const scopeCodes = input.customer ? [input.customer] : codes;
  const scope = bindGovernedSql('t.cust_code IN (:list_1)', [scopeCodes]);
  const run =
    execute ??
    (async (request, options) => {
      const { executeGeaSqlPage } = await import('../../business/shared/sql-reader.ts');
      return executeGeaSqlPage(request.sql, 1, 200, {
        parameters: request.parameters,
        signal: options.signal,
      });
    });
  const result = await readConfiguredFacts(
    config,
    'sku-stock',
    {
      asOf: inventory.snapshot,
      customer: input.customer,
      page: input.page,
      pageSize: 10,
      filters: input.filters,
    },
    {
      signal,
      detailsOnly: true,
      // Execute in this page's existing Consumer and lifetime; no dealer identity or grant is borrowed.
      execute(request, options) {
        // Atomic pages repeat the stock query for count and detail; scope every copy before paging.
        if (!request.sql.includes('WHERE t.stat_date'))
          throw Error('CUSTOMER_SKU_SCOPE_QUERY_CHANGED');
        return run(
          {
            ...request,
            sql: request.sql.replaceAll('WHERE t.stat_date', `WHERE ${scope.sql} AND t.stat_date`),
            parameters: { ...request.parameters, ...scope.parameters },
          },
          options,
        );
      },
    },
  );
  if (result.rows.some((row) => !scopeCodes.includes(row.customer)))
    throw Error('CUSTOMER_SKU_SCOPE_INVALID');
  return result;
}
