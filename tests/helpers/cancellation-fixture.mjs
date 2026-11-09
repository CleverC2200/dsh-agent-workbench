import { DatabaseSync } from 'node:sqlite';

export const cancellationColumns = [
  'cust_code',
  'cust_order_no',
  'executeorderno',
  'executeorderlineno',
  'material_code',
  'belong_base',
  'region_name',
  'province_region_name',
  'cust_name',
  'header_addtime',
  'requireddeliverytime',
  'orderstatus',
  'canceltime',
  'custchangetime',
  'change_order_qty',
  'dms_last_update_qty',
  'need_qty_origin',
  'createsource',
  'is_virtual',
  'timeout_code',
  'warehouseid',
  'receive_wh',
  'pickup_point',
  'warehouse_classify',
];
export const cancellationLine = (id, overrides = {}) => ({
  cust_code: 'C',
  cust_order_no: id,
  executeorderno: 'E-' + id,
  executeorderlineno: 1,
  material_code: 'S',
  belong_base: '郑州',
  region_name: '华中',
  province_region_name: '河南',
  cust_name: '客户',
  header_addtime: '2026-10-01 00:00:00',
  requireddeliverytime: '2026-10-05 00:00:00',
  orderstatus: 10,
  canceltime: null,
  custchangetime: null,
  change_order_qty: null,
  dms_last_update_qty: null,
  need_qty_origin: 10,
  createsource: '20',
  is_virtual: null,
  timeout_code: null,
  warehouseid: 'F',
  receive_wh: null,
  pickup_point: null,
  warehouse_classify: null,
  ...overrides,
});
export function cancellationDb({ hourly = [], daily = [], trace = [] } = {}) {
  const db = new DatabaseSync(':memory:');
  for (const [table, rows] of [
    ['agents_scm_execute_detail_hourly_d', hourly],
    ['agents_scm_execute_detail_d', daily],
  ]) {
    db.exec(`CREATE TABLE ${table}(${cancellationColumns.join(',')})`);
    const insert = db.prepare(
      `INSERT INTO ${table} VALUES(${cancellationColumns.map(() => '?').join(',')})`,
    );
    for (const row of rows) insert.run(...cancellationColumns.map((k) => row[k] ?? null));
  }
  db.exec(`CREATE TABLE agents_scm_material_in_out_summary_d(warehouseid,pickup_point,warehouse_classify);
    CREATE TABLE agents_scm_order_trace_final_di(executeorderno,cust_code,fromorderno,receive_wh,deliver_wh,update_time);
    CREATE TABLE dim_bas_warehouse(warehouse_id,warehouse_classify);
    INSERT INTO agents_scm_material_in_out_summary_d VALUES
      ('F','P','01'),('F','P','01'),('R','P','02'),('OTHER','Q','02'),('OEM','P','03');
    INSERT INTO dim_bas_warehouse VALUES ('F','01'),('R','02'),('OTHER','02'),('OEM','03');`);
  const traceFields = [
    'executeorderno',
    'cust_code',
    'fromorderno',
    'receive_wh',
    'deliver_wh',
    'update_time',
  ];
  const insertTrace = db.prepare(
    `INSERT INTO agents_scm_order_trace_final_di VALUES (${traceFields.map(() => '?').join(',')})`,
  );
  for (const row of trace) insertTrace.run(...traceFields.map((key) => row[key] ?? null));
  db.function('CONCAT', { varargs: true }, (...v) => v.join(''));
  return db;
}
export const sqliteCancellationSql = (sql) =>
  sql
    .replaceAll(/([a-z_.]+) \+ INTERVAL '12' HOUR/gi, "datetime($1, '+12 hours')")
    .replaceAll(/([a-z_.]+) \+ INTERVAL '7' DAY/gi, "datetime($1, '+7 days')")
    .replaceAll(/([a-z_.]+) - INTERVAL '7' DAY/gi, "datetime($1, '-7 days')");
export const octoberCancellationParameters = {
  gea_p900: '',
  gea_p1: '2026-10-01',
  gea_p2: '2026-11-01',
};
