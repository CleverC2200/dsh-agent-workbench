import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdir } from './helpers/prepared-assets.mjs';
import { chromium, expect } from '@playwright/test';
import { configuredPageHtml, configuredWire } from './fixtures/configured-page.mjs';
const styles = (
  await Promise.all(['theme/tokens.css', 'theme/html-defaults.css'].map((p) => readFile(p, 'utf8')))
).join('\n');
async function mount(t, id, width, override) {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width, height: 900 } }),
    errors = [],
    calls = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.clock.setFixedTime(new Date('2026-10-20T04:00:00Z'));
  const html = await configuredPageHtml(id),
    wire = await configuredWire(id);
  await page.exposeFunction('queryLayoutFixture', async (message) => {
    if (message.method === 'sql') {
      calls.push(message.parameters);
      const result = wire(message.parameters);
      return override ? override(message.parameters, result) : result;
    }
    if (message.method === 'access') return { principalId: 'layout-user', consumerCode: id };
    if (message.method === 'context') return { ok: true };
    throw Error('Unexpected layout request: ' + message.method);
  });
  await page.route('http://agent-layout.test/**', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body:
        new URL(route.request().url()).pathname === '/page'
          ? html.replace('</head>', `<style>${styles}</style></head>`)
          : `<!doctype html><html><body style="margin:0"><iframe title="业务插件" src="/page" style="display:block;width:100%;height:100vh;border:0"></iframe><script>
 const frame=document.querySelector('iframe');window.addEventListener('message',event=>{if(event.data?.protocol==='gea-html-v2'&&event.data.type==='ready'){const pair=new MessageChannel();pair.port1.onmessage=async({data:message})=>{if(message.type==='request'){try{pair.port1.postMessage({type:'response',id:message.id,result:await window.queryLayoutFixture(message)});}catch(error){pair.port1.postMessage({type:'response',id:message.id,error:error.message});}}if(message.type==='theme:subscribe')pair.port1.postMessage({type:'theme',version:'1.1.1',context:{session:'layout-session',plugin:'inventory-${id}'},colorScheme:'light',fontSize:14,tokens:{}});};frame.contentWindow.postMessage({protocol:'gea-html-v2',type:'connect',context:{session:'layout-session',plugin:'inventory-${id}'}},'*',[pair.port2]);}if(event.data?.protocol==='dsh-workbench-view-v1'&&event.data.type==='ready')frame.contentWindow.postMessage({protocol:'dsh-workbench-view-v1',type:'restore',page:event.data.page,version:1,channel:'layout-view',generation:1,state:{version:1}},'*');});</script></body></html>`,
    }),
  );
  await page.goto('http://agent-layout.test/');
  const frame = page.frameLocator('iframe');
  return { page, frame, errors, calls };
}
for (const id of ['fc', 'qll', 'dealer', 'aqkc', 'apsplan'])
  test(`${id}: authored structure and supplementary data remain usable at desktop and narrow widths`, async (t) => {
    const { page, frame, errors } = await mount(t, id, 1280);
    const root = frame.locator(id === 'apsplan' ? '#root' : '#app');
    await expect(root).not.toBeEmpty();
    const marker = {
      fc: '补货确认',
      qll: '品类结构',
      dealer: '客户库存',
      aqkc: '基地结构',
      apsplan: '智能工作台',
    }[id];
    await expect(
      root.getByRole(id === 'aqkc' ? 'tab' : 'button', { name: marker, exact: true }).first(),
    ).toBeVisible({
      timeout: 15000,
    });
    if (id === 'apsplan' || id === 'aqkc') {
      const summary = frame.locator('summary').filter({ hasText: '业务明细' });
      await expect(summary).toBeVisible();
      assert.equal(await summary.evaluate((el) => el.parentElement.open), false);
    }
    assert.doesNotMatch(await root.innerText(), /万件|件\/天/);
    for (const width of [1280, 560]) {
      await page.setViewportSize({ width, height: 900 });
      const sizes = await root.evaluate((el) => ({
        width: el.getBoundingClientRect().width,
        scroll: document.documentElement.scrollWidth,
        viewport: innerWidth,
      }));
      assert.ok(
        sizes.scroll <= sizes.viewport + 2,
        `${id}: page overflow ${JSON.stringify(sizes)}`,
      );
      const target = process.env.AGENT_LAYOUT_EVIDENCE;
      if (target) {
        await mkdir(target, { recursive: true });
        await page.screenshot({ path: target + '/' + id + '-' + width + '.png' });
      }
    }
    assert.deepEqual(errors, []);
  });
test('qll execution headline shows dated base orders without deriving pending from monthly totals', async (t) => {
  const { frame, calls, errors } = await mount(t, 'qll', 1280, (query, result) => {
    if (query.queryId === 'source.stock-date') result.rows[0].day = '2026-10-19';
    if (query.queryId === 'inventory.summary')
      Object.assign(result.rows[0], {
        known_open_orders: 1049341,
        known_open_orders_count: 3500,
        known_allocated: 261249,
        known_allocated_count: 3500,
        order_snapshot_count: 3500,
      });
    return result;
  });
  const card = frame
    .getByRole('button')
    .filter({ has: frame.getByText('订单执行', { exact: true }) });
  await expect(card).toContainText('104.93万箱');
  await expect(card).toContainText('基地未备单量 · 2026-10-19 · 范围 3500/3500 个SKU');
  await expect(card).toContainText('基地已备单占用');
  await expect(card).toContainText('26.12万箱');
  assert.equal(
    calls.some((query) => query.queryId.startsWith('inventory.detail')),
    false,
  );
  assert.deepEqual(errors, []);
});
for (const [quantity, count, display] of [
  [1234, 190, '1,234箱'],
  [0, 201, '0箱'],
  [null, 0, '-'],
])
  test(`AQKC snapshot unprepared card retains its scope and null/zero distinction: ${display}`, async (t) => {
    const { frame, errors, calls } = await mount(t, 'aqkc', 1280, (query, result) => {
      if (query.queryId === 'calendar.target_versions')
        result.rows = [{ month: '2026-10-01', inventory_version: '月初' }];
      if (query.queryId === 'source.stock-date') result.rows[0].day = '2026-10-19';
      if (query.queryId === 'page.dashboard-groups')
        Object.assign(result.rows[0], {
          ordered_valid: quantity,
          ordered_valid_count: count,
          allocated_valid: 50,
          allocated_valid_count: 201,
        });
      return result;
    });
    const card = frame
      .locator('article')
      .filter({ has: frame.getByText('基地未备单量', { exact: true }) });
    await expect(card.locator('strong')).toHaveText(display);
    await expect(card).toContainText(`快照 2026-10-19 · 范围 ${count}/201 个基地SKU`);
    await expect(card).toContainText('50箱（201/201 SKU）');
    await expect(
      card.locator('dl div').filter({ hasText: '当前待发总量' }).locator('dd'),
    ).toHaveText('-');
    assert.equal(calls.filter((q) => q.queryId === 'page.dashboard-groups').length, 1);
    assert.deepEqual(errors, []);
  });
test('dealer keeps original column order while display choices do not change queries or ten-row pagination', async (t) => {
  const { frame, calls } = await mount(t, 'dealer', 1280);
  await frame.getByRole('button', { name: 'SKU库存', exact: true }).click();
  await expect(frame.locator('tbody tr')).toHaveCount(10);
  const offset = () =>
    calls.filter((c) => c.queryId.startsWith('dealer.stock.detail')).at(-1)?.parameters.offset;
  assert.equal(offset(), 0);
  const before = calls.length;
  await frame.locator('summary').filter({ hasText: '显示列' }).click();
  const checkbox = frame.getByRole('checkbox', { name: 'SKU编码', exact: true });
  await checkbox.uncheck();
  await expect(frame.locator('thead th').filter({ hasText: /^SKU编码$/ })).toHaveCount(0);
  await frame.getByRole('button', { name: '显示全部', exact: true }).click();
  await expect(frame.locator('thead th').filter({ hasText: /^SKU编码$/ })).toHaveCount(1);
  assert.equal(calls.length, before);
  await frame.locator('summary').filter({ hasText: '显示列' }).click();
  await frame.getByRole('button', { name: '下一页', exact: true }).click();
  await expect.poll(offset).toBe(10);
  assert.equal(
    calls.filter((c) => c.queryId.startsWith('dealer.stock.detail')).at(-1).parameters.page_size,
    10,
  );
});
test('APS budget uses full independent totals despite missing source values', async (t) => {
  const { frame, errors, calls } = await mount(t, 'apsplan', 1280, (query, result) => {
    if (query.queryId === 'page.budget-performance') {
      if (query.parameters.start_month !== '202610') result.rows = [];
      else
        Object.assign(result.rows[0], {
          source_basis: 'MONTHLY_BUDGET_UNTAXED_INCOME',
          month: '202610',
          actual: 350,
          budget: 500,
          records: 281915,
          invalid: 7798,
          budget_keys: 217790,
          income_keys: 64125,
          missing_budget_keys: 5257,
          missing_income_records: 2541,
          matched_keys: 59175,
          matched_budget: '283504525.0000',
          matched_income: '319689755.49',
          budget_date: '2026-10-20',
          source_date: '20261019',
          base: null,
          category: null,
          region: null,
          province: null,
          sales_group: null,
        });
    }
    return result;
  });
  await frame.getByRole('button', { name: '智能工作台', exact: true }).click();
  const card = frame.locator('[data-context-id="intelligent-metric-销售预算达成率"]');
  await expect(card).toContainText('70.00');
  assert.doesNotMatch(await card.innerText(), /匹配范围|仅作观察|已覆盖/);
  assert.equal(
    calls.filter(
      (query) =>
        query.queryId === 'page.budget-performance' && query.parameters.start_month === '202610',
    ).length,
    1,
  );
  assert.deepEqual(errors, []);
  if (process.env.AGENT_LAYOUT_EVIDENCE) {
    await mkdir(process.env.AGENT_LAYOUT_EVIDENCE, { recursive: true });
    await card.screenshot({
      path: process.env.AGENT_LAYOUT_EVIDENCE + '/aps-budget-matched-scope.png',
    });
  }
  await frame.getByRole('button', { name: '产销协同看板', exact: true }).click();
  const overview = frame
    .locator('article.period-kpi-card')
    .filter({ has: frame.locator('.kpi-name > span').filter({ hasText: /^销售预算达成率$/ }) });
  await expect(overview.locator('.kpi-value strong')).toHaveText('70.00');
  assert.doesNotMatch(await overview.innerText(), /匹配范围|仅作观察|[-—]%/);
});
for (const [actual, valid, expected] of [
  [9809, 2694, '98.09'],
  [0, 2694, '0.00'],
  [null, 0, '-'],
])
  test(`APS production headline retains independent totals with missing values: ${expected}`, async (t) => {
    const { frame, errors } = await mount(t, 'apsplan', 1280, (query, result) => {
      if (/^(page|overview|drill\.organization|drill\.product)\.production$/.test(query.queryId)) {
        result.rows =
          query.parameters.start === '20261001'
            ? [
                {
                  ...result.rows[0],
                  base: '华东',
                  source_basis: 'MES_QUANTITY',
                  source_date: '20261019',
                  records: 2696,
                  invalid: 2696 - valid,
                  valid_records: valid,
                  planned: valid ? 10000 : null,
                  actual,
                  known_planned: valid ? 10000 : null,
                  known_actual: actual,
                },
              ]
            : [];
      }
      if (['page.demand-accuracy', 'overview.demand-accuracy'].includes(query.queryId))
        result.rows = [
          {
            ...result.rows[0],
            month: '202610',
            base: '华东',
            initial_plan: 100,
            adjusted_plan: 0,
            actual: 50,
            missing_actual: 0,
            invalid: 0,
            initial_deviation: 50,
            adjusted_deviation: 50,
          },
        ];
      return result;
    });
    await frame.getByRole('button', { name: '产销协同看板', exact: true }).click();
    const card = frame
      .locator('article.period-kpi-card')
      .filter({ has: frame.locator('.kpi-name > span').filter({ hasText: /^生产计划达成率$/ }) });
    await expect(card.locator('.kpi-value strong')).toHaveText(expected);
    assert.doesNotMatch(await card.innerText(), /有效范围|仅作观察/);
    assert.doesNotMatch(await card.locator('.kpi-comparison-grid').innerText(), /[-—]%/);
    const demand = frame
      .locator('article.period-kpi-card')
      .filter({ has: frame.locator('.kpi-name > span').filter({ hasText: /^需求预测达成率$/ }) });
    await expect(demand.locator('.kpi-value strong')).toHaveText('-');
    await expect(demand.locator('.kpi-value > span')).toHaveCount(0);
    await frame.getByRole('tab', { name: '生产视角', exact: true }).click();
    await frame.getByRole('tab', { name: '月度视角', exact: true }).click();
    await expect(card.locator('.kpi-value strong')).toHaveText(expected);
    assert.deepEqual(errors, []);
  });
for (const [quantity, demand, expected] of [
  [100, 10, '10.00'],
  [0, 10, '0.00'],
  [100, 0, '-'],
])
  test(`APS production shippable card uses full totals and preserves zero denominator: ${expected}`, async (t) => {
    const { frame, errors } = await mount(t, 'apsplan', 1280, (query, result) => {
      if (
        [
          'overview.stock',
          'page.stock-overview',
          'drill.organization.stock',
          'drill.product.stock',
        ].includes(query.queryId)
      )
        Object.assign(result.rows[0], {
          records: 10,
          available: quantity,
          demand,
          invalid: 5,
          missing_demand: 5,
          covered_shippable_count: 5,
          covered_shippable_quantity: quantity,
          covered_shippable_demand: demand,
          source_date: '2026-10-19',
        });
      return result;
    });
    await frame.getByRole('button', { name: '产销协同看板', exact: true }).click();
    await frame.getByRole('tab', { name: '生产视角', exact: true }).click();
    await frame.getByRole('tab', { name: '月度视角', exact: true }).click();
    const card = frame
      .locator('article.period-kpi-card')
      .filter({ has: frame.locator('.kpi-name > span').filter({ hasText: /^可发货天数$/ }) });
    await expect(card.locator('.kpi-value strong')).toHaveText(expected);
    await expect(card.locator('.kpi-period-label')).toContainText('快照指标');
    assert.doesNotMatch(await card.innerText(), /同范围|仅作观察/);
    if (!demand) await expect(card.locator('.kpi-value > span')).toHaveCount(0);
    assert.deepEqual(errors, []);
  });
test('FC monthly order identity and shortage SKU counts are shown without inventing current pending quantities', async (t) => {
  const { frame, calls, errors } = await mount(t, 'fc', 1280, (query, result) => {
    if (query.queryId === 'orders.summary')
      Object.assign(result.rows[0], {
        from_order_count: 6,
        affected_from_order_count: 2,
        invalid: 0,
        missing_order_identity: 0,
        shortage_sku_count: 3,
        missing_shortage_sku_identity: 0,
        missing_shortage: 0,
        ordered: 172005,
        shortage: 15675,
      });
    return result;
  });
  const card = frame
    .locator('article.kpi-card')
    .filter({ has: frame.getByText('当前订单', { exact: true }) });
  await expect(card.locator('.kpi-value')).toHaveText('-');
  await expect(card.locator('dl div').filter({ hasText: '本月涉及订单' })).toContainText('6单');
  await expect(card.locator('dl div').filter({ hasText: '本月缺货SKU' })).toContainText('3个');
  await expect(card.locator('dl div').filter({ hasText: '本月缺货订单' })).toContainText('2单');
  await expect(card).toContainText('本月累计');
  assert.equal(calls.filter((q) => q.queryId === 'orders.summary').length, 1);
  assert.deepEqual(errors, []);
});
for (const id of ['aqkc', 'qll', 'fc', 'apsplan'])
  test(`${id}: dated factory shipment details stay lazy and requery ten rows per page`, async (t) => {
    const { page, frame, calls, errors } = await mount(t, id, 1280, (query, result) => {
      if (query.queryId === 'base_shipments.count') result.rows = [{ total: 25 }];
      if (query.queryId === 'base_shipments.summary')
        Object.assign(result.rows[0], {
          row_count: 25,
          base_count: 5,
          month_ship_positive: 3909186,
          month_ship_net: 3908218.937,
          rolling_ship_positive: 6862792.1,
          rolling_ship_net: 6861044.737,
          rolling_ship_negative: 1747.363,
        });
      if (query.queryId === 'base_shipments.detail')
        result.rows = Array.from(
          { length: Math.min(10, 25 - query.parameters.offset) },
          (_, n) => ({
            ...Object.fromEntries(result.returnedColumns.map((field) => [field, null])),
            base: '华东',
            sku: 'ship-sku-' + (query.parameters.offset + n),
            material_name: '发货测试商品',
            month_ship_positive: 100,
            month_ship_net: 95,
            rolling_ship_positive: 200,
            rolling_ship_net: 190,
            rolling_ship_negative: 10,
            last_ship_date: '20261019',
          }),
        );
      return result;
    });
    await expect(frame.locator(id === 'apsplan' ? '#root' : '#app')).not.toBeEmpty();
    assert.equal(
      calls.some((query) => query.queryId === 'base_shipments.detail'),
      false,
    );
    if (['aqkc', 'apsplan'].includes(id))
      await frame.locator('summary').filter({ hasText: '业务明细' }).click();
    if (id === 'fc') await frame.getByRole('button', { name: '基地资源', exact: true }).click();
    await frame.getByRole('button', { name: '基地实际发货', exact: true }).click();
    const panel = frame.locator('section[aria-labelledby="source-view-title"]');
    await expect(panel.locator('tbody tr')).toHaveCount(10);
    await expect(panel).toContainText('近30日净发货');
    const detailCalls = () => calls.filter((query) => query.queryId === 'base_shipments.detail');
    assert.equal(detailCalls().at(-1).parameters.page_size, 10);
    assert.equal(detailCalls().at(-1).parameters.offset, 0);
    assert.equal(detailCalls().at(-1).parameters.rolling_start, '20260921');
    assert.equal(detailCalls().at(-1).parameters.shipment_end_exclusive, '20261021');
    await panel.getByRole('button', { name: '下一页', exact: true }).click();
    await expect.poll(() => detailCalls().at(-1)?.parameters.offset).toBe(10);
    await expect(panel.locator('tbody tr')).toHaveCount(10);
    await expect(panel).toContainText('ship-sku-10');
    await expect(panel).toContainText('2026-09-21');
    await page.setViewportSize({ width: 560, height: 900 });
    const width = await panel.evaluate(() => ({
      page: document.documentElement.scrollWidth,
      viewport: innerWidth,
    }));
    assert.ok(width.page <= width.viewport + 2, JSON.stringify(width));
    assert.deepEqual(errors, []);
  });
test('APS warehouse operations show source fractions as percentages and preserve source zero', async (t) => {
  const { frame, calls, errors } = await mount(t, 'apsplan', 1280, (query, result) => {
    if (['branch_cost.detail', 'branch_cost.detail.atomic'].includes(query.queryId))
      Object.assign(result.rows[0], {
        jfjsl: '0.0000',
        llfhl: '1.0000',
        zqjfl: '0.9770',
        kwfhl: '0.0000',
        hdqrjsl: '0.6690',
        xxdzb: '0.9600',
      });
    return result;
  });
  await frame.locator('summary').filter({ hasText: '业务明细' }).click();
  await frame.getByRole('button', { name: '分仓运营与费用', exact: true }).click();
  const panel = frame.locator('section[aria-labelledby="source-view-title"]');
  await expect(panel.locator('tbody tr')).toHaveCount(1);
  for (const percentage of ['97.7%', '66.9%', '96%', '100%', '0%'])
    await expect(panel).toContainText(percentage);
  const query = calls.find((query) =>
    ['branch_cost.detail', 'branch_cost.detail.atomic'].includes(query.queryId),
  );
  assert.equal(query.parameters.start, '202610');
  assert.equal(query.parameters.end_exclusive, '202611');
  assert.equal(query.parameters.base, undefined);
  assert.deepEqual(errors, []);
});

for (const deniedBudget of [false, true])
  test(`APS sales view keeps cards, list and analysis consistent with zero-fill; denied budget=${deniedBudget}`, async (t) => {
    const { frame, errors, calls } = await mount(t, 'apsplan', 1280, (query, result) => {
      if (query.queryId === 'page.budget-performance') {
        if (deniedBudget)
          return {
            failure: {
              reasonCode: 'RESOURCE_NOT_IN_DATASET',
              stage: 'BIND',
              message: 'budget resource not in dataset',
            },
          };
        result.rows =
          query.parameters.start_month === '202610'
            ? [
                {
                  ...result.rows[0],
                  source_basis: 'MONTHLY_BUDGET_UNTAXED_INCOME',
                  month: '202610',
                  actual: 50,
                  budget: 100,
                  invalid: 2,
                  base: null,
                  category: null,
                  region: null,
                  province: null,
                  sales_group: null,
                },
              ]
            : [];
      }
      if (/^(page|overview|drill\.organization)\.sales-accuracy$/.test(query.queryId)) {
        result.rows =
          query.parameters.start_month === '2026-10-01'
            ? [
                {
                  ...result.rows[0],
                  month: '202610',
                  initial_plan: 100,
                  adjusted_plan: 100,
                  initial_deviation: 25,
                  adjusted_deviation: 25,
                  actual: 75,
                  invalid: 2,
                  missing_actual: 1,
                },
              ]
            : [];
      }
      return result;
    });
    await frame.getByRole('button', { name: '产销协同看板', exact: true }).click();
    await frame.getByRole('tab', { name: '销售视角', exact: true }).click();
    const card = (name) =>
      frame.locator('article.period-kpi-card').filter({
        has: frame.locator('.kpi-name > span').filter({ hasText: new RegExp(`^${name}$`) }),
      });
    const row = (name) =>
      frame
        .locator('#overview-detail-list .overview-list-row')
        .filter({ has: frame.locator('strong').filter({ hasText: new RegExp(`^${name}$`) }) });
    await expect(card('销售提报准确率').locator('.kpi-value strong')).toHaveText('75.00');
    await expect(row('销售提报准确率')).toContainText('75.00%');
    assert.ok(
      calls.some(
        (query) =>
          query.queryId === 'drill.organization.sales-accuracy' &&
          query.parameters.source_flag === '销售口径',
      ),
    );
    await expect(card('销售预算达成率').locator('.kpi-value strong')).toHaveText(
      deniedBudget ? '-' : '50.00',
    );
    await expect(row('销售预算达成率').locator('b')).toHaveText(deniedBudget ? '—' : '50.00%');
    const analysis = frame.locator('[data-context-id="summary"]');
    await expect(analysis.locator('.score strong')).toHaveText('1');
    await expect(analysis.locator('.score > span')).toHaveText(deniedBudget ? '/1' : '/2');
    assert.doesNotMatch(await analysis.innerText(), /尚无可核实/);
    if (deniedBudget) {
      await expect(card('销售预算达成率').locator('.achievement-status')).toHaveText('读取失败');
      await expect(row('销售预算达成率').locator('.status-neutral')).toHaveText('读取失败');
      const budgetCalls = calls.filter((query) => query.queryId === 'page.budget-performance');
      // Summary and organization are separate page loads; neither retries denied comparisons.
      assert.ok(budgetCalls.length <= 2);
      assert.ok(budgetCalls.every((query) => query.parameters.start_month === '202610'));
    }
    assert.doesNotMatch(await frame.locator('#overview-detail-list').innerText(), /[-—]%/);
    assert.deepEqual(errors, []);
  });
