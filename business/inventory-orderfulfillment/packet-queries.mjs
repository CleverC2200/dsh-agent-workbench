import { rowPacketSql } from '../shared/row-packets.mjs';

export const fulfillmentPacketOrders = {
  'orders.facts': ['executeorderno', 'executeorderlineno'],
  'execution.trace': ['executeorderno', 'cust_code'],
  'trace.detail': [
    'order_no',
    'customer_code',
    'source_kind',
    'execute_no',
    'sku',
    'need_billing_at',
    'pickup_point',
    'source_stage',
    'prepare_status',
    'dispatch_status',
    'loading_status',
    'transit_status',
  ],
  'shortage.detail': ['order_no', 'customer_code', 'base', 'execution_order', 'sku'],
};

export function addFulfillmentPacketQueries(config) {
  const result = structuredClone(config);
  for (const [id, order] of Object.entries(fulfillmentPacketOrders)) {
    const original = result.queries[id];
    if (!original) continue;
    const unpaged = original.request.sql.replace(/\s+LIMIT :gea_p12 OFFSET :gea_p13\s*$/i, '');
    const offset = unpaged.toUpperCase().lastIndexOf(' ORDER BY ');
    if (
      unpaged === original.request.sql ||
      offset < 0 ||
      !/^[\w., ]+$/.test(unpaged.slice(offset + 10))
    )
      throw Error('INVALID_FULFILLMENT_PACKET_SOURCE');
    const sql = unpaged.slice(0, offset);
    const packets = rowPacketSql(sql, original.resultColumns, order);
    const packetId = id + '.packets';
    const count = result.queries[original.pagination.countQuery];
    result.queries[packetId] = {
      ...original,
      request: { ...original.request, sql: packets + ' LIMIT :gea_p12 OFFSET :gea_p13' },
      resultColumns: ['packet_index', 'packet_count', 'packet_scope_total', 'packet_rows'],
      pagination: { countQuery: packetId + '.count' },
    };
    result.queries[packetId + '.count'] = {
      ...count,
      request: { ...count.request, sql: 'SELECT COUNT(*) AS total FROM (' + packets + ') counted' },
    };
  }
  return result;
}
