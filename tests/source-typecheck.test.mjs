import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { checkTypes } from '../scripts/source-checks.mjs';

test('owner TypeScript checks fixed peer source types and emits no peer business output', async t => {
  const parent = mkdtempSync(join(tmpdir(), 'source-types-'));
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  const put = (root, file, content) => { mkdirSync(dirname(join(root, file)), { recursive: true }); writeFileSync(join(root, file), content); };
  const repositories = ['dsh-agent-workbench', 'dsh-agent-manage', 'dsh-gea-plugin'].map(repo => ({ repo, path: join(parent, repo), head: 'a'.repeat(40) }));
  for (const peer of repositories) put(peer.path, 'package.json', JSON.stringify({ name: peer.repo, type: 'module', exports: { './contract': { types: './lib/types/contract.d.ts' } } }));
  const root = repositories[0].path;
  put(repositories[1].path, 'src/contract.ts', 'export type Amount = number;');
  put(repositories[2].path, 'src/contract.ts', 'export type Unrelated = string;');
  put(root, 'tsconfig.official.json', JSON.stringify({ compilerOptions: { strict: true, module: 'NodeNext', moduleResolution: 'NodeNext', target: 'ES2023', skipLibCheck: true }, include: ['src/**/*.ts'] }));
  put(root, 'src/value.ts', 'import type { Amount } from "dsh-agent-manage/contract"; export const value: Amount = "wrong";');
  await assert.rejects(() => checkTypes(root, repositories, 'dsh-agent-workbench'), /SOURCE_TYPES_FAILED/);
  put(root, 'src/value.ts', 'import type { Amount } from "dsh-agent-manage/contract"; export const value: Amount = 2;');
  await checkTypes(root, repositories, 'dsh-agent-workbench');
  for (const peer of repositories) assert.equal(existsSync(join(peer.path, 'lib')), false);
});
