'use strict';
const element = (id) => document.getElementById(id);
const navigation = new URLSearchParams(location.search);
const requestedMode = navigation.get('view') ?? navigation.get('mode');
//update-begin---author:Codex ---date:2026-11-02 for：【订单履约缺货订单处理】订单处理与商品增减共享原订单验证窗口-----------
const mode = ['confirm', 'defer', 'details', 'list', 'edit', 'process', 'credit'].includes(
  requestedMode,
)
  ? requestedMode
  : 'details';
//update-end---author:Codex ---date:2026-11-02 for：【订单履约缺货订单处理】订单处理与商品增减共享原订单验证窗口-----------
const nonce = crypto.randomUUID();
let state,
  inflight = false,
  submitted,
  pageNo = 1;
//update-begin---author:Codex ---date:2026-10-30 for：【订单履约正式确认链路本地联调】缺失数量及满足率不转换成零-----------
const knownNumber = (value) =>
  (typeof value === 'number' || typeof value === 'string') &&
  String(value).trim() !== '' &&
  Number.isFinite(Number(value))
    ? Number(value)
    : null;
const rateReady = (value) => {
  const rate = knownNumber(value);
  return rate !== null && rate >= 90 && rate <= 100;
};
const quantityText = (value) => (knownNumber(value) === null ? '—' : value + ' 箱');
const calendarDate = (offset = 0) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts(new Date())
      .map((part) => [part.type, part.value]),
  );
  return new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day) + offset))
    .toISOString()
    .slice(0, 10);
};
const deferDays = () => {
  const date = element('days').value;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const delta =
    (Date.parse(date + 'T00:00:00Z') - Date.parse(calendarDate() + 'T00:00:00Z')) / 86400000;
  return Number.isInteger(delta) && delta >= 1 && delta <= 7 ? delta : null;
};
//update-end---author:Codex ---date:2026-10-30 for：【订单履约正式确认链路本地联调】缺失数量及满足率不转换成零-----------
async function request(path, options = {}) {
  const response = await fetch(location.pathname + path, {
    cache: 'no-store',
    credentials: 'same-origin',
    ...options,
  });
  const data = await response.json();
  if (!response.ok || data.success === false)
    throw Error(data.message || '会话已过期，请从飞书卡片重新打开');
  return data;
}
function status() {
  const pending = state?.status === 'pending' && state?.permissions?.canAct === true;
  element('submit').hidden = mode !== 'defer' || !pending;
  element('submit').disabled =
    inflight ||
    !pending ||
    (mode === 'defer' && deferDays() === null) ||
    (mode === 'confirm' && !rateReady(state?.snapshot.satisfactionRate));
  //update-begin---author:Codex ---date:2026-11-02 for：【订单履约缺货订单处理】本机预览可查看延期页面但不写入处理决定-----------
  if (state?.previewOnly === true) {
    element('submit').disabled = true;
    element('submit').textContent = '本地预览，不保存';
    element('notice').textContent = '仅查看界面效果，不执行真实延期、发货或改单。';
  }
  //update-end---author:Codex ---date:2026-11-02 for：【订单履约缺货订单处理】本机预览可查看延期页面但不写入处理决定-----------
  if (state?.status !== 'pending' && mode !== 'list') {
    const d = state?.decisions?.[0];
    element('result').hidden = false;
    element('result').textContent =
      d?.action_id === 'defer_shipment'
        ? '已保存暂缓决定，截止：' + d.deferred_until
        : d?.action_id === 'confirm_shipment'
          ? '已保存销售确认决定'
          : state?.status === 'processing'
            ? '正在处理，请稍后刷新'
            : '该订单确认任务已结束';
  }
}
async function load() {
  state = await request('/data?includeRelated=' + (mode === 'list') + '&pageNo=' + pageNo);
  //update-begin---author:Codex ---date:2026-11-02 for：【订单履约缺货订单处理】仅在认证读取成功后渲染草稿，关闭原确认按钮-----------
  if (mode !== 'list' && (mode !== 'defer' || state.permissions?.canAct !== true)) {
    window.OrderShortageEditor.mount(document, {
      ...state,
      view:
        mode === 'details' || state.permissions?.canAct !== true || state.status !== 'pending'
          ? 'details'
          : 'process',
      onConfirm: async () => {
        if (
          inflight ||
          state.previewOnly === true ||
          state.permissions?.canAct !== true ||
          state.status !== 'pending'
        )
          return;
        inflight = true;
        submitted ??= {
          actionId: 'confirm_shipment',
          expectedVersion: state.version,
          nonce,
          input: {},
        };
        try {
          const receipt = await request('/action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': state.csrf },
            body: JSON.stringify(submitted),
          });
          if (!['accepted', 'already_resolved'].includes(receipt.status))
            throw Error('处理状态：' + receipt.status + '，请重新核对后操作');
          await load();
        } finally {
          inflight = false;
        }
      },
      editor: state.editor ?? {
        editable: state.status === 'pending',
        canSubmit: false,
        catalogAvailable: false,
        vehicleRulesAvailable: false,
        dataBasis: '通知生成时的订单快照，不代表实时可用库存',
        reason:
          '订单修改接口尚未接入，当前调整仅为本窗口草稿，未修改原订单；可售商品及车型规则待提供。',
      },
    });
    element('windowLoading').hidden = true;
    element('submit').hidden = true;
    return;
  }
  //update-end---author:Codex ---date:2026-11-02 for：【订单履约缺货订单处理】仅在认证读取成功后渲染草稿，关闭原确认按钮-----------
  if (mode === 'list') {
    element('title').textContent = '最近 8 天的订单确认记录';
    element('summary').textContent = '仅展示分派给你的订单';
    element('quantity').textContent = '';
    element('defer').hidden = true;
    element('items').hidden = false;
    element('items').replaceChildren();
    for (const row of state.related.items) {
      const item = document.createElement('article'),
        link = document.createElement('a'),
        info = document.createElement('p');
      link.textContent = row.snapshot.orderNo;
      link.href = row.entryUrl + '&view=details';
      info.textContent =
        row.snapshot.customer + '；' + (row.status === 'pending' ? '待处理' : '已处理');
      item.append(link, info);
      if (row.status === 'pending')
        for (const [action, title] of [
          ['process', '订单处理'],
          ['defer', '暂缓发货'],
        ]) {
          const button = document.createElement('a');
          button.textContent = title;
          button.href = row.entryUrl + '&view=' + action;
          button.style.marginRight = '16px';
          item.append(button);
        }
      //update-begin---author:Codex ---date:2026-11-02 for：【订单履约缺货订单处理】列表缺货订单提供相同处理入口-----------
      //update-end---author:Codex ---date:2026-11-02 for：【订单履约缺货订单处理】列表缺货订单提供相同处理入口-----------
      element('items').append(item);
    }
    element('pages').hidden = false;
    element('previous').disabled = pageNo === 1;
    element('next').disabled = pageNo * 20 >= state.related.total;
    element('pageLabel').textContent = '第 ' + pageNo + ' 页，共 ' + state.related.total + ' 笔';
    element('cancel').textContent = '返回';
    status();
    document.title = '订单确认记录';
    element('confirmationMain').hidden = false;
    element('windowLoading').hidden = true;
    return;
  }
  const p = state.snapshot;
  element('days').min = calendarDate(1);
  element('days').max = calendarDate(7);
  const process = element('process');
  process.hidden =
    mode !== 'details' ||
    state.status !== 'pending' ||
    state.permissions?.canAct === false ||
    (rateReady(p.satisfactionRate) &&
      !(p.lines || []).some((line) => knownNumber(line.shortage) > 0));
  const editUrl = new URL(location.href);
  editUrl.searchParams.set('view', 'edit');
  editUrl.searchParams.delete('mode');
  process.href = editUrl.href;
  if (state.permissions?.canAct === false)
    element('notice').textContent = '你可以查看此订单；处理操作由指定销售执行。';
  element('title').textContent =
    state.permissions?.canAct === false
      ? '订单明细'
      : { confirm: '确认开单？', defer: '暂缓发货', details: '订单明细' }[mode];
  element('summary').textContent =
    '执行单号：' +
    (p.executionOrderNo || '—') +
    '\nDMS订单号：' +
    (p.dmsOrderNo || p.orderNo || '—') +
    '\n订单交货日期：' +
    (p.deliveryDate || '—') +
    '\n客户：' +
    p.customer +
    '\n基地：' +
    p.base +
    '\n订单满足率：' +
    (knownNumber(p.satisfactionRate) === null ? '—' : Number(p.satisfactionRate).toFixed(1) + '%');
  element('quantity').textContent = '总数量：' + quantityText(p.quantity);
  element('defer').hidden = mode !== 'defer' || state.permissions?.canAct === false;
  element('items').hidden = mode !== 'details' && state.permissions?.canAct !== false;
  element('items').replaceChildren();
  for (const line of p.lines || []) {
    const item = document.createElement('article'),
      name = document.createElement('strong'),
      detail = document.createElement('p');
    name.textContent = line.name + ' / ' + line.sku;
    detail.textContent =
      '订货：' + quantityText(line.quantity) + '；缺货：' + quantityText(line.shortage);
    item.append(name, detail);
    element('items').append(item);
  }
  element('cancel').textContent = '返回';
  status();
  document.title = element('title').textContent;
  element('confirmationMain').hidden = false;
  element('windowLoading').hidden = true;
}
element('cancel').onclick = () => {
  window.close();
};
for (const [id, delta] of [
  ['previous', -1],
  ['next', 1],
])
  element(id).onclick = async () => {
    if (inflight) return;
    inflight = true;
    pageNo += delta;
    try {
      await load();
    } catch (error) {
      pageNo -= delta;
      element('notice').textContent = error.message;
    } finally {
      inflight = false;
    }
  };
element('days').onchange = () => {
  if (!inflight) {
    submitted = undefined;
    status();
  }
};
element('submit').onclick = async () => {
  if (inflight || element('submit').disabled) return;
  inflight = true;
  element('notice').textContent = '正在保存…';
  status();
  submitted ??= {
    actionId: mode === 'confirm' ? 'confirm_shipment' : 'defer_shipment',
    expectedVersion: state.version,
    nonce,
    input: mode === 'defer' ? { deferDays: deferDays() } : {},
  };
  try {
    const receipt = await request('/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': state.csrf },
      body: JSON.stringify(submitted),
    });
    if (!['accepted', 'already_resolved'].includes(receipt.status))
      throw Error('处理状态：' + receipt.status + '，请重新核对订单后操作');
    element('notice').textContent = '';
    await load();
  } catch (error) {
    element('notice').textContent = error.message;
  } finally {
    inflight = false;
    status();
  }
};
load().catch((error) => {
  element('windowLoading').hidden = true;
  element('orderEditor').hidden = true;
  element('confirmationMain').hidden = false;
  element('title').textContent = '订单加载失败';
  document.title = '订单加载失败';
  element('submit').hidden = true;
  element('process').hidden = true;
  element('notice').textContent = error.message;
});
