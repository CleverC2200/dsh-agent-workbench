import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';

test('HTML sample assembly refuses a missing or changed fixed theme resource', async (t) => {
  await mkdir('.runtime', { recursive: true });
  const root = await mkdtemp(resolve('.runtime/html-sample-build-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const directory of ['scripts', 'samples', 'theme']) await mkdir(join(root, directory));
  for (const file of [
    'scripts/build-html-sample.mjs',
    'scripts/html-author.mjs',
    'business/shared/view-state.js',
    'samples/html-table.html',
    'theme/tokens.css',
  ]) {
    await mkdir(dirname(join(root, file)), { recursive: true });
    await writeFile(join(root, file), await readFile(file));
  }
  const run = () =>
    execFileSync(process.execPath, [join(root, 'scripts/build-html-sample.mjs')], {
      stdio: 'pipe',
    });
  run();
  const assembled = await readFile(join(root, 'lib/samples/html-table.html'), 'utf8');
  assert.ok(assembled.includes(await readFile('theme/tokens.css', 'utf8')));
  assert.ok(!assembled.includes('/* SHARED_THEME_RESOURCE */'));
  await writeFile(join(root, 'theme/tokens.css'), '/* changed */');
  assert.throws(run, /HTML_SAMPLE_THEME_RESOURCE_MISMATCH/);
  await rm(join(root, 'theme/tokens.css'));
  assert.throws(run, /ENOENT/);
});
