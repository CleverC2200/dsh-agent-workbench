import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium, expect } from '@playwright/test';

const core = resolve('../../official-latest-standard');
const bundle = await build({
  stdin: {
    contents: `
import React from 'react';
import {createRoot} from 'react-dom/client';
import {mountFramePresentation} from './src/frame-presenter.tsx';
import {CompanyWelcome} from './src/company/ui.tsx';
import {WorkbenchController} from './src/workbench.ts';
import {InputBar} from '../../official-latest-standard/packages/client/ui-conversation/src/client/skeleton/InputBar.tsx';
import {ConversationContent} from '../../official-latest-standard/packages/client/ui-conversation/src/client/skeleton/ConversationContent.tsx';
import {MarkdownText} from '../../official-latest-standard/packages/client/ui-primitives/src/markdown/MarkdownText.tsx';
import {PermissionSelect} from '../../official-latest-standard/packages/client/ui-permission-presets/src/client/PermissionSelect.tsx';
import {ModelSelect} from '../../official-latest-standard/packages/client/ui-model-selection/src/client/ModelSelect.tsx';
const labels={'input.commands':'添加','input.send':'发送','preset.workspace-write':'工作区内修改',pageAssistantTitle:'AI工作台',pageHistory:'查看历史对话',pageNewChat:'开始新的页面对话'};
const t=key=>labels[key]??key;
const modelState={groups:[{id:'deepseek',name:'DeepSeek',models:[{id:'deepseek-v4-flash',name:'deepseek-v4-flash'}]}],current:{provider:'deepseek',model:'deepseek-v4-flash'},pending:null,retainedEffort:undefined,status:'ready',error:null,failures:[]};
const directory={subscribe:()=>()=>{},getSnapshot:()=>modelState};
function Composer(){return <InputBar variant="composer" sessionId="fixture" placeholder="发消息或创建任务，/ 调用指令，@ 文件或对话" useInput={fn=>fn(undefined)} useNotices={fn=>fn(undefined)} useBusyEnter={fn=>fn('queue')} useStopShortcut={fn=>fn([])} useMenuLauncher={fn=>fn(null)} useFileUploads={fn=>fn({})} useSession={fn=>fn({})} useProjection={()=>undefined} t={t} renderSlot={(name)=>name==='conversation.input.permission'?<PermissionSelect locked={false} select={async()=>true} useProjection={()=>({currentValue:'workspace-write'})} usePermissionCatalog={fn=>fn({value:{options:[{value:'workspace-write',name:'工作区内修改'}]}})} t={t}/>:name==='conversation.input.model'?<ModelSelect locked={false} available={true} directory={directory} load={async()=>{}} select={async()=>true} t={t}/>:null}/>}
const sample='### 界面验收样例（不代表经营结论）\\n\\n保持已有指标口径，以下仅用于核对右侧回答的阅读宽度和表格滚动。\\n\\n| 指标 | 本期 | 环比 | 同比 | 数据范围 | 核验说明 |\\n| --- | --- | --- | --- | --- | --- |\\n| 样例指标 | 待核验 | 待核验 | 待核验 | 当前选择周期 | 保留完整列，不将样例视为实际查询结果 |';
function OrderContent(){
 const shares={sessionId:'fixture',useSession:fn=>fn({blank:false,running:false}),useSessions:fn=>fn({byId:{}}),useSessionStatus:fn=>fn(new Map()),useWorkspaces:fn=>fn({items:[],phase:'ready'}),useInput:fn=>fn(undefined),useComposerBlock:fn=>fn(undefined),selectWorkspace:async()=>{},t,
 renderSlot:(name)=>name==='conversation.composer.bar'?<Composer/>:name==='conversation.session'?window.fixtureWelcome?<CompanyWelcome page={window.fixturePageId} onFill={text=>{window.filledPrompt=text}}/>:<div style={{flex:'1 0 auto',minWidth:0}}><div><div data-chat-flow>{Array.from({length:5},(_,i)=><article data-chat-flow-kind="assistant" key={i}><MarkdownText text={sample} labels={{}}/></article>)}</div></div></div>:null,
 renderSlotChain:(_name,_props,options)=>options.fallback};
 return <ConversationContent {...shares} variant="embedded" phase="active" hero={false} useFactorySlot={(_name,Fallback)=>React.useMemo(()=>props=><Fallback {...shares} {...props}/>,[Fallback])}/>;
}
let Document;
const locale={active:'zh'};
const identity={state:'confirmed',scope:null,status:{authenticated:false}};
const ctx={get:()=>undefined,provide(){},locale:{subscribe:()=>()=>{},getSnapshot:()=>locale},theme:{getTheme:()=>({active:{colorScheme:'light',tokens:{}},fontSize:14})},on:()=>()=>{},effect:fn=>fn(),inputTriggers:{registerSource:()=>()=>{}},conversation:{input:{for:()=>({})}},slots:{registerFactory:(_meta,component)=>{Document=component;return()=>{}},register:()=>()=>{},inject:(_name,fn)=>fn()},inject:(names,fn)=>{if(names.includes('sidebarRight'))return;fn({...ctx,businessAccount:{getSnapshot:()=>identity,subscribe:()=>()=>{}},remote:{session:{}}})}};
const workbench=new WorkbenchController({panel:()=>{},document:()=>{}});
mountFramePresentation(ctx,()=>undefined,t,workbench);
const page={id:window.fixturePageId??'fixture',kind:'local',label:'销售计划',body:()=> <p>业务页面</p>};
workbench.registerFrame(page);workbench.associateSession(page.id,{sessionId:'fixture',preset:'original',ownerScope:null});void workbench.open(page.id);
createRoot(document.getElementById('root')).render(<Document page={page} active={true} sessionId="fixture" useSessions={fn=>fn({byId:{}})} useSession={fn=>fn({openState:'open'})} useProjection={()=>'original'} renderSlot={()=>window.fixturePageId?<OrderContent/>:<div style={{marginTop:'auto'}}><Composer/></div>}/>);
createRoot(document.getElementById('original')).render(<Composer/>);
`,
    resolveDir: process.cwd(),
    loader: 'tsx',
  },
  bundle: true,
  write: false,
  outfile: 'fixture.js',
  platform: 'browser',
  jsx: 'automatic',
  alias: { react: resolve('node_modules/react') },
  loader: { '.png': 'dataurl', '.css': 'text' },
  plugins: [
    {
      name: 'official-css',
      setup(builder) {
        builder.onLoad({ filter: /\.module\.css$/ }, async ({ path }) => ({
          contents: await readFile(path, 'utf8'),
          loader: 'local-css',
        }));
      },
    },
  ],
});

test('Workbench preserves native composer controls in light, dark, wide and narrow columns', async (t) => {
  const browser = await chromium.launch({
    headless: true,
    channel: process.env.DSH_TEST_BROWSER_CHANNEL,
  });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1600, height: 820 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const css = (
    await Promise.all(
      [
        resolve(core, 'packages/client/ui-theme/src/styles/base.css'),
        resolve(core, 'packages/client/ui-theme/src/styles/design-platform.css'),
        resolve(core, 'packages/client/ui-theme/src/styles/gradient-shadow-text.css'),
        'theme/tokens.css',
        'src/company/shell.css',
        'src/company/layout.css',
      ].map((path) => readFile(path, 'utf8')),
    )
  ).join('\n');
  await page.setContent(
    `<style>${css}\n${bundle.outputFiles.find((file) => file.path.endsWith('.css')).text}\n*,*::before,*::after{transition:none!important;animation:none!important}html,body{margin:0;height:100%}body{font:16px var(--dsw-font-family)}#root{height:100%;margin-left:280px}#original{font-size:14px;position:fixed;left:0;top:100px;width:520px;visibility:hidden}</style><div id="root"></div><div id="original"></div>`,
  );
  await page.addScriptTag({
    content: bundle.outputFiles.find((file) => file.path.endsWith('.js')).text,
  });
  await expect(page.locator('#root [data-composer-card]'))
    .toBeVisible()
    .catch(async (error) => {
      throw new Error(JSON.stringify({ errors, body: await page.locator('body').innerText() }), {
        cause: error,
      });
    });
  await expect(page.locator('.agent-workbench-document')).toHaveCSS('font-size', '14px');
  await page.evaluate(() => document.body.style.setProperty('--dsh-content-font-size', '15px'));
  await expect(page.locator('.agent-workbench-document')).toHaveCSS('font-size', '15px');
  await page.evaluate(() => document.body.style.removeProperty('--dsh-content-font-size'));
  const inspect = (container) =>
    page.locator(container).evaluate((root) =>
      Array.from(root.querySelectorAll('[data-composer-card] button')).map((button) => {
        const style = getComputedStyle(button);
        return Object.fromEntries(
          [
            'height',
            'paddingTop',
            'paddingRight',
            'paddingBottom',
            'paddingLeft',
            'borderTopWidth',
            'borderRadius',
            'backgroundColor',
            'color',
          ].map((key) => [key, style[key]]),
        );
      }),
    );
  const results = [];
  for (const width of [1600, 1024])
    for (const dark of [false, true]) {
      await page.setViewportSize({ width, height: 820 });
      await page.evaluate(
        (dark) => document.body.toggleAttribute('data-ds-dark-theme', dark),
        dark,
      );
      const controls = await inspect('#root');
      assert.equal(controls.length, 4);
      assert.deepEqual(controls, await inspect('#original'));
      assert.equal(controls[0].height, '28px');
      assert.equal(controls[0].borderTopWidth, '0px');
      assert.equal(controls[3].borderTopWidth, '0px');
      const geometry = await page.locator('#root [data-composer-card]').evaluate((card) => {
        const bounds = card.getBoundingClientRect();
        return {
          width: bounds.width,
          overflow: card.scrollWidth > card.clientWidth,
          buttons: Array.from(card.querySelectorAll('button')).every((button) => {
            const r = button.getBoundingClientRect();
            return r.left >= bounds.left && r.right <= bounds.right && r.bottom <= bounds.bottom;
          }),
        };
      });
      assert.equal(geometry.overflow, false);
      assert.equal(geometry.buttons, true);
      results.push({ width, dark, controls, geometry });
    }
  assert.deepEqual(errors, []);
  if (process.env.COMPOSER_EVIDENCE_DIR) {
    const dir = process.env.COMPOSER_EVIDENCE_DIR;
    await mkdir(dir, { recursive: true });
    await page.setViewportSize({ width: 1600, height: 820 });
    await page.evaluate(() => document.body.removeAttribute('data-ds-dark-theme'));
    await page
      .locator('.agent-workbench-native-conversation')
      .screenshot({ path: resolve(dir, 'composer-fixed.png') });
    const { writeFile } = await import('node:fs/promises');
    await writeFile(
      resolve(dir, 'composer-style-results.json'),
      JSON.stringify(results, null, 2) + '\n',
    );
  }
});

for (const welcome of [false, true])
  test(
    welcome
      ? 'order welcome screens match the customer Agent including avatar, intro and prompts'
      : 'order pages use the same conversation and composer styles as other Agents',
    async (t) => {
      const browser = await chromium.launch({
        headless: true,
        channel: process.env.DSH_TEST_BROWSER_CHANNEL,
      });
      t.after(() => browser.close());
      const css = (
        await Promise.all(
          [
            resolve(core, 'packages/client/ui-theme/src/styles/base.css'),
            resolve(core, 'packages/client/ui-theme/src/styles/design-platform.css'),
            'theme/tokens.css',
            'src/company/shell.css',
            'src/company/layout.css',
          ].map((path) => readFile(path, 'utf8')),
        )
      ).join('\n');
      const baselines = new Map();
      for (const id of [
        'inventory-customer',
        'inventory-orderworkbench',
        'inventory-orderfulfillment',
      ]) {
        const page = await browser.newPage();
        t.after(() => page.close());
        const errors = [];
        page.on('pageerror', (error) => errors.push(error.message));
        await page.setContent(
          `<style>${css}\n${bundle.outputFiles.find((file) => file.path.endsWith('.css')).text}\nhtml,body{margin:0;height:100%}#root{height:100%;margin-left:64px}#original{display:none}</style><div id="root"></div><div id="original"></div><script>window.fixturePageId=${JSON.stringify(id)};window.fixtureWelcome=${welcome}</script>`,
        );
        await page.addScriptTag({
          content: bundle.outputFiles.find((file) => file.path.endsWith('.js')).text,
        });
        const pane = page.locator('.agent-workbench-native-conversation');
        await expect(pane.locator('[data-composer-card]')).toBeVisible();
        await expect(page.locator('.gea-order-assistant-head')).toHaveCount(0);
        for (const width of [1600, 1024, 720])
          for (const dark of [false, true]) {
            await page.setViewportSize({ width, height: 820 });
            await page.evaluate(
              (dark) => document.body.toggleAttribute('data-ds-dark-theme', dark),
              dark,
            );
            const styles = await pane.evaluate((root, welcome) => {
              const selectors = welcome
                ? [
                    '.gea-agent-avatar',
                    '.gea-agent-identity h2',
                    '.gea-agent-intro',
                    '.gea-agent-intro b',
                    '.gea-agent-prompts h3',
                    '.gea-agent-prompts button',
                    '[data-composer-card]',
                    '[data-composer-input]',
                  ]
                : [
                    '[data-composer-card]',
                    '[data-composer-input]',
                    '[data-chat-flow] p',
                    '[data-chat-flow] h3',
                    '[data-chat-flow] table',
                    '[data-chat-flow] th',
                  ];
              const properties = [
                'fontSize',
                'lineHeight',
                'color',
                'backgroundColor',
                'borderRadius',
                'paddingTop',
                'paddingLeft',
              ];
              const card = root.querySelector('[data-composer-card]');
              return {
                avatar: welcome ? root.querySelector('.gea-agent-avatar').outerHTML : null,
                width: root.getBoundingClientRect().width,
                overflow: card.scrollWidth > card.clientWidth,
                elements: selectors.map((selector) => {
                  const node = root.querySelector(selector);
                  if (!node) throw Error('Missing ' + selector);
                  const style = getComputedStyle(node);
                  return Object.fromEntries(properties.map((key) => [key, style[key]]));
                }),
              };
            }, welcome);
            assert.equal(styles.overflow, false);
            const key = `${width}:${dark}`;
            if (id === 'inventory-customer') baselines.set(key, styles);
            else assert.deepEqual(styles, baselines.get(key), `${id} differs at ${key}`);
          }
        if (welcome) {
          const button = pane.locator('.gea-agent-prompts button').first();
          const text = await button.innerText();
          await button.click();
          assert.equal(await page.evaluate(() => window.filledPrompt), text);
          await expect(pane.locator('.gea-order-agent-robot')).toHaveCount(0);
        }
        assert.deepEqual(errors, []);
      }
    },
  );
