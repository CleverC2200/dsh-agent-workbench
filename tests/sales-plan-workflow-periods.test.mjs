import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkflowPeriodLoader } from '../src/workbench/workflow-loader.ts';
import { salesPlanWorkflow } from '../src/workbench/original/salesPlanWorkflow.ts';

const workflowRows = (nodes) =>
  nodes.map((nodeNum, examineLevel) => ({ typeCode: 'Y', examineLevel, nodeNum }));

test('config and periods start together and release the approval queue after both finish', async () => {
  for (const first of ['workflow', 'periods']) {
    const workflow = Promise.withResolvers();
    const periods = Promise.withResolvers();
    const started = [];
    const load = createWorkflowPeriodLoader(() => {
      started.push('workflow');
      return workflow.promise;
    });
    let ready = false;
    const result = load(() => {
      started.push('periods');
      return periods.promise;
    }).then((value) => {
      ready = true;
      assert.equal(salesPlanWorkflow('Y').pending('area'), 3);
      return value;
    });
    const outcomes = { workflow: workflowRows(['0', '3', '4', 'Y']), periods: ['2026-12'] };
    const reads = { workflow, periods };
    assert.deepEqual(started, ['workflow', 'periods']);
    reads[first].resolve(outcomes[first]);
    await Promise.resolve();
    assert.equal(ready, false);
    assert.equal(salesPlanWorkflow('Y').valid, false);
    const second = first === 'workflow' ? 'periods' : 'workflow';
    reads[second].resolve(outcomes[second]);
    assert.deepEqual(await result, outcomes.periods);
  }
});

test('either read failing cancels its sibling and leaves approval configuration unavailable', async () => {
  for (const failure of ['workflow', 'periods']) {
    const error = Error(failure);
    let sibling;
    const read = (kind, signal) => {
      if (kind === failure) return Promise.reject(error);
      sibling = signal;
      return new Promise((_, reject) =>
        signal.addEventListener('abort', () => reject(signal.reason), { once: true }),
      );
    };
    const load = createWorkflowPeriodLoader((signal) => read('workflow', signal));
    await assert.rejects(
      load((signal) => read('periods', signal)),
      (reason) => reason === error,
    );
    assert.equal(sibling.aborted, true);
    assert.equal(salesPlanWorkflow('Y').valid, false);
  }
});

test('superseded reads cannot replace the current approval config even if the transport finishes late', async () => {
  const firstWorkflow = Promise.withResolvers();
  const firstPeriods = Promise.withResolvers();
  const newRows = workflowRows(['0', '4', 'Y']);
  let firstSignal;
  const load = createWorkflowPeriodLoader((signal) => {
    if (firstSignal) return Promise.resolve(newRows);
    firstSignal = signal;
    return firstWorkflow.promise;
  });
  const old = assert.rejects(
    load(() => firstPeriods.promise),
    { name: 'AbortError' },
  );
  assert.deepEqual(await load(async () => ['2026-12']), ['2026-12']);
  assert.equal(firstSignal.aborted, true);
  firstPeriods.resolve(['2026-11']);
  firstWorkflow.resolve(workflowRows(['0', '3', '4', 'Y']));
  await old;
  assert.deepEqual(salesPlanWorkflow('Y').chain, newRows);
});
