import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { replaceBuildDirectory, syncAgentResources } from '../scripts/build-output.mjs';

test('resource synchronization removes retired Skills while retaining precompiled pages', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'workbench-resource-output-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const author = join(root, 'author');
  const output = join(root, 'page');
  await mkdir(join(author, 'skills/old'), { recursive: true });
  await mkdir(output);
  for (const name of ['capability.json', 'prompt.json', 'mcp.json'])
    await writeFile(join(author, name), '{"revision":1}\n');
  await writeFile(join(author, 'skills/old/SKILL.md'), 'original Skill\n');
  await writeFile(join(output, 'index.html'), 'precompiled page\n');
  await syncAgentResources(author, output);

  await rm(join(author, 'skills/old'), { recursive: true });
  await mkdir(join(author, 'skills/current'));
  await writeFile(join(author, 'skills/current/SKILL.md'), 'current Skill\n');
  await writeFile(join(author, 'prompt.json'), '{"revision":2}\n');
  await syncAgentResources(pathToFileURL(author), pathToFileURL(output));
  assert.deepEqual(await readdir(join(output, 'skills'), { recursive: true }), [
    'current',
    'current/SKILL.md',
  ]);
  assert.equal(await readFile(join(output, 'skills/current/SKILL.md'), 'utf8'), 'current Skill\n');
  assert.equal(await readFile(join(output, 'prompt.json'), 'utf8'), '{"revision":2}\n');
  assert.equal(await readFile(join(output, 'index.html'), 'utf8'), 'precompiled page\n');

  await rm(join(author, 'skills/current'), { recursive: true });
  await syncAgentResources(author, output);
  assert.deepEqual(await readdir(join(output, 'skills')), []);
});

test('declaration output replaces old modules only after successful generation', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'workbench-types-output-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const output = join(root, 'types');
  await mkdir(output);
  await writeFile(join(output, 'retired.d.ts'), 'export declare const retired: true;\n');
  await assert.rejects(
    replaceBuildDirectory(output, async (staging) => {
      await writeFile(join(staging, 'partial.d.ts'), 'partial output');
      throw Error('declaration generation failed');
    }),
    /declaration generation failed/,
  );
  assert.deepEqual(await readdir(output), ['retired.d.ts']);
  assert.deepEqual(await readdir(root), ['types']);
  await replaceBuildDirectory(output, (staging) =>
    writeFile(join(staging, 'current.d.ts'), 'export declare const current: true;\n'),
  );
  assert.deepEqual(await readdir(output), ['current.d.ts']);
  assert.deepEqual(await readdir(root), ['types']);
});

test('a failed publication restores the previous output and removes its staging directory', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'workbench-publish-output-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const output = join(root, 'types');
  await mkdir(output);
  await writeFile(join(output, 'previous.d.ts'), 'previous complete output\n');
  const rename = fs.rename;
  let failPublication = true;
  t.mock.method(fs, 'rename', async (from, to) => {
    if (to === output && failPublication) {
      failPublication = false;
      throw Object.assign(Error('publication I/O failure'), { code: 'EIO' });
    }
    return rename(from, to);
  });
  syncBuiltinESMExports();
  t.after(() => {
    t.mock.restoreAll();
    syncBuiltinESMExports();
  });
  await assert.rejects(
    replaceBuildDirectory(output, (staging) => writeFile(join(staging, 'current.d.ts'), 'new')),
    { code: 'EIO' },
  );
  assert.equal(failPublication, false);
  assert.deepEqual(await readdir(root), ['types']);
  assert.deepEqual(await readdir(output), ['previous.d.ts']);
  assert.equal(await readFile(join(output, 'previous.d.ts'), 'utf8'), 'previous complete output\n');
});
