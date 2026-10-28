"""Generate per-Agent governed SQL from the reviewed three-stage shortage source."""
from pathlib import Path
import json,re
ROOT=Path(__file__).resolve().parents[1]
SOURCE=(ROOT/'business/shared/current-shortage-source.sql').read_text().strip()
DIMS={'stat_date':'snapshot_date','location_type':'location_type','location_code':'location_code','location_name':'location_name','belong_base':'base','warehouseid':'warehouse_code','material_code':'sku','material_name':'material_name','product_categ_name':'category','material_group_name':'material_group'}
MEASURES={'demand_qty':'demand','allocated_qty':'allocated','remaining_qty':'remaining','available_qty':'available','shortage_qty':'shortage'}

def definition(dimensions,location_type,detail=False,sku_page=False,source=SOURCE):
 params={'gea_p1':{'name':'base','type':'string','nullable':True},'gea_p2':{'name':'warehouse_code','type':'string','nullable':True},'gea_p3':{'name':'sku','type':'string','nullable':True},'gea_p4':{'name':'page_size','type':'integer','minimum':1,'maximum':200},'gea_p5':{'name':'offset','type':'integer','minimum':0},'gea_p6':{'name':'category','type':'string','nullable':True}}
 fixed=" AND r.location_type = '"+location_type+"'" if location_type else ''
 source_ctes, source_select = source.rsplit('\nSELECT',1)
 ctes=source_ctes+', shortage_source AS (SELECT'+source_select+'''), order_presence AS (
 SELECT COUNT(*) AS source_order_count FROM (SELECT 1 AS present FROM agents_scm_execute_detail_d AS probe_order LIMIT 1) AS order_probe
 ), filtered AS (
 SELECT '''+', '.join('r.'+k+' AS '+v for k,v in DIMS.items())+', '+', '.join('r.'+k+' AS '+v for k,v in MEASURES.items())+''',
 CASE WHEN p.source_order_count=0 THEN 1 ELSE r.invalid_sku END AS invalid
 FROM shortage_source AS r CROSS JOIN order_presence AS p
 WHERE (:gea_p1 IS NULL OR r.belong_base=:gea_p1)
 AND (:gea_p2 IS NULL OR r.warehouseid=:gea_p2)
 AND (:gea_p3 IS NULL OR r.material_code=:gea_p3)
 AND (:gea_p6 IS NULL OR r.product_categ_name=:gea_p6)'''+fixed+'\n)'
 if not detail:
  params.pop('gea_p4');params.pop('gea_p5')
 if sku_page:
  params['gea_p7']={'name':'skus','type':'array','items':'string','maxItems':100}
  ctes += ''
  ctes=ctes[:-1]+' AND r.material_code IN (:gea_p7)\n)'
 fields=[DIMS[d] for d in dimensions];allfields=fields+list(MEASURES.values())+['invalid']
 if detail:
  sql=ctes+''', scope_count AS (SELECT COUNT(*) AS page_scope_total FROM filtered AS f WHERE f.sku IS NOT NULL), page_rows AS (
 SELECT '''+', '.join('f.'+k+' AS '+k for k in allfields)+''' FROM filtered AS f WHERE f.sku IS NOT NULL
 ORDER BY f.location_type, f.location_code, f.sku LIMIT :gea_p4 OFFSET :gea_p5)
 SELECT '''+', '.join('p.'+k+' AS '+k for k in allfields)+''', t.page_scope_total AS page_scope_total,
 CASE WHEN p.location_code IS NOT NULL THEN 1 ELSE NULL END AS page_row_present
 FROM scope_count AS t LEFT JOIN page_rows AS p ON TRUE
 ORDER BY p.location_type, p.location_code, p.sku'''
  allfields+=['page_scope_total','page_row_present']
 else:
  sql=ctes+'\nSELECT '+', '.join('f.'+k+' AS '+k for k in fields)+', '+', '.join('CASE WHEN COUNT(f.'+v+')=COUNT(*) THEN SUM(f.'+v+') END AS '+v if v in ['demand','allocated','remaining'] else 'CASE WHEN SUM(f.invalid)>0 THEN NULL ELSE SUM(f.'+v+') END AS '+v for v in MEASURES.values())+', SUM(f.invalid) AS invalid FROM filtered AS f GROUP BY '+', '.join('f.'+k for k in fields)+' ORDER BY '+', '.join('f.'+k for k in fields)
 return {'title':'当前未备单订单三层缺货','parameterSpec':params,'request':{'parameters':{k:({'gea_p4':10,'gea_p5':0,'gea_p7':['']}.get(k)) for k in params},'sql':sql,'includeTotal':False},'resultColumns':allfields,'notes':'仅统一GEA受控SQL；复用已验证三层逻辑和11种状态含创建，短拨调账同步层已排除；无日期截断；当前状态不可重建历史；可用库存只扣一次；跨SKU不抵消。'}

def update_agents(agents):
 for agent in agents:
  path=ROOT/f'business/inventory-{agent}/sql.config.json';text=path.read_text()
  if '"modelQueries"' in text:
   match=re.search(r',\n  "modelQueries": ',text);start=match.end();_,size=json.JSONDecoder().raw_decode(text[start:]);text=text[:match.start()]+text[start+size:]
  scoped_source=ROOT/f'business/inventory-{agent}'/('current-orders-source.sql' if agent=='aqkc' else 'current-shortage-source.sql')
  source=scoped_source.read_text().strip() if agent in ['aqkc','fc'] else SOURCE
  scope='基地' if agent=='aqkc' else '分仓' if agent=='fc' else None
  data={'current-shortage.summary':definition(['stat_date','location_type'],scope,source=source),'current-shortage.locations':definition(['stat_date','location_type','location_code','location_name','belong_base','warehouseid'],scope,source=source),'current-shortage.categories':definition(['stat_date','location_type','belong_base','product_categ_name'],scope,source=source),'current-shortage.detail':definition(list(DIMS),scope,True,source=source),'current-shortage.skus':definition(['stat_date','location_type','belong_base','material_code'],scope,sku_page=True,source=source)}
  if agent=='aqkc':
   for value in data.values():
    value['title']='当前未发货完成订单三层缺货'
    value['notes']='仅统一GEA受控SQL。有效且未关闭、未取消、未发货完成订单，包含已备单和部分发货；按qtyordered和qtyallocated统一件数，同一订单SKU先截零，基地SKU汇总后扣一次可用库存；缺失数量不按0，当前状态不可重建历史。'
  for key,value in data.items():
   match=re.search(r'"'+re.escape(key)+r'"\s*:\s*',text)
   if match:
    start=match.end();_,size=json.JSONDecoder().raw_decode(text[start:]);encoded=json.dumps(value,ensure_ascii=False,indent=2).replace('\n','\n    ');text=text[:start]+encoded+text[start+size:]
   else:
    match=re.search(r'"queries"\s*:\s*',text);start=match.end();queries,size=json.JSONDecoder().raw_decode(text[start:]);end=start+size-1
    entry='    '+json.dumps(key)+': '+json.dumps(value,ensure_ascii=False,indent=2).replace('\n','\n    ')
    text=text[:end].rstrip()+',\n'+entry+'\n  '+text[end:]
  path.write_text(text)

if __name__ == '__main__':
 update_agents(['aqkc','fc','qll','apsplan'])
