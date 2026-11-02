import test from 'node:test';
import assert from 'node:assert/strict';
import { rowPacketSql, unpackRowPackets } from '../business/shared/row-packets.mjs';

const columns = ['cust_code', 'value', 'note'];
const tuple = (values) =>
  values
    .map((value) => (value === null ? 'N' : 'V' + Buffer.byteLength(value) + ':' + value))
    .join('');
const packets = (rows) =>
  Array.from({ length: Math.ceil(rows.length / 64) }, (_, group) => ({
    packet_index: String(group),
    packet_count: String(Math.min(64, rows.length - group * 64)),
    packet_scope_total: String(rows.length),
    packet_rows: JSON.stringify(
      rows
        .slice(group * 64, group * 64 + 64)
        .map((row, index) =>
          tuple([String(group * 64 + index + 1), ...columns.map((name) => row[name])]),
        )
        .reverse(),
    ),
  })).reverse();
const input = Array.from({ length: 130 }, (_, index) => ({
  cust_code: String(index).padStart(5, '0'),
  value: '99999999999999.123456',
  note: index % 2 ? null : '中文 "\n🧊',
}));
const decode = (rows) => unpackRowPackets(rows, columns, ['cust_code']);

test('packets restore all original rows despite unordered ARRAY_AGG and preserve decimal text/null/UTF-8', () => {
  assert.deepEqual(decode(packets(input)), input);
  assert.deepEqual(decode([]), []);
  const doris = packets(input).map((packet) => ({
    ...packet,
    packet_rows:
      '[' +
      JSON.parse(packet.packet_rows)
        .map((member) => '"' + member + '"')
        .join(', ') +
      ']',
  }));
  assert.deepEqual(decode(doris), input);
  const sql = rowPacketSql('SELECT cust_code,value,note FROM facts', columns, [
    'value DESC',
    'cust_code',
  ]);
  assert.match(sql, /COUNT\(\*\) OVER \(\)/);
  assert.match(sql, /ROW_NUMBER\(\) OVER \(ORDER BY value DESC,cust_code\)/);
  assert.match(sql, /CAST\(value AS VARCHAR\)/);
  assert.doesNotMatch(sql, /packet_source\.\*/);
  assert.throws(() => rowPacketSql('SELECT 1', ['bad;column'], ['cust_code']));
});

test('missing packets, changed counts, duplicate keys, malformed JSON and omitted/null positions never publish partial data', () => {
  const original = packets(input);
  const invalid = [];
  invalid.push(original.slice(1));
  const changed = structuredClone(original);
  changed[0].packet_scope_total = '131';
  invalid.push(changed);
  const count = structuredClone(original);
  count[0].packet_count = '1';
  invalid.push(count);
  const malformed = structuredClone(original);
  malformed[0].packet_rows = 'truncated';
  invalid.push(malformed);
  const repeated = [...original, original[0]];
  invalid.push(repeated);
  const duplicate = [...input];
  duplicate[1] = { ...duplicate[0] };
  invalid.push(packets(duplicate));
  for (const mode of ['value', 'packet_position']) {
    const missing = packets(input);
    const members = JSON.parse(missing[0].packet_rows);
    members[0] = mode === 'value' ? members[0].slice(0, -1) : members[0].replace(/^V\d+:\d+/, 'N');
    missing[0].packet_rows = members;
    invalid.push(missing);
  }
  for (const value of invalid)
    assert.throws(() => decode(value), { code: 'GEA_SQL_RESULT_INCOMPLETE' });
  assert.throws(() => unpackRowPackets(original, columns, ['cust_code'], 100), {
    code: 'GEA_SQL_RESULT_INCOMPLETE',
  });
});
