import { salesCardTemplate, renderSalesCardTemplate } from './sales-card-template.mjs';

export function confirmationDraft(input) {
  const draft = structuredClone(input);
  const rate =
    (typeof draft.rate === 'string' || typeof draft.rate === 'number') &&
    String(draft.rate).trim() !== ''
      ? Number(draft.rate)
      : NaN;
  draft.rate = Number.isFinite(rate) && rate >= 0 && rate <= 100 ? rate : null;
  draft.scenario =
    draft.credit?.status === 'insufficient'
      ? 'credit'
      : draft.rate === null
        ? 'unknown'
        : draft.rate >= 90
          ? 'ready'
          : 'shortage';
  draft.consumerCode = 'order01';
  return draft;
}

export function salesConfirmationCard(input, options = {}) {
  const draft = confirmationDraft(input);
  const escape = (value) =>
    String(value ?? '—')
      .replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c])
      .replace(/[\\*_[\]`]/g, '\\$&');
  const urls = options.urls || {};
  let origin;
  for (const value of [
    ...Object.values(urls),
    ...(options.entryUrl === undefined ? [] : [options.entryUrl]),
  ]) {
    if (typeof value !== 'string' || !value.trim()) throw Error('ORDER_CONFIRMATION_LINK_INVALID');
    const url = new URL(value);
    const local =
      options.preview === true && url.protocol === 'http:' && url.hostname === '127.0.0.1';
    if (
      (!local && url.protocol !== 'https:') ||
      url.username ||
      url.password ||
      url.hash ||
      (origin && url.origin !== origin)
    )
      throw Error('ORDER_CONFIRMATION_LINK_INVALID');
    origin = url.origin;
  }
  if (options.mentionOpenId !== undefined && !/^ou_[A-Za-z0-9]+$/.test(options.mentionOpenId))
    throw Error('ORDER_CONFIRMATION_RECIPIENT_INVALID');
  const windowUrl = (url) =>
    'https://applink.feishu.cn/client/web_url/open?mode=window&width=640&height=720&url=' +
    encodeURIComponent(url);
  const missing = (draft.lines || []).filter(
    (line) =>
      typeof line.rawShortage === 'number' &&
      Number.isFinite(line.rawShortage) &&
      line.rawShortage > 0,
  );
  const missingPrices = (draft.lines || []).filter((line) => line.priceStatus === 'PRICE_MISSING');
  const priceIssue =
    Boolean(draft.priceStatus && draft.priceStatus !== 'READY') ||
    (draft.omsEventType === 'PRICE_CHECK_FAILED' && draft.priceStatus !== 'READY');
  const section = {
    hasEntry: Boolean(options.entryUrl),
    entryUrl: options.entryUrl ? windowUrl(options.entryUrl) : '',
    orderNoMarkdown: escape(draft.dmsOrderNo ?? draft.orderNo),
    executionOrderNo: escape(draft.executionOrderNo),
    hasExecutionOrderNo:
      typeof draft.executionOrderNo === 'string' && !!draft.executionOrderNo.trim(),
    dmsOrderNo: escape(draft.dmsOrderNo ?? draft.orderNo),
    deliveryDate: escape(draft.deliveryDate),
    hasInstruction: true,
    instruction:
      typeof draft.notice === 'string' && draft.notice.trim()
        ? draft.notice
        : draft.scenario === 'credit'
          ? Number.isFinite(draft.credit?.shortfall) && draft.credit.shortfall > 0
            ? `信用额度校验未通过，缺口：${draft.credit.shortfall}元，请联系业务核实补充情况。`
            : draft.credit?.shortfall == null
              ? '信用额度校验未通过，具体缺口金额未提供，请联系业务核实。'
              : '信用额度校验结果与缺口金额需核实，请联系业务确认。'
          : draft.priceStatus && draft.priceStatus !== 'READY'
            ? '商品价格核验未完成，请核对后处理订单。'
            : draft.scenario === 'ready'
              ? `订单满足率 ${draft.rate.toFixed(1)}%${missing.length ? '，仍有部分商品缺货' : ''}，请核对订单后处理。`
              : draft.scenario === 'shortage'
                ? `订单满足率 ${draft.rate.toFixed(1)}%，未达到90%，请核对库存及商品数量。`
                : '订单满足率未提供，暂无法判断库存满足情况，请核对后处理订单。',
    creditInsufficient: draft.scenario === 'credit',
    priceIssue,
    customer: escape(draft.customer),
    quantity: String(draft.quantity ?? '—'),
    rate: draft.rate === null ? '—' : draft.rate.toFixed(1) + '%',
    rateKnown: draft.rate !== null,
    ready: draft.scenario === 'ready',
    pending: true,
    separator: false,
    shortages: missing.slice(0, 5).map((line) => ({
      sku: String(line.sku ?? '—'),
      quantity: String(line.shortage ?? '数量单位待核对'),
    })),
    moreShortages: missing.length > 5,
    hasDetails: Boolean(urls.details),
    detailsUrl: urls.details ? windowUrl(urls.details) : '',
  };
  if (priceIssue && draft.scenario !== 'credit' && missingPrices.length)
    section.instruction =
      (draft.notice?.trim() || '订单中部分商品没有价格，请维护价格') +
      '\n' +
      missingPrices
        .slice(0, 5)
        .map((line) => `SKU：${String(line.sku ?? '—')} 没价格`)
        .join('\n') +
      (missingPrices.length > 5 ? '\n其余缺价商品请在订单处理中查看。' : '');
  for (const [name, key] of [
    ['Confirm', 'confirm'],
    ['Defer', 'defer'],
    ['Edit', 'edit'],
  ]) {
    section['has' + name] = Boolean(urls[key]);
    section[name + 'Url'] = urls[key] ? windowUrl(urls[key]) : '';
  }
  const processUrl = urls.process ?? urls.confirm ?? urls.edit;
  section.hasProcess = Boolean(processUrl);
  if (processUrl) {
    const url = new URL(processUrl);
    url.searchParams.set('view', 'process');
    url.searchParams.delete('mode');
    section.ProcessUrl = windowUrl(url.href);
    url.searchParams.set('view', 'price');
    section.hasPrice = true;
    section.PriceUrl = windowUrl(url.href);
  }
  return renderSalesCardTemplate(salesCardTemplate, {
    mentions: options.mentionOpenId ? '<at id=' + options.mentionOpenId + '></at> ' : '',
    needsProcessing: draft.scenario !== 'ready',
    sections: [section],
    preview: options.preview === true,
    pilot: false,
    hasMore: false,
    omsUnavailable: options.preview !== true,
  });
}
