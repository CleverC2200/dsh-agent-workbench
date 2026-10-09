import { readFileSync, realpathSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const configuration = JSON.parse(readFileSync(resolve(root, 'tsconfig.official.json'), 'utf8'));
const cordis = realpathSync(resolve(root, configuration.compilerOptions.paths['@deepseek-ai/cordis'][0]));
const official = resolve(dirname(cordis), '../../../..');
const expected = '5badb15009ae1756c3afe0ae0cef1faafc290ccc';
const head = execFileSync('git', ['-C', official, 'rev-parse', 'HEAD'], {encoding:'utf8'}).trim();
const dirty = execFileSync('git', ['-C', official, 'status', '--porcelain', '--untracked-files=no'], {encoding:'utf8'}).trim();
if (head !== expected || dirty) throw Error(`OFFICIAL_INPUT_REQUIRED: expected clean ${expected}; got ${head}${dirty ? ' with tracked changes' : ''}`);
console.log(`Official input: ${head}, tracked source clean`);
