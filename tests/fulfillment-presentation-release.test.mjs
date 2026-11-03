import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { buildFulfillmentSalesWindow } from '../scripts/build-fulfillment-sales-window.mjs';
import { publishFulfillmentSalesWindow } from '../scripts/publish-fulfillment-sales-window.mjs';

test('atomic order presentation publication retains previous assets and rejects corrupt updates', async () => {
  const root = await mkdtemp(join(tmpdir(), 'order-presentation-'));
  try {
    const bundle = join(root, 'bundle'),
      directory = join(root, 'server');
    await buildFulfillmentSalesWindow({ output: bundle });
    const first = await publishFulfillmentSalesWindow({ bundle, directory });
    assert.equal(first.backendRestartRequired, false);
    const firstHtml = await readFile(
      join(directory, 'releases', first.release, 'window.html'),
      'utf8',
    );
    assert.match(firstHtml, /__ORDER_PRESENTATION_RELEASE__/);
    await writeFile(join(bundle, 'window.html'), firstHtml.replace('订单销售确认', '订单测试窗口'));
    await assert.rejects(publishFulfillmentSalesWindow({ bundle, directory }), /hash mismatch/);
    assert.equal(
      JSON.parse(await readFile(join(directory, 'active.json'), 'utf8')).release,
      first.release,
    );
    const manifest = JSON.parse(await readFile(join(bundle, 'manifest.json'), 'utf8'));
    manifest.assets['window.html'] = createHash('sha256')
      .update(await readFile(join(bundle, 'window.html')))
      .digest('hex');
    await writeFile(join(bundle, 'manifest.json'), JSON.stringify(manifest));
    const second = await publishFulfillmentSalesWindow({ bundle, directory });
    assert.notEqual(second.release, first.release);
    assert.equal(
      await readFile(join(directory, 'releases', first.release, 'window.html'), 'utf8'),
      firstHtml,
    );
    assert.match(
      await readFile(join(directory, 'releases', second.release, 'window.html'), 'utf8'),
      /订单测试窗口/,
    );
    assert.equal(
      JSON.parse(await readFile(join(directory, 'active.json'), 'utf8')).release,
      second.release,
    );
    manifest.assets['../../other'] = 'bad';
    await writeFile(join(bundle, 'manifest.json'), JSON.stringify(manifest));
    await assert.rejects(
      publishFulfillmentSalesWindow({ bundle, directory }),
      /Invalid order presentation manifest/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('checkout preserves manifest-verified order presentation bytes', async () => {
  const attributes = await readFile(new URL('../.gitattributes', import.meta.url), 'utf8');
  assert.match(
    attributes,
    /^lib\/business\/inventory-orderfulfillment\/sales-window\/\* text eol=lf$/m,
  );
  const root = await mkdtemp(join(tmpdir(), 'order-presentation-bytes-'));
  try {
    const manifest = await buildFulfillmentSalesWindow({ output: root });
    for (const name of Object.keys(manifest.assets))
      assert.equal((await readFile(join(root, name), 'utf8')).includes('\r'), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
