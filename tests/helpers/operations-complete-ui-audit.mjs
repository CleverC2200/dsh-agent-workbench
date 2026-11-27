import assert from 'node:assert/strict';
import { writeFile, readFile } from 'node:fs/promises';
import { expect } from '@playwright/test';
export async function auditCompleteOperationsUi(page, frame, output) {
  const tables = [],
    charts = [],
    visits = [];
  const tabs = [
    '全局总览',
    '基地视角',
    '区域下钻',
    '未开订单诊断',
    '品项视角',
    '缺货排产',
    '仓点待发',
  ];
  for (const name of tabs) {
    await frame.locator('#tabs .tab').filter({ hasText: name }).click();
    await expect(frame.locator('#mCheck')).toContainText('已读取', { timeout: 30000 });
  }
  await frame.locator('#mGen').evaluate(
    (node) =>
      new Promise((resolve) => {
        const observer = new MutationObserver(() => {
          observer.disconnect();
          resolve();
        });
        observer.observe(node, { childList: true, subtree: true, characterData: true });
        setTimeout(() => {
          observer.disconnect();
          resolve();
        }, 150);
      }),
  );
  async function capture(context, selector = 'div[id]:has(> .tbl-scroll > table):visible') {
    visits.push(context);
    for (const table of await frame.locator(selector).all()) {
      const id = await table.getAttribute('id'),
        headings = await table.locator('thead th').allTextContents();
      const pageSize = table.locator('select[data-act="size"]');
      if (await pageSize.count()) await pageSize.selectOption('200');
      const columns = headings.map((label) => ({
        label: label.replace(/[▲▼]/g, '').trim(),
        known: 0,
        unknown: 0,
        zero: 0,
        partial: 0,
      }));
      let pages = 0,
        rows = 0;
      while (true) {
        const cells = await table
          .locator('tbody tr')
          .evaluateAll((nodes) =>
            nodes.map((tr) => [...tr.children].map((td) => td.textContent.trim())),
          );
        for (const row of cells) {
          if (row.length !== columns.length) continue;
          rows++;
          row.forEach((value, index) => {
            assert.ok(
              !/^(NaN|Infinity|-Infinity|undefined|\[object Object\])$/.test(value),
              context + ':' + id + ':' + index,
            );
            const col = columns[index];
            if (value === '' || value === '—') col.unknown++;
            else {
              col.known++;
              if (/^0(?:\.0+)?%?$/.test(value)) col.zero++;
              if (value.includes('已知')) col.partial++;
            }
          });
        }
        pages++;
        const next = table.locator('[data-act="next"]');
        if (!(await next.count()) || (await next.isDisabled())) break;
        assert.ok(pages < 1000, 'page loop');
        await next.click();
      }
      tables.push({ context, id, columns, rows, pages });
    }
    const state = await frame.locator('body').evaluate(() =>
      Object.entries(CH)
        .filter(([, chart]) => chart.getDom().isConnected && chart.getDom().getClientRects().length)
        .map(([id, chart]) => {
          const option = chart.getOption();
          return {
            id,
            series: (option.series ?? []).map((series) => ({
              name: series.name,
              known: (series.data ?? []).filter((value) => {
                const number = value && typeof value === 'object' ? value.value : value;
                return number != null && Number.isFinite(Number(number));
              }).length,
              unknown: (series.data ?? []).filter((value) => {
                const number = value && typeof value === 'object' ? value.value : value;
                return number == null || !Number.isFinite(Number(number));
              }).length,
            })),
          };
        }),
    );
    charts.push({ context, charts: state });
    if (visits.length % 20 === 0)
      process.stdout.write(
        JSON.stringify({
          auditVisits: visits.length,
          tableChecks: tables.length,
          pages: tables.reduce((sum, table) => sum + table.pages, 0),
        }) + '\n',
      );
  }
  async function selectTab(name) {
    await frame.locator('#tabs .tab').filter({ hasText: name }).click();
    await expect(frame.locator('#mCheck')).toContainText('已读取', { timeout: 30000 });
  }
  if (process.env.OPERATIONS_AUDIT_ONLY_CHARTS) {
    const checks = [];
    async function checkChart(id, context) {
      const state = await frame.locator('#' + id).evaluate((node, id) => {
        const chart = CH[id];
        const series = chart?.getOption().series ?? [];
        return {
          id,
          drawn: Boolean(node.querySelector('canvas')),
          placeholder: node.textContent.trim(),
          known: series.reduce(
            (n, s) =>
              n +
              (s.data ?? []).filter((point) =>
                Number.isFinite(point && typeof point === 'object' ? point.value : point),
              ).length,
            0,
          ),
        };
      }, id);
      assert.ok(state.drawn ? state.known > 0 : state.placeholder === '—', JSON.stringify(state));
      checks.push({ context, ...state });
    }
    await selectTab('全局总览');
    for (const id of ['c_ov_funnel', 'c_ov_age', 'c_ov_reason', 'c_ov_gap'])
      await checkChart(id, '总览');
    await selectTab('基地视角');
    await checkChart('c_base_prog', '基地');
    await checkChart('c_base_unopen', '基地');
    await checkChart('c_base_rate', '基地');
    await selectTab('区域下钻');
    for (const id of ['c_reg_prog', 'c_reg_unopen', 'c_reg_rate']) await checkChart(id, '区域');
    await selectTab('品项视角');
    for (const id of ['c_item_ship', 'c_item_unopen']) await checkChart(id, '品项');
    await selectTab('缺货排产');
    await checkChart('c_short_top', '缺货排产');
    await selectTab('仓点待发');
    await checkChart('c_wh_stack', '仓点');
    await checkChart('c_wh_pie', '仓点');
    await selectTab('未开订单诊断');
    for (const [key, primary] of [
      ['pickup', 'c_un_pk'],
      ['org', 'c_un_org'],
      ['time', 'c_un_time'],
      ['cust', 'c_un_cust'],
      ['reason', 'c_un_rsn2'],
      ['item', 'c_un_item'],
    ]) {
      await frame.locator('#sub_unopen .subtab[data-k="' + key + '"]').click();
      await checkChart(primary, key);
      if (key === 'reason') await checkChart('c_un_rsn', key);
      await checkChart('c_rate_dist', key);
    }
    assert.ok(checks.find((check) => check.id === 'c_base_rate').drawn);
    assert.ok(checks.find((check) => check.id === 'c_wh_stack').drawn);
    assert.ok(checks.some((check) => check.id === 'c_rate_dist' && check.drawn));
    for (const id of ['c_un_pk', 'c_un_org', 'c_un_rsn2', 'c_un_cust', 'c_un_item'])
      assert.ok(checks.find((check) => check.id === id).drawn, id + ' must draw known data');
    await writeFile(output.replace('.json', '-charts.json'), JSON.stringify({ checks }, null, 2));
    return { chartChecks: checks.length, drawn: checks.filter((check) => check.drawn).length };
  }
  if (process.env.OPERATIONS_AUDIT_ONLY_EXPORT) {
    const checks = [];
    function parseCsv(text) {
      const rows = [];
      let row = [],
        cell = '',
        quoted = false;
      for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (char === '"') {
          if (quoted && text[i + 1] === '"') {
            cell += '"';
            i++;
          } else quoted = !quoted;
        } else if (char === ',' && !quoted) {
          row.push(cell);
          cell = '';
        } else if (char === '\n' && !quoted) {
          row.push(cell.replace(/\r$/, ''));
          rows.push(row);
          row = [];
          cell = '';
        } else cell += char;
      }
      if (cell || row.length) {
        row.push(cell.replace(/\r$/, ''));
        rows.push(row);
      }
      return rows;
    }
    async function check(id, context) {
      process.stdout.write(JSON.stringify({ checkingExport: context, table: id }) + '\n');
      const table = frame.locator('#' + id),
        pending = page.waitForEvent('download');
      await table.locator('[data-act="csv"]').click();
      const download = await pending;
      const csv = await readFile(await download.path(), 'utf8');
      const parsed = parseCsv(csv.replace(/^\ufeff/, ''));
      await download.delete();
      const headers = parsed.shift();
      const count = Number(
        (await table.locator('.tbl-foot').textContent()).match(/共\s*(\d+)\s*条/)[1],
      );
      assert.equal(parsed.length, count, context + ' CSV rows');
      for (const row of parsed) {
        assert.equal(row.length, headers.length);
        assert.ok(
          row.every(
            (cell) =>
              !['NaN', 'undefined', 'Infinity', '-Infinity', '[object Object]'].includes(cell),
          ),
          context + ' invalid CSV cell',
        );
      }
      if (parsed.length) {
        const displayed = await table.locator('tbody tr').first().locator('td').allTextContents();
        for (let i = 0; i < headers.length; i++)
          if (/\(万\)|\(%\)/.test(headers[i])) {
            const value = displayed[i].trim();
            if (value === '—')
              assert.equal(parsed[0][i], '', context + ' missing quantity must stay empty');
            else if (headers[i].includes('(万)')) {
              const shown = Number(
                value
                  .replace(/^已知\s*/, '')
                  .split(/\s/)[0]
                  .replaceAll(',', ''),
              );
              const exported = Number(parsed[0][i].replace(/^已知\s*/, ''));
              if (Number.isFinite(shown) && Number.isFinite(exported))
                assert.ok(
                  Math.abs(shown - exported) < 1e-7,
                  context + ' displayed/export units differ',
                );
            }
          }
      }
      checks.push({ context, id, rows: count, columns: headers.length });
    }
    for (const [name, ids] of [
      ['全局总览', ['t_overview']],
      ['基地视角', ['t_base']],
      ['区域下钻', ['t_region']],
      ['品项视角', ['t_item', 't_item_unopen']],
      ['缺货排产', ['short_bybase', 't_shortage']],
      ['仓点待发', ['t_warehouse']],
    ]) {
      await selectTab(name);
      for (const id of ids) await check(id, name);
    }
    await selectTab('未开订单诊断');
    for (const key of ['pickup', 'reason', 'cust', 'org', 'time', 'item', 'detail']) {
      await frame.locator('#sub_unopen .subtab[data-k="' + key + '"]').click();
      await check('tb_un', key);
    }
    await check('detail_drill', '订单下钻');
    await frame.locator('#sub_unopen .subtab[data-k="org"]').click();
    await frame.locator('#tb_un tbody tr').first().click();
    await check('org_drill', '组织下钻');
    await selectTab('基地视角');
    await frame.locator('#t_base tbody tr').first().click();
    await check('bd_pk', '提货点下钻');
    await check('bd_wh', '仓点下钻');
    await selectTab('品项视角');
    await frame.locator('#t_item tbody tr').first().click();
    await check('id_base', '品项基地下钻');
    await check('id_sku', '品项SKU下钻');
    await selectTab('区域下钻');
    await frame.locator('#t_region tbody tr').first().click();
    await check('t_region', '省区下钻');
    await frame.locator('#t_region tbody tr').first().click();
    await check('t_region', '销售组下钻');
    await writeFile(output.replace('.json', '-exports.json'), JSON.stringify({ checks }, null, 2));
    return {
      exports: checks.length,
      exportedRows: checks.reduce((sum, check) => sum + check.rows, 0),
    };
  }
  if (process.env.OPERATIONS_AUDIT_ONLY_ITEM_SHORTAGE) {
    await selectTab('品项视角');
    await capture('品项视角', '#t_item,#t_item_unopen');
    await selectTab('缺货排产');
    await capture('缺货排产', '#short_bybase,#t_shortage');
    for (const id of ['t_item', 't_shortage']) {
      const table = tables.find((entry) => entry.id === id);
      assert.ok(table.rows > 0, id + ' must retain source rows');
      assert.ok(table.columns.some((column) => /计划/.test(column.label) && column.known > 0));
    }
    const shortage = tables.find((entry) => entry.id === 't_shortage');
    for (const label of ['缺货', '排产'])
      assert.ok(
        shortage.columns.some((column) => column.label.includes(label) && column.known > 0),
      );
    await writeFile(
      output.replace('.json', '-item-shortage.json'),
      JSON.stringify({ visits, tables, charts }, null, 2),
    );
    return {
      tableChecks: tables.length,
      tablePages: tables.reduce((sum, table) => sum + table.pages, 0),
    };
  }
  if (process.env.OPERATIONS_AUDIT_ONLY_UNOPEN) {
    await selectTab('未开订单诊断');
    for (const key of ['pickup', 'reason', 'cust', 'org', 'time', 'item', 'detail']) {
      await frame.locator('#sub_unopen .subtab[data-k="' + key + '"]').click();
      await capture('未开订单诊断/' + key, '#tb_un');
    }
    for (const key of ['pickup', 'org', 'detail']) {
      const table = tables.find((entry) => entry.context.endsWith('/' + key));
      assert.ok(table.rows > 0, key + ' must retain order rows');
      assert.ok(
        table.columns.some((column) => /未开.*(?:万|件)/.test(column.label) && column.known > 0),
        key + ' must retain known unopened quantities',
      );
    }
    const detail = tables.find((entry) => entry.context.endsWith('/detail'));
    for (const label of ['客户名称', '销售组'])
      assert.ok(
        detail.columns.some((column) => column.label === label && column.known > 0),
        label + ' must reach the detail table',
      );
    await writeFile(
      output.replace('.json', '-unopen.json'),
      JSON.stringify({ visits, tables, charts }, null, 2),
    );
    return {
      tableChecks: tables.length,
      tablePages: tables.reduce((sum, table) => sum + table.pages, 0),
    };
  }
  if (process.env.OPERATIONS_AUDIT_ONLY_ORG) {
    await selectTab('未开订单诊断');
    await frame.locator('#sub_unopen .subtab[data-k="org"]').click();
    await frame.locator('#tb_un tbody tr').first().click();
    await capture('销售组织下钻', '#org_drill');
    await writeFile(
      output.replace('.json', '-org.json'),
      JSON.stringify({ visits, tables, charts }, null, 2),
    );
    assert.ok(tables.some((table) => table.id === 'org_drill'));
    return {
      visits: visits.length,
      tableChecks: tables.length,
      tablePages: tables.reduce((sum, table) => sum + table.pages, 0),
    };
  }
  for (const name of tabs) {
    await selectTab(name);
    await capture(name);
  }
  await selectTab('未开订单诊断');
  for (const key of ['pickup', 'reason', 'cust', 'org', 'time', 'item', 'detail']) {
    await frame.locator('#sub_unopen .subtab[data-k="' + key + '"]').click();
    await capture('未开订单诊断/' + key);
    if (key === 'org') {
      await frame.locator('#tb_un tbody tr').first().click();
      await capture('销售组织下钻', '#org_drill');
    }
  }
  await selectTab('区域下钻');
  const regions = await frame
    .locator('#sel_reg option')
    .evaluateAll((nodes) => nodes.map((node) => node.value).filter(Boolean));
  for (const [i, region] of regions.entries()) {
    await frame.locator('#sel_reg').selectOption(region);
    await capture('区域/省区层/' + i);
    const provinces = await frame
      .locator('#sel_prov option')
      .evaluateAll((nodes) => nodes.map((node) => node.value).filter(Boolean));
    for (const [j, province] of provinces.entries()) {
      await frame.locator('#sel_prov').selectOption(province);
      await capture('区域/销售组层/' + i + '/' + j);
    }
  }
  await selectTab('基地视角');
  const bases = await frame.locator('#t_base tbody tr').count();
  for (let i = 0; i < bases; i++) {
    await frame.locator('#t_base tbody tr').nth(i).click();
    await capture('基地下钻/' + i, '#bd_pk,#bd_wh');
  }
  await selectTab('品项视角');
  const items = await frame.locator('#t_item tbody tr').count();
  for (let i = 0; i < items; i++) {
    await frame.locator('#t_item tbody tr').nth(i).click();
    await capture('品项下钻/' + i, '#id_base,#id_sku');
  }
  await selectTab('缺货排产');
  const samples = await frame.locator('body').evaluate(() => {
    const picks = [
      D.sku.find((row) => row.prodToday > 0),
      D.sku.find((row) => row.supplyEntityKind === 'warehouse'),
      D.sku.find((row) => !Number.isFinite(row.lackToday)),
    ];
    return [...new Set(picks.filter(Boolean).map((row) => row.code))];
  });
  for (const [i, code] of samples.entries()) {
    await frame.locator('#sf_kw').fill(code);
    await frame.locator('#sf_apply').click();
    await frame.locator('#t_shortage tbody tr').first().click();
    await capture('SKU下钻/' + i, '#sku_drill .tbl-card');
  }
  await selectTab('仓点待发');
  await frame.locator('#t_warehouse tbody tr').first().click();
  await capture('仓点下钻', '#wh_drill .tbl-card');
  const report = {
    scope: '当前授权源完整输入的独立浏览器核查；不含个人明细值',
    visits,
    tables,
    charts,
  };
  await writeFile(output, JSON.stringify(report, null, 2));
  assert.ok(visits.length > 30);
  assert.ok(tables.some((table) => table.id === 'id_sku'));
  assert.ok(charts.some((group) => group.charts.some((chart) => chart.id === 'sd_kpi')));
  return {
    visits: visits.length,
    tableChecks: tables.length,
    tablePages: tables.reduce((sum, table) => sum + table.pages, 0),
  };
}
