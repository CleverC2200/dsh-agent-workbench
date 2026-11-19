import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { chromium, expect } from '@playwright/test';
import * as XLSX from 'xlsx-republish';

const bundle = await build({
  stdin: {
    resolveDir: process.cwd(),
    contents: `
import {salesPlanAllMonthlyReportRows} from './src/workbench/original/workbenches/regionalApproval/models/salesPlanMonthlyReportModel.ts';
import {downloadSalesPlanMonthlyReport} from './src/workbench/original/workbenches/regionalApproval/models/salesPlanMonthlyReportDownload.ts';
const p=(orderType,dealerCode,status=5)=>({planId:orderType+dealerCode,versionId:'v-'+orderType+dealerCode,periodId:'p',orderType,dealerCode,dealerName:'客户'+dealerCode,planTypeCode:'Y',baseName:'郑州',areaName:'大区',provinceName:'省区',orgName:'区域',status,skuCount:1});
const s=(p,fields={})=>({id:'s-'+p.versionId,versionId:p.versionId,skuCode:'010006285',skuName:'汤圆',productCategName:'汤圆',qty:'300',baseQty:'300',price:'115.04',amt:'34512',amtBase:'34512',regionConfirmedQty:null,regionConfirmedAmount:null,provinceConfirmedQty:null,provinceConfirmedAmount:null,areaConfirmedQty:null,areaConfirmedAmount:null,categoryConfirmedQty:null,categoryConfirmedAmount:null,...fields});
const a=p('M','001'),b=p('Z','001'),c=p('M','002',1),d=p('Z','003',7);
const sources=[{plan:a,skus:[s(a)]},{plan:b,skus:[s(b,{corrBaseQty:'300',adjAddQty:'0',adjCutQty:'200',categoryConfirmedQty:'100',price:'120'})]},{plan:c,skus:[s(c,{qty:'0',baseQty:'0',price:'295.00',provinceConfirmedQty:'12'})]},{plan:d,skus:[s(d,{qty:'0',baseQty:'0',corrBaseQty:'0',price:'295.00',regionConfirmedQty:'12'})]}];
const prior={...a,planId:'prior',versionId:'prior-version',periodId:'prior-period'};
const datedSources=[{month:'2026-10',plan:prior,skus:[s(prior)]},...sources.map(source=>({...source,month:'2026-11'}))];
const facts=(dealerCode)=>({grading:'工厂仓',inventoryOrganization:'郑州总库存组织',customerType:'经销商',customerGroup:'三级',productGrade:null,materialGroupCode:'102121',materialGroupName:'思念312g元宝汤圆',correctionPlanQty:dealerCode==='003'?'12':'-200',consensusPlanQty:dealerCode==='003'?'12':'-200',correctedPlanQty:dealerCode==='003'?'12':'100'});
window.reportMode='ready';
document.querySelector('#download').onclick=async()=>{
 document.querySelector('#result').textContent='reading';
 const control=new AbortController();
 try{
  if(window.reportMode==='cancelled')control.abort();
  const rows=salesPlanAllMonthlyReportRows(datedSources,(month,dealerCode)=>window.reportMode==='missing'?undefined:facts(dealerCode),()=> '审批完成');
  await downloadSalesPlanMonthlyReport(rows,{signal:control.signal});
  document.querySelector('#result').textContent='downloaded';
 }catch(error){document.querySelector('#result').textContent=error.message;}
};
`,
  },
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
});

async function openReport(t) {
  const server = createServer((request, response) => {
    if (request.url === '/app.js') {
      response.setHeader('content-type', 'text/javascript');
      response.end(bundle.outputFiles[0].text);
    } else {
      response.setHeader('content-type', 'text/html; charset=utf-8');
      response.end(
        '<meta charset="utf-8"><button id="download">下载月度报表</button><output id="result"></output><script type="module" src="/app.js"></script>',
      );
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.GEA_TEST_CHROMIUM,
  });
  t.after(async () => {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  });
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  return page;
}

test('complete verified report facts download one XLSX across months with all 25 sample columns', async (t) => {
  const page = await openReport(t);
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: '下载月度报表' }).click();
  const download = await pending;
  assert.equal(download.suggestedFilename(), '月度计划报表.xlsx');
  const workbook = XLSX.read(await readFile(await download.path()), { type: 'buffer' });
  assert.deepEqual(workbook.SheetNames, ['月度计划']);
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets['月度计划'], { header: 1 });
  assert.equal(rows[0].length, 25);
  assert.deepEqual(rows[0], [
    '分级',
    '所属基地',
    '库存组织',
    '大区',
    '省区',
    '区域名称',
    '客户类型',
    '客户组名称',
    '客户编码',
    '客户名称',
    '产品大类',
    '产品档次',
    '物料组编码',
    '物料组名称',
    '产品编码',
    '产品名称',
    '状态',
    '纠偏状态',
    '月份',
    '月初计划',
    '纠偏计划',
    '共识计划',
    '纠偏后计划',
    '月初计划额',
    '纠偏后计划额',
  ]);
  assert.equal(rows.length, 5);
  assert.equal(rows[1][8], '001');
  assert.equal(rows[1][14], '010006285');
  assert.equal(rows[1][11], 0);
  assert.deepEqual(rows.map((row) => row[18]).slice(1), [
    '2026-10',
    '2026-11',
    '2026-11',
    '2026-11',
  ]);
  assert.deepEqual(rows[1].slice(19), [300, 0, 0, 300, 34512, 34512]);
  assert.deepEqual(rows[2].slice(19), [300, -200, -200, 100, 34512, 12000]);
  assert.deepEqual(rows[3].slice(19), [12, 0, 0, 12, 3540, 3540]);
  assert.deepEqual(rows[4].slice(19), [0, 12, 12, 12, 0, 3540]);
  if (process.env.SALES_PLAN_REPORT_EVIDENCE)
    await download.saveAs(process.env.SALES_PLAN_REPORT_EVIDENCE);
});

test('unconfirmed fields and cancelled requests produce no download', async (t) => {
  const page = await openReport(t);
  const downloads = [];
  page.on('download', (value) => downloads.push(value));
  await page.evaluate(() => {
    window.reportMode = 'missing';
  });
  await page.getByRole('button', { name: '下载月度报表' }).click();
  await expect(page.locator('#result')).toContainText('UNCONFIRMED_REPORT_FIELDS');
  await page.evaluate(() => {
    window.reportMode = 'cancelled';
  });
  await page.getByRole('button', { name: '下载月度报表' }).click();
  await expect(page.locator('#result')).toContainText('aborted');
  assert.equal(downloads.length, 0);
});
