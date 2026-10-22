/** Explicit application-owned records, not host DOM discovery or a second data source. */
function fulfillmentSnapshot() {
  let rows = fulfillmentRows
    .filter((row) => !row.hidden)
    .map((row) => ({
      sourceOrder: row.cells[0].querySelector('strong').textContent,
      omsOrder: row.cells[0].querySelector('small').textContent,
      customer: row.cells[1].querySelector('strong').textContent,
      customerCode: row.dataset.customerCode,
      receivedAt: row.cells[5].textContent,
      goods: row.cells[3].textContent,
      warehouse: row.cells[2].textContent,
      status: row.cells[6].textContent,
      attention: row.cells[7].textContent,
    }));
  const dimension = document.querySelector('[data-fulfillment-dimension][aria-selected="true"]')
    ?.dataset.fulfillmentDimension;
  if (dimension === 'deliveryDimensionPanel' || dimension === 'warehouseDimensionPanel') {
    const body =
      dimension === 'warehouseDimensionPanel' ? warehouseOrderDetailRows : deliveryOrderDetailRows;
    rows = [...body.querySelectorAll('.delivery-order-main-row')]
      .filter((row) => !row.hidden)
      .map((row) => ({
        sourceOrder: row.cells[1].textContent.trim(),
        omsOrder: '执行单见展开明细',
        customer: row.cells[3].textContent.trim(),
        customerCode: row.cells[3].textContent.split('/').at(-1).trim(),
        receivedAt: row.cells[2].textContent.trim(),
        goods: row.cells[14].textContent.trim(),
        warehouse: row.cells[10].textContent.trim(),
        status: row.cells[12].textContent.trim(),
        attention: row.cells[13].textContent.trim(),
      }));
  }
  return {
    source: 'mock',
    mock: true,
    notice: '固定模拟订单，不是实时数据；筛选和分页不代表生成、推送或实际履约',
    summary: {
      received: 60,
      unopened: 28,
      overdue: 7,
      warning: 9,
      shortage: 6320,
      fillRate: 94.6,
      scope: '60张演示履约概览；17条穿透明细是独立样本，不可混算，筛选后按页面样本展示',
    },
    filters: {
      order: document.getElementById('deliveryOrderNumberQuery').value,
      customer: document.getElementById('deliveryCustomerQuery').value,
      warehouse: document.getElementById('deliveryBaseQuery').value,
      status: document.getElementById('deliveryStatusQuery').value,
    },
    page: {
      number: dimension === 'itemDimensionPanel' ? currentOrderPage : 1,
      size: dimension === 'itemDimensionPanel' ? Number(ordersPageSize.value) : 20,
      count:
        dimension === 'itemDimensionPanel'
          ? Number(document.getElementById('ordersPageCount').textContent)
          : 1,
      matched:
        dimension === 'itemDimensionPanel'
          ? Number(document.getElementById('ordersTotal').textContent.match(/\d+/)[0])
          : rows.length,
      visible: rows.length,
    },
    rows,
    dimension,
    coverage: 'rows仅含当前筛选的当前分页；summary是完整固定模拟集合，不可互换口径',
    actions: [],
  };
}
