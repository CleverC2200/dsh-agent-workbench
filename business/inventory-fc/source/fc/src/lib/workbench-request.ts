import { requireLiveWarehouseSnapshot, type WarehouseId } from './domain.ts';

/** Bound both response headers and body reads; cancellation never becomes a stale result. */
export async function fetchWorkbenchSnapshot(
  url: string,
  warehouseId: WarehouseId,
  init: RequestInit = {},
  timeoutMs = 20_000,
) {
  const signal = AbortSignal.any([
    ...(init.signal ? [init.signal] : []),
    AbortSignal.timeout(timeoutMs),
  ]);
  try {
    const response = await fetch(url, { ...init, cache: 'no-store', signal });
    const payload = await response.json();
    signal.throwIfAborted();
    if (!response.ok) throw new Error(payload.message || '分仓数据读取失败');
    return requireLiveWarehouseSnapshot(warehouseId, payload.snapshot);
  } catch (error) {
    if (!init.signal?.aborted && signal.aborted)
      throw new Error('读取超时，请重试；也可以先查看其他页签。');
    throw error;
  }
}
