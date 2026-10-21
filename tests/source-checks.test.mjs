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
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';

const runner = new URL('../scripts/source-checks.mjs', import.meta.url).href;
function fixture(
  t,
  changed,
  { sdk = false, repo: owner = 'dsh-agent-workbench', desktopTools = false } = {},
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
      owner === 'dsh-gea-plugin'
        ? join(parent, repo === 'dsh-agent-workbench' ? 'source' : 'candidate', repo)
        : join(parent, repo);
    mkdirSync(path, { recursive: true });
    git(path, 'init', '-q');
    put(path, 'README.md', 'fixture');
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
        `export function verifyOfficialSDK({coreHead}) { throw Error('SDK_SELECTED_CORE:' + coreHead); }`,
      );
    return { repo, path, head: commit(path) };
  });
  const root = repositories.find((entry) => entry.repo === owner).path;
  put(
    root,
    'scripts/quality-peer-baseline.json',
    JSON.stringify({
      schemaVersion: 1,
      repositories: repositories.map(({ repo, head }) => ({ repo, head })),
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
  delete env.NODE_TEST_CONTEXT;
  const run = (phase) =>
    spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `import {sourceChecks} from ${JSON.stringify(runner)}; await sourceChecks(${JSON.stringify(result)}, ${JSON.stringify(phase)});`,
      ],
      { cwd: root, encoding: 'utf8', env },
    );
  return { root, run, repositories };
}

test('a tool-only source change runs its behavior test cold and excludes unrelated required suites', (t) => {
  const f = fixture(t, { 'scripts/tool.mjs': 'export const value = 2;' });
  const planned = f.run('affected-plan');
  assert.equal(planned.status, 0, planned.stderr);
  const plan = JSON.parse(planned.stdout);
  assert.deepEqual(plan.files, ['tests/tool.test.mjs']);
  assert.equal(plan.sdk, false);
  assert.equal(plan.dependencies, false);
  assert.equal(plan.typecheck, false);
  const executed = f.run('affected-check');
  assert.equal(executed.status, 0, executed.stderr);
  assert.match(executed.stdout, /passed/);
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
