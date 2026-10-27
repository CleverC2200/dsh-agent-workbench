import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
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
const baseSkuFor = (versionId) => ({
  id: "s-" + versionId,
  skuCode: "1001",
  versionId,
  productCategName: "汤圆",
  materialDescription: "冷冻汤圆组合装（家庭分享装）支持完整查看的长物料描述与包装规格500g×12袋ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
  qty: "20",
  baseQty: "10",
  amt: "200",
  amtBase: "100",
  price: "10",
});

const comparison=new URL(location.href).searchParams.get('comparison');
const plans=comparison==='returned'?sourcePlans.map(plan=>({...plan,status:7})):comparison==='empty'?[]:comparison==='readonly'?sourcePlans.slice(0,1).map(plan=>({...plan,orderType:'Z'})):new URL(location.href).searchParams.has('grouped')?sourcePlans:sourcePlans.slice(0,1);
const skuFor=(versionId)=>{
  const base=baseSkuFor(versionId);
  if(!['inline','missing'].includes(comparison)) return base;
  const old=versionId.includes('previous'),older=versionId.includes('older');
  const prefix=versionId.slice(0,2);
  const qty=old?'10':older?'5':prefix==='v2'?'30':prefix==='v3'?'10':'20';
  const price=old?'8':older?'7':prefix==='v2'?'12':prefix==='v3'?'8':'10';
  return {...base,qty,price,amt:String(Number(qty)*Number(price))};
};
window.savedDrafts=[];
if (['history','forbidden','inline','missing'].includes(comparison)) for(const plan of plans) plan.seq = comparison==='missing' && plan.planId==='p2' ? 1 : 3;
const readCalls=window.readCalls=[];
const writes=window.writes=[];
const versionsFor=(plan)=>['history','forbidden','inline','missing'].includes(comparison) && !(comparison==='missing'&&plan.planId==='p2')
  ? [{...plan,id:plan.versionId,seq:3,effective:true},{...plan,id:plan.versionId+'-previous',seq:2,effective:false},{...plan,id:plan.versionId+'-older',seq:1,effective:false}]
  : [{...plan,id:plan.versionId,effective:true}];
const forbidden=async()=>{writes.push('write');throw Error('LOCAL_RENDER_ACTION_FORBIDDEN')};
const drafts=new Map();
const host={salesPlan:{
  periods:{invoke:async()=>({records:[{periodId:'period-1',periodMonth:'2026-10',planTypeCode:'Y',status:'OPEN'}],total:1,size:100,current:1,pages:1})},
  list:{invoke:async(q)=>{const records=q?.status===undefined||q.status===1?plans:[];return {records,total:records.length,size:200,current:1,pages:1}}},
  detail:{invoke:async({planId})=>{const plan=plans.find(row=>row.planId===planId);return {currentVersion:{...plan,id:plan.versionId,effective:true},skus:[skuFor(plan.versionId)],versions:versionsFor(plan),logs:[],actionContext:{versionId:plan.versionId,status:plan.status,nodeOrder:2,allowedActions:comparison==='returned'?['REJECT']:['APPROVE','REJECT'],snapshotHash:'a'.repeat(64)}}}},
  versions:{invoke:async({planId})=>{const plan=plans.find(row=>row.planId===planId);return versionsFor(plan)}},
  versionSkus:{invoke:async({versionId})=>{readCalls.push({versionId});if(comparison==='forbidden'&&versionId.includes('previous'))throw Object.assign(Error('forbidden'),{status:403});return [skuFor(versionId)]}},
  draft:{invoke:async(q)=>{const key=q.planId+':'+q.versionId;if(q.draft){writes.push('draft');window.savedDrafts.push(q.draft);drafts.set(key,q.draft);}return {draft:drafts.get(key)??null}}},
  logs:{invoke:async()=>[]},compare:{invoke:async({planId,fromVersionId,toVersionId})=>{
    readCalls.push({planId,fromVersionId,toVersionId});
    if(comparison==='forbidden')throw Object.assign(Error('forbidden'),{status:403});
    return [{skuCode:'1001',changeType:'UPDATED',before:{...skuFor(fromVersionId),qty:'10',amt:'100'},after:skuFor(toVersionId),qtyDelta:'10',amountDelta:'100'}];
  }},action:{invoke:forbidden},submit:{invoke:forbidden}
},modelInference:{invoke:forbidden}};
createRoot(document.getElementById('root')).render(<WorkbenchHostProvider value={host}><div className="gea-original-workbench"><Workbench stateScope="local-render" t={i18n.t.bind(i18n)} onContextChange={()=>{}} approvalStages={['region']} onSubmitBatch={(items)=>{window.approvalItems=items}} liveActionsEnabled/></div></WorkbenchHostProvider>);
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

async function openWorkbench(t, grouped = false, comparison) {
  const assets = new Map(
    bundle.outputFiles.map((asset) => [asset.path.split(/[\\/]/).at(-1), asset.text]),
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
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.GEA_TEST_CHROMIUM,
  });
  const page = await browser.newPage({ locale: 'zh-CN', viewport: { width: 1536, height: 920 } });
  page.setDefaultTimeout(10000);
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.route(/^https?:\/\//, (route) =>
    new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort(),
  );
  t.after(() => assert.deepEqual(pageErrors, []));
  const params = new URLSearchParams();
  if (grouped) params.set('grouped', '1');
  if (comparison) params.set('comparison', comparison);
  await page.goto(`http://127.0.0.1:${server.address().port}?${params}`);
  await expect(page.getByTestId('regional-approval-workbench')).toBeVisible();
  const groupBox = page.locator('tbody label.arco-checkbox:has(input[value*="group:"])').first();
  if (grouped) await expect(groupBox).toBeVisible();
  return { frame: page, page, groupBox };
}

async function assertExpandedSkuLayout(region) {
  const layout = await region.getByRole('table').evaluate((table) => {
    const viewport = table.parentElement;
    const row = [...table.querySelectorAll('tbody tr')].find((node) => node.querySelector('td'));
    const rowRect = row.getBoundingClientRect();
    const viewportRect = viewport.getBoundingClientRect();
    return {
      rowCoversRightEdge: row.contains(
        document.elementFromPoint(viewportRect.right - 4, rowRect.top + rowRect.height / 2),
      ),
      tableWidth: table.getBoundingClientRect().width,
      viewportWidth: viewport.clientWidth,
      columns: [...table.querySelectorAll('thead th')]
        .filter((node) => node.getAttribute('aria-hidden') !== 'true')
        .map((node) => node.getBoundingClientRect().width),
    };
  });
  assert.ok(
    layout.tableWidth >= layout.viewportWidth,
    `row background must span viewport: ${JSON.stringify(layout)}`,
  );
  assert.equal(
    layout.rowCoversRightEdge,
    true,
    'SKU row background must continue to the right edge',
  );
  assert.ok(layout.columns[0] <= 360, `SKU column too wide: ${layout.columns[0]}`);
  assert.ok(
    layout.columns.slice(1).every((width) => width <= 220),
    `metric columns too wide: ${layout.columns}`,
  );
  return layout;
}

async function visibleBlueAccents(page) {
  return page.getByTestId('regional-approval-workbench').evaluate((root) =>
    [...root.querySelectorAll('*')]
      .filter((node) => node.getBoundingClientRect().width > 0)
      .map((node) => ({
        label: (node.textContent ?? '').trim().slice(0, 24),
        className: typeof node.className === 'string' ? node.className : '',
        color: getComputedStyle(node).color,
        background: getComputedStyle(node).backgroundColor,
        border: getComputedStyle(node).borderTopColor,
      }))
      .filter((item) =>
        [item.color, item.background, item.border].some((value) => {
          const match = /rgba?\((\d+), (\d+), (\d+)/.exec(value);
          return (
            match &&
            Number(match[3]) > Number(match[1]) + 40 &&
            Number(match[3]) > Number(match[2]) + 20
          );
        }),
      ),
  );
}

test(
  'sales plan actions follow brand, secondary and disabled button states',
  { timeout: 30000 },
  async (t) => {
    const { page } = await openWorkbench(t);
    const state = (locator) =>
      locator.evaluate((node) => {
        const style = getComputedStyle(node);
        return {
          background: style.backgroundColor,
          color: style.color,
          border: style.borderTopColor,
          radius: style.borderRadius,
          height: style.height,
        };
      });
    const version = page.getByTestId('regional-approval-version-compare');
    await expect.poll(async () => (await state(version)).background).toBe('rgb(255, 255, 255)');
    assert.deepEqual(await state(version), {
      background: 'rgb(255, 255, 255)',
      color: 'rgb(85, 93, 104)',
      border: 'rgb(217, 221, 227)',
      radius: '6px',
      height: '36px',
    });
    const toolbar = page.getByTestId('regional-approval-toolbar-actions');
    const filter = toolbar.getByRole('button', { name: '筛选条件' });
    assert.deepEqual(await state(filter), {
      background: 'rgb(255, 255, 255)',
      color: 'rgb(85, 93, 104)',
      border: 'rgb(217, 221, 227)',
      radius: '8px',
      height: '36px',
    });
    await filter.hover();
    await expect.poll(async () => (await state(filter)).background).toBe('rgb(255, 250, 251)');
    assert.equal((await state(filter)).color, 'rgb(223, 23, 50)');
    const approve = toolbar.getByRole('button', { name: '通过' });
    assert.equal(await approve.isDisabled(), true);
    assert.deepEqual(await state(approve), {
      background: 'rgb(245, 246, 248)',
      color: 'rgb(160, 164, 172)',
      border: 'rgb(227, 230, 234)',
      radius: '8px',
      height: '36px',
    });
    const activeTab = page.getByRole('tab', { name: '按区域' });
    assert.equal((await state(activeTab)).color, 'rgb(223, 23, 50)');
  },
);

test(
  'dimension tab hover, underline and month value align with their controls',
  { timeout: 30000 },
  async (t) => {
    const { page } = await openWorkbench(t);
    const tab = page.getByRole('tab', { name: '按区域' });
    await tab.click();
    await tab.hover();
    const tabState = await tab.evaluate((node) => {
      const rect = node.getBoundingClientRect();
      const header = node.closest('[class*="queueHeader"]').getBoundingClientRect();
      const style = getComputedStyle(node);
      return {
        underlineGap: header.bottom - rect.bottom,
        color: style.color,
        background: style.backgroundColor,
        border: style.borderBottomColor,
      };
    });
    assert.deepEqual(tabState, {
      underlineGap: 1,
      color: 'rgb(223, 23, 50)',
      background: 'rgb(255, 240, 242)',
      border: 'rgb(223, 23, 50)',
    });
    const month = page.getByRole('combobox', { name: '销售计划周期' });
    const monthState = await month.evaluate((node) => {
      const view = node.querySelector('.arco-select-view');
      const value = node.querySelector('.arco-select-view-value');
      const range = document.createRange();
      range.selectNodeContents(value);
      const viewRect = view.getBoundingClientRect();
      const textRect = range.getBoundingClientRect();
      return {
        alignment: getComputedStyle(value).alignItems,
        centerGap: Math.abs((viewRect.top + viewRect.bottom - textRect.top - textRect.bottom) / 2),
      };
    });
    assert.equal(monthState.alignment, 'center');
    assert.ok(monthState.centerGap <= 1, `month text center gap: ${monthState.centerGap}px`);
  },
);

test(
  'sales plan controls and month menu use the shared brand palette',
  { timeout: 30000 },
  async (t) => {
    const { page } = await openWorkbench(t);
    await expect(page.getByRole('button', { name: /宝阳销售组/ }).first()).toBeVisible();
    assert.deepEqual(await visibleBlueAccents(page), [], 'default toolbar, row and pagination');
    const status = await page.getByTestId('regional-approval-status-p1').evaluate((node) => ({
      color: getComputedStyle(node).color,
      background: getComputedStyle(node).backgroundColor,
    }));
    assert.deepEqual(status, { color: 'rgb(102, 112, 133)', background: 'rgb(238, 241, 245)' });
    const month = page.getByRole('combobox', { name: '销售计划周期' });
    const trigger = await month.evaluate((node) => {
      const view = node.querySelector('.arco-select-view');
      const value = node.querySelector('.arco-select-view-value');
      return {
        height: getComputedStyle(view).height,
        radius: getComputedStyle(view).borderRadius,
        color: getComputedStyle(value).color,
        weight: getComputedStyle(value).fontWeight,
      };
    });
    assert.deepEqual(trigger, {
      height: '36px',
      radius: '8px',
      color: 'rgb(52, 59, 70)',
      weight: '700',
    });
    await month.click();
    const menu = page.locator('.arco-select-popup-inner').filter({ hasText: '2026年10月' });
    await expect(menu).toBeVisible();
    const option = await menu.locator('.arco-select-option-selected').evaluate((node) => ({
      color: getComputedStyle(node).color,
      background: getComputedStyle(node).backgroundColor,
      height: getComputedStyle(node).height,
      check: getComputedStyle(node, '::after').content,
    }));
    assert.deepEqual(option, {
      color: 'rgb(52, 59, 70)',
      background: 'rgb(255, 245, 246)',
      height: '34px',
      check: '"✓"',
    });
    if (process.env.SALES_PLAN_VISUAL_DIR) {
      await page.screenshot({
        path: resolve(process.env.SALES_PLAN_VISUAL_DIR, 'sales-plan-date.png'),
      });
    }
    await page.keyboard.press('Escape');
    await page.locator('.arco-switch').first().click();
    await page
      .getByRole('button', { name: /宝阳销售组/ })
      .first()
      .click();
    await expect(
      page.getByRole('spinbutton', { name: '确认计划量 1001', exact: true }),
    ).toBeVisible();
    assert.deepEqual(await visibleBlueAccents(page), [], 'checked switch and expanded SKU rows');
    await page.getByTestId('regional-approval-flow-toggle').click();
    assert.deepEqual(await visibleBlueAccents(page), [], 'expanded workflow stages');
    if (process.env.SALES_PLAN_VISUAL_DIR) {
      await page.screenshot({
        path: resolve(process.env.SALES_PLAN_VISUAL_DIR, 'sales-plan-brand.png'),
      });
    }
  },
);

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
  'top toolbar month label and date value follow the shared control typography',
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
      assert.equal(value.weight, 700, `月份取值「${value.text}」使用统一日期控件字重`);
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
      assert.equal(
        cell.bg,
        table === queue ? 'rgb(245, 246, 248)' : 'rgb(242, 243, 245)',
        `表头「${cell.text}」使用对应的浅灰底色`,
      );
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

test('版本选择并入顶栏同一行，窄窗口横向滚动且不出现原明细弹窗', { timeout: 30000 }, async (t) => {
  const { page } = await openWorkbench(t, false, 'history');
  const button = page.getByRole('button', { name: '版本对比', exact: true });
  await button.click();
  const header = page.locator('main > header');
  await expect(header.getByRole('combobox', { name: '版本①', exact: true })).toBeVisible();
  await expect(header.getByRole('combobox', { name: '版本②', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '版本明细', exact: true })).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  for (const width of [1000, 694]) {
    await page.setViewportSize({ width, height: 820 });
    const layout = await header.evaluate((el) => {
      const controls = [
        el.querySelector('[data-testid="regional-approval-version-compare"]'),
        ...el.querySelectorAll('[role="combobox"]'),
      ];
      return {
        height: el.getBoundingClientRect().height,
        centers: controls.map((node) => {
          const r = node.getBoundingClientRect();
          return r.y + r.height / 2;
        }),
        mainFits: el.parentElement.scrollWidth === el.parentElement.clientWidth,
      };
    });
    assert.ok(
      Math.max(...layout.centers) - Math.min(...layout.centers) < 2,
      JSON.stringify(layout),
    );
    assert.ok(layout.height <= 64, JSON.stringify(layout));
    assert.equal(layout.mainFits, true);
    if (process.env.GEA_COMPARE_EVIDENCE)
      await page.screenshot({
        path: process.env.GEA_COMPARE_EVIDENCE + '/compact-' + width + '.png',
      });
  }
  await button.click();
  await expect(page.getByRole('combobox', { name: '版本①', exact: true })).toHaveCount(0);
  assert.deepEqual(await page.evaluate(() => window.writes), []);
});

test('多计划各自读取对应版本，切换更早版本没有串用其他计划', { timeout: 30000 }, async (t) => {
  const { page, groupBox } = await openWorkbench(t, true, 'history');
  await groupBox.click();
  await page.getByRole('button', { name: '版本对比', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.readCalls
          .filter((row) => row.versionId?.includes('previous'))
          .map((row) => row.versionId)
          .sort(),
      ),
    )
    .toEqual(['v1-previous', 'v2-previous', 'v3-previous']);
  await page.getByRole('combobox', { name: '版本②', exact: true }).click();
  await page.getByRole('option', { name: '前 2 版', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.readCalls
          .filter((row) => row.versionId?.includes('older'))
          .map((row) => row.versionId)
          .sort(),
      ),
    )
    .toEqual(['v1-older', 'v2-older', 'v3-older']);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  assert.deepEqual(await page.evaluate(() => window.writes), []);
});

test('只有一版时显示缺失，历史读取被拒仍显示错误，不打开弹窗', { timeout: 30000 }, async (t) => {
  for (const mode of ['single', 'forbidden']) {
    const { page } = await openWorkbench(t, false, mode);
    await page.getByRole('button', { name: '版本对比', exact: true }).click();
    if (mode === 'forbidden') await expect(page.getByRole('alert')).toBeVisible();
    else
      await expect(
        page.locator('tbody tr').filter({ hasText: '宝阳销售组' }).first().getByRole('cell').nth(5),
      ).toHaveText('——');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    assert.deepEqual(await page.evaluate(() => window.writes), []);
  }
});

test('无可读计划禁用版本对比，只读来源仍能在列表查看版本', { timeout: 30000 }, async (t) => {
  const empty = await openWorkbench(t, false, 'empty');
  await expect(empty.page.getByRole('button', { name: '版本对比', exact: true })).toBeDisabled();
  const { page } = await openWorkbench(t, false, 'readonly');
  await expect(page.locator('tbody input[type="checkbox"]').first()).toBeDisabled();
  await page.getByRole('button', { name: '版本对比', exact: true }).click();
  await expect(page.getByRole('combobox', { name: '版本①', exact: true })).toBeVisible();
  await page
    .getByRole('button', { name: /宝阳销售组/ })
    .first()
    .click();
  const region = page.getByRole('region', { name: 'SKU 编码 / 物料描述', exact: true }).last();
  await expect(region.getByRole('spinbutton')).toHaveCount(0);
  await expect(region.getByRole('row').filter({ hasText: '1001' })).toContainText(
    'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
  );
  if (process.env.GEA_LAYOUT_EVIDENCE)
    await page.screenshot({
      path: resolve(process.env.GEA_LAYOUT_EVIDENCE, 'expanded-readonly.png'),
    });
  await expect(page.getByRole('dialog')).toHaveCount(0);
  assert.deepEqual(await page.evaluate(() => window.writes), []);
});

test(
  '列表和单计划SKU直接展示两版数量金额与①减②差异，历史版本不写入',
  { timeout: 30000 },
  async (t) => {
    const { page } = await openWorkbench(t, false, 'inline');
    await page.getByRole('button', { name: '版本对比', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('columnheader', { name: '月计划①', exact: true })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: '月计划②', exact: true })).toBeVisible();
    const queue = page.locator('tbody tr').filter({ hasText: '宝阳销售组' }).first();
    await expect(queue).toContainText('¥200');
    await expect(queue).toContainText('¥80');
    await expect(queue).toContainText('¥120');
    await queue.getByRole('button').first().click();
    const region = page.getByRole('region', { name: 'SKU 编码 / 物料描述', exact: true }).last();
    await expect(region.getByRole('columnheader')).toHaveText([
      'SKU 编码 / 物料描述',
      '月计划',
      '确认计划量①',
      '确认计划量②',
      '差异（① − ②）',
    ]);
    const row = region.getByRole('row').filter({ hasText: '1001' });
    await assertExpandedSkuLayout(region);
    assert.equal(
      await row
        .getByRole('cell')
        .first()
        .evaluate((node) => node.scrollWidth <= node.clientWidth),
      true,
    );
    await expect(row.getByRole('cell').nth(3)).toHaveText('10¥80.00');
    await expect(row.getByRole('cell').nth(4)).toHaveText('10¥120.00');
    await page.getByRole('combobox', { name: '版本①', exact: true }).click();
    await page.getByRole('option', { name: '上一版本', exact: true }).click();
    await expect(region.getByRole('spinbutton')).toHaveCount(0);
    await expect(row.getByRole('cell').nth(4)).toHaveText('0¥0.00');
    assert.deepEqual(await page.evaluate(() => window.writes), []);
    if (process.env.GEA_COMPARE_EVIDENCE)
      await page.screenshot({ path: process.env.GEA_COMPARE_EVIDENCE + '/inline-single.png' });
  },
);

test(
  '组织汇总按原确认数量比例分摊，合计、逐计划草稿和收起重开保持一致',
  { timeout: 30000 },
  async (t) => {
    const { page, groupBox } = await openWorkbench(t, true, 'inline');
    const queue = groupBox.locator('xpath=ancestor::tr');
    await queue.getByRole('button').first().click();
    const summary = page.getByTestId('regional-approval-group-sku-summary').first();
    const input = summary.getByRole('spinbutton', { name: '确认计划量 1001', exact: true });
    await expect(input).toBeVisible();
    await assertExpandedSkuLayout(summary.getByRole('region'));
    const old = Number(await input.inputValue());
    await input.fill(String(old * 2));
    await expect.poll(() => page.evaluate(() => window.savedDrafts.length)).toBeGreaterThan(1);
    const saved = await page.evaluate(() => window.savedDrafts);
    const latest = new Map(saved.map((draft) => [draft.planId, draft]));
    assert.equal(latest.get('p1').adjustments[0].adjustQty, '20');
    assert.equal(latest.get('p2').adjustments[0].adjustQty, '30');
    await expect(queue).toContainText('¥1,120');
    await queue.getByRole('button').first().click();
    await queue.getByRole('button').first().click();
    await expect(
      summary.getByRole('spinbutton', { name: '确认计划量 1001', exact: true }),
    ).toHaveValue('100');
    await groupBox.click();
    await page.getByRole('button', { name: '通过', exact: true }).click();
    const items = await page.evaluate(() => window.approvalItems);
    assert.deepEqual(Object.fromEntries(items.map((item) => [item.planId, item.pendingValues])), {
      p1: { 1001: '40' },
      p2: { 1001: '60' },
    });
    await page.getByRole('button', { name: '版本对比', exact: true }).click();
    await expect(
      summary.getByRole('spinbutton', { name: '确认计划量① 1001', exact: true }),
    ).toHaveValue('100');
    const skuRow = summary.getByRole('row').filter({ hasText: '1001' });
    await assertExpandedSkuLayout(summary.getByRole('region'));
    assert.equal(
      await skuRow
        .getByRole('cell')
        .first()
        .evaluate((node) => node.scrollWidth <= node.clientWidth),
      true,
    );
    await expect(skuRow.getByRole('cell').nth(3)).toHaveText('20¥160.00');
    await expect(skuRow.getByRole('cell').nth(4)).toHaveText('80¥960.00');
    assert.ok((await page.evaluate(() => window.writes)).every((kind) => kind === 'draft'));
    if (process.env.GEA_COMPARE_EVIDENCE) {
      await page.screenshot({ path: process.env.GEA_COMPARE_EVIDENCE + '/inline-group.png' });
      await page.setViewportSize({ width: 694, height: 820 });
      assert.equal(
        await page.locator('main').evaluate((el) => el.scrollWidth === el.clientWidth),
        true,
      );
      await expect(page.getByRole('combobox', { name: '版本②', exact: true })).toBeVisible();
      await page.screenshot({
        path: process.env.GEA_COMPARE_EVIDENCE + '/inline-group-narrow.png',
      });
    }
  },
);

test('组内缺少历史版本时不显示部分合计，不把缺失数量金额补零', { timeout: 30000 }, async (t) => {
  const { page, groupBox } = await openWorkbench(t, true, 'missing');
  const row = groupBox.locator('xpath=ancestor::tr');
  await page.getByRole('button', { name: '版本对比', exact: true }).click();
  await expect(row.getByRole('cell').nth(5)).toHaveText('——');
  await row.getByRole('button').first().click();
  const summary = page.getByTestId('regional-approval-group-sku-summary').first();
  const skuRow = summary.getByRole('row').filter({ hasText: '1001' });
  await expect(skuRow.getByRole('cell').nth(3)).toHaveText('——');
  await expect(skuRow.getByRole('cell').nth(4)).toHaveText('——');
  assert.deepEqual(await page.evaluate(() => window.writes), []);
});

test('汇总数量为空或超过精度时阻止通过，修正后可继续', { timeout: 30000 }, async (t) => {
  const { page, groupBox } = await openWorkbench(t, true, 'inline');
  const queue = groupBox.locator('xpath=ancestor::tr');
  await queue.getByRole('button').first().click();
  const input = page
    .getByTestId('regional-approval-group-sku-summary')
    .first()
    .getByRole('spinbutton', { name: '确认计划量 1001', exact: true });
  await expect(input).toBeVisible();
  await groupBox.click();
  await input.fill('');
  await expect(page.getByRole('button', { name: '通过', exact: true })).toBeDisabled();
  await input.fill('10.0001');
  await expect(page.getByRole('button', { name: '通过', exact: true })).toBeDisabled();
  await input.fill('10.001');
  await expect(page.getByRole('button', { name: '通过', exact: true })).toBeEnabled();
  await expect.poll(() => page.evaluate(() => window.savedDrafts.length)).toBe(2);
  const drafts = await page.evaluate(() => window.savedDrafts);
  const deltas = Object.fromEntries(
    drafts.map((draft) => [draft.planId, draft.adjustments[0].adjustQty]),
  );
  assert.deepEqual(deltas, { p1: '-16', p2: '-23.999' });
});

test('退回计划可继续修改本地草稿，组织汇总分摊不触发重提或审批', { timeout: 30000 }, async (t) => {
  const { page, groupBox } = await openWorkbench(t, true, 'returned');
  await groupBox.locator('xpath=ancestor::tr').getByRole('button').first().click();
  const group = page.getByTestId('regional-approval-group-sku-summary').first();
  const input = group.getByRole('spinbutton', { name: '确认计划量 1001', exact: true });
  await expect(input).toBeVisible();
  await input.fill('80');
  await expect.poll(() => page.evaluate(() => window.savedDrafts.length)).toBe(2);
  assert.ok((await page.evaluate(() => window.writes)).every((kind) => kind === 'draft'));
  await page.getByRole('tab', { name: '按客户', exact: true }).click();
  await page
    .getByRole('button', { name: /打开 客户1/ })
    .first()
    .click();
  await expect(page.getByRole('spinbutton', { name: '确认计划量 1001', exact: true })).toHaveValue(
    '40',
  );
});

test('split sales plan wraps control groups without clipping actions or the table header', async (t) => {
  const { page } = await openWorkbench(t);
  for (const width of [907, 760, 620]) {
    await page.setViewportSize({ width, height: 920 });
    const actions = page.getByTestId('regional-approval-toolbar-actions');
    const geometry = await actions.evaluate((node) => {
      const actions = node.getBoundingClientRect();
      const toolbar = node.parentElement.getBoundingClientRect();
      const root = node.closest('[data-testid="regional-approval-workbench"]');
      const header = node.closest('[class*="queueHeader"]').getBoundingClientRect();
      const table = root.querySelector('[class*="tableViewport"]').getBoundingClientRect();
      return {
        actionTops: [...node.querySelectorAll('button')].map(
          (button) => button.getBoundingClientRect().top,
        ),
        topOverflow: toolbar.top - actions.top,
        bottomOverflow: actions.bottom - toolbar.bottom,
        toolbarHeight: toolbar.height,
        tableGap: table.top - header.bottom,
        rightOverflow: actions.right - root.getBoundingClientRect().right,
      };
    });
    assert.ok(
      Math.max(...geometry.actionTops) - Math.min(...geometry.actionTops) <= 1,
      `actions aligned at ${width}px`,
    );
    assert.ok(
      geometry.topOverflow <= 0 && geometry.bottomOverflow <= 0,
      `actions remain inside toolbar at ${width}px`,
    );
    assert.ok(geometry.toolbarHeight <= 120, `wrapped toolbar at ${width}px`);
    assert.ok(geometry.tableGap >= 12, `table separated at ${width}px`);
    assert.ok(geometry.rightOverflow <= 0, `actions fit at ${width}px`);
    const customerTab = page.getByRole('tab', { name: '按客户' });
    await customerTab.scrollIntoViewIfNeeded();
    await expect(customerTab).toBeInViewport();
  }
});

test('展开 SKU 表在宽屏保持紧凑，长描述换行且窄屏可用键盘访问', { timeout: 30000 }, async (t) => {
  const { page } = await openWorkbench(t);
  await page
    .getByRole('button', { name: /宝阳销售组/ })
    .first()
    .click();
  const region = page.getByRole('region', { name: 'SKU 编码 / 物料描述', exact: true }).last();
  const row = region.getByRole('row').filter({ hasText: '1001' });
  await expect(row.getByRole('cell').first()).toContainText('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789');
  await expect(row.getByRole('cell').nth(1)).toHaveText('10¥100');
  const input = region.getByRole('spinbutton', { name: '确认计划量 1001', exact: true });
  await expect(input).toHaveValue('20');
  if (process.env.GEA_LAYOUT_EVIDENCE)
    await page.screenshot({ path: resolve(process.env.GEA_LAYOUT_EVIDENCE, 'expanded-wide.png') });
  const { columns: geometry } = await assertExpandedSkuLayout(region);
  t.diagnostic(`wide SKU/metric column widths: ${geometry.join(', ')}`);

  const description = row.getByRole('cell').first();
  assert.equal(await description.evaluate((node) => node.scrollWidth <= node.clientWidth), true);
  await input.fill('30');
  await expect(row.getByRole('cell').nth(2)).toContainText('¥300');
  await page.setViewportSize({ width: 694, height: 820 });
  const scroller = page.locator('.arco-table-content-inner').first();
  await expect
    .poll(() => scroller.evaluate((node) => node.scrollWidth > node.clientWidth))
    .toBe(true);
  await scroller.hover({ position: { x: 10, y: 10 } });
  await page.mouse.wheel(300, 0);
  await expect.poll(() => scroller.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0);
  await region.focus();
  await expect(region).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(input).toBeFocused();
  if (process.env.GEA_LAYOUT_EVIDENCE)
    await page.screenshot({
      path: resolve(process.env.GEA_LAYOUT_EVIDENCE, 'expanded-narrow.png'),
    });
});

test('pagination footer keeps counts and controls on one line', { timeout: 30000 }, async (t) => {
  const { frame, page } = await openWorkbench(t);
  const footer = frame.getByTestId('regional-approval-queue-footer');
  const total = footer.getByText(/^共 [\d,]+ 条$/);
  const pageSize = footer.locator('.arco-select-view');
  const currentPage = footer.locator('.arco-pagination-item-active');
  const pageCount = footer.getByText(/^共 \d+ 页$/);
  for (const viewportWidth of [1536, 420]) {
    await page.setViewportSize({ width: viewportWidth, height: 920 });
    await expect(total).toBeVisible();
    await expect(pageCount).toBeVisible();
    const boxes = await Promise.all(
      [total, pageSize, currentPage, pageCount].map((locator) => locator.boundingBox()),
    );
    assert.ok(boxes.every(Boolean), '分页元素均应有可测量的布局框');
    const centers = boxes.map((box) => box.y + box.height / 2);
    assert.ok(
      Math.max(...centers) - Math.min(...centers) <= 3,
      `分页元素应在同一水平中心线：${JSON.stringify(centers)}`,
    );
    assert.ok(
      Math.abs(boxes[1].height - 36) <= 1,
      `页容量选择框高度应为 36px，实际 ${boxes[1].height}`,
    );
    assert.ok(
      Math.abs(boxes[2].height - 36) <= 1,
      `页码按钮高度应为 36px，实际 ${boxes[2].height}`,
    );
    if (viewportWidth === 1536) {
      const overflow = await footer.evaluate((node) => node.scrollWidth - node.clientWidth);
      assert.ok(overflow <= 1, `桌面宽度不应横向溢出：${overflow}`);
    }
  }
});
