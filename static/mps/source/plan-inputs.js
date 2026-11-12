import { productWeightCandidate, unitWeightCandidate } from './unit-weights.js';
import { productionCalendarDays, productionCalendarRule } from './production-calendar.js';
import {
  canonicalBaseName,
  matchTunnelCapacity,
  physicalTunnelKey,
  tunnelCapacityConflicts,
  latestTransferSnapshot,
} from './relations.js';

const text = (value) => (typeof value === 'string' ? value.trim() : '');
const odmCapacity = (row) =>
  text(row.belong_base) === 'ODM' ||
  text(row.workshop ?? row.production_unit) === 'ODM代工' ||
  text(row.tunnel_no) === 'ODM' ||
  text(row.production_category) === 'ODM';
const number = (value) => {
  if (
    typeof value !== 'number' &&
    !(typeof value === 'string' && /^\d+(\.\d+)?$/.test(value.trim()))
  )
    return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 && numeric <= Number.MAX_SAFE_INTEGER
    ? numeric
    : null;
};

export function resolveWeightPairs(manual, pairs, weightRead, productRaw = []) {
  const weights = manual.map((row) => ({ ...row, tonsPerPiece: number(row.tonsPerPiece) }));
  const manualIndex = new Set(weights.map((row) => JSON.stringify([row.base, row.code])));
  const source = new Map();
  const issues = [];
  const products = new Map();
  for (const row of productRaw) {
    const key = JSON.stringify([canonicalBaseName(row.target_base), text(row.material_code)]);
    products.set(key, [...(products.get(key) ?? []), row]);
  }
  for (const row of weightRead?.rows ?? []) {
    const code = text(row.material_code);
    source.set(code, [...(source.get(code) ?? []), row]);
  }
  const seen = new Set();
  for (const pair of pairs) {
    const key = JSON.stringify([pair.base, pair.code]);
    if (seen.has(key)) continue;
    seen.add(key);
    if (manualIndex.has(key)) {
      const selected = weights.filter((row) => row.base === pair.base && row.code === pair.code);
      if (selected.length !== 1 || !(selected[0].tonsPerPiece > 0))
        issues.push({
          ...pair,
          reason: '人工件吨系数重复、未维护或无效',
          sourceTable: '当前评估版本人工参数',
        });
      continue;
    }
    const rows = source.get(pair.code) ?? [];
    const channels = [...new Set(rows.map((row) => text(row.channel_name)).filter(Boolean))].join(
      '、',
    );
    const candidate =
      productWeightCandidate(
        products.get(JSON.stringify([canonicalBaseName(pair.base), pair.code])) ?? [],
        pair.base,
        pair.code,
      ) ?? unitWeightCandidate(rows, pair.code, channels);
    if (candidate.tonsPerPiece !== null)
      weights.push({ base: pair.base, code: pair.code, tonsPerPiece: candidate.tonsPerPiece });
    else
      issues.push({
        base: pair.base,
        code: pair.code,
        reason: candidate.missing.join('；'),
        sourceTable: candidate.sourceTable ?? 'ai_db.agents_dim_material_prod_sales_info_d',
      });
  }
  return { weights, issues };
}

export function buildPlanSources(draft, relations, weightRead, productPairs = []) {
  const sources = relations?.sources;
  const transferSnapshot = latestTransferSnapshot(sources?.transfers ?? []);
  const odmCodes = new Set(
    [
      ...(sources?.sku_capacity ?? []).filter(odmCapacity).map((row) => text(row.material_code)),
      ...transferSnapshot.rows
        .filter((row) => text(row.transfer_tag) === 'ODM代工品')
        .map((row) => text(row.material_code)),
    ].filter(Boolean),
  );
  const issues = [];
  const manual = (draft.resources ?? [])
    .filter((row) => row.base !== 'ODM')
    .map((row) => ({ ...row, dailyTons: number(row.dailyTons) }));
  const facts = [
    ...(draft.products ?? []),
    ...(draft.report ?? []),
    ...(draft.history ?? []),
    ...(draft.planRates ?? []),
    ...(draft.historyAnnual?.periods ?? []).flatMap((period) => period.rows ?? []),
  ];
  const manualBases = new Set(manual.filter((row) => row.kind === 'tunnel').map((row) => row.base));
  const groups = new Map();
  for (const row of sources?.tunnels ?? []) {
    if (odmCapacity(row)) continue;
    const base = text(row.belong_base),
      workshop = text(row.production_unit),
      tunnel = text(row.tunnel_no);
    if (!base || !workshop || !tunnel) {
      issues.push('隧道来源缺基地、车间或隧道号');
      continue;
    }
    const key = physicalTunnelKey(base, workshop, tunnel);
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }
  const resources = [...manual];
  const sourceResources = [];
  for (const [key, group] of groups) {
    const first = group[0];
    if (manualBases.has(text(first.belong_base))) continue;
    const values = [...new Set(group.map((row) => number(row.standard_daily_output_ton)))];
    const pieces = [...new Set(group.map((row) => number(row.standard_daily_output_pc)))];
    if (values.length !== 1 || values[0] === null || pieces.length > 1) {
      issues.push(
        `${text(first.belong_base)} ${text(first.production_unit)} ${text(first.tunnel_no)} 日产能力冲突或缺失`,
      );
      continue;
    }
    const skuRows = (sources.sku_capacity ?? []).filter(
      (row) =>
        physicalTunnelKey(text(row.belong_base), text(row.workshop), text(row.tunnel_no)) === key,
    );
    const conflicts = tunnelCapacityConflicts(group, skuRows);
    if (conflicts.length) {
      issues.push(
        ...conflicts.map(
          (row) =>
            `${text(first.belong_base)} ${text(first.production_unit)} ${text(first.tunnel_no)}：${row.reason}`,
        ),
      );
      continue;
    }
    const resource = {
      id: `source:${key}`,
      base: text(first.belong_base),
      kind: 'tunnel',
      name: `${text(first.production_unit)} / ${text(first.tunnel_no)}`,
      dailyTons: values[0],
      workshop: text(first.production_unit),
      tunnel: text(first.tunnel_no),
    };
    sourceResources.push(resource);
    resources.push(resource);
  }
  const candidates = (draft.resourceAssignments ?? [])
    .filter(
      (row) =>
        manualBases.has(row.base) &&
        row.share > 0 &&
        manual.some(
          (resource) =>
            resource.kind === 'tunnel' &&
            resource.id === row.resourceId &&
            resource.base === row.base,
        ),
    )
    .map(({ base, code, resourceId, month }) => ({ base, code, resourceId, month }));
  for (const row of sources?.sku_capacity ?? []) {
    if (odmCapacity(row)) continue;
    const base = text(row.belong_base),
      code = text(row.material_code),
      tunnel = text(row.tunnel_no),
      workshop = text(row.workshop);
    if (!base || !code || !tunnel || manualBases.has(base)) continue;
    const match = matchTunnelCapacity(row, sources.tunnels);
    if (match.status !== 'matched') {
      issues.push(`${base} ${workshop} ${tunnel} ${code}：${match.missing.join('；')}`);
      continue;
    }
    const resource = sourceResources.find(
      (resource) => resource.id === `source:${match.resourceKey}`,
    );
    if (resource) candidates.push({ base, code, resourceId: resource.id });
  }
  const allCandidates = [...new Map(candidates.map((row) => [JSON.stringify(row), row])).values()];
  const uniqueCandidates = allCandidates.filter((row) => !odmCodes.has(row.code));
  const odmSupplies = [
    ...new Map(
      transferSnapshot.rows
        .filter(
          (row) =>
            text(row.transfer_tag) === 'ODM代工品' &&
            text(row.material_code) &&
            canonicalBaseName(row.target_base),
        )
        .map((row) => {
          const supply = {
            supplierId: 'odm:default',
            base: canonicalBaseName(row.target_base),
            code: text(row.material_code),
          };
          return [JSON.stringify([supply.base, supply.code]), supply];
        }),
    ).values(),
  ];
  const odmConflicts = [];
  for (const code of odmCodes) {
    const self = transferSnapshot.rows.filter(
      (row) => text(row.material_code) === code && text(row.transfer_tag) === '自产品',
    );
    const internal = allCandidates.filter((row) => row.code === code);
    if (self.length || internal.length)
      odmConflicts.push({
        code,
        reason: `SKU ${code}已有ODM来源，同时${[
          ...(self.length
            ? [
                `${[...new Set(self.map((row) => canonicalBaseName(row.target_base)))].join('、')}标注自产品`,
              ]
            : []),
          ...(internal.length
            ? [`${[...new Set(internal.map((row) => row.base))].join('、')}存在内部产线承接`]
            : []),
        ].join('；')}；需确认来源和收货关系`,
      });
    const mixed = odmSupplies.filter(
      (row) =>
        row.code === code &&
        transferSnapshot.rows.some(
          (label) =>
            text(label.material_code) === code &&
            canonicalBaseName(label.target_base) === row.base &&
            text(label.transfer_tag) &&
            text(label.transfer_tag) !== 'ODM代工品',
        ),
    );
    if (mixed.length)
      odmConflicts.push({
        code,
        reason: `${mixed.map((row) => row.base).join('、')}同一SKU同时存在ODM与其他供给标签，需确认收货关系`,
      });
  }
  const bases = [
    ...new Set([
      ...resources.map((row) => row.base),
      ...odmSupplies.map((row) => row.base),
      ...facts.map((row) => text(row['基地'])).filter(Boolean),
      ...transferSnapshot.rows.map((row) => canonicalBaseName(row.target_base)).filter(Boolean),
    ]),
  ];
  const fiscalStart = `${Number(draft.month.slice(0, 4)) - (Number(draft.month.slice(5)) <= 7 ? 1 : 0)}-07`;
  const fiscalMonths = Array.from({ length: 12 }, (_, index) => {
    const date = new Date(`${fiscalStart}-01T00:00:00Z`);
    date.setUTCMonth(date.getUTCMonth() + index);
    return date.toISOString().slice(0, 7);
  });
  const months = [
    ...new Set([
      ...fiscalMonths,
      ...Array.from({ length: 5 }, (_, index) => {
        const date = new Date(`${draft.month}-01T00:00:00Z`);
        date.setUTCMonth(date.getUTCMonth() + index);
        return date.toISOString().slice(0, 7);
      }),
    ]),
  ];
  const productionDays = bases.flatMap((base) =>
    months.map((month) => ({
      base,
      month,
      days: productionCalendarDays(base, month, draft.productionDays),
    })),
  );
  const pairs = [
    ...new Map(
      [
        ...productPairs,
        ...facts.map((row) => ({ base: text(row['基地']), code: text(row['产品编码']) })),
        ...uniqueCandidates,
      ]
        .filter((row) => row.base && row.code)
        .map((row) => [JSON.stringify([row.base, row.code]), row]),
    ).values(),
  ];
  const transferRoutes = [];
  let pendingRoutes = 0;
  const canonical = (name) => {
    return bases.find((base) => base === name || base === canonicalBaseName(name));
  };
  for (const row of transferSnapshot.rows) {
    const direction = text(row.transfer_direction);
    const incoming = /^从\s*(.+?)\s*调拨$/.exec(direction);
    const parts = incoming
      ? [text(incoming[1]), text(row.target_base)]
      : direction.split(/\s*(?:->|→|至|到)\s*/);
    const from = parts.length === 2 ? canonical(parts[0]) : null;
    const to = parts.length === 2 ? canonical(parts[1]) : null;
    if (
      from &&
      to &&
      from !== to &&
      text(row.material_code) &&
      (!text(row.target_base) || canonical(text(row.target_base)) === to)
    )
      transferRoutes.push({
        from,
        to,
        code: text(row.material_code),
        sourceMonth: transferSnapshot.period,
      });
    else pendingRoutes++;
  }
  const routePairs = transferRoutes.flatMap((row) => [
    { base: row.from, code: row.code },
    { base: row.to, code: row.code },
  ]);
  const { weights: unitWeights, issues: unitWeightIssues } = resolveWeightPairs(
    draft.unitWeights ?? [],
    [...pairs, ...routePairs],
    weightRead,
    draft.productRaw,
  );
  return {
    resources,
    planCandidates: uniqueCandidates,
    odmProductCodes: [...odmCodes],
    odmSupplies,
    odmConflicts,
    productionDays,
    unitWeights,
    unitWeightIssues,
    transferRoutes: [...new Map(transferRoutes.map((row) => [JSON.stringify(row), row])).values()],
    planSourceIssues: [...new Set(issues)],
    metadata: {
      resources: resources.length,
      odmProducts: odmCodes.size,
      odmReceivingPairs: odmSupplies.length,
      odmConflicts: odmConflicts.length,
      candidates: uniqueCandidates.length,
      coefficients: unitWeights.length,
      transferRoutes: transferRoutes.length,
      transferSourcePeriod: transferSnapshot.period,
      pendingRoutes,
      calendar: productionCalendarRule,
      notes: !sources ? ['主数据尚未读取，源产能未装配'] : [],
    },
  };
}
