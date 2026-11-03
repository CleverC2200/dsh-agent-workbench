import { knownNumber } from './configured-overview';
import { companyAverageAge } from './inventory-age';
import { currentShortageSum } from './current-shortage';

type InsightPart = {
  summary?: Record<string, unknown>;
  rows?: Array<Record<string, unknown>>;
  snapshotDate?: string | null;
  error?: string;
};

/** Sum quantities and movement before dividing; channel coverage uses matched stock/sales rows. */
export function chainStockMetrics(
  parts: Record<string, InsightPart | undefined>,
  channel: boolean,
) {
  const base = knownNumber(parts.health?.summary?.total_qty);
  const branch = knownNumber(parts['branch-stock']?.summary?.total_qty);
  const sameDate =
    !!parts.health?.snapshotDate &&
    parts.health.snapshotDate === parts['branch-stock']?.snapshotDate;
  const company = sameDate && base !== null && branch !== null ? base + branch : null;
  const customer = parts['channel-overview']?.summary;
  const customerInventory = knownNumber(customer?.inventory);
  const inventory = !channel
    ? company
    : company !== null && customerInventory !== null
      ? company + customerInventory
      : null;
  const shipments = parts['base-shipments']?.summary;
  const baseShipment = knownNumber(shipments?.rolling_ship_positive);
  const baseDaily =
    knownNumber(shipments?.rolling_missing_qty) === 0 && baseShipment !== null
      ? baseShipment / 30
      : null;
  const branchDaily = knownNumber(parts['branch-replenishment']?.summary?.rolling_ship_daily);
  const ratio = (quantity: number | null, daily: number | null) =>
    quantity !== null && quantity >= 0 && daily !== null && daily > 0 ? quantity / daily : null;
  const customerCover = knownNumber(customer?.onhand_cover_inventory);
  const customerSales = knownNumber(customer?.onhand_cover_sales30);
  const validCustomerCover = knownNumber(customer?.valid_onhand_cover);
  const companyDaily =
    baseDaily !== null && branchDaily !== null && baseDaily >= 0 && branchDaily >= 0
      ? baseDaily + branchDaily
      : null;
  const turnoverInventory = !channel
    ? company
    : company !== null &&
        customerCover !== null &&
        validCustomerCover !== null &&
        validCustomerCover > 0
      ? company + customerCover
      : null;
  const turnoverDaily = !channel
    ? companyDaily
    : companyDaily !== null &&
        customerSales !== null &&
        customerSales >= 0 &&
        validCustomerCover !== null &&
        validCustomerCover > 0
      ? companyDaily + customerSales / 30
      : null;
  return {
    base,
    branch,
    sameDate,
    company,
    inventory,
    customerInventory,
    baseDaily,
    branchDaily,
    baseTurnover: ratio(base, baseDaily),
    branchTurnover: ratio(branch, branchDaily),
    turnover: ratio(turnoverInventory, turnoverDaily),
    turnoverInventory,
    turnoverDaily,
  };
}

/** Combine fulfillment quantities from the same shipped-order pools, never their percentages. */
export function chainFulfillmentMetrics(parts: Record<string, InsightPart | undefined>) {
  const pools = ['factory-overview', 'branch-overview'].map((id) => parts[id]?.summary);
  const quantities = pools.map((summary) => ({
    shipped: knownNumber(summary?.fulfillment_shipped_quantity),
    ordered: knownNumber(summary?.fulfillment_order_quantity),
  }));
  if (quantities.some(({ shipped, ordered }) => shipped === null || ordered === null))
    return { rate: null, shipped: null, ordered: null };
  const shipped = quantities.reduce((sum, row) => sum + row.shipped!, 0);
  const ordered = quantities.reduce((sum, row) => sum + row.ordered!, 0);
  return { rate: ordered > 0 ? (shipped / ordered) * 100 : null, shipped, ordered };
}

/** Full-scope independent summaries. Unavailable signals remain explicit gaps. */
export function chainDashboardEvidence(
  parts: Record<string, InsightPart | undefined>,
  date: string,
  channel: boolean,
) {
  const stock = chainStockMetrics(parts, channel);
  const { base, branch, sameDate, company } = stock;
  const customer = parts['channel-overview'];
  return {
    scope: {
      asOf: date,
      primaryBasis: channel ? '全链库存（基地＋分仓＋客户在仓）' : '公司体系库存（基地＋分仓）',
      channelSwitch: channel,
      unit: '件',
    },
    totals: {
      companyInventory: company,
      displayedInventory: stock.inventory,
      turnoverDays: stock.turnover,
      turnoverInventory: stock.turnoverInventory,
      turnoverDailyMovement: stock.turnoverDaily,
      fulfillment: chainFulfillmentMetrics(parts),
      baseInventory: base,
      branchInventory: branch,
      currentOrderShortage: currentShortageSum(parts['current-shortage']?.rows, 'shortage'),
      weightedAverageAge: companyAverageAge(parts.health, parts['branch-stock']),
    },
    channel: {
      inventory: knownNumber(customer?.summary?.inventory),
      snapshotDate: customer?.snapshotDate ?? null,
      usage: channel
        ? '客户库存计入主值；周转仅合并同一批有效库存和动销记录'
        : '渠道观测，未计入主值',
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
