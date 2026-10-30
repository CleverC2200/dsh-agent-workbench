import { mergeFcPlans } from '../../../../../shared/fc-plan-merge';
import React, { useState, useEffect, useRef } from 'react';
import { fcPersistence, fcStorageSelection } from './fc-storage-client';
import type { ImportedPlan } from '../../../fc/src/lib/planning';
import type { FcCycleRule } from '../../../../../shared/fc-cycle-rules';
export function FcPersistencePanel({
  plans,
  days,
  rules,
  cycleWarehouse,
  onPlans,
  onCycles,
  refreshKey = 0,
  showControls = true,
}: {
  plans: ImportedPlan[];
  days: number;
  rules: FcCycleRule[];
  cycleWarehouse?: string;
  refreshKey?: number;
  showControls?: boolean;
  onPlans: (
    plans: ImportedPlan[],
    signal: AbortSignal,
    revision?: string,
    warehouse?: string,
  ) => Promise<void>;
  onCycles: (days: number, rules: FcCycleRule[], warehouse: string, revision?: string) => void;
}) {
  const [warehouse, setWarehouse] = useState(() => fcStorageSelection.read()),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false);
  const active = useRef<AbortController | null>(null);
  const verified = useRef(new Map<string, any>());
  const loaded = useRef(new Map<string, string>());
  const callbacks = useRef({ onPlans, onCycles });
  callbacks.current = { onPlans, onCycles };
  async function loadCurrent(
    scope: { kind: 'plans' | 'cycles'; warehouseCode: string },
    signal: AbortSignal,
  ) {
    if (fcPersistence.pending(scope)) await fcPersistence.verify(scope, signal);
    return fcPersistence.load(scope, signal);
  }
  async function restore() {
    const selected = fcStorageSelection.read();
    if (!selected) return;
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    const signal = controller.signal;
    setWarehouse(selected);
    setBusy(true);
    setNotice('正在恢复已保存的计划和周期');
    try {
      const read = async (kind: 'plans' | 'cycles') => {
        const scope = { kind, warehouseCode: selected };
        return loadCurrent(scope, signal);
      };
      const [plan, cycle] = await Promise.all([read('plans'), read('cycles')]);
      signal.throwIfAborted();
      callbacks.current.onCycles(
        cycle.value?.days ?? 7,
        cycle.value?.rules ?? [],
        selected,
        cycle.revision,
      );
      await callbacks.current.onPlans(plan.value?.plans ?? [], signal, plan.revision, selected);
      signal.throwIfAborted();
      loaded.current.set(JSON.stringify({ kind: 'plans', warehouseCode: selected }), plan.revision);
      loaded.current.set(
        JSON.stringify({ kind: 'cycles', warehouseCode: selected }),
        cycle.revision,
      );
      setNotice(`已恢复 ${selected} 的计划版本 ${plan.revision}、周期版本 ${cycle.revision}`);
    } catch (e) {
      if (!signal.aborted) setNotice('自动恢复失败，保留草稿：' + (e as Error).message);
    } finally {
      if (active.current === controller) setBusy(false);
    }
  }
  const restoreRef = useRef(restore);
  restoreRef.current = restore;
  useEffect(() => {
    void restoreRef.current();
    return () => active.current?.abort();
  }, [refreshKey]);
  useEffect(() => {
    const restored = () => {
      void restoreRef.current();
    };
    window.addEventListener('workbench-fc-view-restored', restored);
    return () => window.removeEventListener('workbench-fc-view-restored', restored);
  }, []);
  useEffect(() => {
    const stop = () => {
      active.current?.abort();
      verified.current.clear();
      loaded.current.clear();
      setWarehouse('');
      setNotice('');
      setBusy(false);
    };
    window.addEventListener('gea-identity-changed', stop);
    window.addEventListener('gea-session-changing', stop);
    return () => {
      stop();
      window.removeEventListener('gea-identity-changed', stop);
      window.removeEventListener('gea-session-changing', stop);
    };
  }, []);
  async function run(kind: 'plans' | 'cycles', save: boolean) {
    if (!warehouse.trim()) {
      setNotice('请填写分仓编码');
      return;
    }
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    const { signal } = controller;
    setBusy(true);
    setNotice('');
    try {
      const scope = { kind, warehouseCode: warehouse.trim() };
      const cacheKey = JSON.stringify(scope);
      let result;
      if (verified.current.has(cacheKey) || fcPersistence.pending(scope) || !save)
        result = await loadCurrent(scope, signal);
      else {
        if (kind === 'cycles' && cycleWarehouse && cycleWarehouse !== scope.warehouseCode)
          throw Error('当前周期属于其他分仓，请先读取目标分仓周期再调整保存');
        const previous = await fcPersistence.load(scope, signal);
        const baseline = loaded.current.get(cacheKey);
        if (baseline !== undefined && baseline !== previous.revision)
          throw Error('其他人已更新该分仓配置，请先读取最新版本，再重新调整并保存');
        if (kind === 'cycles' && baseline === undefined && previous.revision !== '0')
          throw Error('该分仓已有周期配置，请先读取后再调整保存');
        let value: any;
        if (kind === 'plans') {
          const selected = plans.filter((p) => p.warehouseCode === scope.warehouseCode);
          if (!selected.length) throw Error('先导入并试算当前分仓计划，再保存');
          value = { plans: mergeFcPlans(previous.value?.plans ?? [], selected) };
        } else value = { days, rules };
        result = await fcPersistence.save(scope, previous.revision, value, signal);
      }
      signal.throwIfAborted();
      if (!result.value) {
        if (kind === 'plans')
          await callbacks.current.onPlans([], signal, result.revision, scope.warehouseCode);
        else callbacks.current.onCycles(7, [], scope.warehouseCode, result.revision);
        signal.throwIfAborted();
        loaded.current.set(cacheKey, result.revision);
        fcStorageSelection.save(scope.warehouseCode);
        setNotice('该分仓暂无已保存配置，已恢复默认输入');
        return;
      }
      verified.current.set(cacheKey, result);
      if (kind === 'plans')
        await callbacks.current.onPlans(
          result.value.plans,
          signal,
          result.revision,
          scope.warehouseCode,
        );
      else
        callbacks.current.onCycles(
          result.value.days,
          result.value.rules,
          scope.warehouseCode,
          result.revision,
        );
      signal.throwIfAborted();
      verified.current.delete(cacheKey);
      loaded.current.set(cacheKey, result.revision);
      fcStorageSelection.save(scope.warehouseCode);
      setNotice(
        `已回读${kind === 'plans' ? '人工计划' : '周期规则'}版本 ${result.revision} 并应用`,
      );
    } catch (e) {
      if (!signal.aborted) setNotice((e as Error).message);
    } finally {
      if (active.current === controller) setBusy(false);
    }
  }
  if (!showControls) return null;
  return (
    <section className="fc-persistence-panel" aria-label="分仓业务保存">
      <label>
        保存分仓{' '}
        <input
          aria-label="业务保存分仓编码"
          value={warehouse}
          maxLength={64}
          disabled={busy}
          onChange={(e) => setWarehouse(e.target.value)}
        />
      </label>
      <button type="button" disabled={busy} onClick={() => void run('plans', false)}>
        读取/核对计划
      </button>
      <button type="button" disabled={busy} onClick={() => void run('plans', true)}>
        保存人工计划
      </button>
      <button type="button" disabled={busy} onClick={() => void run('cycles', false)}>
        读取/核对周期
      </button>
      <button type="button" disabled={busy} onClick={() => void run('cycles', true)}>
        保存周期规则
      </button>
      <p role="status">{notice || '保存成功并回读后参与计算；未配置业务库时保留本地试算。'}</p>
    </section>
  );
}
