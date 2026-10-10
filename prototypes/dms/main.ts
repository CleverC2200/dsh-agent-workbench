import { MockDmsWriteback, type DmsMockOutcome } from './model.ts';
import { ready, reportElements, call } from '../../business/shared/channel.js';

import { createPageViewState } from '../../business/shared/view-state.js';
const view = createPageViewState('inventory-dms');
let restoringView = false;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const type = $<HTMLSelectElement>('type');
const order = $<HTMLSelectElement>('order');
const outcome = $<HTMLSelectElement>('outcome');
let model: MockDmsWriteback;
let connected = false;
let publicationRunning = false;
let publicationNeeded = false;
let generation = 0;
let disposeCatalog = () => {};
const lifetime = new AbortController();

/** Only the latest mock snapshot is queued; the existing channel owns Session and cancellation. */
async function publishState() {
  publicationNeeded = true;
  if (publicationRunning || lifetime.signal.aborted) return;
  publicationRunning = true;
  try {
    while (publicationNeeded && !lifetime.signal.aborted) {
      publicationNeeded = false;
      const currentGeneration = generation;
      try {
        await call(
          'context',
          {
            source: 'DMS_MOCK',
            simulated: true,
            realWriteback: false,
            persistence: 'page-memory; refresh resets',
            ...model.read(),
          },
          { signal: lifetime.signal },
        );
        if (lifetime.signal.aborted || currentGeneration !== generation) continue;
        connected = true;
        $('bridge-status').textContent = '已关联工作台会话 · 当前结果全部为模拟；刷新清空样本。';
        $('bridge-status').removeAttribute('data-error');
        render();
      } catch (error) {
        if (lifetime.signal.aborted || currentGeneration !== generation) continue;
        connected = false;
        $('bridge-status').textContent =
          '模拟证据未送达工作台，请重新连接页面：' +
          (error instanceof Error ? error.message : String(error));
        $('bridge-status').setAttribute('data-error', '');
        render();
      }
    }
  } finally {
    publicationRunning = false;
  }
}

function reportState() {
  disposeCatalog();
  const state = model.read();
  disposeCatalog = reportElements(
    'dms-simulation',
    connected
      ? [
          {
            id: 'field:dms:origin',
            role: 'field',
            label: '数据来源',
            value: 'DMS_MOCK · 仅内存模拟，无真实回写',
          },
          ...['status', 'sync', 'finished', 'source', 'attempts', 'deliveries'].map((id) => ({
            id: `field:dms:${id}`,
            role: 'field',
            label: (
              {
                status: '模拟计划状态',
                sync: '模拟同步状态',
                finished: '模拟完成时间',
                source: '模拟计划/版本',
                attempts: '模拟尝试次数',
                deliveries: '模拟入库笔数',
              } as Record<string, string>
            )[id],
            value: $(id).textContent ?? '',
          })),
          {
            id: 'field:dms:packets',
            role: 'field',
            label: '模拟分笔报文',
            value: `${state.packets.length} 笔 · ${state.packets.map((packet) => packet.operation).join(' / ') || '尚未生成'}；完整结构见页面上下文`,
          },
          {
            id: 'field:dms:receipts',
            role: 'field',
            label: '模拟回执',
            value: `${state.receipts.length} / ${state.packets.length} 笔已确认；完整回执见页面上下文`,
          },
        ]
      : [],
    undefined,
  );
}
function reset() {
  generation++;
  model = new MockDmsWriteback({
    planId: `MOCK-${type.value}-${order.value}`,
    versionId: 'MOCK-V1',
    typeCode: type.value,
    orderType: order.value as 'M' | 'Z',
    status: 4,
    skus: [
      {
        skuCode: 'MOCK-SKU-01',
        qty: '12.500',
        addQty: order.value === 'Z' ? '2.500' : '0',
        cutQty: order.value === 'Z' ? '1.250' : '0',
      },
    ],
  });
  $('error').textContent = '';
  render();
  if (connected) void publishState();
}
function render() {
  const state = model.read();
  if (!restoringView) view.update({ type: type.value, order: order.value, outcome: outcome.value });
  outcome.querySelector<HTMLOptionElement>('option[value=partial]')!.disabled =
    state.plan.orderType !== 'Z';
  if (state.plan.orderType !== 'Z' && outcome.value === 'partial') outcome.value = 'success';
  $('status').textContent =
    state.plan.status === 4
      ? '4 · 待品类终审'
      : state.plan.status === 5
        ? '5 · 品类已审批（待回写）'
        : '10 · 回写完成';
  $('sync').textContent = state.syncStatus;
  $('finished').textContent = state.finishedAt ?? '尚未完成';
  $('deliveries').textContent = String(state.remoteDeliveries);
  $('attempts').textContent = String(state.attempts);
  $('source').textContent = `${state.plan.planId} / ${state.plan.versionId}`;
  $('packets').textContent = JSON.stringify(state.packets, null, 2);
  $('receipts').textContent = JSON.stringify(state.receipts, null, 2);
  $('logs').textContent =
    state.logs
      .map((log) => `${log.at}  ${log.action}  ${log.status} / ${log.syncStatus}\n${log.detail}`)
      .join('\n\n') || '尚无操作';
  $<HTMLButtonElement>('approve').disabled = state.plan.status !== 4;
  $<HTMLButtonElement>('send').disabled = state.plan.status !== 5 || state.syncStatus === 'UNKNOWN';
  $<HTMLButtonElement>('reconcile').disabled = state.plan.status !== 5;
  $<HTMLButtonElement>('duplicate').disabled = state.syncStatus !== 'SYNCED';
  $('notice').textContent =
    state.syncStatus === 'UNKNOWN'
      ? '结果未知：先对账，不能直接重投。'
      : state.syncStatus === 'FAILED'
        ? '失败仍停在 5；选择成功场景后可按原键重试。'
        : state.syncStatus === 'SYNCED'
          ? '所有报文已确认，同步状态与完成时间同时落定。'
          : '只有品类终审后才允许模拟回写。';
  for (const id of ['type', 'order', 'outcome', 'reset'])
    $<HTMLButtonElement>(id).disabled = !connected;
  if (!connected)
    for (const id of ['approve', 'send', 'reconcile', 'duplicate'])
      $<HTMLButtonElement>(id).disabled = true;
  reportState();
}
function run(action: () => void) {
  if (!connected || lifetime.signal.aborted) return;
  try {
    action();
    $('error').textContent = '';
  } catch (error) {
    $('error').textContent = error instanceof Error ? error.message : String(error);
  }
  render();
  void publishState();
}
$('approve').onclick = () => run(() => model.approve());
$('send').onclick = () => run(() => model.deliver(outcome.value as DmsMockOutcome));
$('reconcile').onclick = () => run(() => model.reconcile());
$('duplicate').onclick = () => run(() => model.acceptReceipts(model.read().receipts));
$('reset').onclick = reset;
type.onchange = reset;
order.onchange = reset;
outcome.onchange = () =>
  view.update({ type: type.value, order: order.value, outcome: outcome.value });
view.subscribe((state: { type?: string; order?: string; outcome?: string }, event: string) => {
  if (event !== 'restore') return;
  restoringView = true;
  const previousType = type.value,
    previousOrder = order.value;
  if (state.type !== undefined) type.value = state.type as string;
  if (state.order !== undefined) order.value = state.order as string;
  if (state.outcome !== undefined) outcome.value = state.outcome as string;
  if (type.value !== previousType || order.value !== previousOrder) reset();
  else render();
  restoringView = false;
});
reset();
void ready.then(() => publishState());
function suspend() {
  generation++;
  connected = false;
  $('bridge-status').textContent = '页面会话已断开，模拟状态仍在当前页面内存中；请重新连接。';
  render();
}
function rebind() {
  suspend();
  void publishState();
}
window.addEventListener('gea-session-changing', suspend);
window.addEventListener('gea-session-changed', rebind);
window.addEventListener('gea-identity-changed', suspend);
window.addEventListener(
  'pagehide',
  () => {
    lifetime.abort();
    connected = false;
    disposeCatalog();
    window.removeEventListener('gea-session-changing', suspend);
    window.removeEventListener('gea-session-changed', rebind);
    window.removeEventListener('gea-identity-changed', suspend);
  },
  { once: true },
);
