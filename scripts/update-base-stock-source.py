"""Align base inventory cards and drills with the batch snapshot used for aging."""
import copy
import importlib.util
import json
from pathlib import Path

import sqlglot
from sqlglot import exp

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('age_update', ROOT / 'scripts/update-inventory-weighted-age.py')
age = importlib.util.module_from_spec(spec)
spec.loader.exec_module(age)


def update(config):
    queries = config['queries']
    # The inventory calendar is the batch calendar; target calendars stay independent.
    calendar = copy.deepcopy(queries['source.health-date'])
    old = queries['source.stock-date']
    calendar['parameterSpec'] = old['parameterSpec']
    calendar['request']['parameters'] = old['request']['parameters']
    calendar['request']['sql'] = calendar['request']['sql'].replace(':gea_p1', ':gea_p2')
    calendar['request']['sql'] = calendar['request']['sql'].replace(
        "b.month_date <=", "b.month_date >= REPLACE(CAST(:gea_p1 AS VARCHAR(10)), '-', '') AND b.month_date <=")
    queries['source.stock-date'] = calendar
    batch = sqlglot.parse_one(queries['batch-age.groups']['request']['sql'], read='postgres')
    prefix = [c.copy() for c in batch.ctes if c.alias in ['inventory_batch_dates', 'inventory_batch_ordinals', 'inventory_batch_ages']]
    for key, query in queries.items():
        if 'stock_source AS' not in query['request']['sql'] or 'base_batch_stock AS' in query['request']['sql']:
            continue
        tree = sqlglot.parse_one(query['request']['sql'], read='postgres')
        for cte in list(tree.find_all(exp.CTE)):
            if cte.alias != 'stock_source':
                continue
            select = cte.this
            names = [e.alias for e in select.expressions]
            parent = cte.parent
            date_param = next(k for k, v in query['parameterSpec'].items() if v['name'] == 'stock_date')
            local_prefix = [c.copy() for c in prefix]
            dates = next(c.this for c in local_prefix if c.alias == 'inventory_batch_dates')
            dates.set('where', exp.Where(this=sqlglot.parse_one(
                f"b.warehouse_classify IN ('01', '02') AND b.month_date = REPLACE(CAST(:{date_param} AS VARCHAR(10)), '-', '')", read='postgres')))
            base_stock = sqlglot.parse_one(f"""SELECT a.belong_base AS belong_base, a.material_code AS material_code,
                CASE WHEN COUNT(DISTINCT NULLIF(TRIM(a.material_name), ''))=1 THEN MAX(NULLIF(TRIM(a.material_name), '')) ELSE NULL END AS material_name,
                SUM(a.live_qty) AS current_stock, SUM(a.available_qty) AS available_stock,
                SUM(a.pack_unit_qty) AS allocated_qty,
                SUM(CASE WHEN a.age_days>60 THEN a.live_qty ELSE 0 END) AS current_stock_60,
                COUNT(*) AS batch_rows FROM inventory_batch_ages AS a
                GROUP BY a.belong_base, a.material_code""", read='postgres')
            additions = local_prefix + [exp.CTE(this=base_stock, alias=exp.TableAlias(this=exp.to_identifier('base_batch_stock')))]
            # Daily movement/descriptive fields can use their own latest earlier daily
            # snapshot. They never replace physical stock or determine its key set.
            physical = {'belong_base', 'material_code', 'material_name', 'current_stock', 'available_stock', 'allocated_qty', 'current_stock_60'}
            aux = [e.copy() for e in select.expressions if e.alias not in physical | {'source_rows', 'the_date', 'data_month'}]
            if aux:
                legacy = select.copy()
                legacy.set('expressions', [sqlglot.parse_one('t.belong_base AS belong_base'), sqlglot.parse_one('t.material_code AS material_code')] + aux)
                latest = sqlglot.parse_one(f"SELECT MAX(s.the_date) AS day FROM agents_scm_stock_detail_d AS s WHERE s.the_date <= :{date_param}", read='postgres')
                legacy.set('where', exp.Where(this=sqlglot.parse_one('t.the_date = d.day', read='postgres')))
                legacy.join('base_daily_date AS d', join_type='CROSS', copy=False)
                legacy.set('group', sqlglot.parse_one('SELECT 1 GROUP BY t.belong_base, t.material_code', read='postgres').args['group'])
                additions += [exp.CTE(this=latest, alias=exp.TableAlias(this=exp.to_identifier('base_daily_date'))), exp.CTE(this=legacy, alias=exp.TableAlias(this=exp.to_identifier('base_daily_attributes')))]
            expressions=[]
            for name in names:
                value = f'b.{name}' if name in physical else '1' if name == 'source_rows' else f':{date_param}' if name == 'the_date' else f"CAST(CONCAT(SUBSTRING(CAST(:{date_param} AS VARCHAR(10)), 1, 7), '-01') AS DATE)" if name == 'data_month' else f'd.{name}'
                expressions.append(f'{value} AS {name}')
            new = sqlglot.parse_one('SELECT '+', '.join(expressions)+' FROM base_batch_stock AS b', read='postgres')
            if aux:
                new.join('base_daily_attributes AS d', on='b.belong_base=d.belong_base AND b.material_code=d.material_code', join_type='LEFT', copy=False)
            cte.set('this', new)
            index = parent.expressions.index(cte)
            parent.expressions[index:index] = additions
        sql = age.render(tree)
        # Keep old named input contracts even when a source no longer consumes stock_month.
        for param in query['parameterSpec']:
            if f':{param}' not in sql:
                tree.where(f':{param} IS NULL OR :{param} IS NOT NULL', append=True, copy=False)
        query['request']['sql'] = age.render(tree)
    for key in ['batch-age.groups', 'batch-age.atomic']:
        query = queries[key]
        tree = sqlglot.parse_one(query['request']['sql'], read='postgres')
        ctes = {c.alias: c.this for c in tree.find_all(exp.CTE)}
        age.project(ctes['batch_skus'], ['SUM(CASE WHEN a.live_qty<0 THEN a.live_qty ELSE 0 END) AS negative_qty'])
        age.project(ctes['batch_facts'], ['b.negative_qty AS negative_qty'])
        age.project(ctes['batch_groups'], ['SUM(b.negative_qty) AS negative_qty'])
        # Atomic pages wrap batch_groups; propagate the additive measure through each layer.
        for select in list(tree.find_all(exp.Select)):
            if select in list(ctes.values()):
                continue
            source = select.args.get('from') or select.args.get('from_')
            if source and isinstance(source.this, exp.Table) and source.this.name == 'batch_groups':
                age.project(select, [f'{source.this.alias_or_name}.negative_qty AS negative_qty'])
        if key.endswith('.atomic'):
            for name, select in ctes.items():
                if name not in ['batch_skus','batch_facts','batch_groups'] and any(e.alias=='total_qty' for e in select.expressions):
                    source=(select.args.get('from') or select.args.get('from_')).this
                    age.project(select,[f'{source.alias_or_name}.negative_qty AS negative_qty'])
            alias = next(j.this.alias_or_name for j in tree.args['joins'] if j.this.name == 'batch_page')
            age.project(tree,[f'{alias}.negative_qty AS negative_qty'])
        query['request']['sql'] = age.render(tree)
        query['resultColumns'] = tree.named_selects

    view = next(v for v in config['sourceViews']['views'] if v['id'] == 'age-structure')
    for field, label in [('unknown_age_qty', '未计龄库存'), ('negative_qty', '负库存调整')]:
        if not any(c['field'] == field for c in view['columns']):
            view['columns'].append({'field': field, 'label': label, 'format': 'decimal2'})


if __name__ == '__main__':
    path = ROOT / 'business/inventory-aqkc/sql.config.json'
    config = json.loads(path.read_text())
    update(config)
    path.write_text(json.dumps(config, ensure_ascii=False, indent=2)+'\n')
