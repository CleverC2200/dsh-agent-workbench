import { salesCardTemplate, renderSalesCardTemplate } from './sales-card-template.mjs';

function priceReason(draft, lines) {
  if (draft.omsEventType === 'PRICE_CHECK_FAILED' && !draft.priceRecheckedAt)
    return 'OMS提示商品价格校验未通过，请联系业务核实。';
  const statuses = new Set([draft.priceStatus, ...lines.map((line) => line.priceStatus)]);
  const reasons = {
    missing_or_expired: '商品价格缺失或已过期，请联系业务核实。',
    PRICE_CONTEXT_QUERY_UNAVAILABLE:
      '商品价格未获取：查价资料查询未成功，请核对读取权限或查询服务。',
    PRICE_CONTEXT_NOT_VISIBLE_OR_MISSING:
      '商品价格未获取：未读取到客户与提货点的查价资料，请核对资料及读取权限。',
    PRICE_CONTEXT_CONFLICTING: '客户与提货点的查价资料不唯一，请联系业务核实。',
    PRICE_CONTEXT_SCOPE_MISMATCH: '查价资料与订单客户或提货点不一致，请联系业务核实。',
    PRICE_CONTEXT_MISSING: '查价所需的客户、提货点、公司或工厂资料不完整，请核对后重试。',
    PRICE_CONTEXT_MISSING_OR_CONFLICTING:
      '商品价格未获取：未取得唯一且可读取的查价资料，请核对客户、提货点及权限。',
    PICKUP_POINT_INACTIVE: '提货点未启用或未完成匹配，请联系业务核实。',
    PRICE_CONFLICT: 'SAP返回的价格或计价条件存在冲突，请联系业务核实。',
    SAP_PRICE_CUSTOMER_BLOCKED: 'SAP查价提示客户冻结，请联系业务核实',
    SAP_PRICE_REJECTED: 'SAP拒绝本次查价，具体原因请联系业务核实。',
    SAP_PRICE_TIMEOUT: 'SAP查价超时，请稍后重试。',
    SAP_PRICE_CONNECTION_FAILED: '暂时无法连接SAP查价服务，请稍后重试。',
    SAP_PRICE_HTTP_ERROR: 'SAP查价服务返回异常状态，请联系接口负责人核查。',
    SAP_PRICE_RESPONSE_INVALID: 'SAP查价返回的数据格式异常，请联系接口负责人核查。',
    SAP_PRICE_SCOPE_MISMATCH: 'SAP返回的报价与本次订单查价范围不一致，请联系接口负责人核查。',
    SAP_PRICE_INTERRUPTED: '本次SAP查价已中断，请重新查询。',
    PRICE_CONDITIONS_UNSUPPORTED: 'SAP返回的计价信息不符合当前规则，请联系业务核实。',
    PRICE_MISSING: 'SAP未返回该商品的价格，请联系业务核实。',
    PRICE_QUERY_DISABLED: '商品查价服务未启用，暂时无法核验价格。',
    LINES_UNAVAILABLE: '订单商品信息不完整，暂无法完成查价，请核对商品明细。',
  };
  return (
    Object.entries(reasons).find(([status]) => statuses.has(status))?.[1] ||
    '商品价格核验未完成，具体原因尚未确认，请联系业务或接口负责人核实。'
  );
}

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
  const missing = (draft.lines || []).filter((line) => {
    const shortage = line.rawShortage ?? line.shortage;
    return typeof shortage === 'number' && Number.isFinite(shortage) && shortage > 0;
  });
  const lines = Array.isArray(draft.lines) ? draft.lines : [];
  const abnormalPrices = lines.filter(
    (line) =>
      typeof line.priceStatus === 'string' &&
      line.priceStatus.trim() &&
      line.priceStatus !== 'READY',
  );
  const priceIssue =
    Boolean(draft.priceStatus && draft.priceStatus !== 'READY') ||
    abnormalPrices.length > 0 ||
    (draft.omsEventType === 'PRICE_CHECK_FAILED' && !draft.priceRecheckedAt);
  const affectedLines = abnormalPrices.length ? abnormalPrices : lines;
  const priceSkus = [
    ...new Set(affectedLines.map((line) => String(line.sku ?? '').trim()).filter(Boolean)),
  ];
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
          : priceIssue
            ? priceReason(draft, lines)
            : draft.scenario === 'ready'
              ? `订单满足率 ${draft.rate.toFixed(1)}%${missing.length ? '，仍有部分商品缺货' : ''}，请核对订单后处理。`
              : draft.scenario === 'shortage'
                ? `订单满足率 ${draft.rate.toFixed(1)}%，未达到90%，请核对库存及商品数量。`
                : '订单满足率未提供，暂无法判断库存满足情况，请核对后处理订单。',
    creditInsufficient: draft.scenario === 'credit',
    priceIssue,
    hasPriceSkus: priceIssue && priceSkus.length > 0,
    priceSkus: priceSkus.slice(0, 5).map((sku) => ({ sku })),
    priceSkusUnconfirmed: priceIssue && abnormalPrices.length === 0,
    priceSkusUnlocated:
      priceIssue &&
      (!affectedLines.length || affectedLines.some((line) => !String(line.sku ?? '').trim())),
    morePriceSkus: priceIssue && priceSkus.length > 5,
    customer: escape(draft.customer),
    quantity: String(draft.quantity ?? '—'),
    rate: draft.rate === null ? '—' : draft.rate.toFixed(1) + '%',
    rateKnown: draft.rate !== null,
    ready: draft.scenario === 'ready',
    pending: true,
    separator: false,
    shortages: missing.slice(0, 5).map((line) => ({
      sku: String(line.sku ?? '').trim() || '未提供',
      quantity: String(line.shortage ?? '数量单位待核对'),
    })),
    moreShortages: missing.length > 5,
    hasDetails: Boolean(urls.details),
    detailsUrl: urls.details ? windowUrl(urls.details) : '',
  };
  if (draft.scenario === 'credit' && priceIssue && !draft.notice?.trim())
    section.instruction += '\n' + priceReason(draft, lines);
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
