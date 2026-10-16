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
const browserDependency = '@ci/playwright';
const testFile = /\.(?:test\.[cm]?[jt]sx?|(?:browser|contract)\.mjs)$/;

function references(file, roots, known, importsOnly = false) {
  const result = new Map();
  if (/\.(?:json|ya?ml)$/.test(file)) return result;
  const text = readFileSync(file, 'utf8');
  // Keep comments and quoted examples out of the executable syntax we inspect.
  const tokenize = (source) =>
    (
      source.match(
        /\/\/[^\n]*|\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|[\w$]+|[^\s]/g,
      ) ?? []
    ).filter((token) => !token.startsWith('//') && !token.startsWith('/*'));
  const tokens = tokenize(text);
  const literal = (token) => /^["'`]/.test(token ?? '');
  const endOf = (start) => {
    const closers = [];
    for (let end = start; end < tokens.length; end++) {
      const token = tokens[end];
      if (['(', '[', '{'].includes(token)) closers.push({ '(': ')', '[': ']', '{': '}' }[token]);
      else if (token === closers.at(-1)) {
        closers.pop();
        if (!closers.length) return end;
      }
    }
    return start;
  };
  const bindings = new Map();
  const scopes = [];
  const scope = [];
  for (let index = 0; index < tokens.length; index++) {
    if (tokens[index] === '}') scope.pop();
    scopes[index] = [...scope];
    if (tokens[index] === '{') scope.push(index);
  }
  for (let index = 0; index < tokens.length; index++) {
    if (!['const', 'let'].includes(tokens[index]) || tokens[index + 2] !== '=') continue;
    const start = index + 3;
    let end = start;
    while (end < tokens.length && ![';', ','].includes(tokens[end])) {
      if (['(', '[', '{'].includes(tokens[end])) end = endOf(end);
      end++;
    }
    const name = tokens[index + 1];
    if (!bindings.has(name)) bindings.set(name, []);
    bindings.get(name).push({ start, end: end - 1, scope: scopes[index] });
  }
  const argumentsOf = (open) => {
    const ranges = [];
    const close = endOf(open);
    let start = open + 1;
    for (let cursor = start; cursor <= close; cursor++) {
      if (cursor === close || tokens[cursor] === ',') {
        if (start < cursor) ranges.push({ start, end: cursor - 1 });
        start = cursor + 1;
      } else if (['(', '[', '{'].includes(tokens[cursor])) cursor = endOf(cursor);
    }
    return ranges;
  };
  const functions = [];
  for (let index = 0; index < tokens.length; index++) {
    let open, body, bindingStart;
    if (tokens[index] === 'function' && tokens[index + 2] === '(') {
      open = index + 2;
      body = endOf(open) + 1;
    } else if (['const', 'let'].includes(tokens[index]) && tokens[index + 2] === '=') {
      bindingStart = index + 3;
      open = bindingStart + (tokens[bindingStart] === 'async' ? 1 : 0);
      if (
        tokens[open] !== '(' ||
        tokens[endOf(open) + 1] !== '=' ||
        tokens[endOf(open) + 2] !== '>'
      )
        continue;
      body = endOf(open) + 3;
    } else continue;
    const end =
      tokens[body] === '{'
        ? endOf(body)
        : bindingStart === undefined
          ? undefined
          : bindings.get(tokens[index + 1])?.find((entry) => entry.start === bindingStart)?.end;
    if (end === undefined) continue;
    functions.push({
      name: tokens[index + 1],
      nameIndex: index + 1,
      scope: scopes[index],
      body,
      bindingStart,
      end,
      parameters: argumentsOf(open).map(({ start, end }) => (start === end ? tokens[start] : null)),
    });
  }
  // Array callbacks consume the receiver's values; declaration text alone is not a dependency.
  const mappedValues = [];
  for (let index = 2; index < tokens.length; index++) {
    if (tokens[index] !== 'map' || tokens[index - 1] !== '.' || tokens[index + 1] !== '(') continue;
    let parameter = index + 2;
    let arrow = parameter + 1;
    if (tokens[parameter] === '(') {
      arrow = endOf(parameter) + 1;
      if (arrow !== parameter + 3) continue;
      parameter++;
    }
    if (tokens[arrow] !== '=' || tokens[arrow + 1] !== '>') continue;
    let start = index - 2;
    if (tokens[start] === ']') {
      start = tokens.findIndex((token, cursor) => token === '[' && endOf(cursor) === index - 2);
      if (start < 0) continue;
    }
    mappedValues.push({
      name: tokens[parameter],
      body: arrow + 2,
      end: endOf(index + 1),
      start,
      valueEnd: index - 2,
    });
  }
  const pathNames = (start, end, visited = new Set()) => {
    const names = [];
    for (let cursor = start; cursor <= end; cursor++) {
      const token = tokens[cursor];
      if (literal(token)) names.push(token.slice(1, -1));
      else {
        const binding = bindings
          .get(token)
          ?.findLast(
            (entry) =>
              entry.start < cursor &&
              entry.scope.every((block, index) => scopes[cursor][index] === block),
          );
        const owner = functions.findLast(
          (entry) => entry.body < cursor && cursor < entry.end && entry.parameters.includes(token),
        );
        const callback = mappedValues.findLast(
          (entry) => entry.name === token && entry.body <= cursor && cursor < entry.end,
        );
        if (
          binding &&
          (!owner || binding.scope.length > owner.scope.length) &&
          (!callback || binding.start > callback.body)
        ) {
          const key = 'binding:' + binding.start;
          if (visited.has(key)) continue;
          visited.add(key);
          names.push(...pathNames(binding.start, binding.end, visited));
        } else if (callback && (!owner || callback.body > owner.body)) {
          const entry = callback;
          const key = 'mapped:' + entry.body;
          if (visited.has(key)) continue;
          visited.add(key);
          names.push(...pathNames(entry.start, entry.valueEnd, visited));
        } else if (owner) {
          const parameter = owner.parameters.indexOf(token);
          const key = `parameter:${owner.body}:${parameter}`;
          if (visited.has(key)) continue;
          visited.add(key);
          for (let call = 0; call < tokens.length; call++) {
            if (
              tokens[call] !== owner.name ||
              tokens[call + 1] !== '(' ||
              tokens[call - 1] === '.' ||
              functions.some((entry) => entry.nameIndex === call)
            )
              continue;
            const declaration = functions
              .filter(
                (entry) =>
                  entry.name === owner.name &&
                  entry.scope.every((block, index) => scopes[call][index] === block),
              )
              .sort((a, b) => a.scope.length - b.scope.length || a.nameIndex - b.nameIndex)
              .at(-1);
            if (declaration !== owner) continue;
            const shadow = bindings
              .get(owner.name)
              ?.findLast(
                (entry) =>
                  entry.start < call &&
                  entry.scope.every((block, index) => scopes[call][index] === block),
              );
            if (
              shadow &&
              shadow.scope.length >= owner.scope.length &&
              shadow.start !== owner.bindingStart
            )
              continue;
            if (
              functions.some(
                (entry) =>
                  entry.body < call &&
                  call < entry.end &&
                  entry.parameters.includes(owner.name) &&
                  entry.scope.length >= owner.scope.length,
              )
            )
              continue;
            const argument = argumentsOf(call + 1)[parameter];
            if (argument) names.push(...pathNames(argument.start, argument.end, visited));
          }
        }
      }
    }
    return names;
  };
  const names = [];
  // esbuild executes stdin.contents as source, so its imports are real dependency edges.
  for (let index = 0; index < tokens.length; index++) {
    if (tokens[index] !== 'stdin' || tokens[index + 1] !== ':' || tokens[index + 2] !== '{')
      continue;
    const end = endOf(index + 2);
    for (let cursor = index + 3; cursor < end; cursor++) {
      if (tokens[cursor] !== 'contents') continue;
      const start = tokens[cursor + 1] === ':' ? cursor + 2 : cursor;
      let valueEnd = start;
      while (valueEnd + 1 < end && ![',', '}'].includes(tokens[valueEnd + 1])) {
        if (['(', '[', '{'].includes(tokens[valueEnd])) valueEnd = endOf(valueEnd);
        else valueEnd++;
      }
      const source = pathNames(start, valueEnd).flatMap(tokenize);
      for (let offset = 0; offset < source.length; offset++) {
        if (['from', 'import'].includes(source[offset]) && literal(source[offset + 1]))
          names.push([source[offset + 1].slice(1, -1), true, true]);
        else if (
          ['import', 'require'].includes(source[offset]) &&
          source[offset + 1] === '(' &&
          literal(source[offset + 2])
        )
          names.push([source[offset + 2].slice(1, -1), true, true]);
      }
    }
  }
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (['from', 'import'].includes(token) && literal(tokens[index + 1]))
      names.push([tokens[index + 1].slice(1, -1), true, true]);
    if (['import', 'require'].includes(token) && tokens[index + 1] === '(') {
      const argument = argumentsOf(index + 1)[0];
      if (argument)
        for (const name of pathNames(argument.start, argument.end)) names.push([name, true, true]);
    }
    if (importsOnly) continue;
    let start;
    let recursive;
    if (token === 'entryPoints' && tokens[index + 1] === ':' && tokens[index + 2] === '[') {
      start = index + 2;
      recursive = true;
    } else if (['readFile', 'readFileSync'].includes(token) && tokens[index + 1] === '(') {
      start = index + 1;
      recursive = false;
    } else if (
      ['spawn', 'spawnSync', 'execFile', 'execFileSync', 'fork'].includes(token) &&
      tokens[index + 1] === '('
    ) {
      start = index + 1;
      recursive = true;
    } else if (
      token === 'name' &&
      tokens[index + 1] === ':' &&
      ['resolve', 'join'].includes(tokens[index + 2]) &&
      tokens[index + 3] === '('
    ) {
      // Cordis plugin entries execute the named module, including lib -> src inputs.
      start = index + 3;
      recursive = true;
    }
    if (start === undefined) continue;
    for (const name of pathNames(start, endOf(start))) names.push([name, recursive]);
  }
  for (const [name, recursive, module] of names) {
    if (module && /^(?:@playwright\/test|playwright(?:-core)?)(?:\/|$)/.test(name)) {
      result.set(browserDependency, true);
      continue;
    }
    if (
      name.includes('${') ||
      (!sourceFile.test(name) && !(recursive && name.startsWith('.'))) ||
      name.length > 300
    )
      continue;
    const owner = roots.find((root) => file.startsWith(root + '/'));
    for (const base of [dirname(file), owner].filter(Boolean)) {
      const target = resolve(base, name);
      for (const candidate of [
        target,
        target.replace(/\.js$/, '.ts'),
        target.replace(/\.js$/, '.tsx'),
        target.replace(/\/lib\//, '/src/').replace(/\.js$/, '.ts'),
        target.replace(/\/lib\//, '/src/').replace(/\.js$/, '.tsx'),
        ...['.ts', '.tsx', '.js', '.mjs', '/index.ts', '/index.tsx', '/index.js', '/index.mjs'].map(
          (extension) => target + extension,
        ),
      ])
        if (known.has(candidate)) result.set(candidate, result.get(candidate) || recursive);
    }
  }
  return result;
}

export function selectCiTests({
  repositories,
  repo,
  base,
  testOwners = {},
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
  const pool = expand(policy.tests);
  if (!testOwners || typeof testOwners !== 'object' || Array.isArray(testOwners))
    throw Error('CI_TEST_OWNER_REQUIRED: explicit test-pool files required');
  const ownership = Object.entries(testOwners);
  for (const [child, owner] of ownership) {
    if (
      !pool.includes(child) ||
      typeof owner !== 'string' ||
      !pool.includes(owner) ||
      Object.hasOwn(testOwners, owner)
    )
      throw Error(`CI_TEST_OWNER_REQUIRED: ${child} -> ${owner}`);
  }
  const executedBy = {};
  const directFile = (file) => {
    if (!Object.hasOwn(testOwners, file)) return file;
    executedBy[file] = testOwners[file];
    return testOwners[file];
  };
  const required = [...new Set(expand(policy.required).map(directFile))].sort();
  if (
    policy.browserFixtures !== undefined &&
    (!Array.isArray(policy.browserFixtures) ||
      policy.browserFixtures.some((file) => typeof file !== 'string' || !pool.includes(file)))
  )
    throw Error('CI_TEST_BROWSER_FIXTURE_REJECTED: explicit test-pool files required');
  const browserFixtures = [...new Set(policy.browserFixtures ?? [])].sort();
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
      .map((file) => ({
        repo: entry.repo,
        file,
        path: resolve(entry.path, file),
      }));
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
  const ownedPaths = ownership.map(([child, owner]) => [
    resolve(root, child),
    resolve(root, owner),
  ]);
  const graph = new Map();
  const dependencies = (file, importsOnly) => {
    const key = `${importsOnly}:${file}`;
    if (!graph.has(key)) {
      const edges =
        existsSync(file) && sourceFile.test(file)
          ? references(file, roots, known, importsOnly)
          : new Map();
      for (const [child, owner] of ownedPaths) if (file === owner) edges.set(child, true);
      graph.set(key, edges);
    }
    return graph.get(key);
  };
  const reaches = (start, target, visited = new Set(), importsOnly = false) => {
    if (start === target) return true;
    if (visited.has(start)) return false;
    visited.add(start);
    return [...dependencies(start, importsOnly)].some(
      ([next, recursive]) =>
        next === target || (recursive && reaches(next, target, visited, importsOnly)),
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
    const files = [...new Set(matched.map(directFile))].sort();
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
  for (const file of browserFixtures)
    if (
      runtimeFiles.includes(file) ||
      dependencies(resolve(root, file), false).has(browserDependency)
    )
      throw Error(`CI_TEST_BROWSER_FIXTURE_REJECTED: real browser consumer ${file}`);
  const browserFiles = files.filter(
    (file) =>
      runtimeFiles.includes(file) ||
      (!browserFixtures.includes(file) && reaches(resolve(root, file), browserDependency)),
  );
  const browser = browserFiles.length > 0;
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
    executedBy,
    reasons,
    runtimeFiles,
    browserFiles,
    browserFixtures: browserFixtures.filter((file) => selected.has(file)),
    runtime,
    browser,
    fullSuite: 'not-run',
  };
}
