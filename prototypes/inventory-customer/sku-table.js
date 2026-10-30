import { customerSkuPresentation, readCustomerSkus } from './sku-source.js';
import { formatFactValue } from '../../business/shared/fact-display.ts';

export function CustomerSkuTable({
  react: React,
  Table,
  inventory,
  customers,
  page,
  onPageChange,
  onRead,
}) {
  const h = React.createElement;
  const [read, setRead] = React.useState({ rows: [], loading: true });
  const codes = customers.map((row) => row.code);
  const key = JSON.stringify([codes, page]);
  const current = read.key === key && read.owner === inventory ? read : { rows: [], loading: true };
  React.useEffect(() => {
    const controller = new AbortController();
    setRead({ key, owner: inventory, rows: [], loading: true });
    onRead({ state: 'loading', rows: [], customerCount: codes.length, page });
    if (!codes.length) {
      setRead({ key, owner: inventory, rows: [], total: 0, loading: false });
      onRead({ state: 'empty', rows: [], total: 0, customerCount: codes.length, page });
      return () => controller.abort();
    }
    readCustomerSkus(inventory, codes, { page }, { signal: controller.signal }).then(
      (result) => {
        if (controller.signal.aborted) return;
        if (page > Math.max(1, Math.ceil(result.total / 10))) {
          onPageChange(1);
          return;
        }
        setRead({ ...result, key, owner: inventory, loading: false });
        onRead({
          state: 'ready',
          rows: result.rows,
          total: result.total,
          page: result.page,
          pageSize: result.pageSize,
          snapshotDate: result.snapshotDate,
          customerCount: codes.length,
        });
      },
      (error) => {
        if (controller.signal.aborted) return;
        setRead({
          key,
          owner: inventory,
          rows: [],
          loading: false,
          error: error.code ?? error.message,
        });
        onRead({
          state: 'error',
          rows: [],
          customerCount: codes.length,
          page,
          error: error.code ?? error.message,
        });
      },
    );
    return () => controller.abort();
  }, [inventory, key]);
  const columns = customerSkuPresentation.columns.map((column) => ({
    title: column.label,
    dataIndex: column.field,
    width: column.secondary ? 220 : 150,
    render(value, row) {
      return h(
        'div',
        { className: 'customer-sku-cell', title: column.reason },
        h('span', null, column.unavailable ? '—' : formatFactValue(value, column.format)),
        ...(column.secondary ?? []).map((field) =>
          h('small', { key: field }, formatFactValue(row[field])),
        ),
        column.unavailable && h('small', null, column.reason),
      );
    },
  }));
  return h(
    'section',
    { className: 'customer-sku-panel', 'aria-label': '客户SKU库存明细' },
    current.error &&
      h(
        'p',
        { role: 'alert', className: 'customer-list-scope' },
        `SKU库存读取失败（${current.error}），请切换页签或刷新重试；当前未取得明细。`,
      ),
    h(Table, {
      rowKey: (row) => `${row.customer}:${row.sku}`,
      columns,
      data: current.rows,
      loading: current.loading,
      size: 'small',
      stripe: true,
      scroll: { x: columns.reduce((sum, column) => sum + column.width, 0) },
      noDataElement: current.error
        ? 'SKU库存读取失败'
        : codes.length
          ? '当前客户及筛选条件下暂无SKU库存'
          : '当前筛选范围暂无客户',
      pagination: {
        total: current.total ?? 0,
        pageSize: 10,
        current: page,
        onChange: onPageChange,
        showTotal: true,
        sizeCanChange: false,
      },
    }),
  );
}
