import test from 'node:test';
import assert from 'node:assert/strict';
import {
  copyFileSync,
  globSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  unlinkSync,
} from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { selectCiTests } from '../scripts/ci-test-plan.mjs';

function fixture(t, repo = 'dsh-agent-workbench') {
  const directory = mkdtempSync(join(tmpdir(), 'ci-impact-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const git = (root, ...args) =>
    execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
  const put = (root, file, text) => {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), text);
  };
  const commit = (root) => {
    git(root, 'add', '.');
    git(
      root,
      '-c',
      'user.name=fixture',
      '-c',
      'user.email=fixture@invalid',
      'commit',
      '-qm',
      'input',
    );
    return git(root, 'rev-parse', 'HEAD');
  };
  const repositories = ['dsh-agent-workbench', 'dsh-agent-manage', 'dsh-gea-plugin'].map((repo) => {
    const path = join(directory, repo);
    mkdirSync(path);
    git(path, 'init', '-q');
    put(path, 'src/value.ts', 'export const value = 1;\n');
    return { repo, path, head: commit(path) };
  });
  const own = repositories.find((entry) => entry.repo === repo),
    root = own.path;
  const policy = {
    schemaVersion: 1,
    required: ['tests/required.test.mjs'],
    tests: ['tests/*.test.mjs'],
    rules: [
      {
        pattern: '^scripts/ci-test-policy\\.json$',
        tests: ['tests/required.test.mjs'],
      },
    ],
  };
  put(root, 'scripts/ci-test-policy.json', JSON.stringify(policy));
  put(root, 'scripts/quality-peer-baseline.json', JSON.stringify({ repositories }));
  put(root, 'tests/required.test.mjs', 'export const required = true;');
  put(root, 'tests/affected.test.mjs', 'import "../src/consumer.js";');
  put(root, 'src/consumer.ts', 'import "./value.js";');
  put(root, 'tests/peer.test.mjs', 'import "../../dsh-agent-manage/src/value.js";');
  put(root, 'tests/unrelated.test.mjs', 'export const unrelated = true;');
  let base = commit(root);
  own.head = base;
  return {
    root,
    repositories,
    policy,
    put,
    commit,
    checkpoint: () => {
      base = commit(root);
      own.head = base;
    },
    plan: (testOwners, options = {}) =>
      selectCiTests({ repositories, repo: own.repo, base, testOwners, ...options }),
  };
}

test('version-only manifests and generated stamps select their declared contracts without Host consumers', (t) => {
  const f = fixture(t);
  f.policy.versionTests = ['tests/version.test.mjs'];
  f.put(f.root, 'scripts/ci-test-policy.json', JSON.stringify(f.policy));
  f.put(f.root, 'package.json', JSON.stringify({ name: 'fixture', version: '1.0.0' }));
  const lock = (version) =>
    JSON.stringify({
      version,
      packages: { '': { version }, 'node_modules/helper': { version: '2.0.0' } },
    });
  f.put(f.root, 'package-lock.json', lock('1.0.0'));
  const stamp = (version) =>
    `export const pluginPackageVersion = Object.freeze({\n  name: 'fixture',\n  version: '${version}',\n} as const);\n`;
  f.put(f.root, 'src/plugin-package-version.ts', stamp('1.0.0'));
  f.put(f.root, 'src/consumer.ts', 'import "./value.js"; import "./plugin-package-version.js";');
  f.put(f.root, 'tests/version.test.mjs', 'readFileSync("package.json");');
  f.put(
    f.root,
    'tests/profile.test.mjs',
    'import "../src/consumer.js"; readFileSync("package.json");',
  );
  f.checkpoint();
  f.put(f.root, 'package.json', JSON.stringify({ name: 'fixture', version: '1.0.1' }));
  f.put(f.root, 'package-lock.json', lock('1.0.1'));
  f.put(f.root, 'src/plugin-package-version.ts', stamp('1.0.1'));
  f.repositories[0].head = f.commit(f.root);
  const plan = f.plan(undefined, { sourceOnly: true });
  assert.deepEqual(plan.files, ['tests/version.test.mjs']);
  assert.equal(plan.changes.find((change) => change.file === 'package.json').versionOnly, true);
  assert.equal(
    plan.changes.find((change) => change.file === 'package-lock.json').versionOnly,
    true,
  );
});

test('dependency, export, stamp logic and Host changes retain their real consumers beside a version bump', (t) => {
  for (const change of ['dependency', 'export', 'export-order', 'stamp', 'host']) {
    const f = fixture(t);
    const manifest = { name: 'fixture', version: '1.0.0', dependencies: { helper: '1' } };
    if (change === 'export-order')
      manifest.exports = { '.': { node: './src/value.ts', default: './src/consumer.ts' } };
    f.policy.versionTests = ['tests/version.test.mjs'];
    f.put(f.root, 'scripts/ci-test-policy.json', JSON.stringify(f.policy));
    f.put(f.root, 'package.json', JSON.stringify(manifest));
    const stamp = (version) =>
      `export const pluginPackageVersion = Object.freeze({\n  name: 'fixture',\n  version: '${version}',\n} as const);\n`;
    f.put(f.root, 'src/plugin-package-version.ts', stamp('1.0.0'));
    f.put(f.root, 'src/consumer.ts', 'import "./value.js"; import "./plugin-package-version.js";');
    f.put(f.root, 'tests/version.test.mjs', 'readFileSync("package.json");');
    f.put(
      f.root,
      'tests/profile.test.mjs',
      'import "../src/consumer.js"; readFileSync("package.json");',
    );
    f.checkpoint();
    const next = { ...manifest, version: '1.0.1' };
    if (change === 'dependency') next.dependencies = { helper: '2' };
    if (change === 'export') next.exports = './src/consumer.ts';
    if (change === 'export-order')
      next.exports = { '.': { default: './src/consumer.ts', node: './src/value.ts' } };
    f.put(f.root, 'package.json', JSON.stringify(next));
    f.put(
      f.root,
      'src/plugin-package-version.ts',
      stamp('1.0.1') + (change === 'stamp' ? 'run();' : ''),
    );
    if (change === 'host') f.put(f.root, 'src/value.ts', 'export const value = 2;');
    f.repositories[0].head = f.commit(f.root);
    const plan = f.plan(undefined, { sourceOnly: true });
    assert.ok(plan.files.includes('tests/profile.test.mjs'), change);
    assert.ok(plan.files.includes('tests/affected.test.mjs'), change);
  }
});

test('published named-query declarations select SQL and MPS Cube regressions', (t) => {
  const policy = JSON.parse(readFileSync('scripts/ci-test-policy.json', 'utf8'));
  const rule = policy.rules.find((rule) =>
    new RegExp(rule.pattern).test('lib/configured-query-client.d.mts'),
  );
  assert(rule);
  for (const file of [
    'business/shared/configured-query-client.mjs',
    'business/shared/configured-query-client.d.mts',
    'lib/configured-query-client.mjs',
    'lib/configured-query-client.d.mts',
  ]) {
    const f = fixture(t);
    f.policy.rules.push(rule);
    for (const test of rule.tests) f.put(f.root, test, 'export const fixture = true;');
    f.put(f.root, 'scripts/ci-test-policy.json', JSON.stringify(f.policy));
    f.put(f.root, file, 'export const before = true;');
    f.checkpoint();
    f.put(f.root, file, 'export const after = true;');
    f.repositories[0].head = f.commit(f.root);
    assert.deepEqual(f.plan(undefined, { sourceOnly: true }).files, [...rule.tests].sort());
  }
});

test('local source plans combine committed, staged, unstaged and untracked inputs without changing frozen plans', (t) => {
  const f = fixture(t);
  for (const name of ['committed', 'staged', 'unstaged', 'untracked']) {
    f.policy.rules.push({
      pattern: `^scripts/${name}\\.mjs$`,
      sourceTests: [`tests/${name}.test.mjs`],
      tests: [`tests/${name}.test.mjs`],
    });
    f.put(f.root, `tests/${name}.test.mjs`, 'export const fixture = true;');
    if (name !== 'untracked') f.put(f.root, `scripts/${name}.mjs`, 'export const value = 1;');
  }
  f.put(f.root, '.gitignore', '.runtime/\nnode_modules/\n');
  f.put(f.root, 'scripts/ci-test-policy.json', JSON.stringify(f.policy));
  f.checkpoint();
  f.put(f.root, 'scripts/committed.mjs', 'export const value = 2;');
  f.repositories[0].head = f.commit(f.root);
  f.put(f.root, 'scripts/staged.mjs', 'export const value = 2;');
  execFileSync('git', ['-C', f.root, 'add', 'scripts/staged.mjs']);
  f.put(f.root, 'scripts/unstaged.mjs', 'export const value = 2;');
  f.put(f.root, 'scripts/untracked.mjs', 'export const value = 2;');
  f.put(f.root, '.runtime/generated.mjs', 'ignored');
  f.put(f.root, 'node_modules/generated.mjs', 'ignored');
  const local = f.plan(undefined, { sourceOnly: true, workingTree: true });
  assert.equal(local.workingTree, true);
  assert.equal(local.head, f.repositories[0].head);
  assert.deepEqual(local.files, [
    'tests/committed.test.mjs',
    'tests/staged.test.mjs',
    'tests/unstaged.test.mjs',
    'tests/untracked.test.mjs',
  ]);
  assert.deepEqual(
    local.changes.map((change) => change.file),
    [
      'scripts/committed.mjs',
      'scripts/staged.mjs',
      'scripts/unstaged.mjs',
      'scripts/untracked.mjs',
    ],
  );
  const frozen = f.plan(undefined, { sourceOnly: true });
  assert.equal(frozen.workingTree, undefined);
  assert.deepEqual(frozen.files, ['tests/committed.test.mjs']);
  assert.throws(() => f.plan(undefined, { workingTree: true }), /CI_TEST_WORKING_TREE_SOURCE_ONLY/);
});

test('local source plans preserve deleted and renamed source inputs and reject unknown dirty sources', (t) => {
  const f = fixture(t);
  f.put(f.root, 'scripts/old.mjs', 'export const value = 1;');
  f.policy.rules.push({
    pattern: '^scripts/(?:old|renamed)\\.mjs$',
    tests: ['tests/affected.test.mjs'],
  });
  f.put(f.root, 'scripts/ci-test-policy.json', JSON.stringify(f.policy));
  f.checkpoint();
  rmSync(join(f.root, 'scripts/old.mjs'));
  f.put(f.root, 'scripts/renamed.mjs', 'export const value = 1;');
  const local = f.plan(undefined, { sourceOnly: true, workingTree: true });
  assert.deepEqual(
    local.changes.map((change) => change.file),
    ['scripts/old.mjs', 'scripts/renamed.mjs'],
  );
  f.put(f.root, 'src/unowned.ts', 'export const value = 1;');
  assert.throws(
    () => f.plan(undefined, { sourceOnly: true, workingTree: true }),
    /CI_TEST_IMPACT_UNMAPPED.*src\/unowned\.ts/,
  );
  rmSync(join(f.root, 'src/unowned.ts'));
  f.put(f.root, 'src/unowned.ts', 'export const value = 1;');
  f.checkpoint();
  rmSync(join(f.root, 'src/unowned.ts'));
  assert.throws(
    () => f.plan(undefined, { sourceOnly: true, workingTree: true }),
    /CI_TEST_IMPACT_UNMAPPED.*src\/unowned\.ts/,
  );
});

test('ordinary documentation skips source tests without selecting the full pool', (t) => {
  const f = fixture(t);
  f.put(f.root, 'README.md', 'documentation');
  f.repositories[0].head = f.commit(f.root);
  const plan = f.plan();
  assert.deepEqual(plan.files, []);
  assert.equal(plan.applicability, 'docs');
  assert.equal(plan.fullSuite, 'not-run');
  assert.equal(plan.runtime, false);
});
test('transitive authored imports select the affected file and exclude unrelated tests', (t) => {
  const f = fixture(t);
  f.put(f.root, 'src/value.ts', 'export const value = 2;');
  f.repositories[0].head = f.commit(f.root);
  assert.deepEqual(f.plan().files, ['tests/affected.test.mjs', 'tests/required.test.mjs']);
});
test('actual named esbuild loaders retain direct and transitive business consumers', (t) => {
  for (const [source, consumer] of [
    ['aqkc/web/src/lib/inventory-insight.ts', 'base-stock-risk'],
    ['aqkc/web/src/lib/workbench-current-order.ts', 'base-stock-risk'],
    ['aqkc/web/src/lib/workbench-current-order-sql.ts', 'base-stock-scope'],
  ]) {
    const f = fixture(t);
    f.policy.rules.push({
      pattern: '^business/',
      tests: ['tests/inventory-storage-build.test.mjs'],
    });
    f.put(f.root, 'scripts/ci-test-policy.json', JSON.stringify(f.policy));
    for (const name of ['base-stock-risk', 'base-stock-scope', 'inventory-storage-build'])
      f.put(
        f.root,
        `tests/${name}.test.mjs`,
        readFileSync(new URL(`./${name}.test.mjs`, import.meta.url), 'utf8'),
      );
    for (const file of [
      'aqkc/web/src/lib/inventory-insight.ts',
      'aqkc/web/src/lib/workbench-current-order.ts',
      'aqkc/web/src/lib/workbench-current-order-sql.ts',
      'aqkc/web/src/lib/workbench-sql.ts',
      'inventory-light-plugins/src/pages/aqkc/components/analytics/workspace-normalizer.ts',
    ]) {
      const path = 'business/inventory-aqkc/source/' + file;
      f.put(f.root, path, readFileSync(new URL('../' + path, import.meta.url), 'utf8'));
    }
    f.checkpoint();
    const path = 'business/inventory-aqkc/source/' + source;
    f.put(f.root, path, readFileSync(join(f.root, path), 'utf8') + '\n// selection probe\n');
    f.repositories[0].head = f.commit(f.root);
    const plan = f.plan();
    assert.ok(
      plan.reasons['dsh-agent-workbench/' + path].includes(`tests/${consumer}.test.mjs`),
      JSON.stringify(plan),
    );
    assert.ok(!plan.files.includes('tests/unrelated.test.mjs'));
  }
});
test('actual arrow esbuild loaders retain both shipped channel and HTML bridge consumers', (t) => {
  for (const source of ['src/html-bridge.ts', 'business/shared/channel.js']) {
    const f = fixture(t);
    for (const name of ['html-business-theme', 'html-request-cancel'])
      f.put(
        f.root,
        `tests/${name}.test.mjs`,
        readFileSync(new URL(`./${name}.test.mjs`, import.meta.url), 'utf8'),
      );
    for (const path of ['src/html-bridge.ts', 'business/shared/channel.js'])
      f.put(f.root, path, readFileSync(new URL('../' + path, import.meta.url), 'utf8'));
    f.checkpoint();
    f.put(f.root, source, readFileSync(join(f.root, source), 'utf8') + '\n// selection probe\n');
    f.repositories[0].head = f.commit(f.root);
    const plan = f.plan();
    for (const name of ['html-business-theme', 'html-request-cancel'])
      assert.ok(
        plan.reasons['dsh-agent-workbench/' + source].includes(`tests/${name}.test.mjs`),
        JSON.stringify(plan),
      );
    assert.ok(!plan.files.includes('tests/unrelated.test.mjs'));
  }
});
test('wrapper arguments keep lexical ownership, parameter positions and byte-read boundaries', (t) => {
  const f = fixture(t);
  f.policy.rules.push({
    pattern: '^src/value\\.ts$',
    tests: ['tests/affected.test.mjs'],
  });
  f.put(f.root, 'scripts/ci-test-policy.json', JSON.stringify(f.policy));
  f.put(f.root, 'src/inspection.mjs', 'import "./value.ts";');
  f.put(f.root, 'src/other.ts', 'export const other = true;');
  f.put(
    f.root,
    'tests/wrapper.test.mjs',
    `
    function load(entry) { build({entryPoints: [entry]}); }
    function log(value) { console.log(value); }
    function unrelated() { const load = log; load('../src/value.ts'); }
    function overridden(load) { load('../src/value.ts'); }
    function inspect(entry) { readFileSync(entry); }
    inspect('../src/inspection.mjs');
    function buildNamed(label, entry) { build({entryPoints: [entry]}); }
    buildNamed('../src/value.ts', '../src/other.ts');
  `,
  );
  f.put(
    f.root,
    'tests/position.test.mjs',
    `
    async function bundled(label, entry) { build({entryPoints: [entry]}); }
    const entry = '../src/value.ts';
    bundled('not a path', entry);
  `,
  );
  f.checkpoint();
  f.put(f.root, 'src/value.ts', 'export const value = 2;');
  f.repositories[0].head = f.commit(f.root);
  const plan = f.plan();
  assert.ok(plan.files.includes('tests/position.test.mjs'));
  assert.ok(!plan.files.includes('tests/wrapper.test.mjs'), JSON.stringify(plan));
});
test('repeated local binding references still produce a finite real consumer plan', (t) => {
  const f = fixture(t);
  const declarations = ["const edge0 = '../src/value.ts';"];
  for (let index = 1; index <= 20; index++)
    declarations.push(`const edge${index} = [edge${index - 1}, edge${index - 1}];`);
  f.put(
    f.root,
    'tests/repeated.test.mjs',
    declarations.join('\n') + '\nbuild({entryPoints:[edge20]});',
  );
  f.checkpoint();
  f.put(f.root, 'src/value.ts', 'export const value = 2;');
  f.repositories[0].head = f.commit(f.root);
  assert.ok(f.plan().files.includes('tests/repeated.test.mjs'));
});
test('reading policy and package metadata does not execute the source paths listed in them', (t) => {
  const f = fixture(t);
  f.policy.rules.push({
    pattern: '^src/value\\.ts$',
    tests: ['tests/affected.test.mjs'],
  });
  f.put(f.root, 'scripts/ci-test-policy.json', JSON.stringify(f.policy));
  f.put(f.root, 'package.json', JSON.stringify({ main: 'src/value.ts' }));
  f.put(
    f.root,
    'tests/metadata.test.mjs',
    `
    import { readFileSync } from 'node:fs';
    readFileSync('scripts/ci-test-policy.json');
    readFileSync('package.json');
  `,
  );
  f.checkpoint();
  f.put(f.root, 'src/value.ts', 'export const value = 2;');
  f.repositories[0].head = f.commit(f.root);
  assert.deepEqual(f.plan().files, ['tests/affected.test.mjs', 'tests/required.test.mjs']);
});
test('ordinary source path literals do not select tests that never consume the file', (t) => {
  const f = fixture(t);
  f.put(
    f.root,
    'tests/path-only.test.mjs',
    `
    export const fixture = 'src/value.ts';
    // import '../src/value.js';
    export const example = "import '../src/value.js'";
  `,
  );
  f.put(f.root, 'tests/build.test.mjs', `build({ entryPoints: ['src/consumer.ts'] });`);
  f.put(
    f.root,
    'tests/read.test.mjs',
    `readFileSync(new URL('../src/value.ts', import.meta.url));`,
  );
  f.put(f.root, 'tests/process.test.mjs', `spawn(process.execPath, ['src/consumer.ts']);`);
  f.put(
    f.root,
    'tests/plugin.test.mjs',
    `export const plugin = { name: resolve(root, 'lib/consumer.js') };`,
  );
  f.checkpoint();
  f.put(f.root, 'src/value.ts', 'export const value = 2;');
  f.repositories[0].head = f.commit(f.root);
  assert.deepEqual(f.plan().files, [
    'tests/affected.test.mjs',
    'tests/build.test.mjs',
    'tests/plugin.test.mjs',
    'tests/process.test.mjs',
    'tests/read.test.mjs',
    'tests/required.test.mjs',
  ]);
});
test('a file path assigned before a byte read selects that consumer without executing the read module', (t) => {
  const f = fixture(t);
  f.put(f.root, 'src/inspection.mjs', `import './value.js'; export const inspected = 1;`);
  f.put(
    f.root,
    'tests/reader.test.mjs',
    `
    const source = new URL('../src/inspection.mjs', import.meta.url);
    readFileSync(source, 'utf8');
  `,
  );
  f.checkpoint();
  f.put(f.root, 'src/inspection.mjs', `import './value.js'; export const inspected = 2;`);
  f.repositories[0].head = f.commit(f.root);
  assert.deepEqual(f.plan().files, ['tests/reader.test.mjs', 'tests/required.test.mjs']);
  f.put(f.root, 'src/inspection.mjs', `import './value.js'; export const inspected = 1;`);
  f.checkpoint();
  f.put(f.root, 'src/value.ts', 'export const value = 2;');
  f.repositories[0].head = f.commit(f.root);
  assert.deepEqual(f.plan().files, ['tests/affected.test.mjs', 'tests/required.test.mjs']);
});
test('extensionless authored module imports keep their transitive source consumers', (t) => {
  const f = fixture(t);
  f.put(f.root, 'tests/extensionless.test.mjs', `import '../src/consumer';`);
  f.checkpoint();
  f.put(f.root, 'src/value.ts', 'export const value = 2;');
  f.repositories[0].head = f.commit(f.root);
  assert.deepEqual(f.plan().files, [
    'tests/affected.test.mjs',
    'tests/extensionless.test.mjs',
    'tests/required.test.mjs',
  ]);
});
test('a same-named path in another scope cannot replace the actual reader input', (t) => {
  const f = fixture(t);
  f.put(
    f.root,
    'tests/scoped-reader.test.mjs',
    `
    function consume() {
      const source = new URL('../src/value.ts', import.meta.url);
      readFileSync(source);
    }
    function metadata() { const source = 'scripts/ci-test-policy.json'; }
  `,
  );
  f.checkpoint();
  f.put(f.root, 'src/value.ts', 'export const value = 2;');
  f.repositories[0].head = f.commit(f.root);
  assert.deepEqual(f.plan().files, [
    'tests/affected.test.mjs',
    'tests/required.test.mjs',
    'tests/scoped-reader.test.mjs',
  ]);
});
test('deleted source remains an affected dependency, and peer changes are bound to the committed baseline', (t) => {
  const f = fixture(t);
  unlinkSync(join(f.root, 'src/value.ts'));
  f.repositories[0].head = f.commit(f.root);
  const peer = f.repositories[1];
  f.put(peer.path, 'src/value.ts', 'export const value = 3;');
  peer.head = f.commit(peer.path);
  assert.deepEqual(f.plan().files, [
    'tests/affected.test.mjs',
    'tests/peer.test.mjs',
    'tests/required.test.mjs',
  ]);
});
test('source events and joint inputs retain peer changes when the candidate updates its baseline', async (t) => {
  for (const event of ['pull_request', 'workflow_dispatch'])
    await t.test(event, (t) => {
      const f = fixture(t);
      f.policy.rules.push({
        pattern: '^scripts/quality-peer-baseline\\.json$',
        tests: ['tests/required.test.mjs'],
      });
      f.put(f.root, 'scripts/ci-test-policy.json', JSON.stringify(f.policy));
      const baseline = () =>
        JSON.stringify({
          schemaVersion: 1,
          repositories: f.repositories.map(({ repo, head }) => ({ repo, head })),
        });
      const previousBaseline = baseline();
      f.put(f.root, 'scripts/quality-peer-baseline.json', previousBaseline);
      f.checkpoint();
      const peer = f.repositories[1];
      f.put(peer.path, 'src/value.ts', 'export const value = 3;');
      peer.head = f.commit(peer.path);
      const candidateBaseline = baseline();
      f.put(f.root, 'scripts/quality-peer-baseline.json', candidateBaseline);
      f.repositories[0].head = f.commit(f.root);
      const admitted = spawnSync(
        process.execPath,
        [
          join(import.meta.dirname, '../scripts/read-hosted-peer-input.mjs'),
          '--repo',
          'dsh-agent-workbench',
        ],
        {
          cwd: f.root,
          encoding: 'utf8',
          env: {
            ...process.env,
            GITHUB_OUTPUT: '',
            GITHUB_REPOSITORY: 'CleverC2200/dsh-agent-workbench',
            GITHUB_EVENT_NAME: event,
            QUALITY_SCOPE_ALLOWED: 'true',
            QUALITY_EXPECTED_SHA: f.repositories[0].head,
            QUALITY_GROUP_WORKBENCH: f.repositories[0].head,
            QUALITY_GROUP_MANAGE: peer.head,
            QUALITY_GROUP_GEA: f.repositories[2].head,
          },
        },
      );
      assert.equal(admitted.status, 0, admitted.stderr);
      const input = JSON.parse(admitted.stdout);
      assert.equal(input['manage-sha'], peer.head);
      assert.equal(input['source-kind'], event === 'pull_request' ? 'source-event' : 'joint-group');
      assert.equal(
        input['baseline-id'],
        event === 'pull_request'
          ? createHash('sha256').update(candidateBaseline).digest('hex')
          : '',
      );
      const plan = f.plan();
      assert.deepEqual(plan.files, ['tests/peer.test.mjs', 'tests/required.test.mjs']);
      assert.deepEqual(plan.reasons['dsh-agent-manage/src/value.ts'], ['tests/peer.test.mjs']);
      assert.equal(
        plan.peerBaselineSha256,
        createHash('sha256').update(previousBaseline).digest('hex'),
      );
    });
});
test('a candidate cannot replace a missing historical peer comparison baseline', (t) => {
  const f = fixture(t);
  const file = join(f.root, 'scripts/quality-peer-baseline.json');
  const baseline = readFileSync(file);
  unlinkSync(file);
  f.checkpoint();
  writeFileSync(file, baseline);
  f.repositories[0].head = f.commit(f.root);
  assert.throws(f.plan, /CI_TEST_PEER_BASE_REQUIRED/);
});
test('unmapped runtime source refuses before preparation; no full-suite fallback is allowed', (t) => {
  const f = fixture(t);
  f.put(f.root, 'src/unmapped.ts', 'export const uncovered = true;');
  f.repositories[0].head = f.commit(f.root);
  assert.throws(f.plan, /CI_TEST_IMPACT_UNMAPPED/);
});
test('deleted source without a current consumer can retire without a fallback suite', (t) => {
  const f = fixture(t, 'dsh-gea-plugin');
  f.put(f.root, 'scripts/unused.mjs', 'export const unused = true;');
  f.checkpoint();
  unlinkSync(join(f.root, 'scripts/unused.mjs'));
  f.repositories[2].head = f.commit(f.root);
  const plan = f.plan();
  assert.equal(plan.applicability, 'source');
  assert.equal(plan.fullSuite, 'not-run');
  assert.deepEqual(plan.files, ['tests/required.test.mjs']);
  assert.deepEqual(plan.reasons['dsh-gea-plugin/scripts/unused.mjs'], []);
});
test('deleted source with a current consumer still selects that consumer', (t) => {
  const f = fixture(t, 'dsh-gea-plugin');
  f.put(f.root, 'scripts/consumed.mjs', 'export const consumed = true;');
  f.put(f.root, 'tests/script.test.mjs', 'import "../scripts/consumed.mjs";');
  f.checkpoint();
  unlinkSync(join(f.root, 'scripts/consumed.mjs'));
  f.repositories[2].head = f.commit(f.root);
  const plan = f.plan();
  assert.deepEqual(plan.files, ['tests/required.test.mjs', 'tests/script.test.mjs']);
  assert.deepEqual(plan.reasons['dsh-gea-plugin/scripts/consumed.mjs'], ['tests/script.test.mjs']);
});
test('explicit dynamic-consumer rules select real files and missing required files refuse', (t) => {
  const f = fixture(t);
  f.policy.rules.push({
    pattern: '^src/dynamic\\.ts$',
    tests: ['tests/peer.test.mjs'],
  });
  f.put(f.root, 'scripts/ci-test-policy.json', JSON.stringify(f.policy));
  f.put(f.root, 'src/dynamic.ts', 'export const dynamic = true;');
  f.repositories[0].head = f.commit(f.root);
  assert.deepEqual(f.plan().files, ['tests/peer.test.mjs', 'tests/required.test.mjs']);
  unlinkSync(join(f.root, 'tests/required.test.mjs'));
  assert.throws(f.plan, /CI_TEST_FILE_REQUIRED/);
});
test('invalid base commits and policy paths refuse rather than interpreting refs or traversal', (t) => {
  const f = fixture(t);
  assert.throws(
    () =>
      selectCiTests({
        repositories: f.repositories,
        repo: 'dsh-agent-workbench',
        base: 'main',
      }),
    /CI_TEST_BASE_REQUIRED/,
  );
  f.policy.required = ['../other.test.mjs'];
  f.put(f.root, 'scripts/ci-test-policy.json', JSON.stringify(f.policy));
  assert.throws(f.plan, /CI_TEST_PATH_REJECTED/);
});

test('browser installer fixtures do not request a real browser', (t) => {
  const f = fixture(t);
  f.put(
    f.root,
    'tests/required.test.mjs',
    `
    import { writeFileSync } from 'node:fs';
    const executable = 'fake-playwright';
    writeFileSync(executable, "export const chromium = { launch() {} };", { mode: 0o755 });
    export const example = "import { chromium } from '@playwright/test';";
    // import { chromium } from '@playwright/test';
  `,
  );
  f.repositories[0].head = f.commit(f.root);
  assert.equal(f.plan().browser, false);
});

test('a computed Playwright import requests a browser through its executing helper', (t) => {
  const f = fixture(t);
  f.put(f.root, 'tests/required.test.mjs', "import './helpers/browser.mjs';");
  f.put(
    f.root,
    'tests/helpers/browser.mjs',
    "const packageName = 'playwright'; const { chromium } = await import(packageName); await chromium.launch();",
  );
  f.repositories[0].head = f.commit(f.root);
  const plan = f.plan();
  assert.equal(plan.browser, true);
  assert.deepEqual(plan.browserFiles, ['tests/required.test.mjs']);
});

test('an explicit installer fixture uses its own browser substitute across imported preparation code', (t) => {
  const f = fixture(t);
  f.policy.browserFixtures = ['tests/required.test.mjs'];
  f.put(f.root, 'scripts/ci-test-policy.json', JSON.stringify(f.policy));
  f.put(f.root, 'tests/required.test.mjs', "import './helpers/prepare.mjs';");
  f.put(
    f.root,
    'tests/helpers/prepare.mjs',
    "import { chromium } from '@playwright/test'; export const probe = () => chromium.launch();",
  );
  f.repositories[0].head = f.commit(f.root);
  const plan = f.plan();
  assert.equal(plan.browser, false);
  assert.deepEqual(plan.browserFixtures, ['tests/required.test.mjs']);
  assert.deepEqual(plan.browserFiles, []);
});

test('a fixture declaration cannot suppress a direct browser consumer', (t) => {
  const f = fixture(t);
  f.policy.browserFixtures = ['tests/required.test.mjs'];
  f.put(f.root, 'scripts/ci-test-policy.json', JSON.stringify(f.policy));
  f.put(
    f.root,
    'tests/required.test.mjs',
    "import { chromium } from '@playwright/test'; await chromium.launch();",
  );
  f.repositories[0].head = f.commit(f.root);
  assert.throws(f.plan, /CI_TEST_BROWSER_FIXTURE_REJECTED/);
});

test('browser fixture declarations reject missing, unknown and wildcard test paths', (t) => {
  const f = fixture(t);
  for (const files of [
    ['tests/missing.test.mjs'],
    ['tests/*.test.mjs'],
    ['../tests/required.test.mjs'],
    ['src/value.ts'],
    'tests/required.test.mjs',
  ]) {
    f.policy.browserFixtures = files;
    f.put(f.root, 'scripts/ci-test-policy.json', JSON.stringify(f.policy));
    assert.throws(f.plan, /CI_TEST_BROWSER_FIXTURE_REJECTED/);
  }
});

test('direct and spawned browser consumers request preparation while byte reads and suffixes do not', (t) => {
  const f = fixture(t);
  f.policy.required.push('tests/process.test.mjs', 'tests/read.test.mjs', 'tests/name.browser.mjs');
  f.policy.tests.push('tests/*.browser.mjs');
  f.put(f.root, 'scripts/ci-test-policy.json', JSON.stringify(f.policy));
  f.put(
    f.root,
    'src/browser.mjs',
    "const { chromium } = require('playwright-core'); chromium.launch();",
  );
  f.put(
    f.root,
    'tests/required.test.mjs',
    "import { chromium } from '@playwright/test'; await chromium.launch();",
  );
  f.put(f.root, 'tests/process.test.mjs', "spawn(process.execPath, ['src/browser.mjs']);");
  f.put(f.root, 'tests/read.test.mjs', "readFileSync('src/browser.mjs');");
  f.put(f.root, 'tests/name.browser.mjs', 'export const fixture = true;');
  f.repositories[0].head = f.commit(f.root);
  const plan = f.plan();
  assert.equal(plan.browser, true);
  assert.deepEqual(plan.browserFiles, ['tests/process.test.mjs', 'tests/required.test.mjs']);
});

test('a fixed file reference does not request a Profile, while an actual imported Profile does', (t) => {
  const f = fixture(t, 'dsh-gea-plugin');
  f.put(f.root, 'tests/profile.mjs', 'export const profile = true;');
  f.put(f.root, 'tests/required.test.mjs', "export const fixturePath = 'tests/profile.mjs';");
  const own = f.repositories.find((entry) => entry.repo === 'dsh-gea-plugin');
  own.head = f.commit(f.root);
  assert.equal(f.plan().runtime, false);
  assert.equal(f.plan().browser, false);
  f.put(f.root, 'tests/required.test.mjs', "import './profile.mjs';");
  own.head = f.commit(f.root);
  assert.equal(f.plan().runtime, true);
  assert.equal(f.plan().browser, true);
  f.policy.browserFixtures = ['tests/required.test.mjs'];
  f.put(f.root, 'scripts/ci-test-policy.json', JSON.stringify(f.policy));
  assert.throws(f.plan, /CI_TEST_BROWSER_FIXTURE_REJECTED/);
});

test('an empty required policy cannot invoke a runner with no file arguments', (t) => {
  const f = fixture(t);
  f.policy.required = [];
  f.put(f.root, 'scripts/ci-test-policy.json', JSON.stringify(f.policy));
  assert.throws(f.plan, /CI_TEST_POLICY_REQUIRED/);
});

test('an affected public contract file remains selectable alongside ordinary tests', (t) => {
  const f = fixture(t);
  f.policy.tests.push('tests/*.contract.mjs');
  f.put(f.root, 'scripts/ci-test-policy.json', JSON.stringify(f.policy));
  f.put(f.root, 'tests/loader.contract.mjs', 'import "../src/value.js";');
  f.put(f.root, 'src/value.ts', 'export const value = 2;');
  f.repositories[0].head = f.commit(f.root);
  assert.deepEqual(f.plan().files, [
    'tests/affected.test.mjs',
    'tests/loader.contract.mjs',
    'tests/required.test.mjs',
  ]);
});

test('script-only source policy and task status changes select their direct public consumers', async (t) => {
  const production = JSON.parse(
    readFileSync(new URL('../scripts/ci-test-policy.json', import.meta.url)),
  );
  for (const [source, consumer] of [['scripts/task-status.mjs', 'tests/task-status.test.mjs']])
    await t.test(source, (t) => {
      const f = fixture(t);
      f.policy.rules = production.rules;
      f.policy.tests.push('scripts/*.test.mjs');
      f.put(f.root, 'scripts/ci-test-policy.json', JSON.stringify(f.policy));
      for (const file of [
        consumer,
        'scripts/run-quality-checks.test.mjs',
        'tests/quality-ci.test.mjs',
        'tests/candidate-input.test.mjs',
      ])
        f.put(f.root, file, 'export const fixture = true;');
      f.put(f.root, source, 'export const revision = 1;');
      f.checkpoint();
      f.put(f.root, source, 'export const revision = 2;');
      f.repositories[0].head = f.commit(f.root);
      const plan = f.plan();
      assert.deepEqual(plan.changes, [{ repo: 'dsh-agent-workbench', file: source }]);
      assert.ok(
        plan.reasons['dsh-agent-workbench/' + source].includes(consumer),
        JSON.stringify(plan),
      );
      assert.ok(plan.files.includes('tests/required.test.mjs'));
      assert.ok(!plan.files.includes('tests/unrelated.test.mjs'));
    });
});

for (const repo of ['dsh-agent-workbench', 'dsh-gea-plugin']) {
  test(`API debug policy selects current browser and Host regressions for ${repo}`, (t) => {
    const f = fixture(t, repo);
    const policyPath =
      repo === 'dsh-agent-workbench'
        ? new URL('../scripts/ci-test-policy.json', import.meta.url)
        : new URL('../../dsh-gea-plugin/scripts/ci-test-policy.json', import.meta.url);
    const actual = JSON.parse(readFileSync(policyPath));
    const apiRules = actual.rules.filter((rule) =>
      rule.tests.some((file) => file.includes('api-log')),
    );
    const expected = [...new Set(apiRules.flatMap((rule) => rule.tests))].sort();
    assert.ok(expected.length >= 2);
    f.policy.rules = apiRules;
    f.policy.tests =
      repo === 'dsh-agent-workbench'
        ? ['tests/*.test.mjs', 'tests/*.browser.mjs']
        : ['tests/*.test.mjs'];
    f.put(f.root, 'scripts/ci-test-policy.json', JSON.stringify(f.policy));
    for (const file of expected)
      f.put(
        f.root,
        file,
        file === 'tests/api-log-web.test.mjs'
          ? "import './profile.mjs'; import {chromium} from '@playwright/test';"
          : file.endsWith('.browser.mjs')
            ? "import { chromium } from '@playwright/test'; await chromium.launch();"
            : 'export const api = true;',
      );
    if (repo === 'dsh-gea-plugin')
      f.put(f.root, 'tests/profile.mjs', 'export const profile = true;');
    f.put(f.root, 'src/host.ts', 'export const endpoint = 1;');
    f.put(f.root, 'src/workbench/api-log-center.tsx', 'export const page = 1;');
    f.checkpoint();
    const source =
      repo === 'dsh-agent-workbench' ? 'src/workbench/api-log-center.tsx' : 'src/host.ts';
    f.put(f.root, source, 'export const changed = true;');
    const own = f.repositories.find((entry) => entry.repo === repo);
    own.head = f.commit(f.root);
    const peerName = repo === 'dsh-agent-workbench' ? 'dsh-gea-plugin' : 'dsh-agent-workbench';
    const peer = f.repositories.find((entry) => entry.repo === peerName);
    const peerSource =
      repo === 'dsh-agent-workbench' ? 'src/host/api-log.ts' : 'src/workbench/api-log-contract.ts';
    f.put(peer.path, peerSource, 'export const changedContract = true;');
    peer.head = f.commit(peer.path);
    const plan = f.plan();
    assert.deepEqual(plan.reasons[`${repo}/${source}`], expected);
    assert.deepEqual(plan.reasons[`${peerName}/${peerSource}`], expected);
    assert.equal(plan.browser, true);
    assert.equal(plan.runtime, repo === 'dsh-gea-plugin');
    assert.equal(plan.fullSuite, 'not-run');
  });
}
test('approval retirement and retained domain-type migration select current behavioral contracts', async (t) => {
  const production = JSON.parse(
    readFileSync(new URL('../scripts/ci-test-policy.json', import.meta.url)),
  );
  const consumers = [
    'tests/sales-plan-detail.browser.mjs',
    'tests/role-approval.test.mjs',
    'tests/approval-visibility.test.mjs',
    'tests/regional-state-restore.test.mjs',
  ];
  for (const name of [
    'RegionalApprovalActionDialog.tsx',
    'RegionalApprovalLiveAdjustmentDialog.tsx',
    'models/salesPlanAdjustmentModel.ts',
    'RegionalApprovalPlanDetail.module.css',
    'RegionalApprovalPlanDetail.tsx',
    'regionalApprovalActionModel.ts',
    'regionalApprovalDetailFixture.ts',
    'regionalApprovalDetailModel.ts',
    'regionalApprovalFixture.ts',
    'regionalApprovalModel.ts',
  ])
    await t.test(name, (t) => {
      const f = fixture(t);
      const source = 'src/workbench/original/workbenches/regionalApproval/' + name;
      f.policy.rules = production.rules;
      f.policy.tests.push('tests/*.browser.mjs');
      f.put(f.root, 'scripts/ci-test-policy.json', JSON.stringify(f.policy));
      for (const file of consumers)
        f.put(
          f.root,
          file,
          file.endsWith('.browser.mjs')
            ? "import { chromium } from '@playwright/test'; await chromium.launch();"
            : 'export const fixture = true;',
        );
      f.put(f.root, source, 'export const retired = true;');
      f.checkpoint();
      unlinkSync(join(f.root, source));
      f.repositories[0].head = f.commit(f.root);
      const plan = f.plan();
      assert.deepEqual(plan.reasons['dsh-agent-workbench/' + source], [...consumers].sort());
      assert.ok(plan.files.includes('tests/required.test.mjs'));
      assert.ok(!plan.files.includes('tests/unrelated.test.mjs'));
      assert.equal(plan.browser, true);
      assert.equal(plan.fullSuite, 'not-run');
    });
});

test('actual esbuild stdin imports and mapped CSS reads retain both frame browser consumers', (t) => {
  for (const changed of ['src/frame-presenter.tsx', 'src/workbench.ts', 'src/company/layout.css']) {
    const f = fixture(t);
    f.policy.tests.push('tests/*.browser.mjs');
    f.put(f.root, 'scripts/ci-test-policy.json', JSON.stringify(f.policy));
    for (const file of [
      'tests/frame-layout.browser.mjs',
      'tests/frame-conversation-space.browser.mjs',
    ])
      f.put(f.root, file, readFileSync(new URL('./' + file.slice(6), import.meta.url), 'utf8'));
    f.put(f.root, changed, '/* initial authored input */');
    f.checkpoint();
    f.put(f.root, changed, '/* changed authored input */');
    f.repositories[0].head = f.commit(f.root);
    const plan = f.plan();
    assert.ok(plan.files.includes('tests/frame-layout.browser.mjs'), JSON.stringify(plan));
    assert.ok(
      plan.files.includes('tests/frame-conversation-space.browser.mjs'),
      JSON.stringify(plan),
    );
    assert.ok(!plan.files.includes('tests/unrelated.test.mjs'));
  }
});

test('sales plan presentation keeps actual workbench rendering and stylesheet consumers', (t) => {
  const sources = [
    'src/workbench/original/workbenches/regionalApproval/RegionalApprovalWorkbench.tsx',
    'src/workbench/original/workbenches/regionalApproval/InlineSkuDetails.tsx',
    'src/workbench/original/workbenches/regionalApproval/InlineSkuDetails.module.css',
    'src/workbench/workbench.css',
    'src/workbench/original/theme.css',
  ];
  for (const changed of sources) {
    const f = fixture(t);
    f.policy.tests.push('tests/*.browser.mjs');
    f.put(f.root, 'scripts/ci-test-policy.json', JSON.stringify(f.policy));
    const renderer = 'tests/sales-plan-presentation.browser.mjs';
    f.put(
      f.root,
      renderer,
      readFileSync(new URL('./sales-plan-presentation.browser.mjs', import.meta.url), 'utf8'),
    );
    for (const file of sources)
      f.put(f.root, file, readFileSync(new URL('../' + file, import.meta.url), 'utf8'));
    f.checkpoint();
    f.put(f.root, changed, readFileSync(join(f.root, changed), 'utf8') + '\n');
    f.repositories[0].head = f.commit(f.root);
    const plan = f.plan();
    assert.ok(plan.files.includes(renderer), JSON.stringify(plan));
    assert.equal(plan.browser, true);
    assert.equal(plan.runtime, false);
    assert.ok(!plan.files.includes('tests/unrelated.test.mjs'));
  }
});

test('stdin shorthand and named wrapper parameters retain compiled source imports', (t) => {
  for (const file of [
    'fc-repository-view.browser.mjs',
    'page-bridge-cancel.test.mjs',
    'dms-reception.test.mjs',
    'html-author-layout.browser.mjs',
  ]) {
    const f = fixture(t);
    if (file.endsWith('.browser.mjs')) f.policy.tests.push('tests/*.browser.mjs');
    f.put(f.root, 'scripts/ci-test-policy.json', JSON.stringify(f.policy));
    const source =
      file === 'page-bridge-cancel.test.mjs'
        ? 'src/page-bridge/host.ts'
        : file === 'dms-reception.test.mjs'
          ? 'src/workbench.ts'
          : file === 'html-author-layout.browser.mjs'
            ? 'src/workbench.ts'
            : 'src/workbench.ts';
    f.put(f.root, 'tests/' + file, readFileSync(new URL('./' + file, import.meta.url), 'utf8'));
    if (file === 'html-author-layout.browser.mjs')
      f.put(
        f.root,
        'tests/helpers/author-page.mjs',
        readFileSync(new URL('./helpers/author-page.mjs', import.meta.url), 'utf8'),
      );
    f.put(f.root, source, '/* initial */');
    f.checkpoint();
    f.put(f.root, source, '/* changed */');
    f.repositories[0].head = f.commit(f.root);
    assert.ok(f.plan().files.includes('tests/' + file), file + ': ' + JSON.stringify(f.plan()));
  }
});

test('mapped read parameters shadow outer bindings and named wrapper parameters', (t) => {
  for (const source of [
    `const file='../src/other.ts'; ['../src/value.ts'].map(file => readFileSync(file));`,
    `function inspect(file) { ['../src/value.ts'].map(file => readFileSync(file)); } inspect('../src/other.ts');`,
  ]) {
    const f = fixture(t);
    f.policy.rules.push({
      pattern: '^src/other\\.ts$',
      tests: ['tests/required.test.mjs'],
    });
    f.put(f.root, 'scripts/ci-test-policy.json', JSON.stringify(f.policy));
    f.put(f.root, 'tests/mapped.test.mjs', source);
    f.put(f.root, 'src/other.ts', 'export const other=1;');
    f.checkpoint();
    f.put(f.root, 'src/value.ts', 'export const value=2;');
    f.repositories[0].head = f.commit(f.root);
    assert.ok(f.plan().files.includes('tests/mapped.test.mjs'), source);
    f.put(f.root, 'README.md', 'advance baseline');
    f.checkpoint();
    f.put(f.root, 'src/other.ts', 'export const other=2;');
    f.repositories[0].head = f.commit(f.root);
    assert.ok(!f.plan().files.includes('tests/mapped.test.mjs'), source);
  }
});

test('declared child execution carries transitive implementation changes to one direct owner', (t) => {
  const f = fixture(t);
  f.put(f.root, 'tests/host.test.mjs', 'import "../src/consumer.js";');
  f.put(f.root, 'tests/client.test.mjs', 'export const client = true;');
  f.checkpoint();
  f.put(f.root, 'src/value.ts', 'export const value = 2;');
  f.repositories[0].head = f.commit(f.root);
  const plan = f.plan({ 'tests/host.test.mjs': 'tests/client.test.mjs' });
  assert.deepEqual(plan.files, [
    'tests/affected.test.mjs',
    'tests/client.test.mjs',
    'tests/required.test.mjs',
  ]);
  assert.deepEqual(plan.executedBy, {
    'tests/host.test.mjs': 'tests/client.test.mjs',
  });
  assert.deepEqual(plan.reasons['dsh-agent-workbench/src/value.ts'], [
    'tests/affected.test.mjs',
    'tests/client.test.mjs',
  ]);
});

test('execution ownership rejects unknown, missing, self-referencing and cyclic test mappings', (t) => {
  const f = fixture(t);
  for (const testOwners of [
    null,
    { 'tests/missing.test.mjs': 'tests/affected.test.mjs' },
    { 'tests/affected.test.mjs': 'tests/missing.test.mjs' },
    { 'tests/affected.test.mjs': 'tests/affected.test.mjs' },
    {
      'tests/affected.test.mjs': 'tests/peer.test.mjs',
      'tests/peer.test.mjs': 'tests/affected.test.mjs',
    },
  ])
    assert.throws(() => f.plan(testOwners), /CI_TEST_OWNER_REQUIRED/);
  unlinkSync(join(f.root, 'tests/peer.test.mjs'));
  assert.throws(
    () => f.plan({ 'tests/affected.test.mjs': 'tests/peer.test.mjs' }),
    /CI_TEST_OWNER_REQUIRED/,
  );
});

function productionFixture(t) {
  const f = fixture(t);
  Object.assign(
    f.policy,
    JSON.parse(readFileSync(new URL('../scripts/ci-test-policy.json', import.meta.url))),
  );
  f.put(f.root, 'scripts/ci-test-policy.json', JSON.stringify(f.policy));
  for (const file of new Set([
    ...f.policy.required,
    ...f.policy.rules.flatMap((rule) => rule.tests),
  ]))
    f.put(f.root, file, 'export const fixture = true;');
  for (const file of [
    'scripts/run-quality-checks.test.mjs',
    'business/inventory-fc/source/inventory-light-plugins/tests/fixture.test.mjs',
    'business/inventory-apsplan/source/tests/data/fixture.test.mjs',
  ])
    f.put(f.root, file, 'export const fixture = true;');
  return f;
}

test('production policy preserves actual build and provenance regression consumers', async (t) => {
  for (const [source, consumer] of [
    ['scripts/static-author-provenance.mjs', 'tests/static-author-provenance.test.mjs'],
    ['scripts/html-author.mjs', 'tests/html-sample-resource.test.mjs'],
    ['scripts/build-inventory.mjs', 'tests/inventory-storage-build.test.mjs'],
    ['scripts/build.mjs', 'tests/core-resource-build.test.mjs'],
    ['scripts/sql-config-build.mjs', 'tests/sql-config-build.test.mjs'],
  ])
    await t.test(source, (t) => {
      const f = productionFixture(t);
      for (const file of [source, consumer, 'scripts/build-html-sample.mjs'])
        f.put(f.root, file, readFileSync(new URL('../' + file, import.meta.url), 'utf8'));
      f.checkpoint();
      f.put(f.root, source, readFileSync(join(f.root, source), 'utf8') + '\n');
      f.repositories[0].head = f.commit(f.root);
      const plan = f.plan();
      assert.ok(
        plan.reasons['dsh-agent-workbench/' + source].includes(consumer),
        JSON.stringify(plan),
      );
      assert.ok(!plan.files.includes('tests/unrelated.test.mjs'));
      assert.equal(plan.fullSuite, 'not-run');
    });
});

test('test files and consumed raw fixtures remain selectable with production policy', async (t) => {
  for (const changed of ['scripts/raw-consumer.test.mjs', 'tests/fixtures/input.raw'])
    await t.test(changed, (t) => {
      const f = productionFixture(t);
      const consumer = 'scripts/raw-consumer.test.mjs';
      f.put(f.root, consumer, "readFileSync('../tests/fixtures/input.raw');");
      f.put(f.root, 'tests/fixtures/input.raw', 'original bytes');
      f.checkpoint();
      f.put(f.root, changed, readFileSync(join(f.root, changed), 'utf8') + '\n');
      f.repositories[0].head = f.commit(f.root);
      assert.ok(f.plan().reasons['dsh-agent-workbench/' + changed].includes(consumer));
    });
});

test('exclusive engineering rules cannot suppress a changed test or a consumed fixture', (t) => {
  const f = fixture(t);
  f.policy.rules.push({
    pattern: '^tests/',
    tests: ['tests/required.test.mjs'],
    exclusive: true,
  });
  f.put(f.root, 'scripts/ci-test-policy.json', JSON.stringify(f.policy));
  f.put(f.root, 'tests/affected.test.mjs', "readFileSync('tests/fixtures/input.raw');");
  f.put(f.root, 'tests/fixtures/input.raw', 'original bytes');
  f.checkpoint();
  f.put(f.root, 'tests/affected.test.mjs', "readFileSync('tests/fixtures/input.raw');\n");
  f.put(f.root, 'tests/fixtures/input.raw', 'updated bytes');
  f.repositories[0].head = f.commit(f.root);
  const plan = f.plan();
  for (const file of ['tests/affected.test.mjs', 'tests/fixtures/input.raw'])
    assert.ok(plan.reasons['dsh-agent-workbench/' + file].includes('tests/affected.test.mjs'));
});

test('an unmapped own test fixture is rejected instead of silently receiving a green plan', (t) => {
  const f = fixture(t);
  f.put(f.root, 'tests/fixtures/unmapped.raw', 'unmapped bytes');
  f.repositories[0].head = f.commit(f.root);
  assert.throws(f.plan, /CI_TEST_IMPACT_UNMAPPED/);
});

test('documentation applicability includes every peer change and rejects runtime resources', async (t) => {
  for (const file of [
    'docs/guide.md',
    'README.md',
    'business-resources/skills/example/SKILL.md',
    'docs/skills/example.md',
    'docs/prompt.md',
    'docs/input.txt',
    'src/value.ts',
  ])
    await t.test(file, (t) => {
      const f = fixture(t);
      f.put(f.root, 'README.md', 'ordinary documentation');
      const peer = f.repositories[1];
      f.put(peer.path, file, file.endsWith('.ts') ? 'export const value = 2;' : 'updated input');
      peer.head = f.commit(peer.path);
      f.repositories[0].head = f.commit(f.root);
      const plan = f.plan();
      assert.equal(
        plan.applicability,
        ['docs/guide.md', 'README.md'].includes(file) ? 'docs' : 'source',
      );
      if (plan.applicability === 'docs') {
        assert.deepEqual(plan.files, []);
        assert.equal(plan.browser, false);
        assert.equal(plan.runtime, false);
      }
    });
});

test('runtime and test reads keep ordinary documentation in the source lane across repositories', async (t) => {
  for (const owner of ['src/reader.mjs', 'tests/reader.test.mjs'])
    await t.test(owner, (t) => {
      const f = fixture(t);
      const peer = f.repositories[2];
      f.put(
        peer.path,
        owner,
        "import { readFileSync } from 'node:fs'; readFileSync('../docs/guide.md');",
      );
      f.put(peer.path, 'docs/guide.md', 'original runtime input');
      peer.head = f.commit(peer.path);
      f.put(
        f.root,
        'scripts/quality-peer-baseline.json',
        JSON.stringify({ repositories: f.repositories }),
      );
      f.checkpoint();
      f.put(peer.path, 'docs/guide.md', 'changed runtime input');
      peer.head = f.commit(peer.path);
      assert.equal(f.plan().applicability, 'source');
    });
});

test('an unchanged tuple does not claim documentation-only applicability', (t) => {
  const f = fixture(t);
  assert.equal(f.plan().applicability, 'source');
  assert.ok(f.plan().files.length > 0);
});

test('the production policy avoids FC builds for unrelated business paths', async (t) => {
  for (const [file, expected] of [
    ['business/inventory-apsplan/page.json', false],
    ['business/inventory-fc/page.json', true],
  ])
    await t.test(file, (t) => {
      const f = productionFixture(t);
      f.put(f.root, file, '{}');
      if (!expected) {
        f.put(f.root, 'tests/affected.test.mjs', `readFileSync('${file}');`);
      }
      f.checkpoint();
      f.put(f.root, file, '{"updated":true}');
      f.repositories[0].head = f.commit(f.root);
      assert.equal(f.plan().files.includes('tests/inventory-storage-build.test.mjs'), expected);
    });
});

test('only selected actual Workbench artifact consumers request the build', async (t) => {
  for (const [body, expected] of [
    ["import '../src/value.js';", false],
    ["readFileSync('lib/client.js');", true],
    ["readFileSync('static/mps/index.html');", true],
    ["const text = 'lib/client.js';", false],
  ])
    await t.test(body, (t) => {
      const f = fixture(t);
      f.put(f.root, 'tests/required.test.mjs', body);
      f.put(f.root, 'lib/client.js', 'compiled source');
      f.put(f.root, 'static/mps/index.html', '<html></html>');
      f.checkpoint();
      f.put(f.root, 'src/value.ts', 'export const value = 2;');
      f.repositories[0].head = f.commit(f.root);
      assert.equal(f.plan().build, expected);
    });
});

test('a CommonJS desktop helper selects one direct owner through require dependencies', (t) => {
  const f = fixture(t);
  f.policy.tests.push('desktop/*.test.cjs');
  f.put(f.root, 'scripts/ci-test-policy.json', JSON.stringify(f.policy));
  f.put(f.root, 'desktop/host.test.cjs', "require('./helper.test.cjs');");
  f.put(f.root, 'desktop/helper.test.cjs', "require('../src/value.cjs');");
  f.put(f.root, 'src/value.cjs', 'module.exports = 1;');
  f.checkpoint();
  f.put(f.root, 'src/value.cjs', 'module.exports = 2;');
  f.repositories[0].head = f.commit(f.root);
  const plan = f.plan({ 'desktop/helper.test.cjs': 'desktop/host.test.cjs' });
  assert.deepEqual(plan.reasons['dsh-agent-workbench/src/value.cjs'], ['desktop/host.test.cjs']);
  assert.equal(plan.files.filter((file) => file === 'desktop/host.test.cjs').length, 1);
  assert.ok(!plan.files.includes('desktop/helper.test.cjs'));
  assert.equal(plan.executedBy['desktop/helper.test.cjs'], 'desktop/host.test.cjs');
});

test('the public docs lane validates the real frozen source without SDK or dependency preparation', (t) => {
  const f = fixture(t);
  const core = join(dirname(f.root), 'core-source');
  mkdirSync(core);
  const git = (root, ...args) =>
    execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
  git(core, 'init', '-q');
  f.put(core, 'package.json', JSON.stringify({ packageManager: 'pnpm@11.11.0' }));
  f.put(core, 'pnpm-lock.yaml', 'fixture original lock\n');
  const coreHead = f.commit(core);
  const names = [
    '@cleverc2200/dsh-agent-workbench',
    'dsh-agent-manage',
    '@cleverc2200/gea-dsh-prototype',
  ];
  for (const [index, entry] of f.repositories.entries()) {
    f.put(entry.path, 'package.json', JSON.stringify({ name: names[index], type: 'module' }));
    f.put(entry.path, index === 0 ? 'package-lock.json' : 'pnpm-lock.yaml', 'frozen lock\n');
  }
  for (const name of [
    'run-quality-ci.mjs',
    'run-quality-checks.mjs',
    'candidate-input.mjs',
    'ci-test-plan.mjs',
    'check-agent-knowledge.mjs',
  ])
    copyFileSync(new URL('../scripts/' + name, import.meta.url), join(f.root, 'scripts', name));
  const manage = f.repositories[1];
  mkdirSync(join(manage.path, 'scripts'));
  for (const name of ['prepare-official-sdk.mjs', 'sdk-artifact-cache.mjs'])
    copyFileSync(
      new URL('../../dsh-agent-manage/scripts/' + name, import.meta.url),
      join(manage.path, 'scripts', name),
    );
  f.put(
    f.repositories[2].path,
    'scripts/supported-cores.json',
    JSON.stringify([
      {
        head: coreHead,
        nodeMajor: 24,
        packageManager: 'pnpm@11.11.0',
        lockSha256: createHash('sha256')
          .update(readFileSync(join(core, 'pnpm-lock.yaml')))
          .digest('hex'),
      },
    ]),
  );
  f.put(
    f.root,
    'tsconfig.official.json',
    JSON.stringify({
      compilerOptions: {
        paths: {
          '@deepseek-ai/cordis': [
            '../../official-latest-standard/vendor/cordis/lib/types/index.d.ts',
          ],
        },
      },
    }),
  );
  f.put(f.root, 'README.md', 'original documentation\n');
  f.put(
    f.root,
    'agent-knowledge.json',
    JSON.stringify({ entries: ['README.md'], paths: [], scripts: [] }),
  );
  for (const entry of f.repositories.slice(1)) entry.head = f.commit(entry.path);
  f.put(
    f.root,
    'scripts/quality-peer-baseline.json',
    JSON.stringify({ repositories: f.repositories }),
  );
  f.checkpoint();
  const base = f.repositories[0].head;
  f.put(f.root, 'README.md', 'updated documentation\n');
  f.repositories[0].head = f.commit(f.root);
  const input = join(dirname(f.root), 'integration-set.json');
  f.put(
    dirname(f.root),
    'integration-set.json',
    JSON.stringify({ core: coreHead, repositories: f.repositories }),
  );
  const args = () => [
    '--input',
    input,
    '--core-source',
    core,
    '--final-group-sha256',
    createHash('sha256').update(readFileSync(input)).digest('hex'),
  ];
  const output = join(dirname(f.root), 'github-output');
  const invoke = (phase) =>
    spawnSync(process.execPath, ['scripts/run-quality-ci.mjs', '--phase', phase, ...args()], {
      cwd: f.root,
      encoding: 'utf8',
      env: {
        ...process.env,
        CI: 'true',
        QUALITY_BASE_SHA: base,
        GITHUB_OUTPUT: output,
        GITHUB_EVENT_NAME: 'pull_request',
        QUALITY_EXPECTED_SHA: f.repositories[0].head,
      },
    });
  const planned = invoke('plan');
  assert.equal(planned.status, 0, planned.stdout + planned.stderr);
  assert.equal(JSON.parse(planned.stdout).applicability, 'docs');
  assert.match(readFileSync(output, 'utf8'), /dependency-review=false/);
  const checked = invoke('quality');
  assert.equal(checked.status, 0, checked.stdout + checked.stderr);
  const result = JSON.parse(checked.stdout.trim().split('\n').at(-1));
  assert.equal(result.applicability, 'docs');
  assert.equal(result.runtime, 'not-observed');
  for (const entry of f.repositories)
    assert.equal(existsSync(join(entry.path, 'node_modules')), false);
  assert.equal(existsSync(join(f.root, 'lib')), false);
  assert.equal(existsSync(join(dirname(f.root), 'official-latest-standard')), false);
  const ownPackage = readFileSync(join(f.root, 'package.json'));
  f.put(f.root, 'package.json', JSON.stringify({ ...JSON.parse(ownPackage), version: '1.0.1' }));
  f.repositories[0].head = f.commit(f.root);
  const refresh = () =>
    f.put(
      dirname(f.root),
      'integration-set.json',
      JSON.stringify({ core: coreHead, repositories: f.repositories }),
    );
  refresh();
  writeFileSync(output, '');
  const ownDependency = invoke('plan');
  assert.equal(ownDependency.status, 0, ownDependency.stderr);
  assert.match(readFileSync(output, 'utf8'), /dependency-review=true/);
  writeFileSync(join(f.root, 'package.json'), ownPackage);
  f.repositories[0].head = f.commit(f.root);
  f.put(
    manage.path,
    'package.json',
    JSON.stringify({
      ...JSON.parse(readFileSync(join(manage.path, 'package.json'))),
      version: '1.0.1',
    }),
  );
  manage.head = f.commit(manage.path);
  refresh();
  writeFileSync(output, '');
  const peerDependency = invoke('plan');
  assert.equal(peerDependency.status, 0, peerDependency.stderr);
  assert.equal(JSON.parse(peerDependency.stdout).applicability, 'source');
  assert.match(readFileSync(output, 'utf8'), /dependency-review=false/);
  f.put(f.repositories[2].path, 'pnpm-lock.yaml', 'changed lock\n');
  const denied = invoke('plan');
  assert.notEqual(denied.status, 0);
  assert.match(denied.stderr, /CANDIDATE_LOCK/);
});

test('SQL execution inputs select the existing Python contract owner without browser expansion', async (t) => {
  for (const file of [
    'scripts/agent_sql.py',
    'scripts/test_agent_sql.py',
    'scripts/requirements-sql.txt',
    'scripts/build_deep_query_configs.py',
  ])
    await t.test(file, (t) => {
      const f = productionFixture(t);
      f.put(f.root, file, 'original input');
      f.checkpoint();
      f.put(f.root, file, 'changed input');
      f.repositories[0].head = f.commit(f.root);
      const plan = f.plan();
      assert.ok(
        plan.reasons['dsh-agent-workbench/' + file].includes('tests/agent-sql-direct.test.mjs'),
      );
      assert.equal(plan.applicability, 'source');
      assert.equal(plan.browser, false);
      assert.equal(plan.fullSuite, 'not-run');
    });
});

test('adjacent SQL configs preserve dynamic page and computation consumers in the same plan', (t) => {
  const f = productionFixture(t);
  for (const file of [
    'tests/inventory-pc-layout.browser.mjs',
    'tests/fixtures/configured-page.mjs',
    'tests/helpers/prepared-assets.mjs',
  ])
    f.put(f.root, file, readFileSync(new URL('../' + file, import.meta.url), 'utf8'));
  const file = 'business/inventory-qll/sql.config.json';
  f.put(f.root, file, '{}');
  f.checkpoint();
  f.put(f.root, file, '{"changed":true}');
  f.repositories[0].head = f.commit(f.root);
  const plan = f.plan();
  for (const consumer of [
    'tests/agent-sql-direct.test.mjs',
    'tests/configured-channel.test.mjs',
    'tests/summary-query-performance.test.mjs',
    'tests/original-field-parity.test.mjs',
    'tests/inventory-pc-layout.browser.mjs',
  ])
    assert.ok(plan.reasons['dsh-agent-workbench/' + file].includes(consumer));
  assert.equal(plan.browser, true);
  assert.equal(plan.build, true);
  assert.ok(!plan.files.includes('tests/inventory-storage-build.test.mjs'));
});

test('source events select affected own consumers without required or changed peer suites', (t) => {
  const f = fixture(t);
  f.put(f.root, 'src/value.ts', 'export const value = 2;');
  f.repositories[0].head = f.commit(f.root);
  f.put(f.repositories[1].path, 'src/value.ts', 'export const value = 3;');
  f.repositories[1].head = f.commit(f.repositories[1].path);
  const plan = f.plan(undefined, { sourceOnly: true });
  assert.deepEqual(plan.files, ['tests/affected.test.mjs']);
  assert.deepEqual(plan.required, []);
  assert.deepEqual(plan.changes, [{ repo: 'dsh-agent-workbench', file: 'src/value.ts' }]);
});
test('unknown source deletion blocks source-event checks before preparation', (t) => {
  const f = fixture(t);
  f.put(f.root, 'src/unknown.ts', 'export const unknown = 1;');
  f.checkpoint();
  unlinkSync(join(f.root, 'src/unknown.ts'));
  f.repositories[0].head = f.commit(f.root);
  assert.throws(() => f.plan(undefined, { sourceOnly: true }), /CI_TEST_IMPACT_UNMAPPED/);
});

test('source preparation follows selected package and SDK consumers', (t) => {
  for (const [dependency, packages, sdk] of [
    ['node:assert/strict', false, false],
    ['esbuild', true, false],
    ['@deepseek-ai/cordis', true, true],
  ]) {
    const f = fixture(t);
    f.put(
      f.root,
      'tests/affected.test.mjs',
      `import '../src/consumer.js'; import '${dependency}';`,
    );
    f.checkpoint();
    f.put(f.root, 'src/value.ts', 'export const value = 2;');
    f.repositories[0].head = f.commit(f.root);
    const plan = f.plan(undefined, { sourceOnly: true });
    assert.equal(plan.dependencies, packages, dependency);
    assert.equal(plan.sdk, sdk, dependency);
  }
});

test('real upstream imports and input paths require artifacts and cannot claim isolated source ownership', (t) => {
  for (const dependency of [
    'dsh-better-sidebar',
    'dsh-better-sidebar/client',
    '@changfenhuang/dsh-genui',
    '@changfenhuang/dsh-genui/embed',
    '../../upstream-inputs/genui/src/plugin/tool.ts',
    '../node_modules/dsh-better-sidebar/src/agent-opens.ts',
  ]) {
    const f = fixture(t);
    f.put(
      f.root,
      'tests/affected.test.mjs',
      `import '../src/consumer.js'; import '${dependency}';`,
    );
    f.checkpoint();
    f.put(f.root, 'src/value.ts', 'export const value = 2;');
    f.repositories[0].head = f.commit(f.root);
    const plan = f.plan(undefined, { sourceOnly: true });
    assert.equal(plan.upstreams, 'artifacts', dependency);
    f.policy.sourceFixtures = { 'tests/affected.test.mjs': { dependencies: true } };
    f.put(f.root, 'scripts/ci-test-policy.json', JSON.stringify(f.policy));
    f.repositories[0].head = f.commit(f.root);
    assert.throws(
      () => f.plan(undefined, { sourceOnly: true }),
      /CI_TEST_SOURCE_FIXTURE_REJECTED/,
      dependency,
    );
  }
});

test('only verified isolated source fixtures can use source links while ordinary consumers keep artifacts', (t) => {
  const f = fixture(t);
  f.put(f.root, 'tests/affected.test.mjs', 'import "../src/consumer.js"; import "esbuild";');
  f.checkpoint();
  f.put(f.root, 'src/value.ts', 'export const value = 2;');
  f.repositories[0].head = f.commit(f.root);
  assert.equal(f.plan(undefined, { sourceOnly: true }).upstreams, 'artifacts');
  f.policy.sourceFixtures = { 'tests/affected.test.mjs': { dependencies: true } };
  f.put(f.root, 'scripts/ci-test-policy.json', JSON.stringify(f.policy));
  f.checkpoint();
  f.put(f.root, 'src/value.ts', 'export const value = 3;');
  f.repositories[0].head = f.commit(f.root);
  assert.equal(f.plan(undefined, { sourceOnly: true }).upstreams, 'source-links');
  assert.equal(f.plan().upstreams, 'artifacts');
});

test('upstream consumers remain visible through helper imports and executed esbuild contents', (t) => {
  for (const source of [
    'import "../src/upstream.mjs";',
    `import {build} from "esbuild"; await build({stdin:{contents:'import "../../upstream-inputs/genui/src/plugin/tool.ts";'}});`,
  ]) {
    const f = fixture(t);
    f.put(f.root, 'src/upstream.mjs', 'import "dsh-better-sidebar/client";');
    f.put(f.root, 'tests/affected.test.mjs', `import '../src/consumer.js'; ${source}`);
    f.policy.sourceFixtures = { 'tests/affected.test.mjs': { dependencies: true } };
    f.put(f.root, 'scripts/ci-test-policy.json', JSON.stringify(f.policy));
    f.checkpoint();
    f.put(f.root, 'src/value.ts', 'export const value = 2;');
    f.repositories[0].head = f.commit(f.root);
    assert.throws(() => f.plan(undefined, { sourceOnly: true }), /CI_TEST_SOURCE_FIXTURE_REJECTED/);
  }
});

test('isolated fixture assets are distinct from actual owner upstream file inputs', (t) => {
  const f = fixture(t);
  f.policy.sourceFixtures = { 'tests/affected.test.mjs': { dependencies: false } };
  f.put(f.root, 'scripts/ci-test-policy.json', JSON.stringify(f.policy));
  f.put(
    f.root,
    'tests/affected.test.mjs',
    `import '../src/consumer.js'; import {mkdtempSync, mkdirSync, writeFileSync, readFileSync} from 'node:fs'; import {tmpdir} from 'node:os'; import {join, dirname} from 'node:path'; const job = mkdtempSync(join(tmpdir(), 'upstream-fixture-')); const asset = join(job, 'quality-upstreams/upstream-assets/genui-0.11.3/package.json'); mkdirSync(dirname(asset), {recursive:true}); writeFileSync(asset, '{}'); readFileSync(asset);`,
  );
  f.checkpoint();
  f.put(f.root, 'src/value.ts', 'export const value = 2;');
  f.repositories[0].head = f.commit(f.root);
  assert.equal(f.plan(undefined, { sourceOnly: true }).upstreams, 'source-links');
  for (const path of [
    '../../upstream-inputs/genui/package.json',
    '../../quality-upstreams/upstream-assets/genui-0.11.3/package.json',
    'node_modules/dsh-better-sidebar/lib/index.js',
  ]) {
    f.put(
      f.root,
      'tests/affected.test.mjs',
      `import '../src/consumer.js'; import {readFileSync} from 'node:fs'; readFileSync('${path}');`,
    );
    f.repositories[0].head = f.commit(f.root);
    assert.throws(
      () => f.plan(undefined, { sourceOnly: true }),
      /CI_TEST_SOURCE_FIXTURE_REJECTED/,
      path,
    );
  }
  f.put(
    f.root,
    'tests/affected.test.mjs',
    `import '../src/consumer.js'; import {readFileSync} from 'node:fs'; import {join} from 'node:path'; readFileSync(join('../../upstream-inputs', 'genui', 'package.json'));`,
  );
  f.repositories[0].head = f.commit(f.root);
  assert.throws(() => f.plan(undefined, { sourceOnly: true }), /CI_TEST_SOURCE_FIXTURE_REJECTED/);
});

test('file URL imports use filesystem edges while package resolution still requires installed packages', (t) => {
  const f = fixture(t);
  f.policy.sourceFixtures = { 'tests/affected.test.mjs': { dependencies: false } };
  f.put(f.root, 'scripts/ci-test-policy.json', JSON.stringify(f.policy));
  f.put(
    f.root,
    'tests/affected.test.mjs',
    `import '../src/consumer.js'; import {pathToFileURL} from 'node:url'; import {join} from 'node:path'; const tools = join('fixture-output', 'tools'); await import(pathToFileURL(join(tools, 'command.mjs')));`,
  );
  f.checkpoint();
  f.put(f.root, 'src/value.ts', 'export const value = 2;');
  f.repositories[0].head = f.commit(f.root);
  const plan = f.plan(undefined, { sourceOnly: true });
  assert.equal(plan.dependencies, false);
  assert.equal(plan.upstreams, 'source-links');
  for (const name of ['esbuild', 'dsh-better-sidebar', '@deepseek-ai/cordis']) {
    f.put(
      f.root,
      'tests/affected.test.mjs',
      `import '../src/consumer.js'; import {pathToFileURL} from 'node:url'; import {createRequire} from 'node:module'; const require = createRequire(import.meta.url); await import(pathToFileURL(require.resolve('${name}')));`,
    );
    f.repositories[0].head = f.commit(f.root);
    assert.throws(
      () => f.plan(undefined, { sourceOnly: true }),
      /CI_TEST_SOURCE_FIXTURE_REJECTED/,
      name,
    );
  }
});

test('source tool ownership uses existing selftests while joint checks retain capability rules', (t) => {
  const f = fixture(t);
  f.policy.rules.push({
    pattern: '^scripts/tool\\.mjs$',
    tests: ['tests/affected.test.mjs'],
    sourceTests: ['tests/tool.test.mjs'],
  });
  f.put(f.root, 'scripts/ci-test-policy.json', JSON.stringify(f.policy));
  f.put(f.root, 'scripts/tool.mjs', 'export const value = 1;');
  f.put(f.root, 'tests/tool.test.mjs', 'export const test = true;');
  f.checkpoint();
  f.put(f.root, 'scripts/tool.mjs', 'export const value = 2;');
  f.repositories[0].head = f.commit(f.root);
  assert.deepEqual(f.plan(undefined, { sourceOnly: true }).files, ['tests/tool.test.mjs']);
  assert.deepEqual(f.plan().files, ['tests/affected.test.mjs', 'tests/required.test.mjs']);
});

test('source fixture ownership avoids preparing copied command targets and rejects direct SDK consumers', (t) => {
  const f = fixture(t);
  f.policy.sourceFixtures = { 'tests/affected.test.mjs': { dependencies: false } };
  f.put(f.root, 'scripts/ci-test-policy.json', JSON.stringify(f.policy));
  f.put(
    f.root,
    'tests/affected.test.mjs',
    'import "node:child_process"; import "../src/consumer.js"; execFileSync("node", ["scripts/command.mjs"]);',
  );
  f.put(f.root, 'scripts/command.mjs', 'import "@playwright/test"; import "@deepseek-ai/cordis";');
  f.checkpoint();
  f.put(f.root, 'src/value.ts', 'export const value = 2;');
  f.repositories[0].head = f.commit(f.root);
  const plan = f.plan(undefined, { sourceOnly: true });
  assert.equal(plan.browser, false);
  assert.equal(plan.sdk, false);
  assert.equal(plan.dependencies, false);
  f.put(f.root, 'scripts/command.mjs', 'import "dsh-better-sidebar";');
  f.repositories[0].head = f.commit(f.root);
  assert.equal(f.plan(undefined, { sourceOnly: true }).upstreams, 'source-links');
  f.put(f.root, 'scripts/command.mjs', 'import "@playwright/test"; import "@deepseek-ai/cordis";');
  f.repositories[0].head = f.commit(f.root);
  for (const dependency of ['@deepseek-ai/cordis', 'esbuild', '@playwright/test']) {
    f.put(
      f.root,
      'tests/affected.test.mjs',
      `import '${dependency}'; import '../src/consumer.js';`,
    );
    f.repositories[0].head = f.commit(f.root);
    assert.throws(
      () => f.plan(undefined, { sourceOnly: true }),
      /CI_TEST_SOURCE_FIXTURE_REJECTED/,
      dependency,
    );
  }
});

test('source selftests run themselves and explicit helper owners avoid old business suites', (t) => {
  const f = fixture(t);
  f.policy.rules.push({
    pattern: '^tests/',
    tests: ['tests/required.test.mjs'],
    sourceTests: ['tests/tool.test.mjs'],
  });
  f.put(f.root, 'scripts/ci-test-policy.json', JSON.stringify(f.policy));
  f.put(f.root, 'tests/tool.test.mjs', 'export const checked = 1;');
  f.put(f.root, 'tests/helper.ts', 'export const helper = 1;');
  f.put(f.root, 'tests/affected.test.mjs', 'import "./helper.js";');
  f.checkpoint();
  f.put(f.root, 'tests/tool.test.mjs', 'export const checked = 2;');
  f.repositories[0].head = f.commit(f.root);
  assert.deepEqual(f.plan(undefined, { sourceOnly: true }).files, ['tests/tool.test.mjs']);
  f.put(f.root, 'README.md', 'new comparison base');
  f.checkpoint();
  f.put(f.root, 'tests/helper.ts', 'export const helper = 2;');
  f.repositories[0].head = f.commit(f.root);
  assert.deepEqual(f.plan(undefined, { sourceOnly: true }).files, ['tests/tool.test.mjs']);
  assert.ok(f.plan().files.includes('tests/affected.test.mjs'));
});

test('workflow source plans retain behavior contracts alongside semantic preflight', async (t) => {
  for (const [repo, workflow, consumers] of [
    [
      'dsh-agent-workbench',
      'quality',
      [
        'tests/quality-ci.test.mjs',
        'tests/candidate-input.test.mjs',
        'tests/quality-cli.test.mjs',
        'tests/ci-test-plan.test.mjs',
        'tests/final-group-input.contract.mjs',
      ],
    ],
    [
      'dsh-agent-workbench',
      'source-quality',
      [
        'scripts/source-quality.test.mjs',
        'tests/source-checks.test.mjs',
        'tests/source-typecheck.test.mjs',
        'tests/ci-test-plan.test.mjs',
      ],
    ],
  ]) {
    await t.test(`${repo}/${workflow}`, (t) => {
      const f = fixture(t, repo);
      const original = new URL(`../../${repo}/`, import.meta.url);
      Object.assign(
        f.policy,
        JSON.parse(readFileSync(new URL('scripts/ci-test-policy.json', original))),
      );
      f.put(f.root, 'scripts/ci-test-policy.json', JSON.stringify(f.policy));
      for (const pattern of f.policy.tests)
        for (const file of globSync(pattern, { cwd: original }))
          f.put(f.root, file, 'export const fixture = true;');
      const file = `.github/workflows/${workflow}.yml`;
      f.put(f.root, file, 'permissions: {contents: read}\n');
      f.checkpoint();
      f.put(f.root, file, 'permissions: {contents: write}\n');
      f.repositories.find((entry) => entry.repo === repo).head = f.commit(f.root);
      const plan = f.plan(undefined, { sourceOnly: true });
      for (const consumer of ['scripts/workflow-preflight.test.mjs', ...consumers])
        assert.ok(plan.files.includes(consumer), `${consumer}: ${JSON.stringify(plan)}`);
    });
  }
});

test('preflight module source changes select their own regression without workflow contracts', async (t) => {
  for (const repo of ['dsh-agent-workbench'])
    await t.test(repo, (t) => {
      const f = fixture(t, repo);
      const original = new URL(`../../${repo}/`, import.meta.url);
      Object.assign(
        f.policy,
        JSON.parse(readFileSync(new URL('scripts/ci-test-policy.json', original))),
      );
      f.put(f.root, 'scripts/ci-test-policy.json', JSON.stringify(f.policy));
      for (const pattern of f.policy.tests)
        for (const file of globSync(pattern, { cwd: original }))
          f.put(f.root, file, 'export const fixture = true;');
      f.put(f.root, 'scripts/workflow-preflight.mjs', 'export const revision = 1;');
      f.checkpoint();
      f.put(f.root, 'scripts/workflow-preflight.mjs', 'export const revision = 2;');
      f.repositories.find((entry) => entry.repo === repo).head = f.commit(f.root);
      assert.deepEqual(f.plan(undefined, { sourceOnly: true }).files, [
        'scripts/workflow-preflight.test.mjs',
      ]);
    });
});
