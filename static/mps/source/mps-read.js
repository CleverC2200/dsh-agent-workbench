import { call } from '../../../business/shared/channel.js';
import { createQueryClient } from '../../../business/shared/configured-query-client.mjs';

const offline = () => globalThis.navigator?.onLine === false;
const transient =
  /\b(?:GEA_SQL_QUERY_TIMEOUT|GEA_SQL_UNAVAILABLE|AI_GATEWAY_(?:MCP_|SQL_)?(?:TIMEOUT|UNAVAILABLE)|ECONNRESET|ETIMEDOUT|EAI_AGAIN|ERR_NETWORK_CHANGED|ERR_CONNECTION_RESET)\b|业务请求超时|Failed to fetch|NetworkError when attempting to fetch/i;

export function readFailure(error) {
  const details = [error, error?.cause, error?.failure, error?.error, error?.cause?.failure]
    .filter(Boolean)
    .flatMap((entry) =>
      typeof entry === 'string'
        ? [entry]
        : [entry.code, entry.errorCode, entry.reasonCode, entry.message],
    )
    .filter(Boolean)
    .join(' ');
  if (
    /权限|ACCESS_DENIED|PERMISSION_DENIED|REQUIRED_COLUMN_UNAVAILABLE|NO_RETURN_COLUMN_ALLOWED/.test(
      details,
    )
  )
    return { kind: 'permission', text: '当前账号缺少所需数据权限，请联系管理员核对。' };
  if (
    /页面能力尚未连接|会话已失效|SESSION_(?:EXPIRED|REJECTED|NOT_FOUND|MAX_LIFETIME_EXCEEDED)/.test(
      details,
    )
  )
    return { kind: 'connection', text: '数据会话未连接，请使用工作台的「重新连接页面能力」。' };
  if (/GEA_MPS_OFFLINE|设备当前离线/.test(details))
    return { kind: 'offline', text: '设备当前离线，请联网后重试此项。' };
  if (transient.test(details) || /连接暂时不稳定/.test(details))
    return { kind: 'network', text: '连接暂时不稳定，请重试此项。' };
  if (/暂无可用发货日期/.test(details))
    return {
      kind: 'missing',
      text: '统计基月暂无可用发货日期，请到「本月预估发货」核对日期和来源。',
    };
  if (
    /尚未发布|未启用|RESOURCE_NOT_IN_DATASET|RESOURCE_NOT_PUBLISHED|FIELD_NOT_PUBLISHED/.test(
      details,
    )
  )
    return { kind: 'unavailable', text: '所需数据源尚未启用或发布，请联系管理员核对。' };
  return { kind: 'failed', text: '数据读取失败，请重试此项。' };
}

export function readFailureText(error) {
  const { kind, text } = readFailure(error);
  return kind === 'network' || kind === 'offline' ? text : (error?.message ?? text);
}

function retryDelay(signal) {
  return new Promise((resolve, reject) => {
    signal?.throwIfAborted();
    const finish = (error) => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      if (error) reject(error);
      else resolve();
    };
    const abort = () => finish(signal.reason);
    const timer = setTimeout(finish, 650);
    signal?.addEventListener('abort', abort, { once: true });
  });
}

export function createMpsQueryClient(config) {
  return createQueryClient(config, async (_request, { queryId, values, signal }) => {
    const execute = async () => {
      signal?.throwIfAborted();
      if (offline())
        throw Object.assign(Error('设备当前离线，请联网后重试此项。'), { code: 'GEA_MPS_OFFLINE' });
      return call('sql', { queryId, parameters: values }, { signal });
    };
    const outcome = await execute().then(
      (result) => ({ result }),
      (error) => ({ error }),
    );
    if (
      outcome.result &&
      outcome.result.success !== false &&
      !outcome.result.error &&
      !outcome.result.failure
    )
      return outcome.result;
    if (
      !signal?.aborted &&
      !offline() &&
      readFailure(outcome.error ?? outcome.result).kind === 'network'
    ) {
      const retry = { queryId };
      window.dispatchEvent(new CustomEvent('mps-read-retry', { detail: { retry, active: true } }));
      try {
        await retryDelay(signal);
        return await execute();
      } finally {
        window.dispatchEvent(
          new CustomEvent('mps-read-retry', { detail: { retry, active: false } }),
        );
      }
    }
    if (outcome.error) throw outcome.error;
    return outcome.result;
  });
}

export function canPrefetchMps() {
  const { connection, hardwareConcurrency, deviceMemory } = navigator;
  return (
    document.visibilityState === 'visible' &&
    !offline() &&
    (hardwareConcurrency ?? 0) >= 4 &&
    (deviceMemory ?? 4) >= 4 &&
    !connection?.saveData &&
    !['slow-2g', '2g', '3g'].includes(connection?.effectiveType) &&
    (connection?.rtt ?? 0) <= 350 &&
    (connection?.downlink ?? 2) >= 2
  );
}
