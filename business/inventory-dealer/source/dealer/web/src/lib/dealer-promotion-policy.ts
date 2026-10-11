import 'server-only';

import {
  queryWorkbenchPromotionPolicies,
  queryWorkbenchCustomerPickupPoints,
} from '@/lib/dealer-workbench-sql';
import type { GeaSqlRequestOptions, GeaSqlRow } from '@/lib/gea-sql-client';

export type PromotionScope = {
  id: string;
  level: string;
  productCode: string;
  productName: string;
  pickupCode: string;
  pickupName: string;
  verifiedPickupCodes?: string[];
  start: string;
  end: string | null;
  conditions: string;
};

export type DealerPromotionPolicy = {
  id: string;
  name: string;
  customerCode: string;
  type: string;
  start: string;
  end: string | null;
  rule: string;
  pickupPoint: string;
  pickupCode: string;
  pickupName: string;
  limit: string | null;
  verifiedDefaultPickupName?: string;
  verifiedPickupCodes?: string[];
  usableQuantity: string | null;
  usedQuantity: string | null;
  isCustomerExclusive: boolean | null;
  scopes: PromotionScope[];
  mock: false;
};

export type DealerPromotionResult = {
  policies: DealerPromotionPolicy[];
  policiesStatus: 'available' | 'empty' | 'unavailable' | 'select_customer';
  policiesError?: {
    stage: 'policy_query' | 'pickup_query' | 'scope_validation';
    code: string;
    message: string;
    requestId?: string;
  };
};

const text = (value: unknown) => (value == null ? '' : String(value).trim());
const date = (value: unknown) => text(value).slice(0, 10);
const decimal = (value: unknown) => (value == null ? null : text(value));
const period = (start: unknown, end: unknown) =>
  `${date(start) || '-'} 至 ${date(end) || '未设置结束日期'}`;

export function promotionBusinessDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** 保留源条件，不解析政策名称计算折扣，不将空商品范围解释为全部商品。 */
export function mapDealerPromotionPolicies(
  rows: GeaSqlRow[],
  customerCode: string,
  businessDate: string,
): DealerPromotionPolicy[] {
  const policies = new Map<string, DealerPromotionPolicy>();
  for (const row of rows) {
    if (text(row.customer_code) !== customerCode || text(row.data_type) !== 'cust')
      throw new Error('政策客户范围不匹配');
    const id = text(row.promotion_code);
    if (!id || !text(row.range_record_id)) throw new Error('政策标识缺失');
    // 视图未发布独立范围周期/批次；商品范围沿用政策周期，空日期不限该侧。
    const start = date(row.promotion_start_date);
    const end = date(row.promotion_end_date) || null;
    if ((start && start > businessDate) || (end && end < businessDate)) continue;
    let policy = policies.get(id);
    if (!policy) {
      policy = {
        id,
        name: text(row.promotion_name) || id,
        customerCode,
        type: text(row.promotion_type),
        start,
        end,
        rule: [
          text(row.remarks),
          text(row.policy_gift_remarks),
          row.goods_age_range ? `货龄要求：${text(row.goods_age_range)}` : '',
          row.policy_purchase_start_date || row.policy_purchase_end_date
            ? `采购批次：${period(row.policy_purchase_start_date, row.policy_purchase_end_date)}`
            : '',
          row.policy_gift_start_date || row.policy_gift_end_date
            ? `赠品批次：${period(row.policy_gift_start_date, row.policy_gift_end_date)}`
            : '',
        ]
          .filter(Boolean)
          .join('；'),
        pickupPoint: '',
        pickupCode: text(row.policy_pup_code),
        pickupName: text(row.policy_pup_name),
        limit: decimal(row.promotion_limit),
        usableQuantity: decimal(row.usable_quantity),
        usedQuantity: decimal(row.used_quantity),
        isCustomerExclusive:
          typeof row.is_customer_exclusive === 'boolean' ? row.is_customer_exclusive : null,
        scopes: [],
        mock: false,
      };
      policies.set(id, policy);
    }
    if (!policy.scopes.some((scope) => scope.id === text(row.range_record_id)))
      policy.scopes.push({
        id: text(row.range_record_id),
        level: text(row.scope_level),
        productCode: text(row.product_code),
        productName: text(row.product_name),
        pickupCode: text(row.pup_code) || text(row.policy_pup_code),
        pickupName: text(row.pup_name) || text(row.policy_pup_name),
        start,
        end,
        conditions: '',
      });
  }
  for (const policy of policies.values())
    policy.pickupPoint = [
      ...new Set(
        policy.scopes.map((scope) => scope.pickupName || scope.pickupCode || '未指定提货点'),
      ),
    ].join('、');
  return [...policies.values()];
}

/** 仅读取已授权单客户。失败时保持真实错误态，不补造活动。 */
export async function loadDealerPromotionPolicies(
  customerCode: string,
  options: GeaSqlRequestOptions = {},
): Promise<DealerPromotionResult> {
  if (!customerCode.trim()) return { policies: [], policiesStatus: 'select_customer' };
  let policies: DealerPromotionPolicy[] = [];
  let stage: 'policy_query' | 'pickup_query' | 'scope_validation' = 'policy_query';
  try {
    const businessDate = promotionBusinessDate();
    const rows = await queryWorkbenchPromotionPolicies(customerCode, businessDate, options);
    if (!rows.length) return { policies: [], policiesStatus: 'empty' };
    stage = 'scope_validation';
    policies = mapDealerPromotionPolicies(rows, customerCode, businessDate).map((policy) => ({
      ...policy,
      verifiedPickupCodes: [],
      scopes: policy.scopes.map((scope) => ({
        ...scope,
        verifiedPickupCodes: [],
      })),
    }));
    if (!policies.length) return { policies: [], policiesStatus: 'empty' };
    stage = 'pickup_query';
    const pickupRows = await queryWorkbenchCustomerPickupPoints(customerCode, options);
    const pickups = pickupRows.filter((point) => point.available);
    // 源范围用于展示；核验结果只决定优惠是否可用，不删除或补造源范围。
    policies = policies.map((policy) => {
      const scopes = policy.scopes.map((scope) => {
        const matches =
          !scope.pickupCode && !scope.pickupName
            ? pickups
            : scope.pickupCode
              ? pickups.filter((point) => point.code === scope.pickupCode)
              : pickups.filter((point) => point.name && point.name === scope.pickupName);
        const verified =
          !scope.pickupCode && scope.pickupName && matches.length !== 1 ? [] : matches;
        return {
          ...scope,
          verifiedPickupCodes: verified.map((point) => point.code),
        };
      });
      return {
        ...policy,
        scopes,
        verifiedPickupCodes: [...new Set(scopes.flatMap((scope) => scope.verifiedPickupCodes))],
      };
    });
    return {
      policies,
      policiesStatus: policies.length ? 'available' : 'empty',
    };
  } catch (error) {
    if (options.signal?.aborted) throw options.signal.reason;
    const rawCode =
      error && typeof error === 'object' && 'code' in error ? String(error.code) : 'QUERY_FAILED';
    const code = /^[A-Z0-9_]{1,64}$/.test(rawCode) ? rawCode : 'QUERY_FAILED';
    const message = {
      policy_query: '政策查询失败',
      pickup_query: '客户提货点查询失败',
      scope_validation: '政策或客户提货点范围校验失败',
    }[stage];
    const details = error && typeof error === 'object' && 'details' in error ? error.details : null;
    const candidate =
      details && typeof details === 'object'
        ? 'gatewayRequestId' in details
          ? details.gatewayRequestId
          : 'traceId' in details
            ? details.traceId
            : null
        : null;
    const requestId =
      typeof candidate === 'string' && /^[A-Za-z0-9_.:-]{1,128}$/.test(candidate)
        ? candidate
        : undefined;
    return {
      policies: stage === 'pickup_query' ? policies : [],
      policiesStatus: stage === 'pickup_query' ? 'available' : 'unavailable',
      policiesError: {
        stage,
        code,
        message,
        ...(requestId ? { requestId } : {}),
      },
    };
  }
}
