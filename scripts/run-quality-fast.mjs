import { spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { mkdirSync, writeFileSync } from 'node:fs';
import { runQualityChecks } from './run-quality-checks.mjs';
const { values } = parseArgs({
  options: { 'checks-only': { type: 'boolean' }, build: { type: 'boolean' } },
});
function run(command, args) {
  const windows = process.platform === 'win32' && command === 'npm';
  const child = spawnSync(windows ? 'npm.cmd' : command, args, {
    stdio: 'inherit',
    shell: windows,
  });
  if (child.error || child.signal || child.status !== 0)
    throw Error(child.error?.message ?? child.signal ?? 'exit ' + child.status);
}
const check = (name) => ({ name, execute: () => run('npm', ['run', name]) });
const official = values.build
  ? {
      name: 'build:core',
      execute() {
        run(process.execPath, ['scripts/generate-plugin-package-version.mjs', '--check']);
        run('npm', ['run', 'build:core']);
      },
    }
  : check('typecheck:official');
// Invalid source references reject this input before dependency-based checks.
const checks = runQualityChecks([check('check:knowledge')]);
if (checks[0].status === 'passed')
  checks.push(
    ...runQualityChecks([
      ...['lint', 'format:check'].map(check),
      official,
      ...(!values['checks-only'] ? [check('test:quality')] : []),
    ]),
  );
mkdirSync('.runtime', { recursive: true });
writeFileSync('.runtime/quality-fast.json', JSON.stringify(checks, null, 2) + '\n');
console.log(JSON.stringify(checks));
process.exitCode = checks.every((check) => check.status === 'passed') ? 0 : 1;
