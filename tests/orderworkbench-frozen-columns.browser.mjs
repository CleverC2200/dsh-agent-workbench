import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

test('achievement identity headers and rows stay frozen across dimensions and resizing', async (t) => {
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : {}),
  });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
  const source = await readFile('prototypes/inventory-orderworkbench/entry.js', 'utf8');
  const html = await readFile('prototypes/inventory-orderworkbench/index.html', 'utf8');
  const frozen = await readFile('prototypes/inventory-orderworkbench/frozen-columns.mjs', 'utf8');
  const renderer = source.slice(
    source.indexOf('function renderWorkbenchPerformanceTable('),
    source.indexOf('function renderWorkbenchUnmetCards('),
  );
  await page.setContent(
    `${[...html.matchAll(/<style[^>]*>[\s\S]*?<\/style>/g)].map((match) => match[0]).join('')}<main id="panel" style="width:90vw"></main>`,
  );
  await page.addScriptTag({
    content: `${frozen.replace('export function', 'function')}
    const escapeHtml = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;');
    const workbenchCellMissingReason = () => '';
    const liveFacts = null, shippableDaysTarget = '', dimensionTabInitial = '';
    let dimensionTab = dimensionTabInitial;
    ${renderer}
    window.renderTables = (dimension, labels, flat) => {
      dimensionTab = dimension;
      const groups = [...labels.map(label => ({label, rowspan: true})),
        ...Array.from({length: 6}, (_, i) => flat ? {label: '指标'+i, rowspan:true} : {label:'指标'+i, columns:['本期','环比','同比']})];
      const rows = Array.from({length: 12}, (_, i) => [...labels.map(label => label+'名称'+i), ...Array.from({length:flat?6:18}, () => '97.28%')]);
      document.getElementById('panel').innerHTML = Array.from({length: flat?3:2}, (_, i) => renderWorkbenchPerformanceTable({title: i?'周度':'月度',groups,rows})).join('');
      freezePerformanceColumns(document.getElementById('panel'));
    };`,
  });
  for (const [dimension, labels, flat] of [
    ['base-performance', ['基地'], false],
    ['director-performance', ['应责总监', '对应基地'], false],
    ['item-performance', ['品项'], false],
    ['province-performance', ['省区', '所属大区'], true],
    ['province-performance', ['省区', '所属大区'], false],
  ]) {
    await page.evaluate(
      ([dimension, labels, flat]) => window.renderTables(dimension, labels, flat),
      [dimension, labels, flat],
    );
    for (const width of [1000, 650, 1400]) {
      await page.setViewportSize({ width, height: 800 });
      await page.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
      );
      for (const wrap of await page.locator('.wb-performance-table-wrap').all()) {
        const result = await wrap.evaluate(async (element, count) => {
          const table = element.querySelector('table');
          const headers = [...table.tHead.rows[0].cells].slice(0, count);
          const cells = [...table.tBodies[0].rows[0].cells];
          element.scrollLeft = 0;
          await new Promise((resolve) => requestAnimationFrame(resolve));
          const before = [...headers, ...cells.slice(0, count), cells[count]].map(
            (cell) => cell.getBoundingClientRect().left,
          );
          element.scrollLeft = 400;
          await new Promise((resolve) => requestAnimationFrame(resolve));
          const after = [...headers, ...cells.slice(0, count), cells[count]].map(
            (cell) => cell.getBoundingClientRect().left,
          );
          return {
            before,
            after,
            scroll: element.scrollLeft,
            widths: headers.map((cell) => cell.getBoundingClientRect().width),
            background: getComputedStyle(cells[0]).backgroundColor,
          };
        }, labels.length);
        assert.ok(result.scroll > 0, dimension);
        if (dimension === 'province-performance') {
          for (const width of result.widths) assert.ok(Math.abs(width - 160) < 1);
        }
        for (let i = 0; i < labels.length * 2; i++)
          assert.ok(
            Math.abs(result.before[i] - result.after[i]) < 1,
            `${dimension}: column ${i} moved`,
          );
        assert.ok(Math.abs(result.before.at(-1) - result.after.at(-1) - result.scroll) < 1);
        if (labels.length === 2)
          assert.ok(Math.abs(result.after[1] - result.after[0] - result.widths[0]) < 1);
        assert.notEqual(result.background, 'rgba(0, 0, 0, 0)');
      }
    }
  }
});
