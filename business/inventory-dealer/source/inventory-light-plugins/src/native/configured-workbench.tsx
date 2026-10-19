import { LocalQueryForm } from '../../../../../shared/local-query-form';
import React, { useState, useEffect } from 'react';
import { createPageViewState, usePageViewField } from '../../../../../shared/view-state.js';
import { reportElements } from '../channel.js';
import config from '../../../../sql.config.json';
import { ConfiguredFactsPage } from '../../../../../shared/configured-facts-page';
import { useConfiguredOverview } from '../../../../../shared/use-configured-overview';
import { businessDay, completeValue, knownNumber } from '../../../../../shared/configured-overview';
import { DealerOverview } from '../pages/dealer/overview';
import { updateContext, beginQuery } from './context';
import css from '../pages/dealer/workbench.module.css';
import { dealerStockOverview } from './dealer-stock-overview';
import common from '../../../../../shared/restored-workbench.module.css';
const stocks = [
  ['customer-stock', '客户库存'],
  ['category-stock', '品类库存'],
  ['sku-stock', 'SKU库存'],
  ['shortage-stock', '缺货库存'],
  ['expiry', '临期库存'],
];
const orders = [
  ['catalog', '公司商品'],
  ['policies', '本月政策'],
  ['sku-stock', '当前库存'],
  ['suggested-order', '建议订单'],
  ['orders', '订单履约'],
  ['customer-plan', '客户月计划'],
  ['customer-plan-analysis', '客户计划分析'],
  ['delivery', '交货记录'],
  ['vehicles', '客户车型'],
  ['pickup', '提货点'],
  ['customer', '客户目录 / 收货地址'],
];
const view = createPageViewState('inventory-dealer');
const stockTab = (value: unknown) =>
  ({
    customer: 'customer-stock',
    category: 'category-stock',
    sku: 'sku-stock',
    shortage: 'shortage-stock',
  })[String(value)] ?? String(value);
export default function ConfiguredWorkbench() {
  const [area, setArea] = usePageViewField(React, view, 'view', 'stock'),
    [tab, setTab] = usePageViewField(
      React,
      view,
      'tab',
      'customer-stock',
      (value) => value,
      stockTab,
    ),
    [customer, setCustomer] = usePageViewField(React, view, 'customer', ''),
    [draft, setDraft] = useState(''),
    [revision, refresh] = useState(0);
  const [page, setPage] = usePageViewField(React, view, 'page', 1);
  const [pageSize, setPageSize] = usePageViewField(React, view, 'pageSize', 10);
  useEffect(() => setDraft(customer), [customer]);
  const [date, setDate] = useState(businessDay),
    [dateDraft, setDateDraft] = useState(businessDay);
  const { parts, errors, busy } = useConfiguredOverview(config, date, customer, revision, (v) =>
    updateContext('overview', v),
  );
  const summary = parts.customer?.summary;
  const stock = parts['inventory-overview'];
  const data = {
    ...dealerStockOverview(stock?.summary, stock?.snapshotDate, config.dealerStockUnits),
    sourceMode: 'direct',
    sourceLoading: busy,
    scopeLabel: customer ? `客户 ${customer}` : '当前客户目录',
    customerCount: knownNumber(summary?.customer_count),
    storeCount: completeValue(summary, 'store_count'),
    storeCoverage: summary ? Number(summary.row_count) - Number(summary.missing_store_count) : null,
    sourceRowCount: knownNumber(summary?.row_count),
    inventoryDailyExpectedCustomerCount: knownNumber(summary?.customer_count),
  };
  const navigate = (value: string) => {
    setPage(1);
    if (value === 'customer') {
      setArea('order');
      setTab('customer');
      return;
    }
    setArea('stock');
    setTab(
      value === 'customer'
        ? 'customer-stock'
        : value === 'category'
          ? 'category-stock'
          : value === 'sku'
            ? 'sku-stock'
            : value === 'shortage'
              ? 'shortage-stock'
              : 'expiry',
    );
  };
  const choose = (value: string) => {
    setPage(1);
    setCustomer(value);
    setDraft(value);
    setArea('order');
    setTab('orders');
  };
  useEffect(
    () =>
      reportElements(
        'dealer-filters',
        [
          {
            id: 'filter:customer',
            role: 'control',
            label: '客户编码',
            value: customer,
            editable: true,
          },
        ],
        (args) => {
          if (args.kind !== 'setValue' || typeof args.value !== 'string' || args.value.length > 100)
            throw Error('INVALID_FILTER');
          setCustomer(args.value.trim());
          setDraft(args.value.trim());
          setPage(1);
        },
      ),
    [customer],
  );
  const scopeKey = JSON.stringify([tab, date, customer, revision, page, pageSize]);
  const [readState, setReadState] = useState({ key: '', status: 'loading' });
  const referenceReady =
    readState.key === scopeKey && ['available', 'empty'].includes(readState.status);
  const received = (value: any) => {
    setReadState({ key: scopeKey, status: value.status });
    updateContext('data', value);
    if (value.status === 'loading') {
      beginQuery({ customerCode: customer || null, tab, page, pageSize });
      return;
    }
    const available = ['available', 'empty'].includes(value.status);
    updateContext('queryState', {
      state: available ? 'ready' : value.status,
      message: value.message,
    });
    updateContext('dealer', {
      customerCode: customer || null,
      tab,
      page: value.page ?? page,
      recordTotal: value.total,
      visibleRows: value.rows ?? [],
      snapshotDate: value.snapshotDate,
    });
  };
  return (
    <main className={`${css.shell} ${common.root}`}>
      <header className={css.topbar}>
        <nav className={css.navigation} aria-label="客户库存与客户订单">
          <button
            aria-current={area === 'stock'}
            onClick={() => {
              setPage(1);
              setArea('stock');
              setTab('customer-stock');
            }}
          >
            客户库存
          </button>
          <button
            aria-current={area === 'order'}
            onClick={() => {
              setPage(1);
              setArea('order');
              setTab('catalog');
            }}
          >
            客户订单
          </button>
        </nav>
        <LocalQueryForm
          className={`${css.customerPicker} ${common.controls}`}
          onSubmit={(e) => {
            e.preventDefault();
            setPage(1);
            setCustomer(draft.trim());
            setDate(dateDraft);
            refresh((n) => n + 1);
          }}
        >
          <input
            aria-label="客户编码"
            placeholder="全部客户 / 输入客户编码"
            maxLength={100}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <input
            aria-label="读取时点"
            type="date"
            required
            max={businessDay()}
            value={dateDraft}
            onChange={(e) => setDateDraft(e.target.value)}
          />
          <button>查询 / 刷新</button>
          <button
            type="button"
            onClick={() => {
              setPage(1);
              setArea('order');
              setTab('customer');
              setDraft('');
              setCustomer('');
            }}
          >
            选择客户
          </button>
        </LocalQueryForm>
      </header>
      {errors.map((e: string) => (
        <p key={e} role="alert" className={common.error}>
          {e}
        </p>
      ))}
      {area === 'stock' && (
        <div aria-busy={busy}>
          {stock?.snapshotDate && (
            <p className={common.note}>
              库存统计日：{stock.snapshotDate}；读取截止：{date}
              。各指标只统计有效记录，具体范围见卡片及明细；上传日较早的库存请核实后使用。
            </p>
          )}
          <DealerOverview data={data} onNavigate={navigate} />
        </div>
      )}
      <section className={css.listPanel} data-page-reference-ready={referenceReady}>
        <p role="status" className={common.note}>
          {referenceReady ? 'GEA 授权只读数据 · 当前查询范围' : '正在确认当前查询范围'}
        </p>
        <nav
          className={common.tabs}
          aria-label={area === 'stock' ? '库存业务页签' : '客户订单内容'}
        >
          {(area === 'stock' ? stocks : orders).map(([id, label]) => (
            <button
              key={id}
              aria-current={id === tab ? 'page' : undefined}
              onClick={() => {
                setPage(1);
                setTab(id);
              }}
            >
              {label}
            </button>
          ))}
        </nav>
        <ConfiguredFactsPage
          key={[tab, date, customer, revision].join(':')}
          config={config}
          embedded
          viewIds={[tab]}
          date={date}
          customerCode={customer}
          initialFilters={tab === 'customer' && customer ? { customer } : {}}
          onChooseCustomer={choose}
          currentPage={page}
          onPageChange={setPage}
          currentPageSize={pageSize}
          onPageSizeChange={setPageSize}
          onRead={received}
        />
      </section>
    </main>
  );
}
