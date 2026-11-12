import type { NativeBusinessStatus } from '../../../business-contract.ts';
import { isBackendHttpError } from '../../http-error.ts';
import {
  salesPlanRejectionMessage,
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
  GeaSalesPlanDetail,
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
import { addExactDecimals } from './regionalApprovalQueryModel.ts';
import {
  salesPlanApprovalDraftValues,
  salesPlanDraftMatches,
} from './models/salesPlanLocalDraftModel.ts';
import type { ApprovalStageId } from './salesPlanDomain.ts';
import type { RegionalApprovalLiveRow } from './regionalApprovalQueryModel.ts';
import styles from './RegionalApprovalActionDialog.module.css';

export type SalesPlanSubmissionItem = {
  planId: string;
  versionId: string;
  label: string;
  period: GeaSalesPlanPeriod;
  pendingValues?: Record<string, string>;
} & (
  | { kind: 'resubmit'; row: RegionalApprovalLiveRow; approvalRole?: ApprovalStageId }
  | {
      kind: 'approve';
      row: RegionalApprovalLiveRow;
      access: SalesPlanAccess;
      pendingValues?: Record<string, string>;
    }
);

export type SalesPlanSubmissionOutcome = {
  planId: string;
  versionId: string;
  status: 'success' | 'failed' | 'pending';
  permissionDenied: boolean;
};

type SubmissionClient = SalesPlanSubmitClient &
  Pick<WorkbenchHost['salesPlan'], 'action' | 'draft'>;
type SubmissionRow = {
  item: SalesPlanSubmissionItem;
  source?: SalesPlanResubmitSource;
  skus: GeaSalesPlanSku[];
  changes: { sku: GeaSalesPlanSku; before: string; after: string }[];
  actionInput?: SalesPlanActionInput;
  attempt?: SalesPlanSubmitAttempt | SalesPlanActionAttempt;
  receipt?: GeaSalesPlanSubmitReceipt | GeaSalesPlanActionReceipt;
  status: 'ready' | 'success' | 'failed' | 'unknown' | 'readback' | 'unresolved';
  error?: string;
  errorValues?: Record<string, string>;
  recovery?: 'refresh' | 'draft';
  ignoredDraft?: boolean;
  rejection?: string;
};

class SubmissionSourceError extends Error {
  constructor(
    readonly key:
      | 'planChanged'
      | 'versionChanged'
      | 'statusChanged'
      | 'versionInactive'
      | 'periodChanged'
      | 'planTypeChanged'
      | 'orderTypeChanged'
      | 'skuVersionChanged'
      | 'skuDuplicate'
      | 'skuEmpty'
      | 'skuAdded'
      | 'skuRemoved'
      | 'skuValueChanged'
      | 'draftStale'
      | 'accessChanged',
    readonly values: Record<string, string> = {},
  ) {
    super(key);
  }
}

const checkSubmissionSource = (item: SalesPlanSubmissionItem, detail: GeaSalesPlanDetail) => {
  const version = detail.currentVersion;
  if (version.planId !== item.planId)
    throw new SubmissionSourceError('planChanged', {
      expected: item.planId,
      actual: version.planId,
    });
  if (version.id !== item.versionId)
    throw new SubmissionSourceError('versionChanged', {
      expected: item.versionId,
      actual: version.id,
    });
  if (version.status !== item.row.status)
    throw new SubmissionSourceError('statusChanged', {
      expected: String(item.row.status),
      actual: String(version.status),
    });
  if (!version.effective) throw new SubmissionSourceError('versionInactive');
  if (String(version.periodId) !== String(item.period.periodId))
    throw new SubmissionSourceError('periodChanged', {
      expected: String(item.period.periodId),
      actual: String(version.periodId),
    });
  if (version.planTypeCode !== item.period.planTypeCode)
    throw new SubmissionSourceError('planTypeChanged', {
      expected: item.period.planTypeCode,
      actual: version.planTypeCode,
    });
  if (item.row.orderType && version.orderType !== item.row.orderType)
    throw new SubmissionSourceError('orderTypeChanged', {
      expected: item.row.orderType,
      actual: version.orderType ?? '—',
    });
};

const checkSubmissionSkus = (
  versionId: string,
  before: readonly GeaSalesPlanSku[],
  after: readonly GeaSalesPlanSku[],
) => {
  if (!after.length) throw new SubmissionSourceError('skuEmpty');
  const previous = new Map(before.map((sku) => [String(sku.skuCode), sku]));
  const codes = new Set<string>();
  for (const sku of after) {
    const code = String(sku.skuCode);
    if (sku.versionId !== versionId)
      throw new SubmissionSourceError('skuVersionChanged', {
        code,
        expected: versionId,
        actual: sku.versionId,
      });
    if (codes.has(code)) throw new SubmissionSourceError('skuDuplicate', { code });
    codes.add(code);
    const original = previous.get(code);
    if (!original) throw new SubmissionSourceError('skuAdded', { code });
    for (const field of [
      'price',
      'qty',
      'amt',
      'adjAddQty',
      'adjCutQty',
      'regionConfirmedQty',
      'provinceConfirmedQty',
      'areaConfirmedQty',
      'categoryConfirmedQty',
    ] as const) {
      const expected = String(original[field] ?? '—');
      const actual = String(sku[field] ?? '—');
      if (expected !== actual)
        throw new SubmissionSourceError('skuValueChanged', { code, field, expected, actual });
    }
  }
  for (const code of previous.keys())
    if (!codes.has(code)) throw new SubmissionSourceError('skuRemoved', { code });
};

const preparedSubmission = (row: SubmissionRow) => {
  if (!row.source || row.item.kind !== 'resubmit') return undefined;
  return prepareSalesPlanResubmit({ ...row.source, skus: row.skus });
};

export function RegionalApprovalResubmitDialog({
  items,
  client,
  connected,
  unavailableReason,
  visible = true,
  onPendingChange,
  t,
  onClose,
  onSucceeded,
  onCompleted,
  onRefresh,
}: {
  items: readonly SalesPlanSubmissionItem[];
  client: SubmissionClient;
  connected: boolean;
  unavailableReason?: NativeBusinessStatus['resubmitUnavailableReason'];
  visible?: boolean;
  onPendingChange?: (pending: boolean) => void;
  t: TFunction;
  onClose: (pending: boolean) => void;
  onSucceeded?: () => void;
  onCompleted?: (outcomes: readonly SalesPlanSubmissionOutcome[]) => void;
  onRefresh?: (planIds: readonly string[]) => void;
}) {
  const tr = (key: string, values?: Record<string, unknown>) =>
    t(`common.assistantSurface.regionalApproval.liveSubmit.${key}`, values);
  const [rows, setRows] = useState<SubmissionRow[]>();
  const [busy, setBusy] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [remark, setRemark] = useState('');
  const [ignoredDrafts, setIgnoredDrafts] = useState<ReadonlySet<string>>(() => new Set());
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
            checkSubmissionSource(item, detail);
            const skus = await client.versionSkus.invoke({
              versionId: item.versionId,
              signal: controller.signal,
            });
            const period = item.period;
            checkSubmissionSkus(item.versionId, detail.skus, skus);
            const source = {
              planId: item.planId,
              versionId: item.versionId,
              period,
              detail,
              currentUser,
              skus,
            };
            const role = item.kind === 'approve' ? item.access.approvalRole : item.approvalRole;
            if (!client.draft) throw new Error('sourceLoad');
            const ignoredDraft = ignoredDrafts.has(item.versionId);
            const draft = ignoredDraft
              ? undefined
              : await client.draft.invoke({
                  planId: item.planId,
                  versionId: item.versionId,
                  approvalRole: role,
                  signal: controller.signal,
                });
            if (
              draft?.stale ||
              (draft?.draft && !salesPlanDraftMatches(draft.draft, item.row, detail, role))
            )
              throw new SubmissionSourceError('draftStale');
            const adjustments = salesPlanApprovalDraftValues(
              { ...detail, skus },
              item.row,
              role,
              draft?.draft?.adjustments ?? [],
              ignoredDraft ? undefined : item.pendingValues,
              item.kind === 'approve',
            );
            const changes = Object.entries(adjustments).flatMap(([code, delta]) => {
              if (correctionDecimal(delta).isZero()) return [];
              const sku = skus.find((value) => String(value.skuCode) === code);
              const before =
                sku && salesPlanEditableQuantity(sku, item.row.status, item.row.planTypeCode, role);
              if (!sku || before === undefined) throw new Error('validation');
              return [{ sku, before, after: addExactDecimals([before, delta]) }];
            });
            const state: SubmissionRow = {
              item,
              source,
              skus,
              changes,
              status: 'ready',
              ignoredDraft,
            };
            if (item.kind === 'resubmit') {
              state.skus = skus.map((sku) => {
                const change = changes.find((value) => value.sku.skuCode === sku.skuCode);
                if (!change) return sku;
                if (detail.currentVersion.orderType === 'M') return { ...sku, qty: change.after };
                const line = correctionLine(
                  sku,
                  correctionDecimal(change.after).minus(correctionDecimal(sku.qty)).toFixed(),
                );
                return { ...sku, adjAddQty: line.addQty, adjCutQty: line.cutQty };
              });
            }
            if (item.kind === 'approve') {
              const access = salesPlanAccessForRow(
                item.row,
                detail,
                [item.access.approvalRole],
                item.access.approvalRole,
              );
              if (!access?.allowedActions.includes('APPROVE'))
                throw new SubmissionSourceError('accessChanged');
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
              changes: [],
              status: 'failed',
              ...(cause instanceof SubmissionSourceError
                ? {
                    errorValues: cause.values,
                    recovery: cause.key === 'draftStale' ? 'draft' : 'refresh',
                  }
                : {}),
              error:
                cause instanceof SubmissionSourceError
                  ? cause.key
                  : cause instanceof Error && cause.message === 'validation'
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
            changes: [],
            status: 'failed',
            error: 'sourceLoad',
          })),
        );
    });
    return () => controller.abort();
  }, [items, client, ignoredDrafts]);
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
  const submit = async () => {
    if (!rows || submitting.current || serviceBlocked || !actionable || (initial && !valid)) return;
    submitting.current = true;
    setAttempted(true);
    setBusy(true);
    const next = [...rows];
    const processed: SubmissionRow[] = [];
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
            checkSubmissionSource(row.item, fresh);
            checkSubmissionSkus(row.item.versionId, source.detail.skus, fresh.skus);
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
              if (!row.actionInput) throw new Error('validation');
              const actionInput = {
                ...row.actionInput,
                request: { ...row.actionInput.request, remark: remark.trim() },
              };
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
            reportSalesPlanError('sales-plan-submit', failure.cause);
            rejection = salesPlanRejectionMessage(failure.cause);
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
            error: cause instanceof SubmissionSourceError ? cause.key : failure.kind,
            errorValues: cause instanceof SubmissionSourceError ? cause.values : undefined,
            recovery: cause instanceof SubmissionSourceError ? 'refresh' : undefined,
            rejection,
          };
        }
        processed.push(next[index]);
        publish();
      }
      if (mounted.current) {
        onCompleted?.(
          processed
            .filter((row) => row.attempt)
            .map((row) => ({
              planId: row.item.planId,
              versionId: row.item.versionId,
              status:
                row.status === 'success'
                  ? 'success'
                  : row.status === 'failed'
                    ? 'failed'
                    : 'pending',
              permissionDenied: row.error === 'permission',
            })),
        );
        if (processed.some((row) => row.status === 'success')) onSucceeded?.();
      }
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
            correctionLine(sku, correctionDecision(sku, 0, row.source.period.planTypeCode)).qty,
          );
        }
        qty = qty.plus(quantity);
        amount = amount.plus(quantity.mul(correctionDecimal(sku.price)).toDecimalPlaces(2));
      }
      return `${qty.toFixed()} 件 · ¥${amount.toFixed(2)}`;
    } catch {
      return '—';
    }
  };
  return (
    <Modal
      visible={visible}
      className={styles.submissionModal}
      style={{ width: 'min(760px, calc(100vw - 24px))', maxWidth: 'calc(100vw - 24px)' }}
      title={batch ? tr('batchTitle', { count: items.length }) : tr('title')}
      maskClosable={false}
      closable={!busy}
      onCancel={() => onClose(pending)}
      footer={
        <div className={styles.submissionFooter}>
          <Button disabled={busy} onClick={() => onClose(pending)}>
            {tr('close')}
          </Button>
          {onRefresh && !pending && rows?.some((row) => row.recovery === 'refresh') && (
            <Button onClick={() => onRefresh(items.map((item) => item.planId))}>
              {tr('refreshSelection')}
            </Button>
          )}
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
      <div className={styles.submissionBody}>
        {items.some((item) => item.kind === 'approve') && (
          <label className={styles.formControl}>
            <span>
              {t(
                `common.assistantSurface.regionalApproval.liveBatch.${needsService ? 'mixedRemark' : 'approveRemark'}`,
              )}
            </span>
            <Input.TextArea
              value={remark}
              maxLength={1000}
              showWordLimit
              disabled={busy || attempted}
              aria-label={t('common.assistantSurface.regionalApproval.liveBatch.remarkLabel')}
              placeholder={t(
                'common.assistantSurface.regionalApproval.liveAction.remarkPlaceholder',
              )}
              autoSize={{ minRows: 3, maxRows: 5 }}
              onChange={setRemark}
            />
          </label>
        )}
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
        {needsService && !connected && (
          <Alert
            type="warning"
            content={tr(
              unavailableReason === 'signed-out'
                ? 'errors.serviceSignedOut'
                : unavailableReason === 'configuration'
                  ? 'errors.serviceConfiguration'
                  : unavailableReason === 'tenant'
                    ? 'errors.serviceTenant'
                    : unavailableReason === 'credential'
                      ? 'errors.serviceCredential'
                      : 'disabled.serviceBoundary',
            )}
          />
        )}
        {!rows ? <Spin /> : null}
        {rows?.map((row, index) => (
          <section
            key={row.item.versionId}
            className={styles.submissionItem}
            aria-label={label(row)}
          >
            <div className={styles.adjustmentHeader}>
              <strong>
                {row.item.row.dealerName || row.item.row.dealerCode || label(row)}
                {row.item.row.dealerName && row.item.row.dealerName !== label(row)
                  ? ` · ${label(row)}`
                  : ''}
              </strong>
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
            {row.source &&
              (row.changes.length ? (
                <div className={styles.submissionDetails} aria-label={tr('changedDetails')}>
                  <div className={styles.submissionChangeHeader}>
                    <span>{tr('material')}</span>
                    <span>{tr('before')}</span>
                    <span>{tr('after')}</span>
                  </div>
                  {row.changes.map(({ sku, before, after }) => (
                    <div key={sku.skuCode} className={styles.submissionChangeRow}>
                      <span>
                        {sku.skuCode}
                        <small>
                          {sku.materialDescription || sku.skuName || sku.productCategName}
                        </small>
                      </span>
                      <span>
                        {correctionDecimal(before).toFixed()}
                        <small>
                          ¥{correctionDecimal(before).mul(correctionDecimal(sku.price)).toFixed(2)}
                        </small>
                      </span>
                      <strong>
                        {correctionDecimal(after).toFixed()}
                        <small>
                          ¥{correctionDecimal(after).mul(correctionDecimal(sku.price)).toFixed(2)}
                        </small>
                      </strong>
                    </div>
                  ))}
                </div>
              ) : (
                <span>{tr('noChanges')}</span>
              ))}
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
                    : [
                        tr(
                          `errors.${row.error}`,
                          row.error === 'skuValueChanged' && row.errorValues
                            ? { ...row.errorValues, field: tr(`fields.${row.errorValues.field}`) }
                            : row.errorValues,
                        ),
                        row.rejection,
                      ]
                        .filter(Boolean)
                        .join(' ')
                }
              />
            )}
            {row.recovery === 'draft' && !attempted && (
              <Button
                disabled={busy}
                onClick={() => {
                  setRows(undefined);
                  setIgnoredDrafts((current) => new Set([...current, row.item.versionId]));
                }}
              >
                {tr('ignoreStaleDraft')}
              </Button>
            )}
            {row.ignoredDraft && <Alert type="warning" content={tr('draftIgnored')} />}
            {row.status === 'success' && <Alert type="success" content={tr('itemSuccess')} />}
          </section>
        ))}
      </div>
    </Modal>
  );
}
