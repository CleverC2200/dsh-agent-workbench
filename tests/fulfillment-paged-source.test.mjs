import test from 'node:test';
import assert from 'node:assert/strict';
import {
  readItemPage,
  fulfillmentCardQueries,
} from '../prototypes/inventory-orderfulfillment/paged-source.mjs';

test('card loading excludes hidden inventory tables; coordination reads just its counted page', async () => {
  assert.ok(!fulfillmentCardQueries.some((id) => id.startsWith('sku.')));
  const calls = [];
  const result = await readItemPage(
    {
      collection: async (id, filters, options) => {
        calls.push({ id, filters, options });
        return {
          rows: [{ base: 'B', sku: 'S' }],
          page: 2,
          size: 20,
          total: 25,
          configVersion: 'v1',
        };
      },
      all() {
        throw Error('hidden supplement read');
      },
    },
    { base: 'B', province: 'P' },
    { page: 2, base: 'B', search: 'x', inventory: false },
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.page, 2);
  assert.equal(calls[0].filters.province, 'P');
  assert.equal(calls[0].filters.list_search, '%x%');
  assert.equal(result.result.total, 25);
  assert.equal(result.result.serverPage, true);
});

test('inventory supplements retain complete validation while restricted to visible keys', async () => {
  const calls = [];
  const page = {
    rows: [{ base: 'B', sku: 'S' }],
    page: 1,
    size: 20,
    total: 41,
    configVersion: 'v1',
  };
  const data = await readItemPage(
    {
      collection: async () => page,
      all: async (id, filters) => {
        calls.push({ id, filters });
        return { rows: [{ base: 'B', sku: 'S' }], total: 1, configVersion: 'v1' };
      },
    },
    { base: 'B', region: 'R' },
  );
  assert.equal(calls.length, 2);
  assert.equal(calls[0].filters.region, 'R');
  assert.equal(calls[0].filters.page_sku_0, 'S');
  assert.equal(calls[0].filters.page_sku_1, null);
  assert.equal(data.ages.status, 'fulfilled');
  assert.equal(data.result.total, 41);
});

test('page denial and cancellation propagate; failed supplement cannot replace a card or deny other columns', async () => {
  await assert.rejects(
    readItemPage(
      {
        collection: async () => {
          throw Error('DENIED');
        },
      },
      {},
    ),
    /DENIED/,
  );
  const controller = new AbortController();
  controller.abort(Error('switched identity'));
  await assert.rejects(
    readItemPage(
      { collection: async () => ({ rows: [], configVersion: 'v1' }) },
      {},
      { signal: controller.signal },
    ),
    /switched identity/,
  );
  const data = await readItemPage(
    {
      collection: async () => ({ rows: [{ base: 'B', sku: 'S' }], configVersion: 'v1' }),
      all: async () => ({ rows: [], configVersion: 'v2' }),
    },
    {},
  );
  assert.equal(data.ages.status, 'rejected');
  assert.equal(data.owners.status, 'rejected');
});
