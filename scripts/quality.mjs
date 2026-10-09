import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { extname, relative, resolve } from 'node:path';
import { devNull } from 'node:os';

const root = resolve(import.meta.dirname, '..');
// Fixed pre-migration input; never advance this to absorb new lint/format debt.
const baseline = '9814b3bcf1ae015a63fac9af864c165617791fc3';
function refuse(message) {
  console.error(message);
  process.exit(2);
}
// The original policy is a Git object, not a movable HEAD or caller supplied baseline.
const anchor = spawnSync(
  'git',
  ['show', 'b42c62e72310d31a088b7394a964492efc1f217a:scripts/quality.mjs'],
  { cwd: root, encoding: 'utf8' },
);
if (
  anchor.status !== 0 ||
  createHash('sha256').update(anchor.stdout).digest('hex') !==
    '4410fd6709c89064e955446665890fadc0df1e60f1f9932f7387830c29fdbfab' ||
  !anchor.stdout.includes(`const baseline = '${baseline}';`)
)
  refuse('QUALITY_BASELINE_REQUIRED: fixed original policy object and baseline');
for (const [file, hash] of [
  ['.oxlintrc.json', '28a80c5f3a4937d1f1f21bcc1cd3e0a32fe636cc81fbacbbec3c894dba7fd10e'],
  ['.oxfmtrc.json', '7b0d2af50974c5bef809cad63da8bef413c5bbd7fc477a9206b47628c47b09fc'],
]) {
  try {
    if (
      createHash('sha256')
        .update(readFileSync(resolve(root, file)))
        .digest('hex') !== hash
    )
      refuse(`QUALITY_POLICY_REQUIRED: ${file}`);
  } catch {
    refuse(`QUALITY_POLICY_REQUIRED: ${file}`);
  }
}
const [mode, ...requested] = process.argv.slice(2);
if (!['lint', 'lint-audit', 'format', 'format-audit'].includes(mode)) {
  throw Error('QUALITY_MODE_REQUIRED: lint, lint-audit, format or format-audit');
}
const lint = mode.startsWith('lint');
const audit = mode.endsWith('audit');
const extensions = lint
  ? new Set(['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.mts', '.cts'])
  : new Set([
      '.js',
      '.jsx',
      '.mjs',
      '.cjs',
      '.ts',
      '.tsx',
      '.mts',
      '.cts',
      '.css',
      '.html',
      '.json',
      '.jsonc',
      '.yaml',
      '.yml',
    ]);
const directories = [
  'src',
  'scripts',
  'tests',
  'business',
  'static',
  'samples',
  'theme',
  '.github',
];
const fixed = new Set(
  ['category', 'mps'].flatMap((page) =>
    ['vendor.js', 'vendor.css', 'data.js'].map((file) => `static/${page}/source/${file}`),
  ),
);
const generated = new Set(
  ['category', 'mps', 'regional'].map((page) => `static/${page}/index.html`),
);
// Runtime prompt bytes are governed resources, not authored code formatting targets.
const runtimeResources = new Set(['static/regional/prompt.json']);
const files = [];
function collect(directory) {
  for (const entry of readdirSync(resolve(root, directory), { withFileTypes: true })) {
    const file = `${directory}/${entry.name}`;
    if (entry.isDirectory()) {
      if (!['node_modules', '.git', '.runtime', 'dist'].includes(entry.name)) collect(file);
    } else if (
      entry.isFile() &&
      extensions.has(extname(file)) &&
      !fixed.has(file) &&
      !generated.has(file) &&
      !runtimeResources.has(file)
    ) {
      files.push(file);
    }
  }
}
for (const directory of directories) collect(directory);
if (!lint) {
  for (const file of readdirSync(root)) {
    if (extensions.has(extname(file)) && !['package-lock.json'].includes(file)) files.push(file);
  }
}
const selected = requested.length
  ? requested.map((file) => relative(root, resolve(root, file)))
  : files;
if (!selected.length || selected.some((file) => !files.includes(file))) {
  throw Error('QUALITY_TARGET_REQUIRED: every requested path must be a maintained supported file');
}
const binary = resolve(root, 'node_modules/.bin', lint ? 'oxlint' : 'oxfmt');
for (const [tool, version] of [
  ['oxlint', '1.87.0'],
  ['oxfmt', '0.72.0'],
]) {
  try {
    if (
      JSON.parse(readFileSync(resolve(root, `node_modules/${tool}/package.json`))).version !==
      version
    )
      refuse(`QUALITY_TOOL_REQUIRED: ${tool}@${version}`);
  } catch {
    refuse(`QUALITY_TOOL_REQUIRED: ${tool}@${version}`);
  }
}
const args = lint
  ? [
      '--config',
      '.oxlintrc.json',
      '--disable-nested-config',
      '--no-ignore',
      '--deny-warnings',
      '--format',
      'json',
      ...selected,
    ]
  : [
      '--config',
      '.oxfmtrc.json',
      '--disable-nested-config',
      '--ignore-path',
      devNull,
      '--list-different',
      ...selected,
    ];
const result = spawnSync(binary, args, {
  cwd: root,
  encoding: 'utf8',
  maxBuffer: 16 * 1024 * 1024,
});
if (result.error || result.signal || ![0, 1].includes(result.status)) {
  console.error(result.error ?? result.stderr ?? 'QUALITY_TOOL_FAILED');
  process.exit(2);
}
let bad;
if (lint) {
  const output = JSON.parse(result.stdout);
  // Parse errors/config errors are never baseline debt.
  if (output.diagnostics.some((diagnostic) => !diagnostic.code)) {
    console.error(result.stdout);
    process.exit(2);
  }
  bad = [...new Set(output.diagnostics.map((diagnostic) => diagnostic.filename))];
} else {
  if (result.stderr.trim()) {
    console.error(result.stderr);
    process.exit(2);
  }
  bad = result.stdout.trim().split('\n').filter(Boolean);
}
if (
  (result.status === 1 && !bad.length) ||
  (result.status === 0 && bad.length) ||
  bad.some((file) => !selected.includes(file))
) {
  throw Error('QUALITY_TOOL_OUTPUT_INVALID');
}
if (audit) {
  console.log(result.stdout);
  console.log(
    `QUALITY_AUDIT: ${selected.length} files, ${bad.length} files with ${lint ? 'lint' : 'format'} debt`,
  );
  process.exit(result.status);
}
const tree = spawnSync('git', ['ls-tree', '-r', '-z', baseline], { cwd: root, encoding: 'utf8' });
if (tree.status !== 0)
  throw Error('QUALITY_BASELINE_REQUIRED: fetch the fixed pre-migration commit');
const objects = new Map(
  tree.stdout
    .split('\0')
    .filter(Boolean)
    .map((line) => {
      const [metadata, file] = line.split('\t');
      return [file, metadata.split(' ')[2]];
    }),
);
function unchanged(file) {
  const content = readFileSync(resolve(root, file));
  const hash = createHash('sha1').update(`blob ${content.length}\0`).update(content).digest('hex');
  return objects.get(file) === hash;
}
const violations = bad.filter((file) => !unchanged(file));
for (const file of violations) console.error(`${lint ? 'LINT' : 'FORMAT'}_REQUIRED: ${file}`);
if (lint && violations.length) {
  const output = JSON.parse(result.stdout);
  console.error(
    JSON.stringify(
      output.diagnostics.filter((diagnostic) => violations.includes(diagnostic.filename)),
      null,
      2,
    ),
  );
}
console.log(
  `QUALITY_INCREMENTAL: ${selected.length} files scanned; ${bad.length - violations.length} unchanged baseline debt files; ${violations.length} changed/new violations; baseline ${baseline}`,
);
process.exit(violations.length ? 1 : 0);
