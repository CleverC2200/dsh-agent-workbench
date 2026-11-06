import { canonicalBaseName } from './relations.js';

const pair = (base, code) => JSON.stringify([base, code]);
const period = (month, base, code) => JSON.stringify([month, base, code]);
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

export function attachPlanReport(plan, sources, relations) {
  const raw = relations?.sources;
  const candidates = groupBy(sources.planCandidates, (row) => pair(row.base, row.code));
  const capacities = groupBy(raw?.sku_capacity ?? [], (row) =>
    pair(row.belong_base, row.material_code),
  );
  const labels = groupBy(raw?.transfers ?? [], (row) =>
    period(row.stat_period, canonicalBaseName(row.target_base), row.material_code),
  );
  const routes = groupBy(sources.transferRoutes, (row) => pair(row.to, row.code));
  const weights = groupBy(sources.unitWeights, (row) => pair(row.base, row.code));
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
  for (const row of plan.rows) {
    const exactLabels = labels.get(period(row.month, row.base, row.code));
    const records = exactLabels ?? labels.get(period(plan.context.month, row.base, row.code)) ?? [];
    const sourceMonth = records.length ? (exactLabels ? row.month : plan.context.month) : '';
    const tags = [...new Set(records.map((item) => item.transfer_tag?.trim()).filter(Boolean))];
    const retired = tags.length === 1 && tags[0] === '下市品';
    const own = resolveResources(row.month, row.base, row.code);
    const monthRoutes = (routes.get(pair(row.base, row.code)) ?? []).filter(
      (item) => !item.month || item.month === row.month,
    );
    const donorBases = [...new Set(monthRoutes.map((item) => item.from))];
    const donorResources = donorBases.flatMap((base) =>
      resolveResources(row.month, base, row.code),
    );
    const usable = (resources) => resources.filter((item) => item.capacity !== null);
    const issues = [];
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
        `缺唯一有效吨/件${own.length ? `；本基地已有${own.length}个已匹配物理资源，产线能力已取得` : ''}`,
        'ai_db.agents_dim_material_prod_sales_info_d',
        'material_code / channel_name / ton_per_piece',
        '补充适用渠道与吨/件；标准日产件数不能替代吨/件',
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
      } else if (monthRoutes.length) {
        if (!donorResources.length)
          add(
            '缺产线产能',
            `调拨关系已存在，但发出基地${donorBases.join('、')}缺可用产线能力`,
            'ai_db.agents_dim_production_line_sku_capacity_mi / ai_db.agents_dim_tunnel_capacity_mi',
            'belong_base / material_code / workshop / tunnel_no / standard_daily_output_ton',
            '补充发出基地的产线归属及有效日产吨数',
          );
        else if (!usable(donorResources).length)
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
            'ai_db.agents_dim_material_prod_sales_info_d',
            'material_code / channel_name / ton_per_piece',
            '核对发出与接收基地适用渠道及吨/件',
          );
      } else if (tags.length === 1 && tags[0] === '调拨品') {
        add(
          '缺调拨关系',
          !exactLabels && row.month !== plan.context.month
            ? `${row.month}未取得同月调拨关系；${sourceMonth}标注调拨品，方向=${records.map((item) => item.transfer_direction || '空').join('、')}，仅作来源对照，未跨月套用`
            : `${sourceMonth}标注调拨品，${row.month}无可用跨基地调拨方向；当前源方向=${records.map((item) => item.transfer_direction || '空').join('、')}`,
          'ai_db.agents_dim_transfer_direction_mi',
          'stat_period / target_base / material_code / transfer_direction',
          '确认该需求月份的发出与接收基地，补充合法调拨方向',
        );
      } else {
        const sourceRows = capacities.get(pair(row.base, row.code)) ?? [];
        add(
          '缺产线产能',
          sourceRows.length
            ? '源产线有记录，但未匹配到可用物理隧道；核对车间、隧道号及日产吨数是否缺失或冲突'
            : tags.includes('ODM代工品')
              ? '来源标注ODM代工品，当前未取得可用代工能力；不作为内部隧道产能'
              : '本基地SKU无已匹配的产线能力，当前也无合法调拨承接',
          'ai_db.agents_dim_production_line_sku_capacity_mi / ai_db.agents_dim_tunnel_capacity_mi',
          'belong_base / material_code / workshop / tunnel_no / standard_daily_output_ton',
          tags.includes('ODM代工品')
            ? '确认代工供应能力及承接口径'
            : '自产补本基地产线能力；异地供应补合法调拨关系',
        );
      }
    }
    row.supplyTags = tags.join('、');
    row.supplySourceMonth = sourceMonth;
    row.reportIssueKinds = [...new Set(issues.map((issue) => issue.kind))];
    const supplyReasons = issues
      .filter((issue) => issue.kind !== '下市品产生需求')
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
