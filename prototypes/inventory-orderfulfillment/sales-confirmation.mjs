/** Preview only: identity, order execution and Feishu delivery remain owned by GEA/OMS. */
export function confirmationDraft(input) {
  const draft = structuredClone(input);
  const rate = draft.rate == null || draft.rate === '' ? null : Number(draft.rate);
  draft.rate = Number.isFinite(rate) && rate >= 0 && rate <= 100 ? rate : null;
  draft.scenario = draft.rate === null ? 'unknown' : draft.rate >= 90 ? 'ready' : 'shortage';
  draft.consumerCode = 'order01';
  return draft;
}

/** A sendable card template only; GEA must resolve recipients and authorize every callback. */
export function salesConfirmationCard(input) {
  const draft = confirmationDraft(input);
  const escape = (value) =>
    String(value ?? '—')
      .replace(/[&<>]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[character])
      .replace(/[\\*_[\]`]/g, '\\$&');
  const title =
    draft.scenario === 'ready'
      ? '订单发货确认'
      : draft.scenario === 'shortage'
        ? '订单缺货处理'
        : '订单数据待核对';
  const action = (text, name, confirm) => ({
    tag: 'button',
    text: { tag: 'plain_text', content: text },
    type: name === 'confirm_shipment' ? 'primary' : 'default',
    value: {
      consumerCode: 'order01',
      action: name,
      orderNo: draft.orderNo,
      customerCode: draft.customerCode,
      base: draft.base,
    },
    ...(confirm
      ? {
          confirm: {
            title: { tag: 'plain_text', content: '确认发货' },
            text: { tag: 'plain_text', content: '确认提交该订单发货？系统将重新校验订单状态。' },
          },
        }
      : {}),
  });
  return {
    config: { wide_screen_mode: true },
    header: { template: 'red', title: { tag: 'plain_text', content: title } },
    elements: [
      {
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: [
            `**订单号：**${escape(draft.orderNo)}`,
            `**客户：**${escape(draft.customer)}`,
            `**销售：**${escape(draft.seller)}`,
            `**满足率：**${draft.rate === null ? '—' : draft.rate.toFixed(1) + '%'}`,
            `**订货数量：**${escape(draft.quantity)}`,
          ].join('\n'),
        },
      },
      {
        tag: 'action',
        actions: [
          action('查看明细', 'view_details'),
          action('暂缓发货', 'defer_shipment'),
          draft.scenario === 'ready'
            ? action('确认发货', 'confirm_shipment', true)
            : action('订单处理', 'edit_order'),
        ],
      },
    ],
  };
}

/** The client only initiates notification; sales actions live in the Feishu card. */
export function mountSalesConfirmation(document) {
  const overlay = document.getElementById('salesConfirmOverlay');
  const dialog = overlay.querySelector('.confirmation-dialog');
  const form = document.getElementById('salesConfirmForm');
  const heading = document.getElementById('salesConfirmTitle');
  const orderLabel = document.getElementById('salesConfirmOrder');
  dialog.classList.add('sales-confirmation-preview');
  let opener;
  const node = (tag, text, className) => {
    const element = document.createElement(tag);
    if (text != null) element.textContent = text;
    if (className) element.className = className;
    return element;
  };
  function close() {
    overlay.hidden = true;
    form.replaceChildren();
    orderLabel.textContent = '';
    if (opener?.isConnected) opener.focus();
    opener = undefined;
  }
  form.addEventListener('submit', (event) => event.preventDefault());
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay || event.target.closest('[data-close-sales-confirm]')) close();
  });
  document.addEventListener('keydown', (event) => {
    if (overlay.hidden) return;
    if (event.key === 'Escape') close();
    if (event.key === 'Tab') {
      const elements = [...dialog.querySelectorAll('button:not(:disabled)')];
      const first = elements[0],
        last = elements.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
  });
  return {
    open(input, trigger) {
      const draft = confirmationDraft(input);
      opener = trigger;
      form.replaceChildren();
      heading.textContent = '发起飞书销售确认';
      orderLabel.textContent = `订单 ${draft.orderNo} · ${draft.customer} · ${draft.base}`;
      form.append(
        node(
          'p',
          '由机器人在指定飞书群 @对应销售并发送订单确认卡片。销售在飞书中查看明细、确认发货、暂缓或处理缺货；本工作台仅发起通知、展示处理结果。',
          'sales-preview-hint',
        ),
      );
      const fields = node('dl', null, 'sales-preview-fields');
      for (const [label, value] of [
        ['对应销售', draft.seller],
        ['接收群', '待 GEA 解析'],
        ['订单满足率', draft.rate === null ? '—' : draft.rate.toFixed(1) + '%'],
        ['订货数量', draft.quantity],
        ['统计周期', draft.period],
      ])
        fields.append(node('dt', label), node('dd', value));
      form.append(fields);
      const status = node(
        'p',
        '飞书群发送与人员映射接口尚未接入，当前未发送通知。',
        'sales-preview-notice',
      );
      status.role = 'status';
      form.append(status);
      const footer = node('div', null, 'sales-preview-actions');
      const cancel = node('button', '取消');
      cancel.type = 'button';
      cancel.addEventListener('click', close);
      const send = node('button', '发送到飞书群（待接入）', 'primary');
      send.type = 'button';
      send.disabled = true;
      send.title = '需 GEA 提供 order01 受控发送接口、接收群和销售账号映射；不在客户端确认订单';
      footer.append(cancel, send);
      form.append(footer);
      overlay.hidden = false;
      cancel.focus();
      return salesConfirmationCard(draft);
    },
    close,
  };
}
