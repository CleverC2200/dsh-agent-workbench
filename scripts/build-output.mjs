import { cp, mkdir, mkdtemp, rename, rm } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Prepare a complete owned directory before replacing its previous generated contents. */
export async function replaceBuildDirectory(destination, prepare) {
  const target = resolve(destination instanceof URL ? fileURLToPath(destination) : destination);
  await mkdir(dirname(target), { recursive: true });
  const staging = await mkdtemp(join(dirname(target), `.${basename(target)}-`));
  const backup = `${staging}.previous`;
  try {
    await prepare(staging);
    let previous = false;
    try {
      await rename(target, backup);
      previous = true;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    try {
      await rename(staging, target);
    } catch (error) {
      if (previous) {
        try {
          await rename(backup, target);
        } catch (restoreError) {
          throw new AggregateError(
            [error, restoreError],
            `Build publication failed; previous output is retained at ${backup}`,
          );
        }
      }
      throw error;
    }
    await rm(backup, { recursive: true, force: true });
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

/** Resource owners replace the Skill tree; page bundles and other generated siblings stay intact. */
export async function syncAgentResources(author, output) {
  const source = resolve(author instanceof URL ? fileURLToPath(author) : author);
  const target = resolve(output instanceof URL ? fileURLToPath(output) : output);
  await mkdir(target, { recursive: true });
  for (const file of ['capability.json', 'prompt.json', 'mcp.json'])
    await cp(join(source, file), join(target, file));
  await replaceBuildDirectory(join(target, 'skills'), (staging) =>
    cp(join(source, 'skills'), staging, { recursive: true }),
  );
}
