/** Isolated test records. This module has no OMS, SQL or business-write transport. */
export function applySimulationEvent(state, event, scope) {
  if (
    event.chat_id !== scope.chatId ||
    event.operator_id !== scope.operatorId ||
    event.message_id !== scope.messageId
  )
    throw Error('SIMULATION_SCOPE_DENIED');
  const value =
    typeof event.action_value === 'string' ? JSON.parse(event.action_value) : event.action_value;
  if (
    !value ||
    value.runId !== scope.runId ||
    value.orderNo !== scope.orderNo ||
    value.simulation !== true
  )
    throw Error('SIMULATION_ACTION_DENIED');
  if (!event.event_id) throw Error('SIMULATION_EVENT_ID_REQUIRED');
  if (state.records.some((row) => row.eventId === event.event_id)) return state;
  const labels = { confirm: '模拟已确认', defer: '模拟已暂缓', process: '模拟已处理' };
  if (!labels[value.action]) throw Error('SIMULATION_ACTION_DENIED');
  if (
    value.action === 'confirm' &&
    !(Number.isFinite(scope.rate) && scope.rate >= 90 && scope.rate <= 100)
  )
    throw Error('SIMULATION_CONFIRM_THRESHOLD');
  const days =
    event.action_tag === 'select_static'
      ? /^[1-7]$/.test(event.option ?? '')
        ? Number(event.option)
        : NaN
      : value.days;
  if (value.action === 'defer' && (!Number.isInteger(days) || days < 1 || days > 7))
    throw Error('SIMULATION_DAYS_INVALID');
  if (value.action === 'process' && (value.sku !== scope.sku || value.quantity !== 0))
    throw Error('SIMULATION_ITEM_INVALID');
  const last = state.records.at(-1);
  if (last?.action === value.action && (value.action !== 'defer' || last.days === days))
    return state;
  const at = new Date().toISOString();
  const deferredUntil =
    value.action === 'defer' ? new Date(Date.parse(at) + days * 86400000).toISOString() : null;
  const untilLabel = deferredUntil
    ? new Intl.DateTimeFormat('zh-CN', {
        timeZone: 'Asia/Shanghai',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(new Date(deferredUntil))
    : '';
  const summary =
    value.action === 'confirm'
      ? '田庚已模拟确认；未执行发货'
      : value.action === 'defer'
        ? `田庚已模拟暂缓 ${days} 天，至 ${untilLabel}（北京时间）；未修改真实订单`
        : `田庚已模拟移除缺货商品 ${scope.sku}；未提交 OMS 改单`;
  return {
    ...state,
    simulation: true,
    orderNo: scope.orderNo,
    customerCode: scope.customerCode,
    base: scope.base,
    status: labels[value.action],
    reminderStopped: true,
    deferredUntil,
    records: [
      ...state.records,
      {
        eventId: event.event_id,
        action: value.action,
        status: labels[value.action],
        summary,
        at,
        source: event.simulation_transport ?? 'FEISHU_CALLBACK',
        ...(value.action === 'defer' ? { days, deferredUntil } : {}),
      },
    ],
  };
}

export function simulationMember(scope, state, orderNo) {
  const orders = [scope, ...(scope.orders ?? [])];
  if (orders.length > 10 || new Set(orders.map((row) => row.orderNo)).size !== orders.length)
    throw Error('SIMULATION_ORDER_GROUP_INVALID');
  const order = orders.find((row) => row.orderNo === orderNo);
  if (!order) throw Error('SIMULATION_ORDER_DENIED');
  const selected = { ...scope, ...order, orders: undefined };
  const selectedState =
    orderNo === scope.orderNo
      ? state
      : (state.orderStates?.[orderNo] ?? {
          simulation: true,
          runId: scope.runId,
          orderNo,
          customerCode: selected.customerCode,
          base: selected.base,
          status: '待模拟确认',
          records: [],
        });
  return { scope: selected, state: selectedState };
}

export function applyGroupedSimulationEvent(state, event, scope) {
  const value =
    typeof event.action_value === 'string' ? JSON.parse(event.action_value) : event.action_value;
  const member = simulationMember(scope, state, value?.orderNo);
  const next = applySimulationEvent(member.state, event, member.scope);
  if (next === member.state) return state;
  return member.scope.orderNo === scope.orderNo
    ? next
    : {
        ...state,
        orderStates: { ...state.orderStates, [member.scope.orderNo]: next },
      };
}

function groupedCard(scope, state) {
  const text = (value) => String(value ?? '—').replace(/[<>&*_[\]\x60]/g, '');
  const url = (orderNo, view) =>
    'https://applink.feishu.cn/client/web_url/open?mode=window&width=640&height=720&url=' +
    encodeURIComponent(
      'http://127.0.0.1:3197/simulation?view=' +
        view +
        '&orderNo=' +
        encodeURIComponent(orderNo) +
        '#' +
        encodeURIComponent(scope.webToken),
    );
  const elements = [];
  for (const [index, order] of [scope, ...(scope.orders ?? [])].entries()) {
    const member = simulationMember(scope, state, order.orderNo);
    const current = member.state;
    const eligible = Number.isFinite(order.rate) && order.rate >= 90 && order.rate <= 100;
    const processed = current.reminderStopped === true;
    if (index) elements.push({ tag: 'hr' });
    elements.push({
      tag: 'div',
      text: {
        tag: 'plain_text',
        text_color: 'red',
        content: eligible
          ? '订单满足率达到90%，请确认是否开单？'
          : Number.isFinite(order.rate)
            ? '订单满足率未达到90%，请先处理缺货订单。'
            : '订单满足率暂未完整提供，请核对后再确认开单。',
      },
    });
    const controls = processed
      ? [
          {
            tag: 'div',
            text: {
              tag: 'plain_text',
              text_color: 'grey',
              content: current.status === '模拟已暂缓' ? '已暂缓' : '已处理',
            },
          },
        ]
      : [
          {
            tag: 'button',
            text: { tag: 'plain_text', content: '确认发货' },
            type: 'primary',
            size: 'medium',
            disabled: !eligible,
            ...(!eligible
              ? {
                  disabled_tips: {
                    tag: 'plain_text',
                    content: '满足率未达到90%或未知，先核对订单',
                  },
                }
              : {}),
            behaviors: [{ type: 'open_url', default_url: url(order.orderNo, 'confirm') }],
          },
          {
            tag: 'button',
            text: { tag: 'plain_text', content: '暂缓发货' },
            type: 'text',
            size: 'medium',
            behaviors: [{ type: 'open_url', default_url: url(order.orderNo, 'defer') }],
          },
        ];
    elements.push({
      tag: 'column_set',
      flex_mode: 'stretch',
      horizontal_spacing: '16px',
      columns: [
        {
          tag: 'column',
          width: 'weighted',
          weight: 4,
          elements: [
            {
              tag: 'markdown',
              content:
                '订单号：[' + text(order.orderNo) + '](' + url(order.orderNo, 'details') + ')',
            },
            {
              tag: 'div',
              text: {
                tag: 'plain_text',
                text_color: 'grey-700',
                content:
                  '客户：' +
                  text(order.customer) +
                  '\n订单满足率：' +
                  (Number.isFinite(order.rate) ? order.rate.toFixed(1) + '%' : '—') +
                  '\n总数量：' +
                  text(order.quantity) +
                  ' ' +
                  text(order.unit),
              },
            },
          ],
        },
        {
          tag: 'column',
          width: 'weighted',
          weight: 1,
          vertical_align: 'center',
          vertical_spacing: '8px',
          elements: controls,
        },
      ],
    });
  }
  elements.push({
    tag: 'div',
    text: {
      tag: 'plain_text',
      text_size: 'notation',
      text_color: 'grey',
      content: '模拟验收 · 不执行真实发货或改单',
    },
  });
  return {
    schema: '2.0',
    header: {
      template: 'blue',
      title: { tag: 'lark_md', content: '<at id=' + scope.operatorId + '></at> 订单待确认' },
    },
    config: { enable_forward: false, width_mode: 'default' },
    body: { padding: '16px', vertical_spacing: '16px', elements },
  };
}

export function simulationCard(scope, state, view = 'home') {
  if (scope.webToken) return groupedCard(scope, state);
  const plain = (content) => ({ tag: 'plain_text', content });
  const escape = (value) => String(value ?? '—').replace(/[<>&*_[\]\x60]/g, '');
  const actionValue = (action) => ({
    simulation: true,
    runId: scope.runId,
    orderNo: scope.orderNo,
    action,
  });
  const button = (label, action, confirm = false) => ({
    tag: 'button',
    text: plain(label),
    type: action === 'confirm' ? 'primary_filled' : 'default',
    behaviors: [{ type: 'callback', value: actionValue(action) }],
    ...(confirm
      ? {
          confirm: {
            title: plain('确认开单？'),
            text: plain('仅保存模拟确认结果，不触发真实发货或改单。取消不会保存。'),
          },
        }
      : {}),
  });
  const webButton = (label, view) => {
    const local =
      'http://127.0.0.1:3197/simulation?view=' + view + '#' + encodeURIComponent(scope.webToken);
    return {
      tag: 'button',
      text: plain(label),
      type: view === 'confirm' ? 'primary_filled' : view === 'details' ? 'primary_text' : 'default',
      behaviors: [
        {
          type: 'open_url',
          default_url:
            'https://applink.feishu.cn/client/web_url/open?mode=window&width=640&height=720&url=' +
            encodeURIComponent(local),
        },
      ],
    };
  };
  const eligible = Number.isFinite(scope.rate) && scope.rate >= 90 && scope.rate <= 100;
  const confirm = {
    ...button('确认发货', 'confirm', true),
    disabled: !eligible,
    ...(!eligible ? { disabled_tips: plain('满足率不足 90% 或未知，不能确认发货') } : {}),
  };
  const defer = {
    tag: 'select_static',
    name: 'defer_days',
    width: 'fill',
    placeholder: plain('暂缓发货：请选择 1—7 天'),
    options: Array.from({ length: 7 }, (_, index) => ({
      text: plain(index + 1 + ' 天'),
      value: String(index + 1),
    })),
    behaviors: [{ type: 'callback', value: actionValue('defer') }],
    confirm: {
      title: plain('确认暂缓发货？'),
      text: plain('按所选天数保存模拟暂缓日期，并停止模拟提醒。取消不会保存。'),
    },
  };
  const columns = (items) => ({
    tag: 'column_set',
    columns: items.map((item) => ({
      tag: 'column',
      width: 'weighted',
      weight: 1,
      elements: [item],
    })),
  });
  const elements = [
    {
      tag: 'markdown',
      content:
        '订单号：' +
        escape(scope.orderNo) +
        '\n客户：' +
        escape(scope.customer) +
        '\n订单满足率：' +
        (Number.isFinite(scope.rate) ? scope.rate.toFixed(1) + '%' : '—') +
        '\n总数量：' +
        escape(scope.quantity) +
        ' ' +
        escape(scope.unit),
    },
  ];
  if (view === 'details') {
    elements.push({ tag: 'markdown', content: '**订单明细（当前页面已读取快照）**' });
    for (const line of scope.lines ?? [])
      elements.push({
        tag: 'markdown',
        content:
          '**' +
          escape(line.name) +
          '** / ' +
          escape(line.sku) +
          '\n订货 ' +
          escape(line.quantity) +
          ' ' +
          escape(line.unit) +
          ' · 缺货 ' +
          escape(line.shortage) +
          ' ' +
          escape(line.unit) +
          '\n单价：' +
          escape(line.price),
      });
    elements.push({
      tag: 'markdown',
      content:
        '**提货点：**' +
        escape(scope.pickup) +
        '\n**经销商：**' +
        escape(scope.customer) +
        '\n**车型：**' +
        escape(scope.vehicle) +
        '\n数量沿用页面原单位；未提供的信息显示横线。',
    });
    elements.push(button('返回', 'home'));
  } else {
    elements.push({ tag: 'hr' });
    if (scope.webToken) {
      const webConfirm = { ...webButton('确认发货', 'confirm'), disabled: !eligible };
      const actions = {
        tag: 'column_set',
        flex_mode: 'stretch',
        horizontal_spacing: '12px',
        margin: '4px 0px 0px 0px',
        columns: [
          {
            tag: 'column',
            width: 'weighted',
            weight: 1,
            elements: [{ ...webButton('查看明细', 'details'), size: 'medium' }],
          },
          {
            tag: 'column',
            width: 'weighted',
            weight: 1,
            elements: [
              {
                tag: 'column_set',
                flex_mode: 'flow',
                horizontal_align: 'right',
                horizontal_spacing: '8px',
                columns: [webButton('暂缓发货', 'defer'), webConfirm].map((item) => ({
                  tag: 'column',
                  width: 'auto',
                  elements: [{ ...item, size: 'medium' }],
                })),
              },
            ],
          },
        ],
      };
      elements.push(actions);
    } else {
      elements.push(columns([confirm, button('查看明细', 'open_details')]));
      elements.push(defer);
    }
  }
  elements.push({
    tag: 'div',
    text: {
      tag: 'plain_text',
      text_size: 'notation',
      text_color: 'grey',
      content: '模拟验收 · ' + escape(state.status ?? '待操作') + ' · 不执行真实发货或改单',
    },
  });
  return {
    schema: '2.0',
    header: {
      template: 'blue',
      title: { tag: 'lark_md', content: '<at id=' + scope.operatorId + '></at> 订单待确认' },
    },
    config: { enable_forward: false, width_mode: 'default' },
    body: { padding: '16px', vertical_spacing: '12px', elements },
  };
}
