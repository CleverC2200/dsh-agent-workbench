import { readFailure } from './mps-read.js';

const formatCount = (count) => count.toLocaleString('zh-CN') + ' 条';
const countRows = (rows, noun = '') =>
  Number.isSafeInteger(rows) ? `${formatCount(rows)}${noun}` : '';

export const isReading = (read) => !read || ['unread', 'loading', 'queued'].includes(read.status);

export function loadingItem(name, read, detail, retry) {
  const error = read?.error;
  const issue = error && readFailure(error);
  const status = isReading(read)
    ? read?.status === 'loading'
      ? '读取中'
      : '等待读取'
    : read.status === 'failed'
      ? '读取失败'
      : issue || read.status === 'partial'
        ? '部分可用'
        : read.status === 'missing'
          ? '缺少输入'
          : '已读取';
  return {
    name,
    status,
    detail,
    issue,
    pending: isReading(read),
    retry: issue && ['network', 'offline', 'failed'].includes(issue.kind) ? retry : undefined,
  };
}

export function demandLoadingItems(draft, shipment, groups, retry) {
  const periods = draft.reportRead?.periods ?? {};
  const report = periods[draft.month] ?? draft.reportRead;
  const local = { status: 'ready' };
  const read = (type) => (draft.files[type] ? local : draft[type + 'Read']);
  const products = draft.productSource.startsWith('business') ? draft.productsRead : local;
  const productMonth = (draft.productReadPeriod ?? draft.productPeriod)?.adoptedMonth;
  const shipState =
    shipment?.status === 'loading' ||
    shipment?.status === 'failed' ||
    shipment?.status === 'partial'
      ? shipment
      : shipment?.status === 'ok' || shipment?.status === 'local-file'
        ? local
        : !draft.productSource.startsWith('business') ||
            draft.shipment?.activeSource === 'local-file'
          ? { status: 'missing' }
          : undefined;
  return [
    loadingItem(
      '产品清单',
      products,
      !isReading(products) && products.status !== 'failed'
        ? [
            productMonth,
            draft.products.length ? countRows(draft.products.length, '产品记录') : '本期未返回记录',
          ]
            .filter(Boolean)
            .join(' · ')
        : '核对评估月份与产品统计期',
      retry.products,
    ),
    loadingItem(
      '发货快照',
      shipState,
      shipment?.waitingForCoefficients
        ? '库存日报已到，正在读取上月发运系数'
        : shipState?.status === 'missing'
          ? '可在本月预估发货选择统计基月的来源'
          : shipState && !isReading(shipState) && shipState.status !== 'failed'
            ? [shipment?.cutoff, countRows(shipment?.rows?.length, '基地 × SKU')]
                .filter(Boolean)
                .join(' · ')
            : '读取统计基月的库存日报与发运系数',
      retry.shipment,
    ),
    loadingItem(
      '销售提报',
      draft.files.report ? local : report,
      !isReading(report) && report.status === 'ready'
        ? `${draft.month} · ${countRows(report.metadata?.total ?? draft.report.filter((row) => row['月份'] === draft.month).length)}`
        : `先读取 ${draft.month} 的提报数量`,
      retry.report,
    ),
    loadingItem(
      '年度计划',
      read('annual'),
      draft.files.annual
        ? '本地文件'
        : !isReading(read('annual')) && read('annual').status === 'ready'
          ? countRows(draft.annual.length, '计算范围记录')
          : '读取当前计算所需月份',
      retry.annual,
    ),
    loadingItem(
      '大类历史',
      draft.historicalIndicatorsRead,
      groupDetail(groups.parameters, '核对 4 个历史窗口'),
      retry.parameters,
    ),
    loadingItem(
      '近三月实绩与计划',
      draft.sourceChecksRead,
      groupDetail(groups.basic, '核对 3 个月的实绩与计划量'),
      retry.basic,
    ),
  ];
}

const groupDetail = (progress, fallback) =>
  progress
    ? `${progress.done}/${progress.total} 项已核对${progress.last ? ` · ${progress.last}` : ''}`
    : fallback;

export function createLoadingProgress(react) {
  const h = react.createElement;
  return function LoadingProgress({ primary, secondary, retrying, connected }) {
    const pending = primary.filter((item) => item.pending).length;
    const issues = primary.filter((item) => item.issue || item.status === '缺少输入').length;
    const [detailsOpen, setDetailsOpen] = react.useState(null);
    const open = detailsOpen ?? (pending > 0 || issues > 0 || retrying);
    const summary = !connected
      ? '正在连接页面能力'
      : pending
        ? `${primary.length - pending}/${primary.length} 项主要数据已核对`
        : issues
          ? `${issues} 项主要数据需要处理`
          : '主要数据已核对';
    const row = (item) =>
      h(
        'li',
        { key: item.name },
        h(
          'div',
          { className: 'dc-loading-line' },
          h('strong', {}, item.name),
          h(
            'span',
            {
              className: 'dc-loading-state',
              'data-state': item.issue ? 'issue' : item.pending ? 'pending' : 'done',
            },
            item.status,
          ),
        ),
        item.detail && h('div', { className: 'dc-loading-detail' }, item.detail),
        item.issue && h('div', { className: 'dc-loading-help' }, item.issue.text),
        item.retry &&
          h(
            'button',
            { type: 'button', 'aria-label': `重试${item.name}`, onClick: item.retry },
            '重试此项',
          ),
      );
    return h(
      'section',
      { className: 'dc-card dc-loading', 'aria-label': '数据加载进度' },
      h(
        'details',
        { open },
        h(
          'summary',
          {
            onClick: (event) => {
              event.preventDefault();
              setDetailsOpen(!open);
            },
          },
          h('strong', {}, '数据加载进度'),
          h('span', { role: 'status' }, summary),
        ),
        h(
          'div',
          { className: 'dc-loading-body' },
          h('progress', {
            max: primary.length,
            value: primary.length - pending,
            'aria-label': '主要数据核对进度',
          }),
          retrying &&
            h('p', { role: 'status', className: 'dc-loading-help' }, '连接暂时不稳定，正在重试。'),
          h('ul', { className: 'dc-loading-sources' }, ...primary.map(row)),
          secondary.length > 0 &&
            h(
              'details',
              { className: 'dc-loading-secondary' },
              h('summary', {}, '其他数据'),
              h('ul', { className: 'dc-loading-sources' }, ...secondary.map(row)),
            ),
        ),
      ),
    );
  };
}
