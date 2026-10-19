import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';

test('the opaque inventory build keeps memory storage after repository formatting changes', async (t) => {
  await mkdir('.runtime', { recursive: true });
  const fixture = await mkdtemp(resolve('.runtime/inventory-storage-'));
  t.after(() => rm(fixture, { recursive: true, force: true }));
  const workbench = join(fixture, 'dsh-agent-workbench');
  await mkdir(join(workbench, 'scripts'), { recursive: true });
  await cp('scripts/build-inventory-fc.mjs', join(workbench, 'scripts/build-inventory-fc.mjs'));
  await cp('scripts/build-inventory.mjs', join(workbench, 'scripts/build-inventory.mjs'));
  await cp('scripts/sql-config-build.mjs', join(workbench, 'scripts/sql-config-build.mjs'));
  await cp('business/shared', join(workbench, 'business/shared'), { recursive: true });
  await cp('theme', join(workbench, 'theme'), { recursive: true });
  await cp('business/inventory-fc', join(workbench, 'business/inventory-fc'), {
    recursive: true,
    filter: (path) => !path.split(/[\\/]/).includes('node_modules'),
  });
  await cp(
    resolve(
      process.env.WORKBENCH_TEST_MANAGE_ROOT ?? '../dsh-agent-manage',
      'business-resources/inventory-fc',
    ),
    join(fixture, 'dsh-agent-manage/business-resources/inventory-fc'),
    { recursive: true },
  );
  const ui = join(workbench, 'business/inventory-fc/source/inventory-light-plugins');
  // Reuse the prepared content cache, but give this build its own writable installation.
  execFileSync('corepack', ['pnpm', 'install', '--frozen-lockfile', '--offline'], {
    cwd: ui,
    stdio: 'pipe',
  });
  const repository = join(
    workbench,
    'business/inventory-fc/source/fc/src/lib/browser-repository.ts',
  );
  const original = await readFile(repository, 'utf8');
  const formatted = original.replace(
    'return new BrowserRepository(window.localStorage);',
    'return new BrowserRepository(\n    window.localStorage,\n  );',
  );
  assert.notEqual(formatted, original, 'fixture must change only the factory formatting');
  for (const [name, source] of [
    ['original', original],
    ['formatted', formatted],
  ]) {
    await writeFile(repository, source);
    execFileSync(process.execPath, ['scripts/build-inventory-fc.mjs'], {
      cwd: workbench,
      stdio: 'pipe',
    });
    const html = await readFile(join(workbench, 'lib/business/inventory-fc/index.html'), 'utf8');
    assert.equal(
      /\bwindow\.localStorage\b/.test(html),
      false,
      `${name}: an opaque iframe cannot use window.localStorage`,
    );
  }
});
