import sqlConfiguration from '../../../../../sql.config.json';
import {
  agentSqlConfig,
  sqlTemplate as configuredSql,
} from '../../../../../../shared/sql-config.ts';
import 'server-only';

import {
  executeAllGeaSqlPages,
  executeGeaSql,
  executeGeaSqlPage,
  type GeaSqlParameters,
  type GeaSqlRequestOptions,
  type GeaSqlRow,
} from '@/lib/gea-sql-client';

// GEA 的 SQL 重写器只接受已发布资源名。生产数据源需将 currentSchema
// 配为 data_service，因此目录内不携带 PostgreSQL schema 前缀。
function configuredResourceName(name: string) {
  const value = String(agentSqlConfig(sqlConfiguration).resourceNames?.[name] ?? '').trim();
  if (!/^[A-Za-z_][A-Za-z0-9_$]*$/.test(value)) {
    throw new Error(`${name} 只能配置 GEA 已发布的无 schema 资源名`);
  }
  return value;
}

function saleableMaterialTable() {
  return configuredResourceName('saleableMaterial');
}

function promotionScopeView() {
  return configuredResourceName('promotionScope');
}

/** 展示仅约束客户、政策状态和周期，提货点在使用优惠时独立核验。 */
function promotionScopeConditions(dateParameter: 'businessDate' | 'catalogToday') {
  return configuredSql(sqlConfiguration, 'dealer.web.src.lib.dealer-workbench-sql.1', [
    dateParameter,
    dateParameter,
  ]);
}

// 兼容源资源名也集中在 Agent SQL 配置中，不另设页面环境变量权威。
const MAIN_TABLE = configuredResourceName('main');
const WL_AGE_TABLE = configuredResourceName('wlAge');
const SIMULATED_AGE_TABLE = configuredResourceName('simulatedAge');
const INVENTORY_DAILY_TABLE = configuredResourceName('inventoryDaily');

type WorkbenchRow = Record<string, string | number | null | undefined>;
type SqlQuery = { sql: string; parameters: GeaSqlParameters };
export type CompanyProductFilters = {
  search?: string;
  category?: string;
  productTag?: string;
  policyCode?: string;
  policySearch?: string;
  materialCodes?: string[];
  download?: boolean;
};
export type InventoryDailyKey = { customerCode: string; materialCode: string };

export type WorkbenchResultSqlScope = {
  snapshotDate: string;
  planMonth?: string;
  customerCodes: string[];
  materialCode: string;
  mode: 'detail' | 'aggregate';
  groupBy: string;
  orderColumn: string;
};

const mainColumnToCubeMember: Record<string, string> = {
  record_count: 'dealer_plan_order.record_count',
  snapshot_date: 'dealer_plan_order.snapshot_date',
  plan_month: 'dealer_plan_order.plan_month',
  cust_code: 'dealer_plan_order.cust_code',
  cust_name: 'dealer_plan_order.cust_name',
  material_code: 'dealer_plan_order.material_code',
  material_name: 'dealer_plan_order.material_name',
  product_categ_name: 'dealer_plan_order.product_categ_name',
  inventory_source: 'dealer_plan_order.inventory_source',
  stock_age_turnover_status: 'dealer_plan_order.stock_age_turnover_status',
  source_load_time: 'dealer_plan_order.source_load_time',
  updated_time: 'dealer_plan_order.updated_time',
  budget_amount: 'dealer_plan_order.budget_amount',
  shipped_qty: 'dealer_plan_order.shipped_qty',
  ship_amount: 'dealer_plan_order.ship_amount',
  unship_qty: 'dealer_plan_order.unship_qty',
  unship_amount: 'dealer_plan_order.unship_amount',
  total_qty: 'dealer_plan_order.total_qty',
  total_amount: 'dealer_plan_order.total_amount',
  planned_qty: 'dealer_plan_order.planned_qty',
  daily_sales: 'dealer_plan_order.daily_sales',
  in_transit_qty: 'dealer_plan_order.in_transit_qty',
  stock_qty: 'dealer_plan_order.stock_qty',
  target_inventory: 'dealer_plan_order.target_inventory',
  pre_order_qty: 'dealer_plan_order.pre_order_qty',
  average_turnover_days: 'dealer_plan_order.average_turnover_days',
  label_turnover_days: 'dealer_plan_order.label_turnover_days',
  average_stock_age: 'dealer_plan_order.average_stock_age',
  average_budget_rate: 'dealer_plan_order.average_budget_rate',
  average_planned_qty_rate: 'dealer_plan_order.average_planned_qty_rate',
};

const inventoryDailyColumnToCubeMember: Record<string, string> = {
  stat_date: 'dealer_inventory_daily.stat_date',
  inventory_snapshot_date: 'dealer_inventory_daily.inventory_snapshot_date',
  cust_code: 'dealer_inventory_daily.cust_code',
  cust_name: 'dealer_inventory_daily.cust_name',
  material_code: 'dealer_inventory_daily.material_code',
  material_name: 'dealer_inventory_daily.material_name',
  product_range_name: 'dealer_inventory_daily.product_range_name',
  product_tag: 'dealer_inventory_daily.product_tag',
  material_size: 'dealer_inventory_daily.material_size',
  measure_unit: 'dealer_inventory_daily.measure_unit',
  cif_price: 'dealer_inventory_daily.cif_price',
  stock_qty: 'dealer_inventory_daily.stock_qty',
  in_transit_qty: 'dealer_inventory_daily.in_transit_qty',
  normal_stock_qty: 'dealer_inventory_daily.normal_stock_qty',
  stock_amount: 'dealer_inventory_daily.stock_amount',
  sales_qty_7days_avg: 'dealer_inventory_daily.sales_qty_7days_avg',
  sales_qty_7days: 'dealer_inventory_daily.sales_qty_7days',
  sales_qty_30days_avg: 'dealer_inventory_daily.sales_qty_30days_avg',
  sales_qty_30days: 'dealer_inventory_daily.sales_qty_30days',
  sales_amount_30days: 'dealer_inventory_daily.sales_amount_30days',
  sales_amount_30days_avg: 'dealer_inventory_daily.sales_amount_30days_avg',
  source_load_time: 'dealer_inventory_daily.source_load_time',
  inventory_source: 'dealer_inventory_daily.inventory_source',
  updated_time: 'dealer_inventory_daily.updated_time',
};

const MAIN_SELECT = configuredSql(
  sqlConfiguration,
  'fragments.source.dealer.web.src.lib.dealer-workbench-sql.ts.1',
);

function assertIdentifier(value: string, label: string) {
  const normalized = value.trim();
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(normalized)) throw new Error(`${label}格式无效`);
  return normalized;
}

function assertDate(value: string, label: string, pattern: RegExp) {
  const normalized = value.trim();
  if (!pattern.test(normalized)) throw new Error(`${label}格式无效`);
  return normalized;
}

function customerPredicate(
  customerCodes: string[],
  parameters: GeaSqlParameters,
  column = 'cust_code',
) {
  if (!customerCodes.length) return '';
  const placeholders = customerCodes.map((code, index) => {
    const name = `customerCode${index}`;
    parameters[name] = assertIdentifier(code, '客户编码');
    return `:${name}`;
  });
  return configuredSql(sqlConfiguration, 'dealer.web.src.lib.dealer-workbench-sql.2', [
    column,
    placeholders.join(', '),
  ]);
}

function inventoryDailyKeyPredicate(keys: InventoryDailyKey[], parameters: GeaSqlParameters) {
  if (!keys.length)
    return configuredSql(
      sqlConfiguration,
      'inline.source.dealer.web.src.lib.dealer-workbench-sql.ts.1',
    );
  if (keys.length > 200) throw new Error('库存日快照单次最多查询200个客户-SKU键');
  return configuredSql(
    sqlConfiguration,
    'inline.source.dealer.web.src.lib.dealer-workbench-sql.ts.2',
    [
      keys
        .map((key, index) => {
          const customerName = `dailyCustomerCode${index}`;
          const materialName = `dailyMaterialCode${index}`;
          parameters[customerName] = assertIdentifier(key.customerCode, '客户编码');
          parameters[materialName] = assertIdentifier(key.materialCode, 'SKU编码');
          return configuredSql(sqlConfiguration, 'dealer.web.src.lib.dealer-workbench-sql.3', [
            customerName,
            materialName,
          ]);
        })
        .join(
          configuredSql(
            sqlConfiguration,
            'inline.source.dealer.web.src.lib.dealer-workbench-sql.ts.3',
          ),
        ),
    ],
  );
}

function scopedWhere(
  snapshotDate: string,
  planMonth: string | undefined,
  customerCodes: string[],
  materialCode = '',
) {
  const parameters: GeaSqlParameters = {
    snapshotDate: assertDate(snapshotDate, '快照日期', /^20\d{2}-\d{2}-\d{2}$/),
  };
  // GEA/JDBC binds JSON dates as VARCHAR; cast parameters, keeping date columns indexable.
  let where = configuredSql(
    sqlConfiguration,
    'fragments.source.dealer.web.src.lib.dealer-workbench-sql.ts.2',
  );
  if (planMonth) {
    parameters.planMonth = `${assertDate(planMonth, '计划月份', /^20\d{2}-\d{2}$/)}-01`;
    where += configuredSql(sqlConfiguration, 'dealer.web.src.lib.dealer-workbench-sql.4');
  }
  where += customerPredicate(customerCodes, parameters);
  if (materialCode) {
    parameters.materialCode = assertIdentifier(materialCode, 'SKU编码');
    where += configuredSql(sqlConfiguration, 'dealer.web.src.lib.dealer-workbench-sql.5');
  }
  return { where, parameters };
}

function toCubeRows(rows: GeaSqlRow[]): WorkbenchRow[] {
  return rows.map((row) =>
    Object.fromEntries(
      Object.entries(row).map(([key, value]) => [mainColumnToCubeMember[key] ?? key, value]),
    ),
  );
}

function toInventoryDailyCubeRows(rows: GeaSqlRow[]): WorkbenchRow[] {
  return rows.map((row) =>
    Object.fromEntries(
      Object.entries(row).map(([key, value]) => [
        inventoryDailyColumnToCubeMember[key] ?? key,
        value,
      ]),
    ),
  );
}

export const dealerWorkbenchSql = {
  latestSnapshot(customerCodes: string[] = []): SqlQuery {
    const parameters: GeaSqlParameters = {};
    return {
      sql: configuredSql(sqlConfiguration, 'dealer.web.src.lib.dealer-workbench-sql.6', [
        MAIN_TABLE,
        customerPredicate(customerCodes, parameters),
      ]),
      parameters,
    };
  },

  latestInventoryDailySnapshot(customerCodes: string[] = []): SqlQuery {
    const parameters: GeaSqlParameters = {};
    return {
      sql: configuredSql(sqlConfiguration, 'dealer.web.src.lib.dealer-workbench-sql.7', [
        INVENTORY_DAILY_TABLE,
        customerPredicate(customerCodes, parameters),
      ]),
      parameters,
    };
  },

  inventoryDailyDetails(
    statDate: string,
    keys: InventoryDailyKey[],
    exportCustomerCodes?: string[],
  ): SqlQuery {
    const parameters: GeaSqlParameters = {
      statDate: assertDate(statDate, '库存统计日期', /^20\d{2}-\d{2}-\d{2}$/),
    };
    const keyFilter =
      exportCustomerCodes === undefined
        ? inventoryDailyKeyPredicate(keys, parameters)
        : customerPredicate(exportCustomerCodes, parameters);
    return {
      sql: configuredSql(sqlConfiguration, 'dealer.web.src.lib.dealer-workbench-sql.8', [
        INVENTORY_DAILY_TABLE,
        keyFilter,
      ]),
      parameters,
    };
  },

  inventoryDailySummary(statDate: string, customerCodes: string[]): SqlQuery {
    const parameters: GeaSqlParameters = {
      statDate: assertDate(statDate, '库存统计日期', /^20\d{2}-\d{2}-\d{2}$/),
    };
    return {
      sql: configuredSql(sqlConfiguration, 'dealer.web.src.lib.dealer-workbench-sql.9', [
        INVENTORY_DAILY_TABLE,
        customerPredicate(customerCodes, parameters),
      ]),
      parameters,
    };
  },

  inventoryDailyCustomerSummaries(statDate: string, customerCodes: string[]): SqlQuery {
    const parameters: GeaSqlParameters = {
      statDate: assertDate(statDate, '库存统计日期', /^20\d{2}-\d{2}-\d{2}$/),
    };
    return {
      sql: configuredSql(sqlConfiguration, 'dealer.web.src.lib.dealer-workbench-sql.10', [
        INVENTORY_DAILY_TABLE,
        customerPredicate(customerCodes, parameters),
      ]),
      parameters,
    };
  },

  snapshotMonths(customerCodes: string[]): SqlQuery {
    const parameters: GeaSqlParameters = {};
    // Only months belonging to the latest authorized snapshot are used by the page.
    const scope = customerPredicate(customerCodes, parameters);
    return {
      sql: configuredSql(sqlConfiguration, 'dealer.web.src.lib.dealer-workbench-sql.11', [
        MAIN_TABLE,
        scope,
        MAIN_TABLE,
        scope,
      ]),
      parameters,
    };
  },

  customers(snapshotDate: string, search = '', exactCode = ''): SqlQuery {
    const parameters: GeaSqlParameters = {
      snapshotDate: assertDate(snapshotDate, '快照日期', /^20\d{2}-\d{2}-\d{2}$/),
    };
    let filters = '';
    if (exactCode) {
      parameters.exactCustomerCode = assertIdentifier(exactCode, '客户编码');
      filters += configuredSql(sqlConfiguration, 'dealer.web.src.lib.dealer-workbench-sql.12');
    }
    if (search.trim()) {
      parameters.customerSearch = `%${search.trim().slice(0, 100).toLocaleLowerCase('zh-CN')}%`;
      filters += configuredSql(
        sqlConfiguration,
        'inline.source.dealer.web.src.lib.dealer-workbench-sql.ts.4',
      );
    }
    return {
      sql: configuredSql(sqlConfiguration, 'dealer.web.src.lib.dealer-workbench-sql.13', [
        MAIN_TABLE,
        filters,
      ]),
      parameters,
    };
  },

  planMonths(snapshotDate: string, customerCodes: string[]): SqlQuery {
    const { where, parameters } = scopedWhere(snapshotDate, undefined, customerCodes);
    return {
      sql: configuredSql(sqlConfiguration, 'dealer.web.src.lib.dealer-workbench-sql.14', [
        MAIN_TABLE,
        where,
      ]),
      parameters,
    };
  },

  dashboard(
    snapshotDate: string,
    planMonth: string,
    customerCodes: string[],
    inventoryStatDate?: string,
  ): SqlQuery {
    const { where, parameters } = scopedWhere(snapshotDate, planMonth, customerCodes);
    if (inventoryStatDate)
      parameters.inventoryStatDate = assertDate(
        inventoryStatDate,
        '库存统计日期',
        /^20\d{2}-\d{2}-\d{2}$/,
      );
    return {
      sql: inventoryStatDate
        ? configuredSql(sqlConfiguration, 'dealer.web.src.lib.dealer-workbench-sql.15', [
            MAIN_SELECT.replace(/\n  ([a-z_]+)/g, '\n  plan.$1'),
            MAIN_TABLE,
            where.replace(/\b(snapshot_date|plan_month|cust_code)\b/g, 'plan.$1'),
          ])
        : configuredSql(sqlConfiguration, 'dealer.web.src.lib.dealer-workbench-sql.16', [
            MAIN_SELECT,
            MAIN_TABLE,
            where,
          ]),
      parameters,
    };
  },

  companyProducts(
    snapshotDate: string,
    planMonth: string,
    customerCodes: string[],
    inventoryStatDate: string | undefined,
    filters: CompanyProductFilters = {},
    facets = false,
  ): SqlQuery {
    if (customerCodes.length !== 1) throw new Error('公司商品必须限定单个授权客户');
    const { parameters } = scopedWhere(snapshotDate, planMonth, customerCodes);
    if (inventoryStatDate)
      parameters.inventoryStatDate = assertDate(
        inventoryStatDate,
        '库存统计日期',
        /^20\d{2}-\d{2}-\d{2}$/,
      );
    const tagExpression = 'catalog.material_sales_status';
    const conditions = [
      configuredSql(sqlConfiguration, 'inline.source.dealer.web.src.lib.dealer-workbench-sql.ts.5'),
      configuredSql(sqlConfiguration, 'inline.source.dealer.web.src.lib.dealer-workbench-sql.ts.6'),
      "TRIM(catalog.material_code) <> ''",
    ];
    // Business-confirmed delisting; historical customer stock remains visible.
    conditions.push(
      configuredSql(sqlConfiguration, 'inline.source.dealer.web.src.lib.dealer-workbench-sql.ts.7'),
    );
    const joins = [
      configuredSql(sqlConfiguration, 'dealer.web.src.lib.dealer-workbench-sql.17', [MAIN_TABLE]),
    ];
    if (filters.search?.trim()) {
      parameters.catalogSearch = `%${filters.search
        .trim()
        .toLowerCase()
        .replace(/[\\%_]/g, '\\$&')}%`;
      conditions.push(
        configuredSql(
          sqlConfiguration,
          'inline.source.dealer.web.src.lib.dealer-workbench-sql.ts.8',
        ),
      );
    }
    if (filters.category) {
      parameters.catalogCategory = filters.category;
      conditions.push(
        configuredSql(
          sqlConfiguration,
          'inline.source.dealer.web.src.lib.dealer-workbench-sql.ts.9',
        ),
      );
    }
    if (filters.productTag) {
      parameters.catalogTag = filters.productTag;
      conditions.push(
        configuredSql(
          sqlConfiguration,
          'inline.source.dealer.web.src.lib.dealer-workbench-sql.ts.10',
          [tagExpression],
        ),
      );
    }
    if (filters.materialCodes) {
      if (!filters.materialCodes.length || filters.materialCodes.length > 100)
        throw new Error('商品核验每次需提供 1 至 100 个 SKU');
      const names = [...new Set(filters.materialCodes)].map((code, index) => {
        const name = `catalogCode${index}`;
        parameters[name] = assertIdentifier(code, '商品编码');
        return `:${name}`;
      });
      conditions.push(
        configuredSql(
          sqlConfiguration,
          'inline.source.dealer.web.src.lib.dealer-workbench-sql.ts.11',
          [names.join(', ')],
        ),
      );
    }
    if (filters.policyCode || filters.policySearch?.trim()) {
      if (filters.policyCode) {
        parameters.catalogPolicy = filters.policyCode;
        conditions.push(
          configuredSql(
            sqlConfiguration,
            'inline.source.dealer.web.src.lib.dealer-workbench-sql.ts.12',
          ),
        );
      }
      if (filters.policySearch?.trim()) {
        parameters.catalogPolicySearch = `%${filters.policySearch
          .trim()
          .toLowerCase()
          .replace(/[\\%_]/g, '\\$&')}%`;
        conditions.push(
          configuredSql(
            sqlConfiguration,
            'inline.source.dealer.web.src.lib.dealer-workbench-sql.ts.13',
          ),
        );
      }
      parameters.catalogToday = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Shanghai',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date());
      const scope = promotionScopeView();
      joins.push(
        configuredSql(sqlConfiguration, 'dealer.web.src.lib.dealer-workbench-sql.18', [scope]),
      );
      conditions.push(
        configuredSql(
          sqlConfiguration,
          'inline.source.dealer.web.src.lib.dealer-workbench-sql.ts.14',
        ),
        promotionScopeConditions('catalogToday'),
      );
    }
    const catalogValues: Record<string, string> = {
      snapshot_date: configuredSql(
        sqlConfiguration,
        'fragments.source.dealer.web.src.lib.dealer-workbench-sql.ts.3',
      ),
      plan_month: configuredSql(
        sqlConfiguration,
        'fragments.source.dealer.web.src.lib.dealer-workbench-sql.ts.4',
      ),
      cust_code: 'catalog.cust_code',
      cust_name: configuredSql(
        sqlConfiguration,
        'inline.source.dealer.web.src.lib.dealer-workbench-sql.ts.15',
      ),
      material_code: 'catalog.material_code',
      material_name: configuredSql(
        sqlConfiguration,
        'inline.source.dealer.web.src.lib.dealer-workbench-sql.ts.16',
      ),
    };
    // Aggregate duplicate cooperation/policy rows without multiplying stock or quantities.
    const columns = MAIN_SELECT.split(',')
      .slice(1)
      .map((column) => {
        const [name, , alias] = column.trim().split(/\s+/);
        return configuredSql(
          sqlConfiguration,
          'fragments.source.dealer.web.src.lib.dealer-workbench-sql.ts.5',
          [
            catalogValues[name] ||
              configuredSql(
                sqlConfiguration,
                'inline.source.dealer.web.src.lib.dealer-workbench-sql.ts.17',
              ) +
                name +
                ')',
            alias || name,
          ],
        );
      })
      .join(', ');
    const from = configuredSql(
      sqlConfiguration,
      'fragments.source.dealer.web.src.lib.dealer-workbench-sql.ts.6',
      [
        saleableMaterialTable(),
        joins.join('\n'),
        conditions.join(
          configuredSql(
            sqlConfiguration,
            'inline.source.dealer.web.src.lib.dealer-workbench-sql.ts.18',
          ),
        ),
      ],
    );
    return {
      sql: facets
        ? configuredSql(sqlConfiguration, 'dealer.web.src.lib.dealer-workbench-sql.19', [
            tagExpression,
            from,
            tagExpression,
          ])
        : configuredSql(sqlConfiguration, 'dealer.web.src.lib.dealer-workbench-sql.20', [
            columns,
            tagExpression,
            tagExpression,
            tagExpression,
            from,
          ]),
      parameters,
    };
  },

  summary(snapshotDate: string, planMonth: string, customerCodes: string[]): SqlQuery {
    const { where, parameters } = scopedWhere(snapshotDate, planMonth, customerCodes);
    return {
      sql: configuredSql(sqlConfiguration, 'dealer.web.src.lib.dealer-workbench-sql.21', [
        MAIN_TABLE,
        where,
      ]),
      parameters,
    };
  },

  customerSummaries(snapshotDate: string, planMonth: string, customerCodes: string[]): SqlQuery {
    const { where, parameters } = scopedWhere(snapshotDate, planMonth, customerCodes);
    return {
      sql: configuredSql(sqlConfiguration, 'dealer.web.src.lib.dealer-workbench-sql.22', [
        MAIN_TABLE,
        where,
      ]),
      parameters,
    };
  },

  categorySummaries(
    snapshotDate: string,
    planMonth: string,
    inventoryDailyStatDate: string,
    customerCodes: string[],
  ): SqlQuery {
    const { where, parameters } = scopedWhere(snapshotDate, planMonth, customerCodes);
    parameters.inventoryDailyStatDate = assertDate(
      inventoryDailyStatDate,
      '库存统计日期',
      /^20\d{2}-\d{2}-\d{2}$/,
    );
    const qualifiedWhere = where
      .replace(/\bsnapshot_date\b/g, 'plan.snapshot_date')
      .replace(/\bplan_month\b/g, 'plan.plan_month')
      .replace(/\bcust_code\b/g, 'plan.cust_code');
    return {
      sql: configuredSql(sqlConfiguration, 'dealer.web.src.lib.dealer-workbench-sql.23', [
        MAIN_TABLE,
        INVENTORY_DAILY_TABLE,
        qualifiedWhere,
      ]),
      parameters,
    };
  },

  shortageDetails(snapshotDate: string, planMonth: string, customerCodes: string[]): SqlQuery {
    const { where, parameters } = scopedWhere(snapshotDate, planMonth, customerCodes);
    return {
      sql: configuredSql(sqlConfiguration, 'dealer.web.src.lib.dealer-workbench-sql.24', [
        MAIN_SELECT,
        MAIN_TABLE,
        where,
      ]),
      parameters,
    };
  },

  result(scope: WorkbenchResultSqlScope): SqlQuery {
    const { where, parameters } = scopedWhere(
      scope.snapshotDate,
      scope.planMonth,
      scope.customerCodes,
      scope.materialCode,
    );
    const allowedOrderColumns = new Set([
      'pre_order_qty',
      'avg_stock_age',
      'simulation_need_amount',
      'budget_rate',
      'planned_qty_rate',
      'ship_qty',
      'in_transit_qty',
      'stock_qty',
      'target_inventory',
      'turnover_days',
    ]);
    if (!allowedOrderColumns.has(scope.orderColumn)) throw new Error('结果排序字段无效');
    if (scope.mode === 'detail') {
      return {
        sql: configuredSql(sqlConfiguration, 'dealer.web.src.lib.dealer-workbench-sql.25', [
          MAIN_SELECT,
          MAIN_TABLE,
          where,
          scope.orderColumn,
        ]),
        parameters,
      };
    }

    const byCustomer = scope.groupBy === '客户';
    const groupColumns = byCustomer
      ? 'snapshot_date, cust_code, cust_name'
      : 'snapshot_date, material_code, material_name';
    const identityColumns = byCustomer
      ? configuredSql(
          sqlConfiguration,
          'fragments.source.dealer.web.src.lib.dealer-workbench-sql.ts.7',
        )
      : configuredSql(
          sqlConfiguration,
          'fragments.source.dealer.web.src.lib.dealer-workbench-sql.ts.8',
        );
    const aggregateOrder = [
      'avg_stock_age',
      'turnover_days',
      'budget_rate',
      'planned_qty_rate',
    ].includes(scope.orderColumn)
      ? configuredSql(
          sqlConfiguration,
          'inline.source.dealer.web.src.lib.dealer-workbench-sql.ts.19',
          [scope.orderColumn],
        )
      : configuredSql(
          sqlConfiguration,
          'inline.source.dealer.web.src.lib.dealer-workbench-sql.ts.20',
          [scope.orderColumn],
        );
    return {
      sql: configuredSql(sqlConfiguration, 'dealer.web.src.lib.dealer-workbench-sql.26', [
        identityColumns,
        MAIN_TABLE,
        where,
        groupColumns,
        aggregateOrder,
      ]),
      parameters,
    };
  },

  aging(
    table: typeof WL_AGE_TABLE | typeof SIMULATED_AGE_TABLE,
    customerCode: string,
    materialCode: string,
  ): SqlQuery {
    return {
      sql: configuredSql(sqlConfiguration, 'dealer.web.src.lib.dealer-workbench-sql.27', [table]),
      parameters: {
        customerCode: assertIdentifier(customerCode, '客户编码'),
        materialCode: assertIdentifier(materialCode, 'SKU编码'),
      },
    };
  },
};

function queryOptions(options: GeaSqlRequestOptions, query: SqlQuery): GeaSqlRequestOptions {
  return { ...options, parameters: query.parameters };
}

export async function queryWorkbenchLatestSnapshot(
  customerCodes: string[] = [],
  options: GeaSqlRequestOptions = {},
) {
  const query = dealerWorkbenchSql.latestSnapshot(customerCodes);
  return toCubeRows(await executeGeaSql(query.sql, queryOptions(options, query)));
}

export async function queryWorkbenchSnapshotMonths(
  customerCodes: string[],
  options: GeaSqlRequestOptions = {},
) {
  const query = dealerWorkbenchSql.snapshotMonths(customerCodes);
  return toCubeRows(await executeGeaSql(query.sql, queryOptions(options, query)));
}

export async function queryWorkbenchLatestInventoryDailySnapshot(
  customerCodes: string[] = [],
  options: GeaSqlRequestOptions = {},
) {
  const query = dealerWorkbenchSql.latestInventoryDailySnapshot(customerCodes);
  return toInventoryDailyCubeRows(await executeGeaSql(query.sql, queryOptions(options, query)));
}

export async function queryWorkbenchInventoryDailyDetails(
  statDate: string,
  keys: InventoryDailyKey[],
  options: GeaSqlRequestOptions = {},
  exportCustomerCodes?: string[],
) {
  const query = dealerWorkbenchSql.inventoryDailyDetails(statDate, keys, exportCustomerCodes);
  const rows = await executeAllGeaSqlPages(query.sql, queryOptions(options, query));
  return toInventoryDailyCubeRows(rows);
}

export async function queryWorkbenchInventoryDailySummary(
  statDate: string,
  customerCodes: string[],
  options: GeaSqlRequestOptions = {},
) {
  const query = dealerWorkbenchSql.inventoryDailySummary(statDate, customerCodes);
  return (await executeGeaSql(query.sql, queryOptions(options, query)))[0] ?? {};
}

export async function queryWorkbenchInventoryDailyCustomerSummaries(
  statDate: string,
  customerCodes: string[],
  options: GeaSqlRequestOptions = {},
) {
  const query = dealerWorkbenchSql.inventoryDailyCustomerSummaries(statDate, customerCodes);
  return toInventoryDailyCubeRows(await executeGeaSql(query.sql, queryOptions(options, query)));
}

export async function queryWorkbenchCustomers(
  snapshotDate: string,
  search: string,
  exactCode: string,
  page: number,
  pageSize: number,
  options: GeaSqlRequestOptions = {},
) {
  const query = dealerWorkbenchSql.customers(snapshotDate, search, exactCode);
  const result = await executeGeaSqlPage(
    query.sql,
    page + 1,
    pageSize,
    queryOptions(options, query),
  );
  return { records: toCubeRows(result.rows), total: result.total };
}

export async function queryWorkbenchPlanMonths(
  snapshotDate: string,
  customerCodes: string[],
  options: GeaSqlRequestOptions = {},
) {
  const query = dealerWorkbenchSql.planMonths(snapshotDate, customerCodes);
  return toCubeRows(await executeGeaSql(query.sql, queryOptions(options, query)));
}

export async function queryWorkbenchDashboard(
  snapshotDate: string,
  planMonth: string,
  customerCodes: string[],
  page: number,
  pageSize: number,
  options: GeaSqlRequestOptions = {},
  inventoryDailySnapshotDate?: string | null,
  companyFilters?: CompanyProductFilters,
) {
  const dailyDate =
    inventoryDailySnapshotDate === undefined
      ? (await queryWorkbenchLatestInventoryDailySnapshot(customerCodes, options))[0]?.[
          'dealer_inventory_daily.stat_date'
        ]
      : inventoryDailySnapshotDate;
  const date = dailyDate ? String(dailyDate).slice(0, 10) : undefined;
  const query = companyFilters
    ? dealerWorkbenchSql.companyProducts(
        snapshotDate,
        planMonth,
        customerCodes,
        date,
        companyFilters,
      )
    : dealerWorkbenchSql.dashboard(snapshotDate, planMonth, customerCodes, date);
  if (options.exportTab === 'sku' || options.exportTab === 'expiry' || companyFilters?.download) {
    const records = toCubeRows(
      await executeAllGeaSqlPages(query.sql, queryOptions(options, query)),
    );
    return { records, total: records.length };
  }
  const result = await executeGeaSqlPage(
    query.sql,
    page + 1,
    pageSize,
    queryOptions(options, query),
  );
  return { records: toCubeRows(result.rows), total: result.total };
}

export async function queryWorkbenchSummary(
  snapshotDate: string,
  planMonth: string,
  customerCodes: string[],
  options: GeaSqlRequestOptions = {},
) {
  const query = dealerWorkbenchSql.summary(snapshotDate, planMonth, customerCodes);
  return (await executeGeaSql(query.sql, queryOptions(options, query)))[0] ?? {};
}

export async function queryWorkbenchCustomerSummaries(
  snapshotDate: string,
  planMonth: string,
  customerCodes: string[],
  page: number,
  pageSize: number,
  options: GeaSqlRequestOptions = {},
) {
  const query = dealerWorkbenchSql.customerSummaries(snapshotDate, planMonth, customerCodes);
  if (options.exportTab === 'customer') {
    const records = toCubeRows(
      await executeAllGeaSqlPages(query.sql, queryOptions(options, query)),
    );
    return { records, total: records.length };
  }
  const result = await executeGeaSqlPage(
    query.sql,
    page + 1,
    pageSize,
    queryOptions(options, query),
  );
  return { records: toCubeRows(result.rows), total: result.total };
}

export async function queryWorkbenchCategorySummaries(
  snapshotDate: string,
  planMonth: string,
  inventoryDailyStatDate: string,
  customerCodes: string[],
  options: GeaSqlRequestOptions = {},
) {
  const query = dealerWorkbenchSql.categorySummaries(
    snapshotDate,
    planMonth,
    inventoryDailyStatDate,
    customerCodes,
  );
  return toCubeRows(await executeAllGeaSqlPages(query.sql, queryOptions(options, query)));
}

export async function queryWorkbenchShortageDetails(
  snapshotDate: string,
  planMonth: string,
  customerCodes: string[],
  page: number,
  pageSize: number,
  options: GeaSqlRequestOptions = {},
) {
  const query = dealerWorkbenchSql.shortageDetails(snapshotDate, planMonth, customerCodes);
  if (options.exportTab === 'shortage') {
    const records = toCubeRows(
      await executeAllGeaSqlPages(query.sql, queryOptions(options, query)),
    );
    return { records, total: records.length };
  }
  const result = await executeGeaSqlPage(
    query.sql,
    page + 1,
    pageSize,
    queryOptions(options, query),
  );
  return { records: toCubeRows(result.rows), total: result.total };
}

export async function queryWorkbenchAging(
  source: 'wl' | 'simulated',
  customerCode: string,
  materialCode: string,
  options: GeaSqlRequestOptions = {},
) {
  const table = source === 'wl' ? WL_AGE_TABLE : SIMULATED_AGE_TABLE;
  const prefix = source === 'wl' ? 'dealer_wl_stock_age' : 'dealer_simulated_stock_age';
  const query = dealerWorkbenchSql.aging(table, customerCode, materialCode);
  const rows = await executeAllGeaSqlPages(query.sql, queryOptions(options, query));
  return rows.map((row) =>
    Object.fromEntries(Object.entries(row).map(([key, value]) => [`${prefix}.${key}`, value])),
  );
}

export async function queryWorkbenchSqlPage(
  query: SqlQuery,
  page: number,
  pageSize: number,
  options: GeaSqlRequestOptions = {},
) {
  const result = await executeGeaSqlPage(
    query.sql,
    page + 1,
    pageSize,
    queryOptions(options, query),
  );
  return { ...result, records: toCubeRows(result.rows) };
}

export async function queryAllWorkbenchSqlRows(
  query: SqlQuery,
  options: GeaSqlRequestOptions = {},
) {
  return toCubeRows(await executeAllGeaSqlPages(query.sql, queryOptions(options, query)));
}

// 客户编码必须来自已经完成权限校验的工作台范围。
export async function queryWorkbenchCustomerCars(
  customerCode: string,
  options: GeaSqlRequestOptions = {},
) {
  if (!customerCode.trim()) return [];
  const table = configuredResourceName('customerCar');
  return executeAllGeaSqlPages(
    configuredSql(sqlConfiguration, 'dealer.web.src.lib.dealer-workbench-sql.28', [table]),
    { ...options, parameters: { customerCode } },
  );
}

/** 读取已授权客户的收货地；不读取联系人及电话，不将其当作提货点。 */
export async function queryWorkbenchCustomerReceives(
  customerCode: string,
  options: GeaSqlRequestOptions = {},
) {
  if (!customerCode.trim()) return [];
  const table = configuredResourceName('customerReceive');
  return executeAllGeaSqlPages(
    configuredSql(sqlConfiguration, 'dealer.web.src.lib.dealer-workbench-sql.29', [table]),
    { ...options, parameters: { customerCode } },
  );
}

/** Exact SKU authorization before a DMS read; use the same GEA row-level scope as the catalog. */
export async function queryWorkbenchFulfillmentMaterials(
  customerCode: string,
  materialCodes: string[],
  options: GeaSqlRequestOptions = {},
) {
  if (!materialCodes.length || materialCodes.length > 500) throw new Error('商品范围无效');
  const parameters: GeaSqlParameters = {
    customerCode: assertIdentifier(customerCode, '客户编码'),
  };
  const names = materialCodes.map((code, i) => {
    parameters[`material${i}`] = assertIdentifier(code, '商品编码');
    return `:material${i}`;
  });
  return executeAllGeaSqlPages(
    configuredSql(sqlConfiguration, 'dealer.web.src.lib.dealer-workbench-sql.30', [
      saleableMaterialTable(),
      names.join(','),
    ]),
    { ...options, parameters },
  );
}

export type CustomerPickupPoint = {
  code: string;
  name: string;
  isDefault: boolean;
  isSecondary: boolean;
  matched: boolean;
  activeFlag: string;
  available: boolean;
  factoryCode: string;
  companyCode: string;
  type: string;
  baseName: string;
};

/** Read only within the already authorized customer. Preserve unavailable records for UI explanations. */
export async function queryWorkbenchCustomerPickupPoints(
  customerCode: string,
  options: GeaSqlRequestOptions = {},
): Promise<CustomerPickupPoint[]> {
  if (!customerCode.trim()) return [];
  const table = configuredResourceName('customerPickup');
  const rows = await executeAllGeaSqlPages(
    configuredSql(sqlConfiguration, 'dealer.web.src.lib.dealer-workbench-sql.31', [table]),
    { ...options, parameters: { customerCode } },
  );
  const seen = new Set<string>();
  return rows.map((row) => {
    const text = (value: unknown) => (value == null ? '' : String(value).trim());
    const code = text(row.warehouse_group_id);
    const flag = (value: unknown) =>
      value === true || value === 'true'
        ? true
        : value === false || value === 'false'
          ? false
          : null;
    if (
      text(row.cust_code) !== customerCode ||
      !code ||
      seen.has(code) ||
      [row.is_default_shipping, row.is_secondary_shipping, row.is_pickup_point_matched].some(
        (value) => flag(value) === null,
      )
    ) {
      throw new Error('提货点客户范围、编码或状态异常');
    }
    seen.add(code);
    const matched = flag(row.is_pickup_point_matched) === true,
      activeFlag = text(row.active_flag);
    return {
      code,
      name: text(row.warehousegroup_name),
      isDefault: flag(row.is_default_shipping) === true,
      isSecondary: flag(row.is_secondary_shipping) === true,
      matched,
      activeFlag,
      available: matched && activeFlag === 'Y',
      factoryCode: text(row.factory_code),
      companyCode: text(row.company_code),
      type: text(row.warehouse_group_type),
      baseName: text(row.base_name),
    };
  });
}

/** Compatibility entry point: defaults now come from customer master data, never order history. */
export async function queryWorkbenchDefaultPickup(
  customerCode: string,
  options: GeaSqlRequestOptions = {},
) {
  const points = await queryWorkbenchCustomerPickupPoints(customerCode, options);
  return points
    .filter((point) => point.available && point.isDefault)
    .map((point) => ({
      pickup_point_default: point.name,
      pickup_code: point.code,
    }));
}

/** Customer company code supplies SAP VKORG; pickup/factory stay paired with that source row. */
export async function queryWorkbenchSapSalesArea(
  customerCode: string,
  docType: string,
  options: GeaSqlRequestOptions = {},
) {
  if (!customerCode.trim() || !docType.trim()) return [];
  const points = await queryWorkbenchCustomerPickupPoints(customerCode, options);
  return points
    .filter((point) => point.available)
    .map((point) => ({
      cust_code: customerCode,
      vsbed: point.code,
      werks: point.factoryCode,
      vkorg: point.companyCode,
      vtweg: '',
      spart: '',
      doc_type: docType,
    }));
}

/** customerCode 必须来自已授权的单客户工作台；不能查询全库政策。 */
export async function queryWorkbenchPromotionPolicies(
  customerCode: string,
  businessDate: string,
  options: GeaSqlRequestOptions = {},
) {
  if (!customerCode.trim()) return [];
  const scope = promotionScopeView();
  return executeAllGeaSqlPages(
    configuredSql(sqlConfiguration, 'dealer.web.src.lib.dealer-workbench-sql.32', [
      process.env.DEALER_WORKBENCH_POLICY_EXCLUSIVE_ENABLED === 'true'
        ? ', s.is_customer_exclusive'
        : '',
      scope,
      promotionScopeConditions('businessDate'),
    ]),
    {
      ...options,
      parameters: { customerCode, businessDate, scopeType: 'cust' },
    },
  );
}

/** Resolve the chat allowlist using the same GEA row permissions. */
export async function queryAuthorizedDealerChatCustomers(
  exactCode = '',
  options: GeaSqlRequestOptions = {},
): Promise<string[]> {
  const parameters: GeaSqlParameters = {};
  const predicate = exactCode ? customerPredicate([exactCode], parameters) : '';
  const rows = await executeAllGeaSqlPages(
    configuredSql(sqlConfiguration, 'dealer.web.src.lib.dealer-workbench-sql.33', [
      MAIN_TABLE,
      predicate,
    ]),
    { ...options, parameters, pageConcurrency: 3 },
  );
  // GEA owns the business identifiers, including virtual dealers. Validate the
  // response shape only; never infer account permissions from an identifier's format.
  const codes = rows.map((row) => {
    if (typeof row.cust_code !== 'string' || !row.cust_code.trim()) {
      throw new Error('GEA 返回的客户编码字段缺失或为空，无法确认对话权限范围');
    }
    return row.cust_code;
  });
  return [...new Set(codes)];
}

export async function queryWorkbenchCompanyProductFacets(
  snapshotDate: string,
  planMonth: string,
  customerCode: string,
  options: GeaSqlRequestOptions = {},
) {
  const dailyDate = (
    await queryWorkbenchLatestInventoryDailySnapshot([customerCode], options)
  )[0]?.['dealer_inventory_daily.stat_date'];
  const query = dealerWorkbenchSql.companyProducts(
    snapshotDate,
    planMonth,
    [customerCode],
    dailyDate ? String(dailyDate).slice(0, 10) : undefined,
    {},
    true,
  );
  const rows = await executeAllGeaSqlPages(query.sql, queryOptions(options, query));
  return {
    categories: [...new Set(rows.map((row) => String(row.product_categ_name || '-')))],
    tags: [...new Set(rows.map((row) => String(row.product_tag || '-')))],
  };
}

/** Count the same customer-saleable set used by catalog queries, without reading inventory as a catalog. */
export async function queryWorkbenchCompanyProductTotal(
  customerCode: string,
  options: GeaSqlRequestOptions = {},
) {
  const rows = await executeGeaSql(
    configuredSql(sqlConfiguration, 'dealer.web.src.lib.dealer-workbench-sql.34', [
      saleableMaterialTable(),
    ]),
    {
      ...options,
      parameters: { customerCode: assertIdentifier(customerCode, '客户编码') },
    },
  );
  const raw = rows[0]?.product_total;
  const total = raw == null ? NaN : Number(raw);
  if (!Number.isSafeInteger(total) || total < 0) throw new Error('可售商品总数无效');
  return total;
}
