import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { mountSalesConfirmationTransport } from '../prototypes/inventory-orderfulfillment/sales-confirmation-transport.mjs';

const period = { start: '2026-10-27', endExclusive: '2026-10-28' };
const a = { order_no: 'A', customer_code: 'cust', base: '郑州' },
  b = { ...a, order_no: 'B' };
const selection = (row) => ({
  orderNo: row.order_no,
  customerCode: row.customer_code,
  base: row.base,
  ...period,
});
async function until(check) {
  for (let i = 0; i < 60; i++) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.ok(check());
}

test('formal page sends only order selection and reloads persisted decisions on reopening', async (t) => {
  let decision;
  const sent = [];
  const request = async (payload) => {
    sent.push(payload);
    if (payload.operation === 'capabilities') return { available: true };
    if (payload.operation === 'create') {
      decision = {
        status: 'resolved',
        decisions: [
          { action_id: 'confirm_shipment', actor_id: 'sales1', decided_at: '2026-10-28' },
        ],
      };
      return decision;
    }
    if (payload.operation === 'lookup_batch')
      return {
        records: payload.selections.map((s) => ({
          selection: s,
          ...(s.orderNo === 'A' && decision ? decision : { status: 'not_requested' }),
        })),
      };
    if (payload.operation === 'lookup') return decision;
    throw Error('unexpected operation');
  };
  const first = new JSDOM('<button id="a"></button><button id="b"></button>');
  const transport = mountSalesConfirmationTransport(first.window.document, request);
  t.after(() => transport.clear());
  transport.watch(first.window.document.getElementById('a'), a, period);
  transport.watch(first.window.document.getElementById('b'), b, period);
  await until(() => first.window.document.getElementById('b').textContent === '未发起');
  await transport.notify({
    ...a,
    orderNo: 'A',
    customerCode: 'cust',
    ...period,
    rate: 100,
    chatId: 'untrusted-group',
    seller: 'untrusted-sales',
  });
  assert.deepEqual(
    sent.find((p) => p.operation === 'create'),
    { operation: 'create', selection: selection(a) },
  );
  assert.equal(first.window.document.getElementById('a').textContent, '已登记确认');
  assert.equal(first.window.document.getElementById('b').textContent, '未发起');
  transport.clear();
  const reopened = new JSDOM('<button id="status"></button>');
  const next = mountSalesConfirmationTransport(reopened.window.document, request);
  t.after(() => next.clear());
  next.watch(reopened.window.document.getElementById('status'), a, period);
  await until(() => reopened.window.document.getElementById('status').textContent === '已登记确认');
  assert.match((await next.history(a, period)).details, /sales1/);
});

test('a late result after scope or identity changes cannot restore an old confirmation', async () => {
  const dom = new JSDOM('<button id="status">未接入</button>');
  let resolve;
  const pending = new Promise((done) => {
    resolve = done;
  });
  const transport = mountSalesConfirmationTransport(dom.window.document, async (p) =>
    p.operation === 'capabilities' ? { available: true } : pending,
  );
  const operation = transport.history(a, period);
  await new Promise((done) => setTimeout(done, 0));
  transport.clear();
  resolve({ status: 'resolved', decisions: [{ action_id: 'confirm_shipment' }] });
  await assert.rejects(operation, /范围已切换/);
  assert.equal(dom.window.document.getElementById('status').textContent, '未接入');
});

test('disabled formal capability never falls back to a simulated result or sends a notification', async (t) => {
  const dom = new JSDOM('<button id="status">未接入</button>');
  const calls = [];
  const transport = mountSalesConfirmationTransport(dom.window.document, async (p) => {
    calls.push(p);
    return { available: false };
  });
  t.after(() => transport.clear());
  transport.watch(dom.window.document.getElementById('status'), a, period);
  await until(() => calls.length > 0);
  await new Promise((done) => setTimeout(done, 20));
  assert.deepEqual(calls, [{ operation: 'capabilities' }]);
  assert.equal(dom.window.document.getElementById('status').textContent, '未接入');
  await assert.rejects(transport.history(a, period), /尚未启用/);
  await assert.rejects(transport.notify({ ...a, ...period }), /尚未启用/);
  assert.ok(calls.every((call) => call.operation === 'capabilities'));
});

test('unavailable status data is explained and never displayed as not requested or an old success', async (t) => {
  const dom = new JSDOM('<button id="status">未接入</button>');
  let missing = false;
  const transport = mountSalesConfirmationTransport(dom.window.document, async (payload) => {
    if (payload.operation === 'capabilities') return { available: true };
    if (missing) return { records: [] };
    return {
      records: [
        {
          selection: selection(a),
          status: 'resolved',
          decisions: [{ action_id: 'confirm_shipment' }],
        },
      ],
    };
  });
  t.after(() => {
    transport.clear();
    dom.window.close();
  });
  const button = dom.window.document.getElementById('status');
  transport.watch(button, a, period);
  await until(() => button.textContent === '已登记确认');
  missing = true;
  transport.watch(button, a, period);
  await until(() => button.textContent === '状态待核实');
  assert.match(button.title, /未返回该订单的授权记录/);
});

test('batch failures show the reason and transient capability failure can be retried', async (t) => {
  const dom = new JSDOM('<button id="status">未接入</button>');
  let probes = 0;
  const transport = mountSalesConfirmationTransport(dom.window.document, async (payload) => {
    if (payload.operation === 'capabilities') {
      if (++probes === 1) throw Error('temporary');
      return { available: true };
    }
    throw Error('当前订单读取被拒绝');
  });
  t.after(() => {
    transport.clear();
    dom.window.close();
  });
  assert.equal(await transport.available(), false);
  assert.equal(await transport.available(), true);
  const button = dom.window.document.getElementById('status');
  transport.watch(button, a, period);
  await until(() => button.textContent === '状态待核实');
  assert.match(button.title, /当前订单读取被拒绝/);
});

test('identity change during capability discovery cannot start a late create or history request', async () => {
  for (const operation of ['notify', 'history']) {
    const dom = new JSDOM('');
    let release;
    const calls = [];
    const pending = new Promise((resolve) => {
      release = resolve;
    });
    const transport = mountSalesConfirmationTransport(dom.window.document, async (payload) => {
      calls.push(payload);
      return pending;
    });
    const result =
      operation === 'notify' ? transport.notify({ ...a, ...period }) : transport.history(a, period);
    await new Promise((resolve) => setImmediate(resolve));
    transport.clear();
    release({ available: true });
    await assert.rejects(result, /范围已切换/);
    assert.deepEqual(calls, [{ operation: 'capabilities' }]);
    dom.window.close();
  }
});

test('a malformed or mismatched batch cannot publish a partial confirmation', async (t) => {
  const dom = new JSDOM('<button id="a">未接入</button><button id="b">未接入</button>');
  const transport = mountSalesConfirmationTransport(dom.window.document, async (payload) =>
    payload.operation === 'capabilities'
      ? { available: true }
      : {
          records: [
            { selection: selection(a), status: 'resolved' },
            { selection: { ...selection(b), customerCode: 'other' }, status: 'resolved' },
          ],
        },
  );
  t.after(() => {
    transport.clear();
    dom.window.close();
  });
  transport.watch(dom.window.document.getElementById('a'), a, period);
  transport.watch(dom.window.document.getElementById('b'), b, period);
  await until(() => dom.window.document.getElementById('a').textContent === '状态待核实');
  assert.equal(dom.window.document.getElementById('b').textContent, '状态待核实');
});

test('failed, unknown and queued delivery cannot be reported as awaiting a salesperson', async () => {
  for (const [delivery, label] of [
    ['failed', '发送失败'],
    ['verification_required', '发送待核实'],
    ['queued', '待发送'],
    ['sending', '发送中'],
    ['sent', '待销售处理'],
  ]) {
    const dom = new JSDOM('<button id="status"></button>');
    const transport = mountSalesConfirmationTransport(dom.window.document, async (payload) =>
      payload.operation === 'capabilities'
        ? { available: true }
        : { records: [{ selection: selection(a), status: 'pending', delivery }] },
    );
    try {
      const button = dom.window.document.getElementById('status');
      transport.watch(button, a, period);
      await until(() => button.textContent === label);
      if (delivery === 'verification_required') assert.match(button.title, /不能认定销售已收到/);
    } finally {
      transport.clear();
      dom.window.close();
    }
  }
});
