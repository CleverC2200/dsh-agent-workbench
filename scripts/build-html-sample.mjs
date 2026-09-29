/** Assemble the verification page with the exact shared resource; no network assets. */
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const resource = await readFile(new URL('../theme/tokens.css', import.meta.url), 'utf8');
const sha256 = createHash('sha256').update(resource).digest('hex');
if (sha256 !== 'cda4eb98c858d0edec1e17266ae44d3b68a0fa9a8ad850b34e8734b7e5ba1c2b') {
  throw new Error('HTML_SAMPLE_THEME_RESOURCE_MISMATCH: expected shared theme 1.0.0');
}
const source = await readFile(new URL('../samples/html-table.html', import.meta.url), 'utf8');
const html = source.replace('/* SHARED_THEME_RESOURCE */', resource);
const directory = new URL('../lib/samples/', import.meta.url);
await mkdir(directory, { recursive: true });
await writeFile(new URL('html-table.html', directory), html);
