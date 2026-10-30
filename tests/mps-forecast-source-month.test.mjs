import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { makeRequest } from '../business/shared/configured-query-client.mjs';

globalThis.window = { addEventListener() {}, parent: { postMessage() {} } };
const { forecastRows, sourceTableParameters } =
  await import('../static/mps/source/source-tables.js');
delete globalThis.window;
const config = JSON.parse(await readFile('static/mps/sql.config.json', 'utf8'));

test('the published monthly forecast batches are queried and normalized without dropping the real month', () => {
  for (const [month, source] of [
    ['2026-10', '2026/10'],
    ['2026-09', '2026-9'],
  ]) {
    const values = sourceTableParameters('forecast', month);
    assert(values.months.includes(source));
    for (const id of ['forecast.detail', 'forecast.count']) {
      const request = makeRequest(config, id, {
        ...values,
        ...(id.endsWith('.detail') ? { page_size: 200, offset: 0 } : {}),
      });
      assert(
        Object.values(request.parameters).some(
          (value) => value === source || (Array.isArray(value) && value.includes(source)),
        ),
      );
    }
    const rows = forecastRows(
      [
        {
          stat_month: source,
          belong_base: '基地甲',
          material_code: '001',
          material_name: '产品甲',
          current_month_forecast_qty: '0',
          next_month_forecast_qty: '8',
          source_rows: 1,
        },
      ],
      month,
    );
    assert.equal(rows[0]['月份'], month);
    assert.equal(rows[0]['数量'], 0);
    assert.equal(rows[1]['数量'], 8);
    assert.equal(rows[0]['源批次月份'], source);
  }
});
