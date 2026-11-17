export const baseOwners = {
  华东: ['刘壮壮', '10008447'],
  华南: ['连帅斌', '10008296'],
  西南: ['胡建国', '10001035'],
  遂平: ['张光照', '10007538'],
  郑州: ['李琳', '10001679'],
};

export const categoryOwners = {
  汤圆: ['刘壮壮', '10008447'],
  饺子: ['连帅斌', '10008296'],
  调理肉制品: ['胡建国', '10001035'],
  面点: ['张光照', '10007538'],
  休闲: ['李琳', '10001679'],
  馄饨: ['陈勇浩', '10006800'],
  饼类: ['张心开', '10001701'],
  火锅: ['田庚', '10008584'],
  其余: ['刘壮壮', '10008447'],
};

export function warningOwnerDirectory() {
  return [
    ...Object.entries(baseOwners).map(([scope,[name,employeeNo]]) => ({type:'基地',scope,name,employeeNo})),
    ...Object.entries(categoryOwners).map(([scope,[name,employeeNo]]) => ({type:'品类',scope,name,employeeNo})),
  ];
}

export function matchWarningOwners(scope, objectName, directory = warningOwnerDirectory()) {
  const parts = String(objectName ?? '').normalize('NFKC').replace(/（[A-Za-z0-9]+）|\([A-Za-z0-9]+\)/g,'').split(/[×*|/·｜-]/).map(part => part.trim());
  const bases = parts.map(part => part.replace(/基地$/, '')).filter(part => Object.hasOwn(baseOwners,part));
  const categories = parts.map(part => ({水饺:'饺子',火锅料:'火锅'})[part] ?? part).filter(part => Object.hasOwn(categoryOwners,part));
  let matches = [];
  if(scope==='基地' && parts.length===1 && bases.length===1) matches=directory.filter(row=>row.type==='基地'&&row.scope===bases[0]);
  if(scope==='品类' && parts.length===1 && categories.length===1) matches=directory.filter(row=>row.type==='品类'&&row.scope===categories[0]);
  if(/^(品类[×*]基地|基地[×*]品类)$/.test(scope)&&parts.length===2&&bases.length===1&&categories.length===1){
    matches=directory.filter(row=>row.type==='基地×品类'&&row.scope===bases[0]+' × '+categories[0]);
    if(!matches.length) matches=directory.filter(row=>row.type==='基地'&&row.scope===bases[0]||row.type==='品类'&&row.scope===categories[0]);
  }
  return [...new Set(matches.map(row=>'gea:'+row.employeeNo))];
}

export async function resolveWarningRoutes(rows, scope, lookup, directory = warningOwnerDirectory()) {
  const routes = new Map();
  const identities = new Map();
  const unresolved = [];
  await Promise.all(rows.map(async row => {
    const accounts = matchWarningOwners(scope, row.objectName, directory);
    if (!accounts.length) {
      if (row.status !== '健康') unresolved.push(row.objectName + '：未匹配负责人');
      return;
    }
    const recipients = await Promise.all(accounts.map(account => {
      if (!identities.has(account)) identities.set(account, Promise.resolve().then(() => lookup(account)).catch(() => null));
      return identities.get(account);
    }));
    routes.set(row.objectKey, recipients.filter(Boolean));
    if (recipients.some(recipient => !recipient)) unresolved.push(row.objectName + '：部分或全部飞书账号不可用');
  }));
  return { routes, unresolved };
}
