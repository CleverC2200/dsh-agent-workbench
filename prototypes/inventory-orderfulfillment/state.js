/** Explicit application-owned records, not host DOM discovery or a second data source. */
function fulfillmentSnapshot() {
  const rows = fulfillmentRows
    .filter((row) => !row.hidden)
    .map((row) => ({
      sourceOrder: row.cells[0].querySelector('strong').textContent,
      omsOrder: row.cells[0].querySelector('small').textContent,
      customer: row.cells[1].querySelector('strong').textContent,
      customerCode: row.dataset.customerCode,
      receivedAt: row.cells[2].textContent,
      goods: row.cells[3].textContent,
      warehouse: row.cells[4].textContent,
      status: row.cells[5].textContent,
      attention: row.cells[6].textContent,
    }));
  return {
    source: 'mock',
    mock: true,
    notice: '固定模拟订单，不是实时数据；筛选和分页不代表生成、推送或实际履约',
    summary: {
      received: 17,
      checking: 4,
      issues: 4,
      ready: 6,
      scope: '完整17条模拟集合，汇总不随筛选改变',
    },
    filters: {
      order: orderNumberSearch.value,
      customer: customerSearch.value,
      warehouse: selectedWarehouse,
      status: omsStatusFilter.value,
    },
    page: {
      number: currentOrderPage,
      size: Number(ordersPageSize.value),
      count: Number(document.getElementById('ordersPageCount').textContent),
      matched: Number(document.getElementById('ordersTotal').textContent.match(/\d+/)[0]),
      visible: rows.length,
    },
    rows,
    coverage: 'rows仅含当前筛选的当前分页；summary是完整固定模拟集合，不可互换口径',
    actions: [],
  };
}
