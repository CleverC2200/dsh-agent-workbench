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
const catalogCheck=(await build({stdin:{contents:"import{htmlPageCatalog}from'./src/html-page-catalog.ts';import{validatePageCatalog}from'./src/page-bridge/catalog.ts';window.acceptCurrentCatalog=(elements,plugin)=>{const catalog=htmlPageCatalog({surface:'gea-html-'+plugin,tool:'gea_plugin_page_apply',label:'Current mock page',elements});return catalog===null?null:validatePageCatalog(catalog);};",resolveDir:process.cwd()},bundle:true,write:false,platform:'browser',format:'iife'})).outputFiles[0].text;
const evidence=process.env.INVENTORY_LAYOUT_EVIDENCE;
async function fixture(t,id,width=559,theme='light',authorDocument,fontSize=14) {
  const browser=await chromium.launch({channel:'chrome',headless:true});
  t.after(()=>browser.close());
  const page=await browser.newPage({viewport:{width:width+721,height:820},deviceScaleFactor:1});
  const authored=authorDocument??await readFile(`lib/business/inventory-${id}/index.html`,'utf8');
  const pluginId=['regional','category','mps'].includes(id)?JSON.parse(await readFile(`lib/static/${id}/plugin.json`,'utf8')).id:`inventory-${id}`;
  const htmlStyles=(await Promise.all(['tokens.css','html-defaults.css'].map(name=>readFile('theme/'+name,'utf8')))).join('\n');
  const html=process.env.INVENTORY_LAYOUT_AUTHORED==='1'?authored:presentHtml(injectPicker(authored,picker),htmlStyles);
  const network=[],errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',message=>{if(message.text().startsWith('CATALOG_PARSE_FAILED '))errors.push(message.text());});
  await page.route('**/*',route=>{
    const url=new URL(route.request().url());
    if(url.hostname!=='inventory-layout.test'){network.push(url.href);return route.abort();}
    return route.fulfill({contentType:'text/html',body:url.pathname==='/author'?html:`<!doctype html><meta charset="utf-8"><style>${coreTheme}html,body{margin:0;height:100%;overflow:hidden}#menu{position:absolute;width:280px;height:100%;background:#eee}iframe{position:absolute;left:280px;width:${width}px;height:820px;border:0}#chat{position:absolute;left:${width+280}px;width:440px;height:100%;background:#eee}</style><body ${theme==='dark'?'data-ds-dark-theme':''}><aside id="menu">菜单</aside><iframe sandbox="allow-scripts" src="/author"></iframe><aside id="chat">当前会话</aside><script>
    ${catalogCheck}
    const frame=document.querySelector('iframe');let connected=false;window.requests=[];window.catalogs=[];
    window.addEventListener('message',event=>{
      if(event.source!==frame.contentWindow)return;
      const data=event.data;
      if(data?.protocol==='agent-workbench-theme'&&data.type==='ready'){window.themeReady=true;frame.contentWindow.postMessage({protocol:'agent-workbench-theme',dark:${theme==='dark'},fontSize:${fontSize}},'*');}
      if(data?.protocol==='gea-html-v2'&&data.type==='ready'&&!connected){connected=true;const pair=new MessageChannel();pair.port1.onmessage=event=>{const message=event.data;window.requests.push(message);if(message.type==='catalog'){try{window.acceptCurrentCatalog(message.elements,'${pluginId}');window.catalogs.push(message.elements);}catch(error){const invalid=message.elements.filter(element=>{try{window.acceptCurrentCatalog([element],'${pluginId}');return false;}catch{return true;}});console.error('CATALOG_PARSE_FAILED '+JSON.stringify({error:error.message,invalid}));}}if(message.type==='request')pair.port1.postMessage({type:'response',id:message.id,result:{accepted:true}});if(message.type==='theme:subscribe'){const style=getComputedStyle(document.body);const tokens=${process.env.INVENTORY_LAYOUT_CORE_TOKENS==='1'?"Object.fromEntries([...style].filter(name=>name.startsWith('--dsw-')).map(name=>[name,style.getPropertyValue(name)]))":"{}"};pair.port1.postMessage({type:'theme',version:'1.1.1',context:{session:'layout-session',plugin:'${pluginId}'},colorScheme:'${theme}',fontSize:${fontSize},tokens});}};frame.contentWindow.postMessage({protocol:'gea-html-v2',type:'connect',context:{session:'layout-session',plugin:'${pluginId}'}},'*',[pair.port2]);}
      if(data?.protocol==='dsh-workbench-view-v1'&&data.type==='ready')frame.contentWindow.postMessage({protocol:'dsh-workbench-view-v1',type:'restore',page:data.page,version:1,channel:'layout-view',generation:1,state:{version:1}},'*');
    });</script>`});
  });
  await page.goto('http://inventory-layout.test/');
  const frame=page.frameLocator('iframe');
  t.after(async()=>{assert.deepEqual(network,[]);assert.deepEqual(errors,[]);});
  return {page,frame};
}
async function readablePaint(locator) {
  const paint=await locator.evaluate(el=>{const style=getComputedStyle(el);let node=el,background='';while(node){const value=getComputedStyle(node).backgroundColor;if(value!=='rgba(0, 0, 0, 0)'){background=value;break;}node=node.parentElement;}return{text:el.textContent.trim().slice(0,100),color:style.color,background};});
  const luminance=value=>{const rgb=value.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4;});return .2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];};
  const a=luminance(paint.color),b=luminance(paint.background);return{...paint,contrast:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)};
}
for(const id of ['qll','dealer'])test(`${id} actual PC dark content has readable paint with builtin empty tokens`,async t=>{
  const {page,frame}=await fixture(t,id,1199,'dark',undefined,15);
  await page.setViewportSize({width:1920,height:965});await page.locator('iframe').evaluate(el=>el.style.height='965px');
  await expect(frame.locator('#app')).toContainText(id==='qll'?'5,580':'12,060');
  const targets=id==='qll'?
    [frame.locator('strong').filter({hasText:'5,580'}).first(),frame.getByText(/核心判断/).first(),frame.getByText('数据取值说明与各层日期',{exact:true}),frame.locator('label').filter({hasText:'含渠道'}),frame.getByRole('button',{name:'查询趋势',exact:true})]:
    [frame.locator('[role="status"]').filter({hasText:'固定模拟输入'}).first()];
  if(id==='dealer'){await frame.getByRole('tab',{name:'SKU库存',exact:true}).press('Enter');await expect(frame.getByRole('heading',{name:'SKU库存',exact:true})).toBeVisible();targets.push(frame.locator('[role="status"]').filter({hasText:'SAP 定价'}).first(),frame.getByRole('button',{name:'下载',exact:true}));}
  const paints=[];for(const target of targets)paints.push(await readablePaint(target));
  if(evidence){await mkdir(evidence,{recursive:true});await writeFile(evidence+'/'+id+'-dark-paint.json',JSON.stringify(paints,null,2));await page.screenshot({path:evidence+'/'+id+'-max-dark.png'});}
  for(const paint of paints)assert.ok(paint.contrast>=4.5,`${id} ${paint.text}: ${paint.color} on ${paint.background}, contrast ${paint.contrast.toFixed(2)}`);
});
for(const id of ['customer','orderfulfillment','orderworkbench','regional','category','mps'])test(`${id} received mock page keeps readable text under the common HTML dark defaults`,async t=>{
  const author=['regional','category','mps'].includes(id)?await readFile(`lib/static/${id}/index.html`,'utf8'):undefined;
  const {page,frame}=await fixture(t,id,1199,'dark',author,15);
  const heading=id==='regional'?frame.locator('.k-label').first():id==='customer'?frame.locator('.metric-card-head .arco-typography').first():frame.locator('h1:visible,h2:visible,h3:visible,h4:visible,h5:visible,h6:visible').first();
  await expect(heading).toBeVisible();
  if(evidence&&id==='customer'){await mkdir(evidence,{recursive:true});await writeFile(evidence+'/customer-metric-markup.html',await frame.locator('.metric-card').first().evaluate(el=>el.outerHTML));}
  const targets=[heading];
  if(id==='regional')targets.push(frame.locator('.k-val').first());
  if(id==='customer')targets.push(frame.locator('.metric-card .arco-statistic-value').first(),frame.locator('.dealer-name').first(),frame.locator('.metric-cell strong').first());
  if(id==='orderfulfillment')targets.push(frame.getByLabel('按来源订单号或 OMS 单号模糊查询'),frame.locator('.orders tbody td').first());
  if(id==='orderworkbench')targets.push(frame.locator('.wb-kpi strong').first(),frame.locator('.wb-task-table td').first());
  const paints=[];for(const target of targets)paints.push(await readablePaint(target));
  if(evidence){await mkdir(evidence,{recursive:true});await writeFile(evidence+'/'+id+'-dark-paint.json',JSON.stringify(paints,null,2));await page.screenshot({path:evidence+'/'+id+'-dark.png'});}
  if(id==='regional')assert.deepEqual(paints.map(({color,background})=>({color,background})),[{color:'rgb(133, 140, 150)',background:'rgb(255, 255, 255)'},{color:'rgb(22, 142, 88)',background:'rgb(255, 255, 255)'}],'the common alias defaults do not recolor the retained regional light palette');
  else for(const paint of paints)assert.ok(paint.contrast>=4.5,`${id} ${paint.text}: contrast ${paint.contrast.toFixed(2)}`);
});
test('AQKC CSS-only dark paint follows its existing palette without mounting business queries',async t=>{
  const file='business/inventory-aqkc/source/inventory-light-plugins/src/pages/aqkc/components/inventory-operations-workbench.module.css';
  const source=process.env.AQKC_PAINT_BASELINE==='1'?execFileSync('git',['show','ed643025d95ca188f3bd55d3a37dffc800a76b40:'+file],{encoding:'utf8'}):await readFile(file,'utf8');
  const result=await build({stdin:{contents:`import styles from './${file}';export default styles;`,resolveDir:process.cwd()},bundle:true,write:false,format:'esm',platform:'browser',outfile:'aqkc-paint.js',plugins:[{name:'actual-css',setup(api){api.onLoad({filter:/inventory-operations-workbench\.module\.css$/},()=>({contents:source,loader:'local-css'}));}}]});
  const {default:css}=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles.find(f=>f.path.endsWith('.js')).text).toString('base64'));
  const style=result.outputFiles.find(f=>f.path.endsWith('.css')).text;
  const adapter=await readFile('business/inventory-aqkc/theme.css','utf8');
  const author=`<!doctype html><meta charset="utf-8"><style>${style}\n${adapter}</style><body><main class="${css.shell}"><section class="${css.boardPanel}"><div class="${css.summaryBox}"><div class="${css.insightSummary}"><p><b>库存洞察</b> · CSS样式对照，无业务脚本和查询。</p></div></div></section></main></body>`;
  const {page,frame}=await fixture(t,'aqkc',1199,'dark',author,15);
  await expect.poll(()=>frame.locator('body').evaluate(()=>document.body.hasAttribute('data-ds-dark-theme'))).toBe(true);
  const paint=await readablePaint(frame.getByText('库存洞察',{exact:true}));
  if(evidence){await mkdir(evidence,{recursive:true});await writeFile(evidence+'/aqkc-css-only.json',JSON.stringify(paint,null,2));await page.screenshot({path:evidence+'/aqkc-css-only.png'});}
  assert.ok(paint.contrast>=4.5,`AQKC CSS-only insight contrast ${paint.contrast.toFixed(2)}`);
  assert.equal(await frame.locator('main').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(27, 29, 33)');
  assert.deepEqual(await page.evaluate(()=>window.requests),[],'no business channel or query was mounted');
});
test('opaque PC author document keeps raw script/style text and current picker/theme with omitted closing tags',async t=>{
  const csp="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'none'";
  const author='<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="'+csp+'"><title>库存原文</title><style id="author-style">#inventory { --author-rawtext: "</body> </head>"; color: rgb(20, 30, 40); }</style><main id="inventory">库存数据 0 / 未知</main><script>window.authorLiteral="</body> </head>";window.authorDone=true;</script>';
  const {page,frame}=await fixture(t,'qll',559,'light',author);
  await expect.poll(()=>page.evaluate(()=>window.themeReady)).toBe(true);
  const observed=await frame.locator('body').evaluate(()=>({mode:document.compatMode,literal:window.authorLiteral,done:window.authorDone,picker:typeof window.dshPageInteraction?.available,csp:document.querySelector('meta[http-equiv]').content,style:document.querySelector('#author-style').textContent}));
  assert.equal(observed.mode,'CSS1Compat');
  assert.equal(observed.done,true);
  assert.equal(observed.literal,'</body> </head>');
  assert.equal(observed.picker,'function');
  assert.equal(observed.csp,csp);
  assert.equal(observed.style,'#inventory { --author-rawtext: "</body> </head>"; color: rgb(20, 30, 40); }');
  await expect(frame.locator('#inventory')).toHaveText('库存数据 0 / 未知');
  await page.evaluate(()=>document.querySelector('iframe').contentWindow.postMessage({protocol:'agent-workbench-theme',dark:true,fontSize:17},'*'));
  await expect.poll(()=>frame.locator('body').evaluate(()=>({dark:document.body.hasAttribute('data-ds-dark-theme'),size:document.documentElement.style.getPropertyValue('--dsh-content-font-size')}))).toEqual({dark:true,size:'17px'});
  if(evidence){await mkdir(evidence,{recursive:true});await writeFile(evidence+'/rawtext-document.json',JSON.stringify(observed,null,2));await page.screenshot({path:evidence+'/rawtext-document.png'});}
});
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
