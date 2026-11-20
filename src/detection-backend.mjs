import { warningMetricInfo, warningMetricContext } from '../business/shared/warning-metrics.mjs';
import { validateTaskRule, displayRule, displayValue } from './task-rules.mjs';
import { warningOwner, ownsWarningTask, createOwnerScopedApi } from './warning-ownership.mjs';
import { deleteDetectionTask } from './task-management.mjs';
import {
  sendPersonalNotification,
  enqueueChanges,
  enqueueNotification,
  drainNotifications,
} from './feishu-warning-transport.mjs';
import { baseOwners, categoryOwners, resolveWarningRoutes } from './warning-recipient-routing.mjs';
import { validateOwnerDirectory } from './warning-owner-directory.mjs';
import { normalizeDetectionScope, parseDetectionOutput } from './detection-output.mjs';
import { detectionNullPolicy } from './detection-null-policy.mjs';
export const normalizeCutoff = (value) =>
  String(value || '')
    .trim()
    .match(/^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2})?)?/)?.[0] || String(value || '').trim();
function compareCutoffs(left, right) {
  const date = /^\d{4}-\d{2}-\d{2}/;
  if (!date.test(left) || !date.test(right)) return 0;
  return left.replace('T', ' ').localeCompare(right.replace('T', ' '));
}
function normalizedObjectKey(scope, objectKey, objectName) {
  const key = String(objectKey || '')
    .trim()
    .normalize('NFC');
  const name = String(objectName || '')
    .trim()
    .normalize('NFC');
  const prefix = key.match(/^([^:：\-–—]+)\s*[:：\-–—]\s*(.+)$/);
  return name && prefix?.[1].trim() === scope && prefix[2].trim() === name ? name : key;
}
function eventKey(metric, scope, object, rule, period, monitorId, objectName) {
  if (rule.sourceType === 'task')
    return [
      monitorId || '',
      metric,
      scope,
      normalizedObjectKey(scope, object, objectName),
      'task',
      rule.taskQuote,
    ].join('|');
  return [
    monitorId || '',
    metric,
    scope,
    normalizedObjectKey(scope, object, objectName),
    'threshold-' + rule.direction,
    rule.healthyOperator,
    rule.healthy,
    rule.severe,
  ].join('|');
}
export function canonicalize(state) {
  const groups = new Map();
  for (const e of state.events) {
    if (!e.rule) continue;
    e.originalKey ??= e.monitorKey;
    e.monitorKey = eventKey(
      e.metricName,
      e.scopeType,
      e.objectKey,
      e.rule,
      e.period,
      e.monitorId,
      e.scope,
    );
    e.cutoffNote ??= e.cutoff;
    e.cutoff = normalizeCutoff(e.cutoff);
    e.history = (e.history || []).map((h) => ({ ...h, cutoff: normalizeCutoff(h.cutoff) }));
    e.range = displayRule(e.rule, e.unit);
    if (e.eventStatus === '活跃' || (e.eventStatus === '已恢复' && e.pendingClose === true)) {
      if (!groups.has(e.monitorKey)) groups.set(e.monitorKey, []);
      groups.get(e.monitorKey).push(e);
    }
  }
  for (const [key, group] of groups) {
    group.sort((a, b) => new Date(a.first) - new Date(b.first));
    let first = group[0];
    for (const duplicate of group.slice(1)) {
      const pending = [...(first.notifications || []), ...(duplicate.notifications || [])].some(
        (n) => ['待发送', '发送中'].includes(n.status),
      );
      if (pending) {
        first.monitorKey = key + '|episode:' + first.id;
        first = duplicate;
        continue;
      }
      const lastRun =
        new Date(duplicate.lastChecked || duplicate.first) >=
        new Date(first.lastChecked || first.first)
          ? duplicate
          : first;
      const cutoffOrder = compareCutoffs(duplicate.cutoff, first.cutoff);
      const latest = cutoffOrder > 0 ? duplicate : cutoffOrder < 0 ? first : lastRun;
      const lastChecked = lastRun.lastChecked || lastRun.first;
      const history = [
        ...new Map(
          [...(first.history || []), ...(duplicate.history || [])].map((h, _i) => [
            h.runId || `${h.at}|${h.cutoff}|${_i}`,
            h,
          ]),
        ).values(),
      ].sort((a, b) => new Date(a.at) - new Date(b.at));
      const notifications = [
        ...new Map(
          [...(first.notifications || []), ...(duplicate.notifications || [])].map((n) => [
            n.id || JSON.stringify(n),
            n,
          ]),
        ).values(),
      ];
      const retained = {
        id: first.id,
        first: first.first,
        originalKey: first.originalKey,
        monitorKey: key,
      };
      Object.assign(first, latest, retained, {
        history,
        notifications,
        lastChecked,
        hits: new Set(history.filter((h) => h.status !== '健康').map((h) => h.cutoff)).size,
        checkCount: history.length,
      });
      if (cutoffOrder === 0 && history.length > 1)
        first.trend = `${history[history.length - 2].value} → ${history[history.length - 1].value}`;
      duplicate.eventStatus = '已合并';
      duplicate.mergedIntoId = first.id;
    }
  }
  return state;
}
import { createWhitelistStore } from './detection-whitelist.mjs';
import { randomUUID } from 'node:crypto';
import { readFile, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
const ROOT = process.env.GEA_WARNING_HOME || join(homedir(), '.dsh', 'warning');
const DETECTION_TIMEOUT_MS = 9 * 60_000;

const scopes = ['品类', '基地', '品类*基地', '大区', '省区'];
export function cron(s) {
  const [h, m] = (s.time || '09:00').split(':').map(Number);
  if (!Number.isInteger(h) || h < 0 || h > 23 || !Number.isInteger(m) || m < 0 || m > 59)
    throw Error('执行时间无效');
  switch (s.frequency) {
    case 'daily':
      return `0 ${m} ${h} * * ?`;
    case 'workdays':
      return `0 ${m} ${h} ? * MON-FRI`;
    case 'weekly': {
      const d = (s.days || []).map(
        (x) => ['', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'][Number(x)],
      );
      if (!d.length || d.some((x) => !x)) throw Error('执行星期无效');
      return `0 ${m} ${h} ? * ${d.join(',')}`;
    }
    case 'monthly':
      if (!/^([1-9]|1[0-9]|2[0-8])$/.test(String(s.monthday))) throw Error('月度日期请选择1至28日');
      return `0 ${m} ${h} ${s.monthday} * ?`;
    case 'interval':
      if (
        !Number.isInteger(Number(s.interval)) ||
        Number(s.interval) < 1 ||
        Number(s.interval) > 23
      )
        throw Error('间隔需为1至23小时');
      return `0 0 0/${s.interval} * * ?`;
    default:
      throw Error('执行频次无效');
  }
}
export function validate(result, task) {
  if (result.rule && Array.isArray(result.results))
    result.results = result.results.map((x) => ({ ...x, rule: x.rule || result.rule }));
  if (result.complete !== true || !Array.isArray(result.results) || !result.results.length)
    throw Error(result.error || '问数结果不完整，不能判定恢复');
  const seen = new Set();
  const nullPolicyText = detectionNullPolicy(task);
  for (const x of result.results) {
    x.scope = normalizeDetectionScope(x.scope);
    if (
      x.scope !== task.scope ||
      typeof x.objectKey !== 'string' ||
      !x.objectKey ||
      seen.has(normalizedObjectKey(task.scope, x.objectKey, x.objectName))
    )
      throw Error('检测颗粒度或对象编码无效');
    seen.add(normalizedObjectKey(task.scope, x.objectKey, x.objectName));
    if (['gt', 'gte', 'lt', 'lte'].includes(x.rule?.healthyOperator)) {
      const direction = ['gt', 'gte'].includes(x.rule.healthyOperator) ? 'higher' : 'lower';
      if (x.rule.direction && x.rule.direction !== direction)
        x.rule.originalDirection = x.rule.direction;
      x.rule.direction = direction;
    }
    if (x.rule?.sourceType == null && x.rule?.source === 'task') x.rule.sourceType = 'task';
    if (x.rule?.sourceType === 'task') {
      if (!x.unit || !x.objectName || !x.period || !x.cutoff || !x.evidence)
        throw Error('任务检测缺少对象、期间、截止时间或取数证据');
      if (validateTaskRule(x, task, nullPolicyText)) continue;
    }
    if (
      !x.unit ||
      typeof x.objectName !== 'string' ||
      !Number.isFinite(x.value) ||
      !x.period ||
      !x.cutoff ||
      !x.evidence ||
      !x.rule?.source ||
      !x.rule?.id ||
      !x.rule?.version
    )
      throw Error('缺少指标值、期间、截止时间、取数证据或指标库规则');
    const r = x.rule;
    if (!['higher', 'lower'].includes(r.direction) || ![r.healthy, r.severe].every(Number.isFinite))
      throw Error('指标规则尚不支持或缺失，需核查');
    if (
      (r.direction === 'higher' && r.severe > r.healthy) ||
      (r.direction === 'lower' && r.severe < r.healthy)
    )
      throw Error('规则阈值顺序错误');
    if (!r.healthyOperator) {
      const src = r.source.replace(/\s/g, '');
      r.healthyOperator = src.includes('健康x>' + r.healthy)
        ? 'gt'
        : src.includes('健康x≥' + r.healthy) || src.includes('健康x>=' + r.healthy)
          ? 'gte'
          : src.includes('健康x<' + r.healthy)
            ? 'lt'
            : src.includes('健康x≤' + r.healthy) || src.includes('健康x<=' + r.healthy)
              ? 'lte'
              : null;
    }
    if (!['gt', 'gte', 'lt', 'lte'].includes(r.healthyOperator))
      throw Error('健康线比较符缺失，请返回指标库完整规则');
    const v = x.value;
    const healthy =
      r.healthyOperator === 'gt'
        ? v > r.healthy
        : r.healthyOperator === 'gte'
          ? v >= r.healthy
          : r.healthyOperator === 'lt'
            ? v < r.healthy
            : v <= r.healthy;
    const status =
      r.direction === 'higher'
        ? healthy
          ? '健康'
          : v < r.severe
            ? '严重'
            : '预警'
        : healthy
          ? '健康'
          : v > r.severe
            ? '严重'
            : '预警';
    if (x.status !== status) throw Error('AI风险状态与指标库规则不一致');
  }
  return result.results;
}
export function merge(state, task, results, run) {
  for (const row of results) {
    row.cutoffNote = row.cutoff;
    row.cutoff = normalizeCutoff(row.cutoff);
  }
  for (const x of results) {
    const key = eventKey(
      task.metric,
      task.scope,
      x.objectKey,
      x.rule,
      x.period,
      task.id,
      x.objectName,
    );
    let old = state.events.find(
      (e) =>
        e.monitorKey === key &&
        (e.eventStatus === '活跃' || (e.eventStatus === '已恢复' && e.pendingClose === true)),
    );
    if (x.status === '健康' && !old) continue;
    const now = run.at;
    const earlierCutoff = old && compareCutoffs(x.cutoff, old.cutoff) < 0;
    const changed = !old || (!earlierCutoff && old.cutoff !== x.cutoff);
    const h = {
      at: now,
      period: x.period,
      cutoff: x.cutoff,
      value: displayValue(x.value, x.unit),
      status: x.status,
      result: x.status === '健康' ? '指标恢复' : old ? '持续异常，更新原卡片' : '首次发现异常',
      runId: run.id,
    };
    if (old) old.objectKey = x.objectKey;
    if (old && !changed) {
      old.lastChecked = now;
      old.checkCount = (old.checkCount || old.history.length) + 1;
      old.history.push({
        ...h,
        result: earlierCutoff ? '数据截止早于当前记录，保留原预警' : '数据截止未变化，保留原预警',
      });
      run.unchanged = (run.unchanged || 0) + 1;
      continue;
    }
    if (x.status === '健康') {
      if (old.eventStatus !== '已恢复') {
        old.recoveredAt = now;
        run.recovered++;
      }
      old.eventStatus = '已恢复';
      old.pendingClose = true;
      old.lastChecked = now;
      old.checkCount = (old.checkCount || 0) + 1;
      old.history.push(h);
      old.cutoff = x.cutoff;
      old.period = x.period;
      old.cutoffNote = x.cutoffNote;
      old.value = x.value;
      old.metric = task.metric + ' ' + displayValue(x.value, x.unit);
      old.diagnosis = x.analysis || old.diagnosis;
      old.evidence = x.evidence;
      old.gap = x.value === null ? '空值按任务规则正常' : old.gap;
      old.level = '健康';
      continue;
    }
    const event = {
      ...old,
      id: old?.id || 'alert-' + randomUUID(),
      monitorId: task.id,
      monitorKey: key,
      scope: x.objectName,
      scopeType: task.scope,
      objectKey: x.objectKey,
      metric: `${task.metric} ${x.value}${x.unit}`,
      metricName: task.metric,
      value: x.value,
      unit: x.unit,
      period: x.period,
      source: run.runKey?.startsWith('manual-') ? '手动执行 · GEA问数' : 'XXL-JOB · GEA问数',
      range: displayRule(x.rule, x.unit),
      target:
        x.rule.kind === 'range'
          ? `${x.rule.min}—${x.rule.max}${x.unit}`
          : `${x.rule.healthy}${x.unit}`,
      gap:
        x.rule.kind === 'range'
          ? '超出任务正常区间'
          : `距健康线 ${(x.value - x.rule.healthy).toFixed(2)}${x.unit === '%' ? 'pp' : x.unit}`,
      first: old?.first || now,
      cutoff: x.cutoff,
      lastChecked: now,
      eventStatus: '活跃',
      pendingClose: true,
      level: x.status,
      evidence: x.evidence,
      diagnosis: x.analysis || '暂无分析说明',
      trend: old ? `${old.value}${old.unit} → ${x.value}${x.unit}` : '首次检测',
      hits: (old?.hits || 0) + 1,
      checkCount: (old?.checkCount || 0) + 1,
      cutoffNote: x.cutoffNote,
      history: [...(old?.history || []), h],
      rule: x.rule,
      task: {
        name: task.name,
        scope: task.scope,
        frequency: task.frequency,
        description: task.description,
        enabled: task.enabled,
      },
      confidence: null,
      dimension: task.scope === '基地' ? 'base' : 'category',
    };
    if (old) Object.assign(old, event);
    else state.events.unshift(event);
    old ? run.updated++ : run.created++;
  }
}
export async function installDetection(ctx) {
  await mkdir(ROOT, { recursive: true });
  const state = { tasks: [], runs: [], events: [] };
  const store = createWhitelistStore(ctx);
  ctx.effect(() => () => {
    void store.close();
  });
  let writes = Promise.resolve();
  const save = (nextState = state) => {
    const snapshot = JSON.stringify(nextState);
    const next = writes.then(async () => {
      await store.save(JSON.parse(snapshot));
    });
    writes = next.catch(() => {});
    return next;
  };
  let serial = Promise.resolve();
  const locked = (fn) => {
    const p = serial.then(() => fn());
    serial = p.catch(() => {});
    return p;
  };
  async function currentOwner() {
    const response = await ctx.connection.createSharedFetchHandler('/api').fetch(
      new Request('http://host/api/gea-proof/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      }),
    );
    const result = await response.json();
    if (!response.ok || !result.ok) throw Error('无法读取 GEA 登录身份');
    return warningOwner(result.value);
  }
  async function scheduler(input) {
    const response = await ctx.connection.createSharedFetchHandler('/api').fetch(
      new Request('http://host/api/gea-proof/warning/scheduler', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      }),
    );
    const body = await response.json();
    if (!response.ok || body.ok !== true) throw Error(body.error?.message || '预警调度服务不可用');
    return body.value;
  }
  async function notificationConfig(recipient = 'self') {
    if (recipient === 'none') return null;
    const username =
      recipient === 'self' ? 'self' : recipient.startsWith('gea:') ? recipient.slice(4) : '';
    if (!username) throw Error('请选择有效的GEA飞书接收人');
    const config = await scheduler({ operation: 'feishu-recipient', username });
    return config?.mapped === false ? null : config;
  }
  async function sendNotification(job) {
    if (job.transport !== 'shared-feishu-app') return sendPersonalNotification(job);
    let result;
    try {
      result = await scheduler({
        operation: 'feishu-send',
        taskId: job.taskId,
        username: job.receiveId,
        uuid: job.uuid,
        card: job.card,
      });
    } catch {
      throw Object.assign(Error('飞书发送结果待核实，请核对原通知；不自动重发'), { unknown: true });
    }
    if (
      result?.ok !== true ||
      typeof result.messageId !== 'string' ||
      !result.messageId.startsWith('om_')
    )
      throw Object.assign(Error(result?.error || '飞书通知未取得成功回执'), {
        unknown: result?.unknown !== false,
      });
    return result;
  }
  const xxl = (path, data) => scheduler({ operation: 'xxl', path, data });
  async function configure(t, edit = false) {
    const body = {
      jobGroup: '1',
      jobDesc: t.name,
      author: 'GEA',
      scheduleType: t.schedule.frequency === 'interval' ? 'FIX_RATE' : 'CRON',
      scheduleConf:
        t.schedule.frequency === 'interval'
          ? String(Number(t.schedule.interval) * 3600)
          : cron(t.schedule),
      misfireStrategy: 'DO_NOTHING',
      executorRouteStrategy: 'FIRST',
      executorHandler: 'geaDetectionHandler',
      executorParam: JSON.stringify({ taskId: t.id }),
      executorBlockStrategy: 'DISCARD_LATER',
      executorTimeout: '600',
      executorFailRetryCount: '0',
      glueType: 'BEAN',
      alarmEmail: '',
      childJobId: '',
    };
    if (edit) body.id = String(t.jobId);
    const id = await xxl(edit ? '/jobinfo/update' : '/jobinfo/add', body);
    if (!edit) t.jobId = Number(id);
  }
  const DEFAULT_AGENT = 'gea-html-inventory-apsplan';
  async function availableAgents() {
    const registry = ctx.get('agentPresets');
    if (!registry) throw Error('Agent列表暂不可用');
    return (await registry.list())
      .filter((x) => x.id.startsWith('gea-html-inventory-'))
      .map((x) => ({ id: x.id, name: x.name || x.id, broken: x.broken || null }));
  }
  async function metricInfo(name) {
    return warningMetricInfo(name);
  }

  async function ai(t, run, signal) {
    const requestedAgent = t.agentPreset || DEFAULT_AGENT;
    const agents = await availableAgents();
    const chosen = agents.find((x) => x.id === requestedAgent);
    if (!chosen || chosen.broken) throw Error('所选Agent不可用，请重新选择');
    run.requestedAgent = { id: chosen.id, name: chosen.name };
    let sessionCwd = process.env.GEA_DETECTION_SESSION_CWD;
    if (!sessionCwd) {
      try {
        sessionCwd = (await readFile(ROOT + '/config/session-workspace.txt', 'utf8')).trim();
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
    sessionCwd = sessionCwd || ROOT;
    const created = await ctx.sessionController.create({ cwd: sessionCwd, agentPreset: chosen.id });
    run.sessionId = created.sessionId;
    run.sessionCwd = sessionCwd;
    if (created.agentPreset)
      run.actualAgent = {
        id: created.agentPreset,
        name: agents.find((x) => x.id === created.agentPreset)?.name || created.agentPreset,
      };
    await locked(save);
    const metric = await metricInfo(t.metric);

    if (metric.status !== 'available')
      run.metricLibraryIssue = metric.message || '指标库口径需通过授权工具核对';
    const metricContext = warningMetricContext(metric);
    run.context = { metricContext, scope: t.scope, description: t.description };
    const prompt = `指标：${t.metric}
检测范围：${t.scope}
任务说明：${t.description}
已固定的V0.6指标口径：${JSON.stringify(metricContext)}
以上定义、公式、排除项、统计期间与单位须在取数和汇总中一致执行，不得另查其他版本覆盖。阈值未维护时不能自行推断健康线。实际数据仍使用当前授权工具查询。
当前上海时间：${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}
空值处理补充：${detectionNullPolicy(t)}

请使用已授权的问数和知识库工具完成检测，按指标定义、统计期间和规则查询该范围的全部对象，包括健康对象。区分事实与待核查原因；任务说明中明确的阈值、区间和空值处理规则优先于指标库，规则来源标为任务自定义；缺少指标库编号、版本或严重阈值不能单独作为失败理由。任务未指定的规则使用上面的V0.6固定配置，不再查询外部指标库；任务说明可补充阈值和空值判定，但不改变本指标的定义、公式和排除范围。成功查询且返回空值时，若任务明确指定空值算正常，则按正常返回；不得将工具报错、查询失败或遗漏对象当成空值。其余无法核实维度、规则、数据覆盖或指标值时，不要猜测，返回完整性失败，避免错误判断预警恢复。仅执行只读查询。无人值守任务不得请求权限升级或等待人工审批；所需工具不可用时立即返回完整性失败并说明具体错误。

面向用户的说明（如 analysis）中，指标值、比率、差值等数字按原单位四舍五入保留 1 位小数，例如 13.7841 天写为 13.8 天，12 天写为 12.0 天。业务日期、统计期间、编号以及引用的规则原文保持原样。结构化 value、规则阈值和风险判断使用原始精度。

最终回复只输出一个完整的 JSON 对象。使用以下格式；字段值必须依据实际查询，不得照抄示例或编造。每个对象必须具有唯一且稳定的 objectKey；优先使用来源系统稳定编码，若只能用名称，直接用 objectName，不拼接检测范围。value 为数值，百分比用 0 至 100 的数值；仅在成功查询返回空值且任务明确允许空值正常时，value 返回 null，dataStatus 返回 queried-null，status 返回健康，analysis 注明空值按任务规则视为正常，不得伪造为0。scope 必须与检测范围一致，period 为实际统计期间，cutoff 为业务数据截止时间。rule 的健康线比较符 healthyOperator 只能为 gt、gte、lt、lte，direction 只能为 higher 或 lower。status 按规则返回健康、预警或严重。规则编号或版本未登记时请明确标注，不得编造。任务自定义规则使用 sourceType:"task"；taskQuote 逐字引用“任务说明”中的原文，包含其中实际写明的阈值和空值条款，不添加标题或系统的“空值处理补充”。仅当任务原文明示空值正常时使用 nullPolicy:"healthy"；id 和 version 由系统记录。没有严重阈值时 severe:null，异常只判预警。双侧区间使用 kind:"range"、min、max（含边界为正常）；例如偏离目标超过±20%，min=目标×0.8，max=目标×1.2，计算须有工具证据，保留原指标值和单位。不要硬套单侧阈值结构。
{"complete":true,"results":[{"scope":"检测范围","objectKey":"稳定对象编码或名称","objectName":"对象名称","value":0,"unit":"单位","period":"统计期间","cutoff":"业务数据截止时间","status":"健康或预警或严重","evidence":"取数及规则依据","analysis":"事实及待核查原因","rule":{"id":"规则编号或未登记","version":"规则版本或未登记","source":"规则来源","direction":"higher或lower","healthy":0,"healthyOperator":"gt或gte或lt或lte","severe":0}}]}
无法完整可靠检测时返回 {"complete":false,"error":"具体原因"}。`;
    run.prompt = prompt;
    await locked(save);
    await ctx.sessionController.prompt(
      {
        requestId: 'request-' + randomUUID(),
        sessionId: created.sessionId,
        mode: 'queue',
        content: [{ type: 'text', text: prompt }],
        clientTimeZone: 'Asia/Shanghai',
      },
      signal,
    );
    try {
      const stream = ctx.sessionController.follow(
        { address: { kind: 'session', sessionId: created.sessionId }, maxMessages: 100 },
        signal,
      );
      let texts = [];
      for await (const frame of stream) {
        signal.throwIfAborted();
        const events =
          frame.type === 'snapshot'
            ? frame.records.map((r) => r.event)
            : frame.type === 'event'
              ? [frame.event]
              : [];
        for (const e of events) {
          if (e.type === 'approval/asked') {
            try {
              await ctx.sessionController.cancel({ sessionId: created.sessionId });
            } catch {}
            throw Error(
              '检测需要人工权限审批，无人值守任务已停止；请检查 Agent 工具权限及检测会话工作目录配置。',
            );
          }
          if (e.type === 'tool/result' && e.data?.message?.isError) {
            const content = e.data.message.content || [];
            const errorText = content
              .filter((x) => x.type === 'text')
              .map((x) => x.text || '')
              .join(' ');
            if (/SetNamedSecurityInfoW failed.*grantWrite/i.test(errorText)) {
              try {
                await ctx.sessionController.cancel({ sessionId: created.sessionId });
              } catch {}
              throw Error(
                '检测会话工作目录沙箱授权失败（Win32 5）；请检查目录权限或配置 GEA_DETECTION_SESSION_CWD。',
              );
            }
          }
          if (e.type === 'request/header') {
            const config = e.data?.header?.config;
            if (config?.provider && config?.model) {
              run.actualModel = {
                provider: String(config.provider),
                model: String(config.model),
                ...(config.reasoningEffort
                  ? { reasoningEffort: String(config.reasoningEffort) }
                  : {}),
              };
              await locked(save);
            }
          }
          if (e.type === 'assistant/message') {
            const m = e.data?.message;
            const parts = m?.content || [];
            const text =
              typeof parts === 'string'
                ? parts
                : parts
                    .filter((p) => p.type === 'text')
                    .map((p) => p.text)
                    .join('');
            if (text) texts.push(text);
          }
          if (e.type === 'turn/end') {
            if (e.data?.reason?.kind === 'error')
              throw Error(e.data.reason.error?.message || 'Agent 检测执行失败');
            if (e.data?.reason?.kind !== 'completed')
              throw Error('Agent 检测未正常完成，请检查执行记录');
            return parseDetectionOutput(texts, e.data.reason);
          }
        }
      }
    } finally {
      if (signal.aborted) {
        try {
          await ctx.sessionController.cancel({ sessionId: created.sessionId });
        } catch {}
      }
    }
    throw Error('问数执行未完成');
  }
  const running = new Set();
  function taskRecipients(task) {
    return (
      task?.notifyRecipients ??
      (task?.notifyRecipient === 'none' ? [] : [task?.notifyRecipient || 'self'])
    );
  }

  async function startTask(id, runKey) {
    const owner = await currentOwner();
    return locked(async () => {
      const t = state.tasks.find((t) => t.id === id);
      if (!t || !t.enabled || t.deletedAt) throw Error('检测任务不存在或已停用');
      if (!ownsWarningTask(t, owner)) throw Error('请使用预警设置人的账号执行检测');
      const previous = state.runs.find((r) => r.runKey === runKey);
      if (previous) {
        if (previous.status === '执行中') throw Error('上次执行状态仍待核实，请勿重复执行');
        return { run: previous, completion: Promise.resolve(previous) };
      }
      if (running.has(id)) throw Error('上一次检测仍在执行');
      running.add(id);
      const run = {
        id: 'run-' + randomUUID(),
        runKey,
        taskId: id,
        name: t.name,
        at: new Date().toISOString(),
        status: '执行中',
        created: 0,
        updated: 0,
        recovered: 0,
      };
      state.runs.unshift(run);
      try {
        await save();
      } catch (error) {
        state.runs = state.runs.filter((entry) => entry !== run);
        running.delete(id);
        throw error;
      }
      return { run, completion: executeTask(t, run) };
    });
  }

  async function runTask(id, runKey) {
    return (await startTask(id, runKey)).completion;
  }

  async function startManualRun(id) {
    const { run, completion } = await startTask(id, 'manual-' + randomUUID());
    void completion.catch(() => {});
    return run;
  }

  async function persistFailedRun(task, run, result) {
    const completedAt = new Date().toISOString();
    for (let attempt = 0; ; attempt++) {
      const latest = await store.load();
      if (
        !ownsWarningTask(
          latest.tasks.find((entry) => entry.id === task.id),
          task.owner,
        )
      )
        throw Error('登录身份已变化，检测回执待核实');
      const stored = latest.runs.find((entry) => entry.id === run.id && entry.taskId === task.id);
      if (!stored) throw Error('无法核对原执行记录');
      const failed = { ...stored, ...run, status: '失败', completedAt, result };
      try {
        if (stored.status === '执行中') {
          latest.runs = latest.runs.map((entry) => (entry === stored ? failed : entry));
          await save(latest);
        }
      } catch (error) {
        if (attempt === 0 && error.code === 'WARNING_WRITE_CONFLICT') continue;
        throw error;
      }
      const active = new Map(
        state.runs
          .filter(
            (entry) =>
              entry.id !== run.id && running.has(entry.taskId) && entry.status === '执行中',
          )
          .map((entry) => [entry.id, entry]),
      );
      latest.runs = latest.runs.map((entry) =>
        entry.status === '执行中' ? (active.get(entry.id) ?? entry) : entry,
      );
      Object.assign(state, latest);
      return stored.status === '执行中' ? failed : stored;
    }
  }

  async function executeTask(t, run) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), DETECTION_TIMEOUT_MS);
    try {
      const result = await ai(t, run, ac.signal);
      run.response = result;
      await locked(save);
      const rows = validate(result, t);
      const automatic = t.notifyStrategy === 'automatic';
      const recipients = automatic || t.notifyStrategy === 'off' ? [] : taskRecipients(t);
      let routing;
      if (automatic) {
        try {
          const directory = await store.ownerDirectory.load();
          routing = await resolveWarningRoutes(rows, t.scope, notificationConfig, directory.owners);
          run.notificationRouting = {
            strategy: 'automatic',
            directoryRevision: directory.revision,
            matches: rows.map((row) => ({
              objectKey: row.objectKey,
              objectName: row.objectName,
              recipients: (routing.routes.get(row.objectKey) || []).map((person) => ({
                name: person.recipientName,
                account: person.receiveId,
              })),
            })),
          };
        } catch (error) {
          routing = {
            routes: new Map(),
            unresolved: ['负责人配置未能读取，本次不推送：' + error.message],
          };
        }
      }
      const resolved = await Promise.allSettled(
        recipients.map((recipient) => notificationConfig(recipient)),
      );
      const deliveryConfig = resolved.flatMap((result) =>
        result.status === 'fulfilled' && result.value ? [result.value] : [],
      );
      const unavailable = recipients.length - deliveryConfig.length;
      if (unavailable) run.notificationIssue = unavailable + ' 位飞书接收人不可用。';
      if (routing?.unresolved.length) run.notificationIssue = routing.unresolved.join('；');
      await locked(async () => {
        const previous = new Map(
          state.events.map((e) => [e.id, { level: e.level, eventStatus: e.eventStatus }]),
        );
        merge(state, t, rows, run);
        enqueueChanges(state, previous, run, routing?.routes ?? deliveryConfig, t);
        run.status = '成功';
        run.completedAt = new Date().toISOString();
        run.result = `新增${run.created}，更新${run.updated}，恢复${run.recovered}，数据未更新${run.unchanged || 0}`;
        if (run.notificationIssue) run.result += '；通知待处理：' + run.notificationIssue;
        const task = state.tasks.find((entry) => entry.id === t.id);
        if (task) task.lastRun = run.at;
        await save();
      });
    } catch (e) {
      const result = ac.signal.aborted
        ? '检测超过9分钟未完成，请检查问数及工具授权状态'
        : e.message;
      const receipt = await locked(() => persistFailedRun(t, run, result));
      if (receipt.status === '成功') return receipt;
      throw Error(receipt.result || result, { cause: e });
    } finally {
      clearTimeout(timer);
      running.delete(t.id);
    }
    return run;
  }
  async function api(input) {
    switch (input.op) {
      case 'owner-directory':
        return {
          ...(await store.ownerDirectory.load()),
          bases: Object.keys(baseOwners),
          categories: Object.keys(categoryOwners),
        };
      case 'owner-directory-save': {
        const owners = validateOwnerDirectory(input.owners);
        const identities = new Map();
        for (const row of owners) {
          if (!identities.has(row.employeeNo))
            identities.set(row.employeeNo, await notificationConfig('gea:' + row.employeeNo));
          const identity = identities.get(row.employeeNo);
          if (!identity || identity.mapped === false || identity.recipientName !== row.name)
            throw Error('工号 ' + row.employeeNo + ' 与飞书姓名不匹配或账号不可用，请核对后保存');
        }
        return store.ownerDirectory.save(input.revision, owners);
      }
      case 'agents':
        return await availableAgents();
      case 'recipient-check': {
        const recipient = 'gea:' + String(input.username || '');
        return { mapped: Boolean(await notificationConfig(recipient)) };
      }
      case 'notify-test': {
        const config = await notificationConfig();
        if (!config) throw Error('飞书推送未启用或个人接收账号未配置');
        let job;
        await locked(async () => {
          const event = state.events.find((e) => e.id === input.eventId);
          if (!event) throw Error('预警事件不存在');
          job = enqueueNotification(event, 'test', 'manual-personal-test-v1', config);
          await save();
        });
        await deliver();
        return {
          id: job.id,
          status: job.status,
          messageId: job.messageId,
          error: job.error,
          recipientName: job.recipientName,
        };
      }
      case 'close-event':
        return locked(async () => {
          const e = state.events.find((x) => x.id === input.id);
          if (
            !e ||
            !['活跃', '已恢复'].includes(e.eventStatus) ||
            (e.eventStatus === '已恢复' && !e.pendingClose)
          )
            throw Error('预警不存在或已关闭');
          e.closedRisk = e.eventStatus;
          e.eventStatus = '已关闭';
          e.pendingClose = false;
          e.closedAt = new Date().toISOString();
          e.closedBy = null;
          await save();
          return { id: e.id, status: e.eventStatus };
        });
      case 'metric':
        return metricInfo(String(input.metric || ''));
      case 'list':
        return {
          ...state,
          tasks: state.tasks.filter((t) => !t.deletedAt),
          events: state.events.map((e) => ({
            ...e,
            task: state.tasks.find((t) => t.id === e.monitorId) || e.task,
          })),
        };
      case 'save': {
        const { task, runImmediately } = await locked(async () => {
          const v = input.task;
          if (!v || !scopes.includes(v.scope) || !v.metric?.trim() || !v.description?.trim())
            throw Error('指标、范围或任务说明无效');
          cron(v.schedule);
          const selectedAgent = v.agentPreset || DEFAULT_AGENT;
          const eligibleAgents = await availableAgents();
          if (!eligibleAgents.some((x) => x.id === selectedAgent && !x.broken))
            throw Error('所选Agent不可用，请重新选择');
          v.agentPreset = selectedAgent;
          const createdId =
            typeof v.requestKey === 'string' && /^[a-f0-9]{32}$/.test(v.requestKey)
              ? 'monitor-' + v.requestKey
              : undefined;
          const old = state.tasks.find((task) => task.id === (v.id || createdId));
          if (old && running.has(old.id)) throw Error('检测正在执行，请结束后再修改任务');
          if (v.id && (!old || old.deletedAt)) throw Error('任务不存在或已删除');
          const notifyStrategy = v.notifyStrategy ?? old?.notifyStrategy ?? 'specified';
          if (!['specified', 'automatic', 'off'].includes(notifyStrategy))
            throw Error('请选择有效的接收人策略');
          if (notifyStrategy === 'automatic' && !['品类', '基地', '品类*基地'].includes(v.scope))
            throw Error('自动匹配仅支持品类、基地及品类×基地');
          const recipients =
            notifyStrategy !== 'specified'
              ? []
              : (v.notifyRecipients ??
                (v.notifyRecipient == null
                  ? taskRecipients(old)
                  : taskRecipients({ notifyRecipient: v.notifyRecipient })));
          if (
            !Array.isArray(recipients) ||
            recipients.some(
              (id) => typeof id !== 'string' || (id !== 'self' && !/^gea:[^\s:]{1,80}$/.test(id)),
            )
          )
            throw Error('请选择有效的飞书接收人');
          v.notifyRecipients = [...new Set(recipients)];
          const configs = await Promise.all(
            v.notifyRecipients.map((recipient) => notificationConfig(recipient)),
          );
          if (configs.some((config) => !config))
            throw Error('部分接收人未配置飞书账号映射或推送未启用');
          const notifyMode = v.notifyMode ?? old?.notifyMode ?? 'repeat';
          if (!['once', 'repeat'].includes(notifyMode)) throw Error('请选择有效的通知频率');
          const definedBy =
            old?.definedBy || (typeof v.definedBy === 'string' ? v.definedBy.trim() : '');
          if (!definedBy || definedBy.length > 120)
            throw Error('无法记录预警设置人，请重新登录后保存');
          const t = {
            ...old,
            id: old?.id || createdId || 'monitor-' + randomUUID(),
            name: v.metric + '检测',
            metric: v.metric.trim(),
            scope: v.scope,
            description: v.description.trim(),
            agentPreset: v.agentPreset,
            notifyRecipient: undefined,
            notifyRecipients: v.notifyRecipients,
            notifyMode,
            notifyStrategy,
            definedBy,
            owner: old?.owner || v.owner,
            schedule: v.schedule,
            frequency: v.frequency,
            enabled: old?.enabled ?? true,
          };
          if (
            state.tasks.some(
              (x) =>
                x.id !== t.id &&
                ownsWarningTask(x, t.owner) &&
                x.metric === t.metric &&
                x.scope === t.scope &&
                x.enabled,
            )
          )
            throw Error('已有相同指标与检测范围的启用任务');
          await configure(t, Boolean(old));
          const tasks = old
            ? state.tasks.map((entry) => (entry === old ? t : entry))
            : [t, ...state.tasks];
          await save({ ...state, tasks });
          state.tasks = tasks;
          if (!old) await xxl('/jobinfo/start', { id: String(t.jobId) });
          return { task: t, runImmediately: !old && v.runImmediately === true };
        });
        if (!runImmediately) return task;
        try {
          return { ...task, immediateRun: await startManualRun(task.id) };
        } catch (error) {
          return { ...task, immediateRunError: error.message };
        }
      }
      case 'delete':
        return locked(() =>
          deleteDetectionTask({
            state,
            id: input.id,
            running,
            stopJob: (jobId) => xxl('/jobinfo/stop', { id: String(jobId) }),
            save,
          }),
        );
      case 'toggle':
        return locked(async () => {
          const t = state.tasks.find((t) => t.id === input.id);
          if (!t || t.deletedAt) throw Error('任务不存在或已删除');
          await xxl(t.enabled ? '/jobinfo/stop' : '/jobinfo/start', { id: String(t.jobId) });
          t.enabled = !t.enabled;
          await save();
          return t;
        });
      case 'run':
        return { accepted: true, run: await startManualRun(input.id) };
      default:
        throw Error('未知检测操作');
    }
  }
  const ownedApi = createOwnerScopedApi({ state, currentOwner, api });
  let requests = Promise.resolve();
  const scopedApi = (input) => {
    const pending = requests.then(async () => {
      if (!running.size) Object.assign(state, await store.load());
      const result = await ownedApi(input);
      if (input.op !== 'list') return result;
      const cutoff = Date.now() - DETECTION_TIMEOUT_MS;
      return {
        ...result,
        runs: result.runs.map((run) =>
          run.status === '执行中' && Date.parse(run.at) <= cutoff
            ? { ...run, status: '待核实', result: '检测已超过9分钟，尚未收到最终回执。' }
            : run,
        ),
      };
    });
    requests = pending.catch(() => {});
    return pending;
  };
  ctx.effect(() =>
    ctx.connection.fetch.register({
      path: '/api/agent-workbench/detection',
      methods: ['POST'],
      requestBody: 'buffered',
      fetch: async (req) => {
        try {
          return Response.json(await scopedApi(await req.json()), {
            headers: { 'Cache-Control': 'no-store' },
          });
        } catch (e) {
          return Response.json({ error: e.message }, { status: 400 });
        }
      },
    }),
  );
  let delivering = false;
  async function deliver() {
    if (delivering || (await scheduler({ operation: 'feishu-status' })).enabled !== true) return;
    delivering = true;
    try {
      await drainNotifications({ state, save, locked, send: sendNotification });
    } finally {
      delivering = false;
    }
  }
  for (const e of state.events)
    for (const n of e.notifications || [])
      if (n.status === '发送中') {
        n.status = '待核实';
        n.error = '宿主重启，发送结果需核实，不自动重发';
      }
  const deliveryTimer = setInterval(() => {
    void deliver().catch(() => {});
  }, 15000);
  deliveryTimer.unref();
  ctx.effect(() => () => clearInterval(deliveryTimer));
  let pollTimer;
  let disposed = false;
  let polling = false;
  async function pollExecutor() {
    if (disposed || polling) return;
    polling = true;
    let delay = 3000;
    try {
      const { job } = await scheduler({ operation: 'poll', busy: running.size > 0 });
      if (job && !disposed) {
        await requests;
        if (!running.size) Object.assign(state, await store.load());
        void runTask(job.taskId, job.runKey)
          .then(
            (result) =>
              scheduler({
                operation: 'complete',
                logId: job.logId,
                code: result.status === '成功' ? 200 : 500,
                message: result.result || '检测状态待核实',
              }),
            (error) =>
              scheduler({
                operation: 'complete',
                logId: job.logId,
                code: 500,
                message: error.message,
              }),
          )
          .catch(() => {});
      }
    } catch {
      delay = 15000;
    } finally {
      polling = false;
      if (!disposed) {
        pollTimer = setTimeout(() => void pollExecutor(), delay);
        pollTimer.unref();
      }
    }
  }
  pollTimer = setTimeout(() => void pollExecutor(), 1000);
  pollTimer.unref();
  ctx.effect(() => () => {
    disposed = true;
    clearTimeout(pollTimer);
  });
  return { api: scopedApi, runTask };
}
