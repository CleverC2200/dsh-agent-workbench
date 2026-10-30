"""Publish FC supply-order queries using receiving warehouse, preserving customer demand."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
path = ROOT / 'business/inventory-fc/sql.config.json'
config = json.loads(path.read_text())
params = {
    'gea_p1': ('start', 'string', '2026-10-01'),
    'gea_p2': ('end_exclusive', 'string', '2026-10-31'),
    'gea_p3': ('warehouse_code', 'string', None),
    'gea_p4': ('sku', 'string', None),
    'gea_p5': ('search_pattern', 'string', None),
    'gea_p6': ('period_mode', 'string', 'month'),
    'gea_p7': ('order_types', 'array', ['TT1', 'TT2', 'STO', 'ZUB', 'TT']),
    'gea_p8': ('page_size', 'integer', 10),
    'gea_p9': ('offset', 'integer', 0),
}
raw = {
    'warehouse_code': 'receive_wh', 'order_no': 'executeorderno', 'line_no': 'executeorderlineno',
    'sku': 'material_code', 'material_name': 'material_name', 'base_warehouse': 'warehouseid',
    'base': 'belong_base', 'order_type': 'order_type', 'created_at': 'header_addtime',
    'source_updated_at': 'load_time', 'ordered_ea': 'qtyordered', 'shipped_ea': 'qtyshipped',
    'signed_ea': 'qtysigned', 'allocated_ea': 'qtyallocated', 'conversion_rate': 'packingunitconvertrate',
    'quantity_unit': 'packingunitmain', 'order_status': 'prapare_order_status',
    'detail_status': 'detailstatus', 'header_status': 'orderstatus',
    'cancel_time': 'canceltime', 'flow_status': 'bizflowstatus',
}
keys = ['warehouse_code', 'order_no', 'line_no', 'sku']
payload = [name for name in raw if name not in keys and name != 'source_updated_at']
projection = ', '.join(f'e.{physical} AS {name}' for name, physical in raw.items())
key_projection = ', '.join('s.' + key + ' AS ' + key for key in keys)
key_group = ', '.join('s.' + key for key in keys)
key_join = ' AND '.join(f'(s.{key}=k.{key} OR (s.{key} IS NULL AND k.{key} IS NULL))' for key in keys)
distinct_projection = ', '.join('s.' + name + ' AS ' + name for name in raw)
grouped_projection = ', '.join(f'CASE WHEN COUNT(*)=1 THEN MAX(s.{name}) ELSE NULL END AS {name}' for name in payload)
converted = {}
for field, source in [('demand', 'ordered_ea'), ('shipped', 'shipped_ea'), ('received', 'signed_ea'), ('allocated', 'allocated_ea')]:
    converted[field] = f"CASE WHEN s.source_versions=1 AND s.quantity_unit='CS' AND s.conversion_rate>0 AND s.{source}>=0 AND NULLIF(TRIM(s.order_no),'') IS NOT NULL AND s.line_no IS NOT NULL AND NULLIF(TRIM(s.sku),'') IS NOT NULL THEN s.{source}/CAST(s.conversion_rate AS DECIMAL(20,6)) ELSE NULL END"
ctes = f'''WITH supply_scoped AS (
 SELECT {projection}
 FROM agents_scm_execute_detail_hourly_d AS e
 WHERE e.order_type IN (:gea_p7)
 AND NULLIF(TRIM(e.receive_wh),'') IS NOT NULL AND TRIM(e.receive_wh)<>'*'
 AND e.header_addtime<CAST(:gea_p2 AS DATE)
 AND (:gea_p6='current' OR e.header_addtime>=CAST(:gea_p1 AS DATE))
 AND (:gea_p3 IS NULL OR e.receive_wh=:gea_p3)
 AND (:gea_p4 IS NULL OR e.material_code=:gea_p4)
), supply_latest AS (
 SELECT {key_projection}, MAX(s.source_updated_at) AS latest_update
 FROM supply_scoped AS s GROUP BY {key_group}
), supply_records AS (
 SELECT DISTINCT {distinct_projection}
 FROM supply_scoped AS s INNER JOIN supply_latest AS k ON {key_join}
 AND (s.source_updated_at=k.latest_update OR (s.source_updated_at IS NULL AND k.latest_update IS NULL))
), supply_lines AS (
 SELECT {key_projection}, {grouped_projection}, MAX(s.source_updated_at) AS source_updated_at,
 COUNT(*) AS source_versions
 FROM supply_records AS s GROUP BY {key_group}
), supply_quantities AS (
 SELECT {', '.join('s.'+name+' AS '+name for name in keys + ['material_name', 'base_warehouse', 'base', 'order_type', 'created_at', 'order_status', 'source_updated_at', 'source_versions'])},
 {', '.join(value+' AS '+name for name, value in converted.items())}
 FROM supply_lines AS s
 WHERE s.source_versions>1 OR (s.detail_status=10
 AND (s.header_status IS NULL OR s.header_status<>90)
 AND (s.cancel_time IS NULL OR NULLIF(TRIM(s.cancel_time),'') IS NULL)
 AND (s.flow_status IS NULL OR s.flow_status<>'作废'))
), supply_measured AS (
 SELECT {', '.join('s.'+name+' AS '+name for name in keys + ['material_name', 'base_warehouse', 'base', 'order_type', 'created_at', 'order_status', 'source_updated_at', 'source_versions', 'demand', 'shipped', 'received', 'allocated'])},
 CASE WHEN s.demand IS NULL OR s.shipped IS NULL THEN NULL WHEN s.demand>s.shipped THEN s.demand-s.shipped ELSE 0 END AS pending,
 CASE WHEN s.shipped IS NULL OR s.received IS NULL THEN NULL WHEN s.shipped>s.received THEN s.shipped-s.received ELSE 0 END AS in_transit,
 CASE WHEN s.demand IS NULL OR s.shipped IS NULL THEN NULL WHEN s.shipped>s.demand THEN s.demand ELSE s.shipped END AS fulfilled,
 CASE WHEN s.shipped IS NULL OR s.demand IS NULL THEN NULL WHEN s.shipped>0 THEN s.demand ELSE 0 END AS shipped_order_quantity
 FROM supply_quantities AS s
), supply_filtered AS (
 SELECT {', '.join('s.'+name+' AS '+name for name in keys + ['material_name', 'base_warehouse', 'base', 'order_type', 'created_at', 'order_status', 'source_updated_at', 'source_versions', 'demand', 'shipped', 'received', 'allocated', 'pending', 'in_transit', 'fulfilled', 'shipped_order_quantity'])}
 FROM supply_measured AS s
 WHERE (:gea_p6='month' OR s.pending>0 OR s.in_transit>0 OR s.pending IS NULL OR s.in_transit IS NULL)
 AND (:gea_p5 IS NULL OR LOWER(s.order_no) LIKE LOWER(:gea_p5) OR LOWER(s.sku) LIKE LOWER(:gea_p5) OR LOWER(s.material_name) LIKE LOWER(:gea_p5))
)'''
source_file = ROOT / 'business/inventory-fc/upstream-supply-source.sql'
source_file.write_text(ctes + '\n')
detail_columns = keys + ['material_name', 'base_warehouse', 'base', 'order_type', 'created_at', 'order_status', 'source_updated_at', 'source_versions', 'demand', 'shipped', 'received', 'allocated', 'pending', 'in_transit']
sum_fields = ['demand', 'shipped', 'received', 'allocated', 'pending', 'in_transit', 'shipped_order_quantity']
aggregate = lambda field: f'CASE WHEN COUNT(*)=0 THEN 0 WHEN COUNT(s.{field})=COUNT(*) THEN SUM(s.{field}) ELSE NULL END'
summary_columns = ['row_count', 'order_count'] + sum_fields + ['missing_'+name for name in sum_fields] + ['fulfillment_rate', 'source_updated_at']
summary = 'SELECT COUNT(*) AS row_count, COUNT(DISTINCT s.order_no) AS order_count, '
summary += ', '.join(aggregate(field) + ' AS ' + field for field in sum_fields)
summary += ', ' + ', '.join(f'COUNT(*)-COUNT(s.{field}) AS missing_{field}' for field in sum_fields)
summary += ', CASE WHEN COUNT(s.demand)=COUNT(*) AND COUNT(s.fulfilled)=COUNT(*) AND SUM(s.demand)>0 THEN SUM(s.fulfilled)/SUM(s.demand) ELSE NULL END AS fulfillment_rate, MAX(s.source_updated_at) AS source_updated_at FROM supply_filtered AS s'
detail = 'SELECT ' + ', '.join('s.' + name + ' AS ' + name for name in detail_columns) + ' FROM supply_filtered AS s ORDER BY s.warehouse_code,s.order_no,s.line_no,s.sku LIMIT :gea_p8 OFFSET :gea_p9'
atomic = ctes + ', supply_count AS (SELECT COUNT(*) AS page_scope_total FROM supply_filtered AS s), supply_page AS (' + detail.replace(' FROM supply_filtered AS s', ', 1 AS page_row_present FROM supply_filtered AS s') + ') SELECT '
atomic += ', '.join('p.'+name+' AS '+name for name in detail_columns + ['page_row_present']) + ', n.page_scope_total AS page_scope_total FROM supply_count AS n LEFT JOIN supply_page AS p ON TRUE ORDER BY p.warehouse_code,p.order_no,p.line_no,p.sku'
queries = {
    'branch-supply.summary': (ctes+' '+summary, summary_columns),
    'branch-supply.count': (ctes+' SELECT COUNT(*) AS total FROM supply_filtered AS s', ['total']),
    'branch-supply.detail': (ctes+' '+detail, detail_columns),
    'branch-supply.detail.atomic': (atomic, detail_columns+['page_row_present','page_scope_total']),
}
for query_id, (sql, columns) in queries.items():
    used = set(__import__('re').findall(r'gea_p\d+', sql))
    specs = {key: {'name': name, 'type': typ, 'nullable': value is None, 'required': True} for key, (name, typ, value) in params.items() if key in used}
    for key in ['gea_p1', 'gea_p2']:
        if key in specs:
            specs[key]['format'] = 'YYYY-MM-DD'
    if 'gea_p6' in specs:
        specs['gea_p6']['enum'] = ['month', 'current']
    if 'gea_p7' in specs:
        specs['gea_p7'].update(items='string', minItems=1)
    if 'gea_p8' in specs:
        specs['gea_p8'].update(minimum=1, maximum=100)
    if 'gea_p9' in specs:
        specs['gea_p9']['minimum'] = 0
    query = dict(title='基地向分仓供货订单', plugins=['fc'], grain='receiving warehouse × execute order × line × SKU',
                 notes='分仓向基地补货的执行侧；receive_wh为收货分仓，warehouseid为发货仓。只读小时执行源；排除作废明细与取消单；按执行单行取最新加载，冲突保持未知。CS数量使用原始EA除包装转换率。月度满足率=同池逐行限额发货量合计/订货量合计；当前池为全部未发或未收完成行，跨月保留。',
                 parameterSpec=specs, request={'sql': sql, 'parameters': {key: params[key][2] for key in specs}, 'includeTotal': False}, resultColumns=columns)
    if query_id.endswith('.detail'):
        query['pagination'] = {'mode':'sql_limit_offset','countQuery':'branch-supply.count','atomicQuery':'branch-supply.detail.atomic'}
    config['queries'][query_id] = query
views = [view for view in config['sourceViews']['views'] if view['id'] not in ['branch-supply', 'branch-supply-current']]
labels = {'warehouse_code':'收货分仓', 'order_no':'补货执行单号', 'line_no':'行号', 'sku':'SKU', 'material_name':'产品名称', 'base_warehouse':'发货仓库', 'base':'供货基地', 'order_type':'订单类型', 'created_at':'创建时间', 'order_status':'订单状态', 'source_updated_at':'数据更新时间', 'source_versions':'同版本记录数', 'demand':'订货量（件）', 'shipped':'已发量（件）', 'received':'已收量（件）', 'allocated':'占用量（件）', 'pending':'待发量（件）', 'in_transit':'已发未收（件）'}
for view_id, mode, title in [('branch-supply', 'month', '本月补货订单'), ('branch-supply-current', 'current', '当前补货订单')]:
    views.append(dict(id=view_id, title=title, queryId='branch-supply.detail', summaryId='branch-supply.summary',
                      description='分仓向基地补货，货物流向为基地到分仓；按收货仓归属。当前订单跨月保留未发或未收完成行，月度池按创建时间统计。仅执行侧数据，不包含尚未生成执行单的补货申请。执行状态取当前小时加载；历史日期只限制建单日期，不还原当日状态。',
                      timeMode='period' if mode=='month' else 'current', preserveEmptySummary=True,
                      overrides={'period_mode': mode}, filters=[{'name':'warehouse_code','label':'收货分仓编码'}, {'name':'sku','label':'SKU'}, {'name':'search','label':'执行单号／SKU／产品'}],
                      columns=[{'field':name,'label':labels[name],**({'format':'decimal2'} if name in ['demand','shipped','received','allocated','pending','in_transit'] else {})} for name in detail_columns],
                      defaultColumns=['order_no','base','base_warehouse','warehouse_code','sku','material_name','demand','shipped','received','pending','in_transit','order_status','created_at'],
                      metrics=[{'field':name,'label':labels[name],'missing':'missing_'+name} for name in ['demand','shipped','pending','in_transit']]))
config['sourceViews']['views'] = views
config['overviewViewIds'] = [id for id in config['overviewViewIds'] if id not in ['orders','branch-supply','branch-supply-current']]
config['overviewViewIds'][:0] = ['branch-supply']
path.write_text(json.dumps(config, ensure_ascii=False, indent=2)+'\n')
print('Added receiving-warehouse supply orders; existing customer demand and replenishment calculations retained.')
