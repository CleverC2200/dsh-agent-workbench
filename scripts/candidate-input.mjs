import { createHash } from 'node:crypto';
import { readFileSync, realpathSync, existsSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const coreCommit = '5badb15009ae1756c3afe0ae0cef1faafc290ccc';
export const candidatePackageNames = Object.freeze({
  'dsh-agent-workbench': '@cleverc2200/dsh-agent-workbench',
  'dsh-agent-manage': 'dsh-agent-manage',
  'dsh-gea-plugin': '@cleverc2200/gea-dsh-prototype',
});
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
function refuse(code, detail) {
  throw Error(`${code}: ${detail}`);
}

/** Admit an explicitly frozen group as source only; it grants no compatibility or runtime authority. */
export async function readFinalGroup({
  input,
  sha256,
  checkout,
  repo,
  coreSource,
  expectedSha,
  ci,
}) {
  if (!input || !/^[a-f0-9]{64}$/.test(sha256 ?? ''))
    refuse(
      'CANDIDATE_FINAL_GROUP_REQUIRED',
      '--input and --final-group-sha256 <original bytes SHA256>',
    );
  const bytes = readFileSync(resolve(input));
  if (digest(bytes) !== sha256) refuse('CANDIDATE_INPUT_HASH', input);
  let manifest;
  try {
    manifest = JSON.parse(bytes.toString('utf8'));
  } catch {
    refuse('CANDIDATE_INPUT_INVALID', input);
  }
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest))
    refuse('CANDIDATE_INPUT_INVALID', input);
  if (manifest.core !== coreCommit) refuse('CANDIDATE_CORE', 'fixed registered Core');
  if (!Array.isArray(manifest.repositories) || manifest.repositories.length !== 3)
    refuse('CANDIDATE_PEER_REQUIRED', 'exactly three repositories');
  const paths = new Set();
  const seen = new Set();
  for (const entry of manifest.repositories) {
    if (
      !entry ||
      typeof entry !== 'object' ||
      !Object.hasOwn(candidatePackageNames, entry.repo) ||
      seen.has(entry.repo)
    )
      refuse('CANDIDATE_PEER_REQUIRED', 'duplicate or unknown repository');
    seen.add(entry.repo);
    if (!isAbsolute(entry.path ?? '') || !/^[a-f0-9]{40}$/.test(entry.head ?? ''))
      refuse('CANDIDATE_PEER_REQUIRED', `${entry.repo}: absolute path and actual full commit`);
    const real = realpathSync(entry.path);
    if (paths.has(real)) refuse('CANDIDATE_PATH_COLLISION', entry.repo);
    paths.add(real);
  }
  const own = manifest.repositories.find((entry) =>
    repo ? entry.repo === repo : realpathSync(entry.path) === realpathSync(checkout),
  );
  if (!own || realpathSync(own.path) !== realpathSync(checkout))
    refuse('CANDIDATE_CHECKOUT', 'run in the registered own checkout');
  if (ci && !expectedSha) refuse('CANDIDATE_EVENT_REQUIRED', 'actual event SHA');
  if (expectedSha && (!/^[a-f0-9]{40}$/.test(expectedSha) || own.head !== expectedSha))
    refuse('CANDIDATE_EVENT_MISMATCH', own.head);
  const repositories = manifest.repositories.map((entry) => {
    const git = (...args) =>
      execFileSync('git', ['-C', entry.path, ...args], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }).trim();
    if (git('rev-parse', 'HEAD') !== entry.head) refuse('CANDIDATE_HEAD', entry.repo);
    if (git('rev-parse', '--is-shallow-repository') !== 'false')
      refuse('CANDIDATE_HISTORY_REQUIRED', entry.repo);
    const lock = entry.repo === 'dsh-agent-workbench' ? 'package-lock.json' : 'pnpm-lock.yaml';
    for (const file of ['package.json', lock])
      if (!existsSync(resolve(entry.path, file))) refuse('CANDIDATE_MATERIAL_REQUIRED', file);
    if (
      JSON.parse(readFileSync(resolve(entry.path, 'package.json'))).name !==
      candidatePackageNames[entry.repo]
    )
      refuse('CANDIDATE_PEER_REQUIRED', `${entry.repo}: package identity`);
    const committed = execFileSync('git', ['-C', entry.path, 'show', `HEAD:${lock}`]);
    if (!committed.equals(readFileSync(resolve(entry.path, lock))))
      refuse('CANDIDATE_LOCK', entry.repo);
    if (git('status', '--porcelain', '--untracked-files=all'))
      refuse('CANDIDATE_DIRTY', entry.repo);
    return { ...entry, tree: git('rev-parse', 'HEAD^{tree}'), lockSha256: digest(committed) };
  });
  const workbench = manifest.repositories.find((entry) => entry.repo === 'dsh-agent-workbench');
  const manage = manifest.repositories.find((entry) => entry.repo === 'dsh-agent-manage');
  if (realpathSync(workbench.path) !== realpathSync(resolve(import.meta.dirname, '..')))
    refuse('CANDIDATE_INTERFACE_CHECKOUT', 'reader must belong to the registered Workbench');
  const configuration = JSON.parse(readFileSync(resolve(workbench.path, 'tsconfig.official.json')));
  const cordis = configuration.compilerOptions.paths['@deepseek-ai/cordis'][0];
  const mappedCore = resolve(dirname(resolve(workbench.path, cordis)), '../../../..');
  // Cold preparation can read a local fixed Git source even before the owned SDK checkout exists.
  // A URL alone is not evidence of an observed Core Git/source/lock.
  const core = existsSync(resolve(mappedCore, '.git')) ? mappedCore : coreSource;
  if (!core || !existsSync(resolve(core, '.git')))
    refuse(
      'CANDIDATE_CORE_SOURCE_REQUIRED',
      'existing fixed Core Git or --core-source <local Git>',
    );
  const sdk = await import(pathToFileURL(resolve(manage.path, 'scripts/prepare-official-sdk.mjs')));
  if (typeof sdk.verifyOfficialSource !== 'function')
    refuse('CANDIDATE_INTERFACE_REQUIRED', 'Manage verifyOfficialSource');
  const official = sdk.verifyOfficialSource(resolve(core));
  const verifyUnchanged = () => {
    if (!bytes.equals(readFileSync(resolve(input)))) refuse('CANDIDATE_INPUT_CHANGED', input);
  };
  verifyUnchanged();
  for (const entry of manifest.repositories) Object.freeze(entry);
  Object.freeze(manifest.repositories);
  Object.freeze(manifest);
  return {
    manifest,
    verifyUnchanged,
    receipt: {
      stage: 'candidate-source-only',
      status: 'passed',
      runtime: 'not-observed',
      inputSha256: sha256,
      official,
      repositories,
      sdk: 'not-observed',
      compatibility: 'not-observed',
      quality: 'not-observed',
    },
  };
}
