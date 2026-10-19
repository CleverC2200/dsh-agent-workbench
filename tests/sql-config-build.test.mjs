import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';
import { sqlConfigPlugin } from '../scripts/sql-config-build.mjs';

test('the SQL build adapter consumes the installed document instead of embedding authored SQL', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'sql-config-build-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, 'sql.config.json'), '{"sql":"authored_sql_must_not_be_embedded"}');
  const output = await build({
    stdin: {
      contents: 'import config from "./sql.config.json"; globalThis.configured = config.agentId;',
      resolveDir: root,
    },
    bundle: true,
    write: false,
    format: 'iife',
    plugins: [sqlConfigPlugin()],
  });
  const code = output.outputFiles[0].text;
  assert.ok(!code.includes('authored_sql_must_not_be_embedded'));
  const context = {
    document: {
      getElementById: (id) => {
        assert.equal(id, 'agent-sql-config');
        return { textContent: '{"agentId":"installed-fixture"}' };
      },
    },
  };
  runInNewContext(code, context);
  assert.equal(context.configured, 'installed-fixture');
  assert.throws(
    () => runInNewContext(code, { document: { getElementById: () => null } }),
    /缺少Agent SQL配置/,
  );
});
