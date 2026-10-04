window.__ModuleLoader__.load({id:"@cleverc2200/dsh-agent-workbench",factory:(require)=>{var module={exports:{}};var exports=module.exports;"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client.ts
var client_exports = {};
__export(client_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(client_exports);
var import_react4 = __toESM(require("react"), 1);

// src/resource-selection.ts
async function resourceWorkspace(request, signal, cwd) {
  if (cwd?.trim()) return cwd;
  const configResponse = await request("/api/agent-workbench/config", { signal, cache: "no-store" });
  if (!configResponse.ok) throw Error("WORKBENCH_WORKSPACE_UNAVAILABLE");
  const config = await configResponse.json();
  if (typeof config.cwd !== "string" || !config.cwd.trim()) throw Error("WORKBENCH_WORKSPACE_REQUIRED");
  return config.cwd;
}
async function selectResource(host, id, signal, embedded = false, currentCwd) {
  const cwd = await resourceWorkspace(host.fetch, signal, currentCwd);
  const response = await host.fetch("/api/agent-manage/resources/select", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, cwd }), signal });
  const resource = await response.json();
  if (!response.ok || typeof resource.preset !== "string") throw Error(resource.error ?? "RESOURCE_SELECTION_FAILED");
  signal.throwIfAborted();
  const workspaceId = await host.workspace(cwd);
  signal.throwIfAborted();
  const sessionId = await host.create({ workspaceId });
  signal.throwIfAborted();
  await host.select(sessionId, resource.preset);
  signal.throwIfAborted();
  const reference = await host.open(sessionId, typeof resource.skill === "string" ? resource.skill : void 0, signal, embedded);
  return { sessionId, preset: resource.preset, ...reference ? { reference } : {} };
}
function mountNativeResourceSelection(ctx, ready) {
  let active;
  return ctx.inject(["sessions", "workspaces", "remote", "remote.agentPresets", "conversation", "uiWorkspace"], (scope) => {
    const host = {
      fetch: (...args) => fetch(...args),
      workspace: async (path) => (await scope.workspaces.create({ path })).workspaceId,
      create: (options) => scope.sessions.create({ workspaceId: options.workspaceId }),
      select: async (id, preset) => {
        const result = await scope.remote.agentPresets.select(id, preset);
        if (!result.ok) throw Error(result.error.message);
      },
      open: async (id, skill, signal, embedded) => {
        const reference = scope.sessions.retain(id, { source: "agentResourceSelection", signal });
        try {
          await reference.ready;
          signal.throwIfAborted();
          if (skill) {
            const input = scope.conversation.input.for(reference.binding.ctx);
            const state = input.state.getSnapshot();
            if (state.draft || reference.binding.ctx.bail("slash/input-insert-text", { text: `/${skill} `, span: { start: 0, end: 0, draftRev: state.draftRev } }) !== true) throw Error("RESOURCE_DRAFT_CHANGED");
          }
          if (embedded) return reference;
          scope.uiWorkspace.openSession(id);
        } catch (error) {
          reference.release();
          throw error;
        }
        reference.release();
      }
    };
    active = host;
    ready(host);
    scope.effect(() => () => {
      if (active === host) {
        active = void 0;
        ready(void 0);
      }
    });
  });
}

// src/company/ui.tsx
var import_react = require("react");

// src/company/brand-logo.png
var brand_logo_default = "data:image/png;base64,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";

// src/company/conversation-prompts.ts
var approvalConversation = {
  name: "\u9500\u552E\u8BA1\u5212Agent",
  intro: "\u6211\u53EF\u4EE5\u6309\u4F60\u5F53\u524D\u8282\u70B9\u7684\u53E3\u5F84\u6838\u5BF9\u8FD9\u5F20\u8BA1\u5212\uFF1A\u5148\u7ED9\u7ED3\u8BBA\uFF0C\u518D\u7ED9\u4F9D\u636E\uFF0C\u5F02\u5E38\u9879\u9010\u6761\u7ED9\u5904\u7406\u5EFA\u8BAE\u3002",
  boundary: "\u5206\u6790\u9ED8\u8BA4\u53EA\u8BFB\uFF1B\u6309\u4F60\u7684\u660E\u786E\u8981\u6C42\u64CD\u4F5C\u5DF2\u5F00\u653E\u9875\u9762\uFF0C\u5BA1\u6279\u987B\u6709\u6743\u9650\u5E76\u4EE5\u7CFB\u7EDF\u56DE\u6267\u4E3A\u51C6\u3002",
  actions: [
    {
      icon: "check",
      tone: "brand",
      label: "\u5BA1\u8FD9\u5F20\u5355",
      detail: "\u7ED3\u8BBA\u5148\u884C\uFF1A\u80FD\u4E0D\u80FD\u76F4\u63A5\u540C\u610F\uFF0C\u4E0D\u80FD\u540C\u610F\u5361\u5728\u54EA",
      prompt: "\u5BA1\u8FD9\u5F20\u5355"
    },
    {
      icon: "alert",
      tone: "brand",
      label: "\u770B\u5F02\u5E38\u6E05\u7406\u6E05\u5355",
      detail: "\u4E0B\u5E02\u4E0E\u9884\u4E0B\u5E02\u3001\u975E\u5B63\u8282\u54C1\u3001\u8D27\u9F84\u8D85\u671F\u3001\u9700\u590D\u6838",
      prompt: "\u770B\u5F02\u5E38\u6E05\u7406\u6E05\u5355"
    },
    {
      icon: "versions",
      tone: "info",
      label: "\u770B\u53CC\u7248\u672C\u5DEE\u5F02",
      detail: "\u6700\u65B0\u7248\u4E0E\u4E0A\u4E00\u7248\u6539\u4E86\u54EA\u4E9B\u5BA2\u6237\u548C\u5546\u54C1",
      prompt: "\u770B\u53CC\u7248\u672C\u5DEE\u5F02"
    },
    {
      icon: "opinion",
      tone: "success",
      label: "\u751F\u6210\u5BA1\u6279\u610F\u89C1",
      detail: "\u91C7\u7EB3\u8BB0\u5F55\u7559\u75D5\uFF1A\u8C01\u91C7\u7EB3\u3001\u6539\u524D\u6539\u540E",
      prompt: "\u751F\u6210\u5BA1\u6279\u610F\u89C1"
    }
  ],
  prompts: [
    "\u8FD9\u5F20\u5355\u80FD\u76F4\u63A5\u540C\u610F\u5417\uFF1F",
    "\u54EA\u4E9B\u5BA2\u6237\u9700\u8981\u9000\u56DE\u91CD\u63D0\uFF1F",
    "\u6C64\u5706\u54C1\u7C7B\u4E3A\u4EC0\u4E48\u6BD4\u4E0A\u4E00\u7248\u964D\u4E86\uFF1F",
    "\u7701\u533A\u6574\u4F53\u8FBE\u6210\u504F\u4E50\u89C2\u5417\uFF1F"
  ]
};
var mpsPlanConversation = {
  name: "\u4E3B\u751F\u4EA7\u8BA1\u5212Agent",
  intro: "\u6211\u6309\u94FE\u8DEF\u53E3\u5F84\u5E2E\u4F60\u6838\u5BF9\u6708\u8BA1\u5212\uFF1A\u4E09\u8DEF\u9700\u6C42\u662F\u5426\u9F50\u5907\u3001\u4E3B\u6570\u636E\u4E0E\u7EA6\u675F\u662F\u5426\u5C31\u4F4D\uFF0C\u7F3A\u53E3\u548C\u8C03\u62E8\u62C6\u5206\u8BE5\u600E\u4E48\u770B\u3002",
  boundary: "\u53EA\u51FA\u5EFA\u8BAE\u3001\u4E0D\u6539\u8BA1\u5212\uFF1B\u6B63\u5F0F\u8BA1\u5212\u4ECD\u4EE5\u6708\u8BA1\u5212\u7F16\u5236\u6D41\u7A0B\u4E3A\u51C6\u3002",
  actions: [],
  prompts: [
    "\u751F\u6210 10 \u6708\u6EDA\u52A8\u8BA1\u5212\u521D\u7A3F",
    "\u770B\u5404\u57FA\u5730 M+2 \u4EA7\u80FD",
    "\u4E09\u8DEF\u9700\u6C42\u5BF9\u4E0D\u4E0A\u7684\u5730\u65B9",
    "M+2 \u7F3A\u53E3\u600E\u4E48\u5904\u7F6E",
    "\u8FD9\u4E2A\u6708\u8C03\u62E8\u54C1\u62C6\u5206\u89C4\u5219"
  ]
};
var regionalPlanConversation = {
  name: "\u533A\u57DF\u8BA1\u5212Agent",
  intro: "\u6211\u53EF\u4EE5\u8DE8\u6A21\u5757\u76EF\u63D0\u62A5\u8FDB\u5EA6\u3001\u627E\u5F02\u5E38\uFF0C\u7ED9\u63D0\u62A5\u4E0E\u8DDF\u50AC\u7684\u53C2\u8003\u610F\u89C1\u3002",
  boundary: "\u533A\u57DF\u8BA1\u5212\u4E0D\u53C2\u4E0E\u5BA1\u6279\u4E0E\u9000\u56DE\uFF0C\u6211\u53EA\u505A\u8DDF\u8E2A\u3001\u8BC4\u4F30\u4E0E\u8DDF\u50AC\u3002",
  actions: [
    {
      icon: "chart",
      tone: "brand",
      label: "\u770B\u63D0\u62A5\u4E0E\u8DDF\u50AC",
      detail: "\u5F85\u8DDF\u8FDB\u4E8B\u4EF6\u4E0E\u56DB\u7EF4\u63D0\u62A5 / \u5BA1\u6279\u4E0B\u94BB",
      prompt: "\u770B\u63D0\u62A5\u4E0E\u8DDF\u50AC"
    },
    {
      icon: "box",
      tone: "brand",
      label: "\u770B\u54C1\u7C7B\u8FBE\u6210",
      detail: "\u54C1\u7C7B\u8FBE\u6210\u4E0E\u54C1\u7C7B \xD7 \u5927\u533A\u5206\u5E03",
      prompt: "\u770B\u54C1\u7C7B\u8FBE\u6210"
    },
    {
      icon: "info",
      tone: "info",
      label: "\u770B\u590D\u76D8\u4E0E\u8FBE\u6210",
      detail: "\u4E09\u4E2A\u6708\u63D0\u62A5\u504F\u5DEE\u3001\u8FBE\u6210\u7387\u4E0E\u504F\u5DEE\u8C61\u9650",
      prompt: "\u770B\u590D\u76D8\u4E0E\u8FBE\u6210"
    },
    {
      icon: "alert",
      tone: "success",
      label: "\u770B\u5206\u6790\u4E0E\u5F02\u5E38",
      detail: "\u671F\u95F4\u7814\u5224\u5EFA\u8BAE\u4E0E\u8DE8\u6A21\u5757\u5F02\u5E38\u6E05\u5355",
      prompt: "\u770B\u5206\u6790\u4E0E\u5F02\u5E38"
    }
  ],
  prompts: [
    "\u672C\u6708\u8FD8\u6709\u54EA\u4E9B\u5BA2\u6237\u672A\u63D0\u62A5\uFF1F",
    "\u54EA\u4E2A\u54C1\u7C7B\u8FBE\u6210\u6700\u4F4E\uFF1F",
    "\u54EA\u4E2A\u5BA1\u6279\u8282\u70B9\u6EDE\u7559\u6700\u591A\uFF1F",
    "\u54EA\u4E9B\u5BA2\u6237\u7684\u8FBE\u6210\u504F\u5DEE\u6700\u5927\uFF1F"
  ]
};
var categoryPlanConversation = {
  name: "\u54C1\u7C7B\u8BA1\u5212Agent",
  intro: "\u6211\u6309\u54C1\u7C7B\u8BA1\u5212\u5728\u7BA1\u7684\u6307\u6807\u7EC4\u7EC7\u4E8B\u5B9E\uFF1A\u539F\u59CB\u8BA2\u5355\u6EE1\u8DB3\u7387\u3001\u9700\u6C42\u8BA1\u5212\u51C6\u786E\u7387\u3001\u5E93\u5B58\u5468\u8F6C\u5929\u6570\u3001\u5168\u94FE\u5468\u8F6C\u4E0E\u4EA7\u54C1\u65B0\u9C9C\u5EA6\uFF0C\u5E76\u8BF4\u660E\u6BCF\u4E00\u9879\u672A\u8FBE\u6807\u7684\u9A71\u52A8\u539F\u56E0\u3002",
  boundary: "\u8D1F\u8D23\u9884\u8B66\u4E0E\u5EFA\u8BAE\uFF0C\u4EBA\u6765\u51B3\u7B56\u4E0E\u6388\u6743\u3002",
  actions: [
    {
      icon: "chart",
      tone: "brand",
      label: "\u67E5\u770B\u54C1\u7C7B\u8BA1\u5212\u5728\u7BA1\u7684\u6307\u6807",
      detail: "\u70B9\u51FB\u4EFB\u610F\u6307\u6807\u67E5\u770B\u53E3\u5F84\u4E0E\u660E\u7EC6",
      prompt: "\u67E5\u770B\u54C1\u7C7B\u8BA1\u5212\u5728\u7BA1\u54EA\u4E9B\u6307\u6807"
    },
    {
      icon: "alert",
      tone: "brand",
      label: "\u8BA2\u5355\u6EE1\u8DB3\u7387\u7684\u7F3A\u53E3\u5728\u54EA",
      detail: "\u672A\u6EE1\u8DB3\u8BA2\u5355\u7684\u6210\u56E0\u4E0E\u77ED\u7F3A\u5BA2\u6237",
      prompt: "\u8BA2\u5355\u6EE1\u8DB3\u7387\u7684\u7F3A\u53E3\u5728\u54EA\u91CC"
    },
    {
      icon: "info",
      tone: "info",
      label: "\u8BA1\u5212\u51C6\u786E\u7387\u4E3A\u4EC0\u4E48\u6CA1\u8FBE\u6807",
      detail: "\u504F\u5DEE\u6765\u6E90\u3001\u4E0A\u62A5\u8BB0\u5F55\u4E0E\u76EE\u6807\u672A\u62A5\u5907",
      prompt: "\u9700\u6C42\u8BA1\u5212\u51C6\u786E\u7387\u4E3A\u4EC0\u4E48\u6CA1\u8FBE\u6807"
    },
    {
      icon: "box",
      tone: "success",
      label: "\u5468\u8F6C\u5929\u6570\u4E0E\u65B0\u9C9C\u5EA6",
      detail: "\u5168\u94FE\u5468\u8F6C\u3001\u5DE5\u5382\u4ED3\u5468\u8F6C\u4E0E\u8D85\u671F\u6279\u6B21",
      prompt: "\u5E93\u5B58\u5468\u8F6C\u5929\u6570\u4E0E\u4EA7\u54C1\u65B0\u9C9C\u5EA6\u600E\u4E48\u6837"
    }
  ],
  prompts: [
    "\u7CBD\u5B50\u7F3A\u53E3\u5BF9\u8BA2\u5355\u6EE1\u8DB3\u7387\u5F71\u54CD\u591A\u5927\uFF1F",
    "\u5E93\u5B58\u5468\u8F6C\u5DEE 0.7 \u5929\u5361\u5728\u54EA\uFF1F",
    "\u4EA7\u54C1\u65B0\u9C9C\u5EA6\u4F4E\u4E8E\u76EE\u6807\u600E\u4E48\u529E\uFF1F",
    "\u5168\u94FE\u5468\u8F6C\u76EE\u6807\u4E3A\u4EC0\u4E48\u6CA1\u5907\u6848\uFF1F"
  ]
};
var inventoryConversation = {
  name: "\u7ECF\u9500\u5546\u8865\u8D27Agent",
  intro: "\u6211\u53EF\u4EE5\u5E2E\u4F60\u5206\u6790\u5BA2\u6237\u5E93\u5B58\uFF0C\u751F\u6210\u8865\u8D27\u5EFA\u8BAE\u5E76\u8DDF\u8FDB\u6267\u884C\u8FDB\u5EA6\u3002",
  boundary: "\u5EFA\u8BAE\u53EA\u505A\u53C2\u8003\uFF0C\u8865\u8D27\u51B3\u7B56\u4ECD\u7531\u4F60\u786E\u8BA4\u3002",
  actions: [
    {
      icon: "box",
      tone: "brand",
      label: "\u67E5\u770B\u6574\u4F53\u5E93\u5B58\u60C5\u51B5",
      detail: "\u603B\u5E93\u5B58\u3001\u5728\u9014\u4E0E\u5468\u8F6C\u6982\u89C8",
      prompt: "\u8BF7\u5206\u6790\u5F53\u524D\u6574\u4F53\u5E93\u5B58\u60C5\u51B5"
    },
    {
      icon: "chart",
      tone: "brand",
      label: "\u67E5\u770B\u54C1\u7C7B\u5E93\u5B58",
      detail: "\u5404\u54C1\u7C7B\u5E93\u5B58\u4E0E\u5E93\u9F84\u5206\u5E03",
      prompt: "\u8BF7\u67E5\u770B\u5404\u54C1\u7C7B\u5E93\u5B58\u60C5\u51B5"
    },
    {
      icon: "check",
      tone: "success",
      label: "\u751F\u6210\u8865\u8D27\u5EFA\u8BAE",
      detail: "\u6309\u5E93\u5B58\u8986\u76D6\u4E0E\u52A8\u9500\u7ED9\u51FA\u8865\u8D27\u91CF",
      prompt: "\u8BF7\u751F\u6210\u672C\u5468\u8865\u8D27\u5EFA\u8BAE"
    },
    {
      icon: "users",
      tone: "info",
      label: "\u5206\u6790\u91CD\u70B9\u5BA2\u6237",
      detail: "\u91CD\u70B9\u5BA2\u6237\u7684\u5E93\u5B58\u4E0E\u8865\u8D27\u8282\u594F",
      prompt: "\u8BF7\u5206\u6790\u9700\u8981\u91CD\u70B9\u5173\u6CE8\u7684\u5BA2\u6237"
    }
  ],
  prompts: [
    "\u54EA\u4E9B\u5BA2\u6237\u9700\u8981\u8865\u8D27\uFF1F",
    "\u91CD\u70B9\u5BA2\u6237\u7684\u5E93\u5B58\u60C5\u51B5\u5982\u4F55\uFF1F",
    "\u751F\u6210\u4E0B\u5468\u7684\u8865\u8D27\u5EFA\u8BAE",
    "\u5BFC\u51FA\u5BA2\u6237\u5E93\u5B58\u5206\u6790\u62A5\u544A"
  ]
};
var inboxConversation = {
  name: "\u4E1A\u52A1\u5F85\u529EAgent",
  intro: "\u6211\u53EF\u4EE5\u5E2E\u4F60\u770B GEA \u6D88\u606F\u5F85\u529E\uFF1A\u8FD8\u6709\u591A\u5C11\u6CA1\u5904\u7406\u3001\u54EA\u4E9B\u5361\u5728\u4F60\u8FD9\u4E00\u8282\u70B9\u3001\u4E0B\u4E00\u6B65\u8BE5\u627E\u8C01\u3002",
  boundary: "\u5F85\u529E\u72B6\u6001\u7531\u4F60\u5728\u5217\u8868\u91CC\u786E\u8BA4\uFF0C\u6211\u53EA\u505A\u68B3\u7406\u548C\u5EFA\u8BAE\u3002",
  actions: [
    {
      icon: "check",
      tone: "brand",
      label: "\u770B\u672A\u8BFB\u5F85\u529E",
      detail: "\u6309\u4E1A\u52A1\u7C7B\u578B\u4E0E\u65F6\u95F4\u6392\u5E8F\u7684\u672A\u8BFB\u6D88\u606F",
      prompt: "\u770B\u672A\u8BFB\u5F85\u529E"
    },
    {
      icon: "alert",
      tone: "brand",
      label: "\u770B\u5361\u5728\u6211\u8FD9\u7684\u5BA1\u6279",
      detail: "\u5F53\u524D\u8282\u70B9\u7B49\u5904\u7406\u7684\u8BA1\u5212",
      prompt: "\u770B\u5361\u5728\u6211\u8FD9\u7684\u5BA1\u6279"
    },
    {
      icon: "chart",
      tone: "info",
      label: "\u770B\u5F85\u529E\u5206\u5E03",
      detail: "\u6309\u4E1A\u52A1\u7C7B\u578B\u3001\u72B6\u6001\u3001\u6765\u6E90\u6C47\u603B",
      prompt: "\u770B\u5F85\u529E\u5206\u5E03"
    },
    {
      icon: "info",
      tone: "success",
      label: "\u770B\u5904\u7406\u4F18\u5148\u7EA7",
      detail: "\u6309\u901A\u77E5\u65F6\u95F4\u7ED9\u51FA\u5148\u5904\u7406\u8C01",
      prompt: "\u770B\u5904\u7406\u4F18\u5148\u7EA7"
    }
  ],
  prompts: [
    "\u6709\u591A\u5C11\u5F85\u529E\u8FD8\u6CA1\u5904\u7406\uFF1F",
    "\u54EA\u4E9B\u5BA1\u6279\u5361\u5728\u6211\u8FD9\u4E00\u8282\u70B9\uFF1F",
    "\u4ECA\u5929\u6211\u5E94\u8BE5\u5148\u5904\u7406\u54EA\u4E9B\uFF1F",
    "\u8FD9\u4E9B\u5F85\u529E\u5206\u522B\u662F\u54EA\u4E2A\u5BA2\u6237\u7684\uFF1F"
  ]
};
var demandOpsConversation = {
  name: "\u9700\u6C42\u8FD0\u8425Agent",
  intro: "\u6211\u53EF\u4EE5\u5E2E\u4F60\u770B\u9700\u6C42\u6CE2\u52A8\u3001\u9884\u6D4B\u504F\u5DEE\u548C\u9700\u6C42\u5171\u8BC6\u5F85\u529E\uFF0C\u7ED9\u51FA\u4E0B\u671F\u9700\u6C42\u8BA1\u5212\u7684\u8C03\u6574\u53C2\u8003\u3002",
  boundary: "\u6211\u53EA\u505A\u7814\u5224\u4E0E\u5EFA\u8BAE\uFF0C\u4E0D\u76F4\u63A5\u6539\u9884\u6D4B\u6570\u5B57\u3002",
  actions: [
    {
      icon: "chart",
      tone: "brand",
      label: "\u770B\u9700\u6C42\u6CE2\u52A8\u6982\u89C8",
      detail: "\u9884\u6D4B\u51C6\u786E\u7387\u3001\u504F\u5DEE\u7387\u3001\u9700\u6C42\u53D8\u66F4\u7387",
      prompt: "\u770B\u9700\u6C42\u6CE2\u52A8\u6982\u89C8"
    },
    {
      icon: "alert",
      tone: "brand",
      label: "\u770B\u54C1\u7C7B\u504F\u5DEE\u660E\u7EC6",
      detail: "\u6309\u7EDD\u5BF9\u504F\u5DEE\u6392\u5E8F\u7684\u54C1\u7C7B\u9884\u6D4B\u4E0E\u5B9E\u9645",
      prompt: "\u770B\u54C1\u7C7B\u504F\u5DEE\u660E\u7EC6"
    },
    {
      icon: "check",
      tone: "success",
      label: "\u770B\u9700\u6C42\u5171\u8BC6\u5F85\u529E",
      detail: "\u9500\u552E\u3001\u5E02\u573A\u4E0E\u8BA1\u5212\u5F85\u786E\u8BA4\u7684\u534F\u540C\u52A8\u4F5C",
      prompt: "\u770B\u9700\u6C42\u5171\u8BC6\u5F85\u529E"
    },
    {
      icon: "info",
      tone: "info",
      label: "\u770B\u6D3B\u52A8\u7EB3\u5165\u7387",
      detail: "\u4FC3\u9500\u6D3B\u52A8\u662F\u5426\u5DF2\u7ECF\u8FDB\u5165\u9700\u6C42\u8BA1\u5212",
      prompt: "\u770B\u6D3B\u52A8\u7EB3\u5165\u7387"
    }
  ],
  prompts: [
    "\u672C\u5468\u9700\u6C42\u6CE2\u52A8\u600E\u4E48\u6837\uFF1F",
    "\u54EA\u4E9B\u54C1\u7C7B\u504F\u5DEE\u6700\u5927\uFF1F",
    "\u706B\u9505\u6599\u4E3A\u4EC0\u4E48\u4F4E\u4E8E\u9884\u6D4B\uFF1F",
    "\u9700\u6C42\u5171\u8BC6\u5F85\u529E\u8981\u8C01\u786E\u8BA4\uFF1F"
  ]
};
var deliveryOpsConversation = {
  name: "\u4EA4\u4ED8\u8FD0\u8425Agent",
  intro: "\u6211\u53EF\u4EE5\u5E2E\u4F60\u770B\u8BA2\u5355\u5C65\u7EA6\uFF1A\u51C6\u4EA4\u7387\u3001\u5728\u9014\u8BA2\u5355\u548C\u91CD\u70B9\u5BA2\u6237\u5EF6\u671F\uFF0C\u7ED9\u51FA\u4F18\u5148\u5904\u7406\u987A\u5E8F\u3002",
  boundary: "\u6211\u53EA\u505A\u98CE\u9669\u7814\u5224\u4E0E\u5EFA\u8BAE\uFF0C\u4E0D\u4E0B\u53D1\u6D3E\u8F66\u3001\u4E0D\u6539\u8BA2\u5355\u3002",
  actions: [
    {
      icon: "alert",
      tone: "brand",
      label: "\u770B\u4EA4\u4ED8\u98CE\u9669\u6982\u89C8",
      detail: "\u98CE\u9669\u8BA2\u5355\u3001\u91CD\u70B9\u5BA2\u6237\u3001\u51C6\u4EA4\u7387\u7F3A\u53E3",
      prompt: "\u770B\u4EA4\u4ED8\u98CE\u9669\u6982\u89C8"
    },
    {
      icon: "box",
      tone: "brand",
      label: "\u770B\u91CD\u70B9\u4EA4\u4ED8\u8BA2\u5355",
      detail: "\u6309\u627F\u8BFA\u65F6\u95F4\u4E0E\u5BA2\u6237\u7B49\u7EA7\u6392\u5E8F",
      prompt: "\u770B\u91CD\u70B9\u4EA4\u4ED8\u8BA2\u5355"
    },
    {
      icon: "chart",
      tone: "info",
      label: "\u770B\u5C65\u7EA6\u94FE\u8DEF\u5206\u5E03",
      detail: "\u5F85\u5206\u914D\u2192\u5F85\u5907\u8D27\u2192\u5F85\u88C5\u8F66\u2192\u8FD0\u8F93\u4E2D\u2192\u5DF2\u7B7E\u6536",
      prompt: "\u770B\u5C65\u7EA6\u94FE\u8DEF\u5206\u5E03"
    },
    {
      icon: "check",
      tone: "success",
      label: "\u770B\u8BA2\u5355\u6EE1\u8DB3\u7387",
      detail: "\u8BA2\u5355\u6EE1\u8DB3\u7387\u4E0E\u76EE\u6807\u7684\u5DEE\u8DDD",
      prompt: "\u770B\u8BA2\u5355\u6EE1\u8DB3\u7387"
    }
  ],
  prompts: [
    "\u4ECA\u5929\u54EA\u4E9B\u8BA2\u5355\u6709\u5EF6\u671F\u98CE\u9669\uFF1F",
    "\u51C6\u4EA4\u7387\u4E3A\u4EC0\u4E48\u6CA1\u8FBE\u6807\uFF1F",
    "\u90D1\u5DDE\u88C5\u8F66\u5EF6\u8FDF\u5F71\u54CD\u54EA\u4E9B\u5BA2\u6237\uFF1F",
    "\u91CD\u70B9\u5BA2\u6237\u7684\u8BA2\u5355\u4EC0\u4E48\u65F6\u5019\u80FD\u5230\uFF1F"
  ]
};
var safetyStockConversation = {
  name: "\u57FA\u5730\u5E93\u5B58Agent",
  intro: "\u6211\u53EF\u4EE5\u6309\u57FA\u5730\u53E3\u5F84\u6838\u5BF9\u5E93\u5B58\u6C34\u4F4D\u3001\u5468\u8F6C\u5929\u6570\u3001\u8D27\u9F84\u548C\u8BA2\u5355\u6EE1\u8DB3\u7387\uFF0C\u6307\u51FA\u4F4E\u4E8E\u76EE\u6807\u7684\u90E8\u5206\u3002",
  boundary: "\u6211\u53EA\u505A\u6838\u5BF9\u4E0E\u5EFA\u8BAE\uFF0C\u4E0D\u8C03\u6574\u5E93\u5B58\u76EE\u6807\u3002",
  actions: [
    {
      icon: "box",
      tone: "brand",
      label: "\u770B\u5E93\u5B58\u6C34\u4F4D\u5DEE\u989D",
      detail: "\u5F53\u524D\u5E93\u5B58\u3001\u76EE\u6807\u5E93\u5B58\u4E0E\u5468\u8F6C\u5929\u6570",
      prompt: "\u770B\u5E93\u5B58\u6C34\u4F4D\u5DEE\u989D"
    },
    {
      icon: "alert",
      tone: "brand",
      label: "\u770B\u8D85\u9F84\u4E0E\u8D27\u9F84",
      detail: "\u8D85\u9F84 SKU \u6570\u3001\u8D85\u9F84\u5E93\u5B58\u4E0E\u5E73\u5747\u8D27\u9F84",
      prompt: "\u770B\u8D85\u9F84\u4E0E\u8D27\u9F84"
    },
    {
      icon: "chart",
      tone: "info",
      label: "\u770B\u57FA\u5730\u4E0E\u54C1\u7C7B\u7ED3\u6784",
      detail: "\u57FA\u5730\u3001\u54C1\u7C7B\u3001\u8D27\u9F84\u4E09\u4E2A\u7ED3\u6784",
      prompt: "\u770B\u57FA\u5730\u4E0E\u54C1\u7C7B\u7ED3\u6784"
    },
    {
      icon: "check",
      tone: "success",
      label: "\u770B\u8BA2\u5355\u6EE1\u8DB3\u7387",
      detail: "\u5F53\u6708\u8BA2\u5355\u6EE1\u8DB3\u7387\u6700\u4F4E\u7684\u57FA\u5730",
      prompt: "\u770B\u8BA2\u5355\u6EE1\u8DB3\u7387"
    }
  ],
  prompts: [
    "\u54EA\u4E9B\u57FA\u5730\u5E93\u5B58\u4F4E\u4E8E\u76EE\u6807\uFF1F",
    "\u54EA\u4E2A\u57FA\u5730\u8D27\u9F84\u6700\u9AD8\uFF1F",
    "\u8D85\u9F84 SKU \u6709\u591A\u5C11\uFF1F",
    "\u8BA2\u5355\u6EE1\u8DB3\u7387\u6700\u4F4E\u7684\u662F\u8C01\uFF1F"
  ]
};
var branchStockConversation = {
  name: "\u5206\u4ED3\u5E93\u5B58Agent",
  intro: "\u6211\u53EF\u4EE5\u6309\u5206\u4ED3\u770B\u7F3A\u8D27\u8BA2\u5355\u3001\u8865\u8D27\u786E\u8BA4\u3001\u5927\u65E5\u671F\u548C\u6EDE\u5E93\u98CE\u9669\uFF0C\u7ED9\u51FA\u5148\u5904\u7406\u8C01\u7684\u5EFA\u8BAE\u3002",
  boundary: "\u8865\u8D27\u53EA\u7ED9\u5EFA\u8BAE\uFF0C\u662F\u5426\u4E0B\u5355\u7531\u4F60\u786E\u8BA4\u3002",
  actions: [
    {
      icon: "alert",
      tone: "brand",
      label: "\u770B\u7F3A\u8D27\u8BA2\u5355",
      detail: "\u7F3A\u8D27\u91CF\u3001\u8BA2\u5355\u6570\u4E0E\u5F71\u54CD\u5206\u4ED3",
      prompt: "\u770B\u7F3A\u8D27\u8BA2\u5355"
    },
    {
      icon: "box",
      tone: "brand",
      label: "\u770B\u8865\u8D27\u786E\u8BA4\u660E\u7EC6",
      detail: "\u5DF2\u6838\u5B9E\u5EFA\u8BAE\u8865\u8D27\u91CF\u4E0E\u7D27\u6025\u8865\u8D27",
      prompt: "\u770B\u8865\u8D27\u786E\u8BA4\u660E\u7EC6"
    },
    {
      icon: "chart",
      tone: "info",
      label: "\u770B\u5927\u65E5\u671F\u4E0E\u6EDE\u5E93",
      detail: "\u5927\u65E5\u671F\u5E93\u5B58\u4E0E\u6EDE\u5E93\u98CE\u9669\u6E05\u5355",
      prompt: "\u770B\u5927\u65E5\u671F\u4E0E\u6EDE\u5E93"
    },
    {
      icon: "check",
      tone: "success",
      label: "\u770B\u5206\u4ED3\u6EE1\u8DB3\u7387",
      detail: "\u5F53\u6708\u8BA2\u5355\u6EE1\u8DB3\u7387\u4E0E\u53D1\u8D27\u7F3A\u53E3",
      prompt: "\u770B\u5206\u4ED3\u6EE1\u8DB3\u7387"
    }
  ],
  prompts: [
    "\u54EA\u4E9B\u5206\u4ED3\u7F3A\u8D27\u6700\u4E25\u91CD\uFF1F",
    "\u957F\u6C99\u5206\u4ED3\u5468\u8F6C\u4E3A\u4EC0\u4E48\u9AD8\uFF1F",
    "\u5927\u65E5\u671F\u5E93\u5B58\u600E\u4E48\u6D88\u5316\uFF1F",
    "\u8FD9\u5468\u5206\u4ED3\u7ED9\u591A\u5C11\u8865\u8D27\uFF1F"
  ]
};
var inventoryWorkbenchConversation = {
  name: "\u5E93\u5B58\u7BA1\u7406Agent",
  intro: "\u6211\u53EF\u4EE5\u628A\u57FA\u5730\u548C\u5206\u4ED3\u7684\u4ECA\u65E5\u8FD0\u8425\u60C5\u51B5\u6C47\u603B\u8D77\u6765\uFF0C\u6309\u4F18\u5148\u7EA7\u8BF4\u6E05\u4ECA\u5929\u5148\u5904\u7406\u4EC0\u4E48\u3002",
  boundary: "\u6211\u53EA\u505A\u6C47\u603B\u548C\u5EFA\u8BAE\uFF0C\u5904\u7406\u52A8\u4F5C\u4ECD\u7531\u4F60\u548C\u8D23\u4EFB\u89D2\u8272\u786E\u8BA4\u3002",
  actions: [
    {
      icon: "chart",
      tone: "brand",
      label: "\u770B\u4ECA\u65E5\u8FD0\u8425\u6982\u51B5",
      detail: "\u5E93\u5B58\u3001\u7F3A\u8D27\u3001\u8D27\u9F84\u7684\u5F53\u65E5\u5FEB\u7167",
      prompt: "\u770B\u4ECA\u65E5\u8FD0\u8425\u6982\u51B5"
    },
    {
      icon: "alert",
      tone: "brand",
      label: "\u770B\u4ECA\u65E5\u4F18\u5148\u5904\u7406\u4E8B\u9879",
      detail: "\u7F3A\u8D27\u3001\u4F4E\u5E93\u5B58\u3001\u8D27\u9F84\u3001\u5927\u65E5\u671F\u3001\u6EDE\u5E93",
      prompt: "\u770B\u4ECA\u65E5\u4F18\u5148\u5904\u7406\u4E8B\u9879"
    },
    {
      icon: "box",
      tone: "info",
      label: "\u770B\u7F3A\u8D27\u4E0E\u4F4E\u5E93\u5B58",
      detail: "\u6309\u5BF9\u8C61\u5217\u51FA\u7F3A\u53E3\u4E0E\u5EFA\u8BAE\u52A8\u4F5C",
      prompt: "\u770B\u7F3A\u8D27\u4E0E\u4F4E\u5E93\u5B58"
    },
    {
      icon: "users",
      tone: "success",
      label: "\u770B\u8D23\u4EFB\u89D2\u8272\u4E0E\u53CD\u9988",
      detail: "\u8C01\u5728\u8DDF\u3001\u53CD\u9988\u5230\u54EA\u4E00\u6B65",
      prompt: "\u770B\u8D23\u4EFB\u89D2\u8272\u4E0E\u53CD\u9988"
    }
  ],
  prompts: [
    "\u4ECA\u5929\u6211\u6700\u8BE5\u5148\u5904\u7406\u4EC0\u4E48\uFF1F",
    "\u54EA\u4E9B\u57FA\u5730\u7F3A\u8D27\uFF1F",
    "\u5927\u65E5\u671F\u5E93\u5B58\u6709\u591A\u5C11\uFF1F",
    "\u7ED9\u6211\u4E00\u4EFD\u4ECA\u65E5\u8DDF\u8FDB\u6E05\u5355"
  ]
};
var fullChainStockConversation = {
  name: "\u5168\u94FE\u5E93\u5B58\u7BA1\u7406Agent",
  intro: "\u6211\u53EF\u4EE5\u6CBF\u57FA\u5730\u5230\u5206\u4ED3\u7684\u94FE\u8DEF\u770B\u5E93\u5B58\u5206\u5E03\u3001\u7F3A\u8D27\u548C\u5927\u65E5\u671F\u98CE\u9669\uFF0C\u4EE5\u53CA\u53EF\u8C03\u62E8\u7684\u673A\u4F1A\u3002",
  boundary: "\u8C03\u62E8\u53EA\u7ED9\u65B9\u6848\u5EFA\u8BAE\uFF0C\u6267\u884C\u7531\u4E1A\u52A1\u786E\u8BA4\u3002",
  actions: [
    {
      icon: "box",
      tone: "brand",
      label: "\u770B\u5168\u94FE\u5E93\u5B58\u6982\u89C8",
      detail: "\u57FA\u5730\u4E0E\u5206\u4ED3\u7684\u5E93\u5B58\u5206\u5E03",
      prompt: "\u770B\u5168\u94FE\u5E93\u5B58\u6982\u89C8"
    },
    {
      icon: "chart",
      tone: "brand",
      label: "\u770B\u5404\u8282\u70B9\u5E93\u5B58",
      detail: "\u6309\u57FA\u5730\u3001\u5206\u4ED3\u770B\u5E93\u5B58\u4E0E\u5468\u8F6C",
      prompt: "\u770B\u5404\u8282\u70B9\u5E93\u5B58"
    },
    {
      icon: "alert",
      tone: "info",
      label: "\u770B\u7F3A\u8D27\u4E0E\u5927\u65E5\u671F\u98CE\u9669",
      detail: "\u5168\u94FE\u8DEF\u7F3A\u8D27\u4E0E\u4E34\u671F\u98CE\u9669\u6E05\u5355",
      prompt: "\u770B\u7F3A\u8D27\u4E0E\u5927\u65E5\u671F\u98CE\u9669"
    },
    {
      icon: "check",
      tone: "success",
      label: "\u770B\u8DE8\u4ED3\u8C03\u62E8\u673A\u4F1A",
      detail: "\u5BCC\u4F59\u4E0E\u77ED\u7F3A\u8282\u70B9\u7684\u5339\u914D\u5EFA\u8BAE",
      prompt: "\u770B\u8DE8\u4ED3\u8C03\u62E8\u673A\u4F1A"
    }
  ],
  prompts: [
    "\u5168\u94FE\u8DEF\u5E93\u5B58\u5206\u5E03\u600E\u4E48\u6837\uFF1F",
    "\u54EA\u4E9B SKU \u6709\u7F3A\u8D27\u98CE\u9669\uFF1F",
    "\u57FA\u5730\u5230\u5206\u4ED3\u7684\u5E93\u5B58\u600E\u4E48\u8D70\uFF1F",
    "\u9700\u8981\u8DE8\u4ED3\u8C03\u62E8\u54EA\u4E9B\u8D27\uFF1F"
  ]
};
var supplyCoordinationConversation = {
  name: "\u4EA7\u9500\u534F\u540CAgent",
  intro: "\u6211\u53EF\u4EE5\u7ED3\u5408\u8BA1\u5212\u3001\u5E93\u5B58\u4E0E\u8BA2\u5355\u5C65\u7EA6\uFF0C\u5B9A\u4F4D\u5F53\u524D\u4EA7\u9500\u534F\u540C\u4E2D\u7684\u504F\u5DEE\u548C\u98CE\u9669\u3002",
  boundary: "\u6211\u53EA\u505A\u5206\u6790\u4E0E\u884C\u52A8\u5EFA\u8BAE\uFF0C\u4E0D\u76F4\u63A5\u4FEE\u6539\u4E1A\u52A1\u6570\u636E\u3002",
  actions: [
    { icon: "chart", tone: "brand", label: "\u770B\u7ECF\u8425\u6982\u89C8", detail: "\u8BA1\u5212\u3001\u5E93\u5B58\u4E0E\u5C65\u7EA6\u5173\u952E\u6307\u6807", prompt: "\u8BF7\u5206\u6790\u5F53\u524D\u4EA7\u9500\u7ECF\u8425\u6982\u89C8" },
    { icon: "alert", tone: "brand", label: "\u770B\u534F\u540C\u98CE\u9669", detail: "\u504F\u79BB\u76EE\u6807\u548C\u9700\u8981\u534F\u8C03\u7684\u4E8B\u9879", prompt: "\u8BF7\u67E5\u770B\u5F53\u524D\u4EA7\u9500\u534F\u540C\u98CE\u9669" },
    { icon: "box", tone: "info", label: "\u770B\u5E93\u5B58\u4E0E\u8BA2\u5355", detail: "\u5E93\u5B58\u6C34\u4F4D\u548C\u8BA2\u5355\u5C65\u7EA6\u5F02\u5E38", prompt: "\u8BF7\u5206\u6790\u5E93\u5B58\u4E0E\u8BA2\u5355\u98CE\u9669" },
    { icon: "check", tone: "success", label: "\u751F\u6210\u884C\u52A8\u5EFA\u8BAE", detail: "\u6309\u4F18\u5148\u7EA7\u6574\u7406\u534F\u540C\u52A8\u4F5C", prompt: "\u8BF7\u751F\u6210\u4EA7\u9500\u534F\u540C\u884C\u52A8\u5EFA\u8BAE" }
  ],
  prompts: ["\u54EA\u4E9B\u6307\u6807\u504F\u79BB\u76EE\u6807\uFF1F", "\u8BA2\u5355\u6EE1\u8DB3\u7387\u8FD13\u4E2A\u6708\u7684\u6307\u6807\u60C5\u51B5\u5982\u4F55\uFF1F", "\u53EF\u53D1\u8D27\u5929\u6570\u5F02\u5E38\u7684\u4EA7\u54C1\u6709\u54EA\u4E9B\uFF1F", "\u76EE\u524D\u54EA\u4E00\u4E2A\u4EA7\u54C1\u7F3A\u8D27\u8F83\u4E3A\u4E25\u91CD"]
};
var customerStockConversation = {
  name: "\u5BA2\u6237\u5E93\u5B58Agent",
  intro: "\u6211\u53EF\u4EE5\u5E2E\u4F60\u5206\u6790\u5BA2\u6237\u5E93\u5B58\u5065\u5EB7\u5EA6\u3001\u5468\u8F6C\u548C\u5927\u65E5\u671F\u98CE\u9669\uFF0C\u5E76\u7ED9\u51FA\u6539\u5584\u5EFA\u8BAE\u3002",
  boundary: "\u5EFA\u8BAE\u53EA\u505A\u53C2\u8003\uFF0C\u5E93\u5B58\u5904\u7F6E\u4ECD\u7531\u4E1A\u52A1\u786E\u8BA4\u3002",
  actions: [
    { icon: "box", tone: "brand", label: "\u770B\u5BA2\u6237\u5E93\u5B58", detail: "\u5E93\u5B58\u89C4\u6A21\u3001\u7ED3\u6784\u4E0E\u5468\u8F6C\u6982\u89C8", prompt: "\u8BF7\u5206\u6790\u5F53\u524D\u5BA2\u6237\u5E93\u5B58\u60C5\u51B5" },
    { icon: "alert", tone: "brand", label: "\u770B\u98CE\u9669\u5BA2\u6237", detail: "\u9AD8\u5E93\u5B58\u3001\u4F4E\u5468\u8F6C\u4E0E\u5F02\u5E38\u5BA2\u6237", prompt: "\u8BF7\u67E5\u770B\u9AD8\u98CE\u9669\u5BA2\u6237" },
    { icon: "chart", tone: "info", label: "\u770B\u5927\u65E5\u671F\u5E93\u5B58", detail: "\u4E34\u671F\u4E0E\u5927\u65E5\u671F\u5E93\u5B58\u5206\u5E03", prompt: "\u8BF7\u67E5\u770B\u5BA2\u6237\u5927\u65E5\u671F\u5E93\u5B58" },
    { icon: "check", tone: "success", label: "\u751F\u6210\u6539\u5584\u5EFA\u8BAE", detail: "\u6309\u5BA2\u6237\u6574\u7406\u4F18\u5148\u52A8\u4F5C", prompt: "\u8BF7\u751F\u6210\u5BA2\u6237\u5E93\u5B58\u6539\u5584\u5EFA\u8BAE" }
  ],
  prompts: ["\u54EA\u4E9B\u5BA2\u6237\u5E93\u5B58\u98CE\u9669\u6700\u9AD8\uFF1F", "\u91CD\u70B9\u5BA2\u6237\u7684\u5E93\u5B58\u60C5\u51B5\u5982\u4F55\uFF1F", "\u5927\u65E5\u671F\u5E93\u5B58\u5982\u4F55\u5904\u7406\uFF1F", "\u5BA2\u6237\u5E93\u5B58\u7ED3\u6784\u600E\u4E48\u6539\u5584\uFF1F"]
};
var orderManagementConversation = {
  name: "\u8BA2\u5355\u7BA1\u7406Agent",
  intro: "\u6211\u53EF\u4EE5\u5E2E\u4F60\u5206\u6790\u8BA2\u5355\u72B6\u6001\u3001\u5E93\u5B58\u4E0E\u4F9B\u5E94\u98CE\u9669\uFF0C\u5E76\u8DDF\u8FDB\u5BA2\u6237\u63D0\u62A5\u548C\u5BA1\u6279\u8FDB\u5EA6\u3002",
  boundary: "\u6211\u53EA\u505A\u5206\u6790\u548C\u5EFA\u8BAE\uFF0C\u4E0D\u76F4\u63A5\u4FEE\u6539\u8BA2\u5355\u3002",
  actions: [
    { icon: "chart", tone: "brand", label: "\u770B\u8BA2\u5355\u6982\u89C8", detail: "\u8BA2\u5355\u89C4\u6A21\u3001\u72B6\u6001\u4E0E\u5173\u952E\u53D8\u5316", prompt: "\u8BF7\u5206\u6790\u5F53\u524D\u8BA2\u5355\u6982\u89C8" },
    { icon: "alert", tone: "brand", label: "\u770B\u91CD\u70B9\u5546\u54C1", detail: "\u9700\u8981\u4F18\u5148\u5173\u6CE8\u7684\u5546\u54C1\u548C\u539F\u56E0", prompt: "\u8BF7\u67E5\u770B\u9700\u8981\u91CD\u70B9\u5173\u6CE8\u7684\u5546\u54C1" },
    { icon: "box", tone: "info", label: "\u770B\u5E93\u5B58\u4E0E\u4F9B\u5E94\u98CE\u9669", detail: "\u8BA2\u5355\u5173\u8054\u7684\u7F3A\u8D27\u4E0E\u4F9B\u5E94\u5F02\u5E38", prompt: "\u8BF7\u5206\u6790\u8BA2\u5355\u76F8\u5173\u7684\u5E93\u5B58\u4E0E\u4F9B\u5E94\u98CE\u9669" },
    { icon: "check", tone: "success", label: "\u8DDF\u8FDB\u63D0\u62A5\u5BA1\u6279", detail: "\u5BA2\u6237\u63D0\u62A5\u4E0E\u5BA1\u6279\u8FDB\u5EA6", prompt: "\u8BF7\u67E5\u770B\u5BA2\u6237\u63D0\u62A5\u4E0E\u5BA1\u6279\u8FDB\u5EA6" }
  ],
  prompts: ["\u672C\u6708\u8BA2\u5355\u60C5\u51B5\u5982\u4F55\uFF1F", "\u54EA\u4E9B\u5546\u54C1\u9700\u8981\u91CD\u70B9\u5173\u6CE8\uFF1F", "\u5F53\u524D\u6700\u9700\u8981\u5173\u6CE8\u7684\u98CE\u9669\u662F\u4EC0\u4E48\uFF1F", "\u5BA2\u6237\u63D0\u62A5\u548C\u5BA1\u6279\u8FDB\u5EA6\u5982\u4F55\uFF1F"]
};
var orderFulfillmentConversation = {
  name: "\u8BA2\u5355\u5C65\u7EA6Agent",
  intro: "\u6211\u53EF\u4EE5\u5E2E\u4F60\u8DDF\u8FDB\u8BA2\u5355\u63A5\u6536\u3001\u6821\u9A8C\u4E0E OMS \u63A8\u9001\u8FDB\u5EA6\uFF0C\u5B9A\u4F4D\u5C65\u7EA6\u5F02\u5E38\u3002",
  boundary: "\u6211\u53EA\u505A\u98CE\u9669\u5206\u6790\u548C\u5904\u7406\u5EFA\u8BAE\uFF0C\u4E0D\u76F4\u63A5\u63A8\u9001\u8BA2\u5355\u3002",
  actions: [
    { icon: "chart", tone: "brand", label: "\u770B\u5C65\u7EA6\u8FDB\u5EA6", detail: "\u8BA2\u5355\u63A5\u6536\u3001\u6821\u9A8C\u4E0E\u63A8\u9001\u72B6\u6001", prompt: "\u8BF7\u5206\u6790\u5F53\u524D\u8BA2\u5355\u5C65\u7EA6\u8FDB\u5EA6" },
    { icon: "alert", tone: "brand", label: "\u770B\u6821\u9A8C\u5F02\u5E38", detail: "\u89C4\u5219\u3001\u5546\u54C1\u4E0E\u5BA2\u6237\u4FE1\u606F\u5F02\u5E38", prompt: "\u8BF7\u67E5\u770B\u8BA2\u5355\u6821\u9A8C\u5F02\u5E38" },
    { icon: "box", tone: "info", label: "\u770B\u5F85\u63A8\u9001\u8BA2\u5355", detail: "\u7B49\u5F85\u751F\u6210\u6216\u63A8\u9001 OMS \u7684\u8BA2\u5355", prompt: "\u8BF7\u67E5\u770B\u5F85\u63A8\u9001 OMS \u7684\u8BA2\u5355" },
    { icon: "check", tone: "success", label: "\u751F\u6210\u5904\u7406\u5EFA\u8BAE", detail: "\u6309\u5F71\u54CD\u8303\u56F4\u6574\u7406\u5904\u7406\u987A\u5E8F", prompt: "\u8BF7\u751F\u6210\u8BA2\u5355\u5C65\u7EA6\u5904\u7406\u5EFA\u8BAE" }
  ],
  prompts: ["\u5F53\u524D\u8BA2\u5355\u5C65\u7EA6\u8FDB\u5EA6\u5982\u4F55\uFF1F", "\u54EA\u4E9B\u8BA2\u5355\u6821\u9A8C\u5F02\u5E38\uFF1F", "\u6709\u54EA\u4E9B\u8BA2\u5355\u7B49\u5F85\u63A8\u9001\uFF1F", "\u4E0B\u4E00\u6B65\u5E94\u4F18\u5148\u5904\u7406\u4EC0\u4E48\uFF1F"]
};

// src/company/ui.tsx
var import_jsx_runtime = require("react/jsx-runtime");
var groups = [
  { title: "\u4EA7\u9500\u534F\u540C", items: [["inventory-apsplan", "\u4EA7\u9500\u534F\u540C\u5DE5\u4F5C\u53F0"]] },
  { title: "\u8BA1\u5212\u7BA1\u7406", items: [["plan-region-category", "\u54C1\u7C7B\u8BA1\u5212\u5DE5\u4F5C\u53F0(\u5F00\u53D1\u4E2D)"], ["gea-proof", "\u9500\u552E\u8BA1\u5212"], ["gea-regional-plan", "\u533A\u57DF\u8BA1\u5212(\u5F00\u53D1\u4E2D)"], ["plan-category-production", "\u4E3B\u751F\u4EA7\u8BA1\u5212(MPS)(\u5F00\u53D1\u4E2D)"], ["plan-capacity-assessment", "\u4EA7\u80FD\u8BC4\u4F30(\u5F85\u8BBE\u8BA1)"]] },
  { title: "\u5E93\u5B58\u7BA1\u7406", items: [["inventory-qll", "\u5168\u94FE\u5E93\u5B58\u5DE5\u4F5C\u53F0"], ["inventory-aqkc", "\u57FA\u5730\u5E93\u5B58"], ["inventory-fc", "\u5206\u4ED3\u5E93\u5B58"], ["inventory-customer", "\u5BA2\u6237\u5E93\u5B58(\u5F00\u53D1\u4E2D)"]] },
  { title: "\u8BA2\u5355\u7BA1\u7406", items: [["inventory-orderworkbench", "\u8BA2\u5355\u7BA1\u7406\u5DE5\u4F5C\u53F0(\u5F00\u53D1\u4E2D)"], ["inventory-orderfulfillment", "\u8BA2\u5355\u5C65\u7EA6(\u5F00\u53D1\u4E2D)"]] }
];
var agents = {
  "gea-proof": approvalConversation,
  "gea-regional-plan": regionalPlanConversation,
  "plan-region-category": categoryPlanConversation,
  "plan-category-production": mpsPlanConversation,
  "gea-inbox": inboxConversation,
  "inventory-dealer": inventoryConversation,
  "inventory-apsdemand": demandOpsConversation,
  "inventory-apsdelivery": deliveryOpsConversation,
  "inventory-aqkc": safetyStockConversation,
  "inventory-fc": branchStockConversation,
  "inventory-personal": inventoryWorkbenchConversation,
  "inventory-qll": fullChainStockConversation,
  "inventory-apsplan": supplyCoordinationConversation,
  "inventory-customer": customerStockConversation,
  "inventory-orderworkbench": orderManagementConversation,
  "inventory-orderfulfillment": orderFulfillmentConversation
};
var unavailableAccount = { state: "unknown", status: null };
var noSubscribe = () => () => {
};
function CompanyWelcome({ page, onFill }) {
  const agent = page ? agents[page] : void 0;
  return agent ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { className: "workbench-agent-welcome", "aria-label": agent.name, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", { src: brand_logo_default, alt: "", width: 44, height: 44 }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", { children: agent.name }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { children: [
      agent.intro,
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { children: agent.boundary })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { children: "\u4F60\u53EF\u4EE5\u8FD9\u6837\u95EE" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "workbench-suggestions", children: agent.prompts.map((prompt) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", disabled: !onFill, onClick: () => onFill?.(prompt), children: prompt }, prompt)) })
  ] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { className: "workbench-home-hero", "aria-label": "Synear GEA", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", { src: brand_logo_default, alt: "", width: 81, height: 81 }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "\u601D\u5FF5\u4F01\u4E1A AI \u534F\u4F5C\u4F19\u4F34" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", { children: "\u8BA9 AI \u8FDB\u5165\u5DE5\u4F5C\u6D41\u7A0B\uFF0C\u8BA9\u667A\u80FD\u6210\u4E3A\u7EC4\u7EC7\u751F\u4EA7\u529B\u3002" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "\u4ECE\u4F60\u6B63\u5728\u89E3\u51B3\u7684\u4E1A\u52A1\u95EE\u9898\u51FA\u53D1\uFF0C\u5206\u6790\u6570\u636E\u3001\u534F\u540C\u8BA1\u5212\u3001\u63A8\u52A8\u4EFB\u52A1\u95ED\u73AF\u3002\u9009\u62E9\u4E00\u4E2A\u573A\u666F\u5F00\u59CB\uFF0C\u4E5F\u53EF\u4EE5\u76F4\u63A5\u63D0\u51FA\u4F60\u7684\u95EE\u9898\u3002" })
  ] });
}
function mountCompanyUI(ctx, workbench, Resources, restorePageSession = async () => {
}) {
  let account;
  const accountListeners = /* @__PURE__ */ new Set();
  ctx.inject(["businessAccount"], (scope) => {
    account = scope.businessAccount;
    for (const listener of accountListeners) listener();
    scope.effect(() => () => {
      if (account === scope.businessAccount) {
        account = void 0;
        for (const listener of accountListeners) listener();
      }
    });
  });
  const subscribeAccount = (listener) => {
    accountListeners.add(listener);
    return () => {
      accountListeners.delete(listener);
    };
  };
  function Account({ wide, openSettings, settingsOpen }) {
    const authority = (0, import_react.useSyncExternalStore)(subscribeAccount, () => account, () => account);
    const identity = (0, import_react.useSyncExternalStore)(authority?.subscribe ?? noSubscribe, authority?.getSnapshot ?? (() => unavailableAccount), authority?.getSnapshot ?? (() => unavailableAccount));
    const [open, setOpen] = (0, import_react.useState)(false), [busy, setBusy] = (0, import_react.useState)(false), [error, setError] = (0, import_react.useState)("");
    const [qr, setQr] = (0, import_react.useState)();
    const pending = (0, import_react.useRef)();
    const root = (0, import_react.useRef)(null);
    const trigger = (0, import_react.useRef)(null);
    const menu = (0, import_react.useRef)(null);
    const [avatarFailed, setAvatarFailed] = (0, import_react.useState)("");
    const user = identity.status?.authenticated ? identity.status.user : null;
    const closeAccount = () => {
      pending.current?.abort();
      setBusy(false);
      setOpen(false);
      setQr(void 0);
    };
    (0, import_react.useEffect)(() => {
      if (settingsOpen) closeAccount();
    }, [settingsOpen]);
    (0, import_react.useEffect)(() => () => pending.current?.abort(), [authority]);
    (0, import_react.useEffect)(() => {
      if (!open) return;
      menu.current?.querySelector("button")?.focus();
      const close = (event) => {
        if (event.target instanceof Node && !root.current?.contains(event.target)) closeAccount();
      };
      const escape = (event) => {
        if (event.key === "Escape") {
          closeAccount();
          trigger.current?.focus();
        }
      };
      const dismiss = () => closeAccount();
      document.addEventListener("pointerdown", close);
      document.addEventListener("keydown", escape);
      window.addEventListener("blur", dismiss);
      window.addEventListener("resize", dismiss);
      return () => {
        document.removeEventListener("pointerdown", close);
        document.removeEventListener("keydown", escape);
        window.removeEventListener("blur", dismiss);
        window.removeEventListener("resize", dismiss);
      };
    }, [open]);
    (0, import_react.useEffect)(() => {
      if (!qr || !authority) return;
      const controller = new AbortController();
      let timer;
      const poll = async () => {
        try {
          const authenticated = await authority.pollLogin(qr.loginId, controller.signal);
          controller.signal.throwIfAborted();
          if (authenticated) {
            setQr(void 0);
            setOpen(false);
            return;
          }
          timer = setTimeout(poll, 1500);
        } catch (failure) {
          if (!controller.signal.aborted) {
            setError(failure instanceof Error ? failure.message : String(failure));
            setQr(void 0);
          }
        }
      };
      timer = setTimeout(poll, 1500);
      return () => {
        controller.abort();
        clearTimeout(timer);
      };
    }, [qr, authority]);
    const action = async (kind) => {
      if (!authority || busy) return;
      pending.current?.abort();
      const controller = new AbortController();
      pending.current = controller;
      setBusy(true);
      setError("");
      try {
        if (kind === "login") {
          const qr2 = await authority.startLogin(controller.signal);
          controller.signal.throwIfAborted();
          setQr(qr2);
        } else {
          await authority.logout(controller.signal);
          controller.signal.throwIfAborted();
          setOpen(false);
        }
      } catch (failure) {
        if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : String(failure));
      } finally {
        if (!controller.signal.aborted) setBusy(false);
      }
    };
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "workbench-account", ref: root, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", { ref: trigger, type: "button", "aria-label": "\u8D26\u6237\u83DC\u5355", "aria-haspopup": "menu", "aria-expanded": open, onClick: () => {
        if (open) closeAccount();
        else setOpen(true);
      }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "workbench-avatar", "aria-hidden": "true", children: user?.avatar && avatarFailed !== user.avatar ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", { src: user.avatar, alt: "", referrerPolicy: "no-referrer", onError: () => setAvatarFailed(user.avatar ?? "") }) : user?.name?.slice(0, 1) || "G" }),
        wide && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: user?.name || "\u672A\u767B\u5F55" })
      ] }),
      open && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { ref: menu, className: "workbench-account-menu", role: "menu", "aria-label": "\u8D26\u6237\u83DC\u5355", onKeyDown: (event) => {
        if (event.key === "Tab") {
          closeAccount();
          return;
        }
        if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
          event.preventDefault();
          const items = Array.from(menu.current?.querySelectorAll("button:not(:disabled)") ?? []);
          const index = items.indexOf(document.activeElement);
          const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (index + (event.key === "ArrowUp" ? -1 : 1) + items.length) % items.length;
          items[next]?.focus();
        }
      }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", role: "menuitem", onClick: () => {
          closeAccount();
          openSettings();
        }, children: "\u8BBE\u7F6E" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", role: "menuitem", disabled: !authority || busy, onClick: () => void action(user ? "logout" : "login"), children: busy ? "\u6B63\u5728\u5904\u7406\u2026" : user ? "\u9000\u51FA\u767B\u5F55" : "\u767B\u5F55 GEA" }),
        qr && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", { src: qr.image, alt: "\u4F7F\u7528\u98DE\u4E66\u626B\u7801\u767B\u5F55 GEA", width: 220, height: 220 }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", role: "menuitem", onClick: () => setQr(void 0), children: "\u53D6\u6D88\u626B\u7801" })
        ] }),
        (error || identity.error) && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { role: "alert", children: error || identity.error })
      ] })
    ] });
  }
  function Sidebar({ collapsed, usePanelInfo, renderSlot }) {
    const active = usePanelInfo((value) => value.activePanelId);
    const [history, setHistory] = (0, import_react.useState)(false);
    const [entries, setEntries] = (0, import_react.useState)(() => ctx.slots.entries("main"));
    (0, import_react.useEffect)(() => {
      const refresh = () => setEntries([...ctx.slots.entries("main")]);
      const off = ctx.slots.subscribe("main", refresh);
      const offPanels = ctx.slots.subscribe("sidebar.panellist", refresh);
      const offLocale = ctx.locale.subscribe(refresh);
      const offPages = workbench.subscribe(refresh);
      return () => {
        off();
        offPanels();
        offLocale();
        offPages();
      };
    }, []);
    const available = new Set(entries.map((entry) => entry.options.key));
    const expandHistory = () => {
      setHistory(true);
      if (collapsed) ctx.layout.toggleSidebar();
    };
    (0, import_react.useEffect)(() => workbench.subscribeHistory(expandHistory), [collapsed]);
    const start = () => {
      setHistory(true);
      ctx.uiWorkspace.startSession();
    };
    const known = new Set(groups.flatMap((group) => group.items.map(([id]) => id)));
    const panels = ctx.slots.entries("sidebar.panellist");
    const additional = entries.filter((entry) => entry.options.key && entry.options.key !== "conversation" && !known.has(entry.options.key) && entry.options.key !== "gea-inbox").map((entry) => {
      const id = entry.options.key;
      const label = panels.find((panel) => panel.options.id === id)?.options.label;
      return { id, label: typeof label === "function" ? label() : label ?? workbench.label(id) };
    });
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("aside", { className: "agent-workbench-ui workbench-sidebar" + (collapsed ? " is-collapsed" : ""), "aria-label": "\u601D\u5FF5 GEA \u5BFC\u822A", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "workbench-sidebar-brand", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", "aria-label": collapsed ? "\u5C55\u5F00\u4E1A\u52A1\u83DC\u5355" : "\u6536\u8D77\u4FA7\u8FB9\u680F", onClick: () => ctx.layout.toggleSidebar(), children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", { src: brand_logo_default, alt: "", width: 36, height: 36 }) }),
        !collapsed && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: "Synear GEA" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "\u667A\u80FD\u4F53\u5DE5\u4F5C\u53F0" })
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "workbench-sidebar-actions", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", "aria-label": "\u65B0\u5EFA\u4F1A\u8BDD", onClick: start, children: collapsed ? "+" : "AI\u5DE5\u4F5C\u53F0" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", "aria-label": "\u6D88\u606F\u5F85\u529E", disabled: !available.has("gea-inbox"), onClick: () => void workbench.open("gea-inbox"), children: collapsed ? "\u25C7" : "\u6D88\u606F\u5F85\u529E" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "workbench-nav-tabs", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", "aria-pressed": !history, onClick: () => {
          setHistory(false);
          if (collapsed) ctx.layout.toggleSidebar();
        }, children: collapsed ? "\u25A6" : "\u4E1A\u52A1\u5DE5\u4F5C\u53F0" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", "aria-pressed": history, onClick: expandHistory, children: collapsed ? "\u25F7" : "\u5386\u53F2\u4F1A\u8BDD" })
      ] }),
      !collapsed && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "workbench-sidebar-browser", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("nav", { hidden: history, "aria-label": "\u4E1A\u52A1\u5BFC\u822A", children: [
          groups.map((group) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("details", { open: true, children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("summary", { children: group.title }),
            group.items.map(([id, title]) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", disabled: !available.has(id), "aria-current": active === id ? "page" : void 0, onClick: () => void workbench.open(id), children: title }, id))
          ] }, group.title)),
          additional.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("details", { open: true, children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("summary", { children: "\u516C\u5171\u5DE5\u5177\u4E0E\u539F\u578B" }),
            additional.map((entry) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", "aria-current": active === entry.id ? "page" : void 0, onClick: () => void workbench.open(entry.id), children: entry.label }, entry.id))
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { hidden: !history, children: renderSlot("sidebar.workspaces", { wide: true, expandSidebar: () => ctx.layout.toggleSidebar() }) })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("footer", { children: [
        renderSlot("sidebar.settings", { wide: !collapsed }),
        renderSlot("sidebar.footer.action", { wide: !collapsed })
      ] })
    ] });
  }
  function Conversation({ sessionId, useSession, useConversation, useSessions, renderFactorySlot }) {
    const session = useSession((value) => value);
    const conversation = useConversation((value) => value);
    const cwd = useSessions((value) => sessionId ? value.byId[sessionId]?.cwd : void 0);
    const [historyError, setHistoryError] = (0, import_react.useState)("");
    (0, import_react.useEffect)(() => {
      if (!sessionId) return;
      const page = workbench.takeHistoryPage();
      if (!page) return;
      const controller = new AbortController();
      void restorePageSession(page, sessionId, controller.signal).then(() => {
        controller.signal.throwIfAborted();
        return workbench.open(page);
      }).catch((error) => {
        if (!controller.signal.aborted) setHistoryError(error instanceof Error ? error.message : String(error));
      });
      return () => controller.abort();
    }, [sessionId]);
    const blank = !session || !conversation || conversation.activeTargets.size === 0 && session.blank && !session.running && !session.promptAttempted;
    const loading = session?.openState === "loading" && !blank;
    const positions = (0, import_react.useMemo)(() => {
      function Welcome({ useWorkspaces, renderSlot, selectWorkspace }) {
        const workspaces = useWorkspaces((value) => value.items);
        const current = workspaces.find((workspace) => workspace.sessionIds.includes(sessionId));
        const [pickerOpen, setPickerOpen] = (0, import_react.useState)(false);
        return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "workbench-main-welcome", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CompanyWelcome, {}),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "workbench-native-selectors", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", onClick: () => setPickerOpen((value) => !value), "aria-expanded": pickerOpen, children: current?.title || "\u9009\u62E9\u5DE5\u4F5C\u533A" }),
            renderSlot("conversation.hero.workspace", { open: pickerOpen, selectedId: current?.workspaceId, onPick: (id) => {
              setPickerOpen(false);
              void selectWorkspace(id);
            }, onClose: () => setPickerOpen(false) }),
            renderSlot("conversation.hero.agentPreset", {})
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Resources, { cwd })
        ] });
      }
      return {
        views: function MainViews(props) {
          return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "workbench-main-views", children: [
            blank && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Welcome, { ...props }),
            " ",
            props.renderSlot("conversation.session", {})
          ] });
        },
        widthControls: function ColdWelcome(props) {
          return sessionId === void 0 && blank ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "workbench-cold-welcome", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Welcome, { ...props }) }) : null;
        }
      };
    }, [blank, cwd, sessionId]);
    const title = useSessions((value) => sessionId ? value.byId[sessionId]?.title : void 0);
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { className: "agent-workbench-ui workbench-main-conversation", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", { className: "workbench-main-toolbar", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: title || "AI\u5DE5\u4F5C\u53F0" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", onClick: () => workbench.showHistory(), children: "\u5386\u53F2\u5BF9\u8BDD" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", onClick: () => ctx.uiWorkspace.startSession(), children: "\u65B0\u5EFA\u4F1A\u8BDD" })
      ] }),
      historyError && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { role: "alert", children: historyError }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "workbench-native-content", children: renderFactorySlot("conversation.content", { variant: "embedded", phase: loading ? "settling" : "active", hero: false }, { slots: positions }) })
    ] });
  }
  ctx.slots.inject("sidebar", () => ctx.slots.register({ name: "sidebar", priority: -20, children: { "sidebar.brand.mark": { kind: "single", scope: "root" }, "sidebar.brand.name": { kind: "single", scope: "root" }, "sidebar.panellist": { kind: "list", scope: "root" }, "sidebar.workspaces": { kind: "single", scope: "root" }, "sidebar.settings": { kind: "single", scope: "root" }, "sidebar.footer.action": { kind: "list", scope: "root" } } }, Sidebar));
  ctx.slots.inject("settings.launcher", () => ctx.slots.register({ name: "settings.launcher", priority: -20 }, Account));
  ctx.slots.inject("shell.leading", () => ctx.slots.register({ name: "shell.leading", priority: -20 }, () => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "agent-workbench-ui workbench-leading", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", "aria-label": "\u5C55\u5F00\u4E1A\u52A1\u83DC\u5355", onClick: () => ctx.layout.toggleSidebar(), children: "\u2630" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", "aria-label": "\u65B0\u5EFA\u4F1A\u8BDD", onClick: () => ctx.uiWorkspace.startSession(), children: "\uFF0B" })
  ] })));
  ctx.slots.inject("main.conversation", () => ctx.slots.register({ name: "main.conversation", priority: -20 }, Conversation));
}

// src/workbench.ts
var WorkbenchController = class {
  constructor(ports) {
    this.ports = ports;
  }
  pages = /* @__PURE__ */ new Map();
  disposed = false;
  listeners = /* @__PURE__ */ new Set();
  historyListeners = /* @__PURE__ */ new Set();
  historyPage;
  register(page) {
    if (this.disposed) throw Error("WORKBENCH_DISPOSED");
    if (this.pages.has(page.id)) throw Error(`Duplicate workbench page: ${page.id}`);
    this.pages.set(page.id, page);
    this.changed();
    return () => {
      if (this.pages.get(page.id) === page) {
        this.pages.delete(page.id);
        this.changed();
      }
    };
  }
  async open(id) {
    if (this.disposed) return false;
    if (!this.pages.has(id) && !this.ports.hasPanel?.(id)) throw Error(`Unknown workbench page: ${id}`);
    this.ports.panel(id);
    return true;
  }
  registerFrame(page) {
    if (!this.ports.frame) throw Error("WORKBENCH_FRAME_UNAVAILABLE");
    const unregister = this.register(page);
    let dispose;
    try {
      dispose = this.ports.frame(page);
    } catch (error) {
      unregister();
      throw error;
    }
    return () => {
      dispose();
      unregister();
    };
  }
  label(id) {
    const label = this.pages.get(id)?.label;
    return typeof label === "function" ? label() : label ?? id;
  }
  subscribe(listener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  showHistory(page) {
    this.historyPage = page;
    for (const listener of this.historyListeners) listener();
  }
  takeHistoryPage() {
    const page = this.historyPage;
    this.historyPage = void 0;
    return page;
  }
  subscribeHistory(listener) {
    this.historyListeners.add(listener);
    return () => {
      this.historyListeners.delete(listener);
    };
  }
  changed() {
    for (const listener of this.listeners) listener();
  }
  dispose() {
    this.disposed = true;
    this.pages.clear();
  }
};

// theme/tokens.css
var tokens_default = '/* Shared workbench resource 1.1.0. State belongs to DSH ui-theme.\n * html + body specificity keeps the adapter stable when base sheets reload.\n * Inline user token overrides retain priority. Status palettes stay upstream. */\nhtml body {\n  --workbench-theme-version: "1.1.0";\n  --workbench-font-family: "Microsoft YaHei UI", "PingFang SC", "Noto Sans CJK SC", Arial, sans-serif;\n  --workbench-font-size: var(--dsh-content-font-size, 14px);\n  --workbench-page: #f7f8fa;\n  --workbench-surface: #ffffff;\n  --workbench-subtle: #fafafa;\n  --workbench-muted-surface: #f5f6f8;\n  --workbench-text: #20232a;\n  --workbench-body: #555d68;\n  --workbench-muted: #626b78;\n  --workbench-border: #e3e6ea;\n  --workbench-control-border: #d9dde3;\n  --workbench-brand: #df1732;\n  --workbench-selected-text: #d0132c;\n  --workbench-brand-hover: #c91029;\n  --workbench-brand-soft: #fff0f2;\n  --workbench-hover: #fffafb;\n}\n\nhtml body[data-ds-dark-theme] {\n  --workbench-page: #1b1d21;\n  --workbench-surface: #24262b;\n  --workbench-subtle: #282b31;\n  --workbench-muted-surface: #30343b;\n  --workbench-text: #edf0f5;\n  --workbench-body: #c7cdd6;\n  --workbench-muted: #aab3bf;\n  --workbench-border: #414751;\n  --workbench-control-border: #59616e;\n  --workbench-brand: #ff8092;\n  --workbench-selected-text: #ff9aa8;\n  --workbench-brand-hover: #ff9aa8;\n  --workbench-brand-soft: #442630;\n  --workbench-hover: #35272e;\n}\n\n.agent-workbench-ui {\n  background: var(--workbench-page);\n  color: var(--workbench-text);\n  font: var(--workbench-font-size)/1.5 var(--workbench-font-family);\n}\n.agent-workbench-ui button { padding: 10px 14px; border: 1px solid var(--workbench-border); border-radius: 8px; background: var(--workbench-surface); color: var(--workbench-text); font: inherit; cursor: pointer; }\n.agent-workbench-ui button:not(:disabled):hover { background: var(--workbench-hover); border-color: var(--workbench-brand); }\n.agent-workbench-ui button:focus-visible { outline: 2px solid var(--workbench-brand); outline-offset: 2px; }\n.agent-workbench-html { height: 100%; width: 100%; border: 0; display: block; }\n\n.agent-workbench-ui button[aria-current="page"] { color: var(--workbench-selected-text); background: var(--workbench-brand-soft); border-color: var(--workbench-brand); }\n.agent-workbench-ui button:disabled { color: var(--workbench-muted); background: var(--workbench-muted-surface); cursor: default; }\n\n.agent-workbench-document { height: 100%; min-height: 0; display:flex; flex-direction:column; }\n.agent-workbench-page-toolbar { display:flex; flex-wrap:wrap; align-items:center; gap:12px; padding:8px 16px; border-bottom:1px solid var(--workbench-border); flex:none; }\n.agent-workbench-page-toolbar>span:last-child { color:var(--workbench-muted); }\n.agent-workbench-page-error { padding:8px 16px; margin:0; flex:none; color:var(--workbench-text); }\n.agent-workbench-document-body { min-height:0; flex:1; display:grid; grid-template-columns:minmax(0,1fr); }\n.agent-workbench-document-body.with-conversation { grid-template-columns:minmax(0,1fr) minmax(340px,36%); }\n.agent-workbench-native-conversation { min-height:0; border-left:1px solid var(--workbench-border); overflow:auto; }\n@media(max-width:900px) { .agent-workbench-document-body.with-conversation { grid-template-columns:minmax(0,1fr); grid-template-rows:minmax(320px,1fr) minmax(320px,1fr); overflow:auto; } .agent-workbench-native-conversation {border-left:0;border-top:1px solid var(--workbench-border);} }\n\n.workbench-sidebar { height:100%; display:flex; flex-direction:column; box-sizing:border-box; padding:12px; gap:12px; background:var(--workbench-subtle); min-height:0; }\n.workbench-sidebar-brand {display:flex;align-items:center;gap:12px;min-height:44px;}\n.workbench-sidebar-brand>button {padding:0;border:0;background:transparent;flex:none;}\n.workbench-sidebar-brand>div {display:flex;flex-direction:column;gap:4px;min-width:0;}\n.workbench-sidebar-brand strong {font-size:18px;line-height:1.35;font-weight:700;}\n.workbench-sidebar-brand span {font-size:12px;color:var(--workbench-body);}\n.workbench-sidebar-actions,.workbench-nav-tabs {display:flex;gap:8px;}\n.workbench-sidebar-actions button,.workbench-nav-tabs button {flex:1;min-width:0;white-space:nowrap;padding:8px 4px;font-size:12px;}\n.workbench-nav-tabs button {border:0;border-radius:0;border-bottom:2px solid transparent;background:transparent;}\n.workbench-nav-tabs button[aria-pressed="true"] {color:var(--workbench-brand);border-bottom-color:var(--workbench-brand);font-weight:700;}\n.workbench-sidebar-browser {flex:1;min-height:0;overflow:auto;scrollbar-width:none;}\n.workbench-sidebar-browser::-webkit-scrollbar {display:none;}\n.workbench-sidebar-browser details {padding:4px 0;}\n.workbench-sidebar-browser summary {cursor:pointer;padding:8px;font-weight:700;font-size:13px;color:var(--workbench-body);}\n.workbench-sidebar-browser nav button {display:block;text-align:left;width:100%;padding:8px 12px 8px 24px;font-size:12px;line-height:1.65;border:0;background:transparent;}\n.workbench-sidebar-browser nav button[aria-current="page"] {background:var(--workbench-brand-soft);color:var(--workbench-selected-text);}\n.workbench-sidebar-browser nav button:disabled {background:transparent;color:var(--workbench-muted);}\n.workbench-sidebar footer {flex:none;display:flex;align-items:center;gap:8px;}\n.workbench-sidebar footer>div:first-child {flex:1;min-width:0;}\n.workbench-sidebar.is-collapsed {padding:8px 4px;}\n.workbench-sidebar.is-collapsed .workbench-sidebar-actions,.workbench-sidebar.is-collapsed .workbench-nav-tabs {flex-direction:column;}\n.workbench-sidebar.is-collapsed footer {margin-top:auto;}\n.workbench-account {position:relative;width:100%;}\n.workbench-account>button {display:flex;align-items:center;gap:8px;width:100%;padding:8px;border:0;background:transparent;}\n.workbench-avatar {width:28px;height:28px;border-radius:50%;background:var(--workbench-brand-soft);color:var(--workbench-brand);display:grid;place-items:center;flex:none;overflow:hidden;}\n.workbench-avatar img {width:100%;height:100%;object-fit:cover;}\n.workbench-account-menu {position:absolute;bottom:calc(100% + 8px);left:0;min-width:220px;max-width:min(300px,calc(100vw - 32px));padding:8px;background:var(--workbench-surface);border:1px solid var(--workbench-border);border-radius:8px;box-shadow:0 12px 32px #1d20281a;z-index:1200;}\n.workbench-account-menu>button {display:block;width:100%;text-align:left;border:0;padding:8px 12px;}\n.workbench-account-menu img {display:block;max-width:100%;height:auto;margin:12px auto;}\n.workbench-main-conversation {height:100%;min-height:0;display:flex;flex-direction:column;overflow:hidden;}\n.workbench-native-content {min-height:0;flex:1;display:flex;flex-direction:column;overflow:hidden;}\n.workbench-main-welcome {flex:none;max-width:760px;width:100%;margin:auto;box-sizing:border-box;padding:24px;}\n.workbench-main-views {display:flex;flex-direction:column;flex:1 0 auto;}\n.workbench-cold-welcome {order:-1;flex:1;min-height:0;overflow:auto;}\n.workbench-main-toolbar {display:flex;gap:8px;align-items:center;flex:none;padding:12px 16px;border-bottom:1px solid var(--workbench-border);padding-inline-start:max(16px,var(--dsh-frame-leading-clearance,0px));}\n.workbench-main-toolbar strong {font-size:14px;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}\n.workbench-main-toolbar button {padding:8px 12px;font-size:12px;}\n.workbench-home-hero {text-align:center;padding:20px 0;}\n.workbench-home-hero h1 {font-size:23px;line-height:1.35;margin:16px 0;color:var(--workbench-text);}\n.workbench-home-hero p {font-size:13px;line-height:1.7;color:var(--workbench-body);margin:12px auto;max-width:600px;}\n.workbench-native-selectors {display:flex;justify-content:center;align-items:center;gap:12px;flex-wrap:wrap;}\n.workbench-resources {margin-top:20px;padding:12px 0;border-top:1px solid var(--workbench-border);font-size:12px;}\n.workbench-resources summary {cursor:pointer;padding:8px;font-weight:700;}\n.workbench-resources>div {padding:4px 0;}\n.workbench-resources button {font-size:12px;padding:8px 12px;}\n.workbench-conversation-toolbar {margin-left:auto;display:flex;align-items:center;gap:8px;}\n.workbench-conversation-toolbar>div {display:flex;gap:4px;}\n.workbench-conversation-toolbar button {padding:4px 8px;min-width:32px;min-height:32px;border:0;background:transparent;font-size:18px;}\n.workbench-conversation-toolbar button[aria-pressed="true"] {background:var(--workbench-brand-soft);color:var(--workbench-brand);}\n.agent-workbench-document-body.with-conversation.view-center {grid-template-columns:minmax(0,1fr);grid-template-rows:minmax(0,1fr);}\n.agent-workbench-document-body.with-conversation.view-center>.agent-workbench-native-conversation {display:none;}\n.agent-workbench-document-body.with-conversation.view-chat {grid-template-columns:minmax(0,1fr);grid-template-rows:minmax(0,1fr);}\n.agent-workbench-document-body.with-conversation.view-chat>.agent-workbench-html {display:none;}\n.workbench-page-conversation {height:100%;min-height:0;display:flex;flex-direction:column;}\n.workbench-page-conversation>[data-conversation-content] {flex:1;min-height:180px;}\n.workbench-agent-welcome {padding:24px 20px;flex:none;}\n.workbench-agent-welcome h2 {font-size:18px;line-height:1.35;margin:12px 0;}\n.workbench-agent-welcome p {font-size:12px;line-height:1.7;color:var(--workbench-body);}\n.workbench-agent-welcome b {display:block;margin-top:8px;font-weight:600;}\n.workbench-agent-welcome h3 {font-size:13px;margin:20px 0 12px;}\n.workbench-suggestions {display:flex;flex-direction:column;gap:8px;}\n.workbench-suggestions button {text-align:left;padding:8px 12px;font-size:12px;}\n.workbench-sidebar summary:focus-visible,.workbench-resources summary:focus-visible {outline:2px solid var(--workbench-brand);outline-offset:2px;}\n@media(max-width:720px) {.workbench-main-welcome{padding:16px;}.workbench-home-hero h1{font-size:18px;}.workbench-conversation-toolbar{margin-left:0;}.agent-workbench-page-toolbar{gap:8px;}.workbench-agent-welcome{padding:16px;}}\n';

// src/frame-presenter.tsx
var import_react3 = require("react");

// src/page-interaction/page-bridge/protocol.ts
var AGUI_EVENT_TOOL_CALL_START = "TOOL_CALL_START";
var AGUI_EVENT_TOOL_CALL_ARGS = "TOOL_CALL_ARGS";
var AGUI_EVENT_TOOL_CALL_END = "TOOL_CALL_END";

// src/page-interaction/page-bridge/client.ts
function startPageBridgeClient(options) {
  if (options.sessionId === null) return () => {
  };
  const pollMs = options.pollMs ?? 1200;
  const initialDelayMs = options.initialDelayMs ?? 500;
  const applyTimeoutMs = options.applyTimeoutMs ?? 8e3;
  const buffers = /* @__PURE__ */ new Map();
  const names = /* @__PURE__ */ new Map();
  const settled = /* @__PURE__ */ new Set();
  const activeApplies = /* @__PURE__ */ new Map();
  const outbox = [];
  let counter = 0;
  let stopped = false;
  let timer;
  const closeOnDispose = options.closeOnDispose ?? true;
  const message = (toolCallId, result) => ({
    id: `page-bridge-result-${++counter}`,
    role: "tool",
    toolCallId,
    content: JSON.stringify({ toolCallId, applied: result.applied }),
    ...result.error ? { error: result.error } : {}
  });
  const runApply = async (toolCallId, toolCallName, args) => {
    const controller = new AbortController();
    activeApplies.set(toolCallId, controller);
    let timeout;
    let timedOut = false;
    try {
      return await Promise.race([
        Promise.resolve(
          options.apply(
            args,
            { toolCallId, toolCallName },
            controller.signal
          )
        ),
        new Promise((resolve) => {
          controller.signal.addEventListener(
            "abort",
            () => {
              if (!timedOut) resolve({ applied: false, error: "APPLY_CANCELLED" });
            },
            { once: true }
          );
          timeout = setTimeout(() => {
            timedOut = true;
            controller.abort();
            resolve({ applied: false, error: "APPLY_TIMEOUT" });
          }, applyTimeoutMs);
        })
      ]);
    } catch (error) {
      return { applied: false, error: "APPLY_FAILED" };
    } finally {
      if (timeout) clearTimeout(timeout);
      activeApplies.delete(toolCallId);
    }
  };
  const poll = async () => {
    const pending = outbox.splice(0, outbox.length);
    try {
      const pageSource = typeof options.pageSource === "function" ? options.pageSource() : options.pageSource;
      const result = await options.request(
        options.endpoint,
        {
          sessionId: options.sessionId,
          toolMessages: pending,
          ...options.catalog ? { catalog: options.catalog() } : {},
          ...pageSource === void 0 ? {} : { pageSource }
        }
      );
      if (stopped) return;
      for (const event of result.events ?? []) {
        if (event.type === AGUI_EVENT_TOOL_CALL_START) {
          buffers.set(event.toolCallId, "");
          names.set(event.toolCallId, event.toolCallName);
          continue;
        }
        if (event.type === AGUI_EVENT_TOOL_CALL_ARGS) {
          buffers.set(
            event.toolCallId,
            (buffers.get(event.toolCallId) ?? "") + event.delta
          );
          continue;
        }
        if (event.type !== AGUI_EVENT_TOOL_CALL_END) continue;
        const raw = buffers.get(event.toolCallId) ?? "";
        const toolCallName = names.get(event.toolCallId) ?? "";
        buffers.delete(event.toolCallId);
        names.delete(event.toolCallId);
        if (settled.has(event.toolCallId)) continue;
        settled.add(event.toolCallId);
        let args;
        try {
          args = JSON.parse(raw);
        } catch {
          outbox.push(message(event.toolCallId, { applied: false, error: "INVALID_TOOL_ARGUMENTS" }));
          continue;
        }
        const outcome = await runApply(
          event.toolCallId,
          toolCallName,
          args
        );
        if (stopped) return;
        outbox.push(message(event.toolCallId, outcome));
      }
    } catch (error) {
      if (stopped) return;
      options.onError?.(error);
    }
    if (!stopped) timer = setTimeout(() => void poll(), pollMs);
  };
  timer = setTimeout(() => void poll(), initialDelayMs);
  return () => {
    stopped = true;
    clearTimeout(timer);
    for (const controller of activeApplies.values()) controller.abort();
    activeApplies.clear();
    if (!closeOnDispose || typeof options.sessionId !== "string") return;
    try {
      void Promise.resolve(
        options.request(options.endpoint, {
          sessionId: options.sessionId,
          toolMessages: [],
          catalog: null
        })
      ).catch(() => {
      });
    } catch {
    }
  };
}

// src/html-bridge.ts
function connectHtmlFrame(frame, connection, execution, theme, signal, failed) {
  const lifetime = new AbortController();
  const channel = new MessageChannel();
  const tasks = /* @__PURE__ */ new Map();
  const applies = /* @__PURE__ */ new Map();
  let connected = false, themeRequested = false;
  let elements = null;
  let pollTimer;
  const context = { plugin: connection.page.pluginId, session: connection.sessionId };
  const alive = () => !lifetime.signal.aborted && !signal.aborted;
  const call = (method, parameters, requestSignal = lifetime.signal) => execution.call(connection, method, parameters, AbortSignal.any([signal, lifetime.signal, requestSignal]));
  const sendTheme = () => {
    if (!alive() || !connected || !themeRequested) return;
    const snapshot = theme();
    channel.port1.postMessage({ type: "theme", context, version: "1.1.0", colorScheme: snapshot.active.colorScheme, fontSize: snapshot.fontSize, tokens: snapshot.active.tokens });
  };
  const ready = (event) => {
    if (!alive() || event.source !== frame.contentWindow || event.data?.protocol !== "gea-html-v2" || event.data.type !== "ready" || connected) return;
    connected = true;
    frame.contentWindow?.postMessage({ protocol: "gea-html-v2", type: "connect", context }, "*", [channel.port2]);
  };
  window.addEventListener("message", ready);
  const pageBridge = startPageBridgeClient({
    endpoint: "page-bridge",
    request: (_endpoint, payload) => call("page-bridge", payload),
    sessionId: connection.sessionId,
    pageSource: "self-report",
    catalog: () => elements === null ? null : { elements },
    apply: (args, meta, applySignal) => new Promise((resolve) => {
      const settle = (result) => {
        applies.delete(meta.toolCallId);
        applySignal.removeEventListener("abort", cancel);
        resolve(result);
      };
      const cancel = () => {
        channel.port1.postMessage({ type: "cancel", session: connection.sessionId, toolCallId: meta.toolCallId });
        settle({ applied: false, error: "PAGE_ACTION_CANCELLED" });
      };
      applies.set(meta.toolCallId, settle);
      if (!alive() || applySignal.aborted) return cancel();
      applySignal.addEventListener("abort", cancel, { once: true });
      channel.port1.postMessage({ type: "apply", session: connection.sessionId, toolCallId: meta.toolCallId, toolCallName: meta.toolCallName, args });
    })
  });
  channel.port1.onmessage = async (event) => {
    if (!alive()) return;
    const message = event.data;
    if (!message || typeof message !== "object") return;
    try {
      if (["request", "register", "invoked", "catalog", "applied", "cancel", "theme:subscribe"].includes(message.type) && message.session !== connection.sessionId) throw Error("PAGE_SESSION_CHANGED");
      if (message.type === "theme:subscribe") {
        themeRequested = true;
        sendTheme();
        return;
      }
      if (message.type === "catalog") {
        elements = Array.isArray(message.elements) && message.elements.length ? message.elements : null;
        return;
      }
      if (message.type === "applied") {
        applies.get(message.toolCallId)?.({ applied: message.applied === true, ...typeof message.error === "string" ? { error: message.error } : {} });
        return;
      }
      if (message.type === "cancel") {
        tasks.get(message.id)?.abort();
        return;
      }
      if (message.type === "register") {
        await call("register", { name: message.name, description: message.description });
        return;
      }
      if (message.type === "invoked") {
        await call("reply", message);
        return;
      }
      if (message.type !== "request" || typeof message.id !== "string") return;
      const task = new AbortController();
      tasks.set(message.id, task);
      try {
        let result;
        if (message.method === "conversation") {
          const text2 = message.parameters?.text;
          if (typeof text2 !== "string" || !text2.trim() || text2.length > 1e4 || JSON.stringify(message.parameters?.context ?? {}).length > 1e5) throw Error("INVALID_PAGE_QUESTION");
          await call("context", message.parameters?.context, task.signal);
          if (!alive() || task.signal.aborted) return;
          await execution.prompt(connection, text2, AbortSignal.any([signal, lifetime.signal, task.signal]));
          result = { sent: true };
        } else if (["sql", "workspace", "access", "context"].includes(message.method)) result = await call(message.method, message.parameters, task.signal);
        else throw Error("HTML_METHOD_NOT_ALLOWED");
        if (alive() && !task.signal.aborted) channel.port1.postMessage({ type: "response", id: message.id, result });
      } finally {
        tasks.delete(message.id);
      }
    } catch (error) {
      if (alive()) channel.port1.postMessage({ type: "response", id: message.id, error: error instanceof Error ? error.message : String(error) });
    }
  };
  channel.port1.start();
  frame.contentWindow?.postMessage({ protocol: "gea-html-v2", type: "request-ready" }, "*");
  const poll = async () => {
    try {
      const events = await call("events", void 0);
      if (alive()) for (const event of events) channel.port1.postMessage(event);
    } catch (error) {
      if (alive()) {
        failed(error);
        dispose();
      }
    }
    if (alive()) pollTimer = setTimeout(poll, 1e3);
  };
  const dispose = () => {
    if (lifetime.signal.aborted) return;
    lifetime.abort();
    signal.removeEventListener("abort", dispose);
    pageBridge();
    if (pollTimer) clearTimeout(pollTimer);
    for (const task of tasks.values()) task.abort();
    tasks.clear();
    for (const settle of [...applies.values()]) settle({ applied: false, error: "PAGE_ACTION_CANCELLED" });
    channel.port1.postMessage({ type: "context", context: null });
    window.removeEventListener("message", ready);
    channel.port1.close();
    channel.port2.close();
  };
  signal.addEventListener("abort", dispose, { once: true });
  if (signal.aborted) dispose();
  else void poll();
  return Object.assign(dispose, { sendTheme });
}

// src/page-interaction/client.ts
var import_react2 = __toESM(require("react"), 1);

// src/page-interaction/reference.ts
var PAGE_INTERACTION = "dsh-page-interaction-v1";
var REFERENCE_SOURCE = "page-content";
var text = (value, limit) => typeof value === "string" ? value.trim().slice(0, limit) : "";
function pageReference(value) {
  if (!value || typeof value !== "object") return;
  const v = value;
  if (typeof v.text !== "string" || !v.text.trim()) return;
  return {
    page: text(v.page, 160),
    kind: v.kind === "row" || v.kind === "table" ? v.kind : "block",
    label: text(v.label, 160) || "\u9875\u9762\u5185\u5BB9",
    text: text(v.text, 6e3),
    row: text(v.row, 200),
    column: text(v.column, 200),
    scope: text(v.scope, 1e3),
    targets: Array.isArray(v.targets) ? v.targets.filter(
      (x) => typeof x === "string" && x.length <= 200
    ) : [],
    capturedAt: text(v.capturedAt, 64),
    truncated: v.text.length > 6e3 || v.truncated === true
  };
}
function serializeReference(value) {
  if (!/^R[a-f0-9]{12}$/.test(value.id) || typeof value.label !== "string")
    throw Error("\u5F15\u7528\u5DF2\u5931\u6548\uFF0C\u8BF7\u91CD\u65B0\u9009\u62E9\u5185\u5BB9\u3002");
  const label = value.label.replace(/[%\[\]\\@\/\r\n]/g, encodeURIComponent);
  return `[${label}](dsh-page:${value.id}) `;
}

// src/page-interaction/client.ts
function installPageInteraction(ctx) {
  try {
    const existing = ctx.get("pageInteraction");
    if (existing) return existing;
  } catch {
  }
  let ready;
  let disposed = false;
  const bindings = /* @__PURE__ */ new Set();
  const releases = /* @__PURE__ */ new Set();
  const triggers = /* @__PURE__ */ new Set();
  const currentPicker = (sessionId) => [...bindings].reverse().find(
    (binding) => binding.available && binding.sessionId === sessionId && binding.frame.isConnected && binding.frame.getClientRects().length > 0
  );
  const updateTriggers = () => {
    if (!triggers.size) return;
    for (const button of triggers) {
      const binding = currentPicker(button.dataset.sessionId);
      button.disabled = !binding;
      button.setAttribute("aria-pressed", String(binding?.selecting === true));
      button.setAttribute(
        "aria-label",
        binding?.selecting ? "\u9000\u51FA\u9009\u62E9" : "\u9009\u62E9\u5185\u5BB9"
      );
      button.title = binding?.selecting ? "\u9000\u51FA\u9009\u62E9\uFF08Esc\uFF09" : "\u9009\u62E9\u5185\u5BB9\uFF08\u6309\u4F4F Alt \u4E34\u65F6\u9009\u62E9\uFF0CEsc \u9000\u51FA\uFF09";
    }
  };
  ctx.inject(["inputTriggers", "conversation"], (scope) => {
    scope.effect(
      () => scope.inputTriggers.registerSource({
        trigger: "@",
        name: REFERENCE_SOURCE,
        candidates: async () => [],
        onPick: () => void 0,
        codec: {
          clipboardText: (ref) => serializeReference(JSON.parse(ref)),
          serialize: async (ref) => {
            return serializeReference(JSON.parse(ref));
          }
        }
      })
    );
    ready = scope;
    scope.effect(() => {
      const down = (event) => {
        const paired = [...triggers].filter((button) => button.isConnected && button.getClientRects().length > 0 && currentPicker(button.dataset.sessionId));
        const sessions = new Set(paired.map((button) => button.dataset.sessionId));
        const picker = sessions.size === 1 ? currentPicker([...sessions][0]) : void 0;
        if (!picker || event.isComposing) return;
        if (event.key === "Alt" && !event.ctrlKey && !event.metaKey) {
          event.preventDefault();
          picker.send({ type: "hold-selection", held: true });
        }
        if (event.key === "Escape") {
          if (picker.selecting) event.preventDefault();
          picker.send({ type: "stop-selection", altHeld: event.altKey });
        }
      };
      const release = (transient = false) => {
        for (const picker of bindings)
          picker.send({
            type: transient ? "suspend-selection" : "hold-selection",
            held: false
          });
      };
      const up = (event) => {
        if (event.key === "Alt") release();
      };
      const blur = () => {
        if (typeof document === "undefined" || !document.hasFocus())
          release(true);
      };
      const visibility = () => {
        if (document.hidden) release(true);
      };
      window.addEventListener("keydown", down, true);
      window.addEventListener("keyup", up, true);
      window.addEventListener("blur", blur);
      if (typeof document !== "undefined")
        document.addEventListener("visibilitychange", visibility);
      return () => {
        window.removeEventListener("keydown", down, true);
        window.removeEventListener("keyup", up, true);
        window.removeEventListener("blur", blur);
        if (typeof document !== "undefined")
          document.removeEventListener("visibilitychange", visibility);
      };
    });
    updateTriggers();
    scope.effect(() => () => {
      if (ready === scope) ready = void 0;
    });
  });
  const api = {
    mountTrigger(container, sessionId) {
      if (disposed) throw new Error("\u9875\u9762\u4EA4\u4E92\u5DF2\u91CA\u653E\u3002");
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.sessionId = sessionId;
      button.setAttribute("aria-keyshortcuts", "Alt Escape");
      button.setAttribute("aria-label", "\u9009\u62E9\u5185\u5BB9");
      button.setAttribute("data-page-selection-trigger", "");
      const icon = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "svg"
      );
      icon.setAttribute("viewBox", "0 0 24 24");
      icon.setAttribute("width", "20");
      icon.setAttribute("height", "20");
      icon.setAttribute("aria-hidden", "true");
      const path = document.createElementNS(icon.namespaceURI, "path");
      path.setAttribute("d", "M3.5 3.5 21 11.5l-7.5 2-2 7.5L3.5 3.5Z");
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", "currentColor");
      path.setAttribute("stroke-width", "1.5");
      path.setAttribute("stroke-linejoin", "round");
      icon.append(path);
      button.append(icon);
      button.addEventListener(
        "click",
        () => currentPicker(sessionId)?.send({ type: "toggle-selection" })
      );
      container.append(button);
      triggers.add(button);
      for (const binding of bindings) binding.configure();
      updateTriggers();
      return () => {
        triggers.delete(button);
        button.remove();
        for (const binding of bindings) binding.configure();
      };
    },
    bindFrame({ frame, reference, page, surface, tool, referenceLease }) {
      if (disposed) throw new Error("\u9875\u9762\u4EA4\u4E92\u5DF2\u91CA\u653E\u3002");
      const { sessionId } = reference;
      const owned = reference.binding;
      const retained = () => {
        try {
          return reference.binding === owned;
        } catch {
          return false;
        }
      };
      const paired = () => retained() && currentPicker(sessionId) === binding && [...triggers].some((button) => button.dataset.sessionId === sessionId && button.isConnected && button.getClientRects().length > 0);
      const input = () => {
        if (!ready || !retained()) throw new Error("\u5BF9\u8BDD\u5DF2\u91CA\u653E\uFF0C\u8BF7\u91CD\u65B0\u5173\u8054\u9875\u9762\u3002");
        return ready.conversation.input.for(reference.binding.ctx);
      };
      const channel = crypto.randomUUID();
      const sandbox = frame.getAttribute("sandbox");
      const opaqueOrigin = sandbox !== null && !sandbox.split(/\s+/).includes("allow-same-origin");
      const expectedOrigin = opaqueOrigin ? "null" : frame.src && !frame.srcdoc ? new URL(frame.src, window.location.href).origin : void 0;
      let active = true;
      let generation;
      const bindingRequest = new AbortController();
      const requests = /* @__PURE__ */ new Map();
      const send = (message) => frame.contentWindow?.postMessage(
        { protocol: PAGE_INTERACTION, channel, ...message },
        "*"
      );
      const configure = () => {
        if (generation) send({ type: "configure", page, externalTrigger: [...triggers].some((button) => button.dataset.sessionId === sessionId) });
      };
      const binding = {
        frame,
        sessionId,
        selecting: false,
        available: false,
        send,
        configure
      };
      bindings.add(binding);
      updateTriggers();
      const receive = async (event) => {
        if (event.source !== frame.contentWindow || expectedOrigin !== void 0 && event.origin !== expectedOrigin || event.data?.protocol !== PAGE_INTERACTION)
          return;
        if (event.data.type === "ready") {
          configure();
          return;
        }
        if (!active || event.data.channel !== channel) return;
        if (event.data.type === "selection-state") {
          binding.selecting = event.data.active === true;
          binding.available = true;
          updateTriggers();
          return;
        }
        if (event.data.type === "selection-error") {
          if (ready && retained())
            input().notify(
              "error",
              String(event.data.error || "\u5F15\u7528\u672A\u52A0\u5165\uFF0C\u8BF7\u91CD\u8BD5\u3002")
            );
          return;
        }
        if (event.data.type === "cancel-reference") {
          requests.get(event.data.requestId)?.abort();
          return;
        }
        if (event.data.type !== "reference" || typeof event.data.requestId !== "string")
          return;
        const requestId = event.data.requestId;
        const controller = new AbortController();
        requests.set(requestId, controller);
        const deadline = setTimeout(() => {
          if (!active || controller.signal.aborted) return;
          controller.abort();
          send({ type: "result", requestId, ok: false, error: "\u5F15\u7528\u672A\u52A0\u5165\uFF0C\u8BF7\u91CD\u8BD5\u3002" });
        }, 5e3);
        try {
          if (!ready || !generation || !paired())
            throw Error("\u8BF7\u5148\u6253\u5F00\u5F53\u524D\u9875\u9762\u7684\u5BF9\u8BDD\uFF0C\u518D\u52A0\u5165\u63D0\u95EE\u3002");
          const selected = pageReference(event.data.reference);
          if (!selected) throw Error("\u672A\u8BFB\u5230\u9009\u4E2D\u5185\u5BB9\uFF0C\u8BF7\u91CD\u65B0\u9009\u62E9\u3002");
          const value = {
            ...selected,
            page,
            sessionId,
            surface,
            tool
          };
          const response = await fetch("/api/page-interaction/reference", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ ...value, generation, lease: referenceLease?.() }),
            signal: controller.signal
          });
          const receipt = await response.json();
          if (!active || controller.signal.aborted) return;
          if (!response.ok)
            throw Error(receipt.error || "\u5F15\u7528\u672A\u4FDD\u5B58\uFF0C\u8BF7\u91CD\u8BD5\u3002");
          const bindingResponse = await fetch("/api/page-interaction/binding", {
            cache: "no-store",
            signal: controller.signal
          });
          const currentBinding = await bindingResponse.json();
          if (!active || controller.signal.aborted) return;
          if (!bindingResponse.ok || currentBinding.generation !== generation)
            throw Error("\u767B\u5F55\u8EAB\u4EFD\u5DF2\u53D8\u5316\uFF0C\u8BF7\u91CD\u65B0\u9009\u62E9\u5F15\u7528\u3002");
          if (!ready || !paired())
            throw Error("\u5DF2\u5207\u6362\u5BF9\u8BDD\uFF0C\u8BF7\u5728\u5F53\u524D\u9875\u9762\u91CD\u65B0\u5F15\u7528\u3002");
          const composer = input();
          const state = composer.state.getSnapshot();
          const inserted = composer.insertReference(
            {
              source: REFERENCE_SOURCE,
              ref: JSON.stringify(receipt),
              label: receipt.label,
              appearance: "session",
              clipboardText: serializeReference(receipt)
            },
            {
              start: state.draft.length,
              end: state.draft.length,
              draftRev: state.draftRev
            }
          );
          if (!inserted) throw Error("\u8F93\u5165\u6846\u6B63\u5728\u53D1\u9001\uFF0C\u8BF7\u7A0D\u540E\u518D\u52A0\u5165\u63D0\u95EE\u3002");
          send({ type: "result", requestId: event.data.requestId, ok: true });
        } catch (error) {
          if (!active || controller.signal.aborted) return;
          send({
            type: "result",
            requestId: event.data.requestId,
            ok: false,
            error: error instanceof Error ? error.message : "\u5F15\u7528\u672A\u52A0\u5165\uFF0C\u8BF7\u91CD\u8BD5\u3002"
          });
        } finally {
          clearTimeout(deadline);
          requests.delete(requestId);
        }
      };
      const reloaded = () => {
        if (requests.size) {
          for (const controller of requests.values()) controller.abort();
          requests.clear();
          if (ready && retained()) input().notify("error", "\u9875\u9762\u5DF2\u91CD\u65B0\u52A0\u8F7D\uFF0C\u8BF7\u91CD\u65B0\u9009\u62E9\u5F15\u7528\u3002");
        }
        configure();
      };
      window.addEventListener("message", receive);
      frame.addEventListener("load", reloaded);
      void fetch("/api/page-interaction/binding", { cache: "no-store", signal: bindingRequest.signal }).then(async (response) => {
        const value = await response.json();
        if (!response.ok || typeof value.generation !== "string") throw Error("\u9875\u9762\u5F15\u7528\u8FDE\u63A5\u4E0D\u53EF\u7528\uFF0C\u8BF7\u91CD\u65B0\u6253\u5F00\u9875\u9762\u3002");
        if (!active) return;
        generation = value.generation;
        configure();
      }).catch((error) => {
        if (!active) return;
        if (ready && retained()) input().notify("error", String(error.message));
      });
      const release = () => {
        if (!active) return;
        active = false;
        releases.delete(release);
        bindingRequest.abort();
        bindings.delete(binding);
        updateTriggers();
        for (const controller of requests.values()) controller.abort();
        requests.clear();
        send({ type: "disconnect" });
        window.removeEventListener("message", receive);
        frame.removeEventListener("load", reloaded);
      };
      releases.add(release);
      return release;
    }
  };
  ctx.provide("pageInteraction", api);
  ctx.effect(() => () => {
    disposed = true;
    for (const release of [...releases]) release();
    for (const button of triggers) button.remove();
    triggers.clear();
  });
  ctx.inject(["slots"], (scope) => {
    if (!scope.slots?.inject) return;
    scope.effect(() => scope.slots.inject(
      "conversation.input.left",
      () => scope.slots.register(
        { name: "conversation.input.left", id: "page-selection", order: 50 },
        function SelectionControl({ sessionId }) {
          const anchor = (0, import_react2.useRef)(null);
          (0, import_react2.useEffect)(
            () => anchor.current ? api.mountTrigger(anchor.current, sessionId) : void 0,
            [sessionId]
          );
          return import_react2.default.createElement("span", {
            ref: anchor,
            className: "dspi-composer-trigger"
          });
        }
      )
    ));
    scope.effect(() => {
      const style = document.createElement("style");
      style.textContent = ".dspi-composer-trigger{display:inline-flex;align-items:center}.dspi-composer-trigger button{display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;padding:0;border:0;border-radius:50%;background:transparent;color:var(--dsw-alias-label-secondary,#606977);cursor:pointer}.dspi-composer-trigger button:hover{background:var(--dsw-alias-interactive-bg-hover,#f2f3f5)}.dspi-composer-trigger button[aria-pressed=true]{background:#fff1f1;color:#df1d28}.dspi-composer-trigger button:disabled{opacity:.4;cursor:default}.dspi-composer-trigger button:focus-visible{outline:2px solid #d0132c;outline-offset:2px}.dspi-composer-trigger svg{width:16px;height:16px}";
      document.head.append(style);
      return () => style.remove();
    });
  });
  return api;
}

// src/frame-presenter.tsx
var import_jsx_runtime2 = require("react/jsx-runtime");
var unknownIdentity = { state: "unknown", scope: null, status: null };
var noSubscribe2 = () => () => {
};
function mountFramePresentation(ctx, resources, t, showHistory = () => {
}) {
  let execution;
  const backendListeners = /* @__PURE__ */ new Set();
  ctx.inject(["geaPageExecution"], (scope) => {
    execution = scope.geaPageExecution;
    for (const changed of backendListeners) changed();
    scope.effect(() => () => {
      if (execution === scope.geaPageExecution) {
        execution = void 0;
        for (const changed of backendListeners) changed();
      }
    });
  });
  const interaction = installPageInteraction(ctx);
  const restored = /* @__PURE__ */ new Map();
  ctx.effect(() => () => {
    for (const reference of restored.values()) reference.release();
    restored.clear();
  });
  function Document({ page, SessionProvider, renderSlot }) {
    (0, import_react3.useSyncExternalStore)((listener) => ctx.locale.subscribe(listener), () => ctx.locale.getSnapshot());
    const currentExecution = (0, import_react3.useSyncExternalStore)((listener) => {
      backendListeners.add(listener);
      return () => {
        backendListeners.delete(listener);
      };
    }, () => execution);
    const identity = (0, import_react3.useSyncExternalStore)(currentExecution?.identity.subscribe ?? noSubscribe2, currentExecution?.identity.getSnapshot ?? (() => unknownIdentity));
    const frame = (0, import_react3.useRef)(null);
    const [loaded, setLoaded] = (0, import_react3.useState)(0), [busy, setBusy] = (0, import_react3.useState)(false), [error, setError] = (0, import_react3.useState)("");
    const [view, setView] = (0, import_react3.useState)("split");
    const [selection, setSelection] = (0, import_react3.useState)(() => {
      const reference = restored.get(page.id);
      restored.delete(page.id);
      return reference ? { reference, preset: page.resourceId, ownerScope: execution?.identity.getSnapshot().scope ?? null } : void 0;
    });
    const pending = (0, import_react3.useRef)();
    const connectionTransition = (0, import_react3.useRef)(Promise.resolve());
    const title = typeof page.label === "function" ? page.label() : page.label ?? page.id;
    const src = typeof page.src === "function" ? page.src() : page.src;
    const sendTheme = () => {
      const theme = ctx.theme.getTheme();
      frame.current?.contentWindow?.postMessage({ protocol: "agent-workbench-theme", dark: theme.active.colorScheme === "dark", fontSize: theme.fontSize }, "*");
    };
    (0, import_react3.useEffect)(() => {
      const off = ctx.on("theme/change", sendTheme);
      return () => {
        off();
      };
    }, []);
    (0, import_react3.useEffect)(() => {
      const ready = (event) => {
        if (event.source === frame.current?.contentWindow && event.data?.protocol === "agent-workbench-theme") sendTheme();
      };
      window.addEventListener("message", ready);
      return () => window.removeEventListener("message", ready);
    }, []);
    (0, import_react3.useEffect)(() => () => {
      pending.current?.controller.abort();
      pending.current = void 0;
    }, []);
    (0, import_react3.useEffect)(() => {
      const flight = pending.current;
      if (flight && (flight.scope !== identity.scope || !identity.status?.authenticated)) {
        flight.controller.abort();
        if (pending.current === flight) {
          pending.current = void 0;
          setBusy(false);
        }
      }
      if (selection && (identity.scope !== selection.ownerScope || !identity.status?.authenticated)) {
        setSelection(void 0);
        setError(t("pageChanged"));
      }
    }, [identity.scope, identity.status?.authenticated, selection]);
    (0, import_react3.useEffect)(() => {
      if (!selection) return;
      return () => selection.reference.release();
    }, [selection]);
    (0, import_react3.useEffect)(() => {
      if (page.kind !== "native" || !frame.current) return;
      frame.current.contentWindow?.postMessage({ type: "gea:identity-snapshot", snapshot: identity }, window.location.origin);
      if (loaded && identity.status?.authenticated) page.onVisible?.();
    }, [identity, loaded, page]);
    (0, import_react3.useEffect)(() => {
      if (!selection || !loaded || !frame.current || !currentExecution) return;
      const controller = new AbortController();
      let connection;
      let disposeBridge = () => {
      }, disposeReference = () => {
      }, disposeTheme = () => {
      };
      const target = frame.current;
      const alive = () => !controller.signal.aborted && selection.ownerScope === currentExecution.identity.getSnapshot().scope;
      const setup = connectionTransition.current.then(async () => {
        controller.signal.throwIfAborted();
        connection = await currentExecution.open(page, selection.reference.sessionId, selection.preset, controller.signal);
        if (!alive()) {
          await currentExecution.close(connection);
          connection = void 0;
          return;
        }
        if (page.kind === "html") {
          const bridge = connectHtmlFrame(target, connection, currentExecution, () => ctx.theme.getTheme(), controller.signal, (failure) => {
            if (alive()) {
              setError(failure instanceof Error ? failure.message : String(failure));
              if (connection) void currentExecution.close(connection).catch(() => {
              });
            }
          });
          disposeBridge = bridge;
          const off = ctx.on("theme/change", () => bridge.sendTheme());
          disposeTheme = () => {
            off();
          };
        } else target.contentWindow?.postMessage({ type: "gea:session", sessionId: selection.reference.sessionId, lease: connection.lease }, window.location.origin);
        disposeReference = interaction.bindFrame({ frame: target, reference: selection.reference, page: title, surface: page.kind === "html" ? `gea-html-${page.pluginId}` : "gea-workbench", tool: page.kind === "native" ? "gea_workbench_apply" : void 0, referenceLease: () => connection?.lease });
        setError("");
      });
      connectionTransition.current = setup.catch((failure) => {
        if (alive()) {
          setError(failure instanceof Error ? failure.message : String(failure));
          if (connection) void currentExecution.close(connection).catch(() => {
          });
        }
      });
      return () => {
        controller.abort();
        disposeTheme();
        disposeReference();
        disposeBridge();
        if (page.kind === "native") target.contentWindow?.postMessage({ type: "gea:session", sessionId: null }, window.location.origin);
        connectionTransition.current = setup.catch(() => {
        }).then(async () => {
          if (connection) {
            const owned = connection;
            connection = void 0;
            await currentExecution.close(owned);
          }
        }).catch(() => {
        });
      };
    }, [selection, loaded, currentExecution, page, title]);
    const connect = async () => {
      const host = resources();
      if (!host || !currentExecution || !page.resourceId) {
        setError(t("pageWait"));
        return;
      }
      if (!identity.status?.authenticated) {
        setError(t("pageLogin"));
        return;
      }
      pending.current?.controller.abort();
      const controller = new AbortController();
      const flight = { controller, scope: identity.scope };
      pending.current = flight;
      setBusy(true);
      setError("");
      try {
        const selected = await selectResource(host, page.resourceId, controller.signal, true);
        if (!selected.reference) throw Error(t("pageSessionUnavailable"));
        if (controller.signal.aborted || identity.scope !== currentExecution.identity.getSnapshot().scope) {
          selected.reference.release();
          return;
        }
        setSelection({ reference: selected.reference, preset: selected.preset, ownerScope: identity.scope });
      } catch (failure) {
        if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : String(failure));
      } finally {
        if (pending.current === flight) {
          pending.current = void 0;
          setBusy(false);
        }
      }
    };
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("section", { className: "agent-workbench-ui agent-workbench-document", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("header", { className: "agent-workbench-page-toolbar", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: title }),
        page.resourceId && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", disabled: busy, onClick: () => void connect(), children: busy ? t("pageWorking") : selection ? t("pageNewChat") : t("pageConnect") }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "workbench-conversation-toolbar", role: "toolbar", "aria-label": "\u5BF9\u8BDD\u533A\u89C6\u56FE\u4E0E\u4F1A\u8BDD\u64CD\u4F5C", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { role: "group", "aria-label": "\u533A\u57DF\u663E\u793A\u65B9\u5F0F", children: [["center", "\u4E2D\u95F4\u533A\u57DF\u6700\u5927\uFF0C\u9690\u85CF\u4F1A\u8BDD\u533A", "\u25A6"], ["split", "\u540C\u65F6\u663E\u793A\u4E2D\u95F4\u533A\u57DF\u548C\u4F1A\u8BDD\u533A", "\u25EB"], ["chat", "\u4F1A\u8BDD\u533A\u6700\u5927\uFF0C\u9690\u85CF\u4E2D\u95F4\u533A\u57DF", "\u25A4"]].map(([id, label, icon]) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", "aria-label": label, title: label, "aria-pressed": view === id, onClick: () => setView(id), children: icon }, id)) }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", "aria-label": "\u5386\u53F2\u5BF9\u8BDD", onClick: () => showHistory(page.resourceId ? page.id : void 0), children: "\u25F7" }),
          page.resourceId && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", disabled: busy, "aria-label": "\u65B0\u5EFA\u5BF9\u8BDD", onClick: () => void connect(), children: "\uFF0B" })
        ] })
      ] }),
      error && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { role: "alert", className: "agent-workbench-page-error", children: error }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "agent-workbench-document-body" + (selection ? " with-conversation" : "") + " view-" + view, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("iframe", { ref: frame, title, src, ...page.kind === "html" ? { sandbox: "allow-scripts allow-downloads" } : {}, className: "agent-workbench-html", onLoad: () => {
          setLoaded((value) => value + 1);
          sendTheme();
          if (page.kind === "native") frame.current?.contentWindow?.postMessage({ type: "gea:identity-snapshot", snapshot: identity }, window.location.origin);
          page.onVisible?.();
        } }),
        selection && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("aside", { className: "agent-workbench-native-conversation", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(SessionProvider, { session: selection.reference, children: renderSlot("agent-workbench.conversation", { page: page.id }) }) })
      ] })
    ] });
  }
  ctx.effect(() => ctx.slots.registerFactory({ name: "agent-workbench.document", scope: "root", children: { "agent-workbench.conversation": { kind: "single", scope: "session" } } }, Document));
  ctx.slots.inject("agent-workbench.conversation", () => ctx.slots.register({ name: "agent-workbench.conversation" }, ({ page, useSession, inputActions, renderFactorySlot }) => {
    const blank = useSession((session) => session.blank && !session.running && !session.promptAttempted);
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "workbench-page-conversation", children: [
      blank && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(CompanyWelcome, { page, onFill: (text2) => inputActions.setDraft(text2) }),
      " ",
      renderFactorySlot("conversation.content", { variant: "embedded", phase: "active", hero: false })
    ] });
  }));
  return async (page, id, signal) => {
    const reference = ctx.sessions.retain(id, { source: "agentResourceSelection", signal });
    try {
      await reference.ready;
      signal.throwIfAborted();
      restored.get(page)?.release();
      restored.set(page, reference);
    } catch (error) {
      reference.release();
      throw error;
    }
  };
}

// src/client.ts
var inject = ["slots", "layout", "locale", "theme", "uiWorkspace"];
var zh = { title: "\u5DE5\u4F5C\u53F0", pages: "\u5DF2\u63A5\u5165\u9875\u9762", conversation: "\u539F\u751F\u5BF9\u8BDD", failed: "\u9875\u9762\u76EE\u5F55\u8BFB\u53D6\u5931\u8D25", retry: "\u91CD\u8BD5", empty: "\u6682\u65E0\u5DF2\u63A5\u5165\u9875\u9762", resources: "\u63D0\u793A\u8BCD\u4E0E Skill", start: "\u5F00\u59CB\u65B0\u804A\u5929", useSkill: "\u5728\u65B0\u804A\u5929\u4E2D\u4F7F\u7528", unavailable: "\u4E0D\u53EF\u9009\u7528", missing: "\u5F53\u524D\u4E0D\u53EF\u7528 Skill", resourcesFailed: "\u8D44\u6E90\u6E05\u5355\u8BFB\u53D6\u5931\u8D25\uFF0C\u8BF7\u5237\u65B0\u3002", selectionFailed: "\u8D44\u6E90\u9009\u7528\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5\u3002", resourceWorking: "\u6B63\u5728\u88C5\u8F7D", resourcesRefresh: "\u5237\u65B0\u8D44\u6E90", pageConnect: "\u8FDE\u63A5\u9875\u9762\u4E0E\u539F\u751F\u5BF9\u8BDD", pageNewChat: "\u5F00\u59CB\u65B0\u7684\u9875\u9762\u5BF9\u8BDD", pageWorking: "\u6B63\u5728\u8FDE\u63A5\u2026", pageChanged: "\u767B\u5F55\u8EAB\u4EFD\u5DF2\u53D8\u5316\uFF0C\u8BF7\u91CD\u65B0\u9009\u7528\u9875\u9762\u80FD\u529B\u3002", pageHint: "\u4E1A\u52A1\u8BFB\u53D6\u9700\u767B\u5F55\u5E76\u9009\u7528\u9875\u9762\u80FD\u529B\u3002", pageWait: "\u9875\u9762\u80FD\u529B\u5C1A\u672A\u5C31\u7EEA\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002", pageLogin: "\u8BF7\u5148\u767B\u5F55 GEA\uFF0C\u518D\u8FDE\u63A5\u9875\u9762\u80FD\u529B\u3002", pageSessionUnavailable: "\u9875\u9762\u539F\u751F\u4F1A\u8BDD\u672A\u5C31\u7EEA\u3002" };
var en = { title: "Workbench", pages: "Available pages", conversation: "Conversation", failed: "Page directory unavailable", retry: "Retry", empty: "No pages available", resources: "Prompts and Skills", start: "Start a new chat", useSkill: "Use in a new chat", unavailable: "Unavailable", missing: "Unavailable Skills", resourcesFailed: "Resource list unavailable. Please refresh.", selectionFailed: "Unable to select this resource. Please retry.", resourceWorking: "Loading", resourcesRefresh: "Refresh resources", pageConnect: "Connect page and Conversation", pageNewChat: "Start a new page chat", pageWorking: "Connecting\u2026", pageChanged: "Your identity changed. Select this page resource again.", pageHint: "Business reads require login and a selected page resource.", pageWait: "Page capability is not ready. Please retry shortly.", pageLogin: "Sign in to GEA before connecting this page.", pageSessionUnavailable: "The page Conversation is unavailable." };
function apply(ctx) {
  ctx.effect(() => ctx.locale.register("agentWorkbench", { zh, en }));
  const t = ctx.locale.bind("agentWorkbench");
  ctx.effect(() => {
    const style = document.createElement("style");
    style.dataset.agentWorkbenchTheme = "1.1.0";
    style.textContent = tokens_default;
    document.head.append(style);
    return () => style.remove();
  });
  const workbench = new WorkbenchController({
    panel: (id) => ctx.layout.selectPanel(id),
    hasPanel: (id) => ctx.slots.entries("main").some((entry) => entry.options.key === id),
    frame: (page) => ctx.slots.register({ name: "main", key: page.id }, ({ renderFactorySlot }) => renderFactorySlot("agent-workbench.document", { page }))
  });
  ctx.provide("agentWorkbench", workbench);
  ctx.effect(() => () => workbench.dispose());
  let nativeResources;
  mountNativeResourceSelection(ctx, (host) => {
    nativeResources = host;
  });
  const restorePageSession = mountFramePresentation(ctx, () => nativeResources, (key) => t(key), (page) => workbench.showHistory(page));
  function Resources({ cwd }) {
    const [rows, setRows] = (0, import_react4.useState)([]);
    const [resourceRevision, refreshResources] = (0, import_react4.useState)(0);
    const [error, setError] = (0, import_react4.useState)("");
    const [selectionError, setSelectionError] = (0, import_react4.useState)(false);
    const [busy, setBusy] = (0, import_react4.useState)("");
    const pending = (0, import_react4.useRef)();
    (0, import_react4.useEffect)(() => {
      const lifetime = new AbortController();
      void resourceWorkspace(fetch, lifetime.signal, cwd).then((path) => fetch("/api/agent-manage/resources?" + new URLSearchParams({ cwd: path }), { signal: lifetime.signal, cache: "no-store" })).then(async (response) => {
        if (!response.ok) throw Error(`HTTP ${response.status}`);
        const value = await response.json();
        lifetime.signal.throwIfAborted();
        setRows(value);
        setError("");
      }).catch((failure) => {
        if (!lifetime.signal.aborted) {
          console.error("[agent-workbench] resource list failed", failure);
          setSelectionError(false);
          setError(String(failure));
        }
      });
      return () => {
        lifetime.abort();
        pending.current?.abort();
      };
    }, [resourceRevision, cwd]);
    const choose = async (id) => {
      pending.current?.abort();
      const controller = new AbortController();
      pending.current = controller;
      setBusy(id);
      setError("");
      try {
        if (!nativeResources) throw Error(t("unavailable"));
        await selectResource(nativeResources, id, controller.signal, false, cwd);
      } catch (failure) {
        if (!controller.signal.aborted) {
          console.error("[agent-workbench] resource selection failed", { id, error: failure instanceof Error ? failure.message : String(failure) });
          setSelectionError(true);
          setError(String(failure));
        }
      } finally {
        if (!controller.signal.aborted) setBusy("");
      }
    };
    return import_react4.default.createElement(
      "details",
      { className: "workbench-resources" },
      import_react4.default.createElement("summary", null, t("resources")),
      import_react4.default.createElement("button", { type: "button", disabled: Boolean(busy), onClick: () => refreshResources((value) => value + 1) }, t("resourcesRefresh")),
      error ? import_react4.default.createElement("p", { role: "alert" }, selectionError ? t("selectionFailed") : t("resourcesFailed")) : null,
      ...rows.map((row) => import_react4.default.createElement(
        "div",
        { key: row.id },
        import_react4.default.createElement("button", { type: "button", disabled: !row.enabled || Boolean(busy), onClick: () => void choose(row.id) }, row.label + " \xB7 " + (busy === row.id ? t("resourceWorking") : !row.enabled ? t("unavailable") : row.kind === "skill" ? t("useSkill") : t("start"))),
        row.missingSkills?.length ? import_react4.default.createElement("p", null, t("missing") + ": " + row.missingSkills.join(", ")) : null,
        row.error ? import_react4.default.createElement("p", { role: "alert" }, row.error) : null
      ))
    );
  }
  mountCompanyUI(ctx, workbench, Resources, restorePageSession);
  let discoveryError = "";
  let discoveryRevision = 0;
  const listeners = /* @__PURE__ */ new Set();
  let retry = () => {
  };
  const notify = () => {
    discoveryRevision++;
    for (const listener of listeners) listener();
  };
  function DiscoveryNotice() {
    import_react4.default.useSyncExternalStore((listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }, () => discoveryRevision);
    return discoveryError ? import_react4.default.createElement("p", { role: "alert" }, t("failed") + ": " + discoveryError, " ", import_react4.default.createElement("button", { onClick: () => retry() }, t("retry"))) : null;
  }
  ctx.slots.inject("shell.overlay", () => ctx.slots.register({ name: "shell.overlay", id: "workbench-page-discovery" }, DiscoveryNotice));
  ctx.effect(() => {
    const controller = new AbortController();
    const registered = /* @__PURE__ */ new Set();
    const cleanup = [];
    let loading = false;
    const discover = async () => {
      if (loading || controller.signal.aborted) return;
      loading = true;
      try {
        const response = await fetch("/api/agent-workbench/pages", { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw Error(`HTTP ${response.status}`);
        const pages = await response.json();
        controller.signal.throwIfAborted();
        for (const page of pages) {
          if (registered.has(page.id)) continue;
          registered.add(page.id);
          ctx.slots.inject("main", () => {
            if (controller.signal.aborted) return () => {
            };
            const dispose = workbench.registerFrame({ id: page.id, label: page.name, src: page.url, kind: "html", pluginId: page.pluginId, resourceId: page.resourceId });
            cleanup.push(dispose);
            return dispose;
          });
        }
        discoveryError = "";
      } catch (error) {
        if (!controller.signal.aborted) discoveryError = error instanceof Error ? error.message : String(error);
      } finally {
        loading = false;
        if (!controller.signal.aborted) notify();
      }
    };
    retry = () => {
      void discover();
    };
    void discover();
    return () => {
      controller.abort();
      retry = () => {
      };
      for (const dispose of cleanup) dispose();
    };
  });
}

return module.exports;}});
