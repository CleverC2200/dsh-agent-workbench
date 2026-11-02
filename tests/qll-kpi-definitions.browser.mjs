import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium, expect } from '@playwright/test';
import { resolve } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { syntheticDomainData, companyGrant } from './fixtures/full-chain-company-wire.mjs';
const calculator = await build({
  entryPoints: ['../dsh-agent-manage/src/inventory-compute/full-chain-workspace-service.ts'],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
});
const { buildFullChainWorkspace } = await import(
  'data:text/javascript;base64,' + Buffer.from(calculator.outputFiles[0].text).toString('base64')
);
const data = syntheticDomainData();
data.branchOutbound = [
  { branch: '上海分仓', sku: 'MOCK-001', category: '饺子', snapshotDate: '2026-09-30', qty: 60 },
];
const request = {
  access: companyGrant,
  scope: 'company',
  filters: { month: '2026-09' },
  now: new Date('2026-10-02T03:00:00Z'),
};
const workspace = buildFullChainWorkspace(data, request);
test('main inventory and turnover use physical stock and actual 30-day movement, retaining missing values', () => {
  assert.equal(workspace.kpis.inventoryLevel.companyCurrent, 5665);
  assert.equal(workspace.layerMetrics.base.turnoverDays, 53);
  assert.equal(workspace.layerMetrics.branch.turnoverDays, 50);
  const missing = structuredClone(data);
  missing.baseInventory[0].externalDemand30d = null;
  missing.branchInventory[0].availableQty = null;
  const result = buildFullChainWorkspace(missing, request);
  assert.equal(result.kpis.inventoryLevel.companyCurrent, 5665);
  assert.equal(result.layerMetrics.base.turnoverDays, null);
  assert.equal(result.layerMetrics.branch.turnoverDays, 50);
  assert.equal(result.structure.find((r) => r.layer === 'branch').availableQty, null);
});
const entry = `import React from 'react'; import {createRoot} from 'react-dom/client'; import {KpiCard} from './business/inventory-qll/source/inventory-light-plugins/src/pages/qll.tsx'; import styles from './business/inventory-qll/source/inventory-light-plugins/src/pages/qll/components/full-chain-workbench.module.css'; import './business/inventory-qll/source/inventory-light-plugins/src/dsh-ui/base.css'; const workspace=${JSON.stringify(workspace)}; createRoot(document.getElementById('root')).render(<div className={styles.shell}><div className={styles.workspacePanels}><div><div className={styles.kpiGrid+' '+styles.compactKpiGrid}>{Object.entries(workspace.kpis).map(([metricKey,metric])=><KpiCard key={metricKey} metricKey={metricKey} metric={metric} workspace={workspace} onOpen={()=>{}}/>)}</div></div></div></div>);`;
const built = await build({
  stdin: { contents: entry, loader: 'tsx', resolveDir: process.cwd() },
  bundle: true,
  write: false,
  outdir: 'out',
  platform: 'browser',
  format: 'iife',
  plugins: [
    {
      name: 'public-manage-source',
      setup(api) {
        api.onResolve({ filter: /^dsh-agent-manage\/inventory-compute\/[a-z-]+$/ }, (x) => ({
          path: resolve(
            '../dsh-agent-manage/src/inventory-compute',
            x.path.split('/').at(-1) + '.ts',
          ),
        }));
      },
    },
  ],
});
const js = built.outputFiles.find((f) => f.path.endsWith('.js')).text;
const css = built.outputFiles.find((f) => f.path.endsWith('.css')).text;
test('five main cards expose keyboard and hover definitions; branch helper uses current stock', async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.route('http://metrics.test/**', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<html><head><style>body{margin:0}${css}</style></head><body><div id="root"></div><script>${js}</script></body></html>`,
    }),
  );
  await page.goto('http://metrics.test/');
  const inventory = page.getByRole('button', { name: /^当前库存/ });
  await expect(inventory).toContainText('5,665件');
  await expect(inventory).toContainText('分仓当前库存100件');
  await expect(inventory).not.toContainText('分仓可用');
  const definitions = [
    '当前库存＝基地库存＋分仓库存合计。',
    '库存周转＝基地／分仓当前库存÷基地／分仓近30日日均动销；基地、分仓分别计算。',
    '当前货龄＝按批次库存加权的平均货龄：Σ(批次库存×批次货龄)÷Σ批次库存。',
    '订单满足率＝当月已发货订单满足率。',
    '当前订单＝基地／分仓当前有效未发货完成订单量（未备单完成订单需求量＋备单完成未发货占用量）。',
  ];
  for (const width of [1280, 560]) {
    await page.setViewportSize({ width, height: 900 });
    for (let i = 0; i < 5; i++) {
      const card = page.getByRole('button').nth(i);
      await card.focus();
      const hint = page.getByRole('tooltip').filter({ hasText: definitions[i] });
      await expect(hint).toBeVisible();
      assert.equal(await card.getAttribute('aria-describedby'), await hint.getAttribute('id'));
      const bounds = await hint.boundingBox();
      assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width);
    }
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await inventory.focus();
  await inventory.hover();
  await expect(page.getByRole('tooltip').filter({ hasText: definitions[0] })).toBeVisible();
  await mkdir('.runtime/qll-kpi-definitions-20261029', { recursive: true });
  await page.screenshot({ path: '.runtime/qll-kpi-definitions-20261029/cards.png' });
});
