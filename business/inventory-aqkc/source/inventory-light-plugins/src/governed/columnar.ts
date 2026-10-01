/** Preserve field-level RETURN lineage: each output aggregates only that same field.
 * No whole-row JSON, synthetic values, windows or hidden permission fields.
 */
export function columnarQuery(sql: string): string | null {
  const tokens = [...sql.matchAll(/'(?:''|[^'])*'|"(?:""|[^"])*"|--[^\r\n]*|\/\*[\s\S]*?\*\/|[A-Za-z_][A-Za-z0-9_$]*|[(),]/g)];
  let depth = 0, start = -1;
  const columns: string[] = [];
  const add = (end: number) => {
    const expression = sql.slice(start, end).trim();
    const match = expression.match(/\bAS\s+(?:"([A-Za-z_][A-Za-z0-9_$]*)"|([A-Za-z_][A-Za-z0-9_$]*))\s*$/i);
    if (!match) return false;
    columns.push(match[1] ?? match[2]);
    return true;
  };
  for (const token of tokens) {
    const word = token[0].toUpperCase();
    if (word === '(') depth++;
    else if (word === ')') depth--;
    else if (depth === 0 && word === 'SELECT' && start < 0) start = token.index! + word.length;
    else if (depth === 0 && start >= 0 && word === ',') {
      if (!add(token.index!)) return null;
      start = token.index! + 1;
    } else if (depth === 0 && start >= 0 && word === 'FROM') {
      if (!add(token.index!) || new Set(columns).size !== columns.length) return null;
      const projection = columns.map(c => `CAST(JSON_AGG("dsh_columns"."${c}") AS TEXT) AS "${c}"`).join(',\n');
      return `SELECT ${projection}\nFROM (\n${sql.replace(/;\s*$/, '')}\n) AS "dsh_columns"`;
    }
  }
  return null;
}

export function unpackColumns(result: any) {
  if (result.rows.length !== 1) throw Error('GEA_COLUMNAR_RESULT_INVALID');
  const entries = Object.entries(result.rows[0]).map(([key, value]) => [key, typeof value === 'string' ? JSON.parse(value) : value] as const);
  const length = entries.find(([,v]) => Array.isArray(v))?.[1].length ?? 0;
  if (length > 200000 || entries.some(([,v]) => v !== null && (!Array.isArray(v) || v.length !== length)) || (length && entries.some(([,v])=>v === null)))
    throw Error('GEA_COLUMNAR_RESULT_INVALID');
  const rows = Array.from({length}, (_,i) => Object.fromEntries(entries.map(([key,value])=>[key,value[i]])));
  return {...result, rows, records: rows, total: length};
}
