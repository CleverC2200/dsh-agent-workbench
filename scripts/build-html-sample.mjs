import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { compileHtmlAuthor } from './html-author.mjs';
import { fileURLToPath } from 'node:url';

const resource = await readFile(new URL('../theme/tokens.css', import.meta.url), 'utf8');
const sha256 = createHash('sha256').update(resource).digest('hex');
if (sha256 !== '51d07dd91c4e2851301c046556a9c34aded00c5fa94525420b949badce9a5497') {
  throw new Error('HTML_SAMPLE_THEME_RESOURCE_MISMATCH: expected shared theme 1.1.1');
}
const source = await readFile(new URL('../samples/html-table.html', import.meta.url), 'utf8');
const html = await compileHtmlAuthor(
  source.replace('__SHARED_THEME_RESOURCE__', resource),
  fileURLToPath(new URL('../samples/', import.meta.url)),
);
const directory = new URL('../lib/samples/', import.meta.url);
await mkdir(directory, { recursive: true });
await writeFile(new URL('html-table.html', directory), html);

await writeFile(new URL('index.html', directory), html);
await writeFile(
  new URL('plugin.json', directory),
  JSON.stringify({
    schemaVersion: 1,
    id: 'workbench-html-table',
    name: 'HTML table / HTML 表格',
    html: 'index.html',
  }),
);
