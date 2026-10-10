import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { build } from 'esbuild';
import { chromium, expect } from '@playwright/test';
const compile = async (contents, loader = 'tsx') =>
  (
    await build({
      stdin: { contents, resolveDir: process.cwd(), loader },
      bundle: true,
      write: false,
      platform: 'browser',
      format: 'iife',
      loader: { '.png': 'dataurl', '.css': 'text' },
    })
  ).outputFiles[0].text;
const injector = (
  await build({
    entryPoints: ['src/page-interaction/inject.ts'],
    bundle: true,
    write: false,
    platform: 'node',
    format: 'esm',
  })
).outputFiles[0].text;
const { injectPicker } = await import(
  'data:text/javascript;base64,' + Buffer.from(injector).toString('base64')
);
const picker = await compile(
  `import{mountPicker}from'./src/page-interaction/picker.ts';mountPicker();`,
  'ts',
);
const parent = await compile(`
 import React from'react';import{createRoot}from'react-dom/client';import{flushSync}from'react-dom';import{mountFramePresentation}from'./src/frame-presenter.tsx';import{WorkbenchController}from'./src/workbench.ts';
 let Document;const services={};const binding={ctx:{},sessionId:'session-33333333-3333-4333-8333-333333333333'};const id=binding.sessionId;const locale={active:'zh'};const identity={state:'confirmed',scope:'layout-principal',subject:'layout-subject',status:{authenticated:true}};const viewScope=JSON.stringify([identity.subject,id]);
 const ctx={get:name=>services[name],provide:(name,value)=>{services[name]=value;},locale:{subscribe:()=>()=>{},getSnapshot:()=>locale},theme:{getTheme:()=>({active:{colorScheme:'light',tokens:{}},fontSize:14})},on:()=>()=>{},effect:fn=>fn(),sessions:{retain:()=>({sessionId:id,ready:Promise.resolve(binding),binding,release(){}}),retainInfo:()=>({getSnapshot:()=>({retainedBy:{mainView:true}})})},inputTriggers:{registerSource:()=>()=>{}},conversation:{input:{for:()=>({notify(){}})}},slots:{registerFactory:(_meta,component)=>{Document=component;return()=>{};},register:()=>()=>{},inject:()=>{}},inject:(names,fn)=>{if(names.includes('sidebarRight')||names.includes('slots'))return;return fn({...ctx,businessAccount:{getSnapshot:()=>identity,subscribe:()=>()=>{}},remote:{session:{}}})}};
 const owner=new WorkbenchController({panel:()=>{},document:()=>{}});mountFramePresentation(ctx,()=>undefined,key=>key,owner);
 window.peerDraft='历史草稿，请保留。';window.persisted=0;
 const inputActions={captureInsertion:()=>({start:window.peerDraft.length,end:window.peerDraft.length,draftRev:7}),insertText:(text,span)=>{if(window.conflict)return false;window.peerDraft=window.peerDraft.slice(0,span.start)+text+window.peerDraft.slice(span.end);const input=document.querySelector('[aria-label="Core草稿接口fixture"]');if(input)input.value=window.peerDraft;return true;},persistDraft:()=>{window.persisted++;}};
 function ComposerPeer(){const trigger=React.useRef();React.useEffect(()=>services.pageInteraction.mountTrigger(trigger.current,id),[]);return React.createElement('section',{'aria-label':'Core草稿接口fixture'},React.createElement('div',{ref:trigger}),React.createElement('textarea',{'aria-label':'Core草稿接口fixture',defaultValue:window.peerDraft,onChange:event=>{window.peerDraft=event.target.value;}}));}
 const root=createRoot(document.getElementById('root'));let page,associated=true,unregister;
 const render=()=>root.render(React.createElement(Document,{page,active:true,sessionId:associated?id:undefined,useSession:()=>associated?{openState:'open',blank:false}:undefined,useProjection:()=>null,inputActions,renderSlot:()=>React.createElement(ComposerPeer)}));
 window.openAuthor=async(name,width,seed)=>{flushSync(()=>root.render(null));unregister?.();page={id:name==='category'?'plan-region-category':'plan-category-production',kind:'html',src:'/author/'+name,label:name};unregister=owner.registerFrame(page);await owner.open(page.id);owner.associateSession(page.id,{sessionId:id,preset:null,ownerScope:identity.scope,subject:identity.subject});if(seed)owner.saveHtmlViewState(page.id,viewScope,seed);associated=true;document.getElementById('root').style.width=(width+440)+'px';render();};
 window.unassociate=()=>{associated=false;owner.forgetSession(page.id);render();};window.readView=()=>owner.readHtmlViewState(page.id,viewScope);
`);
async function fixture(t) {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1920, height: 720 } });
  const css = (
    await Promise.all(
      ['theme/tokens.css', 'src/company/shell.css', 'src/company/layout.css'].map((file) =>
        readFile(file, 'utf8'),
      ),
    )
  ).join('\n');
  const assets = {};
  for (const name of ['category', 'mps']) {
    const html =
      process.env.HTML_LAYOUT_BASELINE === '1'
        ? execFileSync(
            'git',
            ['show', '31fec062d584618efbff07d47d7c1de158a0d9e0:static/' + name + '/index.html'],
            { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 },
          )
        : await readFile('static/' + name + '/index.html', 'utf8');
    assets[name] = injectPicker(html, picker);
  }
  await page.route('http://127.0.0.1:19480/**', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body:
        assets[new URL(route.request().url()).pathname.split('/').at(-1)] ??
        `<style>${css}html,body{margin:0;height:100%}#root{height:100%;margin-left:280px}textarea{width:95%;min-height:110px}</style><div id="root"></div>`,
    }),
  );
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  t.after(() =>
    assert.deepEqual(
      errors,
      [],
      'the exact production picker bootstrap and author scripts parse without error',
    ),
  );
  await page.goto('http://127.0.0.1:19480/');
  await page.addScriptTag({ content: parent });
  return page;
}
for (const name of ['category', 'mps'])
  test(
    name +
      ' business board adapts inside the actual Document while author questions use the current draft CAS',
    async (t) => {
      const page = await fixture(t);
      const rawDraft = '\n  第一步\n';
      const seed =
        name === 'category'
          ? { version: 1, draft: rawDraft }
          : { version: 1, assistantDraft: rawDraft };
      for (const width of [600, 900, 1200]) {
        await page.setViewportSize({ width: width + 720, height: 720 });
        await page.evaluate(({ name, width, seed }) => window.openAuthor(name, width, seed), {
          name,
          width,
          seed,
        });
        const frame = page.frameLocator('iframe');
        await expect(
          frame.locator(name === 'category' ? '.work h2' : '.ap-board-title'),
        ).toBeVisible();
        await expect(frame.locator('.chat,.ap-dock')).toHaveCount(0);
        assert.equal(await page.locator('.agent-workbench-native-conversation').count(), 1);
        await expect
          .poll(() =>
            page.locator('iframe').evaluate((element) => element.getBoundingClientRect().width),
          )
          .toBe(width);
        const iframeWidth = (await page.locator('iframe').boundingBox()).width;
        const _board = await frame
          .locator(name === 'category' ? '.work' : '.ap-board')
          .boundingBox();
        await expect
          .poll(async () =>
            Math.abs(
              (await frame.locator(name === 'category' ? '.work' : '.ap-board').boundingBox())
                .width - iframeWidth,
            ),
          )
          .toBeLessThan(2);
        const title = await frame
          .locator(name === 'category' ? '.work h2' : '.ap-board-title')
          .boundingBox();
        assert.ok(
          title.height < 40,
          'heading stays readable instead of fragmented vertical wrapping',
        );
        await expect(
          frame.getByRole('button', { name: '转入当前对话草稿', exact: true }),
        ).toBeVisible();
        if (name === 'category')
          await expect(frame.locator('.scope-picker .arco-select')).toBeVisible();
        else {
          await frame.getByRole('button', { name: 'Studio / 人物设置', exact: true }).click();
          await expect(frame.locator('.arco-drawer-content')).toBeVisible();
          const iframeBox = await page.locator('iframe').boundingBox();
          await expect
            .poll(async () => {
              const box = await frame.locator('.arco-drawer-content').boundingBox();
              return Math.abs(box.x + box.width - (iframeBox.x + iframeBox.width));
            })
            .toBeLessThan(2);
          const modal = await frame.locator('.arco-drawer-content').boundingBox();
          assert.ok(modal.width <= width - 20);
          if (process.env.HTML_LAYOUT_EVIDENCE && width === 600)
            await page.screenshot({
              path: process.env.HTML_LAYOUT_EVIDENCE + '/mps-studio-600.png',
              animations: 'disabled',
            });
          await frame.locator('.arco-drawer-close-icon').click();
          await expect(frame.locator('.arco-drawer-content')).toBeHidden();
        }
        if (process.env.HTML_LAYOUT_EVIDENCE) {
          await mkdir(process.env.HTML_LAYOUT_EVIDENCE, { recursive: true });
          await page.screenshot({
            path: process.env.HTML_LAYOUT_EVIDENCE + '/' + name + '-' + width + '.png',
          });
        }
      }
      const frame = page.frameLocator('iframe');
      await expect
        .poll(() => frame.locator('body').evaluate(() => window.dshPageInteraction?.available()))
        .toBe(true);
      await frame
        .locator('body')
        .evaluate(() =>
          window.dshPageInteraction.quote({ label: '长度边界', text: '字'.repeat(6000) }),
        );
      assert.equal(
        await page.evaluate(() => window.persisted),
        1,
        'the existing 6000-character boundary is accepted',
      );
      const draftBeforeRejected = await page.evaluate(() => window.peerDraft);
      const oversized = ' ' + '字'.repeat(5999) + ' ';
      assert.equal(oversized.length, 6001);
      const key = name === 'category' ? 'draft' : 'assistantDraft';
      await page.evaluate(({ name, seed }) => window.openAuthor(name, 1200, seed), {
        name,
        seed: { version: 1, [key]: oversized },
      });
      await expect
        .poll(() => frame.locator('body').evaluate(() => window.dshPageInteraction?.available()))
        .toBe(true);
      await frame.getByRole('button', { name: '转入当前对话草稿', exact: true }).click();
      await expect(frame.locator('.author-quote-status')).toContainText('单次引用长度上限');
      assert.equal(
        (await page.evaluate(() => window.readView()))[key],
        oversized,
        'rejected text retains its complete tail',
      );
      assert.equal(await page.evaluate(() => window.peerDraft), draftBeforeRejected);
      assert.equal(await page.evaluate(() => window.persisted), 1);
      await page.evaluate(({ name, seed }) => window.openAuthor(name, 1200, seed), { name, seed });
      await expect
        .poll(() => frame.locator('body').evaluate(() => window.dshPageInteraction?.available()))
        .toBe(true);
      await page.evaluate(() => {
        window.conflict = true;
      });
      await frame.getByRole('button', { name: '转入当前对话草稿', exact: true }).click();
      await expect(frame.locator('.author-quote-status')).toContainText('草稿已变化');
      assert.equal(await page.evaluate(() => window.peerDraft), draftBeforeRejected);
      assert.equal((await page.evaluate(() => window.readView()))[key], rawDraft);
      await page.evaluate(() => {
        window.conflict = false;
      });
      await frame.getByRole('button', { name: '转入当前对话草稿', exact: true }).click();
      await expect(
        frame.getByRole('button', { name: '转入当前对话草稿', exact: true }),
      ).toHaveCount(0);
      assert.match(await page.evaluate(() => window.peerDraft), /^历史草稿，请保留。引用：/);
      assert.ok(
        (await page.evaluate(() => window.peerDraft)).endsWith(
          '引用：' + name + ' · 未发文字\n> \n>   第一步\n> \n',
        ),
        'all raw indentation and boundary LF survive the real quote pathway',
      );
      assert.equal(await page.evaluate(() => window.persisted), 2);
      await frame.locator('summary').click();
      await frame.locator('.author-question-list button').first().click();
      await expect.poll(() => page.evaluate(() => window.persisted)).toBe(3);
      assert.match(await page.evaluate(() => window.peerDraft), /^历史草稿，请保留。/);
      await page.setViewportSize({ width: 1320, height: 480 });
      await page.evaluate((name) => window.openAuthor(name, 600), name);
      await expect(
        page.frameLocator('iframe').locator(name === 'category' ? '.work-body' : '.ap-board-body'),
      ).toBeVisible();
      if (process.env.HTML_LAYOUT_EVIDENCE)
        await page.screenshot({
          path: process.env.HTML_LAYOUT_EVIDENCE + '/' + name + '-600-low.png',
        });
      await page.evaluate(() => window.unassociate());
      await page.frameLocator('iframe').locator('summary').click();
      await page.frameLocator('iframe').locator('.author-question-list button').first().click();
      await expect(page.frameLocator('iframe').locator('.author-quote-status')).toContainText(
        '关联当前页面',
      );
      assert.equal(await page.evaluate(() => window.persisted), 3);
    },
  );
