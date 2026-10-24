import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { validHtmlViewState } from '../src/html-view-state.ts';
import { model, fixturePeriod } from './orderworkbench-data.test.mjs';

test('order workbench reference interactions', async () => {
  const dom = new JSDOM(readFileSync('prototypes/inventory-orderworkbench/index.html', 'utf8'), {
    url: 'https://workbench.test',
    runScripts: 'outside-only',
  });
  const { window } = dom;
  const period = fixturePeriod();
  period.sections[0].rows = [];
  period.metrics = model.computeWorkbenchMetrics(period);
  window.liveFixture = {
    selected: 'month',
    periods: Object.fromEntries(
      ['month', 'week', 'previousMonth', 'yearMonth', 'previousWeek', 'yearWeek'].map((key) => [
        key,
        period,
      ]),
    ),
    directors: { rows: [] },
    customers: { rows: [] },
  };
  window.workbenchPresentation = model.workbenchPresentation;
  window.workbenchEvidence = model.workbenchEvidence;
  window.workbenchMetricDetail = model.workbenchMetricDetail;
  window.Date = class extends Date {
    constructor(...args) {
      super(...(args.length ? args : ['2026-09-18T00:00:00Z']));
    }
    static now() {
      return Date.parse('2026-09-18T00:00:00Z');
    }
  };
  window.HTMLElement.prototype.scrollIntoView = () => {};
  const errors = [];
  window.addEventListener('error', (event) => errors.push(event.error));
  try {
    const code = readFileSync('prototypes/inventory-orderworkbench/entry.js', 'utf8').replace(
      /^import .*;$/gm,
      '',
    );
    window.eval(
      'const ready=Promise.resolve(); const loadWorkbenchFacts=async(start,end,signal,options)=>{window.requestedPeriod={start,end};if(window.deferLoad)return new Promise(resolve=>window.pendingReads.push({resolve,progress:options.onProgress}));return {...window.liveFixture,start,end}}; const createPageViewState=()=>({subscribe(fn){window.restoreView=fn},update(state){window.savedView=state}}); const draft=async()=>{}; const publishReport=(snapshot)=>{for(const type of ["click","change","submit"]) document.addEventListener(type,()=>{window.pageSnapshot=snapshot()}); window.pageSnapshot=snapshot(); return ()=>{window.pageSnapshot=snapshot()}};\n' +
        code,
    );
    const document = window.document;
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(document.querySelectorAll('.wb-kpi').length, 6);
    assert.equal(window.pageSnapshot.consumerCode, 'order');
    assert.equal(window.pageSnapshot.mock, false);
    assert.equal(window.pageSnapshot.metrics.length, 6);
    assert.equal(window.pageSnapshot.metrics[2].value, '—%');
    assert.equal(window.pageSnapshot.dimension.key, 'base-performance');
    assert.equal(window.pageSnapshot.dimension.unmet.length, 0);
    assert.ok(window.pageSnapshot.improvements.length);
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
    assert.match(document.getElementById('wbDetailBody').textContent, /上月同期.*10.00%/);
    click('#wbDetailClose');
    click('#periodPickerTrigger');
    assert.equal(document.getElementById('periodPickerMenu').hidden, false);
    click('[data-period-week="2026-08-31"]');
    assert.equal(window.savedView.mode, 'week');
    assert.equal(window.requestedPeriod.start, '2026-09-01');
    assert.equal(window.requestedPeriod.end, '2026-09-07');
    assert.equal(document.querySelector('.wb-kpi-state').textContent, '加载中');
    assert.equal(
      validHtmlViewState('inventory-orderworkbench', { ...window.savedView, version: 1 }),
      true,
    );
    click('#periodPickerTrigger');
    click('[data-period-all]');
    await new Promise((resolve) => setTimeout(resolve, 0));
    click('[data-wb-summary-edit]');
    document.getElementById('wbSummaryPositiveInput').value = '测试正向结论';
    submit('wbSummaryEditForm');
    assert.equal(
      document.querySelector('[data-wb-summary-content="positive"]').textContent,
      '测试正向结论',
    );
    assert.match(window.localStorage.getItem('order-workbench-summary-v1'), /测试正向结论/);
    assert.equal(window.pageSnapshot.summary.positive, '测试正向结论');
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
    window.deferLoad = true;
    window.pendingReads = [];
    click('#periodPickerTrigger');
    click('[data-period-month="2026-08"]');
    const partial = {
      ...window.liveFixture,
      complete: false,
      periods: { month: period },
      directors: { status: 'loading', rows: [] },
    };
    window.pendingReads[0].progress(partial);
    assert.equal(document.querySelector('.wb-kpi-main strong').textContent, '10.00');
    assert.match(document.querySelector('.wb-kpi-compare').textContent, /加载中/);
    assert.equal(window.pageSnapshot.evidence.complete, false);
    click('[data-period-month="2026-07"]');
    window.pendingReads[0].progress(window.liveFixture);
    assert.equal(document.querySelector('.wb-kpi-main strong').textContent, '—');
    window.dispatchEvent(new window.Event('gea-identity-changed'));
    window.pendingReads[1].progress(partial);
    for (const read of window.pendingReads) read.resolve(window.liveFixture);
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.ok(
      [...document.querySelectorAll('.wb-kpi-main strong')].every(
        (node) => node.textContent === '—',
      ),
    );
    assert.deepEqual(errors, []);
  } finally {
    window.close();
  }
});
