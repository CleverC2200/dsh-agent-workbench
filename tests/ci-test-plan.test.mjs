import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
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
    plan: () => selectCiTests({ repositories, repo: own.repo, base }),
  };
}

test('required checks run for a docs-only change without selecting the full pool', (t) => {
  const f = fixture(t);
  f.put(f.root, 'README.md', 'documentation');
  f.repositories[0].head = f.commit(f.root);
  const plan = f.plan();
  assert.deepEqual(plan.files, ['tests/required.test.mjs']);
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
test('unmapped runtime source refuses before preparation; no full-suite fallback is allowed', (t) => {
  const f = fixture(t);
  f.put(f.root, 'src/unmapped.ts', 'export const uncovered = true;');
  f.repositories[0].head = f.commit(f.root);
  assert.throws(f.plan, /CI_TEST_IMPACT_UNMAPPED/);
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
  for (const [source, consumer] of [
    ['scripts/ci-source-policy.mjs', 'scripts/business-profile-ci.test.mjs'],
    ['scripts/business-profile-ci.mjs', 'scripts/business-profile-ci.test.mjs'],
    ['scripts/task-status.mjs', 'tests/task-status.test.mjs'],
  ])
    await t.test(source, (t) => {
      const f = fixture(t);
      f.policy.rules = production.rules;
      f.policy.tests.push('scripts/*.test.mjs');
      f.put(f.root, 'scripts/ci-test-policy.json', JSON.stringify(f.policy));
      for (const file of [
        consumer,
        'scripts/business-profile-ci.test.mjs',
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
      assert.ok(plan.files.includes('tests/quality-ci.test.mjs'));
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
    f.policy.rules.push({ pattern: '^src/other\\.ts$', tests: ['tests/required.test.mjs'] });
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
