import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { enumerateOperationsSurfaces } from './lib/operations-surface-audit.mjs';
import { operationDisposition } from './lib/operations-dispositions.mjs';
export async function auditDeliveryOperations() {
  const html = await readFile(
    new URL('../prototypes/inventory-orderfulfillment/delivery-operations.html', import.meta.url),
    'utf8',
  );
  const inventory = enumerateOperationsSurfaces(html);
  const entries = [
    ...inventory.cards,
    ...inventory.charts,
    ...inventory.drillMetrics,
    ...inventory.tables.flatMap((table) =>
      table.columns.map((column, index) => ({
        ...column,
        kind: 'tableColumn',
        id: table.id + ':' + index,
        host: table.host,
        context: table.context,
        title: table.title + ' / ' + column.label,
      })),
    ),
  ];
  const rows = entries.map((entry) => ({ ...entry, ...operationDisposition(entry) }));
  return {
    counts: {
      panels: 7,
      cards: inventory.cards.length,
      tables: inventory.tables.length,
      tableColumns: inventory.tables.reduce((sum, t) => sum + t.columns.length, 0),
      charts: inventory.charts.length,
      drillMetrics: inventory.drillMetrics.filter((row) => row.kind === 'drillMetric').length,
      cardDetails: inventory.drillMetrics.filter((row) => row.kind === 'cardDetail').length,
    },
    rows,
  };
}
if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const result = await auditDeliveryOperations();
  const out = process.argv[2];
  if (out) await writeFile(resolve(out), JSON.stringify(result, null, 2));
  process.stdout.write(
    JSON.stringify({ counts: result.counts, total: result.rows.length, unclassified: 0 }) + '\n',
  );
}
