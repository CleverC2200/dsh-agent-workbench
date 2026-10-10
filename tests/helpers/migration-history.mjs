import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const bytes = readFileSync(new URL('../fixtures/migration-history.raw', import.meta.url));
if (hash(bytes) !== 'b4df15d170e9a1d4e4da7d30e354a2bdbc93c339f187b28e1a3c3feb51e4f6fe')
  throw Error('HISTORY_FIXTURE_CHANGED: original source bytes required');
const history = JSON.parse(bytes);
for (const group of Object.values(history)) {
  for (const [file, entry] of Object.entries(group.files)) {
    const value = Buffer.from(entry.text);
    const blob = createHash('sha1').update(`blob ${value.length}\0`).update(value).digest('hex');
    if (hash(value) !== entry.sha256 || blob !== entry.blob)
      throw Error(`HISTORY_FIXTURE_CHANGED: ${file}`);
    Object.freeze(entry);
  }
  Object.freeze(group.files);
  Object.freeze(group);
}
/** Fixed test inputs preserve original Git blobs; optional declared Git roots are read-only. */
export function migrationHistory(name, root) {
  const group = history[name];
  if (!group) throw Error(`HISTORY_INPUT_REQUIRED: ${name}`);
  if (root)
    for (const [file, entry] of Object.entries(group.files)) {
      const observed = execFileSync('git', ['-C', root, 'show', `${group.commit}:${file}`]);
      if (hash(observed) !== entry.sha256) throw Error(`HISTORY_FIXTURE_CHANGED: ${name}/${file}`);
    }
  return group;
}
