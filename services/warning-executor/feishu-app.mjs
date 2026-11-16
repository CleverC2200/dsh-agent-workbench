import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';

const applicationId = 'cli_aaf07a77f7789bfb';
const fail = (message, unknown = false) => {
  throw Object.assign(Error(message), { unknown });
};
export function createFeishuWarningApp(config, fetchImpl = fetch) {
  let cachedToken;
  let requestingToken;
  const configured = () =>
    config?.appId === applicationId &&
    typeof config.appSecret === 'string' &&
    !!config.appSecret.trim();
  async function token() {
    if (!configured()) fail('预警服务尚未配置指定的飞书应用');
    if (cachedToken?.until > Date.now()) return cachedToken.value;
    requestingToken ??= (async () => {
      const response = await fetchImpl('https://accounts.feishu.cn/oauth/v3/token', {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: config.appId,
          client_secret: config.appSecret,
        }),
      });
      const body = await response.json();
      if (
        !response.ok ||
        body.code !== 0 ||
        typeof body.access_token !== 'string' ||
        !body.access_token ||
        !Number.isFinite(body.expires_in) ||
        body.expires_in <= 60
      )
        fail(
          '飞书应用鉴权失败（' + String(body.code ?? response.status) + '），请核对服务端应用配置',
        );
      cachedToken = { value: body.access_token, until: Date.now() + (body.expires_in - 60) * 1000 };
      return cachedToken.value;
    })().finally(() => {
      requestingToken = undefined;
    });
    return requestingToken;
  }
  async function resolveEmployee(person) {
    const employeeNumber = String(person.workNo || person.username || '').trim();
    if (!employeeNumber || !person.realname) fail('GEA人员缺少姓名或工号，无法核对飞书身份');
    const authorization = 'Bearer ' + (await token());
    const candidates = new Map();
    const visited = new Set();
    let pageToken = '';
    for (let page = 0; page < 10; page++) {
      const response = await fetchImpl(
        'https://open.feishu.cn/open-apis/directory/v1/employees/search?employee_id_type=open_id',
        {
          method: 'POST',
          redirect: 'error',
          signal: AbortSignal.timeout(20000),
          headers: { Authorization: authorization, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: person.realname,
            page_request: { page_size: 100, ...(pageToken ? { page_token: pageToken } : {}) },
            required_fields: [
              'base_info.employee_id',
              'base_info.name.name',
              'base_info.active_status',
              'base_info.is_resigned',
              'work_info.job_number',
            ],
          }),
        },
      );
      const body = await response.json();
      if (!response.ok || body.code !== 0)
        fail(
          '飞书通讯录查询失败（' +
            String(body.code ?? response.status) +
            '），请核对应用权限及可见范围',
        );
      if (
        !Array.isArray(body.data?.employees) ||
        typeof body.data.page_response?.has_more !== 'boolean'
      )
        fail('飞书通讯录回执不完整');
      for (const employee of body.data.employees) {
        if (employee.work_info?.job_number !== employeeNumber) continue;
        const base = employee.base_info;
        if (base?.active_status !== 2 || base.is_resigned !== false)
          fail('该工号对应的飞书账号未激活、已冻结或已离职');
        if (!/^ou_[A-Za-z0-9]+$/.test(base.employee_id || '')) fail('飞书接收身份回执无效');
        candidates.set(base.employee_id, {
          openId: base.employee_id,
          name: base.name?.name?.default_value || person.realname,
        });
      }
      if (!body.data.page_response.has_more) {
        if (candidates.size !== 1)
          fail(
            candidates.size
              ? '该工号对应多个飞书账号，请核对通讯录'
              : '飞书应用可见范围内未找到与所选GEA工号一致的在职人员',
          );
        return candidates.values().next().value;
      }
      pageToken = body.data.page_response.page_token;
      if (typeof pageToken !== 'string' || !pageToken || visited.has(pageToken))
        fail('飞书通讯录分页不完整，未选择接收人');
      visited.add(pageToken);
    }
    fail('飞书通讯录查询超出分页上限，未选择接收人');
  }
  async function send({ ownerKey, person, uuid, card }) {
    if (!config.receiptDirectory) fail('飞书预警服务未配置回执目录');
    const recipient = await resolveEmployee(person);
    const key = createHash('sha256')
      .update(JSON.stringify([ownerKey, config.appId, uuid]))
      .digest('hex');
    const fingerprint = createHash('sha256')
      .update(JSON.stringify([recipient.openId, card]))
      .digest('hex');
    await mkdir(config.receiptDirectory, { recursive: true, mode: 0o700 });
    const file = join(config.receiptDirectory, key + '.json');
    try {
      await writeFile(file, JSON.stringify({ fingerprint, state: 'unknown' }), {
        flag: 'wx',
        mode: 0o600,
      });
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      let prior;
      try {
        prior = JSON.parse(await readFile(file, 'utf8'));
      } catch {
        fail('飞书通知回执无法核实，不自动重发', true);
      }
      if (prior.fingerprint !== fingerprint)
        fail('同一预警通知编号的接收人或内容已变化，不能重发', true);
      if (/^om_[A-Za-z0-9]+$/.test(prior.messageId || ''))
        return { ok: true, messageId: prior.messageId };
      fail('飞书发送结果待核实，不自动重发', true);
    }
    try {
      const response = await fetchImpl(
        'https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=open_id',
        {
          method: 'POST',
          redirect: 'error',
          signal: AbortSignal.timeout(30000),
          headers: {
            Authorization: 'Bearer ' + (await token()),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            receive_id: recipient.openId,
            msg_type: 'interactive',
            content: JSON.stringify(card),
            uuid: key.slice(0, 32),
          }),
        },
      );
      const body = await response.json();
      if (!response.ok || body.code !== 0 || !/^om_[A-Za-z0-9]+$/.test(body.data?.message_id || ''))
        fail(
          '飞书通知未取得成功回执（' + String(body.code ?? response.status) + '），请核对原通知',
          true,
        );
      const temporary = file + '.tmp';
      await writeFile(temporary, JSON.stringify({ fingerprint, messageId: body.data.message_id }), {
        mode: 0o600,
      });
      await rename(temporary, file);
      return { ok: true, messageId: body.data.message_id };
    } catch (error) {
      fail(error.unknown ? error.message : '飞书发送结果待核实，不自动重发', true);
    }
  }
  return { configured, resolveEmployee, send, appId: applicationId };
}
