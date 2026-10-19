import { runQualityChecks } from './run-quality-checks.mjs';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { readFinalGroup } from './candidate-input.mjs';

const { values } = parseArgs({
  options: {
    phase: { type: 'string', default: 'quality' },
    input: { type: 'string' },
    root: { type: 'string' },
    sha: { type: 'string' },
    'core-source': { type: 'string' },
    'core-head': { type: 'string' },
    'prepare-sdk': { type: 'boolean' },
    browser: { type: 'boolean' },
    'prepare-browser': { type: 'boolean' },
    'dealer-history': { type: 'string' },
    'personal-history': { type: 'string' },
    'final-group-sha256': { type: 'string' },
  },
});
let finalGroup;
function refuse(code, detail) {
  throw Error(`${code}: ${detail}`);
}
function run(command, args, cwd = process.cwd()) {
  finalGroup.verifyUnchanged();
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
  if (values['final-group-sha256'] !== undefined) {
    if (
      values['final-group-sha256'].length !== 64 ||
      !/^[a-f0-9]{64}$/.test(values['final-group-sha256'])
    )
      refuse('CANDIDATE_FINAL_GROUP_REQUIRED', 'original bytes SHA256 required');
    if (!['quality', 'business-profile', 'verify-input'].includes(values.phase))
      refuse('CANDIDATE_FINAL_GROUP_PHASE', values.phase);
  }
  if (values.phase === 'scope') {
    if (process.env.QUALITY_SCOPE_ALLOWED !== 'true')
      refuse('CANDIDATE_SCOPE_REQUIRED', 'same-repository read-only event required');
  } else if (values.phase === 'final') {
    for (const key of ['QUALITY_SCOPE_RESULT', 'QUALITY_GATE_RESULT']) {
      if (process.env[key] !== 'success')
        refuse('QUALITY_REQUIRED', `${key}=${process.env[key] ?? 'missing'}`);
    }
  } else if (values.phase === 'input') {
    refuse(
      'CANDIDATE_FINAL_GROUP_REQUIRED',
      'retired input writer; use the shared hosted group writer with the complete tuple',
    );
  } else {
    if (!['quality', 'business-profile', 'verify-input'].includes(values.phase))
      refuse('QUALITY_PHASE_REQUIRED', values.phase);
    if (!values['final-group-sha256'])
      refuse(
        'CANDIDATE_FINAL_GROUP_REQUIRED',
        'candidate execution requires explicit admitted group hash',
      );
    const input = values.input;
    if (!input) refuse('CANDIDATE_INPUT_REQUIRED', '--input <frozen group JSON>');
    finalGroup = await readFinalGroup({
      input,
      sha256: values['final-group-sha256'],
      checkout: process.cwd(),
      repo: 'dsh-agent-workbench',
      coreSource: values['core-source'],
      expectedSha: process.env.QUALITY_EXPECTED_SHA,
      ci: process.env.CI,
    });
    const manifest = finalGroup.manifest;
    if (values['core-head'] !== undefined && values['core-head'] !== manifest.core)
      refuse('CANDIDATE_CORE_MISMATCH', 'selected Core must match the admitted group');
    if (values.phase === 'verify-input') {
      console.log(JSON.stringify(finalGroup.receipt));
      process.exit(0);
    }
    const own = manifest.repositories.find((entry) => entry.repo === 'dsh-agent-workbench');
    if (values.phase === 'business-profile')
      (await import('./business-profile-ci.mjs')).validateBusinessProfileGroup(
        manifest.repositories,
      );
    const { selectCiTests } = await import('./ci-test-plan.mjs');
    const baseline = JSON.parse(readFileSync('scripts/quality-peer-baseline.json'));
    const plan =
      values.phase === 'business-profile'
        ? {
            lane: 'business-profile',
            runtime: false,
            browser: true,
            files: [
              'tests/new-conversation.test.mjs',
              'tests/business-conversation.test.mjs',
              'tests/inventory-entry.test.mjs',
              'tests/company-ui.test.mjs',
              'tests/plugin-package-version.test.mjs',
              'scripts/business-profile-ci.test.mjs',
              'tests/sidebar-reopen.browser.mjs',
            ],
          }
        : selectCiTests({
            repositories: manifest.repositories,
            repo: 'dsh-agent-workbench',
            base:
              process.env.QUALITY_BASE_SHA ||
              baseline.repositories.find((entry) => entry.repo === 'dsh-agent-workbench').head,
          });
    writeFileSync(
      resolve(dirname(resolve(input)), 'quality-test-plan.json'),
      JSON.stringify(plan, null, 2) + '\n',
    );

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
    finalGroup.verifyUnchanged();
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
    const { migrationHistory } = await import('../tests/helpers/migration-history.mjs');
    for (const name of ['dealer', 'personal']) {
      const env = `WORKBENCH_${name.toUpperCase()}_HISTORY_ROOT`;
      const history = values[`${name}-history`] ?? process.env[env];
      migrationHistory(name, history);
      if (history) process.env[env] = resolve(history);
    }
    const manage = manifest.repositories.find((entry) => entry.repo === 'dsh-agent-manage');
    const sdk = await import(
      pathToFileURL(resolve(manage.path, 'scripts/prepare-official-sdk.mjs'))
    );
    process.env.QUALITY_CORE_HEAD = manifest.core;
    const options = {
      core: resolve(dirname(dirname(process.cwd())), 'official-latest-standard'),
      consumer: process.cwd(),
      source: values['core-source'],
      coreHead: manifest.core,
      withFlock: true,
    };
    finalGroup.verifyUnchanged();
    if (values['prepare-sdk'])
      sdk.prepareOfficialSDK({
        ...options,
        reusePrepared: process.env.QUALITY_REUSE_SDK === 'true',
      });
    else sdk.verifyOfficialSDK(options);
    run(process.execPath, [
      'scripts/verify-candidate-input.mjs',
      '--input',
      resolve(input),
      '--checkout',
      process.cwd(),
      '--final-group-sha256',
      values['final-group-sha256'],
    ]);
    if (
      Number(process.versions.node.split('.')[0]) !== 24 ||
      execFileSync('npm', ['--version'], { encoding: 'utf8' }).trim() !== '11.11.0'
    )
      refuse('QUALITY_TOOLCHAIN_REQUIRED', 'Node 24 / npm 11.11.0');
    run('npm', ['ci', '--ignore-scripts', '--prefer-offline', '--no-audit', '--no-fund']);
    if (values['prepare-browser'] && !values.browser)
      refuse('QUALITY_BROWSER_REQUIRED', '--prepare-browser requires --browser');
    if (plan.browser && !values.browser)
      refuse('QUALITY_BROWSER_REQUIRED', 'selected tests require --browser');
    process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve(
      dirname(dirname(own.path)),
      'playwright-browsers',
    );
    if (values['prepare-browser'] && plan.browser)
      run('npm', ['exec', '--', 'playwright', 'install', '--with-deps', 'chromium']);
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
    // Browser acceptance must use freshly compiled FC and AQKC pages, not tracked historical HTML.
    for (const id of ['fc', 'aqkc'])
      run(
        'corepack',
        ['pnpm', 'install', '--frozen-lockfile', '--ignore-scripts', '--prefer-offline'],
        resolve(`business/inventory-${id}/source/inventory-light-plugins`),
      );
    run(
      'npm',
      ['ci', '--ignore-scripts', '--prefer-offline', '--no-audit', '--no-fund'],
      resolve('business/inventory-apsplan/source'),
    );
    const browserFiles = plan.files.filter((file) => file.endsWith('.browser.mjs'));
    const checks = runQualityChecks([
      { name: 'final-group', execute: () => run('npm', ['run', 'test:final-group']) },
      { name: 'fast', execute: () => run('npm', ['run', 'quality:fast', '--', '--checks-only']) },
      {
        name: 'build',
        execute: () => {
          const previousTypecheck = process.env.DSH_TYPECHECK_PROJECT;
          process.env.DSH_TYPECHECK_PROJECT = 'tsconfig.official.json';
          try {
            run('npm', ['run', 'build']);
          } finally {
            if (previousTypecheck === undefined) delete process.env.DSH_TYPECHECK_PROJECT;
            else process.env.DSH_TYPECHECK_PROJECT = previousTypecheck;
          }
        },
      },
      { name: 'knowledge', execute: () => run('npm', ['run', 'check:knowledge']) },
      {
        name: 'required-and-affected',
        execute: () =>
          run(process.execPath, [
            '--test',
            '--test-concurrency=2',
            ...plan.files.filter((file) => !file.endsWith('.browser.mjs')),
          ]),
      },
      ...(browserFiles.length
        ? [
            {
              name: 'affected-browser',
              execute: () => {
                run(process.execPath, ['--test', '--test-concurrency=1', ...browserFiles]);
              },
            },
          ]
        : []),
    ]);
    writeFileSync(
      resolve(dirname(resolve(input)), 'quality-checks.json'),
      JSON.stringify(checks, null, 2) + '\n',
    );
    if (checks.some((check) => check.status !== 'passed'))
      refuse('QUALITY_CHECKS_FAILED', JSON.stringify(checks));
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
    finalGroup.verifyUnchanged();
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
