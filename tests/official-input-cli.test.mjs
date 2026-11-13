import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
  return { consumer, registry, declaration, put, run };
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
