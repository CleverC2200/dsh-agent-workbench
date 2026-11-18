import { baseOwners, categoryOwners } from './warning-recipient-routing.mjs';

export function validateOwnerDirectory(rows) {
  if (!Array.isArray(rows) || rows.length > 500) throw Error('责任关系最多维护500条');
  const seen = new Set();
  return rows.map((row) => {
    if (!row || typeof row !== 'object' || Array.isArray(row))
      throw Error('请填写有效的责任范围、姓名和工号');
    const type = String(row.type || ''),
      scope = String(row.scope || '').trim(),
      name = String(row.name || '').trim(),
      employeeNo = String(row.employeeNo || '').trim();
    const [base, category] = scope.split(' × ');
    const valid =
      type === '基地'
        ? Object.hasOwn(baseOwners, scope)
        : type === '品类'
          ? Object.hasOwn(categoryOwners, scope)
          : type === '基地×品类' &&
            scope === base + ' × ' + category &&
            Object.hasOwn(baseOwners, base) &&
            Object.hasOwn(categoryOwners, category);
    if (!valid || !name || name.length > 80 || !/^\d{5,20}$/.test(employeeNo))
      throw Error('请填写有效的责任范围、姓名和工号');
    const key = JSON.stringify([type, scope, employeeNo]);
    if (seen.has(key)) throw Error('相同范围下的同一工号不能重复配置');
    seen.add(key);
    return { type, scope, name, employeeNo };
  });
}
