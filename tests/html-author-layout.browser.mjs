import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from './helpers/prepared-assets.mjs';
import { expect } from '@playwright/test';
import { authorPage as fixture } from './helpers/author-page.mjs';

for (const name of ['category', 'mps'])
  test(
    name +
      ' business board adapts inside the actual Document while author questions use the current draft CAS',
    async (t) => {
      const page = await fixture(t);
      const rawDraft = '\n  第一步\n';
      const seed =
        name === 'category'
          ? { version: 1, draft: rawDraft }
          : { version: 1, assistantDraft: rawDraft };
      for (const width of [600, 900, 1200]) {
        await page.setViewportSize({ width: width + 720, height: 720 });
        await page.evaluate(({ name, width, seed }) => window.openAuthor(name, width, seed), {
          name,
          width,
          seed,
        });
        const frame = page.frameLocator('iframe');
        await expect(
          frame.locator(name === 'category' ? '.work h2' : '.ap-board-title'),
        ).toBeVisible();
        await expect(frame.locator('.chat,.ap-dock')).toHaveCount(0);
        assert.equal(await page.locator('.agent-workbench-native-conversation').count(), 1);
        await expect
          .poll(() =>
            page.locator('iframe').evaluate((element) => element.getBoundingClientRect().width),
          )
          .toBe(width);
        const iframeWidth = (await page.locator('iframe').boundingBox()).width;
        const _board = await frame
          .locator(name === 'category' ? '.work' : '.ap-board')
          .boundingBox();
        await expect
          .poll(async () =>
            Math.abs(
              (await frame.locator(name === 'category' ? '.work' : '.ap-board').boundingBox())
                .width - iframeWidth,
            ),
          )
          .toBeLessThan(2);
        const title = await frame
          .locator(name === 'category' ? '.work h2' : '.ap-board-title')
          .boundingBox();
        assert.ok(
          title.height < 40,
          'heading stays readable instead of fragmented vertical wrapping',
        );
        if (name === 'category') {
          await expect(frame.locator('.scope-picker .arco-select')).toBeVisible();
        } else {
          await frame.getByRole('button', { name: '页面说明', exact: true }).click();
          const dialog = frame.getByRole('dialog', { name: '页面说明', exact: true });
          await expect(dialog).toBeVisible();
          const modal = await dialog.boundingBox();
          assert.ok(modal.width <= width - 20);
        }
        await expect(
          frame.getByRole('button', { name: '转入当前对话草稿', exact: true }),
        ).toBeVisible();
        if (process.env.HTML_LAYOUT_EVIDENCE) {
          await mkdir(process.env.HTML_LAYOUT_EVIDENCE, { recursive: true });
          await page.screenshot({
            path: process.env.HTML_LAYOUT_EVIDENCE + '/' + name + '-' + width + '.png',
          });
        }
      }
      const frame = page.frameLocator('iframe');
      await expect
        .poll(() => frame.locator('body').evaluate(() => window.dshPageInteraction?.available()))
        .toBe(true);
      await frame
        .locator('body')
        .evaluate(() =>
          window.dshPageInteraction.quote({ label: '长度边界', text: '字'.repeat(6000) }),
        );
      assert.equal(
        await page.evaluate(() => window.persisted),
        1,
        'the existing 6000-character boundary is accepted',
      );
      const draftBeforeRejected = await page.evaluate(() => window.peerDraft);
      const oversized = ' ' + '字'.repeat(5999) + ' ';
      assert.equal(oversized.length, 6001);
      const key = name === 'category' ? 'draft' : 'assistantDraft';
      await page.evaluate(({ name, seed }) => window.openAuthor(name, 1200, seed), {
        name,
        seed: { version: 1, [key]: oversized },
      });
      await expect
        .poll(() => frame.locator('body').evaluate(() => window.dshPageInteraction?.available()))
        .toBe(true);
      if (name === 'mps' && !(await frame.getByRole('dialog').count()))
        await frame.getByRole('button', { name: '页面说明', exact: true }).click();
      await frame.getByRole('button', { name: '转入当前对话草稿', exact: true }).click();
      await expect(frame.locator('.author-quote-status')).toContainText('单次引用长度上限');
      assert.equal(
        (await page.evaluate(() => window.readView()))[key],
        oversized,
        'rejected text retains its complete tail',
      );
      assert.equal(await page.evaluate(() => window.peerDraft), draftBeforeRejected);
      assert.equal(await page.evaluate(() => window.persisted), 1);
      await page.evaluate(({ name, seed }) => window.openAuthor(name, 1200, seed), { name, seed });
      await expect
        .poll(() => frame.locator('body').evaluate(() => window.dshPageInteraction?.available()))
        .toBe(true);
      await page.evaluate(() => {
        window.conflict = true;
      });
      if (name === 'mps' && !(await frame.getByRole('dialog').count()))
        await frame.getByRole('button', { name: '页面说明', exact: true }).click();
      await frame.getByRole('button', { name: '转入当前对话草稿', exact: true }).click();
      await expect(frame.locator('.author-quote-status')).toContainText('草稿已变化');
      assert.equal(await page.evaluate(() => window.peerDraft), draftBeforeRejected);
      assert.equal((await page.evaluate(() => window.readView()))[key], rawDraft);
      await page.evaluate(() => {
        window.conflict = false;
      });
      if (name === 'mps' && !(await frame.getByRole('dialog').count()))
        await frame.getByRole('button', { name: '页面说明', exact: true }).click();
      await frame.getByRole('button', { name: '转入当前对话草稿', exact: true }).click();
      await expect(
        frame.getByRole('button', { name: '转入当前对话草稿', exact: true }),
      ).toHaveCount(0);
      assert.match(await page.evaluate(() => window.peerDraft), /^历史草稿，请保留。引用：/);
      assert.ok(
        (await page.evaluate(() => window.peerDraft)).endsWith(
          '引用：' + name + ' · 未发文字\n> \n>   第一步\n> \n',
        ),
        'all raw indentation and boundary LF survive the real quote pathway',
      );
      assert.equal(await page.evaluate(() => window.persisted), 2);
      await frame.locator('.author-questions summary').click();
      await frame.locator('.author-question-list button').first().click();
      await expect.poll(() => page.evaluate(() => window.persisted)).toBe(3);
      assert.match(await page.evaluate(() => window.peerDraft), /^历史草稿，请保留。/);
      await page.setViewportSize({ width: 1320, height: 480 });
      await page.evaluate((name) => window.openAuthor(name, 600), name);
      await expect(
        page.frameLocator('iframe').locator(name === 'category' ? '.work-body' : '.ap-board-body'),
      ).toBeVisible();
      if (process.env.HTML_LAYOUT_EVIDENCE)
        await page.screenshot({
          path: process.env.HTML_LAYOUT_EVIDENCE + '/' + name + '-600-low.png',
        });
      await page.evaluate(() => window.unassociate());
      if (name === 'mps')
        await page
          .frameLocator('iframe')
          .getByRole('button', { name: '页面说明', exact: true })
          .click();
      await page.frameLocator('iframe').locator('.author-questions summary').click();
      await page.frameLocator('iframe').locator('.author-question-list button').first().click();
      await expect(page.frameLocator('iframe').locator('.author-quote-status')).toContainText(
        '关联当前页面',
      );
      assert.equal(await page.evaluate(() => window.persisted), 3);
    },
  );
