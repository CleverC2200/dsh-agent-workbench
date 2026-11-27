import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { delimiter, resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { build } from 'esbuild';
import { chromium, expect } from '@playwright/test';
import { prepareFulfillmentPresentation } from '../prototypes/inventory-orderfulfillment/prepare-presentation.mjs';
import { deliveryOperationsPlugin } from '../prototypes/inventory-orderfulfillment/delivery-operations-build.mjs';
import {
  addOperationsQueries,
  operationsDatasets,
  operationsPacketDatasets,
  operationsPacketColumns,
} from '../business/inventory-orderfulfillment/operations-queries.mjs';
import { maxHtmlBytes } from '../src/html-document.ts';
import { operationPackets } from './helpers/operations-packets.mjs';
import { auditCompleteOperationsUi } from './helpers/operations-complete-ui-audit.mjs';
import { auditOperationsTables } from './helpers/operations-table-audit.mjs';

test('delivery operations retains original layout while binding authorized data and clearing identity changes', async (t) => {
  const root = 'prototypes/inventory-orderfulfillment/';
  const original = await readFile(root + 'delivery-operations.html');
  let loadDocument;
  deliveryOperationsPlugin().setup({
    onLoad(_options, handler) {
      loadDocument = handler;
    },
  });
  const generated = await loadDocument({ path: resolve(root + 'delivery-operations.html') });
  const restored = gunzipSync(
    Buffer.from(JSON.parse(generated.contents.slice('export default '.length, -1)), 'base64'),
  ).toString('utf8');
  const withoutScripts = (text) => text.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  assert.equal(
    withoutScripts(
      restored.replace(/<style id="delivery-operations-(?:layout|table)-fix">[^<]*<\/style>/g, ''),
    ),
    withoutScripts(original.toString('utf8')),
    'original markup and styles must remain byte-for-byte unchanged',
  );

  const provenance = JSON.parse(await readFile(root + 'delivery-operations-source.json', 'utf8'));
  assert.equal(
    createHash('sha256').update(original).digest('hex'),
    provenance.files['delivery-operations.html'],
  );
  const config = addOperationsQueries(
    JSON.parse(await readFile('business/inventory-orderfulfillment/sql.config.json', 'utf8')),
  );
  const bundle = await build({
    entryPoints: [root + 'live-entry.js'],
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
    target: 'es2022',
    plugins: [deliveryOperationsPlugin()],
    nodePaths: (process.env.WORKBENCH_BROWSER_NODE_PATH ?? '').split(delimiter).filter(Boolean),
  });
  const styles = await Promise.all(
    ['theme/tokens.css', root + 'theme.css'].map((file) => readFile(file, 'utf8')),
  );
  const html = prepareFulfillmentPresentation(await readFile(root + 'presentation.html', 'utf8'))
    .replace(
      '</head>',
      () =>
        `<style>${styles.join('\n')}</style><script id="agent-sql-config" type="application/json">${JSON.stringify(config).replaceAll('<', '\\u003c')}</script></head>`,
    )
    .replace(
      '</body>',
      () =>
        `<script>${bundle.outputFiles[0].text.replace(/<\/script/gi, '<\\/script')}</script></body>`,
    );
  assert.ok(Buffer.byteLength(html) < maxHtmlBytes);
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.DSH_BROWSER_CHANNEL ? { channel: process.env.DSH_BROWSER_CHANNEL } : {}),
  });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1600, height: 1050 } });
  await page.clock.setFixedTime(
    new Date((process.env.OPERATIONS_AUDIT_DATE ?? '2026-11-25') + 'T08:00:00Z'),
  );
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('https://fulfillment.test/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: html }),
  );
  await page.goto('https://fulfillment.test/');
  const operations = page.getByRole('tab', { name: '交付运营', exact: true });
  const frameElement = page.locator('#deliveryOperationsFrame');
  assert.equal(await frameElement.getAttribute('srcdoc'), null);
  await operations.click();
  const frame = page.frameLocator('#deliveryOperationsFrame');
  await expect(frame.locator('#mCheck')).toContainText('等待');
  await expect(frame.locator('body')).not.toContainText('830.7万');
  await expect(frame.locator('body')).not.toContainText('7/7 项合计对平');
  const records = {
    'warehouse.stock': [
      {
        base: '华南',
        warehouse_code: 'W1',
        warehouse: '郑州仓',
        stock_date: '20261124',
        stock_qty: 88000,
        source_rows: 2,
      },
    ],
    'plan.base': [
      {
        base: '郑州',
        source_rows: 2,
        initial_plan: 100,
        adjusted_plan: 80,
        ordered: null,
        ordered_known: 60,
        shipped: 40,
        ordered_coverage: 1,
      },
    ],
    'plan.region': [
      {
        region: '华中',
        province: '河南',
        sales_group: '河南一组',
        source_rows: 2,
        initial_plan: 100,
        adjusted_plan: 80,
        ordered: 60,
        shipped: 40,
        ordered_coverage: 2,
      },
    ],
    'plan.item': [
      {
        item: '水饺',
        material_group: '冷鲜肉',
        source_rows: 2,
        initial_plan: 100,
        adjusted_plan: 80,
        ordered: 60,
        shipped: 40,
        ordered_coverage: 2,
      },
    ],
    'plan.sku': [
      {
        base: '郑州',
        sku: '=SUM(1,1)',
        material_name: '=PRIVATE-SKU',
        source_rows: 1,
        initial_plan: 100,
        adjusted_plan: 80,
        ordered: 60,
        shipped: 40,
        ordered_coverage: 1,
      },
    ],
    'orders.facts': [
      {
        executeorderno: 'E1',
        executeorderlineno: '1',
        cust_order_no: 'O1',
        cust_code: 'C1',
        material_code: 'S1',
        belong_base: '郑州',
        fromorderno: 'SOURCE1',
        fromorderlineno: '1',
        detailstatus: 10,
        is_stat: '1',
        prapare_order_status: '备单中',
        packingunitmain: 'CS',
        packingunitconvertrate: 10,
        order_qty: 10,
        adjust_order_qty: 10,
        pack_unitqty: 2,
        qtyallocated: 20,
        qtyshipped: 0,
        delivery_qty: 0,
        header_addtime: '2026-11-24 12:00:00',
        product_item: '水饺',
        cust_name: '客户A',
        cust_type: 'jxs',
        region_name: '华中',
        province_region_name: '河南',
        sales_group_name: '河南一组',
        pickup_point_name: '郑州',
        warehouseid: 'W1',
        warehouse_name: '郑州仓',
        timeout_code: '2',
        timeout_name: '缺货',
        director: '负责人',
      },
    ],
    'orders.stage': [
      { base: '郑州', stage: '备单中', orders: 12, latest_load: '2026-11-25 15:00:00' },
    ],
    'orders.age': [
      {
        created_at: '2026-11-24 12:00:00',
        need_billing_at: null,
        orders: 12,
        overdue_orders: 3,
        unknown_deadlines: 2,
        latest_load: '2026-11-25 15:00:00',
      },
    ],
    'orders.reason': [{ reason: '17', execution_orders: 3, latest_update: '2026-11-25 14:00:00' }],
    'orders.pending': Array.from({ length: 61 }, (_, i) => ({
      cust_order_no: 'PENDING-' + (i + 1),
      base: '郑州',
      stage: '备单中',
      created_at: '2026-11-24 12:00:00',
      need_billing_at: null,
      latest_load: '2026-11-25 15:00:00',
    })),
    'stock.item': [
      {
        base: '郑州',
        item: '水饺',
        stock_date: '2026-11-24',
        source_rows: 2,
        current_stock: 200,
        available_stock: null,
        pending_order_qty: 30,
        production_plan: 50,
        production_in: 20,
        duplicate_skus: 0,
      },
    ],
    'shortage.sku': [
      {
        base: '郑州',
        sku: 'S2',
        item: '水饺',
        material_name: '可确认缺货SKU',
        execution_sku_groups: 1,
        covered_groups: 1,
        inventory_gap: 7,
        final_gap: 3,
        duplicate_groups: 0,
      },
      {
        base: '郑州',
        sku: 'S1',
        item: '水饺',
        material_name: '缺货SKU',
        execution_sku_groups: 2,
        covered_groups: 0,
        inventory_gap: 20,
        final_gap: null,
        duplicate_groups: 1,
      },
    ],
    'production.future': [
      {
        factory: '郑州',
        sku: 'S1',
        material_name: 'SKU1',
        day: '20261126',
        unit: 'KG',
        source: '工厂',
        planned_qty: 10,
        delivered_qty: 0,
        latest_load: '2026-11-25 15:00:00',
      },
      {
        factory: '郑州',
        sku: 'S2',
        material_name: 'SKU2',
        day: '20261126',
        unit: 'ST',
        source: '工厂',
        planned_qty: 20,
        delivered_qty: null,
        latest_load: '2026-11-25 15:00:00',
      },
    ],
    'warehouse.stage': [
      {
        base: '郑州',
        warehouse: '郑州仓',
        pickup: '郑州提货点',
        stage: '已派未到',
        orders: 4,
        latest_load: '2026-11-25 15:00:00',
      },
    ],
  };
  const fullAudit = process.env.OPERATIONS_FULL_AUDIT_CACHE;
  if (fullAudit) Object.assign(records, JSON.parse(await readFile(fullAudit, 'utf8')));
  if (!fullAudit) {
    records['plan.sku'].push({
      ...records['plan.sku'][0],
      sku: 'MASTER-SKU',
      material_name: '主数据补全商品',
    });
    records['product.master.attributes'] = [
      { sku: 'MASTER-SKU', item: '水饺', series: '主数据系列' },
    ];
    records['plan.sku'].push({
      ...records['plan.sku'][0],
      sku: 'DICTIONARY-SKU',
      material_name: '字典补全商品',
    });
    records['product.attributes'] = [
      { sku: 'DICTIONARY-SKU', item: '水饺', series: '字典系列', snapshot_date: '2026-11-25' },
    ];
    records['orders.facts'][0].plant_flag = '工厂';
    records['orders.facts'].push({
      ...records['orders.facts'][0],
      executeorderno: 'E2',
      cust_order_no: 'O2',
      fromorderno: 'SOURCE2',
      cust_name: '客户B',
      material_code: 'S-UNKNOWN',
      order_qty: null,
      adjust_order_qty: null,
    });
    records['plan.item'][0].ordered = null;
    records['plan.item'][0].ordered_known = 60;
    records['plan.item'][0].ordered_coverage = 1;
  }
  for (const row of records['shortage.sku'])
    if (row.inventory_coverage === undefined) row.inventory_coverage = row.covered_groups;
  for (const name of operationsPacketDatasets)
    records[name + '.packets'] = operationPackets(
      records[name] ?? [],
      operationsDatasets[name].columns,
    );
  await page.evaluate(
    ({ records, columns }) => {
      window.fixtureRequests = [];
      window.fixtureDenied = false;
      const channel = new MessageChannel();
      window.fixturePort = channel.port1;
      channel.port1.onmessage = ({ data }) => {
        if (data.type !== 'request') return;
        let result = { ok: true };
        if (data.method === 'sql') {
          const { queryId, parameters } = data.parameters;
          window.fixtureRequests.push({ queryId, parameters });
          if (!queryId.startsWith('operations.')) throw Error('UNEXPECTED_SOURCE_QUERY');
          const name = queryId.slice('operations.'.length).replace(/\.count$/, '');
          const dataRows = records[name] ?? [];
          const keys = columns[name];
          result = window.fixtureDenied
            ? { success: false, errorCode: 'PERMISSION_DENIED', message: '当前用户无权限' }
            : {
                rows: queryId.endsWith('.count')
                  ? [{ total: dataRows.length }]
                  : dataRows
                      .slice(
                        parameters.offset ?? 0,
                        (parameters.offset ?? 0) + (parameters.page_size ?? 50),
                      )
                      .map((row) => Object.fromEntries(keys.map((key) => [key, row[key] ?? null]))),
                returnedColumns: queryId.endsWith('.count') ? ['total'] : keys,
                rejectedColumns: [],
                configVersion: 'fixture-v1',
              };
        }
        channel.port1.postMessage({ type: 'response', id: data.id, result });
      };
      window.postMessage(
        {
          protocol: 'gea-html-v2',
          type: 'connect',
          context: {
            plugin: 'inventory-orderfulfillment',
            session: 'session-operations-fixture',
            locale: 'zh-CN',
          },
        },
        location.origin,
        [channel.port2],
      );
    },
    {
      records,
      columns: Object.fromEntries([
        ...Object.entries(operationsDatasets).map(([name, dataset]) => [name, dataset.columns]),
        ...Array.from(operationsPacketDatasets, (name) => [
          name + '.packets',
          operationsPacketColumns,
        ]),
      ]),
    },
  );

  await expect(frame.locator('#mCheck')).toContainText('已读取');
  if (fullAudit) {
    page.on('pageerror', (error) =>
      process.stdout.write(JSON.stringify({ auditPageError: error.message }) + '\n'),
    );
    process.stdout.write(
      JSON.stringify(
        await auditCompleteOperationsUi(
          page,
          frame,
          '.runtime/validation/operations-full-ui-audit.json',
        ),
      ) + '\n',
    );
    return;
  }
  await expect(frame.locator('#kpis .kpi')).toHaveCount(9);
  await expect(frame.locator('#kpis .kpi').nth(0).locator('.lbl')).toHaveText('月度计划评估量');
  await expect(frame.locator('#kpis .kpi').nth(0).locator('.val')).toHaveText('—');
  await expect(frame.locator('#kpis .kpi').nth(0).locator('.foot')).toContainText('纠偏计划 80');
  await expect(frame.locator('#kpis .kpi').nth(3).locator('.val')).toHaveText('40');
  await expect(frame.locator('#kpis .kpi').nth(8).locator('.val')).toHaveText('0');
  await expect(frame.locator('#t_overview')).not.toContainText('已知');
  await expect(frame.locator('#kpis .kpi').nth(8)).toHaveAttribute('title', /可判定/);
  assert.deepEqual(await frame.locator('body').evaluate(() => [fv(10000), fv(0), fv(NaN)]), [
    '1',
    '0',
    '—',
  ]);
  assert.equal(
    await frame
      .locator('body')
      .evaluate(() =>
        CH.c_ov_funnel
          .getOption()
          .series.some((series) => series.markLine?.data?.some((point) => point.yAxis === 73.3)),
      ),
    false,
  );
  assert.equal(
    await frame
      .locator('body')
      .evaluate(() => rateCols(() => ({ rate95: 0 }))[0].fmt(undefined, {})),
    '0',
  );
  await expect
    .poll(async () =>
      frame.locator('body').evaluate((body) => ({
        overflow: getComputedStyle(body.ownerDocument.documentElement).overflowY,
        excess:
          body.ownerDocument.scrollingElement.scrollHeight -
          body.ownerDocument.documentElement.clientHeight,
      })),
    )
    .toMatchObject({ overflow: 'hidden', excess: 0 });
  assert.ok((await frameElement.evaluate((node) => node.getBoundingClientRect().height)) > 1000);
  await frame.locator('.header').hover();
  const outerScroll = await page.evaluate(() => window.scrollY);
  await page.mouse.wheel(0, 400);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(outerScroll);
  assert.equal(
    await frame.locator('body').evaluate((body) => body.ownerDocument.scrollingElement.scrollTop),
    0,
  );
  await expect(frame.locator('#operationsFilters')).toHaveCount(0);
  for (const width of [1600, 1000, 700, 500]) {
    await page.setViewportSize({ width, height: 1050 });
    const layout = await frame.locator('#kpis').evaluate((node) => ({
      width: node.clientWidth,
      viewport: node.ownerDocument.defaultView.innerWidth,
      columns: getComputedStyle(node).gridTemplateColumns.split(' ').map(Number.parseFloat),
      cards: [...node.children].map((card) => ({
        width: card.getBoundingClientRect().width,
        height: card.getBoundingClientRect().height,
      })),
      wide: node.lastElementChild.getBoundingClientRect().width,
    }));
    assert.equal(
      layout.columns.length,
      layout.viewport <= 600 ? 1 : layout.viewport <= 1100 ? 2 : 4,
    );
    assert.ok(
      Math.max(...layout.columns) - Math.min(...layout.columns) < 2,
      'all KPI columns must have equal widths',
    );
    assert.ok(
      layout.cards.slice(0, 8).every((card) => card.width > 200 && card.height < 400),
      'KPI cards must not collapse into narrow strips',
    );
    assert.ok(
      Math.abs(layout.wide - layout.width) < 2,
      'wide KPI must span only the current columns',
    );
  }
  await page.setViewportSize({ width: 1600, height: 1050 });

  await expect(frame.locator('#c_ov_age canvas')).toBeVisible();
  for (const [key, name] of [
    ['base', '基地视角'],
    ['region', '区域下钻'],
    ['unopen', '未开订单诊断'],
    ['item', '品项视角'],
    ['shortage', '缺货排产'],
    ['warehouse', '仓点待发'],
  ]) {
    await frame.locator('#tabs .tab').filter({ hasText: name }).click();
    await expect(frame.locator('#p-' + key)).toBeVisible();
    await expect(frame.locator('#mCheck')).toContainText('已读取');
    await expect
      .poll(async () =>
        frame
          .locator('body')
          .evaluate((body) =>
            Math.abs(
              body.getBoundingClientRect().height - body.ownerDocument.documentElement.clientHeight,
            ),
          ),
      )
      .toBeLessThan(2);
    if (key === 'warehouse') await expect(frame.locator('#t_warehouse')).toContainText('8.8');
    if (key === 'warehouse') {
      await expect(frame.locator('#t_warehouse')).not.toContainText('共享仓库');
      await expect(frame.locator('#t_warehouse [title*="唯一仓库库存池"]').first()).toBeVisible();
    }
    if (key === 'item') await expect(frame.locator('#t_item')).not.toContainText('已知');
  }
  await frame.locator('#tabs .tab').filter({ hasText: '未开订单诊断' }).click();
  await frame.locator('#sub_unopen .subtab[data-k="detail"]').click();
  await expect(frame.locator('#tb_un')).toContainText('客户A');
  await expect(frame.locator('#tb_un')).toContainText('缺货');
  await expect(frame.locator('#tb_un')).toContainText('8');
  await frame.locator('#sub_unopen .subtab[data-k="org"]').click();
  await expect(frame.locator('#tb_un')).toContainText('河南一组');
  await frame.locator('#tabs .tab').filter({ hasText: '缺货排产' }).click();
  await expect(frame.locator('#t_shortage')).toContainText('PRIVATE-SKU');
  const dictionaryRow = frame.locator('#t_shortage tbody tr').filter({ hasText: '字典补全商品' });
  await expect(dictionaryRow).toContainText('水饺');
  await expect(
    frame.locator('#t_shortage tbody tr').filter({ hasText: '主数据补全商品' }),
  ).toContainText('水饺');
  assert.equal(
    await frame
      .locator('body')
      .evaluate(() => D.sku.find((row) => row.code === 'MASTER-SKU').series),
    '主数据系列',
  );
  assert.equal(
    await frame
      .locator('body')
      .evaluate(() => D.sku.find((row) => row.code === 'DICTIONARY-SKU').series),
    '字典系列',
  );
  await expect(frame.locator('#skpis .val').first()).toHaveText('7');
  for (const width of [1600, 1000, 700, 500]) {
    await page.setViewportSize({ width, height: 1050 });
    const layout = await frame.locator('#skpis').evaluate((node) => ({
      viewport: node.ownerDocument.defaultView.innerWidth,
      columns: getComputedStyle(node).gridTemplateColumns.split(' ').map(Number.parseFloat),
      cards: [...node.children].map((card) => ({
        width: card.getBoundingClientRect().width,
        height: card.getBoundingClientRect().height,
      })),
      values: [...node.querySelectorAll('.val')].map((value) => ({
        width: value.clientWidth,
        scrollWidth: value.scrollWidth,
        height: value.clientHeight,
        lineHeight: Number.parseFloat(getComputedStyle(value).lineHeight),
      })),
    }));
    assert.equal(
      layout.columns.length,
      layout.viewport <= 600 ? 1 : layout.viewport <= 1100 ? 2 : 4,
    );
    assert.ok(layout.cards.every((card) => card.width > 200 && card.height < 240));
    assert.ok(
      layout.values.every(
        (value) => value.scrollWidth <= value.width + 1 && value.height < value.lineHeight * 1.5,
      ),
      'KPI values must fit on a single line',
    );
  }
  await page.setViewportSize({ width: 1000, height: 1050 });
  await frame
    .locator('#skpis')
    .screenshot({ path: '.runtime/validation/shortage-kpis-responsive.png' });
  await page.setViewportSize({ width: 1600, height: 1050 });
  await expect(frame.locator('#t_shortage')).toContainText('可确认缺货SKU');
  const downloadPromise = page.waitForEvent('download');
  await frame.locator('#t_shortage [data-act="csv"]').click();
  const download = await downloadPromise;
  assert.match(await readFile(await download.path(), 'utf8'), /'=PRIVATE-SKU/);
  const stickyChecks = await frame.locator('body').evaluate(async (body) => {
    const results = [];
    for (const key of ['date', 'base', 'item']) {
      const host = document.createElement('div');
      body.append(host);
      window.Table(host, {
        title: '固定表头与首列验证',
        pageSize: 100,
        rows: Array.from({ length: 80 }, (_, index) => ({
          [key]: index === 0 ? undefined : key + index,
          second: '第二列用于横向滚动'.repeat(12),
          third: '第三列用于横向滚动'.repeat(12),
        })),
        cols: [
          { k: key, label: key, fmt: (value) => '<b>' + value + '</b>' },
          { k: 'second', label: '第二列' },
          { k: 'third', label: '第三列' },
        ],
      });
      const scroller = host.querySelector('.tbl-scroll');
      const corner = host.querySelector('th');
      const first = host.querySelector('td');
      const before = corner.getBoundingClientRect();
      const missing = first.textContent;
      scroller.scrollTop = 200;
      scroller.scrollLeft = 300;
      await new Promise(requestAnimationFrame);
      const after = corner.getBoundingClientRect();
      const td = first.getBoundingClientRect();
      const headerZ = Number(getComputedStyle(corner).zIndex);
      const cellZ = Number(getComputedStyle(first).zIndex);
      results.push({
        key,
        missing,
        dx: after.x - before.x,
        dy: after.y - before.y,
        firstDx: td.x - after.x,
        headerZ,
        cellZ,
        scrollTop: scroller.scrollTop,
        scrollLeft: scroller.scrollLeft,
      });
      host.remove();
    }
    return results;
  });
  for (const result of stickyChecks) {
    assert.equal(result.missing, '—', result.key);
    assert.ok(result.scrollTop > 0 && result.scrollLeft > 0, JSON.stringify(result));
    assert.ok(Math.abs(result.dx) < 1 && Math.abs(result.dy) < 1, JSON.stringify(result));
    assert.ok(Math.abs(result.firstDx) < 1, JSON.stringify(result));
    assert.ok(result.headerZ > result.cellZ, JSON.stringify(result));
  }
  const chartRecovery = await frame.locator('body').evaluate(() => {
    const previous = {
      rates: D.baseRate,
      distributions: D.rateDist,
      bases: [...BASES],
      charts: D.liveCharts,
      tab: unopenTab,
    };
    try {
      const known = Object.fromEntries(RATE_DEF.map((r, i) => [r.k, i === 0 ? 10 : 0]));
      const missing = Object.fromEntries(RATE_DEF.map((r) => [r.k, NaN]));
      D.baseRate = { 完整: known, 缺失: missing };
      BASES.splice(0, BASES.length, { base: '完整' }, { base: '缺失' });
      D.liveCharts = ['c_base_rate', 'c_rate_dist'];
      renderBase();
      const values = CH.c_base_rate.getOption().series[0].data;
      D.rateDist = { custType: { 完整组: known, 缺失组: missing } };
      unopenTab = 'cust';
      renderUnopen();
      renderUnopen();
      const distribution = CH.c_rate_dist.getOption();
      return {
        first: values[0],
        missingIsNaN: Number.isNaN(values[1]),
        labels: distribution.yAxis[0].data,
        count: distribution.series[0].data[0],
        attached:
          CH.c_rate_dist.getDom() === document.getElementById('c_rate_dist') &&
          CH.c_rate_dist.getDom().isConnected &&
          Boolean(document.querySelector('#c_rate_dist canvas')),
      };
    } finally {
      D.baseRate = previous.rates;
      D.rateDist = previous.distributions;
      D.liveCharts = previous.charts;
      unopenTab = previous.tab;
      BASES.splice(0, BASES.length, ...previous.bases);
    }
  });
  assert.deepEqual(chartRecovery, {
    first: 100,
    missingIsNaN: true,
    labels: ['完整组'],
    count: 10,
    attached: true,
  });
  await frame.locator('#tabs .tab').filter({ hasText: '品项视角' }).click();
  const knownItemRow = frame.locator('#t_item_unopen tbody tr').filter({ hasText: '水饺' });
  await expect(knownItemRow.locator('td').nth(1)).not.toHaveText('—');
  await expect(knownItemRow.locator('td').nth(1).locator('span')).toHaveAttribute(
    'title',
    /数量覆盖/,
  );
  await expect(knownItemRow).not.toContainText('已知');
  const itemExport = page.waitForEvent('download');
  await frame.locator('#t_item_unopen [data-act="csv"]').click();
  const downloaded = await itemExport;
  assert.match(await readFile(await downloaded.path(), 'utf8'), /已知 0\.001/);
  await downloaded.delete();
  await auditOperationsTables(frame);
  await page.evaluate(() => {
    window.fixtureDenied = true;
    window.fixturePort.postMessage({ type: 'identity-changed' });
  });
  await expect(frame.locator('body')).not.toContainText('PRIVATE-SKU');
  await expect(frame.locator('#mCheck')).toContainText('部分数据未读取');
  await expect(frame.locator('#kpis .kpi').nth(3).locator('.val')).toHaveText('—');
  assert.deepEqual(errors, []);
});
