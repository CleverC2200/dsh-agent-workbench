import { SkuQuantityAmount } from './SkuQuantityAmount.tsx';
import styles from './InlineSkuDetails.module.css';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Input, Spin } from '@arco-design/web-react';
import type { TFunction } from 'i18next';
import { useWorkbenchHost, type GeaSalesPlanDetail, type GeaSalesPlanSku } from '../../bridge.ts';
import {
  addExactDecimals,
  formatExactDecimal,
  multiplyExactDecimals,
  subtractExactDecimals,
  type RegionalApprovalLiveRow,
} from './regionalApprovalQueryModel.ts';
import {
  salesPlanDraftSnapshot,
  type SalesPlanLocalDraft,
} from './models/salesPlanLocalDraftModel.ts';
import { salesPlanEditableQuantity } from './models/salesPlanAccessModel.ts';
import type { ApprovalStageId } from './salesPlanDomain.ts';

const DECIMAL = /^[+-]?\d{1,15}(?:\.\d{1,3})?$/;
const quantityText = (value: string) => formatExactDecimal(value).replace(/\.0+$/, '');
/** 输入框不能出现千分位：`type=number` 会把 “1,111” 当非法值并清空整格。 */
const editableQuantityText = (value: string) => quantityText(value).replace(/,/g, '');
const draftLog = (stage: string, detail: unknown) => console.warn(`[gea-draft] ${stage}`, detail);

export function InlineSkuDetails({
  row,
  orderType = 'M',
  t,
  detail,
  canEdit,
  approvalRole,
  categoryName,
  onMetricsChange,
  onPendingValuesChange,
  draftPatch,
  onElementsChange,
  initialInputValues,
  onInputChange,
  comparison = false,
  comparedSkus,
  selectedSkus,
  unavailable = false,
  loading = false,
}: {
  comparison?: boolean;
  comparedSkus?: readonly GeaSalesPlanSku[];
  selectedSkus?: GeaSalesPlanSku[];
  unavailable?: boolean;
  loading?: boolean;
  row: RegionalApprovalLiveRow;
  orderType?: 'M' | 'Z';
  t: TFunction;
  detail?: GeaSalesPlanDetail;
  canEdit?: boolean;
  approvalRole?: ApprovalStageId;
  categoryName?: string;
  onMetricsChange?: (metrics?: { quantity: string; amount: string }) => void;
  /**
   * 把「界面上现在的本节点确认量」直接交给上层：通过时不必等 500ms 防抖落盘，
   * 也不会因为草稿里的旧值把用户刚改的数字冲掉。
   */
  onPendingValuesChange?: (values: Record<string, string>) => void;
  initialInputValues?: Record<string, string>;
  /** Only explicit UI edits are persisted by the page owner, never loaded service results. */
  onInputChange?: (changes: Record<string, string>) => void;
  /** 外部（对话）下发的草稿改写：把指定 SKU 的确认计划量改成同一个值。 */
  draftPatch?: { at: number; quantity: string; skuCodes?: string[] };
  /** Report displayed fields; only quantity fields can belong to the editable collection. */
  onElementsChange?: (
    fields: Array<{ id: string; label: string; value: string; editable: boolean }>,
    collection?: { id: string; label: string; members: string[] },
  ) => void;
}) {
  const { salesPlan } = useWorkbenchHost();
  const [skus, setSkus] = useState<GeaSalesPlanSku[]>();
  const [failed, setFailed] = useState(false);
  const displayedSkus = useMemo(() => {
    const rows = skus ? [...skus] : undefined;
    for (const previous of comparedSkus ?? [])
      if (rows && !rows.some((sku) => String(sku.skuCode) === String(previous.skuCode)))
        rows.push({
          ...previous,
          versionId: row.versionId,
          baseQty: '0',
          qty: '0',
          amt: '0',
          amtBase: '0',
          regionConfirmedQty: null,
          provinceConfirmedQty: null,
          areaConfirmedQty: null,
          categoryConfirmedQty: null,
        });
    return rows?.filter(
      (sku) =>
        categoryName === undefined || (sku.productCategName.trim() || '其他') === categoryName,
    );
  }, [skus, comparedSkus, categoryName, row.versionId]);
  const [confirmedValues, setConfirmedValues] = useState<Record<string, string>>(
    () => initialInputValues ?? {},
  );
  const userEdited = useRef(false);
  const [draftState, setDraftState] = useState<'idle' | 'loading' | 'saved' | 'saving' | 'failed'>(
    'idle',
  );
  const [saveRetry, setSaveRetry] = useState(0);
  // 已保存在 Host 上的草稿内容；失败时不写入，用来判断哪些行还没暂存成功。
  const [savedDraft, setSavedDraft] = useState('');
  const appliedPatch = useRef<number>();
  // 对话下发的草稿改写：只改“确认计划量”输入，等价于人工在格子里填数；保存仍要人工点。
  useEffect(() => {
    if (!draftPatch || !canEdit || !skus || skus.length === 0) return;
    if (appliedPatch.current === draftPatch.at) return;
    appliedPatch.current = draftPatch.at;
    const target = draftPatch.skuCodes?.length
      ? skus.filter((sku) => draftPatch.skuCodes!.includes(String(sku.skuCode)))
      : skus;
    if (target.length === 0) return;
    userEdited.current = true;
    const changes = Object.fromEntries(
      target.map((sku) => [
        String(sku.skuCode),
        orderType === 'Z'
          ? addExactDecimals([baselineFor(sku), draftPatch.quantity])
          : draftPatch.quantity,
      ]),
    );
    onInputChange?.(changes);
    setConfirmedValues((current) => {
      const next = { ...current };
      for (const sku of target) next[String(sku.skuCode)] = changes[String(sku.skuCode)];
      return next;
    });
  }, [canEdit, draftPatch, skus, onInputChange, orderType]);
  useEffect(() => {
    const controller = new AbortController();
    setSkus(undefined);
    setFailed(false);
    if (loading) return () => controller.abort();
    const source = selectedSkus
      ? Promise.resolve(selectedSkus)
      : detail?.skus && detail.currentVersion.id === row.versionId
        ? Promise.resolve(detail.skus)
        : salesPlan.versionSkus.invoke({ versionId: row.versionId, signal: controller.signal });
    void source
      .then((data) => {
        if (!controller.signal.aborted) setSkus(data);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [row.versionId, selectedSkus, loading]);
  useEffect(() => {
    if (!canEdit || !detail) {
      setDraftState('idle');
      return;
    }
    const controller = new AbortController();
    setDraftState('loading');
    setSavedDraft('');
    void salesPlan
      .draft!.invoke({
        planId: row.planId,
        versionId: row.versionId,
        approvalRole,
        signal: controller.signal,
      })
      .then((result) => {
        if (controller.signal.aborted) return;
        if (result.stale || (result.draft?.role && result.draft.role !== approvalRole)) {
          setSavedDraft('{}');
          setDraftState('idle');
          return;
        }
        const restoreRole = result.draft?.role ?? approvalRole;
        const baseline = (sku: GeaSalesPlanSku) =>
          salesPlanEditableQuantity(sku, row.status, row.planTypeCode, restoreRole) ??
          String(sku.qty);
        const next = Object.fromEntries(
          (result.draft?.adjustments ?? []).map((item) => {
            const sku = detail.skus.find((candidate) => String(candidate.skuCode) === item.skuCode);
            if (!sku) return [item.skuCode, item.adjustQty];
            return [item.skuCode, addExactDecimals([baseline(sku), item.adjustQty])];
          }),
        );
        setSavedDraft(JSON.stringify(next)); // 已落盘基线，用来判断哪几行还没存成功
        // 草稿读取可能晚于用户输入：只补齐用户还没动过的行，别把刚敲进去的数字冲掉。
        setConfirmedValues((current) => ({ ...next, ...current }));
        setDraftState('saved');
      })
      .catch((error: unknown) => {
        // 读取失败时按“服务端尚无草稿”处理：用户下一次编辑仍会尝试暂存，但不会凭空写入空草稿覆盖旧稿。
        if (controller.signal.aborted) return;
        draftLog('读取草稿失败，按无草稿继续', error);
        setSavedDraft('{}');
        setDraftState('failed');
      });
    return () => controller.abort();
  }, [approvalRole, canEdit, detail, row.planId, row.planTypeCode, row.status, row.versionId]);
  useEffect(() => {
    if (draftState !== 'saved') return;
    const timer = window.setTimeout(() => setDraftState('idle'), 1400);
    return () => window.clearTimeout(timer);
  }, [draftState]);
  const baselineFor = (sku: GeaSalesPlanSku) =>
    salesPlanEditableQuantity(sku, row.status, row.planTypeCode, approvalRole) ?? String(sku.qty);
  const confirmedMetrics = useMemo(() => {
    if (!skus || skus.length === 0) return undefined;
    const quantities = skus.map((sku) => confirmedValues[String(sku.skuCode)] ?? baselineFor(sku));
    const amounts = skus.map((sku) =>
      multiplyExactDecimals(
        confirmedValues[String(sku.skuCode)] ?? baselineFor(sku),
        String(sku.price),
      ),
    );
    return amounts.every((amount): amount is string => amount !== undefined)
      ? { quantity: addExactDecimals(quantities), amount: addExactDecimals(amounts) }
      : undefined;
  }, [confirmedValues, skus, row.status, row.planTypeCode, approvalRole]);
  useEffect(() => {
    onMetricsChange?.(confirmedMetrics);
  }, [confirmedMetrics, onMetricsChange]);
  const draftAdjustments = useMemo(
    () =>
      (skus ?? [])
        .map((sku) => {
          const code = String(sku.skuCode),
            value = confirmedValues[code];
          if (value === undefined || value.trim() === '') return undefined;
          const adjustQty = subtractExactDecimals(value, baselineFor(sku));
          return DECIMAL.test(adjustQty) && !/^[-+]?0(?:\.0{1,3})?$/.test(adjustQty)
            ? { skuCode: code, adjustQty }
            : undefined;
        })
        .filter((item): item is { skuCode: string; adjustQty: string } => Boolean(item)),
    [confirmedValues, skus, row.status, row.planTypeCode, approvalRole],
  );
  useEffect(() => {
    onPendingValuesChange?.(confirmedValues);
  }, [confirmedValues, onPendingValuesChange]);
  // Report the same loaded values shown by the table, including read-only evidence.
  useEffect(() => {
    if (!onElementsChange) return;
    if (!displayedSkus || displayedSkus.length === 0) {
      onElementsChange([]);
      return;
    }
    const quantityFields = displayedSkus.map((sku) => {
      const code = String(sku.skuCode);
      const confirmed = canEdit ? (confirmedValues[code] ?? baselineFor(sku)) : baselineFor(sku);
      const quantity =
        orderType === 'Z' ? subtractExactDecimals(confirmed, baselineFor(sku)) : confirmed;
      return {
        id: `field:${row.planId}:${code}:qty`,
        label: `${sku.materialDescription ?? sku.productCategName ?? code} ${orderType === 'Z' ? t('common.correction.adjustment') : tr('columns.qty')}`,
        value: quantityText(quantity),
        editable: Boolean(canEdit),
      };
    });
    const readOnlyFields = displayedSkus.flatMap((sku) => {
      const code = String(sku.skuCode);
      const confirmed = confirmedValues[code] ?? editableQuantityText(baselineFor(sku));
      const amount = multiplyExactDecimals(
        orderType === 'Z' ? subtractExactDecimals(confirmed, baselineFor(sku)) : confirmed,
        String(sku.price),
      );
      return [
        {
          id: `field:${row.planId}:${code}:baseQty`,
          label: `${code} ${tr('columns.baseQty')}`,
          value: quantityText(row.orderType === 'Z' ? (sku.corrBaseQty ?? sku.qty) : sku.baseQty),
          editable: false,
        },
        {
          id: `field:${row.planId}:${code}:baseAmount`,
          label: `${code} ${tr('columns.baseAmount')}`,
          value: formatExactDecimal(row.orderType === 'Z' ? sku.amt : sku.amtBase),
          editable: false,
        },
        {
          id: `field:${row.planId}:${code}:amount`,
          label: `${code} ${orderType === 'Z' ? t('common.correction.adjustmentAmount') : tr('columns.amount')}`,
          value: amount === undefined ? '—' : formatExactDecimal(amount),
          editable: false,
        },
        {
          id: `field:${row.planId}:${code}:description`,
          label: `${code} ${tr('columns.sku')}`,
          value: sku.materialDescription || sku.skuName || tr('missingDescription'),
          editable: false,
        },
      ];
    });
    onElementsChange([...quantityFields, ...readOnlyFields], {
      id: `collection:${row.planId}:qty`,
      label: `${row.dealerName ?? row.orgName ?? row.planId} 全部 SKU 的确认计划量`,
      members: quantityFields.map((field) => field.id),
    });
  }, [
    canEdit,
    confirmedValues,
    onElementsChange,
    row.dealerName,
    row.orgName,
    row.planId,
    displayedSkus,
    orderType,
    t,
  ]);
  useEffect(() => {
    if (
      !canEdit ||
      !detail ||
      !skus ||
      draftState === 'loading' ||
      (!userEdited.current && saveRetry === 0)
    )
      return;
    const serialized = JSON.stringify(confirmedValues);
    if (serialized === savedDraft) return;
    const invalidValues = Object.values(confirmedValues).filter(
      (value) => value.trim() && !DECIMAL.test(value),
    );
    if (invalidValues.length) {
      draftLog('暂存跳过：调整量格式不合法', invalidValues);
      setDraftState('failed');
      return;
    }
    const snapshot = salesPlanDraftSnapshot(
      { planId: row.planId, versionId: row.versionId, status: row.status },
      detail,
    );
    if (!snapshot) {
      draftLog('暂存跳过：本地快照无法生成（行与详情的版本/状态/生效标记不一致）', {
        rowVersionId: row.versionId,
        detailVersionId: detail.currentVersion.id,
        rowStatus: row.status,
        detailStatus: detail.currentVersion.status,
        effective: detail.currentVersion.effective,
      });
      setDraftState('failed');
      return;
    }
    const controller = new AbortController();
    setDraftState('saving');
    const timer = setTimeout(() => {
      const draft: SalesPlanLocalDraft = {
        planId: row.planId,
        versionId: row.versionId,
        status: row.status,
        sourceSnapshot: snapshot,
        remark: '',
        adjustments: draftAdjustments,
        ...(approvalRole ? { role: approvalRole } : {}),
      };
      void salesPlan
        .draft!.invoke({
          planId: row.planId,
          versionId: row.versionId,
          approvalRole,
          draft,
          signal: controller.signal,
        })
        .then(() => {
          if (!controller.signal.aborted) {
            setSavedDraft(serialized);
            setDraftState('saved');
          }
        })
        .catch((error: unknown) => {
          if (!controller.signal.aborted) {
            draftLog('暂存失败（服务端拒绝）', error);
            setDraftState('failed');
          }
        });
    }, 500);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [
    approvalRole,
    canEdit,
    confirmedValues,
    detail,
    draftAdjustments,
    row.planId,
    row.status,
    row.versionId,
    saveRetry,
    savedDraft,
    skus,
  ]);
  const tr = (key: string) => t(`common.assistantSurface.regionalApproval.liveAdjustment.${key}`);
  // 已暂存草稿里的值；用于判断某一行是不是“改过但还没暂存成功”。
  const savedValues = useMemo(() => {
    try {
      const parsed: unknown = JSON.parse(savedDraft || '{}');
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, string>)
        : {};
    } catch {
      return {};
    }
  }, [savedDraft]);
  const comparisonText = (key: string) =>
    t(`common.assistantSurface.regionalApproval.inlineComparison.${key}`);
  const columns = [
    'plan',
    comparison ? 'confirmedPrimary' : 'confirmed',
    ...(comparison ? ['confirmedCompared', 'difference'] : []),
  ];
  const comparedByCode = new Map(comparedSkus?.map((sku) => [String(sku.skuCode), sku]));
  const groups = new Map<string, GeaSalesPlanSku[]>();
  for (const sku of displayedSkus ?? []) {
    const category = sku.productCategName.trim() || '其他';
    groups.set(category, [...(groups.get(category) ?? []), sku]);
  }
  // 暂存状态就近展示在改过的数字旁；失败给就地重试，不再用表格顶部通栏。
  return (
    <section className={styles.root} aria-label={tr('columns.sku')}>
      {loading ? (
        <Spin />
      ) : unavailable ? (
        <Alert type="info" content={comparisonText('missing')} />
      ) : failed ? (
        <Alert type="error" content={tr('loadError')} />
      ) : !skus ? (
        <Spin />
      ) : (
        <div className={styles.viewport} tabIndex={0} role="region" aria-label={tr('columns.sku')}>
          <table className={styles.table}>
            <colgroup>
              <col className={styles.skuColumn} />
              {columns.map((key) => (
                <col className={styles.metricColumn} key={key} />
              ))}
            </colgroup>
            <thead>
              <tr>
                <th scope="col">{tr('columns.sku')}</th>
                {columns.map((key) => (
                  <th scope="col" key={key}>
                    {comparisonText(key)}
                  </th>
                ))}
              </tr>
            </thead>
            {[...groups].map(([category, items]) => (
              <tbody key={category}>
                <tr className={styles.group}>
                  <th colSpan={columns.length + 1} scope="rowgroup">
                    {category} · {items.length} SKU
                  </th>
                </tr>
                {items.map((sku, index) => {
                  const changed =
                    formatExactDecimal(
                      row.orderType === 'Z' ? (sku.corrBaseQty ?? sku.qty) : sku.baseQty,
                    ) !== formatExactDecimal(sku.qty) ||
                    formatExactDecimal(row.orderType === 'Z' ? sku.amt : sku.amtBase) !==
                      formatExactDecimal(sku.amt);
                  const code = String(sku.skuCode),
                    baseline = baselineFor(sku),
                    confirmed = confirmedValues[code] ?? editableQuantityText(baseline);
                  const adjustment = subtractExactDecimals(confirmed, baseline);
                  const confirmedAmount = multiplyExactDecimals(
                    orderType === 'Z' ? adjustment : confirmed,
                    String(sku.price),
                  );
                  const previous = comparedByCode.get(code);
                  const previousQuantity = !comparedSkus
                    ? undefined
                    : previous
                      ? baselineFor(previous)
                      : '0';
                  const previousAmount =
                    previousQuantity === undefined
                      ? undefined
                      : previous
                        ? multiplyExactDecimals(previousQuantity, String(previous.price))
                        : '0';
                  return (
                    <tr key={code + ':' + index} className={changed ? styles.changed : undefined}>
                      <td>
                        <span className={styles.sku}>{code}</span>
                        <span className={styles.description}>
                          {sku.materialDescription || sku.skuName || tr('missingDescription')}
                        </span>
                      </td>
                      <td>
                        <SkuQuantityAmount
                          quantity={
                            row.orderType === 'Z' ? (sku.corrBaseQty ?? sku.qty) : sku.baseQty
                          }
                          amount={row.orderType === 'Z' ? sku.amt : sku.amtBase}
                        />
                      </td>
                      <td>
                        <SkuQuantityAmount
                          quantity={orderType === 'Z' ? adjustment : confirmed}
                          amount={confirmedAmount}
                        >
                          {canEdit && skus.some((current) => String(current.skuCode) === code) ? (
                            <div className={styles.quantityCell}>
                              <Input
                                className={styles.quantityInput}
                                type="number"
                                step={orderType === 'Z' ? 0.001 : 1}
                                size="small"
                                value={orderType === 'Z' ? adjustment : confirmed}
                                aria-label={`${orderType === 'Z' ? t('common.correction.adjustment') : tr('columns.qty')} ${code}`}
                                onChange={(value) => {
                                  userEdited.current = true;
                                  const quantity =
                                    orderType === 'Z' && value.trim()
                                      ? addExactDecimals([baseline, value])
                                      : value;
                                  setConfirmedValues((current) => ({
                                    ...current,
                                    [code]: quantity,
                                  }));
                                  onInputChange?.({ [code]: quantity });
                                }}
                              />
                              {savedValues[code] === confirmedValues[code] ? null : draftState ===
                                'failed' ? (
                                <span
                                  className={styles.draftFailed}
                                  role="alert"
                                  title={tr('draft.failed')}
                                >
                                  <span className={styles.draftFailedText}>
                                    {tr('draft.failedShort')}
                                  </span>
                                  <button
                                    type="button"
                                    className={styles.draftRetry}
                                    onClick={() => setSaveRetry((value) => value + 1)}
                                  >
                                    {tr('draft.retryShort')}
                                  </button>
                                </span>
                              ) : draftState === 'saving' ? (
                                <span className={styles.draftSaving} role="status">
                                  {tr('draft.saving')}
                                </span>
                              ) : null}
                            </div>
                          ) : undefined}
                        </SkuQuantityAmount>
                      </td>
                      {comparison && (
                        <>
                          <td>
                            <SkuQuantityAmount
                              quantity={previousQuantity}
                              amount={previousAmount}
                            />
                          </td>
                          <td>
                            <SkuQuantityAmount
                              quantity={
                                previousQuantity === undefined
                                  ? undefined
                                  : subtractExactDecimals(confirmed, previousQuantity)
                              }
                              amount={
                                previousAmount === undefined || confirmedAmount === undefined
                                  ? undefined
                                  : subtractExactDecimals(confirmedAmount, previousAmount)
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
