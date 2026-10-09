import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';

const command = (cwd, executable, args) => {
  const result = spawnSync(executable, args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  return result.stdout.trim();
};
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

test('public final-group admission binds real source only and rejects invalid inputs before preparation', async () => {
  const fixture = mkdtempSync(join(tmpdir(), 'workbench-final-group-'));
  try {
    const roots = Object.fromEntries(
      ['dsh-agent-workbench', 'dsh-agent-manage', 'dsh-gea-plugin'].map((name) => [
        name,
        join(fixture, 'candidate', name),
      ]),
    );
    const officialMap = JSON.parse(readFileSync('tsconfig.official.json')).compilerOptions.paths;
    const coreSource = resolve(
      dirname(resolve(officialMap['@deepseek-ai/cordis'][0])),
      '../../../..',
    );
    const coldCore = join(fixture, 'cold-core-source');
    command(fixture, 'git', [
      'clone',
      '--quiet',
      '--no-hardlinks',
      '--no-checkout',
      coreSource,
      coldCore,
    ]);
    command(coldCore, 'git', [
      'sparse-checkout',
      'set',
      '--no-cone',
      '/package.json',
      '/pnpm-lock.yaml',
    ]);
    command(coldCore, 'git', ['checkout', '--quiet', '5badb15009ae1756c3afe0ae0cef1faafc290ccc']);
    assert.equal(existsSync(join(coldCore, 'vendor/cordis/lib/types/index.d.ts')), false);
    for (const [name, root] of Object.entries(roots)) {
      mkdirSync(join(root, 'scripts'), { recursive: true });
      if (name === 'dsh-gea-plugin') {
        writeFileSync(
          join(root, 'package.json'),
          JSON.stringify({ name: '@cleverc2200/gea-dsh-prototype' }),
        );
        writeFileSync(join(root, 'pnpm-lock.yaml'), 'lockfileVersion: 9.0\n');
      } else {
        const source =
          name === 'dsh-agent-workbench' ? process.cwd() : resolve('../dsh-agent-manage');
        for (const file of [
          'package.json',
          name === 'dsh-agent-workbench' ? 'package-lock.json' : 'pnpm-lock.yaml',
        ])
          cpSync(join(source, file), join(root, file));
        const scripts =
          name === 'dsh-agent-workbench'
            ? [
                'run-quality-ci.mjs',
                'candidate-input.mjs',
                'verify-candidate-input.mjs',
                'verify-official-input.mjs',
              ]
            : ['run-quality-ci.mjs', 'prepare-official-sdk.mjs'];
        for (const file of scripts)
          cpSync(join(source, 'scripts', file), join(root, 'scripts', file));
        if (name === 'dsh-agent-workbench')
          cpSync('tsconfig.official.json', join(root, 'tsconfig.official.json'));
      }
      command(root, 'git', ['init', '--quiet']);
      command(root, 'git', ['add', '.']);
      command(root, 'git', [
        '-c',
        'user.name=Fixture',
        '-c',
        'user.email=fixture@example.invalid',
        'commit',
        '--quiet',
        '-m',
        'fixed source fixture',
      ]);
    }
    const manifest = {
      core: '5badb15009ae1756c3afe0ae0cef1faafc290ccc',
      repositories: Object.entries(roots).map(([repo, path]) => ({
        repo,
        path: realpathSync(path),
        head: command(path, 'git', ['rev-parse', 'HEAD']),
      })),
    };
    const file = join(fixture, 'group.json');
    const bytes = Buffer.from(JSON.stringify(manifest, null, 2) + '\n');
    writeFileSync(file, bytes);
    const sha256 = hash(bytes);
    const run = (name, extra = [], env = {}) => {
      const environment = { ...process.env, ...env };
      if (!Object.hasOwn(env, 'CI')) delete environment.CI;
      if (!Object.hasOwn(env, 'QUALITY_EXPECTED_SHA')) delete environment.QUALITY_EXPECTED_SHA;
      return spawnSync(
        process.execPath,
        [
          'scripts/run-quality-ci.mjs',
          '--phase',
          'verify-input',
          '--input',
          file,
          '--final-group-sha256',
          hash(readFileSync(file)),
          '--core-source',
          coldCore,
          ...extra,
        ],
        { cwd: roots[name], encoding: 'utf8', env: environment },
      );
    };
    for (const name of ['dsh-agent-workbench', 'dsh-agent-manage']) {
      const good = run(name, ['--prepare-sdk']);
      assert.equal(good.status, 0, good.stdout + good.stderr);
      const receipt = JSON.parse(good.stdout.trim());
      assert.equal(receipt.stage, 'candidate-source-only');
      assert.equal(receipt.official.commit, manifest.core);
      assert.equal(receipt.inputSha256, sha256);
      assert.equal(receipt.quality, 'not-observed');
      assert.deepEqual(readFileSync(file), bytes);
      assert.equal(existsSync(join(fixture, 'official-latest-standard')), false);
      assert.equal(existsSync(join(roots[name], 'node_modules')), false);
      const reject = (result, pattern) => {
        assert.notEqual(result.status, 0, result.stdout + result.stderr);
        assert.match(result.stdout + result.stderr, pattern);
        assert.equal(existsSync(join(fixture, 'official-latest-standard')), false);
      };
      reject(run(name, ['--final-group-sha256', '']), /CANDIDATE_FINAL_GROUP_REQUIRED/);
      reject(run(name, ['--unknown-final-parameter']), /Unknown option/);
      reject(run(name, ['--final-group-sha256']), /ERR_PARSE_ARGS_INVALID_OPTION_VALUE/);
      reject(run(name, ['--final-group-sha256', '0'.repeat(64)]), /CANDIDATE_INPUT_HASH/);
      reject(run(name, [], { CI: 'true' }), /CANDIDATE_EVENT_REQUIRED/);
      reject(run(name, [], { QUALITY_EXPECTED_SHA: 'a'.repeat(40) }), /CANDIDATE_EVENT_MISMATCH/);
      for (const [mutate, pattern] of [
        [
          (x) => {
            x.core = 'a'.repeat(40);
          },
          /CANDIDATE_CORE/,
        ],
        [
          (x) => {
            x.repositories[1].repo = x.repositories[0].repo;
          },
          /CANDIDATE_PEER_REQUIRED/,
        ],
        [
          (x) => {
            x.repositories[1].repo = 'unknown-plugin';
          },
          /CANDIDATE_PEER_REQUIRED/,
        ],
        [
          (x) => {
            x.repositories[1].path = x.repositories[0].path;
          },
          /CANDIDATE_PATH_COLLISION/,
        ],
        [
          (x) => {
            x.repositories[2].head = 'a'.repeat(40);
          },
          /CANDIDATE_HEAD/,
        ],
      ]) {
        const changed = JSON.parse(bytes);
        mutate(changed);
        writeFileSync(file, JSON.stringify(changed));
        reject(run(name), pattern);
        writeFileSync(file, bytes);
      }
      const compatibility = spawnSync(
        process.execPath,
        ['scripts/run-quality-ci.mjs', '--input', file],
        {
          cwd: roots[name],
          encoding: 'utf8',
          env: { ...process.env, CI: '', QUALITY_EXPECTED_SHA: '' },
        },
      );
      reject(compatibility, /CANDIDATE_HEAD/);
      command(coldCore, 'git', [
        '-c',
        'user.name=Fixture',
        '-c',
        'user.email=fixture@example.invalid',
        'commit',
        '--quiet',
        '--allow-empty',
        '-m',
        'wrong Core source',
      ]);
      reject(run(name), /SDK_CORE_MISMATCH/);
      command(coldCore, 'git', ['update-ref', 'HEAD', manifest.core]);
      const coreLock = readFileSync(join(coldCore, 'pnpm-lock.yaml'));
      writeFileSync(join(coldCore, 'pnpm-lock.yaml'), coreLock + '# altered original lock\n');
      reject(run(name), /SDK_LOCK_MISMATCH/);
      writeFileSync(join(coldCore, 'pnpm-lock.yaml'), coreLock);
      writeFileSync(join(coldCore, 'wrong-source.txt'), 'dirty Core source\n');
      reject(run(name), /SDK_DIRTY_SOURCE/);
      rmSync(join(coldCore, 'wrong-source.txt'));
      const peer = roots['dsh-gea-plugin'];
      writeFileSync(join(peer, 'uncommitted.txt'), 'dirty source\n');
      reject(run(name), /CANDIDATE_DIRTY/);
      rmSync(join(peer, 'uncommitted.txt'));
      const lock = readFileSync(join(peer, 'pnpm-lock.yaml'));
      writeFileSync(join(peer, 'pnpm-lock.yaml'), lock + '# changed\n');
      reject(run(name), /CANDIDATE_LOCK/);
      writeFileSync(join(peer, 'pnpm-lock.yaml'), lock);
      const shallow = join(peer, '.git/shallow');
      writeFileSync(shallow, manifest.repositories[2].head + '\n');
      reject(run(name), /CANDIDATE_HISTORY_REQUIRED/);
      rmSync(shallow);
    }
    // The same public reader returns the byte guard used before each quality effect.
    const { readFinalGroup } = await import(
      pathToFileURL(join(roots['dsh-agent-workbench'], 'scripts/candidate-input.mjs'))
    );
    const admitted = await readFinalGroup({
      input: file,
      sha256,
      checkout: roots['dsh-agent-workbench'],
      repo: 'dsh-agent-workbench',
      coreSource: coldCore,
    });
    writeFileSync(file, Buffer.concat([bytes, Buffer.from(' ')]));
    assert.throws(() => admitted.verifyUnchanged(), /CANDIDATE_INPUT_CHANGED/);
    writeFileSync(file, bytes);
    const full = spawnSync(
      process.execPath,
      [
        'scripts/verify-candidate-input.mjs',
        '--input',
        file,
        '--checkout',
        roots['dsh-agent-workbench'],
        '--final-group-sha256',
        sha256,
        '--core-source',
        coldCore,
      ],
      { cwd: roots['dsh-agent-workbench'], encoding: 'utf8' },
    );
    assert.notEqual(full.status, 0);
    assert.match(full.stderr, /CANDIDATE_CORE_SOURCE_REQUIRED|OFFICIAL_MATERIAL_REQUIRED/);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});
