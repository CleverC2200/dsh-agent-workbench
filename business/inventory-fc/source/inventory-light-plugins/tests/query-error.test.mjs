import test from 'node:test';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import {
  DATA_PERMISSION_MESSAGE,
  sqlQueryError,
  queryErrorText,
  sqlReportCopy,
} from '../src/query-error.js';

test('SQL failures distinguish expired sessions from denied permissions', () => {
  for (const [message, expected] of [
    ['GEA_GATEWAY_SESSION_REJECTED', '数据会话已失效，请刷新页面重试'],
    ['AI_GATEWAY_SESSION_EXPIRED', '数据会话已失效，请刷新页面重试'],
    ['AI_GATEWAY_DATA_PERMISSION_DENIED', DATA_PERMISSION_MESSAGE],
    ['GEA_HTTP_200: 受控 SQL 执行失败', '数据读取失败，请刷新重试；若仍失败，请查看接口错误详情'],
  ]) {
    const cause = Error(message),
      error = sqlQueryError(cause);
    assert.equal(error.message, expected);
    assert.equal(error.cause, cause);
    assert.equal(sqlQueryError(error), error);
  }
  assert.equal(
    queryErrorText('基地日监控：' + DATA_PERMISSION_MESSAGE + '；详情'),
    DATA_PERMISSION_MESSAGE,
  );
  const cancel = new DOMException('cancelled', 'AbortError');
  assert.equal(sqlQueryError(cancel), cancel);
  assert.equal(queryErrorText('保存失败'), '保存失败');
  assert.equal(queryErrorText('暂无数据'), '暂无数据');
});
test('SQL-backed report copy does not change metrics or true empty states', () => {
  const report = {
    sources: [{ status: '读取失败，数据不足' }, { status: '无可见数据或未发布' }],
    metric: 0,
    missing: null,
    notes: ['当前订单读取失败，缺货暂不可判断'],
  };
  const result = sqlReportCopy(report);
  assert.equal(result.sources[0].status, report.sources[0].status);
  assert.equal(result.sources[1].status, report.sources[1].status);
  assert.equal(result.notes[0], report.notes[0]);
  assert.equal(result.metric, 0);
  assert.equal(result.missing, null);
  assert.equal(report.sources[0].status, '读取失败，数据不足');
});
test('SQL adapter normalizes single/batch failures, leaves success and cancellation intact', async () => {
  for (const batched of [false, true]) {
    const output = await build({
      entryPoints: [fileURLToPath(new URL('../src/data.ts', import.meta.url))],
      bundle: true,
      platform: 'node',
      format: 'esm',
      write: false,
      define: { DSH_COLUMNAR_SQL: String(batched), DSH_GOVERNED_SQL: 'true' },
      plugins: [
        {
          name: 'transport-fixture',
          setup(b) {
            b.onResolve({ filter: /channel\.js$/ }, () => ({
              path: 'channel',
              namespace: 'fixture',
            }));
            b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({
              contents: 'export const call=(...args)=>globalThis.__sqlErrorTransport(...args);',
            }));
          },
        },
      ],
    });
    const { database } = await import(
      'data:text/javascript;base64,' + Buffer.from(output.outputFiles[0].text).toString('base64')
    );
    try {
      globalThis.__sqlErrorTransport = async () => {
        throw Error('GEA_HTTP_200: SQL failed');
      };
      await assert.rejects(
        database.query('SELECT 1'),
        (e) => e.message.startsWith('数据读取失败') && e.cause.message.includes('GEA_HTTP'),
      );
      if (batched) {
        globalThis.__sqlErrorTransport = async () => ({
          results: [{ ok: false, error: '受控 SQL 执行失败' }],
        });
        await assert.rejects(database.query('SELECT 1'), (e) =>
          e.message.startsWith('数据读取失败'),
        );
      }
      const value = { rows: [{ qty: 0 }, { qty: null }], total: 2 };
      globalThis.__sqlErrorTransport = async () =>
        batched ? { results: [{ ok: true, value }] } : value;
      assert.deepEqual((await database.query('SELECT 1')).rows, value.rows);
      const signal = new AbortController();
      signal.abort();
      globalThis.__sqlErrorTransport = async () => {
        throw signal.signal.reason;
      };
      await assert.rejects(
        database.query('SELECT 1', [], { signal: signal.signal }),
        (e) => e === signal.signal.reason,
      );
    } finally {
      delete globalThis.__sqlErrorTransport;
    }
  }
});
