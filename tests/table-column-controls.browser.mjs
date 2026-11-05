import test from 'node:test';
import { build } from 'esbuild';
import { resolve } from 'node:path';
import { chromium, expect } from '@playwright/test';

const output = await build({
  stdin: {
    contents: `import React,{useState}from'react';import{createRoot}from'react-dom/client';
      import{ColumnFilterControl}from'./business/shared/table-column-controls';
      function Fixture(){const[values,setValues]=useState({});return <>
        <ColumnFilterControl label="风险状态" definition={{kind:'select',name:'risk',options:[{value:'正常',label:'正常'},{value:'滞库',label:'滞库'}]}} values={values} onApply={changes=>setValues({...values,...changes})}/>
        <ColumnFilterControl label="产品编码" definition={{kind:'text',name:'sku'}} values={values} onApply={changes=>setValues({...values,...changes})}/>
        <ColumnFilterControl label="库存" definition={{kind:'number',min:'min',max:'max'}} values={values} onApply={changes=>setValues({...values,...changes})}/>
        <output aria-label="已应用筛选">{JSON.stringify(values)}</output></>}
      createRoot(document.getElementById('app')).render(<Fixture/>);`,
    resolveDir: process.cwd(),
    loader: 'tsx',
  },
  bundle: true,
  write: false,
  outfile: 'column-controls.js',
  format: 'iife',
  platform: 'browser',
  alias: {
    react: resolve('node_modules/react'),
    'react-dom': resolve('node_modules/react-dom'),
  },
  define: { 'process.env.NODE_ENV': '"test"' },
  loader: { '.module.css': 'local-css' },
});
const js = output.outputFiles.find((file) => file.path.endsWith('.js')).text;
const css = output.outputFiles.find((file) => file.path.endsWith('.css')).text;

test('column filters apply, clear and accept Enter inside the client restricted frame', async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  page.setDefaultTimeout(2000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('http://127.0.0.1:19537/**', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body:
        new URL(route.request().url()).pathname === '/'
          ? '<iframe sandbox="allow-scripts allow-downloads" src="/filters" style="width:900px;height:650px"></iframe>'
          : `<style>${css}</style><div id="app"></div><script>${js}</script>`,
    }),
  );
  await page.goto('http://127.0.0.1:19537/');
  const frame = page.frameLocator('iframe');
  const applied = frame.getByRole('status', { name: '已应用筛选' });
  await frame.getByRole('button', { name: '筛选风险状态', exact: true }).click();
  await frame.getByRole('combobox', { name: '筛选值' }).selectOption('正常');
  await frame.getByRole('button', { name: '应用', exact: true }).click();
  await expect(applied).toHaveText('{"risk":"正常"}');
  await expect(frame.getByRole('button', { name: '应用', exact: true })).toHaveCount(0);
  await frame.getByRole('button', { name: '筛选风险状态', exact: true }).click();
  await frame.getByRole('button', { name: '清除', exact: true }).click();
  await expect(applied).toHaveText('{"risk":""}');
  await frame.getByRole('button', { name: '筛选产品编码', exact: true }).click();
  await frame.getByRole('textbox', { name: '包含' }).fill('10000001');
  await frame.getByRole('button', { name: '应用', exact: true }).click();
  await expect(applied).toContainText('"sku":"10000001"');
  await frame.getByRole('button', { name: '筛选库存', exact: true }).click();
  await frame.getByRole('spinbutton', { name: '最小值' }).fill('10');
  await frame.getByRole('spinbutton', { name: '最大值' }).fill('20');
  await frame.getByRole('button', { name: '应用', exact: true }).click();
  await expect(applied).toContainText('"min":"10","max":"20"');
  await frame.getByRole('button', { name: '筛选库存', exact: true }).click();
  await frame.getByRole('spinbutton', { name: '最大值' }).fill('5');
  await frame.getByRole('button', { name: '应用', exact: true }).click();
  await expect(applied).toContainText('"max":"20"');
  await expect(frame.getByRole('button', { name: '应用', exact: true })).toBeVisible();
  await frame.getByRole('spinbutton', { name: '最大值' }).fill('30');
  await frame.getByRole('spinbutton', { name: '最大值' }).press('Enter');
  await expect(applied).toContainText('"max":"30"');
  await frame.getByRole('button', { name: '筛选风险状态', exact: true }).click();
  await frame.getByRole('combobox', { name: '筛选值' }).selectOption('滞库');
  await frame.getByRole('combobox', { name: '筛选值' }).press('Enter');
  await expect(applied).toContainText('"risk":"滞库"');
  await expect.poll(() => errors).toEqual([]);
});
