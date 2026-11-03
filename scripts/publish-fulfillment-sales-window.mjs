import { readFile, writeFile, mkdir, rename, realpath, access } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { resolve, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const names = [
  'window.html',
  'window.js',
  'card.mjs',
  'sales-card-template.mjs',
  'card-template.json',
];
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

/** Publish only the order-fulfillment presentation to an explicit server resource directory. */
export async function publishFulfillmentSalesWindow({ bundle, directory }) {
  if (!bundle || !directory) throw Error('Explicit bundle and presentation directory required');
  const source = await realpath(resolve(bundle));
  const manifestBytes = await readFile(join(source, 'manifest.json'));
  const manifest = JSON.parse(manifestBytes);
  if (
    manifest.owner !== 'dsh-agent-workbench' ||
    manifest.consumerCode !== 'order01' ||
    ![1, 2].includes(manifest.presentationApiVersion) ||
    Object.keys(manifest.assets ?? {})
      .sort()
      .join() !== [...names].sort().join()
  )
    throw Error('Invalid order presentation manifest');
  const files = new Map([['manifest.json', manifestBytes]]);
  for (const name of names) {
    const path = await realpath(join(source, name));
    if (!path.startsWith(source + sep)) throw Error('Presentation asset escapes bundle');
    const bytes = await readFile(path);
    if (bytes.length > 4 * 1024 * 1024 || digest(bytes) !== manifest.assets[name])
      throw Error('Presentation asset hash mismatch: ' + name);
    files.set(name, bytes);
  }
  const release = digest(manifestBytes);
  await mkdir(resolve(directory), { recursive: true });
  const root = await realpath(resolve(directory));
  await mkdir(join(root, 'releases'), { recursive: true });
  const releases = await realpath(join(root, 'releases'));
  if (!releases.startsWith(root + sep)) throw Error('Presentation releases escape directory');
  const destination = join(releases, release);
  let exists = true;
  try {
    await access(destination);
  } catch {
    exists = false;
  }
  if (exists) {
    const current = await realpath(destination);
    if (!current.startsWith(releases + sep)) throw Error('Presentation release escapes directory');
    for (const [name, bytes] of files)
      if (digest(await readFile(join(current, name))) !== digest(bytes))
        throw Error('Existing immutable release differs');
  } else {
    const staging = join(releases, '.incoming-' + randomUUID());
    await mkdir(staging);
    for (const [name, bytes] of files) await writeFile(join(staging, name), bytes, { flag: 'wx' });
    await rename(staging, destination);
  }
  const pointer = join(root, '.active-' + randomUUID() + '.json');
  await writeFile(pointer, JSON.stringify({ release }) + '\n', { flag: 'wx' });
  await rename(pointer, join(root, 'active.json'));
  return { owner: manifest.owner, release, directory: root, backendRestartRequired: false };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length !== 4 || args[0] !== '--bundle' || args[2] !== '--directory')
    throw Error(
      'Usage: --bundle <built sales-window directory> --directory <server presentation directory>',
    );
  console.log(
    JSON.stringify(await publishFulfillmentSalesWindow({ bundle: args[1], directory: args[3] })),
  );
}
