import { fcPersistence } from './fc-storage-client';
import type { FcStoreScope } from '../../../../../shared/fc-persistence';

/** Recover only the persisted receipt. This path never calls DMS or creates another SQL write. */
export async function verifyFcReceiptArchive(scope: FcStoreScope, signal: AbortSignal) {
  signal.throwIfAborted();
  if (scope.kind !== 'submission' || !scope.entityId) throw Error('补货回执核对参数无效');
  if (fcPersistence.pending(scope)) await fcPersistence.verify(scope, signal);
  signal.throwIfAborted();
  const saved = await fcPersistence.load(scope, signal);
  signal.throwIfAborted();
  const receipt = saved.value?.receipt;
  if (
    saved.value?.stage !== 'dms-received' ||
    saved.value.aiPreOrderCode !== scope.entityId ||
    typeof receipt?.orderCode !== 'string' ||
    !receipt.orderCode.trim() ||
    typeof receipt.aiPreOrderCode !== 'string' ||
    !receipt.aiPreOrderCode.trim() ||
    (receipt.requestAiPreOrderCode ?? receipt.aiPreOrderCode) !== scope.entityId
  )
    throw Error('补货回执尚未完成归档，请由管理员核对原请求；未重新下单');
  return receipt;
}

const canonical = (value: any): string =>
  JSON.stringify(value, (_k, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, v[k]]),
        )
      : v,
  );
/** Confirmed snapshot precedes DMS; DMS acknowledgement is retained even if SQL receipt persistence fails. */
export async function persistAndSubmitFc(
  warehouseCode: string,
  snapshot: any,
  signal: AbortSignal,
  submit: () => Promise<any>,
  acknowledge: (receipt: any) => void,
  legacyAiPreOrderCode?: string,
) {
  signal.throwIfAborted();
  if (legacyAiPreOrderCode) {
    const legacyScope = {
      kind: 'submission' as const,
      warehouseCode,
      entityId: legacyAiPreOrderCode,
    };
    if (fcPersistence.pending(legacyScope)) await fcPersistence.verify(legacyScope, signal);
    const legacy = await fcPersistence.load(legacyScope, signal);
    signal.throwIfAborted();
    if (legacy.value) {
      if (legacy.value.stage !== 'dms-received')
        throw Error('旧补货批次尚未完成核对，不能切换新批次下单');
      const confirmed = {
        ...legacy.value,
        stage: 'confirmed',
        aiPreOrderCode: snapshot.aiPreOrderCode,
      };
      delete confirmed.receipt;
      const sorted = (value: any) => ({
        ...value,
        ...(Array.isArray(value.rows)
          ? { rows: value.rows.slice().sort((a: any, b: any) => a.sku.localeCompare(b.sku)) }
          : {}),
      });
      if (canonical(sorted(confirmed)) === canonical(sorted(snapshot))) {
        acknowledge(legacy.value.receipt);
        return legacy.value.receipt;
      }
    }
  }
  const scope = { kind: 'submission' as const, warehouseCode, entityId: snapshot.aiPreOrderCode };
  if (fcPersistence.pending(scope)) await fcPersistence.verify(scope, signal);
  // Verification confirms the original event; a later receipt or unknown event still wins.
  let previous = await fcPersistence.load(scope, signal);
  signal.throwIfAborted();
  if (previous.value?.stage === 'dms-received') {
    acknowledge(previous.value.receipt);
    return previous.value.receipt;
  }
  if (previous.value?.stage === 'dms-unknown')
    throw Error('该补货批次DMS结果待核对，不自动重新下单');
  if (previous.value && canonical(previous.value) !== canonical(snapshot))
    throw Error('同一补货批次的确认快照已变化，请核对原记录');
  // Reserve the maximum serialized receipt size before DMS accepts an order.
  const archived = {
    ...snapshot,
    stage: 'dms-received',
    receipt: {
      orderCode: '\u0000'.repeat(128),
      aiPreOrderCode: '\u0000'.repeat(64),
      requestAiPreOrderCode: snapshot.aiPreOrderCode,
    },
  };
  if (new TextEncoder().encode(JSON.stringify(archived)).byteLength > 48000)
    throw Error('确认快照过大，无法为DMS回执留出归档空间；请减少本批SKU或扩展保存接口');
  if (snapshot.calculationContext) {
    for (const [kind, revision] of [
      ['plans', snapshot.planRevision],
      ['cycles', snapshot.cycleRevision],
    ] as const) {
      const current = await fcPersistence.load({ kind, warehouseCode }, signal);
      signal.throwIfAborted();
      if (current.revision !== revision)
        throw Error('已保存的计划或周期版本已变化，请重新读取后确认');
    }
  }
  if (!previous.value)
    previous = await fcPersistence.save(scope, previous.revision, snapshot, signal);
  signal.throwIfAborted();
  let receipt;
  try {
    receipt = await submit();
    signal.throwIfAborted();
  } catch (error) {
    if (!signal.aborted)
      await fcPersistence
        .save(
          scope,
          previous.revision,
          { ...snapshot, stage: 'dms-unknown', errorCode: 'DMS_RESULT_UNVERIFIED' },
          signal,
        )
        .catch(() => undefined);
    throw error;
  }
  acknowledge(receipt);
  await fcPersistence.save(
    scope,
    previous.revision,
    { ...snapshot, stage: 'dms-received', receipt },
    signal,
  );
  return receipt;
}
