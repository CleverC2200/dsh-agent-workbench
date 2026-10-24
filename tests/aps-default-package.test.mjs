import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { syncAgentResources } from '../scripts/build-output.mjs';
const names = [
  'plan-operations-weekly-report',
  'answer-visualization',
  'order-satisfaction-analysis',
];
test('APS installation copies complete approved Skills and matches the shipped manifest', async () => {
  const manage = resolve(process.env.DSH_MANAGE_CHECKOUT ?? '../dsh-agent-manage');
  const source = join(manage, 'business-resources/inventory-apsplan');
  const target = await mkdtemp(join(tmpdir(), 'aps-installed-'));
  async function files(root, prefix = '') {
    const result = [];
    for (const item of await readdir(root, { withFileTypes: true })) {
      const name = prefix + item.name;
      if (item.isDirectory()) result.push(...(await files(join(root, item.name), name + '/')));
      else result.push(name);
    }
    return result.sort();
  }
  try {
    await cp(
      new URL('../business/inventory-apsplan/plugin.json', import.meta.url),
      join(target, 'plugin.json'),
    );
    await syncAgentResources(source, target);
    const manifest = JSON.parse(await readFile(join(target, 'plugin.json'), 'utf8'));
    const profile = JSON.parse(
      await readFile(join(target, manifest.agentResources.prompt), 'utf8'),
    );
    assert.deepEqual(profile.skills, names);
    assert.deepEqual(
      manifest.skills,
      names.map((name) => `skills/${name}/SKILL.md`),
    );
    for (const name of names) {
      for (const path of await files(join(source, 'skills', name))) {
        const relative = join('skills', name, path);
        assert.equal(
          createHash('sha256')
            .update(await readFile(join(target, relative)))
            .digest('hex'),
          createHash('sha256')
            .update(await readFile(join(source, relative)))
            .digest('hex'),
          relative,
        );
      }
    }
    const pkg = JSON.parse(
      await readFile(
        join(target, 'skills/order-satisfaction-analysis/scripts/package.json'),
        'utf8',
      ),
    );
    assert.equal(pkg.type, 'commonjs');
  } finally {
    await rm(target, { recursive: true, force: true });
  }
});
