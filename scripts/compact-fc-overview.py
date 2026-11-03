"""Build the default-cycle card read from the canonical summary, preserving all quantity formulas."""
from pathlib import Path
import copy
import json
import re
import sqlglot
from sqlglot import exp
from sqlglot.optimizer.simplify import simplify
from sqlglot.optimizer.pushdown_projections import pushdown_projections

ROOT = Path(__file__).resolve().parents[1]
FIXED = {
    'sku_mode': 'all', 'sku': None, 'category_mode': 'all', 'category': None,
    'search_pattern': None, 'warehouse_search_pattern': None,
    'needed_only': False, 'business_only': False,
}

def compact(config):
    query = copy.deepcopy(config['queries']['replenishment.summary'])
    tree = sqlglot.parse_one(query['request']['sql'], read='postgres')
    for parameter in list(tree.find_all(exp.Placeholder)):
        name = query['parameterSpec'][parameter.name]['name']
        if name in FIXED:
            parameter.replace(exp.convert(FIXED[name]))
        elif name.startswith('fc_cycle_'):
            parameter.replace(exp.convert(query['request']['parameters'][parameter.name]))
    for comparison in list(tree.find_all(exp.EQ)):
        if isinstance(comparison.left, exp.Boolean) and isinstance(comparison.right, exp.Boolean):
            comparison.replace(exp.convert(comparison.left.this == comparison.right.this))
    tree = simplify(tree)
    removed = []
    for _ in range(8):
        tree = pushdown_projections(tree)
        ctes = {cte.alias: cte.this for cte in tree.find_all(exp.CTE)}
        changed = False
        for select in tree.find_all(exp.Select):
            for join in list(select.args.get('joins') or []):
                if join.side != 'LEFT' or not isinstance(join.this, exp.Table):
                    continue
                alias = join.this.alias_or_name
                clone = select.copy()
                clone.set('joins', [j.copy() for j in select.args['joins'] if j is not join])
                if any(col.table == alias for col in clone.find_all(exp.Column)):
                    continue
                source = ctes.get(join.this.name)
                if not isinstance(source, exp.Select) or not source.args.get('group'):
                    continue
                projections = {e.this.sql(): e.alias for e in source.expressions if isinstance(e, exp.Alias)}
                unique = {projections.get(g.sql()) for g in source.args['group'].expressions}
                joined = set()
                for eq in join.args['on'].find_all(exp.EQ):
                    for col in (eq.left, eq.right):
                        if isinstance(col, exp.Column) and col.table == alias:
                            joined.add(col.name)
                if None in unique or not unique <= joined:
                    continue
                select.set('joins', [j for j in select.args['joins'] if j is not join])
                removed.append(join.this.name)
                changed = True
        if not changed:
            break
    ctes = {cte.alias: cte for cte in tree.ctes}
    tree.set('with_', None)
    retained = set()
    def retain(name):
        if name in retained or name not in ctes:
            return
        retained.add(name)
        for table in ctes[name].find_all(exp.Table):
            retain(table.name)
    for table in tree.find_all(exp.Table):
        retain(table.name)
    tree.set('with_', exp.With(expressions=[cte for name, cte in ctes.items() if name in retained]))
    for sub in list(tree.find_all(exp.Substring)):
        sub.replace(exp.Anonymous(this='SUBSTRING', expressions=[sub.this.copy(), sub.args['start'].copy(), sub.args['length'].copy()]))
    sql = re.sub(r'%\((gea_p\d+)\)s', r':\1', tree.sql(dialect='postgres'))
    names = set(re.findall(r':(gea_p\d+)\b', sql))
    query['parameterSpec'] = {k:v for k,v in query['parameterSpec'].items() if k in names}
    query['request']['parameters'] = {k:v for k,v in query['request']['parameters'].items() if k in names}
    query['request']['sql'] = sql
    query['notes'] = '无自定义周期时的卡片汇总；沿用原汇总公式与分仓范围，移除未使用的一对一商品属性关联。配置自定义周期或列表筛选时仍使用完整查询。'
    config['queries']['replenishment.overview'] = query
    view = next(v for v in config['sourceViews']['views'] if v['id'] == 'replenishment')
    view['overviewSummaryId'] = 'replenishment.overview'
    view['overviewFilterNames'] = ['warehouse_code']
    view['overviewRequiresDefaultCycle'] = True
    return removed

if __name__ == '__main__':
    path = ROOT/'business/inventory-fc/sql.config.json'
    config = json.loads(path.read_text())
    print('Removed unused unique joins:', compact(config))
    path.write_text(json.dumps(config, ensure_ascii=False, indent=2)+'\n')
