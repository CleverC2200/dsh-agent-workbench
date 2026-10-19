import { isBackendHttpError } from '../../http-error.ts';
import {
  businessSafeErrorMessage,
  reportSalesPlanError,
  SalesPlanActionAttempt,
  classifySalesPlanActionError,
  type SalesPlanActionInput,
} from './models/salesPlanActionModel.ts';
import {
  correctionDecision,
  correctionLine,
  correctionDecimal,
} from './models/salesPlanCorrectionModel.ts';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Input, Modal, Spin } from '@arco-design/web-react';
import type { TFunction } from 'i18next';
import type {
  GeaSalesPlanPeriod,
  GeaSalesPlanActionReceipt,
  GeaSalesPlanSku,
  GeaSalesPlanSubmitReceipt,
} from '../../contracts.ts';
import {
  prepareSalesPlanResubmit,
  salesPlanResubmitReadbackMatches,
  salesPlanSubmitReceiptMatches,
  SalesPlanSubmitAttempt,
  classifySalesPlanSubmitError,
  type SalesPlanResubmitSource,
  type SalesPlanSubmitClient,
} from './models/salesPlanSubmitModel.ts';
import type { WorkbenchHost } from '../../bridge.ts';
import {
  salesPlanAccessForRow,
  salesPlanEditableQuantity,
  type SalesPlanAccess,
} from './models/salesPlanAccessModel.ts';
import { subtractExactDecimals } from './regionalApprovalQueryModel.ts';
import type { RegionalApprovalLiveRow } from './regionalApprovalQueryModel.ts';
import styles from './RegionalApprovalActionDialog.module.css';

export type SalesPlanSubmissionItem = {
  planId: string;
  versionId: string;
  label: string;
  period: GeaSalesPlanPeriod;
} & (
  | { kind: 'resubmit' }
  | {
      kind: 'approve';
      row: RegionalApprovalLiveRow;
      access: SalesPlanAccess;
      pendingValues?: Record<string, string>;
    }
);

type SubmissionClient = SalesPlanSubmitClient &
  Pick<WorkbenchHost['salesPlan'], 'action' | 'draft'>;
type SubmissionRow = {
  item: SalesPlanSubmissionItem;
  source?: SalesPlanResubmitSource;
  skus: GeaSalesPlanSku[];
  edits: Record<string, string>;
  actionInput?: SalesPlanActionInput;
  attempt?: SalesPlanSubmitAttempt | SalesPlanActionAttempt;
  receipt?: GeaSalesPlanSubmitReceipt | GeaSalesPlanActionReceipt;
  status: 'ready' | 'success' | 'failed' | 'unknown' | 'readback' | 'unresolved';
  error?: string;
  rejection?: string;
};

const preparedSubmission = (row: SubmissionRow) => {
  if (!row.source || row.item.kind !== 'resubmit') return undefined;
  const skus =
    row.source.detail.currentVersion.orderType === 'Z'
      ? row.skus.map((sku) => {
          const edit = row.edits[sku.skuCode];
          if (edit === undefined) return sku;
          const line = correctionLine(sku, edit);
          return { ...sku, adjAddQty: line.addQty, adjCutQty: line.cutQty };
        })
      : row.skus;
  return prepareSalesPlanResubmit({ ...row.source, skus });
};

export function RegionalApprovalResubmitDialog({
  items,
  client,
  connected,
  visible = true,
  onPendingChange,
  t,
  onClose,
  onSucceeded,
}: {
  items: readonly SalesPlanSubmissionItem[];
  client: SubmissionClient;
  connected: boolean;
  visible?: boolean;
  onPendingChange?: (pending: boolean) => void;
  t: TFunction;
  onClose: (pending: boolean) => void;
  onSucceeded: () => void;
}) {
  const tr = (key: string, values?: Record<string, unknown>) =>
    t(`common.assistantSurface.regionalApproval.liveSubmit.${key}`, values);
  const [rows, setRows] = useState<SubmissionRow[]>();
  const [busy, setBusy] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const submitting = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const pending =
    busy ||
    Boolean(
      rows?.some(
        (row) =>
          row.status === 'unknown' || row.status === 'readback' || row.status === 'unresolved',
      ),
    );
  const batch = items.length > 1 || items.some((item) => item.kind === 'approve');
  const needsService = items.some((item) => item.kind === 'resubmit');
  const serviceBlocked =
    !connected &&
    (rows
      ? rows.some(
          (row) =>
            row.item.kind === 'resubmit' && (row.status === 'ready' || row.status === 'unknown'),
        )
      : needsService);
  useEffect(() => onPendingChange?.(pending), [pending, onPendingChange]);
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      const currentUser = await client.currentUser.invoke();
      const loaded = await Promise.all(
        items.map(async (item): Promise<SubmissionRow> => {
          try {
            const detail = await client.detail.invoke({
              planId: item.planId,
              signal: controller.signal,
            });
            if (detail.currentVersion.id !== item.versionId || !detail.currentVersion.effective)
              throw new Error('sourceMismatch');
            const skus = await client.versionSkus.invoke({
              versionId: item.versionId,
              signal: controller.signal,
            });
            const period = item.period;
            const source = {
              planId: item.planId,
              versionId: item.versionId,
              period,
              detail,
              currentUser,
              skus,
            };
            const state: SubmissionRow = { item, source, skus, edits: {}, status: 'ready' };
            if (item.kind === 'approve') {
              const access = salesPlanAccessForRow(
                item.row,
                detail,
                [item.access.approvalRole],
                item.access.approvalRole,
              );
              if (!access?.allowedActions.includes('APPROVE')) throw new Error('sourceMismatch');
              if (!client.draft) throw new Error('sourceLoad');
              const draft = await client.draft.invoke({
                planId: item.planId,
                versionId: item.versionId,
                approvalRole: access.approvalRole,
                signal: controller.signal,
              });
              if (draft?.stale) throw new Error('sourceMismatch');
              const adjustments = Object.fromEntries(
                (draft?.draft?.adjustments ?? []).map((value) => [value.skuCode, value.adjustQty]),
              );
              for (const [skuCode, value] of Object.entries(item.pendingValues ?? {})) {
                const sku = skus.find((sku) => sku.skuCode === skuCode);
                const baseline =
                  sku &&
                  salesPlanEditableQuantity(
                    sku,
                    item.row.status,
                    item.row.planTypeCode,
                    access.approvalRole,
                  );
                if (!baseline || !value.trim()) throw new Error('validation');
                const delta = subtractExactDecimals(value.trim(), baseline);
                if (!/^[+-]?\d{1,15}(?:\.\d{1,3})?$/.test(delta) || correctionDecimal(value).lt(0))
                  throw new Error('validation');
                adjustments[skuCode] = delta;
              }
              state.actionInput = {
                planId: item.planId,
                versionId: item.versionId,
                planTypeCode: item.row.planTypeCode,
                serverWorkflowResult: !access.snapshotHash,
                serverRoleResult: access.roleContractSupported,
                request: {
                  action: 'APPROVE',
                  expectedStatus: item.row.status,
                  approvalRole: access.approvalRole,
                  ...(access.roleContractSupported ? { approvalPolicy: 'role-visible-v1' } : {}),
                  ...(access.snapshotHash ? { expectedSnapshot: access.snapshotHash } : {}),
                  ...(Object.keys(adjustments).length
                    ? {
                        adjustments: Object.entries(adjustments).map(([skuCode, adjustQty]) => ({
                          skuCode,
                          adjustQty,
                        })),
                      }
                    : {}),
                },
              };
            }
            return state;
          } catch (cause) {
            return {
              item,
              skus: [],
              edits: {},
              status: 'failed',
              error:
                cause instanceof Error && ['sourceMismatch', 'validation'].includes(cause.message)
                  ? cause.message
                  : 'sourceLoad',
            };
          }
        }),
      );
      if (!controller.signal.aborted) setRows(loaded);
    })().catch(() => {
      if (!controller.signal.aborted)
        setRows(
          items.map((item) => ({
            item,
            skus: [],
            edits: {},
            status: 'failed',
            error: 'sourceLoad',
          })),
        );
    });
    return () => controller.abort();
  }, [items, client]);
  const inputs = useMemo(
    () =>
      rows?.map((row) => {
        try {
          return preparedSubmission(row);
        } catch {
          return undefined;
        }
      }),
    [rows],
  );
  const initial = rows?.every((row) => !row.attempt) ?? true;
  const valid = Boolean(
    rows?.length &&
    rows.every(
      (row, index) =>
        row.status !== 'failed' &&
        (row.item.kind === 'approve' ? row.actionInput : inputs?.[index]),
    ),
  );
  const actionable = rows?.some(
    (row) => row.status === 'ready' || row.status === 'unknown' || row.status === 'readback',
  );
  const edit = (index: number, skuIndex: number, value: string) =>
    setRows((current) =>
      current?.map((row, i) =>
        i !== index
          ? row
          : {
              ...row,
              ...(row.source?.detail.currentVersion.orderType === 'Z'
                ? { edits: { ...row.edits, [row.skus[skuIndex].skuCode]: value } }
                : {
                    skus: row.skus.map((sku, j) => (j !== skuIndex ? sku : { ...sku, qty: value })),
                  }),
            },
      ),
    );
  const submit = async () => {
    if (!rows || submitting.current || serviceBlocked || !actionable || (initial && !valid)) return;
    submitting.current = true;
    setAttempted(true);
    setBusy(true);
    const next = [...rows];
    const publish = () => {
      if (mounted.current) setRows([...next]);
    };
    try {
      for (let index = 0; index < next.length; index++) {
        if (!mounted.current) break;
        let row = next[index];
        if (row.status === 'success' || row.status === 'failed' || row.status === 'unresolved')
          continue;
        try {
          const source = row.source;
          if (!source) throw new Error('sourceLoad');
          const input = inputs?.[index];
          if (!row.attempt) {
            const fresh = await client.detail.invoke({ planId: row.item.planId });
            if (
              fresh.currentVersion.id !== row.item.versionId ||
              fresh.currentVersion.status !== source.detail.currentVersion.status ||
              !fresh.currentVersion.effective
            )
              throw new Error('sourceMismatch');
          }
          if (!mounted.current) break;
          if (row.item.kind === 'resubmit') {
            if (!input) throw new Error('validation');
            let value: GeaSalesPlanSubmitReceipt;
            if (row.receipt && 'seq' in row.receipt) value = row.receipt;
            else if (row.attempt instanceof SalesPlanSubmitAttempt)
              value = await row.attempt.retry();
            else {
              const attempt = new SalesPlanSubmitAttempt(client);
              row = { ...row, attempt };
              next[index] = row;
              publish();
              value = await attempt.submit(input);
            }
            row = { ...row, receipt: value, status: 'readback' };
            next[index] = row;
            publish();
            const detail = await client.detail.invoke({ planId: row.item.planId });
            if (
              !salesPlanSubmitReceiptMatches(input, value.requestId, value) ||
              !salesPlanResubmitReadbackMatches(
                row.item.versionId,
                value,
                detail,
                input.request,
                source.skus,
              )
            )
              throw new Error('readback');
          } else {
            let value: GeaSalesPlanActionReceipt;
            if (row.receipt && 'toStatus' in row.receipt) value = row.receipt;
            else if (row.attempt instanceof SalesPlanActionAttempt)
              value = await row.attempt.retry();
            else {
              const actionInput = row.actionInput;
              if (!actionInput) throw new Error('validation');
              const attempt = new SalesPlanActionAttempt(client);
              row = { ...row, attempt };
              next[index] = row;
              publish();
              value = await attempt.submit(actionInput);
            }
            row = { ...row, receipt: value, status: 'readback' };
            next[index] = row;
            publish();
            const detail = await client.detail.invoke({ planId: row.item.planId });
            if (
              detail.currentVersion.id !== value.versionId ||
              detail.currentVersion.status !== value.toStatus ||
              !detail.currentVersion.effective
            )
              throw new Error('readback');
          }
          next[index] = { ...row, status: 'success', error: undefined, rejection: undefined };
        } catch (cause) {
          const failure =
            row.item.kind === 'resubmit'
              ? classifySalesPlanSubmitError(cause)
              : classifySalesPlanActionError(cause);
          let rejection: string | undefined;
          if (isBackendHttpError(failure.cause)) {
            const id = reportSalesPlanError('sales-plan-submit', failure.cause);
            rejection = [
              failure.cause.status < 500
                ? businessSafeErrorMessage(
                    failure.cause.backendMessage.replace(/^GEA_HTTP_\d{3}[：:]\s*/u, ''),
                  )
                : undefined,
              tr('requestReference', { id }),
            ]
              .filter(Boolean)
              .join(' ');
          }
          next[index] = {
            ...row,
            status: row.receipt
              ? 'readback'
              : failure.retrySameIntent
                ? 'unknown'
                : failure.kind === 'retryExhausted' || failure.kind === 'unavailable'
                  ? 'unresolved'
                  : 'failed',
            error: failure.kind,
            rejection,
          };
        }
        publish();
      }
      if (mounted.current && next.some((row) => row.status === 'success')) onSucceeded();
    } finally {
      submitting.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const label = (row: SubmissionRow) => row.item.label || tr('plan');
  const totals = (row: SubmissionRow, original: boolean) => {
    if (!row.source) return '—';
    try {
      let qty = correctionDecimal('0');
      let amount = correctionDecimal('0');
      const skus = original ? row.source.skus : row.skus;
      for (const sku of skus) {
        let quantity = correctionDecimal(sku.qty);
        if (row.item.kind === 'approve') {
          const before = salesPlanEditableQuantity(
            sku,
            row.item.row.status,
            row.item.row.planTypeCode,
            row.item.access.approvalRole,
          );
          quantity = correctionDecimal(before ?? sku.qty);
          if (!original)
            quantity = quantity.plus(
              correctionDecimal(
                row.actionInput?.request.adjustments?.find((value) => value.skuCode === sku.skuCode)
                  ?.adjustQty ?? '0',
              ),
            );
        } else if (row.source.detail.currentVersion.orderType === 'Z') {
          quantity = correctionDecimal(
            correctionLine(
              sku,
              !original
                ? (row.edits[sku.skuCode] ??
                    correctionDecision(sku, 0, row.source.period.planTypeCode))
                : correctionDecision(sku, 0, row.source.period.planTypeCode),
            ).qty,
          );
        }
        qty = qty.plus(quantity);
        amount = amount.plus(quantity.mul(correctionDecimal(sku.price)).toDecimalPlaces(2));
      }
      return `${qty.toFixed(3)} 件 · ¥${amount.toFixed(2)}`;
    } catch {
      return '—';
    }
  };
  return (
    <Modal
      visible={visible}
      className={styles.liveModal}
      title={batch ? tr('batchTitle', { count: items.length }) : tr('title')}
      maskClosable={false}
      closable={!busy}
      onCancel={() => onClose(pending)}
      footer={
        <div className={styles.footer}>
          <Button disabled={busy} onClick={() => onClose(pending)}>
            {tr('close')}
          </Button>
          <Button
            type="primary"
            loading={busy}
            disabled={serviceBlocked || !rows || (initial && !valid) || !actionable}
            onClick={() => void submit()}
          >
            {tr(
              rows?.some((row) => row.status === 'unknown')
                ? 'retry'
                : rows?.some((row) => row.status === 'readback')
                  ? 'refresh'
                  : batch
                    ? 'confirmBatch'
                    : 'confirm',
            )}
          </Button>
        </div>
      }
    >
      <div className={styles.body}>
        {attempted && !busy && rows && (
          <Alert
            type={rows.every((row) => row.status === 'success') ? 'success' : 'warning'}
            content={tr('batchResult', {
              success: rows.filter((row) => row.status === 'success').length,
              failed: rows.filter((row) => row.status === 'failed').length,
              pending: rows.filter((row) =>
                ['unknown', 'readback', 'unresolved'].includes(row.status),
              ).length,
            })}
          />
        )}
        {serviceBlocked && <Alert type="warning" content={tr('disabled.serviceBoundary')} />}
        {!rows ? <Spin /> : null}
        {rows?.some(
          (row) =>
            row.source?.detail.currentVersion.orderType === 'M' && row.item.kind === 'resubmit',
        ) && <Alert type="info" content={tr('inheritance')} />}
        {rows?.map((row, index) => (
          <section
            key={row.item.versionId}
            className={styles.submissionItem}
            aria-label={label(row)}
          >
            <div className={styles.adjustmentHeader}>
              <strong>{label(row)}</strong>
              <span>{tr(row.item.kind === 'resubmit' ? 'resubmitTag' : 'approveTag')}</span>
            </div>
            {row.source && (
              <div className={styles.submissionComparison}>
                <span>
                  {tr('before')}: {totals(row, true)}
                </span>
                <strong>
                  {tr('after')}: {totals(row, false)}
                </strong>
              </div>
            )}
            {row.source && row.item.kind === 'resubmit' && (
              <details open={items.length === 1}>
                <summary>{tr('details', { count: row.skus.length })}</summary>
                <div className={styles.submissionDetails}>
                  {row.skus.map((sku, skuIndex) => (
                    <label key={sku.skuCode} className={styles.submissionLine}>
                      <span>
                        {sku.skuCode} · {sku.productCategName}
                        <small>
                          {tr('unitPrice')}: {sku.price} · {tr('before')}:{' '}
                          {row.source?.skus[skuIndex].qty}
                        </small>
                        {row.source?.detail.currentVersion.orderType === 'M' &&
                          row.source.detail.currentVersion.status >= 7 && (
                            <small>
                              {tr('inherited')}:{' '}
                              {(() => {
                                const original = row.source?.skus[skuIndex];
                                const status = row.source?.detail.currentVersion.status;
                                return status === 7
                                  ? `${original?.regionConfirmedQty ?? '—'} / ${original?.regionConfirmedAmount ?? '—'}`
                                  : status === 8
                                    ? `${original?.provinceConfirmedQty ?? '—'} / ${original?.provinceConfirmedAmount ?? '—'}`
                                    : `${original?.areaConfirmedQty ?? '—'} / ${original?.areaConfirmedAmount ?? '—'}`;
                              })()}
                            </small>
                          )}
                      </span>
                      <Input
                        aria-label={`${row.source?.detail.currentVersion.orderType === 'Z' ? '纠偏调整量' : tr('quantity')} ${sku.skuCode}`}
                        value={
                          row.source?.detail.currentVersion.orderType === 'Z'
                            ? (row.edits[sku.skuCode] ??
                              correctionDecision(sku, 0, row.source.period.planTypeCode))
                            : sku.qty
                        }
                        disabled={busy || Boolean(row.attempt)}
                        onChange={(value) => edit(index, skuIndex, value)}
                      />
                    </label>
                  ))}
                </div>
              </details>
            )}
            {row.source && row.item.kind === 'approve' && (
              <details>
                <summary>{tr('comparisonDetails', { count: row.skus.length })}</summary>
                <div className={styles.submissionDetails}>
                  {row.skus.map((sku) => {
                    const item = row.item;
                    if (item.kind !== 'approve') return null;
                    try {
                      const before =
                        salesPlanEditableQuantity(
                          sku,
                          item.row.status,
                          item.row.planTypeCode,
                          item.access.approvalRole,
                        ) ?? sku.qty;
                      const delta =
                        row.actionInput?.request.adjustments?.find(
                          (value) => value.skuCode === sku.skuCode,
                        )?.adjustQty ?? '0';
                      const after = correctionDecimal(before).plus(correctionDecimal(delta));
                      return (
                        <div key={sku.skuCode} className={styles.submissionLine}>
                          <span>
                            {sku.skuCode} · {sku.productCategName}
                          </span>
                          <span>
                            {before} → {after.toFixed(3)}
                            <small>
                              ¥
                              {correctionDecimal(before)
                                .mul(correctionDecimal(sku.price))
                                .toFixed(2)}{' '}
                              → ¥{after.mul(correctionDecimal(sku.price)).toFixed(2)}
                            </small>
                          </span>
                        </div>
                      );
                    } catch {
                      return (
                        <span key={sku.skuCode}>
                          {sku.skuCode} · {tr('errors.validation')}
                        </span>
                      );
                    }
                  })}
                </div>
              </details>
            )}
            {row.source && row.item.kind === 'resubmit' && !inputs?.[index] && (
              <Alert type="error" content={tr('errors.validation')} />
            )}
            {row.error && (
              <Alert
                type={
                  ['readback', 'unknown', 'unresolved'].includes(row.status) ? 'warning' : 'error'
                }
                content={
                  row.status === 'readback'
                    ? tr('refreshFailed')
                    : [tr(`errors.${row.error}`), row.rejection].filter(Boolean).join(' ')
                }
              />
            )}
            {row.status === 'success' && <Alert type="success" content={tr('itemSuccess')} />}
          </section>
        ))}
      </div>
    </Modal>
  );
}
