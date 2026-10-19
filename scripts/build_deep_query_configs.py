"""Regenerate governed deep-page queries from the existing per-Agent source queries. Requires sqlglot."""
import json,copy,re
from pathlib import Path
import sqlglot
from sqlglot import exp
root=Path(__file__).resolve().parents[1]/'business'
def sql(t):return re.sub(r'%\((gea_p\d+)\)s',r':\1',t.sql(dialect='postgres'))
def add_atomic(c,id,shared_scope=False):
 q=c['queries'][id];countid=q.get('pagination',{}).get('countQuery')
 if not countid:return
 t=sqlglot.parse_one(q['request']['sql'],read='postgres');order=t.args.get('order')
 if not order:raise ValueError(('missing stable order',id))
 outerorder=order.copy()
 projections={e.alias:e.this for e in t.expressions if isinstance(e,exp.Alias)}
 for n,o in enumerate(outerorder.expressions):
  expr=o.this.copy()
  # ORDER BY may refer to a SELECT alias; resolve it before projecting the sort value.
  expr=expr.transform(lambda e: projections[e.name].copy() if isinstance(e,exp.Column) and not e.table and e.name in projections else e)
  t.select(exp.alias_(expr,'page_sort_'+str(n)),append=True,copy=False)
  o.set('this',exp.column('page_sort_'+str(n),table='p'))
 t.select('1 AS page_row_present',append=True,copy=False)
 cols=', '.join('p.'+f+' AS '+f for f in q['resultColumns'])
 nq=copy.deepcopy(q);nid=id+'.atomic';nq.pop('pagination',None)
 nq['request']['sql']=f"SELECT {cols}, c.total AS page_scope_total, p.page_row_present AS page_row_present FROM ({c['queries'][countid]['request']['sql']}) AS c LEFT JOIN ({sql(t)}) AS p ON TRUE "+sql(outerorder)
 if shared_scope:
  scope=sqlglot.parse_one(q['request']['sql'],read='postgres')
  scope.set('limit',None);scope.set('offset',None);scope.set('order',None)
  fields=', '.join('s.'+f+' AS '+f for f in q['resultColumns'])
  scoped_order=order.copy()
  for o in scoped_order.expressions:
   if not isinstance(o.this,exp.Column) or o.this.name not in q['resultColumns']:raise ValueError(('shared scope requires projected sort',id))
   o.set('this',exp.column(o.this.name,table='s'))
  final_order=order.copy()
  for o in final_order.expressions:o.set('this',exp.column(o.this.name,table='p'))
  nq['request']['sql']=f"WITH page_scope AS ({sql(scope)}) SELECT {cols}, c.total AS page_scope_total, p.page_row_present AS page_row_present FROM (SELECT COUNT(*) AS total FROM page_scope AS s) AS c LEFT JOIN (SELECT {fields}, 1 AS page_row_present FROM page_scope AS s {sql(scoped_order)} LIMIT :gea_p1001 OFFSET :gea_p1002) AS p ON TRUE {sql(final_order)} LIMIT :gea_p1001"
 if not shared_scope:
  page_key=next(k for k,v in q['parameterSpec'].items() if v['name']=='page_size')
  nq['request']['sql']+=' LIMIT :'+page_key
 nq['resultColumns']=q['resultColumns']+['page_scope_total','page_row_present'];nq['notes']='同一SQL读取总数及当前页；空页用一条标记行保留总数；外层显式保持原排序，不下载全量明细。'
 c['queries'][nid]=nq;q['pagination']['atomicQuery']=nid

for agent in ['aqkc','fc','qll','apsplan','dealer']:
 p=root/('inventory-'+agent)/'sql.config.json';c=json.loads(p.read_text())
 ids={v['queryId'] for v in c.get('sourceViews',{}).get('views',[]) if v.get('queryId')}
 if agent=='aqkc':ids.add('page.sku-detail')
 for id in sorted(ids):add_atomic(c,id)
 p.write_text(json.dumps(c,ensure_ascii=False,indent=2)+'\n')
 print(agent,len(ids),'views',p.stat().st_size)

p=root/'inventory-aqkc/sql.config.json';c=json.loads(p.read_text())
q=c['queries']['page.dashboard-groups'];t=sqlglot.parse_one(q['request']['sql'],read='postgres');t.set('limit',None);t.set('offset',None);t.set('order',None)
level="CASE WHEN :gea_p91 = 'base' THEN g.base ELSE COALESCE(NULLIF(TRIM(g.category), ''), '未分类') END"
t.set('expressions',[exp.alias_(sqlglot.parse_one(level,read='postgres'),'level')]+t.expressions[2:]+[sqlglot.parse_one('COUNT(DISTINCT g.sku) AS sku_count',read='postgres')])
t.set('group',sqlglot.parse_one('SELECT 1 GROUP BY '+level,read='postgres').args['group'])
t=t.where("COALESCE(NULLIF(TRIM(g.category), ''), '未分类') <> '饺鲜说' AND (:gea_p92 IS NULL OR COALESCE(NULLIF(TRIM(g.category), ''), '未分类') = :gea_p92) AND (:gea_p93 = FALSE OR g.stock_source_rows > 0)",copy=False)
base=sql(t);nq=copy.deepcopy(q);nq['request']['sql']=base+' ORDER BY level LIMIT :gea_p20 OFFSET :gea_p21';nq['resultColumns']=[e.alias for e in t.expressions];nq['grain']=['level'];nq['pagination']={'countQuery':'page.structure-groups.count'}
for k,spec,default in [('gea_p91',{'name':'group_level','type':'string','enum':['base','category'],'nullable':False},'category'),('gea_p92',{'name':'structure_category','type':'string','nullable':True},None),('gea_p93',{'name':'stock_only','type':'boolean','nullable':False},False)]:
 nq['parameterSpec'][k]=spec;nq['request']['parameters'][k]=default
c['queries']['page.structure-groups']=nq
count=copy.deepcopy(nq);count.pop('pagination');count['request']['sql']='SELECT COUNT(*) AS total FROM ('+base+') AS g';count['resultColumns']=['total']
for k in ['gea_p20','gea_p21']:count['parameterSpec'].pop(k);count['request']['parameters'].pop(k)
c['queries']['page.structure-groups.count']=count
q=c['queries']['page.workbench-order-structure'];t=sqlglot.parse_one(q['request']['sql'],read='postgres');t.set('limit',None);t.set('offset',None);t.set('order',None)
# Group directly from the order fact scope rather than first shipping SKU groups.
t.set('expressions',[e for e in t.expressions if e.alias not in ['material_code','material_name']]);t.set('group',sqlglot.parse_one('SELECT 1 GROUP BY fact.base, fact.category',read='postgres').args['group'])
base=sql(t);nq=copy.deepcopy(q);nq['request']['sql']=base+' ORDER BY base, category LIMIT :gea_p1001 OFFSET :gea_p1002';nq['resultColumns']=[e.alias for e in t.expressions];nq['grain']=['base','category'];nq['pagination']={'countQuery':'page.structure-orders.count'};c['queries']['page.structure-orders']=nq
count=copy.deepcopy(nq);count.pop('pagination');count['request']['sql']='SELECT COUNT(*) AS total FROM ('+base+') AS g';count['resultColumns']=['total']
for k in ['gea_p1001','gea_p1002']:count['parameterSpec'].pop(k);count['request']['parameters'].pop(k)
c['queries']['page.structure-orders.count']=count
c['workspaceBindings']['workbench-support-by-base']['singlePageFirst']=True
b=copy.deepcopy(c['workspaceBindings']['workbench-order-structure']);b['queryId']='page.structure-orders';b['keyFields']=['base','category'];b['singlePageFirst']=True;c['workspaceBindings']['workbench-order-groups']=b
p.write_text(json.dumps(c,ensure_ascii=False,indent=2)+'\n')

p=root/'inventory-apsplan/sql.config.json';c=json.loads(p.read_text());c['workspaceDrillBindings']={}
for mode,keep in [('organization',['month','base','category','region','province','sales_group']),('product',['month','base','category','item','material'])]:
 bindings={}
 for name,b in c['workspaceBindings'].items():
  q=c['queries'][b['queryId']];t=sqlglot.parse_one(q['request']['sql'],read='postgres');t.set('limit',None);t.set('offset',None);t.set('order',None)
  dims=[f for f in keep if f in q['resultColumns']];exprs=[];group_exprs=[]
  category_key="CASE WHEN :gea_p2001 = 'base' THEN CONCAT(g.base, '::', g.category) ELSE g.category END"
  item_key="CASE WHEN :gea_p2001 = 'base' THEN CONCAT(g.base, '::', g.category, '::', g.item) ELSE CONCAT(g.category, '::', g.item) END"
  open_category=f'(:gea_p2002 = TRUE AND ({category_key}) IN (:gea_p2003))'
  open_item=f'({open_category} AND :gea_p2004 = TRUE AND ({item_key}) IN (:gea_p2005))'
  for f in q['resultColumns']:
   if mode=='product' and f=='item':e=f'CASE WHEN {open_category} THEN g.item ELSE NULL END'
   elif mode=='product' and f=='material':e=f'CASE WHEN {open_item} THEN g.material ELSE NULL END'
   elif f in dims:e='g.'+f
   elif f in ['month','base','category','region','province','sales_group','item','material','date']:e='CAST(NULL AS TEXT)'
   elif f in ['first_snapshot','first_day']:e='MIN(g.'+f+')'
   elif f in ['source_date','source_basis','target_month','last_day']:e='MAX(g.'+f+')'
   else:e=f'CASE WHEN COUNT(g.{f}) = COUNT(*) THEN SUM(g.{f}) ELSE NULL END'
   exprs.append(e+' AS '+f)
   if f in dims:group_exprs.append(e)
  base='SELECT '+', '.join(exprs)+' FROM ('+sql(t)+') AS g GROUP BY '+', '.join(group_exprs)
  id='drill.'+mode+'.'+name;nq=copy.deepcopy(q);nq['request']['sql']=base+' ORDER BY '+', '.join(dims)+' LIMIT :gea_p1001 OFFSET :gea_p1002';nq['grain']=dims;nq['pagination']={'countQuery':id+'.count'};nq['notes']='按当前组织/产品下钻保留维度；先按原明细计算偏差、缺值，再求和；不平均比率。';c['queries'][id]=nq
  if mode=='product':
   for k,spec,default in [
    ('gea_p2001',{'name':'product_group_mode','type':'string','enum':['category','base'],'nullable':False},'category'),
    ('gea_p2002',{'name':'product_categories_enabled','type':'boolean','nullable':False},False),
    ('gea_p2003',{'name':'product_categories','type':'array','items':'string','minItems':1,'nullable':False},['']),
    ('gea_p2004',{'name':'product_items_enabled','type':'boolean','nullable':False},False),
    ('gea_p2005',{'name':'product_items','type':'array','items':'string','minItems':1,'nullable':False},[''])]:
    nq['parameterSpec'][k]=spec;nq['request']['parameters'][k]=default
  count=copy.deepcopy(nq);count.pop('pagination');count['request']['sql']='SELECT COUNT(*) AS total FROM ('+base+') AS g';count['resultColumns']=['total']
  c['queries'][id+'.count']=count
  for x in [nq,count]:
   used=set(re.findall(r':(gea_p\d+)\b',x['request']['sql']))
   for k in list(x['parameterSpec']):
    if k not in used:x['parameterSpec'].pop(k);x['request']['parameters'].pop(k,None)
  nb=copy.deepcopy(b);nb['queryId']=id;nb['keyFields']=dims;nb['singlePageFirst']=name not in ({'orders','orders-month','forecast','delivery-daily','sales-accuracy'} if mode=='organization' else set());bindings[name]=nb
 bindings['shippable']=copy.deepcopy(bindings['stock']);c['workspaceDrillBindings'][mode]=bindings
add_atomic(c,'drill.product.stock',shared_scope=True)
p.write_text(json.dumps(c,ensure_ascii=False,indent=2)+'\n');print(p.stat().st_size)
