import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { parseArgs } from 'node:util';
import { sourceComments } from './source-comments.mjs';

const { values, positionals } = parseArgs({
  options: {
    root: { type: 'string', default: process.cwd() },
    all: { type: 'boolean' },
    base: { type: 'string' },
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
if (values.all) files = lines(git('ls-files', '--cached', '--others', '--exclude-standard', '-z'));
else if (positionals.length) files = positionals;
else {
  let base = values.base ?? process.env.QUALITY_BASE_SHA;
  if (!base && process.env.GITHUB_ACTIONS === 'true') {
    const path = resolve(root, 'scripts/quality-peer-baseline.json');
    if (existsSync(path))
      base = JSON.parse(readFileSync(path, 'utf8')).repositories.find(
        ({ repo }) => repo === basename(root),
      )?.head;
    if (!base) throw Error('SOURCE_COMMENTS_BASE: CI requires event or registered peer baseline');
  }
  if (base && !/^[a-f0-9]{40}$/.test(base))
    throw Error('SOURCE_COMMENTS_BASE: full base commit required');
  const from = base ? git('merge-base', base, 'HEAD').trim() : 'HEAD';
  files = [
    ...lines(git('diff', '--name-only', '--diff-filter=ACMRT', '-z', from)),
    ...lines(git('ls-files', '--others', '--exclude-standard', '-z')),
  ];
}
const extensions = new Set(['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.mts', '.cts']);
const ts = createRequire(resolve(root, 'package.json'))('typescript');
let checked = 0;
const violations = [];
for (const file of [...new Set(files)].sort()) {
  const path = resolve(root, file);
  const local = relative(root, path);
  if (isAbsolute(local) || local === '..' || local.startsWith('..' + sep))
    throw Error(`SOURCE_COMMENTS_PATH: ${file}`);
  if (!extensions.has(extname(local))) continue;
  const stat = lstatSync(path, { throwIfNoEntry: false });
  if (!stat && values.all) continue;
  if (!stat?.isFile()) throw Error(`SOURCE_COMMENTS_FILE: ${local}`);
  const text = readFileSync(path, 'utf8');
  for (const comment of sourceComments(ts, local, text)) {
    const line = text.slice(0, comment.pos).split(/\r\n|\r|\n/).length;
    violations.push({ file: local, line });
  }
  checked++;
}
for (const { file, line } of violations)
  console.error(`SOURCE_COMMENT_REQUIRED_REMOVAL: ${file}:${line}`);
console.log(
  JSON.stringify({
    scope: values.all ? 'all' : 'changed-or-explicit',
    checked,
    comments: violations.length,
  }),
);
process.exitCode = violations.length ? 1 : 0;
