import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
const { outputFiles } = await build({
  entryPoints: ["src/workbench.ts"],
  bundle: true,
  write: false,
  format: "esm",
  platform: "node",
});
const { WorkbenchController } = await import(
  "data:text/javascript;base64," +
    Buffer.from(outputFiles[0].text).toString("base64")
);
function fixture(overrides = {}) {
  let navigation = new AbortController(),
    selected,
    panel,
    created = 0;
  const ports = {
    create: async () =>
      `session-${String(++created).padStart(8, "0")}-0000-0000-0000-000000000000`,
    prepare: async () => {},
    available: () => true,
    select: (id) => {
      selected = id;
    },
    panel: (id) => {
      panel = id;
      navigation.abort();
      controller.selectPanel(id);
    },
    beginNavigation: () => {
      navigation.abort();
      navigation = new AbortController();
      return navigation.signal;
    },
    showConversation: () => () => {},
    ...overrides,
  };
  const controller = new WorkbenchController(ports);
  return {
    controller,
    ports,
    get selected() {
      return selected;
    },
    get panel() {
      return panel;
    },
    get created() {
      return created;
    },
  };
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}
test("pages and business instances retain separate sessions without changing their preset", async () => {
  const f = fixture();
  f.controller.register({ id: "gea", preset: "gea" });
  f.controller.register({ id: "example", preset: "standard" });
  await f.controller.open("gea", "a");
  const a = f.selected;
  await f.controller.open("example", "a");
  const b = f.selected;
  assert.notEqual(a, b);
  await f.controller.open("gea", "b");
  const c = f.selected;
  assert.notEqual(a, c);
  await f.controller.open("gea", "a");
  assert.equal(f.selected, a);
  assert.equal(f.created, 3);
});
test("one page keeps distinct allowed Agent sessions and refuses a mismatched preset", async () => {
  let sequence = 0;
  const presets = new Map();
  const f = fixture({
    create: async (preset) => {
      const id = `session-${++sequence}`;
      presets.set(id, preset);
      return id;
    },
    presetOf: (id) => presets.get(id),
  });
  f.controller.register({ id: "inventory-fc", preset: "fc", allowedPresets: ["qll"] });
  await f.controller.open("inventory-fc", "fc", undefined, "fc");
  const fc = f.selected;
  await f.controller.open("inventory-fc", "qll", undefined, "qll");
  const qll = f.selected;
  assert.notEqual(fc, qll);
  assert.deepEqual([...presets.values()], ["fc", "qll"]);
  await f.controller.open("inventory-fc", "gea-history", qll);
  await assert.rejects(f.controller.open("inventory-fc", undefined, undefined, "fc"), /Session preset differs/);
  await f.controller.open("inventory-fc");
  assert.equal(f.selected, qll, "page bootstrap keeps the history instance and its allowed Agent");
  assert.equal(sequence, 2, "restoration does not create another Session");
  await f.controller.open("inventory-fc", "fc", undefined, "fc");
  assert.equal(f.selected, fc);
  assert.equal(sequence, 2);
  await assert.rejects(f.controller.open("inventory-fc", "other", undefined, "other"), /Preset not allowed/);
  await assert.rejects(f.controller.open("inventory-fc", "qll", fc, "qll"), /Session preset differs/);
  presets.set("foreign-session", "other");
  await assert.rejects(f.controller.open("inventory-fc", "forged", "foreign-session"), /not allowed/);
  assert.equal(f.selected, fc);
});
test("coalesces duplicate instance creation and latest navigation wins", async () => {
  const d = deferred();
  let calls = 0;
  const f = fixture({
    currentPanel: () => "gea",
    create: () => {
      calls++;
      return d.promise;
    },
  });
  f.controller.register({ id: "gea", preset: "gea" });
  const a = f.controller.open("gea"),
    b = f.controller.open("gea");
  d.resolve("session-one");
  assert.deepEqual(await Promise.all([a, b]), [false, true]);
  assert.equal(calls, 1);
  assert.equal(f.selected, "session-one");
});
test("only the selected startup page gets one central retry after a cancelled open", async () => {
  let attempts = 0;
  const f = fixture({
    currentPanel: () => "gea",
    beginNavigation: () => {
      const controller = new AbortController();
      if (++attempts === 1) controller.abort();
      return controller.signal;
    },
  });
  f.controller.register({ id: "gea", preset: "gea" });
  assert.equal(await f.controller.open("gea"), true);
  assert.equal(attempts, 2);
  assert.equal(f.panel, "gea");
});
test("reselecting the same mounted page allows its cancelled restore to finish", async () => {
  const scope = deferred();
  let authorityReads = 0;
  const f = fixture({ currentPanel: () => "gea" });
  f.controller.register({ id: "gea", preset: "gea", scope: () => ++authorityReads === 1 ? scope.promise : Promise.resolve("identity") });
  const opening = f.controller.open("gea");
  f.ports.panel("gea");
  scope.resolve("identity");
  assert.equal(await opening, true);
  assert.equal(f.created, 1);
  assert.equal(f.panel, "gea");
  assert.match(f.selected, /^session-/);
});
test("reselecting the current page still cancels an opening for another page", async () => {
  const scope = deferred();
  const f = fixture({ currentPanel: () => "gea" });
  f.controller.register({ id: "gea", preset: "gea" });
  f.controller.register({ id: "other", preset: "other", scope: () => scope.promise });
  const opening = f.controller.open("other");
  f.ports.panel("gea");
  scope.resolve("identity");
  assert.equal(await opening, false);
  assert.equal(f.created, 0);
  assert.equal(f.panel, "gea");
});
test("a slow request cannot steal selection from another page", async () => {
  const d = deferred();
  const f = fixture({
    create: (p) => (p === "slow" ? d.promise : Promise.resolve("fast-session")),
  });
  f.controller.register({ id: "a", preset: "slow" });
  f.controller.register({ id: "b", preset: "fast" });
  const a = f.controller.open("a");
  await f.controller.open("b");
  d.resolve("slow-session");
  assert.equal(await a, false);
  assert.equal(f.panel, "b");
  assert.equal(f.selected, "fast-session");
});
test("unregistration and logout invalidate pending association without stopping the host", async () => {
  for (const action of ["unregister", "forget", "dispose"]) {
    const d = deferred();
    const f = fixture({ create: () => d.promise });
    const off = f.controller.register({ id: "a", preset: "a" });
    const a = f.controller.open("a");
    if (action === "unregister") off();
    else if (action === "forget") f.controller.forget("a");
    else f.controller.dispose();
    d.resolve("late-session");
    assert.equal(await a, false);
    assert.equal(f.panel, undefined);
    assert.equal(f.selected, undefined);
  }
});
test("an explicitly associated session wins over earlier creation for the same instance", async () => {
  const d = deferred();
  const f = fixture({ create: () => d.promise });
  f.controller.register({ id: "a", preset: "a" });
  const pending = f.controller.open("a");
  await f.controller.open("a", "default", "chosen-session");
  d.resolve("late-session");
  await pending;
  await f.controller.open("a");
  assert.equal(f.selected, "chosen-session");
});
test("storage restores associations and malformed entries cannot become session identities", async () => {
  let stored;
  let active;
  const storage = {
    getItem: (key) => key === "agent-workbench:active-panel" ? active : stored,
    setItem: (key, v) => {
      if (key === "agent-workbench:active-panel") active = v;
      else stored = v;
    },
  };
  const a = fixture({ storage });
  a.controller.register({ id: "gea", preset: "gea" });
  await a.controller.open("gea", "business-a");
  const id = a.selected;
  const b = fixture({ storage });
  b.controller.register({ id: "gea", preset: "gea" });
  await b.controller.open("gea");
  assert.equal(b.selected, id);
  assert.equal(b.created, 0);
  stored = '[["gea","default",[["default",{"invalid":true}]]]]';
  const c = fixture({ storage });
  c.controller.register({ id: "gea", preset: "gea" });
  await c.controller.open("gea");
  assert.equal(c.created, 1);
});
test("failed session preparation preserves navigation and rejects to the caller", async () => {
  const f = fixture({
    prepare: async () => {
      throw new Error("unavailable");
    },
  });
  f.controller.register({ id: "a", preset: "a" });
  await assert.rejects(f.controller.open("a"), /unavailable/);
  assert.equal(f.selected, undefined);
});

test("a restored association waits for the session list instead of crashing initial panel selection", () => {
  const storage = {
    getItem: () =>
      JSON.stringify([
        [
          "gea",
          "default",
          [["default", "session-00000000-0000-0000-0000-000000000001"]],
          null,
        ],
      ]),
    setItem: () => {},
  };
  const f = fixture({ storage, available: () => false });
  f.controller.register({ id: "gea", preset: "gea" });
  f.controller.selectPanel("gea");
  assert.equal(f.selected, undefined);
});

test("runtime refuses three-field associations instead of silently decoding an old format", () => {
  const session = "session-00000000-0000-0000-0000-000000000001";
  const f = fixture({ storage: { getItem: key => key === "agent-workbench:v1" ? JSON.stringify([["gea", "default", [["default", session]]]]) : null, setItem: () => {} } });
  f.controller.register({ id: "gea", preset: "gea" });
  f.controller.selectPanel("gea");
  assert.equal(f.selected, undefined);
});

test("unmount and reload retain the exact page instance and durable Session", async () => {
  let stored;
  let active;
  const storage = {
    getItem: (key) => key === "agent-workbench:active-panel" ? active : stored,
    setItem: (key, value) => { if (key === "agent-workbench:active-panel") active = value; else stored = value; },
  };
  const first = fixture({ storage });
  const unmount = first.controller.register({ id: "inventory-fc", preset: "fc" });
  await first.controller.open("inventory-fc", "changsha");
  const session = first.selected;
  unmount();
  first.controller.dispose();
  const reloaded = fixture({ storage });
  reloaded.controller.register({ id: "inventory-fc", preset: "fc" });
  await reloaded.controller.open("inventory-fc");
  assert.equal(reloaded.selected, session);
  assert.equal(reloaded.created, 0);
});

test("reload returns to the saved business panel after its slot is registered", async () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  const first = fixture({ storage });
  first.controller.register({ id: "gea", preset: "gea" });
  first.controller.register({ id: "inventory-fc", preset: "fc" });
  first.controller.selectDefault("gea");
  await first.controller.open("inventory-fc", "changsha");
  const session = first.selected;
  first.controller.dispose();
  const next = fixture({ storage });
  next.controller.register({ id: "gea", preset: "gea" });
  next.controller.selectDefault("gea");
  assert.equal(next.panel, "gea");
  next.controller.register({ id: "inventory-fc", preset: "fc" });
  next.controller.restoreRegistered(["gea", "inventory-fc"]);
  assert.equal(next.panel, "inventory-fc");
  assert.equal(next.selected, undefined, "panel restoration waits for the page to prepare its Session");
  await next.controller.open("inventory-fc");
  assert.equal(next.selected, session);
  assert.equal(next.created, 0);
  const early = fixture({ storage });
  early.controller.register({ id: "inventory-fc", preset: "fc" });
  early.controller.restoreRegistered(["inventory-fc"]);
  early.controller.register({ id: "gea", preset: "gea" });
  early.controller.selectDefault("gea");
  assert.equal(early.panel, "inventory-fc", "a late startup default cannot displace the restored page");
});

test("a missing restored Session fails explicitly without creating or selecting another", async () => {
  let stored;
  let active;
  const storage = {
    getItem: (key) => key === "agent-workbench:active-panel" ? active : stored,
    setItem: (key, value) => { if (key === "agent-workbench:active-panel") active = value; else stored = value; },
  };
  const first = fixture({ storage });
  first.controller.register({ id: "inventory-fc", preset: "fc" });
  await first.controller.open("inventory-fc", "changsha");
  const reloaded = fixture({ storage, prepare: async () => { throw Error("Session unavailable"); } });
  reloaded.controller.register({ id: "inventory-fc", preset: "fc" });
  await assert.rejects(reloaded.controller.open("inventory-fc"), /Session unavailable/);
  assert.equal(reloaded.selected, undefined);
  assert.equal(reloaded.created, 0);
});

test("an identity change invalidates restored associations and late creation", async () => {
  let stored;
  let active;
  let scope = "first-login";
  const storage = {
    getItem: (key) => key === "agent-workbench:active-panel" ? active : stored,
    setItem: (key, value) => { if (key === "agent-workbench:active-panel") active = value; else stored = value; },
  };
  const page = { id: "inventory-fc", preset: "fc", scope: async () => scope };
  const first = fixture({ storage });
  first.controller.register(page);
  await first.controller.open(page.id, "changsha");
  scope = "second-login";
  const reloaded = fixture({ storage });
  reloaded.controller.register(page);
  await reloaded.controller.open(page.id);
  assert.equal(reloaded.created, 1);
  assert.equal(JSON.parse(stored)[0][3], "second-login");
  const slow = deferred();
  const entered = deferred();
  const pending = fixture({ storage, create: () => { entered.resolve(); return slow.promise; } });
  pending.controller.register(page);
  const opening = pending.controller.open(page.id, "new-instance");
  await entered.promise;
  scope = "third-login";
  slow.resolve("late-session");
  await assert.rejects(opening, /identity changed/);
  assert.equal(pending.selected, undefined);
  assert.equal(pending.panel, undefined);
});
