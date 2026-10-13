/** One local HTTP envelope; each query retains its own GEA authorization/result. */
export function createQueryBatch(transport: (method: string, parameters: any) => Promise<any>) {
  let pending: Array<{ parameters: any; resolve: (v: any) => void; reject: (e: any) => void }> = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  const flush = () => {
    timer = undefined;
    let count = 0,
      bytes = 0;
    while (count < Math.min(8, pending.length)) {
      const size = JSON.stringify(pending[count].parameters).length;
      if (count && bytes + size > 450000) break;
      bytes += size;
      count++;
    }
    const items = pending.splice(0, count);
    if (pending.length) timer = setTimeout(flush, 0);
    void transport('sql', { queries: items.map((i) => i.parameters), responseFormat: 'rows' })
      .then((response) => {
        if (!Array.isArray(response.results) || response.results.length !== items.length)
          throw Error('GEA_SQL_BATCH_INVALID');
        response.results.forEach((result: any, index: number) => {
          if (!result.ok) {
            items[index].reject(Error(result.error));
            return;
          }
          const value = result.value;
          // Older hosts may still return both aliases; preserve their exact response.
          if (value && Array.isArray(value.rows) && !('records' in value))
            value.records = value.rows;
          items[index].resolve(value);
        });
      })
      .catch((error) => items.forEach((i) => i.reject(error)));
  };
  return (parameters: any) =>
    new Promise((resolve, reject) => {
      pending.push({ parameters, resolve, reject });
      timer ??= setTimeout(flush, 0);
    });
}
