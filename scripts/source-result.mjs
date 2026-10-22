import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, appendFileSync, mkdtempSync, rmSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

const digest = (value) => createHash('sha256').update(value).digest('hex');
const git = (root, ...args) =>
  execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
const read = (file) => JSON.parse(readFileSync(file, 'utf8'));
const modules = ['dsh-agent-workbench', 'dsh-agent-manage', 'dsh-gea-plugin'];
const gate = (file) =>
  file.startsWith('.github/') || (file.startsWith('scripts/') && !file.endsWith('.test.mjs'));

export function sourceIdentity(root, env = process.env) {
  const repo = basename(root);
  if (git(root, 'status', '--porcelain', '--untracked-files=no')) return null;
  const plan = read(join(root, '.runtime/source-checks-plan.json'));
  if (
    !modules.includes(repo) ||
    env.GITHUB_REPOSITORY !== `CleverC2200/${repo}` ||
    !Array.isArray(plan.tools) ||
    plan.core !== false ||
    plan.sdk !== false ||
    plan.typecheck !== false ||
    plan.joint !== false ||
    plan.runtime !== false ||
    plan.browser !== false ||
    plan.build !== false ||
    !env.ImageOS ||
    !env.ImageVersion
  )
    return null;
  const event = read(env.GITHUB_EVENT_PATH);
  const base = event.pull_request?.base?.sha || event.before;
  const head = event.pull_request?.head?.sha || event.after;
  if (!/^[a-f0-9]{40}$/.test(base || '') || git(root, 'rev-parse', 'HEAD') !== head) return null;
  const diffBase = git(root, 'merge-base', base, head);
  if (diffBase !== base || plan.diffBase !== base) return null;
  const files = git(root, 'diff', '--no-renames', '--name-only', base, head)
    .split('\n')
    .filter(Boolean)
    .sort();
  if (!files.length || files.some(gate)) return null;
  const peers = read(join(root, 'scripts/quality-peer-baseline.json'))
    .repositories.filter((entry) => entry.repo !== repo)
    .sort((a, b) => a.repo.localeCompare(b.repo));
  const lockFiles = git(root, 'ls-files')
    .split('\n')
    .filter((file) =>
      /(?:^|\/)(?:package\.json|package-lock\.json|pnpm-(?:lock|workspace)\.yaml|\.npmrc)$/.test(
        file,
      ),
    )
    .sort();
  const checks = Object.fromEntries(
    [
      'files',
      'required',
      'runtimeFiles',
      'browserFiles',
      'browserFixtures',
      'runtime',
      'browser',
      'build',
      'dependencies',
      'sdk',
      'upstreams',
      'tools',
      'core',
      'staticChecks',
      'typecheck',
      'joint',
      'fullSuite',
    ].map((key) => [key, plan[key]]),
  );
  const packageManager = read(join(root, 'package.json')).packageManager;
  if (!/^(?:npm|pnpm)@\d+\.\d+\.\d+$/.test(packageManager || '')) return null;
  return {
    schemaVersion: 1,
    repository: env.GITHUB_REPOSITORY,
    tree: git(root, 'rev-parse', 'HEAD^{tree}'),
    base,
    baseTree: git(root, 'rev-parse', `${base}^{tree}`),
    files,
    peers,
    locks: Object.fromEntries(
      lockFiles.map((file) => [file, digest(readFileSync(join(root, file)))]),
    ),
    toolchain: {
      node: process.versions.node,
      abi: process.versions.modules,
      packageManager,
      platform: process.platform,
      arch: process.arch,
      imageOS: env.ImageOS,
      imageVersion: env.ImageVersion,
    },
    checks,
  };
}

async function findSource(identity, context, request, artifactText) {
  if (!identity || context.eventName !== 'push' || context.ref !== 'refs/heads/main')
    return { hit: false, reason: 'ineligible' };
  const prefix = `/repos/${identity.repository}`;
  const prs = await request(`${prefix}/commits/${context.sha}/pulls?per_page=10`);
  const pr = prs.find(
    (entry) =>
      entry.merged_at &&
      entry.merge_commit_sha === context.sha &&
      entry.base.ref === 'main' &&
      entry.base.repo.full_name === identity.repository &&
      entry.head.repo?.full_name === identity.repository,
  );
  if (!pr) return { hit: false, reason: 'merged-pr-missing' };
  const commit = await request(`${prefix}/git/commits/${pr.head.sha}`);
  if (commit.tree.sha !== identity.tree) return { hit: false, reason: 'tree-mismatch' };
  const workflow = await request(`${prefix}/actions/workflows/source-quality.yml`);
  const { workflow_runs: runs } = await request(
    `${prefix}/actions/workflows/source-quality.yml/runs?event=pull_request&head_sha=${pr.head.sha}&per_page=1`,
  );
  const run = runs[0];
  if (
    !run ||
    run.workflow_id !== workflow.id ||
    run.event !== 'pull_request' ||
    run.status !== 'completed' ||
    run.conclusion !== 'success' ||
    run.head_sha !== pr.head.sha ||
    run.head_branch !== pr.head.ref ||
    run.head_repository?.full_name !== identity.repository ||
    run.path !== '.github/workflows/source-quality.yml' ||
    context.now - Date.parse(run.updated_at) < 0 ||
    context.now - Date.parse(run.updated_at) > 24 * 60 * 60 * 1000 ||
    !Number.isFinite(Date.parse(run.updated_at))
  )
    return { hit: false, reason: 'successful-current-run-missing' };
  const { jobs } = await request(
    `${prefix}/actions/runs/${run.id}/attempts/${run.run_attempt}/jobs?per_page=100`,
  );
  const required = ['source-plan', 'source-checks', 'dependency-review', 'candidate-quality'];
  if (identity.repository.endsWith('/dsh-agent-manage'))
    required.push('codeql / Analyze (javascript-typescript)');
  if (
    required.some((name) => !jobs.some((job) => job.name === name && job.conclusion === 'success'))
  )
    return { hit: false, reason: 'required-job-missing' };
  const { artifacts } = await request(`${prefix}/actions/runs/${run.id}/artifacts?per_page=100`);
  const matches = artifacts.filter((entry) => entry.name === `source-result-${run.run_attempt}`);
  const artifact = matches[0];
  if (
    matches.length !== 1 ||
    artifact.expired ||
    artifact.size_in_bytes > 65536 ||
    !/^sha256:[a-f0-9]{64}$/.test(artifact.digest || '')
  )
    return { hit: false, reason: 'receipt-missing' };
  const receipt = JSON.parse(await artifactText(artifact));
  if (
    receipt.schemaVersion !== 1 ||
    receipt.runId !== run.id ||
    receipt.attempt !== run.run_attempt ||
    receipt.pr !== pr.number ||
    receipt.head !== pr.head.sha ||
    receipt.status !== 'success' ||
    JSON.stringify(receipt.identity) !== JSON.stringify(identity)
  )
    return { hit: false, reason: 'receipt-input-mismatch' };
  return {
    hit: true,
    reason: 'matching-pr-result',
    runId: run.id,
    attempt: run.run_attempt,
    pr: pr.number,
    artifactId: artifact.id,
  };
}

export async function reusableSource(...args) {
  try {
    return await findSource(...args);
  } catch (error) {
    return { hit: false, reason: `unavailable: ${error.message}` };
  }
}

async function api(path, binary = false) {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      Authorization: `Bearer ${process.env.GH_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw Error(`SOURCE_RESULT_HTTP_${response.status}`);
  return binary ? Buffer.from(await response.arrayBuffer()) : response.json();
}

export function readSourceArchive(bytes, expectedDigest) {
  if (bytes.length > 65536 || `sha256:${digest(bytes)}` !== expectedDigest)
    throw Error('SOURCE_RESULT_ARCHIVE_REJECTED');
  const directory = mkdtempSync(join(tmpdir(), 'source-result-'));
  try {
    const archive = join(directory, 'receipt.zip');
    writeFileSync(archive, bytes);
    const options = { encoding: 'utf8', maxBuffer: 65536, timeout: 10000 };
    if (execFileSync('unzip', ['-Z1', archive], options).trim() !== 'source-result.json')
      throw Error('SOURCE_RESULT_ARCHIVE_CONTENTS');
    return execFileSync('unzip', ['-p', archive, 'source-result.json'], options);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

async function downloadReceipt(repository, artifact) {
  return readSourceArchive(
    await api(`/repos/${repository}/actions/artifacts/${artifact.id}/zip`, true),
    artifact.digest,
  );
}

async function main() {
  const root = process.cwd();
  const phase = process.argv[process.argv.indexOf('--phase') + 1];
  if (!['lookup', 'record'].includes(phase)) throw Error('SOURCE_RESULT_PHASE_REQUIRED');
  let decision = { hit: false, reason: 'ineligible' };
  try {
    const identity = sourceIdentity(root);
    const event = read(process.env.GITHUB_EVENT_PATH);
    if (phase === 'record') {
      if (
        identity &&
        process.env.GITHUB_EVENT_NAME === 'pull_request' &&
        event.pull_request.head.repo.full_name === identity.repository &&
        event.pull_request.base.repo.full_name === identity.repository &&
        event.pull_request.base.ref === 'main'
      ) {
        const [manager, version] = identity.toolchain.packageManager.split('@');
        const actual = execFileSync(
          manager === 'npm' ? 'npm' : 'corepack',
          manager === 'npm' ? ['--version'] : ['pnpm', '--version'],
          { encoding: 'utf8' },
        ).trim();
        if (actual !== version) throw Error('SOURCE_RESULT_MANAGER_MISMATCH');
        writeFileSync(
          join(root, '.runtime/source-result.json'),
          JSON.stringify({
            schemaVersion: 1,
            status: 'success',
            identity,
            runId: Number(process.env.GITHUB_RUN_ID),
            attempt: Number(process.env.GITHUB_RUN_ATTEMPT),
            pr: event.pull_request.number,
            head: event.pull_request.head.sha,
          }) + '\n',
        );
        if (process.env.GITHUB_OUTPUT)
          appendFileSync(process.env.GITHUB_OUTPUT, 'published=true\n');
      }
      return;
    }
    decision = await reusableSource(
      identity,
      {
        eventName: process.env.GITHUB_EVENT_NAME,
        ref: process.env.GITHUB_REF,
        sha: process.env.GITHUB_SHA,
        now: Date.now(),
      },
      api,
      (artifact) => downloadReceipt(identity.repository, artifact),
    );
  } catch (error) {
    decision = { hit: false, reason: `unavailable: ${error.message}` };
  }
  writeFileSync(join(root, '.runtime/source-result-reuse.json'), JSON.stringify(decision) + '\n');
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `hit=${decision.hit}\n`);
  }
  console.log(JSON.stringify(decision));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  await main();
