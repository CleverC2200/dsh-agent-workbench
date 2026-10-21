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

for (const id of ['fc', 'qll', 'aqkc', 'apsplan'])
  test(`${id}: original metric layout reflows inside a narrow plugin pane`, async (t) => {
    const { page, frame, errors } = await mount(t, id, 1440, (query, result) => {
      if (query.queryId === 'calendar.target_versions')
        result.rows = [{ month: '2026-10-01', inventory_version: '月初' }];
      return result;
    });
    if (id === 'apsplan')
      await frame.getByRole('button', { name: '智能工作台', exact: true }).click();
    const selector =
      id === 'apsplan'
        ? '.intelligent-core-metric-group .period-kpi-card'
        : id === 'fc'
          ? 'article.kpi-card'
          : id === 'qll'
            ? 'button:has(dl)'
            : 'article:has(dl)';
    const cards = frame.locator(selector);
    await expect(cards.first()).toBeVisible();
    for (const width of [1440, 1024, 768, 560, 390, 320]) {
      // The iframe is the client business pane; the outer desktop remains wide.
      await page.locator('iframe').evaluate((el, w) => {
        el.style.width = `${w}px`;
      }, width);
      const boxes = await cards.evaluateAll((nodes) =>
        nodes.map((el) => {
          const r = el.getBoundingClientRect();
          return { x: r.x, right: r.right, width: r.width, text: el.textContent?.slice(0, 50) };
        }),
      );
      for (const r of boxes) {
        assert.ok(
          r.width >= Math.min(160, width - 48),
          `${id}@${width}: cramped metric ${JSON.stringify(r)}`,
        );
        assert.ok(
          r.x >= -1 && r.right <= width + 1,
          `${id}@${width}: clipped metric ${JSON.stringify(r)}`,
        );
      }
      const overflowingText = await cards.evaluateAll((nodes) =>
        nodes.flatMap((card) =>
          [...card.querySelectorAll('dt, dd, .kpi-name > span, .kpi-foot > *')]
            .filter((el) => el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1)
            .map((el) => el.textContent?.slice(0, 60)),
        ),
      );
      assert.deepEqual(overflowingText, [], `${id}@${width}: truncated metric labels`);
      if (process.env.AGENT_LAYOUT_EVIDENCE && [1440, 768, 390].includes(width)) {
        await mkdir(process.env.AGENT_LAYOUT_EVIDENCE, { recursive: true });
        await page
          .locator('iframe')
          .screenshot({ path: `${process.env.AGENT_LAYOUT_EVIDENCE}/${id}-${width}.png` });
      }
    }
    await cards.last().scrollIntoViewIfNeeded();
    await expect(cards.last()).toBeInViewport();
    assert.deepEqual(errors, []);
  });
test('narrow source table keeps columns, paging and display choices accessible', async (t) => {
  const { page, frame, calls } = await mount(t, 'fc', 1440);
  await page.locator('iframe').evaluate((el) => {
    el.style.width = '320px';
  });
  await expect(frame.locator('table').first()).toBeVisible();
  const before = calls.length;
  await frame.locator('summary').filter({ hasText: '列设置' }).click();
  const choices = frame
    .locator('details')
    .filter({ has: frame.locator('summary').filter({ hasText: '列设置' }) })
    .locator('div')
    .first();
  const box = await choices.boundingBox();
  assert.ok(
    box && box.x >= 0 && box.x + box.width <= 321,
    `clipped column selector: ${JSON.stringify(box)}`,
  );
  const visible = await choices.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    return el.contains(document.elementFromPoint(rect.left + 8, rect.top + 12));
  });
  assert.equal(visible, true, 'column choices must not be clipped by an ancestor');
  await frame.getByRole('button', { name: '显示全部', exact: true }).click();
  assert.equal(calls.length, before, 'display choices do not trigger a data query');
  const table = frame.locator('table').first();
  const scrolled = await table.evaluate((el) => {
    const wrap = el.parentElement;
    wrap.scrollLeft = wrap.scrollWidth;
    return wrap.scrollLeft > 0 && wrap.getBoundingClientRect().right <= innerWidth + 1;
  });
  assert.equal(scrolled, true, 'wide data scrolls inside the table region');
});
