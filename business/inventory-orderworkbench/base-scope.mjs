// Business-confirmed roll-up; retain unknown and other source base values.
export const workbenchBaseSql = (field) =>
  `CASE WHEN TRIM(${field}) IN ('成都分仓','上海分仓') THEN '西南' ELSE ${field} END`;
