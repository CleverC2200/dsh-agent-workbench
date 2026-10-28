export const customerSupplementaryDefinitions = [
  ['monthlyPlanQty','月度计划量','monthly_plan_qty'],
  ['shippedQty','发货量','shipped_qty'],
  ['unshippedQty','已下单未发货量','unshipped_qty'],
  ['budgetAmount','月度预算额','budget_amount'],
  ['shippedAmount','发货金额','shipped_amount'],
  ['unshippedAmount','已下单未发货金额','unshipped_amount'],
];
export function customerSupplementaryRows(row) {
  return [
    {key:'inTransit',label:'在途量',value:row.inTransit??null,coverage:row.inTransitCoverage??null,total:row.skuCount??null,unit:'箱',note:row.inTransit===null&&Number.isFinite(row.inTransitKnownQty)?`；已知部分 ${row.inTransitKnownQty} 箱，非全量；空值未补0`:''},
    ...customerSupplementaryDefinitions.map(([key,label,source]) => ({key,label,value:row[key]??null,coverage:row.planFieldCoverage?.[source]??null,total:row.planSkuCount??null,unit:key.endsWith('Amount')?'金额单位待确认':'数量单位待确认',note:''})),
  ];
}
export function customerSupplementarySummary(rows) {
  return customerSupplementaryDefinitions.map(([key,label]) => {
    const valid=rows.filter(row=>Number.isFinite(row[key]));
    return {key,label,value:valid.length?valid.reduce((sum,row)=>sum+row[key],0):null,coveredCustomers:valid.length,totalCustomers:rows.length,scope:'角色及组织范围，仅合计字段完整客户',unit:key.endsWith('Amount')?'金额单位待确认':'数量单位待确认'};
  });
}
