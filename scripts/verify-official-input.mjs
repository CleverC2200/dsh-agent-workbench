import { readFileSync, realpathSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';

/** Only registered official baselines and the private security candidate are accepted, with clean tracked source. */
export function verifyOfficialCore(official) {
  const supportedCores = JSON.parse(readFileSync(
    new URL('../../dsh-gea-plugin/scripts/supported-cores.json', import.meta.url),
    'utf8',
  ));
  const head = execFileSync('git', ['-C', official, 'rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim();
  const dirty = execFileSync(
    'git',
    ['-C', official, 'status', '--porcelain', '--untracked-files=no'],
    { encoding: 'utf8' },
  ).trim();
  if (!supportedCores.some(core => core.head === head) || dirty)
    throw Error(
      `OFFICIAL_INPUT_REQUIRED: expected a clean registered official Core; got ${head}${dirty ? ' with tracked changes' : ''}`,
    );
  return head;
}

/** Resolve the declaration source before verifying the same official Core used by the compiler. */
export function verifyOfficialInput(root = resolve(import.meta.dirname, '..')) {
  let configuration;
  try {
    configuration = JSON.parse(readFileSync(resolve(root, 'tsconfig.official.json'), 'utf8'));
  } catch {
    throw Error('OFFICIAL_MATERIAL_REQUIRED: readable tsconfig.official.json');
  }
  let cordis;
  try {
    cordis = realpathSync(
      resolve(root, configuration.compilerOptions.paths['@deepseek-ai/cordis'][0]),
    );
  } catch {
    throw Error('OFFICIAL_MATERIAL_REQUIRED: @deepseek-ai/cordis declaration');
  }
  const official = resolve(dirname(cordis), '../../../..');
  const head = verifyOfficialCore(official);
  for (const [name, paths] of Object.entries(configuration.compilerOptions.paths)) {
    if (
      name.startsWith('@deepseek-ai/') &&
      !paths.some((path) => existsSync(resolve(root, path)))
    ) {
      throw Error(`OFFICIAL_MATERIAL_REQUIRED: ${name} (${paths.join(', ')})`);
    }
  }
  return head;
}
if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename))
  console.log(`Official input: ${verifyOfficialInput()}, tracked source clean`);
