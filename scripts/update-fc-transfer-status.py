"""Apply the confirmed monthly current-transfer status to raw queries without changing order pools."""
from pathlib import Path
import json
import sqlglot
from sqlglot import exp

ROOT = Path(__file__).resolve().parents[1]
CANONICAL = sqlglot.parse_one((ROOT / 'business/inventory-fc/transfer-current-source.sql').read_text(), read='postgres')
OLD = {'transfer_stock_date', 'transfer_receivers', 'transfer_origins', 'transfer_union',
       'transfer_source_presence', 'transfer_latest', 'transfer_priority', 'transfer_records',
       'transfer_versions', 'transfer_valid', 'transfer_current_lines', 'transfer_current_skus',
       'transfer_reported'}
NOTE = ' 当前调拨在途与备单按本月分仓计划登记值统计，分别采用transfer_onway_qty和transfer_prepare_qty，单位件；不从历史执行单累计反推。同仓SKU重复一致值取一次，冲突、缺失和负值逐字段保持未知，正常记录继续统计。'

def patch_tree(tree, month_sql, stock_sql=None):
    changed = False
    for scope in list(tree.find_all(exp.With)):
        if not any(c.alias == 'transfer_current_skus' for c in scope.expressions):
            continue
        ctes = []
        for c in CANONICAL.ctes:
            sql = c.sql().replace(':gea_p2300', month_sql)
            if stock_sql is not None:
                sql = sql.replace(':gea_p2200', stock_sql)
            ctes.append(sqlglot.parse_one('WITH ' + sql + ' SELECT 1 AS one', read='postgres').ctes[0])
        remaining = [c for c in scope.expressions if c.alias not in OLD]
        scope.set('expressions', ctes + remaining)
        changed = True
    if changed:
        for select in tree.find_all(exp.Select):
            if not any(j.this.alias_or_name == 'tf' for j in select.args.get('joins', [])):
                continue
            for a in select.expressions:
                if a.alias in {'preparing', 'in_transit'}:
                    a.set('this', exp.column(a.alias, 'tf'))
                elif a.alias == 'open_transfer_reported_qty':
                    a.set('this', sqlglot.parse_one('tf.preparing + tf.in_transit', read='postgres'))
                elif a.alias in {'preparing_present', 'in_transit_present'}:
                    metric = 'preparing' if a.alias == 'preparing_present' else 'in_transit'
                    a.set('this', sqlglot.parse_one('CASE WHEN tf.' + metric + ' IS NOT NULL THEN 1 ELSE 0 END', read='postgres'))
    return changed


def main():
    report = {}
    for agent in ['fc', 'qll']:
        path = ROOT / f'business/inventory-{agent}/sql.config.json'
        config = json.loads(path.read_text())
        changed = []
        for qid, q in config['queries'].items():
            sql = q['request']['sql']
            if 'transfer_current_skus' not in sql:
                continue
            month = next(k for k, spec in q['parameterSpec'].items() if spec['name'] == 'month')
            tree = sqlglot.parse_one(sql, read='postgres')
            if patch_tree(tree, ':' + month):
                q['request']['sql'] = tree.sql()
                old = q.get('notes', '')
                old = old.replace(' 当前调拨取日/小时执行单最新有效状态，按分仓收货仓聚合；已派未到按已备数量计未收到量，终态和冲突行不参与。月计划累计调拨字段不再作为当前备单/在途。', '')
                q['notes'] = old if NOTE in old else old + NOTE
                changed.append(qid)
        path.write_text(json.dumps(config, ensure_ascii=False, indent=2) + '\n')
        report[agent] = changed
    print(json.dumps(report, ensure_ascii=False))


if __name__ == '__main__':
    main()
