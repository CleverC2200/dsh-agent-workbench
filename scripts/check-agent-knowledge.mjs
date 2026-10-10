import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve, sep, relative } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { parseArgs } from 'node:util';

// Command metadata audited read-only with npm11.11.0 --help/cmd-list and pnpm11.17.0/11.27.0 help -a.
// Explicit run and lifecycle commands always resolve project scripts; compact metadata actions do not.
const npmCommands = new Set([
  'access',
  'adduser',
  'audit',
  'bugs',
  'cache',
  'ci',
  'completion',
  'config',
  'dedupe',
  'deprecate',
  'diff',
  'dist-tag',
  'docs',
  'doctor',
  'edit',
  'exec',
  'explain',
  'explore',
  'find-dupes',
  'fund',
  'get',
  'help',
  'help-search',
  'init',
  'install',
  'install-ci-test',
  'install-test',
  'link',
  'll',
  'login',
  'logout',
  'ls',
  'org',
  'outdated',
  'owner',
  'pack',
  'ping',
  'pkg',
  'prefix',
  'profile',
  'prune',
  'publish',
  'query',
  'rebuild',
  'repo',
  'root',
  'sbom',
  'search',
  'set',
  'shrinkwrap',
  'star',
  'stars',
  'team',
  'token',
  'trust',
  'undeprecate',
  'uninstall',
  'unpublish',
  'unstar',
  'update',
  'version',
  'view',
  'whoami',
]);
const npmAliases = {
  author: 'owner',
  home: 'docs',
  issues: 'bugs',
  info: 'view',
  show: 'view',
  find: 'search',
  add: 'install',
  unlink: 'uninstall',
  remove: 'uninstall',
  rm: 'uninstall',
  r: 'uninstall',
  un: 'uninstall',
  rb: 'rebuild',
  list: 'ls',
  ln: 'link',
  create: 'init',
  i: 'install',
  it: 'install-test',
  cit: 'install-ci-test',
  up: 'update',
  c: 'config',
  s: 'search',
  se: 'search',
  tst: 'test',
  t: 'test',
  ddp: 'dedupe',
  v: 'view',
  'run-script': 'run',
  'clean-install': 'ci',
  'clean-install-test': 'install-ci-test',
  x: 'exec',
  why: 'explain',
  la: 'll',
  verison: 'version',
  ic: 'ci',
  innit: 'init',
  in: 'install',
  ins: 'install',
  inst: 'install',
  insta: 'install',
  instal: 'install',
  isnt: 'install',
  isnta: 'install',
  isntal: 'install',
  isntall: 'install',
  'install-clean': 'ci',
  'isntall-clean': 'ci',
  hlep: 'help',
  'dist-tags': 'dist-tag',
  upgrade: 'update',
  udpate: 'update',
  rum: 'run',
  sit: 'install-ci-test',
  urn: 'run',
  ogr: 'org',
  'add-user': 'adduser',
};
const pnpmCommands = new Set([
  'add',
  'approve-builds',
  'audit',
  'bin',
  'c',
  'cache',
  'cat-file',
  'cat-index',
  'clean',
  'config',
  'create',
  'dedupe',
  'deploy',
  'dlx',
  'env',
  'exec',
  'fetch',
  'find-hash',
  'i',
  'ignored-builds',
  'import',
  'init',
  'install',
  'install-test',
  'it',
  'licenses',
  'link',
  'list',
  'ln',
  'ls',
  'outdated',
  'pack',
  'patch',
  'patch-commit',
  'patch-remove',
  'prune',
  'publish',
  'rb',
  'rebuild',
  'remove',
  'rm',
  'root',
  'rt',
  'runtime',
  'self-update',
  'stage',
  'store',
  't',
  'unlink',
  'up',
  'update',
  'why',
]);
const pnpmAliases = { t: 'test', tst: 'test', 'run-script': 'run' };

const { values } = parseArgs({
  options: {
    root: { type: 'string' },
    config: { type: 'string' },
    'compare-ref': { type: 'string' },
  },
});
if (!values.root || !values.config) throw Error('AGENT_INPUT_REQUIRED: --root and --config');
const root = resolve(values.root);
const config = JSON.parse(readFileSync(resolve(values.config), 'utf8'));
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
for (const path of config.paths ?? []) {
  if (!existsSync(resolve(root, path))) throw Error(`AGENT_REFERENCE_MISSING: ${path}`);
}
for (const command of config.scripts ?? []) {
  if (!pkg.scripts?.[command]) throw Error(`AGENT_COMMAND_MISSING: ${command}`);
}
if (config.exports) {
  const targets = (value) =>
    typeof value === 'string' ? [value] : Object.values(value ?? {}).flatMap(targets);
  for (const target of targets(pkg.exports)) {
    if (!existsSync(resolve(root, target)))
      throw Error(`AGENT_REFERENCE_MISSING: export ${target}`);
  }
}
const pending = config.entries.map((entry) => resolve(root, entry));
const visited = new Set();
const history = new Set();
const peerRoots = (config.peers ?? []).map((path) => resolve(root, path));
const peerReferences = new Set();
const allowedRoots = [root, ...peerRoots];
const historicalRoots = (config.history ?? []).map((path) => resolve(root, path));
const under = (file, directory) => file === directory || file.startsWith(directory + sep);
while (pending.length) {
  const file = pending.shift();
  if (visited.has(file)) continue;
  if (!existsSync(file)) throw Error(`AGENT_REFERENCE_MISSING: ${file}`);
  if (historicalRoots.some((directory) => under(file, directory))) {
    history.add(file);
    continue;
  }
  visited.add(file);
  const text = readFileSync(file, 'utf8');
  for (const match of text.matchAll(/\bnode\s+((?:\.\.\/)*scripts\/[\w./-]+\.m?js)/g)) {
    const target = resolve(root, match[1]);
    if (!allowedRoots.some((directory) => under(target, directory)))
      throw Error(`AGENT_PEER_REQUIRED: ${target}`);
    if (!existsSync(target)) throw Error(`AGENT_REFERENCE_MISSING: command ${target}`);
  }
  const commandPackages = [pkg];
  for (const path of config.commandRoots?.[relative(root, file)] ?? []) {
    const directory = resolve(root, path);
    if (!allowedRoots.some((allowed) => under(directory, allowed)))
      throw Error(`AGENT_PEER_REQUIRED: command root ${directory}`);
    commandPackages.push(JSON.parse(readFileSync(resolve(directory, 'package.json'), 'utf8')));
  }
  const codeSpans = [...text.matchAll(/(`+|~{3,})([\s\S]*?)\1/g)].map((match) => match[2]);
  const commands = [
    ...[...text.matchAll(/\b(npm|pnpm)\s+run\s+([\w:.-]+)/g)].map((match) => ({
      manager: match[1],
      name: match[2],
      explicitRun: true,
    })),
    ...codeSpans.flatMap((span) =>
      [...span.matchAll(/\b(npm|pnpm)\s+(?:(run)\s+)?([a-zA-Z0-9_][\w:.-]*)/g)].map((match) => ({
        manager: match[1],
        name: match[3],
        explicitRun: !!match[2],
      })),
    ),
  ];
  for (const command of commands) {
    const name = command.explicitRun
      ? command.name
      : ((command.manager === 'npm' ? npmAliases[command.name] : pnpmAliases[command.name]) ??
        command.name);
    if (!command.explicitRun && (command.manager === 'npm' ? npmCommands : pnpmCommands).has(name))
      continue;
    if (!commandPackages.some((owner) => owner.scripts?.[name]))
      throw Error(`AGENT_COMMAND_MISSING: ${file} -> ${name}`);
  }
  const prose = text.replace(/(`{3,}|~{3,})[^\n]*\n[\s\S]*?\1/g, '').replace(/`+[^`]*`+/g, '');
  for (const match of prose.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const link = match[1];
    if (/^[a-z][a-z\d+.-]*:/i.test(link) || link.startsWith('#')) continue;
    const target = resolve(dirname(file), decodeURIComponent(link.split('#')[0]));
    if (!allowedRoots.some((directory) => under(target, directory)))
      throw Error(`AGENT_PEER_REQUIRED: ${target}`);
    if (!existsSync(target)) throw Error(`AGENT_REFERENCE_MISSING: ${file} -> ${target}`);
    if (peerRoots.some((directory) => under(target, directory))) peerReferences.add(target);
    else if (target.endsWith('.md')) pending.push(target);
  }
}
const comparisons = [];
let parserVersion;
if (values['compare-ref']) {
  const ts = createRequire(resolve(root, 'package.json'))('typescript');
  parserVersion = ts.version;
  const git = (...args) =>
    execFileSync('git', ['-C', root, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  const files = git(
    'diff',
    '--name-only',
    values['compare-ref'],
    '--',
    '*.ts',
    '*.tsx',
    '*.mts',
    '*.cts',
  )
    .trim()
    .split('\n')
    .filter(Boolean);
  const printer = ts.createPrinter({ removeComments: true });
  for (const file of files) {
    const before = git('show', `${values['compare-ref']}:${file}`);
    const after = readFileSync(resolve(root, file), 'utf8');
    const parsedBefore = ts.createSourceFile(file, before, ts.ScriptTarget.Latest, true);
    const parsedAfter = ts.createSourceFile(file, after, ts.ScriptTarget.Latest, true);
    if (
      parsedBefore.parseDiagnostics.length ||
      parsedAfter.parseDiagnostics.length ||
      printer.printFile(parsedBefore) !== printer.printFile(parsedAfter)
    ) {
      throw Error(`AGENT_COMMENT_ONLY_REQUIRED: ${file} executable AST changed`);
    }
    const declaration = (source) =>
      ts.transpileDeclaration(source, { fileName: file, compilerOptions: { removeComments: true } })
        .outputText;
    if (declaration(before) !== declaration(after))
      throw Error(`AGENT_COMMENT_ONLY_REQUIRED: ${file} declaration changed`);
    const protectedComments = (source) =>
      [...source.matchAll(/\/\*[\s\S]*?\*\/|\/\/[^\r\n]*/g)]
        .map((match) => match[0])
        .filter((comment) =>
          /SPDX|@license|copyright|@preserve|@ts-|eslint-|oxlint-|prettier-|<reference/i.test(
            comment,
          ),
        );
    if (JSON.stringify(protectedComments(before)) !== JSON.stringify(protectedComments(after)))
      throw Error(`AGENT_PROTECTED_COMMENT: ${file} legal or tool directive changed`);
    const exports = (source) =>
      source.statements
        .filter(
          (statement) =>
            statement.modifiers?.some(
              (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
            ) ||
            ts.isExportDeclaration(statement) ||
            ts.isExportAssignment(statement),
        )
        .map((statement) => printer.printNode(ts.EmitHint.Unspecified, statement, source));
    if (JSON.stringify(exports(parsedBefore)) !== JSON.stringify(exports(parsedAfter)))
      throw Error(`AGENT_COMMENT_ONLY_REQUIRED: ${file} public export changed`);
    comparisons.push({
      file,
      executableAst: 'equal',
      publicExports: 'equal',
      publicDeclarations: 'equal',
      protectedComments: 'equal',
    });
  }
}
console.log(
  JSON.stringify({
    status: 'passed',
    entries: [...visited],
    history: [...history],
    peerReferences: [...peerReferences],
    parserVersion,
    comparisons,
  }),
);
