import { readFileSync, accessSync, constants } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { verifyOfficialInput } from './verify-official-input.mjs';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    input: { type: 'string' },
    checkout: { type: 'string' },
    'final-group-sha256': { type: 'string' },
    'core-source': { type: 'string' },
  },
});
if (!values.input || !values.checkout)
  throw Error('CANDIDATE_INPUT_REQUIRED: --input and --checkout');
let finalGroup;
if (values['final-group-sha256'] !== undefined) {
  const { readFinalGroup } = await import('./candidate-input.mjs');
  finalGroup = await readFinalGroup({
    input: values.input,
    sha256: values['final-group-sha256'],
    checkout: values.checkout,

    coreSource: values['core-source'],
    expectedSha: process.env.QUALITY_EXPECTED_SHA,
    ci: process.env.CI,
  });
}
const manifest = finalGroup?.manifest ?? JSON.parse(readFileSync(resolve(values.input), 'utf8'));
for (const repo of ['dsh-agent-workbench', 'dsh-agent-manage', 'dsh-gea-plugin']) {
  const entries = manifest.repositories?.filter((entry) => entry.repo === repo);
  if (entries?.length !== 1 || !entries[0].path || !entries[0].head)
    throw Error(`CANDIDATE_PEER_REQUIRED: ${repo}`);
}
if (
  !finalGroup &&
  !manifest.repositories?.some((entry) => resolve(entry.path) === resolve(values.checkout))
) {
  throw Error('CANDIDATE_CHECKOUT: use a checkout registered in the input set');
}

const repositories = manifest.repositories.map((entry) => {
  let head;
  try {
    head = execFileSync('git', ['-C', entry.path, 'rev-parse', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch {
    throw Error(`CANDIDATE_PEER_REQUIRED: ${entry.repo} checkout ${entry.path}`);
  }
  return { repo: entry.repo, path: entry.path, head };
});
for (const entry of repositories) {
  for (const file of [
    'package.json',
    entry.repo === 'dsh-agent-workbench' ? 'package-lock.json' : 'pnpm-lock.yaml',
  ]) {
    try {
      accessSync(resolve(entry.path, file), constants.R_OK);
    } catch {
      throw Error(`CANDIDATE_MATERIAL_REQUIRED: ${entry.repo}/${file}`);
    }
  }
  const dirty = execFileSync(
    'git',
    ['-C', entry.path, 'status', '--porcelain', '--untracked-files=all'],
    { encoding: 'utf8' },
  ).trim();
  if (dirty) throw Error(`CANDIDATE_DIRTY: ${entry.repo}\n${dirty}`);
  const lock = entry.repo === 'dsh-agent-workbench' ? 'package-lock.json' : 'pnpm-lock.yaml';
  try {
    const frozen = execFileSync('git', ['-C', entry.path, 'show', `HEAD:${lock}`], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (!frozen.equals(readFileSync(resolve(entry.path, lock)))) throw Error('changed lock');
  } catch {
    throw Error(`CANDIDATE_LOCK: ${entry.repo}/${lock} must match its commit`);
  }
  if (entry.head !== manifest.repositories.find((expected) => expected.repo === entry.repo).head)
    throw Error(`CANDIDATE_HEAD: ${entry.repo}`);
}
const core = verifyOfficialInput(
  manifest.repositories.find((entry) => entry.repo === 'dsh-agent-workbench').path,
);
finalGroup?.verifyUnchanged();
if (finalGroup)
  execFileSync(
    process.execPath,
    [
      resolve(
        manifest.repositories.find((entry) => entry.repo === 'dsh-agent-workbench').path,
        'scripts/check-agent-knowledge.mjs',
      ),
      '--root',
      manifest.repositories.find((entry) => entry.repo === 'dsh-agent-workbench').path,
      '--config',
      resolve(
        manifest.repositories.find((entry) => entry.repo === 'dsh-agent-workbench').path,
        'agent-knowledge.json',
      ),
    ],
    { stdio: 'inherit' },
  );
if (manifest.core !== core)
  throw Error('CANDIDATE_CORE: binding must match the fixed official input');
console.log(
  JSON.stringify({
    observedAt: new Date().toISOString(),
    stage: 'candidate-input',
    status: 'passed',
    runtime: 'not-observed',
    core,
    repositories,
  }),
);
