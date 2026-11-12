import { createServer } from 'node:http';
import { createHash, timingSafeEqual, randomUUID } from 'node:crypto';
import { readFile, writeFile, rename } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const digest = (value) => createHash('sha256').update(String(value)).digest();
const same = (a, b) => timingSafeEqual(digest(a), digest(b));
const decode = (value) => {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};
const invalid = (message, status = 400) => {
  throw Object.assign(Error(message), { status });
};
const id = (value) => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
export function createWarningExecutor(config, fetchImpl = fetch) {
  let cookie = '',
    groupId = config.groupId;
  const identities = new Map(),
    work = new Map(),
    clients = new Map();
  const now = () => Date.now();
  let diskWrites = Promise.resolve();
  function persist() {
    if (!config.statePath) return Promise.resolve();
    const snapshot = JSON.stringify([...work.entries()]);
    const pending = diskWrites.then(async () => {
      await writeFile(config.statePath + '.tmp', snapshot, { mode: 0o600 });
      await rename(config.statePath + '.tmp', config.statePath);
    });
    diskWrites = pending.catch(() => {});
    return pending;
  }
  const reply = (res, body, status = 200) => {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(body));
  };
  async function admin(path, data) {
    if (!cookie) {
      const r = await fetchImpl(config.adminUrl + '/login', {
        method: 'POST',
        body: new URLSearchParams({ userName: config.username, password: config.password }),
        signal: AbortSignal.timeout(10000),
        redirect: 'error',
      });
      const result = await r.json();
      if (result.code !== 200) invalid('调度中心登录失败', 503);
      cookie = (r.headers.get('set-cookie') || '').split(';')[0];
      if (!cookie) invalid('调度中心未返回会话', 503);
    }
    const r = await fetchImpl(config.adminUrl + path, {
      method: 'POST',
      headers: { cookie },
      body: new URLSearchParams(data),
      signal: AbortSignal.timeout(15000),
      redirect: 'manual',
    });
    if (r.status === 302 || !r.headers.get('content-type')?.includes('json')) {
      cookie = '';
      invalid('调度中心会话失效，请重试', 503);
    }
    const body = await r.json();
    if (!r.ok || (body.code !== undefined && body.code !== 200))
      invalid(body.msg || '调度中心请求失败', 503);
    return body.content ?? body;
  }
  async function rpc(path, body) {
    const r = await fetchImpl(config.adminUrl + '/api/' + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'XXL-JOB-ACCESS-TOKEN': config.accessToken },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
      redirect: 'error',
    });
    const result = await r.json();
    if (!r.ok || result.code !== 200) invalid('调度中心执行协议请求失败', 503);
    return result;
  }
  async function ensureGroup() {
    if (groupId) return groupId;
    const list = await admin('/jobgroup/pageList', {
      start: '0',
      length: '1000',
      appname: config.appName,
      title: '',
    });
    let matches = (list.data || []).filter((x) => x.appname === config.appName);
    if (!matches.length) {
      await admin('/jobgroup/save', {
        appname: config.appName,
        title: 'GEA产销预警执行器',
        addressType: '0',
        addressList: '',
      });
      const again = await admin('/jobgroup/pageList', {
        start: '0',
        length: '1000',
        appname: config.appName,
        title: '',
      });
      matches = (again.data || []).filter((x) => x.appname === config.appName);
    }
    if (matches.length !== 1) invalid('预警执行器分组不唯一', 503);
    groupId = matches[0].id;
    return groupId;
  }
  async function identity(req) {
    const token = req.headers['x-access-token'],
      tenant = req.headers['x-tenant-id'];
    if (typeof token !== 'string' || !token || typeof tenant !== 'string' || !tenant)
      invalid('请登录GEA', 401);
    const key = digest(token + '\n' + tenant).toString('hex');
    const prior = identities.get(key);
    if (prior && prior.until > now()) return prior.owner;
    const headers = { 'X-Access-Token': token, 'X-Tenant-Id': tenant };
    const r = await fetchImpl(config.geaBase + '/sys/user/getUserInfo', {
      headers,
      signal: AbortSignal.timeout(15000),
      redirect: 'error',
    });
    const body = await r.json(),
      user = body.result?.userInfo;
    if (!r.ok || body.success !== true || !user?.id || !user?.username)
      invalid('GEA登录身份核对失败', 401);
    const session = await fetchImpl(config.geaBase + '/ai/gateway/agent/session', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentCode: 'aps',
        channel: 'AI_PORTAL',
        requestId: randomUUID(),
        conversationId: randomUUID(),
      }),
      signal: AbortSignal.timeout(15000),
      redirect: 'error',
    });
    const access = await session.json();
    if (!session.ok || access.result?.accessDecision?.allowed !== true)
      invalid('无权访问产销协同Agent', 403);
    const owner = { key: JSON.stringify(['production', tenant, String(user.id)]) };
    identities.set(key, { owner, until: now() + 15000 });
    if (identities.size > 1000) identities.delete(identities.keys().next().value);
    return owner;
  }
  async function ownedJobs(owner) {
    const list = await admin('/jobinfo/pageList', {
      jobGroup: String(await ensureGroup()),
      triggerStatus: '-1',
      start: '0',
      length: '1000',
      jobDesc: '',
      executorHandler: 'geaDetectionHandler',
      author: '',
    });
    if (Number(list.recordsFiltered) > 1000) invalid('检测任务超出管理读取上限', 503);
    return (list.data || []).filter((job) => decode(job.executorParam)?.ownerKey === owner.key);
  }
  async function finish(job, code, message) {
    if (job.finished) {
      if (job.code !== code || job.message !== message) invalid('执行回执已确认，不能覆盖', 409);
      return;
    }
    await rpc('callback', [
      {
        logId: job.logId,
        logDateTim: job.logDateTime,
        handleCode: code,
        handleMsg: String(message).slice(0, 2000),
      },
    ]);
    job.finished = true;
    job.code = code;
    job.message = String(message).slice(0, 2000);
    job.finishedAt = now();
    await persist();
  }
  async function client(req, input) {
    const owner = await identity(req);
    if (input.operation === 'poll') {
      clients.set(owner.key, now());
      if (input.busy) return { job: null };
      const job = [...work.values()].find(
        (x) => x.ownerKey === owner.key && !x.claimed && !x.finished,
      );
      if (!job) return { job: null };
      job.claimed = true;
      await persist();
      return { job: { logId: job.logId, taskId: job.taskId, runKey: 'xxl-' + job.logId } };
    }
    if (input.operation === 'complete') {
      const job = work.get(String(input.logId));
      if (!job || job.ownerKey !== owner.key) invalid('执行记录不属于当前用户', 403);
      if (![200, 500].includes(input.code) || typeof input.message !== 'string')
        invalid('执行回执无效');
      await finish(job, input.code, input.message);
      return { accepted: true };
    }
    if (input.operation !== 'xxl') invalid('不支持的调度操作');
    const allowed = [
      '/jobinfo/add',
      '/jobinfo/update',
      '/jobinfo/start',
      '/jobinfo/stop',
      '/jobinfo/trigger',
    ];
    if (!allowed.includes(input.path) || !input.data || typeof input.data !== 'object')
      invalid('不支持的调度操作');
    const jobs = await ownedJobs(owner);
    if (input.path === '/jobinfo/add' || input.path === '/jobinfo/update') {
      const taskId = decode(input.data.executorParam)?.taskId;
      if (!id(taskId)) invalid('检测任务标识无效');
      const existing = jobs.filter((job) => decode(job.executorParam)?.taskId === taskId);
      if (existing.length > 1) invalid('同一检测任务关联多个调度任务', 409);
      if (input.path === '/jobinfo/add' && existing.length) return existing[0].id;
      if (
        input.path === '/jobinfo/update' &&
        !jobs.some(
          (job) =>
            String(job.id) === String(input.data.id) &&
            decode(job.executorParam)?.taskId === taskId,
        )
      )
        invalid('调度任务不属于当前用户', 403);
      const value = input.data;
      if (
        !['CRON', 'FIX_RATE'].includes(value.scheduleType) ||
        typeof value.scheduleConf !== 'string' ||
        value.scheduleConf.length > 100 ||
        typeof value.jobDesc !== 'string' ||
        value.jobDesc.length > 200
      )
        invalid('调度任务参数无效');
      return admin(input.path, {
        jobGroup: String(groupId),
        jobDesc: value.jobDesc,
        author: 'GEA',
        scheduleType: value.scheduleType,
        scheduleConf: value.scheduleConf,
        misfireStrategy: 'DO_NOTHING',
        executorRouteStrategy: 'FIRST',
        executorHandler: 'geaDetectionHandler',
        executorParam: JSON.stringify({ taskId, ownerKey: owner.key }),
        executorBlockStrategy: 'DISCARD_LATER',
        executorTimeout: '600',
        executorFailRetryCount: '0',
        glueType: 'BEAN',
        alarmEmail: '',
        childJobId: '',
        ...(input.path === '/jobinfo/update' ? { id: String(value.id) } : {}),
      });
    }
    const job = jobs.find((job) => String(job.id) === String(input.data.id));
    if (!job) invalid('调度任务不属于当前用户', 403);
    if (input.path === '/jobinfo/trigger' && now() - (clients.get(owner.key) || 0) > 15000)
      invalid('GEA客户端尚未连接', 409);
    return admin(input.path, {
      id: String(job.id),
      ...(input.path === '/jobinfo/trigger'
        ? { executorParam: job.executorParam, addressList: '' }
        : {}),
    });
  }
  const server = createServer(async (req, res) => {
    try {
      if (req.method === 'GET' && req.url === '/health')
        return reply(res, {
          ok: true,
          service: 'gea-warning-executor',
          version: '20261112.1',
          groupId,
        });
      if (req.method !== 'POST') invalid('请求方法不支持', 405);
      let data = '';
      for await (const chunk of req) {
        data += chunk;
        if (data.length > 262144) invalid('请求过大', 413);
      }
      const input = decode(data);
      if (!input || typeof input !== 'object') invalid('请求格式无效');
      if (req.url === '/client') return reply(res, { ok: true, value: await client(req, input) });
      if (
        !config.accessToken ||
        !same(req.headers['xxl-job-access-token'] || '', config.accessToken)
      )
        invalid('执行器认证失败', 403);
      if (req.url === '/beat') return reply(res, { code: 200 });
      if (req.url === '/idleBeat')
        return reply(res, {
          code: [...work.values()].some((x) => x.jobId === input.jobId && !x.finished) ? 500 : 200,
          msg: '任务正在执行',
        });
      if (req.url === '/run') {
        if (
          input.executorHandler !== 'geaDetectionHandler' ||
          input.glueType !== 'BEAN' ||
          !Number.isSafeInteger(input.logId) ||
          !Number.isSafeInteger(input.logDateTime)
        )
          invalid('执行请求无效');
        const param = decode(input.executorParams);
        if (!id(param?.taskId) || typeof param.ownerKey !== 'string' || param.ownerKey.length > 512)
          invalid('执行参数无效');
        const key = String(input.logId);
        if (work.has(key)) return reply(res, { code: 200 });
        if (
          [...work.values()].some(
            (x) => x.taskId === param.taskId && x.ownerKey === param.ownerKey && !x.finished,
          )
        )
          return reply(res, { code: 500, msg: '上次检测尚未结束' });
        work.set(key, {
          ...input,
          taskId: param.taskId,
          ownerKey: param.ownerKey,
          claimed: false,
          finished: false,
          received: now(),
        });
        await persist();
        return reply(res, { code: 200 });
      }
      if (req.url === '/kill') {
        const active = [...work.values()].find((x) => x.jobId === input.jobId && !x.finished);
        if (active) invalid('执行中任务不强制中断，请等待执行超时', 409);
        return reply(res, { code: 200 });
      }
      if (req.url === '/log') {
        const job = work.get(String(input.logId));
        return reply(res, {
          code: 200,
          content: {
            fromLineNum: 1,
            toLineNum: 1,
            logContent:
              job?.message ||
              (job?.claimed ? 'GEA客户端正在执行检测' : '等待预警设置人的GEA客户端连接'),
            isEnd: Boolean(job?.finished),
          },
        });
      }
      invalid('接口不存在', 404);
    } catch (error) {
      reply(res, { ok: false, code: 500, error: error.message }, error.status || 503);
    }
  });
  let registering = false;
  async function heartbeat() {
    if (registering) return;
    registering = true;
    try {
      await ensureGroup();
      await rpc('registry', {
        registryGroup: 'EXECUTOR',
        registryKey: config.appName,
        registryValue: config.executorUrl,
      });
    } finally {
      registering = false;
    }
  }
  let sweeping = false;
  async function sweep() {
    if (sweeping) return;
    sweeping = true;
    try {
      for (const [key, job] of work) {
        if (!job.finished && now() - job.received > 600000)
          await finish(job, 500, 'GEA客户端未连接或检测执行超时');
        if (job.finished && now() - job.finishedAt > 86400000) work.delete(key);
      }
    } finally {
      sweeping = false;
    }
  }
  const intervals = [];
  return {
    server,
    heartbeat,
    sweep,
    async start() {
      if (config.statePath) {
        try {
          for (const [key, job] of JSON.parse(await readFile(config.statePath, 'utf8'))) {
            if (
              typeof key !== 'string' ||
              !id(job.taskId) ||
              typeof job.ownerKey !== 'string' ||
              !Number.isSafeInteger(job.logId)
            )
              throw Error('执行器恢复记录格式无效');
            work.set(key, { ...job, claimed: false });
          }
        } catch (error) {
          if (error.code !== 'ENOENT') throw error;
        }
      }
      await new Promise((resolve) => server.listen(config.port, config.host || '0.0.0.0', resolve));
      await heartbeat();
      intervals.push(
        setInterval(() => void heartbeat().catch(() => {}), 30000),
        setInterval(() => void sweep().catch(() => {}), 15000),
      );
    },
    async close() {
      intervals.forEach(clearInterval);
      await diskWrites;
      await new Promise((resolve) => server.close(resolve));
    },
    stats: () => ({ jobs: work.size, clients: clients.size }),
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const config = JSON.parse(
    await readFile(process.env.GEA_WARNING_EXECUTOR_CONFIG || '/run/warning/config.json', 'utf8'),
  );
  const executor = createWarningExecutor(config);
  await executor.start();
  process.on('SIGTERM', () => void executor.close().then(() => process.exit(0)));
  console.log('GEA warning executor started');
}
