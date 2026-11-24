import json
from pathlib import Path

import sqlglot

config_path = Path(__file__).resolve().parents[1] / 'business/inventory-fc/sql.config.json'
text = config_path.read_text()
queries = json.loads(text)['queries']
for prefix in ('', 'base-warehouse.'):
    definition = queries[prefix + 'snapshot-default.replenishment-confirmation.detail.atomic']
    source = queries[prefix + 'snapshot-default.replenishment.detail.atomic']
    assert definition['parameterSpec'] == source['parameterSpec']
    sql = source['request']['sql']
    projection = sqlglot.parse_one(sql, read='postgres').expressions
    available = {column.alias for column in projection}
    required = set(definition['resultColumns'])
    assert required <= available
    original = 'SELECT ' + ', '.join(column.sql(dialect='postgres') for column in projection)
    confirmation = 'SELECT ' + ', '.join(
        column.sql(dialect='postgres') for column in projection if column.alias in required
    )
    assert sql.count(original) == 1
    previous = json.dumps(definition['request']['sql'], ensure_ascii=False)
    assert text.count(previous) == 1
    text = text.replace(previous, json.dumps(sql.replace(original, confirmation), ensure_ascii=False))
config_path.write_text(text)
