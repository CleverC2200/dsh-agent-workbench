// A source fixture can read this task's immutable, separately built assets.
// CI builds in its own source tree and leaves this override unset.
import { readFile as readSourceFile } from 'node:fs/promises';
import { resolve } from 'node:path';
export * from 'node:fs/promises';
export function readFile(path, options) {
  const prepared = process.env.WORKBENCH_BROWSER_ASSET_ROOT;
  const relative = typeof path === 'string' ? path.replaceAll('\\', '/') : '';
  const derived =
    relative.startsWith('lib/') ||
    ['static/category/index.html', 'static/mps/index.html', 'static/regional/index.html'].includes(
      relative,
    );
  if (prepared && derived) {
    const root = resolve(prepared),
      target = resolve(root, relative);
    if (!target.startsWith(root + '/')) throw Error('PREPARED_ASSET_SCOPE_REQUIRED');
    return readSourceFile(target, options);
  }
  return readSourceFile(path, options);
}
