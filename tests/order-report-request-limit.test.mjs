import test from 'node:test';
import assert from 'node:assert/strict';
import { assertPageRequestSize } from '../src/order-report-request-limit.ts';
const request = {
  operation: 'workspace',
  owner: 'owned',
  parameters: { operation: 'save', report: { encoding: 'gzip-base64', data: 'A'.repeat(600000) } },
};
const owner = () => ({ page: { id: 'inventory-orderworkbench' }, grant: { workspace: () => {} } });
test('complete compressed reports fit the existing Host envelope budget', () => {
  assert.doesNotThrow(() => assertPageRequestSize(request, owner));
  assert.doesNotThrow(() =>
    assertPageRequestSize(
      {
        ...request,
        parameters: {
          ...request.parameters,
          report: { encoding: 'gzip-base64', data: 'A'.repeat(4000000) },
        },
      },
      owner,
    ),
  );
});
test('ordinary, malformed and oversized requests retain their limits', () => {
  for (const input of [
    { ...request, operation: 'context' },
    { ...request, parameters: { ...request.parameters, operation: 'load' } },
    { ...request, parameters: { operation: 'save', report: { data: 'A'.repeat(600000) } } },
    {
      ...request,
      parameters: {
        operation: 'save',
        report: { encoding: 'gzip-base64', data: '!'.repeat(600000) },
      },
    },
    {
      ...request,
      parameters: {
        operation: 'save',
        report: { encoding: 'gzip-base64', data: 'A'.repeat(4000004) },
      },
    },
    { ...request, extra: 'x'.repeat(5000) },
  ])
    assert.throws(() => assertPageRequestSize(input, owner), /REQUEST_TOO_LARGE/);
  assert.doesNotThrow(() =>
    assertPageRequestSize({ operation: 'context', parameters: { text: 'small' } }, () => {
      throw Error('not needed');
    }),
  );
});
test('page identity and writer presence come from the current owner, never caller fields', () => {
  assert.throws(
    () =>
      assertPageRequestSize({ ...request, pageId: 'inventory-orderworkbench' }, () => ({
        page: { id: 'other' },
        grant: { workspace: () => {} },
      })),
    /REQUEST_TOO_LARGE/,
  );
  assert.throws(
    () =>
      assertPageRequestSize(request, () => ({
        page: { id: 'inventory-orderworkbench' },
        grant: {},
      })),
    /REQUEST_TOO_LARGE/,
  );
  assert.throws(
    () =>
      assertPageRequestSize(request, () => {
        throw Error('PAGE_IDENTITY_CHANGED');
      }),
    /PAGE_IDENTITY_CHANGED/,
  );
});
