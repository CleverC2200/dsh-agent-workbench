import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { parseArgs } from 'node:util';
import { supportsCommentCheck, formatComments } from './format-comments.mjs';

const { values, positionals } = parseArgs({
  options: {
    root: { type: 'string', default: process.cwd() },
    all: { type: 'boolean' },
    base: { type: 'string' },
    report: { type: 'string' },
  },
  allowPositionals: true,
});
const root = resolve(values.root);
const git = (...args) =>
  execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
const lines = (value) => value.split('\0').filter(Boolean);
if (values.all && (values.base || positionals.length))
  throw Error('SOURCE_COMMENTS_SCOPE: --all cannot be combined with --base or files');
if (positionals.length && values.base) throw Error('SOURCE_COMMENTS_SCOPE: choose --base or files');
let files;
const all = values.all || (!values.base && !positionals.length);
if (all) files = lines(git('ls-files', '--cached', '--others', '--exclude-standard', '-z'));
else if (positionals.length) files = positionals;
else {
  const base = values.base;
  if (!/^[a-f0-9]{40}$/.test(base)) throw Error('SOURCE_COMMENTS_BASE: full base commit required');
  const from = git('merge-base', base, 'HEAD').trim();
  files = [
    ...lines(git('diff', '--name-only', '--diff-filter=ACMRT', '-z', from)),
    ...lines(git('ls-files', '--others', '--exclude-standard', '-z')),
  ];
}
const require = createRequire(resolve(root, 'package.json'));
const parsers = {
  ts: require('typescript'),
  html: require('parse5'),
  css: require('postcss'),
  cssTokens: require('postcss/lib/tokenize'),
  yaml: require('yaml'),
  scripts: require('highlight.js/lib/core'),
};
for (const language of ['bash', 'powershell', 'nsis', 'sql', 'java', 'dos', 'ini'])
  parsers.scripts.registerLanguage(language, require('highlight.js/lib/languages/' + language));
const policyFile = resolve(root, 'source-comments.json');
const policy = existsSync(policyFile)
  ? JSON.parse(readFileSync(policyFile, 'utf8'))
  : { assets: [] };
for (const manifest of policy.manifests ?? []) {
  const source = JSON.parse(readFileSync(resolve(root, manifest.path), 'utf8'));
  for (const [file, sha256] of Object.entries(source.files)) {
    if (manifest.adapted?.includes(file)) continue;
    if (!/^[a-f0-9]{64}$/.test(sha256)) throw Error(`SOURCE_COMMENTS_MANIFEST: ${manifest.path}`);
    policy.assets.push({
      path: manifest.root + '/' + file,
      kind: 'received-business-input',
      source: manifest.path,
      sha256,
    });
  }
}
const excluded = [];
let checked = 0;
const violations = [];
for (const file of [...new Set(files)].sort()) {
  const path = resolve(root, file);
  const local = relative(root, path);
  if (isAbsolute(local) || local === '..' || local.startsWith('..' + sep))
    throw Error(`SOURCE_COMMENTS_PATH: ${file}`);
  if (!supportsCommentCheck(local)) continue;
  const asset = policy.assets.find(({ path }) => local === path || local.startsWith(path + '/'));
  if (asset) {
    if (
      asset.sha256 &&
      createHash('sha256').update(readFileSync(path)).digest('hex') !== asset.sha256
    )
      throw Error(`SOURCE_COMMENTS_RECEIVED_BYTES_CHANGED: ${local}`);
    excluded.push({ file: local, kind: asset.kind, source: asset.source });
    continue;
  }
  const stat = lstatSync(path, { throwIfNoEntry: false });
  if (!stat && all) continue;
  if (!stat?.isFile()) throw Error(`SOURCE_COMMENTS_FILE: ${local}`);
  const text = readFileSync(path, 'utf8');
  for (const comment of formatComments(parsers, local, text)) {
    const line = text.slice(0, comment.pos).split(/\r\n|\r|\n/).length;
    violations.push({ file: local, line });
  }
  checked++;
}
for (const { file, line } of violations)
  console.error(`SOURCE_COMMENT_REQUIRED_REMOVAL: ${file}:${line}`);
const summary = {
  scope: all ? 'all-owned' : 'changed-or-explicit',
  checked,
  comments: violations.length,
  excluded: excluded.length,
};
if (values.report)
  writeFileSync(
    resolve(values.report),
    JSON.stringify({ ...summary, violations, excluded }, null, 2) + '\n',
  );
console.log(JSON.stringify(summary));
process.exitCode = violations.length ? 1 : 0;
