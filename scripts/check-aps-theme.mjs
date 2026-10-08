import {chromium} from '@playwright/test';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const evidence=resolve(process.env.APS_EVIDENCE_DIR??'.runtime/aps-theme');await mkdir(evidence,{recursive:true});
const html=await readFile(process.env.APS_THEME_HTML??'lib/business/inventory-apsplan/index.html','utf8');
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];
page.on('pageerror',error=>errors.push(error.message));
await page.route('**/*',route=>route.request().url()==='https://aps.fixture/page.html'?route.fulfill({contentType:'text/html',body:html}):route.request().url()==='https://aps.fixture/'?route.fulfill({contentType:'text/html',body:'<html><body style="margin:0"><iframe sandbox="allow-scripts allow-downloads" style="width:550px;height:850px;border:0"></iframe></body></html>'}):route.abort());
const session='session-00000000-0000-4000-8000-000000000047';
try{
 await page.goto('https://aps.fixture/');
 await page.evaluate(session=>{
  const fixture=window.apsFixture={context:null,requests:[],invocations:{},sequence:0,session};
  const frame=document.querySelector('iframe');frame.onload=()=>{
   const channel=new MessageChannel();fixture.port=channel.port1;fixture.port.onmessage=({data})=>{
    if(data.type==='invoked')fixture.invocations[data.id]=data;
    if(data.type==='request'){fixture.requests.push(data);if(data.method==='context')fixture.context=data.parameters;fixture.port.postMessage({type:'response',id:data.id,result:{ok:true}})}
   };
   frame.contentWindow.postMessage({protocol:'gea-html-v2',type:'connect',context:{plugin:'inventory-apsplan',session}},'*',[channel.port2]);
  };frame.src='https://aps.fixture/page.html';
 },session);
 await page.waitForFunction(()=>window.apsFixture.context?.simulated);
 const id=await page.evaluate(()=>{const f=window.apsFixture,id=String(++f.sequence);f.port.postMessage({type:'invoke',id,name:'filter',session:f.session,arguments:{workspace:'plan',analysisScope:'production',granularity:'week',date:'2026-08-10'}});return id});
 await page.waitForFunction(id=>window.apsFixture.invocations[id],id);await page.waitForFunction(()=>window.apsFixture.context?.period?.date==='2026-08-16'&&window.apsFixture.context.simulated);
 const frame=page.frameLocator('iframe');
 const styles=async selectors=>frame.locator('body').evaluate((body,selectors)=>Object.fromEntries(selectors.map(selector=>{const element=body.querySelector(selector);if(!element)throw Error('MISSING_THEME_ELEMENT:'+selector);const style=getComputedStyle(element),rect=element.getBoundingClientRect();return[selector,{background:style.backgroundColor,color:style.color,borderColor:style.borderColor,width:rect.width,height:rect.height,padding:style.padding,gap:style.gap,fontSize:style.fontSize,lineHeight:style.lineHeight,fontWeight:style.fontWeight}]})),selectors);
 const selectors=['.main-content','.dashboard-module-toolbar','.open-intelligent-tasks','.scope-tabs button.selected','.time-granularity-tabs','.time-granularity-tabs button:not(.selected)','.time-granularity-tabs button.selected','.date-picker-button>span','.week-button>span','.kpi-grid.overview-flat-kpi-grid','.period-kpi-card','.period-kpi-card .kpi-name','.active-period-range'];
 const snapshots={};
 for(const width of [550,850]){
  await page.locator('iframe').evaluate((element,width)=>element.style.width=width+'px',width);
  await page.evaluate(()=>{const f=window.apsFixture;f.port.postMessage({type:'theme',version:'1.1.1',colorScheme:'light',fontSize:14,tokens:{},context:{session:f.session,plugin:'inventory-apsplan'}})});
  await frame.locator('body:not([data-ds-dark-theme])').waitFor();
  await frame.locator('.scope-tabs button.selected').evaluate(element=>Promise.all(element.getAnimations({subtree:true}).map(animation=>animation.finished)));
  await frame.locator('.time-granularity-tabs').evaluate(element=>Promise.all(element.getAnimations({subtree:true}).map(animation=>animation.finished)));
  await frame.locator('.kpi-grid').first().evaluate(element=>Promise.all(element.getAnimations({subtree:true}).map(animation=>animation.finished)));
  snapshots[width]={light:await styles(selectors)};
  await frame.getByRole('button',{name:'2026年8月',exact:true}).click();
  snapshots[width].lightMenu=await styles(['.month-menu','.date-picker-menu .date-picker-sections button:not(.selected):not(:disabled)','.date-picker-menu .date-picker-sections button.selected']);
  await frame.getByRole('button',{name:'2026年8月',exact:true}).click();
  await page.evaluate(()=>{const f=window.apsFixture;f.port.postMessage({type:'theme',version:'1.1.1',colorScheme:'dark',fontSize:14,tokens:{},context:{session:f.session,plugin:'inventory-apsplan'}})});
  await frame.locator('body[data-ds-dark-theme]').waitFor();
  await frame.locator('.scope-tabs button.selected').evaluate(element=>Promise.all(element.getAnimations({subtree:true}).map(animation=>animation.finished)));
  await frame.locator('.time-granularity-tabs').evaluate(element=>Promise.all(element.getAnimations({subtree:true}).map(animation=>animation.finished)));
  await frame.locator('.kpi-grid').first().evaluate(element=>Promise.all(element.getAnimations({subtree:true}).map(animation=>animation.finished)));
  snapshots[width].dark=await styles(selectors);
  snapshots[width].darkIndicator=await frame.locator('.time-granularity-tabs').evaluate(element=>getComputedStyle(element,'::before').backgroundColor);
  await frame.getByRole('button',{name:'2026年8月',exact:true}).click();
  snapshots[width].darkMenu=await styles(['.month-menu','.date-picker-menu .date-picker-sections button:not(.selected):not(:disabled)','.date-picker-menu .date-picker-sections button.selected']);
  await frame.getByRole('button',{name:'2026年8月',exact:true}).click();
  await frame.locator('.week-button').click();
  snapshots[width].darkWeek=await styles(['.week-filter-menu','.week-filter-menu button:not(.selected):not(:disabled)','.week-filter-menu button.selected']);
  await frame.locator('.week-button').click();
 }
 await writeFile(resolve(evidence,'theme-styles.json'),JSON.stringify({snapshots,errors},null,2)+'\n');
 await page.screenshot({path:resolve(evidence,'aps-dark-pc.png')});
 if(process.env.APS_THEME_CAPTURE_ONLY==='1'){console.log('Captured original light geometry and dark colors');}
 else {
  const luminance=color=>{const rgb=color.match(/[\d.]+/g).slice(0,3).map(Number).map(value=>value/255).map(value=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722};
  const contrast=(front,back)=>{const a=luminance(front),b=luminance(back);return(Math.max(a,b)+.05)/(Math.min(a,b)+.05)};
  for(const snapshot of Object.values(snapshots)){
   assert.equal(snapshot.dark['.main-content'].background,'rgb(27, 29, 33)','page canvas uses shared dark page');
   for(const selector of ['.dashboard-module-toolbar','.scope-tabs button.selected','.kpi-grid.overview-flat-kpi-grid','.period-kpi-card'])assert.equal(snapshot.dark[selector].background,'rgb(36, 38, 43)',selector+' uses the shared dark surface');
   assert.equal(snapshot.dark['.time-granularity-tabs'].background,'rgb(48, 52, 59)');
   assert.equal(snapshot.darkIndicator,'rgb(36, 38, 43)');
   for(const selector of ['.date-picker-button>span','.week-button>span','.period-kpi-card .kpi-name'])assert.ok(contrast(snapshot.dark[selector].color,'rgb(36, 38, 43)')>=4.5,selector+' readable');
   for(const selector of ['.time-granularity-tabs button:not(.selected)','.active-period-range'])assert.ok(contrast(snapshot.dark[selector].color,'rgb(36, 38, 43)')>=4.5,selector+' readable');
   for(const group of [snapshot.darkMenu,snapshot.darkWeek]){
    const values=Object.values(group);assert.equal(values[0].background,'rgb(36, 38, 43)');
    for(const item of values.slice(1))assert.ok(contrast(item.color,item.background)>=4.5,'menu labels readable');
   }
  }
  {const original=JSON.parse(await readFile(process.env.APS_THEME_BASELINE??new URL('../tests/fixtures/aps-light-theme.json',import.meta.url),'utf8'));for(const width of [550,850]){assert.deepEqual(snapshots[width].light,original.snapshots[width].light,'original light style and geometry '+width);assert.deepEqual(snapshots[width].lightMenu,original.snapshots[width].lightMenu,'original light menu '+width)}}
  assert.deepEqual(errors,[]);
  assert.deepEqual(await page.evaluate(()=>window.apsFixture.requests.filter(value=>['sql','workspace','conversation'].includes(value.method))),[]);
  console.log('APS PC550/850 light geometry, dark surfaces/menus/text contrast and zero business requests passed');
 }
}finally{await browser.close()}
