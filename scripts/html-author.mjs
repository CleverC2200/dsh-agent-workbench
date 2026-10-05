import { build } from 'esbuild';
/** Compile declared editable inline author scripts; no generated output is ever decoded at runtime. */
export async function compileHtmlAuthor(source, resolveDir) {
    const blocks = [...source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
    let html = source;
    for (const block of blocks) {
        const result = await build({ stdin: { contents: block[2], resolveDir, sourcefile: 'page-author.js' }, bundle: true, write: false, format: 'iife', platform: 'browser', target: 'es2022' });
        html = html.replace(block[0], () => `<script>${result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script')}</script>`);
    }
    return html;
}
