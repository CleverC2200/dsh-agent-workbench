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
    calls = [],
    diagnostics = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (message) => {
    if (message.type() === 'warning') diagnostics.push(message.text());
  });
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
  return { page, frame, errors, calls, diagnostics };
}
test('QLL counts one inventory snapshot once across base and warehouse dimensions', async (t) => {
  const { frame, errors, calls } = await mount(t, 'qll', 1280, (query, result) => {
    if (['health.cards', 'health.inventory'].includes(query.queryId))
      Object.assign(result.rows[0], { total_qty: 60, available_qty: 50 });
    if (['branch-health.cards', 'branch-health.inventory'].includes(query.queryId))
      Object.assign(result.rows[0], { total_qty: 100, available_qty: 40 });
    if (query.queryId === 'overview.quick-stock')
      result.rows.forEach((row) =>
        Object.assign(
          row,
          row.location_type === '基地'
            ? { total_qty: 60, available_qty: 50 }
            : { total_qty: 100, available_qty: 40 },
        ),
      );
    return result;
  });
  const inventoryCard = frame.locator('[data-overview-cards="qll"]').locator('button').first();
  await expect(inventoryCard.locator('strong').first()).toHaveText(/100\s*箱/);
  for (const call of calls.filter((c) => c.queryId.startsWith('health.'))) {
    assert.equal('warehouse_type' in call.parameters, false);
  }
  assert.deepEqual(errors, []);
});
test('APS source limitations do not masquerade as query failures', async (t) => {
  const { frame, calls, errors } = await mount(t, 'apsplan', 1280);
  await expect.poll(() => calls.length).toBeGreaterThan(10);
  await expect(frame.locator('main.main-content')).toHaveAttribute('aria-busy', 'false');
  await expect(frame.getByRole('alert')).toHaveCount(0);
  assert.deepEqual(errors, []);
});

test('APS query diagnostics stay in logs while other sources finish', async (t) => {
  const { frame, calls, errors, diagnostics } = await mount(t, 'apsplan', 1280, (query, result) => {
    if (query.queryId === 'source.stock-date')
      return { failure: { reasonCode: 'NO_RETURN_COLUMN_ALLOWED', message: '库存读取权限不足' } };
    return result;
  });
  await expect.poll(() => calls.length).toBeGreaterThan(10);
  await expect(frame.locator('main.main-content')).toHaveAttribute('aria-busy', 'false');
  await expect(frame.getByRole('alert')).toHaveCount(0);
  await expect(frame.locator('body')).not.toContainText('NO_RETURN_COLUMN_ALLOWED');
  await expect
    .poll(() => diagnostics.some((message) => message.includes('NO_RETURN_COLUMN_ALLOWED')))
    .toBe(true);
  assert.deepEqual(errors, []);
});
for (const id of ['fc', 'qll', 'dealer', 'aqkc', 'apsplan'])
  test(`${id}: original business structure remains usable at desktop and narrow widths`, async (t) => {
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
      root
        .getByRole(['aqkc', 'qll'].includes(id) ? 'tab' : 'button', { name: marker, exact: true })
        .first(),
    ).toBeVisible({
      timeout: 15000,
    });
    if (id === 'apsplan' || id === 'aqkc') {
      const summary = frame.locator('summary').filter({ hasText: '业务明细' });
      await expect(summary).toHaveCount(0);
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
for (const id of ['fc', 'qll', 'dealer', 'aqkc', 'apsplan'])
  test(`${id}: shared header aligns filters and refresh across pane widths`, async (t) => {
    const { page, frame, errors } = await mount(t, id, 1280);
    const header = frame.locator('[data-business-toolbar]');
    await expect(header).toBeVisible();
    assert.equal(
      await header.evaluate((el) => getComputedStyle(el).backgroundColor),
      'rgb(255, 255, 255)',
      `${id}: shared header surface`,
    );
    const refresh = header
      .locator('[data-business-toolbar-actions]')
      .getByRole('button', { name: /刷新/ });
    await expect(refresh).toBeVisible();
    for (const width of [1280, 768, 560, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      const boxes = await header.evaluate((el) => {
        const rect = (node) => {
          const r = node.getBoundingClientRect();
          return { left: r.left, right: r.right, top: r.top, height: r.height };
        };
        return {
          header: rect(el),
          row: rect(el.querySelector('[data-business-toolbar-row]')),
          filters: rect(el.querySelector('[data-business-toolbar-filters]')),
          actions: rect(el.querySelector('[data-business-toolbar-actions]')),
          scroll: document.documentElement.scrollWidth,
          viewport: innerWidth,
        };
      });
      assert.ok(boxes.scroll <= boxes.viewport + 2, `${id}@${width}: page overflows`);
      assert.ok(
        Math.abs(boxes.filters.left - boxes.row.left - 16) <= 1,
        `${id}@${width}: filter alignment`,
      );
      assert.ok(
        Math.abs(boxes.row.right - boxes.actions.right - 16) <= 1,
        `${id}@${width}: action alignment`,
      );
      if (width === 1280)
        assert.equal(Math.round(boxes.row.height), 56, `${id}: primary toolbar height`);
      const button = await refresh.boundingBox();
      assert.ok(
        button && Math.abs(button.height - 36) <= 1,
        `${id}@${width}: refresh control height`,
      );
      if (process.env.AGENT_TOOLBAR_EVIDENCE) {
        await mkdir(process.env.AGENT_TOOLBAR_EVIDENCE, { recursive: true });
        await page.screenshot({ path: `${process.env.AGENT_TOOLBAR_EVIDENCE}/${id}-${width}.png` });
      }
    }
    assert.deepEqual(errors, []);
  });
test('APS top month selector applies the original period and keeps its menu within a narrow pane', async (t) => {
  const { frame, calls, errors } = await mount(t, 'apsplan', 390);
  const picker = frame.locator('[data-business-toolbar] button.date-picker-button');
  await picker.click();
  const menu = frame.getByRole('menu', { name: '统计日期筛选', exact: true });
  await expect(menu).toBeVisible();
  const box = await menu.boundingBox();
  assert.ok(
    box && box.x >= 0 && box.x + box.width <= 391,
    `APS date menu clipped: ${JSON.stringify(box)}`,
  );
  assert.ok(box.width <= 264, 'period picker must stay compact');
  const grid = await menu.locator('.date-picker-month').evaluate((el) => ({
    columns: getComputedStyle(el).gridTemplateColumns.split(' ').length,
    children: [...el.children].map((child) => {
      const r = child.getBoundingClientRect();
      return { width: r.width, height: r.height };
    }),
  }));
  assert.equal(grid.columns, 4);
  assert.ok(grid.children.every((cell) => cell.width <= 60 && cell.height <= 32));
  const before = calls.length;
  await menu
    .locator('.date-picker-month')
    .getByRole('button', { name: '9月', exact: true })
    .click();
  await expect(picker).toContainText('2026年9月');
  await expect
    .poll(() =>
      calls
        .slice(before)
        .some(
          (query) =>
            query.parameters.as_of?.startsWith('2026-09') ||
            query.parameters.start?.startsWith('2026-09') ||
            query.parameters.start_month === '202609',
        ),
    )
    .toBe(true);
  assert.deepEqual(errors, []);
});
test('fc: current order card uses its own demand, allocation and three-stage gap', async (t) => {
  const { frame, calls, errors } = await mount(t, 'fc', 1280, (query, result) => {
    if (['health.cards', 'health.inventory'].includes(query.queryId))
      result.rows[0].pack_unit_qty = 86814.2;
    if (query.queryId === 'orders.summary') result.rows[0].shortage = 16163;
    if (query.queryId === 'current-shortage.summary')
      Object.assign(result.rows[0], { demand: 450, allocated: 50, shortage: 3 });
    return result;
  });
  const card = frame.locator('.kpi-card').filter({ hasText: '当前订单' });
  await expect(card.locator('.kpi-value')).toHaveText('450箱');
  await expect(card.locator('dl')).toContainText('缺货量3箱');
  await expect(card.locator('dl')).toContainText('未备单订单占用50箱');
  assert.doesNotMatch(await card.innerText(), /16,163|86,814|本月/);
  assert.equal(calls.filter((q) => q.queryId === 'current-shortage.summary').length, 1);
  assert.deepEqual(errors, []);
});
test('fc: denied current orders remain unknown without substituting monthly shortage', async (t) => {
  const { frame, calls, errors } = await mount(t, 'fc', 1280, (query, result) => {
    if (query.queryId === 'current-shortage.summary')
      return { failure: { reasonCode: 'ROW_SCOPE_DENIED', message: '当前范围无权限' } };
    if (query.queryId === 'orders.summary') result.rows[0].shortage = 16163;
    return result;
  });
  const card = frame.locator('.kpi-card').filter({ hasText: '当前订单' });
  await expect(card.locator('.kpi-value')).toHaveText('-');
  await expect(card.locator('dd')).toHaveText(['-', '-']);
  assert.doesNotMatch(await card.innerText(), /16,163|本月/);
  await expect(frame.getByRole('alert')).toHaveCount(0);
  assert.equal(calls.filter((q) => q.queryId === 'current-shortage.summary').length, 1);
  assert.deepEqual(errors, []);
});
test('dealer top date refresh preserves the selected customer scope', async (t) => {
  const { frame, calls, errors } = await mount(t, 'dealer', 390);
  const header = frame.locator('[data-business-toolbar]');
  const menu = header.locator('details').first();
  await menu.locator('summary').click();
  await menu.getByRole('textbox', { name: '客户编码', exact: true }).fill('customer-A');
  await menu.getByRole('button', { name: '查询 / 刷新', exact: true }).click();
  await expect(menu.locator('summary')).toContainText('customer-A');
  await header.getByLabel('读取时点').fill('2026-10-18');
  const before = calls.length;
  await header
    .locator('[data-business-toolbar-actions]')
    .getByRole('button', { name: '查询 / 刷新', exact: true })
    .click();
  await expect
    .poll(
      () =>
        calls
          .slice(before)
          .some(
            (query) =>
              query.queryId === 'source.dealer-stock-date' &&
              query.parameters.as_of === '2026-10-18',
          ) &&
        calls
          .slice(before)
          .some(
            (query) =>
              query.queryId.startsWith('dealer.stock.customer') &&
              query.parameters.customer === 'customer-A',
          ),
    )
    .toBe(true);
  assert.deepEqual(errors, []);
});
test('qll original current-order card retains new base snapshot quantities without monthly substitutes', async (t) => {
  const { frame, calls, errors } = await mount(t, 'qll', 1280, (query, result) => {
    if (query.queryId === 'source.stock-date') result.rows[0].day = '2026-10-19';
    if (query.queryId === 'current-shortage.summary')
      result.rows.forEach((row) =>
        Object.assign(row, { demand: row.location_type === '基地' ? 1049341 : 100000 }),
      );
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
    .filter({ has: frame.getByText('当前订单', { exact: true }) });
  await expect(card).toContainText('114.93万箱');
  await expect(card).toContainText('基地缺货量');
  await expect(card).toContainText('分仓缺货量');
  assert.doesNotMatch(await card.innerText(), /本月订单|范围|快照|源记录/);
  assert.equal(
    calls.some((query) => query.queryId.startsWith('inventory.detail')),
    false,
  );
  assert.deepEqual(errors, []);
});
test('QLL branch turnover reads its summary and its date control has a stable Chinese display', async (t) => {
  const { frame, calls, errors } = await mount(t, 'qll', 1280, (query, result) => {
    if (query.queryId === 'branch-turnover.cards')
      Object.assign(result.rows[0], { historical_turnover_days: 12.5, turnover_count: 30 });
    return result;
  });
  const card = frame
    .getByRole('button')
    .filter({ has: frame.getByText('库存周转', { exact: true }) });
  await expect(card).toContainText('12.5天');
  assert.ok(calls.some((query) => query.queryId === 'branch-turnover.cards'));
  await expect(frame.getByLabel('读取时点')).toHaveValue('2026-10-20');
  await expect(frame.getByText('2026年10月20日', { exact: true })).toBeVisible();
  assert.deepEqual(errors, []);
});
test('QLL cards retain maximum ages and independent current gaps, including zero', async (t) => {
  const { frame, errors } = await mount(t, 'qll', 1280, (query, result) => {
    if (query.queryId === 'health.cards')
      Object.assign(result.rows[0], { base_max_age: 405, max_age: 405 });
    if (query.queryId === 'branch-health.cards') Object.assign(result.rows[0], { max_age: 381 });
    if (query.queryId === 'current-shortage.summary')
      result.rows.forEach((row) =>
        Object.assign(row, { shortage: row.location_type === '分仓' ? 0 : 12345 }),
      );
    return result;
  });
  const age = frame
    .getByRole('button')
    .filter({ has: frame.getByText('当前货龄', { exact: true }) });
  await expect(age).toContainText('基地货龄405.0天');
  await expect(age).toContainText('分仓货龄381.0天');
  const orders = frame
    .getByRole('button')
    .filter({ has: frame.getByText('当前订单', { exact: true }) });
  await expect(orders).toContainText('基地缺货量1.23万箱');
  await expect(orders).toContainText('分仓缺货量0箱');
  assert.deepEqual(errors, []);
});
test('QLL changing the date stays local until submit, then reads the new date', async (t) => {
  const { frame, calls, errors } = await mount(t, 'qll', 560);
  await expect(
    frame.locator('div[aria-busy]').filter({ has: frame.getByText('当前库存', { exact: true }) }),
  ).toHaveAttribute('aria-busy', 'false');
  const before = calls.length;
  await frame.getByLabel('读取时点').fill('2026-10-18');
  await expect(frame.getByText('2026年10月18日', { exact: true })).toBeVisible();
  assert.equal(calls.length, before);
  await frame.getByRole('button', { name: '查询 / 刷新', exact: true }).click();
  await expect
    .poll(() =>
      calls
        .slice(before)
        .some(
          (query) =>
            query.queryId === 'source.stock-date' && query.parameters.as_of === '2026-10-18',
        ),
    )
    .toBe(true);
  assert.deepEqual(errors, []);
});
test('FC uses the same Chinese date display and retains explicit refresh', async (t) => {
  const { frame, calls, errors } = await mount(t, 'fc', 560);
  await expect(frame.getByText('2026年10月20日', { exact: true })).toBeVisible();
  await frame.getByLabel('读取时点').fill('2026-10-18');
  await expect(frame.getByText('2026年10月18日', { exact: true })).toBeVisible();
  const before = calls.length;
  await frame.getByRole('button', { name: '刷新', exact: true }).click();
  await expect
    .poll(() => calls.slice(before).some((query) => query.parameters.as_of === '2026-10-18'))
    .toBe(true);
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
      if (query.queryId === 'current-shortage.locations')
        Object.assign(result.rows[0], {
          demand: quantity,
          allocated: 50,
          shortage: quantity === null ? null : 12,
        });
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
      .filter({ has: frame.getByText('当前订单', { exact: true }) });
    await expect(card.locator('strong')).toHaveText(display);
    if (quantity !== null) await expect(card).toContainText('50箱');
    assert.doesNotMatch(await card.innerText(), /快照|范围|SKU/);
    await expect(card.locator('dl div').filter({ hasText: '缺货量' }).locator('dd')).toHaveText(
      quantity === null ? '-' : '12箱',
    );
    assert.equal(calls.filter((q) => q.queryId === 'page.dashboard-groups').length, 1);
    assert.deepEqual(errors, []);
  });
test('dealer reuses original tabs, table and pagination while ten-row paging stays server-driven', async (t) => {
  const { frame, calls } = await mount(t, 'dealer', 1280);
  await frame.getByRole('tab', { name: 'SKU库存', exact: true }).click();
  await expect(frame.locator('tbody tr')).toHaveCount(10);
  const offset = () =>
    calls.filter((c) => c.queryId.startsWith('dealer.stock.detail')).at(-1)?.parameters.offset;
  assert.equal(offset(), 0);
  await expect(frame.getByRole('tablist')).toHaveCount(1);
  await expect(frame.getByRole('tab', { name: 'SKU库存', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(frame.locator('summary').filter({ hasText: '显示列' })).toHaveCount(0);
  assert.equal(
    await frame.locator('thead tr').evaluate((el) => Math.round(el.getBoundingClientRect().height)),
    38,
  );
  await expect(frame.getByRole('combobox', { name: '每页条数' })).toHaveValue('10');
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
test('FC current-order card preserves a verified zero independently of monthly quantities', async (t) => {
  const { frame, calls, errors } = await mount(t, 'fc', 1280, (query, result) => {
    if (query.queryId === 'orders.summary')
      Object.assign(result.rows[0], { ordered: 172005, shortage: 15675 });
    if (query.queryId === 'current-shortage.summary')
      Object.assign(result.rows[0], { demand: 0, allocated: 0, remaining: 0, shortage: 0 });
    return result;
  });
  const card = frame
    .locator('article.kpi-card')
    .filter({ has: frame.getByText('当前订单', { exact: true }) });
  await expect(card.locator('.kpi-value')).toHaveText('0箱');
  await expect(card.locator('dt')).toHaveText(['缺货量', '未备单订单占用']);
  await expect(card.locator('dd')).toHaveText(['0箱', '0箱']);
  assert.equal(calls.filter((q) => q.queryId === 'current-shortage.summary').length, 1);
  assert.deepEqual(errors, []);
});
for (const id of ['aqkc', 'qll', 'fc', 'apsplan'])
  test(`${id}: source diagnostics and extra source tabs stay outside the original business UI`, async (t) => {
    const { frame, calls, errors } = await mount(t, id, 1280);
    await expect(frame.locator('summary').filter({ hasText: '业务明细' })).toHaveCount(0);
    for (const title of [
      '基地实际发货',
      '客户计划分析来源',
      '基地产销日记录',
      '分仓运营与费用',
      '分仓库存与补货测算',
    ])
      await expect(frame.getByRole('button', { name: title, exact: true })).toHaveCount(0);
    assert.equal(
      calls.some((query) => query.queryId === 'base_shipments.detail'),
      false,
    );
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

test('dealer original customer menu applies the new query scope and closes after selection', async (t) => {
  const { frame, calls, errors } = await mount(t, 'dealer', 1280);
  const menu = frame.locator('header details').first();
  await menu.locator('summary').click();
  await menu.getByRole('textbox', { name: '客户编码', exact: true }).fill('customer-A');
  await menu.getByRole('button', { name: '查询 / 刷新', exact: true }).click();
  await expect(menu.locator('summary')).toContainText('客户 customer-A');
  assert.equal(await menu.evaluate((el) => el.open), false);
  await expect
    .poll(() =>
      calls.some(
        (q) =>
          q.queryId.startsWith('dealer.stock.customer') && q.parameters.customer === 'customer-A',
      ),
    )
    .toBe(true);
  assert.deepEqual(errors, []);
});

test('QLL category cells bind category names while retaining organization as the secondary line', async (t) => {
  const { frame, errors } = await mount(t, 'qll', 1280);
  const cell = frame.locator('tbody tr').first().locator('td').first();
  await expect(cell.locator('strong')).toHaveText('汤圆');
  await expect(cell.locator('small')).toHaveText(['华东', 'sku-A-000']);
  await expect(frame.getByRole('tab', { name: '品类结构', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  assert.deepEqual(errors, []);
});

for (const id of ['fc', 'qll', 'dealer'])
  test(`${id}: Chinese calendar stays inside narrow panes and only applies on refresh`, async (t) => {
    const { page, frame, calls, errors } = await mount(t, id, 390);
    const header = frame.locator('[data-business-toolbar]');
    const input = header.getByLabel('读取时点');
    const trigger = header.getByRole('button', { name: /^选择日期：/ });
    await expect(trigger).toBeVisible();
    await expect.poll(() => calls.length).toBeGreaterThan(2);
    await expect(frame.locator('main[aria-busy="true"]')).toHaveCount(0);
    const before = calls.length;
    await trigger.click();
    const calendar = frame.getByRole('dialog', { name: '选择日期', exact: true });
    await expect(calendar).toContainText('2026年10月');
    await expect(calendar.getByRole('button', { name: '今天', exact: true })).toBeVisible();
    await expect(calendar.getByRole('button', { name: '清空', exact: true })).toBeVisible();
    assert.doesNotMatch(await calendar.innerText(), /October|Clear|Today/);
    await expect(calendar.getByRole('button', { name: '下个月', exact: true })).toBeDisabled();
    await expect(
      calendar.getByRole('button', { name: '2026年10月21日', exact: true }),
    ).toBeDisabled();
    for (const width of [1280, 560, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await trigger.click();
      if (!(await calendar.isVisible())) await trigger.click();
      const box = await calendar.boundingBox();
      assert.ok(box.x >= 0 && box.x + box.width <= width, `calendar clipped at ${width}`);
    }
    await calendar.getByRole('button', { name: '2026年10月18日', exact: true }).click();
    await expect(input).toHaveValue('2026-10-18');
    await expect(calendar).toHaveCount(0);
    assert.equal(
      calls.slice(before).some((q) => q.parameters.as_of === '2026-10-18'),
      false,
      'choosing a date must not apply the draft',
    );
    await header
      .locator('[data-business-toolbar-actions]')
      .getByRole('button', { name: /刷新/ })
      .click();
    await expect
      .poll(() => calls.slice(before).some((q) => q.parameters.as_of === '2026-10-18'))
      .toBe(true);
    await trigger.click();
    await page.keyboard.press('Escape');
    await expect(calendar).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await trigger.click();
    await calendar.getByRole('button', { name: '上个月', exact: true }).click();
    await expect(calendar).toContainText('2026年9月');
    await calendar.getByRole('button', { name: '今天', exact: true }).click();
    await expect(input).toHaveValue('2026-10-20');
    await trigger.click();
    await calendar.getByRole('button', { name: '清空', exact: true }).click();
    await expect(input).toHaveValue('');
    const clearedCalls = calls.length;
    await header
      .locator('[data-business-toolbar-actions]')
      .getByRole('button', { name: /刷新/ })
      .click();
    assert.equal(calls.length, clearedCalls, 'required empty date blocks refresh');
    await expect(calendar).toBeVisible();
    assert.deepEqual(errors, []);
  });

for (const id of ['aqkc', 'fc', 'qll', 'dealer'])
  test(`${id}: source warnings are logged without business-page banners`, async (t) => {
    const { frame, errors, diagnostics } = await mount(t, id, 1280);
    const root = frame.locator('#app');
    await expect(root).not.toBeEmpty();
    await root.evaluate(() =>
      window.dispatchEvent(
        new CustomEvent('gea-query-warning', {
          detail: { message: '缺少批次货龄与生产日期，无法计算完整货龄分桶和未来推演。' },
        }),
      ),
    );
    await expect
      .poll(() => diagnostics.some((message) => message.includes('缺少批次货龄')))
      .toBe(true);
    await expect(root).not.toContainText('缺少批次货龄与生产日期');
    await expect(root.getByRole('alert')).toHaveCount(0);
    assert.deepEqual(errors, []);
  });

test('FC cycle dialog applies one setting to its card and fresh ten-row pages', async (t) => {
  const { frame, calls, errors, page } = await mount(t, 'fc', 390, (query, result) => {
    if (query.queryId === 'replenishment.summary')
      Object.assign(result.rows[0], {
        recommended_qty: 10 * (query.parameters.cycle_days + 3) - 20,
      });
    return result;
  });
  const trigger = frame.getByRole('button', { name: '补货周期配置', exact: true });
  const card = frame.locator('.kpi-card').filter({ hasText: '待补货量' });
  await expect(card.locator('.kpi-value')).toHaveText('80箱');
  await expect(trigger).toContainText('7天（默认）');
  await trigger.click();
  const modal = frame.getByRole('dialog', { name: '补货周期配置', exact: true });
  const input = modal.getByRole('spinbutton', { name: '补货周期（天）', exact: true });
  await input.fill('14');
  await modal.getByRole('button', { name: '取消', exact: true }).click();
  await expect(trigger).toContainText('7天（默认）');
  await trigger.click();
  await input.fill('0');
  await modal.getByRole('button', { name: '应用', exact: true }).click();
  await expect(modal).toBeVisible();
  await expect(trigger).toContainText('7天（默认）');
  await input.fill('14');
  const before = calls.length;
  await modal.getByRole('button', { name: '应用', exact: true }).click();
  await expect(modal).toHaveCount(0);
  await expect(trigger).toContainText('14天');
  await expect(card.locator('.kpi-value')).toHaveText('150箱');
  await expect
    .poll(() =>
      calls
        .slice(before)
        .some(
          (query) =>
            query.queryId === 'replenishment.detail.atomic' &&
            query.parameters.cycle_days === 14 &&
            query.parameters.page_size === 10 &&
            query.parameters.offset === 0,
        ),
    )
    .toBe(true);
  await trigger.click();
  await modal.getByRole('button', { name: '恢复默认', exact: true }).click();
  await expect(input).toHaveValue('7');
  await modal.getByRole('button', { name: '应用', exact: true }).click();
  await expect(card.locator('.kpi-value')).toHaveText('80箱');
  await page.setViewportSize({ width: 320, height: 900 });
  await trigger.click();
  const box = await modal.boundingBox();
  assert.ok(box.x >= 0 && box.x + box.width <= 320);
  await page.keyboard.press('Escape');
  await expect(modal).toHaveCount(0);
  assert.deepEqual(errors, []);
});

test('APS intelligent core cards use one compact row on desktop and adapt to split panes', async (t) => {
  const { page, frame, errors } = await mount(t, 'apsplan', 922);
  const grid = frame.locator('.intelligent-core-metric-group .scope-kpi-count-4');
  await expect(grid.locator('.period-kpi-card')).toHaveCount(4);
  for (const [width, columns] of [
    [1280, 4],
    [922, 4],
    [800, 4],
    [768, 4],
    [560, 2],
    [480, 2],
    [390, 1],
    [320, 1],
  ]) {
    await page.setViewportSize({ width, height: 900 });
    const layout = await grid.evaluate((el) => ({
      columns: getComputedStyle(el).gridTemplateColumns.split(' ').length,
      viewport: innerWidth,
      scroll: document.documentElement.scrollWidth,
      cards: [...el.children].map((card) => {
        const r = card.getBoundingClientRect();
        return {
          top: r.top,
          left: r.left,
          right: r.right,
          height: r.height,
          width: r.width,
          scroll: card.scrollWidth,
        };
      }),
    }));
    assert.equal(layout.columns, columns, `column count at ${width}`);
    assert.ok(layout.scroll <= layout.viewport + 2, `page overflow at ${width}`);
    assert.ok(
      layout.cards.every(
        (card) => card.left >= 0 && card.right <= width + 1 && card.scroll <= card.width + 2,
      ),
      `card content clips at ${width}`,
    );
    if (columns === 4) {
      assert.equal(new Set(layout.cards.map((card) => Math.round(card.top))).size, 1);
      assert.ok(
        layout.cards.every((card) => card.height <= 210),
        'core cards must be compact',
      );
    }
    if (process.env.AGENT_COMPACT_EVIDENCE) {
      await mkdir(process.env.AGENT_COMPACT_EVIDENCE, { recursive: true });
      await page.screenshot({ path: `${process.env.AGENT_COMPACT_EVIDENCE}/aps-${width}.png` });
    }
  }
  assert.deepEqual(errors, []);
});

test('QLL overview fits five compact cards in a wide row and adapts without clipping', async (t) => {
  const { page, frame, errors } = await mount(t, 'qll', 922);
  const grid = frame.locator('[data-overview-cards="qll"]');
  await expect(grid.getByRole('button')).toHaveCount(5);
  for (const [width, columns] of [
    [1280, 5],
    [1000, 5],
    [922, 5],
    [880, 5],
    [800, 5],
    [768, 3],
    [640, 3],
    [560, 3],
    [480, 2],
    [400, 2],
    [390, 2],
    [320, 1],
  ]) {
    await page.setViewportSize({ width, height: 900 });
    const layout = await grid.evaluate((el) => ({
      columns: getComputedStyle(el).gridTemplateColumns.split(' ').length,
      scroll: document.documentElement.scrollWidth,
      cards: [...el.children].map((card) => {
        const r = card.getBoundingClientRect();
        return {
          top: r.top,
          left: r.left,
          right: r.right,
          width: r.width,
          height: r.height,
          scroll: card.scrollWidth,
        };
      }),
    }));
    assert.equal(layout.columns, columns, `QLL column count at ${width}`);
    assert.ok(layout.scroll <= width + 2, `QLL page overflow at ${width}`);
    assert.ok(
      layout.cards.every(
        (card) => card.left >= 0 && card.right <= width + 1 && card.scroll <= card.width + 2,
      ),
      `QLL card clips at ${width}`,
    );
    assert.ok(
      layout.cards.every((card) => card.height <= 145),
      `QLL cards too tall at ${width}`,
    );
    if (columns === 5)
      assert.equal(new Set(layout.cards.map((card) => Math.round(card.top))).size, 1);
    if (process.env.AGENT_COMPACT_EVIDENCE) {
      await mkdir(process.env.AGENT_COMPACT_EVIDENCE, { recursive: true });
      await page.screenshot({ path: `${process.env.AGENT_COMPACT_EVIDENCE}/qll-${width}.png` });
    }
  }
  assert.deepEqual(errors, []);
});

test('AQKC overview fits five compact cards in a wide row and adapts without clipping', async (t) => {
  const { page, frame, errors } = await mount(t, 'aqkc', 922, (query, result) => {
    if (query.queryId === 'calendar.target_versions')
      return {
        ...result,
        rows: [{ month: '2026-10-01', inventory_version: '月初', source_rows: 1 }],
      };
    return result;
  });
  const grid = frame.locator('[data-overview-cards="aqkc"]');
  await expect(grid.locator('article')).toHaveCount(5);
  for (const [width, columns] of [
    [1280, 5],
    [1000, 5],
    [922, 5],
    [880, 5],
    [800, 5],
    [768, 3],
    [640, 3],
    [560, 3],
    [480, 2],
    [400, 2],
    [390, 2],
    [320, 1],
  ]) {
    await page.setViewportSize({ width, height: 900 });
    const layout = await grid.evaluate((el) => ({
      columns: getComputedStyle(el).gridTemplateColumns.split(' ').length,
      scroll: document.documentElement.scrollWidth,
      cards: [...el.children].map((card) => {
        const r = card.getBoundingClientRect();
        return {
          top: r.top,
          left: r.left,
          right: r.right,
          width: r.width,
          height: r.height,
          scroll: card.scrollWidth,
        };
      }),
    }));
    assert.equal(layout.columns, columns, `AQKC column count at ${width}`);
    assert.ok(layout.scroll <= width + 2, `AQKC page overflow at ${width}`);
    assert.ok(
      layout.cards.every(
        (card) => card.left >= 0 && card.right <= width + 1 && card.scroll <= card.width + 2,
      ),
      `AQKC card clips at ${width}`,
    );
    assert.ok(
      layout.cards.every((card) => card.height <= 145),
      `AQKC cards too tall at ${width}`,
    );
    if (columns === 5)
      assert.equal(new Set(layout.cards.map((card) => Math.round(card.top))).size, 1);
    if (process.env.AGENT_COMPACT_EVIDENCE) {
      await mkdir(process.env.AGENT_COMPACT_EVIDENCE, { recursive: true });
      await page.screenshot({ path: `${process.env.AGENT_COMPACT_EVIDENCE}/aqkc-${width}.png` });
    }
  }
  assert.deepEqual(errors, []);
});

function fcWorkflowRows(query, result) {
  const detail = /^(replenishment|transfer_plan)\.detail(?:\.atomic)?$/.test(query.queryId);
  const values = (index) => ({
    warehouse_code: '001',
    warehouse_name: '上海分仓',
    sku: `sku-A-${String(index).padStart(3, '0')}`,
    material_name: '测试商品',
    page_scope_total: 21,
    page_row_present: 1,
    total: 21,
    row_count: 21,
    inventory_qty: 25,
    available_qty: 20,
    open_transfer_reported_qty: 0,
    recommended_qty: query.queryId.endsWith('.summary') ? 105 : 5,
    month_out_plan: 31,
    warehouse_month_transfer_plan: 62,
    plan_month: '2026-10-01',
    month_ship_positive: 10,
    forecast_turnover_days: 20,
    calculation_daily: 1,
    day: query.parameters.as_of ?? '2026-10-19',
  });
  const source =
    result.rows[0] ?? Object.fromEntries(result.returnedColumns.map((column) => [column, null]));
  const rows = detail
    ? Array.from(
        { length: Math.min(query.parameters.page_size, 21 - query.parameters.offset) },
        (_, index) => {
          const known = values(query.parameters.offset + index);
          return Object.fromEntries(
            Object.entries(source).map(([key, value]) => [
              key,
              Object.hasOwn(known, key) ? known[key] : value,
            ]),
          );
        },
      )
    : result.rows.map((row) => {
        const known = values(0);
        return Object.fromEntries(
          Object.entries(row).map(([key, value]) => [
            key,
            Object.hasOwn(known, key) ? known[key] : value,
          ]),
        );
      });
  return { ...result, rows };
}

test('FC restored quantity draft survives server paging and submits a real workbook', async (t) => {
  const { frame, page, calls, errors } = await mount(t, 'fc', 1280, fcWorkflowRows);
  const list = frame.getByRole('region', { name: '补货确认', exact: true });
  await expect(list.locator('tbody tr')).toHaveCount(10);
  assert.equal(
    calls.find((query) => query.queryId === 'replenishment.detail.atomic').parameters.page_size,
    10,
  );
  await list.getByRole('spinbutton', { name: 'sku-A-000实际补货量', exact: true }).fill('13');
  await list.getByRole('textbox', { name: 'sku-A-000调整原因', exact: true }).fill('补充订单');
  await list.getByRole('button', { name: '下一页', exact: true }).click();
  await expect(
    list.getByRole('spinbutton', { name: 'sku-A-010实际补货量', exact: true }),
  ).toBeVisible();
  assert.ok(
    calls.some(
      (query) => query.queryId === 'replenishment.detail.atomic' && query.parameters.offset === 10,
    ),
  );
  await list.getByRole('button', { name: '上一页', exact: true }).click();
  await expect(
    list.getByRole('spinbutton', { name: 'sku-A-000实际补货量', exact: true }),
  ).toHaveValue('13');
  await list.getByRole('button', { name: '草稿（1）', exact: true }).click();
  const draft = frame.getByRole('dialog', { name: '补货草稿', exact: true });
  await expect(draft.getByRole('spinbutton')).toHaveValue('13');
  await draft.getByRole('button', { name: '取消', exact: true }).click();
  await list.getByRole('button', { name: '提交', exact: true }).click();
  const confirmation = frame.getByRole('dialog', { name: '确认导出补货清单', exact: true });
  await expect(confirmation).toContainText('21个SKU');
  const downloaded = page.waitForEvent('download');
  await confirmation.getByRole('button', { name: '确认导出', exact: true }).click();
  const file = await downloaded;
  assert.match(file.suggestedFilename(), /DMS补货.*\.xlsx$/);
  const { unzipWorkbook } =
    await import('../business/inventory-fc/source/inventory-light-plugins/src/dsh-ui/workbook.ts');
  const content = await unzipWorkbook(new Uint8Array(await readFile(await file.path())).buffer);
  const sheet = new TextDecoder().decode(content.get('xl/worksheets/sheet1.xml'));
  assert.equal((sheet.match(/<row /g) ?? []).length, 22);
  assert.match(sheet, /商品编码/);
  assert.match(sheet, /数量/);
  assert.doesNotMatch(sheet, /分仓编码/);
  assert.match(sheet, /<v>13<\/v>/);
  await expect(list.getByRole('button', { name: '草稿（0）', exact: true })).toBeVisible();
  assert.deepEqual(errors, []);
});

test('FC restores real plan template, validates warehouse scope and applies an import trial', async (t) => {
  const { frame, page, errors } = await mount(t, 'fc', 1280, fcWorkflowRows);
  await frame.getByRole('button', { name: '分仓计划', exact: true }).click();
  const list = frame.getByRole('region', { name: '分仓计划', exact: true });
  await expect(list.locator('tbody tr')).toHaveCount(10);
  await list.getByRole('button', { name: '下载模板', exact: true }).click();
  const template = frame.getByRole('dialog', { name: '下载分仓计划模板', exact: true });
  await template
    .getByRole('combobox', { name: '模板计划月份', exact: true })
    .selectOption('2026-10');
  const downloaded = page.waitForEvent('download');
  await template.getByRole('button', { name: '下载模板', exact: true }).click();
  const file = await downloaded;
  const { workbookBytes, unzipWorkbook } =
    await import('../business/inventory-fc/source/inventory-light-plugins/src/dsh-ui/workbook.ts');
  const content = await unzipWorkbook(new Uint8Array(await readFile(await file.path())).buffer);
  const sheet = new TextDecoder().decode(content.get('xl/worksheets/sheet1.xml'));
  assert.match(sheet, /仓库编号/);
  assert.match(sheet, />001</, 'warehouse leading zeros must survive the template');
  assert.equal(
    (sheet.match(/<row /g) ?? []).length,
    22,
    'download must include all 21 filtered rows',
  );
  const headers = [
    '仓库编号',
    '仓库名称',
    '月份',
    'SKU编码',
    '产品名称',
    '本月出货计划',
    '本月调拨计划',
  ];
  const upload = list.getByLabel('导入分仓计划Excel');
  await upload.setInputFiles({
    name: '错误分仓.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: Buffer.from(
      workbookBytes([headers, ['999', '未知仓', '2026-10', 'sku-A-000', '测试商品', 310, 620]]),
    ),
  });
  const preview = frame.getByRole('dialog', { name: 'Excel 导入校验与预览', exact: true });
  await expect(preview.getByRole('alert')).toContainText('不在当前有权限的分仓计划范围内');
  await expect(preview.getByRole('button', { name: '确认导入并重算', exact: true })).toBeDisabled();
  await preview.getByRole('button', { name: '取消', exact: true }).click();
  await upload.setInputFiles({
    name: '分仓计划.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: Buffer.from(
      workbookBytes([headers, ['001', '上海分仓', '2026-10', 'sku-A-000', '测试商品', 310, 620]]),
    ),
  });
  await expect(preview).toContainText('310');
  await preview.getByRole('button', { name: '确认导入并重算', exact: true }).click();
  await expect(preview).toHaveCount(0);
  await expect(list.locator('tbody tr').first()).toContainText('310');
  await expect(list.locator('tbody tr').first()).toContainText('620');
  const card = frame
    .locator('[data-overview-cards="fc"] article')
    .filter({ has: frame.getByText('待补货量', { exact: true }) });
  await expect(card.locator('.kpi-value')).toHaveText('180箱');
  await frame.getByRole('button', { name: '补货确认', exact: true }).click();
  await expect(
    frame.getByRole('spinbutton', { name: 'sku-A-000实际补货量', exact: true }),
  ).toHaveValue('80');
  assert.deepEqual(errors, []);
});

test('FC overview fits five compact cards in a wide row and adapts without clipping', async (t) => {
  const { page, frame, errors } = await mount(t, 'fc', 922, fcWorkflowRows);
  const grid = frame.locator('[data-overview-cards="fc"]');
  await expect(grid.locator('article')).toHaveCount(5);
  for (const [width, columns] of [
    [1280, 5],
    [1000, 5],
    [922, 5],
    [880, 5],
    [800, 5],
    [768, 3],
    [640, 3],
    [560, 3],
    [480, 2],
    [400, 2],
    [390, 2],
    [320, 1],
  ]) {
    await page.setViewportSize({ width, height: 900 });
    const layout = await grid.evaluate((el) => ({
      columns: getComputedStyle(el).gridTemplateColumns.split(' ').length,
      scroll: document.documentElement.scrollWidth,
      cards: [...el.children].map((card) => {
        const r = card.getBoundingClientRect();
        return {
          top: r.top,
          left: r.left,
          right: r.right,
          width: r.width,
          height: r.height,
          scroll: card.scrollWidth,
        };
      }),
    }));
    assert.equal(layout.columns, columns, `FC column count at ${width}`);
    assert.ok(layout.scroll <= width + 2, `FC page overflow at ${width}`);
    assert.ok(
      layout.cards.every(
        (card) => card.left >= 0 && card.right <= width + 1 && card.scroll <= card.width + 2,
      ),
      `FC card clips at ${width}`,
    );
    assert.ok(
      layout.cards.every((card) => card.height <= 145),
      `FC cards too tall at ${width}`,
    );
    if (columns === 5)
      assert.equal(new Set(layout.cards.map((card) => Math.round(card.top))).size, 1);
    if (process.env.AGENT_COMPACT_EVIDENCE) {
      await mkdir(process.env.AGENT_COMPACT_EVIDENCE, { recursive: true });
      await page.screenshot({ path: `${process.env.AGENT_COMPACT_EVIDENCE}/fc-${width}.png` });
    }
  }
  assert.deepEqual(errors, []);
});

test('FC refused export reads never download a partial file or retry authorization', async (t) => {
  const { frame, page, calls, errors } = await mount(t, 'fc', 1280, (query, result) => {
    if (query.queryId === 'replenishment.detail.atomic' && query.parameters.page_size === 100)
      return { failure: { reasonCode: 'NO_RETURN_COLUMN_ALLOWED', message: '当前无导出字段权限' } };
    return fcWorkflowRows(query, result);
  });
  let downloads = 0;
  page.on('download', () => downloads++);
  const list = frame.getByRole('region', { name: '补货确认', exact: true });
  await expect(list.locator('tbody tr')).toHaveCount(10);
  await list.getByRole('button', { name: 'CSV', exact: true }).click();
  await expect(frame.locator('.fc-workflow-notice')).toContainText('当前无导出字段权限');
  assert.equal(downloads, 0);
  assert.equal(
    calls.filter(
      (query) =>
        query.queryId === 'replenishment.detail.atomic' && query.parameters.page_size === 100,
    ).length,
    1,
  );
  assert.deepEqual(errors, []);
});

test('FC DMS export keeps warehouses separate and preserves another warehouse draft', async (t) => {
  const { frame, page, errors } = await mount(t, 'fc', 1280, (query, result) => {
    const value = fcWorkflowRows(query, result);
    if (query.queryId.startsWith('replenishment.detail'))
      value.rows = value.rows.map((row) => {
        const second = Number(String(row.sku).slice(-3)) >= 10;
        return {
          ...row,
          warehouse_code: second ? '002' : '001',
          warehouse_name: second ? '北京分仓' : '上海分仓',
        };
      });
    return value;
  });
  const list = frame.getByRole('region', { name: '补货确认', exact: true });
  await expect(list.locator('tbody tr')).toHaveCount(10);
  await list.getByRole('spinbutton', { name: 'sku-A-000实际补货量', exact: true }).fill('13');
  await list.getByRole('button', { name: '下一页', exact: true }).click();
  await list.getByRole('spinbutton', { name: 'sku-A-010实际补货量', exact: true }).fill('17');
  await list.getByRole('button', { name: '提交', exact: true }).click();
  const confirmation = frame.getByRole('dialog', { name: '确认导出补货清单', exact: true });
  await expect(confirmation.getByRole('button', { name: '确认导出', exact: true })).toBeDisabled();
  await confirmation
    .getByRole('combobox', { name: '导出补货分仓', exact: true })
    .selectOption('001');
  await expect(confirmation).toContainText('10个SKU');
  const downloaded = page.waitForEvent('download');
  await confirmation.getByRole('button', { name: '确认导出', exact: true }).click();
  const file = await downloaded;
  assert.match(file.suggestedFilename(), /DMS补货-上海分仓/);
  const { unzipWorkbook } =
    await import('../business/inventory-fc/source/inventory-light-plugins/src/dsh-ui/workbook.ts');
  const content = await unzipWorkbook(new Uint8Array(await readFile(await file.path())).buffer);
  const sheet = new TextDecoder().decode(content.get('xl/worksheets/sheet1.xml'));
  assert.equal((sheet.match(/<row /g) ?? []).length, 11);
  assert.doesNotMatch(sheet, /sku-A-010/);
  await expect(list.getByRole('button', { name: '草稿（1）', exact: true })).toBeVisible();
  await expect(
    list.getByRole('spinbutton', { name: 'sku-A-010实际补货量', exact: true }),
  ).toHaveValue('17');
  assert.deepEqual(errors, []);
});

test('FC list filters align compact white controls, retain actions and adapt to narrow panes', async (t) => {
  const { page, frame, calls, errors } = await mount(t, 'fc', 1280, fcWorkflowRows);
  const toolbar = frame.locator('[data-business-filters="fc"]');
  await expect(toolbar).toBeVisible();
  for (const tab of ['补货确认', '分仓计划', '当前订单']) {
    await frame.getByRole('button', { name: tab, exact: true }).first().click();
    for (const width of [1280, 922, 768, 560, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      const layout = await toolbar.evaluate((el) => {
        const box = (node) => {
          const r = node.getBoundingClientRect();
          return {
            left: r.left,
            right: r.right,
            height: r.height,
            background: getComputedStyle(node).backgroundColor,
          };
        };
        return {
          controls: [
            ...el.querySelectorAll(
              ':scope > label > input:not([type="file"]), :scope > button, :scope > details > summary',
            ),
          ].map(box),
          fields: [...el.querySelectorAll(':scope > label > input:not([type="file"])')].map(box),
          toolbar: box(el),
          scroll: document.documentElement.scrollWidth,
        };
      });
      assert.ok(layout.scroll <= width + 2, `${tab}: horizontal overflow at ${width}`);
      assert.ok(
        layout.controls.every((control) => Math.abs(control.height - 36) <= 1),
        `${tab}: unequal control heights at ${width}`,
      );
      assert.ok(
        layout.controls.every((control) => control.left >= 0 && control.right <= width + 1),
        `${tab}: filter/action clips at ${width}`,
      );
      assert.ok(
        layout.fields.every((control) => control.background === 'rgb(255, 255, 255)'),
        'inputs use a white surface',
      );
      if (width >= 768)
        assert.ok(
          layout.fields.every((control) => control.right - control.left <= 136),
          'desktop fields remain compact',
        );
      const columns = toolbar.locator('summary[aria-label="列设置"]');
      await columns.click();
      const menu = await toolbar.locator('details > div').boundingBox();
      assert.ok(
        menu && menu.x >= 0 && menu.x + menu.width <= width + 1,
        `column menu clips at ${width}`,
      );
      await columns.click();
      if (process.env.AGENT_FILTER_EVIDENCE && tab === '补货确认') {
        await mkdir(process.env.AGENT_FILTER_EVIDENCE, { recursive: true });
        await toolbar.scrollIntoViewIfNeeded();
        await page.screenshot({
          path: `${process.env.AGENT_FILTER_EVIDENCE}/fc-filters-${width}.png`,
        });
      }
    }
  }
  await frame.getByRole('button', { name: '补货确认', exact: true }).click();
  await expect(
    frame.getByRole('region', { name: '补货确认', exact: true }).locator('tbody tr'),
  ).toHaveCount(10);
  const before = calls.length;
  await toolbar.getByRole('textbox', { name: '分仓编码', exact: true }).fill('001');
  assert.equal(calls.length, before, 'typing does not query');
  await toolbar.getByRole('button', { name: '查询', exact: true }).click();
  await expect
    .poll(() =>
      calls.some(
        (query) =>
          query.queryId === 'replenishment.detail.atomic' &&
          query.parameters.warehouse_code === '001',
      ),
    )
    .toBe(true);
  await expect(toolbar.getByRole('button', { name: '草稿（0）', exact: true })).toBeVisible();
  await expect(toolbar.getByRole('button', { name: '提交', exact: true })).toBeVisible();
  await expect(toolbar.getByRole('button', { name: 'CSV', exact: true })).toBeVisible();
  assert.deepEqual(errors, []);
});

for (const [inventory, inTransit, stockDays] of [
  [12060, 2412, 18],
  [0, 0, 0],
  [null, null, null],
])
  test(`QLL channel switch exposes customer summary and ten-row customer paging: ${inventory}`, async (t) => {
    const { page, frame, calls, errors } = await mount(t, 'qll', 1280, (query, result) => {
      if (query.queryId === 'dealer.stock.summary')
        Object.assign(result.rows[0], { inventory, in_transit: inTransit, cover_days: stockDays });
      return result;
    });
    const grid = frame.locator('[data-overview-cards="qll"]');
    const stock = grid
      .getByRole('button')
      .filter({ has: frame.getByText('当前库存', { exact: true }) });
    const turnover = grid
      .getByRole('button')
      .filter({ has: frame.getByText('库存周转', { exact: true }) });
    await expect(stock.getByText('客户在仓', { exact: true })).toHaveCount(0);
    await expect(stock).toContainText('5,580');
    assert.equal(
      calls.filter((q) => q.queryId === 'dealer.stock.summary').length,
      0,
      'disabled channel does not load the customer summary',
    );
    await frame.getByRole('checkbox', { name: '含渠道', exact: true }).check();
    await expect
      .poll(() => calls.filter((q) => q.queryId === 'dealer.stock.summary').length)
      .toBe(1);
    const summaryReads = 1;
    const value = (card, label) =>
      card
        .locator('dl > div')
        .filter({ has: frame.getByText(label, { exact: true }) })
        .locator('dd');
    await expect(value(stock, '客户在仓')).toHaveText(
      inventory === null ? '-' : inventory === 0 ? '0箱' : '1.21万箱',
    );
    await expect(value(stock, '客户在途')).toHaveText(
      inTransit === null ? '-' : inTransit === 0 ? '0箱' : '2,412箱',
    );
    await expect(value(turnover, '客户库存支撑')).toHaveText(
      stockDays === null ? '-' : stockDays === 0 ? '0.0天' : '18.0天',
    );
    const customerLayer = frame
      .locator('section')
      .filter({ has: frame.getByRole('button', { name: '渠道库存明细', exact: true }) })
      .last();
    await expect(
      customerLayer.getByRole('button', { name: '渠道库存明细', exact: true }),
    ).toHaveAttribute('aria-expanded', 'true');
    await expect(customerLayer.locator('tbody tr')).toHaveCount(10);
    await expect(customerLayer.locator('tbody tr').first()).toContainText('客户A');
    const before = calls.length;
    await customerLayer.getByRole('button', { name: '下一页', exact: true }).click();
    await expect
      .poll(() =>
        calls
          .slice(before)
          .some(
            (q) =>
              q.queryId.startsWith('dealer.stock.detail') &&
              q.parameters.offset === 10 &&
              q.parameters.page_size === 10,
          ),
      )
      .toBe(true);
    assert.equal(
      calls.filter((q) => q.queryId === 'dealer.stock.summary').length,
      summaryReads,
      'customer pagination reuses the loaded SQL summary',
    );
    for (const width of [1280, 560, 480, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      const layout = await grid.evaluate((el) => ({
        viewport: innerWidth,
        scroll: document.documentElement.scrollWidth,
        cards: [...el.children].map((card) => ({
          width: card.clientWidth,
          scroll: card.scrollWidth,
          height: card.getBoundingClientRect().height,
        })),
      }));
      assert.ok(layout.scroll <= layout.viewport + 2, `channel page overflow at ${width}`);
      assert.ok(
        layout.cards.every((c) => c.scroll <= c.width + 2 && c.height <= 180),
        `channel card overflow at ${width}`,
      );
    }
    await frame.getByRole('checkbox', { name: '含渠道', exact: true }).uncheck();
    await expect(stock.getByText('客户在仓', { exact: true })).toHaveCount(0);
    await expect(frame.getByRole('button', { name: '渠道库存明细', exact: true })).toHaveCount(0);
    assert.deepEqual(errors, []);
  });

test('FC actual quantity can clear zero, type a replacement and retain decimal drafts', async (t) => {
  const { frame, errors } = await mount(t, 'fc', 1280, (query, result) => {
    if (query.queryId.startsWith('replenishment.'))
      for (const row of result.rows) {
        row.recommended_qty = 0;
        row.warehouse_code = 'W01';
        row.warehouse_name = '分仓1';
      }
    return result;
  });
  const input = frame.getByRole('spinbutton', { name: /实际补货量/ }).first();
  await expect(input).toHaveValue('0');
  await input.focus();
  await input.press('Backspace');
  await expect(input).toHaveValue('');
  await input.pressSequentially('100');
  await expect(input).toHaveValue('100');
  await input.blur();
  await expect(input).toHaveValue('100');
  await input.fill('12.5');
  await input.blur();
  await expect(input).toHaveValue('12.5');
  await input.fill('');
  await expect(input).toHaveValue('');
  await input.blur();
  await expect(input).toHaveValue('0');
  assert.deepEqual(errors, []);
});
