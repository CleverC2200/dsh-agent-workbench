'use strict';
const element = (id) => document.getElementById(id);
const navigation = new URLSearchParams(location.search);
const requestedMode = navigation.get('view') ?? navigation.get('mode');

let mode = ['confirm', 'defer', 'details', 'list', 'edit', 'process', 'credit', 'price'].includes(
  requestedMode,
)
  ? requestedMode
  : 'details';

const nonce = crypto.randomUUID();
let state,
  inflight = false,
  submitted,
  pageNo = 1,
  refreshTimer,
  refreshChecks = 0;
window.addEventListener('pagehide', () => clearTimeout(refreshTimer));

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

window.OrderDeliveryDatePicker = (() => {
  const overlay = element('deferDatePicker');
  const dialog = overlay.querySelector('section');
  const days = element('deferCalendarDays');
  const confirm = element('deferDateConfirm');
  let active,
    draft = '',
    month = '',
    previousOverflow = '';
  const validDate = (date) =>
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    Number.isFinite(Date.parse(date + 'T00:00:00Z')) &&
    new Date(date + 'T00:00:00Z').toISOString().slice(0, 10) === date;
  const withinRange = (date) =>
    Boolean(active) &&
    validDate(date) &&
    (!active.min || date >= active.min) &&
    (!active.max || date <= active.max);
  const close = (restoreFocus = true) => {
    if (overlay.hidden) return;
    overlay.hidden = true;
    dialog.removeAttribute('role');
    dialog.removeAttribute('aria-modal');
    const trigger = active.trigger;
    trigger.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = previousOverflow;
    if (restoreFocus && trigger.isConnected && !trigger.disabled) trigger.focus();
    active = undefined;
  };
  const render = () => {
    const [year, number] = month.split('-').map(Number);
    element('deferCalendarMonth').textContent = `${year}年${number}月`;
    element('deferMonthPrevious').disabled = month <= (active.min?.slice(0, 7) || '0001-01');
    element('deferMonthNext').disabled = month >= (active.max?.slice(0, 7) || '9999-12');
    days.replaceChildren();
    const first = new Date(month + '-01T00:00:00Z');
    const weekday = first.getUTCDay();
    for (let i = 0; i < weekday; i++) days.append(document.createElement('span'));
    const last = new Date(first);
    last.setUTCMonth(last.getUTCMonth() + 1);
    last.setUTCDate(0);
    const count = last.getUTCDate();
    for (let day = 1; day <= count; day++) {
      const date = `${month}-${String(day).padStart(2, '0')}`;
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = String(day);
      button.dataset.date = date;
      button.disabled = !withinRange(date);
      button.setAttribute('aria-label', `${year}年${number}月${day}日`);
      button.setAttribute('aria-pressed', String(date === draft));
      button.onclick = () => {
        draft = date;
        render();
        days.querySelector(`[data-date="${date}"]`).focus();
      };
      days.append(button);
    }
    confirm.disabled = !withinRange(draft);
  };
  const open = (options) => {
    if (options.trigger.disabled) return;
    close(false);
    active = options;
    draft = withinRange(options.value) ? options.value : options.min || calendarDate();
    month = draft.slice(0, 7);
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    overlay.hidden = false;
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    active.trigger.setAttribute('aria-expanded', 'true');
    render();
    days.querySelector(`[data-date="${draft}"]`)?.focus();
  };
  for (const [id, delta] of [
    ['deferMonthPrevious', -1],
    ['deferMonthNext', 1],
  ])
    element(id).onclick = () => {
      const next = new Date(month + '-01T00:00:00Z');
      next.setUTCMonth(next.getUTCMonth() + delta);
      month = next.toISOString().slice(0, 7);
      render();
      element(id).focus();
    };
  confirm.onclick = () => {
    if (overlay.hidden || confirm.disabled || !withinRange(draft)) return;
    const selected = draft,
      onConfirm = active.onConfirm;
    close();
    onConfirm(selected);
  };
  overlay.onclick = (event) => {
    if (event.target === overlay) close();
  };
  overlay.onkeydown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    } else if (event.key === 'Tab') {
      const buttons = [...overlay.querySelectorAll('button')].filter((button) => !button.disabled);
      const first = buttons[0],
        last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  };
  return { open, close };
})();

const deferDatePicker = (() => {
  const input = element('days'),
    trigger = element('deferDateTrigger');
  trigger.onclick = () =>
    window.OrderDeliveryDatePicker.open({
      trigger,
      value: input.value,
      min: input.min,
      max: input.max,
      onConfirm(date) {
        input.value = date;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      },
    });
  return {
    sync(enabled) {
      trigger.disabled = !enabled;
      element('deferDateValue').textContent = input.value || '选择日期';
      if (
        !enabled &&
        !element('deferDatePicker').hidden &&
        trigger.getAttribute('aria-expanded') === 'true'
      )
        window.OrderDeliveryDatePicker.close(false);
    },
  };
})();

async function request(path, options = {}) {
  const response = await fetch(location.pathname + path, {
    cache: 'no-store',
    credentials: 'same-origin',
    ...options,
  });
  const data = await response.json();
  if (!response.ok || data.success === false) {
    const error = Error(data.message || '会话已过期，请从飞书卡片重新打开');
    error.code = data.code;
    throw error;
  }
  return data;
}
function status() {
  const pending = state?.status === 'pending' && state?.permissions?.canAct === true;
  deferDatePicker.sync(pending && !inflight && mode === 'defer');
  element('submit').hidden = mode !== 'defer' || !pending;
  element('submit').disabled =
    inflight ||
    !pending ||
    (mode === 'defer' && deferDays() === null) ||
    (mode === 'confirm' && !rateReady(state?.snapshot.satisfactionRate));

  if (state?.previewOnly === true) {
    element('submit').disabled = true;
  }

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
  clearTimeout(refreshTimer);
  state = await request('/data?includeRelated=' + (mode === 'list') + '&pageNo=' + pageNo);
  if (
    state.previewOnly !== true &&
    state.orderRefresh?.status === 'waiting' &&
    state.editor?.modificationState === 'succeeded' &&
    refreshChecks < 10
  ) {
    refreshChecks++;
    refreshTimer = setTimeout(() => load().catch(() => {}), 3000);
  }

  if (mode !== 'list' && (mode !== 'defer' || state.permissions?.canAct !== true)) {
    window.OrderShortageEditor.mount(document, {
      ...state,
      onLookupVehicles: async () => {
        const options = await request('/options?kind=vehicles');
        return options.vehicles;
      },
      onInventoryRecalculate: async (draft) => {
        if (
          state.previewOnly === true ||
          state.permissions?.canAct !== true ||
          state.status !== 'pending'
        )
          throw Error('当前不能核算库存');
        return request('/inventory-preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': state.csrf },
          body: JSON.stringify({ expectedVersion: state.version, draft }),
        });
      },
      onLookupProducts: async (query) => {
        if (
          state.permissions?.canAct !== true ||
          state.status !== 'pending' ||
          state.editor?.catalogAvailable !== true
        )
          throw Error('当前不能查询商品目录');
        const options = await request('/options?kind=products&query=' + encodeURIComponent(query));
        return options.products;
      },
      onRefreshOrder: async () => {
        refreshChecks = 0;
        await load();
      },
      onOpenLatest: () => {
        if (state.orderRefresh?.status !== 'ready' || !state.orderRefresh.entryUrl) return;
        const url = new URL(state.orderRefresh.entryUrl, location.href);
        if (
          url.origin !== location.origin ||
          url.pathname !== location.pathname.split('/window/')[0] + '/entry' ||
          url.username ||
          url.password ||
          url.hash
        )
          throw Error('最新订单入口无效，请重新打开飞书卡片。');
        url.searchParams.set('view', 'process');
        location.assign(url.href);
      },
      view:
        mode === 'price' && state.permissions?.canAct === true && state.status === 'pending'
          ? 'price'
          : mode === 'details' || state.permissions?.canAct !== true || state.status !== 'pending'
            ? 'details'
            : 'process',
      onPriceRecheck: async () => {
        if (
          inflight ||
          state.previewOnly === true ||
          state.permissions?.canAct !== true ||
          state.status !== 'pending'
        )
          return;
        inflight = true;
        try {
          const receipt = await request('/price-recheck', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': state.csrf },
            body: JSON.stringify({ expectedVersion: state.version }),
          });
          if (receipt.version) state.version = receipt.version;
          if (receipt.ready !== true)
            throw Error(receipt.message || '价格仍有异常，请核对后重试。');
          navigation.set('view', 'process');
          history.replaceState(null, '', '?' + navigation.toString());
          mode = 'process';
          await load();
        } finally {
          inflight = false;
        }
      },
      onConfirm: async (draft) => {
        if (
          inflight ||
          state.previewOnly === true ||
          state.permissions?.canAct !== true ||
          state.status !== 'pending'
        )
          return;
        inflight = true;
        const modifying = state.editor?.omsModificationAvailable === true;
        submitted ??= modifying
          ? { expectedVersion: state.version, draft }
          : {
              actionId: 'confirm_shipment',
              expectedVersion: state.version,
              nonce,
              input: {},
            };
        try {
          const receipt = await request(modifying ? '/modify' : '/action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': state.csrf },
            body: JSON.stringify(submitted),
          });
          if (!['accepted', 'already_resolved'].includes(receipt.status)) {
            if (modifying) await load();
            throw Error(receipt.message || '处理状态：' + receipt.status + '，请重新核对后操作');
          }
          await load();
        } catch (error) {
          if (
            [
              'ORDER_CONFIRMATION_OMS_MODIFICATION_INVENTORY_CHANGED',
              'ORDER_CONFIRMATION_OMS_MODIFICATION_INVENTORY_UNAVAILABLE',
              'ORDER_CONFIRMATION_OMS_MODIFICATION_PRICE_NOT_READY',
            ].includes(error.code)
          )
            submitted = undefined;
          throw error;
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
