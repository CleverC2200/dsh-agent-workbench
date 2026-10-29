/** Disjoint customer partitions from the same observation as the visible KPI cards. */
export function customerRegionalValues(rows, customerCodes) {
  const scope = new Set(customerCodes ?? []);
  return Object.fromEntries(['region', 'province'].map(dimension => {
    const groups = new Map();
    for (const row of rows) {
      if (!scope.has(row.code)) continue;
      const name = row[dimension] || '区域未知';
      const group = groups.get(name) ?? { name, customerCount: 0, coveredCount: 0, knownValue: 0 };
      group.customerCount++;
      if (Number.isFinite(row.value)) {
        group.coveredCount++;
        group.knownValue += row.value;
      }
      groups.set(name, group);
    }
    const completeGroups = [...groups.values()].map(group => ({ ...group,
        knownValue: group.coveredCount ? group.knownValue : null,
        missingCount: group.customerCount - group.coveredCount,
        complete: group.customerCount === group.coveredCount,
      }));
    return [dimension, { dimension, unit: '万元', source: 'page-governed-sql-observation',
      customerCount: completeGroups.reduce((sum,g)=>sum+g.customerCount,0),
      knownValueTotal: completeGroups.some(g=>g.coveredCount) ? completeGroups.reduce((sum,g)=>sum+(g.knownValue??0),0) : null,
      missingCount: completeGroups.reduce((sum,g)=>sum+g.missingCount,0),
      groupCount: completeGroups.length,
      groupsByName: Object.fromEntries(completeGroups.map(group=>[group.name,group])),
    }];
  }));
}
