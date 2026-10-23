import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { checkTypes } from '../scripts/source-checks.mjs';

test('Manage changed sources retain their Host and client configs and real type errors still fail', async (t) => {
  const runtime = join(process.cwd(), '.runtime');
  mkdirSync(runtime, { recursive: true });
  const root = mkdtempSync(join(runtime, 'manage-source-types-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const put = (file, content) => {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), content);
  };
  put('package.json', '{"type":"module"}');
  const compilerOptions = {
    strict: true,
    target: 'ES2023',
    module: 'NodeNext',
    moduleResolution: 'NodeNext',
    types: [],
    skipLibCheck: true,
  };
  put(
    'tsconfig.json',
    JSON.stringify({
      compilerOptions: { ...compilerOptions, lib: ['ES2023'] },
      include: ['src/**/*.ts'],
      exclude: ['src/client/**'],
    }),
  );
  put(
    'tsconfig.client.json',
    JSON.stringify({
      compilerOptions: { ...compilerOptions, lib: ['ES2023', 'DOM'], jsx: 'preserve' },
      include: ['src/client/**/*.ts', 'src/client/**/*.tsx'],
    }),
  );
  put('src/client/jsx.d.ts', 'declare namespace JSX { interface IntrinsicElements { div: {} } }');
  const client =
    'export const element: HTMLElement = document.createElement("div"); export const view = <div />;';
  put('src/client/view.tsx', client);
  put('src/host.ts', 'export const value: number = 1;');
  const changed = ['src/host.ts', 'src/client/view.tsx'];
  await checkTypes(root, [], 'dsh-agent-manage', changed);
  put('src/client/view.tsx', client + ' export const invalid: number = "wrong";');
  await assert.rejects(
    () => checkTypes(root, [], 'dsh-agent-manage', changed),
    /SOURCE_TYPES_FAILED: tsconfig\.client\.json/,
  );
  put('src/client/view.tsx', client);
  put('src/host.ts', 'export const value: number = "wrong";');
  await assert.rejects(
    () => checkTypes(root, [], 'dsh-agent-manage', changed),
    /SOURCE_TYPES_FAILED: tsconfig\.json/,
  );
  put('src/host.ts', 'export const value: number = 1;');
  put('business/extra.mts', 'export const value: number = "wrong";');
  await assert.rejects(
    () => checkTypes(root, [], 'dsh-agent-manage', [...changed, 'business/extra.mts']),
    /SOURCE_TYPES_FAILED/,
  );
});

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

test('peer source retains Core declaration aliases while owner paths and application isolation stay authoritative', async (t) => {
  const runtime = join(process.cwd(), '.runtime');
  mkdirSync(runtime, { recursive: true });
  const parent = mkdtempSync(join(runtime, 'peer-core-types-'));
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  const put = (root, file, content) => {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), content);
  };
  const repositories = ['dsh-agent-workbench', 'dsh-gea-plugin'].map((repo) => ({
    repo,
    path: join(parent, 'candidate', repo),
    head: 'a'.repeat(40),
  }));
  const [workbench, gea] = repositories;
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
  const core = join(parent, 'official-latest-standard');
  put(core, 'package.json', '{"type":"module"}');
  put(
    core,
    'fixture/src/client.ts',
    `
    export interface Contract { count: number }
    declare global { interface FixtureRegistry { chat: { identity: 'source' } } }
  `,
  );
  const declaration = `
    export interface Contract { count: number }
    declare global { interface FixtureRegistry { chat: { identity: 'declaration' } } }
  `;
  put(core, 'fixture/lib/types/client.d.ts', declaration);
  const paths = {
    '@fixture/core': ['../../official-latest-standard/fixture/lib/types/client.d.ts'],
    '@fixture/core/*': ['../../official-latest-standard/fixture/*'],
  };
  const alias = '@fixture/core/src/client.ts';
  const config = (paths) =>
    JSON.stringify({
      compilerOptions: {
        strict: true,
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        target: 'ES2023',
        paths,
      },
      include: ['src/**/*.ts'],
    });
  put(
    workbench.path,
    'tsconfig.official.json',
    config({
      ...paths,
      [alias]: paths['@fixture/core'],
      '@fixture/private': ['./src/private.d.ts'],
    }),
  );
  put(workbench.path, 'src/private.d.ts', 'export interface PrivateContract { count: number }');
  put(
    workbench.path,
    'src/contract.ts',
    `import type {} from '@fixture/core'; export type { Contract } from '${alias}';`,
  );
  put(gea.path, 'tsconfig.official.json', config(paths));
  const consumer =
    'import type { Contract } from "dsh-agent-workbench/contract"; export const value: Contract = { count: 2 };';
  put(gea.path, 'src/consumer.ts', consumer);
  await checkTypes(gea.path, repositories, gea.repo);
  put(gea.path, 'src/consumer.ts', consumer.replace('count: 2', 'count: "wrong"'));
  await assert.rejects(() => checkTypes(gea.path, repositories, gea.repo), /SOURCE_TYPES_FAILED/);
  put(core, 'fixture/lib/types/owner.d.ts', 'export interface Contract { count: string }');
  put(
    gea.path,
    'tsconfig.official.json',
    config({ ...paths, [alias]: ['../../official-latest-standard/fixture/lib/types/owner.d.ts'] }),
  );
  await checkTypes(gea.path, repositories, gea.repo);
  put(
    gea.path,
    'src/consumer.ts',
    'import type { PrivateContract } from "@fixture/private"; export const value: PrivateContract = { count: 2 };',
  );
  await assert.rejects(() => checkTypes(gea.path, repositories, gea.repo), /SOURCE_TYPES_FAILED/);
  assert.equal(readFileSync(join(core, 'fixture/lib/types/client.d.ts'), 'utf8'), declaration);
  for (const peer of repositories) assert.equal(existsSync(join(peer.path, 'lib')), false);
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
