/** One loaded period owns its revision and pending save; switching identity cancels that ownership. */
export function createReportPersistence(execute, status) {
  let owner;
  const notify = (state, message) => status(state, message);
  async function drain(current) {
    if (current.saving || current.failed || owner !== current) return;
    current.saving = true;
    try {
      while ((current.next || current.nextEdits) && owner === current) {
        current.request ??= {
          operation: current.nextEdits?'save-edits':'save', period: current.period, expectedVersion: current.nextEdits?current.editVersion:current.version,
          requestId: crypto.randomUUID(), report: current.nextEdits?{edits:current.nextEdits}:current.next,
        };
        notify('saving', '正在保存…');
        const result = await execute(current.request, current.signal);
        current.signal.throwIfAborted();
        if (owner !== current) return;
        const revision=current.request.operation==='save-edits'?'editVersion':'version';
        if (result.saved !== true || result.requestId !== current.request.requestId || result.version !== current[revision] + 1)
          throw Error('保存回执不完整');
        current[revision] = result.version;
        if(revision==='editVersion'){if(current.nextEdits===current.request.report.edits)current.nextEdits=null;}
        else if (current.next === current.request.report) current.next = null;
        current.request = null;
      }
      if (owner === current) notify('saved', '已保存到数据库');
    } catch (error) {
      if (owner !== current || current.signal.aborted) return;
      current.failed = true;
      notify('error', '未保存：' + error.message + '。请重试；版本冲突时先保留编辑内容。');
    } finally { current.saving = false; }
  }
  return {
    async open(period, signal) {
      const current = owner = { period, signal, version: 0, editVersion:0, nextEdits:null, loaded: false, next: null, request: null, saving: false, failed: false };
      notify('loading', '正在读取已保存报告…');
      try {
        const result = await execute({ operation: 'load', period }, signal);
        signal.throwIfAborted();
        if (owner !== current) throw Error('报告周期已切换');
        current.version = result.version;
        current.editVersion=result.editVersion??0;
        current.scope = result.scope;
        current.loaded = true;
        notify('loaded', result.report ? '已读取数据库报告' : '当前周期尚未保存');
        return result.report;
      } catch (error) {
        if (owner === current && !signal.aborted) notify('error', '报告读取失败：' + error.message);
        throw error;
      }
    },
    save(report) {
      if (!owner?.loaded || owner.signal.aborted) {
        notify('error', '尚未成功读取数据库报告，不能保存');
        return false;
      }
      owner.next = structuredClone(report);
      void drain(owner);
      return true;
    },
    saveEdits(edits) {
      if(!owner?.loaded || owner.signal.aborted)return false;
      owner.nextEdits=structuredClone(edits);void drain(owner);return true;
    },
    retry() { if (owner?.loaded) { owner.failed = false; void drain(owner); } },
    scope() { return owner?.scope; },
    pending() { return !!(owner?.next || owner?.nextEdits); },
    cancel() { owner = undefined; },
  };
}
