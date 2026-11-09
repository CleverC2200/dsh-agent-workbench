import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { readFile, mkdtemp, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  syncFulfillmentPluginResources,
  readPresentationArchive,
} from '../scripts/sync-fulfillment-plugin-resources.mjs';

const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const name = '@cleverc2200/dsh-agent-workbench';
const json = (object) => Buffer.from(JSON.stringify(object));
const directory = new URL(
  '../lib/business/inventory-orderfulfillment/sales-window/',
  import.meta.url,
);

export function archive(files) {
  const blocks = [];
  for (const [path, content, type = '0'] of files) {
    const bytes = Buffer.from(content),
      header = Buffer.alloc(512);
    if (Buffer.byteLength(path) > 100) throw Error('Fixture path too long');
    header.write(path);
    header.write('0000644\0', 100);
    header.write('0000000\0', 108);
    header.write('0000000\0', 116);
    header.write(bytes.length.toString(8).padStart(11, '0') + '\0', 124);
    header.write('00000000000\0', 136);
    header.fill(32, 148, 156);
    header.write(type, 156);
    header.write('ustar\0', 257);
    header.write('00', 263);
    header.write(
      [...header]
        .reduce((sum, byte) => sum + byte, 0)
        .toString(8)
        .padStart(6, '0') + '\0 ',
      148,
    );
    blocks.push(header, bytes, Buffer.alloc((512 - (bytes.length % 512)) % 512));
  }
  return gzipSync(Buffer.concat([...blocks, Buffer.alloc(1024)]));
}

export async function presentationFiles(marker = '') {
  const manifest = JSON.parse(await readFile(new URL('manifest.json', directory)));
  const files = new Map();
  for (const asset of Object.keys(manifest.assets)) {
    let bytes = await readFile(new URL(asset, directory));
    if (marker && asset === 'window.js')
      bytes = Buffer.concat([bytes, Buffer.from(`\n// local fixture ${marker}\n`)]);
    if (marker && asset === 'card-template.json')
      bytes = Buffer.from(bytes.toString().replaceAll('订单待确认', `订单待确认（${marker}）`));
    files.set(asset, bytes);
    manifest.assets[asset] = digest(bytes);
  }
  files.set('manifest.json', json(manifest));
  return files;
}

export async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'fulfillment-plugin-sync-'));
  const objects = new Map();
  let channel,
    origin,
    artifactReads = 0;
  const server = createServer((request, response) => {
    if (request.method !== 'GET') {
      response.writeHead(405);
      response.end();
      return;
    }
    const bytes =
      request.url === '/plugin-release/channels/plugin-detail-stable.json'
        ? channel
        : objects.get(request.url);
    if (!bytes) {
      response.writeHead(404);
      response.end();
      return;
    }
    if (request.url.endsWith('.tgz')) artifactReads++;
    response.end(bytes);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  const config = {
    directory: join(root, 'resources'),
    channelUrl: origin + '/plugin-release/channels/plugin-detail-stable.json',
    channel: 'plugin-detail-stable',
    allowLoopback: true,
  };
  const input = async (revision, marker = '', change = {}) => {
    const files = await presentationFiles(marker);
    const version = `0.1.${revision}`;
    const entries = [
      ['package/package.json', json({ name, version: change.packageVersion ?? version })],
      ...[...files].map(([asset, bytes]) => [
        'package/lib/business/inventory-orderfulfillment/sales-window/' + asset,
        bytes,
      ]),
    ];
    entries.push(['package/scripts/should-never-run.js', 'throw Error("MUST_NOT_EXECUTE")']);
    if (change.entries) entries.push(...change.entries);
    const artifact = archive(entries),
      artifactHash = digest(artifact);
    const artifactPath = `/plugin-release/packages/${artifactHash}/workbench.tgz`;
    const release = {
      schema: 1,
      name,
      version,
      artifact: { url: origin + artifactPath, size: artifact.length, sha256: artifactHash },
    };
    if (change.release) change.release(release);
    const releaseBytes = json(release),
      releaseHash = digest(releaseBytes);
    const releasePath = `/plugin-release/packages/${releaseHash}/workbench.release.json`;
    objects.set(artifactPath, change.corrupt ? Buffer.from('corrupt') : artifact);
    objects.set(releasePath, releaseBytes);
    const payload = {
      schema: 1,
      suite: true,
      channel: 'plugin-detail-stable',
      revision,
      issuedAt: new Date(Date.now() - 60000).toISOString(),
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      releases: [
        {
          name: '@cleverc2200/gea-dsh-prototype',
          url: origin + '/unused-gea',
          sha256: 'a'.repeat(64),
        },
      ],
      companionReleases: [
        { name, url: origin + releasePath, sha256: releaseHash },
        { name: 'dsh-agent-manage', url: origin + '/unused-manage', sha256: 'b'.repeat(64) },
      ],
    };
    if (change.payload) change.payload(payload);
    channel = json({ payloadBase64: json(payload).toString('base64') });
    return { files, payload, channel, artifactPath, releasePath };
  };
  return {
    root,
    config,
    input,
    objects,
    getArtifactReads: () => artifactReads,
    setChannel: (bytes) => {
      channel = bytes;
    },
    close: async () => {
      await new Promise((resolve) => server.close(resolve));
      await rm(root, { recursive: true, force: true });
    },
  };
}

test('existing suite channel companion imports only presentation files, follows updates, caches unchanged artifacts and retains pinned windows', async () => {
  const f = await fixture();
  try {
    await f.input(1);
    const first = await syncFulfillmentPluginResources(f.config);
    const firstScript = await readFile(
      join(f.config.directory, 'releases', first.release, 'window.js'),
    );
    assert.equal(first.backendRestartRequired, false);
    assert.equal(f.getArtifactReads(), 1);
    assert.equal((await syncFulfillmentPluginResources(f.config)).changed, false);
    assert.equal(f.getArtifactReads(), 1);
    await assert.rejects(readFile(join(f.config.directory, 'scripts/should-never-run.js')));
    await f.input(2, '新版');
    const second = await syncFulfillmentPluginResources(f.config);
    assert.notEqual(first.release, second.release);
    assert.deepEqual(
      await readFile(join(f.config.directory, 'releases', first.release, 'window.js')),
      firstScript,
    );
    assert.match(
      await readFile(
        join(f.config.directory, 'releases', second.release, 'card-template.json'),
        'utf8',
      ),
      /新版/,
    );
    assert.equal(
      JSON.parse(await readFile(join(f.config.directory, 'active.json'))).release,
      second.release,
    );
  } finally {
    await f.close();
  }
});

test('corrupt packages, cross-origin metadata, replay, expiry and mismatched identities never replace active resources', async () => {
  const f = await fixture();
  try {
    const old = await f.input(10);
    await syncFulfillmentPluginResources(f.config);
    const before = await readFile(join(f.config.directory, 'active.json'), 'utf8');
    const cases = [
      { corrupt: true },
      {
        release: (value) => {
          value.artifact.url = 'https://other.example/plugin.tgz';
        },
      },
      { packageVersion: '9.9.9' },
      {
        packageVersion: '0.0.9',
        release: (value) => {
          value.version = '0.0.9';
        },
      },
      {
        payload: (value) => {
          value.expiresAt = new Date(Date.now() - 1).toISOString();
        },
      },
      {
        entries: [
          ['package/lib/business/inventory-orderfulfillment/sales-window/window.js', 'duplicate'],
        ],
      },
      { entries: [['package/../../escape', 'escape']] },
      {
        entries: [
          ['package/lib/business/inventory-orderfulfillment/sales-window/card.mjs', '', '2'],
        ],
      },
    ];
    for (const change of cases) {
      await f.input(11, 'rejected', change);
      await assert.rejects(syncFulfillmentPluginResources(f.config));
      assert.equal(await readFile(join(f.config.directory, 'active.json'), 'utf8'), before);
    }
    await f.input(9);
    await assert.rejects(syncFulfillmentPluginResources(f.config), /REPLAY/);
    await f.input(10, 'different same revision');
    await assert.rejects(syncFulfillmentPluginResources(f.config), /REPLAY/);
    f.setChannel(old.channel);
    await assert.rejects(
      syncFulfillmentPluginResources({ ...f.config, allowLoopback: false }),
      /URL_FORBIDDEN/,
    );
  } finally {
    await f.close();
  }
});

test('same-version artifact replacement and concurrent writers are rejected', async () => {
  const f = await fixture();
  try {
    await f.input(1);
    await syncFulfillmentPluginResources(f.config);
    await f.input(2, 'changed', {
      packageVersion: '0.1.1',
      release: (value) => {
        value.version = '0.1.1';
      },
    });
    await assert.rejects(syncFulfillmentPluginResources(f.config), /SAME_VERSION_CHANGED/);
    await mkdir(join(f.config.directory, '.plugin-presentation-sync.lock'));
    await assert.rejects(syncFulfillmentPluginResources(f.config), /SYNC_BUSY/);
  } finally {
    await f.close();
  }
});

test('archive reader rejects malformed gzip and incomplete presentation', () => {
  assert.throws(() => readPresentationArchive(Buffer.from('not gzip')));
  assert.throws(
    () => readPresentationArchive(archive([['package/package.json', '{}']])),
    /FILES_MISSING/,
  );
});
