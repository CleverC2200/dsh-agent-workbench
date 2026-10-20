import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Input, Spin } from '@arco-design/web-react';
import type { TFunction } from 'i18next';
import { useWorkbenchHost, type GeaSalesPlanDetail, type GeaSalesPlanSku } from '../../bridge.ts';
import type { ApprovalStageId } from './salesPlanDomain.ts';
import type { RegionalApprovalLiveRow } from './regionalApprovalQueryModel.ts';
import { addExactDecimals, subtractExactDecimals } from './regionalApprovalQueryModel.ts';
import { summarizeGroupSkus, type GroupSkuSummaryRow } from './models/salesPlanGroupSkuModel.ts';
import { allocateGroupSkuQuantity } from './models/salesPlanGroupAllocationModel.ts';
import { salesPlanEditableQuantity } from './models/salesPlanQuantityModel.ts';
import {
  salesPlanDraftSnapshot,
  salesPlanDraftMatches,
  type SalesPlanLocalDraft,
} from './models/salesPlanLocalDraftModel.ts';
import { SkuQuantityAmount } from './SkuQuantityAmount.tsx';
import styles from './InlineSkuDetails.module.css';

type PendingValues = Record<string, Record<string, string>>;

export function GroupSkuSummary(props: {
  members: readonly RegionalApprovalLiveRow[];
  approvalRole?: ApprovalStageId;
  pendingValues?: Readonly<Record<string, Readonly<Record<string, string>>>>;
  skusByPlan: Readonly<Record<string, GeaSalesPlanSku[]>>;
  comparedSkusByPlan: Readonly<Record<string, GeaSalesPlanSku[]>>;
  comparison: boolean;
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
  editablePlans: ReadonlySet<string>;
  detailsByPlan: Readonly<Record<string, GeaSalesPlanDetail>>;
  onPendingValuesChange: (values: PendingValues) => void;
  onValidityChange: (invalid: boolean) => void;
  t: TFunction;
}) {
  const { members, approvalRole, pendingValues, skusByPlan, comparedSkusByPlan, comparison, t } =
    props;
  const { salesPlan } = useWorkbenchHost();
  const latest = useRef(props);
  latest.current = props;
  const storedDrafts = useRef<Record<string, SalesPlanLocalDraft>>({});
  const [draftsReady, setDraftsReady] = useState(false);
  const [draftReadFailed, setDraftReadFailed] = useState(false);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [save, setSave] = useState<{ values: PendingValues; revision: number }>();
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    latest.current.onValidityChange(
      Object.values(edits).some((value) => !/^\d{1,15}(?:\.\d{1,3})?$/.test(value)),
    );
  }, [edits]);
  useEffect(() => () => latest.current.onValidityChange(false), []);
  const versions = members
    .map(
      (plan) =>
        `${plan.planId}:${plan.versionId}:${plan.status}:${props.editablePlans.has(plan.planId)}`,
    )
    .join('|');
  const text = (key: string) =>
    t(`common.assistantSurface.regionalApproval.inlineComparison.${key}`);
  const groupText = (key: string, values?: Record<string, unknown>) =>
    t(`common.assistantSurface.regionalApproval.groupSku.${key}`, values);

  useEffect(() => {
    const controller = new AbortController();
    const context = latest.current;
    setDraftsReady(false);
    setDraftReadFailed(false);
    setEdits({});
    setSave(undefined);
    setSaveState('idle');
    latest.current.onValidityChange(false);
    storedDrafts.current = {};
    const editable = context.members.filter((plan) => context.editablePlans.has(plan.planId));
    void Promise.all(
      editable.map(async (plan) => {
        const result = await salesPlan.draft!.invoke({
          planId: plan.planId,
          versionId: plan.versionId,
          approvalRole,
          signal: controller.signal,
        });
        const detail = context.detailsByPlan[plan.planId];
        const draft = result.draft ?? undefined;
        if (
          !detail ||
          result.stale ||
          (draft?.role && draft.role !== approvalRole) ||
          !salesPlanDraftMatches(draft, plan, detail, approvalRole)
        )
          return [plan.planId, {}] as const;
        storedDrafts.current[plan.planId] = draft;
        return [
          plan.planId,
          Object.fromEntries(
            draft.adjustments.map((item) => {
              const sku = detail.skus.find((row) => String(row.skuCode) === item.skuCode)!;
              const baseline =
                salesPlanEditableQuantity(sku, plan.status, plan.planTypeCode, approvalRole) ??
                String(sku.qty);
              return [item.skuCode, addExactDecimals([baseline, item.adjustQty])];
            }),
          ),
        ] as const;
      }),
    )
      .then((entries) => {
        if (controller.signal.aborted) return;
        const values = Object.fromEntries(
          entries.map(([planId, stored]) => [
            planId,
            { ...stored, ...latest.current.pendingValues?.[planId] },
          ]),
        );
        if (entries.length) latest.current.onPendingValuesChange(values);
        setDraftsReady(true);
      })
      .catch(() => {
        if (!controller.signal.aborted) setDraftReadFailed(true);
      });
    return () => controller.abort();
  }, [salesPlan, versions, approvalRole, retry]);

  useEffect(() => {
    if (!save) return;
    const controller = new AbortController();
    setSaveState('saving');
    const context = latest.current;
    const timer = setTimeout(() => {
      void Promise.all(
        Object.entries(save.values).map(async ([planId, values]) => {
          const plan = context.members.find((row) => row.planId === planId);
          const detail = context.detailsByPlan[planId];
          if (!plan || !detail || !context.editablePlans.has(planId))
            throw new Error('GROUP_PLAN_READ_ONLY');
          const snapshot = salesPlanDraftSnapshot(plan, detail);
          if (!snapshot) throw new Error('STALE_GROUP_PLAN');
          const adjustments = detail.skus.flatMap((sku) => {
            const value = values[String(sku.skuCode)];
            if (value === undefined) return [];
            const baseline =
              salesPlanEditableQuantity(sku, plan.status, plan.planTypeCode, approvalRole) ??
              String(sku.qty);
            const adjustQty = subtractExactDecimals(value, baseline);
            return /^-?0(?:\.0+)?$/.test(adjustQty)
              ? []
              : [{ skuCode: String(sku.skuCode), adjustQty }];
          });
          const draft: SalesPlanLocalDraft = {
            planId,
            versionId: plan.versionId,
            status: plan.status,
            sourceSnapshot: snapshot,
            adjustments,
            remark: storedDrafts.current[planId]?.remark ?? '',
            ...(approvalRole ? { role: approvalRole } : {}),
          };
          await salesPlan.draft!.invoke({
            planId,
            versionId: plan.versionId,
            approvalRole,
            draft,
            signal: controller.signal,
          });
        }),
      )
        .then(() => {
          if (!controller.signal.aborted) setSaveState('saved');
        })
        .catch(() => {
          if (!controller.signal.aborted) setSaveState('failed');
        });
    }, 500);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [salesPlan, save, approvalRole]);

  const sources = useMemo(
    () =>
      members.every((plan) => skusByPlan[plan.planId])
        ? members.map((plan) => ({ plan, skus: skusByPlan[plan.planId] }))
        : undefined,
    [members, skusByPlan],
  );
  const summary = useMemo(() => {
    if (!sources) return undefined;
    try {
      return summarizeGroupSkus(sources, approvalRole, pendingValues);
    } catch {
      return null;
    }
  }, [sources, approvalRole, pendingValues]);
  const compared = useMemo(() => {
    if (!comparison || !members.every((plan) => comparedSkusByPlan[plan.planId])) return undefined;
    try {
      return summarizeGroupSkus(
        members.map((plan) => {
          const skus = comparedSkusByPlan[plan.planId];
          return {
            plan: {
              ...plan,
              versionId: skus[0]?.versionId ?? plan.versionId,
              skuCount: skus.length,
            },
            skus,
          };
        }),
        approvalRole,
      );
    } catch {
      return undefined;
    }
  }, [comparison, members, comparedSkusByPlan, approvalRole]);
  const comparedByCode = new Map(compared?.map((row) => [row.skuCode, row]));
  const rows = [...(summary ?? [])];
  for (const row of compared ?? [])
    if (!rows.some((item) => item.skuCode === row.skuCode))
      rows.push({ ...row, baseQty: '0', baseAmount: '0', qty: '0', amount: '0' });
  const categories = new Map<string, GroupSkuSummaryRow[]>();
  for (const row of rows)
    categories.set(row.categoryName, [...(categories.get(row.categoryName) ?? []), row]);
  const editable =
    members.every((plan) => props.editablePlans.has(plan.planId)) &&
    draftsReady &&
    Boolean(sources);
  const columns = [
    'plan',
    comparison ? 'confirmedPrimary' : 'confirmed',
    ...(comparison ? ['confirmedCompared', 'difference'] : []),
  ];
  return (
    <section
      className={styles.root}
      data-testid="regional-approval-group-sku-summary"
      aria-label={groupText('title')}
    >
      <div className={styles.groupScope}>
        {comparison
          ? t('common.assistantSurface.regionalApproval.inlineComparison.groupScope', {
              plans: members.length,
              skus: summary?.length ?? '—',
            })
          : groupText('scope', { plans: members.length, skus: summary?.length ?? '—' })}
      </div>
      {editable && <div className={styles.groupScope}>{text('allocation')}</div>}
      {draftReadFailed && (
        <Alert
          type="error"
          content={text('allocationFailed')}
          action={
            <Button size="small" onClick={() => setRetry((value) => value + 1)}>
              {text('allocationRetry')}
            </Button>
          }
        />
      )}
      {saveState === 'failed' && (
        <Alert
          type="error"
          content={text('allocationFailed')}
          action={
            <Button
              size="small"
              onClick={() =>
                setSave((value) => (value ? { ...value, revision: value.revision + 1 } : value))
              }
            >
              {text('allocationRetry')}
            </Button>
          }
        />
      )}
      {saveState === 'saving' && <div role="status">{text('allocationSaving')}</div>}
      {props.failed || summary === null ? (
        <Alert
          type="error"
          content={groupText('loadError')}
          action={
            <Button size="small" onClick={props.onRetry}>
              {groupText('retry')}
            </Button>
          }
        />
      ) : props.loading ? (
        <Spin />
      ) : !summary ? (
        <Alert type="info" content={text('missing')} />
      ) : !rows.length ? (
        <p>{groupText('empty')}</p>
      ) : (
        <div className={styles.viewport} tabIndex={0} role="region" aria-label={groupText('title')}>
          <table className={`${styles.table} ${styles.combinedTable}`}>
            <colgroup>
              <col className={styles.skuColumn} />
              {columns.map((key) => (
                <col className={styles.metricColumn} key={key} />
              ))}
            </colgroup>
            <thead>
              <tr>
                <th scope="col">
                  {t('common.assistantSurface.regionalApproval.liveAdjustment.columns.sku')}
                </th>
                {columns.map((key) => (
                  <th scope="col" key={key}>
                    {text(key)}
                  </th>
                ))}
              </tr>
            </thead>
            {[...categories].map(([category, items]) => (
              <tbody key={category}>
                <tr className={styles.group}>
                  <th colSpan={columns.length + 1} scope="rowgroup">
                    {category} · {items.length} SKU
                  </th>
                </tr>
                {items.map((row) => {
                  const previous = compared
                    ? (comparedByCode.get(row.skuCode) ?? { qty: '0', amount: '0' })
                    : undefined;
                  const isCurrentSku = summary.some((item) => item.skuCode === row.skuCode);
                  return (
                    <tr key={row.skuCode}>
                      <td>
                        <span className={styles.sku}>{row.skuCode}</span>
                        {row.description && (
                          <span className={styles.description}>{row.description}</span>
                        )}
                      </td>
                      <td>
                        <SkuQuantityAmount quantity={row.baseQty} amount={row.baseAmount} />
                      </td>
                      <td>
                        <SkuQuantityAmount quantity={row.qty} amount={row.amount}>
                          {editable && isCurrentSku ? (
                            <Input
                              type="number"
                              step={0.001}
                              size="small"
                              className={styles.quantityInput}
                              aria-label={`${text(comparison ? 'confirmedPrimary' : 'confirmed')} ${row.skuCode}`}
                              value={edits[row.skuCode] ?? row.qty}
                              error={
                                edits[row.skuCode] !== undefined &&
                                !/^\d{1,15}(?:\.\d{1,3})?$/.test(edits[row.skuCode])
                              }
                              onChange={(value) => {
                                setEdits((current) => {
                                  const next = { ...current };
                                  if (/^\d{1,15}(?:\.\d{1,3})?$/.test(value))
                                    delete next[row.skuCode];
                                  else next[row.skuCode] = value;
                                  return next;
                                });
                                if (!sources || !/^\d{1,15}(?:\.\d{1,3})?$/.test(value)) return;
                                const changes = allocateGroupSkuQuantity(
                                  sources,
                                  row.skuCode,
                                  value,
                                  approvalRole,
                                );
                                const next = Object.fromEntries(
                                  Object.entries(changes).map(([planId, change]) => [
                                    planId,
                                    { ...latest.current.pendingValues?.[planId], ...change },
                                  ]),
                                );
                                props.onPendingValuesChange(next);
                                setSave((current) => ({
                                  values: { ...current?.values, ...next },
                                  revision: (current?.revision ?? 0) + 1,
                                }));
                              }}
                            />
                          ) : undefined}
                        </SkuQuantityAmount>
                      </td>
                      {comparison && (
                        <>
                          <td>
                            <SkuQuantityAmount quantity={previous?.qty} amount={previous?.amount} />
                          </td>
                          <td>
                            <SkuQuantityAmount
                              quantity={
                                previous ? subtractExactDecimals(row.qty, previous.qty) : undefined
                              }
                              amount={
                                previous
                                  ? subtractExactDecimals(row.amount, previous.amount)
                                  : undefined
                              }
                            />
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            ))}
          </table>
        </div>
      )}
    </section>
  );
}
