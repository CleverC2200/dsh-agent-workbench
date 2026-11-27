const partial = (source, reason) => ({
  status: '已接（按覆盖范围显示）',
  source,
  reason,
  owner: '开发已完成；数据方核对未覆盖记录',
});
const pending = (source, reason) => ({
  status: '待业务确认',
  source,
  reason,
  owner: '业务方确认口径；数据方提供对应键、日期或版本',
});
const connected = (source, reason) => ({ status: '已接', source, reason, owner: '开发已完成' });
const missingData = (source, reason) => ({
  status: '缺数据或覆盖不足',
  source,
  reason,
  owner: '数据方补字段或修复关联；开发按现有口径接入',
});
export function operationDisposition({ kind, key, title, host, context }) {
  if (key === 'correctionPlan')
    return connected('plan.base.adjusted_plan', '纠偏计划按当前销售口径源完整汇总');
  if (key === 'rate90above.qty')
    return partial('orders.facts', '已知高满足率订单量；全量未完整时不计算全量比例');
  if (['rate90above.qtyRatio', 'rate90above.orderRatio'].includes(key))
    return missingData(
      'orders.facts',
      '完整分母尚有缺失；当前仅给出可判定订单子集，不能当全量比例',
    );
  if (
    [
      'natOrderProg',
      'natOrderShould',
      'natOpenProg',
      'natOpenShould',
      'natShipShould',
      'orderShould',
      'orderGap',
      'promiseOverdue',
      'lackFactor',
      'salesFactor',
      'ctrlOpen',
      'normalOrder',
    ].includes(key)
  )
    return pending('现有计划及执行字段', '月评估分母、应达曲线、承诺时间或四类原因规则未确认');
  if (key === 'fullLack')
    return pending(
      '缺货源 inventory_gap/final_gap 与需求日期',
      '全量缺货范围与日期未确认，不以最终缺货直接替代',
    );
  if (key === 'reason')
    return partial(
      'orders.facts.timeout_code / timeout_name',
      '原始中文原因已接；无名称但有编码显示编码，多原因逐一列出，不自行映射四类因素',
    );
  if (context === 'drillWh')
    return pending(
      'agents_scm_order_trace_final_di 的出库创建/备单完成时间',
      '原11日开单事件未确认，不能从当前状态伪造历史序列',
    );
  if (['水饺', '汤圆', '馄饨', '面点', '预制食材', '火锅料', '休闲', '粽子'].includes(key))
    return partial(
      'orders.facts.product_item / 既有订单数量归并',
      '品项唯一且数量可判定时汇总；分类缺失或冲突时不把未识别品项归为0',
    );
  if ((key ?? '').startsWith('satisfy'))
    return pending('库存、排产、ASN、调拨源', '未来可满足量需要供应可用时间与逐订单分配规则');
  if (key === 'openUnship')
    return partial('orders.facts', '按既有执行阶段与单位/拆单校验，按基地/SKU去重汇总');
  if (kind === 'chart') {
    const blocked = {
      c_reg_prog:
        '区域未开原因构成饼图依赖缺货/销售/管控/正常四类正式映射，不能用发货或下单数据触发并把未知填0',
      c_ov_reason: '缺货/销售/管控/正常四类映射未确认',
      c_ov_gap: '评估计划与正式应达曲线未确认',
      c_base_unopen: '日期分类和承诺时间定义未确认',
      c_reg_unopen: '四类原因映射未确认',
      c_reg_rate: '未到期/超期/承诺超期数量口径未确认',
      c_un_rsn: '按候选分类不能复现全部原汇总，缺正式分类映射',
      c_un_rsn2: '候选客户因素分类尚不能逐组对平',
      c_un_cust: '客户因素分类未确认，其余直接原因已在表中接入',
      wd_trend: '开单业务事件未确认，不能用当前订单状态反推历史开单序列',
    };
    if (blocked[host]) return pending('现有执行、追踪、计划表及原HTML', blocked[host]);
    const sources = {
      c_ov_funnel: 'plan.base',
      c_ov_age: 'orders.age / orders.facts',
      c_base_prog: 'plan.base',
      c_base_rate: 'orders.facts',
      c_un_pk: 'orders.facts',
      c_un_org: 'orders.facts',
      c_un_time: 'orders.facts',
      c_un_item: 'orders.facts',
      c_rate_dist: 'orders.facts',
      c_item_ship: 'plan.item / stock.sku',
      c_item_unopen: 'orders.facts',
      c_short_top: 'shortage.sku',
      sd_prod: 'production.future / product.unit.factors',
      sd_kpi: 'stock.sku / shortage.sku / orders.facts / supply.* / production.future',
      c_wh_stack: 'orders.facts',
      c_wh_pie: 'orders.facts',
    };
    if (sources[host])
      return partial(
        sources[host],
        '仅展示满足本图数据条件的真实值；未知不补0。TOP排序、饼图比例及全量堆叠在输入不完整时保持未知；独立已知序列保留显示。',
      );
    throw Error('UNCLASSIFIED_CHART:' + host);
  }
  if (kind === 'card') {
    if (/月度计划评估/.test(title))
      return pending(
        'agents_sales_plan_demand_m.current_month_estimate / agents_scm_demand_sales_f',
        '有候选预估量，但是否等于评估计划及有效版本未确认',
      );
    if (/自然月下单|自然月开单/.test(title))
      return pending(
        'agents_scm_dws_scm_cust_plan_exe_di / agents_scm_order_trace_final_di / 执行表',
        '有下单、出库创建、备单完成等字段；自然月归属与采用事件未确认',
      );
    if (/超期未开/.test(title))
      return pending(
        '执行表 needbillingdate / lastbillingdate',
        '日期字段存在；不能把现有订单预警张数当原卡片数量或承诺超期数量',
      );
    if (/5日内/.test(title))
      return pending(
        'shortage.sku / orders.facts',
        '需明确未来5日需求日期、去重及完整关联，不用最终缺货替代',
      );
    if (/排产后/.test(title))
      return pending(
        'production.future / supply.oem.stock / supply.branch / ASN',
        '供应可用日期、收发方向与逐订单分配未确认',
      );
    if (/自然月发货/.test(title))
      return connected(
        'plan.base.shipped（统计月实际发货源）',
        '已接统计月源值；自然月事件归属如与源统计月份不同，需另确认。',
      );
    if (/未开订单合计/.test(title))
      return partial('stock.sku.unopened_qty', '沿现有库存页未开量与快照合同');
    if (/待发货/.test(title))
      return partial(
        'orders.facts → 既有数量与拆单计算',
        '显示数量完整仓点小计及覆盖；全量未知时不冒充全量',
      );
    if (/90%/.test(title))
      return partial('orders.facts → 原占用/未开量', '可判定订单子集的数量和张数；全量比例仍未知');
    if (/缺货|周转/.test(title))
      return partial(
        'shortage.sku / stock.sku / production.future',
        '来源关联小计；周转17天按可确认可发货天数与今日/次日排产筛选；不是全量供应补位计算',
      );
    throw Error('UNCLASSIFIED_CARD:' + title);
  }
  const identity = [
    'base',
    'name',
    'code',
    'pickup',
    'region',
    'province',
    'group',
    'custName',
    'custType',
    'attr',
    'date',
    'key',
    'item',
    'owner',
    'skus',
  ];
  if (identity.includes(key))
    return partial(
      '执行表 / stock.sku / sku.attributes / product.attributes / product.master.attributes / plan.*',
      '现有维度优先；授权产品字典按SKU唯一值补品项、系列，主字典未覆盖的SKU再用产销存主数据；多值或执行属性冲突不覆盖。SKU数为当前数据行范围。',
    );
  if (
    ['planEval', 'natShipProg', 'notDue', 'overdue'].includes(key) ||
    (['plan', 'shipProg'].includes(key) && context === 'renderRegion')
  )
    return pending('计划表、执行表候选字段', '月度评估计划、进度分母或日期分类规则未确认');
  if (
    ['natOpen', 'open', 'openRate', 'today', 'maxShip', 'avgShip', 'maxOpen', 'avgOpen'].includes(
      key,
    )
  )
    return pending(
      '追踪表开单事件 / 发货日表',
      '开单事件、自然日边界与单位未确认；今日发货还需今天的源数据，不能拿T-1替代；原发货近似列不能冒充实际发货',
    );
  if (['customer', 'other'].includes(key))
    return pending(
      'timeout_code / timeout_name',
      '已有原始中文原因；候选分组不能逐组复现原汇总，不能凭名称猜正式分类',
    );
  if (
    [
      'lack5d',
      'lackOrders5d',
      'd5Qty',
      'd5Skus',
      'afterQty',
      'afterSkus',
      'waitDc',
      'odmInTransit',
      'turnLack',
    ].includes(key)
  )
    return pending(
      '缺货、调拨备单、ASN、排产源均有候选数据',
      '未来需求/供应日期、逐订单分配、状态、标签阈值或业务等价关系未确认，不能直接扣减或替代',
    );
  if (key === 'planDms')
    return connected(
      'plan.base / plan.region.initial_plan',
      'DMS初始计划已核对，按当前筛选与月标签读取',
    );
  if (['orderTotal', 'order', 'orderRate'].includes(key))
    return partial(
      'plan.base / plan.region / plan.item',
      '完整数量显示全量；有缺值时显示已知小计与覆盖。品项报单进度仅在分子完整、纠偏计划>0时计算。',
    );
  if (
    [
      'plan',
      'dplan',
      'planSalesMonth',
      'planDcMonth',
      'ship',
      'natShip',
      'salesShip',
      'dcShip',
      'shipSales',
      'shipDc',
      'dship',
      'shipRate',
      'dRate',
      'sShipRate',
      'sDcRate',
      'rate',
    ].includes(key)
  )
    return partial(
      'plan.* / stock.sku / orders.facts',
      '沿当前各页面源合同；下钻字段别名与比率保护已补齐，缺分子或分母不产生0/NaN，计划与发货不跨未确认来源拼接。',
    );
  if (
    [
      'unopened',
      'unopen',
      'pending',
      'pendingShip',
      'openPending',
      'openedUnassigned',
      'assignedNotArrive',
      'loading',
      'totalQty',
      'occupied',
      'unprepared',
      'qty',
      'orders',
      'd3',
      'd3_6',
      'd6_10',
      'd10p',
      't',
    ].includes(key)
  )
    return partial(
      'orders.facts → computeOrderMetrics / stock.sku',
      '完整读取后按原单位、拆单、组织、仓点与账龄汇总；缺值和跨仓冲突保留未知',
    );
  if (['dealer', 'direct', 'transfer', 'dc', 'export'].includes(key))
    return partial(
      'orders.facts.cust_type / plant_flag',
      '五类映射与原HTML 100组数量和去重订单数对平；未知类型不归类',
    );
  if (['lack', 'notdue', 'unmarked'].includes(key))
    return partial(
      context === 'drillItem' ? 'shortage.sku' : 'orders.facts.timeout_code / timeout_name',
      context === 'drillItem'
        ? '已关联缺口小计明确标已知'
        : '直接原因已与原HTML 48组数量与张数对平；同单混合原因、缺中文映射或数量不完整保留未知，不等同扣库存缺口',
    );
  if (['rate95', 'rate90_95', 'rate80_90', 'rate70_80', 'rateBelow70', 'unallocated'].includes(key))
    return partial(
      'orders.facts → 原整单占用/未开量',
      '完整可判定分组才计算区间及比例；真实0显示0，未知不转0；全量不完整时仅已知卡片显示子集',
    );
  if (['stock41_60', 'stock60p', 'stock', 'available', 'shipDays'].includes(key))
    return partial(
      'stock.sku / stock.age / warehouse.stock / supply.branch',
      '库存与货龄同日校验；跨基地仅唯一可识别的授权仓库池标注共享，不分配为订单基地独占库存；多池歧义及缺记录不补0，未分配仓库不适用；分仓货龄不跨日期拼接',
    );
  if (
    ['curQty', 'curSkus', 'lackToday', 'lackOrdersToday', 'turn17Skus', 'turn17Qty'].includes(key)
  )
    return partial(
      'shortage.sku / stock.sku / production.future',
      '当前缺口用库存后缺口自身覆盖，不再依赖最终缺口覆盖；张数沿既有客户订单去重且键完整；均为已关联小计',
    );
  if (['dcInTransit', 'odmStock'].includes(key))
    return partial(
      'supply.branch / supply.oem.stock',
      '仓点与基地粒度独立；OEM保留负批次和源快照说明；原始净库存不冒充可用供应',
    );
  if (['prodToday', 'prod5sum', 'prod5(x)'].includes(key) || /^prod[1-5]$/.test(key ?? ''))
    return partial(
      'production.future / product.unit.factors / sku.attributes',
      '工厂编码关联，ST与唯一正换算因子的KG按既有合同；仅明确进入完整查询范围的无排产记录显示0，其他缺口未知；外协范围与分配未确认不混加',
    );
  throw Error('UNCLASSIFIED_FIELD:' + host + ':' + key + ':' + title);
}
