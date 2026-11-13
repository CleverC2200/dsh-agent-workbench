import { Alert, Button, Input, Modal, Spin } from '@arco-design/web-react';
import type { TFunction } from 'i18next';
import React, { useEffect, useRef, useState } from 'react';
import {
  useWorkbenchHost,
  type GeaSalesPlanActionRequest,
  type GeaSalesPlanDetail,
} from '../../bridge.ts';
import {
  salesPlanReturnDestination,
  salesPlanReturnAdjustments,
} from './models/salesPlanReturnModel.ts';
import { salesPlanApprovalDraftValues } from './models/salesPlanLocalDraftModel.ts';
import {
  SalesPlanActionAttempt,
  classifySalesPlanActionError,
  type SalesPlanActionClient,
  type SalesPlanActionError,
} from './models/salesPlanActionModel.ts';
import {
  checkSubmissionSource,
  checkSubmissionSkus,
  SubmissionSourceError,
} from './models/salesPlanPreflightModel.ts';
import { salesPlanAccessForRow, type SalesPlanAccess } from './models/salesPlanAccessModel.ts';
import type { RegionalApprovalLiveRow } from './regionalApprovalQueryModel.ts';
import { actionErrorText } from './RegionalApprovalLiveActionDialog.tsx';
import styles from './RegionalApprovalActionDialog.module.css';

export type BatchActionKind = 'APPROVE' | 'REJECT';

const AUTO_CLOSE_SECONDS = 5;

export type BatchActionItem = {
  row: RegionalApprovalLiveRow;
  detail?: GeaSalesPlanDetail;
  pendingValues?: Record<string, string>;

  access?: SalesPlanAccess;

  skipReason?: string;
};

export type BatchActionOutcome = {
  planId: string;
  label: string;

  context?: string;
  status: 'success' | 'failed' | 'skipped' | 'pending';

  detail?: string;
};

const planLabel = (row: RegionalApprovalLiveRow) =>
  row.dealerName?.trim() || row.orgName?.trim() || row.planId;

const planContext = (row: RegionalApprovalLiveRow) =>
  [row.areaName, row.provinceName, row.orgName]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
    .join(' / ');

const RegionalApprovalBatchActionDialog: React.FC<{
  visible: boolean;
  kind: BatchActionKind;
  items: readonly BatchActionItem[];
  t: TFunction;
  client?: SalesPlanActionClient;
  onPermissionDenied: (versionId: string) => void;
  onCompleted: (outcomes: readonly BatchActionOutcome[]) => void | Promise<void>;
  onClose: (pending?: boolean) => void;
  onPendingChange?: (pending: boolean, message: string) => void;
}> = ({
  visible,
  kind,
  items,
  t,
  client,
  onPermissionDenied,
  onCompleted,
  onClose,
  onPendingChange,
}) => {
  const { salesPlan } = useWorkbenchHost();
  const submitting = useRef(false);
  const attempts = useRef(new Map<string, SalesPlanActionAttempt>());
  const [remark, setRemark] = useState('');
  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [outcomes, setOutcomes] = useState<BatchActionOutcome[]>();
  const [secondsToClose, setSecondsToClose] = useState<number>();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!outcomes) return;
    if (outcomes.some((outcome) => outcome.status !== 'success')) {
      setSecondsToClose(undefined);
      return;
    }
    setSecondsToClose(AUTO_CLOSE_SECONDS);
    const timer = window.setInterval(
      () =>
        setSecondsToClose((current) =>
          current === undefined ? current : Math.max(0, current - 1),
        ),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [outcomes]);

  useEffect(() => {
    if (secondsToClose !== 0) return;
    closeRef.current();
  }, [secondsToClose]);

  const mixedReject =
    kind === 'REJECT' &&
    items.some((item) => item.row.status >= 7 && item.row.status <= 9) &&
    items.some((item) => item.row.status >= 1 && item.row.status <= 4);
  const submittable = items.filter((item) => item.access?.allowedActions.includes(kind));
  const submitted = outcomes?.filter((outcome) => outcome.status === 'success').length ?? 0;
  const failed = outcomes?.filter((outcome) => outcome.status === 'failed').length ?? 0;
  const skipped = outcomes?.filter((outcome) => outcome.status === 'skipped').length ?? 0;
  const resultRows = outcomes ?? [];
  const pending = outcomes?.some((outcome) => outcome.status === 'pending') ?? false;
  const pendingMessage =
    outcomes
      ?.filter((outcome) => outcome.status === 'pending')
      .map((outcome) => outcome.detail)
      .join('；') ?? '';
  useEffect(
    () => onPendingChange?.(pending, pendingMessage),
    [pending, pendingMessage, onPendingChange],
  );
  const locked = busy || outcomes !== undefined;
  const invalid = !submittable.length || (kind === 'REJECT' && !remark.trim());

  const skipText = (item: BatchActionItem) =>
    item.skipReason
      ? t(`common.assistantSurface.regionalApproval.liveAction.disabled.${item.skipReason}`)
      : t('common.assistantSurface.regionalApproval.liveBatch.skipped');

  const checkResult = async (
    item: BatchActionItem,
    attempt?: SalesPlanActionAttempt,
  ): Promise<BatchActionOutcome> => {
    const label = planLabel(item.row);
    let reason = 'resultUnconfirmed';
    try {
      const detail = await salesPlan.detail.invoke({ planId: item.row.planId });
      if (attempt?.resultConfirmed(detail))
        return {
          planId: item.row.planId,
          label,
          context: planContext(item.row),
          status: 'success',
        };
      if (detail.currentVersion.id !== item.row.versionId) reason = 'resultVersionChanged';
    } catch {
      reason = 'resultReadFailed';
    }
    return {
      planId: item.row.planId,
      label,
      context: planContext(item.row),
      status: 'pending',
      detail: t('common.assistantSurface.regionalApproval.liveSubmit.pendingNotice', {
        plan: label,
        reason: t(`common.assistantSurface.regionalApproval.liveSubmit.errors.${reason}`),
      }),
    };
  };

  const submit = async () => {
    setAttempted(true);
    if (invalid || busy || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    const collected: BatchActionOutcome[] = [];
    for (const item of items) {
      const previous = outcomes?.find((outcome) => outcome.planId === item.row.planId);
      if (
        previous &&
        (['success', 'skipped'].includes(previous.status) ||
          (pending && previous.status !== 'pending'))
      ) {
        collected.push(previous);
        continue;
      }
      if (previous?.status === 'pending') {
        collected.push(await checkResult(item, attempts.current.get(item.row.planId)));
        continue;
      }
      const label = planLabel(item.row);
      const context = planContext(item.row) || undefined;
      if (!item.access?.allowedActions.includes(kind)) {
        collected.push({
          planId: item.row.planId,
          label,
          ...(context ? { context } : {}),
          status: 'skipped',
          detail: skipText(item),
        });
        continue;
      }
      const request: GeaSalesPlanActionRequest = {
        approvalRole: item.access.approvalRole,
        ...(item.access.roleContractSupported
          ? { approvalPolicy: 'role-visible-v1' as const }
          : {}),
        action: kind,
        expectedStatus: item.row.status,
        ...(item.access.snapshotHash ? { expectedSnapshot: item.access.snapshotHash } : {}),
        ...(remark.trim() ? { remark: remark.trim() } : {}),
      };
      const attempt = new SalesPlanActionAttempt(client ?? salesPlan);
      let actionSubmitted = false;
      let preparingReturn = false;
      try {
        const fresh = await salesPlan.detail.invoke({ planId: item.row.planId });
        checkSubmissionSource(
          {
            planId: item.row.planId,
            versionId: item.row.versionId,
            row: item.row,
            period: { periodId: item.row.periodId, planTypeCode: item.row.planTypeCode },
          },
          fresh,
        );
        if (item.detail) checkSubmissionSkus(item.row.versionId, item.detail.skus, fresh.skus);
        const freshAccess = salesPlanAccessForRow(
          item.row,
          fresh,
          [item.access.approvalRole],
          item.access.approvalRole,
        );
        if (!freshAccess?.allowedActions.includes(kind))
          throw new SubmissionSourceError('accessChanged');
        if (freshAccess.snapshotHash) request.expectedSnapshot = freshAccess.snapshotHash;
        const stored = await salesPlan.draft?.invoke({
          planId: item.row.planId,
          versionId: item.row.versionId,
          approvalRole: item.access.approvalRole,
        });
        if (stored?.stale) throw new SubmissionSourceError('draftStale');
        if (kind === 'REJECT') {
          preparingReturn = true;
          if (!item.detail)
            throw new Error(
              t('common.assistantSurface.regionalApproval.returnDestinationUnavailable'),
            );
          const context = salesPlanReturnDestination(fresh, item.access.approvalRole);
          request.adjustments = salesPlanReturnAdjustments(
            fresh,
            item.row,
            item.access.approvalRole,
            context,
            stored?.draft?.role && stored.draft.role !== item.access.approvalRole
              ? []
              : (stored?.draft?.adjustments ?? []),
            item.pendingValues,
          );
          request.expectedReturnTargetStage = context.targetStage;
        } else {
          const adjustments = Object.entries(
            salesPlanApprovalDraftValues(
              fresh,
              item.row,
              item.access.approvalRole,
              stored?.draft?.role && stored.draft.role !== item.access.approvalRole
                ? []
                : (stored?.draft?.adjustments ?? []),
              item.pendingValues,
            ),
          )
            .filter(([, value]) => value.trim() && !/^[+-]?0+(?:\.0{1,3})?$/.test(value.trim()))
            .map(([skuCode, adjustQty]) => ({ skuCode, adjustQty: adjustQty.trim() }));
          if (adjustments.length) request.adjustments = adjustments;
        }
        actionSubmitted = true;

        attempts.current.set(item.row.planId, attempt);
        await attempt.submit({
          planId: item.row.planId,
          versionId: item.row.versionId,
          planTypeCode: item.row.planTypeCode,
          request,
          serverWorkflowResult: !item.access.snapshotHash,
          serverRoleResult: item.access.roleContractSupported,
        });
        collected.push({
          planId: item.row.planId,
          label,
          ...(context ? { context } : {}),
          status: 'success',
        });
      } catch (error) {
        const classified = classifySalesPlanActionError(error);
        if (classified.kind === 'permission') onPermissionDenied(item.row.versionId);
        if (actionSubmitted && classified.retrySameIntent) {
          collected.push(await checkResult(item, attempt));
          continue;
        }
        collected.push({
          planId: item.row.planId,
          label,
          ...(context ? { context } : {}),
          status: actionSubmitted && classified.retrySameIntent ? 'pending' : 'failed',
          detail:
            error instanceof SubmissionSourceError
              ? t(
                  `common.assistantSurface.regionalApproval.liveSubmit.errors.${error.key}`,
                  error.values,
                )
              : preparingReturn && !actionSubmitted
                ? t('common.assistantSurface.regionalApproval.returnDestinationUnavailable')
                : !actionSubmitted
                  ? t('common.assistantSurface.regionalApproval.liveSubmit.errors.sourceLoad')
                  : actionErrorText(t, classified as SalesPlanActionError),
        });
      }
    }
    setOutcomes(collected);
    setBusy(false);
    submitting.current = false;
    await onCompleted(collected);
  };

  const wasVisible = useRef(visible);
  useEffect(() => {
    const reopened = visible && !wasVisible.current;
    wasVisible.current = visible;
    if (reopened && pending && !busy) void submit();
  }, [visible, pending, busy, submit]);
  return (
    <Modal
      visible={visible}
      className={outcomes ? styles.resultModal : styles.liveModal}
      style={{ width: 'min(760px, calc(100vw - 24px))', maxWidth: 'calc(100vw - 24px)' }}
      title={t(
        kind === 'APPROVE'
          ? 'common.assistantSurface.regionalApproval.liveBatch.approveTitle'
          : 'common.assistantSurface.regionalApproval.liveBatch.rejectTitle',
        { count: items.length },
      )}
      maskClosable={false}
      closable={!busy}
      onCancel={() => {
        if (!busy) onClose(pending);
      }}
      footer={
        <div className={`${styles.footer} ${styles.batchFooter}`}>
          <div>
            <Button disabled={busy} onClick={() => onClose(pending)}>
              {t('common.assistantSurface.regionalApproval.liveBatch.close')}
            </Button>
          </div>
          <Button
            type="primary"
            status={kind === 'REJECT' ? 'danger' : undefined}
            loading={busy}
            disabled={
              invalid ||
              busy ||
              Boolean(
                outcomes &&
                !outcomes.some((outcome) => ['pending', 'failed'].includes(outcome.status)),
              )
            }
            onClick={() => void submit()}
          >
            {t(
              pending
                ? 'common.assistantSurface.regionalApproval.liveAction.retry'
                : outcomes
                  ? 'common.assistantSurface.regionalApproval.liveAction.submitAgain'
                  : kind === 'APPROVE'
                    ? 'common.assistantSurface.regionalApproval.liveBatch.confirmApprove'
                    : 'common.assistantSurface.regionalApproval.liveBatch.confirmReject',
            )}
          </Button>
        </div>
      }
    >
      <div className={styles.body} data-testid="regional-approval-batch-action-dialog">
        {!outcomes && (
          <>
            <p data-testid="regional-approval-batch-summary">
              {t('common.assistantSurface.regionalApproval.liveBatch.summary', {
                total: items.length,
                ready: submittable.length,
              })}
            </p>
            <ul className={styles.businessChecksum} data-testid="regional-approval-batch-items">
              {items.map((item) => (
                <li key={item.row.planId}>
                  <strong>{planLabel(item.row)}</strong>
                  {planContext(item.row) ? <span> · {planContext(item.row)}</span> : null}
                  {item.access?.allowedActions.includes(kind) ? (
                    mixedReject ? (
                      <span>
                        {' '}
                        ·{' '}
                        {t(
                          `common.assistantSurface.regionalApproval.liveBatch.${item.row.status >= 7 ? 'repeatRejectTag' : 'rejectTag'}`,
                        )}
                      </span>
                    ) : null
                  ) : (
                    <span> · {skipText(item)}</span>
                  )}
                </li>
              ))}
            </ul>
            <label className={styles.formControl}>
              <span>
                {t(
                  kind === 'REJECT'
                    ? 'common.assistantSurface.regionalApproval.liveAction.rejectRemark'
                    : 'common.assistantSurface.regionalApproval.liveBatch.approveRemark',
                )}
              </span>
              <Input.TextArea
                value={remark}
                maxLength={1000}
                showWordLimit
                disabled={locked}
                status={attempted && kind === 'REJECT' && !remark.trim() ? 'error' : undefined}
                aria-label={t('common.assistantSurface.regionalApproval.liveBatch.remarkLabel')}
                placeholder={t(
                  'common.assistantSurface.regionalApproval.liveAction.remarkPlaceholder',
                )}
                autoSize={{ minRows: 3, maxRows: 5 }}
                onChange={setRemark}
              />
            </label>
            {attempted && invalid && !locked ? (
              <Alert
                type="error"
                showIcon
                content={t('common.assistantSurface.regionalApproval.liveBatch.required')}
              />
            ) : null}
          </>
        )}
        {busy ? (
          <div className={styles.loadingState}>
            <Spin size={16} />
            <span>
              {t('common.assistantSurface.regionalApproval.liveBatch.loading', {
                count: items.length,
              })}
            </span>
          </div>
        ) : null}
        {outcomes ? (
          <div data-testid="regional-approval-batch-result" aria-live="polite">
            <Alert
              type={failed || pending ? 'warning' : 'success'}
              showIcon
              content={t('common.assistantSurface.regionalApproval.liveBatch.result', {
                success: submitted,
                failed,
                skipped,
                pending: outcomes.filter((outcome) => outcome.status === 'pending').length,
              })}
            />
            {secondsToClose === undefined ? null : (
              <p className={styles.formControl} data-testid="regional-approval-batch-autoclose">
                {t('common.assistantSurface.regionalApproval.liveBatch.autoClose', {
                  seconds: secondsToClose,
                })}
              </p>
            )}
            {resultRows.length > 0 ? (
              <ul className={styles.businessChecksum}>
                {resultRows.map((outcome) => (
                  <li key={outcome.planId}>
                    <strong>{outcome.label}</strong>
                    <span>
                      {' '}
                      · {outcome.planId} ·{' '}
                      {t(
                        `common.assistantSurface.regionalApproval.liveBatch.status.${outcome.status}`,
                      )}
                    </span>
                    {outcome.context ? <span> · {outcome.context}</span> : null}
                    {outcome.detail && <span> · {outcome.detail}</span>}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>
    </Modal>
  );
};

export default RegionalApprovalBatchActionDialog;
