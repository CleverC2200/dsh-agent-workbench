export function delistedReportIssues(rows, context) {
  return rows
    .filter((row) => row.delisted)
    .flatMap((row) => {
      const common = {
        month: row.month,
        base: row.base,
        code: row.code,
        name: row.name,
        productCategory: row.category,
        group: row.group,
        demand: row.demand,
        blocking: false,
      };
      const issues = [];
      if (row.automaticDemandStopped)
        issues.push({
          ...common,
          kind: '下市品停止自动补货',
          rawValue: row.shipmentReference,
          calculationValue: 0,
          reason:
            row.month === context.month
              ? `当月原系统拆分需求${row.shipmentReference ?? '待补'}保留为发货参考；自动新增需求及补货为0，预计发货${row.expectedShipment ?? '待补'}`
              : `日均${row.dailyShipmentCalculation}×该月自然天数，按有效可用库存封顶；预计发货${row.expectedShipment ?? '待补'}，期末库存${row.projectedClosing ?? '待补'}`,
          sourceTable:
            'ai_db.agents_dim_transfer_direction_mi / ai_db.agents_scm_stock_detail_d / 原需求拆分',
          sourceFields: 'transfer_tag / avg_30d_send / 原系统拆分需求',
          action:
            '停止自动新增需求和补货。第二步已含生产及在途入库通过期初承接，本地已确认的后续生产入库、在途和调拨按月份入账；缺确认保留待补，明确0才表示无计划',
        });
      else if (row.quantityAdjusted && row.demand > 0)
        issues.push({
          ...common,
          kind: '下市品人工正需求',
          rawValue: row.demand,
          calculationValue: row.demand,
          reason: `下市品已有有效人工正需求${row.demand}，按当前有效状态继续需求和后续计算`,
          sourceTable: '当前评估版本人工基地SKU修正 / ai_db.agents_dim_transfer_direction_mi',
          sourceFields: 'adjustments.quantities / transfer_tag',
          action:
            '保留人工原值、修正历史及当前有效状态；是否停止生效由人决定，系统不自动停用、归档或清零',
        });
      if (row.month > context.month && row.automaticDemandStopped && row.dailyShipmentIssue)
        issues.push({
          ...common,
          kind: '下市品日均缺失',
          rawValue: row.dailyShipment,
          calculationValue: row.dailyShipmentCalculation,
          reason: row.dailyShipmentIssue,
          sourceTable: 'ai_db.agents_scm_stock_detail_d',
          sourceFields: 'avg_30d_send / 截止日 / 来源读取状态',
          action:
            '仅日均发货计算用值补0，来源原始状态与原因保留；有效库存变动继续入账，其他库存缺项仍待补',
        });
      return issues;
    });
}

export const delistedDownloadColumns = [
  '下市品处理',
  '当月发货参考',
  '原始近30天日均发货',
  '计算用近30天日均发货',
  '日均来源异常',
  '预计发货量',
  '既有生产入库',
  '既有在途入库',
  '既有调入',
  '既有调出',
];
export function delistedDownloadFields(row) {
  return {
    下市品处理: !row.delisted
      ? ''
      : row.automaticDemandStopped
        ? '停止自动新增需求及补货'
        : '有效人工正需求继续计算',
    当月发货参考: row.delisted ? row.shipmentReference : '',
    原始近30天日均发货: row.delisted ? row.dailyShipment : '',
    计算用近30天日均发货: row.delisted ? row.dailyShipmentCalculation : '',
    日均来源异常: row.dailyShipmentIssue ?? '',
    预计发货量: row.expectedShipment,
    既有生产入库: row.existingProductionInbound,
    既有在途入库: row.existingInTransitInbound,
    既有调入: row.existingTransferIn,
    既有调出: row.existingTransferOut,
  };
}

export function createDelistedReport(react, { downloadCsv }) {
  const h = react.createElement;
  const columns = [
    '异常类别',
    '基地',
    'SKU',
    '月份',
    '原始值',
    '计算用值',
    '实际处理',
    '来源',
    '原因',
  ];
  return function DelistedReport({ draft, result, filters, table }) {
    const [page, setPage] = react.useState(0);
    const issues = (result.delistedIssues ?? []).filter(
      (row) =>
        (!filters.base || row.base === filters.base) &&
        (!filters.month || row.month === filters.month) &&
        (!filters.category || row.productCategory === filters.category) &&
        (!filters.search ||
          [row.base, row.code, row.name, row.group].some((value) =>
            String(value ?? '').includes(filters.search),
          )),
    );
    const scope = JSON.stringify(filters);
    react.useEffect(() => setPage(0), [scope]);
    if (!(result.delistedIssues ?? []).length) return null;
    const rows = issues.map((row) => ({
      异常类别: row.kind,
      基地: row.base,
      SKU: row.code,
      月份: row.month,
      原始值: row.rawValue === null ? '缺失或无效' : row.rawValue,
      计算用值: row.calculationValue,
      实际处理: row.action,
      来源: `${row.sourceTable}；${row.sourceFields}`,
      原因: row.reason,
    }));
    const pageIndex = Math.min(page, Math.max(0, Math.ceil(rows.length / 25) - 1));
    return h(
      'section',
      { className: 'dc-card', 'aria-label': '下市品需求与库存报告' },
      h(
        'div',
        { className: 'dc-card-head' },
        h('h3', null, '下市品需求与库存报告'),
        h(
          'button',
          {
            disabled: !rows.length,
            onClick: () => downloadCsv(`${draft.month}-下市品异常明细.csv`, columns, rows),
          },
          '下载下市品异常明细',
        ),
      ),
      h(
        'p',
        { className: 'dc-card-note' },
        '自动新增需求和补货从评估当月起停止。已有人工正需求保留有效状态，是否停止由人决定。第二步结存和已维护的后续调拨继续承接；独立未来生产及在途计划来源尚未接入。',
      ),
      react.cloneElement(
        table(
          '下市品需求与库存异常明细',
          columns,
          rows
            .slice(pageIndex * 25, (pageIndex + 1) * 25)
            .map((row) => columns.map((column) => row[column])),
        ),
        {
          tabIndex: 0,
          role: 'region',
          'aria-label': '下市品异常明细，可横向滚动',
        },
      ),
      rows.length > 25 &&
        h(
          'div',
          { className: 'dc-toolbar' },
          h(
            'button',
            {
              disabled: pageIndex === 0,
              onClick: () => setPage(pageIndex - 1),
            },
            '上一页下市品异常',
          ),
          h('span', null, `第${pageIndex + 1}页，共${rows.length}条`),
          h(
            'button',
            {
              disabled: (pageIndex + 1) * 25 >= rows.length,
              onClick: () => setPage(pageIndex + 1),
            },
            '下一页下市品异常',
          ),
        ),
    );
  };
}
