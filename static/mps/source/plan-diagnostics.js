import { canonicalBaseName, latestTransferSnapshot } from './relations.js';
import { transferSupplyPaths } from 'dsh-agent-manage/mps-compute/plan';
import { categoryDemandMissing } from './category-demand.js';

const pair = (base, code) => JSON.stringify([base, code]);
const groupBy = (rows, key) => {
  const groups = new Map();
  for (const row of rows) {
    const id = key(row);
    const group = groups.get(id) ?? [];
    group.push(row);
    groups.set(id, group);
  }
  return groups;
};
const genericSupplyMissing = '无有效产线承接关系或生产日历';

export function attachPlanReport(
  plan,
  sources,
  relations,
  { categoryComputation, shipmentSnapshot } = {},
) {
  const raw = relations?.sources;
  const candidates = groupBy(sources.planCandidates, (row) => pair(row.base, row.code));
  const capacities = groupBy(raw?.sku_capacity ?? [], (row) =>
    pair(row.belong_base, row.material_code),
  );
  const transferSnapshot = latestTransferSnapshot(raw?.transfers ?? []);
  const labels = groupBy(transferSnapshot.rows, (row) =>
    pair(canonicalBaseName(row.target_base), row.material_code),
  );
  const weights = groupBy(sources.unitWeights, (row) => pair(row.base, row.code));
  const weightIssues = groupBy(sources.unitWeightIssues ?? [], (row) => pair(row.base, row.code));
  const schedules = new Map(
    plan.resourceSchedules.map((row) => [JSON.stringify([row.month, row.resourceId]), row]),
  );
  const resolveResources = (month, base, code) =>
    [
      ...new Set(
        (candidates.get(pair(base, code)) ?? [])
          .filter((row) => !row.month || row.month === month)
          .map((row) => row.resourceId),
      ),
    ]
      .map((id) => schedules.get(JSON.stringify([month, id])))
      .filter(Boolean);
  const weight = (base, code) => {
    const values = weights.get(pair(base, code)) ?? [];
    return values.length === 1 && values[0].tonsPerPiece > 0 ? values[0].tonsPerPiece : null;
  };
  const report = [];
  const categoryIssues = new Map(
    (categoryComputation?.rows ?? []).map((row) => [
      JSON.stringify([row.month, row.category]),
      categoryDemandMissing(categoryComputation, row),
    ]),
  );
  const stock = new Map(
    (shipmentSnapshot?.rows ?? []).map((row) => [pair(row.base, row.code), row]),
  );
  for (const row of plan.rows) {
    const records = labels.get(pair(row.base, row.code)) ?? [];
    const sourceMonth = records.length ? transferSnapshot.period : '';
    const tags = [...new Set(records.map((item) => item.transfer_tag?.trim()).filter(Boolean))];
    const retired = tags.length === 1 && tags[0] === '下市品';
    const own = resolveResources(row.month, row.base, row.code);
    const paths = transferSupplyPaths(sources.transferRoutes, row.month, row.code, row.base);
    const donorBases = [...paths.keys()];
    const donorResources = donorBases.flatMap((base) =>
      resolveResources(row.month, base, row.code),
    );
    const usable = (resources) => resources.filter((item) => item.capacity !== null);
    const issues = [];
    const weightIssue = weightIssues.get(pair(row.base, row.code))?.[0];
    const weightSource =
      weightIssue?.sourceTable ??
      'ai_db.agents_dim_product_list_mi / ai_db.agents_dim_material_prod_sales_info_d';
    const weightFields =
      'target_base / material_code / net_weight / weight_unit / measure_unit；旧来源：material_code / channel_name / ton_per_piece';
    const add = (kind, reason, sourceTable, sourceFields, action, blocking = true) => {
      issues.push({
        month: row.month,
        base: row.base,
        code: row.code,
        name: row.name,
        productCategory: row.category,
        group: row.group,
        demand: row.demand,
        kind,
        sourceMonth,
        tags: tags.join('、'),
        reason,
        sourceTable,
        sourceFields,
        action,
        blocking,
        ownResourceCount: own.length,
      });
    };
    if (row.missing?.historyQuantity?.includes('替换系数缺失、冲突或无效'))
      add(
        '缺替换系数',
        '同基地老品历史参考量无法换算，替换系数缺失、冲突或无效',
        'ai_db.agents_dim_product_list_mi',
        'stat_period / target_base / material_code / replacement_material_code / replace_num',
        `核对最新月份${row.base}基地${row.code}对应老品${row.historyCode}的替换系数；同基地同SKU各标签应一致，零系数有效，缺值不能按1计算`,
        row.demand !== 0,
      );
    if (row.planMissing.includes('缺有效需求'))
      add(
        '缺有效需求',
        [
          ...new Set([
            ...(row.missing?.demand ?? []),
            ...(categoryIssues.get(JSON.stringify([row.month, row.category])) ?? []),
          ]),
        ].join('；') || '基地SKU有效需求尚未形成，缺值保留待补',
        '大类需求 / 销售提报 / 上一财年发货',
        '需求月份 / 大类需求数量 / 历史基地 / SKU / 发货数量 / 拆分占比',
        `人工核对${row.month}大类需求及本月预估发货、销售提报；补齐历史发货的基地、SKU和数量或提供经确认的基地映射，再重新评估`,
      );
    if (row.planMissing.includes('缺前月实际结存')) {
      const source = stock.get(pair(row.base, row.code));
      const details =
        row.month !== plan.context.month || !shipmentSnapshot
          ? []
          : ['unread', 'loading', 'failed', 'error', 'denied'].includes(shipmentSnapshot.status)
            ? [
                `发货库存来源状态：${shipmentSnapshot.status}，不能判定为源表缺数`,
                ...(shipmentSnapshot.error ? [shipmentSnapshot.error] : []),
              ]
            : !source
              ? [`${shipmentSnapshot.cutoff}发货库存读取结果无同基地SKU记录`]
              : [
                  ...['open', 'inbound', 'remaining', 'fin']
                    .filter((field) => source[field] == null)
                    .map(
                      (field) =>
                        `缺${{ open: '截止日库存', inbound: '累计生产入库', remaining: '剩余入库', fin: '有效预估发货' }[field]}`,
                    ),
                  ...(source.forecastIssue ? [source.forecastIssue] : []),
                ];
      add(
        '缺期初库存',
        [
          row.month === plan.context.month
            ? '未取得第二步有效月末结存，当前月期初库存待补'
            : '上月实际期末结存未形成，当前月期初库存待补',
          ...details,
        ].join('；'),
        row.month === plan.context.month
          ? 'ai_db.agents_scm_stock_detail_d / 本月预估发货'
          : '上月求解结果',
        row.month === plan.context.month
          ? 'begin_stock / produce_in_qty / 预估发货 / 剩余入库'
          : '上月实际期末结存',
        row.month === plan.context.month
          ? ['unread', 'loading', 'failed', 'error', 'denied'].includes(shipmentSnapshot?.status)
            ? '先核对读取错误、访问权限及截止日，重新同步有效来源后再核对具体缺项'
            : '人工补齐第二步该基地SKU的截止日库存、入库和预估发货输入，形成有效月末结存后重新评估'
          : '先处理上月该基地SKU的需求、库存或产能异常，取得实际期末结存后重新评估',
      );
    }
    if (row.planMissing.includes('缺目标库存'))
      add(
        '缺目标库存',
        row.missing?.targetInventory?.join('；') || '目标库存依赖的周转天数或下月有效需求待补',
        'ai_db.agents_scm_goods_inventory_turnover_data_m / 下月有效需求',
        'final_target_turnover_days / 下月有效需求',
        [
          ...(row.safetyDays == null ? ['人工在第五步补充该基地SKU的目标周转天数'] : []),
          ...(row.nextMonthDemand == null ? [`补齐${row.nextMonth || '下月'}有效需求`] : []),
          '补齐后重新评估，其他输入齐备的单品继续计算',
        ].join('；'),
      );
    if (row.demand === 0 && row.missing?.share?.length)
      add(
        '拆分依据待补',
        `已确认零需求直接输出0，缺失占比不阻断本轮零需求；${row.missing.share.join('；')}`,
        '销售提报 / 上一财年发货',
        '基地 / SKU / 数量 / 拆分占比',
        '人工补齐提报及历史拆分依据，供后续非零需求使用；本轮零需求继续计算',
        false,
      );
    if (retired && row.demand > 0)
      add(
        '下市品产生需求',
        `${sourceMonth}调拨来源标注下市品，${row.month}仍有正需求${row.demand}件；原需求保留`,
        'ai_db.agents_dim_transfer_direction_mi',
        'stat_period / target_base / material_code / transfer_tag',
        '核对下市状态及需求是否有效，确认后调整需求或维护来源',
        false,
      );
    if (row.planMissing.includes('缺唯一有效件吨系数'))
      add(
        '缺件吨系数',
        `缺唯一有效吨/件${weightIssue ? `；${weightIssue.reason}` : ''}${own.length ? `；本基地已有${own.length}个已匹配物理资源，产线能力已取得` : ''}`,
        weightSource,
        weightFields,
        '优先补齐最新产品清单的同基地SKU净重、重量单位和计量单位；无该基地SKU记录时核对旧来源渠道系数，也可人工维护经确认的吨/件；标准日产件数不能替代吨/件',
      );
    if (row.supplyMode === 'odm') {
      row.odmBasis =
        '默认估算，按有效需求、目标期末库存与可用期初库存的净缺口计划到货；尚未验证供方真实能力、交期和实际到货';
      for (const reason of row.planMissing.filter((item) => item.startsWith('ODM来源冲突：')))
        add(
          'ODM来源冲突',
          reason,
          'ai_db.agents_dim_production_line_sku_capacity_mi / ai_db.agents_dim_transfer_direction_mi',
          'belong_base / workshop / material_code / target_base / transfer_tag / transfer_direction',
          '人工确认该SKU采用ODM外部供应还是内部自产，修正冲突标签或产线承接，并补齐ODM收货基地及后续调拨方向后重新评估',
        );
      if (row.planMissing.includes('无有效ODM收货或调拨路径'))
        add(
          '缺ODM收货关系',
          '已知ODM来源，但当前需求基地缺明确收货点或沿已配置方向可达的中转路径',
          'ai_db.agents_dim_transfer_direction_mi',
          'stat_period / target_base / material_code / transfer_tag / transfer_direction',
          '在最新关系中确认ODM收货基地，并补齐从收货基地到本需求基地的完整调拨方向；收货基地不登记内部产能',
        );
      for (const reason of row.planMissing.filter(
        (item) =>
          ![
            '缺有效需求',
            '缺前月实际结存',
            '缺目标库存',
            '缺唯一有效件吨系数',
            '无有效ODM收货或调拨路径',
          ].includes(item) && !item.startsWith('ODM来源冲突：'),
      ))
        add(
          reason.startsWith('供给或中转基地未纳入') ? '缺需求范围' : 'ODM约束未满足',
          reason,
          '当前评估约束 / ODM来源',
          '约束类型 / 适用基地 / SKU / 月份 / 方案观测值及来源',
          reason.startsWith('供给或中转基地未纳入')
            ? '确认该收货或中转基地的本地需求及库存范围；仅中转时可保留已知调拨量，完整库存平衡仍待确认'
            : '核对来源所列约束，补齐成本或提前期的方案依据；自产硬规则与ODM冲突时需人工确认供给方式或调整规则后重新评估',
        );
      if (
        ((row.demand > 0 && row.demandTons === null) ||
          (row.odmArrival > 0 && row.odmArrivalTons === null)) &&
        !row.planMissing.includes('缺唯一有效件吨系数')
      )
        add(
          '缺件吨系数',
          'ODM件数计划可计算，需求或默认计划到货的吨数报告缺唯一一致的吨/件，吨数保持待补',
          weightSource,
          weightFields,
          '核对收货基地及沿途基地适用渠道与唯一一致的吨/件后重新评估吨数报告；当前件数计划继续计算',
          false,
        );
    }
    if (row.planMissing.includes('缺有效成型机台账、月度批准分配或生产日历'))
      add(
        '缺成型机配置',
        '隧道承接已取得，但供给基地缺有效成型机台账、当月批准分配或生产日历，不能认定完整排产',
        '当前评估版本约束与配置',
        'resources.id / base / kind=forming / dailyTons；resourceAssignments.month / base / code / resourceId / share；productionDays',
        '在实际生产基地维护真实成型机及日产吨数，为该SKU当月配置成型机分配比例并合计为1，核对生产天数后重新评估；禁止用隧道产能代替成型机',
      );
    const supplyMissing = row.planMissing.includes(genericSupplyMissing);
    if (supplyMissing && !raw)
      add(
        '其他计算缺项',
        '主数据来源未完整读取，产线与调拨尚不能判断',
        '主数据受控读取',
        '读取状态',
        '重新读取主数据',
      );
    else if (supplyMissing && !retired) {
      if (usable(own).length) {
        if (!issues.length)
          add(
            '其他计算缺项',
            '已有有效产线，承接条件需核对',
            '当前评估约束',
            '产线承接条件',
            '核对当前约束及系数',
          );
      } else if (own.length) {
        add(
          '其他计算缺项',
          '已有物理产能，缺有效生产日历，不能计算月产能',
          '当前评估生产日历',
          'base / month / days',
          '补充本基地本月生产天数',
        );
      } else if (paths.size) {
        if (!donorResources.length) {
          for (const base of donorBases) {
            const sourceTags = [
              ...new Set(
                (labels.get(pair(base, row.code)) ?? [])
                  .map((item) => item.transfer_tag?.trim())
                  .filter(Boolean),
              ),
            ];
            if (sourceTags.length === 1 && sourceTags[0] === 'ODM代工品')
              add(
                '缺ODM收货关系',
                `调拨关系已存在，发出基地${base}标注ODM代工品，本轮未形成ODM默认计划到货；请按外部供应重新评估`,
                'ai_db.agents_dim_transfer_direction_mi',
                'stat_period / target_base / material_code / transfer_tag / transfer_direction',
                '确认ODM收货基地及完整调拨路径后重新评估，不需补内部日产能',
              );
            else if (sourceTags.length === 1 && sourceTags[0] === '调拨品')
              add(
                '缺调拨关系',
                `发出基地${base}自身标注调拨品，当前多级关系未取得可用于直接生产的承接能力`,
                'ai_db.agents_dim_transfer_direction_mi',
                'stat_period / target_base / material_code / transfer_direction / transfer_tag',
                '确认直接生产基地或中转规则后维护合法供应关系',
              );
            else
              add(
                '缺产线产能',
                `调拨关系已存在，但发出基地${base}缺可用产线能力`,
                'ai_db.agents_dim_production_line_sku_capacity_mi / ai_db.agents_dim_tunnel_capacity_mi',
                'belong_base / material_code / workshop / tunnel_no / standard_daily_output_ton',
                '补充发出基地的产线归属及有效日产吨数',
              );
          }
        } else if (!usable(donorResources).length)
          add(
            '其他计算缺项',
            `调拨关系及发出基地产能已存在，缺${donorBases.join('、')}的有效生产日历`,
            '当前评估生产日历',
            'base / month / days',
            '补充发出基地本月生产天数',
          );
        else if (!issues.some((issue) => issue.kind === '缺件吨系数'))
          add(
            '缺件吨系数',
            `调拨关系及发出基地产能已存在，供需基地的吨/件缺失或不一致；接收方=${weight(row.base, row.code)}，发出方=${donorBases.map((base) => `${base}:${weight(base, row.code)}`).join('、')}`,
            'ai_db.agents_dim_product_list_mi / ai_db.agents_dim_material_prod_sales_info_d',
            weightFields,
            '核对发出与接收基地适用渠道及吨/件',
          );
      } else if (tags.length === 1 && tags[0] === '调拨品') {
        add(
          '缺调拨关系',
          `${sourceMonth}最新关系标注调拨品，无可用跨基地调拨方向；当前源方向=${records.map((item) => item.transfer_direction || '空').join('、')}`,
          'ai_db.agents_dim_transfer_direction_mi',
          'stat_period / target_base / material_code / transfer_direction',
          '确认最新关系的发出与接收基地，补充合法调拨方向',
        );
      } else if (tags.includes('ODM代工品')) {
        add(
          '缺ODM收货关系',
          '来源标注ODM代工品，本轮未形成外部收货计划，请重新评估',
          'ai_db.agents_dim_transfer_direction_mi',
          'stat_period / target_base / material_code / transfer_tag / transfer_direction',
          '确认ODM收货基地及完整调拨路径后重新评估，不需补内部日产能',
        );
      } else {
        const sourceRows = capacities.get(pair(row.base, row.code)) ?? [];
        add(
          '缺产线产能',
          sourceRows.length
            ? '源产线有记录，但未匹配到可用物理隧道；核对车间、隧道号及日产吨数是否缺失或冲突'
            : '本基地SKU无已匹配的产线能力，当前也无合法调拨承接',
          'ai_db.agents_dim_production_line_sku_capacity_mi / ai_db.agents_dim_tunnel_capacity_mi',
          'belong_base / material_code / workshop / tunnel_no / standard_daily_output_ton',
          '自产补本基地产线能力；异地供应补合法调拨关系',
        );
      }
    }
    row.supplyTags = tags.join('、');
    row.supplySourceMonth = sourceMonth;
    row.reportIssueKinds = [...new Set(issues.map((issue) => issue.kind))];
    const supplyReasons = issues
      .filter((issue) =>
        ['缺产线产能', '缺调拨关系', '缺ODM收货关系', '缺件吨系数', '其他计算缺项'].includes(
          issue.kind,
        ),
      )
      .map((issue) => `${issue.kind}：${issue.reason}`);
    const replacement = retired
      ? [
          row.demand > 0
            ? '下市品产生需求，需核对下市状态及需求有效性'
            : '来源标注下市品，需求为0或待定，供需承接口径待核对',
        ]
      : supplyReasons.length
        ? supplyReasons
        : [genericSupplyMissing];
    row.reportMissing = [
      ...new Set(
        row.planMissing.flatMap((reason) =>
          reason === genericSupplyMissing
            ? replacement
            : reason === '缺目标库存' && row.safetyDays === null
              ? ['缺目标周转天数，本轮暂不参与计算，补充后重新评估']
              : reason === '缺唯一有效件吨系数'
                ? issues
                    .filter((issue) => issue.kind === '缺件吨系数')
                    .map((issue) => `${issue.kind}：${issue.reason}`)
                : [reason],
        ),
      ),
    ];
    report.push(...issues);
  }
  plan.reportIssues = report;
}
