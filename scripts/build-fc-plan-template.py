"""Build a narrow, counted export over the existing governed plan scope."""
import copy, json, re
from pathlib import Path
import sqlglot
from sqlglot import exp
def render(tree):
    tree = tree.copy()
    for node in list(tree.find_all(exp.Substring)):
        args = [node.this.copy()] + [node.args[k].copy() for k in ('start','length') if node.args.get(k) is not None]
        node.replace(exp.Anonymous(this='SUBSTRING', expressions=args))
    return re.sub(r'%\((gea_p\d+)\)s', r':\1', tree.sql(dialect='postgres'))
path = Path(__file__).resolve().parents[1] / 'business/inventory-fc/sql.config.json'
config = json.loads(path.read_text())
base = config['queries']['transfer_plan.count']
tree = sqlglot.parse_one(base['request']['sql'], read='postgres')
keep = {'warehouse_code', 'material_code', 'warehouse_name', 'material_name', 'product_categ_name', 'warehouse_month_out_plan', 'warehouse_future30_qty', 'source_rows', 'sku', 'category', 'month_out_plan', 'future30_qty'}
for cte in tree.ctes:
    cte.this.set('expressions', [e for e in cte.this.expressions if e.alias_or_name in keep])
# Reuse the exact current-month scope, optional branch/SKU filters and duplicate-plan rules.
# Preserve syntax by attaching the existing CTE AST to the dedicated projection.
fields = ['warehouse_code','sku','warehouse_name','material_name','month_out_plan','future30_qty','source_rows']
projection = ', '.join(f'r.{f} AS {f}' for f in fields)
projection += ", CASE WHEN r.source_rows=1 THEN SUBSTRING(REPLACE(CAST(:gea_p2700 AS VARCHAR(10)), '-', ''), 1, 6) ELSE NULL END AS stat_month, CAST(NULL AS DECIMAL(20,6)) AS warehouse_month_transfer_plan, r.future30_qty AS period_next_out"
columns = fields + ['stat_month','warehouse_month_transfer_plan','period_next_out']
query = sqlglot.parse_one(f"SELECT {projection} FROM filtered AS r ORDER BY r.warehouse_code, r.sku LIMIT :gea_p8 OFFSET :gea_p9", read='postgres')
query.set('with_', tree.args.get('with_'))
atomic = sqlglot.parse_one('SELECT '+', '.join(f'p.{f} AS {f}' for f in columns)+', c.total AS page_scope_total, p.page_row_present AS page_row_present FROM (SELECT COUNT(*) AS total FROM filtered) AS c LEFT JOIN (SELECT '+projection+', 1 AS page_row_present FROM filtered AS r ORDER BY r.warehouse_code, r.sku LIMIT :gea_p8 OFFSET :gea_p9) AS p ON TRUE ORDER BY p.warehouse_code, p.sku LIMIT :gea_p8', read='postgres')
atomic.set('with_', tree.args.get('with_').copy())
source=config['queries']['transfer_plan.detail']
for key,ast,cols in [('transfer_plan.template',query,columns),('transfer_plan.template.atomic',atomic,columns+['page_scope_total','page_row_present']),('transfer_plan.template.count',tree,['total'])]:
    sql=render(ast)
    used={p.name for p in ast.find_all(exp.Placeholder)}
    q={'title':'分仓计划模板取数','request':{'sql':sql,'parameters':{k:v for k,v in source['request']['parameters'].items() if k in used},'includeTotal':False},'parameterSpec':{k:copy.deepcopy(v) for k,v in source['parameterSpec'].items() if k in used},'resultColumns':cols}
    if key=='transfer_plan.template': q['pagination']={'mode':'sql_limit_offset','countQuery':'transfer_plan.template.count','atomicQuery':'transfer_plan.template.atomic'}
    config['queries'][key]=q
path.write_text(json.dumps(config,ensure_ascii=False,indent=2)+'\n')
