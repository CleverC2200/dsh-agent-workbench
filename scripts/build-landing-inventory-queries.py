"""Derive inventory-only landing projections from the same scoped source adapters."""
from pathlib import Path
import json,re,copy,sqlglot
from sqlglot import exp
from sqlglot.optimizer.pushdown_projections import pushdown_projections
ROOT=Path(__file__).resolve().parents[1]
for agent,source_id in [('aqkc','page.dashboard-groups'),('apsplan','overview.stock')]:
 p=ROOT/f'business/inventory-{agent}/sql.config.json';c=json.loads(p.read_text());source=c['queries'][source_id];tree=sqlglot.parse_one(source['request']['sql'],read='postgres');ctes={v.alias_or_name:v.copy() for v in tree.find_all(exp.CTE)}
 aliases={spec['name']:key for key,spec in source['parameterSpec'].items()};base_enabled=aliases['bases_enabled'];bases=aliases['bases'];exclude=aliases.get('exclude_category')
 predicate=f'(:{base_enabled}=FALSE OR a.base IN (:{bases}))'
 if exclude:predicate+=f' AND (:{exclude} IS NULL OR a.category IS NULL OR a.category<>:{exclude})'
 if agent=='apsplan':predicate+=' AND a.stock_source_rows>0'
 quantity='SUM(a.inventory) AS inventory,COUNT(a.inventory) AS inventory_count'
 fields=f'a.base AS base,a.category AS category,COUNT(*) AS row_count,{quantity}'
 if agent=='apsplan':fields+=', COUNT(*) AS records, CAST(NULL AS DECIMAL(20,6)) AS demand,CAST(NULL AS DECIMAL(20,6)) AS target, COUNT(*) AS missing_demand,COUNT(*) AS missing_target,MAX(a.stock_date) AS source_date'
 root=sqlglot.parse_one('SELECT '+fields+' FROM aligned AS a WHERE '+predicate+' GROUP BY a.base,a.category ORDER BY a.base,a.category',read='postgres')
 needed=set()
 def retain(name):
  if name in needed or name not in ctes:return
  needed.add(name)
  for t in ctes[name].this.find_all(exp.Table):retain(t.name)
 retain('aligned');root.set('with_',exp.With(expressions=[v for k,v in ctes.items() if k in needed]));root=pushdown_projections(root)
 # Dictionaries are only needed where the selected target has no category.
 # Both dictionary adapters already collapse to one row per SKU. Remove the
 # unused product-list join and limit fallback lookups to that exact key set.
 adapters={x.alias_or_name:x for x in root.args['with_'].expressions}
 aligned=adapters['aligned'].this
 aligned.set('joins',[j for j in aligned.args.get('joins',[]) if not any(t.name=='product_list_dictionary' for t in j.find_all(exp.Table))])
 adapters.pop('product_list_dictionary',None)
 missing=sqlglot.parse_one("SELECT k.sku AS sku FROM inventory_keys AS k LEFT JOIN targets AS t ON t.base=k.base AND t.sku=k.sku WHERE t.product_categ_name IS NULL GROUP BY k.sku",read='postgres')
 adapters['missing_categories']=exp.CTE(this=missing,alias=exp.TableAlias(this=exp.to_identifier('missing_categories')))
 for name,column in [('order_material_dictionary','new_material_code'),('movement_material_dictionary','material_code')]:
  adapters[name].this.where(f't.{column} IN (SELECT m.sku AS sku FROM missing_categories AS m)',copy=False)
 ordered=[];visited=set()
 def order(name):
  if name not in adapters or name in visited:return
  visited.add(name)
  for t in adapters[name].this.find_all(exp.Table):order(t.name)
  ordered.append(adapters[name])
 order('aligned');root.set('with_',exp.With(expressions=ordered))
 # Optimizer-created internal constants still need explicit unique aliases.
 for select in root.find_all(exp.Select):
  for i,e in enumerate(list(select.expressions)):
   if not isinstance(e,exp.Alias):select.expressions[i]=exp.alias_(e.copy(),'constant_'+str(i),quoted=False)
 sql=re.sub(r'%\((gea_p\d+)\)s',r':\1',root.sql(dialect='postgres')); sql+=f" LIMIT :{aliases['page_size']} OFFSET :{aliases['offset']}";names=set(re.findall(r':(gea_p\d+)',sql));spec={k:v for k,v in source['parameterSpec'].items() if k in names};assert set(spec)==names
 id='page.inventory-groups' if agent=='aqkc' else 'overview.inventory'
 c['queries'][id]={'title':'首屏库存数量','priority':20,'notes':'同一库存、版本、基地、SKU去重与品类排除规则；只先发布库存，目标、周转和货龄保持独立读取。','parameterSpec':spec,'request':{'sql':sql,'parameters':{k:source['request']['parameters'][k] for k in spec},'includeTotal':False},'resultColumns':root.named_selects,'pagination':{'countQuery':id+'.count'}}
 count_root=root.copy();count_root.set('order',None);withs=count_root.args.pop('with_');sub=count_root.subquery('groups');count=exp.select(exp.alias_(exp.Count(this=exp.Star()),'total')).from_(sub);count.set('with_',withs);count_sql=re.sub(r'%\((gea_p\d+)\)s',r':\1',count.sql(dialect='postgres'));count_names=set(re.findall(r':(gea_p\d+)',count_sql));c['queries'][id+'.count']={'title':'首屏库存分组计数','parameterSpec':{k:v for k,v in spec.items() if k in count_names},'request':{'sql':count_sql,'parameters':{k:source['request']['parameters'][k] for k in count_names},'includeTotal':False},'resultColumns':['total']}
 if agent=='apsplan':
  c.setdefault('workspaceQuickBindings',{})['stock']={'queryId':id,'keyFields':['base','category'],'overrides':{},'pageSize':200,'singlePageFirst':True}
 p.write_text(json.dumps(c,ensure_ascii=False,indent=2)+'\n')
