"""Filter branch aging batches before aggregation; keep precomputed routes equivalent."""
import json
from pathlib import Path

import sqlglot
from sqlglot import exp

VARIANTS = {
    '60-90': ('BRANCH_AGE:60-90', 'a.age_days >= 60 AND a.age_days < 90'),
    '90+': ('BRANCH_AGE:90+', 'a.age_days >= 90'),
    '60-90,90+': ('BRANCH_AGE:60+', 'a.age_days >= 60'),
}


def filter_batches(tree, condition):
    ctes = [c for c in tree.find_all(exp.CTE) if c.alias == 'batch_skus']
    assert len(ctes) == 1, 'Expected one physical batch aggregate'
    ctes[0].this.set('where', exp.Where(this=sqlglot.parse_one(condition, read='postgres')))


def governed_sql(tree):
    # Preserve gateway named binds and Doris-compatible DOUBLE instead of DB-API/PostgreSQL spellings.
    return tree.sql()


def main():
    path = Path(__file__).resolve().parents[1] / 'business/inventory-fc/sql.config.json'
    config = json.loads(path.read_text())
    condition = ':gea_p4103 = \'\' OR ' + ' OR '.join(
        f"(:gea_p4103 = '{value}' AND ({predicate}))"
        for value, (_, predicate) in VARIANTS.items()
    )
    selector = 'CASE ' + ' '.join(
        f"WHEN :gea_p4103 = '{value}' THEN '{variant}'"
        for value, (variant, _) in VARIANTS.items()
    ) + " ELSE 'BRANCH_AGE' END"
    for key, query in config['queries'].items():
        if key.startswith('batch-age.'):
            tree = sqlglot.parse_one(query['request']['sql'], read='postgres')
            filter_batches(tree, condition)
            query['request']['sql'] = governed_sql(tree)
        elif key.startswith('snapshot.batch-age.'):
            tree = sqlglot.parse_one(query['request']['sql'], read='postgres')
            matches = [e for e in tree.find_all(exp.EQ)
                       if isinstance(e.this, exp.Column) and e.this.name == 'inv_variant_id'
                       and e.this.table == 'm']
            assert len(matches) == 1
            matches[0].set('expression', sqlglot.parse_one(selector, read='postgres'))
            query['request']['sql'] = governed_sql(tree)
    view = next(v for v in config['sourceViews']['views'] if v['id'] == 'inventory')
    column = next(c for c in view['columns'] if c['field'] == 'total_qty')
    column.update(label='库存量', reason='按当前筛选范围汇总库存；选择货龄时，仅统计所选货龄批次。')
    path.write_text(json.dumps(config, ensure_ascii=False, indent=2) + '\n')


if __name__ == '__main__':
    main()
