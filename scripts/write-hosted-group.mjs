import { appendFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { verifyRegisteredCore } from './candidate-input.mjs';

const { values } = parseArgs({
  options: {
    root: { type: 'string' },
    repo: { type: 'string' },
    'core-head': { type: 'string' },
    'workbench-source': { type: 'boolean' },
  },
});

try {
  const group = [
    ['dsh-agent-manage', process.env.QUALITY_GROUP_MANAGE],
    ['dsh-agent-workbench', process.env.QUALITY_GROUP_WORKBENCH],
    ['dsh-gea-plugin', process.env.QUALITY_GROUP_GEA],
  ];
  if (!group.every(([, head]) => head?.length === 40 && /^[a-f0-9]{40}$/.test(head)))
    throw Error('CANDIDATE_GROUP_REQUIRED: three full immutable commits');
  const own = group.find(([repo]) => repo === values.repo);
  if (!own || own[1] !== process.env.QUALITY_EXPECTED_SHA)
    throw Error('CANDIDATE_EVENT_MISMATCH: group must bind actual own event');
  const groupId = createHash('sha256').update(JSON.stringify(group)).digest('hex');
  if (groupId !== process.env.QUALITY_GROUP_ID)
    throw Error('CANDIDATE_GROUP_HASH: scope tuple changed');
  if (!values.root || Boolean(values['workbench-source']) !== (values.repo === 'dsh-gea-plugin'))
    throw Error('CANDIDATE_CHECKOUT: registered runner layout required');
  const root = resolve(values.root);
  const repositories = group.map(([repo, head]) => ({
    repo,
    head,
    path: resolve(
      root,
      repo === 'dsh-agent-workbench' && values['workbench-source'] ? 'source' : 'candidate',
      repo,
    ),
  }));
  if (repositories.find((entry) => entry.repo === values.repo).path !== process.cwd())
    throw Error('CANDIDATE_CHECKOUT: registered own runner checkout required');
  const core = verifyRegisteredCore(
    values['core-head'],
    repositories.find((entry) => entry.repo === 'dsh-gea-plugin').path,
  );
  const bytes = JSON.stringify({ core, repositories }, null, 2) + '\n';
  const inputSha256 = createHash('sha256').update(bytes).digest('hex');
  writeFileSync(resolve(root, 'candidate-input.json'), bytes, { flag: 'wx' });
  writeFileSync(
    resolve(root, 'candidate-group.json'),
    JSON.stringify({ groupId, group, core, inputSha256, quality: 'not-observed' }, null, 2) + '\n',
    { flag: 'wx' },
  );
  if (process.env.GITHUB_OUTPUT)
    appendFileSync(process.env.GITHUB_OUTPUT, `input-sha256=${inputSha256}\n`);
  console.log(JSON.stringify({ groupId, core, inputSha256, quality: 'not-observed' }));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
