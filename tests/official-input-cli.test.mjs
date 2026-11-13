import test from 'node:test';
import assert from 'node:assert/strict';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'official-input-cli-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const put = (file, text) => {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
  };
  const core = join(root, 'core');
  const declaration = join(core, 'vendor/cordis/lib/types/index.d.ts');
  put(declaration, 'export {};\n');
  const git = (...args) => execFileSync('git', ['-C', core, ...args], { encoding: 'utf8' }).trim();
  git('init', '-q');
  git('add', '.');
  git('-c', 'user.name=fixture', '-c', 'user.email=fixture@invalid', 'commit', '-qm', 'fixture');
  const head = git('rev-parse', 'HEAD');
  const workbench = join(root, 'tools/dsh-agent-workbench');
  const tool = join(workbench, 'scripts/verify-official-input.mjs');
  mkdirSync(dirname(tool), { recursive: true });
  copyFileSync(resolve('scripts/verify-official-input.mjs'), tool);
  const config = JSON.stringify({
    compilerOptions: { paths: { '@deepseek-ai/cordis': [declaration] } },
  });
  put(join(workbench, 'tsconfig.official.json'), config);
  put(join(root, 'tools/dsh-gea-plugin/scripts/supported-cores.json'), JSON.stringify([{ head }]));
  const consumer = join(root, 'independent consumer');
  const registry = join(consumer, 'scripts/supported-cores.json');
  put(join(consumer, 'tsconfig.official.json'), config);
  put(registry, JSON.stringify([{ head }]));
  const run = (...args) =>
    spawnSync(process.execPath, [tool, ...args], { cwd: consumer, encoding: 'utf8' });
  return { root, core, consumer, registry, declaration, put, run };
}

test('default input remains the tool Workbench while explicit input uses the independent consumer and its registry', (t) => {
  const f = fixture(t);
  assert.equal(f.run().status, 0);
  assert.match(f.run('--root', f.consumer).stderr, /OFFICIAL_REGISTRY_REQUIRED/);
  const selected = f.run('--root', f.consumer, '--registry', f.registry);
  assert.equal(selected.status, 0, selected.stderr);
  assert.equal(JSON.parse(selected.stdout).consumer, f.consumer);
  assert.equal(JSON.parse(selected.stdout).registry, f.registry);
  f.put(f.registry, '[]');
  assert.equal(f.run().status, 0);
  const rejected = f.run('--root', f.consumer, '--registry', f.registry);
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr, /OFFICIAL_INPUT_REQUIRED/);
});

test('a valid tool configuration does not hide the consumer missing configuration or declarations', (t) => {
  const f = fixture(t);
  const path = join(f.consumer, 'tsconfig.official.json');
  const original = readFileSync(path, 'utf8');
  rmSync(path);
  let result = f.run('--root', f.consumer, '--registry', f.registry);
  assert.notEqual(result.status, 0);
  assert.ok(result.stderr.includes(path));
  const config = JSON.parse(original);
  config.compilerOptions.paths['@deepseek-ai/missing'] = ['./absent.d.ts'];
  f.put(path, JSON.stringify(config));
  result = f.run('--root', f.consumer, '--registry', f.registry);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /OFFICIAL_MATERIAL_REQUIRED.*@deepseek-ai\/missing/);
});

test('explicit consumer verification still rejects tracked Core changes', (t) => {
  const f = fixture(t);
  f.put(f.declaration, 'export const changed = true;\n');
  const result = f.run('--root', f.consumer, '--registry', f.registry);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /with tracked changes/);
});

test('every existing SDK candidate resolves inside the registered Core, including symlink targets', (t) => {
  const f = fixture(t);
  const config = JSON.parse(readFileSync(join(f.consumer, 'tsconfig.official.json'), 'utf8'));
  const sdk = join(f.core, 'packages/sdk/client/lib/types/index.d.ts');
  const outside = join(f.root, 'another-core/packages/sdk/client/lib/types/index.d.ts');
  f.put(sdk, 'export {};\n');
  f.put(outside, 'export {};\n');
  const linked = join(f.core, 'linked-sdk.d.ts');
  symlinkSync(outside, linked);
  const alias = '@deepseek-ai/dsh-sdk-client';
  const run = (paths) => {
    config.compilerOptions.paths[alias] = paths;
    f.put(join(f.consumer, 'tsconfig.official.json'), JSON.stringify(config));
    return f.run('--root', f.consumer, '--registry', f.registry);
  };
  for (const paths of [[sdk], [join(f.core, 'absent.d.ts'), sdk]]) {
    const result = run(paths);
    assert.equal(result.status, 0, result.stderr);
  }
  for (const paths of [[outside], [sdk, outside], [outside, sdk], [linked]]) {
    const result = run(paths);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /OFFICIAL_SOURCE_MISMATCH/);
    assert.ok(result.stderr.includes(alias));
    assert.ok(result.stderr.includes(outside));
  }
});
