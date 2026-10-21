import { LocalQueryForm } from '../../../../../shared/local-query-form';
import { QueryErrors } from '../../../../../shared/query-errors';
import React, { useState, useEffect } from 'react';
import { createPageViewState, usePageViewField } from '../../../../../shared/view-state.js';
import { reportElements } from '../channel.js';
import config from '../../../../sql.config.json';
import { originalDealerView } from '../../../../../shared/original-business-views';
import { ConfiguredFactsPage } from '../../../../../shared/configured-facts-page';
import { useConfiguredOverview } from '../../../../../shared/use-configured-overview';
import { businessDay, completeValue, knownNumber } from '../../../../../shared/configured-overview';
import { Tabs } from '../dsh-ui/controls';
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
      setArea('stock');
      setTab('customer-stock');
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
        <div className={css.customerPicker}>
          <details className={css.customerMenu}>
            <summary>
              {customer ? `客户 ${customer}` : '全部负责客户'}
              <span aria-hidden="true">⌄</span>
            </summary>
            <div className={css.customerOptions}>
              <LocalQueryForm
                className={common.controls}
                onSubmit={(event) => {
                  event.preventDefault();
                  setPage(1);
                  setCustomer(draft.trim());
                  setDate(dateDraft);
                  refresh((n) => n + 1);
                  const menu = event.currentTarget.closest('details');
                  if (menu) menu.open = false;
                }}
              >
                <input
                  aria-label="客户编码"
                  placeholder="输入客户编码"
                  maxLength={100}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                />
                <input
                  aria-label="读取时点"
                  type="date"
                  required
                  max={businessDay()}
                  value={dateDraft}
                  onChange={(event) => setDateDraft(event.target.value)}
                />
                <button>查询 / 刷新</button>
              </LocalQueryForm>
              <button
                type="button"
                onClick={(event) => {
                  setPage(1);
                  setArea('stock');
                  setTab('customer-stock');
                  setDraft('');
                  setCustomer('');
                  const menu = event.currentTarget.closest('details');
                  if (menu) menu.open = false;
                }}
              >
                全部负责客户
              </button>
            </div>
          </details>
          {area === 'stock' && <small>库存快照：{stock?.snapshotDate ?? '-'}</small>}
        </div>
      </header>
      <QueryErrors errors={errors} />
      {area === 'stock' && (
        <div aria-busy={busy}>
          <DealerOverview data={data} onNavigate={navigate} />
        </div>
      )}
      {area === 'order' && (
        <nav className={css.orderNavigation} aria-label="客户订单内容">
          {orders.map(([id, label]) => (
            <button
              key={id}
              aria-current={id === tab}
              onClick={() => {
                setPage(1);
                setTab(id);
              }}
            >
              {label}
            </button>
          ))}
        </nav>
      )}
      <section className={css.listPanel} data-page-reference-ready={referenceReady}>
        {area === 'stock' && (
          <Tabs
            activeTab={tab}
            onChange={(id: string) => {
              setPage(1);
              setTab(id);
            }}
          >
            {stocks.map(([id, label]) => (
              <Tabs.TabPane key={id} title={label} />
            ))}
          </Tabs>
        )}
        <ConfiguredFactsPage
          key={[tab, date, customer, revision].join(':')}
          config={config}
          embedded
          presentation={originalDealerView(config, tab)}
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
