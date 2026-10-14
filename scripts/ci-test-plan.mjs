/** Select required and affected tests from the admitted source group, never a full-suite fallback. */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, globSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';

const digest = (value) => createHash('sha256').update(value).digest('hex');
const git = (root, ...args) =>
  execFileSync('git', ['-C', root, ...args], {
    encoding: 'utf8',
    env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
  });
const sourceFile = /\.(?:[cm]?[jt]sx?|css|html|json|ya?ml)$/;
const testFile = /\.(?:test\.[cm]?[jt]sx?|(?:browser|contract)\.mjs)$/;

function references(file, roots, known, importsOnly = false) {
  const result = new Set();
  const text = readFileSync(file, 'utf8');
  const pattern = importsOnly
    ? /(?:\b(?:from|import)\s*|\b(?:import|require)\s*\()\s*["']([^"'\n]+)["']/g
    : /["'`]([^"'`\n]+)["'`]/g;
  for (const [, name] of text.matchAll(pattern)) {
    if (name.includes('${') || !sourceFile.test(name) || name.length > 300) continue;
    const owner = roots.find((root) => file.startsWith(root + '/'));
    for (const base of [dirname(file), owner].filter(Boolean)) {
      const target = resolve(base, name);
      for (const candidate of [
        target,
        target.replace(/\.js$/, '.ts'),
        target.replace(/\.js$/, '.tsx'),
        target.replace(/\/lib\//, '/src/').replace(/\.js$/, '.ts'),
        target.replace(/\/lib\//, '/src/').replace(/\.js$/, '.tsx'),
      ])
        if (known.has(candidate)) result.add(candidate);
    }
  }
  return result;
}

export function selectCiTests({
  repositories,
  repo,
  base,
  root = repositories.find((entry) => entry.repo === repo)?.path,
}) {
  if (!root || !/^[a-f0-9]{40}$/.test(base ?? ''))
    throw Error('CI_TEST_BASE_REQUIRED: explicit full base commit');
  git(root, 'cat-file', '-e', `${base}^{commit}`);
  const policyBytes = readFileSync(resolve(root, 'scripts/ci-test-policy.json'));
  const policy = JSON.parse(policyBytes);
  if (
    policy.schemaVersion !== 1 ||
    !Array.isArray(policy.required) ||
    !Array.isArray(policy.tests) ||
    !Array.isArray(policy.rules) ||
    policy.required.length === 0 ||
    policy.tests.length === 0
  )
    throw Error('CI_TEST_POLICY_REQUIRED');
  const expand = (patterns) =>
    [
      ...new Set(
        patterns.flatMap((pattern) => {
          if (typeof pattern !== 'string' || pattern.includes('..') || pattern.startsWith('/'))
            throw Error('CI_TEST_PATH_REJECTED');
          const files = globSync(pattern, { cwd: root })
            .filter((file) => testFile.test(file))
            .sort();
          if (!files.length) throw Error(`CI_TEST_FILE_REQUIRED: ${pattern}`);
          return files;
        }),
      ),
    ].sort();
  const required = expand(policy.required),
    pool = expand(policy.tests);
  const own = repositories.find((entry) => entry.repo === repo);
  const diffBase = git(root, 'merge-base', base, own.head).trim();
  const baselineBytes = git(root, 'show', 'HEAD:scripts/quality-peer-baseline.json');
  const baseline = JSON.parse(baselineBytes);
  const changes = repositories.flatMap((entry) => {
    const before =
      entry.repo === repo
        ? diffBase
        : baseline.repositories.find((item) => item.repo === entry.repo)?.head;
    if (!/^[a-f0-9]{40}$/.test(before ?? '')) throw Error('CI_TEST_PEER_BASE_REQUIRED');
    return git(entry.path, 'diff', '--name-only', '--no-renames', '-z', before, entry.head)
      .split('\0')
      .filter(Boolean)
      .map((file) => ({ repo: entry.repo, file, path: resolve(entry.path, file) }));
  });
  const roots = repositories.map((entry) => entry.path);
  const known = new Set(
    repositories.flatMap((entry) =>
      git(entry.path, 'ls-files', '-z')
        .split('\0')
        .filter(
          (file) =>
            file &&
            sourceFile.test(file) &&
            !file.startsWith('lib/') &&
            !/\/(?:vendor|data)\.[cm]?js$/.test(file),
        )
        .map((file) => resolve(entry.path, file)),
    ),
  );
  for (const change of changes) known.add(change.path);
  const graph = new Map();
  const dependencies = (file, importsOnly) => {
    const key = `${importsOnly}:${file}`;
    if (!graph.has(key))
      graph.set(
        key,
        existsSync(file) && sourceFile.test(file)
          ? references(file, roots, known, importsOnly)
          : new Set(),
      );
    return graph.get(key);
  };
  const reaches = (start, target, visited = new Set(), importsOnly = false) => {
    if (start === target) return true;
    if (visited.has(start)) return false;
    visited.add(start);
    return [...dependencies(start, importsOnly)].some((next) =>
      reaches(next, target, visited, importsOnly),
    );
  };
  const selected = new Set(required),
    reasons = {};
  for (const change of changes) {
    const rules = policy.rules.filter(
      (rule) =>
        (!rule.repo || rule.repo === change.repo) && new RegExp(rule.pattern).test(change.file),
    );
    const mapped = rules.flatMap((rule) => expand(rule.tests));
    const matched = rules.some((rule) => rule.exclusive === true)
      ? mapped
      : [...mapped, ...pool.filter((file) => reaches(resolve(root, file), change.path))];
    const files = [...new Set(matched)].sort();
    // Source with no known consumer must be mapped explicitly, rather than silently receiving a green result.
    if (
      !files.length &&
      !rules.length &&
      /^(?:src|scripts|business|static|theme|presets|default-presets|business-resources)\//.test(
        change.file,
      ) &&
      !change.file.endsWith('.md')
    )
      throw Error(`CI_TEST_IMPACT_UNMAPPED: ${change.repo}/${change.file}`);
    for (const file of files) selected.add(file);
    reasons[`${change.repo}/${change.file}`] = files;
  }
  const files = [...selected].sort();
  const profileEntry = repositories.find((entry) => entry.repo === 'dsh-gea-plugin');
  const runtimeFiles =
    repo === 'dsh-gea-plugin'
      ? files.filter((file) =>
          reaches(
            resolve(root, file),
            resolve(profileEntry.path, 'tests/profile.mjs'),
            new Set(),
            true,
          ),
        )
      : [];
  const runtime = runtimeFiles.length > 0;
  const browser =
    runtime ||
    files.some(
      (file) =>
        file.endsWith('.browser.mjs') ||
        /(?:chromium|playwright)/.test(readFileSync(resolve(root, file), 'utf8')),
    );
  return {
    schemaVersion: 1,
    mode: 'required-and-affected',
    repo,
    head: own.head,
    base,
    diffBase,
    policySha256: digest(policyBytes),
    peerBaselineSha256: digest(baselineBytes),
    changes: changes.map(({ repo, file }) => ({ repo, file })),
    required,
    files,
    reasons,
    runtimeFiles,
    runtime,
    browser,
    fullSuite: 'not-run',
  };
}
