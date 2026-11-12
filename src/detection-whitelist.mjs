/** State authority is PG-Warning via the GEA SQL whitelist API. No local database or file fallback. */
export function createWhitelistStore(ctx) {
  let revision;
  const invoke = async (body) => {
    const response = await ctx.connection.createSharedFetchHandler('/api').fetch(
      new Request('http://host/api/gea-proof/warning/storage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    );
    const result = await response.json();
    if (!response.ok || result.ok !== true)
      throw Object.assign(Error(result.error?.message || '预警白名单接口不可用'), {
        code: result.error?.code || 'WARNING_STORAGE_FAILED',
      });
    return result.value;
  };
  return {
    async load() {
      const value = await invoke({ operation: 'load' });
      revision = value.revision;
      return { tasks: value.tasks, runs: value.runs, events: value.events };
    },
    async save(state) {
      if (!revision) throw Error('请先从白名单接口读取预警记录');
      const result = await invoke({ operation: 'save', state, expectedRevision: revision });
      if (result.saved !== true || typeof result.revision !== 'string')
        throw Error('预警保存回执不完整');
      revision = result.revision;
    },
    async close() {},
  };
}
