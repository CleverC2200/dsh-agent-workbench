import { plannedShippingDays, batchAges } from './live-model.mjs';
import { computeOrderMetrics } from './order-metrics.mjs';
import { bindKnownShortages, bindPendingBreakdowns } from './operations-original-aggregation.mjs';
const n = (value) => (value === null || value === undefined || value === '' ? NaN : Number(value));
const sum = (rows, key) =>
  rows.length && rows.every((row) => Number.isFinite(n(row[key])))
    ? rows.reduce((total, row) => total + n(row[key]), 0)
    : NaN;
const add = (...values) =>
  values.every(Number.isFinite) ? values.reduce((a, b) => a + b, 0) : NaN;
const escape = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const key = (base, sku) => JSON.stringify([base, sku]);
export function enrichOriginalData(data, cache, template, today) {
  data.itemUnopenCoverage = {};
  const stocks = cache.get('stock.sku')?.rows;
  const plans = cache.get('plan.base')?.rows ?? [];
  for (const row of data.baseProgress) {
    const source =
      row.base === '合计'
        ? plans
        : plans.filter((plan) => escape(plan.base || '归属未知') === row.base);
    row.planDms = sum(source, 'initial_plan');
    row.orderedKnown = sum(source, 'ordered_known');
    row.orderCovered = sum(source, 'ordered_coverage');
    row.orderSourceRows = sum(source, 'source_rows');
    if (stocks) {
      const sourceStock =
        row.base === '合计' ? stocks : stocks.filter((stock) => escape(stock.base) === row.base);
      row.unopened = sum(sourceStock, 'unopened_qty');
    }
  }
  const skuMap = new Map(data.sku.map((sku) => [key(sku.pickup, sku.code), sku]));
  if (stocks)
    for (const stock of stocks) {
      const id = key(escape(stock.base), escape(stock.sku));
      const sku =
        skuMap.get(id) ??
        Object.assign(template('sku'), {
          pickup: escape(stock.base),
          code: escape(stock.sku),
          name: escape(stock.material_name),
        });
      const valid = Number(stock.source_rows) === 1;
      const value = (field) => (valid ? n(stock[field]) : NaN);
      const effective = (name) =>
        value(name + '_adjusted') > 0 ? value(name + '_adjusted') : value(name + '_initial');
      Object.assign(sku, {
        item: escape(stock.item),
        series: escape(stock.series),
        stock60p: value('over60_source_qty'),
        stock: value('stock_qty'),
        available: value('available_qty'),
        planSalesStart: add(value('main_plan_initial'), value('bp_plan_initial')),
        planSalesFix: add(value('main_plan_adjusted'), value('bp_plan_adjusted')),
        planSalesMonth: add(effective('main_plan'), effective('bp_plan')),
        planDcMonth: effective('transfer_plan'),
        shipSales: value('sales_shipped'),
        shipDc: value('transfer_shipped'),
        shipDays: n(
          plannedShippingDays({
            ...stock,
            stock_date: stock.stock_date,
            available_qty: stock.available_qty,
          }),
        ),
        stockDate: stock.stock_date,
        unopened: value('unopened_qty'),
      });
      skuMap.set(id, sku);
    }
  const planSkuRows = new Map();
  const ambiguousStocks = new Set(
    (stocks ?? [])
      .filter((stock) => Number(stock.source_rows) !== 1)
      .map((stock) => key(escape(stock.base), escape(stock.sku))),
  );
  for (const row of cache.get('plan.sku')?.rows ?? []) {
    const id = key(escape(row.base || '归属未知'), escape(row.sku));
    if (!planSkuRows.has(id)) planSkuRows.set(id, []);
    planSkuRows.get(id).push(row);
  }
  for (const [id, rows] of planSkuRows) {
    if (rows.length !== 1 || !skuMap.has(id)) continue;
    const source = rows[0],
      sku = skuMap.get(id);
    if (ambiguousStocks.has(id)) continue;
    const initial = n(source.initial_plan),
      adjusted = n(source.adjusted_plan);
    const values = {
      planSalesStart: initial,
      planSalesFix: adjusted,
      shipSales: n(source.shipped),
      planSalesMonth: Number(source.source_rows) === 1 ? (adjusted > 0 ? adjusted : initial) : NaN,
    };
    for (const [field, quantity] of Object.entries(values)) {
      if (Number.isFinite(n(sku[field])) || !Number.isFinite(quantity) || quantity < 0) continue;
      sku[field] = quantity;
      sku.planSourceBindings ??= [];
      sku.planSourceBindings.push(field);
    }
  }
  for (const row of cache.get('supply.branch')?.rows ?? []) {
    const label = escape(row.warehouse || '仓点') + '〔' + escape(row.warehouse_code) + '〕';
    const id = key(label, escape(row.sku));
    const sku = Object.assign(template('sku'), {
      pickup: label,
      code: escape(row.sku),
      name: escape(row.material_name),
      supplyEntityKind: 'warehouse',
      supplyWarehouseCode: escape(row.warehouse_code),
      supplyBase: escape(row.base),
    });
    const value = (field) => (Number(row.source_rows) === 1 ? n(row[field]) : NaN);
    Object.assign(sku, {
      stock: value('inventory'),
      available: value('available'),
      dcInTransit: value('in_transit'),
      transferPreparingSourceQty: value('preparing_source'),
    });
    skuMap.set(id, sku);
    data.pt2base ??= {};
    if (row.base) data.pt2base[label] = escape(row.base);
  }
  for (const row of cache.get('supply.oem.stock')?.rows ?? []) {
    const id = key(escape(row.base), escape(row.sku));
    const sku =
      skuMap.get(id) ??
      Object.assign(template('sku'), {
        pickup: escape(row.base),
        code: escape(row.sku),
        name: escape(row.material_name),
      });
    const sameDate =
      !sku.stockDate || String(row.snapshot_date) === String(sku.stockDate).replaceAll('-', '');
    const valid =
      sameDate &&
      Number(row.source_rows) > 0 &&
      Number(row.source_rows) === Number(row.known_quantities) &&
      Number.isFinite(n(row.quantity));
    sku.odmStock = valid ? n(row.quantity) : NaN;
    sku.oemStockNonnegative =
      valid && n(row.negative_rows) === 0 && n(row.quantity) >= 0 ? n(row.quantity) : NaN;
    sku.oemStockEvidence = {
      snapshotDate: String(row.snapshot_date),
      negativeRows: n(row.negative_rows),
      sameDate,
      warehouseClass: '03',
    };
    skuMap.set(id, sku);
  }
  const ageRows = cache.get('stock.age')?.rows;
  if (ageRows) {
    const ages = new Map(
      batchAges(ageRows).map((row) => [key(escape(row.base), escape(row.sku)), row]),
    );
    for (const [id, sku] of skuMap) {
      const age = ages.get(id);
      if (age && String(age.batch_date) === String(sku.stockDate ?? '').replaceAll('-', ''))
        sku.stock41_60 = n(age.age_40_60);
    }
  }
  const factors = new Map(
    (cache.get('product.unit.factors')?.rows ?? []).map((row) => [
      String(row.sku),
      Number(row.source_rows) > 0 &&
      Number(row.source_rows) === Number(row.known_quantities) &&
      Number(row.distinct_factors) === 1 &&
      n(row.ton_per_piece) > 0
        ? n(row.ton_per_piece)
        : NaN,
    ]),
  );
  const production = cache.get('production.future')?.rows;
  if (production) {
    const bases = [
      ...new Set([
        ...(stocks ?? []).map((row) => row.base),
        ...Array.from(skuMap.values(), (sku) => sku.pickup),
      ]),
    ];
    const baseName = (raw) => {
      const text = String(raw ?? '');
      return bases.filter((base) => text === base || text.includes(base)).length === 1
        ? bases.find((base) => text === base || text.includes(base))
        : null;
    };
    const factoryBases = {
      3001: '郑州',
      9001: '遂平',
      6001: '华东',
      7001: '华南',
      8001: '西南',
      S101: '濮阳',
    };
    const productionMap = new Map();
    const productionScope = new Set(
      (cache.get('sku.attributes')?.rows ?? []).map((row) =>
        key(escape(row.base), escape(row.sku)),
      ),
    );
    for (const row of production) {
      const base = row.factory_code ? factoryBases[row.factory_code] : baseName(row.factory);
      if (!base) continue;
      const id = key(escape(base), escape(row.sku));
      if (!skuMap.has(id))
        skuMap.set(
          id,
          Object.assign(template('sku'), {
            pickup: escape(base),
            code: escape(row.sku),
            name: escape(row.material_name),
          }),
        );
      if (!productionMap.has(id)) productionMap.set(id, []);
      productionMap.get(id).push(row);
    }
    for (const sku of skuMap.values()) {
      const rows = productionMap.get(key(sku.pickup, sku.code)) ?? [];
      if (!rows.length) {
        if (
          sku.supplyEntityKind !== 'warehouse' &&
          Object.values(factoryBases).includes(sku.pickup) &&
          productionScope.has(key(sku.pickup, sku.code))
        ) {
          for (const field of ['prodToday', 'prod1', 'prod2', 'prod3', 'prod4', 'prod5'])
            sku[field] = 0;
          sku.productionScope = '完整授权排产查询；执行关系已确认，当前窗口无工厂排产记录';
        }
        continue;
      }
      for (let day = 0; day <= 5; day++) {
        const date = new Date(Date.parse(today + 'T00:00:00Z') + day * 86400000)
          .toISOString()
          .slice(0, 10)
          .replaceAll('-', '');
        const bucket = rows.filter((row) => String(row.day).replaceAll('-', '') === date);
        const quantities = bucket.map((row) => {
          const quantity = n(row.planned_qty);
          if (!Number.isFinite(quantity) || quantity < 0) return NaN;
          if (row.unit === 'ST') return quantity;
          const factor = factors.get(String(row.sku));
          return row.unit === 'KG' && Number.isFinite(factor) ? quantity / (1000 * factor) : NaN;
        });
        sku[day === 0 ? 'prodToday' : 'prod' + day] = quantities.every(Number.isFinite)
          ? quantities.reduce((sum, value) => sum + value, 0)
          : NaN;
        sku.productionUnits = [...new Set(rows.map((row) => row.unit))];
        sku.tonPerPiece = factors.get(String(rows[0].sku));
      }
    }
  }
  data.sku = [...skuMap.values()];
  const attributesByBase = new Map(),
    attributesByWarehouse = new Map();
  for (const row of cache.get('sku.attributes')?.rows ?? []) {
    for (const [map, id] of [
      [attributesByBase, key(escape(row.base), escape(row.sku))],
      [attributesByWarehouse, key(escape(row.warehouse_code), escape(row.sku))],
    ]) {
      if (!map.has(id)) map.set(id, []);
      map.get(id).push(row);
    }
  }
  for (const sku of data.sku) {
    const rows =
      sku.supplyEntityKind === 'warehouse'
        ? (attributesByWarehouse.get(key(sku.supplyWarehouseCode, sku.code)) ?? [])
        : (attributesByBase.get(key(sku.pickup, sku.code)) ?? []);
    for (const field of ['item', 'series', 'owner']) {
      if (
        sku[field] ||
        !rows.length ||
        rows.some((row) => row[field] == null || String(row[field]).trim() === '')
      )
        continue;
      const values = new Set(rows.map((row) => String(row[field]).trim()));
      if (values.size !== 1) continue;
      sku[field] = escape([...values][0]);
      sku.attributeBindings ??= [];
      sku.attributeBindings.push(field);
    }
  }
  const dictionaryRows = cache.has('sku.attributes')
    ? (cache.get('product.attributes')?.rows ?? [])
    : [];
  const dictionary = new Map(dictionaryRows.map((row) => [escape(row.sku), row]));
  const masters = new Map(
    (cache.get('product.master.attributes')?.rows ?? []).map((row) => [escape(row.sku), row]),
  );
  const attributeSources = new Map();
  for (const row of cache.get('sku.attributes')?.rows ?? []) {
    const code = escape(row.sku);
    if (!attributeSources.has(code)) attributeSources.set(code, []);
    attributeSources.get(code).push(row);
  }
  for (const sku of data.sku) {
    if (!cache.has('sku.attributes') || !cache.has('product.attributes')) continue;
    const primary = dictionary.get(sku.code);
    const product = primary ?? masters.get(sku.code);
    if (!product) continue;
    const source = attributeSources.get(sku.code) ?? [];
    for (const field of ['item', 'series']) {
      const candidate = String(product[field] ?? '').trim();
      if (
        sku[field] ||
        !candidate ||
        !source.every((row) => String(row[field] ?? '').trim() === candidate)
      )
        continue;
      sku[field] = escape(candidate);
      sku.productAttributeSnapshot = product.snapshot_date;
      sku.productAttributeSource = primary
        ? 'agents_dim_product_list_mi'
        : 'agents_dim_material_prod_sales_info_d';
      sku.attributeBindings ??= [];
      sku.attributeBindings.push((primary ? 'product.' : 'productMaster.') + field);
    }
  }
  const itemShipments = data.dailyItem?.find((row) => row.metric === '累计发货量');
  const itemPlan = data.dailyItem?.find((row) => row.metric === '纠偏计划');
  const itemOrders = data.dailyItem?.find((row) => row.metric === '累计报单量');
  if (itemPlan && itemOrders) {
    data.dailyItem = data.dailyItem.filter((row) => row.metric !== '报单进度');
    data.dailyItem.push({
      metric: '报单进度',
      vals: itemPlan.vals.map((plan, index) =>
        n(plan) > 0 && Number.isFinite(n(itemOrders.vals[index]))
          ? n(itemOrders.vals[index]) / n(plan)
          : NaN,
      ),
    });
  }
  if (stocks && itemShipments) {
    const items = ['休闲', '水饺', '汤圆', '火锅料', '面点', '预制食材', '馄饨'];
    for (const [index, item] of items.entries()) {
      const rows = stocks.filter((row) => row.item === item);
      itemShipments.vals[8 + index] = rows.every((row) => Number(row.source_rows) === 1)
        ? sum(rows, 'transfer_shipped')
        : NaN;
    }
  }
  bindKnownShortages(data, cache, template);
  const facts = cache.get('orders.facts')?.rows;
  if (!facts) {
    bindPendingBreakdowns(data, template, today);
    return;
  }
  const metrics = computeOrderMetrics(facts);
  if (metrics.duplicateExecutionKeys) return;
  const factKey = (row) =>
    JSON.stringify([row.cust_order_no, row.cust_code, row.material_code, row.belong_base]);
  const quantityKey = (row) => JSON.stringify([row.order_no, row.customer_code, row.sku, row.base]);
  const sourceByQuantity = new Map(),
    sourceByOrder = new Map();
  for (const row of facts) {
    for (const [map, id] of [
      [sourceByQuantity, factKey(row)],
      [sourceByOrder, key(row.cust_order_no, row.cust_code)],
    ]) {
      if (!map.has(id)) map.set(id, []);
      map.get(id).push(row);
    }
  }
  const quantityMap = new Map(metrics.quantities.map((row) => [quantityKey(row), row]));
  const openStages = ['已开未派', '已派未到', '装车中'];
  const openBySku = new Map();
  for (const q of metrics.quantities) {
    if (
      !(sourceByQuantity.get(quantityKey(q)) ?? []).some((row) =>
        openStages.includes(row.prapare_order_status),
      )
    )
      continue;
    const id = key(escape(q.base), escape(q.sku));
    if (!openBySku.has(id)) openBySku.set(id, []);
    openBySku.get(id).push(q);
  }
  for (const sku of data.sku) {
    const rows = openBySku.get(key(sku.pickup, sku.code)) ?? [];
    sku.openUnship = rows.every((q) => openStages.includes(q.business_stage))
      ? rows.length
        ? sum(rows, 'allocated_qty')
        : 0
      : NaN;
  }
  if (cache.has('plan.region')) {
    data.areaProgress ??= [];
    const regions = new Set(
      data.areaProgress.map((row) => JSON.stringify([row.region, row.province, row.salesGroup])),
    );
    for (const row of facts) {
      if (
        ![row.region_name, row.province_region_name, row.sales_group_name].every(
          (value) => value != null && value !== '',
        )
      )
        continue;
      const values = [row.region_name, row.province_region_name, row.sales_group_name].map(escape);
      const id = JSON.stringify(values);
      if (regions.has(id)) continue;
      regions.add(id);
      data.areaProgress.push(
        Object.assign(template('areaProgress'), {
          region: values[0],
          province: values[1],
          salesGroup: values[2],
        }),
      );
    }
  }
  const quantitiesByRegion = new Map();
  if (data.areaProgress?.length)
    for (const q of metrics.quantities) {
      const ids = new Set(
        (sourceByQuantity.get(quantityKey(q)) ?? []).map((row) =>
          JSON.stringify([
            escape(row.region_name),
            escape(row.province_region_name),
            escape(row.sales_group_name),
          ]),
        ),
      );
      for (const id of ids) {
        if (!quantitiesByRegion.has(id)) quantitiesByRegion.set(id, { rows: [], consistent: true });
        const group = quantitiesByRegion.get(id);
        group.rows.push(q);
        group.consistent &&= ids.size === 1;
      }
    }
  for (const region of data.areaProgress ?? []) {
    const { rows, consistent } = quantitiesByRegion.get(
      JSON.stringify([region.region, region.province, region.salesGroup]),
    ) ?? { rows: [], consistent: true };
    for (const [field, stage, measure] of [
      ['unopened', '备单中', 'original_qty'],
      ['openedUnassigned', '已开未派', 'allocated_qty'],
      ['assignedNotArrive', '已派未到', 'allocated_qty'],
      ['loading', '装车中', 'allocated_qty'],
    ]) {
      const stageRows = rows.filter((q) =>
        (sourceByQuantity.get(quantityKey(q)) ?? []).some(
          (row) => row.prapare_order_status === stage,
        ),
      );
      region[field] =
        consistent && stageRows.every((q) => q.business_stage === stage)
          ? stageRows.length
            ? sum(stageRows, measure)
            : 0
          : NaN;
    }
    region.pendingShip = add(region.openedUnassigned, region.assignedNotArrive, region.loading);
    Object.assign(region, {
      plan: region.planEval,
      order: region.orderTotal,
      open: region.natOpen,
      ship: region.natShip,
      unopen: region.unopened,
      shipProg: region.natShipProg,
    });
  }
  const preparing = metrics.quantities.filter((row) => row.business_stage === '备单中');
  const itemByQuantity = new Map(
    preparing.map((quantity) => {
      const values = new Set(
        (sourceByQuantity.get(quantityKey(quantity)) ?? []).map((row) => row.product_item),
      );
      return [
        quantity,
        values.size === 1 && !values.has(null) && !values.has(undefined) && !values.has('')
          ? [...values][0]
          : null,
      ];
    }),
  );
  const unclassified = preparing.filter((quantity) => itemByQuantity.get(quantity) === null).length;
  data.itemUnopenCoverage = Object.fromEntries(
    ['水饺', '汤圆', '馄饨', '面点', '预制食材', '火锅料', '休闲', '粽子'].map((item) => {
      const rows = preparing.filter((quantity) => itemByQuantity.get(quantity) === item);
      return [
        escape(item),
        Object.fromEntries(
          [
            ['qty', 'original_qty'],
            ['unprepared', 'raw_short_qty'],
          ].map(([field, source]) => {
            const known = rows.filter((row) => Number.isFinite(n(row[source])));
            return [
              field,
              {
                quantity: known.reduce((sum, row) => sum + n(row[source]), 0),
                covered: known.length,
                total: rows.length + unclassified,
                unclassified,
              },
            ];
          }),
        ),
      ];
    }),
  );
  const byOrder = new Map();
  for (const quantity of preparing) {
    const id = key(quantity.order_no, quantity.customer_code);
    if (!byOrder.has(id)) byOrder.set(id, []);
    byOrder.get(id).push(quantity);
  }
  data.orderDetail = [...byOrder.values()].map((quantities) => {
    const source =
      sourceByOrder.get(key(quantities[0].order_no, quantities[0].customer_code)) ?? [];
    const one = (field) =>
      source.every((row) => row[field] != null) &&
      new Set(source.map((row) => row[field])).size === 1
        ? escape(source[0][field])
        : '';
    const detail = Object.assign(template('orderDetail'), {
      doc: escape(quantities[0].order_no),
      src: one('fromorderno'),
      date: one('header_addtime'),
      region: one('region_name'),
      province: one('province_region_name'),
      group: one('sales_group_name'),
      cust: one('cust_code'),
      custName: one('cust_name'),
      custType: one('cust_type'),
      attr: one('plant_flag'),
      pickup: one('pickup_point_name'),
      base: one('belong_base'),
      reason: [
        ...new Set(
          source
            .filter((row) => row.prapare_order_status === '备单中')
            .map((row) =>
              row.timeout_name
                ? escape(row.timeout_name)
                : row.timeout_code
                  ? '原始编码 ' + escape(row.timeout_code)
                  : '部分明细未提供原因',
            ),
        ),
      ].join('；'),
      organizationKeys: [
        ...new Set(
          source
            .filter((row) => row.prapare_order_status === '备单中')
            .map((row) =>
              JSON.stringify([
                escape(row.region_name),
                escape(row.province_region_name),
                escape(row.sales_group_name),
              ]),
            ),
        ),
      ],
    });
    const pendingSource = source.filter((row) => row.prapare_order_status === '备单中');
    const namedReason = (name) => (row) =>
      String(row.timeout_name ?? '').trim() === name
        ? true
        : String(row.timeout_code ?? '').trim() && !String(row.timeout_name ?? '').trim()
          ? null
          : false;
    detail.reasonFlags = {};
    for (const [field, predicate] of Object.entries({
      lack: namedReason('缺货'),
      notdue: namedReason('未到交期开单时间'),
      unmarked: (row) =>
        !String(row.timeout_code ?? '').trim() && !String(row.timeout_name ?? '').trim(),
    })) {
      const flags = pendingSource.map(predicate);
      detail.reasonFlags[field] =
        flags.length && !flags.includes(null) && new Set(flags).size === 1 ? flags[0] : null;
    }
    detail['合计'] = {
      qty: sum(quantities, 'original_qty'),
      occupied: sum(quantities, 'allocated_qty'),
      unprepared: sum(quantities, 'raw_short_qty'),
    };
    const category = (q) => {
      const values = new Set(
        (sourceByQuantity.get(quantityKey(q)) ?? []).map((row) => row.product_item),
      );
      return values.size === 1 && !values.has(null) && !values.has(undefined) && !values.has('')
        ? [...values][0]
        : null;
    };
    const classified = quantities.every((q) => category(q) !== null);
    for (const item of ['水饺', '汤圆', '馄饨', '面点', '预制食材', '火锅料', '休闲', '粽子']) {
      const qs = quantities.filter((q) => category(q) === item);
      const value = (field) => (qs.length ? sum(qs, field) : classified ? 0 : NaN);
      detail[item] = {
        qty: value('original_qty'),
        occupied: value('allocated_qty'),
        unprepared: value('raw_short_qty'),
      };
    }

    return detail;
  });
  bindPendingBreakdowns(data, template, today);
  const owners = new Map();
  for (const row of facts) {
    const id = key(escape(row.belong_base), escape(row.material_code));
    if (!owners.has(id)) owners.set(id, new Set());
    owners.get(id).add(row.director);
  }
  for (const sku of data.sku) {
    const values = owners.get(key(sku.pickup, sku.code));
    if (values?.size === 1 && !values.has(null) && !values.has(''))
      sku.owner = escape([...values][0]);
  }
  const byWarehouse = new Map();
  for (const row of facts) {
    const id = key(row.belong_base, row.warehouseid);
    if (!byWarehouse.has(id)) byWarehouse.set(id, []);
    byWarehouse.get(id).push(row);
  }
  data.warehouse = [...byWarehouse.values()].map((rows) => {
    const result = Object.assign(template('warehouse'), {
      base: escape(rows[0].belong_base),
      code: escape(rows[0].warehouseid),
      name: escape(rows[0].warehouse_name),
    });
    for (const [field, stage] of [
      ['unopen', '备单中'],
      ['openedUnassigned', '已开未派'],
      ['assignedNotArrive', '已派未到'],
      ['loading', '装车中'],
    ]) {
      const stageKeys = new Set(
        rows.filter((row) => row.prapare_order_status === stage).map(factKey),
      );
      const matches = [...stageKeys].map((id) => quantityMap.get(id));
      const valid = matches.every(
        (q) =>
          q &&
          q.business_stage === stage &&
          new Set((sourceByQuantity.get(quantityKey(q)) ?? []).map((row) => row.warehouseid))
            .size === 1,
      );
      result.total[field] = valid
        ? matches.length
          ? sum(matches, field === 'unopen' ? 'original_qty' : 'allocated_qty')
          : 0
        : NaN;
    }
    const pools = (cache.get('warehouse.stock')?.rows ?? []).filter(
      (row) => escape(row.warehouse_code) === result.code,
    );
    const exact = pools.filter(
      (row) => escape(row.base) === result.base && escape(row.warehouse_code) === result.code,
    );
    const stock = exact.length === 1 ? exact : pools.length === 1 ? pools : [];
    if (stock.length === 1) {
      result.total.stock = n(stock[0].stock_qty);
      result.stockDate = stock[0].stock_date;
      result.stockSourceBase = escape(stock[0].base);
      result.stockShared =
        stock[0].base !== rows[0].belong_base ||
        (pools.length === 1 &&
          [...byWarehouse.values()].filter((group) => group[0].warehouseid === rows[0].warehouseid)
            .length > 1);
    }
    result.total.openPending = add(
      result.total.openedUnassigned,
      result.total.assignedNotArrive,
      result.total.loading,
    );
    return result;
  });
  for (const row of data.baseProgress) {
    const warehouses =
      row.base === '合计' ? data.warehouse : data.warehouse.filter((wh) => wh.base === row.base);
    for (const field of ['openedUnassigned', 'assignedNotArrive', 'loading'])
      row[field] = sum(
        warehouses.map((wh) => wh.total),
        field,
      );
    row.pendingShip = add(row.openedUnassigned, row.assignedNotArrive, row.loading);
    const knownWarehouses = warehouses.filter((wh) => Number.isFinite(wh.total.openPending));
    row.pendingShipKnown = sum(
      knownWarehouses.map((wh) => wh.total),
      'openPending',
    );
    row.pendingShipCovered = knownWarehouses.length;
    row.pendingShipSourceRows = warehouses.length;
  }
  if (
    data.warehouse.some((row) =>
      ['openedUnassigned', 'assignedNotArrive', 'loading'].some((field) =>
        Number.isFinite(row.total[field]),
      ),
    )
  )
    data.liveCharts.push('c_wh_stack');
  if (
    data.warehouse.length &&
    data.warehouse.every((row) => Number.isFinite(row.total.openPending))
  )
    data.liveCharts.push('c_wh_pie');
  if (
    (data.areaProgress ?? []).length &&
    data.areaProgress.every((row) =>
      ['lackFactor', 'salesFactor', 'ctrlOpen', 'normalOrder'].every((field) =>
        Number.isFinite(row[field]),
      ),
    )
  )
    data.liveCharts.push('c_reg_prog');
  if (
    data.sku.some((row) =>
      ['stock', 'available', 'stock41_60', 'stock60p', 'prodToday', 'shipSales', 'openUnship'].some(
        (field) => Number.isFinite(row[field]),
      ),
    )
  )
    data.liveCharts.push('sd_kpi');
}
