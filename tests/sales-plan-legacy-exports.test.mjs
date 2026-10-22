import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const file =
  'src/workbench/original/workbenches/regionalApproval/models/salesPlanCorrectionModel.ts';
const baseline = '52337d4737f1f6405a6fe08e45bb4cea4134bcfb';
const original = execFileSync('git', ['show', `${baseline}:${file}`], { encoding: 'utf8' });
const current = readFileSync(file, 'utf8');
for (const name of ['correctionAccess', 'correctionAdjustments']) {
  test(`${name} remains an unchanged compatibility export for existing Host peers`, () => {
    const expression = new RegExp(`export function ${name}\\([\\s\\S]*?\\n\\}`);
    const previous = original.match(expression)?.[0];
    const retained = current.match(expression)?.[0];
    assert.ok(previous);
    assert.ok(retained);
    assert.equal(retained.replace(/\s/g, ''), previous.replace(/\s/g, ''));
    assert.match(
      readFileSync('src/sales-plan.ts', 'utf8'),
      /export \* from .*salesPlanCorrectionModel/,
    );
  });
}
