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
import {WorkbenchController} from './src/workbench.ts';
import {InputBar} from '../../official-latest-standard/packages/client/ui-conversation/src/client/skeleton/InputBar.tsx';
import {PermissionSelect} from '../../official-latest-standard/packages/client/ui-permission-presets/src/client/PermissionSelect.tsx';
import {ModelSelect} from '../../official-latest-standard/packages/client/ui-model-selection/src/client/ModelSelect.tsx';
const labels={'input.commands':'添加','input.send':'发送','preset.workspace-write':'工作区内修改'};
const t=key=>labels[key]??key;
const modelState={groups:[{id:'deepseek',name:'DeepSeek',models:[{id:'deepseek-v4-flash',name:'deepseek-v4-flash'}]}],current:{provider:'deepseek',model:'deepseek-v4-flash'},pending:null,retainedEffort:undefined,status:'ready',error:null,failures:[]};
const directory={subscribe:()=>()=>{},getSnapshot:()=>modelState};
function Composer(){return <InputBar variant="composer" sessionId="fixture" placeholder="发消息或创建任务，/ 调用指令，@ 文件或对话" useInput={fn=>fn(undefined)} useNotices={fn=>fn(undefined)} useBusyEnter={fn=>fn('queue')} useStopShortcut={fn=>fn([])} useMenuLauncher={fn=>fn(null)} useFileUploads={fn=>fn({})} useSession={fn=>fn({})} useProjection={()=>undefined} t={t} renderSlot={(name)=>name==='conversation.input.permission'?<PermissionSelect locked={false} select={async()=>true} useProjection={()=>({currentValue:'workspace-write'})} usePermissionCatalog={fn=>fn({value:{options:[{value:'workspace-write',name:'工作区内修改'}]}})} t={t}/>:name==='conversation.input.model'?<ModelSelect locked={false} available={true} directory={directory} load={async()=>{}} select={async()=>true} t={t}/>:null}/>}
let Document;
const locale={active:'zh'};
const identity={state:'confirmed',scope:null,status:{authenticated:false}};
const ctx={get:()=>undefined,provide(){},locale:{subscribe:()=>()=>{},getSnapshot:()=>locale},theme:{getTheme:()=>({active:{colorScheme:'light',tokens:{}},fontSize:14})},on:()=>()=>{},effect:fn=>fn(),inputTriggers:{registerSource:()=>()=>{}},conversation:{input:{for:()=>({})}},slots:{registerFactory:(_meta,component)=>{Document=component;return()=>{}},register:()=>()=>{},inject:(_name,fn)=>fn()},inject:(names,fn)=>{if(names.includes('sidebarRight'))return;fn({...ctx,businessAccount:{getSnapshot:()=>identity,subscribe:()=>()=>{}},remote:{session:{}}})}};
const workbench=new WorkbenchController({panel:()=>{},document:()=>{}});
mountFramePresentation(ctx,()=>undefined,key=>key,workbench);
const page={id:'fixture',kind:'local',label:'销售计划',body:()=> <p>业务页面</p>};
workbench.registerFrame(page);workbench.associateSession(page.id,{sessionId:'fixture',preset:'original',ownerScope:null});void workbench.open(page.id);
createRoot(document.getElementById('root')).render(<Document page={page} active={true} sessionId="fixture" useSessions={fn=>fn({byId:{}})} useSession={fn=>fn({openState:'open'})} useProjection={()=>'original'} renderSlot={()=> <div style={{marginTop:'auto'}}><Composer/></div>}/>);
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
  const browser = await chromium.launch({ headless: true });
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
