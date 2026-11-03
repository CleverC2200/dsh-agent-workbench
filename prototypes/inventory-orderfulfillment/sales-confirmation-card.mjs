import { salesCardTemplate, renderSalesCardTemplate } from './sales-card-template.mjs';
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
  const section = {
    hasEntry: Boolean(options.entryUrl),
    entryUrl: options.entryUrl ? windowUrl(options.entryUrl) : '',
    orderNoMarkdown: escape(draft.orderNo),
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
  for (const [name, key] of [
    ['Confirm', 'confirm'],
    ['Defer', 'defer'],
    ['Edit', 'edit'],
  ]) {
    section['has' + name] = Boolean(urls[key]);
    section[name + 'Url'] = urls[key] ? windowUrl(urls[key]) : '';
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
