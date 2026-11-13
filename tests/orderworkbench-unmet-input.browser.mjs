import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import { chromium } from '@playwright/test';

test('unmet form input and lifecycle regression on the complete page', async (t) => {
  const source = await readFile('prototypes/inventory-orderworkbench/entry.js', 'utf8');
  const bundled = await build({
    stdin: {
      contents:
        source +
        `
        window.unmetTest = {
          async prepare() {
            await persistence.open({kind:'month', start:'2026-10-01', end:'2026-11-01'}, new AbortController().signal);
            reportLoaded = true;
            for (const [key, name] of [['base-performance','郑州'], ['item-performance','小水饺'], ['director-performance','总监甲']]) {
              for (const period of ['monthly','weekly']) workbenchPerformance[key][period].rows = [[name, ...Array(15).fill('—')]];
            }
            renderWorkbenchDimensions();
          },
          open: (kind='base', key='') => openWorkbenchUnmetAdd(kind, null, key),
          entries: () => structuredClone(addedWorkbenchUnmetEntries),
          pending: () => persistence.pending(),
          retry: () => persistence.retry(),
          render: () => renderWorkbenchDimensions(),
          disableSave: () => persistence.cancel(),
        };
      `,
      resolveDir: resolve('prototypes/inventory-orderworkbench'),
      sourcefile: 'entry.js',
    },
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
    define: { ORDER_WORKBENCH_METRIC_VERSION: '0' },
    plugins: [
      {
        name: 'isolated-workspace',
        setup(api) {
          api.onResolve({ filter: /(?:^|\/)channel\.js$/ }, () => ({
            path: 'channel',
            namespace: 'test',
          }));
          api.onResolve({ filter: /(?:^|\/)live-source\.js$/ }, () => ({
            path: 'live',
            namespace: 'test',
          }));
          api.onLoad({ filter: /.*/, namespace: 'test' }, ({ path }) => ({
            contents:
              path === 'channel'
                ? `export const ready = new Promise(()=>{});
               export const call = (method,request) => window.testWorkspace(method,request);
               export const ask = async()=>{}; export const draft = async()=>{};
               export const currentSessionId = ()=> 'unmet-input-test';
               export const reportElements = ()=>()=>{};`
                : `export const loadWorkbenchFacts = async()=>{throw Error('Unexpected live query')};
               export const loadWorkbenchSkuPage = async()=>{throw Error('Unexpected live query')};`,
            loader: 'js',
          }));
        },
      },
    ],
  });
  const html = (await readFile('prototypes/inventory-orderworkbench/index.html', 'utf8'))
    .replace('__SHARED_THEME_RESOURCE__', await readFile('theme/tokens.css', 'utf8'))
    .replace(
      '__ORDER_THEME__',
      await readFile('prototypes/inventory-orderworkbench/theme.css', 'utf8'),
    )
    .replace('__ORDER_ENTRY__', bundled.outputFiles[0].text.replace(/<\/script/gi, '<\\/script'));
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : {}),
  });
  t.after(() => browser.close());
  async function fixture(t) {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    t.after(() => page.close());
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    t.after(() => assert.deepEqual(errors, []));
    await page.addInitScript(() => {
      window.writes = [];
      window.savedEdits = null;
      window.testWorkspace = async (method, request) => {
        if (method !== 'workspace') return {};
        if (request.operation === 'load')
          return { version: 0, editVersion: 0, report: null, scope: { key: 'test-only' } };
        window.writes.push(structuredClone(request));
        if (window.slowSave)
          await new Promise((resolve) => {
            window.finishSave = resolve;
          });
        if (window.rejectSave) throw Error('模拟保存失败');
        window.savedEdits = structuredClone(request.report.edits);
        return { saved: true, requestId: request.requestId, version: request.expectedVersion + 1 };
      };
    });
    await page.route('**/*', (route) =>
      route.request().url() === 'https://workbench.test/'
        ? route.fulfill({ contentType: 'text/html', body: html })
        : route.abort(),
    );
    await page.goto('https://workbench.test/');
    await page.evaluate(async () => {
      await window.unmetTest.prepare();
      window.unmetTest.open();
    });
    const field = (id) => page.locator('#wbUnmet' + id);
    const hidden = () => field('AddOverlay').evaluate((element) => element.hidden);
    const fill = async (title = '未达成标题', reason = '原因', measure = '措施') => {
      await field('Entity').selectOption('郑州');
      await field('TitleInput').fill(title);
      await field('ReasonInput').fill(reason);
      await field('MeasureInput').fill(measure);
    };
    const unchanged = async (values) => {
      assert.equal(await hidden(), false);
      for (const [id, value] of Object.entries(values))
        assert.equal(await field(id).inputValue(), value);
      assert.equal(await page.evaluate(() => window.writes.length), 0);
    };
    return { page, field, hidden, fill, unchanged };
  }
  for (const [label, title, reason, measure] of [
    ['one character', '短', '因', '改'],
    ['ordinary Chinese', '订单满足率未达成', '库存不足，需要补货。', '次日跟进补货并确认。'],
    ['maximum length', '标'.repeat(120), '因'.repeat(2000), '措'.repeat(2000)],
    [
      'multiline and symbols',
      '中文😀 / ABC < > & "',
      '第一行\n第二行\n\t123😀<script>内容</script>',
      'A\nB\nC',
    ],
  ])
    await t.test(label, async (t) => {
      const { page, field, fill, unchanged, hidden } = await fixture(t);
      await fill(title, reason, measure);
      await unchanged({ TitleInput: title, ReasonInput: reason, MeasureInput: measure });
      await page.waitForTimeout(50);
      await field('AddSubmit').click();
      assert.equal(await hidden(), true);
      await page.waitForFunction(() => window.savedEdits);
      const entry = await page.evaluate(() => window.savedEdits.unmet[0]);
      assert.equal(entry.title, title.trim());
      assert.equal(entry.reason, reason.trim());
      assert.equal(entry.measure, measure.trim());
    });
  for (const missing of ['Entity', 'TitleInput', 'ReasonInput', 'MeasureInput'])
    await t.test('missing ' + missing, async (t) => {
      const { field, fill, unchanged } = await fixture(t);
      await fill();
      if (missing === 'Entity') await field(missing).selectOption('');
      else await field(missing).fill('');
      await field('AddSubmit').click();
      await unchanged({ [missing]: '' });
    });
  await t.test('whitespace-only input cannot close or save', async (t) => {
    const { field, fill, unchanged } = await fixture(t);
    await fill('  ', '\n  ', '\t ');
    await field('AddSubmit').click();
    await unchanged({ TitleInput: '  ', ReasonInput: '\n  ', MeasureInput: '\t ' });
  });
  await t.test('typing beyond maxlength preserves dialog', async (t) => {
    const { page, field, fill, unchanged } = await fixture(t);
    await fill('标'.repeat(120), '因'.repeat(2000), '措'.repeat(2000));
    for (const id of ['TitleInput', 'ReasonInput', 'MeasureInput']) {
      await field(id).focus();
      await field(id).press('End');
      await page.keyboard.insertText('新增文字');
    }
    await unchanged({
      TitleInput: '标'.repeat(120),
      ReasonInput: '因'.repeat(2000),
      MeasureInput: '措'.repeat(2000),
    });
  });
  await t.test('Enter in title does not submit while editing', async (t) => {
    const { field, fill, unchanged } = await fixture(t);
    await fill();
    await field('TitleInput').press('Enter');
    await unchanged({ TitleInput: '未达成标题', ReasonInput: '原因', MeasureInput: '措施' });
  });
  await t.test('Enter and modified Enter in textarea retain input', async (t) => {
    const { field, fill, unchanged } = await fixture(t);
    await fill();
    await field('ReasonInput').press('End');
    await field('ReasonInput').press('Enter');
    await field('ReasonInput').press('Shift+Enter');
    await field('MeasureInput').press('Control+Enter');
    await unchanged({ ReasonInput: '原因\n\n' });
  });
  await t.test('composition, editing shortcuts, focus and interior clicks', async (t) => {
    const { page, field, fill, hidden, unchanged } = await fixture(t);
    await fill();
    await field('ReasonInput').evaluate((el) => {
      el.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '原因' }));
      for (const key of ['Enter', 'Escape'])
        el.dispatchEvent(new KeyboardEvent('keydown', { key, isComposing: true, bubbles: true }));
      el.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '原因' }));
    });
    await unchanged({ ReasonInput: '原因' });
    await field('ReasonInput').press('Control+A');
    await page.keyboard.insertText('粘贴内容\n第二行');
    await field('ReasonInput').press('Control+Z');
    await field('ReasonInput').press('Control+Y');
    await field('ReasonInput').press('Tab');
    await page.locator('#wbUnmetAddTitle').click();
    await page.locator('#wbUnmetAddForm').click({ position: { x: 5, y: 5 } });
    await page.evaluate(() => {
      window.dispatchEvent(new Event('blur'));
      window.dispatchEvent(new Event('focus'));
      window.unmetTest.render();
    });
    assert.equal(await hidden(), false);
    assert.equal(await page.evaluate(() => window.writes.length), 0);
    assert.equal(await field('ReasonInput').inputValue(), '粘贴内容\n第二行');
  });
  await t.test('untouched empty form stays open', async (t) => {
    const { field, unchanged } = await fixture(t);
    await field('AddSubmit').click();
    await unchanged({ TitleInput: '', ReasonInput: '', MeasureInput: '' });
  });
  await t.test('clipboard paste clips length without dismissal', async (t) => {
    const { page, field, fill, unchanged } = await fixture(t);
    await page
      .context()
      .grantPermissions(['clipboard-read', 'clipboard-write'], {
        origin: 'https://workbench.test',
      });
    await fill();
    for (const [id, length] of [
      ['TitleInput', 120],
      ['ReasonInput', 2000],
      ['MeasureInput', 2000],
    ]) {
      await page.evaluate(() => navigator.clipboard.writeText('文'.repeat(3000)));
      await field(id).focus();
      await field(id).press('Control+A');
      await field(id).press('Control+V');
      assert.equal(await field(id).inputValue(), '文'.repeat(length));
    }
    await unchanged({
      TitleInput: '文'.repeat(120),
      ReasonInput: '文'.repeat(2000),
      MeasureInput: '文'.repeat(2000),
    });
  });
  await t.test('repeated typing, deletion and selection do not dismiss', async (t) => {
    const { page, field, fill, unchanged } = await fixture(t);
    await fill();
    for (let i = 0; i < 30; i++) {
      await field('ReasonInput').press('Control+A');
      await field('ReasonInput').press('Backspace');
      await page.keyboard.insertText(`第${i}次修改：原因与措施`);
    }
    await unchanged({ ReasonInput: '第29次修改：原因与措施' });
  });
  for (const [width, height] of [
    [1024, 768],
    [768, 600],
  ])
    await t.test(`scrolling and resize ${width}x${height}`, async (t) => {
      const { page, field, fill, unchanged } = await fixture(t);
      await fill('标题', '长文本'.repeat(500), '措施'.repeat(1000));
      await page.setViewportSize({ width, height });
      await field('ReasonInput').focus();
      await field('ReasonInput').press('Control+End');
      await page.mouse.wheel(0, 700);
      await page.mouse.wheel(0, -700);
      await unchanged({ ReasonInput: '长文本'.repeat(500), MeasureInput: '措施'.repeat(1000) });
    });
  await t.test('right mouse button on backdrop does not dismiss', async (t) => {
    const { page, fill, unchanged } = await fixture(t);
    await fill();
    await page.mouse.click(5, 5, { button: 'right' });
    await unchanged({ ReasonInput: '原因' });
  });
  await t.test('drag from backdrop into dialog does not dismiss', async (t) => {
    const { page, field, fill, unchanged } = await fixture(t);
    await fill();
    const box = await field('ReasonInput').boundingBox();
    await page.mouse.move(5, 5);
    await page.mouse.down();
    await page.mouse.move(box.x + 20, box.y + 20, { steps: 10 });
    await page.mouse.up();
    await unchanged({ ReasonInput: '原因' });
  });
  await t.test('cancelled pointer cannot leave a stale dismissal gesture', async (t) => {
    const { field, fill, unchanged } = await fixture(t);
    await fill();
    await field('AddOverlay').evaluate((el) => {
      el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }));
      el.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true }));
      el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await unchanged({ ReasonInput: '原因' });
  });
  await t.test('double submit creates only one item', async (t) => {
    const { page, field, fill, hidden } = await fixture(t);
    await fill();
    await field('AddSubmit').dblclick();
    assert.equal(await hidden(), true);
    await page.waitForFunction(() => window.savedEdits);
    assert.equal(await page.evaluate(() => window.savedEdits.unmet.length), 1);
    assert.equal(await page.evaluate(() => window.writes.length), 1);
  });
  await t.test('editing an existing item retains long text on Enter', async (t) => {
    const { page, field, fill, hidden } = await fixture(t);
    await fill();
    await field('AddSubmit').click();
    await page.waitForFunction(() => window.savedEdits);
    await page.locator('[data-wb-edit-unmet]').first().click();
    assert.equal(await field('ReasonInput').inputValue(), '原因');
    await field('ReasonInput').fill('修改后的原因'.repeat(200));
    await field('TitleInput').press('Enter');
    assert.equal(await hidden(), false);
    assert.equal(await page.evaluate(() => window.writes.length), 1);
    await field('AddSubmit').click();
    await page.waitForFunction(() => window.writes.length === 2 && !window.unmetTest.pending());
    assert.equal(await page.evaluate(() => window.savedEdits.unmet.length), 1);
    assert.ok(
      await page.evaluate(() =>
        window.savedEdits.overrides.some(
          ([, value]) => value.reason === '修改后的原因'.repeat(200),
        ),
      ),
    );
  });
  await t.test('explicit close and reopening are intentional dismissal', async (t) => {
    const { page, field, fill, hidden } = await fixture(t);
    await fill();
    await field('AddClose').click();
    assert.equal(await hidden(), true);
    assert.equal(await page.evaluate(() => window.writes.length), 0);
    await page.evaluate(() => window.unmetTest.open());
    assert.equal(await field('ReasonInput').inputValue(), '');
  });
  await t.test(
    'slow save closes only after explicit submit and keeps queued content',
    async (t) => {
      const { page, field, fill, hidden } = await fixture(t);
      await fill();
      await page.evaluate(() => (window.slowSave = true));
      await field('AddSubmit').click();
      assert.equal(await hidden(), true);
      assert.equal(await page.evaluate(() => window.unmetTest.pending()), true);
      await page.evaluate(() => {
        window.slowSave = false;
        window.finishSave();
      });
      await page.waitForFunction(() => window.savedEdits);
      assert.equal(await page.evaluate(() => window.savedEdits.unmet[0].reason), '原因');
    },
  );
  await t.test('save error retains editable item and retry uses same content', async (t) => {
    const { page, field, fill } = await fixture(t);
    await fill();
    await page.evaluate(() => (window.rejectSave = true));
    await field('AddSubmit').click();
    await page.waitForFunction(
      () => document.getElementById('reportPersistenceStatus').dataset.state === 'error',
    );
    assert.equal(await page.evaluate(() => window.unmetTest.entries()[0].reason), '原因');
    await page.evaluate(() => {
      window.rejectSave = false;
      window.unmetTest.retry();
    });
    await page.waitForFunction(() => window.savedEdits);
    assert.equal(await page.evaluate(() => window.savedEdits.unmet[0].reason), '原因');
  });
});
