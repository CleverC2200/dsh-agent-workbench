/** Display contracts copied from the authored plugins. SQL contracts live in sql.config.json.
 * Missing original columns stay in place; diagnostic/source columns are never appended here.
 */
export type BusinessPresentation = { title: string; columns: any[]; filters?: string[] };
const column = (field: string, label: string, secondary?: string[]) => ({
  field,
  label,
  secondary,
});
const present = (
  config: any,
  id: string,
  title: string,
  fields: Array<string | [string, string, string[]?]>,
  filters?: string[],
): BusinessPresentation => {
  const source = config.sourceViews.views.find((v: any) => v.id === id);
  return {
    title,
    filters,
    columns: fields.map((item) => {
      const [field, label, secondary] =
        typeof item === 'string' ? [item, undefined, undefined] : item;
      const current = source?.columns.find((c: any) => c.field === field);
      return { ...current, ...column(field, label ?? current?.label ?? '-', secondary) };
    }),
  };
};
export function originalFcView(config: any, tab: string) {
  if (tab === 'replenishment')
    return present(
      config,
      tab,
      '补货确认',
      [
        ['sku', '产品编码'],
        'material_name',
        'inventory_qty',
        'available_qty',
        ['missing_preparingQty', '当前未备单需求'],
        'missing_shortageQty',
        'historical_turnover_days',
        'target_inventory_qty',
        'remaining_outbound_qty',
        'rolling_ship_daily',
        'last_month_actual_qty',
        'current_day_avg_qty',
        'open_transfer_reported_qty',
        'missing_expectedMonthEndInventoryQty',
        'missing_currentRemainingTransferQty',
        'recommended_qty',
        'missing_actualQty',
        'category',
        'material_group',
        ['forecast_turnover_days', '展望周转天数'],
        ['month_out_plan', '本月出货计划'],
        'planned_daily_shipment',
        'month_ship_positive',
        ['warehouse_month_transfer_plan', '本月调拨计划'],
        'missing_transferredQty',
        'missing_transferReceivedQty',
        ['preparing', '当前调拨备单'],
        ['in_transit', '当前调拨在途'],
        'missing_nextOutboundQty',
        'missing_nextDailyOutboundQty',
        'missing_nextTransferQty',
        ['daily_plan', '展望30日日均出货'],
        'cycle_days',
        ['safety_days', '目标覆盖天数'],
        ['target_gap_qty', '安全库存差异量'],
        'urgent',
        'missing_reason',
        'plan_source',
        'calculation_status',
      ],
      ['warehouse_code', 'sku'],
    );
  if (tab === 'orders')
    return present(
      config,
      'orders',
      '当前订单',
      [
        'from_order',
        'customer_name',
        'order_date',
        ['missing_sku_count', 'SKU个数'],
        'demand',
        ['source_occupied', '已占用'],
        'missing_current_remaining',
        'missing_order_status',
      ],
      ['pickup_code', 'sku'],
    );
  if (tab === 'structure')
    return present(
      config,
      'inventory',
      '货龄结构',
      [
        'material_code',
        'material_name',
        'product_categ_name',
        'material_group_name',
        'total_qty',
        'missing_age_5',
        ['max_age', '最大货龄（天）'],
        ...Array.from({ length: 8 }, (_, i) => `missing_age_${i + 6}`),
      ],
      ['base', 'material_code'],
    );
  if (tab === 'plan')
    return present(
      config,
      'plan',
      '分仓计划',
      [
        ['sku', 'SKU编码'],
        'material_name',
        'missing_current_out',
        'missing_current_transfer',
        'missing_current_source',
        'missing_next_out',
        'missing_next_transfer',
        'missing_next_source',
        'missing_plan_status',
        'last_month_actual_qty',
        'current_day_avg_qty',
      ],
      ['warehouse_code', 'sku'],
    );
  return present(
    config,
    'base-resources',
    '基地资源',
    [
      'base',
      'missing_transit',
      ['known_available', '可用库存（件）'],
      ...Array.from({ length: 7 }, (_, i) => `missing_production_${i}`),
      'missing_production_total',
    ],
    ['base', 'sku'],
  );
}
export function originalAqkcAgeView(config: any) {
  return present(
    config,
    'age-structure',
    '货龄结构',
    [
      ['belong_base', '对象'],
      ['missing_warning', '预警标志'],
      ['total_qty', '当前库存'],
      ['average_age', '平均货龄'],
      ['max_age', '最大货龄'],
      ['missing_age0_30', '0-30天量/占比'],
      ['missing_age31_40', '31-40天量/占比'],
      ['missing_age41_60', '41-60天量/占比'],
      ['missing_age60', '60+天量/占比'],
      ['missing_future7', '未来7日预计超龄'],
      ['missing_future14', '未来14日预计超龄'],
      ['missing_movement', '日均动销'],
      ['sku_count', 'SKU个数'],
    ],
    [],
  );
}
export function originalQllView(config: any, tab: string) {
  if (tab === 'aging')
    return present(
      config,
      'aging',
      '库存库龄',
      [
        'warehouse_type',
        ['average_age', '平均货龄（天）'],
        ['max_age', '最大货龄（天）'],
        'missing_expired',
        'missing_age60_89',
        'missing_age90_119',
        'missing_future7',
        'missing_future14',
      ],
      ['base', 'material_code'],
    );
  if (tab === 'shortage')
    return present(
      config,
      'fulfillment-path',
      '订单缺口',
      [
        'pickup_type',
        'demand',
        'shortage',
        'fulfillment_rate',
        'missing_available',
        'missing_collaborative',
        'affected_from_order_count',
        'missing_pending',
        'missing_action',
        'missing_owner',
      ],
      ['base', 'sku'],
    );
  const base = originalQllLayerView(config, 'base', false);
  return {
    ...base,
    title: tab === 'structure' ? '组织结构' : '品类结构',
    columns: base.columns.map((c: any, i: number) =>
      i === 0
        ? {
            ...c,
            field: tab === 'category' ? 'category' : 'base',
            valueField: tab === 'category' ? 'category' : 'base',
            label: tab === 'category' ? '品类 / 层级 / 组织 / SKU' : '组织 / 品类 / SKU',
            secondary: [tab === 'category' ? 'base' : 'category', 'sku'],
          }
        : c,
    ),
  };
}
export function originalDealerView(config: any, id: string) {
  if (id === 'customer-stock')
    return present(
      config,
      id,
      '客户库存',
      [
        ['customer_name', '名称 / 编码', ['customer']],
        ['inventory', '库存'],
        'missing_nearExpiryStock',
        ['normal_inventory', '正常库存'],
        ['inventory_value', '库存价值'],
        ['in_transit', '在途'],
        'missing_targetInventory',
      ],
      ['search'],
    );
  if (id === 'category-stock')
    return present(
      config,
      id,
      '品类库存',
      [
        'category',
        ['row_count', 'SKU数'],
        ['inventory', '库存'],
        ['in_transit', '在途'],
        ['normal_inventory', '正常库存'],
        ['sales30', '近30日销量'],
        ['inventory_value', '库存价值'],
        'missing_nearExpiryStock',
        'missing_targetInventory',
      ],
      ['category', 'search'],
    );
  if (['sku-stock', 'shortage-stock', 'expiry'].includes(id))
    return present(
      config,
      id,
      {
        'sku-stock': 'SKU库存',
        'shortage-stock': '缺货库存',
        expiry: '临期库存',
      }[id]!,
      [
        ['material_name', 'SKU', ['sku', 'customer_name']],
        ['category', '品类 / 产品系列', ['product_series']],
        ['tag', '标签 / 规格', ['specification']],
        ['inventory', '在仓库存'],
        ['in_transit', '在途'],
        ['sales7', '近7日销量'],
        ['sales30', '近30日销量'],
        ['sales30_amount', '近30日销售额'],
        ['cif_price', '统一到岸价'],
        ['analysis_avg_stock_age', '平均货龄'],
        ['analysis_target_inventory', '目标库存'],
        ['normal_inventory', '正常库存'],
        'missing_nearExpiryStock',
        ['inventory_value', '库存金额'],
        ['stat_date', '库存日期'],
        'missing_suggestedStockQty',
        ['data_quality', '依据 / 缺失'],
      ],
      ['category', 'search'],
    );
  if (id === 'catalog')
    return present(
      config,
      id,
      '公司商品',
      [
        ['customer', '客户'],
        'sku',
        ['material_name', '商品'],
        'category',
        ['specification', '规格'],
        ['missing_product_tag', '标签'],
      ],
      ['search', 'category'],
    );
  if (id === 'policies')
    return present(
      config,
      id,
      '本月政策',
      [
        ['promotion_name', '政策'],
        ['promotion_type', '类型'],
        ['promotion_start_date', '起始日'],
        ['promotion_end_date', '截止日'],
        ['missing_policy_rule', '规则'],
        ['pickup_point_name', '提货点'],
        ['remaining_quantity', '可用数量'],
      ],
      ['sku'],
    );
  return present(
    config,
    id,
    '建议订单',
    ['sku', 'inventory', 'demand', 'suggested', 'quantity'],
    [],
  );
}

/** Organization nodes keep base, branch and channel details in the authored hierarchy. */
export function originalQllLayerView(
  config: any,
  layer: string,
  channel = false,
): BusinessPresentation {
  const dealer = layer === 'customer',
    base = layer === 'base';
  const id = base
    ? 'organization'
    : dealer
      ? 'channel-sku'
      : config.sourceViews.views.some((v: any) => v.id === 'branch-structure')
        ? 'branch-structure'
        : 'branch-stock';
  const source = config.sourceViews.views.find((v: any) => v.id === id);
  const missing = (field: string, label: string) => ({ field, label, unavailable: true });
  const col = (field: string, valueField: string, label: string, secondary?: string[]) => ({
    ...source.columns.find((c: any) => c.field === valueField),
    field,
    valueField: source.columns.find((c: any) => c.field === valueField)?.valueField ?? valueField,
    label,
    secondary,
  });
  const zero = (field: string, label: string) => ({ field, label, context: 'literal', value: 0 });
  const inventory = base ? 'known_inventory' : dealer ? 'inventory' : 'total_qty';
  return {
    title: base ? '基地' : dealer ? '渠道' : '分仓',
    filters: base
      ? ['base', 'category', 'sku']
      : dealer
        ? ['category', 'search']
        : ['base', 'material_code'],
    columns: [
      col(
        base ? 'base' : dealer ? 'customer_name' : 'warehouse_name',
        base ? 'base' : dealer ? 'customer_name' : 'warehouse_name',
        '组织 / 品类 / SKU',
        base
          ? ['category', 'sku']
          : dealer
            ? ['material_name', 'sku']
            : ['material_name', 'material_code'],
      ),
      base
        ? col('missing_business_status', 'missing_judgment', '经营状态')
        : dealer
          ? missing('missing_business_status', '经营状态')
          : col('missing_business_status', 'warning', '经营状态'),
      dealer
        ? zero('company_inventory', '公司实物库存（件）')
        : col('company_inventory', inventory, '公司实物库存（件）'),
      base
        ? col('base_inventory', inventory, '基地库存（件）')
        : zero('base_inventory', '基地库存（件）'),
      !base && !dealer
        ? col('branch_inventory', inventory, '分仓库存（件）')
        : zero('branch_inventory', '分仓库存（件）'),
      ...(channel
        ? [
            dealer
              ? col('customer_inventory', inventory, '渠道日快照库存（箱）')
              : zero('customer_inventory', '渠道日快照库存（箱）'),
          ]
        : []),
      base
        ? col('company_gap', 'matched_target_gap', '公司目标差额（件）')
        : missing('company_gap', '公司目标差额（件）'),
      base
        ? col('turnover', 'matched_stock_days', '周转（天）')
        : dealer
          ? col('turnover', 'stock_days', '周转（天）')
          : col('turnover', 'historical_turnover', '周转（天）'),
      dealer
        ? col('average_age', 'analysis_avg_stock_age', '平均货龄（天）')
        : col('average_age', 'average_age', '平均货龄（天）'),
      base
        ? col('big_date', 'known_over60', '大日期库存（件）')
        : !dealer
          ? col('big_date', 'overaged_qty', '大日期库存（件）')
          : missing('big_date', dealer ? '大日期库存（箱）' : '大日期库存（件）'),
      base
        ? col('target_turnover', 'matched_target_days', '目标周转（天）')
        : missing('target_turnover', '目标周转（天）'),
      col('source_date', base ? 'stock_date' : 'stat_date', '数据日期'),
    ],
  };
}
