import { knownNumber } from './configured-overview';
import { companyAverageAge } from './inventory-age';
import { currentShortageSum } from './current-shortage';

type InsightPart = {
  summary?: {
    total_qty?: unknown;
    total_inventory?: unknown;
    weighted_age_sum?: unknown;
    weighted_age?: unknown;
    age_weight_qty?: unknown;
  };
  rows?: Array<Record<string, unknown>>;
  snapshotDate?: string | null;
  error?: string;
};

/** Full-scope independent summaries. Unavailable signals remain explicit gaps. */
export function chainDashboardEvidence(
  parts: Record<string, InsightPart | undefined>,
  date: string,
  channel: boolean,
) {
  const base = knownNumber(parts.health?.summary?.total_qty);
  const branch = knownNumber(parts['branch-stock']?.summary?.total_qty);
  const sameDate =
    !!parts.health?.snapshotDate &&
    parts.health.snapshotDate === parts['branch-stock']?.snapshotDate;
  const company = sameDate && base !== null && branch !== null ? base + branch : null;
  const customer = parts['channel-overview'];
  return {
    scope: {
      asOf: date,
      primaryBasis: '公司体系库存（基地＋分仓）',
      channelSwitch: channel,
      unit: '件',
    },
    totals: {
      companyInventory: company,
      baseInventory: base,
      branchInventory: branch,
      currentOrderShortage: currentShortageSum(parts['current-shortage']?.rows, 'shortage'),
      weightedAverageAge: companyAverageAge(parts.health, parts['branch-stock']),
    },
    channel: {
      inventory: knownNumber(customer?.summary?.total_inventory),
      snapshotDate: customer?.snapshotDate ?? null,
      usage: '渠道观测，未计入主值',
      coverageRate: null,
      sales30d: null,
    },
    rankings: null,
    skuSignals: null,
    agingRisks: null,
    coverage: {
      baseSnapshot: parts.health?.snapshotDate ?? null,
      branchSnapshot: parts['branch-stock']?.snapshotDate ?? null,
      missing: [
        ...(!sameDate ? ['基地与分仓库存快照不同日，不合并公司主值'] : []),
        '全量大区×品类风险排序',
        'SKU跨层库存与渠道动销交集',
        '渠道提报覆盖率',
      ],
      failures: Object.values(parts).flatMap((part) => (part?.error ? [part.error] : [])),
    },
    boundary:
      '只用已核实摘要；无排序、交集或批次证据时只描述现象；不推断因果、真实缺货或具体SKU原因。',
  };
}
