import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Build frontend-owned assets for an existing same-origin, authorized sales window. Never deploys them. */
export async function buildFulfillmentSalesWindow({ output } = {}) {
  const root = resolve(import.meta.dirname, '..');
  const source = resolve(root, 'prototypes/inventory-orderfulfillment');
  const out = output ?? resolve(root, 'lib/business/inventory-orderfulfillment/sales-window');
  const read = (path) => readFile(resolve(source, path), 'utf8');
  const html = (await read('sales-window/window.html')).replace(
    '<script defer src="../assets/order-editor"></script>',
    '',
  );
  const script =
    (await read('sales-window/order-editor.js')) + '\n' + (await read('sales-window/window.js'));
  const card = await read('sales-confirmation-card.mjs');
  await mkdir(out, { recursive: true });
  const assets = { 'window.html': html, 'window.js': script, 'card.mjs': card };
  const sha256 = (text) => createHash('sha256').update(text).digest('hex');
  for (const [name, content] of Object.entries(assets))
    await writeFile(resolve(out, name), content);
  const manifest = {
    owner: 'dsh-agent-workbench',
    consumerCode: 'order01',
    dataMode: 'EXISTING_AUTHORIZED_SALES_WINDOW',
    backendResourcePaths: {
      'window.html': 'order-confirmation/window.html',
      'window.js': 'order-confirmation/window.js',
    },
    assets: Object.fromEntries(
      Object.entries(assets).map(([name, content]) => [name, sha256(content)]),
    ),
    orderEditing: 'DRAFT_ONLY_UNTIL_REAL_ORDER_API_CONNECTED',
    deployed: false,
  };
  await writeFile(resolve(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  return { output: out, ...manifest };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  console.log(JSON.stringify(await buildFulfillmentSalesWindow()));
