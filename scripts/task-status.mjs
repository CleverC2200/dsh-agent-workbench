import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { candidatePackageNames, verifyCandidatePackageIdentity } from './candidate-input.mjs';

/** Observe an explicit task input; admission and runtime receipts remain separate. */
try {
  const { values } = parseArgs({ options: { input: { type: 'string' } } });
  if (!values.input) throw Error('TASK_STATUS_INPUT_REQUIRED: --input <task JSON>');
  const input = resolve(values.input);
  const bytes = readFileSync(input);
  const { repositories } = JSON.parse(bytes.toString('utf8'));
  if (
    !Array.isArray(repositories) ||
    repositories.length !== Object.keys(candidatePackageNames).length ||
    new Set(repositories.map((row) => row?.repo)).size !== repositories.length ||
    !repositories.every(
      (row) =>
        row &&
        Object.hasOwn(candidatePackageNames, row.repo) &&
        typeof row.path === 'string' &&
        isAbsolute(row.path) &&
        typeof row.head === 'string' &&
        /^[a-f0-9]{40}$/.test(row.head),
    )
  )
    throw Error(
      'TASK_STATUS_INPUT_INVALID: three registered repositories, absolute paths and full heads',
    );
  const startedAt = new Date().toISOString();
  const rows = repositories.map(({ repo, path, head: expectedHead }) => {
    const observation = { repo, declaredPath: path, expectedHead };
    try {
      const checkout = realpathSync(path);
      const git = (...args) =>
        execFileSync('git', ['-C', checkout, ...args], {
          encoding: 'utf8',
          env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
          stdio: ['ignore', 'pipe', 'pipe'],
        });
      const head = git('rev-parse', 'HEAD').trim();
      const changes = git('status', '--porcelain=v1', '--untracked-files=normal')
        .split('\n')
        .filter(Boolean);
      Object.assign(observation, {
        checkout,
        head,
        matches: head === expectedHead,
        dirty: changes.length > 0,
        changes,
      });
      verifyCandidatePackageIdentity({ repo, path: checkout });
    } catch (error) {
      Object.assign(observation, { error: error.message });
    }
    return { ...observation, observedAt: new Date().toISOString() };
  });
  console.log(
    JSON.stringify(
      {
        scope: 'source-observation',
        input,
        inputSha256: createHash('sha256').update(bytes).digest('hex'),
        startedAt,
        observedAt: new Date().toISOString(),
        repositories: rows,
      },
      null,
      2,
    ),
  );
  if (rows.some((row) => row.error)) process.exitCode = 1;
} catch (error) {
  console.error(`TASK_STATUS_INPUT: ${error.message}`);
  process.exitCode = 1;
}
