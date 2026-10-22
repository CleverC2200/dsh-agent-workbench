import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  symlinkSync,
  realpathSync,
  readdirSync,
  lstatSync,
} from 'node:fs';
import { resolve, posix } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const json = (path) => JSON.parse(readFileSync(path, 'utf8'));
const hash = (value) => createHash('sha256').update(value).digest('hex');
const staticTools = {
  'dsh-agent-workbench': ['oxlint', 'oxfmt'],
  'dsh-agent-manage': ['@eslint/js', 'eslint', 'typescript-eslint', 'typescript', 'prettier'],
  'dsh-gea-plugin': ['oxlint', 'oxfmt'],
};
export function sourceTools(root, repo, selected, { typecheck, joint, desktopTools }) {
  if (typecheck || joint || desktopTools || selected.sdk || selected.browser) return null;
  const policy = json(resolve(root, 'scripts/ci-test-policy.json'));
  const packages = new Set(staticTools[repo]);
  for (const file of selected.files) {
    const dependencies = policy.sourceTools?.[file];
    if (dependencies === undefined && policy.sourceFixtures?.[file]?.dependencies !== false)
      return null;
    if (dependencies !== undefined && !Array.isArray(dependencies))
      throw Error(`SOURCE_TOOLS_POLICY_INVALID: ${file}`);
    for (const name of dependencies ?? []) packages.add(name);
  }
  const manifest = json(resolve(root, 'package.json'));
  const declared = { ...manifest.dependencies, ...manifest.devDependencies };
  if ([...packages].some((name) => !declared[name])) return null;
  return [...packages].sort();
}

export function toolProject(root, packages) {
  const owner = json(resolve(root, 'package.json'));
  const manifest = {
    name: owner.name,
    version: owner.version,
    private: true,
    type: 'module',
    packageManager: owner.packageManager,
  };
  for (const group of ['dependencies', 'devDependencies']) {
    const values = Object.fromEntries(
      packages.filter((name) => owner[group]?.[name]).map((name) => [name, owner[group][name]]),
    );
    if (Object.keys(values).length) manifest[group] = values;
  }
  for (const name of packages)
    if (!manifest.dependencies?.[name] && !manifest.devDependencies?.[name])
      throw Error(`SOURCE_TOOLS_DEPENDENCY_REQUIRED: ${name}`);
  if (
    packages.some((name) =>
      /^(?:file|link|workspace):/.test(
        manifest.dependencies?.[name] ?? manifest.devDependencies?.[name],
      ),
    )
  )
    throw Error('SOURCE_TOOLS_REGISTRY_REQUIRED');
  const npm = owner.packageManager.startsWith('npm@');
  const file = npm ? 'package-lock.json' : 'pnpm-lock.yaml';
  const original = readFileSync(resolve(root, file), 'utf8');
  let lock, workspace;
  if (npm) {
    const source = JSON.parse(original);
    const retained = {};
    const visit = (path) => {
      if (retained[path]) return;
      const entry = source.packages[path];
      if (!entry || entry.link || !entry.integrity)
        throw Error(`SOURCE_TOOLS_LOCK_REQUIRED: ${path}`);
      retained[path] = entry;
      for (const [name, optional] of Object.entries({
        ...Object.fromEntries(Object.keys(entry.dependencies ?? {}).map((name) => [name, false])),
        ...Object.fromEntries(
          Object.keys(entry.peerDependencies ?? {}).map((name) => [
            name,
            entry.peerDependenciesMeta?.[name]?.optional === true,
          ]),
        ),
        ...Object.fromEntries(
          Object.keys(entry.optionalDependencies ?? {}).map((name) => [name, true]),
        ),
      })) {
        let parent = path,
          target;
        while (true) {
          const candidate = posix.join(parent, 'node_modules', name);
          if (source.packages[candidate]) {
            target = candidate;
            break;
          }
          if (!parent) break;
          parent = posix.dirname(parent);
          if (parent === '.') parent = '';
        }
        if (target) visit(target);
        else if (!optional) throw Error(`SOURCE_TOOLS_LOCK_REQUIRED: ${name}`);
      }
    };
    for (const name of packages) visit('node_modules/' + name);
    lock =
      JSON.stringify(
        {
          ...source,
          packages: {
            '': {
              name: owner.name,
              version: owner.version,
              ...(manifest.dependencies ? { dependencies: manifest.dependencies } : {}),
              ...(manifest.devDependencies ? { devDependencies: manifest.devDependencies } : {}),
            },
            ...retained,
          },
        },
        null,
        2,
      ) + '\n';
  } else {
    if (!/^lockfileVersion: ['"]9\.0['"]/m.test(original)) throw Error('SOURCE_TOOLS_LOCK_VERSION');
    const importerStart = original.indexOf('importers:\n');
    const packagesStart = original.indexOf('\npackages:\n', importerStart);
    if (importerStart < 0 || packagesStart < 0) throw Error('SOURCE_TOOLS_LOCK_IMPORTER');
    const importer = original.slice(importerStart, packagesStart);
    const groups = [
      ...importer.matchAll(
        /^    (dependencies|devDependencies|optionalDependencies):\n([\s\S]*?)(?=^    [^ ]|^  [^ ]|$(?![\s\S]))/gm,
      ),
    ];
    let projected = 'importers:\n\n  .:\n';
    for (const group of ['dependencies', 'devDependencies']) {
      const names = Object.keys(manifest[group] ?? {});
      if (!names.length) continue;
      const block = groups.find((match) => match[1] === group)?.[2] ?? '';
      const entries = [...block.matchAll(/^      (.+):\n([\s\S]*?)(?=^      [^ ]|$(?![\s\S]))/gm)];
      projected += '    ' + group + ':\n';
      for (const name of names) {
        const entry = entries.find((match) => match[1].replace(/^['"]|['"]$/g, '') === name);
        if (!entry || /(?:specifier|version): (?:link|file|workspace):/.test(entry[0]))
          throw Error(`SOURCE_TOOLS_LOCK_REQUIRED: ${name}`);
        projected += entry[0].trimEnd() + '\n';
      }
    }
    const prefix = original.slice(0, importerStart);
    lock = prefix + projected + original.slice(packagesStart);
    const overrides = prefix.match(/^overrides:\n[\s\S]*?(?=^[^ \n]|$(?![\s\S]))/m)?.[0] ?? '';
    workspace = 'packages: []\n' + overrides;
  }
  return {
    manifest,
    lock,
    file,
    workspace,
    key: hash(JSON.stringify(manifest) + lock + (workspace ?? '')),
  };
}
export function writeToolProject(root, packages) {
  const project = toolProject(root, packages);
  const directory = resolve(root, '.runtime/source-tools');
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    resolve(directory, 'package.json'),
    JSON.stringify(project.manifest, null, 2) + '\n',
  );
  writeFileSync(resolve(directory, project.file), project.lock);
  if (project.workspace)
    writeFileSync(resolve(directory, 'pnpm-workspace.yaml'), project.workspace);
  return { ...project, directory, downloads: resolve(directory, 'downloads') };
}
export function prepareSourceTools(root, packages) {
  const link = resolve(root, 'node_modules');
  const marker = resolve(link, '.source-tools.json');
  if (
    lstatSync(link, { throwIfNoEntry: false }) &&
    (!existsSync(marker) || json(marker).root !== root)
  )
    throw Error('SOURCE_TOOLS_OUTPUT_EXISTS');
  const project = writeToolProject(root, packages);
  const npm = project.manifest.packageManager.startsWith('npm@');
  const command = npm ? 'npm' : 'corepack';
  const privateDownloads =
    Boolean(process.env.CI) ||
    (!npm &&
      existsSync(resolve(project.directory, 'node_modules/.modules.yaml')) &&
      existsSync(project.downloads));
  const args = npm
    ? ['ci', '--ignore-scripts', '--prefer-offline', '--no-audit', '--no-fund']
    : ['pnpm', 'install', '--frozen-lockfile', '--ignore-scripts', '--prefer-offline'];
  if (privateDownloads) args.push(npm ? '--cache' : '--store-dir', project.downloads);
  const downloads = privateDownloads
    ? project.downloads
    : execFileSync(command, npm ? ['config', 'get', 'cache'] : ['pnpm', 'store', 'path'], {
        cwd: project.directory,
        encoding: 'utf8',
      }).trim();
  const start = Date.now();
  execFileSync(command, args, { cwd: project.directory, stdio: 'inherit' });
  if (
    readFileSync(resolve(project.directory, project.file), 'utf8') !== project.lock ||
    toolProject(root, packages).key !== project.key
  )
    throw Error('SOURCE_TOOLS_INPUT_CHANGED');
  const modules = resolve(project.directory, 'node_modules');
  mkdirSync(link, { recursive: true });
  for (const entry of readdirSync(modules)) {
    const target = resolve(modules, entry);
    const path = resolve(link, entry);
    if (!lstatSync(path, { throwIfNoEntry: false })) symlinkSync(target, path, 'dir');
    if (realpathSync(path) !== realpathSync(target)) throw Error('SOURCE_TOOLS_OUTPUT_EXISTS');
  }
  writeFileSync(marker, JSON.stringify({ root, key: project.key }) + '\n');
  const allocatedKiB = (path) =>
    Number(execFileSync('du', ['-sk', path], { encoding: 'utf8' }).split(/\s+/)[0]);
  const receipt = {
    key: project.key,
    installedKiB: allocatedKiB(modules),
    downloadsKiB: privateDownloads ? allocatedKiB(downloads) : null,
    downloads: { path: downloads, shared: !privateDownloads },
    packages,
    preparationMs: Date.now() - start,
    core: false,
    sdk: false,
  };
  writeFileSync(
    resolve(root, '.runtime/source-tools.json'),
    JSON.stringify(receipt, null, 2) + '\n',
  );
  console.log(JSON.stringify(receipt));
}

export async function prepareCoreCommandMetadata(head, workspace) {
  if (!/^[a-f0-9]{40}$/.test(head)) throw Error('SOURCE_CORE_METADATA_HEAD');
  const response = await fetch(
    `https://raw.githubusercontent.com/CleverC2200/deepseek-harness/${head}/package.json`,
  );
  if (!response.ok) throw Error(`SOURCE_CORE_METADATA_HTTP: ${response.status}`);
  const text = await response.text();
  const manifest = JSON.parse(text);
  if (!manifest.scripts || typeof manifest.scripts !== 'object' || Array.isArray(manifest.scripts))
    throw Error('SOURCE_CORE_COMMANDS_REQUIRED');
  const directory = resolve(workspace, 'official-latest-standard');
  mkdirSync(directory);
  writeFileSync(resolve(directory, 'package.json'), text);
  return { head, bytes: Buffer.byteLength(text), purpose: 'command-reference-only' };
}
