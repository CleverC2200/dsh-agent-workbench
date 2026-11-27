import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';

export async function auditOperationsTables(frame) {
  const report = await frame.locator('body').evaluate(async (body) => {
    const configs = new Map();
    const renderTable = window.Table;
    window.Table = (host, cfg) => {
      configs.set(host + ':' + cfg.cols.map((c) => c.label).join('|'), { host, cfg });
      return renderTable(host, cfg);
    };
    try {
      renderOverview();
      renderBase();
      drillBase(BASES[0]?.base);
      for (const level of [0, 1, 2]) {
        regLevel = level;
        regRegion = level ? D.areaProgress[0]?.region : '';
        regProv = level === 2 ? D.areaProgress[0]?.province : '';
        renderRegion();
      }
      for (const key of ['pickup', 'reason', 'cust', 'org', 'time', 'item', 'detail']) {
        unopenTab = key;
        renderUnopen();
        if (key === 'org') drillOrg(D.orderDetail[0]?.group);
      }
      renderItem();
      drillItem(D.sku[0]?.item || '水饺');
      renderShortage();
      renderWarehouse();
    } finally {
      window.Table = renderTable;
    }
    const results = [];
    const missingRow = (row, value) =>
      Object.fromEntries(
        Object.entries(row || {}).map(([k, v]) => [
          k,
          v && typeof v === 'object' && !Array.isArray(v) ? missingRow(v, value) : value,
        ]),
      );
    for (const { host, cfg } of configs.values()) {
      const previous = document.getElementById(host);
      if (previous) previous.removeAttribute('id');
      const box = document.createElement('div');
      box.id = host;
      box.style.width = '700px';
      body.append(box);
      const sample = cfg.rows[0] || {};
      const rows = [undefined, null, '', NaN].map((value) => missingRow(sample, value));
      for (const row of rows) {
        for (const col of cfg.cols) if (!(col.k in row)) row[col.k] = undefined;
      }
      renderTable(host, {
        ...cfg,
        rows: [...rows, ...Array.from({ length: 40 }, () => sample)],
        pageSize: 100,
      });
      const cells = [...box.querySelectorAll('tbody td')].map((td) => td.textContent.trim());
      const invalid = cells.filter(
        (text) => !text || /\b(?:undefined|null|NaN|Infinity)\b|\[object Object\]/.test(text),
      );
      const falseZeros = cells
        .slice(0, rows.length * cfg.cols.length)
        .filter((text) => /^0(?:\.0+)?%?$/.test(text));
      const scroller = box.querySelector('.tbl-scroll');
      scroller.style.height = '180px';
      box.querySelector('table').style.minWidth = '1600px';
      const corner = box.querySelector('th');
      const before = corner.getBoundingClientRect();
      const scrollBefore = scroller.getBoundingClientRect();
      scroller.scrollTop = 160;
      scroller.scrollLeft = 250;
      await new Promise(requestAnimationFrame);
      const after = corner.getBoundingClientRect();
      const scrollAfter = scroller.getBoundingClientRect();
      const first = box.querySelector('tbody td');
      const headers = [...box.querySelectorAll('th')].map((th) => ({
        top: th.getBoundingClientRect().top - after.top,
        z: Number(getComputedStyle(th).zIndex),
      }));
      results.push({
        host,
        columns: cfg.cols.length,
        title: cfg.title,
        invalid,
        falseZeros,
        missingFirst: rows.map((_, i) =>
          box.querySelectorAll('tbody tr')[i].children[0].textContent.trim(),
        ),
        dx: after.x - scrollAfter.x - (before.x - scrollBefore.x),
        dy: after.y - scrollAfter.y - (before.y - scrollBefore.y),
        firstDx: first.getBoundingClientRect().left - after.left,
        cellZ: Number(getComputedStyle(first).zIndex),
        headers,
        scrollTop: scroller.scrollTop,
        scrollLeft: scroller.scrollLeft,
      });
      box.remove();
      if (previous) previous.id = host;
    }
    return results;
  });
  await writeFile(
    '.runtime/validation/operations-all-table-layout-audit.json',
    JSON.stringify(report, null, 2),
  );
  assert.equal(report.length, 23, 'all 21 table declarations plus three regional levels');
  for (const table of report) {
    const detail = JSON.stringify(table);
    assert.deepEqual(table.invalid, [], detail);
    assert.deepEqual(table.falseZeros, [], detail);
    assert.ok(
      table.missingFirst.every((value) => value === '—'),
      detail,
    );
    assert.ok(table.scrollTop > 0 && table.scrollLeft > 0, detail);
    assert.ok(
      Math.abs(table.dx) < 1 && Math.abs(table.dy) < 1 && Math.abs(table.firstDx) < 1,
      detail,
    );
    assert.ok(
      table.headers.every((header) => Math.abs(header.top) < 1 && header.z > table.cellZ),
      detail,
    );
  }
  process.stdout.write(
    JSON.stringify({
      tableVariants: report.length,
      columns: report.reduce((n, t) => n + t.columns, 0),
    }) + '\n',
  );
}
