import { amendmentMetricContract } from '../../business/inventory-orderworkbench/sku-amendments.mjs';
import { ontimeMetricContract } from '../../business/inventory-orderworkbench/ontime-queries.mjs';

export function metricDefinition(name, turnoverScope = 'national') {
  return {
    作废率:
      '按商品明细有效数量合计：锁定期内且接单超过12小时后作废的有效商品数量 ÷ O接收的有效商品数量；有效量依次取客户要求改单量change_order_qty、DMS最后修改量dms_last_update_qty、调整需求量备份need_qty_origin，真实0有效；小时表逐字段为空时，按客户＋原订单＋执行单＋商品行号＋SKU＋基地精确匹配日表，分别回补对应字段的完整唯一非空值，再按客户改单、DMS、备份顺序取值；小时及日表真实0均保留，已有小时字段不覆盖，必需的高优先级日表字段冲突保留未知，已有小时商品行不被日表替换；缺失的日表商品行仅detailstatus=10（用户确认有效且未删除）时补入，其他状态不补；作废订单按OMS作废时间canceltime归月，其他按header_addtime归月；郑州仅按订单执行明细pickup_point=01筛选，不使用仓库映射或belong_base判断范围；不额外限制仓类；小时表订单提货点为空时按精确日表抬头唯一值回补；仍不明保留待确认；仅纳入接口来源20；发货仓为*且有效数量已知大于0时，先按穿透表最新版本精确回补；仍无发货仓时直接取订单pickup_point，与收货仓归属工厂提货点比较，双方仓类均工厂仓/外租仓且同点才剔除；提货点或必要仓类缺失、冲突仍待确认；剔除虚拟出1/2、超时原因14/16、同一归属工厂提货点且两端均工厂仓/外租仓的短拨（使用已确认的出入库pickup_point穿透字段），以及接单后12小时以内（含恰好12小时）作废；作废时间早于OMS最晚发车时间latestsendcardate前7天的订单，分子分母均剔除；达到或晚于该前7天时点且接单超过12小时才计分子；小时字段为空时按精确日表抬头唯一值回补；回补后仍无有效最晚发车时间的订单，无论作废与否均剔除，不计分子或分母；不按订单张数或SKU种类计数',
    改单率:
      '按BI执行明细日表order_close_time订单关单时间归属统计周期，不关联轨迹表，缺时间不归属、不回退OMS创建、WMS关单或装车时间；郑州筛选仅取提货点pickup_point=01，不以belong_base替代；按商品明细数量合计：仅客户要求改单量change_order_qty≥0且小于有效量时，计入Σ(有效量－客户要求量)；仅统计减货，加货及数量不变计0，真实0保留；分母为全部有效量之和，优先dms_last_update_qty，否则need_qty_origin，数量缺失按0；三个数量全空剔除，按detailstatus<>20剔除作废明细；仅接口createsource=20，剔除虚拟出1/2和超时原因14/16；仅保留is_short_transfer=非短拨，不重新按仓库映射推断；不使用锁定期、交期或改单时间作为条件',
    订单满足率:
      '按履约源表统一的原订单发货业务归属周期，来源单＋客户＋归集产品合并：Σmin(发货量,需求量) ÷ Σ需求量 ×100%；上游exp_flag排除无效订单；不再按商品从物流表重算周期；缺需求或归并冲突不计算',
    准交率:
      '按TMS实际到货时间选周期，执行单号去重：准交执行单数 ÷ 已发货执行单数；到货优先目的地GPS围栏、其次到货确认，实际到货记录证明已发货，不要求lastshipmenttime非空，不按detailstatus/is_stat筛选；以max(客户期望、开单确认到货、系统计算到货)为基准，kamd/dc客户晚满18小时算逾期，其他客户晚满12小时算逾期，未满对应时限为准交；剔除同提货点且双方均工厂仓/工厂外租仓的短拨、海外/国外/港澳大区、未派车、虚拟出库1/2、指定车型及空车型、超时原因14/16；郑州庞丽娟按基地准交率；系统交期缺失但到货<已有两交期最大值+对应客户类型的18/12小时可严格确认准交；否则保留未知；短拨仓类可由仓库维表唯一补齐，冲突不覆盖',
    '货龄（>60天库存占比）':
      '产销存日快照：Σcurrent_stock_60 ÷ Σcurrent_stock；两项库存及商品范围统一取 agents_scm_stock_detail_d；周、月均取各自截止日内最新业务日快照，不累计每日库存；源字段缺值或基地商品重复时不发布完整占比',
    周转天数:
      '产销存日表现库存 current_stock ÷ 同范围计划日均需求；按数据库发布的初版、纠偏、滚动截止日选择计划，超过滚动截止日取下月初版；配置缺失或无效时不回退固定日期；初版、纠偏除以库存当月天数，滚动、下月初版除以次月天数；' +
      (turnoverScope === 'base'
        ? '基地日均=(月度需求计划+调拨出库计划×0.5)÷对应月份天数'
        : '全国及品项日均=月度需求计划÷对应月份天数；取库存计划表对应初版、纠偏、滚动或下月字段，不以客户需求表allnum替代') +
      '；各维度库存与计划在同范围内独立汇总，不要求商品逐条匹配；负库存按来源原值汇总；源内缺值、负计划、负库存合计或重复计划粒度不计算',
  }[name];
}

export const metricSpecs = {
  作废率: {
    id: 'cancellation',
    aliases: ['作废率'],
    section: 'changes',
    kind: '1',
    dateBasis:
      '作废记录按canceltime，非作废记录按header_addtime归属周期；不能把全部分母统一按作废时间过滤。',
    cancellationBoundary:
      '分子仅作废记录要求取消时间达到或晚于latestsendcardate前7天且接单严格超过12小时；非作废有效记录计入分母，不要求取消时间；缺有效latestsendcardate的记录从分子分母均剔除。',
  },
  改单率: {
    id: 'amendment',
    aliases: ['改单率'],
    section: 'changes',
    kind: '2',
    details: 'workbench.amendment.details',
    dateBasis: amendmentMetricContract.dateBasis,
  },
  订单满足率: {
    id: 'fulfillment',
    aliases: ['订单满足率', '满足率'],
    section: 'orders',
    dateBasis: '按fromorderno_month原订单发货业务周期归属，来源单＋客户＋归集产品合并。',
  },
  准交率: {
    id: 'ontime',
    aliases: ['准交率'],
    section: 'ontime',
    details: 'workbench.ontime.agent.details',
    dateBasis: ontimeMetricContract.dateBasis,
  },
  '货龄（>60天库存占比）': {
    id: 'age',
    aliases: ['货龄（>60天库存占比）', '60天以上货龄占比', '60天及以上货龄占比', '货龄占比'],
    section: 'ages',
    dateBasis: '各周/月截止范围内最新库存业务日快照，不累计每日库存。',
  },
  周转天数: {
    id: 'shippable',
    aliases: ['周转天数', '可发货天数'],
    section: 'stock',
    dateBasis: '各周/月截止范围内最新库存业务日快照，不累计每日库存。',
  },
};

export function resolveMetricName(name) {
  const found = Object.entries(metricSpecs).find(
    ([key, spec]) => key === name || spec.id === name || spec.aliases.includes(name),
  );
  if (!found) throw Error('UNKNOWN_ORDER_METRIC');
  return found[0];
}

export function metricContract(name, config, scope = 'national') {
  name = resolveMetricName(name);
  const spec = metricSpecs[name],
    queryId =
      spec.section === 'changes'
        ? name === '作废率' ? 'workbench.cancellations' : 'workbench.amendments'
        : spec.section === 'stock'
          ? 'workbench.stock.summary.packets'
          : 'workbench.' + spec.section + '.summary';
  const sql = config?.queries?.[queryId]?.request?.sql ?? '';
  const tables = [
    ...new Set(
      [...sql.matchAll(/(?:FROM|JOIN)\s+((?:agents_|dim_|dwd_)[a-z0-9_]+)/gi)].map((m) => m[1]),
    ),
  ];
  return {
    ...(name === '改单率'
      ? amendmentMetricContract
      : name === '准交率'
        ? ontimeMetricContract
        : {}),
    schemaVersion: 1,
    id: spec.id,
    metric: name,
    version: config?.metricRuntime?.version ?? null,
    revision: config?.metricRuntime?.revision ?? null,
    formula: metricDefinition(name, scope),
    periodBasis: spec.dateBasis,
    cancellationBoundary: spec.cancellationBoundary,
    section: spec.section,
    tables,
    queryId,
    detailsQueryId: spec.details ?? null,
    scope,
    baseMeaning:
      name === '改单率' || name === '作废率'
        ? '郑州按订单提货点pickup_point=01；其他范围沿该查询的已发布规则'
        : '按该指标已发布基地归属和当前授权范围',
    readonly: true,
  };
}
