import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, realpath, rm, symlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';

const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

test('the core build assembles current inventory Agent resources without recompiling those pages', async (t) => {
  const source = process.cwd();
  await mkdir('.runtime', { recursive: true });
  const fixture = await mkdtemp(resolve('.runtime/core-resource-build-'));
  const workbench = join(fixture, 'jobs/dsh-agent-workbench');
  await mkdir(join(fixture, 'jobs'));
  execFileSync('git', ['worktree', 'add', '--detach', workbench, 'HEAD'], { stdio: 'pipe' });
  t.after(async () => {
    execFileSync('git', ['worktree', 'remove', '--force', workbench], { stdio: 'pipe' });
    await rm(fixture, { recursive: true, force: true });
  });
  for (const file of ['build.mjs', 'build-inventory.mjs'])
    await cp(join(source, 'scripts', file), join(workbench, 'scripts', file));
  const manage = await realpath(
    resolve(process.env.WORKBENCH_TEST_MANAGE_ROOT ?? '../dsh-agent-manage'),
  );
  await symlink(manage, join(fixture, 'jobs/dsh-agent-manage'), 'dir');
  await symlink(await realpath('../dsh-gea-plugin'), join(fixture, 'jobs/dsh-gea-plugin'), 'dir');
  await symlink(
    await realpath('../../official-latest-standard'),
    join(fixture, 'official-latest-standard'),
    'dir',
  );
  for (const cwd of [workbench, join(workbench, 'business/inventory-apsplan/source')])
    execFileSync('npm', ['ci', '--ignore-scripts', '--prefer-offline', '--no-audit', '--no-fund'], {
      cwd,
      stdio: 'pipe',
    });
  const pages = await Promise.all(
    ['fc', 'aqkc'].map((id) =>
      readFile(join(workbench, `lib/business/inventory-${id}/index.html`)),
    ),
  );
  execFileSync('npm', ['run', 'build:core'], {
    cwd: workbench,
    stdio: 'pipe',
    env: { ...process.env, APS_BUILD_MODE: 'mock' },
  });
  for (const [index, id] of ['fc', 'aqkc'].entries()) {
    assert.deepEqual(
      await readFile(join(workbench, `lib/business/inventory-${id}/index.html`)),
      pages[index],
      `${id}: core target retains the existing page compilation`,
    );
    for (const file of ['capability.json', 'prompt.json', 'mcp.json', `skills/${id}/SKILL.md`])
      assert.deepEqual(
        digest(await readFile(join(workbench, `lib/business/inventory-${id}`, file))),
        digest(await readFile(join(manage, `business-resources/inventory-${id}`, file))),
        `${id}/${file}: core target must assemble the current owning Manage source bytes`,
      );
  }
});
