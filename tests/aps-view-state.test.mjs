import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const result = await build({
  entryPoints: ['src/html-view-state.ts'],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
});
const { validHtmlViewState, isBusinessViewPage } = await import(
  'data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64')
);
test('APS仅保存当前Session页面筛选，业务结果和消息不可恢复', () => {
  assert.equal(isBusinessViewPage('inventory-apsplan'), true);
  assert.equal(
    validHtmlViewState('inventory-apsplan', {
      version: 1,
      selectedBase: '华东',
      selectedYearKey: '2026',
      selectedMonthKey: '08',
      selectedDay: 30,
      timeGranularity: 'week',
      selectedWeekKey: '2026-W35',
      activeWorkspace: 'plan',
    }),
    true,
  );
  assert.equal(validHtmlViewState('inventory-apsplan', { version: 1, realData: true }), false);
  assert.equal(validHtmlViewState('inventory-apsplan', { version: 1, selectedDay: 0 }), false);
  assert.equal(
    validHtmlViewState('inventory-apsplan', { version: 1, timeGranularity: 'quarter' }),
    false,
  );
});
