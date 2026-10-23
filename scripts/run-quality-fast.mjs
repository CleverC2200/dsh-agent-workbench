import { spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { mkdirSync, writeFileSync } from 'node:fs';
import { runQualityChecks } from './run-quality-checks.mjs';
const { values } = parseArgs({
  options: { 'checks-only': { type: 'boolean' }, 'declarations-in-build': { type: 'boolean' } },
});
const check = (name) => ({
  name,
  execute() {
    const windows = process.platform === 'win32';
    const args = ['run', name];
    if (name === 'check:knowledge' && values['declarations-in-build'])
      args.push('--', '--source-only');
    const child = spawnSync(windows ? 'npm.cmd' : 'npm', args, {
      stdio: 'inherit',
      shell: windows,
    });
    if (child.error || child.signal || child.status !== 0)
      throw Error(child.error?.message ?? child.signal ?? 'exit ' + child.status);
  },
});
// Invalid source references reject this input before dependency-based checks.
const checks = runQualityChecks([check('check:knowledge')]);
if (checks[0].status === 'passed')
  checks.push(
    ...runQualityChecks(
      [
        'lint',
        'format:check',
        values['declarations-in-build'] ? 'check:official-input' : 'typecheck:official',
        ...(!values['checks-only'] ? ['test:quality'] : []),
      ].map(check),
    ),
  );
mkdirSync('.runtime', { recursive: true });
writeFileSync('.runtime/quality-fast.json', JSON.stringify(checks, null, 2) + '\n');
console.log(JSON.stringify(checks));
process.exitCode = checks.every((check) => check.status === 'passed') ? 0 : 1;
