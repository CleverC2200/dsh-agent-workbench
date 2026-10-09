import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import {personalFixtureHtml} from "./fixtures/personal-page-html.mjs";
const pause = () => new Promise((done) => setTimeout(done, 10));
async function until(check) {
  for (let i = 0; i < 150; i++) {
    if (check()) return;
    await pause();
  }
  assert.ok(check(), "personal mock reached the expected public state");
}
async function mount(t, restore = { version: 1 }, live = false) {
  const html = live ? await readFile("lib/business/inventory-personal/index.html", "utf8") : await personalFixtureHtml();
  const dom = new JSDOM(html, {
    url: "https://host.example/personal",
    referrer: "https://host.example/workbench",
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  Object.assign(dom.window, {
    AbortController,
    AbortSignal,
    TextEncoder,
    TextDecoder,
    structuredClone,
  });
  const messages = [],
    requests = [],
    errors = [],
    drafts = [];
  let saved,
    hold = false;
  const delayed = [];
  dom.window.fetch = () => {
    throw Error("Unexpected external request");
  };
  dom.window.HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  dom.window.HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  dom.window.parent.postMessage = (message) => {
    messages.push(message);
    if (message.protocol === "dsh-workbench-view-v1" && message.type === "save")
      saved = structuredClone(message.state);
  };
  dom.window.addEventListener("error", (event) =>
    errors.push(event.error?.message ?? event.message),
  );
  dom.window.addEventListener("unhandledrejection", (event) =>
    errors.push(String(event.reason)),
  );
  const emit = (data) =>
    dom.window.dispatchEvent(
      new dom.window.MessageEvent("message", {
        source: dom.window.parent,
        origin: "https://host.example",
        data,
      }),
    );
  for (const script of dom.window.document.querySelectorAll("script"))
    dom.window.eval(script.textContent);
  const port = {
    onmessage: null,
    start() {},
    close() {},
    postMessage(message) {
      messages.push(message);
      if (message.type !== "request") return;
      requests.push(message);
      const respond = () =>
        port.onmessage?.({
          data: {
            type: "response",
            id: message.id,
            result:
              message.method === "sql" ? (live === "denied" ? {rows:[{sku:"CLIPPED"}],total:1,returnedColumns:["sku"],rejectedColumns:[{alias:"quantity",reason:"RETURN_PERMISSION_DENIED"}]} : {rows:[],total:0,returnedColumns:[],rejectedColumns:[]}) : message.method === "draft"
                ? { drafted: true }
                : { accepted: true },
          },
        });
      if (message.method === "draft") drafts.push(message.parameters.text);
      if (hold && message.method === "context") delayed.push(respond);
      else queueMicrotask(respond);
    },
  };
  dom.window.dispatchEvent(
    new dom.window.MessageEvent("message", {
      source: dom.window.parent,
      origin: "https://host.example",
      ports: [port],
      data: {
        protocol: "gea-html-v2",
        type: "connect",
        context: { session: "session-A", plugin: "inventory-personal" },
      },
    }),
  );
  await until(() =>
    messages.some(
      (message) =>
        message.protocol === "dsh-workbench-view-v1" &&
        message.type === "ready",
    ),
  );
  emit({
    protocol: "dsh-workbench-view-v1",
    type: "restore",
    page: "inventory-personal",
    version: 1,
    channel: "owned-view",
    generation: 1,
    state: restore,
  });
  const root = dom.window.document.getElementById("app");
  await until(() =>
    root.querySelector('main[data-page-reference-ready="true"]'),
  );
  t.after(() => {
    port.onmessage = null;
    dom.window.dispatchEvent(new dom.window.Event("pagehide"));
    dom.window.close();
  });
  return {
    dom,
    root,
    messages,
    requests,
    errors,
    drafts,
    port,
    view: () => saved,
    context: () =>
      requests.filter((row) => row.method === "context").at(-1)?.parameters,
    hold: () => (hold = true),
    release: () => {
      hold = false;
      delayed.splice(0).forEach((done) => done());
    },
  };
}
const button = (root, text) =>
  [...root.querySelectorAll("button")].find(
    (node) => node.textContent.trim() === text,
  );
test("the offline personal input fixture keeps monitoring, age filters, unknown, zero and simulated denial", async (t) => {
  const page = await mount(t);
  const initial = page.context();
  assert.equal(initial.realData, true);
  assert.equal(initial.dataMode, "GEA_LIVE_READONLY");
  assert.match(page.root.textContent, /GEA 授权只读数据/);
  assert.match(page.root.textContent, /今日优先处理事项/);
  const metric = page.root.querySelector(
    '[data-page-target="personal:metric:平均货龄"]',
  );
  assert.match(metric.textContent, /已知31天以上30件/);
  button(page.root, "货龄").click();
  await until(
    () =>
      page.context().parts.personalWorkbench.filters?.current.riskType ===
        "货龄" && !page.context().parts.personalWorkbench.loading,
  );
  assert.equal(
    page
      .context()
      .parts.personalWorkbench.risks.some((r) => r.tags.includes("货龄")),
    true,
  );
  button(page.root, "大日期").click();
  await until(
    () =>
      page.context().parts.personalWorkbench.filters?.current.riskType ===
        "大日期" && !page.context().parts.personalWorkbench.loading,
  );
  assert.equal(
    page
      .context()
      .parts.personalWorkbench.risks.some(
        (r) => r.objectId === "base:郑州" && r.tags.includes("大日期"),
      ),
    true,
  );
  button(page.root, "华东基地").click();
  await until(
    () =>
      page.context().parts.personalWorkbench.filters?.current.objectId ===
        "base:华东" && !page.context().parts.personalWorkbench.loading,
  );
  assert.equal(page.context().parts.personalWorkbench.summary.inventory, 0);
  assert.equal(page.context().parts.personalWorkbench.summary.over30, 0);
  button(page.root, "西南基地").click();
  await until(
    () =>
      page.context().parts.personalWorkbench.filters?.current.objectId ===
        "base:西南" && !page.context().parts.personalWorkbench.loading,
  );
  assert.equal(page.context().parts.personalWorkbench.summary.over30, null);
  assert.equal(page.context().parts.personalWorkbench.summary.target, null);
  page.root
    .querySelector('[data-page-target="personal:object:branch:MOCK-DENIED"]')
    .click();
  await until(
    () =>
      page.context().parts.personalWorkbench.filters?.current.objectId ===
        "branch:MOCK-DENIED" && !page.context().parts.personalWorkbench.loading,
  );
  assert.equal(page.context().parts.personalWorkbench.summary.inventory, null);
  assert.match(page.root.textContent, /模拟拒权/);
  assert.deepEqual(
    [...new Set(page.requests.map((r) => r.method))],
    ["context"],
  );
  assert.deepEqual(page.errors, []);
});
test("feedback fields survive public page restoration and insertion is an unsent draft without conversation or a Task", async (t) => {
  const first = await mount(t);
  button(first.root, "货龄").click();
  await until(
    () =>
      first.context().parts.personalWorkbench.filters?.current.riskType ===
        "货龄" && !first.context().parts.personalWorkbench.loading,
  );
  button(first.root, "补充进展").click();
  await until(() => first.root.querySelector("dialog[open] textarea"));
  const area = first.root.querySelector("textarea");
  const setter = Object.getOwnPropertyDescriptor(
    first.dom.window.HTMLTextAreaElement.prototype,
    "value",
  ).set;
  area.focus();
  setter.call(area, "核对后再跟进，保留未发送反馈。");
  area.dispatchEvent(new first.dom.window.Event("input", { bubbles: true }));
  await until(() =>
    Object.values(first.view()?.feedbackNotes ?? {}).includes(
      "核对后再跟进，保留未发送反馈。",
    ),
  );
  const saved = first.view();
  button(first.root, "关闭").click();
  const next = await mount(t, saved);
  button(next.root, "补充进展").click();
  await until(
    () =>
      next.root.querySelector("textarea")?.value ===
      "核对后再跟进，保留未发送反馈。",
  );
  button(next.root, "插入未发送草稿").click();
  await until(() => next.drafts.length === 1);
  assert.match(next.drafts[0], /未发送反馈草稿/);
  assert.equal(
    next.requests.some((r) =>
      ["conversation", "sql", "workspace"].includes(r.method),
    ),
    false,
  );
  assert.equal(
    Object.values(next.view().feedbackNotes).includes(
      "核对后再跟进，保留未发送反馈。",
    ),
    true,
  );
  assert.deepEqual(next.errors, []);
});
test("Session changing withdraws old fact elements before the new catalog and a cancelled transition cannot commit late", async (t) => {
  const page = await mount(t);
  page.hold();
  const id = "cancel-filter";
  page.port.onmessage({
    data: {
      type: "invoke",
      session: "session-A",
      id,
      name: "filter",
      arguments: { objectId: "base:华东" },
    },
  });
  await until(() =>
    page.requests.some(
      (row) =>
        row.parameters?.parts?.personalWorkbench?.requested?.objectId ===
        "base:华东",
    ),
  );
  page.port.onmessage({ data: { type: "cancel", session: "session-A", id } });
  page.release();
  await until(() =>
    page.messages.some((row) => row.type === "invoked" && row.id === id),
  );
  assert.ok(
    page.messages.find((row) => row.type === "invoked" && row.id === id).error,
  );
  await until(
    () =>
      page.context().parts.personalWorkbench.filters?.current?.objectId ===
      "全部",
  );
  page.port.onmessage({
    data: {
      type: "context",
      context: { session: "session-B", plugin: "inventory-personal" },
    },
  });
  const newCatalog = page.messages.find(
    (row) => row.type === "catalog" && row.session === "session-B",
  );
  assert.equal(
    newCatalog.elements.some((row) => row.id.startsWith("personal:")),
    false,
  );
  await until(() =>
    page.root.querySelector('main[data-page-reference-ready="true"]'),
  );
  assert.deepEqual(page.errors, []);
});

test("personal source declarations retain their unique identities and default hidden policy", async () => {
  const manifest = JSON.parse(
    await readFile("business/inventory-personal/plugin.json", "utf8"),
  );
  const page = JSON.parse(
    await readFile("business/inventory-personal/page.json", "utf8"),
  );
  const profile = JSON.parse(
    await readFile(
      "../dsh-agent-manage/business-resources/inventory-personal/prompt.json",
      "utf8",
    ),
  );
  assert.equal(page.visible, false);
  assert.equal(manifest.mode, undefined);
  assert.equal(page.surface, "gea-html-inventory-personal");
  assert.equal(page.consumerCode, "inventory-personal-workbench");
  assert.equal(profile.consumerCode, page.consumerCode);
  assert.deepEqual(profile.skills, ["inventory-personal"]);
  assert.deepEqual(profile.pageAgents, ["gea-html-inventory-personal"]);
  const inputs = JSON.parse(
    await readFile("lib/business/inventory-personal/build-inputs.json", "utf8"),
  ).inputs;
  assert.equal(
    Object.keys(inputs).some((path) =>
      /(mock-input|host-read|fc-transfer|columnar|legacy)/.test(path),
    ),
    false,
  );
  assert.ok(Object.keys(inputs).some(path=>path.endsWith('/sql-reader.ts')));
  assert.ok(Object.keys(inputs).some(path=>path.endsWith('/aqkc-report.ts')));
  assert.ok(Object.keys(inputs).some(path=>path.endsWith('/warehouse-input.ts')));
});

test('a released view scope clears feedback fields before another Session restore and rejects the old channel',async t=>{
  const page=await mount(t,{version:1,riskType:'货龄',feedbackNotes:{'base:郑州:AGE':'旧Session未提交字段'}});
  const emit=data=>page.dom.window.dispatchEvent(new page.dom.window.MessageEvent('message',{source:page.dom.window.parent,origin:'https://host.example',data:{protocol:'dsh-workbench-view-v1',page:'inventory-personal',version:1,...data}}));
  const saved=page.view();
  emit({type:'released',channel:'owned-view',generation:1});
  emit({type:'restore',channel:'session-B-view',generation:1,state:{version:1}});
  emit({type:'restore',channel:'owned-view',generation:2,state:saved});
  await until(()=>page.context().parts.personalWorkbench.filters?.current.riskType==='全部');
  assert.deepEqual(page.view().feedbackNotes,undefined);
  assert.equal(Object.hasOwn(saved.feedbackNotes,'base:郑州:AGE'),true,'previous Session record remains recoverable under its owner');
});

 test("the actual built personal reader sends governed SQL through its public channel, keeps empty facts unknown and performs no model request",async t=>{
 const page=await mount(t,{version:1},true);
 const sql=page.requests.filter(m=>m.method==="sql");
 assert.ok(sql.length>=6);
 assert.ok(sql.every(m=>m.parameters.pageSize===200&&m.parameters.pageNo===1));
 assert.ok(sql.some(m=>m.parameters.sql.includes("agents_scm_safety_stock")));
 assert.ok(sql.some(m=>m.parameters.sql.includes("warehouse_catalog")));
 assert.equal(page.context().source,"GEA_GOVERNED_SQL");
 assert.equal(page.context().realData,false);
 assert.equal(page.context().dataMode,"GEA_LIVE_READONLY");
 assert.equal(page.context().parts.personalWorkbench.scope.length,0);
 assert.deepEqual(page.requests.filter(m=>m.method==="conversation"||m.method==="draft"),[]);
 assert.deepEqual(page.errors,[]);
 });

test("the actual built personal page rejects stable clipped fields and reports the source permission reason without real facts",async t=>{
 const page=await mount(t,{version:1},"denied");
 assert.equal(page.context().realData,false);
 assert.equal(page.context().parts.personalWorkbench.scope.length,0);
 assert.match(JSON.stringify(page.context().parts.personalWorkbench.errors),/RETURN_PERMISSION_DENIED/);
 assert.doesNotMatch(JSON.stringify(page.context().parts.personalWorkbench.risks),/CLIPPED/);
 assert.deepEqual(page.errors,[]);
});
