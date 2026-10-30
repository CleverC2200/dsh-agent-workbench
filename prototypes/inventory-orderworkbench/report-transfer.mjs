/** Compress before crossing the page bridge; no report fields are removed. */
export function packWorkbenchReport(report) {
  if (!report?.facts?.periods) return report;
  const periods = Object.fromEntries(
    Object.entries(report.facts.periods).map(([key, period]) => [
      key,
      {
        ...period,
        sections: period.sections.map((section) => {
          if (section.id !== 'ontime' || !section.rows?.length) return section;
          const columns = Object.keys(section.rows[0]);
          if (
            !section.rows.every(
              (row) =>
                Object.keys(row).length === columns.length &&
                columns.every(
                  (column) =>
                    Object.hasOwn(row, column) &&
                    (row[column] === null ||
                      ['string', 'number', 'boolean'].includes(typeof row[column])),
                ),
            )
          )
            return section;
          const dictionaries = columns.map(() => []),
            indexes = columns.map(() => new Map());
          const packedRows = section.rows.map((row) =>
            columns.map((column, index) => {
              const value = row[column],
                map = indexes[index];
              if (!map.has(value)) {
                map.set(value, dictionaries[index].length);
                dictionaries[index].push(value);
              }
              return map.get(value);
            }),
          );
          return {
            ...section,
            rows: [],
            rowEncoding: 'dictionary-v1',
            columns,
            dictionaries,
            packedRows,
          };
        }),
      },
    ]),
  );
  return { ...report, facts: { ...report.facts, periods } };
}
export function unpackWorkbenchReport(report) {
  if (!report?.facts?.periods) return report;
  const periods = Object.fromEntries(
    Object.entries(report.facts.periods).map(([key, period]) => [
      key,
      {
        ...period,
        sections: period.sections.map((section) => {
          if (!section.rowEncoding) return section;
          const { rowEncoding, columns, dictionaries, packedRows, ...rest } = section;
          if (
            rowEncoding !== 'dictionary-v1' ||
            !Array.isArray(columns) ||
            !Array.isArray(dictionaries) ||
            !Array.isArray(packedRows) ||
            columns.length !== dictionaries.length ||
            columns.some((column) => typeof column !== 'string') ||
            dictionaries.some((values) => !Array.isArray(values))
          )
            throw Error('ORDER_REPORT_ROWS_INVALID');
          const rows = packedRows.map((row) => {
            if (!Array.isArray(row) || row.length !== columns.length)
              throw Error('ORDER_REPORT_ROWS_INVALID');
            return Object.fromEntries(
              columns.map((column, index) => {
                const position = row[index];
                if (
                  !Number.isSafeInteger(position) ||
                  position < 0 ||
                  position >= dictionaries[index].length
                )
                  throw Error('ORDER_REPORT_ROWS_INVALID');
                return [column, dictionaries[index][position]];
              }),
            );
          });
          return { ...rest, rows };
        }),
      },
    ]),
  );
  return { ...report, facts: { ...report.facts, periods } };
}
export async function encodeReportRequest(request) {
  if (request.operation !== 'save') return request;
  const bytes = new TextEncoder().encode(JSON.stringify(packWorkbenchReport(request.report)));
  if (bytes.length > 20_000_000) throw Error('ORDER_REPORT_TOO_LARGE');
  const compressed = new Uint8Array(
    await new Response(
      new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip')),
    ).arrayBuffer(),
  );
  let binary = '';
  for (let offset = 0; offset < compressed.length; offset += 8192)
    binary += String.fromCharCode(...compressed.subarray(offset, offset + 8192));
  return { ...request, report: { encoding: 'gzip-base64', data: btoa(binary) } };
}
