import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, mkdir } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
const baseline = '312adf90f1abcc05d9421083b2386939634d8796';
for (const name of ['category', 'mps'])
  test(`editable ${name} author source preserves original business content while the duplicate chat retires`, async (t) => {
    const browser = await chromium.launch({ headless: true });
    t.after(() => browser.close());
    const original = execFileSync('git', ['show', `${baseline}:static/${name}/index.html`], {
      cwd: process.cwd(),
      encoding: 'utf8',
      maxBuffer: 4 * 1024 * 1024,
    });
    const rebuilt = await readFile(`static/${name}/index.html`, 'utf8');
    const observe = async (html) => {
      const context = await browser.newContext({ viewport: { width: 1500, height: 900 } });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.route('http://static-author.test/**', (route) =>
        route.fulfill({ contentType: 'text/html', body: html }),
      );
      await page.goto('http://static-author.test/');
      await expect(page.locator('#root')).not.toBeEmpty();
      const businessText = () =>
        page.locator(name === 'mps' ? '.ap-board' : '.work').evaluate((element) => {
          const copy = element.cloneNode(true);
          copy.querySelectorAll('.author-questions').forEach((node) => node.remove());
          copy.querySelectorAll('button').forEach((button) => {
            if (button.textContent === 'Studio / 人物设置') button.remove();
          });
          return copy.textContent.replace(/\s+/g, ' ').trim();
        });
      const initial = await businessText();
      if (name === 'mps') {
        await page.locator('.ap-page-tab').filter({ hasText: '需求加工' }).click();
        await expect(page.locator('.ap-board-title')).toHaveText('需求加工与收敛');
      } else {
        const select = page.locator('select').first();
        if (await select.count()) await select.selectOption({ index: 1 });
        else await page.getByText('面点', { exact: true }).first().click();
      }
      const changed = await businessText();
      const result = { initial, changed, errors };
      await context.close();
      return result;
    };
    const expected = await observe(original),
      actual = await observe(rebuilt);
    assert.deepEqual(
      actual,
      expected,
      'the original business content and interaction survive the author composition repair',
    );
    await mkdir('.runtime/html-author-baseline', { recursive: true });
  });
