import { WorkbenchLoading } from '../dsh-ui/workbench-loading';
import { applicablePolicies, orderTotals } from 'dsh-agent-manage/inventory-compute/dealer-order';
import { DealerOverview } from '../pages/dealer/overview';
import css from '../pages/dealer/workbench.module.css';
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Input,
  InputNumber,
  Select as _Select,
  Table,
  Tabs,
  Space,
  Card as _Card,
} from '../dsh-ui/controls';
import { loadDealerCustomers, loadDealerDemoPayload } from '../dealer-engine';
import { action, reportElements } from '../channel.js';
import { updateContext, beginQuery } from './context';
import { makeDraft, draftProblems } from '../dealer-draft.ts';
import { exportLocalJson } from './page-filter';
import { createPageViewState, usePageViewField } from '../../../../../shared/view-state.js';
const dealerView = createPageViewState('inventory-dealer');
const display = (v: any) =>
  v == null
    ? '—'
    : typeof v === 'number'
      ? v.toLocaleString('zh-CN', { maximumFractionDigits: 2 })
      : String(v);
const status = (v: string) =>
  ({
    available: '已读取',
    empty: '无记录',
    unavailable: '数据暂不可用',
    select_customer: '请先选择单个客户',
    partial: '仅当前页',
  })[v] ?? v;
export default function Dealer() {
  const [customers, setCustomers] = useState<any[]>([]),
    [customer, setCustomer] = usePageViewField(React, dealerView, 'customer', ''),
    [data, setData] = useState<any>(null),
    [tab, setTab] = usePageViewField(React, dealerView, 'tab', 'customer'),
    [page, setPage] = usePageViewField(React, dealerView, 'page', 1),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [cart, setCart] = usePageViewField(React, dealerView, 'cart', {} as Record<string, any>),
    [search, setSearch] = usePageViewField(React, dealerView, 'search', '');
  const [exportBusy, setExportBusy] = useState(false);
  const [catalogSearch, setCatalogSearch] = usePageViewField(
    React,
    dealerView,
    'catalogSearch',
    '',
  );
  const [catalogFilters, setCatalogFilters] = usePageViewField(
    React,
    dealerView,
    'catalogFilters',
    {
      search: '',
      category: '',
      productTag: '',
    },
  );
  useEffect(() => {
    if (catalogSearch === catalogFilters.search) return;
    const timer = setTimeout(() => {
      setCatalogFilters((f) => ({ ...f, search: catalogSearch }));
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [catalogSearch]);
  const [orderPanel, setOrderPanel] = usePageViewField(
    React,
    dealerView,
    'orderPanel',
    'suggestion',
  );
  const [view, setView] = usePageViewField(React, dealerView, 'view', 'stock'),
    [pageSize, setPageSize] = usePageViewField(React, dealerView, 'pageSize', 10),
    [revision, _setRevision] = useState(0);
  const [orderBusy, setOrderBusy] = useState(false),
    [suggestions, setSuggestions] = useState<any[]>([]);
  const [orderHeaders, setOrderHeaders] = usePageViewField(
    React,
    dealerView,
    'orderHeaders',
    {} as Record<string, { car: string; pickup: string; receive: string }>,
  );
  const header = orderHeaders[customer] ?? { car: '', pickup: '', receive: '' };
  const setHeader = (field: string, value: string) =>
    setOrderHeaders((old) => ({
      ...old,
      [customer]: {
        ...(old[customer] ?? { car: '', pickup: '', receive: '' }),
        [field]: value,
      },
    }));
  const navigate = (value: string) => {
    setTab(value);
    setPage(1);
    setSearch('');
    setView('stock');
  };
  useEffect(() => {
    setSuggestions([]);
  }, [customer]);
  useEffect(() => {
    updateContext('dealerOrderHeader', {
      customerCode: customer,
      ...header,
      status: 'local-only',
    });
  }, [customer, orderHeaders]);
  async function loadSuggestions() {
    if (!customer || !data) return;
    const scope = customer,
      key = current.current.scopeKey;
    suggestionRequest.current?.abort();
    const request = new AbortController();
    suggestionRequest.current = request;
    setOrderBusy(true);
    setError('');
    try {
      const result = await loadDealerDemoPayload(scope, {
        signal: request.signal,
        scope: 'single',
        orderSuggestionsOnly: true,
        exportTab: 'sku',
        snapshotDate: data.snapshotDate,
        planMonth: data.planMonth,
      });
      if (request.signal.aborted || current.current.scopeKey !== key) return;
      setSuggestions(result.skus);
      updateContext('dealerOrderSuggestions', {
        customerCode: scope,
        snapshotDate: result.snapshotDate,
        planMonth: result.planMonth,
        rows: result.skus,
        status: 'local-only',
      });
      setView('order');
    } catch (e) {
      if (!request.signal.aborted && current.current.scopeKey === key)
        setError((e as Error).message);
    } finally {
      if (suggestionRequest.current === request) setOrderBusy(false);
    }
  }

  const loadedScope = useRef<string | null>(null);
  const suggestionRequest = useRef<AbortController>();
  const exportRequest = useRef<AbortController>();
  const customerRequest = useRef<AbortController>();
  const scopeKey = JSON.stringify([customer, tab, page, pageSize, revision, catalogFilters]);
  useLayoutEffect(() => {
    beginQuery({
      customerCode: customer || null,
      tab,
      page,
      pageSize,
      catalogFilters,
    });
  }, [scopeKey]);
  const [stockCategory, setStockCategory] = usePageViewField(
    React,
    dealerView,
    'stockCategory',
    'all',
  );
  const [stockAction, setStockAction] = usePageViewField(React, dealerView, 'stockAction', 'all');
  useEffect(() => {
    setStockCategory('all');
    setStockAction('all');
    setSearch('');
  }, [customer, tab]);
  const sequence = useRef(0),
    customerSequence = useRef(0),
    customerTimer = useRef<ReturnType<typeof setTimeout>>();
  const current = useRef({ customer, tab, page, scopeKey });
  current.current = { customer, tab, page, scopeKey };
  async function findCustomers(text = '') {
    const n = ++customerSequence.current;
    customerRequest.current?.abort();
    const request = new AbortController();
    customerRequest.current = request;
    try {
      const result = await loadDealerCustomers(text, 0, 50, {
        signal: request.signal,
      });
      if (n === customerSequence.current) setCustomers(result.customers);
    } catch (e) {
      if (!request.signal.aborted) setError((e as Error).message);
    }
  }
  useEffect(() => {
    void findCustomers();
    return () => {
      clearTimeout(customerTimer.current);
      ++customerSequence.current;
      customerRequest.current?.abort();
    };
  }, []);
  useEffect(() => {
    let active = true;
    const n = ++sequence.current;
    const request = new AbortController();
    suggestionRequest.current?.abort();
    exportRequest.current?.abort();
    suggestionRequest.current = undefined;
    exportRequest.current = undefined;
    setOrderBusy(false);
    setExportBusy(false);
    setSuggestions([]);
    setLoading(true);
    // Keep the current workbench mounted for pagination within the same scope.
    if (loadedScope.current !== scopeKey) setData(null);
    setError('');
    loadDealerDemoPayload(customer || undefined, {
      signal: request.signal,
      scope: customer ? 'single' : 'all',
      companyProductsOnly: tab === 'catalog',
      companyProductFacets: tab === 'catalog',
      companyProductFilters: tab === 'catalog' ? catalogFilters : undefined,
      stockTab: ['customer', 'category', 'sku', 'shortage', 'expiry'].includes(tab)
        ? (tab as any)
        : 'sku',
      detailPage: page - 1,
      detailPageSize: pageSize,
      customerPage: page - 1,
      customerPageSize: pageSize,
      shortagePage: page - 1,
      shortagePageSize: pageSize,
    })
      .then((result) => {
        if (!active || request.signal.aborted || n !== sequence.current) return;
        loadedScope.current = scopeKey;
        setData(result);
        updateContext('queryState', {
          state: 'ready',
          scope: { customerCode: customer || null, tab, page, pageSize },
        });
        updateContext('pageFilters', {
          state: 'ready',
          customerCode: customer || null,
          tab,
          page,
          pageSize,
        });
        updateContext('dealer', {
          customerCode: customer || null,
          tab,
          page,
          snapshotDate: result.snapshotDate,
          planMonth: result.planMonth,
          scope: result.scopeLabel,
          inventory: result.totalInventory,
          recordTotal: result.recordTotal,
          visibleRows:
            tab === 'customer'
              ? result.customerSummaries
              : tab === 'category'
                ? result.categorySummaries
                : tab === 'shortage'
                  ? result.shortageSkus
                  : result.skus,
          coverage: {
            rowScope: 'current-server-page',
            total: result.recordTotal,
            inventoryDailyCustomerCount: result.inventoryDailyCustomerCount,
            inventoryDailyExpectedCustomerCount: result.inventoryDailyExpectedCustomerCount,
          },
          overview: {
            inventory: result.totalInventory,
            transit: result.totalTransitInventory,
            value: result.totalInventoryValue,
            target: result.totalTargetInventory,
            sales7: result.sales7Coverage ? result.totalSales7 : null,
            sales30: result.sales30Coverage ? result.totalSales30 : null,
            forecastSales: result.forecastSales,
          },
          health: {
            reasonable: result.reasonableSkuCount,
            unreasonable: result.unreasonableSkuCount,
            covered: result.coveredSkuCount,
            shortage: result.shortageSkuCount,
            nearExpiry: result.nearExpirySkuCount,
            averageAge: result.averageAge,
          },
          policiesStatus: result.policiesStatus,
          customerCarsStatus: result.customerCarsStatus,
        });
      })
      .catch((e) => {
        if (active && !request.signal.aborted) {
          setError(e.message);
          updateContext('queryState', {
            state: 'error',
            message: e.message,
            customerCode: customer || null,
            tab,
          });
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      request.abort();
      suggestionRequest.current?.abort();
      exportRequest.current?.abort();
    };
  }, [scopeKey]);
  function applyFilter(args: Record<string, any>) {
    if (
      !args ||
      typeof args !== 'object' ||
      Array.isArray(args) ||
      Object.keys(args).some((k) => !['customerCode', 'tab', 'page'].includes(k))
    )
      throw Error('筛选参数无效');
    if (
      args.customerCode !== undefined &&
      (typeof args.customerCode !== 'string' || args.customerCode.length > 100)
    )
      throw Error('客户代码无效');
    if (
      args.tab &&
      ![
        'customer',
        'category',
        'sku',
        'shortage',
        'expiry',
        'policies',
        'cars',
        'pickups',
        'receives',
        'catalog',
      ].includes(args.tab)
    )
      throw Error('页签无效');
    if (
      args.page !== undefined &&
      (!Number.isInteger(args.page) || args.page < 1 || args.page > 10000)
    )
      throw Error('页码无效');
    setCustomer(args.customerCode ?? current.current.customer);
    setTab(args.tab ?? current.current.tab);
    if (args.tab)
      setView(['policies', 'cars', 'pickups', 'receives'].includes(args.tab) ? 'master' : 'stock');
    setPage(
      args.page ??
        (args.customerCode !== undefined || args.tab !== undefined ? 1 : current.current.page),
    );
    setSearch('');
    return { querying: true };
  }
  useEffect(() => {
    return action('filter', '按授权客户、页签和页码读取；不修改业务数据', applyFilter);
  }, []);
  useEffect(
    () =>
      reportElements(
        'dealer-filters',
        [
          {
            id: 'filter:customer',
            role: 'control',
            label: '客户',
            value: customer,
            options: ['', ...customers.map((c) => c.code)],
            editable: !loading,
          },
          {
            id: 'filter:tab',
            role: 'control',
            label: '库存页签',
            value: tab,
            options: [
              'customer',
              'category',
              'sku',
              'shortage',
              'expiry',
              'policies',
              'cars',
              'pickups',
              'receives',
              'catalog',
            ],
            editable: !loading,
          },
        ],
        (args: any) => {
          if (args.kind !== 'setValue') throw Error('ACTION_NOT_ALLOWED');
          return applyFilter(
            args.target === 'filter:customer' ? { customerCode: args.value } : { tab: args.value },
          );
        },
      ),
    [customer, tab, customers, loading],
  );

  function add(row: any, manual = false) {
    try {
      const item = {
        ...makeDraft(row, customer, manual),
        unitPrice: row.commerceFacts?.price ?? row.price ?? null,
        category: row.category,
        policyId: '',
      };
      setCart((old) => (old[item.key] ? old : { ...old, [item.key]: item }));
      setView('order');
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    updateContext('purchaseDraft', {
      problems: draftProblems(Object.values(cart)),
      status: 'local-only',
      rows: Object.values(cart),
    });
  }, [cart]);
  function exportRows(items = shown, filename = '经销商库存-当前页.csv') {
    const keys = columns.filter((c) => c.dataIndex).map((c) => [c.title, c.dataIndex]);
    const csv = [
      keys.map(([title]) => title),
      ...items.map((row: any) => keys.map(([, key]) => row[key])),
    ]
      .map((row) =>
        row
          .map(
            (v: any) =>
              '"' +
              String(v ?? '')
                .replace(/^(\s*[=+@-])/, "'$1")
                .replaceAll('"', '""') +
              '"',
          )
          .join(','),
      )
      .join('\r\n');
    const url = URL.createObjectURL(new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function matchesStockFilters(row: any) {
    const qty = row.suggestedStockQty;
    const action =
      row.liveAction?.includes('核查') || typeof qty !== 'number' || !Number.isFinite(qty)
        ? 'unknown'
        : qty > 0
          ? 'replenish'
          : 'observe';
    return (
      (!search.trim() ||
        [row.sku, row.code, row.dealerName, row.dealerCode].some((value) =>
          String(value ?? '')
            .toLowerCase()
            .includes(search.trim().toLowerCase()),
        )) &&
      (stockCategory === 'all' || row.category === stockCategory) &&
      (tab !== 'sku' || stockAction === 'all' || action === stockAction)
    );
  }
  async function exportCustomer() {
    if (tab !== 'sku') return;
    const scope = customer;
    const sourceTab = tab;
    exportRequest.current?.abort();
    const request = new AbortController();
    exportRequest.current = request;
    setExportBusy(true);
    setError('');
    try {
      const result = await loadDealerDemoPayload(scope || undefined, {
        signal: request.signal,
        scope: scope ? 'single' : 'all',
        exportTab: 'sku',
        snapshotDate: data?.snapshotDate,
        planMonth: data?.planMonth,
      });
      if (
        request.signal.aborted ||
        current.current.customer !== scope ||
        current.current.tab !== sourceTab
      )
        return;
      exportRows(
        result.skus.filter(matchesStockFilters),
        `经销商-${scope || '全部授权客户'}-SKU库存.csv`,
      );
    } catch (e) {
      if (!request.signal.aborted) setError((e as Error).message);
    } finally {
      if (exportRequest.current === request) setExportBusy(false);
    }
  }
  const col = (title: string, dataIndex: string): any => ({
    title,
    dataIndex,
    render: display,
  });
  const skuCols = [
    {
      title: 'SKU',
      width: 240,
      render: (_: any, row: any) => (
        <div className={css.product}>
          <strong>{row.sku}</strong>
          <small>{row.code}</small>
          {!customer && <small>{row.dealerName || row.dealerCode}</small>}
        </div>
      ),
    },
    {
      title: '品类 / 产品系列',
      render: (_: any, row: any) => (
        <div className={css.product}>
          <span>{row.category || '—'}</span>
          <small>{row.productRange || '—'}</small>
        </div>
      ),
    },
    {
      title: '标签 / 规格',
      render: (_: any, row: any) => (
        <div className={css.product}>
          <span>{row.productTag || '—'}</span>
          <small>{row.materialSize || '—'}</small>
        </div>
      ),
    },
    col('在仓库存', 'stock'),
    col('在途', 'transit'),
    col('近7日销量', 'sales7'),
    col('近30日销量', 'sales30'),
    col('近30日销售额', 'publishedSalesAmount30'),
    col('统一到岸价', 'cifPrice'),
    col('平均货龄', 'averageAge'),
    col('目标库存', 'targetInventory'),
    col('正常库存', 'normalStock'),
    col('临期库存', 'nearExpiryStock'),
    col('库存金额', 'stockAmount'),
    col('库存日期', 'inventorySnapshotDate'),
    col('建议补货', 'suggestedStockQty'),
    col('依据 / 缺失', 'liveReason'),
    {
      title: '草稿',
      render: (_: any, row: any) => (
        <Space>
          <Button
            size="mini"
            disabled={
              !customer || !row.suggestedStockQty || Boolean(cart[customer + ':' + row.code])
            }
            onClick={() => add(row)}
          >
            {'采纳建议'}
          </Button>
          <Button
            size="mini"
            disabled={!customer || Boolean(cart[customer + ':' + row.code])}
            onClick={() => add(row, true)}
          >
            {'人工选品'}
          </Button>
        </Space>
      ),
    },
  ];
  let rows: any[] = [],
    columns: any[] = skuCols,
    total = 0;
  if (data) {
    if (tab === 'customer') {
      rows = data.customerSummaries;
      total = data.customerSummaryTotal;
      columns = [
        {
          title: '名称 / 编码',
          width: 240,
          render: (_: any, row: any) => (
            <div className={css.product}>
              <strong>{row.name}</strong>
              <small>{row.code}</small>
            </div>
          ),
        },
        col('库存', 'stock'),
        col('临期库存', 'nearExpiryStock'),
        col('正常库存', 'normalStock'),
        col('库存价值', 'stockAmount'),
        col('在途', 'transit'),
        col('目标库存', 'targetInventory'),
        {
          title: '查看',
          render: (_: any, row: any) => (
            <Button
              size="mini"
              onClick={() => {
                setCustomer(row.code);
                setSearch('');
                setPage(1);
                setTab('sku');
              }}
            >
              {'客户明细'}
            </Button>
          ),
        },
      ];
    } else if (tab === 'category') {
      rows = data.categorySummaries;
      total = rows.length;
      columns = [
        col('品类', 'category'),
        col('SKU数', 'skuCount'),
        col('库存', 'stock'),
        col('在途', 'transit'),
        col('正常库存', 'normalStock'),
        col('近30日销量', 'sales30'),
        col('库存价值', 'stockAmount'),
        col('临期库存', 'nearExpiryStock'),
        col('目标库存', 'targetInventory'),
      ];
    } else if (tab === 'policies') {
      rows = data.policies;
      total = rows.length;
      columns = [
        col('政策', 'name'),
        col('类型', 'type'),
        col('起始日', 'start'),
        col('截止日', 'end'),
        col('规则', 'rule'),
        col('提货点', 'pickupName'),
        col('可用数量', 'usableQuantity'),
      ];
    } else if (tab === 'pickups') {
      rows = data.customerPickupPoints ?? [];
      total = rows.length;
      columns = [
        col('提货点代码', 'code'),
        col('提货点', 'name'),
        col('基地', 'baseName'),
        col('默认', 'isDefault'),
        col('可用', 'available'),
        col('匹配状态', 'matched'),
      ];
    } else if (tab === 'receives') {
      rows = data.customerReceives ?? [];
      total = rows.length;
      columns = [
        col('收货地址代码', 'code'),
        col('收货方', 'name'),
        col('地址', 'address'),
        col('主驾驶员', 'mainDriver'),
        col('驾驶员上限', 'maxDriver'),
      ];
    } else if (tab === 'catalog') {
      rows = data.companyProducts ?? [];
      total = data.companyProductTotal ?? data.recordTotal;
      columns = [
        col('客户', 'dealerCode'),
        col('SKU', 'code'),
        col('商品', 'sku'),
        col('品类', 'category'),
        col('规格', 'materialSize'),
        col('标签', 'productTag'),
      ];
    } else if (tab === 'cars') {
      rows = data.customerCars ?? [];
      total = rows.length;
      columns = [
        col('代码', 'code'),
        col('车型', 'name'),
        col('仓组', 'warehouse'),
        col('最小装载', 'min'),
        col('最大装载', 'max'),
      ];
    } else {
      rows = tab === 'shortage' ? data.shortageSkus : data.skus;
      total = tab === 'shortage' ? data.shortageTotal : data.recordTotal;
    }
  }
  const supportsStockFilters = ['sku', 'shortage', 'expiry'].includes(tab);
  const stockCategories = Array.from(
    new Set(rows.map((row) => row.category).filter(Boolean)),
  ) as string[];
  const shown = supportsStockFilters ? rows.filter(matchesStockFilters) : rows;
  const customerCart = Object.values(cart).filter(
    (r: any) => !customer || r.customerCode === customer,
  );
  const totals = orderTotals(customerCart);
  const problems = [
    ...draftProblems(Object.values(cart)),
    ...customerCart
      .filter(
        (r: any) =>
          r.policyId &&
          !applicablePolicies(data?.policies ?? [], r.customerCode, r.code, header.pickup).some(
            (p: any) => p.id === r.policyId,
          ),
      )
      .map((r: any) => `${r.code}：政策已不匹配当前提货点或有效期，请重新选择`),
  ];
  useEffect(() => {
    updateContext('dealerVisiblePage', {
      customerCode: customer || null,
      tab,
      page,
      search,
      stockCategory,
      stockAction,
      view,
      loaded: !loading && Boolean(data),
      visibleRows: !loading && loadedScope.current === scopeKey ? shown : [],
      total: !loading && loadedScope.current === scopeKey ? total : null,
      coverage: '仅当前筛选页，不能作为全量明细',
    });
  }, [customer, tab, page, search, stockCategory, stockAction, data, loading]);
  if (loading && !data && !error) return <WorkbenchLoading title="客户库存" cards={8} compact />;
  return (
    <>
      <p role="status">{'GEA 授权只读数据。建议采纳与订单校验仅保存本地草稿，不提交补货。'}</p>
      <section
        className={css.shell}
        data-page-reference-ready={!loading && Boolean(data) && loadedScope.current === scopeKey}
        data-page-reference-scope={JSON.stringify([scopeKey, search, stockCategory, stockAction])}
      >
        <header className={css.topbar}>
          <nav className={css.navigation} aria-label="客户库存与客户订单">
            <button
              aria-current={view === 'stock'}
              onClick={() => navigate(customer ? 'sku' : 'customer')}
            >
              {'客户库存'}
            </button>
            <button
              aria-current={view !== 'stock'}
              onClick={() => {
                setView('order');
                if (!customer && customers[0]) {
                  setCustomer(customers[0].code);
                  setPage(1);
                }
              }}
            >
              {'客户订单'}
            </button>
          </nav>
          <div className={css.customerPicker}>
            <details className={css.customerMenu} key={customer}>
              <summary>
                {customers.find((c) => c.code === customer)?.name || customer || '全部负责客户'}
                <span aria-hidden="true">{'⌄'}</span>
              </summary>
              <div className={css.customerOptions}>
                <Input
                  aria-label="选择客户搜索"
                  placeholder="搜索客户名称或编码"
                  onChange={(text: string) => {
                    clearTimeout(customerTimer.current);
                    ++customerSequence.current;
                    customerTimer.current = setTimeout(() => void findCustomers(text), 350);
                  }}
                />
                {view === 'stock' && (
                  <button
                    onClick={() => {
                      setCustomer('');
                      setPage(1);
                      setSearch('');
                    }}
                  >
                    {'全部负责客户'}
                  </button>
                )}
                {customers.map((c) => (
                  <button
                    key={c.code}
                    aria-pressed={customer === c.code}
                    onClick={() => {
                      setCustomer(c.code);
                      setPage(1);
                      setSearch('');
                    }}
                  >
                    <span>{c.name}</span>
                    <small>{c.code}</small>
                  </button>
                ))}
                {!customers.length && <small>{'暂无匹配客户'}</small>}
              </div>
            </details>
            {view === 'stock' && (
              <small>
                {'库存快照：'}
                {data?.inventoryDateLabel || data?.snapshotDate || '—'}
              </small>
            )}
          </div>
        </header>
        {view !== 'stock' && (
          <nav className={css.orderNavigation} aria-label="客户订单内容">
            <button
              aria-current={view === 'master' && tab === 'catalog'}
              onClick={() => {
                setView('master');
                setTab('catalog');
                setPage(1);
              }}
            >
              {'公司商品'}
            </button>
            <button
              aria-current={view === 'master' && tab === 'policies'}
              onClick={() => {
                setView('master');
                setTab('policies');
                setPage(1);
              }}
            >
              {'本月政策'}
            </button>
            <button
              aria-current={view === 'master' && tab === 'sku'}
              onClick={() => {
                setView('master');
                setTab('sku');
                setPage(1);
              }}
            >
              {'当前库存'}
            </button>
            <button aria-current={view === 'order'} onClick={() => setView('order')}>
              {'建议订单'}
            </button>
          </nav>
        )}
        {error && <Alert type="error" style={{ marginTop: 16 }} content={error} />}
        {data && view === 'stock' && <DealerOverview data={data} onNavigate={navigate} />}
        {view !== 'order' && (
          <section className={css.listPanel} aria-label="库存明细与工具">
            {view === 'stock' && (
              <Tabs
                activeTab={tab}
                onChange={(value: string) => {
                  setTab(value);
                  setSearch('');
                  setPage(1);
                }}
              >
                {[
                  ['customer', '客户库存'],
                  ['category', '品类库存'],
                  ['sku', 'SKU库存'],
                  ['shortage', '缺货库存'],
                  ['expiry', '临期库存'],
                  ['policies', '促销政策'],
                  ['cars', '客户车型'],
                  ['pickups', '提货点'],
                  ['receives', '收货地址'],
                  ['catalog', '公司可售商品'],
                ]
                  .filter(([key]) =>
                    ['customer', 'category', 'sku', 'shortage', 'expiry'].includes(key),
                  )
                  .map(([key, title]) => (
                    <Tabs.TabPane key={key} title={title} />
                  ))}
              </Tabs>
            )}
            {data?.pricing?._error && (
              <Alert type="warning" content={data.pricing._error.message} />
            )}
            {data && ['pickups', 'receives', 'catalog'].includes(tab) && (
              <Alert
                content={status(
                  data[
                    tab === 'pickups'
                      ? 'customerPickupPointsStatus'
                      : tab === 'receives'
                        ? 'customerReceivesStatus'
                        : 'companyProductsStatus'
                  ],
                )}
              />
            )}
            {data && ['policies', 'cars'].includes(tab) && (
              <Alert
                content={status(tab === 'policies' ? data.policiesStatus : data.customerCarsStatus)}
              />
            )}
            {tab === 'catalog' && (
              <div className={css.toolbar}>
                <Input
                  aria-label="商品搜索条件"
                  placeholder="商品名称或编码"
                  value={catalogSearch}
                  onChange={setCatalogSearch}
                />
                <select
                  aria-label="商品品类筛选"
                  value={catalogFilters.category}
                  onChange={(e) => {
                    setCatalogFilters((f) => ({
                      ...f,
                      category: e.target.value,
                    }));
                    setPage(1);
                  }}
                >
                  <option value="">{'全部品类'}</option>
                  {(data?.companyProductFacets?.categories ?? []).map((v: string) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
                <select
                  aria-label="商品标签筛选"
                  value={catalogFilters.productTag}
                  onChange={(e) => {
                    setCatalogFilters((f) => ({
                      ...f,
                      productTag: e.target.value,
                    }));
                    setPage(1);
                  }}
                >
                  <option value="">{'全部标签'}</option>
                  {(data?.companyProductFacets?.tags ?? []).map((v: string) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </div>
            )}
            <div className={css.stockSectionHead}>
              <h3>
                {
                  (
                    {
                      customer: '客户库存',
                      category: '品类库存',
                      sku: 'SKU库存',
                      shortage: '缺货库存',
                      expiry: '临期库存',
                      catalog: '公司可售商品',
                      policies: '促销政策',
                      cars: '客户车型',
                      pickups: '提货点',
                      receives: '收货地址',
                    } as Record<string, string>
                  )[tab]
                }
              </h3>
              {supportsStockFilters && (
                <div className={css.stockFilters}>
                  {tab === 'sku' && (
                    <select
                      aria-label="建议动作筛选"
                      value={stockAction}
                      onChange={(e) => setStockAction(e.target.value)}
                    >
                      <option value="all">{'全部建议'}</option>
                      <option value="replenish">{'建议补货'}</option>
                      <option value="observe">{'无需补货'}</option>
                      <option value="unknown">{'待核查'}</option>
                    </select>
                  )}
                  <select
                    aria-label="品类筛选"
                    value={stockCategory}
                    onChange={(e) => setStockCategory(e.target.value)}
                  >
                    <option value="all">{'全部品类'}</option>
                    {Array.from(
                      new Set([
                        ...stockCategories,
                        ...(stockCategory === 'all' ? [] : [stockCategory]),
                      ]),
                    ).map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                  <Input
                    aria-label="SKU筛选"
                    placeholder="SKU筛选"
                    value={search}
                    onChange={setSearch}
                  />
                </div>
              )}
              {tab === 'sku' && (
                <Button
                  loading={exportBusy}
                  disabled={!data || loading}
                  title="下载当前筛选后的全部数据（CSV）"
                  onClick={() => void exportCustomer()}
                >
                  {'下载'}
                </Button>
              )}
            </div>
            <Table
              loading={loading}
              rowKey={(row: any) =>
                String(row.code ?? row.id ?? row.category) + String(row.dealerCode ?? '')
              }
              columns={columns}
              data={shown}
              emptyText={error && !data ? '数据未读取成功，暂时无法显示。' : undefined}
              scroll={{ x: 1100 }}
              pagination={
                !(error && !data) &&
                ['customer', 'sku', 'shortage', 'expiry', 'catalog'].includes(tab)
                  ? {
                      current: page,
                      pageSize,
                      total,
                      onChange: (nextPage: number, nextSize: number) => {
                        setPage(nextPage);
                        setPageSize(nextSize);
                      },
                    }
                  : false
              }
            />
          </section>
        )}
        {view === 'order' && (
          <>
            <div className={css.orderHeader}>
              <nav className={css.orderPanels} aria-label="建议订单内容">
                <button
                  aria-current={orderPanel === 'suggestion'}
                  onClick={() => setOrderPanel('suggestion')}
                >
                  {'建议订单'}
                </button>
                <button aria-current={orderPanel === 'cart'} onClick={() => setOrderPanel('cart')}>
                  {'购物车 · '}
                  {customerCart.length}
                </button>
              </nav>
              <Button
                disabled={!customer || loading}
                loading={orderBusy}
                onClick={() => void loadSuggestions()}
              >
                {'生成建议订单'}
              </Button>
            </div>
            {!customer && (
              <Alert content="请先选择单个客户；不同客户的商品、车型和政策不能混用。" />
            )}
            <div className={css.orderMeta}>
              <label>
                {'客户车型'}
                <select
                  aria-label="订单车型"
                  disabled={!customer}
                  value={header.car}
                  onChange={(e) => setHeader('car', e.target.value)}
                >
                  <option value="">{'请选择车型'}</option>
                  {(data?.customerCars ?? []).map((r: any) => (
                    <option key={r.id || r.code} value={r.id || r.code}>
                      {r.name}
                      {' · '}
                      {r.min ?? '—'}
                      {'～'}
                      {r.max ?? '—'}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {'提货点'}
                <select
                  aria-label="订单提货点"
                  disabled={!customer}
                  value={header.pickup}
                  onChange={(e) => setHeader('pickup', e.target.value)}
                >
                  <option value="">{'请选择提货点'}</option>
                  {(data?.customerPickupPoints ?? []).map((r: any) => (
                    <option key={r.code} value={r.code}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {'收货地址'}
                <select
                  aria-label="订单收货地址"
                  disabled={!customer}
                  value={header.receive}
                  onChange={(e) => setHeader('receive', e.target.value)}
                >
                  <option value="">{'请选择收货地址'}</option>
                  {(data?.customerReceives ?? []).map((r: any) => (
                    <option key={r.code} value={r.code}>
                      {r.name}
                      {' · '}
                      {r.address}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {orderPanel === 'suggestion' && (
              <section className={css.orderBody} aria-label="建议订单明细">
                <Table
                  rowKey="code"
                  loading={orderBusy}
                  pagination={false}
                  data={suggestions}
                  columns={[
                    col('SKU', 'code'),
                    col('商品', 'sku'),
                    col('品类', 'category'),
                    col('在仓', 'stock'),
                    col('在途', 'transit'),
                    {
                      title: '订单建议量',
                      render: (_: any, r: any) => display(r.orderRecommendation?.quantity),
                    },
                    {
                      title: '计算依据',
                      render: (_: any, r: any) => r.orderRecommendation?.reason ?? '尚未核实',
                    },
                    {
                      title: '操作',
                      render: (_: any, r: any) => (
                        <Button
                          disabled={
                            !customer ||
                            !(r.orderRecommendation?.quantity > 0) ||
                            Boolean(cart[customer + ':' + r.code])
                          }
                          onClick={() =>
                            add({
                              ...r,
                              suggestedStockQty: r.orderRecommendation.quantity,
                              liveReason: r.orderRecommendation.reason,
                            })
                          }
                        >
                          {'采纳至草稿'}
                        </Button>
                      ),
                    },
                  ]}
                />
              </section>
            )}
            {orderPanel === 'cart' && (
              <section className={css.orderBody} aria-label="购物车">
                <Alert content="草稿关闭页面后清除，尚未提交订单。人工选品需填写数量与理由。" />
                {problems.length > 0 && <Alert type="warning" content={problems.join('；')} />}
                <Table
                  rowKey="key"
                  data={customerCart}
                  pagination={false}
                  columns={[
                    col('客户', 'customerCode'),
                    col('SKU', 'code'),
                    col('商品', 'name'),
                    {
                      title: '来源',
                      render: (_: any, row: any) =>
                        row.source === 'manual' ? '人工选品' : '采纳建议',
                    },
                    col('原建议量', 'suggestedQuantity'),
                    col('单价（元）', 'unitPrice'),
                    {
                      title: '金额（元）',
                      render: (_: any, r: any) =>
                        display(r.unitPrice == null ? null : r.unitPrice * r.quantity),
                    },
                    {
                      title: '活动政策',
                      render: (_: any, r: any) => (
                        <select
                          aria-label={'活动政策-' + r.code}
                          value={r.policyId ?? ''}
                          onChange={(e) =>
                            setCart((old) => ({
                              ...old,
                              [r.key]: {
                                ...old[r.key],
                                policyId: e.target.value,
                              },
                            }))
                          }
                        >
                          <option value="">{'不选政策'}</option>
                          {applicablePolicies(
                            data?.policies ?? [],
                            r.customerCode,
                            r.code,
                            header.pickup,
                          ).map((p: any) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      ),
                    },
                    col('选品时依据', 'evidence'),
                    {
                      title: '调整理由',
                      render: (_: any, row: any) => (
                        <Input
                          aria-label={'调整理由-' + row.code}
                          value={row.reason}
                          onChange={(reason: string) =>
                            setCart((old) => ({
                              ...old,
                              [row.key]: { ...old[row.key], reason },
                            }))
                          }
                          placeholder="人工选品、调减必填"
                        />
                      ),
                    },
                    {
                      title: '数量',
                      render: (_: any, row: any) => (
                        <InputNumber
                          aria-label={'草稿数量-' + row.code}
                          min={0}
                          max={1e9}
                          value={row.quantity}
                          onChange={(value: number | undefined) =>
                            setCart((old) => ({
                              ...old,
                              [row.key]: { ...row, quantity: value },
                            }))
                          }
                        />
                      ),
                    },
                    {
                      title: '操作',
                      render: (_: any, row: any) => (
                        <Button
                          onClick={() =>
                            setCart((old) => {
                              const next = { ...old };
                              delete next[row.key];
                              return next;
                            })
                          }
                        >
                          {'移除'}
                        </Button>
                      ),
                    },
                  ]}
                />
                <p className={css.orderFooter}>
                  {'当前范围 '}
                  {totals.count}
                  {' 个 SKU · 数量 '}
                  {display(totals.quantity)} {'· 金额 '}
                  {display(totals.amount)}{' '}
                  {'元。政策优惠未计入金额；实时报价未接入时金额保持未知。'}
                </p>
                <Space>
                  <Button
                    disabled={!Object.keys(cart).length || problems.length > 0}
                    onClick={() =>
                      exportLocalJson(
                        {
                          status: 'local-only',
                          orderHeaders,
                          exportedAt: new Date().toISOString(),
                          rows: Object.values(cart),
                        },
                        '经销商补货-未提交草稿.json',
                      )
                    }
                  >
                    {'导出补货草稿'}
                  </Button>
                  <Button
                    disabled={!Object.keys(cart).length || problems.length > 0}
                    onClick={() =>
                      setError(
                        draftProblems(Object.values(cart)).join('；') ||
                          '本地草稿校验通过，未创建模型任务或提交订单',
                      )
                    }
                  >
                    {'核对草稿'}
                  </Button>
                  <Button disabled title="暂不支持提交订单">
                    {'提交订单'}
                  </Button>
                </Space>
              </section>
            )}
          </>
        )}
      </section>
    </>
  );
}
