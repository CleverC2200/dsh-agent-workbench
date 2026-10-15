import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, realpathSync, lstatSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { candidatePackageNames, verifyCandidatePackageIdentity } from './candidate-input.mjs';

/** Observe an explicit task input; admission and runtime receipts remain separate. */
try {
  const { values } = parseArgs({
    options: {
      input: { type: 'string' },
      'check-resume': { type: 'boolean' },
      owner: { type: 'string' },
    },
  });
  if (!values.input) throw Error('TASK_STATUS_INPUT_REQUIRED: --input <task JSON>');
  const input = resolve(values.input);
  const bytes = readFileSync(input);
  const manifest = JSON.parse(bytes.toString('utf8'));
  const { repositories } = manifest;
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
  const observeRepository = ({ repo, path, head: expectedHead }) => {
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
  };
  let rows = repositories.map(observeRepository);
  const inputSha256 = createHash('sha256').update(bytes).digest('hex');
  let resume;
  if (values['check-resume']) {
    if (typeof manifest.execution !== 'string' || !manifest.execution.trim())
      throw Error('EXECUTION_INVALID: current execution file pointer required');
    const executionFile = resolve(dirname(input), manifest.execution);
    const executionBytes = readFileSync(executionFile);
    const execution = JSON.parse(executionBytes);
    const nonempty = (value) => typeof value === 'string' && value.trim().length > 0;
    if (
      !execution ||
      execution.task !== manifest.task ||
      !nonempty(manifest.task) ||
      execution.inputSha256 !== inputSha256 ||
      !nonempty(execution.owner) ||
      !nonempty(execution.authorization) ||
      !nonempty(execution.handoff) ||
      !Array.isArray(execution.stopMarkers) ||
      !execution.stopMarkers.length ||
      !execution.stopMarkers.every(nonempty) ||
      !Array.isArray(execution.pullRequests)
    )
      throw Error(
        'EXECUTION_INVALID: task-bound current owner, source pointers, stop markers and PR array required',
      );
    const sources = [execution.authorization, execution.handoff].map((file) => {
      const path = resolve(dirname(executionFile), file);
      let source;
      try {
        source = readFileSync(path);
      } catch {
        throw Error(`EXECUTION_INVALID: unreadable source ${path}`);
      }
      if (!source.length) throw Error(`EXECUTION_INVALID: empty source ${path}`);
      return { path, sha256: createHash('sha256').update(source).digest('hex') };
    });
    const reasons = [];
    if (!values.owner || execution.owner !== values.owner) reasons.push('OWNER_MISMATCH');
    if (execution.state !== 'in-progress') reasons.push('EXECUTION_INACTIVE');
    const readMarkers = () =>
      execution.stopMarkers.map((file) => {
        const path = resolve(dirname(executionFile), file);
        try {
          lstatSync(path);
          return { path, present: true };
        } catch (error) {
          if (error.code === 'ENOENT') return { path, present: false };
          throw error;
        }
      });
    let markers = readMarkers();
    if (markers.some((marker) => marker.present)) reasons.push('STOP_MARKER');
    for (const pr of execution.pullRequests) {
      const source = repositories.find((row) => row.repo === pr?.repo);
      if (
        !source ||
        !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(pr.repository ?? '') ||
        !Number.isSafeInteger(pr.number) ||
        pr.number < 1 ||
        pr.head !== source.head ||
        !/^[a-f0-9]{40}$/.test(pr.base ?? '') ||
        !nonempty(pr.headRef) ||
        !nonempty(pr.baseRef)
      )
        throw Error(
          'EXECUTION_INVALID: complete PR expectation bound to a registered source required',
        );
    }
    const pullRequests = execution.pullRequests.map((pr) => {
      try {
        const actual = JSON.parse(
          execFileSync(
            'gh',
            ['api', '--method', 'GET', `repos/${pr.repository}/pulls/${pr.number}`],
            {
              encoding: 'utf8',
              stdio: ['ignore', 'pipe', 'pipe'],
              timeout: 30000,
            },
          ),
        );
        const matches =
          actual?.state === 'open' &&
          actual.number === pr.number &&
          actual.head?.sha === pr.head &&
          actual.base?.sha === pr.base &&
          actual.head?.ref === pr.headRef &&
          actual.base?.ref === pr.baseRef &&
          actual.base?.repo?.full_name === pr.repository;
        if (!matches) reasons.push(`PR_MISMATCH: ${pr.repository}#${pr.number}`);
        return { ...pr, actual, matches, observedAt: new Date().toISOString() };
      } catch (error) {
        reasons.push(`PR_QUERY_FAILED: ${pr.repository}#${pr.number}`);
        return {
          ...pr,
          matches: false,
          error: error.message,
          observedAt: new Date().toISOString(),
        };
      }
    });
    // Remote observation may take time; report current local sources, not the earlier snapshot.
    rows = repositories.map(observeRepository);
    for (const row of rows) {
      if (row.error) reasons.push(`SOURCE_ERROR: ${row.repo}`);
      if (row.dirty) reasons.push(`SOURCE_DIRTY: ${row.repo}`);
      if (!row.matches) reasons.push(`SOURCE_HEAD_MISMATCH: ${row.repo}`);
    }
    if (!executionBytes.equals(readFileSync(executionFile))) reasons.push('EXECUTION_CHANGED');
    if (!bytes.equals(readFileSync(input))) reasons.push('INPUT_CHANGED');
    for (const source of sources) {
      if (createHash('sha256').update(readFileSync(source.path)).digest('hex') !== source.sha256)
        reasons.push(`SOURCE_RECORD_CHANGED: ${source.path}`);
    }
    markers = readMarkers();
    if (markers.some((marker) => marker.present) && !reasons.includes('STOP_MARKER'))
      reasons.push('STOP_MARKER');
    resume = {
      allowed: reasons.length === 0,
      owner: execution.owner,
      lock: false,
      authority:
        'projection consistency only; existing human authorization and handoff remain the source',
      validity: 'observation only; later writes still require expected-head checks',
      remoteScope: 'registered PRs only; an empty list makes no claim about other PRs',
      executionFile,
      executionSha256: createHash('sha256').update(executionBytes).digest('hex'),
      sources,
      markers,
      pullRequests,
      reasons,
    };
    if (!resume.allowed) process.exitCode = 1;
  }
  console.log(
    JSON.stringify(
      {
        scope: resume ? 'resume-check' : 'source-observation',
        input,
        inputSha256,
        startedAt,
        observedAt: new Date().toISOString(),
        repositories: rows,
        ...(resume && { resume }),
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
