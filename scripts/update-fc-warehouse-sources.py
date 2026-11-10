"""Use published warehouse SKU totals and execution piece quantities in FC source SQL.

Snapshot queries intentionally retain their materialized contract. The companion ETL
migration must be installed with this change; no per-user execution scan is introduced.
"""
from pathlib import Path
import json, re
import sqlglot
from sqlglot import exp
from sqlglot.optimizer.eliminate_ctes import eliminate_ctes
ROOT=Path(__file__).resolve().parents[1]
TOTAL='agents_scm_warehouse_total_data_d'
EXEC='agents_dwd_scm_execute_detail_mi'
def parse(sql): return sqlglot.parse_one(sql)
def expr(sql): return parse('SELECT '+sql).expressions[0]
def render(tree): return tree.sql().replace(' AS TEXT)', ' AS VARCHAR)')
def unique_total():
    columns=['warehouse_name','material_name','live_qty','available_qty','pack_unit_qty','freeze_qty','warehouse_transfer_qty','transfer_onway_qty','transfer_prepare_qty']
    return 'SELECT t.warehouseid AS warehouseid,t.material_code AS material_code,'+','.join('CASE WHEN COUNT(*)=1 THEN MAX(t.'+c+') END AS '+c for c in columns)+' FROM '+TOTAL+' AS t WHERE NULLIF(TRIM(t.warehouseid),\'\') IS NOT NULL AND NULLIF(TRIM(t.material_code),\'\') IS NOT NULL GROUP BY t.warehouseid,t.material_code'
def scope(date):
    return "SELECT i.warehouseid AS warehouseid FROM agents_scm_inventory_sku_data_d AS i WHERE i.month_date=REPLACE(CAST("+date+" AS VARCHAR(10)),'-','') AND i.warehouse_classify='20' AND i.warehouseid NOT IN ('N436','Y204') GROUP BY i.warehouseid"
def replace_current(tree, etl=False, prune=True):
    changed=False
    for c in list(tree.find_all(exp.CTE)):
        name=c.alias
        if name=='customer_execution':
            # Names remain metadata only. Quantities/statuses come exclusively from the new fact.
            cols=['executeorderno','executeorderlineno','warehouseid','cust_order_no','cust_code','header_addtime','requireddeliverytime','qtyordered','qtyallocated','qtyshipped','bizunitconvertrate','prapare_order_status','bizflowstatus','detailstatus','order_close_time','wms_close_time','canceltime','dmscanceltime','order_type','adjust_order_qty','pack_unitqty','delivery_qty','organizationid','ownerid','material_code']
            c.set('this',parse('SELECT DISTINCT '+','.join('e.'+n+' AS '+n for n in cols)+",n.cust_name AS cust_name,COALESCE(t.material_name,n.material_name) AS material_name FROM "+EXEC+" AS e INNER JOIN customer_warehouses AS w ON e.warehouseid=w.warehouse_code LEFT JOIN ("+unique_total()+") AS t ON t.warehouseid=e.warehouseid AND t.material_code=e.material_code LEFT JOIN (SELECT o.executeorderno AS executeorderno,o.executeorderlineno AS executeorderlineno,CASE WHEN COUNT(DISTINCT o.cust_name)=1 THEN MAX(o.cust_name) END AS cust_name,CASE WHEN COUNT(DISTINCT o.material_name)=1 THEN MAX(o.material_name) END AS material_name FROM agents_scm_execute_detail_d AS o GROUP BY o.executeorderno,o.executeorderlineno) AS n ON n.executeorderno=e.executeorderno AND n.executeorderlineno=e.executeorderlineno WHERE NULLIF(TRIM(e.executeorderno),'') IS NOT NULL AND e.executeorderlineno IS NOT NULL"));changed=True
        elif name=='customer_execution_keys':
            for key in ['organizationid','ownerid']:
                c.this.select('e.'+key+' AS '+key,copy=False)
                c.this.group_by('e.'+key,copy=False)
            changed=True
        elif name=='customer_valid_lines':
            for j in c.this.args.get('joins',[]):
                if j.this.alias_or_name=='k':
                    j.set('on',exp.and_(j.args['on'],expr("COALESCE(e.organizationid,'')=COALESCE(k.organizationid,'') AND COALESCE(e.ownerid,'')=COALESCE(k.ownerid,'')")))
            for a in c.this.expressions:
                if a.alias=='demand':a.set('this',expr('e.adjust_order_qty'))
                if a.alias=='allocated':a.set('this',expr('e.pack_unitqty'))
                if a.alias=='shipped':a.set('this',expr('e.delivery_qty'))
            c.this.where('e.adjust_order_qty>=0 AND e.pack_unitqty>=0 AND e.delivery_qty>=0',copy=False);changed=True
        elif name=='customer_sku_stock':
            c.set('this',parse('SELECT t.warehouseid AS warehouse_code,t.material_code AS sku,t.available_qty AS available FROM ('+unique_total()+') AS t INNER JOIN customer_warehouses AS w ON w.warehouse_code=t.warehouseid'));changed=True
        elif name in ['customer_source_presence','fc_order_presence']:
            for t in c.this.find_all(exp.Table):
                if t.name=='agents_scm_execute_detail_d':t.set('this',exp.to_identifier(EXEC));changed=True
        elif name=='customer_execute_warehouse':
            for t in c.this.find_all(exp.Table):
                if t.name=='agents_scm_execute_detail_d':t.set('this',exp.to_identifier(EXEC));changed=True
        elif name=='transfer_reported':
            c.set('this',parse('SELECT p.warehouseid AS warehouse_code,p.material_code AS sku,w.warehouse_name AS warehouse_name,p.material_name AS material_name,p.transfer_prepare_qty AS preparing,p.transfer_onway_qty AS in_transit,p.warehouse_transfer_qty AS transfer_qty FROM ('+unique_total()+') AS p INNER JOIN transfer_receivers AS w ON p.warehouseid=w.warehouse_code'));changed=True
        elif name=='transfer_current_skus' and 'transfer_qty' not in c.this.named_selects:
            c.this.select('CASE WHEN COUNT(*)=1 THEN MAX(t.transfer_qty) END AS transfer_qty',copy=False);changed=True
        elif name in ['quantities','pools'] and 'total_qty' in c.this.named_selects and any(t.name=='agents_scm_inventory_sku_data_d' for t in c.this.find_all(exp.Table)):
            original=c.this.copy();quantities={'total_qty':'live_qty','available_qty':'available_qty','pack_unit_qty':'pack_unit_qty','freeze_qty':'freeze_qty'}
            projection=','.join(('t.'+quantities[n] if n in quantities else 'a.'+n)+' AS '+n for n in original.named_selects)
            c.set('this',parse('SELECT '+projection+' FROM ('+original.sql()+') AS a LEFT JOIN ('+unique_total()+') AS t ON t.warehouseid=a.warehouseid AND t.material_code=a.material_code'));changed=True
        elif name=='branch_stock':
            original=c.this.copy();date=':gea_p2200'
            for eq in original.find_all(exp.EQ):
                if isinstance(eq.this,exp.Column) and eq.this.name=='stat_date':date=eq.expression.sql();break
            if etl:date="(SELECT CAST(MAX(ctx.stock_date) AS DATE) AS stock_date FROM agents_inv_base_sku_day AS ctx WHERE ctx.inv_batch_id=@inv_batch_id AND ctx.inv_variant_id='__SYNC_CONTEXT__')"
            mapping={'total_qty':'live_qty','available_qty':'available_qty','pack_unit_qty':'pack_unit_qty','freeze_qty':'freeze_qty','warehouse_name':'warehouse_name','material_name':'material_name','warehouseid':'warehouseid','material_code':'material_code'}
            projections=[]
            for col in original.named_selects:
                value='t.'+mapping[col] if col in mapping else ('CAST('+date+' AS DATE)' if col=='stat_date' else 'a.'+col)
                projections.append(value+' AS '+col)
            c.set('this',parse('SELECT '+','.join(projections)+' FROM ('+unique_total()+') AS t INNER JOIN ('+scope(date)+') AS s ON s.warehouseid=t.warehouseid LEFT JOIN ('+original.sql()+') AS a ON a.warehouseid=t.warehouseid AND a.material_code=t.material_code'));changed=True
        elif name=='combined':
            for a in c.this.expressions:
                if a.alias=='open_transfer_reported_qty' and any(x.table=='tf' for x in a.find_all(exp.Column)):
                    a.set('this',expr('tf.transfer_qty'));changed=True
    return eliminate_ctes(tree) if changed and prune else tree

def replace_health_stock(tree):
    for c in list(tree.find_all(exp.CTE)):
        if c.alias not in ['batch_skus','inventory_batch_totals']:continue
        original=c.this.copy()
        if 'overaged_qty' not in original.named_selects:continue
        # Lot dates/aging stay in the lot source. Override only SKU quantities, once per key.
        for key in ['warehouseid','material_code']:
            if key not in original.named_selects:original.select('a.'+key+' AS '+key,copy=False)
        names=c.this.named_selects
        quantities={'total_qty':'live_qty','available_qty':'available_qty','pack_unit_qty':'pack_unit_qty','freeze_qty':'freeze_qty'}
        projection=','.join(('t.'+quantities[n] if n in quantities else 'a.'+n)+' AS '+n for n in names)
        c.set('this',parse('SELECT '+projection+' FROM ('+original.sql()+') AS a LEFT JOIN ('+unique_total()+') AS t ON t.warehouseid=a.warehouseid AND t.material_code=a.material_code'))
    return tree

def preserve_selected_age_quantities(tree, age_filter):
    # Warehouse totals have no batch age. An explicit age band must retain only
    # the selected lot quantities, not the SKU's inventory across every age.
    if not age_filter:return tree
    for c in tree.find_all(exp.CTE):
        if c.alias!='batch_skus':continue
        for a in c.this.expressions:
            if a.alias not in {'total_qty','available_qty','pack_unit_qty','freeze_qty'}:continue
            if isinstance(a.this,exp.Column) and a.this.table=='t':
                a.set('this',expr("CASE WHEN :"+age_filter+"='' THEN "+a.this.sql()+" ELSE a."+a.alias+" END"))
    return tree

def preserve_parameters(q,tree):
    # Changing a source may make a calendar binding redundant; keep the public query contract.
    used=set(re.findall(r':(gea_p\d+)',tree.sql()))
    missing=set(q.get('parameterSpec',{}))-used
    if missing:
        cols=[("CASE WHEN '' IN (:"+k+") THEN 1 ELSE 0 END" if q['parameterSpec'][k]['type']=='array' else ':'+k)+' AS bind_'+k for k in sorted(missing)]
        w=tree.args.get('with_')
        if w is None:w=exp.With(expressions=[]);tree.set('with_',w)
        w.expressions.append(exp.CTE(this=parse('SELECT '+','.join(cols)),alias=exp.TableAlias(this=exp.to_identifier('warehouse_source_parameters'))))
    return tree

def write_config(path,data):
    # Preserve the repository JSON formatting; only replace changed SQL literals.
    text=path.read_text();before=json.loads(text);changes={}
    if isinstance(data,dict):
        pairs=[(before['queries'][k]['request']['sql'],q['request']['sql']) for k,q in data['queries'].items()]
        for key,q in data['queries'].items():
            old=before['queries'][key].get('notes');new=q.get('notes')
            if old is not None and new!=old:
                start=text.index('    '+json.dumps(key)+': {')
                token=json.dumps(old,ensure_ascii=False);at=text.index(token,start)
                text=text[:at]+json.dumps(new,ensure_ascii=False)+text[at+len(token):]
    else:
        pairs=[(a['sourceSql'],b['sourceSql']) for a,b in zip(before,data)]
    for old,new in pairs:
        if old!=new:
            assert old not in changes or changes[old]==new
            changes[old]=new
    for old,new in changes.items():
        token=json.dumps(old,ensure_ascii=False)
        assert token in text
        text=text.replace(token,json.dumps(new,ensure_ascii=False))
    if isinstance(data,dict):
        extra={k:v for k,v in data['replenishmentPolicy'].items() if k not in before['replenishmentPolicy']}
        if extra:
            text=text.replace('"replenishmentPolicy": {','"replenishmentPolicy": {\n'+''.join('    '+json.dumps(k)+': '+json.dumps(v,ensure_ascii=False)+',\n' for k,v in extra.items()).rstrip('\n'),1)
    assert json.loads(text)==data
    path.write_text(text)

def main():
    path=ROOT/'business/inventory-fc/sql.config.json';cfg=json.loads(path.read_text());changed=[]
    for key,q in cfg['queries'].items():
        if key.startswith(('snapshot','summary.','transfer_plan.')):continue
        before=q['request']['sql']
        age_filter=next((p for p,spec in q.get('parameterSpec',{}).items() if spec['name']=='age_filter'),None)
        if 'fc-warehouse-sources:20261110' in before:
            tree=preserve_selected_age_quantities(parse(before),age_filter)
            if tree.sql()!=parse(before).sql():
                q['request']['sql']=render(tree);changed.append(key)
            continue
        tree=replace_current(parse(before))
        if key.startswith(('health.','batch-age.')):tree=preserve_selected_age_quantities(replace_health_stock(tree),age_filter)
        if tree.sql()!=parse(before).sql():
            q['request']['sql']='/* fc-warehouse-sources:20261110 */ '+render(preserve_parameters(q,tree));changed.append(key)
    old_transfer='当前调拨在途与备单按本月分仓计划登记值统计，分别采用transfer_onway_qty和transfer_prepare_qty，单位件；不从历史执行单累计反推。同仓SKU重复一致值取一次，冲突、缺失和负值逐字段保持未知，正常记录继续统计。'
    for key,q in cfg['queries'].items():
        if 'fc-warehouse-sources:20261110' not in q['request']['sql'] or 'notes' not in q:continue
        note=q['notes'].replace(old_transfer,'当前调拨在途、备单和调拨中量取分仓总量表对应字段，单位件，不从历史执行单累计反推。')
        if key.startswith('replenishment') and note.startswith('分仓向基地下单以ASN调拨入库为主体'):
            note='当前需求来自分仓下游有效未完成客户订单；按仓库和SKU扣减一次可用库存计算缺口，ASN不计入客户订单。'+note.split('缺失或冲突保持未知。',1)[-1]
        if '2026-11-10新来源' not in note:
            if TOTAL in q['request']['sql']:note+=' 2026-11-10新来源：当前库存及调拨数量读取agents_scm_warehouse_total_data_d；货龄批次、月度计划保持各自原来源。'
            elif EXEC in q['request']['sql']:note+=' 2026-11-10新来源：客户执行单与发货仓关联读取agents_dwd_scm_execute_detail_mi。'
        q['notes']=note
    cfg['replenishmentPolicy']['stockQuantitySource']=TOTAL
    cfg['replenishmentPolicy']['customerDemandSource']=EXEC+'.adjust_order_qty'
    cfg['replenishmentPolicy']['transferQuantitySource']=TOTAL
    cfg['replenishmentPolicy']['transferQuantityUnit']='件'
    cfg['replenishmentPolicy']['sourceMigration']='warehouse-totals-20261110; deploy matching V18 ETL before enabling changed sources'
    write_config(path,cfg)
    for name in ['customer-orders-source.sql','transfer-current-source.sql']:
        p=ROOT/'business/inventory-fc'/name
        if 'fc-warehouse-sources:20261110' not in p.read_text():p.write_text('/* fc-warehouse-sources:20261110 */ '+render(replace_current(parse(p.read_text()),prune=False))+'\n')
    p=ROOT/'business/inventory-fc/customer-order-materializations.json';jobs=json.loads(p.read_text())
    for j in jobs:
        if 'fc-warehouse-sources:20261110' not in j['sourceSql']:j['sourceSql']='/* fc-warehouse-sources:20261110 */ '+render(preserve_parameters({'parameterSpec':j['parameterSpec']},replace_current(parse(j['sourceSql']))))
    write_config(p,jobs)
    print(json.dumps({'changed_queries':changed},ensure_ascii=False))
if __name__=='__main__':main()
