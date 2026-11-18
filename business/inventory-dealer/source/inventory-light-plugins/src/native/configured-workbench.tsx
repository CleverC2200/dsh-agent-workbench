import { BusinessToolbar } from '../../../../../shared/business-toolbar';
import { BusinessDateInput } from '../../../../../shared/business-date-input';
import { LocalQueryForm } from '../../../../../shared/local-query-form';
import { QueryErrors } from '../../../../../shared/query-errors';
import React, { useState, useEffect, useRef } from 'react';
import { createPageViewState, usePageViewField } from '../../../../../shared/view-state.js';
import { reportElements } from '../channel.js';
import config from '../../../../sql.config.json';
import { originalDealerView } from '../../../../../shared/original-business-views';
import { ConfiguredFactsPage } from '../../../../../shared/configured-facts-page';
import { readConfiguredFacts } from '../../../../../shared/configured-facts';
import { useQueryIdentity } from '../../../../../shared/use-query-identity';
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
type CustomerOption = { code: string; name: string };
type CustomerSearchResult =
  | { status: 'ready'; options: CustomerOption[]; hasMore: boolean }
  | { status: 'failed'; message: string };

function customerOption(row: unknown): CustomerOption | undefined {
  if (typeof row !== 'object' || !row || !('customer' in row)) return;
  const code = typeof row.customer === 'string' ? row.customer.trim() : '';
  if (!code) return;
  const name =
    'customer_name' in row && typeof row.customer_name === 'string' ? row.customer_name.trim() : '';
  return { code, name };
}

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
    [revision, refresh] = useState(0);
  const [page, setPage] = usePageViewField(React, view, 'page', 1);
  const [pageSize, setPageSize] = usePageViewField(React, view, 'pageSize', 10);
  const [date, setDate] = useState(businessDay),
    [dateDraft, setDateDraft] = useState(businessDay);
  const identity = useQueryIdentity();
  const customerMenu = useRef<HTMLDetailsElement>(null);
  const [customerSearchOpen, setCustomerSearchOpen] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedOption, setSelectedOption] = useState<CustomerOption>();
  const [customerResult, setCustomerResult] = useState<{
    key: string;
    result: CustomerSearchResult;
  }>();
  const search = customerSearch.trim();
  const searchKey = JSON.stringify([identity, date, search]);
  const result = customerResult?.key === searchKey ? customerResult.result : undefined;
  const customerName =
    selectedOption && selectedOption.code === customer ? selectedOption.name : '';
  useEffect(() => {
    if (!customerSearchOpen) return;
    const controller = new AbortController();
    const signal = controller.signal;
    const timer = setTimeout(
      () => {
        void readConfiguredFacts(
          config,
          'customer',
          { asOf: date, pageSize: 20, filters: search ? { search } : {} },
          { signal, detailsOnly: true },
        )
          .then((response) => {
            if (signal.aborted) return;
            if (!['available', 'empty'].includes(response.status))
              throw new Error('当前客户目录不可用');
            const rows: unknown[] = response.rows;
            const options = rows
              .map(customerOption)
              .filter((option): option is CustomerOption => option !== undefined);
            if (options.length !== rows.length) throw new Error('客户目录未返回客户编码');
            setCustomerResult({
              key: searchKey,
              result: { status: 'ready', options, hasMore: response.total > options.length },
            });
          })
          .catch((error: unknown) => {
            if (!signal.aborted)
              setCustomerResult({
                key: searchKey,
                result: {
                  status: 'failed',
                  message: error instanceof Error ? error.message : '客户目录读取失败',
                },
              });
          });
      },
      search ? 250 : 0,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [customerSearchOpen, date, search, searchKey]);

  function selectCustomer(option?: CustomerOption) {
    const code = option?.code ?? '';
    setPage(1);
    setCustomer(code);
    setSelectedOption(option);
    setCustomerSearch('');
    if (option) {
      setDate(dateDraft);
      refresh((n) => n + 1);
    } else {
      setArea('stock');
      setTab('customer-stock');
    }
    const menu = customerMenu.current;
    if (menu) {
      menu.open = false;
      menu.querySelector('summary')?.focus();
    }
  }

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
      <BusinessToolbar
        className={css.sharedTopbar}
        filters={
          <div className={css.customerPicker}>
            <details
              className={css.customerMenu}
              ref={customerMenu}
              title={`库存快照：${stock?.snapshotDate ?? '-'}`}
              onToggle={(event) => {
                const open = event.currentTarget.open;
                setCustomerSearchOpen(open);
                if (!open) setCustomerResult(undefined);
              }}
            >
              <summary>
                {customerName || (customer ? `客户 ${customer}` : '全部负责客户')}
                <span aria-hidden="true">⌄</span>
              </summary>
              <div className={css.customerOptions}>
                <LocalQueryForm
                  className={common.controls}
                  role="search"
                  aria-label="客户查询"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (!search || result?.status !== 'ready') return;
                    const exact = result.options.find((option) => option.code === search);
                    if (exact) selectCustomer(exact);
                    else if (!result.hasMore && result.options.length === 1)
                      selectCustomer(result.options[0]);
                  }}
                >
                  <input
                    type="search"
                    aria-label="客户名称或编码"
                    placeholder="搜索客户名称或编码"
                    maxLength={100}
                    value={customerSearch}
                    autoCapitalize="none"
                    spellCheck={false}
                    onChange={(event) => setCustomerSearch(event.target.value)}
                  />
                </LocalQueryForm>
                <button type="button" onClick={() => selectCustomer()}>
                  全部负责客户
                </button>
                {result?.status === 'ready' ? (
                  <>
                    {result.options.map((option) => (
                      <button
                        key={option.code}
                        type="button"
                        aria-pressed={customer === option.code}
                        onClick={() => selectCustomer(option)}
                      >
                        <span>{option.name || option.code}</span>
                        {option.name && <small>{option.code}</small>}
                      </button>
                    ))}
                    {!result.options.length && <small role="status">暂无匹配客户</small>}
                    {result.hasMore && <small role="status">请缩小搜索范围，查看更多匹配</small>}
                  </>
                ) : result?.status === 'failed' ? (
                  <small role="status">{result.message}</small>
                ) : (
                  <small role="status">正在查询客户…</small>
                )}
              </div>
            </details>
          </div>
        }
        actions={
          <LocalQueryForm
            className={common.controls}
            onSubmit={(event) => {
              event.preventDefault();
              setPage(1);
              setDate(dateDraft);
              refresh((n) => n + 1);
            }}
          >
            <BusinessDateInput
              aria-label="读取时点"
              required
              max={businessDay()}
              value={dateDraft}
              onValueChange={setDateDraft}
            />
            <button>查询 / 刷新</button>
          </LocalQueryForm>
        }
        navigation={
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
        }
      />
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
