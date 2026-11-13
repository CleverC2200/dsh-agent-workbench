import { basename, extname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { sourceComments } from './source-comments.mjs';

export const commentExtensions = new Set([
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.html',
  '.svg',
  '.css',
  '.json',
  '.jsonc',
  '.yaml',
  '.yml',
  '.py',
  '.sh',
  '.ps1',
  '.nsh',
  '.nsi',
  '.java',
  '.cmd',
  '.toml',
  '.sql',
]);

const lineConfigurations = new Set([
  '.gitignore',
  '.gitattributes',
  '.npmignore',
  '.npmrc',
  '.prettierignore',
]);

export const supportsCommentCheck = (file) =>
  commentExtensions.has(extname(file)) || lineConfigurations.has(basename(file));

export function formatComments(parsers, file, text) {
  if (lineConfigurations.has(basename(file)))
    return [
      ...text.matchAll(
        basename(file) === '.npmrc' ? /^[ \t]*[#;][^\r\n]*/gm : /^[ \t]*#[^\r\n]*/gm,
      ),
    ].map((match) => ({
      pos: match.index,
      end: match.index + match[0].length,
      kind: 'configuration',
    }));
  const extension = extname(file);
  const language = {
    '.sh': 'bash',
    '.ps1': 'powershell',
    '.nsh': 'nsis',
    '.nsi': 'nsis',
    '.java': 'java',
    '.cmd': 'dos',
    '.toml': 'ini',
    '.sql': 'sql',
  }[extension];
  if (language) {
    const result = parsers.scripts.highlight(text, { language, ignoreIllegals: false });
    if (result.illegal) throw Error(`SOURCE_COMMENTS_PARSE: ${file}`);
    let offset = 0;
    const ranges = [];
    const strings = [];
    const visit = (node) => {
      if (typeof node === 'string') {
        offset += node.length;
        return;
      }
      const pos = offset;
      node.children.forEach(visit);
      if (node.scope === 'string') strings.push({ pos, end: offset });
      if (node.scope === 'comment' && !(pos === 0 && text.startsWith('#!')))
        ranges.push({ pos, end: offset, kind: 'script' });
    };
    visit(result._emitter.rootNode);
    if (offset !== text.length) throw Error(`SOURCE_COMMENTS_TOKEN_COVERAGE: ${file}`);
    if (language === 'bash') {
      for (const match of text.matchAll(
        /<<(-?)[ \t]*(?:'([^'\r\n]+)'|"([^"\r\n]+)"|([^\s;<>|&]+))/g,
      )) {
        if (
          strings.some((s) => s.pos <= match.index && match.index < s.end) ||
          ranges.some((s) => s.pos <= match.index && match.index < s.end)
        )
          continue;
        const delimiter = (match[2] ?? match[3] ?? match[4]).replace(/\\(.)/g, '$1');
        const start = text.indexOf('\n', match.index) + 1;
        let end = start;
        for (const line of text.slice(start).split(/(?<=\n)/)) {
          if ((match[1] ? line.replace(/^\t+/, '') : line).replace(/\r?\n$/, '') === delimiter)
            break;
          end += line.length;
        }
        strings.push({ pos: start, end });
      }
    }
    return ranges
      .filter((c) => !strings.some((s) => s.pos <= c.pos && c.pos < s.end))
      .sort((a, b) => a.pos - b.pos);
  }
  if (/^\.(?:[cm]?[jt]s|[jt]sx)$/.test(extension)) return sourceComments(parsers.ts, file, text);
  if (extension === '.json' || extension === '.jsonc')
    return sourceComments(parsers.ts, file + '.json', text);
  if (extension === '.css') {
    const tokenizer = parsers.cssTokens(new parsers.css.Input(text));
    const ranges = [];
    while (!tokenizer.endOfFile()) {
      const [kind, , pos, end] = tokenizer.nextToken();
      if (kind === 'comment') ranges.push({ pos, end: end + 1, kind: 'css' });
    }
    return ranges;
  }
  if (extension === '.yaml' || extension === '.yml') {
    const document = parsers.yaml.parseDocument(text, { keepSourceTokens: true });
    if (document.errors.length)
      throw Error(`SOURCE_COMMENTS_PARSE: ${file}: ${document.errors[0].message}`);
    const ranges = [];
    const visit = (value) => {
      if (!value || typeof value !== 'object') return;
      if (value.type === 'comment')
        ranges.push({ pos: value.offset, end: value.offset + value.source.length, kind: 'yaml' });
      for (const child of Object.values(value)) {
        if (Array.isArray(child)) child.forEach(visit);
        else if (typeof child === 'object') visit(child);
      }
    };
    [...new parsers.yaml.Parser().parse(text)].forEach(visit);
    if (file.replaceAll('\\', '/').startsWith('.github/workflows/')) {
      for (const job of document.get('jobs', true)?.items ?? []) {
        const steps = job.value.get('steps', true);
        for (const step of steps?.items ?? []) {
          const run = step.get('run', true);
          if (typeof run?.value !== 'string') continue;
          const shell =
            step.get('shell') ??
            job.value.getIn(['defaults', 'run', 'shell']) ??
            document.getIn(['defaults', 'run', 'shell']) ??
            (String(job.value.get('runs-on')).includes('windows') ? 'pwsh' : 'bash');
          const language = /^(?:pwsh|powershell)(?: |$)/.test(shell)
            ? '.ps1'
            : /^(?:bash|sh)(?: |$)/.test(shell)
              ? '.sh'
              : null;
          if (!language) continue;
          let offset =
            run.srcToken?.type === 'block-scalar'
              ? run.srcToken.offset +
                run.srcToken.props.reduce((size, token) => size + token.source.length, 0)
              : run.range[0];
          for (const comment of formatComments(parsers, file + language, run.value)) {
            const value = run.value.slice(comment.pos, comment.end);
            const pos = text.indexOf(value, offset);
            if (pos < 0 || pos + value.length > run.range[1])
              throw Error(`SOURCE_COMMENTS_WORKFLOW_MAPPING: ${file}`);
            ranges.push({ ...comment, pos, end: pos + value.length });
            offset = pos + value.length;
          }
        }
      }
    }
    return ranges.sort((a, b) => a.pos - b.pos);
  }
  if (extension === '.py') {
    const result = spawnSync(
      'python3',
      [
        '-c',
        `import ast,io,json,sys,tokenize
text=sys.stdin.read()
ast.parse(text)
lines=text.splitlines(keepends=True)
offsets=[0]
for line in lines: offsets.append(offsets[-1]+len(line))
ranges=[]
for token in tokenize.generate_tokens(io.StringIO(text).readline):
 if token.type!=tokenize.COMMENT or (token.start==(1,0) and token.string.startswith('#!')): continue
 start=offsets[token.start[0]-1]+token.start[1]
 end=offsets[token.end[0]-1]+token.end[1]
 ranges.append(dict(pos=len(text[:start].encode('utf-16-le'))//2,end=len(text[:end].encode('utf-16-le'))//2,kind='python'))
print(json.dumps(ranges))`,
      ],
      { input: text, encoding: 'utf8' },
    );
    if (result.error || result.status !== 0)
      throw Error(`SOURCE_COMMENTS_PARSE: ${file}: ${result.error?.message ?? result.stderr}`);
    return JSON.parse(result.stdout);
  }
  if (extension === '.html' || extension === '.svg') {
    const document = parsers.html.parse(text, { sourceCodeLocationInfo: true });
    const ranges = [];
    const add = (language, code, offset) => {
      for (const range of formatComments(parsers, file + language, code))
        ranges.push({ ...range, pos: offset + range.pos, end: offset + range.end });
    };
    const visit = (node) => {
      const location = node.sourceCodeLocation;
      if (node.nodeName === '#comment' && location)
        ranges.push({ pos: location.startOffset, end: location.endOffset, kind: 'html' });
      if ((node.tagName === 'script' || node.tagName === 'style') && node.childNodes?.length) {
        const type = node.attrs?.find((attr) => attr.name === 'type')?.value.toLowerCase() ?? '';
        const language =
          node.tagName === 'style'
            ? '.css'
            : ['', 'module', 'text/javascript', 'application/javascript'].includes(type)
              ? '.js'
              : ['application/json', 'application/ld+json', 'importmap'].includes(type)
                ? '.json'
                : null;
        if (language)
          for (const child of node.childNodes)
            if (child.nodeName === '#text' && child.sourceCodeLocation)
              add(
                language,
                text.slice(
                  child.sourceCodeLocation.startOffset,
                  child.sourceCodeLocation.endOffset,
                ),
                child.sourceCodeLocation.startOffset,
              );
      }
      for (const attr of node.attrs ?? []) {
        if (attr.name !== 'style' && !/^on[a-z]+$/.test(attr.name)) continue;
        const attrLocation = location?.attrs?.[attr.name];
        if (!attrLocation) continue;
        let offset = attrLocation.startOffset;
        for (const range of formatComments(
          parsers,
          file + (attr.name === 'style' ? '.css' : '.js'),
          attr.value,
        )) {
          const comment = attr.value.slice(range.pos, range.end);
          const pos = text.indexOf(comment, offset);
          if (pos < 0 || pos + comment.length > attrLocation.endOffset)
            throw Error(`SOURCE_COMMENTS_ATTRIBUTE_MAPPING: ${file}`);
          ranges.push({ ...range, pos, end: pos + comment.length });
          offset = pos + comment.length;
        }
      }
      for (const child of node.childNodes ?? []) visit(child);
      if (node.content) visit(node.content);
    };
    visit(document);
    return ranges.sort((a, b) => a.pos - b.pos);
  }
  return [];
}
