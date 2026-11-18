import { DatabaseSync } from 'node:sqlite';

export function cubeCalculationSql(source) {
  let sql = source
    .replace(/CAST\(([^()]+) AS DATETIME\)/g, 'CUBE_DATETIME($1)')
    .replace(/\bARRAY_AGG\(/g, 'json_group_array(')
    .replace(/\bRIGHT\(/g, 'CUBE_RIGHT(')
    .replace(/\b([a-z_]+)\s+AS\s*\(/gi, '$1 AS MATERIALIZED (')
    .replace(
      /\(CASE WHEN ([\w.]+) IS NULL THEN 'N' ELSE CONCAT\('V',\1\) END\)=\(CASE WHEN ([\w.]+) IS NULL THEN 'N' ELSE CONCAT\('V',\2\) END\)/g,
      '($1 IS $2)',
    );
  let match;
  while ((match = /\s([+-]) INTERVAL '(\d+)' (HOUR|DAY)/.exec(sql))) {
    const end = match.index;
    let start = end - 1;
    if (sql[start] === ')') {
      let depth = 1;
      for (start--; start >= 0; start--) {
        if (sql[start] === ')') depth++;
        else if (sql[start] === '(' && --depth === 0) break;
      }
      while (start > 0 && /[\w.]/.test(sql[start - 1])) start--;
    } else {
      while (start >= 0 && /[\w.]/.test(sql[start])) start--;
      start++;
    }
    sql =
      sql.slice(0, start) +
      `datetime(${sql.slice(start, end)}, '${match[1]}${match[2]} ${match[3] === 'HOUR' ? 'hours' : 'days'}')` +
      sql.slice(end + match[0].length);
  }
  return sql;
}

export function createCubeCalculation() {
  const db = new DatabaseSync(':memory:');
  const numeric = new Set(
    'executeorderlineno orderstatus detailstatus change_order_qty dms_last_update_qty need_qty_origin qtyshipped is_virtual is_stat current_stock current_stock_60 available_stock main_sales_plan_v1 main_sales_plan_adj roll_sales_plan next_month_sales_plan transfer_out_plan_v1 transfer_out_plan_adj transfer_out_plan_roll next_month_out_plan order_qty_origin series_sort'.split(
      ' ',
    ),
  );
  db.function('CONCAT', { varargs: true }, (...values) =>
    values.some((x) => x === null) ? null : values.join(''),
  );
  db.function('GREATEST', { varargs: true }, (...values) =>
    values.some((x) => x === null) ? null : values.reduce((a, b) => (a > b ? a : b)),
  );
  db.function('LEAST', { varargs: true }, (...values) =>
    values.some((x) => x === null) ? null : values.reduce((a, b) => (a < b ? a : b)),
  );
  db.function('CUBE_DATETIME', (value) =>
    typeof value === 'string' && /^\d{4}-\d{2}-\d{2}[ T]/.test(value)
      ? value.replace('T', ' ').slice(0, 19)
      : null,
  );
  db.function('CUBE_RIGHT', (value, count) =>
    value === null || count === null ? null : String(value).slice(-Number(count)),
  );
  db.function('LENGTH', (value) =>
    value === null ? null : BigInt(Buffer.byteLength(String(value), 'utf8')),
  );
  return {
    table(name, columns, rows, { expand = false } = {}) {
      if (
        !/^[a-z_][a-z0-9_]*$/.test(name) ||
        columns.some((key) => !/^[a-z_][a-z0-9_]*$/.test(key))
      )
        throw Error('ORDER_CUBE_INVALID_RELATION');
      db.exec(
        `CREATE TABLE ${name}(${columns.map((key) => key + (numeric.has(key) ? ' NUMERIC' : ' TEXT')).join(',')})`,
      );
      const insert = db.prepare(`INSERT INTO ${name} VALUES(${columns.map(() => '?').join(',')})`);
      db.exec('BEGIN');
      try {
        for (const row of rows) {
          const count = expand ? row.record_count : 1;
          if (!Number.isSafeInteger(count) || count < 1)
            throw Error('ORDER_CUBE_INVALID_OBSERVATION_COUNT');
          for (let index = 0; index < count; index++)
            insert.run(...columns.map((key) => row[key] ?? null));
        }
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
      const keys = [
        'executeorderno',
        'cust_code',
        'cust_order_no',
        'material_code',
        'belong_base',
      ].filter((key) => columns.includes(key));
      if (keys.length) db.exec(`CREATE INDEX ${name}_identity ON ${name}(${keys.join(',')})`);
    },
    read(sql, parameters) {
      const statement = db.prepare(cubeCalculationSql(sql));
      const bindings = Object.fromEntries(
        [...new Set(sql.match(/:gea_p\d+\b/g) ?? [])].map((key) => {
          const name = key.slice(1),
            value = parameters[name];
          if (value === undefined) throw Error('ORDER_CUBE_MISSING_PARAMETER:' + name);
          return [name, typeof value === 'boolean' ? Number(value) : value];
        }),
      );
      const rows = statement.all(bindings).map((row) => Object.fromEntries(Object.entries(row)));
      return {
        success: true,
        rows,
        returnedColumns: statement.columns().map((column) => column.name),
        rejectedColumns: [],
        totalRowCount: rows.length,
        hasMorePages: false,
      };
    },
    close: () => db.close(),
  };
}
