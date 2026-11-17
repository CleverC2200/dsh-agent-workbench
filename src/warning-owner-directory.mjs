import {warningOwnerDirectory,baseOwners,categoryOwners} from './warning-recipient-routing.mjs';

export function validateOwnerDirectory(rows) {
  if (!Array.isArray(rows) || rows.length > 500) throw Error('责任关系最多维护500条');
  const seen = new Set();
  return rows.map(row => {
    const type = String(row.type || '');
    const scope = String(row.scope || '').trim();
    const name = String(row.name || '').trim();
    const employeeNo = String(row.employeeNo || '').trim();
    const [base,category] = scope.split(' × ');
    const valid = type === '基地' ? Object.hasOwn(baseOwners,scope)
      : type === '品类' ? Object.hasOwn(categoryOwners,scope)
      : type === '基地×品类' && scope === base+' × '+category && Object.hasOwn(baseOwners,base) && Object.hasOwn(categoryOwners,category);
    if (!valid || !name || name.length > 80 || !/^\d{5,20}$/.test(employeeNo)) throw Error('请填写有效的责任范围、姓名和工号');
    const key = JSON.stringify([type,scope,employeeNo]);
    if (seen.has(key)) throw Error('相同范围下的同一工号不能重复配置');
    seen.add(key);
    return {type,scope,name,employeeNo};
  });
}

// The directory follows the authenticated warning owner's scope, never a page-supplied identity.
export function createOwnerDirectoryStore(pool) {
  let ready;
  const init = () => ready ??= pool.query(`CREATE TABLE IF NOT EXISTS gea_warning_local_test.warning_owner_directories (
    owner_key text PRIMARY KEY, revision integer NOT NULL, payload jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())`);
  return {
    async load(key) {
      if (!key) throw Error('责任人清单缺少所属用户');
      await init();
      const result = await pool.query('SELECT revision,payload FROM gea_warning_local_test.warning_owner_directories WHERE owner_key=$1',[key]);
      return result.rows.length ? {revision:result.rows[0].revision,owners:result.rows[0].payload} : {revision:0,owners:warningOwnerDirectory()};
    },
    async save(key,revision,rows) {
      if (!key || !Number.isInteger(revision) || revision < 0) throw Error('责任人清单版本无效');
      const owners = validateOwnerDirectory(rows);
      await init();
      const result = revision === 0
        ? await pool.query('INSERT INTO gea_warning_local_test.warning_owner_directories(owner_key,revision,payload) VALUES($1,1,$2) ON CONFLICT DO NOTHING RETURNING revision',[key,JSON.stringify(owners)])
        : await pool.query('UPDATE gea_warning_local_test.warning_owner_directories SET payload=$3,revision=revision+1,updated_at=now() WHERE owner_key=$1 AND revision=$2 RETURNING revision',[key,revision,JSON.stringify(owners)]);
      if (!result.rows.length) throw Error('清单已被其他窗口修改，请刷新后重试');
      return {revision:result.rows[0].revision,owners};
    },
  };
}
