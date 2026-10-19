import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdir } from './helpers/prepared-assets.mjs';
import { chromium, expect } from '@playwright/test';
import { configuredPageHtml, configuredWire } from './fixtures/configured-page.mjs';
const styles = (
  await Promise.all(['theme/tokens.css', 'theme/html-defaults.css'].map((p) => readFile(p, 'utf8')))
).join('\n');
async function mount(t, id, width) {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width, height: 900 } }),
    errors = [],
    calls = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const html = await configuredPageHtml(id),
    wire = await configuredWire(id);
  await page.exposeFunction('queryLayoutFixture', async (message) => {
    if (message.method === 'sql') {
      calls.push(message.parameters);
      return wire(message.parameters);
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
