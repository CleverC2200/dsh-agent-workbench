import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  readFileSync,
  existsSync,
  realpathSync,
  chmodSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';

const runner = new URL('../scripts/source-checks.mjs', import.meta.url).href;
function fixture(
  t,
  changed,
  {
    sdk = false,
    repo: owner = 'dsh-agent-workbench',
    desktopTools = false,
    knowledge = false,
    staticFailure,
    preparation = false,
    localLayout = false,
    tooling = false,
    jointAdmission = false,
  } = {},
) {
  const parent = mkdtempSync(join(tmpdir(), 'source-checks-'));
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  const put = (root, file, text) => {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), text);
  };
  const git = (root, ...args) =>
    execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
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
      'fixture',
    );
    return git(root, 'rev-parse', 'HEAD');
  };
  const repositories = ['dsh-agent-workbench', 'dsh-agent-manage', 'dsh-gea-plugin'].map((repo) => {
    const path =
      owner === 'dsh-gea-plugin' && !localLayout
        ? join(parent, repo === 'dsh-agent-workbench' ? 'source' : 'candidate', repo)
        : join(parent, repo);
    mkdirSync(path, { recursive: true });
    git(path, 'init', '-q');
    put(path, 'README.md', 'fixture');
    if (repo === 'dsh-agent-manage')
      put(
        path,
        'scripts/preset-test-lanes.mjs',
        'export const presetHostOwners = {}; export const presetLanes = {};',
      );
    if (sdk && repo === 'dsh-gea-plugin') {
      put(path, 'scripts/current-core.json', JSON.stringify({ adaptation: 'b'.repeat(40) }));
      put(
        path,
        'scripts/ci-core-policy.mjs',
        `export function ciCores(lane) { if(lane !== 'required') throw Error('REQUIRED_LANE_ONLY'); return [{ head: '6f88c3ea2d266ba1825d88bab10d92479a6ffde8' }]; }`,
      );
    }
    if (sdk && repo === 'dsh-agent-manage')
      put(
        path,
        'scripts/prepare-official-sdk.mjs',
        jointAdmission
          ? 'export function verifyOfficialSDK() {}'
          : `export function verifyOfficialSDK({coreHead}) { throw Error('SDK_SELECTED_CORE:' + coreHead); }`,
      );
    if (jointAdmission && repo === 'dsh-agent-workbench') {
      put(path, 'scripts/read-hosted-peer-input.mjs', 'console.log(JSON.stringify({}));');
      put(
        path,
        'scripts/write-hosted-group.mjs',
        `import { writeFileSync } from 'node:fs'; import { resolve } from 'node:path'; writeFileSync(resolve('../../candidate-input.json'), '{"group":"fixture"}\\n');`,
      );
      put(
        path,
        'scripts/run-quality-ci.mjs',
        `import { parseArgs } from 'node:util'; import { writeFileSync } from 'node:fs'; parseArgs({ options: { 'source-only': { type: 'boolean' }, input: { type: 'string' }, 'core-source': { type: 'string' }, 'final-group-sha256': { type: 'string' }, browser: { type: 'boolean' }, 'prepare-browser': { type: 'boolean' } } }); writeFileSync('.runtime/joint-admitted', 'workbench');`,
      );
      put(path, 'tests/profile.mjs', 'export const profile = true;');
    }
    if (jointAdmission && repo === 'dsh-gea-plugin') {
      put(path, 'tests/profile.mjs', 'export const profile = true;');
      put(
        path,
        'scripts/run-quality-ci.mjs',
        `import assert from 'node:assert/strict'; import { parseArgs } from 'node:util'; import { readFileSync, writeFileSync } from 'node:fs'; import { resolve } from 'node:path'; import { createHash } from 'node:crypto'; const { values } = parseArgs({ options: { 'source-only': { type: 'boolean' }, input: { type: 'string' }, 'core-source': { type: 'string' }, 'final-group-sha256': { type: 'string' }, 'final-group-workbench': { type: 'string' }, 'prepare-inputs': { type: 'boolean' }, 'prepare-sdk': { type: 'boolean' }, 'test-file-concurrency': { type: 'string' }, 'test-timings': { type: 'string' } } }); assert.equal(values['test-file-concurrency'], '3', 'GEA_SOURCE_CAPACITY_REQUIRED'); assert.equal(values['test-timings'], resolve('scripts/quality-test-timings.json')); assert.equal(values['final-group-workbench'], resolve('../../source/dsh-agent-workbench'), 'CANDIDATE_FINAL_GROUP_REQUIRED'); assert.equal(values['final-group-sha256'], createHash('sha256').update(readFileSync(values.input)).digest('hex')); writeFileSync('.runtime/joint-admitted', values['final-group-workbench']);`,
      );
    }
    if (preparation && repo === 'dsh-gea-plugin') {
      put(
        path,
        'scripts/build-admission.mjs',
        'export function acquireBuild() { return () => {}; }',
      );
      put(
        path,
        'scripts/quality-upstreams.mjs',
        `import { writeFileSync } from 'node:fs'; export async function prepareQualityUpstreamSources() { writeFileSync('.runtime/upstream-sources', 'prepared'); } export async function prepareQualityUpstreams() { throw Error('UNRELATED_UPSTREAM_BUILD'); } export async function bindQualityUpstreamInputs(root, inputs, options) { if(!options.sourceOnly) throw Error('SOURCE_LINKS_REQUIRED'); writeFileSync('.runtime/upstream-links', options.prepare ? 'prepared' : 'verified'); }`,
      );
    }
    return { repo, path, head: commit(path) };
  });
  const root = repositories.find((entry) => entry.repo === owner).path;
  put(
    root,
    'package.json',
    JSON.stringify({
      type: 'module',
      packageManager: owner === 'dsh-agent-workbench' ? 'npm@11.11.0' : 'pnpm@11.7.0',
      ...(tooling ? { devDependencies: { oxlint: '1', oxfmt: '1' } } : {}),
      scripts: {
        'check:knowledge': knowledge
          ? 'node scripts/check-agent-knowledge.mjs --root . --config agent-knowledge.json'
          : 'node --eval "" --',
        lint: 'node --check scripts/tool.mjs',
        'format:check': 'node --eval ""',
        ...(staticFailure
          ? { [staticFailure]: 'node --eval "throw Error(\'OWNER_STATIC_FAILURE\')"' }
          : {}),
      },
    }),
  );
  if (knowledge) {
    put(
      root,
      'scripts/check-agent-knowledge.mjs',
      readFileSync(new URL('../scripts/check-agent-knowledge.mjs', import.meta.url), 'utf8'),
    );
    put(root, 'agent-knowledge.json', JSON.stringify({ entries: [], paths: ['docs/required.md'] }));
    put(root, 'docs/required.md', 'required knowledge');
  }
  put(
    root,
    'scripts/quality-peer-baseline.json',
    JSON.stringify({
      schemaVersion: 1,
      repositories: repositories.map(({ repo, head }) => ({ repo, head })),
    }),
  );
  if (tooling)
    put(
      root,
      'package-lock.json',
      JSON.stringify({
        lockfileVersion: 3,
        packages: {
          '': {},
          'node_modules/oxlint': { version: '1', integrity: 'sha512-fixture' },
          'node_modules/oxfmt': { version: '1', integrity: 'sha512-fixture' },
        },
      }),
    );
  put(root, 'scripts/tool.mjs', 'export const value = 1;');
  put(
    root,
    'tests/tool.test.mjs',
    'import { value } from "../scripts/tool.mjs"; if(value!==2) throw Error("BEHAVIOR_NOT_FIXED");',
  );
  put(root, 'tests/required.test.mjs', 'throw Error("UNRELATED_REQUIRED");');
  put(root, 'tests/unrelated.test.mjs', 'throw Error("UNRELATED_SUITE");');
  put(
    root,
    'scripts/ci-test-policy.json',
    JSON.stringify({
      schemaVersion: 1,
      required: ['tests/required.test.mjs'],
      tests: desktopTools ? ['tests/*.test.mjs', 'scripts/*.test.mjs'] : ['tests/*.test.mjs'],
      rules: [
        {
          pattern: '^tsconfig\\.official\\.json$',
          tests: ['tests/tool.test.mjs'],
          sourceTests: ['tests/tool.test.mjs'],
        },
      ],
      ...(preparation || tooling
        ? { sourceFixtures: { 'tests/tool.test.mjs': { dependencies: false } } }
        : {}),
    }),
  );
  if (desktopTools) {
    put(
      root,
      'scripts/build-admission.mjs',
      `import { writeFileSync } from 'node:fs'; export function acquireBuild({operation}) { if(operation !== 'build') throw Error('EXPECTED_BUILD_ADMISSION'); writeFileSync('.runtime/desktop-budget', 'active'); return () => writeFileSync('.runtime/desktop-budget', 'released'); }`,
    );
    put(
      root,
      'scripts/build-desktop-tools.mjs',
      `import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'; if(readFileSync('.runtime/desktop-budget', 'utf8') !== 'active') throw Error('DESKTOP_BUDGET_REQUIRED'); mkdirSync('desktop', {recursive:true}); for(const file of ['download-differential.cjs', 'core-asar-reader.cjs']) writeFileSync('desktop/' + file, 'built');`,
    );
  }
  const base = commit(root);
  for (const [file, text] of Object.entries(changed)) put(root, file, text);
  const head = commit(root);
  const result = { base, head, files: Object.keys(changed), mode: 'code' };
  const env = { ...process.env, SOURCE_REPOSITORY: owner, GITHUB_OUTPUT: '' };
  if (preparation) {
    const executable = join(parent, 'bin/corepack');
    put(
      parent,
      'bin/corepack',
      `#!${process.execPath}\nimport {writeFileSync,readFileSync} from 'node:fs'; import {execFileSync} from 'node:child_process'; const args = process.argv.slice(2); if(args.join(' ') === 'pnpm install --frozen-lockfile --ignore-scripts --prefer-offline') writeFileSync('.runtime/owner-installed', 'locked'); else if(args[0] === 'pnpm' && args[1] === 'run') execFileSync('/bin/sh', ['-c', JSON.parse(readFileSync('package.json')).scripts[args[2]]], {stdio:'inherit'}); else throw Error('UNEXPECTED_INSTALL');`,
    );
    chmodSync(executable, 0o755);
    env.PATH = join(parent, 'bin') + ':' + env.PATH;
  }
  delete env.NODE_TEST_CONTEXT;
  const run = (phase, { workingTree = false } = {}) =>
    spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `import {sourceChecks} from ${JSON.stringify(runner)}; await sourceChecks(${JSON.stringify({ ...result, ...(workingTree ? { workingTree: true } : {}) })}, ${JSON.stringify(phase)});`,
      ],
      { cwd: root, encoding: 'utf8', env },
    );
  return { root, run, repositories };
}

test('nonjoint source checks reject a missing knowledge reference through the owner command', (t) => {
  const f = fixture(t, { 'scripts/tool.mjs': 'export const value = 2;' }, { knowledge: true });
  rmSync(join(f.root, 'docs/required.md'));
  const rejected = f.run('affected-check');
  assert.notEqual(rejected.status, 0, rejected.stdout + rejected.stderr);
  assert.match(rejected.stdout + rejected.stderr, /AGENT_REFERENCE_MISSING: docs\/required\.md/);
  writeFileSync(join(f.root, 'docs/required.md'), 'required knowledge');
  const accepted = f.run('affected-check');
  assert.equal(accepted.status, 0, accepted.stdout + accepted.stderr);
});

test('cold source knowledge checks defer generated exports but retain source references', (t) => {
  const f = fixture(t, { 'scripts/tool.mjs': 'export const value = 2;' }, { knowledge: true });
  const packagePath = join(f.root, 'package.json');
  const pkg = JSON.parse(readFileSync(packagePath, 'utf8'));
  pkg.exports = { './configured-facts': { types: './lib/configured-facts.d.mts' } };
  writeFileSync(packagePath, JSON.stringify(pkg));
  writeFileSync(
    join(f.root, 'agent-knowledge.json'),
    JSON.stringify({ entries: [], paths: ['docs/required.md'], exports: true }),
  );
  const full = spawnSync(
    process.execPath,
    ['scripts/check-agent-knowledge.mjs', '--root', '.', '--config', 'agent-knowledge.json'],
    { cwd: f.root, encoding: 'utf8' },
  );
  assert.notEqual(full.status, 0);
  assert.match(full.stdout + full.stderr, /AGENT_REFERENCE_MISSING: export/);
  const source = f.run('affected-check');
  assert.equal(source.status, 0, source.stdout + source.stderr);
  rmSync(join(f.root, 'docs/required.md'));
  const missingSource = f.run('affected-check');
  assert.notEqual(missingSource.status, 0);
  assert.match(
    missingSource.stdout + missingSource.stderr,
    /AGENT_REFERENCE_MISSING: docs\/required\.md/,
  );
});

test('local material plans use actual sibling peers and refuse preparing or executing a working tree', async (t) => {
  for (const repo of ['dsh-agent-workbench', 'dsh-agent-manage', 'dsh-gea-plugin'])
    await t.test(repo, (t) => {
      const f = fixture(t, { 'tsconfig.official.json': '{}' }, { repo, localLayout: true });
      const peer = f.repositories.find((entry) => entry.repo !== repo);
      writeFileSync(join(peer.path, 'README.md'), 'current local peer');
      execFileSync('git', [
        '-C',
        peer.path,
        '-c',
        'user.name=fixture',
        '-c',
        'user.email=fixture@invalid',
        'commit',
        '-am',
        'local peer',
      ]);
      const planned = f.run('affected-plan', { workingTree: true });
      assert.equal(planned.status, 0, planned.stdout + planned.stderr);
      const plan = JSON.parse(planned.stdout);
      assert.equal(plan.workingTree, true);
      assert.equal(plan.typecheck, true);
      assert.equal(plan.sdk, true);
      assert.equal(plan.dependencies, true);
      if (repo === 'dsh-gea-plugin') assert.equal(plan.upstreams, 'artifacts');
      for (const phase of ['affected-prepare', 'affected-check']) {
        const rejected = f.run(phase, { workingTree: true });
        assert.notEqual(rejected.status, 0);
        assert.match(rejected.stderr, /SOURCE_WORKING_TREE_PLAN_ONLY/);
      }
    });
});

test('isolated GEA source preparation installs owner dependencies using only verified upstream source links', (t) => {
  const f = fixture(
    t,
    { 'scripts/tool.mjs': 'export const value = 2;' },
    { repo: 'dsh-gea-plugin', preparation: true },
  );
  const prepared = f.run('affected-prepare');
  assert.equal(prepared.status, 0, prepared.stdout + prepared.stderr);
  assert.equal(readFileSync(join(f.root, '.runtime/upstream-sources'), 'utf8'), 'prepared');
  assert.equal(readFileSync(join(f.root, '.runtime/upstream-links'), 'utf8'), 'prepared');
  assert.equal(readFileSync(join(f.root, '.runtime/owner-installed'), 'utf8'), 'locked');
  const checked = f.run('affected-check');
  assert.equal(checked.status, 0, checked.stdout + checked.stderr);
  assert.equal(readFileSync(join(f.root, '.runtime/upstream-links'), 'utf8'), 'verified');
});

test('each owner lint and format failure blocks the source gate with dependency needs declared', async (t) => {
  for (const repo of ['dsh-agent-workbench', 'dsh-agent-manage', 'dsh-gea-plugin'])
    for (const check of ['lint', 'format:check'])
      await t.test(repo + ' ' + check, (t) => {
        const f = fixture(
          t,
          { 'scripts/tool.mjs': 'export const value = 2;' },
          { repo, staticFailure: check },
        );
        const planned = f.run('affected-plan');
        assert.equal(planned.status, 0, planned.stdout + planned.stderr);
        const plan = JSON.parse(planned.stdout);
        assert.deepEqual(plan.staticChecks, ['check:knowledge', 'lint', 'format:check']);
        assert.equal(plan.dependencies, true);
        assert.equal(plan.sdk, false);
        assert.equal(plan.joint, false);
        const rejected = f.run('affected-check');
        assert.notEqual(rejected.status, 0, rejected.stdout + rejected.stderr);
        assert.match(rejected.stdout + rejected.stderr, /OWNER_STATIC_FAILURE/);
        assert.doesNotMatch(rejected.stdout, /"status":"passed"/);
      });
});

test('knowledge rejection precedes SDK verification and joint checks retain their existing static owner', (t) => {
  const f = fixture(t, { 'tsconfig.official.json': '{}' }, { knowledge: true, sdk: true });
  rmSync(join(f.root, 'docs/required.md'));
  const rejected = f.run('affected-check');
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stdout + rejected.stderr, /AGENT_REFERENCE_MISSING/);
  assert.doesNotMatch(rejected.stdout + rejected.stderr, /SDK_SELECTED_CORE/);
  const joint = fixture(t, {
    'scripts/tool.mjs': 'export const value = 2;',
    'tests/tool.test.mjs': 'import "../scripts/tool.mjs"; import "../lib/generated.mjs";',
  });
  const planned = joint.run('affected-plan');
  assert.equal(planned.status, 0, planned.stdout + planned.stderr);
  const plan = JSON.parse(planned.stdout);
  assert.equal(plan.joint, true);
  assert.deepEqual(plan.staticChecks, []);
});

test('a tool-only source change runs its behavior test cold and excludes unrelated required suites', (t) => {
  const f = fixture(t, { 'scripts/tool.mjs': 'export const value = 2;' });
  const planned = f.run('affected-plan');
  assert.equal(planned.status, 0, planned.stderr);
  const plan = JSON.parse(planned.stdout);
  assert.deepEqual(plan.files, ['tests/tool.test.mjs']);
  assert.equal(plan.sdk, false);
  assert.equal(plan.dependencies, true);
  assert.deepEqual(plan.staticChecks, ['check:knowledge', 'lint', 'format:check']);
  assert.equal(plan.typecheck, false);
  const executed = f.run('affected-check');
  assert.equal(executed.status, 0, executed.stderr);
  assert.match(executed.stdout, /passed/);
});

test('joint GEA checks receive the exact Workbench reader and hashed candidate bytes', (t) => {
  const f = fixture(
    t,
    {
      'scripts/tool.mjs': 'export const value = 2;',
      'tests/tool.test.mjs': 'import "../scripts/tool.mjs"; import "./profile.mjs";',
    },
    { repo: 'dsh-gea-plugin', sdk: true, jointAdmission: true },
  );
  const checked = f.run('affected-check');
  assert.equal(checked.status, 0, checked.stdout + checked.stderr);
  assert.equal(
    readFileSync(join(f.root, '.runtime/joint-admitted'), 'utf8'),
    realpathSync(f.repositories.find((entry) => entry.repo === 'dsh-agent-workbench').path),
  );
});

test('joint Workbench checks receive only arguments supported by its quality CLI', (t) => {
  const f = fixture(
    t,
    {
      'scripts/tool.mjs': 'export const value = 2;',
      'tests/tool.test.mjs': 'import "../scripts/tool.mjs"; import "../lib/generated.mjs";',
    },
    { sdk: true, jointAdmission: true },
  );
  const checked = f.run('affected-check');
  assert.equal(checked.status, 0, checked.stdout + checked.stderr);
  assert.equal(readFileSync(join(f.root, '.runtime/joint-admitted'), 'utf8'), 'workbench');
});

test('affected behavior failure blocks source checks without preparing unrelated inputs', (t) => {
  const f = fixture(t, { 'scripts/tool.mjs': 'export const value = 3;' });
  const executed = f.run('affected-check');
  assert.notEqual(executed.status, 0, executed.stdout + executed.stderr);
  assert.match(executed.stdout + executed.stderr, /BEHAVIOR_NOT_FIXED/);
});

test('unknown TypeScript source cannot receive a syntax-only green result', (t) => {
  const f = fixture(t, { 'src/unknown.ts': 'export const value: number = "wrong";' });
  const planned = f.run('affected-plan');
  assert.notEqual(planned.status, 0);
  assert.match(planned.stderr, /CI_TEST_IMPACT_UNMAPPED/);
});

test('source SDK verification selects the required CI Core instead of the local adaptation', (t) => {
  const f = fixture(t, { 'tsconfig.official.json': '{}' }, { sdk: true });
  const verified = f.run('affected-prepare');
  assert.notEqual(verified.status, 0);
  assert.match(verified.stderr, /SDK_SELECTED_CORE:6f88c3ea2d266ba1825d88bab10d92479a6ffde8/);
  assert.doesNotMatch(verified.stderr, /SDK_SELECTED_CORE:b{40}/);
});

test('source workflow Core selection executes the required policy from its cold peer input', (t) => {
  const f = fixture(t, { 'scripts/tool.mjs': 'export const value = 2;' }, { sdk: true });
  const workflow = readFileSync(
    new URL('../.github/workflows/source-quality.yml', import.meta.url),
    'utf8',
  );
  const command = workflow.match(/id: core\n\s*run: (.+)/)[1];
  const output = join(f.root, 'core-output');
  const selected = spawnSync('sh', ['-c', command], {
    cwd: f.root,
    encoding: 'utf8',
    env: { ...process.env, GITHUB_OUTPUT: output },
  });
  assert.equal(selected.status, 0, selected.stderr);
  assert.equal(readFileSync(output, 'utf8'), 'head=6f88c3ea2d266ba1825d88bab10d92479a6ffde8\n');
});

test('nonjoint GEA tool checks bind the verified Workbench source without preparing desktop tools', (t) => {
  const f = fixture(
    t,
    {
      'scripts/tool.mjs': 'export const value = 2;',
      'tests/tool.test.mjs':
        'import { value } from "../scripts/tool.mjs"; if(value !== 2) throw Error("BEHAVIOR_NOT_FIXED"); import { readFileSync, existsSync } from "node:fs"; if(readFileSync(new URL("../../dsh-agent-workbench/README.md", import.meta.url), "utf8") !== "fixture") throw Error("WORKBENCH_SOURCE_REQUIRED"); if(existsSync("desktop/download-differential.cjs")) throw Error("UNSELECTED_DESKTOP_BUILD");',
    },
    { repo: 'dsh-gea-plugin' },
  );
  const planned = f.run('affected-plan');
  assert.equal(planned.status, 0, planned.stderr);
  assert.equal(JSON.parse(planned.stdout).sdk, false);
  assert.equal(existsSync(join(f.root, '../dsh-agent-workbench')), false);
  const checked = f.run('affected-check');
  assert.equal(checked.status, 0, checked.stdout + checked.stderr);
  assert.equal(
    realpathSync(join(f.root, '../dsh-agent-workbench')),
    realpathSync(f.repositories[0].path),
  );
});

test('only the selected desktop packaging consumer prepares its small tools under the build budget before execution', (t) => {
  const f = fixture(
    t,
    {
      'scripts/package-desktop.test.mjs':
        'import { readFileSync } from "node:fs"; for(const file of ["download-differential.cjs", "core-asar-reader.cjs"]) if(readFileSync("desktop/" + file, "utf8") !== "built") throw Error("DESKTOP_TOOLS_REQUIRED"); if(readFileSync(".runtime/desktop-budget", "utf8") !== "released") throw Error("DESKTOP_BUDGET_NOT_RELEASED");',
    },
    { repo: 'dsh-gea-plugin', desktopTools: true },
  );
  const planned = f.run('affected-plan');
  assert.equal(planned.status, 0, planned.stderr);
  assert.equal(JSON.parse(planned.stdout).sdk, false);
  assert.equal(JSON.parse(planned.stdout).joint, false);
  assert.equal(JSON.parse(planned.stdout).dependencies, true);
  const checked = f.run('affected-check');
  assert.equal(checked.status, 0, checked.stdout + checked.stderr);
});

test('tool-only execution preserves the owner static commands and rejects their failures without Core', async (t) => {
  for (const staticFailure of [undefined, 'lint', 'format:check'])
    await t.test(staticFailure ?? 'success', (t) => {
      const f = fixture(
        t,
        { 'scripts/tool.mjs': 'export const value = 2;' },
        { tooling: true, staticFailure },
      );
      const planned = f.run('affected-plan');
      assert.equal(planned.status, 0, planned.stdout + planned.stderr);
      const plan = JSON.parse(planned.stdout);
      assert.deepEqual(plan.tools, ['oxfmt', 'oxlint']);
      assert.equal(plan.core, false);
      assert.equal(plan.sdk, false);
      const checked = f.run('affected-check');
      if (staticFailure) {
        assert.notEqual(checked.status, 0);
        assert.match(checked.stderr, /OWNER_STATIC_FAILURE/);
      } else assert.equal(checked.status, 0, checked.stdout + checked.stderr);
    });
});
