"""Exclude confirmed warehouses from branches; preserve source-based base classification."""
import re

import sqlglot
from sqlglot import exp
from sqlglot.optimizer.scope import traverse_scope, Scope

EXCLUDED = ('N436', 'Y204')
MARKER = '/* inventory-branch-exclusions:N436,Y204 */'


def warehouse_scope(sql, dialect='postgres'):
    """Change source predicates without reserializing ETL dates or casts."""
    original = sql
    sql = sql.replace('/* fc-warehouse-exceptions:N436 */', '')
    legacy_field = r'(?:TRIM\s*\(\s*\w+\.(?:warehouseid|warehouse)\s*\)|\w+\.(?:warehouseid|warehouse))'
    sql = re.sub(r"\s+OR\s+" + legacy_field + r"\s*=\s*'N436'", '', sql, flags=re.I)
    sql = re.sub(r"\s+AND\s+" + legacy_field + r"\s*<>\s*'N436'", '', sql, flags=re.I)
    if MARKER in sql or 'warehouse_classify' not in sql:
        return sql
    tree = sqlglot.parse_one(sql, read=dialect)
    edits = {}
    for scope in traverse_scope(tree) or []:
        for column in scope.columns:
            if column.name != 'warehouse_classify':
                continue
            predicate = column.parent
            if isinstance(predicate, exp.Trim):
                predicate = predicate.parent
            branch = isinstance(predicate, exp.EQ) and any(
                isinstance(node, exp.Literal) and node.is_string and node.this == '20'
                for node in [predicate.this, predicate.expression]
            )
            combined = isinstance(predicate, exp.In) and [
                node.this for node in predicate.expressions if isinstance(node, exp.Literal)
            ] == ['01', '02', '20']
            if not (branch or combined):
                continue
            source = scope.sources.get(column.table)
            if not source and not column.table and len(scope.sources) == 1:
                source = next(iter(scope.sources.values()))
            if isinstance(source, exp.Table):
                field = 'warehouse' if source.name == 'agents_scm_cust_deliv_daily_di' else 'warehouseid'
            elif isinstance(source, Scope):
                field = next((name for name in ['warehouseid', 'warehouse', 'warehouse_code']
                              if name in source.expression.named_selects), None)
                if not field:
                    raise ValueError('Warehouse field absent from classified source')
            else:
                raise ValueError('Warehouse classification source is ambiguous')
            alias = column.table
            raw = (re.escape(alias) + r'\s*\.\s*' if alias else '') + 'warehouse_classify'
            value = rf'(?:TRIM\s*\(\s*{raw}\s*\)|{raw})'
            suffix = r"\s*=\s*'20'" if branch else r"\s+IN\s*\(\s*'01'\s*,\s*'02'\s*,\s*'20'\s*\)"
            position = column.this.meta['start']
            matches = [match for match in re.finditer(value + suffix, sql, re.I)
                       if match.start() <= position < match.end()]
            if len(matches) != 1:
                raise ValueError('Classification predicate cannot be located')
            match = matches[0]
            warehouse = (alias + '.' if alias else '') + field
            excluded = f"{warehouse} NOT IN ('N436', 'Y204')"
            guard = excluded if branch else f"({column.sql()} <> '20' OR {excluded})"
            edits[(match.start(), match.end())] = f'({match.group(0)} AND {guard})'
    for (start, end), value in sorted(edits.items(), reverse=True):
        sql = sql[:start] + value + sql[end:]
    return MARKER + '\n' + sql if sql != original else sql


def branch_read_scope(sql):
    """Reject excluded warehouses in cached rows and mapped customer orders, too."""
    if not any(token in sql for token in ['agents_inv_branch_sku_day', 'agents_inv_order_summary_day', 'cw.warehouse_code']):
        return sql
    tree = sqlglot.parse_one(sql, read='postgres')
    changed = False
    for scope in traverse_scope(tree) or []:
        guards = []
        for alias, source in scope.sources.items():
            if not isinstance(source, exp.Table) or alias not in scope.selected_sources:
                continue
            if source.name == 'agents_inv_branch_sku_day':
                guards.append(alias + '.warehouseid')
            elif source.name == 'agents_inv_order_summary_day':
                where = scope.expression.args.get('where')
                values = {v.this for v in where.find_all(exp.Literal)} if where else set()
                if any(v.startswith('BRANCH_') or v.startswith('FC_') or v == 'ASN_CURRENT' for v in values):
                    guards.append(alias + '.warehouseid')
        if 'cw' in scope.selected_sources and any(
            col.table == 'cw' and col.name == 'warehouse_code'
            for expression in scope.expression.expressions for col in expression.find_all(exp.Column)
        ):
            guards.append('cw.warehouse_code')
        for field in guards:
            guard = f"{field} IS NULL OR {field} NOT IN ('N436', 'Y204')"
            where = scope.expression.args.get('where')
            if where and sqlglot.parse_one(guard).sql() in where.sql():
                continue
            scope.expression.where(guard, copy=False)
            changed = True
    if not changed:
        return sql
    for node in list(tree.find_all(exp.Substring)):
        node.replace(exp.Anonymous(this='SUBSTRING', expressions=[node.this.copy(), node.args['start'].copy(), node.args['length'].copy()]))
    rendered = re.sub(r'%\((gea_p\d+)\)s', r':\1', tree.sql(dialect='postgres'))
    return MARKER + '\n' + rendered.replace(MARKER, '').lstrip().replace(' AS DOUBLE PRECISION)', ' AS DOUBLE)')
