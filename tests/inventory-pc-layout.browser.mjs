import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { build } from 'esbuild';
import { chromium, expect } from '@playwright/test';
const presentation=process.env.INVENTORY_LAYOUT_BASELINE==='1'?execFileSync('git',['show','1078d8d1a2a8002d0fae18f994531d89f5970877:src/html-document.ts'],{encoding:'utf8'}):await readFile('src/html-document.ts','utf8');
const moduleText = (await build({stdin:{contents:presentation,loader:'ts'},bundle:true,write:false,format:'esm',platform:'node'})).outputFiles[0].text;
const {presentHtml} = await import('data:text/javascript;base64,'+Buffer.from(moduleText).toString('base64'));
const injectText=(await build({entryPoints:['src/page-interaction/inject.ts'],bundle:true,write:false,format:'esm',platform:'node'})).outputFiles[0].text;
const {injectPicker}=await import('data:text/javascript;base64,'+Buffer.from(injectText).toString('base64'));
const picker=(await build({entryPoints:['src/page-interaction/page.ts'],bundle:true,write:false,format:'iife',platform:'browser'})).outputFiles[0].text;
const coreTheme=(await Promise.all(['base.css','design-platform.css'].map(name=>readFile('../../official-latest-standard/packages/client/ui-theme/src/styles/'+name,'utf8')))).join('\n');
const evidence=process.env.INVENTORY_LAYOUT_EVIDENCE;
async function fixture(t,id,width=559,theme='light') {
  const browser=await chromium.launch({channel:'chrome',headless:true});
  t.after(()=>browser.close());
  const page=await browser.newPage({viewport:{width:width+721,height:820},deviceScaleFactor:1});
  const authored=await readFile(`lib/business/inventory-${id}/index.html`,'utf8');
  const html=process.env.INVENTORY_LAYOUT_AUTHORED==='1'?authored:presentHtml(injectPicker(authored,picker),await readFile('theme/tokens.css','utf8'));
  const network=[],errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>{
    const url=new URL(route.request().url());
    if(url.hostname!=='inventory-layout.test'){network.push(url.href);return route.abort();}
    return route.fulfill({contentType:'text/html',body:url.pathname==='/author'?html:`<!doctype html><meta charset="utf-8"><style>${coreTheme}html,body{margin:0;height:100%;overflow:hidden}#menu{position:absolute;width:280px;height:100%;background:#eee}iframe{position:absolute;left:280px;width:${width}px;height:820px;border:0}#chat{position:absolute;left:${width+280}px;width:440px;height:100%;background:#eee}</style><body ${theme==='dark'?'data-ds-dark-theme':''}><aside id="menu">菜单</aside><iframe sandbox="allow-scripts" src="/author"></iframe><aside id="chat">当前会话</aside><script>
    const frame=document.querySelector('iframe');let connected=false;window.requests=[];
    window.addEventListener('message',event=>{
      if(event.source!==frame.contentWindow)return;
      const data=event.data;
      if(data?.protocol==='gea-html-v2'&&data.type==='ready'&&!connected){connected=true;const pair=new MessageChannel();pair.port1.onmessage=event=>{const message=event.data;window.requests.push(message);if(message.type==='request')pair.port1.postMessage({type:'response',id:message.id,result:{accepted:true}});if(message.type==='theme:subscribe'){const style=getComputedStyle(document.body);const tokens=${process.env.INVENTORY_LAYOUT_CORE_TOKENS==='1'?"Object.fromEntries([...style].filter(name=>name.startsWith('--dsw-')).map(name=>[name,style.getPropertyValue(name)]))":"{}"};pair.port1.postMessage({type:'theme',version:'1.1.1',context:{session:'layout-session',plugin:'inventory-${id}'},colorScheme:'${theme}',fontSize:14,tokens});}};frame.contentWindow.postMessage({protocol:'gea-html-v2',type:'connect',context:{session:'layout-session',plugin:'inventory-${id}'}},'*',[pair.port2]);}
      if(data?.protocol==='dsh-workbench-view-v1'&&data.type==='ready')frame.contentWindow.postMessage({protocol:'dsh-workbench-view-v1',type:'restore',page:'inventory-${id}',version:1,channel:'layout-view',generation:1,state:{version:1}},'*');
    });</script>`});
  });
  await page.goto('http://inventory-layout.test/');
  const frame=page.frameLocator('iframe');
  t.after(async()=>{assert.deepEqual(network,[]);assert.deepEqual(errors,[]);});
  return {page,frame};
}
test('dealer metrics retain their authored grid in the PC split panel',async t=>{
  const {page,frame}=await fixture(t,'dealer');
  const metrics=frame.locator('[aria-label="库存总览指标"]');
  await expect(metrics).toContainText('12,060');
  assert.equal(await frame.locator('body').evaluate(()=>document.compatMode),'CSS1Compat');
  const positions=await metrics.locator('button').evaluateAll(buttons=>buttons.map(el=>el.getBoundingClientRect().x));
  assert.ok(new Set(positions).size>=2,'dealer metric cards use the original two-column 559px layout');
  const health=frame.locator('[aria-label="库存健康度指标"]');
  assert.ok((await health.locator('h3').first().boundingBox()).height<40,'health labels remain readable');
  if(evidence)await page.screenshot({path:evidence+'/dealer-559.png'});
  await metrics.getByRole('button').first().click();
  await expect(frame.getByRole('dialog')).toBeVisible();
  if(evidence)await page.screenshot({path:evidence+'/dealer-dialog-559.png'});
});
for(const theme of ['light','dark'])test(`personal monitoring and feedback remain readable in PC panels with ${theme} theme`,async t=>{
  const {page,frame}=await fixture(t,'personal',540,theme);
  for(const width of [540,800,1200]){
    await page.setViewportSize({width:width+721,height:820});
    await page.locator('iframe').evaluate((el,width)=>el.style.width=width+'px',width);
    await page.locator('#chat').evaluate((el,width)=>el.style.left=(width+280)+'px',width);
    await expect(frame.locator('main[data-page-reference-ready="true"]')).toBeVisible();
    await expect(frame.locator('#app')).toContainText('今日优先处理事项');
    const paint=await frame.locator('main[data-page-reference-ready="true"]').evaluate(el=>({bodyDark:document.body.hasAttribute('data-ds-dark-theme'),background:getComputedStyle(el).backgroundColor,color:getComputedStyle(el).color}));
    if(evidence){await mkdir(evidence,{recursive:true});await writeFile(evidence+`/personal-${width}-${theme}-paint.json`,JSON.stringify(paint,null,2));}
    assert.equal(paint.bodyDark,theme==='dark');
    assert.notEqual(paint.background,'rgba(0, 0, 0, 0)','personal page keeps an opaque theme surface with builtin Core theme');
    if(process.env.INVENTORY_LAYOUT_CORE_TOKENS!=='1')assert.equal(paint.background,theme==='dark'?'rgb(27, 29, 33)':'rgb(247, 248, 250)','builtin Core theme uses the shared Workbench surface when no overrides are supplied');
    assert.equal(await frame.locator('body').evaluate(()=>document.compatMode),'CSS1Compat');
    const metrics=frame.locator('[aria-label="关注的指标情况"]');
    await expect(metrics.locator('button')).toHaveCount(5);
    assert.ok((await metrics.locator('button').first().boundingBox()).width>=120);
    await metrics.locator('button').last().scrollIntoViewIfNeeded();
    await expect(metrics.locator('button').last()).toBeInViewport();
    await metrics.locator('button').first().scrollIntoViewIfNeeded();
    if(evidence)await page.screenshot({path:evidence+`/personal-${width}-${theme}.png`});
    await frame.getByRole('button',{name:'补充进展',exact:true}).first().press('Enter');
    const dialog=frame.getByRole('dialog');await expect(dialog).toBeVisible();
    const box=await dialog.boundingBox(),iframe=await page.locator('iframe').boundingBox();
    assert.ok(box.x>=iframe.x&&box.x+box.width<=iframe.x+iframe.width+1,'feedback stays inside the actual business panel');
    assert.ok(box.y>=iframe.y&&box.y+box.height<=iframe.y+iframe.height+1,'feedback controls stay inside the PC viewport');
    await dialog.locator('textarea').fill('保留原稿。核对库存后补充进展。');
    await expect(dialog.getByRole('button',{name:'插入未发送草稿',exact:true})).toBeEnabled();
    if(evidence)await page.screenshot({path:evidence+`/personal-dialog-${width}-${theme}.png`});
    await dialog.getByRole('button',{name:'关闭',exact:true}).click();
    await expect(dialog).toBeHidden();
  }
});
test('full-chain content is readable and scrollable in the actual 559px PC panel',async t=>{
  const {page,frame}=await fixture(t,'qll');
  await expect(frame.locator('#app')).toContainText('5,580');
  await expect.poll(()=>page.evaluate(()=>window.requests.filter(m=>m.method==='context').at(-1)?.parameters.parts?.queryState?.state)).toBe('ready');
  const geometry=await frame.locator('#app').evaluate(app=>{
    const main=app.querySelector('main'),s=getComputedStyle(main);
    const rules=[];function scan(rs){for(const r of rs){if(r.selectorText&&main.matches(r.selectorText))rules.push(r.cssText);if(r.cssRules)scan(r.cssRules);}}
    for(const sheet of document.styleSheets)scan(sheet.cssRules);
    const hit=document.elementFromPoint(250,400);return {compatMode:document.compatMode,app:app.getBoundingClientRect().toJSON(),main:main.getBoundingClientRect().toJSON(),height:s.height,flex:s.flex,hit:hit?.outerHTML.slice(0,400),rules};
  });
  if(evidence){await mkdir(evidence,{recursive:true});await writeFile(evidence+'/qll-geometry.json',JSON.stringify(geometry,null,2));await page.screenshot({path:evidence+'/qll-559.png'});}
  assert.ok(geometry.main.height>650,'the full-chain page must occupy the readable PC panel, not a 60px clipped strip');
  assert.doesNotMatch(geometry.hit,/^<(body|main id="app")/,'the middle of the panel contains business content');
  const trend=frame.getByRole('region',{name:'全链库存趋势与缺口'});
  await trend.getByRole('button',{name:'查询趋势',exact:true}).scrollIntoViewIfNeeded();
  await trend.getByRole('button',{name:'查询趋势',exact:true}).press('Enter');
  await expect(trend).toContainText('缺失期间或层级以断线表示');
  await expect(trend.locator('svg')).toBeVisible();
  assert.ok(await frame.locator('#app').evaluate(app=>[...app.querySelectorAll('*')].some(el=>el.scrollTop>0)),'scrolling reaches the trend below the table');
  if(evidence)await page.screenshot({path:evidence+'/qll-trend-559.png'});
});
