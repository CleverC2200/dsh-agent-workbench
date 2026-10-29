export type FcStoreKind = 'plans' | 'cycles' | 'submission';
export type FcStoreScope = { kind: FcStoreKind; warehouseCode: string; entityId?: string };
export type FcStoreRead = { status: string; revision: string; value: any };
type Storage = {
  keys?(): string[];
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};
type Call = (method: string, input: any, options: { signal: AbortSignal }) => Promise<any>;
/** Pending user write intent is kept under the existing identity/session owner, never a credential. */
export class FcPersistence {
  constructor(
    private call: Call,
    private storage: Storage,
  ) {}
  private key(scope: FcStoreScope) {
    return (
      'branch-inventory:v1:write-intent:' +
      JSON.stringify([scope.kind, scope.warehouseCode, scope.entityId ?? ''])
    );
  }
  pending(scope: FcStoreScope) {
    return this.storage.getItem(this.key(scope)) !== null;
  }
  /** Only locate existing receipt write intents; their contents are not a verified receipt. */
  pendingReceipts(): FcStoreScope[] {
    const scopes: FcStoreScope[] = [];
    for (const key of this.storage.keys?.() ?? []) {
      if (!key.startsWith('branch-inventory:v1:write-intent:')) continue;
      try {
        const request = JSON.parse(JSON.parse(this.storage.getItem(key)!).request);
        if (
          request.kind === 'submission' &&
          request.operation === 'save' &&
          request.value?.stage === 'dms-received' &&
          typeof request.warehouseCode === 'string' &&
          typeof request.entityId === 'string'
        ) {
          const scope: FcStoreScope = {
            kind: 'submission',
            warehouseCode: request.warehouseCode,
            entityId: request.entityId,
          };
          if (this.key(scope) === key) scopes.push(scope);
        }
      } catch {
        // Preserve malformed intents for diagnosis; never reinterpret them as completed writes.
      }
    }
    return scopes;
  }
  async load(scope: FcStoreScope, signal: AbortSignal): Promise<FcStoreRead> {
    const result = await this.call('branch-storage', { ...scope, operation: 'load' }, { signal });
    signal.throwIfAborted();
    if (result?.status !== 'loaded') throw Error('业务数据回读失败');
    return result;
  }
  async save(
    scope: FcStoreScope,
    baseRevision: string,
    value: unknown,
    signal: AbortSignal,
  ): Promise<FcStoreRead> {
    if (this.pending(scope)) throw Error('该数据有待核对的保存请求，请先核对原请求；不会重复写入');
    if (new TextEncoder().encode(JSON.stringify(value)).byteLength > 48000)
      throw Error('当前完整版本超过48KB，不能拆成部分保存；请联系管理员扩展批次接口');
    const request = { ...scope, operation: 'save', baseRevision, value };
    const journal = { request: JSON.stringify(request), requestedAt: new Date().toISOString() };
    this.storage.setItem(this.key(scope), JSON.stringify(journal));
    const result = await this.call('branch-storage', request, { signal });
    signal.throwIfAborted();
    if (result?.idempotencyKey)
      this.storage.setItem(
        this.key(scope),
        JSON.stringify({
          ...journal,
          idempotencyKey: result.idempotencyKey,
          ...(result.traceId ? { traceId: result.traceId } : {}),
        }),
      );
    if (result?.status !== 'saved')
      throw Error(
        `保存${result?.status === 'saved-unverified' ? '已确认，回读待核对' : '结果待核对'}；请核对原请求${result?.idempotencyKey ? ' ' + result.idempotencyKey : ''}${result?.traceId ? '，追踪号 ' + result.traceId : ''}`,
      );
    this.storage.removeItem(this.key(scope));
    return result;
  }
  async verify(scope: FcStoreScope, signal: AbortSignal): Promise<FcStoreRead> {
    const saved = this.storage.getItem(this.key(scope));
    if (!saved) return this.load(scope, signal);
    const request = JSON.parse(JSON.parse(saved).request);
    const result = await this.call(
      'branch-storage',
      { ...request, operation: 'verify' },
      { signal },
    );
    signal.throwIfAborted();
    if (result?.status !== 'saved')
      throw Error(
        '原请求仍未核实，请保留原请求并由管理员核对；未重新写入' +
          (result?.idempotencyKey ? '。原键：' + result.idempotencyKey : ''),
      );
    this.storage.removeItem(this.key(scope));
    return result;
  }
}
