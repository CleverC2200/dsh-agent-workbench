import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
  realpathSync,
  symlinkSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';

const root = resolve(import.meta.dirname, '..');
const cli = resolve(root, 'scripts/verify-candidate-input.mjs');
const repos = ['dsh-agent-workbench', 'dsh-agent-manage', 'dsh-gea-plugin'];
const packageNames = [
  '@cleverc2200/dsh-agent-workbench',
  'dsh-agent-manage',
  '@cleverc2200/gea-dsh-prototype',
];
function git(path, ...args) {
  const result = spawnSync('git', ['-C', path, ...args], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}
function fixture(t, officialPath) {
  const directory = mkdtempSync(resolve(tmpdir(), 'agent-input-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const config = JSON.parse(readFileSync(resolve(root, 'tsconfig.official.json'), 'utf8'));
  const cordis = realpathSync(
    resolve(root, config.compilerOptions.paths['@deepseek-ai/cordis'][0]),
  );
  const official = officialPath ?? resolve(cordis, '../../../../..');
  symlinkSync(official, resolve(directory, 'official-latest-standard'));
  const manifest = { core: git(official, 'rev-parse', 'HEAD'), repositories: [] };
  for (const repo of repos) {
    const checkout = resolve(directory, 'candidate', repo);
    mkdirSync(checkout, { recursive: true });
    writeFileSync(
      resolve(checkout, 'package.json'),
      JSON.stringify({
        name: packageNames[repos.indexOf(repo)],
        packageManager: repo === repos[0] ? 'npm@11.11.0' : 'pnpm@10.16.0',
      }),
    );
    writeFileSync(
      resolve(checkout, repo === repos[0] ? 'package-lock.json' : 'pnpm-lock.yaml'),
      'fixture lock\n',
    );
    if (repo === repos[0])
      writeFileSync(
        resolve(checkout, 'tsconfig.official.json'),
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
    git(checkout, 'init', '-q');
    git(checkout, 'add', '.');
    git(
      checkout,
      '-c',
      'user.name=Fixture',
      '-c',
      'user.email=fixture@example.invalid',
      'commit',
      '-qm',
      'known local inputs',
    );
    manifest.repositories.push({ repo, path: checkout, head: git(checkout, 'rev-parse', 'HEAD') });
  }
  const input = resolve(directory, 'integration-set.json');
  const run = (checkout = manifest.repositories[0].path, finalGroup = false) => {
    writeFileSync(input, JSON.stringify(manifest));
    return spawnSync(
      process.execPath,
      [
        cli,
        '--input',
        input,
        '--checkout',
        checkout,
        ...(finalGroup
          ? ['--final-group-sha256', createHash('sha256').update(readFileSync(input)).digest('hex')]
          : []),
      ],
      {
        cwd: directory,
        encoding: 'utf8',
      },
    );
  };
  return { directory, manifest, run };
}
function rejected(result, diagnostic) {
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, diagnostic);
}

test('a historical checkout is refused before inspecting candidate inputs', (t) => {
  const { directory, run } = fixture(t);
  rejected(run(resolve(directory, 'historical/dsh-agent-workbench')), /CANDIDATE_CHECKOUT/);
});

test('a clean registered combination reports candidate scope and exact observed inputs', (t) => {
  const { manifest, run } = fixture(t);
  const result = run();
  assert.equal(result.status, 0, result.stderr);
  const receipt = JSON.parse(result.stdout);
  assert.equal(receipt.stage, 'candidate-input');
  assert.equal(receipt.status, 'passed');
  assert.equal(receipt.runtime, 'not-observed');
  assert.deepEqual(
    receipt.repositories.map(({ repo, head }) => ({ repo, head })),
    manifest.repositories.map(({ repo, head }) => ({ repo, head })),
  );
});

test('a clean candidate binds the selected registered official declaration source', (t) => {
  const official =
    process.env.DSH_RC2_CORE_CHECKOUT ?? resolve(root, '../../official-latest-standard');
  const { manifest, run } = fixture(t, official);
  assert.equal(
    manifest.core,
    process.env.DSH_RC2_CORE_CHECKOUT
      ? '639ed015397290b3745d163aafe02ffee4aa3f84'
      : (process.env.QUALITY_CORE_HEAD ?? '5badb15009ae1756c3afe0ae0cef1faafc290ccc'),
  );
  const result = run();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).core, manifest.core);
});

test('swapped Manage and GEA checkouts are refused even when each declared head matches', (t) => {
  const { manifest, run } = fixture(t);
  const manage = manifest.repositories[1];
  const gea = manifest.repositories[2];
  [manage.path, gea.path] = [gea.path, manage.path];
  [manage.head, gea.head] = [gea.head, manage.head];
  rejected(
    run(),
    /CANDIDATE_PACKAGE_IDENTITY.*dsh-agent-manage.*dsh-agent-manage.*@cleverc2200\/gea-dsh-prototype/,
  );
});

for (const [index, repo] of repos.entries()) {
  test(`${repo} is refused when its committed package name identifies another plugin`, (t) => {
    const { manifest, run } = fixture(t);
    const peer = manifest.repositories[index];
    const file = resolve(peer.path, 'package.json');
    const pkg = JSON.parse(readFileSync(file, 'utf8'));
    pkg.name = 'unrelated-plugin';
    writeFileSync(file, JSON.stringify(pkg));
    git(peer.path, 'add', 'package.json');
    git(
      peer.path,
      '-c',
      'user.name=Fixture',
      '-c',
      'user.email=fixture@example.invalid',
      'commit',
      '-qm',
      'incorrect package identity',
    );
    peer.head = git(peer.path, 'rev-parse', 'HEAD');
    const result = run();
    rejected(result, /CANDIDATE_PACKAGE_IDENTITY/);
    assert.ok(
      result.stderr.includes(
        `${repo} expects package.json.name=${packageNames[index]}; observed "unrelated-plugin"`,
      ),
      result.stderr,
    );
    assert.equal(readFileSync(file, 'utf8'), JSON.stringify(pkg));
    assert.equal(git(peer.path, 'status', '--porcelain'), '');
  });
}

test('a peer at a different commit is refused and its files stay untouched', (t) => {
  const { manifest, run } = fixture(t);
  const peer = manifest.repositories[1];
  const before = git(peer.path, 'status', '--porcelain');
  peer.head = '0'.repeat(40);
  rejected(run(), /CANDIDATE_HEAD.*dsh-agent-manage/);
  assert.equal(git(peer.path, 'status', '--porcelain'), before);
});

test('tracked and untracked peer changes are refused without clearing either change', (t) => {
  const { manifest, run } = fixture(t);
  const peer = manifest.repositories[1];
  const lock = resolve(peer.path, 'pnpm-lock.yaml');
  writeFileSync(lock, 'changed lock\n');
  rejected(run(), /CANDIDATE_DIRTY.*dsh-agent-manage/);
  assert.equal(readFileSync(lock, 'utf8'), 'changed lock\n');
  writeFileSync(lock, 'fixture lock\n');
  const source = resolve(peer.path, 'new-source.ts');
  writeFileSync(source, 'export const changed = true;\n');
  rejected(run(), /CANDIDATE_DIRTY.*dsh-agent-manage/);
  assert.equal(readFileSync(source, 'utf8'), 'export const changed = true;\n');
});

test('missing peer registration cannot turn a partial checkout into a complete candidate', (t) => {
  const { manifest, run } = fixture(t);
  manifest.repositories.pop();
  rejected(run(), /CANDIDATE_PEER_REQUIRED.*dsh-gea-plugin/);
});

test('a peer committed without its frozen lock is refused', (t) => {
  const { manifest, run } = fixture(t);
  const peer = manifest.repositories[1];
  git(peer.path, 'rm', 'pnpm-lock.yaml');
  git(
    peer.path,
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.invalid',
    'commit',
    '-qm',
    'missing lock',
  );
  peer.head = git(peer.path, 'rev-parse', 'HEAD');
  rejected(run(), /CANDIDATE_MATERIAL_REQUIRED.*dsh-agent-manage.*pnpm-lock.yaml/);
});

test('missing official configuration returns an input diagnostic instead of an filesystem error', (t) => {
  const { manifest, run } = fixture(t);
  const workbench = manifest.repositories[0];
  git(workbench.path, 'rm', 'tsconfig.official.json');
  git(
    workbench.path,
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.invalid',
    'commit',
    '-qm',
    'missing official config',
  );
  workbench.head = git(workbench.path, 'rev-parse', 'HEAD');
  rejected(run(), /OFFICIAL_MATERIAL_REQUIRED.*tsconfig.official.json/);
});

test('an absent SDK declaration is refused with its declared path', (t) => {
  const { manifest, run } = fixture(t);
  const workbench = manifest.repositories[0];
  const file = resolve(workbench.path, 'tsconfig.official.json');
  const config = JSON.parse(readFileSync(file, 'utf8'));
  config.compilerOptions.paths['@deepseek-ai/dsh-session'] = [
    '../../official-latest-standard/missing/lib/types/index.d.ts',
  ];
  writeFileSync(file, JSON.stringify(config));
  git(workbench.path, 'add', '.');
  git(
    workbench.path,
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.invalid',
    'commit',
    '-qm',
    'missing SDK declaration',
  );
  workbench.head = git(workbench.path, 'rev-parse', 'HEAD');
  rejected(run(), /OFFICIAL_MATERIAL_REQUIRED.*dsh-session/);
});

test('a locally committed substitute Core cannot satisfy the official baseline', (t) => {
  const { directory, run } = fixture(t);
  const core = resolve(directory, 'wrong-core');
  mkdirSync(resolve(core, 'vendor/cordis/lib/types'), { recursive: true });
  writeFileSync(resolve(core, 'vendor/cordis/lib/types/index.d.ts'), 'export {};\n');
  git(core, 'init', '-q');
  git(core, 'add', '.');
  git(
    core,
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.invalid',
    'commit',
    '-qm',
    'wrong Core',
  );
  rmSync(resolve(directory, 'official-latest-standard'));
  symlinkSync(core, resolve(directory, 'official-latest-standard'));
  const before = git(core, 'status', '--porcelain');
  rejected(run(), /OFFICIAL_INPUT_REQUIRED/);
  assert.equal(git(core, 'status', '--porcelain'), before);
});

test('missing input binding is refused before reading or modifying any checkout', () => {
  const result = spawnSync(process.execPath, [cli], { cwd: root, encoding: 'utf8' });
  rejected(result, /CANDIDATE_INPUT_REQUIRED/);
});

test('the frozen set cannot declare a different Core while loading the fixed SDK', (t) => {
  const { manifest, run } = fixture(t);
  manifest.core = '0'.repeat(40);
  rejected(run(), /CANDIDATE_CORE/);
});

test('an ignored uncommitted lock cannot replace frozen input material', (t) => {
  const { manifest, run } = fixture(t);
  const peer = manifest.repositories[1];
  git(peer.path, 'rm', 'pnpm-lock.yaml');
  writeFileSync(resolve(peer.path, '.gitignore'), 'pnpm-lock.yaml\n');
  git(peer.path, 'add', '.');
  git(
    peer.path,
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.invalid',
    'commit',
    '-qm',
    'ignored lock',
  );
  peer.head = git(peer.path, 'rev-parse', 'HEAD');
  writeFileSync(resolve(peer.path, 'pnpm-lock.yaml'), 'unbound lock\n');
  rejected(run(), /CANDIDATE_LOCK.*dsh-agent-manage/);
});

test('a registered peer whose checkout is absent is refused with the peer name', (t) => {
  const { manifest, run } = fixture(t);
  rmSync(manifest.repositories[2].path, { recursive: true });
  rejected(run(), /CANDIDATE_PEER_REQUIRED.*dsh-gea-plugin/);
});

test('an absent official SDK is refused with an official material diagnostic', (t) => {
  const { directory, run } = fixture(t);
  rmSync(resolve(directory, 'official-latest-standard'));
  rejected(run(), /OFFICIAL_MATERIAL_REQUIRED.*cordis/);
});

for (const wrongName of [false, true])
  test(`explicit frozen input refuses historical package identity error ${wrongName ? 'name' : 'roles'}`, (t) => {
    const { manifest, run } = fixture(t);
    if (wrongName) {
      const peer = manifest.repositories[2];
      const file = resolve(peer.path, 'package.json');
      const pkg = JSON.parse(readFileSync(file));
      pkg.name = '@cleverc2200/gea-dsh-prototype-wrong';
      writeFileSync(file, JSON.stringify(pkg));
      git(peer.path, 'add', 'package.json');
      git(
        peer.path,
        '-c',
        'user.name=Fixture',
        '-c',
        'user.email=fixture@example.invalid',
        'commit',
        '-qm',
        'historical wrong package name',
      );
      peer.head = git(peer.path, 'rev-parse', 'HEAD');
    } else {
      const manage = manifest.repositories[1],
        gea = manifest.repositories[2];
      [manage.path, gea.path] = [gea.path, manage.path];
      [manage.head, gea.head] = [gea.head, manage.head];
    }
    rejected(run(undefined, true), /CANDIDATE_PACKAGE_IDENTITY/);
  });
