import { isBackendHttpError } from '../../http-error.ts';
import { businessSafeErrorMessage, reportSalesPlanError } from './models/salesPlanActionModel.ts';
import {
  correctionDecision,
  correctionLine,
  correctionDecimal,
} from './models/salesPlanCorrectionModel.ts';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Checkbox, Input, Modal, Spin } from '@arco-design/web-react';
import type { TFunction } from 'i18next';
import type {
  GeaSalesPlanPeriod,
  GeaSalesPlanSku,
  GeaSalesPlanSubmitReceipt,
} from '../../contracts.ts';
import {
  prepareSalesPlanResubmit,
  salesPlanResubmitReadbackMatches,
  SalesPlanSubmitAttempt,
  classifySalesPlanSubmitError,
  type SalesPlanResubmitSource,
  type SalesPlanSubmitClient,
} from './models/salesPlanSubmitModel.ts';

/** 编辑刚读取的退回版本；只有已连接的 Host 可以提交。 */
export function RegionalApprovalResubmitDialog({
  planId,
  versionId,
  period,
  client,
  connected,
  visible = true,
  onPendingChange,
  t,
  onClose,
  onSucceeded,
}: {
  planId: string;
  versionId: string;
  period: GeaSalesPlanPeriod;
  client: SalesPlanSubmitClient;
  connected: boolean;
  visible?: boolean;
  onPendingChange?: (pending: boolean) => void;
  t: TFunction;
  onClose: (pending: boolean) => void;
  onSucceeded: () => void;
}) {
  const tr = (key: string, values?: Record<string, unknown>) =>
    t(`common.assistantSurface.regionalApproval.liveSubmit.${key}`, values);
  const [source, setSource] = useState<SalesPlanResubmitSource>();
  const [skus, setSkus] = useState<GeaSalesPlanSku[]>([]);
  const [correctionEdits, setCorrectionEdits] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [rejection, setRejection] = useState('');
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [confirmed, setConfirmed] = useState(false);
  const [attempt, setAttempt] = useState<SalesPlanSubmitAttempt>();
  const [retryable, setRetryable] = useState(false);
  const [receipt, setReceipt] = useState<GeaSalesPlanSubmitReceipt>();
  const [verified, setVerified] = useState(false);
  const pending = Boolean(
    attempt &&
    !verified &&
    (busy || retryable || receipt || error === 'unavailable' || error === 'retryExhausted'),
  );
  useEffect(() => onPendingChange?.(pending), [pending, onPendingChange]);
  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      client.detail.invoke({ planId, signal: controller.signal }),
      client.currentUser.invoke(),
    ])
      .then(async ([detail, currentUser]) => {
        if (detail.currentVersion.id !== versionId || !detail.currentVersion.effective)
          throw new Error('sourceMismatch');
        const rows = await client.versionSkus.invoke({
          versionId,
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        setSource({
          planId,
          versionId,
          period,
          detail,
          currentUser,
          skus: rows,
        });
        setSkus(rows);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error && cause.message === 'sourceMismatch'
              ? 'sourceMismatch'
              : 'sourceLoad',
          );
      });
    return () => controller.abort();
  }, [planId, versionId, period, client]);
  const input = useMemo(() => {
    if (!source) return undefined;
    try {
      const submitted =
        source.detail.currentVersion.orderType === 'Z'
          ? skus.map((sku) => {
              const input = correctionEdits[sku.skuCode];
              if (input === undefined) return sku;
              const line = correctionLine(sku, input);
              return { ...sku, adjAddQty: line.addQty, adjCutQty: line.cutQty };
            })
          : skus;
      return prepareSalesPlanResubmit({ ...source, skus: submitted });
    } catch {
      return undefined;
    }
  }, [source, skus, correctionEdits]);
  const readBack = async (value: GeaSalesPlanSubmitReceipt) => {
    const detail = await client.detail.invoke({ planId });
    if (!salesPlanResubmitReadbackMatches(versionId, value, detail, input?.request, source?.skus))
      throw new Error('readback');
    setVerified(true);
    onSucceeded();
  };
  const submit = async () => {
    if (!connected || !input || !confirmed || submitting.current || verified) return;
    submitting.current = true;
    setBusy(true);
    setError('');
    setRejection('');
    setRetryable(false);
    try {
      if (receipt) {
        await readBack(receipt);
        return;
      }
      let value;
      if (attempt) value = await attempt.retry();
      else {
        const fresh = await client.detail.invoke({ planId });
        if (
          fresh.currentVersion.id !== versionId ||
          fresh.currentVersion.status !== source?.detail.currentVersion.status ||
          !fresh.currentVersion.effective
        ) {
          setError('conflict');
          return;
        }
        const next = new SalesPlanSubmitAttempt(client);
        setAttempt(next);
        value = await next.submit(input);
      }
      setReceipt(value);
      await readBack(value);
    } catch (cause) {
      const failure = classifySalesPlanSubmitError(cause);
      setError(failure.kind);
      if (isBackendHttpError(failure.cause)) {
        const id = reportSalesPlanError('sales-plan-submit', failure.cause);
        setRejection(
          [
            failure.cause.status < 500
              ? businessSafeErrorMessage(
                  failure.cause.backendMessage.replace(/^GEA_HTTP_\d{3}[：:]\s*/u, ''),
                )
              : undefined,
            tr('requestReference', { id }),
          ]
            .filter(Boolean)
            .join(' '),
        );
      }
      setRetryable(failure.retrySameIntent);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };
  return (
    <Modal
      visible={visible}
      title={tr('title')}
      onCancel={() => onClose(pending)}
      closable={!busy}
      maskClosable={false}
      footer={
        <>
          <Button disabled={busy} onClick={() => onClose(pending)}>
            {tr('close')}
          </Button>
          <Button
            type="primary"
            loading={busy}
            disabled={
              !connected ||
              !input ||
              !confirmed ||
              verified ||
              Boolean(attempt && !retryable && !receipt)
            }
            onClick={() => void submit()}
          >
            {tr(receipt ? 'refresh' : attempt && retryable ? 'retry' : 'confirm')}
          </Button>
        </>
      }
    >
      {!connected && <Alert type="warning" content={tr('disabled.serviceBoundary')} />}
      {!source && !error ? <Spin /> : null}
      {source && (
        <>
          <p>
            {tr('plan')}: {planId}
          </p>
          <p>
            {tr('version')}: {versionId} · {tr('period')}: {period.periodMonth}
          </p>
          <p>
            {tr('submitter', {
              code: source.currentUser.id,
              name: source.currentUser.username,
            })}
          </p>
          <p>
            {source.detail.currentVersion.returnReason ??
              source.detail.logs.filter((log) => log.actionCode === 'REJECT').at(-1)?.remark}
          </p>
          {source.detail.currentVersion.orderType === 'M' && (
            <Alert type="info" content={tr('inheritance')} />
          )}
          <div style={{ maxHeight: 360, overflow: 'auto' }}>
            {skus.map((sku, index) => (
              <label
                key={sku.skuCode}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  flexWrap: 'wrap',
                  marginBottom: 8,
                }}
              >
                <span>
                  {sku.skuCode} · {sku.productCategName}
                </span>
                <span>
                  {tr('unitPrice')}: {sku.price}
                </span>
                <span>
                  {tr('lineAmount')}:{' '}
                  {(() => {
                    try {
                      return correctionDecimal(sku.qty)
                        .mul(correctionDecimal(sku.price))
                        .toDecimalPlaces(2)
                        .toFixed(2);
                    } catch {
                      return '—';
                    }
                  })()}
                </span>
                {source.detail.currentVersion.orderType === 'M' && (
                  <span>
                    {tr('inheritedValues', {
                      region:
                        source.detail.currentVersion.status >= 7
                          ? `${sku.regionConfirmedQty ?? '—'} / ${sku.regionConfirmedAmount ?? '—'}`
                          : '—',
                      province:
                        source.detail.currentVersion.status >= 8
                          ? `${sku.provinceConfirmedQty ?? '—'} / ${sku.provinceConfirmedAmount ?? '—'}`
                          : '—',
                      area:
                        source.detail.currentVersion.status >= 9
                          ? `${sku.areaConfirmedQty ?? '—'} / ${sku.areaConfirmedAmount ?? '—'}`
                          : '—',
                    })}
                  </span>
                )}
                <Input
                  aria-label={`${source.detail.currentVersion.orderType === 'Z' ? '纠偏调整量' : tr('quantity')} ${sku.skuCode}`}
                  value={
                    source.detail.currentVersion.orderType === 'Z'
                      ? (correctionEdits[sku.skuCode] ??
                        (() => {
                          try {
                            return correctionDecision(sku, 0, source.period.planTypeCode);
                          } catch {
                            return '';
                          }
                        })())
                      : sku.qty
                  }
                  disabled={busy || Boolean(attempt)}
                  onChange={(qty) => {
                    setConfirmed(false);
                    if (source.detail.currentVersion.orderType === 'Z')
                      setCorrectionEdits((values) => ({ ...values, [sku.skuCode]: qty }));
                    else
                      setSkus((rows) =>
                        rows.map((row, i) => (i === index ? { ...row, qty } : row)),
                      );
                  }}
                />
              </label>
            ))}
          </div>
          {input ? (
            <p>
              {tr('sourceSummary', {
                count: input.sourceSummary.skuCount,
                quantity: input.sourceSummary.submittedQty,
                amount: input.sourceSummary.submittedAmount,
              })}{' '}
              · {tr('nextStatus')}: {input.expected.nextStatus}
            </p>
          ) : (
            <Alert type="error" content={tr('errors.validation')} />
          )}
          <Checkbox checked={confirmed} disabled={busy || Boolean(attempt)} onChange={setConfirmed}>
            {tr('confirmation')}
          </Checkbox>
        </>
      )}
      {error && (
        <Alert
          type="error"
          content={
            receipt
              ? tr('refreshFailed')
              : [tr(`errors.${error}`), rejection].filter(Boolean).join(' ')
          }
        />
      )}
      {verified && receipt && (
        <Alert
          type="success"
          content={tr('success', {
            ...receipt,
            replayed: tr(receipt.replayed ? 'replayed' : 'created'),
          })}
        />
      )}
    </Modal>
  );
}
