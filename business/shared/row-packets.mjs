const fail = () => {
  throw Object.assign(Error('分组传输结果不完整，未使用部分数据'), {
    code: 'GEA_SQL_RESULT_INCOMPLETE',
  });
};
const integer = (value) => {
  if (!/^(0|[1-9]\d*)$/.test(String(value))) return fail();
  const number = Number(value);
  if (!Number.isSafeInteger(number)) return fail();
  return number;
};
export const rowPacketSize = 64;

/** Preserve every scalar, including null and decimal text, while reducing gateway pages. */
export function rowPacketSql(sql, columns, order, packetSize = rowPacketSize) {
  if (
    !Number.isSafeInteger(packetSize) ||
    packetSize < 1 ||
    packetSize > 1024 ||
    !columns.length ||
    new Set(columns).size !== columns.length ||
    !order.length ||
    columns.some((name) => !/^[a-z][a-z0-9_]*$/.test(name)) ||
    order.some((name) => !/^[a-z][a-z0-9_]*(?: DESC| ASC)?$/.test(name))
  )
    throw Error('INVALID_ROW_PACKET_CONTRACT');
  // Use approved scalar expressions so the gateway can still trace every
  // source field. JSON functions are not supported by its field analyser.
  const fields = ['packet_position', ...columns].map(
    (name) =>
      `CASE WHEN ${name} IS NULL THEN 'N' ELSE CONCAT('V',CAST(LENGTH(CAST(${name} AS VARCHAR)) AS VARCHAR),':',CAST(${name} AS VARCHAR)) END`,
  );
  return `WITH packet_source AS (${sql}), packet_numbered AS (
    SELECT ${columns.join(',')}, ROW_NUMBER() OVER (ORDER BY ${order.join(',')}) AS packet_position,
      COUNT(*) OVER () AS packet_scope_total FROM packet_source
  ) SELECT FLOOR((packet_position-1)/${packetSize}) AS packet_index,
    COUNT(*) AS packet_count, MAX(packet_scope_total) AS packet_scope_total,
    ARRAY_AGG(CONCAT(${fields.join(',')})) AS packet_rows
    FROM packet_numbered GROUP BY FLOOR((packet_position-1)/${packetSize}) ORDER BY packet_index`;
}

function readTuple(bytes, columns, start) {
  const values = [];
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let cursor = start;
  try {
    for (let field = 0; field <= columns.length; field++) {
      const tag = bytes[cursor++];
      if (tag === 78) {
        values.push(null);
        continue;
      }
      if (tag !== 86) return fail();
      const colon = bytes.indexOf(58, cursor);
      if (colon < cursor) return fail();
      const length = integer(decoder.decode(bytes.slice(cursor, colon)));
      if (length > bytes.length - colon - 1) return fail();
      values.push(decoder.decode(bytes.slice(colon + 1, colon + 1 + length)));
      cursor = colon + 1 + length;
    }
  } catch {
    return fail();
  }
  return {
    cursor,
    row: Object.fromEntries(
      ['packet_position', ...columns].map((name, index) => [name, values[index]]),
    ),
  };
}
export function decodeRowTuple(value, columns) {
  if (typeof value !== 'string' || value.length > 1000000) return fail();
  const bytes = new TextEncoder().encode(value);
  const result = readTuple(bytes, columns, 0);
  if (result.cursor !== bytes.length) return fail();
  return result.row;
}
function packetRows(value, columns) {
  if (Array.isArray(value)) return value.map((member) => decodeRowTuple(member, columns));
  if (typeof value !== 'string' || value.length > 20000000) return fail();
  try {
    const members = JSON.parse(value);
    if (!Array.isArray(members)) return fail();
    return members.map((member) => decodeRowTuple(member, columns));
  } catch {
    // Doris may serialize ARRAY<STRING> as quoted elements without JSON
    // escaping inner quotes. Byte lengths, not quote/comma splitting, delimit
    // the original values. Never eval or repair business strings heuristically.
    const bytes = new TextEncoder().encode(value.trim()),
      rows = [];
    let cursor = 0;
    const space = () => {
      while ([9, 10, 13, 32].includes(bytes[cursor])) cursor++;
    };
    if (bytes[cursor++] !== 91) return fail();
    space();
    if (bytes[cursor] === 93 && cursor === bytes.length - 1) return rows;
    while (cursor < bytes.length) {
      if (bytes[cursor++] !== 34) return fail();
      const result = readTuple(bytes, columns, cursor);
      cursor = result.cursor;
      rows.push(result.row);
      if (bytes[cursor++] !== 34) return fail();
      space();
      if (bytes[cursor] === 93 && cursor === bytes.length - 1) return rows;
      if (bytes[cursor++] !== 44) return fail();
      space();
    }
    return fail();
  }
}

export function decodeScalarArray(value) {
  return packetRows(value, []).map((row) => row.packet_position);
}

/** ARRAY_AGG has no guaranteed order. Positions prove coverage and restore the source order. */
export function unpackRowPackets(
  packets,
  columns,
  keyFields,
  maxRows = 100000,
  packetSize = rowPacketSize,
) {
  if (!Number.isSafeInteger(packetSize) || packetSize < 1 || packetSize > 1024) fail();
  const rows = [],
    positions = new Set(),
    keys = new Set(),
    groups = new Set();
  let total;
  for (const packet of packets) {
    const index = integer(packet.packet_index),
      count = integer(packet.packet_count);
    const scope = integer(packet.packet_scope_total);
    if (!scope || scope > maxRows || (total !== undefined && total !== scope) || groups.has(index))
      fail();
    total = scope;
    groups.add(index);
    const members = packetRows(packet.packet_rows, columns);
    if (members.length !== count || count < 1 || count > packetSize) fail();
    for (const row of members) {
      if (
        !row ||
        typeof row !== 'object' ||
        Array.isArray(row) ||
        Object.keys(row).length !== columns.length + 1 ||
        columns.some(
          (name) =>
            !Object.hasOwn(row, name) || (row[name] !== null && typeof row[name] !== 'string'),
        )
      )
        fail();
      const position = integer(row.packet_position);
      if (
        position < 1 ||
        position > total ||
        positions.has(position) ||
        Math.floor((position - 1) / packetSize) !== index
      )
        fail();
      const key = JSON.stringify(keyFields.map((name) => row[name]));
      if (keys.has(key)) fail();
      keys.add(key);
      positions.add(position);
      const { packet_position: _position, ...values } = row;
      rows.push({ position, values });
    }
  }
  if (rows.length !== (total ?? 0) || groups.size !== Math.ceil((total ?? 0) / packetSize)) fail();
  return rows.sort((a, b) => a.position - b.position).map((row) => row.values);
}
