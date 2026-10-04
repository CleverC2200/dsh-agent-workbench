/** Assemble the verification page with the exact shared resource; no network assets. */
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const resource = await readFile(new URL('../theme/tokens.css', import.meta.url), 'utf8');
const sha256 = createHash('sha256').update(resource).digest('hex');
if (sha256 !== '19c4e31943862d2087c1be1d0efa5966cde7dcce1989e92390f540ce0c3eaa66') {
  throw new Error('HTML_SAMPLE_THEME_RESOURCE_MISMATCH: expected shared theme 1.1.1');
}
const source = await readFile(new URL('../samples/html-table.html', import.meta.url), 'utf8');
const html = source.replace('/* SHARED_THEME_RESOURCE */', resource);
const directory = new URL('../lib/samples/', import.meta.url);
await mkdir(directory, { recursive: true });
await writeFile(new URL('html-table.html', directory), html);

await writeFile(new URL('index.html', directory), html);
await writeFile(new URL('plugin.json', directory), JSON.stringify({schemaVersion:1,id:'workbench-html-table',name:'HTML table / HTML 表格',html:'index.html'}));
