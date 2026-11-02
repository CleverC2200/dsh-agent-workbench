/** Presentation only. Host-verified links and recipients are not supplied by page data. */
export function confirmationDraft(input) {
  const draft = structuredClone(input);
  const rate =
    (typeof draft.rate === 'string' || typeof draft.rate === 'number') &&
    String(draft.rate).trim() !== ''
      ? Number(draft.rate)
      : NaN;
  draft.rate = Number.isFinite(rate) && rate >= 0 && rate <= 100 ? rate : null;
  const shortage = (draft.lines || []).some(
    (line) =>
      typeof line.rawShortage === 'number' &&
      Number.isFinite(line.rawShortage) &&
      line.rawShortage > 0,
  );
  draft.scenario =
    draft.rate === null ? 'unknown' : draft.rate >= 90 && !shortage ? 'ready' : 'shortage';
  draft.consumerCode = 'order01';
  return draft;
}

/** Generates no execution authority. Without Host-resolved URLs, action buttons stay disabled. */
export function salesConfirmationCard(input, options = {}) {
  const draft = confirmationDraft(input);
  const escape = (value) =>
    String(value ?? '—')
      .replace(/[&<>]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[character])
      .replace(/[\\*_[\]`]/g, '\\$&');
  const title = draft.scenario === 'ready' ? '订单待确认' : '订单待处理';
  const urls = options.urls || {};
  let linkOrigin;
  for (const value of Object.values(urls)) {
    if (typeof value !== 'string' || !value.trim()) throw Error('ORDER_CONFIRMATION_LINK_INVALID');
    const url = new URL(value);
    const local =
      options.preview === true && url.protocol === 'http:' && url.hostname === '127.0.0.1';
    if (
      (!local && url.protocol !== 'https:') ||
      url.username ||
      url.password ||
      url.hash ||
      (linkOrigin && url.origin !== linkOrigin)
    )
      throw Error('ORDER_CONFIRMATION_LINK_INVALID');
    linkOrigin = url.origin;
  }
  const action = (text, mode, type) => ({
    tag: 'button',
    text: { tag: 'plain_text', content: text },
    type,
    ...(urls[mode]
      ? {
          behaviors: [
            {
              type: 'open_url',
              default_url:
                'https://applink.feishu.cn/client/web_url/open?mode=window&width=640&height=720&url=' +
                encodeURIComponent(urls[mode]),
            },
          ],
        }
      : {
          disabled: true,
          disabled_tips: { tag: 'plain_text', content: '等待 GEA 提供当前订单的受控操作入口' },
        }),
  });
  let heading = title;
  if (options.mentionOpenId !== undefined) {
    if (!/^ou_[A-Za-z0-9]+$/.test(options.mentionOpenId))
      throw Error('ORDER_CONFIRMATION_RECIPIENT_INVALID');
    heading = '<at id=' + options.mentionOpenId + '></at> ' + title;
  }
  const missing = (draft.lines || []).filter(
    (line) =>
      typeof line.rawShortage === 'number' &&
      Number.isFinite(line.rawShortage) &&
      line.rawShortage > 0,
  );
  const prompt =
    (draft.scenario === 'ready'
      ? '订单满足率达到90%，请确认是否开单？'
      : draft.scenario === 'unknown'
        ? '订单满足率暂未完整提供，请核对后处理。'
        : '订单存在缺货或满足率不足，请先处理缺货订单。') +
    missing
      .slice(0, 5)
      .map(
        (line) =>
          '\nSKU：' +
          escape(line.sku) +
          ' 原订单缺货：' +
          escape(line.shortage ?? '数量单位待核对'),
      )
      .join('') +
    (missing.length > 5 ? '\n其余缺货商品请在“订单处理”中核对。' : '');
  const summary = [
    { tag: 'markdown', content: '订单号：' + escape(draft.orderNo) },
    ...[
      '客户：' + escape(draft.customer),
      '订单满足率：' + (draft.rate === null ? '—' : draft.rate.toFixed(1) + '%'),
      '总数量：' + escape(draft.quantity),
    ].map((content) => ({
      tag: 'div',
      text: { tag: 'plain_text', content, text_color: 'grey-700' },
    })),
  ];
  const actions =
    draft.scenario === 'ready'
      ? [action('确认发货', 'confirm', 'primary'), action('暂缓发货', 'defer', 'text')]
      : [action('暂缓发货', 'defer', 'text'), action('订单处理', 'edit', 'primary')];
  return {
    schema: '2.0',
    config: { update_multi: true, wide_screen_mode: true },
    header: { template: 'blue', title: { tag: 'lark_md', content: heading } },
    body: {
      elements: [
        { tag: 'div', text: { tag: 'plain_text', content: prompt, text_color: 'red' } },
        {
          tag: 'column_set',
          flex_mode: 'stretch',
          columns: [
            { tag: 'column', width: 'weighted', weight: 4, elements: summary },
            { tag: 'column', width: 'weighted', weight: 1, elements: actions },
          ],
        },
        ...(options.preview === true
          ? [{ tag: 'markdown', content: '本地样例预览 · 不发货、不改单；延期及提交不保存。' }]
          : []),
      ],
    },
  };
}
