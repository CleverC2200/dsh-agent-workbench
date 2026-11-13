import { readFileSync, realpathSync, existsSync } from 'node:fs';
import { resolve, dirname, relative, isAbsolute, sep } from 'node:path';
import { execFileSync } from 'node:child_process';
import { parseArgs } from 'node:util';

const defaultRegistry = new URL(
  '../../dsh-gea-plugin/scripts/supported-cores.json',
  import.meta.url,
);

export function verifyOfficialCore(official, registry = defaultRegistry) {
  const supportedCores = JSON.parse(readFileSync(registry, 'utf8'));
  const head = execFileSync('git', ['-C', official, 'rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim();
  const dirty = execFileSync(
    'git',
    ['-C', official, 'status', '--porcelain', '--untracked-files=no'],
    { encoding: 'utf8' },
  ).trim();
  if (!supportedCores.some((core) => core.head === head) || dirty)
    throw Error(
      `OFFICIAL_INPUT_REQUIRED: expected a clean registered official Core; got ${head}${dirty ? ' with tracked changes' : ''}`,
    );
  return head;
}

export function verifyOfficialInput(
  root = resolve(import.meta.dirname, '..'),
  { registry = defaultRegistry } = {},
) {
  let configuration;
  try {
    configuration = JSON.parse(readFileSync(resolve(root, 'tsconfig.official.json'), 'utf8'));
  } catch {
    throw Error(`OFFICIAL_MATERIAL_REQUIRED: readable ${resolve(root, 'tsconfig.official.json')}`);
  }
  let cordis;
  try {
    cordis = realpathSync(
      resolve(root, configuration.compilerOptions.paths['@deepseek-ai/cordis'][0]),
    );
  } catch {
    throw Error(`OFFICIAL_MATERIAL_REQUIRED: @deepseek-ai/cordis declaration for ${root}`);
  }
  const official = resolve(dirname(cordis), '../../../..');
  const head = verifyOfficialCore(official, registry);
  for (const [name, paths] of Object.entries(configuration.compilerOptions.paths)) {
    if (!name.startsWith('@deepseek-ai/')) continue;
    const declarations = paths.map((path) => resolve(root, path)).filter(existsSync);
    if (!declarations.length) {
      throw Error(`OFFICIAL_MATERIAL_REQUIRED: ${name} (${paths.join(', ')})`);
    }
    for (const declaration of declarations) {
      const actual = realpathSync(declaration);
      const local = relative(official, actual);
      if (isAbsolute(local) || local === '..' || local.startsWith('..' + sep))
        throw Error(`OFFICIAL_SOURCE_MISMATCH: ${name} (${actual}); expected ${official}`);
    }
  }
  return head;
}
if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(import.meta.filename)) {
  const { values } = parseArgs({
    options: { root: { type: 'string' }, registry: { type: 'string' } },
  });
  if (values.root && !values.registry)
    throw Error(
      'OFFICIAL_REGISTRY_REQUIRED: an explicit consumer requires its registered Core list',
    );
  const root = resolve(values.root ?? resolve(import.meta.dirname, '..'));
  const registry = values.registry ? resolve(root, values.registry) : defaultRegistry;
  const head = verifyOfficialInput(root, { registry });
  console.log(
    values.root
      ? JSON.stringify({
          status: 'passed',
          core: head,
          consumer: root,
          registry,
          tool: import.meta.filename,
        })
      : `Official input: ${head}, tracked source clean`,
  );
}
