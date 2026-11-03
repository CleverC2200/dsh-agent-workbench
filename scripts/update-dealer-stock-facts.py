"""Fill customer stock facts from published quantities and unique product categories."""
import json
from pathlib import Path
import sqlglot
from sqlglot import exp
from importlib.util import spec_from_file_location, module_from_spec

ROOT = Path(__file__).resolve().parents[1]
spec = spec_from_file_location('age_helpers', Path(__file__).with_name('update-inventory-weighted-age.py'))
helpers = module_from_spec(spec)
spec.loader.exec_module(helpers)

def fill_categories(config):
    for name, query in config['queries'].items():
        if not name.startswith('dealer.stock.') or 'stock_category_dictionary' in query['request']['sql']:
            continue
        tree = sqlglot.parse_one(query['request']['sql'], read='postgres')
        records = [c.this for c in tree.find_all(exp.CTE) if c.alias == 'stock_records']
        if not records:
            continue
        dictionary = sqlglot.parse_one("SELECT t.material_code AS sku, CASE WHEN COUNT(DISTINCT NULLIF(TRIM(t.prod_big_cls), '')) = 1 THEN MAX(NULLIF(TRIM(t.prod_big_cls), '')) ELSE NULL END AS category FROM agents_dim_material_prod_sales_info_d AS t GROUP BY t.material_code", read='postgres')
        with_clause = tree.args['with_']
        with_clause.set('expressions', [exp.CTE(this=dictionary, alias=exp.TableAlias(this=exp.to_identifier('stock_category_dictionary'))), *with_clause.expressions])
        for record in records:
            record.join('stock_category_dictionary AS sc', on='sc.sku = t.material_code', join_type='LEFT', copy=False)
            category = sqlglot.parse_one("CASE WHEN COUNT(DISTINCT NULLIF(TRIM(t.product_range_name), '')) > 1 THEN NULL ELSE COALESCE(MAX(NULLIF(TRIM(t.product_range_name), '')), MAX(sc.category)) END AS category", read='postgres')
            record.set('expressions', [category.copy() if item.alias == 'category' else item for item in record.expressions])
        query['request']['sql'] = helpers.render(tree)
        query['notes'] += '；库存源品类为空时，使用同SKU唯一产品大类补齐；源品类优先，主数据冲突保留未知；明细、分组、计数和筛选使用相同规则。'

def update(config):
    changed = []
    for name, query in config['queries'].items():
        if not name.startswith('dealer.stock.') or name.endswith('.count') or name == 'dealer.stock.count':
            continue
        if 'large_date_inventory' in query['resultColumns']:
            continue
        tree = sqlglot.parse_one(query['request']['sql'], read='postgres')
        for select in tree.find_all(exp.Select):
            projections = []
            for item in select.expressions:
                projections.append(item)
                if item.alias not in ['normal_inventory', 'valid_normal_inventory']:
                    continue
                added = item.copy()
                for node in added.find_all(exp.Identifier):
                    if node.this == 'normal_stock_qty':
                        node.set('this', 'big_final_qty')
                    elif 'normal_inventory' in node.this:
                        node.set('this', node.this.replace('normal_inventory', 'large_date_inventory'))
                if any(c.name == 'big_final_qty' for c in added.find_all(exp.Column)):
                    added = sqlglot.parse_one('CASE WHEN COUNT(*) = 1 AND MIN(t.big_final_qty) >= 0 THEN MAX(t.big_final_qty) ELSE NULL END AS large_date_inventory', read='postgres')
                projections.append(added)
            select.set('expressions', projections)
        query['request']['sql'] = helpers.render(tree)
        query['resultColumns'] = [item.alias for item in tree.expressions]
        query['notes'] += '；大日期库存直接取已发布big_final_qty，与临期库存、批次货龄不同；重复客户SKU键、空值、负数不计入该指标，其余指标独立计算。'
        changed.append(name)
    for view in config['sourceViews']['views']:
        if view.get('queryId') not in changed:
            continue
        if any(c['field'] == 'large_date_inventory' for c in view['columns']):
            continue
        view['columns'].append({'field': 'large_date_inventory', 'label': '大日期库存', 'format': 'decimal'})
    config['sourceGaps'] = [gap for gap in config['sourceGaps'] if gap['id'] != 'dealer-large-date-not-published-20261020']
    config['sourceObservations']['largeDateVerified'] = {
        'checkedAt': '2026-11-03', 'resourceCode': 'DS_261e03a531ba4fe7a2e05c8884d79e5f',
        'activeVersion': 5, 'field': 'big_final_qty', 'consumer': 'dealer-inventory-replenishment',
        'notes': '正式GEA成功返回；同日期客户SKU唯一键口径，与现有库存查询一致；不代替临期库存或平均货龄。'
    }
    fill_categories(config)
    return changed

if __name__ == '__main__':
    path = ROOT / 'business/inventory-dealer/sql.config.json'
    config = json.loads(path.read_text())
    print(update(config))
    path.write_text(json.dumps(config, ensure_ascii=False, indent=2) + '\n')
