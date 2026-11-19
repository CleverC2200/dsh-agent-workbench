import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Empty, Select, Spin } from '@arco-design/web-react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { TFunction } from 'i18next';
import { useWorkbenchHost } from '../../bridge.ts';
import type { ApprovalStageId } from './salesPlanDomain.ts';
import type { RegionalApprovalLiveRow } from './regionalApprovalQueryModel.ts';
import { formatExactDecimal } from './regionalApprovalQueryModel.ts';
import {
  skuReviewMonths,
  skuReviewTotal,
  summarizeSkuReview,
  type SkuReviewRow,
  type SkuReviewSource,
} from './models/salesPlanSkuReviewModel.ts';
import styles from './RegionalSkuReview.module.css';

export type SkuReviewTotals = ReturnType<typeof skuReviewTotal>;
export type SkuReviewSnapshot = {
  filters: { category: string; skuCode: string };
  months: [string, string, string];
  rows: readonly SkuReviewRow[];
  totals: SkuReviewTotals;
};
type ReviewState =
  | { kind: 'loading' }
  | { kind: 'failed' }
  | { kind: 'ready'; sources: SkuReviewSource[] };

export function RegionalSkuReview({
  plans,
  detailLoadId,
  month,
  role,
  pendingValues,
  t,
  onSnapshot,
}: {
  plans: readonly RegionalApprovalLiveRow[];
  detailLoadId: string;
  month: string;
  role?: ApprovalStageId;
  pendingValues: Readonly<Record<string, Readonly<Record<string, string>>>>;
  t: TFunction;
  onSnapshot: (snapshot: SkuReviewSnapshot | null) => void;
}) {
  const { salesPlan } = useWorkbenchHost();
  const text = (key: string) => t(`common.assistantSurface.regionalApproval.skuReview.${key}`);
  const [state, setState] = useState<ReviewState>({ kind: 'loading' });
  const [retry, setRetry] = useState(0);
  const [category, setCategory] = useState('');
  const [skuCode, setSkuCode] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  useEffect(() => {
    const controller = new AbortController();
    setState({ kind: 'loading' });
    onSnapshot(null);
    setCategory('');
    setSkuCode('');
    void (async () => {
      if (!salesPlan.skuReview) throw new Error('SKU_REVIEW_UNAVAILABLE');
      const sources: SkuReviewSource[] = [];
      const expectedMonths = skuReviewMonths(month);
      const review = salesPlan.skuReview;
      let next = 0;
      const readPlans = async () => {
        while (next < plans.length) {
          controller.signal.throwIfAborted();
          const index = next++;
          const plan = plans[index];
          const metrics = await review.invoke({
            planId: plan.planId,
            versionId: plan.versionId,
            detailLoadId,
            signal: controller.signal,
          });
          if (metrics.months.some((value, index) => value !== expectedMonths[index]))
            throw new Error('SKU_REVIEW_MONTH_MISMATCH');
          sources[index] = { plan, metrics, skus: metrics.skus };
        }
      };
      await Promise.all(Array.from({ length: Math.min(4, plans.length) }, readPlans));
      summarizeSkuReview(sources, role);
      if (!controller.signal.aborted) setState({ kind: 'ready', sources });
    })().catch(() => {
      if (!controller.signal.aborted) {
        controller.abort();
        setState({ kind: 'failed' });
      }
    });
    return () => controller.abort();
  }, [plans, detailLoadId, month, role, salesPlan, retry, onSnapshot]);
  const rows = useMemo(() => {
    if (state.kind !== 'ready') return [];
    try {
      return summarizeSkuReview(state.sources, role, pendingValues);
    } catch {
      return null;
    }
  }, [state, role, pendingValues]);
  const categories = useMemo(() => [...new Set((rows ?? []).map((row) => row.category))], [rows]);
  const categoryRows = useMemo(
    () => (rows ?? []).filter((row) => !category || row.category === category),
    [rows, category],
  );
  const filtered = useMemo(
    () => categoryRows.filter((row) => !skuCode || row.skuCode === skuCode),
    [categoryRows, skuCode],
  );
  const totals = useMemo(
    () => (state.kind === 'ready' && rows !== null ? skuReviewTotal(filtered) : null),
    [state, rows, filtered],
  );
  useEffect(() => {
    onSnapshot(
      totals
        ? { totals, filters: { category, skuCode }, months: skuReviewMonths(month), rows: filtered }
        : null,
    );
  }, [onSnapshot, totals, category, skuCode, month, filtered]);
  const grouped = useMemo(() => {
    const result = new Map<string, SkuReviewRow[]>();
    for (const row of filtered)
      result.set(row.category, [...(result.get(row.category) ?? []), row]);
    return [...result];
  }, [filtered]);
  const months = skuReviewMonths(month);
  const headings = [
    text('sku'),
    ...months.map((value) => `${value} ${text('shipped')}`),
    text('budget'),
    text('plan'),
    text('confirmed'),
  ];
  const display = (value: string | null) => (value === null ? '—' : formatExactDecimal(value));
  const cells = (row: SkuReviewTotals) => (
    <>
      {row.shipments.map((value, index) => (
        <td key={index}>{display(value)}</td>
      ))}
      <td>{display(row.budgetAmount)}</td>
      <td>
        <span>{display(row.planQty)}</span>
        <small>¥{display(row.planAmount)}</small>
      </td>
      <td>
        <span>{display(row.confirmedQty)}</span>
        <small>¥{display(row.confirmedAmount)}</small>
      </td>
    </>
  );
  return (
    <section
      className={styles.root}
      aria-label={text('title')}
      aria-busy={state.kind === 'loading'}
    >
      <div className={styles.filters}>
        <div className={styles.filterField}>
          <span>{text('category')}</span>
          <Select
            aria-label={text('category')}
            value={category}
            disabled={state.kind !== 'ready'}
            onChange={(value) => {
              setCategory(value);
              setSkuCode('');
            }}
          >
            <Select.Option value="">{text('allCategories')}</Select.Option>
            {categories.map((name) => (
              <Select.Option key={name} value={name}>
                {name}
              </Select.Option>
            ))}
          </Select>
        </div>
        <div className={styles.filterField}>
          <span>{text('sku')}</span>
          <Select
            aria-label={text('sku')}
            value={skuCode}
            showSearch
            disabled={state.kind !== 'ready'}
            onChange={setSkuCode}
          >
            <Select.Option value="">{text('allSkus')}</Select.Option>
            {categoryRows.map((row) => (
              <Select.Option key={row.skuCode} value={row.skuCode}>
                {row.skuCode} {row.description}
              </Select.Option>
            ))}
          </Select>
        </div>
        <Button
          onClick={() => {
            setCategory('');
            setSkuCode('');
          }}
        >
          {text('reset')}
        </Button>
      </div>
      <p className={styles.scope}>{text('scope')}</p>
      {state.kind === 'loading' ? (
        <Spin />
      ) : state.kind === 'failed' || rows === null ? (
        <Alert
          type="error"
          content={text('failed')}
          action={<Button onClick={() => setRetry((value) => value + 1)}>{text('retry')}</Button>}
        />
      ) : (
        <>
          {state.sources.some((source) => source.metrics.shipmentUnavailable) ? (
            <Alert type="warning" content={text('shipmentUnavailable')} />
          ) : null}
          {!filtered.length ? (
            <Empty description={text('empty')} />
          ) : (
            <div className={styles.viewport} tabIndex={0} role="region" aria-label={text('title')}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    {headings.map((heading) => (
                      <th scope="col" key={heading}>
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                {grouped.map(([name, items]) => (
                  <tbody key={name}>
                    <tr className={styles.subtotal}>
                      <th scope="row">
                        <button
                          type="button"
                          aria-expanded={!collapsed.has(name)}
                          onClick={() =>
                            setCollapsed((current) => {
                              const next = new Set(current);
                              if (next.has(name)) next.delete(name);
                              else next.add(name);
                              return next;
                            })
                          }
                        >
                          {collapsed.has(name) ? (
                            <ChevronRight size={16} />
                          ) : (
                            <ChevronDown size={16} />
                          )}
                          {name}
                          <small>{items.length} SKU</small>
                        </button>
                      </th>
                      {cells(skuReviewTotal(items))}
                    </tr>
                    {!collapsed.has(name)
                      ? items.map((row) => (
                          <tr key={row.skuCode}>
                            <th scope="row">
                              <span>{row.skuCode}</span>
                              <small>{row.description}</small>
                            </th>
                            {cells(row)}
                          </tr>
                        ))
                      : null}
                  </tbody>
                ))}
                <tfoot>
                  <tr>
                    <th scope="row">{text('total')}</th>
                    {totals ? cells(totals) : null}
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
