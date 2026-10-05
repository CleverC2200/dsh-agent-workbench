/** Build editable author modules while preserving the existing vendor, data and visual resources. */
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { compileHtmlAuthor } from './html-author.mjs';
import ts from 'typescript';
const questionStyles=await readFile(new URL('../business/shared/author-questions.css',import.meta.url),'utf8');
const hash = value => createHash('sha256').update(value).digest('hex');
for (const page of ['category', 'mps']) {
    const root = new URL(`../static/${page}/source/`, import.meta.url);
    const source = JSON.parse(await readFile(new URL('SOURCE.json', root), 'utf8'));
    const files = Object.fromEntries(await Promise.all(['vendor.js', 'data.js', 'app.js', 'vendor.css', 'layout.css', 'shell.html'].map(async (file) => [file, await readFile(new URL(file, root), 'utf8')])));
    for (const [file, digest] of Object.entries(source.fixed)) {
        if (hash(files[file]) !== digest)
            throw Error(`STATIC_FIXED_RESOURCE_CHANGED: ${page}/${file}`);
    }
    for (const [name, expected] of Object.entries(source.fixedAuthoredData)) {
        const ast = ts.createSourceFile(expected.file, files[expected.file], ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
        const found = ast.statements.filter(ts.isVariableStatement).flatMap(statement => [...statement.declarationList.declarations]).find(value => value.name.getText(ast) === name);
        if (!found?.initializer || hash(found.initializer.getText(ast)) !== expected.sha256)
            throw Error(`STATIC_AUTHORED_DATA_CHANGED: ${page}/${name}`);
    }
    const author = await build({ stdin: { contents: files['data.js'] + '\n' + files['app.js'], resolveDir: fileURLToPath(root), sourcefile: `${page}-author.js` }, bundle: true, write: false, format: 'iife', platform: 'browser', target: 'es2022', legalComments: 'inline' });
    const script = files['vendor.js'] + '\n' + author.outputFiles[0].text;
    const html = files['shell.html'].replace('__WORKBENCH_AUTHOR_SCRIPT__', () => script.replace(/<\/script/gi, '<\\/script')).replace('__WORKBENCH_AUTHOR_STYLES__', () => files['vendor.css']+'\n'+files['layout.css']+'\n'+questionStyles);
    await writeFile(new URL(`../static/${page}/index.html`, import.meta.url), html);
}
const regionalSource = new URL('../static/regional/source/index.html', import.meta.url);
await writeFile(new URL('../static/regional/index.html', import.meta.url), await compileHtmlAuthor(await readFile(regionalSource, 'utf8'), fileURLToPath(new URL('../static/regional/source/', import.meta.url))));
