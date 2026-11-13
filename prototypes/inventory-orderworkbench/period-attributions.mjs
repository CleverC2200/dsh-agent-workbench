export function collectDirectorMembers(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = JSON.stringify([row.base,row.sku]);
    if (!groups.has(key)) groups.set(key,{base:row.base,sku:row.sku,director:row.director,directors:new Set(),items:new Set()});
    const group=groups.get(key);
    if (group.director!==row.director) throw Object.assign(Error('总监映射在读取期间发生变化'),{code:'SOURCE_CHANGED'});
    if (row.director_value!==null) group.directors.add(row.director_value);
    if (row.item_value!==null) group.items.add(row.item_value);
  }
  return [...groups.values()].map(group=>{
    const directors=[...group.directors],items=[...group.items];
    if ((directors.length===0&&group.director!==null)||(directors.length>0&&!group.directors.has(group.director)))
      throw Object.assign(Error('总监映射成员不完整'),{code:'RESULT_INCOMPLETE'});
    return {base:group.base,sku:group.sku,director:group.director,names:directors.length,
      directors,item:items.length===1?items[0]:null,items:items.length};
  });
}

export function applyPeriodAttributions(sections, mappings, sharedItems = []) {
  const byKey = new Map(mappings.filter(row => row.base && row.sku)
    .map(row => [JSON.stringify([row.base, row.sku]), row]));
  const bySku = new Map(sharedItems.map(row => [row.sku, row]));
  const observed = new Map();
  for (const part of sections.filter(part => ['orders', 'stock'].includes(part.id)))
    for (const row of part.rows) {
      if (!row.base || !row.sku) continue;
      const key = JSON.stringify([row.base, row.sku]);
      if (!observed.has(key)) observed.set(key, new Set());
      if (row.item) observed.get(key).add(row.item);
    }
  for (const section of sections.filter(part => ['orders', 'stock', 'ages'].includes(part.id))) {
    for (const row of section.rows) {
      const key = JSON.stringify([row.base, row.sku]);
      const mapping = byKey.get(key);
      const candidates = observed.get(key);
      const shared = bySku.get(row.sku);
      const item = Number(mapping?.items) > 1 ? null
        : Number(mapping?.items) === 1 ? mapping.item
        : shared ? (Number(shared.names) === 1 ? shared.item : null)
        : (candidates?.size === 1 ? [...candidates][0] : null);
      if (section.id === 'ages') row.item = item;
      else if (!row.item) row.item = item;
      row.director = mapping?.director ?? null;
      row.names = Number(mapping?.names ?? 0);
      row.directors = mapping?.directors;
      row.periodAttribution = true;
    }
  }
}
