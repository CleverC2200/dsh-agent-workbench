import { createQueryClient } from '../../business/shared/configured-query-client.mjs';
import {
  operationsDatasets,
  operationsPacketSize,
  operationsPacketColumns,
} from '../../business/inventory-orderfulfillment/operations-queries.mjs';
import { unpackRowPackets } from '../../business/shared/row-packets.mjs';

export function operationsValues(config, id, filters) {
  return Object.fromEntries(
    Object.values(config.queries[id].parameterSpec).map(({ name }) => [name, filters[name]]),
  );
}

export function createOperationsReader(config, execute) {
  const client = createQueryClient(config, async (request, options) => {
    const result = await execute(request, options);
    if (result?.hasMorePages === true || result?.truncated === true)
      throw Error('OPERATIONS_TRANSPORT_INCOMPLETE');
    return result;
  });
  return async (name, filters, { signal, page = 1, complete = false } = {}) => {
    const dataset = operationsDatasets[name];
    if (!dataset) throw Error('OPERATIONS_DATASET_NOT_REGISTERED');
    const id = 'operations.' + name;
    if (!Number.isSafeInteger(page) || page < 1 || page > 100000)
      throw Error('INVALID_OPERATIONS_PAGE');
    const packetId = id + '.packets';
    if (complete && config.queries[packetId]) {
      const result = await client.read(packetId, operationsValues(config, packetId, filters), {
        signal,
        requiredColumns: operationsPacketColumns,
      });
      if (result.rejectedColumns?.length) throw Error('PERMISSION_DENIED：明细字段未获完整授权');
      const rows = unpackRowPackets(
        result.rows,
        dataset.columns,
        dataset.keys,
        30000,
        operationsPacketSize,
      );
      return {
        ...result,
        rows,
        total: rows.length,
        returnedColumns: dataset.columns,
        readAt: new Date().toISOString(),
        scope: '当前用户授权及筛选范围完整分组',
        consistency: 'single_statement_validated_packets',
      };
    }
    const values = operationsValues(config, id, {
      ...filters,
      page_size: dataset.paged && !complete ? 50 : 200,
      offset: dataset.paged && !complete ? (page - 1) * 50 : 0,
    });
    if (!dataset.paged || complete) {
      const result = await client.readAll(id, values, {
        signal,
        keyFields: dataset.keys,
        requiredColumns: dataset.columns,
        maxRows: 30000,
        singlePageFirst: true,
      });
      return {
        ...result,
        readAt: new Date().toISOString(),
        scope: '当前用户授权及筛选范围完整分组',
      };
    }
    const countId = id + '.count';
    const countValues = operationsValues(config, countId, filters);
    const before = await client.read(countId, countValues, { signal, requiredColumns: ['total'] });
    const raw = before.rows.length === 1 ? before.rows[0].total : null;
    if (!/^(0|[1-9]\d*)$/.test(String(raw)) || !Number.isSafeInteger(Number(raw)))
      throw Error('INVALID_OPERATIONS_COUNT');
    const total = Number(raw);
    const current = Math.min(page, Math.max(1, Math.ceil(total / 50)));
    const result = await client.read(
      id,
      { ...values, offset: (current - 1) * 50 },
      {
        signal,
        requiredColumns: dataset.columns,
      },
    );
    const after = await client.read(countId, countValues, { signal, requiredColumns: ['total'] });
    if (
      before.configVersion !== result.configVersion ||
      after.configVersion !== result.configVersion
    )
      throw Error('QUERY_CONFIG_CHANGED');
    if (
      after.rows.length !== 1 ||
      Number(after.rows[0].total) !== total ||
      result.rows.length !== Math.min(50, Math.max(0, total - (current - 1) * 50))
    )
      throw Error('OPERATIONS_RESULT_INCOMPLETE');
    const keys = result.rows.map((row) => JSON.stringify(dataset.keys.map((key) => row[key])));
    if (new Set(keys).size !== keys.length) throw Error('UNSTABLE_PAGINATION');
    return {
      ...result,
      total,
      page: current,
      size: 50,
      readAt: new Date().toISOString(),
      scope: '服务端分页；不以当前页重算全量',
    };
  };
}
