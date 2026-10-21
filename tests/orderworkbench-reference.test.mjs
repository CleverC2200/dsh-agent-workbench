import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { validHtmlViewState } from '../src/html-view-state.ts';

test('order workbench reference interactions', () => {
  const dom = new JSDOM(readFileSync('prototypes/inventory-orderworkbench/index.html', 'utf8'), {
    url: 'https://workbench.test',
    runScripts: 'outside-only',
  });
  const { window } = dom;
  window.HTMLElement.prototype.scrollIntoView = () => {};
  const errors = [];
  window.addEventListener('error', (event) => errors.push(event.error));
  try {
    const code = readFileSync('prototypes/inventory-orderworkbench/entry.js', 'utf8').replace(
      /^import .*;$/gm,
      '',
    );
    window.eval(
      'const createPageViewState=()=>({subscribe(fn){window.restoreView=fn},update(state){window.savedView=state}}); const draft=async()=>{}; const publishReport=(snapshot)=>{document.addEventListener("click",()=>snapshot()); snapshot(); return ()=>snapshot()};\n' +
        code,
    );
    const document = window.document;
    assert.equal(document.querySelectorAll('.wb-kpi').length, 6);
    assert.equal(document.querySelector('.assistant'), null);
    const click = (selector) => {
      const node = document.querySelector(selector);
      assert.ok(node, selector);
      node.click();
    };
    const submit = (id) =>
      document
        .getElementById(id)
        .dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    click('.wb-kpi');
    assert.equal(document.getElementById('wbDetailOverlay').hidden, false);
    click('#wbDetailClose');
    click('#periodPickerTrigger');
    assert.equal(document.getElementById('periodPickerMenu').hidden, false);
    click('[data-period-week="2026-08-31"]');
    assert.equal(window.savedView.mode, 'week');
    assert.equal(
      validHtmlViewState('inventory-orderworkbench', { ...window.savedView, version: 1 }),
      true,
    );
    click('#periodPickerTrigger');
    click('[data-period-all]');
    click('[data-wb-summary-edit]');
    document.getElementById('wbSummaryPositiveInput').value = '测试正向结论';
    submit('wbSummaryEditForm');
    assert.equal(
      document.querySelector('[data-wb-summary-content="positive"]').textContent,
      '测试正向结论',
    );
    assert.match(window.localStorage.getItem('order-workbench-summary-v1'), /测试正向结论/);
    click('[data-wb-add-unmet="base"]');
    const entity = document.getElementById('wbUnmetEntity');
    entity.value = [...entity.options].find((option) => option.value).value;
    document.getElementById('wbUnmetTitleInput').value = '测试未达成';
    document.getElementById('wbUnmetReasonInput').value = '测试原因';
    document.getElementById('wbUnmetMeasureInput').value = '测试措施';
    submit('wbUnmetAddForm');
    assert.match(document.getElementById('wbDimensionPanel').textContent, /测试未达成/);
    for (const button of document.querySelectorAll('[data-wb-dimension-tab]')) button.click();
    click('[data-wb-reference-add]');
    document.getElementById('wbReferenceName').value = '月度报告';
    document.getElementById('wbReferenceUrl').value = 'https://example.com/report';
    submit('wbReferenceForm');
    assert.equal(document.querySelector('#wbReferenceList a').href, 'https://example.com/report');
    click('[data-wb-improvement-add="short"]');
    for (const field of document.querySelectorAll(
      '#wbImprovementAddFields input, #wbImprovementAddFields textarea',
    ))
      field.value = '测试改善';
    submit('wbImprovementAddForm');
    assert.match(document.querySelector('.wb-improvement-table').textContent, /测试改善/);
    assert.deepEqual(errors, []);
  } finally {
    window.close();
  }
});
