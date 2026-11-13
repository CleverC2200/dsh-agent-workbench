import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

test('unmet editor keeps input during composition and drag selection', async (t) => {
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : {}),
  });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const html = await readFile('prototypes/inventory-orderworkbench/index.html', 'utf8');
  const source = await readFile('prototypes/inventory-orderworkbench/entry.js', 'utf8');
  const start = source.indexOf('function openWorkbenchUnmetAdd(');
  const end = source.indexOf('const directorNoteOverlay', start);
  assert.ok(start >= 0 && end > start);
  await page.setContent(
    html
      .replace('__ORDER_ENTRY__', '')
      .replace('__SHARED_THEME_RESOURCE__', await readFile('theme/tokens.css', 'utf8'))
      .replace(
        '__ORDER_THEME__',
        await readFile('prototypes/inventory-orderworkbench/theme.css', 'utf8'),
      ),
  );
  await page.addScriptTag({
    content: `
      let pendingWorkbenchUnmet = null;
      const workbenchView = document.body;
      const workbenchPerformance = {'base-performance': {monthly: {rows: [['郑州']]}}};
      const getWorkbenchUnmetItems = () => [];
      const escapeHtml = value => value;
      const addedWorkbenchUnmetEntries = [];
      const workbenchUnmetOverrides = new Map();
      const saveWorkbenchUnmetState = () => true;
      const renderWorkbenchDimensions = () => {};
      const showWorkbenchToast = () => {};
      ${source.slice(start, end)}
    `,
  });
  const open = () => page.evaluate(() => openWorkbenchUnmetAdd('base', null));
  const hidden = () => page.locator('#wbUnmetAddOverlay').evaluate((element) => element.hidden);
  const reason = page.locator('#wbUnmetReasonInput');
  await open();
  await reason.fill('尚未填写完的原因');
  for (const options of [{ isComposing: true }, { keyCode: 229 }, { prevented: true }]) {
    await reason.evaluate((element, options) => {
      const event = new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true,
        ...options,
      });
      if (options.prevented) event.preventDefault();
      element.dispatchEvent(event);
    }, options);
    assert.equal(await hidden(), false, `composition/handled Escape: ${JSON.stringify(options)}`);
    assert.equal(await reason.inputValue(), '尚未填写完的原因');
  }
  const box = await reason.boundingBox();
  assert.ok(box);
  await page.mouse.move(box.x + 30, box.y + 20);
  await page.mouse.down();
  await page.mouse.move(5, 5, { steps: 10 });
  await page.mouse.up();
  assert.equal(await hidden(), false, 'dragging from textarea to backdrop must not dismiss');
  assert.equal(await reason.inputValue(), '尚未填写完的原因');
  await page.mouse.click(5, 5);
  assert.equal(await hidden(), true, 'intentional backdrop click still dismisses');
  await open();
  await reason.press('Escape');
  assert.equal(await hidden(), true, 'ordinary Escape still dismisses');
  await open();
  await page.locator('#wbUnmetAddCancel').click();
  assert.equal(await hidden(), true);
  await open();
  await page.locator('#wbUnmetEntity').selectOption('郑州');
  await page.locator('#wbUnmetTitleInput').fill('满足率未达成');
  await reason.fill('原因');
  await page.locator('#wbUnmetMeasureInput').fill('措施');
  await page.locator('#wbUnmetAddSubmit').click();
  assert.equal(await hidden(), true);
  assert.equal(await page.evaluate(() => addedWorkbenchUnmetEntries.length), 1);
  assert.deepEqual(errors, []);
});
