import { readFile, writeFile, mkdir, rename, rm, mkdtemp } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { publishFulfillmentSalesWindow } from './publish-fulfillment-sales-window.mjs';

const packageName = '@cleverc2200/dsh-agent-workbench';
const assetRoot = 'package/lib/business/inventory-orderfulfillment/sales-window/';
const names = [
  'manifest.json',
  'window.html',
  'window.js',
  'card.mjs',
  'sales-card-template.mjs',
  'card-template.json',
];
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const reject = (code) => {
  throw Error(code);
};
const hash = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

function versionParts(value) {
  if (
    typeof value !== 'string' ||
    !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(
      value,
    )
  )
    reject('PLUGIN_PRESENTATION_RELEASE_INVALID');
  const main = value.split('+')[0],
    separator = main.indexOf('-');
  const core = separator < 0 ? main : main.slice(0, separator),
    prerelease = separator < 0 ? undefined : main.slice(separator + 1);
  const parts = prerelease?.split('.');
  if (parts?.some((part) => !part || (/^\d+$/.test(part) && part.length > 1 && part[0] === '0')))
    reject('PLUGIN_PRESENTATION_RELEASE_INVALID');
  return { core: core.split('.').map(BigInt), parts };
}

function downgrade(next, previous) {
  const a = versionParts(next),
    b = versionParts(previous);
  for (let i = 0; i < 3; i++) if (a.core[i] !== b.core[i]) return a.core[i] < b.core[i];
  if (!a.parts || !b.parts) return Boolean(a.parts && !b.parts);
  for (let i = 0; i < Math.max(a.parts.length, b.parts.length); i++) {
    const x = a.parts[i],
      y = b.parts[i];
    if (x === y) continue;
    if (x === undefined || y === undefined) return x === undefined;
    const xn = /^\d+$/.test(x),
      yn = /^\d+$/.test(y);
    return xn && yn ? BigInt(x) < BigInt(y) : xn !== yn ? xn : x < y;
  }
  return false;
}

function sourceUrl(value, origin, allowLoopback) {
  const url = new URL(value);
  const loopback = allowLoopback && url.protocol === 'http:' && url.hostname === '127.0.0.1';
  if (
    (!loopback && url.protocol !== 'https:') ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    /[%\\]/.test(value) ||
    (origin && url.origin !== origin)
  )
    reject('PLUGIN_PRESENTATION_URL_FORBIDDEN');
  return url;
}

async function download(url, limit) {
  const response = await fetch(url, {
    redirect: 'error',
    signal: AbortSignal.timeout(30000),
    headers: { 'Cache-Control': 'no-cache' },
  });
  if (!response.ok || Number(response.headers.get('content-length')) > limit)
    reject('PLUGIN_PRESENTATION_DOWNLOAD_FAILED');
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > limit) reject('PLUGIN_PRESENTATION_DOWNLOAD_TOO_LARGE');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function pax(bytes) {
  let offset = 0;
  const fields = {};
  while (offset < bytes.length) {
    const space = bytes.indexOf(32, offset);
    const length = Number(bytes.subarray(offset, space).toString());
    if (
      space < offset ||
      !Number.isSafeInteger(length) ||
      length <= space - offset + 1 ||
      offset + length > bytes.length ||
      bytes[offset + length - 1] !== 10
    )
      reject('PLUGIN_PRESENTATION_TAR_INVALID');
    const field = bytes.subarray(space + 1, offset + length - 1).toString();
    const equals = field.indexOf('=');
    if (equals < 1) reject('PLUGIN_PRESENTATION_TAR_INVALID');
    fields[field.slice(0, equals)] = field.slice(equals + 1);
    offset += length;
  }
  return fields;
}

export function readPresentationArchive(archive) {
  const tar = gunzipSync(archive, { maxOutputLength: 128 * 1024 * 1024 });
  const files = new Map();
  let extended = {},
    global = {},
    terminated = false;
  const text = (bytes) => bytes.toString().split('\0')[0];
  for (let offset = 0; offset + 512 <= tar.length;) {
    const header = tar.subarray(offset, offset + 512);
    offset += 512;
    if (header.every((byte) => byte === 0)) {
      terminated = true;
      break;
    }
    const sizeText = text(header.subarray(124, 136)).trim();
    if (!/^[0-7]+$/.test(sizeText)) reject('PLUGIN_PRESENTATION_TAR_INVALID');
    const size = parseInt(sizeText, 8);
    const checksum = parseInt(text(header.subarray(148, 156)).trim(), 8);
    let actual = 0;
    for (let i = 0; i < 512; i++) actual += i >= 148 && i < 156 ? 32 : header[i];
    if (actual !== checksum || offset + size > tar.length)
      reject('PLUGIN_PRESENTATION_TAR_INVALID');
    const bytes = tar.subarray(offset, offset + size);
    offset += Math.ceil(size / 512) * 512;
    const type = text(header.subarray(156, 157));
    if (type === 'x' || type === 'g') {
      if (size > 1024 * 1024) reject('PLUGIN_PRESENTATION_TAR_INVALID');
      if (type === 'x') extended = pax(bytes);
      else global = { ...global, ...pax(bytes) };
      continue;
    }
    if (type === 'L' || type === 'K') reject('PLUGIN_PRESENTATION_TAR_INVALID');
    const prefix = text(header.subarray(345, 500));
    const path =
      extended.path ?? global.path ?? (prefix ? prefix + '/' : '') + text(header.subarray(0, 100));
    const metadata = { ...global, ...extended };
    extended = {};
    if (metadata.size !== undefined && Number(metadata.size) !== size)
      reject('PLUGIN_PRESENTATION_TAR_INVALID');
    if (
      path.startsWith('/') ||
      path.includes('\\') ||
      path.split('/').some((part) => part === '..' || part === '.')
    )
      reject('PLUGIN_PRESENTATION_TAR_INVALID');
    const name =
      path === 'package/package.json'
        ? 'package.json'
        : path.startsWith(assetRoot)
          ? path.slice(assetRoot.length)
          : null;
    if (name === null || !['package.json', ...names].includes(name)) continue;
    if (!['', '0'].includes(type) || size > 4 * 1024 * 1024 || files.has(name))
      reject('PLUGIN_PRESENTATION_TAR_INVALID');
    files.set(name, Buffer.from(bytes));
  }
  if (!terminated || files.size !== names.length + 1) reject('PLUGIN_PRESENTATION_FILES_MISSING');
  return files;
}

async function optionalJson(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

export async function syncFulfillmentPluginResources({
  channelUrl,
  channel,
  directory,
  allowLoopback = false,
  now = Date.now(),
}) {
  if (!channel || !directory) reject('PLUGIN_PRESENTATION_EXPLICIT_CONFIG_REQUIRED');
  const source = sourceUrl(channelUrl, null, allowLoopback);
  if (source.pathname !== `/plugin-release/channels/${channel}.json`)
    reject('PLUGIN_PRESENTATION_CHANNEL_INVALID');
  const root = resolve(directory);
  await mkdir(root, { recursive: true });
  const lock = join(root, '.plugin-presentation-sync.lock');
  try {
    await mkdir(lock);
  } catch (error) {
    if (error.code === 'EEXIST') reject('PLUGIN_PRESENTATION_SYNC_BUSY');
    throw error;
  }
  let staging;
  try {
    await writeFile(
      join(lock, 'owner.json'),
      JSON.stringify({
        pid: process.pid,
        source: source.href,
        startedAt: new Date().toISOString(),
      }),
    );
    const statePath = join(root, '.plugin-presentation-state.json');
    const state = await optionalJson(statePath);
    if (
      state &&
      (state.source !== source.href ||
        !Number.isSafeInteger(state.revision) ||
        !hash(state.channelSha256) ||
        !hash(state.artifactSha256) ||
        !hash(state.release))
    )
      reject('PLUGIN_PRESENTATION_STATE_INVALID');
    const envelopeBytes = await download(source, 1024 * 1024);
    const envelope = JSON.parse(envelopeBytes);
    if (
      typeof envelope.payloadBase64 !== 'string' ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(envelope.payloadBase64)
    )
      reject('PLUGIN_PRESENTATION_CHANNEL_INVALID');
    const payload = JSON.parse(Buffer.from(envelope.payloadBase64, 'base64'));
    if (
      payload.schema !== 1 ||
      payload.channel !== channel ||
      !Number.isSafeInteger(payload.revision) ||
      payload.revision < 1 ||
      !Array.isArray(payload.releases) ||
      !payload.releases.length ||
      (payload.companionReleases !== undefined && !Array.isArray(payload.companionReleases))
    )
      reject('PLUGIN_PRESENTATION_CHANNEL_INVALID');
    const issued = Date.parse(payload.issuedAt),
      expires = Date.parse(payload.expiresAt);
    if (
      !Number.isFinite(issued) ||
      !Number.isFinite(expires) ||
      issued > now + 300000 ||
      expires <= now ||
      expires <= issued
    )
      reject('PLUGIN_PRESENTATION_CHANNEL_EXPIRED');
    const channelSha256 = digest(envelopeBytes);
    if (
      state &&
      (payload.revision < state.revision ||
        (payload.revision === state.revision && channelSha256 !== state.channelSha256))
    )
      reject('PLUGIN_PRESENTATION_CHANNEL_REPLAY');
    const references = [...payload.releases, ...(payload.companionReleases ?? [])];
    if (
      references.length > 3 ||
      new Set(references.map((item) => item?.name)).size !== references.length
    )
      reject('PLUGIN_PRESENTATION_CHANNEL_INVALID');
    const matches = references.filter((item) => item?.name === packageName);
    if (matches.length !== 1) reject('PLUGIN_PRESENTATION_WORKBENCH_MISSING');
    const reference = matches[0];
    if (!hash(reference.sha256)) reject('PLUGIN_PRESENTATION_RELEASE_INVALID');
    const releaseUrl = sourceUrl(reference.url, source.origin, allowLoopback);
    if (!releaseUrl.pathname.startsWith(`/plugin-release/packages/${reference.sha256}/`))
      reject('PLUGIN_PRESENTATION_URL_FORBIDDEN');
    const releaseBytes = await download(releaseUrl, 1024 * 1024);
    if (digest(releaseBytes) !== reference.sha256)
      reject('PLUGIN_PRESENTATION_RELEASE_HASH_MISMATCH');
    const release = JSON.parse(releaseBytes);
    if (
      release.schema !== 1 ||
      release.name !== packageName ||
      !hash(release.artifact?.sha256) ||
      !Number.isSafeInteger(release.artifact.size) ||
      release.artifact.size < 1 ||
      release.artifact.size > 32 * 1024 * 1024
    )
      reject('PLUGIN_PRESENTATION_RELEASE_INVALID');
    versionParts(release.version);
    if (state && downgrade(release.version, state.version))
      reject('PLUGIN_PRESENTATION_DOWNGRADE_FORBIDDEN');
    const artifactUrl = sourceUrl(release.artifact.url, source.origin, allowLoopback);
    if (!artifactUrl.pathname.startsWith(`/plugin-release/packages/${release.artifact.sha256}/`))
      reject('PLUGIN_PRESENTATION_URL_FORBIDDEN');
    if (state?.version === release.version && state.artifactSha256 !== release.artifact.sha256)
      reject('PLUGIN_PRESENTATION_SAME_VERSION_CHANGED');
    let bundle;
    if (state?.artifactSha256 === release.artifact.sha256) {
      if (state.version !== release.version) reject('PLUGIN_PRESENTATION_PACKAGE_MISMATCH');
      bundle = join(root, 'releases', state.release);
      if (digest(await readFile(join(bundle, 'manifest.json'))) !== state.release)
        reject('PLUGIN_PRESENTATION_STATE_INVALID');
    } else {
      const archive = await download(artifactUrl, 32 * 1024 * 1024);
      if (archive.length !== release.artifact.size || digest(archive) !== release.artifact.sha256)
        reject('PLUGIN_PRESENTATION_ARCHIVE_HASH_MISMATCH');
      const files = readPresentationArchive(archive);
      const manifest = JSON.parse(files.get('package.json'));
      if (manifest.name !== packageName || manifest.version !== release.version)
        reject('PLUGIN_PRESENTATION_PACKAGE_MISMATCH');
      staging = await mkdtemp(join(root, '.plugin-presentation-'));
      for (const name of names)
        await writeFile(join(staging, name), files.get(name), { flag: 'wx' });
      bundle = staging;
    }
    const previous = await optionalJson(join(root, 'active.json'));
    const published = await publishFulfillmentSalesWindow({ bundle, directory: root });
    const next = {
      source: source.href,
      revision: payload.revision,
      channelSha256,
      version: release.version,
      artifactSha256: release.artifact.sha256,
      release: published.release,
    };
    const tempState = join(root, '.plugin-presentation-state-' + randomUUID());
    await writeFile(tempState, JSON.stringify(next) + '\n', { flag: 'wx' });
    await rename(tempState, statePath);
    return { ...next, changed: previous?.release !== next.release, backendRestartRequired: false };
  } finally {
    if (staging) await rm(staging, { recursive: true, force: true });
    await rm(lock, { recursive: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2),
    options = {};
  for (let i = 0; i < args.length; i += 2) {
    if (
      !['--channel-url', '--channel', '--directory', '--watch-seconds'].includes(args[i]) ||
      !args[i + 1]
    )
      reject('PLUGIN_PRESENTATION_ARGUMENTS_INVALID');
    options[args[i]] = args[i + 1];
  }
  const config = {
    channelUrl: options['--channel-url'],
    channel: options['--channel'],
    directory: options['--directory'],
  };
  const interval = Number(options['--watch-seconds'] || 0);
  if (!Number.isInteger(interval) || (interval !== 0 && interval < 30))
    reject('PLUGIN_PRESENTATION_INTERVAL_INVALID');
  let stopping = false,
    wake;
  const stop = () => {
    stopping = true;
    wake?.();
  };
  if (interval) {
    process.once('SIGTERM', stop);
    process.once('SIGINT', stop);
  }
  do {
    try {
      console.log(JSON.stringify(await syncFulfillmentPluginResources(config)));
    } catch (error) {
      console.error(JSON.stringify({ code: error.message, syncFailed: true }));
      if (!interval) process.exitCode = 1;
    }
    if (interval && !stopping)
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, interval * 1000);
        wake = () => {
          clearTimeout(timer);
          resolve();
        };
        if (stopping) wake();
      });
  } while (interval && !stopping);
}
