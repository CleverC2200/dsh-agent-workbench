import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
const tick = () => new Promise((r) => setImmediate(r));
for (const agent of ['fc', 'aqkc', 'qll', 'dealer', 'apsplan'])
  test(
    agent +
      ': configured page uses owned channel with ten-row fresh queries, cancellation and identity withdrawal',
    async (t) => {
      const config = JSON.parse(
        await readFile('business/inventory-' + agent + '/sql.config.json', 'utf8'),
      );
      const saved = {
        window: globalThis.window,
        document: globalThis.document,
        fetch: globalThis.fetch,
      };
      const listeners = new Map(),
        sent = [],
        events = [];
      const parent = { postMessage() {} };
      globalThis.window = {
        parent,
        addEventListener: (n, f) => listeners.set(n, f),
        dispatchEvent: (e) => events.push(e.type),
      };
      globalThis.document = {
        referrer: 'https://host.example/workbench',
        getElementById: (id) =>
          id === 'agent-sql-config' ? { textContent: JSON.stringify(config) } : null,
      };
      globalThis.fetch = () => {
        throw Error('configured pages must not fetch a direct database endpoint');
      };
      t.after(() => {
        for (const [k, v] of Object.entries(saved)) {
          if (v === undefined) delete globalThis[k];
          else globalThis[k] = v;
        }
      });
      const built = await build({
        stdin: {
          contents:
            "export {createAgentQueries} from './business/shared/agent-query.ts'; export {usesConfiguredSql} from './business/shared/sql-config.ts';",
          resolveDir: process.cwd(),
        },
        bundle: true,
        write: false,
        format: 'esm',
        platform: 'browser',
      });
      const mod = await import(
        'data:text/javascript;base64,' +
          Buffer.from(built.outputFiles[0].text).toString('base64') +
          '#' +
          agent
      );
      assert.equal(mod.usesConfiguredSql(), true);
      const client = mod.createAgentQueries(config);
      const [id, q] = Object.entries(config.queries).find(([, q]) => q.pagination?.countQuery);
      const values = Object.fromEntries(
        Object.entries(q.parameterSpec).map(([k, s]) => [s.name, q.request.parameters[k]]),
      );
      values.page_size = 10;
      values.offset = 0;
      const port = { onmessage: null, start() {}, close() {}, postMessage: (m) => sent.push(m) };
      const first = client.read(id, values);
      for (let i = 0; i < 100 && !listeners.has('message'); i++) await tick();
      assert.ok(listeners.has('message'));
      listeners.get('message')({
        source: parent,
        origin: 'https://host.example',
        data: {
          protocol: 'gea-html-v2',
          type: 'connect',
          context: { plugin: config.agentId, session: 'owned' },
        },
        ports: [port],
      });
      async function request(n) {
        for (let i = 0; i < 100 && sent.filter((m) => m.type === 'request').length < n; i++)
          await tick();
        const all = sent.filter((m) => m.type === 'request');
        assert.equal(all.length, n);
        return all.at(-1);
      }
      const r1 = await request(1);
      assert.deepEqual(r1.parameters, { queryId: id, parameters: values, freshAfter: 0 });
      assert.equal(r1.session, 'owned');
      port.onmessage({ data: { type: 'response', id: r1.id, result: { rows: [{ fixture: 1 }] } } });
      assert.deepEqual((await first).rows, [{ fixture: 1 }]);
      const second = client.read(id, { ...values, offset: 10 });
      const r2 = await request(2);
      assert.equal(r2.parameters.parameters.offset, 10);
      assert.equal(r2.parameters.parameters.page_size, 10);
      port.onmessage({ data: { type: 'response', id: r2.id, result: { rows: [{ fixture: 2 }] } } });
      assert.deepEqual((await second).rows, [{ fixture: 2 }]);
      const abort = new AbortController();
      const pending = client.read(id, values, { signal: abort.signal });
      const rejected = assert.rejects(pending, { name: 'AbortError' });
      const r3 = await request(3);
      abort.abort();
      await rejected;
      assert.ok(sent.some((m) => m.type === 'cancel' && m.id === r3.id));
      const stale = client.read(id, values);
      const staleRejected = assert.rejects(stale, /身份已变化/);
      const r4 = await request(4);
      port.onmessage({ data: { type: 'identity-changed' } });
      await staleRejected;
      port.onmessage({
        data: { type: 'response', id: r4.id, result: { rows: [{ fixture: 'late' }] } },
      });
      await assert.rejects(client.read(id, values), /请先登录并连接/);
      assert.equal(sent.filter((m) => m.type === 'request').length, 4);
      assert.ok(events.includes('gea-identity-changed'));
    },
  );

test('structured permission and publication failures remain distinct from an empty dataset', async () => {
  const { sqlQueryError } = await import('../business/shared/query-error.js');
  assert.equal(
    sqlQueryError({
      errorCode: 'AI_GATEWAY_DATA_PERMISSION_DENIED',
      failure: { reasonCode: 'NO_RETURN_COLUMN_ALLOWED' },
    }).message,
    '当前账号暂无数据权限',
  );
  assert.match(
    sqlQueryError({ failure: { reasonCode: 'FIELD_NOT_PUBLISHED' } }).message,
    /尚未发布或授权/,
  );
});
