import { operationsPacketSize } from '../../business/inventory-orderfulfillment/operations-queries.mjs';
export function operationPackets(rows, columns) {
  const packets = [];
  for (let index = 0; index < rows.length; index += operationsPacketSize) {
    const members = rows
      .slice(index, index + operationsPacketSize)
      .map((row, offset) =>
        [index + offset + 1, ...columns.map((key) => row[key] ?? null)]
          .map((value) =>
            value === null ? 'N' : 'V' + Buffer.byteLength(String(value)) + ':' + String(value),
          )
          .join(''),
      );
    packets.push({
      packet_index: String(index / operationsPacketSize),
      packet_count: String(members.length),
      packet_scope_total: String(rows.length),
      packet_rows: members,
    });
  }
  return packets;
}
