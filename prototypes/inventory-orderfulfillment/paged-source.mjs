import { QueryContractError } from '../../business/shared/configured-query-client.mjs';

export const fulfillmentCardQueries = ['orders.summary', 'orders.facts', 'execution.trace', 'trace.detail', 'shortage.detail'];

// A table page is never used as a card denominator. Each supplement still reads
// its complete counted input, restricted to the base/SKU keys on this page.
export async function readItemPage(reader, filters, {signal, page = 1, size = 20, base = null, search = null, inventory = true, onPage} = {}) {
  signal?.throwIfAborted();
  const pattern=search?'%'+search.toLowerCase().replace(/[\\%_]/g,character=>'\\'+character)+'%':null;
  const result = await reader.collection('sku.page', {...filters, list_base: base || null, list_search: pattern}, {signal, page, size});
  signal?.throwIfAborted();
  onPage?.({...result, serverPage: true});
  const values = [];
  for (let offset = 0; offset < result.rows.length; offset += 20) {
    const rows = result.rows.slice(offset, offset + 20);
    values.push({...filters, ...Object.fromEntries(Array.from({length: 20}, (_, index) => [
      ['page_base_' + index, rows[index]?.base ?? null],
      ['page_sku_' + index, rows[index]?.sku ?? null],
    ]).flat())});
  }
  const supplements = inventory ? await Promise.allSettled(['sku.age', 'sku.owners'].map(async id => {
    const parts = [];
    for (const scope of values) parts.push(await reader.all(id + '.page', scope, {signal}));
    if (parts.some(part => part.configVersion !== result.configVersion))
      throw new QueryContractError('QUERY_CONFIG_CHANGED', '当前页补充数据配置已变化，请刷新');
    return {...result, ...parts[0], rows: parts.flatMap(part => part.rows), total: parts.reduce((sum, part) => sum + part.total, 0)};
  })) : [];
  signal?.throwIfAborted();
  return {result: {...result, serverPage: true}, ages: supplements[0], owners: supplements[1]};
}
