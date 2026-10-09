import { readFileSync, realpathSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';

/** Shared developer check. The fixed official baseline is never caller-configurable. */
export function verifyOfficialInput(root = resolve(import.meta.dirname, '..')) {
  let configuration;
  try { configuration = JSON.parse(readFileSync(resolve(root, 'tsconfig.official.json'), 'utf8')); }
  catch { throw Error('OFFICIAL_MATERIAL_REQUIRED: readable tsconfig.official.json'); }
  let cordis;
  try {
    cordis = realpathSync(resolve(root, configuration.compilerOptions.paths['@deepseek-ai/cordis'][0]));
  } catch { throw Error('OFFICIAL_MATERIAL_REQUIRED: @deepseek-ai/cordis declaration'); }
  const official = resolve(dirname(cordis), '../../../..');
  const expected = '5badb15009ae1756c3afe0ae0cef1faafc290ccc';
  const head = execFileSync('git', ['-C', official, 'rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim();
  const dirty = execFileSync(
    'git',
    ['-C', official, 'status', '--porcelain', '--untracked-files=no'],
    { encoding: 'utf8' },
  ).trim();
  if (head !== expected || dirty)
    throw Error(
      `OFFICIAL_INPUT_REQUIRED: expected clean ${expected}; got ${head}${dirty ? ' with tracked changes' : ''}`,
    );
  for (const [name, paths] of Object.entries(configuration.compilerOptions.paths)) {
    if (name.startsWith('@deepseek-ai/') && !paths.some(path => existsSync(resolve(root, path)))) {
      throw Error(`OFFICIAL_MATERIAL_REQUIRED: ${name} (${paths.join(', ')})`);
    }
  }
  return head;
}
if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename))
  console.log(`Official input: ${verifyOfficialInput()}, tracked source clean`);
