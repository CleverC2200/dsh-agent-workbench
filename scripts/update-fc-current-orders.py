"""Restore branch-owned open orders, independently of the unprepared shortage model."""
import json
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
p = ROOT / 'business/inventory-fc/sql.config.json'
c = json.loads(p.read_text())
mapping = (ROOT / 'business/shared/current-shortage-source.sql').read_text().split(', eligible_order_sku AS (', 1)[0]
source = mapping + ''', branch_order_lines AS (
 SELECT m.warehouseid AS warehouse_code, m.location_name AS warehouse_name,
 COALESCE(NULLIF(TRIM(o.cust_order_no), ''), NULLIF(TRIM(o.executeorderno), '')) AS order_no,
 o.cust_code AS customer_code, o.cust_name AS customer_name,
 o.material_code AS sku, o.material_name AS material_name,
 o.requireddeliverytime AS requested_at, o.header_addtime AS created_at,
 o.qtyordered AS ordered, o.qtyordered AS demand,
 o.qtyallocated AS allocated, o.delivery_qty AS shipped,
 CASE WHEN o.qtyordered IS NULL OR o.qtyallocated IS NULL THEN NULL
      WHEN o.qtyordered > o.qtyallocated THEN o.qtyordered-o.qtyallocated ELSE 0 END AS remaining,
 o.bizflowstatus AS order_status,
 CASE WHEN o.qtyordered IS NULL OR o.delivery_qty IS NULL OR o.delivery_qty<o.qtyordered THEN 1 ELSE 0 END AS unshipped
 FROM agents_scm_execute_detail_d AS o
 INNER JOIN point_locations AS m ON o.pickup_point=m.pickup_point
 WHERE m.location_type='分仓' AND o.detailstatus=10
 AND o.order_close_time IS NULL AND o.wms_close_time IS NULL
 AND NULLIF(TRIM(o.canceltime), '') IS NULL
 AND NULLIF(TRIM(o.cust_order_no), '') IS NOT NULL
 AND (:gea_p1 IS NULL OR m.warehouseid=:gea_p1)
), open_orders AS (
 SELECT l.warehouse_code AS warehouse_code, l.order_no AS order_no, l.customer_code AS customer_code
 FROM branch_order_lines AS l
 GROUP BY l.warehouse_code,l.order_no,l.customer_code
 HAVING MAX(l.unshipped)=1
), open_lines AS (
 SELECT l.warehouse_code AS warehouse_code,l.warehouse_name AS warehouse_name,l.order_no AS order_no,
 l.customer_code AS customer_code,l.customer_name AS customer_name,l.sku AS sku,
 l.material_name AS material_name,l.requested_at AS requested_at,l.created_at AS created_at,
 l.ordered AS ordered,l.demand AS demand,l.allocated AS allocated,l.shipped AS shipped,
 l.remaining AS remaining,l.order_status AS order_status,l.unshipped AS unshipped
 FROM branch_order_lines AS l INNER JOIN open_orders AS o
 ON l.warehouse_code=o.warehouse_code AND l.order_no=o.order_no
 AND (l.customer_code=o.customer_code OR (l.customer_code IS NULL AND o.customer_code IS NULL))
)'''
columns=['warehouse_code','warehouse_name','order_no','customer_code','customer_name','requested_at','created_at','ordered','demand','allocated','shipped','remaining','sku_count','satisfaction','order_status']
summary=''', order_groups AS (
 SELECT l.warehouse_code AS warehouse_code,MAX(l.warehouse_name) AS warehouse_name,l.order_no AS order_no,
 l.customer_code AS customer_code,
 CASE WHEN COUNT(DISTINCT l.customer_name)=1 THEN MAX(l.customer_name) ELSE NULL END AS customer_name,
 MIN(l.requested_at) AS requested_at,MIN(l.created_at) AS created_at,
 ''' + ',\n '.join(f'CASE WHEN COUNT(l.{k})=COUNT(*) THEN SUM(l.{k}) ELSE NULL END AS {k}' for k in ['ordered','demand','allocated','shipped','remaining']) + ''',
 COUNT(DISTINCT l.sku) AS sku_count,
 CASE WHEN COUNT(l.demand)=COUNT(*) AND COUNT(l.allocated)=COUNT(*) AND SUM(l.demand)>0
 THEN SUM(CASE WHEN l.allocated>l.demand THEN l.demand WHEN l.allocated<0 THEN 0 ELSE l.allocated END)*1.0/SUM(l.demand) ELSE NULL END AS satisfaction,
 CASE WHEN COUNT(DISTINCT l.order_status)=1 THEN MAX(l.order_status) ELSE NULL END AS order_status
 FROM open_lines AS l
 WHERE (:gea_p2 IS NULL OR l.customer_code=:gea_p2)
 AND (:gea_p3 IS NULL OR LOWER(l.order_no) LIKE LOWER(:gea_p3) OR LOWER(l.customer_name) LIKE LOWER(:gea_p3))
 GROUP BY l.warehouse_code,l.order_no,l.customer_code
 HAVING (:gea_p4=FALSE OR SUM(l.remaining)>0)
), page_count AS (SELECT COUNT(*) AS page_scope_total FROM order_groups AS g), page_rows AS (
 SELECT ''' + ', '.join('g.'+k+' AS '+k for k in columns) + ''',1 AS page_row_present
 FROM order_groups AS g ORDER BY g.created_at DESC,g.warehouse_code,g.order_no,g.customer_code
 LIMIT :gea_p5 OFFSET :gea_p6
)
SELECT ''' + ', '.join('p.'+k+' AS '+k for k in columns) + ''',p.page_row_present AS page_row_present,n.page_scope_total AS page_scope_total
FROM page_count AS n LEFT JOIN page_rows AS p ON TRUE
ORDER BY p.created_at DESC,p.warehouse_code,p.order_no,p.customer_code'''
linecols=['warehouse_code','order_no','customer_code','sku','material_name','ordered','demand','allocated','shipped','remaining','order_status']
detail=''', sku_lines AS (
 SELECT l.warehouse_code AS warehouse_code,l.order_no AS order_no,l.customer_code AS customer_code,l.sku AS sku,
 CASE WHEN COUNT(DISTINCT l.material_name)=1 THEN MAX(l.material_name) ELSE NULL END AS material_name,
 ''' + ',\n '.join(f'CASE WHEN COUNT(l.{k})=COUNT(*) THEN SUM(l.{k}) ELSE NULL END AS {k}' for k in ['ordered','demand','allocated','shipped','remaining']) + ''',
 CASE WHEN COUNT(DISTINCT l.order_status)=1 THEN MAX(l.order_status) ELSE NULL END AS order_status
 FROM open_lines AS l WHERE l.order_no=:gea_p2
 AND (l.customer_code=:gea_p3 OR (l.customer_code IS NULL AND :gea_p3 IS NULL))
 GROUP BY l.warehouse_code,l.order_no,l.customer_code,l.sku
), page_count AS (SELECT COUNT(*) AS page_scope_total FROM sku_lines AS l), page_rows AS (
 SELECT ''' + ', '.join('l.'+k+' AS '+k for k in linecols) + ''',1 AS page_row_present FROM sku_lines AS l
 ORDER BY l.sku LIMIT :gea_p5 OFFSET :gea_p6
)
SELECT ''' + ', '.join('p.'+k+' AS '+k for k in linecols) + ''',p.page_row_present AS page_row_present,n.page_scope_total AS page_scope_total
FROM page_count AS n LEFT JOIN page_rows AS p ON TRUE ORDER BY p.sku'''
def spec(name,kind='string',nullable=True,**extra):
 return {'name':name,'type':kind,'required':True,'nullable':nullable,**extra}
common={'gea_p1':spec('warehouse_code'),'gea_p5':spec('page_size','integer',False,minimum=1,maximum=50),'gea_p6':spec('offset','integer',False,minimum=0)}
for key,sql,cols,params,values in [
 ('branch-current-orders.page',source+summary,columns,{**common,'gea_p2':spec('customer_code'),'gea_p3':spec('search_pattern'),'gea_p4':spec('shortage_only','boolean',False)},{'gea_p1':None,'gea_p2':None,'gea_p3':None,'gea_p4':False,'gea_p5':10,'gea_p6':0}),
 ('branch-current-orders.lines',source+detail,linecols,{**common,'gea_p1':spec('warehouse_code',nullable=False),'gea_p2':spec('order_no',nullable=False),'gea_p3':spec('customer_code')},{'gea_p1':'A020','gea_p2':'CE1','gea_p3':None,'gea_p5':10,'gea_p6':0}),
]:
 c['queries'][key]={'title':'分仓当前未发货完成订单' if key.endswith('page') else '分仓订单SKU明细','grain':'warehouse + customer order' if key.endswith('page') else 'warehouse + customer order + SKU','notes':'当前有效且未关闭/作废的分仓自身订单；按实际发货件数与预期EA需求判断未发完，包含已备单和部分发货；保留同一未发完订单的已发完SKU。订单量与需求取当前执行单预期EA，订单占用取EA，实际发货取件；不使用原始包装数量或有差异的下单折合件字段。缺失数量不按0。未备量逐行max(需求-订单占用,0)，不把库存按订单重复扣减；此列表不修改三层缺货模型。','parameterSpec':params,'request':{'sql':sql,'parameters':values,'includeTotal':False},'resultColumns':cols+['page_row_present','page_scope_total']}
p.write_text(json.dumps(c,ensure_ascii=False,indent=2)+'\n')
print('Added branch-owned open-order page and SKU detail')
