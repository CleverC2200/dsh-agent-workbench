/** Fixed SQL templates only. Business values always travel as named scalar parameters. */
export function bindGovernedSql(sql: string, values: unknown[] = []) {
  const parameters: Record<string, string | number | boolean | null> = {};
  const put = (name: string, value: unknown) => {
    if (!(value === null || typeof value === 'string' || typeof value === 'boolean' ||
      (typeof value === 'number' && Number.isFinite(value)))) throw Error('GEA_SQL_PARAMETER_INVALID');
    parameters[name] = value;
    return ':' + name;
  };
  const bound = sql.replace(/'(?:''|[^'])*'|"(?:""|[^"])*"|--[^\r\n]*|\/\*[\s\S]*?\*\/|:scope_(\d+)\b|:list_(\d+)\b|=\s*ANY\(\$(\d+)::text\[\]\)|\$(\d+)\b/g,
    (token, scope, list, membership, scalar) => {
      const index = Number(scope || list || membership || scalar);
      if (!index) return token;
      if (index > values.length) throw Error('GEA_SQL_PARAMETER_MISSING');
      const value = values[index - 1];
      if (membership) {
        // Current branch order/SKU queries supply nonempty text lists. Keep
        // every business value in named scalar parameters, including quotes.
        if (!Array.isArray(value) || !value.length || value.some(item => typeof item !== 'string')) throw Error('GEA_SQL_PARAMETER_INVALID');
        return 'IN (' + value.map((item, i) => put(`list_${index}_${i}`, item)).join(', ') + ')';
      }
      if (scope) return put('scope_' + index, value === null);
      if (list) {
        if (value !== null && !Array.isArray(value)) throw Error('GEA_SQL_PARAMETER_INVALID');
        // Positive IN only: empty membership matches no rows, including nullable keys.
        const items = value === null || value.length === 0 ? [null] : value;
        return items.map((item, i) => put(`list_${index}_${i}`, item)).join(', ');
      }
      return put('gea_p' + index, value);
    });
  return {sql: bound, parameters};
}
