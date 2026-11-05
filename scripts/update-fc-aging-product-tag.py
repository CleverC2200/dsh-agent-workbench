"""Attach one product label per SKU after aging paging, preserving quantity and count scopes."""
import json
from pathlib import Path

import sqlglot
from sqlglot import exp


def main():
    path = Path(__file__).resolve().parents[1] / 'business/inventory-fc/sql.config.json'
    config = json.loads(path.read_text())
    for key in ['batch-age.atomic', 'batch-age.groups',
                'snapshot.batch-age.atomic', 'snapshot.batch-age.groups']:
        query = config['queries'][key]
        tree = sqlglot.parse_one(query['request']['sql'], read='postgres')
        if any(c.alias == 'aging_tag_page' for c in tree.ctes):
            continue
        original_with = tree.args.pop('with', None)
        ctes = original_with.expressions if original_with else []
        order = tree.args.get('order')
        if order:
            order = order.copy()
            for column in order.find_all(exp.Column):
                column.set('table', exp.to_identifier('r'))
        ctes.append(exp.CTE(this=tree, alias=exp.TableAlias(this=exp.to_identifier('aging_tag_page'))))
        labels = sqlglot.parse_one("""
            SELECT d.material_code AS material_code,
              CASE WHEN COUNT(DISTINCT NULLIF(TRIM(d.tag), '')) = 1
                THEN MAX(NULLIF(TRIM(d.tag), '')) ELSE NULL END AS product_tag
            FROM agents_dim_material_prod_sales_info_d AS d
            INNER JOIN aging_tag_page AS p ON d.material_code = p.material_code
            GROUP BY d.material_code
        """, read='postgres')
        ctes.append(exp.CTE(this=labels, alias=exp.TableAlias(this=exp.to_identifier('aging_product_tags'))))
        result = sqlglot.parse_one(
            'SELECT ' + ', '.join('r.' + field + ' AS ' + field for field in query['resultColumns']) +
            ', t.product_tag AS product_tag FROM aging_tag_page AS r '
            'LEFT JOIN aging_product_tags AS t ON r.material_code = t.material_code', read='postgres')
        result.set('with', exp.With(expressions=ctes))
        result.set('order', order)
        query['request']['sql'] = result.sql()
        query['resultColumns'].append('product_tag')
    view = next(v for v in config['sourceViews']['views'] if v['id'] == 'inventory')
    if not any(c['field'] == 'product_tag' for c in view['columns']):
        index = next(i for i, c in enumerate(view['columns']) if c['field'] == 'missing_age_10') + 1
        view['columns'].insert(index, {'field': 'product_tag', 'label': '产品标签'})
        view['defaultColumns'].insert(view['defaultColumns'].index('missing_age_10') + 1, 'product_tag')
    path.write_text(json.dumps(config, ensure_ascii=False, indent=2) + '\n')


if __name__ == '__main__':
    main()
