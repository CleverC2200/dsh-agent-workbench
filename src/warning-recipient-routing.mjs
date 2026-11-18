export const baseOwners = Object.freeze({
  华东: true,
  华南: true,
  西南: true,
  遂平: true,
  郑州: true,
});
export const categoryOwners = Object.freeze({
  汤圆: true,
  饺子: true,
  调理肉制品: true,
  面点: true,
  休闲: true,
  馄饨: true,
  饼类: true,
  火锅: true,
  其余: true,
});

export function warningOwnerDirectory() {
  return [];
}

export function matchWarningOwners(scope, objectName, directory = []) {
  const parts = String(objectName ?? '')
    .normalize('NFKC')
    .replace(/\([A-Za-z0-9]+\)/g, '')
    .split(/[×*|/·｜-]/)
    .map((part) => part.trim());
  const bases = parts
    .map((part) => part.replace(/基地$/, ''))
    .filter((part) => Object.hasOwn(baseOwners, part));
  const categories = parts
    .map((part) => ({ 水饺: '饺子', 火锅料: '火锅' })[part] ?? part)
    .filter((part) => Object.hasOwn(categoryOwners, part));
  let matches = [];
  if (scope === '基地' && parts.length === 1 && bases.length === 1)
    matches = directory.filter((row) => row.type === '基地' && row.scope === bases[0]);
  if (scope === '品类' && parts.length === 1 && categories.length === 1)
    matches = directory.filter((row) => row.type === '品类' && row.scope === categories[0]);
  if (
    /^(品类[×*]基地|基地[×*]品类)$/.test(scope) &&
    parts.length === 2 &&
    bases.length === 1 &&
    categories.length === 1
  ) {
    matches = directory.filter(
      (row) => row.type === '基地×品类' && row.scope === bases[0] + ' × ' + categories[0],
    );
    if (!matches.length)
      matches = directory.filter(
        (row) =>
          (row.type === '基地' && row.scope === bases[0]) ||
          (row.type === '品类' && row.scope === categories[0]),
      );
  }
  return [...new Set(matches.map((row) => 'gea:' + row.employeeNo))];
}

export async function resolveWarningRoutes(rows, scope, lookup, directory = []) {
  const matched = rows.map((row) => ({
    row,
    accounts: matchWarningOwners(scope, row.objectName, directory),
  }));
  const accounts = [...new Set(matched.flatMap((item) => item.accounts))];
  const identities = new Map();
  let index = 0;
  await Promise.all(
    Array.from({ length: Math.min(4, accounts.length) }, async () => {
      while (index < accounts.length) {
        const account = accounts[index++];
        try {
          identities.set(account, await lookup(account));
        } catch {
          identities.set(account, null);
        }
      }
    }),
  );
  const routes = new Map(),
    unresolved = [];
  for (const { row, accounts: selected } of matched) {
    if (!selected.length) {
      if (row.status !== '健康') unresolved.push(row.objectName + '：未匹配负责人');
      continue;
    }
    const recipients = selected.map((account) => identities.get(account));
    routes.set(row.objectKey, [
      ...new Map(
        recipients
          .filter(Boolean)
          .map((recipient) => [
            JSON.stringify([
              recipient.transport,
              recipient.credentialProfile ?? 'default',
              recipient.receiveIdType,
              recipient.receiveId,
            ]),
            recipient,
          ]),
      ).values(),
    ]);
    if (recipients.some((recipient) => !recipient))
      unresolved.push(row.objectName + '：部分或全部飞书账号不可用');
  }
  return { routes, unresolved };
}
