import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const b = await build({
  entryPoints: ['src/html-dms-navigation.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
});
const { openBranchDms } = await import(
  'data:text/javascript;base64,' + Buffer.from(b.outputFiles[0].text).toString('base64')
);
const redirect =
  'https://dms.example.test/sndms/user/loginSSO?token=fixture-only&menu=/corder/ordermgt';
test('only validated Host redirect opens outside the iframe; no token returned to HTML', async () => {
  let opened;
  const result = await openBranchDms(
    'inventory-fc',
    {},
    async () => ({ redirect }),
    () => true,
    (u) => (opened = u),
  );
  assert.equal(opened, redirect);
  assert.deepEqual(result, { requested: true });
});
test('other pages and page-provided destinations cannot initiate navigation', async () => {
  let calls = 0;
  const login = async () => {
    calls++;
    return { redirect };
  };
  for (const [page, p] of [
    ['inventory-aqkc', {}],
    ['inventory-fc', { url: redirect }],
    ['inventory-fc', null],
  ])
    await assert.rejects(() =>
      openBranchDms(
        page,
        p,
        login,
        () => true,
        () => assert.fail(),
      ),
    );
  assert.equal(calls, 0);
});
test('identity release, bad menu and invalid protocol do not open a destination', async () => {
  for (const [url, alive] of [
    [redirect, false],
    ['javascript:alert(1)', true],
    [redirect.replace('/corder/ordermgt', '/bad'), true],
  ])
    await assert.rejects(() =>
      openBranchDms(
        'inventory-fc',
        {},
        async () => ({ redirect: url }),
        () => alive,
        () => assert.fail(),
      ),
    );
});
test('SSO failure has no submission or navigation side effect', async () => {
  await assert.rejects(
    () =>
      openBranchDms(
        'inventory-fc',
        {},
        async () => {
          throw Error('SSO failed');
        },
        () => true,
        () => assert.fail(),
      ),
    /SSO failed/,
  );
});
