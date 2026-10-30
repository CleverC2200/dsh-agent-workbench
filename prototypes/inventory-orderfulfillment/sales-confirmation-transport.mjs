/** 正式确认只沿已有 Host workspace 端口；页面不持有凭据、销售映射或机器人配置。 */
export function mountSalesConfirmationTransport(document, request) {
  let generation = 0,
    availability,
    timer,
    debounce,
    failures = 0;
  const bindings = new Map(),
    results = new Map();
  const selection = (row, period = row) => ({
    orderNo: String(row.orderNo ?? row.order_no),
    customerCode: String(row.customerCode ?? row.customer_code),
    base: String(row.base),
    start: period.start,
    endExclusive: period.endExclusive ?? period.end_exclusive,
  });
  const key = (s) => JSON.stringify([s.orderNo, s.customerCode, s.base, s.start, s.endExclusive]);
  const alive = () => [...bindings].filter(([, binding]) => binding.button.isConnected);
  const label = (result) =>
    result.sourceChanged
      ? '需重新确认'
      : result.decisions?.[0]?.action_id === 'defer_shipment'
        ? '已暂缓'
        : result.decisions?.[0]?.action_id === 'confirm_shipment'
          ? '已登记确认'
          : result.status === 'pending' && result.delivery === 'verification_required'
            ? '发送待核实'
            : result.status === 'pending' && result.delivery === 'failed'
              ? '发送失败'
              : result.status === 'pending' && result.delivery === 'queued'
                ? '待发送'
                : result.status === 'pending' && result.delivery === 'sending'
                  ? '发送中'
                  : ({
                      pending: '待销售处理',
                      processing: '处理中',
                      not_requested: '未发起',
                      expired: '已过期',
                      cancelled: '已取消',
                      verification_required: '结果待核实',
                      resolved: '已处理',
                    }[result.status] ?? '状态待核实');
  async function available() {
    if (!availability) {
      const current = generation;
      const pending = Promise.resolve()
        .then(() => request({ operation: 'capabilities' }))
        .then((value) => value?.available === true)
        .catch(() => {
          if (current === generation && availability === pending) availability = undefined;
          return false;
        });
      availability = pending;
    }
    return availability;
  }
  function unknown(binding, reason) {
    binding.button.textContent = '状态待核实';
    binding.button.title = reason;
  }
  function update(s, result) {
    results.set(key(s), result);
    const binding = bindings.get(key(s));
    if (binding?.button.isConnected) {
      binding.button.textContent = label(result);
      binding.button.title =
        result.delivery === 'failed'
          ? '飞书卡片发送失败，确认任务已保存；请查看记录核对后台配置。'
          : result.delivery === 'verification_required'
            ? '飞书发送结果待核实，不能认定销售已收到；不要重复发起。'
            : '查看销售确认记录；不代表 OMS 已执行';
    }
  }
  async function refresh(current = generation) {
    clearTimeout(timer);
    if (!(await available()) || current !== generation) return;
    const visible = alive();
    for (const [k, b] of bindings) if (!b.button.isConnected) bindings.delete(k);
    let failed = false;
    for (let i = 0; i < visible.length; i += 20) {
      const batch = visible.slice(i, i + 20);
      try {
        const response = await request({
          operation: 'lookup_batch',
          selections: batch.map(([, b]) => b.selection),
        });
        if (current !== generation) return;
        if (!Array.isArray(response.records)) throw Error('ORDER_CONFIRMATION_STATUS_INVALID');
        const requested = new Set(batch.map(([k]) => k)),
          returned = new Set();
        for (const result of response.records) {
          const id = key(result.selection);
          if (!requested.has(id) || returned.has(id) || typeof result.status !== 'string')
            throw Error('ORDER_CONFIRMATION_STATUS_INVALID');
          returned.add(id);
        }
        for (const result of response.records)
          if (bindings.has(key(result.selection))) update(result.selection, result);
        for (const [k, binding] of batch)
          if (!returned.has(k)) {
            results.delete(k);
            unknown(binding, '本次查询未返回该订单的授权记录，请核对订单、客户、基地及统计周期。');
          }
      } catch (error) {
        if (current !== generation) return;
        failed = true;
        for (const [k, binding] of batch) {
          results.delete(k);
          unknown(binding, '确认状态读取失败：' + (error.message || '请稍后重新查看'));
        }
      }
    }
    failures = failed ? failures + 1 : 0;
    if (
      current === generation &&
      ((failed && failures < 3) ||
        alive().some(([k]) => {
          const result = results.get(k);
          return (
            ['pending', 'processing'].includes(result?.status) &&
            !['failed', 'verification_required'].includes(result?.delivery)
          );
        }))
    )
      timer = setTimeout(() => refresh(current), failed ? 3000 * failures : 3000);
  }
  function clear() {
    generation++;
    availability = undefined;
    failures = 0;
    clearTimeout(timer);
    clearTimeout(debounce);
    bindings.clear();
    results.clear();
  }
  document.defaultView?.addEventListener('gea-session-changing', clear);
  return {
    available,
    async notify(draft) {
      const current = generation,
        s = selection(draft);
      if (!(await available())) throw Error('正式飞书确认入口尚未启用');
      if (current !== generation) throw Error('页面范围已切换，请重新操作');
      const result = await request({ operation: 'create', selection: s });
      if (current !== generation) throw Error('页面范围已切换，请重新操作');
      update(s, result);
      void refresh(current);
      return result;
    },
    watch(button, row, period) {
      const s = selection(row, period);
      bindings.set(key(s), { button, selection: s });
      if (results.has(key(s))) update(s, results.get(key(s)));
      clearTimeout(debounce);
      debounce = setTimeout(() => refresh(generation), 100);
    },
    async history(row, period) {
      const current = generation,
        s = selection(row, period);
      if (!(await available())) throw Error('正式飞书确认入口尚未启用');
      if (current !== generation) throw Error('页面范围已切换，请重新查看');
      const result = await request({ operation: 'lookup', selection: s });
      if (current !== generation) throw Error('页面范围已切换，请重新查看');
      update(s, result);
      return {
        status: label(result),
        details: [
          ...(result.sourceChanged ? ['当前数据已变化，下面记录对应之前的订单快照。'] : []),
          ...(result.decisions ?? []).map(
            (d) =>
              `${d.decided_at} ${d.action_id === 'defer_shipment' ? '暂缓至 ' + d.deferred_until : '销售已确认'}；处理人 ${d.actor_id}`,
          ),
          ...(result.delivery === 'failed' ? ['确认任务已保存，但飞书卡片发送失败。'] : []),
          ...(result.delivery === 'verification_required'
            ? ['飞书发送结果待核实，未自动重发。']
            : []),
          '记录不代表真实开单、发货或改单已执行。',
        ].join('\n'),
      };
    },
    clear,
  };
}
