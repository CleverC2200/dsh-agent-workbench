import test from 'node:test';
import { build } from 'esbuild';
import { chromium, expect } from '@playwright/test';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import ts from 'typescript';
import assert from 'node:assert/strict';
const resolver = createRequire(resolve('business/inventory-fc/source/inventory-light-plugins/package.json'));
test('the actual FC component has no unresolved local identifiers in retained consumers', () => {
  const file = resolve('business/inventory-fc/source/inventory-light-plugins/src/pages/fc.tsx');
  const program = ts.createProgram([file], { noEmit: true, allowJs: true, skipLibCheck: true, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, jsx: ts.JsxEmit.ReactJSX, allowImportingTsExtensions: true });
  const diagnostics = program.getSemanticDiagnostics(program.getSourceFile(file)).filter(value => value.code === 2304 || value.code === 2552);
  assert.deepEqual(diagnostics.map(value => ts.flattenDiagnosticMessageText(value.messageText, '\n')), []);
});

const child = (await build({
  stdin: { contents: `
    import React from 'react';import{createRoot}from'react-dom/client';
    import{BranchInventoryAgent}from'./business/inventory-fc/source/inventory-light-plugins/src/pages/fc.tsx';
    import{buildWarehouseSnapshot}from'./business/inventory-fc/source/fc/src/lib/domain.ts';
    const snapshot=buildWarehouseSnapshot('east-china');
    // Offline UI fixture only, shaped for the existing snapshot validator; no GEA call.
    snapshot.dataSource='GEA SQL data_service 分仓库存标准表';snapshot.version='pg-fixture-only';
    window.fetch=async input=>{const path=new URL(String(input),location.href).pathname;
      if(path.endsWith('/api/session'))return Response.json({mode:'gea',userId:'fixture-user',authorizedWarehouses:['east-china'],warehouseOptions:[{id:'east-china',name:'fixture-only'}]});
      if(path.endsWith('/api/warehouse-page'))return Response.json({snapshot});
      throw Error('Unexpected fixture fetch '+path);};
    let revision=0;const root=createRoot(document.getElementById('app'));
    window.mountFc=()=>root.render(React.createElement(BranchInventoryAgent,{key:++revision}));
    window.addEventListener('gea-session-changed',()=>window.mountFc());window.mountFc();
  `, resolveDir: process.cwd(), loader: 'tsx' },
  bundle: true, write: false, outfile: 'fc-refresh.js', format: 'iife', platform: 'browser',
  define: { PLUGIN_ID: '"fc"', 'process.env': '{}' },
  loader: { '.css': 'empty', '.module.css': 'local-css' },
  plugins: [{ name: 'same-production-react', setup(builder) {
    builder.onResolve({ filter: /^react(?:\/|$)|^react-dom(?:\/|$)|^zod$/ }, args => ({ path: resolver.resolve(args.path) }));
  } }],
})).outputFiles.find(file => !file.path.endsWith('.css')).text;

test('the actual FC component retains its search across remounts in one Host Session', async t => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.route('http://127.0.0.1:19483/**', route => route.fulfill({ contentType: 'text/html', body: new URL(route.request().url()).pathname === '/fc' ? `<html><body><main id="app"></main><script>${child}</script></body></html>` : '<html><body></body></html>' }));
  await page.goto('http://127.0.0.1:19483/');
  await page.evaluate(() => {
    const frame=document.createElement('iframe');frame.src='/fc';document.body.append(frame);
    window.addEventListener('message',event=>{
      if(event.source!==frame.contentWindow||event.data?.protocol!=='gea-html-v2'||event.data.type!=='ready')return;
      const ports=new MessageChannel();ports.port1.onmessage=event=>{
        if(event.data.type==='request')ports.port1.postMessage({type:'response',id:event.data.id,result:{synced:true}});
      };ports.port1.start();
      frame.contentWindow.postMessage({protocol:'gea-html-v2',type:'connect',context:{plugin:'inventory-fc',session:'session-33333333-3333-4333-8333-333333333333'}},'*',[ports.port2]);
    });
  });
  const input=page.frameLocator('iframe').getByPlaceholder('搜索 SKU / 产品名称');
  await expect(input).toBeEnabled();
  await input.fill('SKU-refresh-intent');
  await expect(input).toHaveValue('SKU-refresh-intent');
  await page.frameLocator('iframe').locator('body').evaluate(() => window.mountFc());
  await expect(input).toBeEnabled();
  await expect(input).toHaveValue('SKU-refresh-intent');
});
