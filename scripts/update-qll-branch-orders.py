"""Keep full-chain branch order reads aligned with downstream branch customer contracts."""
import copy
import importlib.util
import json
import re
from pathlib import Path

import sqlglot
from sqlglot import exp

WITH_KEY = 'with_' if 'with_' in exp.Select.arg_types else 'with'

ROOT = Path(__file__).resolve().parents[1]
FIELDS = ('snapshot_date location_type location_code location_name base warehouse_code '
          'sku material_name category material_group demand allocated remaining available shortage invalid').split()


def parse(sql):
    return sqlglot.parse_one(sql, read='postgres')


def render(tree, pretty=False):
    tree = tree.copy()
    for sub in list(tree.find_all(exp.Substring)):
        sub.replace(exp.Anonymous(this='SUBSTRING', expressions=[
            sub.this.copy(), sub.args['start'].copy(), sub.args['length'].copy()]))
    return re.sub(r'%\((gea_p\d+)\)s', r':\1', tree.sql(dialect='postgres', pretty=pretty))


def cohort(query, prefix, end='filtered'):
    tree = parse(query['request']['sql'])
    ctes = []
    for cte in tree.ctes:
        ctes.append(cte.copy())
        if cte.alias == end:
            break
    assert ctes[-1].alias == end
    names = {c.alias: prefix + c.alias for c in ctes}
    for cte in ctes:
        for table in cte.find_all(exp.Table):
            if table.name in names:
                if not table.args.get('alias'):
                    table.set('alias', exp.TableAlias(this=exp.to_identifier(table.name)))
                table.set('this', exp.to_identifier(names[table.name]))
        cte.set('alias', exp.TableAlias(this=exp.to_identifier(names[cte.alias])))
    return ctes


def build_source(config, base, branch):
    for kind in ['summary', 'locations', 'categories', 'detail', 'skus']:
        key = 'current-shortage.' + kind
        query = copy.deepcopy(base['queries'][key])
        tree = parse(query['request']['sql'])
        branch_end = 'grouped' if kind == 'detail' else 'filtered'
        ctes = cohort(query, 'base_') + cohort(branch['queries'][key], 'branch_', branch_end)
        columns = ', '.join('f.' + f + ' AS ' + f for f in FIELDS)
        union = parse(f'SELECT {columns} FROM base_filtered AS f UNION ALL '
                      f'SELECT {columns} FROM branch_{branch_end} AS f')
        ctes.append(exp.CTE(this=union, alias=exp.TableAlias(this=exp.to_identifier('filtered'))))
        after = False
        for cte in tree.ctes:
            if after:
                ctes.append(cte.copy())
            if cte.alias == 'filtered':
                after = True
        tree.set(WITH_KEY, exp.With(expressions=ctes))
        query['request']['sql'] = render(tree)
        query['plugins'] = ['qll']
        query['notes'] = ('基地保持基地有效未发货订单口径；分仓复用下游客户未完成订单，'
                          '按实际发货分仓归属并换算为件，分仓SKU可用库存只扣一次。'
                          '异常业务记录不影响正常记录汇总；权限失败不补零。')
        config['queries'][key] = query

    for key, source in branch['queries'].items():
        if key.startswith(('replenishment.', 'replenishment-suggestions.', 'branch-supply.')):
            config['queries'][key] = copy.deepcopy(source)
            config['queries'][key]['plugins'] = ['qll']
    # Branch stock metadata must not require dealer-order access either.
    for key in list(config['queries']):
        if key.startswith('branch-health.'):
            source_key = key.replace('branch-health.', 'health.', 1)
            if source_key in branch['queries']:
                query = copy.deepcopy(branch['queries'][source_key])
                query['plugins'] = ['qll']
                for name, value in query.get('pagination', {}).items():
                    if isinstance(value, str) and value.startswith('health.'):
                        query['pagination'][name] = value.replace('health.', 'branch-health.', 1)
                config['queries'][key] = query
    # The overview needs only daily movement, not another full FIFO shortage calculation.
    config['queries']['branch-turnover.cards'] = copy.deepcopy(branch['queries']['replenishment.overview'])
    config['queries']['branch-turnover.cards']['plugins'] = ['qll']
    config['queries']['branch-turnover.cards'].pop('orderCountFromOverview', None)
    views = {v['id']: v for v in config['sourceViews']['views']}
    fc_views = {v['id']: v for v in branch['sourceViews']['views']}
    supply = copy.deepcopy(fc_views['orders'])
    supply['id'] = 'branch-overview'
    config['sourceViews']['views'] = [supply if v['id'] == 'branch-overview' else v
                                     for v in config['sourceViews']['views']]
    repl = views['branch-replenishment']
    for field in ['columns', 'description', 'filters', 'defaultColumns']:
        if field in fc_views['replenishment']:
            repl[field] = copy.deepcopy(fc_views['replenishment'][field])
    for metric in repl.get('metrics', []):
        metric['label'] = metric['label'].replace('箱', '件')
    config['overviewOrderGroups']['views']['branch-overview'] = '分仓'
    grouped = config['queries']['overview.orders-by-pickup']
    # The shared dealer execution query remains for the base fulfillment metric only.
    grouped['request']['parameters']['gea_p8'] = 'all'
    grouped['request']['parameters']['gea_p9'] = None
    spec = importlib.util.spec_from_file_location('qll_loading', ROOT / 'scripts/optimize-qll-loading.py')
    loading = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(loading)
    optimized = loading.optimize(config)
    config.clear()
    config.update(optimized)


def build(config, base, branch):
    """Regenerate source formulas while retaining installed summary routes and collection envelopes."""
    original = copy.deepcopy(config)
    inputs = [copy.deepcopy(value) for value in (base, branch)]
    for value in inputs:
        for query in value['queries'].values():
            tree = parse(query['request']['sql'])
            if tree.ctes and tree.ctes[0].alias == 'collection_result':
                query['request']['sql'] = render(tree.ctes[0].this)
                query['resultColumns'] = [name for name in query['resultColumns']
                                          if name not in ('page_scope_total', 'page_row_present')]
    build_source(config, *inputs)
    for key, query in config['queries'].items():
        previous = original['queries'].get(key)
        if not previous:
            continue
        if 'summaryRoute' in previous:
            query['summaryRoute'] = copy.deepcopy(previous['summaryRoute'])
        if query['request']['sql'] == previous['request']['sql']:
            continue
        template = parse(previous['request']['sql'])
        if not template.ctes or template.ctes[0].alias != 'collection_result':
            continue
        template.ctes[0].set('this', parse(query['request']['sql']))
        restored = copy.deepcopy(previous)
        restored['request']['sql'] = render(template)
        config['queries'][key] = restored


if __name__ == '__main__':
    path = ROOT / 'business/inventory-qll/sql.config.json'
    config = json.loads(path.read_text())
    base = json.loads((ROOT / 'business/inventory-aqkc/sql.config.json').read_text())
    branch = json.loads((ROOT / 'business/inventory-fc/sql.config.json').read_text())
    build(config, base, branch)
    path.write_text(json.dumps(config, ensure_ascii=False, indent=2) + '\n')
    source = parse(config['queries']['current-shortage.summary']['request']['sql'])
    for parameter in list(source.find_all(exp.Placeholder)):
        parameter.replace(exp.Null())
    names = dict(zip(FIELDS, ('stat_date location_type location_code location_name belong_base '
                             'warehouseid material_code material_name product_categ_name material_group_name '
                             'demand_qty allocated_qty remaining_qty available_qty shortage_qty invalid_sku').split()))
    reference = parse('SELECT ' + ', '.join(f'f.{k} AS {v}' for k, v in names.items()) + ' FROM filtered AS f')
    reference.set(WITH_KEY, source.args[WITH_KEY].copy())
    (path.parent / 'current-orders-source.sql').write_text(render(reference, pretty=True) + '\n')
