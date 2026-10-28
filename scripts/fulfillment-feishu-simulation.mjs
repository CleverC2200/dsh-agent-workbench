import fs from 'node:fs';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve, relative, isAbsolute } from 'node:path';
import {
  applyGroupedSimulationEvent,
  simulationMember,
  simulationCard,
} from './lib/fulfillment-simulation.mjs';
import { simulationWebHtml, simulationWebSnapshot } from './lib/fulfillment-simulation-web.mjs';

const configPath = resolve(process.argv[2] ?? '');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const { scope } = config;
if (
  config.host !== '127.0.0.1' ||
  config.port !== 3197 ||
  config.origin !== 'http://127.0.0.1:3198' ||
  !config.token ||
  !scope.simulation
)
  throw Error('SIMULATION_CONFIG_INVALID');
const statePath = resolve(config.statePath);
let state = fs.existsSync(statePath)
  ? JSON.parse(fs.readFileSync(statePath, 'utf8'))
  : {
      simulation: true,
      runId: scope.runId,
      status: '待模拟确认',
      records: [],
      orderNo: scope.orderNo,
      customerCode: scope.customerCode,
      base: scope.base,
    };
if (state.runId !== scope.runId) throw Error('SIMULATION_RUN_MISMATCH');
for (const order of scope.orders ?? []) {
  state.orderStates ??= {};
  state.orderStates[order.orderNo] ??= simulationMember(scope, state, order.orderNo).state;
}
const save = () => {
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
  if (config.previewHtmlPath) {
    const path = resolve(config.previewHtmlPath);
    if (
      path !==
      'D:\\order-agent-preview-merged-172\\candidate\\dsh-agent-workbench\\lib\\business\\inventory-orderfulfillment\\index.html'
    )
      throw Error('SIMULATION_PREVIEW_PATH_INVALID');
    const html = fs.readFileSync(path, 'utf8');
    fs.writeFileSync(
      path,
      html.replace(
        /(<script type="application\/json" id="fulfillment-simulation-config">)[\s\S]*?(<\/script>)/,
        (_match, start, end) =>
          start +
          JSON.stringify({
            runId: scope.runId,
            orderNo: scope.orderNo,
            customerCode: scope.customerCode,
            base: scope.base,
            ...(config.clientEnabled ? { token: config.token } : {}),
            allowedOrders: [scope, ...(scope.orders ?? [])].map(
              ({ orderNo, customerCode, base }) => ({ orderNo, customerCode, base }),
            ),
            state,
          }).replaceAll('<', '\\u003c') +
          end,
      ),
    );
  }
};
save();
const cli = ['C:/Users/admin/AppData/Roaming/npm/node_modules/@larksuite/cli/scripts/run.js'];
function run(args) {
  return new Promise((done, reject) => {
    const child = spawn(process.execPath, [...cli, ...args], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '',
      err = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, 45000);
    child.stdout.on('data', (data) => (out += data));
    child.stderr.on('data', (data) => (err += data));
    child.on('error', reject);
    child.on('close', (code) => {
      clearTimeout(timer);
      try {
        if (timedOut) throw Error('机器人响应超时，可使用同一幂等标识重试，避免重复发卡');
        if (!(out || err).trim()) throw Error('机器人未返回发送回执，请重试');
        const result = JSON.parse(out || err);
        if (code !== 0 || result.ok !== true) throw Error(result.error?.message ?? 'CLI failed');
        done(result.data);
      } catch (error) {
        reject(error);
      }
    });
  });
}
async function patch(view = 'home') {
  if (config.clientEnabled && !state.notification) return;
  const started = Date.now();
  const body = JSON.stringify({
    content: JSON.stringify(simulationCard({ ...scope, webToken: config.token }, state, view)),
  });
  const path = resolve(config.patchPath);
  fs.writeFileSync(path, body);
  const local = relative(process.cwd(), path);
  if (local.startsWith('..') || isAbsolute(local)) throw Error('SIMULATION_PATH_INVALID');
  await run([
    'api',
    'PATCH',
    `/open-apis/im/v1/messages/${scope.messageId}`,
    '--as',
    'bot',
    '--data',
    '@' + local,
  ]);
  console.log(JSON.stringify({ cardUpdated: true, view, elapsedMs: Date.now() - started }));
}
let pendingView = null;
let updating = false;
function refresh(view = 'home') {
  pendingView = view;
  if (updating) return;
  updating = true;
  void (async () => {
    try {
      while (pendingView !== null) {
        const next = pendingView;
        pendingView = null;
        await patch(next);
      }
    } catch (error) {
      console.error('CARD_PATCH_FAILED: ' + error.message);
    } finally {
      updating = false;
      if (pendingView !== null) refresh(pendingView);
    }
  })();
}
let notificationTask;
async function notify(snapshot) {
  const selected = simulationMember(scope, state, snapshot?.orderNo).scope;
  if (
    !snapshot ||
    snapshot.consumerCode !== 'order01' ||
    snapshot.customerCode !== selected.customerCode ||
    snapshot.base !== selected.base ||
    !Array.isArray(snapshot.lines) ||
    snapshot.lines.length > 200
  )
    throw Error('SIMULATION_ORDER_DENIED');
  if (state.notification) {
    const target =
      snapshot.orderNo === scope.orderNo
        ? scope
        : scope.orders.find((row) => row.orderNo === snapshot.orderNo);
    Object.assign(target, {
      customer: snapshot.customer,
      rate: snapshot.rate,
      quantity: snapshot.quantity,
      unit: '',
      lines: snapshot.lines.map((line) => ({
        name: line.name,
        sku: line.sku,
        quantity: line.quantity,
        shortage: line.shortage,
        unit: '',
        price: null,
      })),
    });
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    save();
    refresh();
    return;
  }
  if (notificationTask) return notificationTask;
  notificationTask = (async () => {
    Object.assign(scope, {
      customer: snapshot.customer,
      rate: snapshot.rate,
      quantity: snapshot.quantity,
      unit: '',
      lines: snapshot.lines.map((line) => ({
        name: line.name,
        sku: line.sku,
        quantity: line.quantity,
        shortage: line.shortage,
        unit: '',
        price: null,
      })),
    });
    const path = resolve(config.patchPath);
    fs.writeFileSync(
      path,
      JSON.stringify(simulationCard({ ...scope, webToken: config.token }, state)),
    );
    const local = relative(process.cwd(), path);
    if (local.startsWith('..') || isAbsolute(local)) throw Error('SIMULATION_PATH_INVALID');
    const sent = await run([
      'im',
      '+messages-send',
      '--as',
      'bot',
      '--chat-id',
      scope.chatId,
      '--msg-type',
      'interactive',
      '--content',
      '@' + local,
      '--idempotency-key',
      scope.runId,
    ]);
    const messageId = sent.message_id ?? sent.message?.message_id;
    if (typeof messageId !== 'string' || !messageId.startsWith('om_'))
      throw Error('SIMULATION_SEND_RECEIPT_INVALID');
    scope.messageId = messageId;
    state = { ...state, notification: { messageId, sentAt: new Date().toISOString() } };
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    save();
    console.log(
      JSON.stringify({ simulationNotification: true, messageId, orderNo: scope.orderNo }),
    );
  })().finally(() => {
    notificationTask = undefined;
  });
  return notificationTask;
}
const server = createServer(async (req, res) => {
  const simulationURL = new URL(req.url, 'http://127.0.0.1:3197');
  if (req.url === '/client' && req.headers.host === '127.0.0.1:3197') {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    if (!config.clientEnabled || req.headers.origin !== config.origin) {
      res.writeHead(403);
      res.end(JSON.stringify({ error: 'SIMULATION_CLIENT_DENIED' }));
      return;
    }
    res.setHeader('Access-Control-Allow-Origin', config.origin);
    res.setHeader('Vary', 'Origin');
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type,X-Simulation-Token');
      res.setHeader('Access-Control-Allow-Methods', 'POST');
      res.writeHead(204);
      res.end();
      return;
    }
    if (req.method !== 'POST' || req.headers['x-simulation-token'] !== config.token) {
      res.writeHead(403);
      res.end(JSON.stringify({ error: 'SIMULATION_ACCESS_DENIED' }));
      return;
    }
    try {
      let body = '';
      for await (const part of req) {
        body += part;
        if (body.length > 150000) throw Error('SIMULATION_REQUEST_TOO_LARGE');
      }
      const input = JSON.parse(body);
      if (input.runId !== scope.runId || !['state', 'notify'].includes(input.operation))
        throw Error('SIMULATION_ACTION_DENIED');
      if (input.operation === 'notify') await notify(input.snapshot);
      res.end(JSON.stringify({ state }));
    } catch (error) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: error.message }));
    }
    return;
  }
  if (req.headers.host === '127.0.0.1:3197' && req.url?.startsWith('/simulation')) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    if (req.method === 'GET' && /^\/simulation(?:\?|$)/.test(req.url)) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      );
      res.end(simulationWebHtml);
      return;
    }
    res.setHeader('Content-Type', 'application/json');
    if (
      simulationURL.pathname !== '/simulation/api' ||
      req.headers['x-simulation-token'] !== config.token ||
      !['GET', 'POST'].includes(req.method) ||
      (req.method === 'POST' &&
        (req.headers.origin !== 'http://127.0.0.1:3197' ||
          req.headers['content-type'] !== 'application/json'))
    ) {
      res.writeHead(403);
      res.end(JSON.stringify({ error: 'SIMULATION_ACCESS_DENIED' }));
      return;
    }
    try {
      const orderNo = simulationURL.searchParams.get('orderNo') ?? scope.orderNo;
      simulationMember(scope, state, orderNo);
      if (req.method === 'POST') {
        let body = '';
        for await (const data of req) {
          body += data;
          if (body.length > 2048) throw Error('SIMULATION_REQUEST_TOO_LARGE');
        }
        const input = JSON.parse(body);
        if (input.orderNo !== undefined && input.orderNo !== orderNo)
          throw Error('SIMULATION_ORDER_DENIED');
        if (
          !['confirm', 'defer'].includes(input.action) ||
          !/^[a-f\d-]{36}$/i.test(input.eventId ?? '')
        )
          throw Error('SIMULATION_ACTION_DENIED');
        const next = applyGroupedSimulationEvent(
          state,
          {
            chat_id: scope.chatId,
            message_id: scope.messageId,
            operator_id: scope.operatorId,
            event_id: 'h5:' + input.eventId,
            simulation_transport: 'LOCAL_FEISHU_H5',
            action_value: {
              simulation: true,
              runId: scope.runId,
              orderNo,
              action: input.action,
              days: input.days,
            },
          },
          scope,
        );
        if (next !== state) {
          state = next;
          save();
          refresh();
        }
        console.log(
          JSON.stringify({
            simulationWeb: input.action,
            status: state.status,
            count: state.records.length,
          }),
        );
      }
      const member = simulationMember(scope, state, orderNo);
      res.end(JSON.stringify(simulationWebSnapshot(member.scope, member.state)));
    } catch (error) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: error.message }));
    }
    return;
  }
  const origin = req.headers.origin;
  // Workbench HTML runs in an opaque-origin sandbox; the per-run token still gates reads.
  if (
    ![config.origin, 'null'].includes(origin) ||
    req.headers.host !== `127.0.0.1:${config.port}`
  ) {
    res.writeHead(403);
    res.end();
    return;
  }
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Headers', 'X-Simulation-Token');
    res.setHeader('Access-Control-Allow-Methods', 'GET');
    res.writeHead(204);
    res.end();
    return;
  }
  if (
    req.method !== 'GET' ||
    req.url !== '/state' ||
    req.headers['x-simulation-token'] !== config.token
  ) {
    res.writeHead(403);
    res.end();
    return;
  }
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(state));
});
await new Promise((done, reject) => {
  server.once('error', reject);
  server.listen(config.port, config.host, done);
});
const child = spawn(
  process.execPath,
  [...cli, 'event', 'consume', 'card.action.trigger', '--as', 'bot', '--timeout', '2h'],
  { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
);
let buffer = '',
  ready = false;
child.stderr.on('data', (data) => {
  const text = String(data);
  if (text.includes('[event] ready') && !ready) {
    ready = true;
    refresh();
    console.log('SIMULATION_READY: callback listening');
  } else if (/"ok":false|WARN|exited/.test(text))
    console.error(text.replace(/"token"\s*:\s*"[^"]*"/g, '"token":"[redacted]"'));
});
function consume(raw) {
  const event = raw.data?.type === 'card.action.trigger' ? raw.data : raw;
  if (
    event.type !== 'card.action.trigger' ||
    event.chat_id !== scope.chatId ||
    event.message_id !== scope.messageId ||
    event.operator_id !== scope.operatorId
  )
    return;
  const value =
    typeof event.action_value === 'string' ? JSON.parse(event.action_value) : event.action_value;
  if (value?.runId !== scope.runId || value.simulation !== true) return;
  simulationMember(scope, state, value.orderNo);
  console.log(
    JSON.stringify({
      callback: value.action,
      tag: event.action_tag,
      receivedAt: new Date().toISOString(),
    }),
  );
  const views = { open_details: 'details', home: 'home' };
  if (views[value.action]) return refresh(views[value.action]);
  event.event_id ||= createHash('sha256')
    .update(JSON.stringify([event.token, event.timestamp, event.message_id, event.action_value]))
    .digest('hex');
  const next = applyGroupedSimulationEvent(state, event, scope);
  if (next === state) return;
  state = next;
  save();
  console.log(
    JSON.stringify({
      received: true,
      action: value.action,
      status: state.status,
      count: state.records.length,
    }),
  );
  refresh();
}
child.stdout.on('data', (data) => {
  buffer += data;
  for (let index; (index = buffer.indexOf('\n')) >= 0;) {
    const line = buffer.slice(0, index);
    buffer = buffer.slice(index + 1);
    if (!line.trim()) continue;
    try {
      consume(JSON.parse(line));
    } catch (error) {
      console.error('SIMULATION_EVENT_REJECTED: ' + error.message);
    }
  }
});
child.on('exit', (code) => {
  console.log('SIMULATION_LISTENER_EXIT ' + code);
  server.close();
});
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    child.kill('SIGTERM');
    server.close();
  });
