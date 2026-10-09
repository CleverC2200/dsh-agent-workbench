import { readFileSync, accessSync, constants } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { verifyOfficialInput } from './verify-official-input.mjs';
import { parseArgs } from 'node:util';

const repositoryPackages = {
  'dsh-agent-workbench': '@cleverc2200/dsh-agent-workbench',
  'dsh-agent-manage': 'dsh-agent-manage',
  'dsh-gea-plugin': '@cleverc2200/gea-dsh-prototype',
};

const { values } = parseArgs({ options: { input: { type: 'string' }, checkout: { type: 'string' } } });
if (!values.input || !values.checkout) throw Error('CANDIDATE_INPUT_REQUIRED: --input and --checkout');
const manifest = JSON.parse(readFileSync(resolve(values.input), 'utf8'));
for (const repo of Object.keys(repositoryPackages)) {
  const entries = manifest.repositories?.filter(entry => entry.repo === repo);
  if (entries?.length !== 1 || !entries[0].path || !entries[0].head) throw Error(`CANDIDATE_PEER_REQUIRED: ${repo}`);
}
if (!manifest.repositories?.some(entry => resolve(entry.path) === resolve(values.checkout))) {
  throw Error('CANDIDATE_CHECKOUT: use a checkout registered in the input set');
}

const repositories = manifest.repositories.map(entry => {
  let head;
  try { head = execFileSync('git', ['-C', entry.path, 'rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); }
  catch { throw Error(`CANDIDATE_PEER_REQUIRED: ${entry.repo} checkout ${entry.path}`); }
  return { repo: entry.repo, path: entry.path, head };
});
for (const entry of repositories) {
  for (const file of ['package.json', entry.repo === 'dsh-agent-workbench' ? 'package-lock.json' : 'pnpm-lock.yaml']) {
    try { accessSync(resolve(entry.path, file), constants.R_OK); }
    catch { throw Error(`CANDIDATE_MATERIAL_REQUIRED: ${entry.repo}/${file}`); }
  }
  const dirty = execFileSync('git', ['-C', entry.path, 'status', '--porcelain', '--untracked-files=all'], { encoding: 'utf8' }).trim();
  if (dirty) throw Error(`CANDIDATE_DIRTY: ${entry.repo}\n${dirty}`);
  const lock = entry.repo === 'dsh-agent-workbench' ? 'package-lock.json' : 'pnpm-lock.yaml';
  try {
    const frozen = execFileSync('git', ['-C', entry.path, 'show', `HEAD:${lock}`], { stdio: ['ignore', 'pipe', 'pipe'] });
    if (!frozen.equals(readFileSync(resolve(entry.path, lock)))) throw Error('changed lock');
  } catch { throw Error(`CANDIDATE_LOCK: ${entry.repo}/${lock} must match its commit`); }
  if (entry.head !== manifest.repositories.find(expected => expected.repo === entry.repo).head) throw Error(`CANDIDATE_HEAD: ${entry.repo}`);
  const packageName = JSON.parse(readFileSync(resolve(entry.path, 'package.json'), 'utf8')).name;
  const expectedPackageName = repositoryPackages[entry.repo];
  if (packageName !== expectedPackageName) {
    throw Error(`CANDIDATE_PACKAGE_IDENTITY: ${entry.repo} expects package.json.name=${expectedPackageName}; observed ${JSON.stringify(packageName)}`);
  }
}
const core = verifyOfficialInput(manifest.repositories.find(entry => entry.repo === 'dsh-agent-workbench').path);
if (manifest.core !== core) throw Error('CANDIDATE_CORE: binding must match the fixed official input');
console.log(JSON.stringify({ observedAt: new Date().toISOString(), stage: 'candidate-input', status: 'passed', runtime: 'not-observed', core, repositories }));
