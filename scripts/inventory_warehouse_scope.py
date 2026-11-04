"""Apply confirmed warehouse exceptions without changing other SQL bytes or source data."""
import re

import sqlglot
from sqlglot import exp
from sqlglot.optimizer.scope import traverse_scope, Scope

EXCEPTIONS = ('N436', 'Y204')
MARKER = '/* inventory-warehouse-exceptions:N436,Y204 */'


def warehouse_exceptions(sql, dialect='postgres'):
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
            base = isinstance(predicate, exp.In) and [
                node.this for node in predicate.expressions if isinstance(node, exp.Literal)
            ] == ['01', '02']
            if not (branch or base):
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
                    raise ValueError('Warehouse field absent from classified derived source')
            else:
                raise ValueError('Warehouse classification source is ambiguous')
            alias = column.table
            raw = (re.escape(alias) + r'\s*\.\s*' if alias else '') + 'warehouse_classify'
            value = rf'(?:TRIM\s*\(\s*{raw}\s*\)|{raw})'
            suffix = r"\s*=\s*'20'" if branch else r"\s+IN\s*\(\s*'01'\s*,\s*'02'\s*\)"
            position = column.this.meta['start']
            matches = [match for match in re.finditer(value + suffix, sql, re.I)
                       if match.start() <= position < match.end()]
            if len(matches) != 1:
                raise ValueError('Classification predicate cannot be located in original SQL')
            match = matches[0]
            warehouse = (alias + '.' if alias else '') + field
            codes = ', '.join("'" + code + "'" for code in EXCEPTIONS)
            condition = f'{warehouse} IN ({codes})' if branch else f'{warehouse} NOT IN ({codes})'
            operator = 'OR' if branch else 'AND'
            edits[(match.start(), match.end())] = f'({match.group(0)} {operator} {condition})'
    for (start, end), value in sorted(edits.items(), reverse=True):
        sql = sql[:start] + value + sql[end:]
    return MARKER + '\n' + sql if edits else sql
