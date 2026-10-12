import { appendFileSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { parseArgs } from 'node:util';

const names = ['dsh-agent-manage', 'dsh-agent-workbench', 'dsh-gea-plugin'];
const fullSha = (value) =>
  typeof value === 'string' && value.length === 40 && /^[a-f0-9]{40}$/.test(value);
const digest = (value) => createHash('sha256').update(value).digest('hex');
const { values } = parseArgs({ options: { repo: { type: 'string' } } });

try {
  const repo = values.repo;
  if (
    !names.includes(repo) ||
    process.env.GITHUB_REPOSITORY !== `CleverC2200/${repo}` ||
    process.env.QUALITY_SCOPE_ALLOWED !== 'true'
  )
    throw Error('CANDIDATE_SCOPE_REQUIRED: registered same-repository read-only event');
  const event = process.env.GITHUB_EVENT_NAME;
  if (!['push', 'pull_request', 'workflow_dispatch'].includes(event))
    throw Error('CANDIDATE_SCOPE_REQUIRED: supported source event');
  const expected = process.env.QUALITY_EXPECTED_SHA;
  const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
  if (!fullSha(expected) || git('rev-parse', 'HEAD') !== expected)
    throw Error('CANDIDATE_EVENT_MISMATCH: own checkout must equal actual event');
  let group,
    baselineId = '';
  const sourceKind = event === 'workflow_dispatch' ? 'joint-group' : 'source-event';
  if (sourceKind === 'joint-group') {
    group = [
      ['dsh-agent-manage', process.env.QUALITY_GROUP_MANAGE],
      ['dsh-agent-workbench', process.env.QUALITY_GROUP_WORKBENCH],
      ['dsh-gea-plugin', process.env.QUALITY_GROUP_GEA],
    ];
    if (
      !group.every(([, head]) => fullSha(head)) ||
      group.find(([name]) => name === repo)[1] !== expected
    )
      throw Error(
        'CANDIDATE_EVENT_MISMATCH: complete immutable joint tuple must bind actual own event',
      );
  } else {
    const file = 'scripts/quality-peer-baseline.json';
    let bytes, baseline;
    try {
      bytes = readFileSync(file);
      const committed = execFileSync('git', ['show', `HEAD:${file}`]);
      if (!committed.equals(bytes)) throw Error('uncommitted baseline');
      baseline = JSON.parse(bytes);
    } catch (error) {
      throw Error(`CANDIDATE_BASELINE_REQUIRED: committed frozen peer source; ${error.message}`);
    }
    if (
      !baseline ||
      Object.keys(baseline).sort().join(',') !== 'repositories,schemaVersion' ||
      baseline.schemaVersion !== 1 ||
      !Array.isArray(baseline.repositories) ||
      baseline.repositories.length !== 3
    )
      throw Error('CANDIDATE_BASELINE_REQUIRED: version 1 with exactly three repository heads');
    if (
      !baseline.repositories.every(
        (entry) =>
          entry &&
          Object.keys(entry).sort().join(',') === 'head,repo' &&
          names.includes(entry.repo) &&
          fullSha(entry.head),
      ) ||
      new Set(baseline.repositories.map((entry) => entry.repo)).size !== 3
    )
      throw Error('CANDIDATE_BASELINE_REQUIRED: registered roles and full commits only');
    baselineId = digest(bytes);
    group = names.map((name) => [
      name,
      name === repo ? expected : baseline.repositories.find((entry) => entry.repo === name).head,
    ]);
  }
  const output = {
    'gea-sha': group.find(([name]) => name === 'dsh-gea-plugin')[1],
    'workbench-sha': group.find(([name]) => name === 'dsh-agent-workbench')[1],
    'manage-sha': group.find(([name]) => name === 'dsh-agent-manage')[1],
    'group-id': digest(JSON.stringify(group)),
    'source-kind': sourceKind,
    'baseline-id': baselineId,
  };
  if (process.env.GITHUB_OUTPUT)
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      Object.entries(output)
        .map(([key, value]) => `${key}=${value}\n`)
        .join(''),
    );
  console.log(JSON.stringify(output));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
