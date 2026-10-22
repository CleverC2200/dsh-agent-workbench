import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { toolProject, sourceTools, prepareSourceTools } from '../scripts/source-tools.mjs';

function fixture(t, manifest, lock, file) {
  const root = mkdtempSync(join(tmpdir(), 'source-tools-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, 'package.json'), JSON.stringify(manifest));
  writeFileSync(join(root, file), typeof lock === 'string' ? lock : JSON.stringify(lock));
  return root;
}
test('npm tooling retains exact registry closure and rejects local or missing resolutions', (t) => {
  const root = fixture(
    t,
    {
      name: 'fixture',
      version: '1',
      packageManager: 'npm@11.11.0',
      devDependencies: { typescript: '5', core: 'file:missing' },
    },
    {
      lockfileVersion: 3,
      packages: {
        '': {},
        'node_modules/typescript': {
          version: '5',
          integrity: 'sha512-exact',
          dependencies: { helper: '2' },
        },
        'node_modules/helper': { version: '2', integrity: 'sha512-helper' },
        'node_modules/core': { link: true, resolved: 'missing' },
        'node_modules/unrelated': { version: '1', integrity: 'sha512-unused' },
      },
    },
    'package-lock.json',
  );
  const project = toolProject(root, ['typescript']);
  assert.deepEqual(Object.keys(JSON.parse(project.lock).packages).sort(), [
    '',
    'node_modules/helper',
    'node_modules/typescript',
  ]);
  assert.equal(
    JSON.parse(project.lock).packages['node_modules/typescript'].integrity,
    'sha512-exact',
  );
  assert.throws(() => toolProject(root, ['core']), /REGISTRY_REQUIRED/);
  assert.throws(() => toolProject(root, ['missing']), /DEPENDENCY_REQUIRED/);
});
test('pnpm tools reuse locked importer versions, peer snapshots and overrides without local links', (t) => {
  const root = fixture(
    t,
    {
      name: 'fixture',
      version: '1',
      packageManager: 'pnpm@11.17.0',
      dependencies: { yaml: '^2' },
      devDependencies: { eslint: '^9', core: 'link:missing' },
    },
    `lockfileVersion: '9.0'\n\nsettings:\n  autoInstallPeers: true\n\noverrides:\n  helper: 2.0.0\n\nimporters:\n\n  .:\n    dependencies:\n      yaml:\n        specifier: ^2\n        version: 2.9.0\n    devDependencies:\n      eslint:\n        specifier: ^9\n        version: 9.0.0(peer@1.0.0)\n      core:\n        specifier: link:missing\n        version: link:missing\n\n  docs-site:\n    dependencies:\n      unrelated:\n        specifier: 1\n        version: 1.0.0\n\npackages:\n  yaml@2.9.0:\n    resolution: {integrity: sha512-unchanged}\n\nsnapshots:\n  yaml@2.9.0: {}\n`,
    'pnpm-lock.yaml',
  );
  const project = toolProject(root, ['yaml', 'eslint']);
  const importer = project.lock.split('importers:')[1].split('packages:')[0];
  assert.match(importer, /version: 9.0.0\(peer@1.0.0\)/);
  assert.doesNotMatch(importer, /core:|docs-site|unrelated/);
  assert.match(project.lock, /integrity: sha512-unchanged/);
  assert.match(project.workspace, /overrides:\n  helper: 2.0.0/);
});
test('only proven isolated tools can omit Core and business preparation', (t) => {
  const root = fixture(
    t,
    {
      name: 'fixture',
      packageManager: 'npm@11.11.0',
      devDependencies: { oxlint: '1', oxfmt: '2', typescript: '5' },
    },
    {},
    'package-lock.json',
  );
  mkdirSync(join(root, 'scripts'));
  writeFileSync(
    join(root, 'scripts/ci-test-policy.json'),
    JSON.stringify({
      sourceFixtures: { 'cold.test.mjs': { dependencies: false } },
      sourceTools: { 'type.test.mjs': ['typescript'] },
    }),
  );
  const args = { typecheck: false, joint: false, desktopTools: false };
  const selected = { files: ['cold.test.mjs', 'type.test.mjs'] };
  assert.deepEqual(sourceTools(root, 'dsh-agent-workbench', selected, args), [
    'oxfmt',
    'oxlint',
    'typescript',
  ]);
  assert.equal(
    sourceTools(root, 'dsh-agent-workbench', { files: ['unknown.test.mjs'] }, args),
    null,
  );
  for (const flag of ['typecheck', 'joint', 'desktopTools'])
    assert.equal(
      sourceTools(root, 'dsh-agent-workbench', selected, { ...args, [flag]: true }),
      null,
    );
  assert.equal(sourceTools(root, 'dsh-agent-workbench', { ...selected, sdk: true }, args), null);
});

test('tool preparation shares local downloads and preserves CI and existing pnpm stores', async (t) => {
  for (const manager of ['npm@11.11.0', 'pnpm@11.27.0'])
    for (const mode of ['local', 'ci', 'existing'])
      await t.test(`${manager} ${mode}`, (t) => {
        const npm = manager.startsWith('npm@');
        const root = fixture(
          t,
          {
            name: 'fixture',
            version: '1',
            packageManager: manager,
            devDependencies: { tool: '1' },
          },
          npm
            ? {
                lockfileVersion: 3,
                packages: {
                  '': {},
                  'node_modules/tool': { version: '1', integrity: 'sha512-exact' },
                },
              }
            : "lockfileVersion: '9.0'\n\nimporters:\n\n  .:\n    devDependencies:\n      tool:\n        specifier: '1'\n        version: 1.0.0\n\npackages:\n  tool@1.0.0: {}\n",
          npm ? 'package-lock.json' : 'pnpm-lock.yaml',
        );
        const directory = join(root, '.runtime/source-tools');
        if (mode === 'existing') {
          mkdirSync(join(directory, 'downloads'), { recursive: true });
          mkdirSync(join(directory, 'node_modules'), { recursive: true });
          writeFileSync(join(directory, 'node_modules/.modules.yaml'), 'legacy store');
        }
        const originalCI = process.env.CI;
        if (mode === 'ci') process.env.CI = 'true';
        else delete process.env.CI;
        t.after(() => {
          if (originalCI === undefined) delete process.env.CI;
          else process.env.CI = originalCI;
          t.mock.restoreAll();
          syncBuiltinESMExports();
        });
        const calls = [];
        const shared = join(root, 'shared-cache-does-not-exist');
        t.mock.method(childProcess, 'execFileSync', (command, args, options) => {
          calls.push({ command, args, cwd: options?.cwd });
          if (args.includes('ci') || args.includes('install')) {
            mkdirSync(join(directory, 'node_modules/tool'), { recursive: true });
            writeFileSync(join(directory, 'node_modules/tool/index.js'), 'export const value = 1;');
            return '';
          }
          if (command === 'du') return '1\t' + args.at(-1);
          return shared + '\n';
        });
        syncBuiltinESMExports();
        prepareSourceTools(root, ['tool']);
        const receipt = JSON.parse(readFileSync(join(root, '.runtime/source-tools.json')));
        const privateDownloads = mode === 'ci' || (!npm && mode === 'existing');
        const install = calls.find(({ args }) => args.includes('ci') || args.includes('install'));
        assert.equal(install.cwd, directory);
        assert.equal(install.args.includes(npm ? '--cache' : '--store-dir'), privateDownloads);
        assert.deepEqual(receipt.downloads, {
          path: privateDownloads ? join(directory, 'downloads') : shared,
          shared: !privateDownloads,
        });
        assert.equal(receipt.downloadsKiB, privateDownloads ? 1 : null);
        assert.equal(
          calls.filter(({ command }) => command === 'du').length,
          privateDownloads ? 2 : 1,
        );
        assert.equal(existsSync(shared), false);
        assert.equal(
          JSON.parse(readFileSync(join(root, 'node_modules/.source-tools.json'))).root,
          root,
        );
        assert.throws(() => prepareSourceTools(root, ['missing']), /DEPENDENCY_REQUIRED/);
        const foreign = JSON.parse(readFileSync(join(root, 'node_modules/.source-tools.json')));
        writeFileSync(
          join(root, 'node_modules/.source-tools.json'),
          JSON.stringify({ ...foreign, root: 'other' }),
        );
        assert.throws(() => prepareSourceTools(root, ['tool']), /OUTPUT_EXISTS/);
      });
});
