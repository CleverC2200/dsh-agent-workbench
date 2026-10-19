import sqlConfiguration from '../../../../../sql.config.json';
import { sqlTemplate as configuredSql } from '../../../../../../shared/sql-config.ts';
import {
  formatRatio,
  sumKnownQuantities,
  isWarehouseId,
  type BaseResource,
  type CustomerOrder,
  type InventoryBatch,
  type InventoryRow,
  type OperationsObservation,
  type PlanRow,
  type ReplenishmentRow,
  type WarehouseId,
  type WarehouseSnapshot,
} from '../domain.ts';
import { BRANCH_RULESET, calculateTargetInventory } from '../rules.ts';
import { getDatabase } from './database.ts';
import { loadWarehouseCatalog } from './warehouse-catalog.ts';
import { fulfillmentWarehouseScope } from './warehouse-scope.ts';
import { loadPlanProductMetadata } from './plan-product-metadata.ts';
import { readPlanningState } from './planning-store.ts';
import { applyBusinessPlanning, nextMonth } from '../planning.ts';
import { getBusinessDatabase } from './business-database.ts';
import { queryBusinessDatabase, usesGeaSql, type BusinessDatabase } from './gea-sql.ts';
import type { TrustedIdentity } from './identity.ts';

export type WarehouseSnapshotDatabase = BusinessDatabase;

export class WarehouseSnapshotDataError extends Error {}

// 页面、AI、提交复核共用此入口；应用自己的计划配置仍在本地业务库。
export async function loadWarehouseSnapshotForIdentity(
  warehouseId: WarehouseId,
  identity: TrustedIdentity,
  inventoryDetail: 'full' | 'summary' = 'full',
) {
  const gea = usesGeaSql();
  const snapshot = await loadWarehouseSnapshot(
    warehouseId,
    getBusinessDatabase(identity.gatewayContextRef),
    new Date(),
    gea ? getDatabase() : undefined,
    inventoryDetail,
  );
  return gea ? { ...snapshot, dataSource: 'GEA SQL data_service 分仓库存标准表' } : snapshot;
}

function text(value: unknown, fallback = ''): string {
  return value === null || value === undefined ? fallback : String(value);
}

function quantity(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function integerQuantity(value: unknown): number {
  return Math.round(quantity(value));
}

function optionalNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function usableSourcePlan(row: Record<string, unknown> | undefined): boolean {
  if (!row || optionalNumber(row.shipment_plan_qty) === null) return false;
  // Upstream can publish numeric zero placeholders alongside BI_TARGET_MISSING.
  // Only a ready plan is a business quantity, including an explicitly ready zero.
  return (
    text(row.plan_status).toUpperCase() === 'READY' &&
    !/MISSING|INVALID|INCOMPLETE|PENDING/.test(text(row.bi_target_status).toUpperCase())
  );
}

function daysInMonth(date: string): number {
  const [year, month] = date.slice(0, 7).split('-').map(Number);
  return Number.isFinite(year) && Number.isFinite(month)
    ? new Date(Date.UTC(year, month, 0)).getUTCDate()
    : 30;
}

function monthLabel(date: string): string {
  const [year, month] = date.slice(0, 7).split('-');
  return `${Number(year)}年${Number(month)}月`;
}

function monthValue(date: string): string {
  return date.slice(0, 7);
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00+08:00`);
  value.setUTCDate(value.getUTCDate() + days);
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' }).format(value);
}

function ageDays(snapshotDate: string, productionDate: string): number {
  if (!productionDate) return 0;
  const snapshot = Date.parse(`${snapshotDate}T00:00:00+08:00`);
  const production = Date.parse(`${productionDate}T00:00:00+08:00`);
  return Number.isFinite(snapshot) && Number.isFinite(production)
    ? Math.max(0, Math.floor((snapshot - production) / 86_400_000))
    : 0;
}

function shanghaiTimestamp(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date);
  return `${parts} CST`;
}

function latestTimestamp(values: unknown[]): string {
  return (
    values
      .map((value) => text(value))
      .filter(Boolean)
      .sort((left, right) => Date.parse(right) - Date.parse(left))[0] ?? ''
  );
}

function freshness(timestamp: string, now: Date): 'fresh' | 'stale' {
  const sourceTime = Date.parse(timestamp);
  return Number.isFinite(sourceTime) && now.getTime() - sourceTime <= 2 * 60 * 60 * 1000
    ? 'fresh'
    : 'stale';
}

function severityForShortage(shortage: number, ordered: number): '正常' | '临期' | '缺口' {
  if (shortage <= 0) return '正常';
  return ordered > 0 && shortage / ordered >= 0.2 ? '缺口' : '临期';
}

export async function loadWarehouseSnapshot(
  warehouseId: WarehouseId,
  database: WarehouseSnapshotDatabase = getDatabase(),
  now = new Date(),
  planningDatabase: WarehouseSnapshotDatabase = database,
  inventoryDetail: 'full' | 'summary' = 'full',
): Promise<WarehouseSnapshot> {
  const calculationDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  if (!isWarehouseId(warehouseId)) throw new WarehouseSnapshotDataError('不支持的分仓范围');
  const catalog = await loadWarehouseCatalog(database);
  const source = catalog.warehouses.find((item) => item.id === warehouseId);
  if (!source)
    throw new WarehouseSnapshotDataError('该分仓在最新数据库目录中不存在或库存映射尚未完成');

  const planPromise = Promise.all([
    database.query(configuredSql(sqlConfiguration, 'fc.src.lib.server.warehouse-snapshot.1'), [
      source.branchPickupPoint,
    ]),
    planningDatabase.query(
      configuredSql(
        sqlConfiguration,
        'fragments.source.fc.src.lib.server.warehouse-snapshot.ts.1',
        [
          planningDatabase === database
            ? "to_regclass('data_service.agents_scm_order_fulfillment')"
            : "'data_service.agents_scm_order_fulfillment'::text",
        ],
      ),
    ),
  ]);

  const independentQueries = [
    queryBusinessDatabase(
      database,
      inventoryDetail === 'summary'
        ? configuredSql(sqlConfiguration, 'fc.src.lib.server.warehouse-snapshot.2')
        : configuredSql(sqlConfiguration, 'fc.src.lib.server.warehouse-snapshot.3'),
      [source.pickupPointCode],
      {
        pageSize: 100,
        groupBy: ['material_code'],
        orderBy: inventoryDetail === 'summary' ? ['material_code'] : ['material_code', 'prod_date'],
      },
    ),
    // Keep snapshot and warehouse scope as independent scalar/array subqueries:
    // PostgreSQL can combine the two operation-scope indexes without scanning the whole snapshot.
    queryBusinessDatabase(
      database,
      configuredSql(sqlConfiguration, 'fc.src.lib.server.warehouse-snapshot.4'),
      [source.pickupPointCode, addDays(calculationDate, -1), calculationDate],
      {
        pageSize: 100,
        groupBy: ['metric_group', 'metric_name'],
        orderBy: [
          'metric_group',
          'metric_name',
          'material_code',
          'period_month',
          'business_date',
          'base_group_id',
          'base_group_name',
          'snapshot_date',
        ],
      },
    ),
    database.query(configuredSql(sqlConfiguration, 'fc.src.lib.server.warehouse-snapshot.5'), [
      source.pickupPointCode,
    ]),
    database.query(configuredSql(sqlConfiguration, 'fc.src.lib.server.warehouse-snapshot.6'), [
      source.pickupPointCode,
      addDays(calculationDate, -1),
    ]),
    database.query(configuredSql(sqlConfiguration, 'fc.src.lib.server.warehouse-snapshot.7'), [
      source.pickupPointCode,
      addDays(calculationDate, -1),
    ]),
  ];
  // Observe failures immediately; the original promises are still awaited below.
  for (const query of independentQueries) void query.catch(() => {});
  const [planResult, optionalTables] = await planPromise;

  // Choose one version for the whole warehouse/month, never a per-SKU fallback.
  const versionPriority = (value: unknown) =>
    text(value) === 'MONTH_START' ? 0 : text(value) === 'ROLLING' ? 1 : 2;
  const selectedVersions = new Map<string, string>();
  for (const row of [...planResult.rows].sort(
    (a, b) =>
      versionPriority(a.plan_version) - versionPriority(b.plan_version) ||
      text(a.plan_version).localeCompare(text(b.plan_version)),
  )) {
    const month = text(row.target_month);
    if (!selectedVersions.has(month)) selectedVersions.set(month, text(row.plan_version));
  }
  planResult.rows = planResult.rows.filter(
    (row) => text(row.plan_version) === selectedVersions.get(text(row.target_month)),
  );
  const planDates = [
    ...new Set(planResult.rows.map((row) => text(row.target_month)).filter(Boolean)),
  ].sort();
  // Plans belong to the calculation month and its calendar successor. Missing
  // months stay unknown; historical or later plans never fill their place.
  const currentPlanDate = `${calculationDate.slice(0, 7)}-01`;
  const nextPlanDate = `${nextMonth(calculationDate.slice(0, 7))}-01`;
  const currentPlanRows = planResult.rows.filter(
    (row) => text(row.target_month) === currentPlanDate,
  );
  const planMaterialCodes = [
    ...new Set(currentPlanRows.map((row) => text(row.material_code)).filter(Boolean)),
  ];
  if (
    planResult.rows.length &&
    (!planDates.length || !planResult.rows.some((row) => text(row.material_code)))
  )
    throw new WarehouseSnapshotDataError(`${source.warehouseName}最新计划缺少月份或 SKU`);

  const hasOrderFulfillment = Boolean(optionalTables.rows[0]?.order_fulfillment);
  const planningEnabled = Boolean(
    optionalTables.rows[0]?.imported_plans && optionalTables.rows[0]?.cycle_config,
  );

  const queries = [
    independentQueries[0],
    independentQueries[1],
    independentQueries[2],
    planMaterialCodes.length
      ? database.query(configuredSql(sqlConfiguration, 'fc.src.lib.server.warehouse-snapshot.8'), [
          planMaterialCodes,
          calculationDate,
        ])
      : Promise.resolve({ rows: [] }),
    independentQueries[3],
    independentQueries[4],
  ];

  // Details depend only on pending order keys, not inventory/operations totals.
  const orderDetailPromise = queries[2].then(async (pendingOrderResult) => {
    const orderNumbers = [
      ...new Set(pendingOrderResult.rows.map((row) => text(row.executeorderno)).filter(Boolean)),
    ];
    // GEA rejects FROM UNNEST. Keep the same paired membership test with scalar
    // parameters: independent order/SKU IN lists would admit cross-pair matches.
    // OR does not multiply rows when a pending order/SKU pair appears twice.
    const orderPairs = pendingOrderResult.rows.flatMap((row) => [
      text(row.executeorderno),
      text(row.material_code),
    ]);
    const pairPredicate = pendingOrderResult.rows
      .map((_, index) =>
        configuredSql(sqlConfiguration, 'fc.src.lib.server.warehouse-snapshot.9', [
          3 + index * 2,
          4 + index * 2,
        ]),
      )
      .join(
        configuredSql(sqlConfiguration, 'inline.source.fc.src.lib.server.warehouse-snapshot.ts.1'),
      );
    return hasOrderFulfillment && orderNumbers.length
      ? database.query(
          configuredSql(sqlConfiguration, 'fc.src.lib.server.warehouse-snapshot.10', [
            fulfillmentWarehouseScope(2),
            pairPredicate,
          ]),
          [orderNumbers, source.pickupPointCode, ...orderPairs],
        )
      : { rows: [] };
  });
  // Product dimensions depend on inventory SKU keys and plans, not on operations or order details.
  const productMetadataPromise = queries[0].then((inventory) =>
    hasOrderFulfillment
      ? loadPlanProductMetadata(
          database,
          source.pickupPointCode,
          [
            ...new Set([
              ...planMaterialCodes,
              ...inventory.rows.map((row) => text(row.material_code)).filter(Boolean),
            ]),
          ],
          { onConflict: 'omit' },
        )
      : new Map(),
  );
  const [
    [
      inventoryResult,
      operationResult,
      pendingOrderResult,
      productionResult,
      fulfillmentSummaryResult,
      dailyOutbound,
    ],
    orderDetailResult,
    planningState,
    monthlyShipments,
    budgetResult,
    productMetadata,
  ] = await Promise.all([
    Promise.all(queries),
    orderDetailPromise,
    planningEnabled ? readPlanningState(warehouseId, planningDatabase) : null,
    planningEnabled
      ? database.query(configuredSql(sqlConfiguration, 'fc.src.lib.server.warehouse-snapshot.11'), [
          source.pickupPointCode,
          currentPlanDate,
        ])
      : { rows: [] },
    queryBusinessDatabase(
      database,
      configuredSql(sqlConfiguration, 'fc.src.lib.server.warehouse-snapshot.12'),
      [source.pickupPointCode, addDays(calculationDate, -1)],
      { pageSize: 15 },
    ),
    productMetadataPromise,
  ]);

  const planBySku = new Map<string, Record<string, unknown>>();
  const nextPlanBySku = new Map<string, Record<string, unknown>>();
  for (const row of currentPlanRows) planBySku.set(text(row.material_code), row);
  for (const row of planResult.rows.filter((value) => text(value.target_month) === nextPlanDate))
    nextPlanBySku.set(text(row.material_code), row);

  const inventoryGroups = new Map<
    string,
    {
      name: string;
      category: string;
      quantity: number;
      available: number | null;
      batches: InventoryBatch[];
      batchSummary?: InventoryRow['batchSummary'];
    }
  >();
  const inventorySnapshotDate = text(
    inventoryResult.rows[0]?.snapshot_date,
    text(planResult.rows[0]?.plan_snapshot_date).slice(0, 10),
  );
  for (const row of inventoryResult.rows) {
    const sku = text(row.material_code);
    if (!sku || optionalNumber(row.live_qty) === null)
      throw new WarehouseSnapshotDataError(
        '库存数据缺少 SKU 或当前库存数量，请重新查询或核对数据来源',
      );
    const group = inventoryGroups.get(sku) ?? {
      name: text(row.material_name, sku),
      category: text(row.product_categ_name, '未分类'),
      quantity: 0,
      available: 0,
      batches: [],
    };
    const batchQuantity = optionalNumber(row.live_qty) ?? 0;
    const productionDate = text(row.prod_date);
    group.quantity += batchQuantity;
    const available = optionalNumber(row.available_qty);
    group.available =
      group.available === null || available === null ? null : group.available + available;
    if (inventoryDetail === 'summary') {
      group.batchSummary = {
        ageBuckets: [
          quantity(row.age_0_30_qty),
          quantity(row.age_30_60_qty),
          quantity(row.age_60_90_qty),
          quantity(row.stagnant_qty),
        ],
        unknownAgeQty: quantity(row.unknown_age_qty),
        positiveQty: quantity(row.positive_qty),
        weightedAge: quantity(row.weighted_age),
        bigDateQty: quantity(row.big_date_qty),
        stagnantQty: quantity(row.stagnant_qty),
        maxAgeDays: quantity(row.max_age_days),
        negativeBatchCount: quantity(row.negative_batch_count),
      };
    } else
      group.batches.push({
        batchNo: `PG-${sku}-${productionDate || 'UNKNOWN'}`,
        quantity: batchQuantity,
        availableQty: optionalNumber(row.available_qty),
        ageDays: ageDays(inventorySnapshotDate, productionDate),
        productionDate: productionDate || '—',
      });
    inventoryGroups.set(sku, group);
  }

  const activityBySku = new Map<string, Map<string, number | null>>();
  for (const row of operationResult.rows) {
    if (text(row.metric_group) !== 'branch_activity' || !text(row.material_code)) continue;
    const sku = text(row.material_code),
      name = text(row.metric_name),
      value = optionalNumber(row.metric_value);
    const metrics = activityBySku.get(sku) ?? new Map<string, number | null>();
    const previous = metrics.get(name);
    metrics.set(
      name,
      previous === null || value === null || value < 0 ? null : (previous ?? 0) + value,
    );
    activityBySku.set(sku, metrics);
  }
  const activitySum = (sku: string, names: string[]) =>
    sumKnownQuantities(names.map((name) => activityBySku.get(sku)?.get(name) ?? null));
  const inTransitBySku = new Map<string, number | null>();
  // Separate, server-owned metric contract: deduplicated open ASN remaining
  // quantities, with business-confirmed statuses and stock-unit conversion.
  // Explicit zero rows are required; absence never means zero.
  const verifiedTransitBySku = new Map<string, number | null>();
  const operationNameBySku = new Map<string, string>();
  const operationTotals = new Map<string, number>();
  for (const row of operationResult.rows) {
    const metricKey = `${text(row.metric_group)}:${text(row.metric_name)}`;
    const metricValue = optionalNumber(row.metric_value);
    if (
      text(row.metric_group) === 'base_supply' &&
      text(row.metric_name) === 'verified_in_transit_qty' &&
      text(row.material_code)
    ) {
      const sku = text(row.material_code);
      verifiedTransitBySku.set(
        sku,
        verifiedTransitBySku.has(sku) || metricValue === null || metricValue < 0
          ? null
          : metricValue,
      );
    }
    if (metricValue !== null)
      operationTotals.set(metricKey, (operationTotals.get(metricKey) ?? 0) + metricValue);
    if (text(row.metric_name) === 'in_transit_qty' && text(row.material_code)) {
      const sku = text(row.material_code);
      const previous = inTransitBySku.get(sku);
      inTransitBySku.set(
        sku,
        previous === null || metricValue === null || metricValue < 0
          ? null
          : (previous ?? 0) + metricValue,
      );
      if (text(row.material_name)) operationNameBySku.set(sku, text(row.material_name));
    }
  }

  const productionBySku = new Map<string, number>();
  for (const row of productionResult.rows) {
    const sku = text(row.material_code);
    productionBySku.set(sku, (productionBySku.get(sku) ?? 0) + quantity(row.planned_qty));
  }

  const plans: PlanRow[] = currentPlanRows.map((row) => {
    const sku = text(row.material_code);
    const next = nextPlanBySku.get(sku);
    return {
      month: monthValue(currentPlanDate),
      currentAvailable: usableSourcePlan(row),
      currentTransferAvailable: optionalNumber(row.transfer_plan_qty) !== null,
      nextTransferAvailable: optionalNumber(next?.transfer_plan_qty) !== null,
      nextAvailable: usableSourcePlan(next),
      sku,
      productName: text(row.material_name, sku),
      currentOutboundQty: quantity(row.shipment_plan_qty),
      currentTransferQty: quantity(row.transfer_plan_qty),
      nextOutboundQty: quantity(next?.shipment_plan_qty),
      nextTransferQty: quantity(next?.transfer_plan_qty),
      currentDailyOutboundQty: quantity(row.shipment_plan_qty) / daysInMonth(currentPlanDate),
      nextDailyOutboundQty: quantity(next?.shipment_plan_qty) / daysInMonth(nextPlanDate),
      source:
        text(row.plan_status).includes('MISSING') || text(row.bi_target_status) === 'MISSING'
          ? '历史估算'
          : 'BI',
      versionKind: text(row.plan_version).toUpperCase().includes('ROLLING')
        ? 'rolling'
        : 'month-start',
      versionId: `pg:${text(row.plan_snapshot_date)}:${text(row.plan_version)}:${text(next?.plan_version, 'NO_NEXT')}`,
      status: usableSourcePlan(row) && usableSourcePlan(next) ? 'confirmed' : 'incomplete',
    };
  });

  const replenishments: ReplenishmentRow[] = currentPlanRows.map((row) => {
    const sku = text(row.material_code);
    const inventory = inventoryGroups.get(sku);
    const inventoryQty = optionalNumber(inventory?.quantity ?? row.current_inventory_qty) ?? 0;
    const availableQty = optionalNumber(inventory?.available ?? row.current_inventory_qty) ?? 0;
    // Legacy expectedqty totals include historical ASN records. They cannot
    // establish current unreceived stock without status/receipt-level data.
    const inTransitQty = verifiedTransitBySku.get(sku) ?? null;
    const monthlyDemand = quantity(row.shipment_plan_qty);
    const plannedDailyShipment = monthlyDemand / daysInMonth(currentPlanDate);
    const cycleDays = Math.max(
      1,
      Math.round(quantity(row.replenishment_cycle_days) || BRANCH_RULESET.defaultCycleDays),
    );
    const targetInventoryQty = calculateTargetInventory(plannedDailyShipment, cycleDays);
    const recommendedQty =
      inTransitQty === null || !usableSourcePlan(row)
        ? null
        : Math.max(0, targetInventoryQty - availableQty - inTransitQty);
    return {
      sku,
      productName: text(row.material_name, sku),
      category: text(row.product_categ_name, '未分类'),
      materialGroup: productMetadata.get(sku)?.materialGroup ?? '未提供',
      inventoryQty,
      availableQty,
      currentAvailableQty: inventory
        ? inventory.available
        : optionalNumber(row.current_inventory_qty),
      inTransitQty,
      reportedInTransitQty: inTransitBySku.get(sku) ?? null,
      transferReceivedQty: activityBySku.get(sku)?.get('month_received_qty') ?? null,
      transferPendingQty: activityBySku.get(sku)?.get('month_pending_qty') ?? null,
      transferShippedQty: activityBySku.get(sku)?.get('month_shipped_qty') ?? null,
      transferredQty: activitySum(sku, [
        'month_received_qty',
        'month_pending_qty',
        'month_shipped_qty',
      ]),
      openTransferQty: activitySum(sku, ['open_pending_qty', 'open_shipped_qty']),
      monthlyDemand,
      currentOutboundQty: usableSourcePlan(row) ? quantity(row.shipment_plan_qty) : null,
      expectedMonthEndInventoryQty: usableSourcePlan(row)
        ? optionalNumber(row.expected_month_end_inventory_qty)
        : null,
      plannedDailyShipment,
      cycleDays,
      cycleRuleLevel: text(row.cycle_rule_source).toUpperCase().includes('SKU') ? 'sku' : 'default',
      targetInventoryQty,
      recommendedQty,
      actualQty: recommendedQty,
      reason: '',
      urgent:
        recommendedQty !== null &&
        recommendedQty > 0 &&
        availableQty + (inTransitQty ?? 0) < plannedDailyShipment * BRANCH_RULESET.preparationDays,
      dueDate: addDays(inventorySnapshotDate, Math.min(cycleDays, BRANCH_RULESET.preparationDays)),
      baseInventoryQty: null,
      baseCapacityQty: optionalNumber(productionBySku.get(sku)),
    };
  });

  const replenishmentBySku = new Map(replenishments.map((row) => [row.sku, row]));
  const inventory: InventoryRow[] = [
    ...new Set([...inventoryGroups.keys(), ...planMaterialCodes, ...verifiedTransitBySku.keys()]),
  ]
    .sort()
    .map((sku) => {
      const group = inventoryGroups.get(sku);
      const plan = planBySku.get(sku);
      const replenishment = replenishmentBySku.get(sku);
      const batches =
        inventoryDetail === 'summary'
          ? []
          : group?.batches.length
            ? group.batches
            : [{ batchNo: `PG-${sku}-NO-STOCK`, quantity: 0, ageDays: 0, productionDate: '—' }];
      const inventoryQty = group?.quantity ?? quantity(plan?.current_inventory_qty);
      const inTransitQty = verifiedTransitBySku.get(sku) ?? null;
      const _plannedDaily = replenishment?.plannedDailyShipment ?? 0;
      return {
        sku,
        productName: group?.name || text(plan?.material_name, operationNameBySku.get(sku) || sku),
        category: group?.category || text(plan?.product_categ_name, '未分类'),
        materialGroup: productMetadata.get(sku)?.materialGroup ?? '未提供',
        quantity: inventoryQty,
        availableQty: group?.available ?? null,
        inTransitQty,
        reportedInTransitQty: inTransitBySku.get(sku) ?? null,
        // Order-stage quantities are separate from verified physical in-transit stock.
        orderedNotShippedQty: activityBySku.get(sku)?.get('open_pending_qty') ?? null,
        shippedNotReceivedQty: activityBySku.get(sku)?.get('open_shipped_qty') ?? null,
        turnoverDays: null, // Filled only from the dated actual outbound measure below.
        batches,
        ...(inventoryDetail === 'summary'
          ? {
              batchSummary: group?.batchSummary ?? {
                positiveQty: 0,
                weightedAge: 0,
                bigDateQty: 0,
                stagnantQty: 0,
                maxAgeDays: 0,
                negativeBatchCount: 0,
              },
            }
          : {}),
      };
    });

  const orderDetailByKey = new Map(
    orderDetailResult.rows.map((row) => [
      `${text(row.executeorderno)}:${text(row.material_code)}`,
      row,
    ]),
  );
  const orderGroups = new Map<string, CustomerOrder>();
  for (const row of pendingOrderResult.rows) {
    const orderNo = text(row.executeorderno);
    const sku = text(row.material_code);
    const detail = orderDetailByKey.get(`${orderNo}:${sku}`);
    const orderedQty = quantity(row.order_qty);
    const allocatedQty = Math.min(orderedQty, quantity(row.allocated_qty));
    const actualShippedQty = optionalNumber(detail?.shipped_qty);
    const shortageQty = Math.max(0, orderedQty - allocatedQty);
    const existing = orderGroups.get(orderNo) ?? {
      orderNo,
      customer: text(
        row.cust_name,
        text(detail?.cust_name, text(row.cust_code, text(detail?.cust_code, '客户信息未提供'))),
      ),
      requestedDate: text(row.required_delivery_at).slice(0, 10) || '—', // Only the authoritative requested delivery date.
      status: '正常',
      lines: [],
    };
    existing.lines.push({
      sku,
      productName: text(
        detail?.material_name,
        inventoryGroups.get(sku)?.name || text(planBySku.get(sku)?.material_name, sku),
      ),
      orderedQty,
      preparingQty: optionalNumber(row.preparing_qty),
      preparingAllocatedQty: optionalNumber(row.preparing_allocated_qty),
      allocatedQty,
      shippedQty: actualShippedQty,
      shortageQty,
    });
    const totalOrdered = existing.lines.reduce((sum, line) => sum + line.orderedQty, 0);
    const totalShortage = existing.lines.reduce((sum, line) => sum + line.shortageQty, 0);
    existing.status = severityForShortage(totalShortage, totalOrdered);
    orderGroups.set(orderNo, existing);
  }
  const orders = [...orderGroups.values()];
  for (const row of replenishments) {
    const lines = orders.flatMap((order) => order.lines).filter((line) => line.sku === row.sku);
    row.preparingQty = lines.some((line) => line.preparingQty == null)
      ? null
      : lines.reduce((sum, line) => sum + (line.preparingQty ?? 0), 0);
  }

  const productionByBase = new Map<string, { quantity: number; latestDate: string }>();
  for (const row of productionResult.rows) {
    const baseName = text(
      row.base_name,
      text(row.warehouse_group_name, text(row.warehouse_group_id, '未命名基地')),
    );
    const current = productionByBase.get(baseName) ?? {
      quantity: 0,
      latestDate: inventorySnapshotDate,
    };
    current.quantity += quantity(row.planned_qty);
    if (text(row.base_finish_date) > current.latestDate)
      current.latestDate = text(row.base_finish_date);
    productionByBase.set(baseName, current);
  }
  const recommendedTotal = replenishments.length
    ? sumKnownQuantities(replenishments.map((row) => row.recommendedQty))
    : null;
  const baseResources: BaseResource[] = [...productionByBase.entries()].map(([baseName, value]) => {
    const leadTimeDays = null; // Production dates do not establish transport lead time.
    return {
      baseName,
      materialGroup: 'PG 基地生产计划覆盖当前补货 SKU',
      availableQty: null,
      capacityQty: integerQuantity(value.quantity),
      leadTimeDays,
      status: '关注',
    };
  });

  const allBatches = inventory.flatMap((row) =>
    row.batches.map((batch) => ({ ...batch, sku: row.sku })),
  );
  const inventoryQty = sumKnownQuantities(
    [...inventoryGroups.values()].map((row) => row.available),
  );
  const inTransitQty = sumKnownQuantities(inventory.map((row) => row.inTransitQty));
  const transitVerified =
    inventory.length > 0 && inTransitQty !== null && recommendedTotal !== null;
  const rawReportedInTransitQty = sumKnownQuantities([...inTransitBySku.values()]);
  const positiveBatches = allBatches.filter((batch) => batch.quantity > 0);
  const weightedAge =
    inventoryDetail === 'summary'
      ? inventory.reduce((sum, row) => sum + (row.batchSummary?.weightedAge ?? 0), 0)
      : positiveBatches.reduce((sum, batch) => sum + batch.quantity * batch.ageDays, 0);
  const positiveQty =
    inventoryDetail === 'summary'
      ? inventory.reduce((sum, row) => sum + (row.batchSummary?.positiveQty ?? 0), 0)
      : positiveBatches.reduce((sum, row) => sum + row.quantity, 0);
  const bigDate = allBatches.filter(
    (batch) => batch.quantity > 0 && batch.ageDays >= BRANCH_RULESET.bigDateDays,
  );
  const stagnant = allBatches.filter(
    (batch) => batch.quantity > 0 && batch.ageDays >= BRANCH_RULESET.stagnantDays,
  );
  const orderLines = orders.flatMap((order) => order.lines);
  const allocatedQty = orderLines.reduce((sum, row) => sum + row.allocatedQty, 0);
  const fulfillmentSummary = fulfillmentSummaryResult.rows[0];
  const orderQty = optionalNumber(fulfillmentSummary?.order_qty);
  const shippedQty = optionalNumber(fulfillmentSummary?.shipped_qty);
  const shortageLines = orderLines.filter((row) => row.shortageQty > 0);

  const actualBySku = new Map(
    dailyOutbound.rows.map((row) => [text(row.material_code), optionalNumber(row.outbound_qty)]),
  );
  for (const row of inventory) {
    const out = actualBySku.get(row.sku);
    row.actualDailyOutboundQty = out == null ? null : Math.ceil(out / 30);
    row.turnoverDays =
      row.availableQty != null && out != null && out > 0 ? row.availableQty / (out / 30) : null;
  }
  const turnoverBySku = new Map(inventory.map((row) => [row.sku, row.turnoverDays]));
  for (const row of replenishments) {
    row.historicalTurnoverDays = turnoverBySku.get(row.sku) ?? null;
    const out = actualBySku.get(row.sku);
    row.actualDailyOutboundQty = out == null ? null : Math.ceil(out / 30);
  }
  const actualTotal = dailyOutbound.rows.reduce(
    (sum, row) => sum + (optionalNumber(row.outbound_qty) ?? 0),
    0,
  );
  // The warehouse denominator includes all actual shipments, including sold-out SKUs.
  // Do not require a shipment row for every inventory SKU or average SKU ratios.
  const turnoverDays =
    dailyOutbound.rows.length > 0 &&
    dailyOutbound.rows.every((row) => optionalNumber(row.outbound_qty) !== null) &&
    inventoryQty !== null &&
    actualTotal > 0
      ? inventoryQty / (actualTotal / 30)
      : null;

  const operations: OperationsObservation[] = [
    {
      id: `${warehouseId}-pg-replenishment`,
      severity: '高',
      title: transitVerified ? '已按核实在途恢复补货计算' : '在途口径待核实，补货建议暂停',
      detail: transitVerified
        ? `按目标库存减可用库存及核实在途计算，建议补货 ${recommendedTotal} 件。`
        : '当前在途来源为 ASN 历史预期数量累计，尚不能确定有效未收货量；补货量和紧急程度未知，不代表无需补货。',
      suggestedAction: transitVerified
        ? '复核计划覆盖、实际补货量和调减原因后确认待办。'
        : '补齐有效 ASN 状态、实收及单位口径后重新计算，再确认业务待办。',
    },
    {
      id: `${warehouseId}-pg-order-gap`,
      severity: shortageLines.length ? '高' : '低',
      title: '待处理订单分配缺口',
      detail: `${orders.filter((order) => order.lines.some((line) => line.shortageQty > 0)).length} 个订单存在分配缺口，缺口合计 ${Math.round(shortageLines.reduce((sum, row) => sum + row.shortageQty, 0))} 件。`,
      suggestedAction: '优先处理缺口比例高的订单，并复核可用库存。',
    },
    {
      id: `${warehouseId}-pg-flow`,
      severity:
        freshness(latestTimestamp(operationResult.rows.map((row) => row.updated_time)), now) ===
        'stale'
          ? '中'
          : '低',
      title: '仓库流量事实',
      detail: `本月入库 ${operationTotals.get('warehouse_flow:in_qty') ?? '待核实'} 件、出库 ${operationTotals.get('warehouse_flow:out_qty') ?? '待核实'} 件。`,
      suggestedAction: '结合库存水位和出库节奏持续观察周转变化。',
    },
  ];
  const operationsSummary = {
    inboundQty: optionalNumber(operationTotals.get('warehouse_flow:in_qty')),
    outboundQty: optionalNumber(operationTotals.get('warehouse_flow:out_qty')),
    storageFee: optionalNumber(operationTotals.get('warehouse_cost:storage_fee')),
    transportFee: optionalNumber(operationTotals.get('warehouse_cost:transport_fee')),
  };
  const assessmentMetricDefinitions = [
    ['deliveryTimelinessRate', '交付及时率', 'delivery_timeliness_rate'],
    ['coldChainComplianceRate', '冷链符合率', 'cold_chain_compliance_rate'],
    ['accurateDeliveryRate', '准确交付率', 'accurate_delivery_rate'],
    ['warehouseTemperatureComplianceRate', '库温符合率', 'warehouse_temperature_compliance_rate'],
    ['receiptConfirmationTimelinessRate', '回单确认及时率', 'receipt_confirmation_timeliness_rate'],
    ['freshnessRate', '新鲜度占比', 'freshness_rate'],
  ] as const;
  const assessmentMetrics = assessmentMetricDefinitions.map(([key, label, metricName]) => {
    const values = operationResult.rows
      .filter(
        (row) =>
          text(row.metric_group) === 'warehouse_examine' && text(row.metric_name) === metricName,
      )
      .map((row) => optionalNumber(row.metric_value))
      .filter((value): value is number => value !== null);
    return {
      key,
      label,
      value: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null,
    };
  });
  const throughput = {
    branchShipQty: optionalNumber(operationTotals.get('warehouse_throughput:branch_ship_qty')),
    provinceShipQty: optionalNumber(operationTotals.get('warehouse_throughput:province_ship_qty')),
  };
  const businessPeriods = {
    operationsMonth: addDays(calculationDate, -1).slice(0, 7),
    productionStart: calculationDate,
    productionEnd: addDays(calculationDate, 6),
  };
  const monthlyBudgets = budgetResult.rows.map((row) => ({
    month: text(row.year_month).replace(/^(\d{4})(\d{2})$/, '$1-$2'),
    shippingCode: text(row.shipping_code),
    shippingName: text(row.shipping_name),
    budget: optionalNumber(row.budget_mny),
    previousBudget: optionalNumber(row.pre_mny),
    lastYearBudget: optionalNumber(row.ly_same_mny),
    monthRate: optionalNumber(row.total_rate),
    yearRate: optionalNumber(row.history_rate),
    recentRate: optionalNumber(row.avg_3month_rate),
    growthFactor: optionalNumber(row.growth_factor),
    recentRateCount: quantity(row.recent_rate_count),
    status: text(row.data_status, 'BUDGET_MISSING'),
  }));
  const currentBudget = monthlyBudgets.find((row) => row.month === businessPeriods.operationsMonth);
  const growth = {
    referenceShipmentQty: currentPlanRows.reduce(
      (sum, row) => sum + quantity(row.reference_shipment_qty),
      0,
    ),
    targetGrowthRate: currentBudget?.monthRate ?? null,
    historySamePeriodGrowthRate: currentBudget?.yearRate ?? null,
    recentThreeMonthGrowthRate: currentBudget?.recentRate ?? null,
    overallGrowthRate: currentBudget?.growthFactor ?? null,
  };
  const pendingQuality = {
    status: !pendingOrderResult.rows.length
      ? ('empty' as const)
      : pendingOrderResult.rows.some(
            (row) => optionalNumber(row.legacy_count) === null || quantity(row.legacy_count) > 0,
          )
        ? ('legacy' as const)
        : ('verified' as const),
    reason:
      '备单状态新口径尚未完成同步，当前包含历史未标记订单；分配缺口仅供核对，不表示已按新备单规则筛选。',
  };
  if (pendingQuality.status === 'verified')
    pendingQuality.reason = '当前订单行已按备单状态筛选；分配缺口不等同未发货量。';
  if (pendingQuality.status === 'empty')
    pendingQuality.reason = '当前范围没有待分配订单行，不能据此判断备单新口径已同步。';

  const sourceUpdatedTime = latestTimestamp([
    ...planResult.rows.map((row) => row.updated_time),
    ...inventoryResult.rows.map((row) => row.updated_time),
    ...operationResult.rows.map((row) => row.updated_time),
    ...pendingOrderResult.rows.map((row) => row.updated_time),
    ...productionResult.rows.map((row) => row.updated_time),
    ...fulfillmentSummaryResult.rows.map((row) => row.updated_time),
    ...budgetResult.rows.map((row) => row.updated_time),
  ]);
  const planSnapshotDate = text(planResult.rows[0]?.plan_snapshot_date);
  const currentVersion = text(currentPlanRows[0]?.plan_version, 'UNKNOWN');
  const nextVersion = text(nextPlanBySku.values().next().value?.plan_version, 'NO_NEXT');
  const missingStockPlans = inventory.filter(
    (row) => row.quantity > 0 && !planBySku.has(row.sku),
  ).length;
  const missingShortagePlans = new Set(
    shortageLines.filter((row) => !planBySku.has(row.sku)).map((row) => row.sku),
  ).size;
  const missingOrderDetails = orders.filter(
    (row) =>
      row.requestedDate === '—' ||
      row.customer === '客户信息未提供' ||
      row.lines.some((line) => line.shippedQty === null),
  ).length;
  const sourceDates = {
    库存: inventorySnapshotDate,
    计划: planSnapshotDate,
    运营月份: businessPeriods.operationsMonth,
    排产范围: `${businessPeriods.productionStart} 至 ${businessPeriods.productionEnd}（含首尾）`,
    预算更新: latestTimestamp(budgetResult.rows.map((row) => row.updated_time)) || '未提供',
    运营更新: latestTimestamp(operationResult.rows.map((row) => row.updated_time)) || '未提供',
    履约更新:
      latestTimestamp(fulfillmentSummaryResult.rows.map((row) => row.updated_time)) || '未提供',
  };
  const warnings = [
    ...(!planResult.rows.length
      ? [
          '该分仓暂无当前同步计划；保留真实库存和订单，计划、目标及补货量未补零；基地排产仍按已有计划 SKU 关联，空结果不代表无排产。',
        ]
      : []),
    ...(pendingQuality.status === 'legacy' ? [pendingQuality.reason] : []),
    ...(!currentBudget || currentBudget.status !== 'COMPLETE'
      ? [
          '当期预算或历史月份不完整，原始缺项保留待核实；加权增长率按入库规则计算，不重复汇总 SKU 上的预算。',
        ]
      : []),
    `${transitVerified ? '有效在途已按标准指标接入' : '有效在途未核实'}；基地可用库存、供货关系和真实提前期未提供。生产计划量不等同可承诺产能。`,
    '各源数据日期不同，请展开核对；回顾周转按可用库存/近30日实际日均出库计算，缺少日出库不补零。订单要求日期来自执行单要求交付时间，缺失不以创建日期替代。',
    ...(missingStockPlans || missingShortagePlans
      ? [
          `${missingStockPlans} 个正库存 SKU、${missingShortagePlans} 个缺货 SKU 缺少计划，未进入补货计算，需补齐计划。`,
        ]
      : []),
    ...(missingOrderDetails
      ? [`${missingOrderDetails}/${orders.length} 个订单明细字段不完整，未知发货量不按 0 处理。`]
      : []),
    ...(plans.some((row) => row.status === 'incomplete')
      ? ['计划存在目标/月份缺失或未确认状态；历史估算不等同已确认 BI 目标。']
      : []),
    ...(currentPlanRows.some((row) => text(row.bi_target_status) === 'READY_HISTORY_PARTIAL')
      ? ['预算历史增长数据不完整，缺项按原规则以零贡献计入加权增长率，未重新分配权重。']
      : []),
    ...((
      inventoryDetail === 'summary'
        ? inventory.some((row) => (row.batchSummary?.negativeBatchCount ?? 0) > 0)
        : allBatches.some((row) => row.quantity < 0)
    )
      ? ['源库存包含负数，现库存合计保留原值；库龄及临期数量仅统计正库存批次。']
      : []),
  ];

  const result: WarehouseSnapshot = {
    monthlyBudgets,
    businessPeriods,
    dataQuality: {
      warnings,
      sourceDates,
      pendingOrders: pendingQuality,
      inTransit: {
        status: transitVerified ? 'verified' : 'unverified',
        rawReportedQty: rawReportedInTransitQty,
        reason: transitVerified
          ? '有效在途来自经状态筛选、实收核减、去重及单位统一后的标准指标；历史 ASN 总量不参与计算。'
          : 'ASN 历史预期数量未核减实收和完成/取消单据；有效在途待核实，暂不生成补货建议或创建待办。',
      },
    },
    metricScopes: {
      fulfillment: `${businessPeriods.operationsMonth} 订单履约（分仓运营事实表按月份、分仓汇总）；与近60天待分配缺口独立统计${fulfillmentSummary?.order_qty == null ? '；履约数据缺失' : ''}`,
      pendingOrders:
        '近60天备单中及备单完成未发货订单；备单中取订单量，备单完成未发货取占单量，完整保留无缺口订单；缺口不等于未发货量',
    },
    warehouseId,
    warehouseName: source.warehouseName,
    ...(!inventoryResult.rows.length && !planResult.rows.length && !pendingOrderResult.rows.length
      ? { dataState: 'empty' as const }
      : {}),
    region: source.region,
    snapshotDate: inventorySnapshotDate,
    snapshotTime: shanghaiTimestamp(sourceUpdatedTime || `${inventorySnapshotDate}T00:00:00+08:00`),
    currentMonthLabel: monthLabel(currentPlanDate),
    nextMonthLabel: monthLabel(nextPlanDate),
    dataSource: 'PostgreSQL data_service 分仓库存标准表',
    version:
      `pg-${warehouseId}-${planSnapshotDate}-${sourceUpdatedTime || inventorySnapshotDate}`.slice(
        0,
        160,
      ),
    previewStatus: 'preview',
    freshness: [
      planResult,
      inventoryResult,
      operationResult,
      pendingOrderResult,
      fulfillmentSummaryResult,
    ].every(
      (result) =>
        freshness(latestTimestamp(result.rows.map((row) => row.updated_time)), now) === 'fresh',
    )
      ? 'fresh'
      : 'stale',
    ruleTrace: {
      solidifiedVersion: BRANCH_RULESET.solidifiedVersion,
      businessVersion: BRANCH_RULESET.businessVersion,
      sourcePriority: 'PG 标准表 > 已确认人工计划 > 可见降级',
      planVersion: `PG ${currentVersion} + ${nextVersion}`,
      planSource: !plans.length
        ? '未提供'
        : plans.some((row) => row.source === '历史估算')
          ? '历史估算'
          : 'BI',
    },
    inventory,
    replenishments,
    orders,
    plans,
    baseResources,
    operationsSummary,
    assessmentMetrics,
    throughput,
    growth,
    operations,
    businessExceptions: [],
    metrics: {
      inventoryQty,
      inTransitQty,
      orderedNotShippedQty: sumKnownQuantities(inventory.map((row) => row.orderedNotShippedQty)),
      shippedNotReceivedQty: sumKnownQuantities(inventory.map((row) => row.shippedNotReceivedQty)),
      turnoverDays,
      previousTurnoverDays: null,
      targetTurnoverDays: BRANCH_RULESET.defaultCycleDays + BRANCH_RULESET.preparationDays,
      averageAgeDays: positiveQty > 0 ? Number((weightedAge / positiveQty).toFixed(1)) : 0,
      bigDateQty:
        inventoryDetail === 'summary'
          ? inventory.reduce((sum, row) => sum + (row.batchSummary?.bigDateQty ?? 0), 0)
          : bigDate.reduce((sum, batch) => sum + batch.quantity, 0),
      bigDateSkuCount:
        inventoryDetail === 'summary'
          ? inventory.filter((row) => (row.batchSummary?.bigDateQty ?? 0) > 0).length
          : new Set(bigDate.map((batch) => batch.sku)).size,
      stagnantQty:
        inventoryDetail === 'summary'
          ? inventory.reduce((sum, row) => sum + (row.batchSummary?.stagnantQty ?? 0), 0)
          : stagnant.reduce((sum, batch) => sum + batch.quantity, 0),
      stagnantSkuCount:
        inventoryDetail === 'summary'
          ? inventory.filter((row) => (row.batchSummary?.stagnantQty ?? 0) > 0).length
          : new Set(stagnant.map((batch) => batch.sku)).size,
      orderQty,
      allocatedQty,
      shippedQty,
      fulfillmentRate:
        orderQty === null || shippedQty === null ? '—' : formatRatio(shippedQty, orderQty),
      recommendedQty: recommendedTotal,
      replenishmentSkuCount:
        recommendedTotal === null
          ? null
          : replenishments.filter((row) => (row.recommendedQty ?? 0) > 0).length,
      shortageQty: shortageLines.reduce((sum, row) => sum + row.shortageQty, 0),
      shortageSkuCount: new Set(shortageLines.map((row) => row.sku)).size,
    },
  };
  return planningState
    ? applyBusinessPlanning(
        result,
        planningState,
        new Map(
          monthlyShipments.rows.map((row) => [text(row.sku), optionalNumber(row.shipped_qty)]),
        ),
        calculationDate,
      )
    : result;
}
