import copy
import json
import re
from pathlib import Path

import sqlglot
from sqlglot import exp
from sqlglot.optimizer.scope import Scope, traverse_scope

BASE_WAREHOUSES = ['Y204', 'N436', 'A221']
MARKER = 'fc-base-warehouses:Y204,N436,A221'


def base_scope(sql, parameter):
    if MARKER in sql:
        return sql
    tree = sqlglot.parse_one(sql, read='postgres')
    changed = False
    for scope in traverse_scope(tree) or []:
        for predicate in list(scope.expression.find_all(exp.EQ)):
            if predicate.find_ancestor(exp.Select) is not scope.expression:
                continue
            column = predicate.this
            value = predicate.expression
            if isinstance(column, exp.Column) and isinstance(value, exp.Literal) and value.this == '分仓':
                mapped = 'cw' if column.name == 'pickup_type' else 'e' if column.name == 'pick_point_type2' else None
                source = scope.sources.get(mapped)
                if isinstance(source, Scope) and 'warehouse_code' in source.expression.named_selects:
                    condition = f"{mapped}.warehouse_code = :{parameter}" if mapped == 'cw' else f"{mapped}.warehouse_code IS NOT NULL"
                    predicate.replace(sqlglot.parse_one(condition, read='postgres'))
                    changed = True
                    continue
            if not isinstance(column, exp.Column) or column.name != 'warehouse_classify':
                continue
            if not isinstance(value, exp.Literal) or value.this != '20':
                continue
            source = scope.sources.get(column.table)
            if isinstance(source, exp.Table):
                field = 'warehouse' if source.name == 'agents_scm_cust_deliv_daily_di' else 'warehouseid'
            elif isinstance(source, Scope):
                field = next((f for f in ['warehouseid', 'warehouse', 'warehouse_code'] if f in source.expression.named_selects), None)
                if not field:
                    raise ValueError('Classified source has no warehouse key')
            else:
                continue
            key = (column.table + '.' if column.table else '') + field
            predicate.replace(sqlglot.parse_one(f"{key} = :{parameter}", read='postgres'))
            changed = True
        for exclusion in list(scope.expression.find_all(exp.Not)):
            if exclusion.find_ancestor(exp.Select) is not scope.expression:
                continue
            inner = exclusion.this
            if not isinstance(inner, exp.In) or not isinstance(inner.this, exp.Column):
                continue
            codes = {n.this for n in inner.expressions if isinstance(n, exp.Literal)}
            if not {'N436', 'Y204'}.issubset(codes):
                continue
            key = inner.this.sql()
            exclusion.replace(sqlglot.parse_one(f"{key} = :{parameter}", read='postgres'))
            changed = True
    if not changed:
        return sql
    for node in list(tree.find_all(exp.Substring)):
        args = [node.this.copy(), node.args['start'].copy()]
        if node.args.get('length'):
            args.append(node.args['length'].copy())
        node.replace(exp.Anonymous(this='SUBSTRING', expressions=args))
    rendered = re.sub(r'%\((gea_p\d+)\)s', r':\1', tree.sql(dialect='postgres'))
    return f'/* {MARKER} */\n' + rendered.replace(' AS DOUBLE PRECISION)', ' AS DOUBLE)')


def base_order_scope(sql, parameter):
    tree = sqlglot.parse_one(sql, read='postgres')
    for source in list(tree.find_all(exp.CTE)):
        if source.alias != 'source_records':
            continue
        owner = source.parent
        if not isinstance(owner, exp.With):
            continue
        siblings = {cte.alias: cte.this for cte in owner.expressions}
        if not all(name in siblings for name in ['projected', 'order_grouped', 'business_rows']):
            continue
        mapping = sqlglot.parse_one("SELECT e.executeorderno AS execute_order, e.material_code AS sku, CASE WHEN COUNT(DISTINCT NULLIF(TRIM(e.warehouseid), '')) = 1 THEN MAX(NULLIF(TRIM(e.warehouseid), '')) END AS warehouse_code FROM agents_dwd_scm_execute_detail_mi AS e GROUP BY e.executeorderno, e.material_code", read='postgres')
        owner.set('expressions', [exp.CTE(this=mapping, alias=exp.TableAlias(this=exp.to_identifier('base_order_warehouse'))), *owner.expressions])
        records = source.this
        records.join('base_order_warehouse AS ow', on='ow.execute_order = t.executeorderno AND ow.sku = t.new_material_code', join_type='INNER', copy=False)
        records.select('ow.warehouse_code AS warehouse_code', append=True, copy=False)
        records.args['group'].append('expressions', exp.column('warehouse_code', table='ow'))
        records.where(f'ow.warehouse_code = :{parameter}', copy=False)
        siblings['projected'].select('t.warehouse_code AS warehouse_code', append=True, copy=False)
        siblings['order_grouped'].select('d.warehouse_code AS warehouse_code', append=True, copy=False)
        siblings['order_grouped'].args['group'].append('expressions', exp.column('warehouse_code', table='d'))
        business = siblings['business_rows']
        business.set('joins', [join for join in business.args.get('joins', []) if join.this.alias != 'cw'])
        business.set('where', exp.Where(this=sqlglot.parse_one(f'd.warehouse_code = :{parameter}', read='postgres')))
        for projection in business.expressions:
            if projection.alias_or_name == 'warehouse_code':
                projection.set('this', exp.column('warehouse_code', table='d'))
    for node in list(tree.find_all(exp.Substring)):
        args = [node.this.copy(), node.args['start'].copy()]
        if node.args.get('length'):
            args.append(node.args['length'].copy())
        node.replace(exp.Anonymous(this='SUBSTRING', expressions=args))
    return re.sub(r'%\((gea_p\d+)\)s', r':\1', tree.sql(dialect='postgres')).replace(' AS DOUBLE PRECISION)', ' AS DOUBLE)')


def complete_stock_quantities(sql):
    tree = sqlglot.parse_one(sql, read='postgres')
    for select in tree.find_all(exp.Select):
        source = select.args.get('from_')
        joins = select.args.get('joins', [])
        if not source or len(joins) != 1:
            continue
        batches = source.this
        totals = joins[0].this
        if not isinstance(batches, exp.Subquery) or batches.alias != 'a':
            continue
        if not isinstance(totals, exp.Subquery) or totals.alias != 't':
            continue
        if not any(table.name == 'agents_scm_warehouse_total_data_d' for table in totals.find_all(exp.Table)):
            continue
        select.set('from_', exp.From(this=totals.copy()))
        select.set('joins', [exp.Join(this=batches.copy(), side='LEFT', on=joins[0].args['on'].copy())])
        for projection in select.expressions:
            if projection.alias_or_name in ['warehouseid', 'material_code']:
                projection.set('this', exp.column(projection.alias_or_name, table='t'))
            if projection.alias_or_name == 'unknown_age_qty':
                projection.set('this', sqlglot.parse_one('COALESCE(a.unknown_age_qty, CASE WHEN t.live_qty > 0 THEN t.live_qty ELSE 0 END)', read='postgres'))
    for node in list(tree.find_all(exp.Substring)):
        args = [node.this.copy(), node.args['start'].copy()]
        if node.args.get('length'):
            args.append(node.args['length'].copy())
        node.replace(exp.Anonymous(this='SUBSTRING', expressions=args))
    return re.sub(r'%\((gea_p\d+)\)s', r':\1', tree.sql(dialect='postgres')).replace(' AS DOUBLE PRECISION)', ' AS DOUBLE)')


def update(path):
    config = json.loads(path.read_text())
    for key, query in config['queries'].items():
        if not key.startswith('base-warehouse.'):
            query['request']['sql'] = query['request']['sql'].replace(
                "'N436', 'Y204', 'A540'", "'N436', 'Y204', 'A221', 'A540'"
            )
    for key, query in config['queries'].items():
        sql = query['request']['sql']
        if key.startswith('base-warehouse.') or 'agents_scm_branch_cost_m' not in sql or 'fc-branch-operation-warehouse-scope' in sql:
            continue
        tree = sqlglot.parse_one(sql, read='postgres')
        for scope in traverse_scope(tree) or []:
            for alias, source in scope.sources.items():
                if isinstance(source, exp.Table) and source.name == 'agents_scm_branch_cost_m':
                    scope.expression.where(f"{alias}.warehouseid IS NULL OR {alias}.warehouseid NOT IN ('N436', 'Y204', 'A221', 'A540')", copy=False)
        query['request']['sql'] = '/* fc-branch-operation-warehouse-scope */\n' + re.sub(r'%\((gea_p\d+)\)s', r':\1', tree.sql(dialect='postgres'))
    config['warehouseGroups'] = {
        'base': [
            {'code': 'Y204', 'name': '上海分仓'},
            {'code': 'N436', 'name': '郑州DC仓'},
            {'code': 'A221', 'name': '重庆前置仓'},
        ]
    }
    config['scopedQueryRoutes'] = [{
        'parameter': 'warehouse_code', 'values': BASE_WAREHOUSES, 'prefix': 'base-warehouse.'
    }, {
        'parameter': 'warehouse_id', 'values': BASE_WAREHOUSES, 'prefix': 'base-warehouse.'
    }]
    for key, query in list(config['queries'].items()):
        if key.startswith(('snapshot.', 'snapshot-default.', 'summary.', 'base-warehouse.')):
            continue
        parameter = next((p for p, spec in query['parameterSpec'].items() if spec.get('name') in ['warehouse_code', 'warehouse_id']), None)
        if not parameter:
            continue
        scoped = copy.deepcopy(query)
        scoped.pop('summaryRoute', None)
        scoped['title'] = '基地仓 ' + query.get('title', key)
        if any(spec.get('name') == 'pickup_type_mode' for spec in scoped['parameterSpec'].values()):
            scoped['inputOverrides'] = {'pickup_type_mode': 'all'}
        scoped['parameterSpec'][parameter]['enum'] = BASE_WAREHOUSES
        scoped['parameterSpec'][parameter]['nullable'] = False
        scoped['parameterSpec'][parameter]['required'] = True
        for name, spec in scoped['parameterSpec'].items():
            if spec.get('name') in ['warehouse_code_mode', 'warehouse_id_mode']:
                spec['enum'] = ['equal']
                scoped['request']['parameters'][name] = 'equal'
        scoped['request']['parameters'][parameter] = BASE_WAREHOUSES[0]
        scoped['request']['sql'] = base_scope(query['request']['sql'], parameter)
        if key.startswith('orders.'):
            scoped['request']['sql'] = base_order_scope(scoped['request']['sql'], parameter)
        if key in ['health.cards', 'health.inventory', 'source.branch-stock-date']:
            scoped['request']['sql'] = complete_stock_quantities(scoped['request']['sql'])
        if scoped.get('pagination', {}).get('countQuery'):
            scoped['pagination']['countQuery'] = 'base-warehouse.' + scoped['pagination']['countQuery']
        config['queries']['base-warehouse.' + key] = scoped
    directory = copy.deepcopy(config['queries']['branch-warehouse.directory'])
    directory.pop('summaryRoute', None)
    directory['title'] = '基地仓目录'
    directory['request']['sql'] = "WITH latest AS (SELECT b.warehouseid AS warehouse_code, MAX(b.month_date) AS day FROM agents_scm_inventory_sku_data_d AS b WHERE b.warehouseid IN ('Y204', 'N436', 'A221') AND b.month_date <= REPLACE(CAST(:gea_p1 AS VARCHAR(10)), '-', '') GROUP BY b.warehouseid), warehouses AS (SELECT b.warehouseid AS warehouse_code, CASE WHEN COUNT(DISTINCT NULLIF(TRIM(b.warehouse_name),'')) = 1 THEN MAX(NULLIF(TRIM(b.warehouse_name),'')) END AS warehouse_name, CASE WHEN COUNT(DISTINCT NULLIF(TRIM(b.belong_base),'')) = 1 THEN MAX(NULLIF(TRIM(b.belong_base),'')) END AS base FROM agents_scm_inventory_sku_data_d AS b INNER JOIN latest AS l ON l.warehouse_code = b.warehouseid AND l.day = b.month_date GROUP BY b.warehouseid) SELECT w.warehouse_code AS warehouse_code, w.warehouse_name AS warehouse_name, w.base AS base FROM warehouses AS w ORDER BY w.warehouse_code LIMIT :gea_p2 OFFSET :gea_p3"
    directory['pagination'] = {**directory['pagination'], 'countQuery': 'base-warehouse.directory.count'}
    config['queries']['base-warehouse.directory'] = directory
    count = copy.deepcopy(config['queries']['branch-warehouse.directory.count'])
    count.pop('summaryRoute', None)
    count['title'] = '基地仓数量'
    count['request']['sql'] = "SELECT COUNT(DISTINCT b.warehouseid) AS total FROM agents_scm_inventory_sku_data_d AS b WHERE b.warehouseid IN ('Y204', 'N436', 'A221') AND b.month_date <= REPLACE(CAST(:gea_p1 AS VARCHAR(10)), '-', '')"
    config['queries']['base-warehouse.directory.count'] = count
    path.write_text(json.dumps(config, ensure_ascii=False, indent=2) + '\n')


if __name__ == '__main__':
    update(Path(__file__).resolve().parents[1] / 'business/inventory-fc/sql.config.json')
