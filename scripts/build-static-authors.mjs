/** Build editable author modules while preserving the existing vendor, data and visual resources. */
import { readFile, writeFile, cp, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { compileHtmlAuthor } from './html-author.mjs';
import { verifyFixedAuthoredData } from './static-author-provenance.mjs';
const questionStyles = await readFile(
  new URL('../business/shared/author-questions.css', import.meta.url),
  'utf8',
);
const hash = (value) => createHash('sha256').update(value).digest('hex');
const outputs = new URL('../lib/static/', import.meta.url);
await mkdir(outputs, { recursive: true });
await cp(new URL('../static/', import.meta.url), outputs, {
  recursive: true,
  filter: (source) => !source.endsWith('/source'),
});
for (const page of ['category', 'mps']) {
  const root = new URL(`../static/${page}/source/`, import.meta.url);
  const source = JSON.parse(await readFile(new URL('SOURCE.json', root), 'utf8'));
  const files = Object.fromEntries(
    await Promise.all(
      ['vendor.js', 'data.js', 'app.js', 'vendor.css', 'layout.css', 'shell.html'].map(
        async (file) => [file, await readFile(new URL(file, root), 'utf8')],
      ),
    ),
  );
  for (const [file, digest] of Object.entries(source.fixed)) {
    if (hash(files[file]) !== digest) throw Error(`STATIC_FIXED_RESOURCE_CHANGED: ${page}/${file}`);
  }
  verifyFixedAuthoredData(page, files, source);
  const author = await build({
    stdin: {
      contents: files['data.js'] + '\n' + files['app.js'],
      resolveDir: fileURLToPath(root),
      sourcefile: `${page}-author.js`,
    },
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
    target: 'es2022',
    legalComments: 'inline',
  });
  const script = files['vendor.js'] + '\n' + author.outputFiles[0].text;
  const html = files['shell.html']
    .replace('__WORKBENCH_AUTHOR_SCRIPT__', () => script.replace(/<\/script/gi, '<\\/script'))
    .replace(
      '__WORKBENCH_AUTHOR_STYLES__',
      () => files['vendor.css'] + '\n' + files['layout.css'] + '\n' + questionStyles,
    );
  await writeFile(new URL(`${page}/index.html`, outputs), html);
}
const regionalSource = new URL('../static/regional/source/index.html', import.meta.url);
await writeFile(
  new URL('regional/index.html', outputs),
  await compileHtmlAuthor(
    await readFile(regionalSource, 'utf8'),
    fileURLToPath(new URL('../static/regional/source/', import.meta.url)),
  ),
);
// Manage remains the owner of the original declared resource; the installed page carries its files.
for (const name of ['prompt.json', 'capability.json', 'mcp.json', 'skills'])
  await cp(
    new URL(`../../dsh-agent-manage/business-resources/plan-regional/${name}`, import.meta.url),
    new URL(`regional/${name}`, outputs),
    { recursive: true },
  );
