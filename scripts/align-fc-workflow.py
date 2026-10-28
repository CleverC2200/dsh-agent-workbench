"""Align FC calculation with gea-agent-fc order-net-gap-v3 using published inputs only."""
import json,re
from pathlib import Path
import sqlglot
from sqlglot import exp
ROOT = Path(__file__).resolve().parents[1]
path = ROOT / 'business/inventory-fc/sql.config.json'
config = json.loads(path.read_text())

def render(tree):
    # GEA accepts positional SUBSTRING arguments, not SQLGlot's FROM/FOR attributes.
    for node in list(tree.find_all(exp.Substring)):
        args = [node.this.copy()]
        for name in ('start', 'length'):
            if node.args.get(name) is not None:
                args.append(node.args[name].copy())
        node.replace(exp.Anonymous(this='SUBSTRING', expressions=args))
    return re.sub(r'%\((gea_p\d+)\)s', r':\1', tree.sql(dialect='postgres'))

def expression(sql):
    return sqlglot.parse_one('SELECT ' + sql, read='postgres').expressions[0]

def replace(select, changes):
    select.set('expressions', [expression(changes[e.alias] + ' AS ' + e.alias) if e.alias in changes else e for e in select.expressions])

for key, query in config['queries'].items():
    if not key.startswith(('replenishment.', 'replenishment-suggestions.')):
        continue
    tree = sqlglot.parse_one(query['request']['sql'], read='postgres')
    ctes = {cte.alias: cte for cte in tree.ctes}
    if 'fc_net_input' in ctes:
        continue
    if 'measured' not in ctes:
        continue
    for param, name, value, minimum, maximum in [
        ('gea_p2702', 'next_days_in_month', 30, 28, 31),
        ('gea_p2800', 'days_remaining_in_month', 5, 0, 30),
    ]:
        query['parameterSpec'][param] = {'name': name, 'type': 'integer', 'minimum': minimum, 'maximum': maximum, 'nullable': False, 'required': True}
        query['request']['parameters'][param] = value
    query['parameterSpec']['gea_p2801'] = {'name':'as_of','type':'string','format':'YYYY-MM-DD','nullable':False,'required':True}
    query['request']['parameters']['gea_p2801'] = '2026-10-26'
    cases=[]
    for index in range(12):
        slots={field:f'gea_p{2900+index*5+n}' for n,field in enumerate(['level','object','days','from','to'])}
        for field,param in slots.items():
            spec={'name':f'fc_cycle_{index}_{field}','type':'integer' if field=='days' else 'string','nullable':False,'required':True}
            if field=='days':spec.update(minimum=1,maximum=365)
            query['parameterSpec'][param]=spec
            query['request']['parameters'][param]=7 if field=='days' else ''
        obj=':'+slots['object'];level=':'+slots['level']
        match=f"(({level}='sku' AND {obj}=r.sku) OR ({level}='material-group' AND {obj}=r.material_group) OR ({level}='category' AND {obj}=r.category) OR ({level}='warehouse' AND {obj}=r.warehouse_code))"
        cases.append(f"WHEN {match} AND (:{slots['from']}='' OR :{slots['from']}<=:gea_p2801) AND (:{slots['to']}='' OR :{slots['to']}>=:gea_p2801) THEN :{slots['days']}")
    cycle='CASE '+' '.join(cases)+' ELSE :gea_p2303 END'
    combined = ctes['combined'].this
    replace(combined, {
        'inventory_qty': 'h.total_qty', 'available_qty': 'h.available_qty',
        'open_transfer_reported_qty': 'CASE WHEN s.warehouse_transfer_qty >= 0 THEN s.warehouse_transfer_qty WHEN s.warehouse_transfer_qty IS NULL AND s.transfer_onway_qty >= 0 AND s.transfer_prepare_qty >= 0 THEN s.transfer_onway_qty + s.transfer_prepare_qty ELSE NULL END',
    })
    # Source batch sums must not conceal missing quantity within an otherwise populated SKU.
    for select in tree.find_all(exp.Select):
        for e in list(select.expressions):
            if e.alias in ('available_qty', 'total_qty') and isinstance(e.this, exp.Sum):
                raw = e.this.this.sql(dialect='postgres')
                e.replace(expression(f'CASE WHEN COUNT({raw})=COUNT(*) THEN SUM({raw}) ELSE NULL END AS {e.alias}'))
    names = [e.alias for e in combined.expressions]
    projection = ', '.join('r.'+n+' AS '+n for n in names)
    daily = 'CASE WHEN r.plan_calculable=1 THEN CEIL(r.month_out_plan/CAST(:gea_p2301 AS DECIMAL(20,6))) ELSE NULL END'
    next_daily = 'CASE WHEN r.future30_qty>=0 THEN CEIL(r.future30_qty/CAST(:gea_p2702 AS DECIMAL(20,6))) ELSE NULL END'
    remaining = "CASE WHEN op.source_order_count=0 OR co.invalid_sku<>0 OR r.stock_date IS NULL OR REPLACE(CAST(r.stock_date AS VARCHAR(10)),'-','')<>li.month_date THEN NULL ELSE COALESCE(co.remaining_qty,0) END"
    inputs = sqlglot.parse_one(f'''WITH fc_net_input AS (
        SELECT {projection}, {daily} AS fc_daily, {next_daily} AS fc_next_daily,
        {remaining} AS fc_remaining_orders, {cycle} AS fc_cycle
        FROM combined AS r
        LEFT JOIN fc_current_orders AS co ON co.location_type='分仓' AND co.warehouseid=r.warehouse_code AND co.material_code=r.sku
        CROSS JOIN fc_order_presence AS op CROSS JOIN latest_inventory AS li
    ) SELECT 1 AS one''', read='postgres').ctes[0]
    all_ctes = list(tree.ctes);all_ctes.insert(all_ctes.index(ctes['measured']), inputs)
    tree.args['with_'].set('expressions', all_ctes)
    measured = ctes['measured'].this
    measured.set('from_', exp.From(this=exp.to_table('fc_net_input').as_('r')))
    net = '(r.available_qty-r.fc_remaining_orders)'
    target = '(r.fc_daily*(r.fc_cycle+CAST(:gea_p2304 AS INT)))'
    forecast = 'CASE WHEN (:gea_p2800>0 AND r.fc_daily IS NULL) OR (30-:gea_p2800>0 AND r.fc_next_daily IS NULL) THEN NULL ELSE CEIL((COALESCE(r.fc_daily,0)*:gea_p2800+COALESCE(r.fc_next_daily,0)*(30-:gea_p2800))/30.0) END'
    recommendation = f'CASE WHEN r.fc_daily IS NULL OR r.available_qty IS NULL OR r.available_qty<0 OR r.fc_remaining_orders IS NULL OR r.open_transfer_reported_qty IS NULL THEN NULL WHEN {target}-{net}-r.open_transfer_reported_qty>0 THEN CEIL({target}-{net}-r.open_transfer_reported_qty) ELSE 0 END'
    replace(measured, {
        'cycle_days': 'r.fc_cycle',
        'safety_days': 'r.fc_cycle+CAST(:gea_p2304 AS INT)',
        'daily_plan': forecast,
        'calculation_daily': 'r.fc_daily', 'planned_daily_shipment': 'r.fc_daily',
        'calculation_status': "CASE WHEN r.fc_daily IS NULL THEN '本月计划待核实' WHEN r.available_qty IS NULL OR r.available_qty<0 THEN '可用库存待核实' WHEN r.fc_remaining_orders IS NULL THEN '订单剩余需求或快照待核实' WHEN r.open_transfer_reported_qty IS NULL THEN '调拨中量待核实' ELSE '原版净需求补货' END",
        'target_inventory_qty': target, 'recommended_qty': recommendation,
        'urgent': f'CASE WHEN r.available_qty IS NULL OR r.fc_remaining_orders IS NULL THEN NULL WHEN {net}<0 THEN 1 ELSE 0 END',
        'forecast_turnover_days': f'r.inventory_qty/NULLIF(({forecast}),0)',
        'target_gap_qty': f'CASE WHEN ({forecast}) IS NULL OR r.available_qty IS NULL THEN NULL WHEN (r.fc_cycle+CAST(:gea_p2304 AS INT))*({forecast})-r.available_qty>0 THEN (r.fc_cycle+CAST(:gea_p2304 AS INT))*({forecast})-r.available_qty ELSE 0 END',
        'remaining_outbound_qty': 'CASE WHEN r.plan_calculable<>1 THEN NULL WHEN r.month_out_plan=0 THEN 0 WHEN r.month_ship_positive IS NULL THEN NULL WHEN r.month_out_plan>r.month_ship_positive THEN r.month_out_plan-r.month_ship_positive ELSE 0 END',
    })
    for select in tree.find_all(exp.Select):
        replace(select, {
            'period_current_daily': 'CASE WHEN pp.current_count=1 AND pp.current_out>=0 THEN CEIL(pp.current_out/CAST(:gea_p2301 AS DECIMAL(20,6))) ELSE NULL END',
            'period_next_daily': 'CASE WHEN pp.next_count=1 AND pp.next_out>=0 THEN CEIL(pp.next_out/CAST(:gea_p2702 AS DECIMAL(20,6))) ELSE NULL END',
        }) if any(e.alias=='period_current_daily' and not isinstance(e.this, exp.Column) for e in select.expressions) else None
    measured.select(expression('r.fc_remaining_orders AS calculation_order_remaining'), append=True, copy=False)
    for select in tree.find_all(exp.Select):
        if select is measured:
            continue
        column = next((e.this for e in select.expressions if e.alias == 'recommended_qty' and isinstance(e.this, exp.Column)), None)
        if column is not None:
            select.select(expression(column.table + '.calculation_order_remaining AS calculation_order_remaining'), append=True, copy=False)
    if 'detail' in key:
        query['resultColumns'].append('calculation_order_remaining')
    if key == 'replenishment.summary':
        replace(tree, {name: f'CASE WHEN COUNT(r.{name})=COUNT(*) THEN SUM(r.{name}) ELSE NULL END' for name in ['recommended_qty','remaining_outbound_qty','target_inventory_qty','calculation_daily','target_gap_qty']})
        tree.select(expression('COUNT(*)-COUNT(r.recommended_qty) AS missing_calculation_count'), append=True, copy=False)
        tree.select(expression('CASE WHEN COUNT(r.daily_plan)=COUNT(*) AND COUNT(r.inventory_qty)=COUNT(*) THEN SUM(r.inventory_qty)/NULLIF(SUM(r.daily_plan),0) ELSE NULL END AS forecast_turnover_days'), append=True, copy=False)
        query['resultColumns'] += ['missing_calculation_count','forecast_turnover_days']
    query['request']['sql'] = render(tree)
    query['notes'] = '原版order-net-gap-v3：自然月计划日均向上取整；有效订单需求减订单自身占用后的剩余量扣减一次可用库存；目标缺口减当前调拨中量后向上取整。无计划/未知输入不生成建议；未来30日从明日开始跨自然月，展望周转=现库存/展望日均。保留当前11状态及仓库映射；当前订单与历史库存快照不混算。'
# Keep newly published source metrics across the added net-demand CTE.
for key, query in config['queries'].items():
    if not key.startswith(('replenishment', 'transfer_plan')) or 'last_month_actual_qty' not in query['resultColumns']:
        continue
    tree = sqlglot.parse_one(query['request']['sql'], read='postgres')
    aliases = {'source_records': 't', 'combined': 's', 'business_rows': 's',
               'fc_net_input': 'r', 'measured': 'r', 'filtered': 'r', 'page_rows': 'r'}
    for cte in tree.ctes:
        select = cte.this
        if cte.alias not in aliases or not isinstance(select, exp.Select):
            continue
        names = {item.alias_or_name for item in select.expressions}
        for field in ('last_month_actual_qty', 'current_day_avg_qty'):
            if field in names:
                continue
            value = (f'CASE WHEN COUNT(*)=1 THEN MAX(t.{field}) ELSE NULL END'
                     if cte.alias == 'source_records' else f'{aliases[cte.alias]}.{field}')
            select.select(expression(f'{value} AS {field}'), append=True, copy=False)
    query['request']['sql'] = render(tree)
# Also repair already-aligned queries skipped by the net-demand migration above.
for key, query in config['queries'].items():
    if key.startswith(('replenishment', 'transfer_plan')) and ' FOR ' in query['request']['sql']:
        query['request']['sql'] = render(sqlglot.parse_one(query['request']['sql'], read='postgres'))
config['replenishmentPolicy']['fallbackDemandBasis'] = '历史动销仅用于回顾周转；本月计划未知时补货建议待核实'
for view in config['sourceViews']['views']:
    if view['id']=='replenishment':
        view['description']='沿gea-agent-fc净需求口径：计划日均向上取整，订单未占用需求扣净后计算目标缺口，再扣调拨中量。未知输入不按0；人工计划按分仓月份整包覆盖。'
        for c in view['columns']:
            if c['field']=='missing_preparingQty':c['label']='当前未备单需求'
            if c['field']=='preparing':c['label']='当前调拨备单'
            if c['field']=='in_transit':c['label']='当前调拨在途'
            if c['field']=='safety_days':c['label']='目标覆盖天数'
path.write_text(json.dumps(config,ensure_ascii=False,indent=2)+'\n')
print('FC net calculation aligned; no other agent configuration changed')
