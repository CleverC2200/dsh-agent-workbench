const empty = (value) => value === null || value === undefined || value === '';
const valid = (value) => !empty(value) && Number.isFinite(Number(value));
const key = (execution, material, customer) => JSON.stringify([execution, material, customer]);

/** Explain the existing governed shortage join without inventing a SKU-only fallback. */
export function shortageDiagnostics(facts, source, field = 'final_short_qty', kind = 'pending') {
  if (!source)
    return { reason: '系统未完成数据读取：缺货来源查询未成功或尚未完成，不能判定为源表无数据。' };
  const opened = new Set([
    '已开未派',
    '派车中',
    '已派未到',
    '厂外侯车',
    '厂外候车',
    '厂内侯车',
    '厂内候车',
    '装车中',
    '备单完毕',
    '运输中',
    '在途',
    '已发货',
    '已完成',
  ]);
  const eligible = facts.filter(
    (row) =>
      Number(row.detailstatus) === 10 &&
      String(row.is_stat) === '1' &&
      (kind === 'pending'
        ? row.prapare_order_status === '备单中'
        : kind === 'opened'
          ? opened.has(row.prapare_order_status)
          : true),
  );
  const expected = new Map(
    eligible.map((row) => [key(row.executeorderno, row.material_code, row.cust_code), row]),
  );
  const index = new Map();
  for (const row of source.rows) {
    const id = key(row.execution_order, row.sku, row.customer_code);
    if (!index.has(id)) index.set(id, []);
    index.get(id).push(row);
  }
  const counts = {
    total: expected.size,
    missingKey: 0,
    unmatched: 0,
    duplicate: 0,
    missingValue: 0,
    invalid: 0,
    covered: 0,
  };
  for (const [id, row] of expected) {
    if ([row.executeorderno, row.material_code, row.cust_code].some(empty)) {
      counts.missingKey++;
      continue;
    }
    const matches = index.get(id) ?? [];
    if (!matches.length) {
      counts.unmatched++;
      continue;
    }
    if (matches.length !== 1 || Number(matches[0].source_rows) !== 1) {
      counts.duplicate++;
      continue;
    }
    if (empty(matches[0][field])) {
      counts.missingValue++;
      continue;
    }
    if (!valid(matches[0][field]) || Number(matches[0][field]) < 0) {
      counts.invalid++;
      continue;
    }
    counts.covered++;
  }
  const detail = [];
  if (!counts.total) detail.push('当前范围没有符合统计条件的订单SKU');
  if (counts.missingValue)
    detail.push(`源数据未提供：已匹配记录 ${field} 为空 ${counts.missingValue}项`);
  if (counts.missingKey)
    detail.push(
      `源数据未提供：执行单号、material_code或客户编码缺失 ${counts.missingKey}项，无法关联`,
    );
  if (counts.unmatched)
    detail.push(
      `系统未匹配到记录 ${counts.unmatched}项（当前受控结果内）；需核对源表同步日期及关联键，不能直接断言源表无数据`,
    );
  if (counts.duplicate) detail.push(`系统未能计算：关联键重复 ${counts.duplicate}项，未擅自加总`);
  if (counts.invalid) detail.push(`系统未能计算：${field} 非有效非负数 ${counts.invalid}项`);
  return {
    ...counts,
    reason: `来源 agents_scm_shortage_trace_f.${field}；仅 source_flag=缺货供应匹配，以执行单号＋material_code匹配并核对客户。有效 ${counts.covered}/${counts.total}项。${detail.join('；')}${detail.length ? '；缺失不补0。' : ''}`,
  };
}

export function fulfillmentMissingReason(field, row, result, calculationIssue = '') {
  if (
    result?.rejectedColumns?.some(
      (column) =>
        (typeof column === 'string'
          ? column
          : (column.outputAlias ?? column.alias ?? column.name ?? column.columnName)) === field,
    )
  )
    return `字段不可用：${field} 被受控接口拒绝返回；不是源值为0，也不能判定源表为空。`;
  if (!result) return `系统未完成数据读取：${field} 对应查询尚未完成或失败。`;
  if (row?.missingReasons?.[field]) return row.missingReasons[field];
  if (calculationIssue) return `系统未能计算：${calculationIssue}；未补0。`;
  if (!row)
    return `系统未匹配到记录：${field} 对应的订单、客户及SKU关联未命中；需核对关联键及日期。`;
  if (!Object.hasOwn(row, field))
    return `接口未返回字段：${field}；需核对字段发布或接线，不能断言源表没有数据。`;
  if (empty(row[field])) return `源数据未提供：当前返回记录 ${field} 为空；未补0。`;
  return `系统未能计算：${field} 有来源值，但单位、归并或计算条件未满足。`;
}

export function quantityMissingReasons(lines) {
  const reason = {};
  for (const [field, raw] of Object.entries({
    original_qty: 'order_qty',
    adjusted_qty: 'adjust_order_qty',
    ordered_qty: 'order_qty_origin',
    sales_person: 'sales_person',
    order_person: 'order_person',
    carrier: 'logistics_provider',
  })) {
    reason[field] = lines.some((row) => empty(row[raw]))
      ? `源数据未提供：agents_scm_execute_detail_hourly_d.${raw} 存在空值。`
      : `系统未能计算或唯一归并：${raw}已有来源值，但同一订单SKU的拆单、单位或人员归属不一致，未擅自取一条。`;
  }
  reason.allocated_qty = lines.some((row) => empty(row.pack_unitqty) && empty(row.qtyallocated))
    ? '源数据未提供：pack_unitqty、qtyallocated均缺失，不能确认实占数量。'
    : '系统未能计算：实占数量与换算数量不一致，或packingunitmain/packingunitconvertrate无效。';
  reason.shipped_qty = lines.some((row) => empty(row.delivery_qty) && empty(row.qtyshipped))
    ? '源数据未提供：delivery_qty、qtyshipped均缺失，不能确认发货数量。'
    : '系统未能计算：发货数量与换算数量不一致，或单位换算无效。';
  for (const field of ['source_short_qty', 'sku_allocation_rate', 'order_allocation_rate'])
    reason[field] =
      `系统未能计算：需有效原始数量、实占数量及正数需求分母。${reason.original_qty} ${reason.allocated_qty}`;
  return reason;
}
