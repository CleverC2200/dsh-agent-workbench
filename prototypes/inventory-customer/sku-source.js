import dealerConfig from '../../business/inventory-dealer/sql.config.json' with { type: 'json' };
import { readConfiguredFacts } from '../../business/shared/configured-facts.ts';
import { originalDealerView } from '../../business/shared/original-business-views.ts';
import { bindGovernedSql } from '../../business/shared/governed-parameters.ts';
import {
  configuredQueryIdentity,
  configuredQueryFreshAfter,
} from '../../business/shared/query-cache.ts';
import { inventoryCacheTtl } from '../../business/shared/inventory-cache-policy.ts';

const reads = new WeakMap();
const executeSkuPage = async (request, options) => {
  const [{ call }, { readSignal }, { sqlQueryError }] = await Promise.all([
    import('../../business/shared/channel.js'),
    import('../../business/shared/sql-reader.ts'),
    import('../../business/shared/query-error.js'),
  ]);
  const signal = options.signal ? AbortSignal.any([options.signal, readSignal()]) : readSignal();
  signal.throwIfAborted();
  try {
    const result = await call(
      'sql',
      {
        sql: request.sql,
        parameters: request.parameters,
        pageNo: 1,
        pageSize: 200,
        cacheFreshAfter: configuredQueryFreshAfter(),
      },
      { signal },
    );
    signal.throwIfAborted();
    return result;
  } catch (error) {
    if (signal.aborted) throw error;
    throw sqlQueryError(error);
  }
};
function currentReads(inventory, execute) {
  let executors = reads.get(inventory);
  if (!executors) reads.set(inventory, (executors = new WeakMap()));
  const identity = JSON.stringify([
    configuredQueryIdentity(),
    configuredQueryFreshAfter(),
    inventory.snapshot,
  ]);
  let cache = executors.get(execute);
  if (!cache || cache.identity !== identity || Date.now() >= cache.expires) {
    cache = {
      identity,
      expires: Date.now() + inventoryCacheTtl('inventory-customer'),
      pages: new Map(),
      snapshots: new Map(),
    };
    executors.set(execute, cache);
  }
  return cache;
}
function retain(map, key, value) {
  map.delete(key);
  map.set(key, value);
  while (map.size > 6) map.delete(map.keys().next().value);
}

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
  const scopeCodes = input.customer ? [input.customer] : [...codes].sort();
  const scope = bindGovernedSql('t.cust_code IN (:list_1)', [scopeCodes]);
  const run = execute ?? executeSkuPage;
  const cache = currentReads(inventory, run);
  const scopeKey = JSON.stringify(scopeCodes);
  const key = JSON.stringify([
    scopeCodes,
    input.customer,
    input.page,
    Object.entries(input.filters ?? {}).sort(([a], [b]) => a.localeCompare(b)),
  ]);
  if (cache.pages.has(key)) return structuredClone(cache.pages.get(key));
  const snapshotReads = new Map(cache.snapshots.get(scopeKey));
  let result;
  try {
    result = await readConfiguredFacts(
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
        snapshotReads,

        execute(request, options) {
          if (!request.sql.includes('WHERE t.stat_date'))
            throw Error('CUSTOMER_SKU_SCOPE_QUERY_CHANGED');
          return run(
            {
              ...request,
              sql: request.sql.replaceAll(
                'WHERE t.stat_date',
                `WHERE ${scope.sql} AND t.stat_date`,
              ),
              parameters: { ...request.parameters, ...scope.parameters },
            },
            options,
          );
        },
      },
    );
  } catch (error) {
    snapshotReads.clear();
    throw error;
  }
  signal?.throwIfAborted();
  if (result.rows.some((row) => !scopeCodes.includes(row.customer)))
    throw Error('CUSTOMER_SKU_SCOPE_INVALID');
  if (currentReads(inventory, run) === cache && Date.now() < cache.expires) {
    retain(cache.snapshots, scopeKey, snapshotReads);
    retain(cache.pages, key, structuredClone(result));
  }
  return result;
}
