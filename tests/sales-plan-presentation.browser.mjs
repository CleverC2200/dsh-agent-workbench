import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { build } from 'esbuild';
import { chromium, expect } from '@playwright/test';

const bundle = await build({
  stdin: {
    resolveDir: process.cwd(),
    loader: 'tsx',
    contents: `
import React from 'react';
import { createRoot } from 'react-dom/client';
import i18next from 'i18next';
import '@arco-design/web-react/dist/css/arco.css';
import './src/workbench/workbench.css';
import zh from './src/workbench/original/zh-CN.json';
import Workbench from './src/workbench/original/workbenches/regionalApproval/RegionalApprovalWorkbench.tsx';
import { WorkbenchHostProvider } from './src/workbench/original/bridge.ts';
const i18n=i18next.createInstance();
await i18n.init({lng:'zh-CN',resources:{'zh-CN':{translation:{common:zh}}},interpolation:{escapeValue:false}});
const sourcePlans = [
  {
    planId: "p1",
    versionId: "v1",
    seq: 1,
    periodId: "period-1",
    planTypeCode: "Y",
    orderType: "M",
    dealerCode: "d1",
    dealerName: "客户1",
    orgCode: "org-a",
    orgName: "宝阳销售组",
    provinceCode: "province",
    provinceName: "华南省区",
    areaCode: "area",
    areaName: "华南大区",
    status: 1,
    currentQty: "20",
    currentAmount: "200",
    targetQty: "40",
    targetAmount: "400",
    skuCount: 1,
  },
  {
    planId: "p2",
    versionId: "v2",
    seq: 1,
    periodId: "period-1",
    planTypeCode: "Y",
    orderType: "M",
    dealerCode: "d2",
    dealerName: "客户2",
    orgCode: "org-a",
    orgName: "宝阳销售组",
    provinceCode: "province",
    provinceName: "华南省区",
    areaCode: "area",
    areaName: "华南大区",
    status: 1,
    currentQty: "30",
    currentAmount: "300",
    targetQty: "40",
    targetAmount: "400",
    skuCount: 1,
  },
  {
    planId: "p3",
    versionId: "v3",
    seq: 1,
    periodId: "period-1",
    planTypeCode: "Y",
    orderType: "M",
    dealerCode: "d3",
    dealerName: "客户3",
    orgCode: "org-b",
    orgName: "烟台经销组",
    provinceCode: "province",
    provinceName: "华南省区",
    areaCode: "area",
    areaName: "华南大区",
    status: 1,
    currentQty: "10",
    currentAmount: "100",
    targetQty: "40",
    targetAmount: "400",
    skuCount: 1,
  },
];
const skuFor = (versionId) => ({
  id: "s-" + versionId,
  skuCode: "1001",
  versionId,
  productCategName: "汤圆",
  qty: "20",
  baseQty: "10",
  amt: "200",
  amtBase: "100",
  price: "10",
});

const plans=new URL(location.href).searchParams.has("grouped")?sourcePlans:sourcePlans.slice(0,1);
const forbidden=async()=>{throw Error('LOCAL_RENDER_ACTION_FORBIDDEN')};
const drafts=new Map();
const host={salesPlan:{
  periods:{invoke:async()=>({records:[{periodId:'period-1',periodMonth:'2026-10',planTypeCode:'Y',status:'OPEN'}],total:1,size:100,current:1,pages:1})},
  list:{invoke:async(q)=>{const records=q?.status===undefined||q.status===1?plans:[];return {records,total:records.length,size:200,current:1,pages:1}}},
  detail:{invoke:async({planId})=>{const plan=plans.find(row=>row.planId===planId);return {currentVersion:{...plan,id:plan.versionId,effective:true},skus:[skuFor(plan.versionId)],versions:[],logs:[],actionContext:{versionId:plan.versionId,status:1,nodeOrder:2,allowedActions:['APPROVE','REJECT'],snapshotHash:'a'.repeat(64)}}}},
  versions:{invoke:async({planId})=>{const plan=plans.find(row=>row.planId===planId);return [{...plan,id:plan.versionId,effective:true}]}},
  versionSkus:{invoke:async({versionId})=>[skuFor(versionId)]},
  draft:{invoke:async(q)=>{const key=q.planId+':'+q.versionId;if(q.draft)drafts.set(key,q.draft);return {draft:drafts.get(key)??null}}},
  logs:{invoke:async()=>[]},compare:{invoke:async()=>[]},action:{invoke:forbidden},submit:{invoke:forbidden}
},modelInference:{invoke:forbidden}};
createRoot(document.getElementById('root')).render(<WorkbenchHostProvider value={host}><div className="gea-original-workbench"><Workbench stateScope="local-render" t={i18n.t.bind(i18n)} onContextChange={()=>{}} approvalStages={['region']} liveActionsEnabled/></div></WorkbenchHostProvider>);
`,
  },
  outfile: '/fixture/app.js',
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  define: { 'process.env.NODE_ENV': '"test"' },
  loader: { '.svg': 'dataurl', '.png': 'dataurl' },
});

async function openWorkbench(t, grouped = false) {
  const assets = new Map(
    bundle.outputFiles.map((asset) => [asset.path.split('/').at(-1), asset.text]),
  );
  const server = createServer((req, res) => {
    const name = req.url.slice(1);
    if (assets.has(name)) {
      res.setHeader('content-type', name.endsWith('.css') ? 'text/css' : 'text/javascript');
      res.end(assets.get(name));
    } else {
      res.setHeader('content-type', 'text/html; charset=utf-8');
      res.end(
        '<meta charset="utf-8"><link rel="stylesheet" href="/app.css"><style>html,body,#root{height:100%;margin:0}</style><div id="root" class="gea-workbench-document"></div><script type="module" src="/app.js"></script>',
      );
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  let browser;
  t.after(async () => {
    await browser?.close();
    await new Promise((resolve) => server.close(resolve));
  });
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ locale: 'zh-CN', viewport: { width: 1536, height: 920 } });
  page.setDefaultTimeout(10000);
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.route(/^https?:\/\//, (route) =>
    new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort(),
  );
  t.after(() => assert.deepEqual(pageErrors, []));
  await page.goto(`http://127.0.0.1:${server.address().port}${grouped ? '?grouped' : ''}`);
  await expect(page.getByTestId('regional-approval-workbench')).toBeVisible();
  const groupBox = page.locator('tbody label.arco-checkbox:has(input[value*="group:"])').first();
  if (grouped) await expect(groupBox).toBeVisible();
  return { frame: page, page, groupBox };
}

test('组织分组行的勾选可以取消，不会勾上就取消不掉', { timeout: 30000 }, async (t) => {
  const { groupBox } = await openWorkbench(t, true);
  const box = groupBox.locator('input');
  await expect(box).not.toBeChecked();
  await groupBox.click();
  await expect(box).toBeChecked();
  await groupBox.click();
  await expect(box).not.toBeChecked();
  await groupBox.click();
  await expect(box).toBeChecked();
});

test('多计划组织行展开后显示同一 SKU 的真实汇总', { timeout: 30000 }, async (t) => {
  const { frame, groupBox } = await openWorkbench(t, true);
  const groupRow = groupBox.locator('xpath=ancestor::tr');
  const count = Number(/(\d+)\s*份计划/.exec(await groupRow.innerText())?.[1]);
  assert.ok(count > 1, '测试行应包含多份计划');
  await groupRow.getByRole('button').first().click();
  const summary = frame.getByTestId('regional-approval-group-sku-summary');
  await expect(summary).toBeVisible();
  const skuRow = summary.getByRole('row').filter({ hasText: '1001' });
  await expect(skuRow).toContainText(String(count * 20));
  await expect(skuRow).toContainText((count * 200).toFixed(2));
});

test('editable quantity inputs are white, outlined and rounded', { timeout: 30000 }, async (t) => {
  const { frame } = await openWorkbench(t);
  await frame
    .getByRole('button', { name: /宝阳销售组/ })
    .first()
    .click();
  const input = frame.getByRole('spinbutton', { name: '确认计划量 1001', exact: true });
  await expect(input).toBeVisible();

  let idle;
  await expect
    .poll(async () => {
      idle = await input.evaluate((el) => {
        const s = getComputedStyle(el);
        return {
          bg: s.backgroundColor,
          borderWidth: s.borderTopWidth,
          borderColor: s.borderTopColor,
          radius: s.borderRadius,
        };
      });
      return idle;
    })
    .toMatchObject({ bg: 'rgb(255, 255, 255)', borderWidth: '1px' });
  assert.notEqual(idle.borderColor, 'rgba(0, 0, 0, 0)', '描边不能是透明');
  assert.ok(parseFloat(idle.radius) >= 4, `圆角要明显，实际 ${idle.radius}`);

  await input.click();
  await expect
    .poll(() => input.evaluate((el) => getComputedStyle(el).borderTopColor), { timeout: 3000 })
    .not.toBe(idle.borderColor);
});

test(
  'top toolbar labels are bold while their values stay normal',
  { timeout: 30000 },
  async (t) => {
    const { frame } = await openWorkbench(t);
    const measured = await frame.getByTestId('regional-approval-workbench').evaluate((el) => {
      const doc = el.ownerDocument;
      const weight = (node) => (node ? Number(getComputedStyle(node).fontWeight) : 0);
      const labels = [...doc.querySelectorAll('small')]
        .filter((node) => ['计划月份', '版本', '对比'].includes(node.textContent.trim()))
        .map((node) => ({ text: node.textContent.trim(), weight: weight(node) }));
      const values = [...doc.querySelectorAll('small')]
        .filter((node) => ['计划月份', '版本', '对比'].includes(node.textContent.trim()))
        .flatMap((label) => [
          ...(label.parentElement?.querySelectorAll('.arco-select-view-value') ?? []),
        ])
        .map((node) => ({ text: node.textContent.trim().slice(0, 12), weight: weight(node) }));
      return { labels, values };
    });
    assert.equal(
      measured.labels.length,
      1,
      `顶部只剩计划月份标签，实际：${JSON.stringify(measured.labels)}`,
    );
    for (const label of measured.labels)
      assert.ok(label.weight >= 600, `${label.text} 要加粗，实际 ${label.weight}`);
    assert.ok(measured.values.length > 0, '顶部要能读到取值');
    for (const value of measured.values)
      assert.equal(value.weight, 400, `取值「${value.text}」保持常规字重`);
  },
);

test('table headers are bold without a darker background', { timeout: 30000 }, async (t) => {
  const { frame } = await openWorkbench(t);
  await frame
    .getByRole('button', { name: /宝阳销售组/ })
    .first()
    .click();
  await expect(
    frame.getByRole('spinbutton', { name: '确认计划量 1001', exact: true }),
  ).toBeVisible();
  const tables = await frame.locator('table').evaluateAll((nodes) =>
    nodes
      .map((table) => ({
        head: [...table.querySelectorAll(':scope > thead > tr > th')].map((node) => ({
          text: (node.textContent || '').trim(),
          weight: Number(getComputedStyle(node).fontWeight),
          bg: getComputedStyle(node).backgroundColor,
        })),
      }))
      .filter((table) => table.head.length > 0),
  );
  const queue = tables.find((table) => table.head.some((cell) => cell.text === '组织名称'));
  const detail = tables.find((table) => table.head.some((cell) => cell.text === '确认计划量'));
  assert.ok(queue, '找不到队列表格表头');
  assert.ok(detail, '找不到 SKU 明细表头');
  const queueColumnNames = queue.head.map((cell) => cell.text);
  assert.ok(
    queueColumnNames.includes('月达成进度'),
    `队列表头缺少月达成进度列名，实际 ${JSON.stringify(queueColumnNames)}`,
  );
  assert.ok(!queueColumnNames.includes('计划/目标'), '不要再用「计划/目标」这种含糊列名');
  for (const table of [queue, detail]) {
    for (const cell of table.head) {
      if (!cell.text) continue;
      assert.ok(cell.weight >= 600, `表头「${cell.text}」要加粗，实际 ${cell.weight}`);
      assert.equal(cell.bg, 'rgb(242, 243, 245)', `表头「${cell.text}」底色不能被加深`);
    }
  }
});
test(
  'approval flow lane is collapsed by default and toggles from the title row',
  { timeout: 30000 },
  async (t) => {
    const { frame, page } = await openWorkbench(t);
    const lane = frame.getByTestId('regional-approval-flow-lane');
    const toggle = frame.getByTestId('regional-approval-flow-toggle');
    await expect(toggle).toBeVisible();
    await expect(lane).toBeHidden();
    await expect(toggle).toContainText('当前节点：城市经理审批');
    assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
    await expect(frame.getByTestId('regional-approval-queue-footer')).toBeVisible();

    await toggle.click();
    await expect(lane).toBeVisible();
    assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
    await expect(frame.locator('[data-testid^="regional-approval-stage-"]')).toHaveCount(5);
    await expect(frame.getByTestId('regional-approval-stage-region')).toBeEnabled();
    for (const stage of ['customer', 'province', 'area', 'category'])
      await expect(frame.getByTestId(`regional-approval-stage-${stage}`)).toBeDisabled();
    await expect(toggle).toContainText('当前节点：城市经理审批');
    await frame.getByTestId('regional-approval-stage-region').click();
    await expect(toggle).toContainText('当前节点：全部节点');
    await frame.getByTestId('regional-approval-stage-region').click();
    await expect(toggle).toContainText('当前节点：城市经理审批');

    await page.reload();
    await expect(frame.getByTestId('regional-approval-workbench')).toBeVisible();
    await expect(frame.getByTestId('regional-approval-flow-lane')).toBeVisible();

    await frame.getByTestId('regional-approval-flow-toggle').click();
    await expect(frame.getByTestId('regional-approval-flow-lane')).toBeHidden();
    await page.reload();
    await expect(frame.getByTestId('regional-approval-workbench')).toBeVisible();
    await expect(frame.getByTestId('regional-approval-flow-lane')).toBeHidden();
  },
);

test('collapsing the flow lane keeps filters and inline edits', { timeout: 30000 }, async (t) => {
  const { frame } = await openWorkbench(t);
  await frame.getByRole('button', { name: '筛选条件', exact: true }).click();
  const area = frame.getByLabel('大区', { exact: true });
  await area.click();
  await frame.getByRole('option', { name: '华南大区', exact: true }).click();
  await expect(area).toContainText('华南大区');
  await frame
    .getByRole('button', { name: /宝阳销售组/ })
    .first()
    .click();
  const input = frame.getByRole('spinbutton', { name: '确认计划量 1001', exact: true });
  await expect(input).toBeVisible();
  await input.fill('22.125');
  await expect(frame.locator('td').getByRole('status')).toHaveCount(0, { timeout: 10000 });

  const toggle = frame.getByTestId('regional-approval-flow-toggle');
  await toggle.click();
  await expect(frame.getByTestId('regional-approval-flow-lane')).toBeVisible();
  await toggle.click();
  await expect(frame.getByTestId('regional-approval-flow-lane')).toBeHidden();

  await toggle.click();
  await expect(frame.getByRole('spinbutton', { name: '确认计划量 1001', exact: true })).toHaveValue(
    '22.125',
  );
  await expect(area).toContainText('华南大区');
});
