import { execFileSync } from 'node:child_process';
import {
  readFileSync,
  existsSync,
  mkdirSync,
  writeFileSync,
  appendFileSync,
  symlinkSync,
  realpathSync,
} from 'node:fs';
import { resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { selectCiTests } from './ci-test-plan.mjs';

const git = (root, ...args) =>
  execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
const json = (file) => JSON.parse(readFileSync(file, 'utf8'));
const run = (command, args, cwd = process.cwd(), env = {}) =>
  execFileSync(command, args, { cwd, stdio: 'inherit', env: { ...process.env, ...env } });
const modules = ['dsh-agent-workbench', 'dsh-agent-manage', 'dsh-gea-plugin'];
export async function sourceChecks(result, phase) {
  const local = result.workingTree === true;
  if (local && phase !== 'affected-plan') throw Error('SOURCE_WORKING_TREE_PLAN_ONLY');
  const root = process.cwd();
  const repo = process.env.SOURCE_REPOSITORY || modules.find((name) => root.endsWith('/' + name));
  if (!modules.includes(repo) || !result.base) throw Error('SOURCE_CHECK_INPUT_REQUIRED');
  const baseline = local ? null : json(resolve(root, 'scripts/quality-peer-baseline.json'));
  const repositories = modules.map((name) => {
    const path =
      name === repo
        ? root
        : !local && name === 'dsh-agent-workbench' && repo === 'dsh-gea-plugin'
          ? resolve(root, '../../source', name)
          : resolve(root, '..', name);
    const head =
      name === repo
        ? result.head
        : local
          ? git(path, 'rev-parse', 'HEAD')
          : baseline.repositories.find((entry) => entry.repo === name)?.head;
    if (!/^[a-f0-9]{40}$/.test(head || '') || git(path, 'rev-parse', 'HEAD') !== head)
      throw Error(`SOURCE_PEER_MISMATCH: ${name}`);
    return { repo: name, path, head };
  });
  const workbench = repositories.find((entry) => entry.repo === 'dsh-agent-workbench').path;
  const manage = repositories.find((entry) => entry.repo === 'dsh-agent-manage').path;
  const gea = repositories.find((entry) => entry.repo === 'dsh-gea-plugin').path;
  const testOwners =
    repo === 'dsh-agent-manage'
      ? (await import(pathToFileURL(resolve(manage, 'scripts/preset-test-lanes.mjs'))))
          .presetHostOwners
      : json(resolve(root, 'scripts/ci-test-policy.json')).testOwners || {};
  const selected = selectCiTests({
    repositories,
    repo,
    base: result.base,
    testOwners,
    sourceOnly: true,
    workingTree: result.workingTree === true,
  });
  const desktopTools =
    repo === 'dsh-gea-plugin' && selected.files.includes('scripts/package-desktop.test.mjs');
  const typecheck = result.files.some(
    (file) =>
      (/^(?:src|packages|business)\//.test(file) && /\.(?:ts|tsx|mts|cts)$/.test(file)) ||
      /^(?:tsconfig|package\.json$|(?:pnpm|package)-lock)/.test(file),
  );
  const lanes =
    repo === 'dsh-agent-manage'
      ? (await import(pathToFileURL(resolve(manage, 'scripts/preset-test-lanes.mjs')))).presetLanes
      : {};
  const joint =
    selected.runtime ||
    selected.build ||
    selected.files.some((file) => Object.values(lanes).some((lane) => file in lane));
  const staticChecks = joint ? [] : ['check:knowledge', 'lint', 'format:check'];
  let upstreams = 'none';
  if (repo === 'dsh-gea-plugin' || joint)
    upstreams = typecheck || joint ? 'artifacts' : selected.upstreams;
  const plan = {
    ...selected,
    staticChecks,
    typecheck,
    dependencies:
      typecheck ||
      joint ||
      staticChecks.some((check) => check !== 'check:knowledge') ||
      desktopTools ||
      selected.dependencies ||
      selected.files.some((file) => file.endsWith('.ts')),
    sdk:
      typecheck ||
      joint ||
      selected.sdk ||
      (repo === 'dsh-agent-manage' && selected.files.some((file) => file.endsWith('.ts'))),
    upstreams,
    joint,
  };
  mkdirSync('.runtime', { recursive: true });
  writeFileSync('.runtime/source-checks-plan.json', JSON.stringify(plan, null, 2) + '\n');
  if (phase === 'affected-plan') {
    if (process.env.GITHUB_OUTPUT)
      for (const key of ['dependencies', 'sdk', 'browser', 'joint'])
        appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${plan[key]}\n`);
    console.log(JSON.stringify(plan));
    return;
  }
  if (repo === 'dsh-gea-plugin' && !joint) {
    const linkedWorkbench = resolve(root, '../dsh-agent-workbench');
    if (!existsSync(linkedWorkbench)) symlinkSync(workbench, linkedWorkbench, 'dir');
    if (realpathSync(linkedWorkbench) !== realpathSync(workbench))
      throw Error('SOURCE_PEER_LINK_MISMATCH');
  }
  const ownerCheck = (check) =>
    run(
      repo === 'dsh-agent-workbench' ? 'npm' : 'corepack',
      repo === 'dsh-agent-workbench' ? ['run', check] : ['pnpm', 'run', check],
      root,
      { QUALITY_BASE_SHA: selected.diffBase, DSH_WORKBENCH_CHECKOUT: workbench },
    );
  if (phase === 'affected-check' && staticChecks.includes('check:knowledge'))
    ownerCheck('check:knowledge');
  let coreHead;
  if (plan.sdk) {
    const { ciCores } = await import(pathToFileURL(resolve(gea, 'scripts/ci-core-policy.mjs')));
    coreHead = ciCores('required')[0].head;
    const { verifyOfficialSDK } = await import(
      pathToFileURL(resolve(manage, 'scripts/prepare-official-sdk.mjs'))
    );
    verifyOfficialSDK({
      consumer: root,
      core: resolve(root, '../../official-latest-standard'),
      coreHead,
      withArtifactReceipt: true,
    });
  }
  if (phase === 'affected-prepare') {
    if (plan.dependencies && (repo === 'dsh-gea-plugin' || joint)) {
      const { prepareQualityUpstreamSources, prepareQualityUpstreams, bindQualityUpstreamInputs } =
        await import(pathToFileURL(resolve(gea, 'scripts/quality-upstreams.mjs')));
      const upstream = resolve(root, '../../quality-upstreams');
      const sourceOnly = plan.upstreams === 'source-links';
      await (sourceOnly ? prepareQualityUpstreamSources : prepareQualityUpstreams)(upstream);
      await bindQualityUpstreamInputs(upstream, resolve(root, '../../upstream-inputs'), {
        prepare: true,
        sourceOnly,
      });
    }
    if (plan.dependencies && !joint) {
      const { acquireBuild } = await import(
        pathToFileURL(resolve(gea, 'scripts/build-admission.mjs'))
      );
      if (repo === 'dsh-gea-plugin' && typecheck) {
        for (const peer of [workbench, manage]) {
          const release = acquireBuild({ operation: 'prepare', cwd: peer });
          try {
            if (peer === workbench)
              run(
                'npm',
                ['ci', '--ignore-scripts', '--prefer-offline', '--no-audit', '--no-fund'],
                peer,
              );
            else
              run(
                'corepack',
                ['pnpm', 'install', '--frozen-lockfile', '--ignore-scripts', '--prefer-offline'],
                peer,
              );
          } finally {
            release();
          }
        }
      }
      const release = acquireBuild({ operation: 'prepare', cwd: root });
      try {
        if (repo === 'dsh-agent-workbench')
          run('npm', ['ci', '--ignore-scripts', '--prefer-offline', '--no-audit', '--no-fund']);
        else
          run('corepack', [
            'pnpm',
            'install',
            '--frozen-lockfile',
            '--ignore-scripts',
            '--prefer-offline',
          ]);
      } finally {
        release();
      }
    }
    return;
  }
  if (plan.upstreams === 'source-links') {
    const { bindQualityUpstreamInputs } = await import(
      pathToFileURL(resolve(gea, 'scripts/quality-upstreams.mjs'))
    );
    await bindQualityUpstreamInputs(
      resolve(root, '../../quality-upstreams'),
      resolve(root, '../../upstream-inputs'),
      { sourceOnly: true },
    );
  }
  if (joint) {
    if (repo === 'dsh-agent-manage') {
      const { acquireBuild } = await import(
        pathToFileURL(resolve(gea, 'scripts/build-admission.mjs'))
      );
      let release = acquireBuild({ operation: 'prepare', cwd: workbench });
      try {
        run(
          'npm',
          ['ci', '--ignore-scripts', '--prefer-offline', '--no-audit', '--no-fund'],
          workbench,
        );
      } finally {
        release();
      }
      release = acquireBuild({ operation: 'build', cwd: workbench });
      try {
        run(
          process.execPath,
          [
            'node_modules/typescript/bin/tsc',
            '-p',
            'tsconfig.official.json',
            '--noEmit',
            'false',
            '--emitDeclarationOnly',
            'true',
          ],
          workbench,
        );
      } finally {
        release();
      }
    }
    const reader = JSON.parse(
      execFileSync(
        process.execPath,
        [resolve(workbench, 'scripts/read-hosted-peer-input.mjs'), '--repo', repo],
        {
          encoding: 'utf8',
          env: {
            ...process.env,
            QUALITY_EXPECTED_SHA: result.head,
            QUALITY_SCOPE_ALLOWED: 'true',
            GITHUB_OUTPUT: '',
          },
        },
      ),
    );
    const env = {
      QUALITY_EXPECTED_SHA: result.head,
      QUALITY_BASE_SHA: result.base,
      QUALITY_REUSE_SDK: 'true',
      QUALITY_GROUP_GEA: reader['gea-sha'],
      QUALITY_GROUP_MANAGE: reader['manage-sha'],
      QUALITY_GROUP_WORKBENCH: reader['workbench-sha'],
      QUALITY_GROUP_ID: reader['group-id'],
      QUALITY_SOURCE_KIND: reader['source-kind'],
      QUALITY_BASELINE_ID: reader['baseline-id'],
    };
    const bind = [
      '--repo',
      repo,
      '--root',
      resolve(root, '../..'),
      '--core-head',
      coreHead,
      ...(repo === 'dsh-gea-plugin' ? ['--workbench-source'] : []),
    ];
    run(
      process.execPath,
      [resolve(workbench, 'scripts/write-hosted-group.mjs'), ...bind],
      root,
      env,
    );
    const input = resolve(root, '../../candidate-input.json');
    const { createHash } = await import('node:crypto');
    const args = [
      'scripts/run-quality-ci.mjs',
      '--source-only',
      '--input',
      input,
      '--core-source',
      resolve(root, '../../source/official-core'),
      '--final-group-sha256',
      createHash('sha256').update(readFileSync(input)).digest('hex'),
      '--final-group-workbench',
      workbench,
    ];
    if (repo === 'dsh-gea-plugin') args.push('--prepare-inputs', '--prepare-sdk');
    if (repo === 'dsh-agent-workbench') args.push('--browser', '--prepare-browser');
    run(process.execPath, args, root, env);
    return;
  }
  for (const check of staticChecks.filter((check) => check !== 'check:knowledge'))
    ownerCheck(check);
  if (typecheck) await checkTypes(root, repositories, repo, result.files);
  if (plan.browser)
    run(
      repo === 'dsh-agent-workbench' ? 'npm' : 'corepack',
      repo === 'dsh-agent-workbench'
        ? ['exec', '--', 'playwright', 'install', '--with-deps', 'chromium']
        : ['pnpm', 'exec', 'playwright', 'install', '--with-deps', 'chromium'],
    );
  if (desktopTools) {
    const { acquireBuild } = await import(
      pathToFileURL(resolve(gea, 'scripts/build-admission.mjs'))
    );
    const release = acquireBuild({
      operation: 'build',
      cwd: root,
      output: resolve(root, 'desktop'),
    });
    try {
      run(process.execPath, ['scripts/build-desktop-tools.mjs'], root);
    } finally {
      release();
    }
  }
  const nodeFiles = plan.files.filter((file) => !file.endsWith('.ts'));
  if (nodeFiles.length)
    run(process.execPath, ['--expose-internals', '--test', '--test-concurrency=1', ...nodeFiles]);
  const vitestFiles = plan.files.filter((file) => file.endsWith('.ts'));
  if (vitestFiles.length)
    run('corepack', [
      'pnpm',
      'exec',
      'vitest',
      'run',
      '--config',
      'vitest.ci-unit.config.ts',
      ...vitestFiles,
    ]);
  console.log(JSON.stringify({ status: 'passed', files: plan.files, typecheck }));
}

export async function checkTypes(root, repositories, repo, changed = []) {
  const require = createRequire(resolve(root, 'package.json'));
  const ts = require('typescript');
  const parseConfig = (file) => {
    const parsed = ts.getParsedCommandLineOfConfigFile(
      file,
      { noEmit: true, emitDeclarationOnly: false },
      {
        ...ts.sys,
        onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
          throw Error(ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
        },
      },
    );
    if (!parsed) throw Error(`SOURCE_TYPES_CONFIG_REQUIRED: ${file}`);
    return parsed;
  };
  const core = resolve(root, '../../official-latest-standard');
  const peerPaths = {},
    peerCorePaths = {};
  for (const peer of repositories) {
    const pkg = json(resolve(peer.path, 'package.json'));
    let mapsSource = false;
    for (const [name, entry] of Object.entries(pkg.exports || {})) {
      const type = typeof entry === 'object' ? entry.types : null;
      if (
        peer.repo === 'dsh-agent-workbench' &&
        name === './configured-query' &&
        type === './lib/configured-query-client.d.mts'
      ) {
        const declaration = resolve(peer.path, 'business/shared/configured-query-client.d.mts');
        if (!existsSync(declaration)) throw Error('SOURCE_PEER_TYPES_REQUIRED: configured-query');
        peerPaths[pkg.name + '/configured-query'] = [declaration];
        continue;
      }
      if (!type?.startsWith('./lib/types/') || name.includes('*')) continue;
      const source = resolve(
        peer.path,
        type.replace('./lib/types/', 'src/').replace(/\.d\.ts$/, '.ts'),
      );
      const target = existsSync(source) ? source : source.replace(/\.ts$/, '.tsx');
      if (existsSync(target)) {
        peerPaths[pkg.name + (name === '.' ? '' : name.slice(1))] = [target];
        mapsSource = true;
      }
    }
    const config = resolve(peer.path, 'tsconfig.official.json');
    if (peer.repo === repo || !mapsSource || !existsSync(config)) continue;
    const parsed = parseConfig(config);
    for (const [name, paths] of Object.entries(parsed.options.paths ?? {})) {
      const targets = paths.map((path) =>
        resolve(parsed.options.baseUrl ?? parsed.options.pathsBasePath ?? peer.path, path),
      );
      if (
        targets.length &&
        targets.every(
          (target) =>
            target.startsWith(core + sep) && /[/\\]lib[/\\]types[/\\].*\.d\.[cm]?ts$/.test(target),
        )
      )
        peerCorePaths[name] = targets;
    }
  }
  const configs =
    repo === 'dsh-agent-manage'
      ? ['tsconfig.json', 'tsconfig.client.json']
      : ['tsconfig.official.json'];
  for (const file of configs) {
    const parsed = parseConfig(resolve(root, file));
    parsed.options.paths = { ...peerCorePaths, ...parsed.options.paths, ...peerPaths };
    parsed.options.rootDir = resolve(root, '../..');
    parsed.options.typeRoots = [resolve(root, 'node_modules/@types')];
    const ambient = repositories
      .filter((entry) => entry.repo !== repo)
      .flatMap((entry) => ts.sys.readDirectory(resolve(entry.path, 'src'), ['.d.ts']));
    const affected = changed
      .filter(
        (file) =>
          /^(?:src|packages|business)\//.test(file) &&
          /\.(?:ts|tsx|mts|cts)$/.test(file) &&
          existsSync(resolve(root, file)),
      )
      .map((file) => resolve(root, file));
    const program = ts.createProgram(
      [...new Set([...parsed.fileNames, ...affected, ...ambient])],
      parsed.options,
    );
    const diagnostics = [...parsed.errors, ...ts.getPreEmitDiagnostics(program)];
    if (diagnostics.length) {
      console.error(
        ts.formatDiagnosticsWithColorAndContext(diagnostics, {
          getCurrentDirectory: () => root,
          getCanonicalFileName: (file) => file,
          getNewLine: () => '\n',
        }),
      );
      throw Error(`SOURCE_TYPES_FAILED: ${file}`);
    }
    console.log(
      JSON.stringify({
        typecheck: file,
        files: parsed.fileNames.length,
        emit: false,
        peers: repositories
          .filter((entry) => entry.repo !== repo)
          .map((entry) => ({ repo: entry.repo, head: entry.head })),
      }),
    );
  }
}
