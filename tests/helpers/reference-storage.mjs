import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const core = resolve(import.meta.dirname, '../../../../official-latest-standard');
const load = (path) => import(pathToFileURL(resolve(core, path)).href);
export const { Context } = await load('vendor/cordis/lib/index.js');
const Storage = await load('packages/storage/storage/lib/index.js');
const Json = await load('packages/storage/storage-json/lib/index.js');
const Domain = await load('packages/storage/storage-domain/lib/index.js');

export async function mountReferenceStorage(ctx, root) {
  await ctx.plugin(Storage.default);
  await ctx.plugin(Json, { root });
  await ctx.plugin(Domain, { backend: 'json' });
  return ctx.storageDomain;
}

export async function temporaryReferenceStorage(t, ctx = new Context()) {
  const root = await mkdtemp(join(tmpdir(), 'workbench-reference-'));
  const facility = await mountReferenceStorage(ctx, root);
  t.after(async () => {
    await ctx.fiber.dispose();
    await rm(root, { recursive: true, force: true });
  });
  return { ctx, root, facility };
}
