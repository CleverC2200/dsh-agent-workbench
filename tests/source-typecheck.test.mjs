import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { checkTypes } from '../scripts/source-checks.mjs';

test('owner TypeScript checks fixed peer source types and emits no peer business output', async (t) => {
  const runtime = join(process.cwd(), '.runtime');
  mkdirSync(runtime, { recursive: true });
  const parent = mkdtempSync(join(runtime, 'source-types-'));
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  const put = (root, file, content) => {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), content);
  };
  const repositories = ['dsh-agent-workbench', 'dsh-agent-manage', 'dsh-gea-plugin'].map(
    (repo) => ({ repo, path: join(parent, repo), head: 'a'.repeat(40) }),
  );
  for (const peer of repositories)
    put(
      peer.path,
      'package.json',
      JSON.stringify({
        name: peer.repo,
        type: 'module',
        exports: { './contract': { types: './lib/types/contract.d.ts' } },
      }),
    );
  const root = repositories[0].path;
  put(repositories[1].path, 'src/contract.ts', 'export type Amount = number;');
  put(repositories[2].path, 'src/contract.ts', 'export type Unrelated = string;');
  put(
    root,
    'tsconfig.official.json',
    JSON.stringify({
      compilerOptions: {
        strict: true,
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        target: 'ES2023',
        skipLibCheck: true,
      },
      include: ['src/**/*.ts'],
    }),
  );
  put(
    root,
    'src/value.ts',
    'import type { Amount } from "dsh-agent-manage/contract"; export const value: Amount = "wrong";',
  );
  await assert.rejects(
    () => checkTypes(root, repositories, 'dsh-agent-workbench'),
    /SOURCE_TYPES_FAILED/,
  );
  put(
    root,
    'src/value.ts',
    'import type { Amount } from "dsh-agent-manage/contract"; export const value: Amount = 2;',
  );
  await checkTypes(root, repositories, 'dsh-agent-workbench');
  put(root, 'src/contract.ts', 'export type Count = number;');
  put(root, 'lib/types/contract.d.ts', 'export type Count = string;');
  put(
    root,
    'src/value.ts',
    'import type { Count } from "dsh-agent-workbench/contract"; export const self: Count = "wrong";',
  );
  await assert.rejects(
    () => checkTypes(root, repositories, 'dsh-agent-workbench'),
    /SOURCE_TYPES_FAILED/,
  );
  put(
    root,
    'src/value.ts',
    'import type { Count } from "dsh-agent-workbench/contract"; export const self: Count = 2;',
  );
  await checkTypes(root, repositories, 'dsh-agent-workbench');

  const gea = repositories[2].path;
  put(
    root,
    'package.json',
    JSON.stringify({
      name: '@cleverc2200/dsh-agent-workbench',
      type: 'module',
      exports: { './configured-query': { types: './lib/configured-query-client.d.mts' } },
    }),
  );
  put(
    root,
    'business/shared/configured-query-client.d.mts',
    'export interface QueryResult { count: number }',
  );
  put(
    gea,
    'tsconfig.official.json',
    JSON.stringify({
      compilerOptions: {
        strict: true,
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        target: 'ES2023',
        skipLibCheck: true,
      },
      include: ['src/**/*.ts'],
    }),
  );
  put(
    gea,
    'src/consumer.ts',
    'import type { QueryResult } from "@cleverc2200/dsh-agent-workbench/configured-query"; export const result: QueryResult = { count: "wrong" };',
  );
  await assert.rejects(
    () => checkTypes(gea, repositories, 'dsh-gea-plugin'),
    /SOURCE_TYPES_FAILED/,
  );
  put(
    gea,
    'src/consumer.ts',
    'import type { QueryResult } from "@cleverc2200/dsh-agent-workbench/configured-query"; export const result: QueryResult = { count: 2 };',
  );
  await checkTypes(gea, repositories, 'dsh-gea-plugin');
  for (const peer of repositories.slice(1)) assert.equal(existsSync(join(peer.path, 'lib')), false);
  assert.equal(
    readFileSync(join(root, 'lib/types/contract.d.ts'), 'utf8'),
    'export type Count = string;',
  );
});

test('peer source keeps its explicit SDK declarations while owner aliases and real errors remain authoritative', async (t) => {
  const runtime = join(process.cwd(), '.runtime');
  mkdirSync(runtime, { recursive: true });
  const parent = mkdtempSync(join(runtime, 'source-sdk-aliases-'));
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  const put = (root, file, content) => {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), content);
  };
  const repositories = ['dsh-agent-workbench', 'dsh-agent-manage', 'dsh-gea-plugin'].map(
    (repo) => ({
      repo,
      path: join(parent, repo === 'dsh-agent-workbench' ? 'source' : 'candidate', repo),
      head: 'a'.repeat(40),
    }),
  );
  for (const peer of repositories)
    put(
      peer.path,
      'package.json',
      JSON.stringify({
        name: peer.repo,
        type: 'module',
        exports: { './contract': { types: './lib/types/contract.d.ts' } },
      }),
    );
  const workbench = repositories[0].path,
    root = repositories[2].path,
    sdk = join(parent, 'official-latest-standard');
  put(sdk, 'packages/demo/lib/types/reference.d.ts', 'export type Amount = number;');
  put(sdk, 'packages/demo/lib/types/owner.d.ts', 'export type OwnerAmount = number;');
  put(sdk, 'packages/demo/lib/types/peer-owner.d.ts', 'export type OwnerAmount = string;');
  put(
    workbench,
    'node_modules/@deepseek-ai/demo/package.json',
    JSON.stringify({
      name: '@deepseek-ai/demo',
      type: 'module',
      exports: { './src/reference': './src/reference.ts' },
    }),
  );
  put(
    workbench,
    'node_modules/@deepseek-ai/demo/src/reference.ts',
    'export type Amount = string; export const invalid: number = "bad SDK source";',
  );
  put(
    workbench,
    'tsconfig.official.json',
    JSON.stringify({
      compilerOptions: {
        baseUrl: './types',
        paths: {
          '@deepseek-ai/demo/src/reference': [
            '../../../official-latest-standard/packages/demo/lib/types/reference.d.ts',
          ],
          '@deepseek-ai/demo/owner': [
            '../../../official-latest-standard/packages/demo/lib/types/peer-owner.d.ts',
          ],
        },
      },
    }),
  );
  const peerSource = 'export type { Amount } from "@deepseek-ai/demo/src/reference";';
  put(workbench, 'src/contract.ts', peerSource);
  put(
    root,
    'tsconfig.official.json',
    JSON.stringify({
      compilerOptions: {
        strict: true,
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        target: 'ES2023',
        skipLibCheck: true,
        paths: {
          '@deepseek-ai/demo/owner': [
            '../../official-latest-standard/packages/demo/lib/types/owner.d.ts',
          ],
        },
      },
      include: ['src/**/*.ts'],
    }),
  );
  const ownerSource =
    'import type { Amount } from "dsh-agent-workbench/contract"; import type { OwnerAmount } from "@deepseek-ai/demo/owner"; export const value: Amount = 1; export const own: OwnerAmount = 2;';
  put(root, 'src/value.ts', ownerSource);
  await checkTypes(root, repositories, 'dsh-gea-plugin');
  put(root, 'src/value.ts', ownerSource.replace('value: Amount = 1', 'value: Amount = "wrong"'));
  await assert.rejects(
    () => checkTypes(root, repositories, 'dsh-gea-plugin'),
    /SOURCE_TYPES_FAILED/,
  );
  put(root, 'src/value.ts', ownerSource);
  put(workbench, 'src/contract.ts', peerSource + ' export const peer: number = "wrong";');
  await assert.rejects(
    () => checkTypes(root, repositories, 'dsh-gea-plugin'),
    /SOURCE_TYPES_FAILED/,
  );
});
