import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const { outputFiles } = await build({
  entryPoints: ['src/resource-selection.ts'],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
});
const { selectResource } = await import(
  'data:text/javascript;base64,' + Buffer.from(outputFiles[0].text).toString('base64')
);
test('resource selection creates a new native session in the explicit workspace and stages a Skill without sending or replacing another session', async () => {
  const calls = [];
  const host = {
    fetch: async (path) =>
      Response.json(
        path.endsWith('/config')
          ? { cwd: '/isolated/runtime/workspace' }
          : { id: 'skill:existing', preset: 'agent-resource-skill', skill: 'existing' },
      ),
    workspace: async (path) => {
      calls.push(['workspace', path]);
      return { workspaceId: 'workspace-owned', path };
    },
    create: async (options) => {
      calls.push(['create', options]);
      return 'new-session';
    },
    select: async (...args) => {
      calls.push(['select', ...args]);
    },
    open: async (id, skill) => {
      if (skill) calls.push(['stage', id, skill]);
      calls.push(['open', id]);
    },
  };
  await selectResource(host, 'skill:existing', new AbortController().signal);
  assert.deepEqual(calls, [
    ['workspace', '/isolated/runtime/workspace'],
    ['create', { workspaceId: 'workspace-owned' }],
    ['select', 'new-session', 'agent-resource-skill'],
    ['stage', 'new-session', 'existing'],
    ['open', 'new-session'],
  ]);
});
test('cancelled resource loading never creates or opens a native session', async () => {
  const controller = new AbortController();
  let created = false;
  const host = {
    fetch: async (path) => {
      if (path.endsWith('/config')) return Response.json({ cwd: '/isolated/workspace' });
      controller.abort();
      return Response.json({ preset: 'original' });
    },
    workspace: async () => {
      throw Error('Cancelled before workspace registration');
    },
    create: async () => {
      created = true;
      return 'new';
    },
    select: async () => {},
    open: async () => {
      throw Error('Unexpected navigation');
    },
  };
  await assert.rejects(selectResource(host, 'original', controller.signal));
  assert.equal(created, false);
});
test('a user edit made while the new Session is preparing remains intact and prevents navigation', async () => {
  const host = {
    fetch: async (path) =>
      Response.json(
        path.endsWith('/config')
          ? { cwd: '/isolated/workspace' }
          : { preset: 'original', skill: 'existing' },
      ),
    workspace: async () => ({ workspaceId: 'workspace-owned', path: '/canonical/workspace' }),
    create: async () => 'new',
    select: async () => {},
    open: async () => {
      throw Error('RESOURCE_DRAFT_CHANGED');
    },
  };
  await assert.rejects(
    selectResource(host, 'skill:existing', new AbortController().signal),
    /RESOURCE_DRAFT_CHANGED/,
  );
});
test('a page resource action publishes its UI association before native navigation and returns no embedded reference', async () => {
  const observed = [];
  const host = {
    fetch: async (path) =>
      Response.json(
        path.endsWith('/config')
          ? { cwd: '/isolated/workspace' }
          : { preset: 'gea-readonly', cwd: '/isolated/workspace' },
      ),
    workspace: async () => ({ workspaceId: 'workspace-owned', path: '/canonical/workspace' }),
    create: async () => 'page-session',
    select: async () => {},
    open: async (id, _skill, signal, beforeOpen) => {
      signal.throwIfAborted();
      beforeOpen?.({ sessionId: id, preset: 'gea-readonly', cwd: '/canonical/workspace' });
      observed.push(['native-main', id]);
    },
  };
  const selected = await selectResource(
    host,
    'gea-readonly',
    new AbortController().signal,
    undefined,
    (value) => observed.push(['association', value]),
  );
  assert.deepEqual(observed, [
    [
      'association',
      { sessionId: 'page-session', preset: 'gea-readonly', cwd: '/canonical/workspace' },
    ],
    ['native-main', 'page-session'],
  ]);
  assert.deepEqual(selected, { sessionId: 'page-session', preset: 'gea-readonly' });
});
test('resource selection sends the same explicit workspace to Manage and the official Session owner', async () => {
  const calls = [];
  const host = {
    fetch: async (path, options) => {
      calls.push([path, options]);
      return Response.json(
        path.endsWith('/config') ? { cwd: '/isolated/project' } : { preset: 'project-skill' },
      );
    },
    workspace: async (cwd) => {
      calls.push(['workspace', cwd]);
      return { workspaceId: 'project', path: cwd };
    },
    create: async () => 'session',
    select: async () => {},
    open: async () => {},
  };
  await selectResource(host, 'skill:project', new AbortController().signal);
  assert.deepEqual(JSON.parse(calls[1][1].body), { id: 'skill:project', cwd: '/isolated/project' });
  assert.deepEqual(calls[2], ['workspace', '/isolated/project']);
});

test('a changed Core preset cannot be associated using the selected resource metadata', async () => {
  const host = {
    fetch: async (path) =>
      Response.json(
        path.endsWith('/config') ? { cwd: '/isolated/project' } : { preset: 'declared' },
      ),
    workspace: async () => ({ workspaceId: 'workspace', path: '/isolated/project' }),
    create: async () => 'session',
    select: async () => {},
    open: async (id, _skill, _signal, beforeOpen) =>
      beforeOpen({ sessionId: id, preset: 'changed-in-Core' }),
  };
  let associated = false;
  await assert.rejects(
    selectResource(host, 'declared', new AbortController().signal, undefined, () => {
      associated = true;
    }),
    /PAGE_SESSION_PRESET_UNAVAILABLE/,
  );
  assert.equal(associated, false);
});

test('resource action uses the official directory picker when neither a current Workspace nor explicit cwd exists', async () => {
  const calls = [];
  const host = {
    fetch: async (path) => Response.json(path.endsWith('/config') ? {} : { preset: 'standard' }),
    pickDirectory: async () => {
      calls.push('pick');
      return '/selected/project';
    },
    workspace: async (path) => {
      calls.push(path);
      return { workspaceId: 'selected', path };
    },
    create: async () => 'new',
    select: async () => {},
    open: async () => {},
  };
  await selectResource(host, 'standard', new AbortController().signal);
  assert.deepEqual(calls, ['pick', '/selected/project']);
  host.pickDirectory = async () => null;
  await assert.rejects(
    selectResource(host, 'standard', new AbortController().signal),
    /WORKBENCH_WORKSPACE_REQUIRED/,
  );
  assert.deepEqual(calls, ['pick', '/selected/project']);
});
