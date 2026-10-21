import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { selectCiTests } from './ci-test-plan.mjs';

const git = (root, ...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
const json = file => JSON.parse(readFileSync(file, 'utf8'));
const run = (command, args, cwd = process.cwd(), env = {}) => execFileSync(command, args, { cwd, stdio: 'inherit', env: { ...process.env, ...env } });
const modules = ['dsh-agent-workbench', 'dsh-agent-manage', 'dsh-gea-plugin'];
export async function sourceChecks(result, phase) {
  const root = process.cwd();
  const repo = process.env.SOURCE_REPOSITORY || modules.find(name => root.endsWith('/' + name));
  if (!modules.includes(repo) || !result.base) throw Error('SOURCE_CHECK_INPUT_REQUIRED');
  const baseline = json(resolve(root, 'scripts/quality-peer-baseline.json'));
  const repositories = modules.map(name => {
    const path = name === repo ? root : name === 'dsh-agent-workbench' && repo === 'dsh-gea-plugin' ? resolve(root, '../../source', name) : resolve(root, '..', name);
    const head = name === repo ? result.head : baseline.repositories.find(entry => entry.repo === name)?.head;
    if (!/^[a-f0-9]{40}$/.test(head || '') || git(path, 'rev-parse', 'HEAD') !== head) throw Error(`SOURCE_PEER_MISMATCH: ${name}`);
    return { repo: name, path, head };
  });
  const workbench = repositories.find(entry => entry.repo === 'dsh-agent-workbench').path;
  const manage = repositories.find(entry => entry.repo === 'dsh-agent-manage').path;
  const gea = repositories.find(entry => entry.repo === 'dsh-gea-plugin').path;
  const testOwners = repo === 'dsh-agent-manage' ? (await import(pathToFileURL(resolve(manage, 'scripts/preset-test-lanes.mjs')))).presetHostOwners : json(resolve(root, 'scripts/ci-test-policy.json')).testOwners || {};
  const selected = selectCiTests({ repositories, repo, base: result.base, testOwners, sourceOnly: true });
  const typecheck = result.files.some(file => /^(?:src|packages|business)\//.test(file) && /\.(?:ts|tsx|mts|cts)$/.test(file) || /^(?:tsconfig|package\.json$|(?:pnpm|package)-lock)/.test(file));
  const lanes = repo === 'dsh-agent-manage' ? (await import(pathToFileURL(resolve(manage, 'scripts/preset-test-lanes.mjs')))).presetLanes : {};
  const joint = selected.runtime || selected.build || selected.files.some(file => Object.values(lanes).some(lane => file in lane));
  const plan = { ...selected, typecheck, dependencies: typecheck || joint || selected.dependencies || selected.files.some(file => file.endsWith('.ts')), sdk: typecheck || joint || selected.sdk || repo === 'dsh-agent-manage' && selected.files.some(file => file.endsWith('.ts')), joint };
  mkdirSync('.runtime', { recursive: true });
  writeFileSync('.runtime/source-checks-plan.json', JSON.stringify(plan, null, 2) + '\n');
  if (phase === 'affected-plan') {
    if (process.env.GITHUB_OUTPUT) for (const key of ['dependencies', 'sdk', 'browser', 'joint']) appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${plan[key]}\n`);
    console.log(JSON.stringify(plan));
    return;
  }
  if (plan.sdk) {
    const { verifyOfficialSDK } = await import(pathToFileURL(resolve(manage, 'scripts/prepare-official-sdk.mjs')));
    verifyOfficialSDK({ consumer: root, core: resolve(root, '../../official-latest-standard'), coreHead: json(resolve(gea, 'scripts/current-core.json')).adaptation, withArtifactReceipt: true });
  }
  if (phase === 'affected-prepare') {
    if (plan.dependencies && (repo === 'dsh-gea-plugin' || joint)) {
      const { prepareQualityUpstreams, bindQualityUpstreamInputs } = await import(pathToFileURL(resolve(gea, 'scripts/quality-upstreams.mjs')));
      const upstream = resolve(root, '../../quality-upstreams');
      await prepareQualityUpstreams(upstream);
      await bindQualityUpstreamInputs(upstream, resolve(root, '../../upstream-inputs'), { prepare: true });
    }
    if (plan.dependencies && !joint) {
      const { acquireBuild } = await import(pathToFileURL(resolve(gea, 'scripts/build-admission.mjs')));
      if (repo === 'dsh-gea-plugin' && typecheck) {
        for (const peer of [workbench, manage]) {
          const release = acquireBuild({ operation: 'prepare', cwd: peer });
          try {
            if (peer === workbench) run('npm', ['ci', '--ignore-scripts', '--prefer-offline', '--no-audit', '--no-fund'], peer);
            else run('corepack', ['pnpm', 'install', '--frozen-lockfile', '--ignore-scripts', '--prefer-offline'], peer);
          } finally { release(); }
        }
      }
      const release = acquireBuild({ operation: 'prepare', cwd: root });
      try {
        if (repo === 'dsh-agent-workbench') run('npm', ['ci', '--ignore-scripts', '--prefer-offline', '--no-audit', '--no-fund']);
        else run('corepack', ['pnpm', 'install', '--frozen-lockfile', '--ignore-scripts', '--prefer-offline']);
      } finally { release(); }
    }
    return;
  }
  if (joint) {
    if (repo === 'dsh-agent-manage') {
      const { acquireBuild } = await import(pathToFileURL(resolve(gea, 'scripts/build-admission.mjs')));
      let release = acquireBuild({ operation: 'prepare', cwd: workbench });
      try { run('npm', ['ci', '--ignore-scripts', '--prefer-offline', '--no-audit', '--no-fund'], workbench); } finally { release(); }
      release = acquireBuild({ operation: 'build', cwd: workbench });
      try { run(process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.official.json', '--noEmit', 'false', '--emitDeclarationOnly', 'true'], workbench); } finally { release(); }
    }
    const reader = JSON.parse(execFileSync(process.execPath, [resolve(workbench, 'scripts/read-hosted-peer-input.mjs'), '--repo', repo], { encoding: 'utf8', env: { ...process.env, QUALITY_EXPECTED_SHA: result.head, QUALITY_SCOPE_ALLOWED: 'true', GITHUB_OUTPUT: '' } }));
    const env = { QUALITY_EXPECTED_SHA: result.head, QUALITY_BASE_SHA: result.base, QUALITY_REUSE_SDK: 'true', QUALITY_GROUP_GEA: reader['gea-sha'], QUALITY_GROUP_MANAGE: reader['manage-sha'], QUALITY_GROUP_WORKBENCH: reader['workbench-sha'], QUALITY_GROUP_ID: reader['group-id'], QUALITY_SOURCE_KIND: reader['source-kind'], QUALITY_BASELINE_ID: reader['baseline-id'] };
    const coreHead = json(resolve(gea, 'scripts/current-core.json')).adaptation;
    const bind = ['--repo', repo, '--root', resolve(root, '../..'), '--core-head', coreHead, ...(repo === 'dsh-gea-plugin' ? ['--workbench-source'] : [])];
    run(process.execPath, [resolve(workbench, 'scripts/write-hosted-group.mjs'), ...bind], root, env);
    const input = resolve(root, '../../candidate-input.json');
    const { createHash } = await import('node:crypto');
    const args = ['scripts/run-quality-ci.mjs', '--source-only', '--input', input, '--core-source', resolve(root, '../../source/official-core'), '--final-group-sha256', createHash('sha256').update(readFileSync(input)).digest('hex')];
    if (repo === 'dsh-gea-plugin') args.push('--prepare-inputs', '--prepare-sdk');
    if (repo === 'dsh-agent-workbench') args.push('--browser', '--prepare-browser');
    run(process.execPath, args, root, env);
    return;
  }
  if (typecheck) await checkTypes(root, repositories, repo, result.files);
  if (plan.browser) run(repo === 'dsh-agent-workbench' ? 'npm' : 'corepack', repo === 'dsh-agent-workbench' ? ['exec', '--', 'playwright', 'install', '--with-deps', 'chromium'] : ['pnpm', 'exec', 'playwright', 'install', '--with-deps', 'chromium']);
  const nodeFiles = plan.files.filter(file => !file.endsWith('.ts'));
  if (nodeFiles.length) run(process.execPath, ['--expose-internals', '--test', '--test-concurrency=1', ...nodeFiles]);
  const vitestFiles = plan.files.filter(file => file.endsWith('.ts'));
  if (vitestFiles.length) run('corepack', ['pnpm', 'exec', 'vitest', 'run', '--config', 'vitest.ci-unit.config.ts', ...vitestFiles]);
  console.log(JSON.stringify({ status: 'passed', files: plan.files, typecheck }));
}

export async function checkTypes(root, repositories, repo, changed = []) {
  const require = createRequire(resolve(root, 'package.json'));
  const ts = require('typescript');
  const peerPaths = {};
  for (const peer of repositories) {
    const pkg = json(resolve(peer.path, 'package.json'));
    for (const [name, entry] of Object.entries(pkg.exports || {})) {
      const type = typeof entry === 'object' ? entry.types : null;
      if (peer.repo === 'dsh-agent-workbench' && name === './configured-query' && type === './lib/configured-query-client.d.mts') {
        const declaration = resolve(peer.path, 'business/shared/configured-query-client.d.mts');
        if (!existsSync(declaration)) throw Error('SOURCE_PEER_TYPES_REQUIRED: configured-query');
        peerPaths[pkg.name + '/configured-query'] = [declaration];
        continue;
      }
      if (!type?.startsWith('./lib/types/') || name.includes('*')) continue;
      const source = resolve(peer.path, type.replace('./lib/types/', 'src/').replace(/\.d\.ts$/, '.ts'));
      const target = existsSync(source) ? source : source.replace(/\.ts$/, '.tsx');
      if (existsSync(target)) peerPaths[pkg.name + (name === '.' ? '' : name.slice(1))] = [target];
    }
  }
  const configs = repo === 'dsh-agent-manage' ? ['tsconfig.json', 'tsconfig.client.json'] : ['tsconfig.official.json'];
  for (const file of configs) {
    const parsed = ts.getParsedCommandLineOfConfigFile(resolve(root, file), { noEmit: true, emitDeclarationOnly: false }, { ...ts.sys, onUnRecoverableConfigFileDiagnostic: diagnostic => { throw Error(ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')); } });
    if (!parsed) throw Error(`SOURCE_TYPES_CONFIG_REQUIRED: ${file}`);
    parsed.options.paths = { ...parsed.options.paths, ...peerPaths };
    parsed.options.rootDir = resolve(root, '../..');
    parsed.options.typeRoots = [resolve(root, 'node_modules/@types')];
    const ambient = repositories.filter(entry => entry.repo !== repo).flatMap(entry => ts.sys.readDirectory(resolve(entry.path, 'src'), ['.d.ts']));
    const affected = changed.filter(file => /^(?:src|packages|business)\//.test(file) && /\.(?:ts|tsx|mts|cts)$/.test(file) && existsSync(resolve(root, file))).map(file => resolve(root, file));
    const program = ts.createProgram([...new Set([...parsed.fileNames, ...affected, ...ambient])], parsed.options);
    const diagnostics = [...parsed.errors, ...ts.getPreEmitDiagnostics(program)];
    if (diagnostics.length) {
      console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics, { getCurrentDirectory: () => root, getCanonicalFileName: file => file, getNewLine: () => '\n' }));
      throw Error(`SOURCE_TYPES_FAILED: ${file}`);
    }
    console.log(JSON.stringify({ typecheck: file, files: parsed.fileNames.length, emit: false, peers: repositories.filter(entry => entry.repo !== repo).map(entry => ({ repo: entry.repo, head: entry.head })) }));
  }
}
