import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

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
      'const createPageViewState=()=>({subscribe(){},update(){}}); const publishReport=()=>()=>{};\n' +
        code,
    );
    const document = window.document;
    assert.equal(document.querySelectorAll('.wb-kpi').length, 8);
    for (const button of document.querySelectorAll('[data-wb-dimension-tab]')) button.click();
    document.querySelector('.wb-kpi').click();
    assert.equal(document.getElementById('wbDetailOverlay').hidden, false);
    document.getElementById('wbDetailClose').click();
    document.getElementById('weekMode').click();
    assert.equal(document.querySelectorAll('.wb-kpi').length, 6);
    document.getElementById('monthMode').click();
    const edit = document.querySelector('[data-wb-edit-issue]');
    assert.ok(edit);
    edit.click();
    assert.equal(document.getElementById('wbIssueOverlay').hidden, false);
    document.getElementById('wbIssueAnalysis').value = '测试问题';
    document.getElementById('wbIssueMeasure').value = '测试改进';
    document.getElementById('wbIssueGenerate').click();
    assert.match(document.getElementById('wbTaskSection').textContent, /改进任务/);
    edit.click();
    document.getElementById('wbIssueCancel').click();
    assert.equal(document.getElementById('wbIssueOverlay').hidden, true);
    assert.deepEqual(errors, []);
  } finally {
    window.close();
  }
});
