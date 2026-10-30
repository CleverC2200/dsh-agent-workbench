import { createReportPersistence } from '../prototypes/inventory-orderworkbench/report-persistence.mjs';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { validHtmlViewState } from '../src/html-view-state.ts';
import { model, fixturePeriod } from './orderworkbench-data.test.mjs';
import {
  metricCalculationVersion,
  reusableWorkbenchFacts,
  compatibleWorkbenchFacts,
} from '../prototypes/inventory-orderworkbench/metric-model.mjs';
import {
  shippableDaysTarget,
  performanceStyleVersion,
} from '../prototypes/inventory-orderworkbench/performance-rules.mjs';

test('order workbench reference interactions', async () => {
  const dom = new JSDOM(readFileSync('prototypes/inventory-orderworkbench/index.html', 'utf8'), {
    url: 'https://workbench.test',
    runScripts: 'outside-only',
  });
  const { window } = dom;
  window.structuredClone = structuredClone;
  window.createReportPersistence = createReportPersistence;
  window.encodeReportRequest = async (request) => request;
  window.savedReports = new Map();
  window.savedEdits = new Map();
  window.call = async (method, request) => {
    assert.equal(method, 'workspace');
    const key = JSON.stringify(request.period);
    if (request.operation === 'load') {
      window.reportLoads = (window.reportLoads ?? 0) + 1;
      const snapshot = window.savedReports.get(key) ?? { version: 0, report: null };
      const edited = window.savedEdits.get(key);
      return {
        ...snapshot,
        editVersion: edited?.version ?? 0,
        report: edited
          ? { ...(snapshot.report ?? { schemaVersion: 1, facts: null }), edits: edited.edits }
          : snapshot.report,
      };
    }
    if (window.rejectReportSaves) throw Error('WRITE_CONFIRMATION');
    if (request.operation === 'save-edits') {
      window.savedEdits.set(key, {
        version: request.expectedVersion + 1,
        edits: structuredClone(request.report.edits),
      });
      return { saved: true, version: request.expectedVersion + 1, requestId: request.requestId };
    }
    window.savedReports.set(key, {
      version: request.expectedVersion + 1,
      report: structuredClone(request.report),
    });
    return { saved: true, version: request.expectedVersion + 1, requestId: request.requestId };
  };
  const period = fixturePeriod();
  period.sections[0].rows = [];
  period.metrics = model.computeWorkbenchMetrics(period);
  window.liveFixture = {
    complete: true,
    attributionVersion: 2,
    metricCalculationVersion,
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
  window.workbenchBaseIncluded = model.workbenchBaseIncluded;
  window.workbenchEvidence = model.workbenchEvidence;
  window.workbenchMetricDetail = model.workbenchMetricDetail;
  window.workbenchCellMissingReason = model.workbenchCellMissingReason;
  window.shippableDaysTarget = shippableDaysTarget;
  window.performanceStyleVersion = performanceStyleVersion;
  window.metricCalculationVersion = metricCalculationVersion;
  window.reusableWorkbenchFacts = reusableWorkbenchFacts;
  window.compatibleWorkbenchFacts = compatibleWorkbenchFacts;
  window.Date = class extends Date {
    constructor(...args) {
      super(...(args.length ? args : ['2026-09-18T00:00:00Z']));
    }
    static now() {
      return Date.parse('2026-09-18T00:00:00Z') + (window.cacheClockOffset ?? 0);
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
    assert.equal(window.savedView.mode, 'week');
    assert.equal(window.savedView.week, '2026-09-14');
    assert.equal(window.requestedPeriod.start, '2026-09-14');
    assert.equal(window.requestedPeriod.end, '2026-09-21');
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
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(window.requestedPeriod.start, '2026-09-01');
    assert.equal(window.requestedPeriod.end, '2026-09-07');
    assert.equal(document.getElementById('reportPersistenceStatus').dataset.state, 'saved');
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
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.ok(
      [...window.savedEdits.values()].some(
        (value) => value.edits.summary.positive === '测试正向结论',
      ),
    );
    assert.equal(window.pageSnapshot.summary.positive, '测试正向结论');
    click('[data-wb-add-unmet="base"]');
    const entity = document.getElementById('wbUnmetEntity');
    entity.value = [...entity.options].find((option) => option.value).value;
    document.getElementById('wbUnmetTitleInput').value = '测试未达成';
    document.getElementById('wbUnmetReasonInput').value = '测试原因';
    document.getElementById('wbUnmetMeasureInput').value = '测试措施';
    submit('wbUnmetAddForm');
    assert.match(document.getElementById('wbDimensionPanel').textContent, /测试未达成/);
    click('[data-wb-dimension-tab="item-performance"]');
    click('[data-wb-add-unmet="item"]');
    const itemEntity = document.getElementById('wbUnmetEntity');
    assert.deepEqual([...itemEntity.options].map((option) => option.value).filter(Boolean), [
      '小水饺',
    ]);
    assert.equal(document.getElementById('wbUnmetAddTitle').textContent, '添加品项未达成项');
    itemEntity.value = '小水饺';
    document.getElementById('wbUnmetTitleInput').value = '品项选择验证';
    document.getElementById('wbUnmetReasonInput').value = '品项原因';
    document.getElementById('wbUnmetMeasureInput').value = '品项措施';
    submit('wbUnmetAddForm');
    assert.match(document.getElementById('wbDimensionPanel').textContent, /小水饺｜品项选择验证/);
    click('[data-wb-edit-unmet]');
    assert.equal(document.getElementById('wbUnmetEntity').value, '小水饺');
    click('#wbUnmetAddCancel');
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
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.ok(
      [...window.savedEdits.values()].some((value) =>
        value.edits.improvements.flat(2).some((cell) => cell.text === '测试改善'),
      ),
    );
    click('#periodPickerTrigger');
    click('[data-period-week="2026-08-31"]');
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.notEqual(
      document.querySelector('[data-wb-summary-content="positive"]').textContent,
      '测试正向结论',
    );
    click('#periodPickerTrigger');
    click('[data-period-all]');
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(
      document.querySelector('[data-wb-summary-content="positive"]').textContent,
      '测试正向结论',
    );
    assert.equal(document.querySelector('#wbReferenceList a').href, 'https://example.com/report');
    assert.match(document.querySelector('.wb-improvement-table').textContent, /测试改善/);
    window.rejectReportSaves = true;
    click('[data-period-month="2026-08"]');
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(document.getElementById('reportPersistenceStatus').dataset.state, 'error');
    click('[data-period-month="2026-09"]');
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.match(document.getElementById('periodPickerValue').textContent, /2026年9月/);
    window.rejectReportSaves = false;
    window.dispatchEvent(new window.Event('gea-identity-changed'));
    window.savedReports.clear();
    window.savedEdits.clear();
    window.deferLoad = true;
    window.pendingReads = [];
    click('#periodPickerTrigger');
    click('[data-period-month="2026-08"]');
    window.dispatchEvent(new window.Event('gea-session-changed'));
    assert.deepEqual(
      [...document.querySelectorAll('[data-period-month]')].map((node) => node.dataset.periodMonth),
      ['2026-09', '2026-08', '2026-07'],
    );
    assert.equal(
      document.querySelector('[data-period-month="2026-08"]').getAttribute('aria-pressed'),
      'true',
    );
    const partial = {
      ...window.liveFixture,
      complete: false,
      periods: { month: period },
      directors: { status: 'loading', rows: [] },
    };
    await new Promise((resolve) => setTimeout(resolve, 0));
    window.pendingReads[0].progress(partial);
    assert.equal(document.querySelector('.wb-kpi-main strong').textContent, '10.00');
    assert.match(document.querySelector('.wb-kpi-compare').textContent, /加载中/);
    assert.equal(window.pageSnapshot.evidence.complete, false);
    const savesBeforeEdit = JSON.stringify([...window.savedReports]);
    click('[data-wb-summary-edit]');
    assert.equal(document.getElementById('wbSummaryEditOverlay').hidden, false);
    document.getElementById('wbSummaryPositiveInput').value = '对比加载时编辑的摘要';
    submit('wbSummaryEditForm');
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(document.getElementById('reportPersistenceStatus').dataset.state, 'saved');
    assert.equal(
      JSON.stringify([...window.savedReports]),
      savesBeforeEdit,
      'partial facts must not be saved',
    );
    const leave = new window.Event('beforeunload', { cancelable: true });
    window.dispatchEvent(leave);
    assert.equal(leave.defaultPrevented, false);
    click('[data-period-month="2026-07"]');
    assert.match(document.getElementById('periodPickerValue').textContent, /2026年7月/);
    await new Promise((resolve) => setTimeout(resolve, 0));
    window.pendingReads[0].resolve(window.liveFixture);
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.match(
      document.getElementById('periodPickerValue').textContent,
      /2026年7月/,
      'background save must not change selected period',
    );
    assert.ok(
      [...window.savedReports.values()].some(
        (value) => value.report.edits.summary.positive === '对比加载时编辑的摘要',
      ),
      'inactive period edits save after its complete data arrives',
    );
    click('[data-period-month="2026-08"]');
    assert.match(document.getElementById('periodPickerValue').textContent, /2026年8月/);
    window.pendingReads[0].progress(partial);
    assert.equal(
      document.querySelector('[data-wb-summary-content="positive"]').textContent,
      '对比加载时编辑的摘要',
    );
    window.pendingReads[0].resolve(window.liveFixture);
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(document.getElementById('reportPersistenceStatus').dataset.state, 'saved');
    assert.ok(
      [...window.savedReports.values()].some(
        (value) =>
          value.report.facts.complete === true &&
          value.report.edits.summary.positive === '对比加载时编辑的摘要',
      ),
    );
    click('[data-period-month="2026-07"]');
    assert.ok(
      document.querySelector('[data-period-month="2026-09"]'),
      'the current month remains available after selecting older months',
    );
    const readCount = window.pendingReads.length;
    const loadsBeforeCache = window.reportLoads;
    window.cacheClockOffset = 19 * 60 * 1000;
    click('[data-period-month="2026-08"]');
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(
      window.pendingReads.length,
      readCount,
      'returning to a completed period must reuse the scoped cache',
    );
    assert.equal(
      document.querySelector('[data-wb-summary-content="positive"]').textContent,
      '对比加载时编辑的摘要',
    );
    assert.equal(
      window.reportLoads,
      loadsBeforeCache,
      '19-minute cache avoids database report reload',
    );
    click('[data-period-month="2026-07"]');
    window.cacheClockOffset = 21 * 60 * 1000;
    click('[data-period-month="2026-08"]');
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(
      window.reportLoads,
      loadsBeforeCache + 1,
      'expired cache revalidates through the governed report channel',
    );
    click('[data-period-month="2026-07"]');
    window.pendingReads[0].progress(window.liveFixture);
    assert.equal(document.querySelector('.wb-kpi-main strong').textContent, '—');
    await new Promise((resolve) => setTimeout(resolve, 0));
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
