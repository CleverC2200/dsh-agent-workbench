import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';

const peers = {
  'dsh-agent-manage': '9e9aba86d12a2d743604e63a6000e7abb7da1ddd',
  'dsh-gea-plugin': 'b05ca162e1bf5ffb8443962a0b8b7e8ff8a61e96',
};
const coreCommit = '5badb15009ae1756c3afe0ae0cef1faafc290ccc';
const { values } = parseArgs({
  options: {
    phase: { type: 'string', default: 'quality' },
    input: { type: 'string' },
    root: { type: 'string' },
    sha: { type: 'string' },
    'core-source': { type: 'string' },
    'prepare-sdk': { type: 'boolean' },
    browser: { type: 'boolean' },
    'prepare-browser': { type: 'boolean' },
    'dealer-history': { type: 'string' },
    'personal-history': { type: 'string' },
    'dealer-source': { type: 'string' },
    'personal-source': { type: 'string' },
    'prepare-history': { type: 'boolean' },
  },
});
function refuse(code, detail) {
  throw Error(`${code}: ${detail}`);
}
function run(command, args, cwd = process.cwd()) {
  const windows = process.platform === 'win32' && ['npm', 'corepack'].includes(command);
  const result = spawnSync(windows ? `${command}.cmd` : command, args, {
    cwd,
    stdio: 'inherit',
    shell: windows,
  });
  if (result.error || result.status !== 0)
    refuse(
      'QUALITY_COMMAND_FAILED',
      `${command} exited ${result.status}: ${result.error?.message ?? ''}`,
    );
}
try {
  if (values.phase === 'scope') {
    if (process.env.QUALITY_SCOPE_ALLOWED !== 'true')
      refuse('CANDIDATE_SCOPE_REQUIRED', 'same-repository read-only event required');
  } else if (values.phase === 'final') {
    for (const key of ['QUALITY_SCOPE_RESULT', 'QUALITY_GATE_RESULT']) {
      if (process.env[key] !== 'success')
        refuse('QUALITY_REQUIRED', `${key}=${process.env[key] ?? 'missing'}`);
    }
  } else if (values.phase === 'input') {
    if (!values.root || !/^[a-f0-9]{40}$/.test(values.sha ?? ''))
      refuse('CANDIDATE_EVENT_REQUIRED', '--root and actual event --sha');
    writeFileSync(
      resolve(values.root, 'candidate-input.json'),
      JSON.stringify(
        {
          core: coreCommit,
          repositories: [
            {
              repo: 'dsh-agent-workbench',
              path: resolve(values.root, 'candidate/dsh-agent-workbench'),
              head: values.sha,
            },
            ...Object.entries(peers).map(([repo, head]) => ({
              repo,
              path: resolve(values.root, 'candidate', repo),
              head,
            })),
          ],
        },
        null,
        2,
      ) + '\n',
    );
  } else {
    if (values.phase !== 'quality') refuse('QUALITY_PHASE_REQUIRED', values.phase);
    const input = values.input ?? process.env.QUALITY_CANDIDATE;
    if (!input) refuse('CANDIDATE_INPUT_REQUIRED', '--input <frozen group JSON>');
    const manifest = JSON.parse(readFileSync(resolve(input), 'utf8'));
    if (manifest.core !== coreCommit || manifest.repositories?.length !== 3)
      refuse('CANDIDATE_PEER_REQUIRED', 'fixed Core and exactly three repositories');
    const own = manifest.repositories.find((entry) => entry.repo === 'dsh-agent-workbench');
    if (!own || resolve(own.path) !== process.cwd())
      refuse('CANDIDATE_CHECKOUT', 'registered Workbench checkout required');
    if (process.env.CI && !process.env.QUALITY_EXPECTED_SHA)
      refuse('CANDIDATE_EVENT_REQUIRED', 'actual event SHA');
    if (process.env.QUALITY_EXPECTED_SHA && own.head !== process.env.QUALITY_EXPECTED_SHA)
      refuse('CANDIDATE_EVENT_MISMATCH', own.head);
    // Check source scope before SDK preparation. Final public admission also checks all official type targets.
    for (const repo of ['dsh-agent-workbench', ...Object.keys(peers)]) {
      const entries = manifest.repositories.filter((entry) => entry.repo === repo);
      if (entries.length !== 1) refuse('CANDIDATE_PEER_REQUIRED', repo);
      const entry = entries[0];
      const git = (...args) =>
        execFileSync('git', ['-C', entry.path, ...args], { encoding: 'utf8' }).trim();
      if (git('rev-parse', 'HEAD') !== entry.head || (peers[repo] && entry.head !== peers[repo]))
        refuse('CANDIDATE_HEAD', repo);
      if (git('rev-parse', '--is-shallow-repository') !== 'false')
        refuse('CANDIDATE_HISTORY_REQUIRED', repo);
      if (git('status', '--porcelain', '--untracked-files=all')) refuse('CANDIDATE_DIRTY', repo);
      const lock = repo === 'dsh-agent-workbench' ? 'package-lock.json' : 'pnpm-lock.yaml';
      if (
        !execFileSync('git', ['-C', entry.path, 'show', `HEAD:${lock}`]).equals(
          readFileSync(resolve(entry.path, lock)),
        )
      )
        refuse('CANDIDATE_LOCK', repo);
    }
    const sourceSnapshot = manifest.repositories.map((entry) => ({
      repo: entry.repo,
      root: entry.path,
      head: entry.head,
      tree: execFileSync('git', ['-C', entry.path, 'rev-parse', 'HEAD^{tree}'], {
        encoding: 'utf8',
      }).trim(),
      lock: createHash('sha256')
        .update(
          readFileSync(
            resolve(
              entry.path,
              entry.repo === 'dsh-agent-workbench' ? 'package-lock.json' : 'pnpm-lock.yaml',
            ),
          ),
        )
        .digest('hex'),
      cleanAtAdmission: true,
    }));
    const sourceReceipt = resolve(dirname(resolve(input)), `quality-source-${own.head}.json`);
    writeFileSync(
      sourceReceipt,
      JSON.stringify(
        {
          capturedAt: new Date().toISOString(),
          phase: 'source-before-preparation',
          sourceSnapshot,
        },
        null,
        2,
      ) + '\n',
      { flag: 'wx' },
    );
    for (const [name, ref] of Object.entries({
      dealer: '67e1007aa400a8a9c65c132f144dabd5168a49df',
      personal: '15def488134527647a819812a4b6657ecf9772fe',
    })) {
      const env = `WORKBENCH_${name.toUpperCase()}_HISTORY_ROOT`;
      let history = values[`${name}-history`] ?? process.env[env];
      if (values['prepare-history']) {
        if (history) refuse('HISTORY_READONLY', 'cannot prepare a declared read-only history root');
        const source =
          values[`${name}-source`] ??
          process.env[`PLUGIN_SPLIT_${name.toUpperCase()}_HISTORY_SOURCE`];
        if (!source)
          refuse(
            'HISTORY_SOURCE_REQUIRED',
            `${name}: explicit original Git URL or local Git source required`,
          );
        history = resolve(dirname(dirname(own.path)), 'history', name);
        run('git', ['clone', '--no-checkout', '--no-hardlinks', source, history]);
      }
      if (!history) refuse('HISTORY_INPUT_REQUIRED', `${env}: fixed original Git source required`);
      execFileSync('git', ['-C', resolve(history), 'cat-file', '-e', `${ref}:source`]);
      process.env[env] = resolve(history);
    }
    const manage = manifest.repositories.find((entry) => entry.repo === 'dsh-agent-manage');
    const sdk = await import(
      pathToFileURL(resolve(manage.path, 'scripts/prepare-official-sdk.mjs'))
    );
    const options = {
      core: resolve(dirname(dirname(process.cwd())), 'official-latest-standard'),
      consumer: process.cwd(),
      source: values['core-source'],
      withFlock: true,
    };
    if (values['prepare-sdk']) sdk.prepareOfficialSDK(options);
    else sdk.verifyOfficialSDK(options);
    run(process.execPath, [
      'scripts/verify-candidate-input.mjs',
      '--input',
      resolve(input),
      '--checkout',
      process.cwd(),
    ]);
    if (
      Number(process.versions.node.split('.')[0]) !== 24 ||
      execFileSync('npm', ['--version'], { encoding: 'utf8' }).trim() !== '11.11.0'
    )
      refuse('QUALITY_TOOLCHAIN_REQUIRED', 'Node 24 / npm 11.11.0');
    run('npm', ['ci', '--ignore-scripts', '--prefer-offline', '--no-audit', '--no-fund']);
    run(
      'corepack',
      ['pnpm', 'install', '--frozen-lockfile', '--ignore-scripts', '--prefer-offline'],
      manage.path,
    );
    run(
      'corepack',
      ['pnpm', 'install', '--frozen-lockfile', '--ignore-scripts', '--prefer-offline'],
      manifest.repositories.find((entry) => entry.repo === 'dsh-gea-plugin').path,
    );
    const leaf = resolve('business/inventory-fc/source/inventory-light-plugins');
    run(
      'corepack',
      ['pnpm', 'install', '--frozen-lockfile', '--ignore-scripts', '--prefer-offline'],
      leaf,
    );
    run('npm', ['run', 'quality:fast']);
    run(
      'npm',
      ['ci', '--ignore-scripts', '--prefer-offline', '--no-audit', '--no-fund'],
      resolve('business/inventory-apsplan/source'),
    );
    const previousTypecheck = process.env.DSH_TYPECHECK_PROJECT;
    process.env.DSH_TYPECHECK_PROJECT = 'tsconfig.official.json';
    try {
      run('npm', ['run', 'build:core']);
    } finally {
      if (previousTypecheck === undefined) delete process.env.DSH_TYPECHECK_PROJECT;
      else process.env.DSH_TYPECHECK_PROJECT = previousTypecheck;
    }
    run('npm', ['test']);
    if (values['prepare-browser'] && !values.browser)
      refuse('QUALITY_BROWSER_REQUIRED', '--prepare-browser requires --browser');
    if (values.browser) {
      if (values['prepare-browser'])
        run('npm', ['exec', '--', 'playwright', 'install', '--with-deps', 'chromium']);
      run('npm', ['run', 'test:browser']);
    }
    const changed = [
      ...execFileSync('git', ['diff', 'HEAD', '--name-only', '-z'], { encoding: 'utf8' }).split(
        '\0',
      ),
      ...execFileSync('git', ['ls-files', '--others', '--exclude-standard', '-z'], {
        encoding: 'utf8',
      }).split('\0'),
    ].filter(Boolean);
    const generated = [
      'static/category/index.html',
      'static/mps/index.html',
      'static/regional/index.html',
    ];
    const derived = (path) => path.startsWith('lib/') || generated.includes(path);
    if (changed.some((path) => !derived(path)))
      refuse('QUALITY_SOURCE_CHANGED', changed.filter((path) => !derived(path)).join(', '));
    for (const entry of manifest.repositories) {
      if (
        execFileSync('git', ['-C', entry.path, 'rev-parse', 'HEAD'], {
          encoding: 'utf8',
        }).trim() !== entry.head
      )
        refuse('QUALITY_SOURCE_HEAD_CHANGED', entry.repo);
      if (
        entry.repo !== own.repo &&
        execFileSync('git', ['-C', entry.path, 'status', '--porcelain', '--untracked-files=all'], {
          encoding: 'utf8',
        }).trim()
      )
        refuse('QUALITY_PEER_SOURCE_CHANGED', entry.repo);
    }
    sdk.verifyOfficialSDK(options);
    const artifacts = {};
    function collect(directory) {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = resolve(directory, entry.name);
        if (entry.isDirectory()) collect(path);
        else if (entry.isFile())
          artifacts[path.slice(process.cwd().length + 1)] = createHash('sha256')
            .update(readFileSync(path))
            .digest('hex');
        else refuse('QUALITY_ARTIFACT_TYPE', path);
      }
    }
    collect(resolve('lib'));
    for (const file of generated)
      artifacts[file] = createHash('sha256').update(readFileSync(file)).digest('hex');
    writeFileSync(
      resolve(dirname(resolve(input)), 'quality-prepared.json'),
      JSON.stringify(
        {
          source: {
            head: own.head,
            admittedCleanBeforePreparation: true,
            unchangedAfterPreparation: true,
            receipt: sourceReceipt,
            receiptSha256: createHash('sha256').update(readFileSync(sourceReceipt)).digest('hex'),
          },
          prepared: {
            root: process.cwd(),
            derivedPaths: ['lib/', ...generated],
            changedTrackedPaths: changed,
            hashes: artifacts,
          },
          runtime: 'not-observed',
        },
        null,
        2,
      ) + '\n',
    );
  }
  console.log(JSON.stringify({ status: 'passed', phase: values.phase, runtime: 'not-observed' }));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
