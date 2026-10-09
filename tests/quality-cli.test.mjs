import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const run = (cwd, ...args) =>
  spawnSync(process.execPath, ['scripts/quality.mjs', ...args], { cwd, encoding: 'utf8' });
const command = (cwd, executable, args) => {
  const result = spawnSync(executable, args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  return result.stdout;
};

test('public quality CLI enforces fixed debt and refuses new violations and weakened inputs', () => {
  mkdirSync(join(root, '.scratch'), { recursive: true });
  const fixture = mkdtempSync(join(root, '.scratch/quality-'));
  try {
    command(root, 'git', ['clone', '--shared', '--quiet', root, fixture]);
    mkdirSync(join(fixture, '.github'), { recursive: true });
    for (const file of ['scripts/quality.mjs', '.oxlintrc.json', '.oxfmtrc.json'])
      cpSync(join(root, file), join(fixture, file));
    // A fixture owns its installation. Reuse only exact registry lock metadata, never node_modules.
    const original = JSON.parse(readFileSync(join(root, 'package-lock.json')));
    const packages = Object.fromEntries(
      Object.entries(original.packages).filter(([path]) =>
        /node_modules\/(?:oxlint|oxfmt|tinypool|@oxlint\/|@oxfmt\/)/.test(path),
      ),
    );
    const manifest = {
      name: 'quality-fixture',
      version: '1.0.0',
      devDependencies: { oxlint: '1.87.0', oxfmt: '0.72.0' },
    };
    writeFileSync(join(fixture, 'package.json'), JSON.stringify(manifest));
    writeFileSync(
      join(fixture, 'package-lock.json'),
      JSON.stringify({
        name: manifest.name,
        version: manifest.version,
        lockfileVersion: 3,
        requires: true,
        packages: { '': manifest, ...packages },
      }),
    );
    command(fixture, 'npm', ['ci', '--offline', '--ignore-scripts', '--no-audit', '--no-fund']);
    const expect = (mode, file, status, pattern) => {
      const result = run(fixture, mode, file);
      assert.equal(result.status, status, result.stdout + result.stderr);
      if (pattern) assert.match(result.stdout + result.stderr, pattern);
    };
    writeFileSync(join(fixture, 'src/quality-new.mjs'), 'export const answer = 42;\n');
    expect('lint', 'src/quality-new.mjs', 0);
    expect('format', 'src/quality-new.mjs', 0);
    writeFileSync(join(fixture, 'src/quality-new.mjs'), 'const forgotten = 42;\n');
    expect('lint', 'src/quality-new.mjs', 1, /no-unused-vars/);
    writeFileSync(join(fixture, 'src/quality-new.mjs'), 'export const answer={value:42}\n');
    expect('format', 'src/quality-new.mjs', 1, /FORMAT_REQUIRED/);
    writeFileSync(join(fixture, 'src/quality-new.mjs'), 'export const = ;\n');
    expect('lint', 'src/quality-new.mjs', 2);
    assert.notEqual(run(fixture, 'format', 'src/quality-new.mjs').status, 0);
    writeFileSync(join(fixture, 'src/quality-new.mjs'), 'const forgotten={value:42}\n');
    writeFileSync(join(fixture, '.gitignore'), 'src/quality-new.mjs\n');
    writeFileSync(join(fixture, '.eslintignore'), 'src/quality-new.mjs\n');
    writeFileSync(join(fixture, '.prettierignore'), 'src/quality-new.mjs\n');
    expect('lint', 'src/quality-new.mjs', 1);
    expect('format', 'src/quality-new.mjs', 1);
    mkdirSync(join(fixture, 'src/nested'), { recursive: true });
    writeFileSync(join(fixture, 'src/nested/.oxlintrc.json'), '{"rules":{"no-unused-vars":"off"}}');
    writeFileSync(join(fixture, 'src/nested/bad.mjs'), 'const forgotten = 42;\n');
    expect('lint', 'src/nested/bad.mjs', 1);
    const debt = 'src/host.ts';
    writeFileSync(
      join(fixture, debt),
      command(root, 'git', ['show', `9814b3bcf1ae015a63fac9af864c165617791fc3:${debt}`]),
    );
    expect('format', debt, 0, /1 unchanged baseline debt files/);
    expect('format-audit', debt, 1);
    writeFileSync(
      join(fixture, debt),
      readFileSync(join(fixture, debt), 'utf8') + '\nexport const unformatted={value:42}\n',
    );
    expect('format', debt, 1);
    for (const file of ['src/missing.mjs', 'src', 'static/category/source/vendor.js'])
      assert.notEqual(run(fixture, 'format', file).status, 0);
    writeFileSync(join(fixture, 'samples/quality.html'), '<div   >hello</div>\n');
    expect('format', 'samples/quality.html', 1);
    assert.notEqual(run(fixture, 'lint', 'samples/quality.html').status, 0);
    const configuration = readFileSync(join(fixture, '.oxlintrc.json'));
    writeFileSync(join(fixture, '.oxlintrc.json'), '{"categories":{"correctness":"off"}}');
    expect('lint', 'src/quality-new.mjs', 2, /QUALITY_POLICY/);
    writeFileSync(join(fixture, '.oxlintrc.json'), configuration);
    const script = readFileSync(join(fixture, 'scripts/quality.mjs'), 'utf8');
    writeFileSync(
      join(fixture, 'scripts/quality.mjs'),
      script.replace(
        "const baseline = '9814b3bcf1ae015a63fac9af864c165617791fc3'",
        "const baseline = '9b4863692cb29a3edc8a2358e98feb7846526d1b'",
      ),
    );
    expect('format', debt, 2, /QUALITY_BASELINE/);
    writeFileSync(join(fixture, 'scripts/quality.mjs'), script);
    writeFileSync(
      join(fixture, 'scripts/quality.mjs'),
      script.replace('const scope =', "fixed.add('src/quality-new.mjs');\nconst scope ="),
    );
    expect('format', debt, 2, /QUALITY_POLICY_SCOPE/);
    writeFileSync(join(fixture, 'scripts/quality.mjs'), script);
    const tool = join(fixture, 'node_modules/oxlint/package.json');
    const toolManifest = readFileSync(tool);
    writeFileSync(tool, JSON.stringify({ ...JSON.parse(toolManifest), version: '0.0.0' }));
    expect('lint', 'src/quality-new.mjs', 2, /QUALITY_TOOL/);
    writeFileSync(tool, toolManifest);
    rmSync(join(fixture, 'node_modules'), { recursive: true });
    expect('lint', 'src/quality-new.mjs', 2);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});
