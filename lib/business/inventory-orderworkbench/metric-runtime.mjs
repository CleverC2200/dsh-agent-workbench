var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// business/shared/query-error.js
function sqlQueryError(cause) {
  if (cause?.name === "AbortError") return cause;
  if (cause?.code === "GEA_SQL_DISPLAY_ERROR") return cause;
  const code = [cause?.code, cause?.errorCode, cause?.failure?.reasonCode].filter(Boolean).join(" ");
  const message = String(cause?.message ?? "");
  const denied = /(?:DATA_PERMISSION_DENIED|RETURN_PERMISSION_DENIED|NO_RETURN_COLUMN_ALLOWED|ACCESS_DENIED)/.test(
    code + " " + message
  );
  const expired = /(?:SESSION_(?:EXPIRED|REJECTED|NOT_FOUND|MAX_LIFETIME_EXCEEDED)|会话已失效)/.test(
    code + " " + message
  );
  const tenantDatasetDisabled = /AUTHORIZATION_REWRITE/.test(code + " " + message) && /数据表不在当前租户启用数据集范围内|当前租户(?:尚未|未)启用此数据集/.test(message);
  const unavailable = /(?:RESOURCE_NOT_IN_DATASET|RESOURCE_NOT_PUBLISHED|FIELD_NOT_PUBLISHED)/.test(
    code + " " + message
  );
  const error = new Error(
    denied ? DATA_PERMISSION_MESSAGE : expired ? "\u6570\u636E\u4F1A\u8BDD\u5DF2\u5931\u6548\uFF0C\u8BF7\u5237\u65B0\u9875\u9762\u91CD\u8BD5" : tenantDatasetDisabled ? "\u5F53\u524D\u79DF\u6237\u5C1A\u672A\u542F\u7528\u6B64\u6570\u636E\u96C6\uFF0C\u8BF7\u8054\u7CFB\u7BA1\u7406\u5458\u542F\u7528\uFF1B\u6682\u65F6\u65E0\u6CD5\u8BFB\u53D6\uFF0C\u4E0D\u80FD\u5224\u65AD\u6570\u636E\u662F\u5426\u4E3A\u7A7A\u3002" : unavailable ? "\u5F53\u524D\u73AF\u5883\u6240\u9700\u6570\u636E\u6E90\u6216\u5B57\u6BB5\u5C1A\u672A\u53D1\u5E03\u6216\u6388\u6743\uFF0C\u8BF7\u8054\u7CFB\u7BA1\u7406\u5458\u6838\u5BF9\uFF1B\u6682\u65F6\u65E0\u6CD5\u8BFB\u53D6\uFF0C\u4E0D\u80FD\u5224\u65AD\u6570\u636E\u662F\u5426\u4E3A\u7A7A\u3002" : "\u6570\u636E\u8BFB\u53D6\u5931\u8D25\uFF0C\u8BF7\u5237\u65B0\u91CD\u8BD5\uFF1B\u82E5\u4ECD\u5931\u8D25\uFF0C\u8BF7\u67E5\u770B\u63A5\u53E3\u9519\u8BEF\u8BE6\u60C5",
    { cause }
  );
  error.code = "GEA_SQL_DISPLAY_ERROR";
  return error;
}
var DATA_PERMISSION_MESSAGE;
var init_query_error = __esm({
  "business/shared/query-error.js"() {
    "use strict";
    DATA_PERMISSION_MESSAGE = "\u5F53\u524D\u8D26\u53F7\u6682\u65E0\u6570\u636E\u6743\u9650";
  }
});

// business/shared/channel.js
var channel_exports = {};
__export(channel_exports, {
  action: () => action,
  ask: () => ask,
  call: () => call,
  currentSessionId: () => currentSessionId,
  draft: () => draft,
  publish: () => publish,
  ready: () => ready,
  reportElements: () => reportElements
});
function cancelActions() {
  for (const task of applying.values()) task.abort();
  for (const task of invoking.values()) task.controller.abort();
}
function reportCatalog() {
  if (!channel || !context?.session) return;
  channel.postMessage({
    type: "catalog",
    session: context.session,
    elements: [...pageGroups.values()].flatMap((group) => group.elements)
  });
}
function reportElements(key, elements, apply) {
  const group = { elements, apply };
  pageGroups.set(key, group);
  reportCatalog();
  return () => {
    if (pageGroups.get(key) !== group) return;
    pageGroups.delete(key);
    reportCatalog();
  };
}
function currentSessionId() {
  return context?.session;
}
function parentOrigin() {
  try {
    const url = new URL(document.referrer || window.location.href);
    if (!url.host) return void 0;
    if (url.origin !== "null") return url.origin;
    return url.protocol === "dsh-app:" && url.host === "app" ? "dsh-app://app" : void 0;
  } catch {
    return void 0;
  }
}
async function call(method, parameters = {}, options = {}) {
  options.signal?.throwIfAborted();
  if (!channel || !context?.session) throw Error("\u9875\u9762\u80FD\u529B\u5C1A\u672A\u8FDE\u63A5\uFF0C\u8BF7\u67E5\u770B\u9875\u9762\u8FDE\u63A5\u63D0\u793A\u540E\u91CD\u8BD5\u3002");
  const session = context.session;
  const id = String(++sequence);
  return new Promise((resolve, reject) => {
    const cleanup = () => options.signal?.removeEventListener("abort", abort);
    const abort = () => {
      if (!pending.delete(id)) return;
      clearTimeout(timer);
      cleanup();
      channel.postMessage({ type: "cancel", id, session });
      reject(options.signal.reason ?? Error("\u8BF7\u6C42\u5DF2\u53D6\u6D88"));
    };
    const timer = setTimeout(() => {
      pending.delete(id);
      cleanup();
      channel.postMessage({ type: "cancel", id, session });
      const error = Error("\u4E1A\u52A1\u8BF7\u6C42\u8D85\u65F6");
      reject(method === "sql" ? sqlQueryError(error) : error);
    }, 12e4);
    pending.set(id, { resolve, reject, timer, method, cleanup });
    options.signal?.addEventListener("abort", abort, { once: true });
    channel.postMessage({
      type: "request",
      id,
      method,
      parameters,
      session
    });
  });
}
function action(name, description, handler) {
  handlers.set(name, handler);
  const release = name === "refresh" ? reportElements(
    "refresh",
    [{ id: "control:refresh", role: "control", label: description, actions: ["invoke"] }],
    (args, signal) => {
      if (args.kind !== "invoke") throw Error("ACTION_NOT_ALLOWED");
      return handler({}, { signal });
    }
  ) : void 0;
  void ready.then(() => {
    if (handlers.get(name) === handler && context?.session)
      channel.postMessage({ type: "register", name, description, session: context.session });
  });
  return () => {
    if (handlers.get(name) === handler) handlers.delete(name);
    for (const task of invoking.values()) if (task.handler === handler) task.controller.abort();
    release?.();
  };
}
function ask(text, context2, options) {
  return call("conversation", { text, context: context2 }, options);
}
function publish(context2, options) {
  return call("context", context2, options);
}
function draft(text, options) {
  return call("draft", { text }, options);
}
var context, channel, sequence, pending, handlers, appliedThemeTokens, pageGroups, applying, invoking, readyResolve, ready;
var init_channel = __esm({
  "business/shared/channel.js"() {
    "use strict";
    init_query_error();
    sequence = 0;
    pending = /* @__PURE__ */ new Map();
    handlers = /* @__PURE__ */ new Map();
    appliedThemeTokens = [];
    pageGroups = /* @__PURE__ */ new Map();
    applying = /* @__PURE__ */ new Map();
    invoking = /* @__PURE__ */ new Map();
    ready = new Promise((resolve) => {
      readyResolve = resolve;
    });
    window.addEventListener("message", (event) => {
      if (event.source === window.parent && event.data?.protocol === "gea-html-v2" && event.data.type === "request-ready") {
        window.parent.postMessage({ protocol: "gea-html-v2", type: "ready" }, "*");
        return;
      }
      if (event.source !== window.parent || event.origin !== parentOrigin() || typeof event.data?.context?.session !== "string" || typeof event.data?.context?.plugin !== "string" || event.data?.protocol !== "gea-html-v2" || event.data?.type !== "connect" || !event.ports[0] || channel === event.ports[0])
        return;
      if (channel) {
        window.dispatchEvent(new Event("gea-session-changing"));
        channel.close();
        cancelActions();
        for (const item of pending.values()) {
          clearTimeout(item.timer);
          item.cleanup?.();
          item.reject(Error("\u9875\u9762\u4F1A\u8BDD\u5DF2\u5207\u6362\uFF0C\u8BF7\u91CD\u65B0\u64CD\u4F5C"));
        }
        pending.clear();
      }
      context = event.data.context;
      const port = event.ports[0];
      channel = port;
      port.onmessage = (event2) => {
        if (channel !== port) return;
        const message = event2.data;
        if (message.type === "context") {
          const previousSession = context?.session;
          if (previousSession && previousSession !== message.context?.session) {
            window.dispatchEvent(new Event("gea-session-changing"));
            for (const [id, item] of pending) {
              clearTimeout(item.timer);
              item.cleanup?.();
              item.reject(Error("\u9875\u9762\u4F1A\u8BDD\u5DF2\u5207\u6362\uFF0C\u8BF7\u91CD\u65B0\u64CD\u4F5C"));
              channel.postMessage({ type: "cancel", id, session: previousSession });
            }
            pending.clear();
          }
          cancelActions();
          context = message.context;
          reportCatalog();
          if (context?.session)
            channel.postMessage({
              type: "theme:subscribe",
              session: context.session
            });
          if (context?.session && previousSession !== context.session)
            window.dispatchEvent(new Event("gea-session-changed"));
        }
        if (message.type === "theme" && context && message.context?.session === context.session && message.context?.plugin === context.plugin) {
          if (message.version !== "1.1.1" || !["light", "dark"].includes(message.colorScheme) || !message.tokens || !Number.isInteger(message.fontSize) || message.fontSize < 12 || message.fontSize > 17 || Object.entries(message.tokens).some(
            ([name, value]) => !/^--dsw-[a-z0-9-]+$/.test(name) || typeof value !== "string" || value.length > 500
          )) {
            document.getElementById("app").textContent = "\u5171\u4EAB\u6837\u5F0F\u7248\u672C\u4E0D\u517C\u5BB9\uFF0C\u8BF7\u91CD\u65B0\u6253\u5F00\u9875\u9762";
            return;
          }
          for (const name of appliedThemeTokens) document.body.style.removeProperty(name);
          appliedThemeTokens = Object.keys(message.tokens);
          for (const [name, value] of Object.entries(message.tokens))
            document.body.style.setProperty(name, value);
          document.body.style.setProperty("--workbench-font-size", `${message.fontSize}px`);
          document.body.style.setProperty("--dsh-content-font-size", `${message.fontSize}px`);
          document.documentElement.style.colorScheme = message.colorScheme;
          document.body.toggleAttribute("data-ds-dark-theme", message.colorScheme === "dark");
        }
        if (message.type === "response") {
          const item = pending.get(message.id);
          if (!item) return;
          pending.delete(message.id);
          clearTimeout(item.timer);
          item.cleanup?.();
          if (message.error) {
            const error = item.method === "sql" ? sqlQueryError(Error(message.error)) : Error(message.error);
            if (item.method === "sql" || item.method === "workspace")
              window.dispatchEvent(
                new CustomEvent("gea-query-warning", {
                  detail: { message: error.message.slice(0, 600) }
                })
              );
            item.reject(error);
          } else item.resolve(message.result);
        }
        if (message.type === "cancel" && message.session === context?.session) {
          applying.get(message.toolCallId)?.abort();
          invoking.get(message.id)?.controller.abort();
        }
        if (message.type === "apply" && message.session === context?.session) {
          const session = context.session;
          const task = new AbortController();
          applying.set(message.toolCallId, task);
          Promise.resolve().then(async () => {
            const args = message.args;
            const targets = args?.targets ?? [args?.target];
            if (!Array.isArray(targets) || !targets.length) throw Error("MISSING_TARGET");
            for (const target of targets) {
              task.signal.throwIfAborted();
              if (context?.session !== session) throw Error("PAGE_SESSION_CHANGED");
              const group = [...pageGroups.values()].find(
                (group2) => group2.elements.some((element2) => element2.id === target)
              );
              const element = group?.elements.find((element2) => element2.id === target);
              if (!element || !group.apply) throw Error("ELEMENT_GONE");
              if (args.kind === "setValue" && !element.editable) throw Error("ELEMENT_READ_ONLY");
              if (args.kind === "invoke" && !element.actions?.includes(args.action ?? "invoke"))
                throw Error("ACTION_NOT_ALLOWED");
              if (!["setValue", "invoke", "select", "clear"].includes(args.kind))
                throw Error("INVALID_PAGE_ACTION");
              await group.apply({ ...args, target }, task.signal);
            }
            task.signal.throwIfAborted();
            if (context?.session !== session) throw Error("PAGE_SESSION_CHANGED");
            return { applied: true };
          }).catch((error) => ({ applied: false, error: error.message })).then((result) => {
            if (applying.get(message.toolCallId) === task) applying.delete(message.toolCallId);
            if (channel !== port) return;
            port.postMessage({
              type: "applied",
              toolCallId: message.toolCallId,
              session,
              ...result
            });
            reportCatalog();
          });
        }
        if (message.type === "invoke" && message.session === context?.session) {
          const handler = handlers.get(message.name);
          const session = context.session, ownerChannel = channel;
          const controller = new AbortController();
          invoking.set(message.id, { controller, handler });
          Promise.resolve().then(async () => {
            if (!handler) throw Error("\u9875\u9762\u672A\u6CE8\u518C\u8BE5\u64CD\u4F5C");
            controller.signal.throwIfAborted();
            const result = await handler(message.arguments, { signal: controller.signal });
            controller.signal.throwIfAborted();
            if (context?.session !== session) throw Error("PAGE_SESSION_CHANGED");
            return result;
          }).then(
            (result) => ownerChannel.postMessage({ type: "invoked", id: message.id, session, result }),
            (error) => ownerChannel.postMessage({
              type: "invoked",
              id: message.id,
              session,
              error: error.message
            })
          ).finally(() => {
            if (invoking.get(message.id)?.controller === controller) invoking.delete(message.id);
          });
        }
        if (message.type === "identity-changed") {
          cancelActions();
          context = null;
          for (const item of pending.values()) {
            clearTimeout(item.timer);
            item.cleanup?.();
            item.reject(Error("\u767B\u5F55\u8EAB\u4EFD\u5DF2\u53D8\u5316\uFF0C\u8BF7\u91CD\u65B0\u52A0\u8F7D"));
          }
          pending.clear();
          window.dispatchEvent(new Event("gea-identity-changed"));
        }
      };
      channel.start();
      reportCatalog();
      channel.postMessage({ type: "theme:subscribe", session: context.session });
      readyResolve(event.data.context);
      window.dispatchEvent(new Event("gea-session-changed"));
    });
    window.parent.postMessage({ protocol: "gea-html-v2", type: "ready" }, "*");
  }
});

// prototypes/inventory-orderworkbench/metric-sections.mjs
var changeKinds = { \u4F5C\u5E9F\u7387: "1", \u6539\u5355\u7387: "2" };
function metricSection(period, id, metric) {
  const part = period?.sections?.find((part2) => part2.id === id);
  return id === "changes" && part?.parts && changeKinds[metric] ? part.parts.find((item) => item.id === changeKinds[metric]) : part;
}
function readySectionRows(period, id) {
  const part = metricSection(period, id);
  return part?.parts ? part.parts.filter((item) => item.status === "ready").flatMap((item) => item.rows) : part?.status === "ready" ? part.rows : [];
}
function changesSection(parts) {
  const failed = parts.find((part) => part.status === "error");
  return {
    id: "changes",
    status: parts.some((part) => part.status === "loading") ? "loading" : failed ? "error" : "ready",
    ...failed ? { code: failed.code, detail: failed.detail } : {},
    rows: parts.filter((part) => part.status === "ready").flatMap((part) => part.rows),
    parts: parts.map((part) => ({ ...part }))
  };
}

// prototypes/inventory-orderworkbench/change-partitions.mjs
var sums = [
  "numerator",
  "denominator",
  "records",
  "invalid",
  "sample_numerator",
  "sample_denominator",
  "sample_records",
  "unknown_quantity"
];
function mergeCancellationPartitions(partitions) {
  if (partitions.length !== 2 || partitions.some((rows) => !Array.isArray(rows)))
    throw Error("CANCELLATION_PARTITIONS_INCOMPLETE");
  const groups = /* @__PURE__ */ new Map();
  for (const rows of partitions)
    for (const row of rows) {
      if (String(row.kind) !== "1") throw Error("INVALID_CANCELLATION_PARTITION_ROW");
      for (const field of sums)
        if (row[field] !== null && (row[field] === void 0 || row[field] === "" || !Number.isFinite(Number(row[field]))))
          throw Error("INVALID_CANCELLATION_PARTITION_QUANTITY");
      const key = JSON.stringify([row.period_index ?? null, row.kind, row.region, row.province]);
      if (!groups.has(key)) {
        groups.set(key, { ...row });
        continue;
      }
      const combined = groups.get(key);
      for (const field of sums) {
        const a = combined[field], b = row[field];
        combined[field] = ["numerator", "denominator"].includes(field) && (a === null || b === null) || a === null && b === null ? null : Number(a ?? 0) + Number(b ?? 0);
      }
    }
  return [...groups.values()];
}

// prototypes/inventory-orderworkbench/query-retry.mjs
function transient(error) {
  const reasons = [];
  for (let cause = error, depth = 0; cause && depth < 5; cause = cause.cause, depth++)
    reasons.push(cause.code, cause.errorCode, cause.failure?.reasonCode, cause.message);
  const text = reasons.filter(Boolean).join(" ");
  return !/PERMISSION|DENIED|NOT_PUBLISHED|NOT_IN_DATASET|SESSION_|IDENTITY_|AUTHORIZATION|RESULT_INCOMPLETE|INVALID_/.test(
    text
  ) && /\bGEA_SQL_(?:UNAVAILABLE|QUERY_TIMEOUT)\b/.test(text);
}
async function readWithTransientRetry(read, signal, delayMs = 750) {
  try {
    return await read();
  } catch (error) {
    signal?.throwIfAborted();
    if (!transient(error)) throw error;
    await new Promise((resolve, reject) => {
      const cleanup = () => signal?.removeEventListener("abort", abort);
      const abort = () => {
        clearTimeout(timer);
        cleanup();
        reject(signal.reason);
      };
      const timer = setTimeout(() => {
        cleanup();
        resolve();
      }, delayMs);
      signal?.addEventListener("abort", abort, { once: true });
    });
    signal?.throwIfAborted();
    return read();
  }
}

// prototypes/inventory-orderworkbench/period-attributions.mjs
function collectDirectorMembers(rows) {
  const groups = /* @__PURE__ */ new Map();
  for (const row of rows) {
    const key = JSON.stringify([row.base, row.sku]);
    if (!groups.has(key)) groups.set(key, { base: row.base, sku: row.sku, director: row.director, directors: /* @__PURE__ */ new Set(), items: /* @__PURE__ */ new Set() });
    const group = groups.get(key);
    if (group.director !== row.director) throw Object.assign(Error("\u603B\u76D1\u6620\u5C04\u5728\u8BFB\u53D6\u671F\u95F4\u53D1\u751F\u53D8\u5316"), { code: "SOURCE_CHANGED" });
    if (row.director_value !== null) group.directors.add(row.director_value);
    if (row.item_value !== null) group.items.add(row.item_value);
  }
  return [...groups.values()].map((group) => {
    const directors = [...group.directors], items = [...group.items];
    if (directors.length === 0 && group.director !== null || directors.length > 0 && !group.directors.has(group.director))
      throw Object.assign(Error("\u603B\u76D1\u6620\u5C04\u6210\u5458\u4E0D\u5B8C\u6574"), { code: "RESULT_INCOMPLETE" });
    return {
      base: group.base,
      sku: group.sku,
      director: group.director,
      names: directors.length,
      directors,
      item: items.length === 1 ? items[0] : null,
      items: items.length
    };
  });
}
function applyPeriodAttributions(sections, mappings, sharedItems = []) {
  const byKey = new Map(mappings.filter((row) => row.base && row.sku).map((row) => [JSON.stringify([row.base, row.sku]), row]));
  const bySku = new Map(sharedItems.map((row) => [row.sku, row]));
  const observed = /* @__PURE__ */ new Map();
  for (const part of sections.filter((part2) => ["orders", "stock"].includes(part2.id)))
    for (const row of part.rows) {
      if (!row.base || !row.sku) continue;
      const key = JSON.stringify([row.base, row.sku]);
      if (!observed.has(key)) observed.set(key, /* @__PURE__ */ new Set());
      if (row.item) observed.get(key).add(row.item);
    }
  for (const section of sections.filter((part) => ["orders", "stock", "ages"].includes(part.id))) {
    for (const row of section.rows) {
      const key = JSON.stringify([row.base, row.sku]);
      const mapping = byKey.get(key);
      const candidates = observed.get(key);
      const shared = bySku.get(row.sku);
      const item = Number(mapping?.items) > 1 ? null : Number(mapping?.items) === 1 ? mapping.item : shared ? Number(shared.names) === 1 ? shared.item : null : candidates?.size === 1 ? [...candidates][0] : null;
      if (section.id === "ages") row.item = item;
      else if (!row.item) row.item = item;
      row.director = Number(mapping?.names) === 1 ? mapping.director : null;
      row.names = Number(mapping?.names) === 1 ? 1 : 0;
      row.periodAttribution = true;
    }
  }
}

// business/shared/query-scheduler.js
var runningQueries = 0;
var waitingQueries = [];
var queueTimer;
function drainQueries() {
  if (queueTimer) return;
  queueTimer = setTimeout(() => {
    queueTimer = void 0;
    while (waitingQueries.length && runningQueries < waitingQueries[0].concurrency)
      waitingQueries.shift()();
  }, 0);
}
function scheduledQuery(task, signal, priority = 0, concurrency = 4, batchStart = false) {
  return new Promise((resolve, reject) => {
    const abort = () => {
      const index2 = waitingQueries.indexOf(start);
      if (index2 >= 0) waitingQueries.splice(index2, 1);
      reject(signal.reason);
    };
    const start = () => {
      signal?.removeEventListener("abort", abort);
      runningQueries++;
      Promise.resolve().then(() => {
        signal?.throwIfAborted();
        return task();
      }).then(resolve, reject).finally(() => {
        runningQueries--;
        drainQueries();
      });
    };
    if (signal?.aborted) return reject(signal.reason);
    if (!batchStart && runningQueries < concurrency && waitingQueries.length === 0) {
      start();
      return;
    }
    start.priority = priority;
    start.concurrency = concurrency;
    const index = waitingQueries.findIndex((job) => job.priority < priority);
    if (index < 0) waitingQueries.push(start);
    else waitingQueries.splice(index, 0, start);
    signal?.addEventListener("abort", abort, { once: true });
    drainQueries();
  });
}

// business/shared/configured-query-client.mjs
var own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
var immutableRegistries = /* @__PURE__ */ new WeakSet();
function immutableQueryConfig(config) {
  if (immutableRegistries.has(config)) return config;
  const snapshot = structuredClone(config);
  const freeze = (value) => {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return;
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  };
  freeze(snapshot);
  immutableRegistries.add(snapshot);
  return snapshot;
}
var QueryContractError = class extends Error {
  constructor(code, message, metadata = {}) {
    super(message);
    this.name = "QueryContractError";
    this.code = code;
    Object.assign(this, metadata);
  }
};
var fail = (code, message, metadata) => {
  throw new QueryContractError(code, message, metadata);
};
function query(config, id) {
  if (!own(config.queries, id)) fail("QUERY_NOT_REGISTERED", `\u672A\u767B\u8BB0\u67E5\u8BE2\uFF1A${id}`);
  return config.queries[id];
}
function validDate(value, format) {
  const pattern = format === "YYYYMM" ? /^\d{6}$/ : format === "YYYYMMDD" ? /^\d{8}$/ : /^\d{4}-\d{2}-\d{2}$/;
  if (!pattern.test(value)) return false;
  const compact = value.replaceAll("-", "");
  const iso = `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8) || "01"}`;
  const at = /* @__PURE__ */ new Date(iso + "T00:00:00Z");
  return Number.isFinite(at.valueOf()) && at.toISOString().slice(0, 10) === iso && (format !== "YYYY-MM-01" || iso.endsWith("-01"));
}
function makeRequest(config, id, values) {
  const q = query(config, id), specs = q.parameterSpec;
  const names = Object.values(specs).map((s) => s.name);
  if (!values || Object.keys(values).length !== names.length || names.some((n) => !own(values, n)))
    fail("PARAMETER_MISMATCH", "\u5FC5\u987B\u5B8C\u6574\u63D0\u4F9B\u914D\u7F6E\u4E2D\u7684\u4E1A\u52A1\u53C2\u6570\uFF0C\u4E14\u4E0D\u80FD\u9644\u52A0\u8EAB\u4EFD\u3001\u6570\u636E\u6E90\u6216SQL");
  const parameters = {};
  for (const [key, s] of Object.entries(specs)) {
    const v = values[s.name];
    if (v === null) {
      if (!s.nullable) fail("PARAMETER_TYPE_MISMATCH", `${s.name}\u4E0D\u53EF\u4E3A\u7A7A`);
    } else {
      const types = {
        string: () => typeof v === "string" && v.length <= 600,
        integer: () => Number.isSafeInteger(v),
        boolean: () => typeof v === "boolean",
        array: () => Array.isArray(v) && v.length > 0 && v.length <= 200 && v.every((x) => typeof x === "string" && x.length <= 255)
      };
      if (!types[s.type]?.() || s.enum && !s.enum.includes(v) || s.minimum !== void 0 && v < s.minimum || s.maximum !== void 0 && v > s.maximum)
        fail("PARAMETER_TYPE_MISMATCH", `\u53C2\u6570\u65E0\u6548\uFF1A${s.name}`);
      if (["YYYY-MM-DD", "YYYY-MM-01", "YYYYMMDD", "YYYYMM"].includes(s.format) && !validDate(v, s.format))
        fail("PARAMETER_TYPE_MISMATCH", `\u65E5\u671F\u65E0\u6548\uFF1A${s.name}`);
    }
    parameters[key] = structuredClone(v);
  }
  for (const [name, value] of Object.entries(values))
    if (name.endsWith("_mode") && value === "equal" && values[name.slice(0, -5)] == null)
      fail("PARAMETER_TYPE_MISMATCH", `equal\u6A21\u5F0F\u7F3A\u5C11\u503C\uFF1A${name}`);
  for (const [start, end] of [
    ["start", "end_exclusive"],
    ["start_month", "end_month_exclusive"],
    ["delivery_start", "delivery_end_exclusive"]
  ])
    if (own(values, start) && own(values, end) && !(values[start] < values[end]))
      fail("INVALID_PERIOD", "\u65E5\u671F\u8303\u56F4\u987B\u5DE6\u95ED\u53F3\u5F00");
  if (own(values, "stock_date") && values.stock_date.slice(0, 7) !== (values.stock_month ?? values.month).slice(0, 7))
    fail("INVALID_PERIOD", "\u5E93\u5B58\u65E5\u5FC5\u987B\u5C5E\u4E8E\u914D\u7F6E\u7684\u5E93\u5B58\u6708\u4EFD");
  if (id.startsWith("orders.active_customers") && (values.date_basis !== "created" || (Date.parse(values.end_exclusive) - Date.parse(values.start)) / 864e5 !== 30))
    fail("INVALID_PERIOD", "\u6D3B\u8DC3\u5BA2\u6237\u4F7F\u7528created\u8FD130\u65E5\u8303\u56F4");
  if (id.startsWith("plan_execution.")) {
    const d = /* @__PURE__ */ new Date(values.month + "T00:00:00Z");
    d.setUTCMonth(d.getUTCMonth() + 1);
    if (values.delivery_start !== values.month.replaceAll("-", "") || values.delivery_end_exclusive !== values.order_end_exclusive.replaceAll("-", "") || !(values.month < values.order_end_exclusive && values.order_end_exclusive <= d.toISOString().slice(0, 10)))
      fail("INVALID_PERIOD", "\u8BA1\u5212\u6267\u884C\u987B\u540C\u6708\u6708\u521D\u8D77\uFF0C\u8BA2\u5355\u548C\u4EA4\u8D27\u622A\u6B62\u65E5\u4E00\u81F4");
  }
  if (id.startsWith("base_plan_execution.")) {
    const d = /* @__PURE__ */ new Date(values.month + "T00:00:00Z");
    d.setUTCMonth(d.getUTCMonth() + 1);
    const next = d.toISOString().slice(0, 10).replaceAll("-", "");
    if (values.delivery_start !== values.month.replaceAll("-", "") || values.delivery_end_exclusive > next)
      fail("INVALID_PERIOD", "\u57FA\u5730\u8BA1\u5212\u6267\u884C\u987B\u4ECE\u672C\u6708\u6708\u521D\u8D77\uFF0C\u4EA4\u8D27\u622A\u6B62\u4E0D\u8DE8\u6708");
  }
  if (q.request.cube) {
    const bind = (value) => {
      if (Array.isArray(value)) return value.map(bind);
      if (value && typeof value === "object") {
        if (Object.keys(value).length === 1 && own(value, "$parameter")) {
          if (!own(parameters, value.$parameter)) fail("PARAMETER_MISMATCH", "Cube\u53C2\u6570\u672A\u767B\u8BB0");
          return structuredClone(parameters[value.$parameter]);
        }
        if (Object.keys(value).length === 1 && own(value, "$monthRange")) {
          const start = parameters[value.$monthRange];
          if (typeof start !== "string" || !validDate(start, "YYYY-MM-01"))
            fail("INVALID_PERIOD", "Cube\u67E5\u8BE2\u5FC5\u987B\u9650\u5B9A\u5355\u6708");
          const end = /* @__PURE__ */ new Date(start + "T00:00:00Z");
          end.setUTCMonth(end.getUTCMonth() + 1);
          end.setUTCDate(0);
          return [start, end.toISOString().slice(0, 10)];
        }
        return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, bind(child)]));
      }
      return value;
    };
    return { cube: bind(q.request.cube) };
  }
  return { sql: q.request.sql, parameters, includeTotal: false };
}
function requireColumns(result, columns) {
  const rejected = new Set(
    (result.rejectedColumns || []).map(
      (c) => typeof c === "string" ? c : c.outputAlias ?? c.alias ?? c.name ?? c.columnName
    )
  );
  const returned = result.returnedColumns?.map(
    (c) => typeof c === "string" ? c : c.outputAlias ?? c.alias ?? c.name ?? c.columnName
  );
  const missing = columns.filter(
    (c) => rejected.has(c) || returned && !returned.includes(c) || result.rows.some((r) => !own(r, c))
  );
  if (missing.length)
    fail("REQUIRED_COLUMN_UNAVAILABLE", `\u6240\u9700\u5B57\u6BB5\u4E0D\u53EF\u7528\uFF1A${missing.join(", ")}`, {
      missingColumns: missing,
      returnedColumns: result.returnedColumns,
      rejectedColumns: result.rejectedColumns
    });
}
function createQueryClient(config, execute) {
  config = immutableRegistries.has(config) ? config : structuredClone(config);
  const concurrency = [
    "inventory-apsplan",
    "inventory-aqkc",
    "inventory-fc",
    "inventory-qll"
  ].includes(config.agentId) ? 2 : config.agentId === "inventory-orderworkbench" ? 6 : 4;
  async function read(id, values, { signal, requiredColumns = [], priority } = {}) {
    signal?.throwIfAborted();
    const request = makeRequest(config, id, values);
    const result = await scheduledQuery(
      () => execute(request, { signal, queryId: id, values: structuredClone(values) }),
      signal,
      priority ?? query(config, id).priority ?? 0,
      query(config, id).maxConcurrency === 1 ? 1 : concurrency,
      // Collect the inventory first-screen reads before selecting priority. Otherwise
      // synchronous component order starts a heavy query ahead of ready cards.
      ["inventory-fc", "inventory-qll", "inventory-aqkc"].includes(config.agentId) || config.agentId === "inventory-orderworkbench" && (id.includes(".periods.") || id === "workbench.period-snapshots")
    );
    signal?.throwIfAborted();
    const failure = result?.failure ?? result?.error;
    if (failure || result?.success === false)
      fail(
        failure?.reasonCode || failure?.code || result.errorCode || "QUERY_FAILED",
        failure?.message || result.message || "\u53D7\u63A7\u67E5\u8BE2\u5931\u8D25",
        {
          failure,
          errorCode: result.errorCode,
          returnedColumns: result.returnedColumns,
          rejectedColumns: result.rejectedColumns
        }
      );
    if (!Array.isArray(result?.rows)) fail("INVALID_QUERY_RESPONSE", "\u67E5\u8BE2\u672A\u8FD4\u56DE\u884C\u96C6\u5408");
    requireColumns(result, requiredColumns);
    return structuredClone(result);
  }
  async function readAll(id, values, {
    keyFields,
    requiredColumns = [],
    maxRows = 1e5,
    signal,
    singlePageFirst = false,
    atomicPages = false,
    priority
  } = {}) {
    const q = query(config, id), countId = q.pagination?.countQuery;
    if (!countId || !Array.isArray(keyFields) || !keyFields.length || !Number.isSafeInteger(maxRows) || maxRows < 1)
      fail("INVALID_COLLECTION_CONTRACT", "\u5B8C\u6574\u8BFB\u53D6\u5FC5\u987B\u6709\u914D\u5BF9\u8BA1\u6570\u3001\u7A33\u5B9A\u952E\u53CA\u6709\u6548\u4E0A\u9650");
    makeRequest(config, id, values);
    const pageSize = values.page_size;
    if (!Number.isSafeInteger(pageSize) || pageSize < 1)
      fail("INVALID_COLLECTION_CONTRACT", "\u5B8C\u6574\u8BFB\u53D6\u5FC5\u987B\u58F0\u660E\u6709\u6548\u5206\u9875\u5927\u5C0F");
    const atomicId = atomicPages ? q.pagination?.atomicQuery : void 0;
    const readId = atomicId || id;
    const pageColumns = [
      .../* @__PURE__ */ new Set([
        ...keyFields,
        ...requiredColumns,
        ...atomicId ? ["page_scope_total", "page_row_present"] : []
      ])
    ];
    if (singlePageFirst && !atomicId) {
      const result = await read(
        q.pagination?.initialQuery ?? id,
        { ...values, offset: 0 },
        {
          signal,
          priority,
          requiredColumns: [.../* @__PURE__ */ new Set([...keyFields, ...requiredColumns])]
        }
      );
      if (result.rows.length > pageSize) fail("RESULT_INCOMPLETE", "\u8FD4\u56DE\u6570\u91CF\u8D85\u8FC7\u8BF7\u6C42\u5206\u9875\u5927\u5C0F");
      if (result.rows.length < pageSize) {
        if (result.rows.length > maxRows)
          fail("RESULT_TOO_LARGE", "\u5B8C\u6574\u8BA1\u7B97\u8303\u56F4\u8D85\u8FC7\u4E0A\u9650\uFF0C\u8BF7\u7F29\u5C0F\u4E1A\u52A1\u8303\u56F4");
        const keys = result.rows.map((row) => JSON.stringify(keyFields.map((key) => row[key])));
        if (new Set(keys).size !== keys.length) fail("UNSTABLE_PAGINATION", "\u6C47\u603B\u51FA\u73B0\u91CD\u590D\u4E1A\u52A1\u952E");
        return {
          rows: result.rows,
          total: result.rows.length,
          configVersion: result.configVersion,
          pages: [
            {
              offset: 0,
              returnedColumns: result.returnedColumns,
              rejectedColumns: result.rejectedColumns
            }
          ],
          consistency: "single_statement_complete_page"
        };
      }
    }
    const countValues = Object.fromEntries(
      Object.values(query(config, countId).parameterSpec).map((s) => [s.name, values[s.name]])
    );
    let version, versionSeen = false;
    const checkVersion = (result) => {
      if (versionSeen && result.configVersion !== version)
        fail("QUERY_CONFIG_CHANGED", "\u67E5\u8BE2\u914D\u7F6E\u5728\u8BFB\u53D6\u671F\u95F4\u53D1\u751F\u53D8\u5316\uFF0C\u8BF7\u5237\u65B0\u540E\u91CD\u65B0\u67E5\u8BE2");
      versionSeen = true;
      version = result.configVersion;
    };
    const count = async () => {
      const result = await read(countId, countValues, {
        signal,
        priority,
        requiredColumns: ["total"]
      });
      checkVersion(result);
      const raw = result.rows[0]?.total;
      if (result.rows.length !== 1 || raw === null || raw === "" || !/^(0|[1-9]\d*)$/.test(String(raw)))
        fail("INVALID_COUNT", "\u8BA1\u6570\u5FC5\u987B\u662F\u552F\u4E00\u975E\u8D1F\u6574\u6570");
      const total2 = Number(raw);
      if (!Number.isSafeInteger(total2)) fail("INVALID_COUNT", "\u8BA1\u6570\u8D85\u51FA\u6574\u6570\u8303\u56F4");
      return total2;
    };
    const firstAtomic = atomicId ? await read(
      atomicId,
      { ...values, offset: 0 },
      { signal, priority, requiredColumns: pageColumns }
    ) : void 0;
    const firstPage = firstAtomic ? unpackAtomicPage(firstAtomic, 1, pageSize) : void 0;
    const total = firstPage ? firstPage.total : await count();
    if (total > maxRows) fail("RESULT_TOO_LARGE", "\u5B8C\u6574\u8BA1\u7B97\u8303\u56F4\u8D85\u8FC7\u4E0A\u9650\uFF0C\u8BF7\u7F29\u5C0F\u4E1A\u52A1\u8303\u56F4");
    const rows = [], seen = /* @__PURE__ */ new Set(), metadata = [];
    let columnsSignature;
    const accept = (result, offset) => {
      checkVersion(result);
      const signature = JSON.stringify([
        result.returnedColumns ?? null,
        result.rejectedColumns ?? null
      ]);
      if (columnsSignature !== void 0 && signature !== columnsSignature)
        fail("RETURN_COLUMNS_CHANGED", "\u5206\u9875\u671F\u95F4\u8FD4\u56DE\u5217\u6743\u9650\u53D1\u751F\u53D8\u5316\uFF0C\u672A\u751F\u6210\u6C47\u603B");
      columnsSignature = signature;
      if (result.rows.length !== Math.min(pageSize, total - offset))
        fail("RESULT_INCOMPLETE", "\u5206\u9875\u4E0E\u8BA1\u6570\u4E0D\u4E00\u81F4\uFF0C\u672A\u751F\u6210\u6C47\u603B");
      for (const row of result.rows) {
        const key = JSON.stringify(keyFields.map((k) => row[k]));
        if (seen.has(key)) fail("UNSTABLE_PAGINATION", "\u5206\u9875\u51FA\u73B0\u91CD\u590D\u4E1A\u52A1\u952E\uFF0C\u672A\u751F\u6210\u6C47\u603B");
        seen.add(key);
        rows.push(row);
      }
      metadata.push({
        offset,
        returnedColumns: result.returnedColumns,
        rejectedColumns: result.rejectedColumns
      });
    };
    const stop = new AbortController();
    const pageSignal = signal ? AbortSignal.any([signal, stop.signal]) : stop.signal;
    if (firstAtomic) accept({ ...firstAtomic, rows: firstPage.rows }, 0);
    for (let offset = firstAtomic ? pageSize : 0; offset < total; ) {
      const width = Math.min(
        offset === 0 ? 1 : Math.min(3, concurrency),
        Math.ceil((total - offset) / pageSize)
      );
      const offsets = Array.from({ length: width }, (_, index) => offset + index * pageSize);
      let failure;
      const results = await Promise.allSettled(
        offsets.map(async (at) => {
          try {
            const result = await read(
              readId,
              { ...values, offset: at },
              { signal: pageSignal, priority, requiredColumns: pageColumns }
            );
            if (!atomicId) return result;
            const page2 = unpackAtomicPage(result, at / pageSize + 1, pageSize);
            if (page2.total !== total) fail("SOURCE_CHANGED", "\u8BFB\u53D6\u671F\u95F4\u6E90\u8BA1\u6570\u53D8\u5316\uFF0C\u8BF7\u91CD\u65B0\u67E5\u8BE2");
            return { ...result, rows: page2.rows };
          } catch (error) {
            if (!failure) failure = { error };
            stop.abort(error);
            throw error;
          }
        })
      );
      if (failure) throw failure.error;
      results.forEach((result, index) => accept(result.value, offsets[index]));
      offset += width * pageSize;
    }
    if (!atomicId && await count() !== total)
      fail("SOURCE_CHANGED", "\u8BFB\u53D6\u671F\u95F4\u6E90\u8BA1\u6570\u53D8\u5316\uFF0C\u8BF7\u91CD\u65B0\u67E5\u8BE2");
    return {
      rows,
      total,
      pages: metadata,
      configVersion: version,
      consistency: atomicId ? "page_totals_checked_not_atomic_snapshot" : "count_checked_not_atomic_snapshot"
    };
  }
  return { read, readAll };
}
function unpackAtomicPage(result, page2, size) {
  const fail3 = (code, message) => {
    throw Object.assign(Error(message), { code });
  };
  const raw = result.rows[0]?.page_scope_total;
  if (raw == null || !/^(0|[1-9]\d*)$/.test(String(raw)) || !Number.isSafeInteger(Number(raw)))
    return fail3("INVALID_COUNT", "\u6765\u6E90\u8BA1\u6570\u65E0\u6548\uFF0C\u672A\u5C55\u793A\u4E0D\u5B8C\u6574\u9875");
  const total = Number(raw), expected = Math.min(size, Math.max(0, total - (page2 - 1) * size));
  if (result.rows.some((r) => String(r.page_scope_total) !== String(raw)))
    return fail3("INVALID_COUNT", "\u5F53\u524D\u9875\u603B\u6570\u4E0D\u4E00\u81F4");
  if (expected === 0) {
    if (result.rows.length !== 1 || result.rows[0].page_row_present != null)
      return fail3("RESULT_INCOMPLETE", "\u7A7A\u9875\u6807\u8BB0\u4E0D\u6B63\u786E");
    return { rows: [], total };
  }
  if (result.rows.length !== expected || result.rows.some((r) => String(r.page_row_present) !== "1"))
    return fail3("RESULT_INCOMPLETE", "\u5206\u9875\u884C\u6570\u4E0E\u540C\u4E00\u67E5\u8BE2\u7684\u603B\u6570\u4E0D\u4E00\u81F4");
  return {
    rows: result.rows.map(
      ({ page_scope_total: _total, page_row_present: _present, ...row }) => row
    ),
    total
  };
}

// business/shared/query-cache.ts
var freshAfter = 0;
var identityGeneration = 0;
var identityListeners = /* @__PURE__ */ new Set();
var configuredQueryIdentity = () => identityGeneration;
var configuredQueryFreshAfter = () => freshAfter;
function refreshConfiguredQueries() {
  freshAfter = Date.now();
}
if (typeof window !== "undefined") {
  window.addEventListener("gea-page-refresh", refreshConfiguredQueries);
  window.addEventListener("light-refresh", refreshConfiguredQueries);
  window.addEventListener("gea-identity-changed", () => {
    identityGeneration++;
    refreshConfiguredQueries();
    identityListeners.forEach((listener) => listener());
  });
}

// business/shared/inventory-cache-policy.ts
function inventoryCacheTtl(agentId) {
  return (agentId === "inventory-fc" ? 5 : 20) * 60 * 1e3;
}

// business/shared/daily-summary-bundle.ts
var page = /* @__PURE__ */ new Map();
var supplied = /* @__PURE__ */ new WeakMap();
var active = /* @__PURE__ */ new Set();
if (typeof window !== "undefined")
  window.addEventListener("gea-identity-changed", () => {
    active.forEach((controller) => controller.abort());
    page.clear();
  });
var shift = (value, days) => {
  const date2 = /* @__PURE__ */ new Date(value + "T00:00:00Z");
  date2.setUTCDate(date2.getUTCDate() + days);
  return date2.toISOString().slice(0, 10);
};
function dailyBundleValues(snapshot, templates) {
  const businessMonth = snapshot.businessDate.slice(0, 7) + "-01";
  const next = /* @__PURE__ */ new Date(businessMonth + "T00:00:00Z");
  next.setUTCMonth(next.getUTCMonth() + 1);
  const nextMonth = next.toISOString().slice(0, 10);
  const daysInMonth = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth(), 0)).getUTCDate();
  const nextDaysInMonth = new Date(
    Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)
  ).getUTCDate();
  const rollingStart = shift(snapshot.businessDate, -29);
  const context2 = {
    ...snapshot,
    businessMonth,
    nextMonth,
    daysInMonth,
    nextDaysInMonth,
    daysRemaining: daysInMonth - Number(snapshot.businessDate.slice(8)),
    nextDay: shift(snapshot.businessDate, 1),
    rollingStart,
    shipmentStart: businessMonth < rollingStart ? businessMonth : rollingStart,
    stockMonth: snapshot.stockDate.slice(0, 7) + "-01",
    stockRollingStart: shift(snapshot.stockDate, -29),
    stockNextDay: shift(snapshot.stockDate, 1),
    businessPlanMonths: [businessMonth, nextMonth].map(
      (value) => value.slice(0, 7).replace("-", "")
    )
  };
  return Object.fromEntries(
    Object.entries(templates).map(([key, template]) => {
      if (!template || typeof template !== "object" || Array.isArray(template) || !template.snapshotValue)
        return [key, template];
      let value = context2[template.snapshotValue];
      if (typeof value === "string" && template.format === "YYYYMM")
        value = value.slice(0, 7).replace("-", "");
      if (typeof value === "string" && template.format === "YYYYMMDD")
        value = value.replaceAll("-", "");
      return [key, value];
    })
  );
}
async function executeDailyBundle(config, snapshot, run, scope, request, options, freshAfter2, preloaded) {
  const bundle = config.dailySummary?.bundle;
  const member = bundle?.members?.find((item) => item.queryId === options.queryId);
  if (!member || snapshot?.kind !== "ready") return run(request, options);
  const warehouseCode = config.agentId === "inventory-fc" && typeof options.values?.warehouse_code === "string" ? options.values.warehouse_code : "";
  if (warehouseCode && bundle.members.some(
    (part) => Object.hasOwn(part.values, "warehouse_code") && (!Object.values(part.bindings).includes("warehouse_code") || Object.hasOwn(part.values, "warehouse_code_mode") && !Object.values(part.bindings).includes("warehouse_code_mode"))
  ))
    return run(request, options);
  const memberValues = (templates) => {
    const values = dailyBundleValues(snapshot, templates);
    if (warehouseCode && Object.hasOwn(values, "warehouse_code")) {
      values.warehouse_code = warehouseCode;
      if (Object.hasOwn(values, "warehouse_code_mode")) values.warehouse_code_mode = "equal";
    }
    return values;
  };
  const expected = memberValues(member.values);
  const definition = config.queries[options.queryId];
  if (Object.entries(definition.parameterSpec).some(
    ([key2, spec]) => expected[spec.name] === void 0 || JSON.stringify(request.parameters[key2]) !== JSON.stringify(expected[spec.name])
  ))
    return run(request, options);
  const cache = scope ? supplied.get(scope) ?? (() => {
    const cache2 = /* @__PURE__ */ new Map();
    supplied.set(scope, cache2);
    return cache2;
  })() : page;
  const key = JSON.stringify([
    configuredQueryIdentity(),
    config.agentId,
    config.queries[bundle.queryId],
    snapshot,
    warehouseCode,
    freshAfter2
  ]);
  let entry = cache.get(key);
  const ttl = inventoryCacheTtl(config.agentId);
  if (!entry || Date.now() - entry.started >= (entry.failed ? Math.min(ttl, 45e3) : ttl)) {
    const values = {};
    for (const part of bundle.members) {
      const inputs = memberValues(part.values);
      for (const [parameter, name] of Object.entries(part.bindings))
        values[config.queries[bundle.queryId].parameterSpec[parameter].name] = inputs[name];
    }
    const controller = new AbortController();
    active.add(controller);
    const fresh = {
      started: Date.now(),
      controller,
      users: 0,
      settled: false,
      failed: false,
      promise: Promise.resolve()
    };
    fresh.promise = (async () => {
      let first;
      const collected = [];
      let total = 1;
      for (let offset = 0; offset < total; offset += bundle.maxRows) {
        const pageValues = { ...values, bundle_offset: offset };
        const result = offset === 0 && !warehouseCode && preloaded && Date.now() - preloaded.at < ttl ? preloaded.result : await run(makeRequest(config, bundle.queryId, pageValues), {
          ...options,
          queryId: bundle.queryId,
          values: pageValues,
          signal: controller.signal
        });
        if (result?.failure || result?.error || result?.success === false)
          throw Object.assign(Error(result.failure?.message || result.message || "\u6C47\u603B\u8BFB\u53D6\u5931\u8D25"), {
            code: result.failure?.reasonCode || "QUERY_FAILED",
            failure: result.failure
          });
        requireColumns(result, [
          "bundle_part",
          "bundle_total",
          "bundle_present",
          "bundle_scope_total"
        ]);
        const raw = result.rows[0]?.bundle_scope_total;
        const count = Number(raw);
        if (raw == null || raw === "" || !Number.isSafeInteger(count) || count < 1 || count > bundle.maxTotalRows || result.rows.some((row) => Number(row.bundle_scope_total) !== count) || result.rows.length !== Math.min(bundle.maxRows, Math.max(0, count - offset)))
          throw Object.assign(Error("\u9996\u5C4F\u6C47\u603B\u5206\u9875\u4E0D\u5B8C\u6574"), { code: "RESULT_INCOMPLETE" });
        if (first && (count !== total || first.configVersion !== result.configVersion || JSON.stringify(first.returnedColumns) !== JSON.stringify(result.returnedColumns) || JSON.stringify(first.rejectedColumns) !== JSON.stringify(result.rejectedColumns)))
          throw Object.assign(Error("\u8BFB\u53D6\u671F\u95F4\u6C47\u603B\u8303\u56F4\u6216\u6743\u9650\u53D1\u751F\u53D8\u5316"), {
            code: "QUERY_CONFIG_CHANGED"
          });
        first ??= result;
        total = count;
        collected.push(...result.rows);
      }
      return { ...first, rows: collected };
    })().then((result) => {
      fresh.failed = Array.isArray(result.rejectedColumns) && result.rejectedColumns.length > 0;
      for (const part of bundle.members) {
        const rows = result.rows.filter((row) => String(row.bundle_part) === part.part);
        const raw = rows[0]?.bundle_total;
        const total = Number(raw);
        if (!rows.length || raw == null || raw === "" || rows.length !== Math.max(1, total) || !Number.isSafeInteger(total) || total < 0 || rows.some((row) => Number(row.bundle_total) !== total) || rows.filter((row) => row.bundle_present != null).length !== total || total === 0 && rows.length !== 1)
          throw Object.assign(Error("\u9996\u5C4F\u6C47\u603B\u8FD4\u56DE\u4E0D\u5B8C\u6574"), { code: "RESULT_INCOMPLETE" });
      }
      return result;
    }).catch((error) => {
      fresh.failed = true;
      throw error;
    }).finally(() => {
      fresh.settled = true;
      active.delete(controller);
    });
    entry = fresh;
    cache.set(key, entry);
    if (cache.size > 8) cache.delete(cache.keys().next().value ?? "");
  }
  entry.users++;
  const current = entry;
  let abort;
  try {
    options.signal?.throwIfAborted();
    const result = await (options.signal ? Promise.race([
      current.promise,
      new Promise((_, reject) => {
        abort = () => reject(options.signal?.reason);
        options.signal.addEventListener("abort", abort, { once: true });
      })
    ]) : current.promise);
    options.signal?.throwIfAborted();
    const rows = result.rows.filter((row) => String(row.bundle_part) === member.part && row.bundle_present != null).map(
      (row) => Object.fromEntries(
        Object.entries(member.columns).filter(([, column]) => Object.hasOwn(row, column)).map(([name, column]) => [name, row[column]])
      )
    );
    const translate = (columns) => columns && Object.entries(member.columns).filter(
      ([, column]) => columns.some(
        (item) => (typeof item === "string" ? item : item.outputAlias ?? item.alias ?? item.name ?? item.columnName) === column
      )
    ).map(([name]) => name);
    return {
      ...result,
      rows,
      returnedColumns: translate(result.returnedColumns),
      rejectedColumns: translate(result.rejectedColumns)
    };
  } finally {
    if (abort) options.signal?.removeEventListener("abort", abort);
    if (--current.users === 0 && !current.settled) {
      current.controller.abort();
      cache.delete(key);
    }
  }
}

// business/shared/business-day.ts
var businessDay = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(/* @__PURE__ */ new Date());

// business/shared/in-flight-query.ts
function inFlightQueries() {
  const pending2 = /* @__PURE__ */ new Map();
  return (key, run, signal) => {
    signal?.throwIfAborted();
    let flight = pending2.get(key);
    if (!flight) {
      const controller = new AbortController();
      const promise = Promise.resolve().then(() => run(controller.signal));
      flight = { controller, promise, subscribers: 0 };
      pending2.set(key, flight);
      const remove = () => {
        if (pending2.get(key) === flight) pending2.delete(key);
      };
      void promise.then(remove, remove);
    }
    const current = flight;
    current.subscribers++;
    return new Promise((resolve, reject) => {
      let finished = false;
      const finish = (complete) => {
        if (finished) return;
        finished = true;
        signal?.removeEventListener("abort", abort);
        current.subscribers--;
        if (!current.subscribers) {
          if (pending2.get(key) === current) pending2.delete(key);
          current.controller.abort();
        }
        complete();
      };
      const abort = () => finish(() => reject(signal?.reason ?? new DOMException("Aborted", "AbortError")));
      signal?.addEventListener("abort", abort, { once: true });
      void current.promise.then(
        (value) => finish(() => resolve(value)),
        (error) => finish(() => reject(error))
      );
    });
  };
}

// business/shared/sql-config.ts
var configs = /* @__PURE__ */ new Map();
function agentSqlConfig(fallback) {
  const previous = typeof document === "undefined" ? void 0 : configs.get(fallback.agentId);
  if (previous) return previous;
  const element = typeof document === "undefined" ? null : document.getElementById("agent-sql-config");
  const config = element ? JSON.parse(element.textContent || "") : fallback;
  if (config.schemaVersion !== 1 || config.agentId !== fallback.agentId || !config.templates || !config.queries || typeof config.templates !== "object" || typeof config.queries !== "object")
    throw Error("INVALID_AGENT_SQL_CONFIG");
  const snapshot = immutableQueryConfig(config);
  if (typeof document !== "undefined") configs.set(snapshot.agentId, snapshot);
  return snapshot;
}

// business/shared/daily-summary.ts
var date = (value) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = /* @__PURE__ */ new Date(value + "T00:00:00Z");
  return Number.isFinite(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
};
function parseDailySummarySnapshot(result) {
  if (result === null || typeof result !== "object" || !("rows" in result))
    throw Error("SUMMARY_SNAPSHOT_INVALID");
  if (Array.isArray(result.rows) && result.rows.length === 0) return { kind: "unavailable" };
  if (!Array.isArray(result.rows) || result.rows.length !== 1)
    throw Error("SUMMARY_SNAPSHOT_INVALID");
  const row = result.rows[0];
  if (row === null || typeof row !== "object" || !("batch_id" in row))
    throw Error("SUMMARY_SNAPSHOT_INVALID");
  if (row.batch_id === null) return { kind: "unavailable" };
  const businessDate = Reflect.get(row, "business_date");
  const stockDate = Reflect.get(row, "stock_date");
  const targetMonth = Reflect.get(row, "target_month");
  if (typeof row.batch_id !== "string" || !/^[A-Za-z0-9_:-]{1,64}$/.test(row.batch_id) || !date(businessDate) || !date(stockDate) || !date(targetMonth) || !targetMonth.endsWith("-01") || stockDate > businessDate)
    throw Error("SUMMARY_SNAPSHOT_INVALID");
  const inventoryVersion = Reflect.get(row, "default_inventory_version");
  if (inventoryVersion != null && typeof inventoryVersion !== "string")
    throw Error("SUMMARY_SNAPSHOT_INVALID");
  return {
    kind: "ready",
    batchId: row.batch_id,
    businessDate,
    stockDate,
    targetMonth,
    defaultInventoryVersion: inventoryVersion ?? null
  };
}
var month = (value) => typeof value !== "string" ? null : /^\d{6}$/.test(value) ? value.slice(0, 4) + "-" + value.slice(4) + "-01" : /^\d{4}-\d{2}-01$/.test(value) ? value : null;
var shift2 = (day, days) => {
  const result = /* @__PURE__ */ new Date(day + "T00:00:00Z");
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
};
function dailySummaryQuery(definition, snapshot, values) {
  if (snapshot.kind === "unavailable") return null;
  if (definition === null || typeof definition !== "object" || !("summaryRoute" in definition))
    return null;
  const route = definition.summaryRoute;
  if (route === null || typeof route !== "object" || !("queryId" in route) || typeof route.queryId !== "string" || !("kind" in route))
    throw Error("SUMMARY_ROUTE_INVALID");
  if ("materializedInputs" in route && route.materializedInputs !== null && typeof route.materializedInputs === "object") {
    if (Object.entries(route.materializedInputs).some(
      ([name, expected]) => name in values && JSON.stringify(values[name]) !== JSON.stringify(expected)
    ))
      return null;
  }
  if ("materializedPeriod" in route && route.materializedPeriod === true) {
    const period = {
      order_start: snapshot.businessDate.slice(0, 7) + "-01",
      order_end_exclusive: shift2(snapshot.businessDate, 1),
      rolling_start: shift2(snapshot.businessDate, -29),
      shipment_end_exclusive: shift2(snapshot.businessDate, 1)
    };
    if (Object.entries(period).some(
      ([name, expected]) => name in values && String(values[name]).replaceAll("-", "") !== expected.replaceAll("-", "")
    ))
      return null;
  }
  if ("materializedWindow" in route) {
    const calendarMonth = snapshot.businessDate.slice(0, 7) + "-01";
    const rolling = shift2(snapshot.businessDate, -29);
    const expected = route.materializedWindow === "month" ? { start: calendarMonth, end_exclusive: shift2(snapshot.businessDate, 1) } : {
      shipment_start: calendarMonth < rolling ? calendarMonth : rolling,
      shipment_month_start: calendarMonth,
      rolling_start: rolling,
      shipment_end_exclusive: shift2(snapshot.businessDate, 1)
    };
    if (Object.entries(expected).some(
      ([name, value]) => name in values && String(values[name]).replaceAll("-", "") !== value.replaceAll("-", "")
    ))
      return null;
  }
  const stockDate = values.stock_date ?? values.stat_date;
  if (stockDate != null && stockDate !== snapshot.stockDate) return null;
  if ("stock_month" in values && month(values.stock_month) !== snapshot.stockDate.slice(0, 7) + "-01")
    return null;
  switch (route.kind) {
    case "base":
      if (month(values.month) !== snapshot.targetMonth) return null;
      if (!["", "\u6708\u521D", "\u7EA0\u504F", "\u6EDA\u52A8"].includes(String(values.inventory_version))) return null;
      break;
    case "branch-period": {
      if (month(values.month) !== snapshot.businessDate.slice(0, 7) + "-01") return null;
      const next = /* @__PURE__ */ new Date(snapshot.businessDate.slice(0, 7) + "-01T00:00:00Z");
      next.setUTCMonth(next.getUTCMonth() + 1);
      const nextMonth = next.toISOString().slice(0, 10);
      if ("next_month" in values && month(values.next_month) !== nextMonth) return null;
      if ("business_plan_months" in values) {
        const expectedMonths = [
          snapshot.businessDate.slice(0, 7).replace("-", ""),
          nextMonth.slice(0, 7).replace("-", "")
        ];
        if (!Array.isArray(values.business_plan_months) || JSON.stringify([...values.business_plan_months].sort()) !== JSON.stringify(expectedMonths.sort()))
          return null;
      }
      const rollingStart = shift2(snapshot.businessDate, -29);
      const calendarMonth = snapshot.businessDate.slice(0, 7) + "-01";
      const expected = {
        as_of: snapshot.businessDate,
        rolling_start: rollingStart,
        shipment_month_start: calendarMonth,
        shipment_end_exclusive: shift2(snapshot.businessDate, 1),
        shipment_start: calendarMonth < rollingStart ? calendarMonth : rollingStart
      };
      if (Object.entries(expected).some(
        ([name, value]) => name in values && String(values[name]).replaceAll("-", "") !== value.replaceAll("-", "")
      ))
        return null;
      break;
    }
    case "age":
    case "age-movement": {
      const end = route.kind === "age-movement" ? snapshot.businessDate : snapshot.stockDate;
      const expected = {
        batch_rolling_start: shift2(end, -29).replaceAll("-", ""),
        batch_end_exclusive: shift2(end, 1).replaceAll("-", "")
      };
      if (Object.entries(expected).some(([name, value]) => name in values && values[name] !== value))
        return null;
      break;
    }
    case "stock":
      break;
    case "dates":
      if (typeof values.as_of === "string" && values.as_of < snapshot.stockDate) return null;
      if ("month" in values && month(values.month) !== snapshot.stockDate.slice(0, 7) + "-01")
        return null;
      break;
    case "current":
      break;
    default:
      throw Error("SUMMARY_ROUTE_INVALID");
  }
  const defaultCycle = (!("cycle_days" in values) || values.cycle_days === 7) && (!("preparation_days" in values) || values.preparation_days === 3) && Object.entries(values).every(
    ([name, value]) => !/^fc_cycle_\d+_(?:level|object|from|to)$/.test(name) || value === ""
  ) && (!("fc_cycle_warehouse" in values) || values.fc_cycle_warehouse === "");
  return {
    queryId: defaultCycle && "defaultQueryId" in route && typeof route.defaultQueryId === "string" ? route.defaultQueryId : route.queryId,
    values: { ...values, summary_batch_id: snapshot.batchId }
  };
}

// business/shared/agent-query.ts
var sourceFetch = globalThis.fetch?.bind(globalThis);
var pageReads = inFlightQueries();
var identityGeneration2 = 0;
if (typeof window !== "undefined")
  window.addEventListener("gea-identity-changed", () => identityGeneration2++);
var suppliedReads = /* @__PURE__ */ new WeakMap();
var pageSummaries = /* @__PURE__ */ new Map();
var suppliedSummaries = /* @__PURE__ */ new WeakMap();
function createAgentQueries(fallback, execute, freshness = {}) {
  const config = agentSqlConfig(fallback);
  const freshAfter2 = freshness.freshAfter ?? configuredQueryFreshAfter();
  const run = execute ?? (async (request, options) => {
    const local = typeof document === "undefined" ? null : document.getElementById("agent-sql-direct");
    if (local) {
      const settings = JSON.parse(local.textContent || "{}");
      if (!/^\/api\/agents\/[a-z-]+\/query$/.test(settings.path))
        throw Error("INVALID_SQL_TRANSPORT");
      if (!sourceFetch) throw Error("SQL_TRANSPORT_UNAVAILABLE");
      const response = await sourceFetch(settings.path, {
        method: "POST",
        signal: options.signal,
        headers: { "Content-Type": "application/json", "X-SQL-Preview": settings.token },
        body: JSON.stringify({ queryId: options.queryId, parameters: options.values })
      });
      const body = await response.json();
      if (!response.ok) throw Object.assign(Error(body.message || "DIRECT_SQL_FAILED"), body);
      return body;
    }
    if (typeof window === "undefined")
      throw Object.assign(Error("\u8BF7\u5728\u5DF2\u8FDE\u63A5\u7684\u5DE5\u4F5C\u53F0\u9875\u9762\u5185\u67E5\u8BE2"), {
        code: "PAGE_CHANNEL_UNAVAILABLE"
      });
    const { call: call2, ready: ready2 } = await Promise.resolve().then(() => (init_channel(), channel_exports));
    await new Promise((resolve, reject) => {
      const abort = () => {
        cleanup();
        reject(options.signal?.reason);
      };
      const timer = setTimeout(() => {
        cleanup();
        reject(
          Object.assign(Error("\u9875\u9762\u5C1A\u672A\u8FDE\u63A5\u7EDF\u4E00\u8EAB\u4EFD\uFF0C\u8BF7\u91CD\u65B0\u6253\u5F00"), {
            code: "PAGE_CHANNEL_UNAVAILABLE"
          })
        );
      }, 3e4);
      const cleanup = () => {
        clearTimeout(timer);
        options.signal?.removeEventListener("abort", abort);
      };
      if (options.signal?.aborted) return abort();
      options.signal?.addEventListener("abort", abort, { once: true });
      ready2.then(
        () => {
          cleanup();
          resolve();
        },
        (error) => {
          cleanup();
          reject(error);
        }
      );
    });
    options.signal?.throwIfAborted();
    return call2(
      "sql",
      {
        queryId: options.queryId,
        parameters: options.values,
        freshAfter: freshAfter2
      },
      { signal: options.signal }
    );
  });
  let selectedSnapshot;
  let selectedIdentity = identityGeneration2;
  let preloaded;
  const client = createQueryClient(
    config,
    (request, options) => executeDailyBundle(
      config,
      selectedSnapshot,
      run,
      execute,
      request,
      options,
      freshAfter2,
      preloaded
    )
  );
  const shared = execute ? suppliedReads.get(execute) ?? (() => {
    const reads = inFlightQueries();
    suppliedReads.set(execute, reads);
    return reads;
  })() : pageReads;
  const summaryReads = execute ? suppliedSummaries.get(execute) ?? (() => {
    const reads = /* @__PURE__ */ new Map();
    suppliedSummaries.set(execute, reads);
    return reads;
  })() : pageSummaries;
  const readSnapshot = async () => {
    const readIdentity = identityGeneration2;
    if (selectedIdentity !== identityGeneration2) {
      selectedSnapshot = void 0;
      preloaded = void 0;
      selectedIdentity = identityGeneration2;
    }
    if (selectedSnapshot?.kind === "ready") return selectedSnapshot;
    if (!config.dailySummary) return { kind: "unavailable" };
    const bootstrapId = config.dailySummary.bundle?.bootstrapQueryId;
    const snapshotId = bootstrapId ?? config.dailySummary.snapshotQueryId;
    if (typeof snapshotId !== "string" || !config.queries[snapshotId])
      throw Error("SUMMARY_SNAPSHOT_NOT_CONFIGURED");
    const key = JSON.stringify([
      identityGeneration2,
      config.agentId,
      config.queries[snapshotId],
      businessDay(),
      freshAfter2
    ]);
    let snapshot = summaryReads.get(key);
    if (snapshot && Date.now() >= snapshot.expiresAt) {
      summaryReads.delete(key);
      snapshot = void 0;
    }
    if (!snapshot) {
      const metadataColumns = config.queries[config.dailySummary.snapshotQueryId].resultColumns;
      const result = client.read(snapshotId, {}, { requiredColumns: metadataColumns }).then((response) => {
        if (!bootstrapId) return { snapshot: parseDailySummarySnapshot(response) };
        const metadata = (row) => Object.fromEntries(metadataColumns.map((name) => [name, row[name]]));
        const rows = response.rows;
        if (!Array.isArray(rows)) throw Error("SUMMARY_SNAPSHOT_INVALID");
        if (rows.some(
          (row) => JSON.stringify(metadata(row)) !== JSON.stringify(metadata(rows[0]))
        ))
          throw Error("SUMMARY_SNAPSHOT_INVALID");
        const businessColumns = (columns) => columns?.filter(
          (column) => !metadataColumns.includes(
            typeof column === "string" ? column : column.outputAlias ?? column.alias ?? column.name ?? column.columnName
          )
        );
        return {
          snapshot: parseDailySummarySnapshot({ rows: rows.length ? [metadata(rows[0])] : [] }),
          preloaded: {
            at: Date.now(),
            result: {
              ...response,
              returnedColumns: businessColumns(response.returnedColumns),
              rejectedColumns: businessColumns(response.rejectedColumns)
            }
          }
        };
      });
      snapshot = {
        expiresAt: config.agentId === "inventory-fc" ? Date.now() + inventoryCacheTtl(config.agentId) : Infinity,
        result
      };
      summaryReads.set(key, snapshot);
      result.catch((error) => {
        const code = error?.failure?.reasonCode ?? error?.code ?? "";
        if (/PERMISSION|NOT_PUBLISHED|NO_RETURN_COLUMN_ALLOWED|REQUIRED_COLUMN_UNAVAILABLE/.test(code))
          return;
        if (summaryReads.get(key)?.result === result) summaryReads.delete(key);
      });
      if (summaryReads.size > 32) summaryReads.delete(summaryReads.keys().next().value ?? "");
    }
    const selectedRead = await snapshot.result;
    if (readIdentity !== identityGeneration2)
      throw Object.assign(Error("\u8EAB\u4EFD\u5DF2\u53D8\u5316\uFF0C\u8BF7\u91CD\u65B0\u8BFB\u53D6\u5F53\u524D\u8D26\u53F7\u7684\u6570\u636E"), {
        code: "IDENTITY_CHANGED"
      });
    if (selectedRead.snapshot.kind === "unavailable")
      snapshot.expiresAt = Math.min(snapshot.expiresAt, Date.now() + 45e3);
    selectedSnapshot = selectedRead.snapshot;
    preloaded = selectedRead.preloaded;
    return selectedRead.snapshot;
  };
  const selectRead = async (id, values) => {
    if (!config.dailySummary || !config.queries[id]?.summaryRoute) return { id, values };
    const snapshot = await readSnapshot();
    const selected = dailySummaryQuery(config.queries[id], snapshot, values);
    if (!selected && config.queries[id].summaryRoute.required === true)
      throw Object.assign(Error("\u5F53\u524D\u8303\u56F4\u7684\u6C47\u603B\u6570\u636E\u5C1A\u672A\u5C31\u7EEA"), {
        code: snapshot.kind === "unavailable" ? "SUMMARY_NOT_AVAILABLE" : "SUMMARY_SCOPE_NOT_COVERED"
      });
    return selected ? { id: selected.queryId, values: selected.values } : { id, values };
  };
  return {
    config,
    async snapshot(options = {}) {
      const generation = identityGeneration2;
      options.signal?.throwIfAborted();
      const snapshot = await readSnapshot();
      options.signal?.throwIfAborted();
      if (generation !== identityGeneration2)
        throw Object.assign(Error("\u8EAB\u4EFD\u5DF2\u53D8\u5316\uFF0C\u8BF7\u91CD\u65B0\u8BFB\u53D6\u5F53\u524D\u8D26\u53F7\u7684\u6570\u636E"), {
          code: "IDENTITY_CHANGED"
        });
      return structuredClone(snapshot);
    },
    read(id, values, options = {}) {
      const generation = identityGeneration2;
      const key = JSON.stringify([
        identityGeneration2,
        config.agentId,
        id,
        config.queries[id],
        values,
        options.requiredColumns,
        freshAfter2
      ]);
      return shared(
        key,
        async (signal) => {
          const selected = await selectRead(id, values);
          signal?.throwIfAborted();
          return client.read(selected.id, selected.values, { ...options, signal });
        },
        options.signal
      ).then((result) => {
        if (generation !== identityGeneration2)
          throw Object.assign(Error("\u8EAB\u4EFD\u5DF2\u53D8\u5316\uFF0C\u8BF7\u91CD\u65B0\u8BFB\u53D6\u5F53\u524D\u8D26\u53F7\u7684\u6570\u636E"), {
            code: "IDENTITY_CHANGED"
          });
        return structuredClone(result);
      });
    },
    async readAll(id, values, options) {
      const generation = identityGeneration2;
      const selected = await selectRead(id, values);
      options?.signal?.throwIfAborted();
      const result = await client.readAll(selected.id, selected.values, options);
      if (generation !== identityGeneration2)
        throw Object.assign(Error("\u8EAB\u4EFD\u5DF2\u53D8\u5316\uFF0C\u8BF7\u91CD\u65B0\u8BFB\u53D6\u5F53\u524D\u8D26\u53F7\u7684\u6570\u636E"), {
          code: "IDENTITY_CHANGED"
        });
      return result;
    }
  };
}

// business/inventory-orderworkbench/ontime-queries.mjs
var ontimeMetricContract = {
  version: "execution-arrival-18-12-complete-v1",
  source: "agents_scm_order_trace_final_di",
  executionSources: ["agents_scm_execute_detail_d", "agents_scm_execute_detail_hourly_d"],
  dateField: "COALESCE(gpsisinraildate_to,arriveconfirm_time)",
  dateBasis: "\u6309TMS\u5B9E\u9645\u5230\u8D27\u65F6\u95F4\u5F52\u5C5E\u5468\u671F\uFF1B\u4F18\u5148\u76EE\u7684\u5730GPS\u56F4\u680F\uFF0C\u5176\u6B21\u5230\u8D27\u786E\u8BA4",
  grain: "\u6267\u884C\u5355\u53F7\u53BB\u91CD\uFF0C\u5355\u4F4D\u5F20\uFF1B\u4E0D\u6309SKU\u3001\u6765\u6E90\u5355\u6216\u6267\u884C\u8BB0\u5F55\u884C\u8BA1\u7387",
  numerator: "\u5DF2\u786E\u8BA4\u51C6\u4EA4\u6267\u884C\u5355\u6570",
  denominator: "\u6240\u9009\u5B9E\u9645\u5230\u8D27\u5468\u671F\u5185\u7B26\u5408\u5254\u9664\u89C4\u5219\u7684\u5168\u90E8\u5DF2\u53D1\u8D27\u5019\u9009\u6267\u884C\u5355\u6570\uFF0C\u5305\u542B\u5F85\u5224\u5B9A",
  deadline: "MAX(\u5BA2\u6237\u671F\u671B\u5230\u8D27requireddeliverytimebak,\u5F00\u5355\u786E\u8BA4\u5230\u8D27requireddeliverytime,\u7CFB\u7EDF\u8BA1\u7B97\u5230\u8D27expected_deliv_time)",
  graceHours: { kamd: 18, dc: 18, other: 12 },
  customerType: "agents_scm_order_trace_final_di.cust_type\uFF1BLOWER(TRIM(cust_type)) IN ('kamd','dc')\u53D618\u5C0F\u65F6\uFF0C\u5426\u521912\u5C0F\u65F6",
  lateBoundary: "\u5230\u8D27\u65F6\u95F4>=\u57FA\u51C6\u4EA4\u671F+\u5BF9\u5E9418/12\u5C0F\u65F6\u4E3A\u903E\u671F\uFF1B\u4E25\u683C\u65E9\u4E8E\u4E3A\u51C6\u4EA4",
  unknown: "\u5F85\u5224\u5B9A\u4FDD\u7559\u5728\u5B8C\u6574\u5206\u6BCD\uFF0C\u6682\u4E0D\u8BA1\u5206\u5B50\uFF0C\u4E0D\u89C6\u4E3A\u5DF2\u786E\u8BA4\u903E\u671F\uFF1B\u6837\u672C\u7387\u4E0D\u80FD\u66FF\u4EE3\u4E3B\u7387",
  missingDeadline: "\u7CFB\u7EDF\u4EA4\u671F\u7F3A\u5931\u65F6\uFF0C\u4EC5\u5230\u8D27\u4E25\u683C\u65E9\u4E8E\u5DF2\u6709\u4E24\u4EA4\u671F\u6700\u5927\u503C+\u5BF9\u5E94\u65F6\u9650\u624D\u53EF\u786E\u8BA4\u51C6\u4EA4\uFF0C\u5426\u5219\u5F85\u5224\u5B9A",
  scope: "\u590D\u7528\u5F53\u524D\u770B\u677F\uFF1A\u77ED\u9A73\u6309\u4E24\u7AEF\u540C\u63D0\u8D27\u70B9\u4E14\u5747\u5DE5\u5382\u4ED3/\u5DE5\u5382\u5916\u79DF\u4ED3\uFF1B\u5254\u9664\u6D77\u5916/\u56FD\u5916/\u6E2F\u6FB3\u3001\u672A\u6D3E\u8F66\u3001\u865A\u62DF1/2\u3001\u7A7A\u8F66\u578B\u53CA\u6307\u5B9A\u8F66\u578B\u3001\u8D85\u65F6\u539F\u56E014/16\uFF1B\u4E0D\u52A0OMS\u65B0\u589E\u65F6\u95F4\u3001\u6700\u540E\u53D1\u8D27\u65F6\u95F4\u975E\u7A7A\u6216detailstatus/is_stat\u6761\u4EF6",
  baseScope: "\u6309\u770B\u677Fbelong_base\u7B5B\u9009\uFF1B\u90D1\u5DDE\u5E9E\u4E3D\u5A1F\u4F7F\u7528\u90D1\u5DDE\u57FA\u5730\u51C6\u4EA4\u7387"
};
var ontimeWarehousesSql = `SELECT warehouseid,
  CASE WHEN COUNT(DISTINCT NULLIF(TRIM(pickup_point),''))=1
    THEN MAX(NULLIF(TRIM(pickup_point),'')) END AS pickup_point,
  CASE WHEN COUNT(DISTINCT NULLIF(TRIM(warehouse_classify),''))=1
    THEN MAX(NULLIF(TRIM(warehouse_classify),'')) END AS warehouse_classify
  FROM (SELECT warehouseid,pickup_point,warehouse_classify FROM agents_scm_material_in_out_summary_d
    UNION ALL SELECT warehouse_id AS warehouseid,NULL AS pickup_point,warehouse_classify FROM dim_bas_warehouse) sources
  GROUP BY warehouseid`;
var shortTransfer = `CASE
  WHEN NULLIF(TRIM(t.receive_wh),'') IS NULL THEN 0
  WHEN f.warehouse_classify NOT IN ('01','02') OR r.warehouse_classify NOT IN ('01','02') THEN 0
  WHEN f.warehouse_classify IN ('01','02') AND r.warehouse_classify IN ('01','02')
    AND f.pickup_point IS NOT NULL AND r.pickup_point IS NOT NULL
    THEN CASE WHEN f.pickup_point=r.pickup_point THEN 1 ELSE 0 END
  ELSE NULL END`;
var excluded = `CASE WHEN TRIM(t.is_dispatch)='\u5426'
  OR TRIM(t.region_name) IN ('\u6D77\u5916\u5927\u533A','\u56FD\u5916\u5927\u533A','\u6E2F\u6FB3\u5927\u533A')
  OR TRIM(t.is_virtual_odo) IN ('1','2')
  OR COALESCE(TRIM(t.vehicle_type),'')=''
  OR REPLACE(REPLACE(TRIM(t.vehicle_type_name),'(', '\uFF08'),')','\uFF09')
    IN ('\u94C1\u67DC40','\u94C1\u67DC45','\u65E0\u8F66\u578B\u8981\u6C42\uFF08\u5E38\u6E29\uFF09','\u65E0\u8F66\u578B\u8981\u6C42\uFF08\u901F\u51BB\uFF09','\u81EA\u63D0')
  OR TRIM(t.timeout_code) IN ('14','16','\u5B89\u5168\u5E93\u5B58','\u8C03\u8D26\u8BA2\u5355')
  OR (${shortTransfer})=1 THEN 1 ELSE 0 END`;
var extendedGrace = "CASE WHEN LOWER(TRIM(t.cust_type)) IN ('kamd','dc') THEN 1 ELSE 0 END";
var deadlineWithGrace = (fields2) => `CASE WHEN MIN(${extendedGrace})=1
    THEN GREATEST(${fields2}) + INTERVAL '18' HOUR
    ELSE GREATEST(${fields2}) + INTERVAL '12' HOUR END`;
var ontimeTraceHeadersSql = `SELECT t.executeorderno,t.cust_code,
  MAX(t.lastshipmenttime) AS shipped,
  CASE WHEN COUNT(COALESCE(t.gpsisinraildate_to,t.arriveconfirm_time))=COUNT(*)
    AND COUNT(DISTINCT COALESCE(t.gpsisinraildate_to,t.arriveconfirm_time))=1
    THEN MAX(COALESCE(t.gpsisinraildate_to,t.arriveconfirm_time)) END AS arrived,
  CASE WHEN COUNT(t.requireddeliverytimebak)=COUNT(*) AND COUNT(t.requireddeliverytime)=COUNT(*)
    AND COUNT(CAST(t.expected_deliv_time AS DATETIME))=COUNT(*)
    AND COUNT(DISTINCT t.requireddeliverytimebak)=1 AND COUNT(DISTINCT t.requireddeliverytime)=1
    AND COUNT(DISTINCT t.expected_deliv_time)=1
    THEN ${deadlineWithGrace("MAX(t.requireddeliverytimebak),MAX(t.requireddeliverytime),MAX(CAST(t.expected_deliv_time AS DATETIME))")} END AS deadline,
  CASE WHEN COUNT(t.requireddeliverytimebak)=COUNT(*) AND COUNT(t.requireddeliverytime)=COUNT(*)
    AND COUNT(DISTINCT t.requireddeliverytimebak)=1 AND COUNT(DISTINCT t.requireddeliverytime)=1
    THEN ${deadlineWithGrace("MAX(t.requireddeliverytimebak),MAX(t.requireddeliverytime)")} END AS known_deadline,
  CASE WHEN COUNT(DISTINCT ${extendedGrace})>1 THEN 1
    ELSE MAX(CASE WHEN (${shortTransfer}) IS NULL THEN 1 ELSE 0 END) END AS invalid_scope
  FROM agents_scm_order_trace_final_di t INNER JOIN
    (SELECT executeorderno,cust_code,MAX(update_time) AS updated FROM agents_scm_order_trace_final_di GROUP BY executeorderno,cust_code) latest
    ON latest.executeorderno=t.executeorderno AND latest.cust_code=t.cust_code AND latest.updated=t.update_time
  LEFT JOIN (${ontimeWarehousesSql}) f ON f.warehouseid=t.deliver_wh
  LEFT JOIN (${ontimeWarehousesSql}) r ON r.warehouseid=t.receive_wh
  GROUP BY t.executeorderno,t.cust_code HAVING MAX(${excluded})=0`;
var tuple = (fields2) => fields2.map((field) => `LENGTH(COALESCE(${field},'')),':',COALESCE(${field},'')`).join(",");
function createOntimeQueries(productsSql) {
  const scopedTraces = ontimeTraceHeadersSql.replace(
    "SELECT executeorderno,cust_code,MAX(update_time) AS updated FROM agents_scm_order_trace_final_di GROUP BY executeorderno,cust_code",
    `SELECT history.executeorderno,history.cust_code,MAX(history.update_time) AS updated
      FROM agents_scm_order_trace_final_di history INNER JOIN
        (SELECT DISTINCT executeorderno,cust_code FROM agents_scm_order_trace_final_di
          WHERE COALESCE(gpsisinraildate_to,arriveconfirm_time)>=:gea_p1
            AND COALESCE(gpsisinraildate_to,arriveconfirm_time)<:gea_p2) candidates
        ON candidates.executeorderno=history.executeorderno AND candidates.cust_code=history.cust_code
      GROUP BY history.executeorderno,history.cust_code`
  );
  const members = ["h.belong_base", "d.product_categ_name", "h.product_item", "h.material_code"];
  const arrivals = `SELECT t.executeorderno,t.cust_code,t.arrived AS arrival_date,
    CASE WHEN t.invalid_scope=0 AND t.arrived<t.known_deadline THEN 1
      WHEN t.deadline IS NOT NULL AND t.invalid_scope=0 THEN CASE WHEN t.arrived<t.deadline THEN 1 ELSE 0 END END AS ontime,
    CASE WHEN t.invalid_scope>0 OR (t.deadline IS NULL AND (t.known_deadline IS NULL OR t.arrived>=t.known_deadline)) THEN 1 ELSE 0 END AS invalid
    FROM ontime_traces t WHERE t.arrived>=:gea_p1 AND t.arrived<:gea_p2`;
  const scopedProducts = productsSql.replace(
    ") execution_rows\n  WHERE ",
    `) execution_rows
  WHERE executeorderno IN (SELECT executeorderno FROM ontime_arrivals) AND `
  );
  const prefix = `WITH ontime_traces AS (${scopedTraces}),ontime_arrivals AS (${arrivals}),
    ontime_products AS (${scopedProducts}) `;
  const from = `FROM ontime_products h INNER JOIN ontime_arrivals a
    ON a.executeorderno=h.executeorderno AND a.cust_code=h.cust_code
    INNER JOIN (SELECT executeorderno,cust_code FROM ontime_products GROUP BY executeorderno,cust_code
      HAVING MAX(virtual_excluded)=0) eligible ON eligible.executeorderno=h.executeorderno AND eligible.cust_code=h.cust_code
    LEFT JOIN (SELECT material_code,CASE WHEN COUNT(DISTINCT product_categ_name)=1 THEN MAX(product_categ_name) END AS product_categ_name
      FROM agents_scm_material_in_out_summary_d GROUP BY material_code) d ON d.material_code=h.material_code`;
  const windows = Array.from({ length: 6 }, (_, index) => ({
    index,
    start: ":gea_p" + (810 + index * 3),
    end: ":gea_p" + (811 + index * 3),
    enabled: ":gea_p" + (812 + index * 3)
  }));
  const inWindows = (field) => "(" + windows.map(
    (window2) => `(${window2.enabled}=TRUE AND ${field}>=${window2.start} AND ${field}<${window2.end})`
  ).join(" OR ") + ")";
  const periodTraces = scopedTraces.replace(
    /COALESCE\(gpsisinraildate_to,arriveconfirm_time\)>=:gea_p1\s+AND COALESCE\(gpsisinraildate_to,arriveconfirm_time\)<:gea_p2/,
    inWindows("COALESCE(gpsisinraildate_to,arriveconfirm_time)")
  );
  const periodArrivals = arrivals.replace(
    "t.arrived>=:gea_p1 AND t.arrived<:gea_p2",
    inWindows("t.arrived")
  );
  const periodPrefix = `WITH report_windows AS (${windows.map(
    (window2) => `SELECT ${window2.index} AS period_index,${window2.start} AS start_date,${window2.end} AS end_date,${window2.enabled} AS enabled`
  ).join(" UNION ALL ")}),
    ontime_traces AS (${periodTraces}),ontime_arrivals AS (${periodArrivals}),ontime_products AS (${scopedProducts}) `;
  const executionPrefix = `${prefix.trimEnd()},ontime_executions AS (
    SELECT h.executeorderno AS order_no,
      CASE WHEN COUNT(DISTINCT h.cust_code)=1 THEN MAX(h.cust_code) END AS customer,
      MAX(a.arrival_date) AS arrival_date,MIN(a.ontime) AS ontime,
      MAX(CASE WHEN NULLIF(TRIM(h.executeorderno),'') IS NULL OR NULLIF(TRIM(h.cust_code),'') IS NULL
        THEN 1 ELSE a.invalid END) AS invalid
      ${from} GROUP BY h.executeorderno) `;
  return {
    ontimeAgentSummarySql: executionPrefix + `SELECT
      COALESCE(SUM(CASE WHEN invalid=0 AND ontime=1 THEN 1 ELSE 0 END),0) AS numerator,
      COUNT(*) AS denominator,
      COALESCE(SUM(CASE WHEN invalid=0 AND ontime IN (0,1) THEN 1 ELSE 0 END),0) AS known,
      COALESCE(SUM(CASE WHEN invalid<>0 OR ontime IS NULL THEN 1 ELSE 0 END),0) AS pending,
      COALESCE(SUM(CASE WHEN invalid=0 AND ontime=0 THEN 1 ELSE 0 END),0) AS late
      FROM ontime_executions`,
    ontimeAgentDetailsSql: executionPrefix + `SELECT order_no,customer,arrival_date,ontime,invalid
      FROM ontime_executions`,
    ontimePeriodSummarySql: periodPrefix + `SELECT rw.period_index,h.belong_base AS base,a.invalid,a.ontime,
      ARRAY_AGG(CONCAT(${tuple(["h.executeorderno", "h.cust_code", "CAST(a.arrival_date AS CHAR)", ...members])})) AS packed_orders
      ${from} INNER JOIN report_windows rw ON rw.enabled=TRUE AND a.arrival_date>=rw.start_date AND a.arrival_date<rw.end_date
      GROUP BY rw.period_index,h.belong_base,a.invalid,a.ontime`,
    ontimeSql: prefix + `SELECT h.executeorderno AS order_no,h.cust_code AS customer,
      MAX(a.ontime) AS ontime,MAX(a.arrival_date) AS arrival_date,MAX(a.invalid) AS invalid,
      ARRAY_AGG(CONCAT(${tuple(members)})) AS members ${from} GROUP BY h.executeorderno,h.cust_code`,
    ontimeSummarySql: prefix + `SELECT h.belong_base AS base,a.invalid,a.ontime,
      ARRAY_AGG(CONCAT(${tuple(["h.executeorderno", "h.cust_code", "CAST(a.arrival_date AS CHAR)", ...members])})) AS packed_orders
      ${from} GROUP BY h.belong_base,a.invalid,a.ontime`
  };
}

// business/inventory-orderworkbench/sku-amendments.mjs
var amendmentMetricContract = {
  version: "quantity-shipment-nonnegative-no-lock-v2",
  source: "agents_scm_execute_detail_d",
  warehouseSource: "agents_dim_bas_warehouse_d",
  dateField: "lastshipmenttime",
  dateSource: "agents_scm_order_trace_final_di",
  dateBasis: "\u5B9E\u9645\u53D1\u8D27\uFF1A\u88C5\u8F66\u5B8C\u6210\u65F6\u95F4\uFF1B\u6309\u6267\u884C\u5355\u53F7\uFF0B\u5BA2\u6237\u5173\u8054\uFF0C\u53D6update_time\u3001load_time\u6700\u65B0\u6279\u6B21\u5E76\u5217\u8BB0\u5F55\u7684\u6700\u540E\u88C5\u8F66\u5B8C\u6210\u65F6\u95F4",
  missingDate: "\u7F3A\u88C5\u8F66\u5B8C\u6210\u65F6\u95F4\u6216\u65E0\u6CD5\u5173\u8054\u7684\u6267\u884C\u5355\u4E0D\u80FD\u5F52\u5C5E\u53D1\u8D27\u5468\u671F\uFF0C\u4E0D\u7528OMS\u65B0\u589E\u3001WMS\u5173\u5355\u6216\u9884\u8BA1\u5230\u8D27\u65F6\u95F4\u66FF\u4EE3",
  countFields: {
    records: "\u901A\u8FC7\u65F6\u95F4\u53CA\u4E1A\u52A1\u7B5B\u9009\u7684\u660E\u7EC6\u6761\u6570\uFF0C\u4E0D\u662F\u8BA2\u5355\u5F20\u6570",
    invalid: "\u4FDD\u7559\u96C6\u5408\u5185\u5173\u952E\u5B57\u6BB5\u4E0D\u8DB3\u7684\u5F85\u5224\u5B9A\u660E\u7EC6\u6761\u6570\uFF0C\u4E0D\u662F\u88AB\u5254\u9664\u7684\u660E\u7EC6\u6761\u6570\uFF1B\u672C\u67E5\u8BE2\u672A\u8FD4\u56DE\u5254\u9664\u6570\u91CF"
  },
  aggregation: "\u5546\u54C1\u660E\u7EC6\u6570\u91CF\u5408\u8BA1\uFF0C\u4E0D\u6309\u8BA2\u5355\u5F20\u6570\u3001SKU\u79CD\u7C7B\u6570\u6216\u660E\u7EC6\u6761\u6570\u8BA1\u7387",
  effectiveQuantity: "COALESCE(dms_last_update_qty,need_qty_origin,0)",
  numerator: "SUM(CASE WHEN change_order_qty>=0 THEN ABS(change_order_qty-COALESCE(dms_last_update_qty,need_qty_origin,0)) ELSE 0 END)",
  denominator: "SUM(COALESCE(dms_last_update_qty,need_qty_origin,0))",
  denominatorScope: "\u5168\u90E8\u6709\u6548\u660E\u7EC6\uFF1B\u5BA2\u6237\u8981\u6C42\u6539\u5355\u91CF\u4E3A\u7A7A\u6216\u8D1F\u503C\u7684\u6709\u6548\u91CF\u4ECD\u4FDD\u7559\u5728\u5206\u6BCD\uFF0C\u4E09\u4E2A\u6570\u91CF\u5168\u7A7A\u5254\u9664",
  lockPeriod: false,
  changeTimeRequired: false,
  filters: "detailstatus=10\u3001is_stat=1\u3001\u5254\u9664\u4F5C\u5E9F\u5355\uFF1B\u4EC5createsource=20\uFF0C\u5254\u9664is_virtual=1/2\u548Ctimeout_code=14/16\uFF1B\u4E24\u7AEF\u4ED3\u5E93\u540C\u63D0\u8D27\u70B9\u4E14\u5747\u4E3A01/02\u5DE5\u5382\u4ED3\u7C7B\u578B\u624D\u5254\u9664\u77ED\u9A73\uFF1B\u90D1\u5DDE\u4EC5pickup_point=01",
  answer: "\u5206\u5B50\u3001\u5206\u6BCD\u5747\u4E3A\u5546\u54C1\u6570\u91CF\uFF0C\u4E0D\u4F7F\u7528\u5F20\uFF1B\u660E\u7EC6\u6761\u6570\u6216\u8BA2\u5355\u5F20\u6570\u53EA\u80FD\u53E6\u5217\uFF0C\u4E0D\u80FD\u66FF\u4EE3\u6570\u91CF\uFF1B\u65E7\u5FEB\u7167\u6216\u5C0F\u65F6\u8868\u7ED3\u679C\u4E0D\u80FD\u5192\u5145\u672C\u53E3\u5F84"
};
var amendmentShipmentSql = `SELECT executeorderno,cust_code,MAX(lastshipmenttime) AS shipped_at
  FROM (SELECT executeorderno,cust_code,lastshipmenttime,
    DENSE_RANK() OVER (PARTITION BY executeorderno,cust_code ORDER BY update_time DESC,load_time DESC) AS version_rank
    FROM agents_scm_order_trace_final_di) latest_shipments
  WHERE version_rank=1 GROUP BY executeorderno,cust_code`;
var warehousePointsSql = `SELECT warehouseid AS warehouse_id,
  CASE WHEN COUNT(pickup_point)=COUNT(*) AND COUNT(DISTINCT pickup_point)=1
    THEN MAX(pickup_point) END AS pickup_point,
  CASE WHEN COUNT(warehouse_classify)=COUNT(*) AND COUNT(DISTINCT warehouse_classify)=1
    THEN MAX(warehouse_classify) END AS warehouse_classify
  FROM agents_dim_bas_warehouse_d GROUP BY warehouseid`;
function skuAmendmentEventsSql({ stage = "events", periods = false } = {}) {
  const fields2 = [
    "cust_code",
    "cust_order_no",
    "executeorderno",
    "belong_base",
    "pickup_point",
    "material_code",
    "region_name",
    "province_region_name",
    "cust_name",
    "header_addtime",
    "shipped_at",
    "orderstatus",
    "detailstatus",
    "is_stat",
    "change_order_qty",
    "dms_last_update_qty",
    "need_qty_origin",
    "warehouseid",
    "receive_wh",
    "createsource",
    "is_virtual",
    "timeout_code"
  ];
  const projection = (alias) => fields2.map(
    (field) => alias === "d" && field === "shipped_at" ? "shipment.shipped_at AS shipped_at" : `${alias}.${field}`
  ).join(",");
  const source = `SELECT ${periods ? "rw.period_index," : ""}${projection("d")}
    FROM agents_scm_execute_detail_d d
    INNER JOIN (${amendmentShipmentSql}) shipment ON shipment.executeorderno=d.executeorderno AND shipment.cust_code=d.cust_code
    ${periods ? "INNER JOIN report_windows rw ON rw.enabled=TRUE AND shipment.shipped_at>=rw.start_date AND shipment.shipped_at<rw.end_date" : ""}
    WHERE (:gea_p900=''
      OR (:gea_p900='\u90D1\u5DDE' AND d.pickup_point='01')
      OR (:gea_p900<>'\u90D1\u5DDE' AND d.belong_base=:gea_p900))
      ${periods ? "" : "AND shipment.shipped_at>=:gea_p1 AND shipment.shipped_at<:gea_p2"}
      AND d.createsource='20'
      AND (d.is_virtual IS NULL OR d.is_virtual NOT IN ('1','2'))
      AND (d.timeout_code IS NULL OR d.timeout_code NOT IN ('14','16'))`;
  const factoryTransfer = `CASE WHEN shipping.pickup_point IS NOT NULL
      AND shipping.pickup_point=receiving.pickup_point
      AND shipping.warehouse_classify IN ('01','02')
      AND receiving.warehouse_classify IN ('01','02') THEN 1 ELSE 0 END`;
  const knownWarehouse = "NULLIF(NULLIF(TRIM(warehouseid),'*'),'')";
  const executionShipping = `SELECT ${periods ? "period_index," : ""}cust_code,executeorderno,pickup_point,receive_wh,
    CASE WHEN COUNT(DISTINCT ${knownWarehouse})=1 THEN MAX(${knownWarehouse}) END AS warehouse_id
    FROM (${source}) execution_lines
    WHERE detailstatus=10 AND is_stat='1' AND (orderstatus<>90 OR orderstatus IS NULL)
    GROUP BY ${periods ? "period_index," : ""}cust_code,executeorderno,pickup_point,receive_wh`;
  const resolvedWarehouse = `COALESCE(NULLIF(NULLIF(TRIM(s.warehouseid),'*'),''),execution_shipping.warehouse_id)`;
  const cohort = `SELECT ${periods ? "s.period_index," : ""}${projection("s")},
    s.change_order_qty AS requested_qty,
    COALESCE(s.dms_last_update_qty,s.need_qty_origin,0) AS effective_qty,
    ${factoryTransfer} AS factory_short_transfer,${resolvedWarehouse} AS resolved_warehouseid
    FROM (${source}) s
    LEFT JOIN (${executionShipping}) execution_shipping
      ON execution_shipping.cust_code=s.cust_code AND execution_shipping.executeorderno=s.executeorderno
      AND execution_shipping.pickup_point=s.pickup_point AND execution_shipping.receive_wh=s.receive_wh
      ${periods ? "AND execution_shipping.period_index=s.period_index" : ""}
    LEFT JOIN (${warehousePointsSql}) shipping ON shipping.warehouse_id=${resolvedWarehouse}
    LEFT JOIN (${warehousePointsSql}) receiving ON receiving.warehouse_id=s.receive_wh`;
  const lines = `${cohort}
    WHERE s.detailstatus=10 AND s.is_stat='1'
      AND (s.orderstatus<>90 OR s.orderstatus IS NULL)
      AND (${factoryTransfer})=0
      AND (s.change_order_qty IS NOT NULL OR s.dms_last_update_qty IS NOT NULL
        OR s.need_qty_origin IS NOT NULL)`;
  const invalid2 = `NULLIF(TRIM(cust_code),'') IS NULL
      OR NULLIF(TRIM(cust_order_no),'') IS NULL OR NULLIF(TRIM(material_code),'') IS NULL
      OR orderstatus IS NULL`;
  const classified = `SELECT ${periods ? "period_index," : ""}cust_code,cust_order_no,material_code,cust_name,region_name,province_region_name,
    requested_qty,effective_qty,
    CASE WHEN requested_qty>=0 THEN ABS(requested_qty-effective_qty) ELSE 0 END AS difference_qty,
    CASE WHEN requested_qty>=0 THEN ABS(requested_qty-effective_qty) ELSE 0 END AS changed_quantity,
    CASE WHEN ${invalid2} THEN 1 ELSE 0 END AS invalid_denominator,
    CASE WHEN ${invalid2} THEN 1 ELSE 0 END AS invalid_line
    FROM (${lines}) amendment_lines`;
  const events = `SELECT ${periods ? "period_index," : ""}cust_code,cust_order_no,material_code,cust_name AS name,
    region_name AS region,province_region_name AS province,
    CASE WHEN invalid_line=0 THEN changed_quantity ELSE 0 END AS change_numerator,
    effective_qty AS change_denominator,invalid_denominator,invalid_line AS invalid_change,
    CASE WHEN invalid_line>0 THEN difference_qty ELSE 0 END AS unknown_quantity
    FROM (${classified}) classified_details`;
  const selected = { cohort, lines, classified, events }[stage];
  if (!selected) throw new Error("Unknown amendment query stage");
  return selected;
}
function aggregateAmendmentSql(events, customer = false, periods = false) {
  return `SELECT ${periods ? "period_index," : ""}${customer ? "region,province,cust_code AS customer,MAX(name) AS name" : "'2' AS kind,region,province"},
    CASE WHEN SUM(invalid_change)=0 THEN SUM(change_numerator) END AS numerator,
    CASE WHEN SUM(invalid_denominator)=0 THEN SUM(change_denominator) END AS denominator,
    ${customer ? "" : `SUM(CASE WHEN invalid_change=0 THEN change_numerator ELSE 0 END) AS sample_numerator,
    SUM(CASE WHEN invalid_change=0 THEN change_denominator ELSE 0 END) AS sample_denominator,
    SUM(CASE WHEN invalid_change=0 THEN 1 ELSE 0 END) AS sample_records,`}
    SUM(unknown_quantity) AS unknown_quantity,
    COUNT(*) AS records,SUM(invalid_change) AS invalid
    FROM (${events}) sku_events GROUP BY ${periods ? "period_index," : ""}region,province${customer ? ",cust_code" : ""}`;
}

// business/inventory-orderworkbench/sku-cancellations.mjs
var cancellationWarehousesSql = ontimeWarehousesSql;
var cancellationWarehouseRecoverySql = `SELECT t.executeorderno,t.cust_code,
  MAX(NULLIF(TRIM(t.fromorderno),'')) AS fromorderno,
  MAX(NULLIF(TRIM(t.receive_wh),'')) AS receive_wh,
  MAX(NULLIF(TRIM(t.deliver_wh),'')) AS deliver_wh
  FROM agents_scm_order_trace_final_di t INNER JOIN
    (SELECT executeorderno,cust_code,MAX(update_time) AS updated
      FROM agents_scm_order_trace_final_di GROUP BY executeorderno,cust_code) latest
    ON latest.executeorderno=t.executeorderno AND latest.cust_code=t.cust_code AND latest.updated=t.update_time
  GROUP BY t.executeorderno,t.cust_code
  HAVING COUNT(NULLIF(TRIM(t.fromorderno),''))=COUNT(*)
    AND COUNT(DISTINCT NULLIF(TRIM(t.fromorderno),''))=1
    AND COUNT(NULLIF(TRIM(t.receive_wh),''))=COUNT(*)
    AND COUNT(DISTINCT NULLIF(TRIM(t.receive_wh),''))=1
    AND COUNT(NULLIF(TRIM(t.deliver_wh),''))=COUNT(*)
    AND COUNT(DISTINCT NULLIF(TRIM(t.deliver_wh),''))=1
    AND MAX(NULLIF(TRIM(t.deliver_wh),''))<>'*'`;
var fields = [
  "cust_code",
  "cust_order_no",
  "executeorderno",
  "executeorderlineno",
  "material_code",
  "belong_base",
  "region_name",
  "province_region_name",
  "cust_name",
  "header_addtime",
  "latestsendcardate",
  "orderstatus",
  "dms_last_update_qty",
  "change_order_qty",
  "need_qty_origin",
  "createsource",
  "is_virtual",
  "timeout_code",
  "warehouseid",
  "receive_wh",
  "pickup_point",
  "warehouse_classify"
];
var project = (alias) => fields.map((field) => `${alias}.${field}`).join(",");
var cancellationSnapshotColumns = [...fields, "canceltime", "detailstatus"];
var quantityFields = ["change_order_qty", "dms_last_update_qty", "need_qty_origin"];
var lineKeys = [
  "cust_code",
  "cust_order_no",
  "executeorderno",
  "executeorderlineno",
  "material_code",
  "belong_base"
];
var executionLineKeys = lineKeys.filter((field) => field !== "belong_base");
var sameQuantityLine = lineKeys.map(
  (key) => `(CASE WHEN h.${key} IS NULL THEN 'N' ELSE CONCAT('V',h.${key}) END)=(CASE WHEN dq.${key} IS NULL THEN 'N' ELSE CONCAT('V',dq.${key}) END)`
).join(" AND ");
var sameHeader = ["cust_code", "cust_order_no", "executeorderno", "belong_base"].map(
  (key) => `(CASE WHEN h.${key} IS NULL THEN 'N' ELSE CONCAT('V',h.${key}) END)=(CASE WHEN d.${key} IS NULL THEN 'N' ELSE CONCAT('V',d.${key}) END)`
).join(" AND ");
var sameSupplementLine = lineKeys.map(
  (key) => `(CASE WHEN d.${key} IS NULL THEN 'N' ELSE CONCAT('V',d.${key}) END)=(CASE WHEN line_seen.${key} IS NULL THEN 'N' ELSE CONCAT('V',line_seen.${key}) END)`
).join(" AND ");
function cancellationEventsSql({ dailySource: dailySource2, dailyOnly: dailyOnly2, periods = false }) {
  const dailyQuantities = `SELECT ${lineKeys.join(",")},
    ${quantityFields.map(
    (field) => `CASE WHEN COUNT(${field})=COUNT(*) AND COUNT(DISTINCT ${field})=1
      THEN MAX(${field}) END AS ${field},
      CASE WHEN COUNT(${field})>0 AND (COUNT(${field})<>COUNT(*) OR COUNT(DISTINCT ${field})<>1)
      THEN 1 ELSE 0 END AS ${field}_conflict`
  ).join(",")}
    FROM agents_scm_execute_detail_d WHERE (:gea_p900='' OR :gea_p900='\u90D1\u5DDE' OR belong_base=:gea_p900)
    GROUP BY ${lineKeys.join(",")}`;
  const recoveredFields = fields.map(
    (field) => quantityFields.includes(field) ? `COALESCE(h.${field},dq.${field}) AS ${field}` : field === "latestsendcardate" ? "COALESCE(h.latestsendcardate,d.latestsendcardate) AS latestsendcardate" : field === "pickup_point" ? "CASE WHEN h.pickup_point IS NULL OR TRIM(h.pickup_point) IN ('','*') THEN d.pickup_point ELSE h.pickup_point END AS pickup_point" : `h.${field}`
  ).join(",");
  const quantityConflict = `CASE ${quantityFields.map(
    (field) => `WHEN h.${field} IS NULL AND dq.${field}_conflict>0 THEN 1
      WHEN COALESCE(h.${field},dq.${field}) IS NOT NULL THEN 0`
  ).join(" ")} ELSE 0 END`;
  const source = `SELECT ${recoveredFields},${quantityConflict} AS quantity_conflict,COALESCE(h.canceltime,d.canceltime) AS cancelled
    FROM agents_scm_execute_detail_hourly_d h
    LEFT JOIN (
      SELECT cust_code,cust_order_no,executeorderno,belong_base,
        CASE WHEN COUNT(DISTINCT canceltime)=1 THEN MAX(canceltime) END AS canceltime,
        CASE WHEN COUNT(DISTINCT latestsendcardate)=1 THEN MAX(latestsendcardate) END AS latestsendcardate,
        CASE WHEN COUNT(DISTINCT NULLIF(TRIM(pickup_point),''))=1
          AND MAX(NULLIF(TRIM(pickup_point),''))<>'*'
          THEN MAX(NULLIF(TRIM(pickup_point),'')) END AS pickup_point
      FROM agents_scm_execute_detail_d WHERE (:gea_p900='' OR :gea_p900='\u90D1\u5DDE' OR belong_base=:gea_p900)
      GROUP BY cust_code,cust_order_no,executeorderno,belong_base
    ) d ON ${sameHeader}
    LEFT JOIN (${dailyQuantities}) dq ON ${sameQuantityLine}
    WHERE (:gea_p900='' OR :gea_p900='\u90D1\u5DDE' OR h.belong_base=:gea_p900)
    UNION ALL SELECT ${project("d")},0 AS quantity_conflict,d.canceltime AS cancelled FROM ${dailySource2}
    LEFT JOIN agents_scm_execute_detail_hourly_d line_seen ON ${sameSupplementLine}
    WHERE (:gea_p900='' OR :gea_p900='\u90D1\u5DDE' OR d.belong_base=:gea_p900)
      AND (${dailyOnly2} OR (d.detailstatus=10 AND line_seen.executeorderno IS NULL))`;
  const details = `SELECT ${fields.map((field) => executionLineKeys.includes(field) ? field : `MAX(${field}) AS ${field}`).join(",")},
    MAX(quantity_conflict) AS quantity_conflict,MAX(cancelled) AS cancelled,COUNT(*) AS source_rows,
    MIN(CASE WHEN orderstatus=90 THEN cancelled ELSE header_addtime END) AS first_business_time,
    MAX(CASE WHEN orderstatus=90 THEN cancelled ELSE header_addtime END) AS last_business_time
    FROM (SELECT DISTINCT ${fields.join(",")},quantity_conflict,cancelled FROM cancellation_source source_observations) distinct_lines
    GROUP BY ${executionLineKeys.join(",")}`;
  const missingWarehouse = "NULLIF(NULLIF(TRIM(s.warehouseid),''),'*') IS NULL AND t.deliver_wh IS NULL";
  const sourceClass = `CASE
    WHEN TRIM(s.warehouse_classify) IN ('01','\u5DE5\u5382\u6210\u54C1\u4ED3') THEN '01'
    WHEN TRIM(s.warehouse_classify) IN ('02','\u5DE5\u5382\u5916\u79DF\u5E93','\u5DE5\u5382\u5916\u79DF\u4ED3') THEN '02'
    WHEN TRIM(s.warehouse_classify) IN ('03','20','21','OEM\u6210\u54C1\u4ED3','\u5206\u4ED3\u6210\u54C1\u4ED3','\u7535\u5546\u4ED3','\u5DE5\u5382\u4E2D\u8F6C\u4ED3') THEN 'other'
    ELSE NULL END`;
  const senderClass = `CASE WHEN ${missingWarehouse} THEN (${sourceClass}) ELSE f.warehouse_classify END`;
  const senderPickup = `CASE WHEN ${missingWarehouse}
    THEN NULLIF(NULLIF(TRIM(s.pickup_point),''),'*') ELSE f.pickup_point END`;
  const effectiveQuantity = "CASE WHEN s.quantity_conflict>0 THEN NULL ELSE COALESCE(s.change_order_qty,s.dms_last_update_qty,s.need_qty_origin) END";
  const quantities = `SELECT ${fields.map((field) => "s." + field).join(",")},s.cancelled,s.source_rows,
    s.first_business_time,s.last_business_time,
    NULLIF(NULLIF(TRIM(s.pickup_point),''),'*') AS scope_pickup_point,
    ${effectiveQuantity} AS effective_qty,
    CASE WHEN s.orderstatus=90 THEN s.cancelled ELSE s.header_addtime END AS business_time,
    s.latestsendcardate - INTERVAL '7' DAY AS locked,
    CASE WHEN NULLIF(TRIM(s.receive_wh),'') IS NULL THEN 0
      WHEN (${senderClass}) NOT IN ('01','02') OR r.warehouse_classify NOT IN ('01','02') THEN 0
      WHEN (${senderPickup}) IS NOT NULL AND r.pickup_point IS NOT NULL AND (${senderPickup})<>r.pickup_point THEN 0
      WHEN (${senderClass}) IN ('01','02') AND r.warehouse_classify IN ('01','02')
        AND (${senderPickup}) IS NOT NULL AND r.pickup_point IS NOT NULL
        THEN CASE WHEN (${senderPickup})=r.pickup_point THEN 1 ELSE 0 END
      ELSE NULL END AS short_transfer
    FROM (${details}) s LEFT JOIN (${cancellationWarehouseRecoverySql}) t
      ON s.source_rows=1 AND TRIM(s.warehouseid)='*' AND t.cust_code=s.cust_code
      AND (${effectiveQuantity})>0
      AND t.executeorderno=s.executeorderno AND t.fromorderno=s.cust_order_no AND t.receive_wh=s.receive_wh
    LEFT JOIN (${cancellationWarehousesSql}) f ON f.warehouseid=COALESCE(t.deliver_wh,s.warehouseid)
      LEFT JOIN (${cancellationWarehousesSql}) r ON r.warehouseid=s.receive_wh`;
  const inPeriod = (start, end) => `(q.business_time>=${start} AND q.business_time<${end})
    OR (q.source_rows>1 AND q.first_business_time<${end} AND q.last_business_time>=${start})
    OR (q.business_time IS NULL AND (q.header_addtime<${end} OR q.header_addtime IS NULL))`;
  const cohort = `SELECT ${periods ? "rw.period_index," : ""}q.cust_code,q.cust_order_no,q.executeorderno,
    q.executeorderlineno,q.material_code,q.cust_name AS name,q.region_name AS region,q.province_region_name AS province,
    q.header_addtime AS created,q.latestsendcardate AS latest_departure,q.orderstatus AS status,
    q.cancelled,q.business_time,q.locked,q.effective_qty,q.source_rows,q.short_transfer,q.scope_pickup_point
    FROM (${quantities}) q ${periods ? `INNER JOIN report_windows rw ON rw.enabled=TRUE AND (${inPeriod("rw.start_date", "rw.end_date")})` : ""}
    WHERE ${periods ? "1=1" : "(" + inPeriod(":gea_p1", ":gea_p2") + ")"}
      AND q.latestsendcardate IS NOT NULL
      AND (:gea_p900<>'\u90D1\u5DDE' OR q.scope_pickup_point='01' OR q.scope_pickup_point IS NULL OR q.source_rows<>1)
      AND (q.source_rows<>1 OR TRIM(q.createsource)='20')
      AND (q.source_rows<>1 OR q.is_virtual IS NULL OR q.is_virtual NOT IN (1,2))
      AND (q.source_rows<>1 OR q.timeout_code IS NULL OR TRIM(q.timeout_code) NOT IN ('14','16'))
      AND (q.source_rows<>1 OR q.short_transfer IS NULL OR q.short_transfer=0)
      AND (q.source_rows<>1 OR q.orderstatus IS NULL OR q.orderstatus<>90 OR q.cancelled IS NULL
        OR q.cancelled>=q.locked)
      AND (q.source_rows<>1 OR q.orderstatus IS NULL OR q.orderstatus<>90 OR q.cancelled IS NULL
        OR q.header_addtime IS NULL OR q.cancelled<q.header_addtime
        OR q.cancelled>q.header_addtime + INTERVAL '12' HOUR)`;
  const classified = `SELECT ${periods ? "period_index," : ""}cust_code,cust_order_no,executeorderno,executeorderlineno,
    material_code,name,region,province,effective_qty,
    CASE WHEN status=90 AND cancelled>=locked AND cancelled>created + INTERVAL '12' HOUR
      THEN effective_qty ELSE 0 END AS cancel_numerator,
    CASE WHEN source_rows<>1 OR NULLIF(TRIM(cust_code),'') IS NULL
      OR NULLIF(TRIM(cust_order_no),'') IS NULL OR NULLIF(TRIM(executeorderno),'') IS NULL
      OR executeorderlineno IS NULL OR NULLIF(TRIM(material_code),'') IS NULL
      OR created IS NULL OR status IS NULL OR effective_qty IS NULL OR effective_qty<0
      OR (:gea_p900='\u90D1\u5DDE' AND scope_pickup_point IS NULL)
      OR (effective_qty<>0 AND short_transfer IS NULL)
      OR (status=90 AND (cancelled IS NULL OR cancelled<created OR latest_departure IS NULL))
      THEN 1 ELSE 0 END AS invalid_cancel
    FROM (${cohort}) cancellation_cohort`;
  return `WITH cancellation_source AS (${source}) SELECT ${periods ? "period_index," : ""}cust_code,cust_order_no,executeorderno,executeorderlineno,
    material_code,name,region,province,cancel_numerator,effective_qty AS cancel_denominator,invalid_cancel
    FROM (${classified}) classified_cancellations`.replace(/\s+/g, " ").trim();
}
function aggregateCancellationSql(events, { periods = false, sourceName = false } = {}) {
  return `SELECT ${periods ? "period_index," : ""}'1' AS kind,region,province,
    CASE WHEN SUM(invalid_cancel)=0 THEN SUM(cancel_numerator) END AS numerator,
    CASE WHEN SUM(invalid_cancel)=0 THEN SUM(cancel_denominator) END AS denominator,
    SUM(CASE WHEN invalid_cancel=0 THEN cancel_numerator ELSE 0 END) AS sample_numerator,
    SUM(CASE WHEN invalid_cancel=0 THEN cancel_denominator ELSE 0 END) AS sample_denominator,
    SUM(CASE WHEN invalid_cancel=0 THEN 1 ELSE 0 END) AS sample_records,
    SUM(CASE WHEN invalid_cancel>0 THEN cancel_denominator ELSE 0 END) AS unknown_quantity,
    COUNT(*) AS records,SUM(invalid_cancel) AS invalid
    FROM ${sourceName ? events : "(" + events + ")"} cancellation_events
    GROUP BY ${periods ? "period_index," : ""}region,province`;
}

// business/inventory-orderworkbench/document-queries.mjs
var sameExecution = ["cust_code", "cust_order_no", "executeorderno", "belong_base"].map(
  (key) => `(CASE WHEN seen.${key} IS NULL THEN 'N' ELSE CONCAT('V',seen.${key}) END)=(CASE WHEN d.${key} IS NULL THEN 'N' ELSE CONCAT('V',d.${key}) END)`
).join(" AND ");
var dailySource = `agents_scm_execute_detail_d d LEFT JOIN
  (SELECT DISTINCT cust_code,cust_order_no,executeorderno,belong_base,1 AS header_present
   FROM agents_scm_execute_detail_hourly_d) seen ON ${sameExecution}`;
var dailyOnly = "seen.header_present IS NULL";
var orderEventRowsSql = `SELECT h.cust_code,h.cust_order_no,h.belong_base,
  h.region_name,h.province_region_name,h.cust_name,h.header_addtime,
  h.requireddeliverytime,h.orderstatus,
  COALESCE(h.canceltime,d.canceltime) AS canceltime,
  COALESCE(h.custchangetime,d.custchangetime) AS custchangetime
  FROM agents_scm_execute_detail_hourly_d h LEFT JOIN (
    SELECT cust_code,cust_order_no,executeorderno,belong_base,
      CASE WHEN COUNT(DISTINCT canceltime)=1 THEN MAX(canceltime) END AS canceltime,
      CASE WHEN COUNT(DISTINCT custchangetime)=1 THEN MAX(custchangetime) END AS custchangetime
    FROM agents_scm_execute_detail_d
    WHERE (:gea_p900='' OR belong_base=:gea_p900)
    GROUP BY cust_code,cust_order_no,executeorderno,belong_base
  ) d ON d.cust_code=h.cust_code AND d.cust_order_no=h.cust_order_no
    AND d.executeorderno=h.executeorderno AND d.belong_base=h.belong_base
  WHERE (:gea_p900='' OR h.belong_base=:gea_p900)
  UNION ALL
  SELECT d.cust_code,d.cust_order_no,d.belong_base,
    d.region_name,d.province_region_name,d.cust_name,d.header_addtime,
    d.requireddeliverytime,d.orderstatus,d.canceltime,d.custchangetime
  FROM ${dailySource}
  WHERE (:gea_p900='' OR d.belong_base=:gea_p900) AND ${dailyOnly}`;
var cancellationEvents = cancellationEventsSql({
  dailySource,
  dailyOnly
});
var amendmentEventsSql = skuAmendmentEventsSql({});
var amendmentCohortSql = skuAmendmentEventsSql({
  stage: "cohort"
});
var amendmentClassifiedSql = skuAmendmentEventsSql({
  stage: "classified"
});
var cancellationChangesSql = aggregateCancellationSql(cancellationEvents);
var amendmentChangesSql = aggregateAmendmentSql(amendmentEventsSql);
var changesSql = cancellationChangesSql + " UNION ALL " + amendmentChangesSql;
var customersSql = aggregateAmendmentSql(amendmentEventsSql, true);
var traceHeadersSql = `SELECT t.executeorderno,t.cust_code,
  CASE WHEN COUNT(DISTINCT COALESCE(t.lastshipmenttime,t.wms_order_close_time))=1
    AND COUNT(COALESCE(t.lastshipmenttime,t.wms_order_close_time))=COUNT(*)
    THEN MAX(COALESCE(t.lastshipmenttime,t.wms_order_close_time)) END AS shipped,
  CASE WHEN COUNT(DISTINCT COALESCE(t.gpsisinraildate_to,t.arriveconfirm_time))=1
    AND COUNT(COALESCE(t.gpsisinraildate_to,t.arriveconfirm_time))=COUNT(*)
    THEN MAX(COALESCE(t.gpsisinraildate_to,t.arriveconfirm_time)) END AS arrived,
  CASE WHEN COUNT(t.requireddeliverytimebak)=COUNT(*) AND COUNT(t.requireddeliverytime)=COUNT(*)
    AND COUNT(CAST(t.expected_deliv_time AS DATETIME))=COUNT(*)
    AND COUNT(DISTINCT t.requireddeliverytimebak)=1 AND COUNT(DISTINCT t.requireddeliverytime)=1
    AND COUNT(DISTINCT t.expected_deliv_time)=1
    THEN GREATEST(MAX(t.requireddeliverytimebak),MAX(t.requireddeliverytime),MAX(CAST(t.expected_deliv_time AS DATETIME))) + INTERVAL '12' HOUR END AS deadline
  FROM agents_scm_order_trace_final_di t INNER JOIN
    (SELECT executeorderno,cust_code,MAX(update_time) AS updated FROM agents_scm_order_trace_final_di GROUP BY executeorderno,cust_code) latest
    ON latest.executeorderno=t.executeorderno AND latest.cust_code=t.cust_code AND latest.updated=t.update_time
  GROUP BY t.executeorderno,t.cust_code`;
var executionRows = `SELECT cust_order_no,cust_code,material_code,executeorderno,
  belong_base,detailstatus,is_stat,product_item FROM agents_scm_execute_detail_hourly_d
  WHERE (:gea_p900='' OR belong_base=:gea_p900)
  UNION ALL SELECT d.cust_order_no,d.cust_code,d.material_code,d.executeorderno,
    d.belong_base,d.detailstatus,d.is_stat,d.product_item FROM ${dailySource}
  WHERE (:gea_p900='' OR d.belong_base=:gea_p900) AND ${dailyOnly}`;
var executionProductsSql = `SELECT cust_order_no,cust_code,material_code,executeorderno,
  belong_base,detailstatus,
  CASE WHEN COUNT(DISTINCT NULLIF(TRIM(product_item),''))=1
    THEN MAX(NULLIF(TRIM(product_item),'')) END AS product_item
  FROM (${executionRows}) execution_rows
  WHERE detailstatus=10 AND is_stat='1' AND (:gea_p900='' OR belong_base=:gea_p900)
  GROUP BY cust_order_no,cust_code,material_code,executeorderno,belong_base,detailstatus`;
var fulfillmentCohort = `SELECT fromorderno,cust_code,new_material_code
  FROM agents_order_execute_isontime_mi
  WHERE exp_flag='\u5426' AND (order_qty_origin>0 OR need_qty_origin>0)
    AND (:gea_p900='' OR belong_base=:gea_p900)
  GROUP BY fromorderno,cust_code,new_material_code
  HAVING MAX(fromorderno_month)>=:gea_p1 AND MIN(fromorderno_month)<:gea_p2`;
var fulfillmentKey = (field) => `CASE WHEN ${field} IS NULL THEN 'N' ELSE CONCAT('V',${field}) END`;
var fulfillmentCohortJoin = ["fromorderno", "cust_code", "new_material_code"].map((field) => `${fulfillmentKey("source." + field)}=${fulfillmentKey("cohort." + field)}`).join(" AND ");
var mergedProducts = `SELECT fromorderno,cust_code,new_material_code AS sku,
  MAX(belong_base) AS base,MAX(product_categ_name) AS category,MAX(pinxiang) AS item,
  MAX(new_material_name) AS name,MAX(need_qty_origin) AS demand,MAX(qtyshipped) AS sent,
  MIN(fromorderno_month) AS period_start,MAX(fromorderno_month) AS period_end,
  CASE WHEN COUNT(*)=1 AND COUNT(need_qty_origin)=1 AND COUNT(qtyshipped)=1
    AND COUNT(fromorderno_month)=1 AND MAX(need_qty_origin)>=0 AND MAX(qtyshipped)>=0
    AND NULLIF(TRIM(fromorderno),'') IS NOT NULL AND NULLIF(TRIM(cust_code),'') IS NOT NULL
    AND NULLIF(TRIM(new_material_code),'') IS NOT NULL THEN 0 ELSE 1 END AS invalid
  FROM (SELECT DISTINCT source.fromorderno,source.cust_code,source.new_material_code,source.belong_base,source.product_categ_name,source.pinxiang,
    source.new_material_name,source.need_qty_origin,source.qtyshipped,source.executeorderno,source.fromorderno_month
    FROM agents_order_execute_isontime_mi source INNER JOIN (${fulfillmentCohort}) cohort ON ${fulfillmentCohortJoin}
    WHERE source.exp_flag='\u5426' AND (source.order_qty_origin>0 OR source.need_qty_origin>0)
      AND (:gea_p900='' OR source.belong_base=:gea_p900)) cleaned
  GROUP BY fromorderno,cust_code,new_material_code`;
var fulfillmentExecutionsSql = `SELECT DISTINCT m.fromorderno,m.cust_code,m.new_material_code,
  TRIM(child_execution) AS executeorderno
  FROM agents_order_execute_isontime_mi m
  LATERAL VIEW explode_split(COALESCE(m.executeorderno,''),',') children AS child_execution
  WHERE m.exp_flag='\u5426' AND (m.order_qty_origin>0 OR m.need_qty_origin>0)
    AND (:gea_p900='' OR m.belong_base=:gea_p900)`;
var fulfillmentShippingSql = `SELECT e.fromorderno,e.cust_code,e.new_material_code,
  CASE WHEN COUNT(t.shipped)=COUNT(*) THEN MAX(t.shipped) END AS shipped,
  SUM(CASE WHEN t.executeorderno IS NULL THEN 1 ELSE 0 END) AS missing_trace
  FROM (${fulfillmentExecutionsSql}) e LEFT JOIN (${traceHeadersSql}) t
    ON t.executeorderno=e.executeorderno AND t.cust_code=e.cust_code
  GROUP BY e.fromorderno,e.cust_code,e.new_material_code`;
var ordersSql = `SELECT m.base,m.category,m.item,m.sku,MAX(m.name) AS name,
  SUM(m.demand) AS demand,
  SUM(GREATEST(m.demand-LEAST(m.sent,m.demand),0)) AS shortage,
  SUM(CASE WHEN m.invalid=0 THEN m.demand ELSE 0 END) AS sample_demand,
  SUM(CASE WHEN m.invalid=0 THEN GREATEST(m.demand-LEAST(m.sent,m.demand),0) ELSE 0 END) AS sample_shortage,
  SUM(CASE WHEN m.invalid=0 THEN 1 ELSE 0 END) AS sample_records,
  COUNT(*) AS records,SUM(m.invalid) AS invalid,
  0 AS missing_ship_date,0 AS unmatched_order,0 AS missing_trace,0 AS missing_ship_time
  FROM (${mergedProducts}) m
  WHERE m.period_end>=:gea_p1 AND m.period_start<:gea_p2
  GROUP BY m.base,m.category,m.item,m.sku`;
var ontimeExecutionProductsSql = `SELECT cust_order_no,cust_code,material_code,executeorderno,
  belong_base,detailstatus,
  CASE WHEN COUNT(DISTINCT NULLIF(TRIM(product_item),''))=1 THEN MAX(NULLIF(TRIM(product_item),'')) END AS product_item,
  MAX(CASE WHEN is_virtual IN (1,2) THEN 1 ELSE 0 END) AS virtual_excluded
  FROM (${executionRows.replace(
  "belong_base,detailstatus,is_stat,product_item FROM",
  "belong_base,detailstatus,is_stat,product_item,is_virtual FROM"
).replace(
  "d.belong_base,d.detailstatus,d.is_stat,d.product_item FROM",
  "d.belong_base,d.detailstatus,d.is_stat,d.product_item,d.is_virtual FROM"
)}) execution_rows
  WHERE (:gea_p900='' OR belong_base=:gea_p900)
  GROUP BY cust_order_no,cust_code,material_code,executeorderno,belong_base,detailstatus`;
var {
  ontimeSql,
  ontimeSummarySql,
  ontimePeriodSummarySql,
  ontimeAgentSummarySql,
  ontimeAgentDetailsSql
} = createOntimeQueries(ontimeExecutionProductsSql);

// business/inventory-orderworkbench/base-scope.mjs
var workbenchBaseSql = (field) => `CASE WHEN TRIM(${field}) IN ('\u6210\u90FD\u5206\u4ED3','\u4E0A\u6D77\u5206\u4ED3') THEN '\u897F\u5357' ELSE ${field} END`;
function normalizeWorkbenchBase(value = "") {
  if (typeof value !== "string") throw Error("INVALID_ORDER_METRIC_SCOPE");
  const base = value.trim();
  if (["\u5168\u56FD", "\u5168\u56FD\u6C47\u603B", "\u5168\u90E8\u57FA\u5730"].includes(base)) return "";
  if (["\u6210\u90FD\u5206\u4ED3", "\u4E0A\u6D77\u5206\u4ED3"].includes(base)) return "\u897F\u5357";
  return /^(郑州|华东|华南|西南|遂平|濮阳)基地$/.exec(base)?.[1] ?? base;
}

// business/inventory-orderworkbench/plan-policy.mjs
var missingPlanPolicySql = "SELECT NULL AS initial_day,NULL AS corrected_day,NULL AS rolling_day";
function selectedPlanSql(initial, corrected, rolling, next) {
  const fields2 = ["initial_day", "corrected_day", "rolling_day"];
  const valid = fields2.map(
    (field) => `plan_policy.${field} BETWEEN 1 AND 31 AND plan_policy.${field}=CAST(plan_policy.${field} AS INTEGER)`
  ).concat([
    "plan_policy.initial_day<plan_policy.corrected_day",
    "plan_policy.corrected_day<plan_policy.rolling_day"
  ]).join(" AND ");
  const day = "CAST(SUBSTRING(CAST(the_date AS CHAR),9,2) AS INTEGER)";
  return `CASE WHEN ${valid} THEN CASE WHEN ${day}<=plan_policy.initial_day THEN ${initial}
    WHEN ${day}<=plan_policy.corrected_day THEN ${corrected}
    WHEN ${day}<=plan_policy.rolling_day THEN ${rolling} ELSE ${next} END END`;
}

// business/inventory-orderworkbench/queries.mjs
var attributionSources = `SELECT belong_base,material_code,director,product_item,header_addtime AS attribution_date FROM agents_scm_execute_detail_d
          WHERE header_addtime>=:gea_p1 AND header_addtime<:gea_p2
        UNION ALL SELECT d.belong_base,d.material_code,d.director,d.product_item,shipment.shipped_at AS attribution_date
          FROM agents_scm_execute_detail_d d INNER JOIN (${amendmentShipmentSql}) shipment
            ON shipment.executeorderno=d.executeorderno AND shipment.cust_code=d.cust_code
          WHERE shipment.shipped_at>=:gea_p1 AND shipment.shipped_at<:gea_p2
        UNION ALL SELECT belong_base,material_code,director,product_item,header_addtime AS attribution_date FROM agents_scm_execute_detail_hourly_d
          WHERE header_addtime>=:gea_p1 AND header_addtime<:gea_p2
        UNION ALL SELECT belong_base,material_code,NULL AS director,product_item,the_date AS attribution_date FROM agents_scm_stock_detail_d
          WHERE the_date>=:gea_p1 AND the_date<:gea_p2
        UNION ALL SELECT belong_base,new_material_code AS material_code,NULL AS director,pinxiang AS product_item,fromorderno_month AS attribution_date FROM agents_order_execute_isontime_mi
          WHERE fromorderno_month>=:gea_p1 AND fromorderno_month<:gea_p2`;
var dictionary = `SELECT material_code AS sku,
  CASE WHEN COUNT(DISTINCT product_categ_name)=1 THEN MAX(product_categ_name) END AS category,
  CASE WHEN COUNT(DISTINCT material_group_name)=1 THEN MAX(material_group_name) END AS item
  FROM agents_scm_material_in_out_summary_d GROUP BY material_code`;
var stockProjection = `SELECT COALESCE(s.belong_base,b.belong_base) AS base,COALESCE(s.material_code,b.material_code) AS sku,
      d.category,COALESCE(s.item,b.item) AS item,COALESCE(s.name,b.name) AS name,
      COALESCE(b.stock_date,s.stock_date) AS stock_date,s.plan_month_offset,s.source_rows,b.available,b.inventory,b.aged,s.sales_plan,s.transfer_plan,
      NULL AS daily_demand,
      b.inventory AS national_inventory,s.sales_plan AS national_sales_plan,
      CASE WHEN b.stock_date IS NOT NULL THEN 1 ELSE 0 END AS national_stock_records,
      CASE WHEN s.source_rows IS NOT NULL THEN 1 ELSE 0 END AS national_plan_records,
      COALESCE(b.invalid,0) AS national_stock_invalid,
      CASE WHEN s.source_rows>1 THEN 1 ELSE COALESCE(s.sales_invalid,0) END AS national_plan_invalid,
      s.transfer_plan AS base_transfer_plan,
      CASE WHEN s.source_rows>1 THEN 1 ELSE COALESCE(s.sales_invalid,0)+COALESCE(s.transfer_invalid,0) END AS base_plan_invalid,
      CASE WHEN b.inventory IS NULL OR b.invalid>0 OR s.source_rows IS NULL OR s.sales_invalid>0 OR s.transfer_invalid>0 THEN 1 ELSE 0 END AS invalid
`;
var salesPlan = selectedPlanSql(
  "main_sales_plan_v1",
  "main_sales_plan_adj",
  "roll_sales_plan",
  "next_month_sales_plan"
);
var transferPlan = selectedPlanSql(
  "transfer_out_plan_v1",
  "transfer_out_plan_adj",
  "transfer_out_plan_roll",
  "next_month_out_plan"
);
var stockPlans = `SELECT belong_base,material_code,MAX(product_item) AS item,MAX(material_name) AS name,
        COUNT(*) AS source_rows,CAST(MAX(the_date) AS CHAR) AS stock_date,
        MAX(${selectedPlanSql("0", "0", "1", "1")}) AS plan_month_offset,
        SUM(CASE WHEN (${salesPlan}) IS NULL OR (${salesPlan})<0 THEN 1 ELSE 0 END) AS sales_invalid,
        SUM(CASE WHEN (${transferPlan}) IS NULL OR (${transferPlan})<0 THEN 1 ELSE 0 END) AS transfer_invalid,
        SUM(${salesPlan}) AS sales_plan,
        SUM(${transferPlan}) AS transfer_plan
        FROM agents_scm_stock_detail_d CROSS JOIN (${missingPlanPolicySql}) plan_policy
        WHERE the_date=(SELECT MAX(the_date) FROM agents_scm_stock_detail_d WHERE the_date>=:gea_p1 AND the_date<:gea_p2)
        GROUP BY belong_base,material_code`;
var stockBatches = `SELECT belong_base,material_code,MAX(material_name) AS name,NULL AS item,
        CONCAT(SUBSTRING(MAX(month_date),1,4),'-',SUBSTRING(MAX(month_date),5,2),'-',SUBSTRING(MAX(month_date),7,2)) AS stock_date,
        CASE WHEN COUNT(*)=1 THEN MAX(available_qty) END AS available,
        CASE WHEN COUNT(*)=1 THEN MAX(live_qty) END AS inventory,
        CASE WHEN COUNT(*)=1 THEN MAX(aged_qty) END AS aged,
        CASE WHEN COUNT(*)<>1 OR COUNT(live_qty)<>COUNT(*) THEN 1 ELSE 0 END AS invalid
        FROM (SELECT belong_base,material_code,material_name,
          REPLACE(CAST(the_date AS CHAR),'-','') AS month_date,
          available_stock AS available_qty,current_stock AS live_qty,current_stock_60 AS aged_qty
          FROM agents_scm_stock_detail_d) production_sales
        WHERE month_date=REPLACE(CAST((SELECT MAX(the_date) FROM agents_scm_stock_detail_d WHERE the_date>=:gea_p1 AND the_date<:gea_p2) AS CHAR),'-','')
        GROUP BY belong_base,material_code`;
var stockJoin = (inventoryOnly = false, scoped = false) => stockProjection + (inventoryOnly ? ` FROM stock_batches b LEFT JOIN stock_plans s` : ` FROM stock_plans s LEFT JOIN stock_batches b`) + ` ON (b.belong_base=s.belong_base OR (b.belong_base IS NULL AND s.belong_base IS NULL)) AND b.material_code=s.material_code
      LEFT JOIN stock_dictionary d ON d.sku=COALESCE(s.material_code,b.material_code)` + (scoped ? ` WHERE (:gea_p900='' OR ${workbenchBaseSql("COALESCE(s.belong_base,b.belong_base)")}=:gea_p900)` + (inventoryOnly ? " AND s.source_rows IS NULL" : "") : inventoryOnly ? " WHERE s.source_rows IS NULL" : "");
var ageBase = workbenchBaseSql("b.belong_base");
var workbenchQueries = {
  "ontime.agent.summary": {
    scoped: true,
    metricContract: ontimeMetricContract,
    columns: ["numerator", "denominator", "known", "pending", "late"],
    sql: ontimeAgentSummarySql
  },
  "ontime.agent.details": {
    scoped: true,
    metricContract: ontimeMetricContract,
    keys: ["order_no"],
    columns: ["order_no", "customer", "arrival_date", "ontime", "invalid"],
    sql: ontimeAgentDetailsSql
  },
  "amendment.summary": {
    scoped: true,
    metricContract: amendmentMetricContract,
    columns: ["numerator", "denominator", "records", "invalid"],
    sql: `SELECT CASE WHEN SUM(invalid_change)=0 THEN SUM(change_numerator) END AS numerator,
      CASE WHEN SUM(invalid_denominator)=0 THEN SUM(change_denominator) END AS denominator,
      COUNT(*) AS records,SUM(invalid_change) AS invalid
      FROM (${skuAmendmentEventsSql()}) approved_events`
  },
  "amendment.details": {
    scoped: true,
    metricContract: amendmentMetricContract,
    keys: ["executeorderno", "cust_code", "material_code", "effective_qty", "change_order_qty"],
    columns: [
      "executeorderno",
      "cust_order_no",
      "cust_code",
      "cust_name",
      "material_code",
      "header_addtime",
      "shipped_at",
      "pickup_point",
      "change_order_qty",
      "dms_last_update_qty",
      "need_qty_origin",
      "effective_qty",
      "changed_quantity"
    ],
    sql: `SELECT executeorderno,cust_order_no,cust_code,cust_name,material_code,header_addtime,shipped_at,pickup_point,change_order_qty,dms_last_update_qty,need_qty_origin,effective_qty,
      CASE WHEN requested_qty>=0 THEN ABS(requested_qty-effective_qty) ELSE 0 END AS changed_quantity
      FROM (${skuAmendmentEventsSql({ stage: "lines" })}) approved_lines`
  },
  orders: {
    keys: ["base", "category", "item", "sku"],
    columns: [
      "base",
      "category",
      "item",
      "sku",
      "name",
      "demand",
      "shortage",
      "sample_demand",
      "sample_shortage",
      "sample_records",
      "records",
      "invalid",
      "missing_ship_date",
      "unmatched_order",
      "missing_trace",
      "missing_ship_time"
    ],
    sql: ordersSql,
    scoped: true
  },
  ontime: {
    keys: ["order_no", "customer"],
    columns: ["order_no", "customer", "ontime", "arrival_date", "invalid", "members"],
    sql: ontimeSql,
    scoped: true
  },
  changes: {
    keys: ["kind", "region", "province"],
    columns: [
      "kind",
      "region",
      "province",
      "numerator",
      "denominator",
      "records",
      "invalid",
      "sample_numerator",
      "sample_denominator",
      "sample_records",
      "unknown_quantity"
    ],
    sql: changesSql,
    scoped: true
  },
  customers: {
    keys: ["region", "province", "customer"],
    columns: [
      "region",
      "province",
      "customer",
      "name",
      "numerator",
      "denominator",
      "records",
      "invalid",
      "unknown_quantity"
    ],
    sql: customersSql,
    scoped: true
  },
  stock: {
    keys: ["base", "sku"],
    columns: [
      "base",
      "sku",
      "category",
      "item",
      "name",
      "stock_date",
      "plan_month_offset",
      "source_rows",
      "available",
      "inventory",
      "aged",
      "sales_plan",
      "transfer_plan",
      "daily_demand",
      "invalid",
      "national_inventory",
      "national_sales_plan",
      "national_stock_records",
      "national_plan_records",
      "national_stock_invalid",
      "national_plan_invalid",
      "base_transfer_plan",
      "base_plan_invalid"
    ],
    sql: `WITH stock_plans AS (${stockPlans}), stock_batches AS (${stockBatches}),
      stock_dictionary AS (${dictionary}) ` + stockJoin() + " UNION ALL " + stockJoin(true)
  },
  ageDate: {
    scoped: true,
    columns: ["day"],
    sql: `SELECT REPLACE(CAST(MAX(b.the_date) AS CHAR),'-','') AS day FROM agents_scm_stock_detail_d b
      WHERE (:gea_p900='' OR ${ageBase}=:gea_p900)
        AND REPLACE(CAST(b.the_date AS CHAR),'-','')>=:gea_p1
        AND REPLACE(CAST(b.the_date AS CHAR),'-','')<:gea_p2`
  },
  ages: {
    scoped: true,
    keys: ["base", "sku"],
    columns: [
      "base",
      "sku",
      "category",
      "item",
      "snapshot_date",
      "stock_qty",
      "aged_qty",
      "records",
      "excluded",
      "invalid"
    ],
    sql: `SELECT ${ageBase} AS base,b.material_code AS sku,MAX(d.category) AS category,
        CASE WHEN MAX(s.names)>1 THEN NULL ELSE COALESCE(MAX(s.item),MAX(m.item)) END AS item,
      MAX(b.dt) AS snapshot_date,
      SUM(b.inv_qty) AS stock_qty,
      SUM(b.current_stock_60) AS aged_qty,
      COUNT(*) AS records,SUM(CASE WHEN b.inv_qty=0 THEN 1 ELSE 0 END) AS excluded,
      SUM(b.source_invalid) AS invalid
      FROM (SELECT belong_base,material_code,REPLACE(CAST(the_date AS CHAR),'-','') AS dt,
        CASE WHEN COUNT(*)=1 THEN MAX(current_stock) END AS inv_qty,
        CASE WHEN COUNT(*)=1 THEN MAX(current_stock_60) END AS current_stock_60,
        CASE WHEN COUNT(*)<>1 OR COUNT(current_stock)<>COUNT(*) OR COUNT(current_stock_60)<>COUNT(*) THEN 1 ELSE 0 END AS source_invalid
        FROM agents_scm_stock_detail_d GROUP BY belong_base,material_code,the_date) b
      LEFT JOIN (${dictionary}) d ON d.sku=b.material_code
      LEFT JOIN (SELECT material_code AS sku,
        COUNT(DISTINCT NULLIF(TRIM(product_item),'')) AS names,
        CASE WHEN COUNT(DISTINCT NULLIF(TRIM(product_item),''))=1 THEN MAX(NULLIF(TRIM(product_item),'')) END AS item
        FROM agents_scm_stock_detail_d WHERE the_date=:gea_p4 GROUP BY material_code) s ON s.sku=b.material_code
      LEFT JOIN (SELECT new_material_code AS sku,
        CASE WHEN COUNT(DISTINCT NULLIF(TRIM(pinxiang),''))=1 THEN MAX(NULLIF(TRIM(pinxiang),'')) END AS item
        FROM agents_order_execute_isontime_mi WHERE fromorderno_month>=:gea_p5 AND fromorderno_month<:gea_p6
        GROUP BY new_material_code) m ON m.sku=b.material_code
      WHERE (:gea_p900='' OR ${ageBase}=:gea_p900) AND b.dt=:gea_p1
      GROUP BY ${ageBase},b.material_code`,
    omitEnd: true,
    extra: {
      gea_p4: {
        name: "snapshot",
        type: "string",
        required: true,
        format: "YYYY-MM-DD"
      },
      gea_p5: {
        name: "mapping_start",
        type: "string",
        required: true,
        format: "YYYY-MM-DD"
      },
      gea_p6: {
        name: "mapping_end",
        type: "string",
        required: true,
        format: "YYYY-MM-DD"
      }
    }
  },
  directors: {
    keys: ["base", "sku"],
    columns: [
      "base",
      "sku",
      "director",
      "names",
      "item",
      "items",
      "directors",
      "director_encoding"
    ],
    sql: `SELECT d.belong_base AS base,d.material_code AS sku,
      MIN(NULLIF(TRIM(d.director),'')) AS director,
      COUNT(DISTINCT NULLIF(TRIM(d.director),'')) AS names,
      ARRAY_AGG(CASE WHEN d.director IS NULL THEN 'N' ELSE CONCAT('V',CAST(LENGTH(d.director) AS VARCHAR),':',d.director) END) AS directors,
      'nullable-utf8-v1' AS director_encoding,
      CASE WHEN COUNT(DISTINCT NULLIF(TRIM(d.product_item),''))=1 THEN MAX(NULLIF(TRIM(d.product_item),'')) END AS item,
      COUNT(DISTINCT NULLIF(TRIM(d.product_item),'')) AS items
      FROM (SELECT DISTINCT d.belong_base,d.material_code,
        NULLIF(TRIM(d.director),'') AS director,NULLIF(TRIM(d.product_item),'') AS product_item
        FROM (${attributionSources}) d
        WHERE NULLIF(TRIM(d.belong_base),'') IS NOT NULL AND NULLIF(TRIM(d.material_code),'') IS NOT NULL
        AND d.attribution_date>=:gea_p1 AND d.attribution_date<:gea_p2
      ) d
      GROUP BY d.belong_base,d.material_code`
  },
  directorMembers: {
    scoped: true,
    keys: ["base", "sku", "director_value", "item_value"],
    columns: ["base", "sku", "director", "director_value", "item_value"],
    sql: `SELECT base,sku,MIN(director_value) OVER (PARTITION BY base,sku) AS director,
      director_value,item_value FROM (
        SELECT DISTINCT d.belong_base AS base,d.material_code AS sku,
          NULLIF(TRIM(d.director),'') AS director_value,NULLIF(TRIM(d.product_item),'') AS item_value
        FROM (${attributionSources}) d
        WHERE (:gea_p900='' OR d.belong_base=:gea_p900)
          AND NULLIF(TRIM(d.belong_base),'') IS NOT NULL AND NULLIF(TRIM(d.material_code),'') IS NOT NULL
          AND d.attribution_date>=:gea_p1 AND d.attribution_date<:gea_p2
      ) members`
  },
  items: {
    keys: ["sku"],
    columns: ["sku", "item", "names"],
    sql: `SELECT d.material_code AS sku,
      CASE WHEN COUNT(DISTINCT NULLIF(TRIM(d.product_item),''))=1 THEN MAX(NULLIF(TRIM(d.product_item),'')) END AS item,
      COUNT(DISTINCT NULLIF(TRIM(d.product_item),'')) AS names
      FROM (${attributionSources}) d WHERE NULLIF(TRIM(d.material_code),'') IS NOT NULL
        AND d.attribution_date>=:gea_p1 AND d.attribution_date<:gea_p2
      GROUP BY d.material_code`
  },
  customerManagers: {
    keys: ["customer"],
    columns: ["customer", "manager", "names"],
    sql: `SELECT cust_code AS customer,MIN(NULLIF(sales_person,'')) AS manager,
      COUNT(DISTINCT NULLIF(sales_person,'')) AS names FROM agents_scm_execute_detail_d
      WHERE header_addtime>=:gea_p1 AND header_addtime<:gea_p2 GROUP BY cust_code`
  }
};

// business/shared/row-packets.mjs
var fail2 = () => {
  throw Object.assign(Error("\u5206\u7EC4\u4F20\u8F93\u7ED3\u679C\u4E0D\u5B8C\u6574\uFF0C\u672A\u4F7F\u7528\u90E8\u5206\u6570\u636E"), {
    code: "GEA_SQL_RESULT_INCOMPLETE"
  });
};
var integer = (value) => {
  if (!/^(0|[1-9]\d*)$/.test(String(value))) return fail2();
  const number = Number(value);
  if (!Number.isSafeInteger(number)) return fail2();
  return number;
};
var rowPacketSize = 64;
function readTuple(bytes, columns, start) {
  const values = [];
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let cursor = start;
  try {
    for (let field = 0; field <= columns.length; field++) {
      const tag = bytes[cursor++];
      if (tag === 78) {
        values.push(null);
        continue;
      }
      if (tag !== 86) return fail2();
      const colon = bytes.indexOf(58, cursor);
      if (colon < cursor) return fail2();
      const length = integer(decoder.decode(bytes.slice(cursor, colon)));
      if (length > bytes.length - colon - 1) return fail2();
      values.push(decoder.decode(bytes.slice(colon + 1, colon + 1 + length)));
      cursor = colon + 1 + length;
    }
  } catch {
    return fail2();
  }
  return {
    cursor,
    row: Object.fromEntries(
      ["packet_position", ...columns].map((name, index) => [name, values[index]])
    )
  };
}
function decodeRowTuple(value, columns) {
  if (typeof value !== "string" || value.length > 1e6) return fail2();
  const bytes = new TextEncoder().encode(value);
  const result = readTuple(bytes, columns, 0);
  if (result.cursor !== bytes.length) return fail2();
  return result.row;
}
function packetRows(value, columns) {
  if (Array.isArray(value)) return value.map((member) => decodeRowTuple(member, columns));
  if (typeof value !== "string" || value.length > 2e7) return fail2();
  try {
    const members = JSON.parse(value);
    if (!Array.isArray(members)) return fail2();
    return members.map((member) => decodeRowTuple(member, columns));
  } catch {
    const bytes = new TextEncoder().encode(value.trim()), rows = [];
    let cursor = 0;
    const space = () => {
      while ([9, 10, 13, 32].includes(bytes[cursor])) cursor++;
    };
    if (bytes[cursor++] !== 91) return fail2();
    space();
    if (bytes[cursor] === 93 && cursor === bytes.length - 1) return rows;
    while (cursor < bytes.length) {
      if (bytes[cursor++] !== 34) return fail2();
      const result = readTuple(bytes, columns, cursor);
      cursor = result.cursor;
      rows.push(result.row);
      if (bytes[cursor++] !== 34) return fail2();
      space();
      if (bytes[cursor] === 93 && cursor === bytes.length - 1) return rows;
      if (bytes[cursor++] !== 44) return fail2();
      space();
    }
    return fail2();
  }
}
function decodeScalarArray(value) {
  return packetRows(value, []).map((row) => row.packet_position);
}
function unpackRowPackets(packets, columns, keyFields, maxRows = 1e5, packetSize = rowPacketSize) {
  if (!Number.isSafeInteger(packetSize) || packetSize < 1 || packetSize > 1024) fail2();
  const rows = [], positions = /* @__PURE__ */ new Set(), keys = /* @__PURE__ */ new Set(), groups = /* @__PURE__ */ new Set();
  let total;
  for (const packet of packets) {
    const index = integer(packet.packet_index), count = integer(packet.packet_count);
    const scope = integer(packet.packet_scope_total);
    if (!scope || scope > maxRows || total !== void 0 && total !== scope || groups.has(index))
      fail2();
    total = scope;
    groups.add(index);
    const members = packetRows(packet.packet_rows, columns);
    if (members.length !== count || count < 1 || count > packetSize) fail2();
    for (const row of members) {
      if (!row || typeof row !== "object" || Array.isArray(row) || Object.keys(row).length !== columns.length + 1 || columns.some(
        (name) => !Object.hasOwn(row, name) || row[name] !== null && typeof row[name] !== "string"
      ))
        fail2();
      const position = integer(row.packet_position);
      if (position < 1 || position > total || positions.has(position) || Math.floor((position - 1) / packetSize) !== index)
        fail2();
      const key = JSON.stringify(keyFields.map((name) => row[name]));
      if (keys.has(key)) fail2();
      keys.add(key);
      positions.add(position);
      const { packet_position: _position, ...values } = row;
      rows.push({ position, values });
    }
  }
  if (rows.length !== (total ?? 0) || groups.size !== Math.ceil((total ?? 0) / packetSize)) fail2();
  return rows.sort((a, b) => a.position - b.position).map((row) => row.values);
}

// business/inventory-orderworkbench/period-summary-contract.mjs
var workbenchPeriodPacketSize = 256;
var workbenchDirectorPeriodColumns = [
  "period_index",
  "base",
  "sku",
  "director",
  "director_value",
  "item_value"
];

// prototypes/inventory-orderworkbench/metric-definitions.mjs
function metricDefinition(name, turnoverScope = "national") {
  return {
    \u4F5C\u5E9F\u7387: "\u6309\u5546\u54C1\u660E\u7EC6\u6709\u6548\u6570\u91CF\u5408\u8BA1\uFF1A\u9501\u5B9A\u671F\u5185\u4E14\u63A5\u5355\u8D85\u8FC712\u5C0F\u65F6\u540E\u4F5C\u5E9F\u7684\u6709\u6548\u5546\u54C1\u6570\u91CF \xF7 O\u63A5\u6536\u7684\u6709\u6548\u5546\u54C1\u6570\u91CF\uFF1B\u6709\u6548\u91CF\u4F9D\u6B21\u53D6\u5BA2\u6237\u8981\u6C42\u6539\u5355\u91CFchange_order_qty\u3001DMS\u6700\u540E\u4FEE\u6539\u91CFdms_last_update_qty\u3001\u8C03\u6574\u9700\u6C42\u91CF\u5907\u4EFDneed_qty_origin\uFF0C\u771F\u5B9E0\u6709\u6548\uFF1B\u5C0F\u65F6\u8868\u9010\u5B57\u6BB5\u4E3A\u7A7A\u65F6\uFF0C\u6309\u5BA2\u6237\uFF0B\u539F\u8BA2\u5355\uFF0B\u6267\u884C\u5355\uFF0B\u5546\u54C1\u884C\u53F7\uFF0BSKU\uFF0B\u57FA\u5730\u7CBE\u786E\u5339\u914D\u65E5\u8868\uFF0C\u5206\u522B\u56DE\u8865\u5BF9\u5E94\u5B57\u6BB5\u7684\u5B8C\u6574\u552F\u4E00\u975E\u7A7A\u503C\uFF0C\u518D\u6309\u5BA2\u6237\u6539\u5355\u3001DMS\u3001\u5907\u4EFD\u987A\u5E8F\u53D6\u503C\uFF1B\u5C0F\u65F6\u53CA\u65E5\u8868\u771F\u5B9E0\u5747\u4FDD\u7559\uFF0C\u5DF2\u6709\u5C0F\u65F6\u5B57\u6BB5\u4E0D\u8986\u76D6\uFF0C\u5FC5\u9700\u7684\u9AD8\u4F18\u5148\u7EA7\u65E5\u8868\u5B57\u6BB5\u51B2\u7A81\u4FDD\u7559\u672A\u77E5\uFF0C\u5DF2\u6709\u5C0F\u65F6\u5546\u54C1\u884C\u4E0D\u88AB\u65E5\u8868\u66FF\u6362\uFF1B\u7F3A\u5931\u7684\u65E5\u8868\u5546\u54C1\u884C\u4EC5detailstatus=10\uFF08\u7528\u6237\u786E\u8BA4\u6709\u6548\u4E14\u672A\u5220\u9664\uFF09\u65F6\u8865\u5165\uFF0C\u5176\u4ED6\u72B6\u6001\u4E0D\u8865\uFF1B\u4F5C\u5E9F\u8BA2\u5355\u6309OMS\u4F5C\u5E9F\u65F6\u95F4canceltime\u5F52\u6708\uFF0C\u5176\u4ED6\u6309header_addtime\u5F52\u6708\uFF1B\u90D1\u5DDE\u4EC5\u6309\u8BA2\u5355\u6267\u884C\u660E\u7EC6pickup_point=01\u7B5B\u9009\uFF0C\u4E0D\u4F7F\u7528\u4ED3\u5E93\u6620\u5C04\u6216belong_base\u5224\u65AD\u8303\u56F4\uFF1B\u4E0D\u989D\u5916\u9650\u5236\u4ED3\u7C7B\uFF1B\u5C0F\u65F6\u8868\u8BA2\u5355\u63D0\u8D27\u70B9\u4E3A\u7A7A\u65F6\u6309\u7CBE\u786E\u65E5\u8868\u62AC\u5934\u552F\u4E00\u503C\u56DE\u8865\uFF1B\u4ECD\u4E0D\u660E\u4FDD\u7559\u5F85\u786E\u8BA4\uFF1B\u4EC5\u7EB3\u5165\u63A5\u53E3\u6765\u6E9020\uFF1B\u53D1\u8D27\u4ED3\u4E3A*\u4E14\u6709\u6548\u6570\u91CF\u5DF2\u77E5\u5927\u4E8E0\u65F6\uFF0C\u5148\u6309\u7A7F\u900F\u8868\u6700\u65B0\u7248\u672C\u7CBE\u786E\u56DE\u8865\uFF1B\u4ECD\u65E0\u53D1\u8D27\u4ED3\u65F6\u76F4\u63A5\u53D6\u8BA2\u5355pickup_point\uFF0C\u4E0E\u6536\u8D27\u4ED3\u5F52\u5C5E\u5DE5\u5382\u63D0\u8D27\u70B9\u6BD4\u8F83\uFF0C\u53CC\u65B9\u4ED3\u7C7B\u5747\u5DE5\u5382\u4ED3/\u5916\u79DF\u4ED3\u4E14\u540C\u70B9\u624D\u5254\u9664\uFF1B\u63D0\u8D27\u70B9\u6216\u5FC5\u8981\u4ED3\u7C7B\u7F3A\u5931\u3001\u51B2\u7A81\u4ECD\u5F85\u786E\u8BA4\uFF1B\u5254\u9664\u865A\u62DF\u51FA1/2\u3001\u8D85\u65F6\u539F\u56E014/16\u3001\u540C\u4E00\u5F52\u5C5E\u5DE5\u5382\u63D0\u8D27\u70B9\u4E14\u4E24\u7AEF\u5747\u5DE5\u5382\u4ED3/\u5916\u79DF\u4ED3\u7684\u77ED\u62E8\uFF08\u4F7F\u7528\u5DF2\u786E\u8BA4\u7684\u51FA\u5165\u5E93pickup_point\u7A7F\u900F\u5B57\u6BB5\uFF09\uFF0C\u4EE5\u53CA\u63A5\u5355\u540E12\u5C0F\u65F6\u4EE5\u5185\uFF08\u542B\u6070\u597D12\u5C0F\u65F6\uFF09\u4F5C\u5E9F\uFF1B\u4F5C\u5E9F\u65F6\u95F4\u65E9\u4E8EOMS\u6700\u665A\u53D1\u8F66\u65F6\u95F4latestsendcardate\u524D7\u5929\u7684\u8BA2\u5355\uFF0C\u5206\u5B50\u5206\u6BCD\u5747\u5254\u9664\uFF1B\u8FBE\u5230\u6216\u665A\u4E8E\u8BE5\u524D7\u5929\u65F6\u70B9\u4E14\u63A5\u5355\u8D85\u8FC712\u5C0F\u65F6\u624D\u8BA1\u5206\u5B50\uFF1B\u5C0F\u65F6\u5B57\u6BB5\u4E3A\u7A7A\u65F6\u6309\u7CBE\u786E\u65E5\u8868\u62AC\u5934\u552F\u4E00\u503C\u56DE\u8865\uFF1B\u56DE\u8865\u540E\u4ECD\u65E0\u6709\u6548\u6700\u665A\u53D1\u8F66\u65F6\u95F4\u7684\u8BA2\u5355\uFF0C\u65E0\u8BBA\u4F5C\u5E9F\u4E0E\u5426\u5747\u5254\u9664\uFF0C\u4E0D\u8BA1\u5206\u5B50\u6216\u5206\u6BCD\uFF1B\u4E0D\u6309\u8BA2\u5355\u5F20\u6570\u6216SKU\u79CD\u7C7B\u8BA1\u6570",
    \u6539\u5355\u7387: "\u6309\u7269\u6D41\u8FFD\u8E2A\u8868lastshipmenttime\u88C5\u8F66\u5B8C\u6210\u65F6\u95F4\u5F52\u5C5E\u5B9E\u9645\u53D1\u8D27\u5468\u671F\uFF0C\u6267\u884C\u5355\u53F7\uFF0B\u5BA2\u6237\u5173\u8054\u65E5\u8868\uFF0C\u6309update_time\u53CAload_time\u6700\u65B0\u6279\u6B21\u53D6\u6700\u540E\u88C5\u8F66\u5B8C\u6210\uFF1B\u7F3A\u65F6\u95F4\u4E0D\u5F52\u5C5E\u3001\u4E0D\u56DE\u9000OMS\u521B\u5EFA\u6216WMS\u5173\u5355\u65F6\u95F4\uFF1B\u90D1\u5DDE\u7B5B\u9009\u4EC5\u53D6\u63D0\u8D27\u70B9pickup_point=01\uFF0C\u4E0D\u4EE5belong_base\u66FF\u4EE3\uFF1B\u6309\u5546\u54C1\u660E\u7EC6\u6570\u91CF\u5408\u8BA1\uFF1A\u4EC5\u5BA2\u6237\u8981\u6C42\u6539\u5355\u91CFchange_order_qty\u22650\u65F6\u8BA1\u5165\u03A3ABS(\u5BA2\u6237\u8981\u6C42\u91CF\uFF0D\u6709\u6548\u91CF)\uFF0C\u771F\u5B9E0\u4FDD\u7559\uFF1B\u5206\u6BCD\u4E3A\u5168\u90E8\u6709\u6548\u91CF\u4E4B\u548C\uFF0C\u4F18\u5148dms_last_update_qty\uFF0C\u5426\u5219need_qty_origin\uFF0C\u6570\u91CF\u7F3A\u5931\u63090\uFF1B\u4E09\u4E2A\u6570\u91CF\u5168\u7A7A\u5254\u9664\uFF0C\u4F5C\u5E9F\u53CA\u65E0\u6548\u660E\u7EC6\u5254\u9664\uFF1B\u4EC5\u63A5\u53E3createsource=20\uFF0C\u5254\u9664\u865A\u62DF\u51FA1/2\u548C\u8D85\u65F6\u539F\u56E014/16\uFF1B\u6309\u4ED3\u5E93\u7EF4\u8868\u5254\u9664\u53D1\u6536\u4ED3\u540C\u63D0\u8D27\u70B9\u4E14\u53CC\u65B9\u5747\u4E3A\u5DE5\u5382\u4ED3\u6216\u5DE5\u5382\u5916\u79DF\u5E93\u7684\u77ED\u62E8\uFF0C\u672A\u5206\u914D\u53D1\u8D27\u4ED3\u4EC5\u6309\u540C\u6267\u884C\u5355\u3001\u540C\u63D0\u8D27\u70B9\u53CA\u6536\u8D27\u4ED3\u7684\u6709\u6548\u660E\u7EC6\u552F\u4E00\u5DF2\u77E5\u53D1\u8D27\u4ED3\u8865\u9F50\uFF0C\u51B2\u7A81\u4E0D\u63A8\u65AD\uFF1B\u4E0D\u4F7F\u7528\u9501\u5B9A\u671F\u3001\u4EA4\u671F\u6216\u6539\u5355\u65F6\u95F4\u4F5C\u4E3A\u6761\u4EF6",
    \u8BA2\u5355\u6EE1\u8DB3\u7387: "\u6309\u5C65\u7EA6\u6E90\u8868\u7EDF\u4E00\u7684\u539F\u8BA2\u5355\u53D1\u8D27\u4E1A\u52A1\u5F52\u5C5E\u5468\u671F\uFF0C\u6765\u6E90\u5355\uFF0B\u5BA2\u6237\uFF0B\u5F52\u96C6\u4EA7\u54C1\u5408\u5E76\uFF1A\u03A3min(\u53D1\u8D27\u91CF,\u9700\u6C42\u91CF) \xF7 \u03A3\u9700\u6C42\u91CF \xD7100%\uFF1B\u4E0A\u6E38exp_flag\u6392\u9664\u65E0\u6548\u8BA2\u5355\uFF1B\u4E0D\u518D\u6309\u5546\u54C1\u4ECE\u7269\u6D41\u8868\u91CD\u7B97\u5468\u671F\uFF1B\u7F3A\u9700\u6C42\u6216\u5F52\u5E76\u51B2\u7A81\u4E0D\u8BA1\u7B97",
    \u51C6\u4EA4\u7387: "\u6309TMS\u5B9E\u9645\u5230\u8D27\u65F6\u95F4\u9009\u5468\u671F\uFF0C\u6267\u884C\u5355\u53F7\u53BB\u91CD\uFF1A\u51C6\u4EA4\u6267\u884C\u5355\u6570 \xF7 \u5DF2\u53D1\u8D27\u6267\u884C\u5355\u6570\uFF1B\u5230\u8D27\u4F18\u5148\u76EE\u7684\u5730GPS\u56F4\u680F\u3001\u5176\u6B21\u5230\u8D27\u786E\u8BA4\uFF0C\u5B9E\u9645\u5230\u8D27\u8BB0\u5F55\u8BC1\u660E\u5DF2\u53D1\u8D27\uFF0C\u4E0D\u8981\u6C42lastshipmenttime\u975E\u7A7A\uFF0C\u4E0D\u6309detailstatus/is_stat\u7B5B\u9009\uFF1B\u4EE5max(\u5BA2\u6237\u671F\u671B\u3001\u5F00\u5355\u786E\u8BA4\u5230\u8D27\u3001\u7CFB\u7EDF\u8BA1\u7B97\u5230\u8D27)\u4E3A\u57FA\u51C6\uFF0Ckamd/dc\u5BA2\u6237\u665A\u6EE118\u5C0F\u65F6\u7B97\u903E\u671F\uFF0C\u5176\u4ED6\u5BA2\u6237\u665A\u6EE112\u5C0F\u65F6\u7B97\u903E\u671F\uFF0C\u672A\u6EE1\u5BF9\u5E94\u65F6\u9650\u4E3A\u51C6\u4EA4\uFF1B\u5254\u9664\u540C\u63D0\u8D27\u70B9\u4E14\u53CC\u65B9\u5747\u5DE5\u5382\u4ED3/\u5DE5\u5382\u5916\u79DF\u4ED3\u7684\u77ED\u62E8\u3001\u6D77\u5916/\u56FD\u5916/\u6E2F\u6FB3\u5927\u533A\u3001\u672A\u6D3E\u8F66\u3001\u865A\u62DF\u51FA\u5E931/2\u3001\u6307\u5B9A\u8F66\u578B\u53CA\u7A7A\u8F66\u578B\u3001\u8D85\u65F6\u539F\u56E014/16\uFF1B\u90D1\u5DDE\u5E9E\u4E3D\u5A1F\u6309\u57FA\u5730\u51C6\u4EA4\u7387\uFF1B\u7CFB\u7EDF\u4EA4\u671F\u7F3A\u5931\u4F46\u5230\u8D27<\u5DF2\u6709\u4E24\u4EA4\u671F\u6700\u5927\u503C+\u5BF9\u5E94\u5BA2\u6237\u7C7B\u578B\u768418/12\u5C0F\u65F6\u53EF\u4E25\u683C\u786E\u8BA4\u51C6\u4EA4\uFF1B\u5426\u5219\u4FDD\u7559\u672A\u77E5\uFF1B\u77ED\u62E8\u4ED3\u7C7B\u53EF\u7531\u4ED3\u5E93\u7EF4\u8868\u552F\u4E00\u8865\u9F50\uFF0C\u51B2\u7A81\u4E0D\u8986\u76D6",
    "\u8D27\u9F84\uFF08>60\u5929\u5E93\u5B58\u5360\u6BD4\uFF09": "\u4EA7\u9500\u5B58\u65E5\u5FEB\u7167\uFF1A\u03A3current_stock_60 \xF7 \u03A3current_stock\uFF1B\u4E24\u9879\u5E93\u5B58\u53CA\u5546\u54C1\u8303\u56F4\u7EDF\u4E00\u53D6 agents_scm_stock_detail_d\uFF1B\u5468\u3001\u6708\u5747\u53D6\u5404\u81EA\u622A\u6B62\u65E5\u5185\u6700\u65B0\u4E1A\u52A1\u65E5\u5FEB\u7167\uFF0C\u4E0D\u7D2F\u8BA1\u6BCF\u65E5\u5E93\u5B58\uFF1B\u6E90\u5B57\u6BB5\u7F3A\u503C\u6216\u57FA\u5730\u5546\u54C1\u91CD\u590D\u65F6\u4E0D\u53D1\u5E03\u5B8C\u6574\u5360\u6BD4",
    \u5468\u8F6C\u5929\u6570: "\u4EA7\u9500\u5B58\u65E5\u8868\u73B0\u5E93\u5B58 current_stock \xF7 \u540C\u8303\u56F4\u8BA1\u5212\u65E5\u5747\u9700\u6C42\uFF1B\u6309\u6570\u636E\u5E93\u53D1\u5E03\u7684\u521D\u7248\u3001\u7EA0\u504F\u3001\u6EDA\u52A8\u622A\u6B62\u65E5\u9009\u62E9\u8BA1\u5212\uFF0C\u8D85\u8FC7\u6EDA\u52A8\u622A\u6B62\u65E5\u53D6\u4E0B\u6708\u521D\u7248\uFF1B\u914D\u7F6E\u7F3A\u5931\u6216\u65E0\u6548\u65F6\u4E0D\u56DE\u9000\u56FA\u5B9A\u65E5\u671F\uFF1B\u521D\u7248\u3001\u7EA0\u504F\u9664\u4EE5\u5E93\u5B58\u5F53\u6708\u5929\u6570\uFF0C\u6EDA\u52A8\u3001\u4E0B\u6708\u521D\u7248\u9664\u4EE5\u6B21\u6708\u5929\u6570\uFF1B" + (turnoverScope === "base" ? "\u57FA\u5730\u65E5\u5747=(\u6708\u5EA6\u9700\u6C42\u8BA1\u5212+\u8C03\u62E8\u51FA\u5E93\u8BA1\u5212\xD70.5)\xF7\u5BF9\u5E94\u6708\u4EFD\u5929\u6570" : "\u5168\u56FD\u53CA\u54C1\u9879\u65E5\u5747=\u6708\u5EA6\u9700\u6C42\u8BA1\u5212\xF7\u5BF9\u5E94\u6708\u4EFD\u5929\u6570\uFF1B\u53D6\u5E93\u5B58\u8BA1\u5212\u8868\u5BF9\u5E94\u521D\u7248\u3001\u7EA0\u504F\u3001\u6EDA\u52A8\u6216\u4E0B\u6708\u5B57\u6BB5\uFF0C\u4E0D\u4EE5\u5BA2\u6237\u9700\u6C42\u8868allnum\u66FF\u4EE3") + "\uFF1B\u5404\u7EF4\u5EA6\u5E93\u5B58\u4E0E\u8BA1\u5212\u5728\u540C\u8303\u56F4\u5185\u72EC\u7ACB\u6C47\u603B\uFF0C\u4E0D\u8981\u6C42\u5546\u54C1\u9010\u6761\u5339\u914D\uFF1B\u8D1F\u5E93\u5B58\u6309\u6765\u6E90\u539F\u503C\u6C47\u603B\uFF1B\u6E90\u5185\u7F3A\u503C\u3001\u8D1F\u8BA1\u5212\u3001\u8D1F\u5E93\u5B58\u5408\u8BA1\u6216\u91CD\u590D\u8BA1\u5212\u7C92\u5EA6\u4E0D\u8BA1\u7B97"
  }[name];
}
var metricSpecs = {
  \u4F5C\u5E9F\u7387: {
    id: "cancellation",
    aliases: ["\u4F5C\u5E9F\u7387"],
    section: "changes",
    kind: "1",
    dateBasis: "\u4F5C\u5E9F\u8BB0\u5F55\u6309canceltime\uFF0C\u975E\u4F5C\u5E9F\u8BB0\u5F55\u6309header_addtime\u5F52\u5C5E\u5468\u671F\uFF1B\u4E0D\u80FD\u628A\u5168\u90E8\u5206\u6BCD\u7EDF\u4E00\u6309\u4F5C\u5E9F\u65F6\u95F4\u8FC7\u6EE4\u3002",
    cancellationBoundary: "\u5206\u5B50\u4EC5\u4F5C\u5E9F\u8BB0\u5F55\u8981\u6C42\u53D6\u6D88\u65F6\u95F4\u8FBE\u5230\u6216\u665A\u4E8Elatestsendcardate\u524D7\u5929\u4E14\u63A5\u5355\u4E25\u683C\u8D85\u8FC712\u5C0F\u65F6\uFF1B\u975E\u4F5C\u5E9F\u6709\u6548\u8BB0\u5F55\u8BA1\u5165\u5206\u6BCD\uFF0C\u4E0D\u8981\u6C42\u53D6\u6D88\u65F6\u95F4\uFF1B\u7F3A\u6709\u6548latestsendcardate\u7684\u8BB0\u5F55\u4ECE\u5206\u5B50\u5206\u6BCD\u5747\u5254\u9664\u3002"
  },
  \u6539\u5355\u7387: {
    id: "amendment",
    aliases: ["\u6539\u5355\u7387"],
    section: "changes",
    kind: "2",
    details: "workbench.amendment.details",
    dateBasis: amendmentMetricContract.dateBasis
  },
  \u8BA2\u5355\u6EE1\u8DB3\u7387: {
    id: "fulfillment",
    aliases: ["\u8BA2\u5355\u6EE1\u8DB3\u7387", "\u6EE1\u8DB3\u7387"],
    section: "orders",
    dateBasis: "\u6309fromorderno_month\u539F\u8BA2\u5355\u53D1\u8D27\u4E1A\u52A1\u5468\u671F\u5F52\u5C5E\uFF0C\u6765\u6E90\u5355\uFF0B\u5BA2\u6237\uFF0B\u5F52\u96C6\u4EA7\u54C1\u5408\u5E76\u3002"
  },
  \u51C6\u4EA4\u7387: {
    id: "ontime",
    aliases: ["\u51C6\u4EA4\u7387"],
    section: "ontime",
    details: "workbench.ontime.agent.details",
    dateBasis: ontimeMetricContract.dateBasis
  },
  "\u8D27\u9F84\uFF08>60\u5929\u5E93\u5B58\u5360\u6BD4\uFF09": {
    id: "age",
    aliases: ["\u8D27\u9F84\uFF08>60\u5929\u5E93\u5B58\u5360\u6BD4\uFF09", "60\u5929\u4EE5\u4E0A\u8D27\u9F84\u5360\u6BD4", "60\u5929\u53CA\u4EE5\u4E0A\u8D27\u9F84\u5360\u6BD4", "\u8D27\u9F84\u5360\u6BD4"],
    section: "ages",
    dateBasis: "\u5404\u5468/\u6708\u622A\u6B62\u8303\u56F4\u5185\u6700\u65B0\u5E93\u5B58\u4E1A\u52A1\u65E5\u5FEB\u7167\uFF0C\u4E0D\u7D2F\u8BA1\u6BCF\u65E5\u5E93\u5B58\u3002"
  },
  \u5468\u8F6C\u5929\u6570: {
    id: "shippable",
    aliases: ["\u5468\u8F6C\u5929\u6570", "\u53EF\u53D1\u8D27\u5929\u6570"],
    section: "stock",
    dateBasis: "\u5404\u5468/\u6708\u622A\u6B62\u8303\u56F4\u5185\u6700\u65B0\u5E93\u5B58\u4E1A\u52A1\u65E5\u5FEB\u7167\uFF0C\u4E0D\u7D2F\u8BA1\u6BCF\u65E5\u5E93\u5B58\u3002"
  }
};
function resolveMetricName(name) {
  const found = Object.entries(metricSpecs).find(
    ([key, spec]) => key === name || spec.id === name || spec.aliases.includes(name)
  );
  if (!found) throw Error("UNKNOWN_ORDER_METRIC");
  return found[0];
}
function metricContract(name, config, scope = "national") {
  name = resolveMetricName(name);
  const spec = metricSpecs[name], queryId = spec.section === "changes" ? name === "\u4F5C\u5E9F\u7387" ? "workbench.cancellations" : "workbench.amendments" : spec.section === "stock" ? "workbench.stock.summary.packets" : "workbench." + spec.section + ".summary";
  const sql = config?.queries?.[queryId]?.request?.sql ?? "";
  const tables = [
    ...new Set(
      [...sql.matchAll(/(?:FROM|JOIN)\s+((?:agents_|dim_|dwd_)[a-z0-9_]+)/gi)].map((m) => m[1])
    )
  ];
  return {
    ...name === "\u6539\u5355\u7387" ? amendmentMetricContract : name === "\u51C6\u4EA4\u7387" ? ontimeMetricContract : {},
    schemaVersion: 1,
    id: spec.id,
    metric: name,
    version: config?.metricRuntime?.version ?? null,
    revision: config?.metricRuntime?.revision ?? null,
    formula: metricDefinition(name, scope),
    periodBasis: spec.dateBasis,
    cancellationBoundary: spec.cancellationBoundary,
    section: spec.section,
    tables,
    queryId,
    detailsQueryId: spec.details ?? null,
    scope,
    baseMeaning: name === "\u6539\u5355\u7387" || name === "\u4F5C\u5E9F\u7387" ? "\u90D1\u5DDE\u6309\u8BA2\u5355\u63D0\u8D27\u70B9pickup_point=01\uFF1B\u5176\u4ED6\u8303\u56F4\u6CBF\u8BE5\u67E5\u8BE2\u7684\u5DF2\u53D1\u5E03\u89C4\u5219" : "\u6309\u8BE5\u6307\u6807\u5DF2\u53D1\u5E03\u57FA\u5730\u5F52\u5C5E\u548C\u5F53\u524D\u6388\u6743\u8303\u56F4",
    readonly: true
  };
}

// prototypes/inventory-orderworkbench/performance-rules.mjs
var metricLimits = {
  \u4F5C\u5E9F\u7387: { healthy: 6, warning: 10, direction: "lower" },
  \u6539\u5355\u7387: { healthy: 2, warning: 5, direction: "lower" },
  \u8BA2\u5355\u6EE1\u8DB3\u7387: { healthy: 95, warning: 90, direction: "higher" },
  \u51C6\u4EA4\u7387: { healthy: 98.5, warning: 94, direction: "higher" }
};
var stockLimits = { national: 12.5, \u90D1\u5DDE: 12.5, other: 11 };
var shippableDaysTarget = `\u5168\u56FD<${stockLimits.national}\u5929\uFF08\u90D1\u5DDE\u2264${stockLimits.\u90D1\u5DDE}\u5929\uFF0C\u5176\u4ED6\u57FA\u5730<${stockLimits.other}\u5929\uFF09`;
function shippableDaysState(value, base = "") {
  base = normalizeWorkbenchBase(base);
  if (value === null || value === void 0 || !Number.isFinite(value)) return "\u6570\u636E\u4E0D\u8DB3";
  if (base === "\u672A\u6620\u5C04" || base === "\u5F52\u5C5E\u5F85\u8865\u5168") return "\u6570\u636E\u4E0D\u8DB3";
  const met = base === "\u90D1\u5DDE" ? value <= stockLimits.\u90D1\u5DDE : value < (base && base !== "\u5408\u8BA1" ? stockLimits.other : stockLimits.national);
  return met ? "\u5065\u5EB7" : "\u4E25\u91CD";
}
function metricTarget(name, base = "") {
  base = normalizeWorkbenchBase(base);
  const limit = metricLimits[name];
  if (limit) return `${limit.direction === "lower" ? "<" : ">"}${limit.healthy}%`;
  if (name === "\u5468\u8F6C\u5929\u6570")
    return base === "\u90D1\u5DDE" ? `\u2264${stockLimits.\u90D1\u5DDE}\u5929` : base && base !== "\u5408\u8BA1" ? `<${stockLimits.other}\u5929` : shippableDaysTarget;
  return name === "\u8D27\u9F84\uFF08>60\u5929\u5E93\u5B58\u5360\u6BD4\uFF09" ? "\u8D8A\u4F4E\u8D8A\u597D" : null;
}
function workbenchMetricState(name, value, base = "") {
  if (value === null || value === void 0 || !Number.isFinite(value)) return "\u6570\u636E\u4E0D\u8DB3";
  const limit = metricLimits[name];
  if (limit)
    return limit.direction === "lower" ? value < limit.healthy ? "\u5065\u5EB7" : value <= limit.warning ? "\u9884\u8B66" : "\u4E25\u91CD" : value > limit.healthy ? "\u5065\u5EB7" : value >= limit.warning ? "\u9884\u8B66" : "\u4E25\u91CD";
  if (name === "\u5468\u8F6C\u5929\u6570") return shippableDaysState(value, base);
  return name === "\u8D27\u9F84\uFF08>60\u5929\u5E93\u5B58\u5360\u6BD4\uFF09" ? "\u5F53\u524D\u8303\u56F4" : "\u5224\u5B9A\u6807\u51C6\u672A\u5B9A\u4E49";
}

// prototypes/inventory-orderworkbench/metric-model.mjs
var metricCalculationVersion = false ? 40 : 131581368223045;
var metricNames = [
  "\u4F5C\u5E9F\u7387",
  "\u6539\u5355\u7387",
  "\u8BA2\u5355\u6EE1\u8DB3\u7387",
  "\u51C6\u4EA4\u7387",
  "\u8D27\u9F84\uFF08>60\u5929\u5E93\u5B58\u5360\u6BD4\uFF09",
  "\u5468\u8F6C\u5929\u6570"
];
var dayOffset = (day, amount) => new Date(Date.parse(day + "T00:00:00Z") + amount * 864e5).toISOString().slice(0, 10);
var finite = (value) => value !== null && value !== void 0 && value !== "" && Number.isFinite(Number(value));
var sum = (rows, key) => rows.length && rows.every((row) => finite(row[key])) ? rows.reduce((total, row) => total + Number(row[key]), 0) : null;
var invalid = (rows, key = "invalid") => rows.some((row) => !finite(row[key]) || Number(row[key]) !== 0);
function stockDemandDays(row) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(row.stock_date)) return null;
  const offset = "plan_month_offset" in row ? row.plan_month_offset : 0;
  if (!finite(offset) || ![0, 1].includes(Number(offset))) return null;
  return new Date(
    Date.UTC(
      Number(row.stock_date.slice(0, 4)),
      Number(row.stock_date.slice(5, 7)) + Number(offset),
      0
    )
  ).getUTCDate();
}
function stockDaily(row, scope = "national") {
  const sales = scope !== "base" && "national_plan_records" in row ? row.national_sales_plan : row.sales_plan;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(row.stock_date) || !finite(sales) || scope !== "base" && Number(row.national_plan_invalid ?? 0) !== 0 || Number(sales) < 0 || scope === "base" && (!finite(row.transfer_plan) || Number(row.transfer_plan) < 0))
    return null;
  const days = stockDemandDays(row);
  if (days === null) return null;
  return (Number(sales) + (scope === "base" ? 0.5 * Number(row.transfer_plan) : 0)) / days;
}
function stockComponents(rows, scope = "national") {
  if (!rows.some((row) => "national_stock_records" in row)) {
    const numerator = sum(rows, "inventory"), daily2 = rows.map((row) => stockDaily(row, scope));
    if (invalid(rows) || numerator === null || numerator < 0 || rows.some((row) => Number(row.source_rows) !== 1) || daily2.some((value) => value === null))
      return null;
    const denominator = daily2.reduce((total, value) => total + value, 0);
    return denominator > 0 ? { numerator, denominator } : null;
  }
  const planInvalid = scope === "base" ? "base_plan_invalid" : "national_plan_invalid";
  if (!rows.length || rows.some(
    (row) => !finite(row.national_stock_records) || !finite(row.national_plan_records) || !finite(row.national_stock_invalid) || !finite(row[planInvalid]) || Number(row.national_stock_invalid) !== 0 || Number(row[planInvalid]) !== 0
  ))
    return null;
  const stock = rows.filter((row) => Number(row.national_stock_records) > 0);
  const plans = rows.filter((row) => Number(row.national_plan_records) > 0);
  const inventory = sum(stock, "national_inventory");
  if (!stock.length || !plans.length || inventory === null || inventory < 0) return null;
  const daily = plans.map(
    (row) => stockDaily(
      {
        ...row,
        sales_plan: row.national_sales_plan,
        transfer_plan: row.base_transfer_plan
      },
      scope
    )
  );
  if (daily.some((value) => value === null)) return null;
  const demand = daily.reduce((total, value) => total + value, 0);
  return demand > 0 ? { numerator: inventory, denominator: demand } : null;
}
function scopedStockDays(rows, scope = "national") {
  const quantities = stockComponents(rows, scope);
  return quantities ? quantities.numerator / quantities.denominator : null;
}
function computeWorkbenchMetrics(period, filter = () => true, { turnoverScope = "national", ontimeFilter = filter } = {}) {
  const rows = (name) => readySectionRows(period, name).filter(name === "ontime" ? ontimeFilter : filter);
  const orders = rows("orders"), stock = rows("stock"), ages = rows("ages"), changes = rows("changes");
  const result = {};
  const put = (name, value, note, unit = "%") => result[name] = { name, value, unit, note };
  for (const [kind, name] of [
    ["1", "\u4F5C\u5E9F\u7387"],
    ["2", "\u6539\u5355\u7387"]
  ]) {
    const selected = changes.filter((row) => String(row.kind) === kind), denominator = sum(selected, "denominator"), numerator = sum(selected, "numerator");
    put(
      name,
      !invalid(selected) && denominator > 0 && numerator !== null && numerator >= 0 && (kind === "2" || numerator <= denominator) ? numerator / denominator * 100 : null,
      metricDefinition(name, turnoverScope)
    );
  }
  const need = sum(orders, "demand"), shortage = sum(orders, "shortage");
  put(
    "\u8BA2\u5355\u6EE1\u8DB3\u7387",
    !invalid(orders) && need > 0 && shortage !== null && shortage >= 0 && shortage <= need ? (1 - shortage / need) * 100 : null,
    metricDefinition("\u8BA2\u5355\u6EE1\u8DB3\u7387", turnoverScope)
  );
  const arrivalRows = rows("ontime"), byOrder = /* @__PURE__ */ new Map();
  for (const row of arrivalRows) {
    const key = JSON.stringify([row.order_no]);
    if (!byOrder.has(key)) byOrder.set(key, []);
    byOrder.get(key).push(row);
  }
  const assessed = [...byOrder.values()];
  const validArrival = assessed.length && arrivalRows.every(
    (row) => row.customer && row.order_no && Number(row.invalid) === 0 && [0, 1].includes(row.ontime)
  );
  put(
    "\u51C6\u4EA4\u7387",
    validArrival ? assessed.filter((lines) => lines.every((row) => row.ontime === 1)).length / assessed.length * 100 : null,
    metricDefinition("\u51C6\u4EA4\u7387", turnoverScope)
  );
  const total = sum(ages, "stock_qty"), aged = sum(ages, "aged_qty");
  put(
    "\u8D27\u9F84\uFF08>60\u5929\u5E93\u5B58\u5360\u6BD4\uFF09",
    !invalid(ages) && total > 0 && aged !== null && aged >= 0 && aged <= total ? aged / total * 100 : null,
    metricDefinition("\u8D27\u9F84\uFF08>60\u5929\u5E93\u5B58\u5360\u6BD4\uFF09", turnoverScope)
  );
  put(
    "\u5468\u8F6C\u5929\u6570",
    scopedStockDays(stock, turnoverScope),
    metricDefinition("\u5468\u8F6C\u5929\u6570", turnoverScope),
    "\u5929"
  );
  const sample = (name, numerator, denominator, known, total2, unit) => {
    if (result[name].value !== null || !finite(numerator) || !finite(denominator) || denominator <= 0 || numerator < 0 || name !== "\u6539\u5355\u7387" && numerator > denominator || !finite(known) || !finite(total2) || !Number.isSafeInteger(known) || !Number.isSafeInteger(total2) || known <= 0 || known >= total2)
      return;
    const reason = workbenchMetricMissingReason(period, name, filter);
    result[name].value = numerator / denominator * 100;
    const coverage = known / total2 * 100;
    result[name].sample = { known, total: total2, unit, coverage, reason };
    result[name].coverageNote = `\u53EF\u5224\u5B9A\u6837\u672C\uFF1A${known}/${total2}${unit}\uFF0C\u5019\u9009\u8BB0\u5F55\u8986\u76D6${coverage.toFixed(1)}%\uFF1B\u4E0D\u662F\u5168\u91CF\u6307\u6807\u3002${reason}`;
    result[name].note += "\uFF1B" + result[name].coverageNote;
  };
  for (const [kind, name] of [["1", "\u4F5C\u5E9F\u7387"]]) {
    const selected = changes.filter((row) => String(row.kind) === kind);
    if (selected.length && selected.every(
      (row) => ["sample_numerator", "sample_denominator", "sample_records", "records"].every(
        (key) => finite(row[key])
      )
    ))
      sample(
        name,
        sum(selected, "sample_numerator"),
        sum(selected, "sample_denominator"),
        sum(selected, "sample_records"),
        sum(selected, "records"),
        "\u6761\u5019\u9009\u5546\u54C1\u660E\u7EC6"
      );
  }
  const amendmentRows = changes.filter((row) => String(row.kind) === "2");
  const amendment = result["\u6539\u5355\u7387"];
  if (amendmentRows.length && amendmentRows.every(
    (row) => ["denominator", "sample_numerator", "sample_records", "records", "unknown_quantity"].every(
      (key) => finite(row[key])
    )
  )) {
    const denominator = sum(amendmentRows, "denominator");
    const knownNumerator = sum(amendmentRows, "sample_numerator");
    const unknown = sum(amendmentRows, "records") - sum(amendmentRows, "sample_records");
    const unknownQuantity = sum(amendmentRows, "unknown_quantity");
    if (denominator > 0 && knownNumerator >= 0 && unknown >= 0 && unknownQuantity >= 0) {
      amendment.population = {
        denominator,
        knownNumerator,
        unknown,
        unknownQuantity,
        minimumPercent: 100 * knownNumerator / denominator,
        maximumPercent: 100 * (knownNumerator + unknownQuantity) / denominator
      };
      amendment.note += `\uFF1B\u6709\u6548\u5546\u54C1\u6570\u91CF\u5206\u6BCD${denominator}\uFF0C\u5DF2\u786E\u8BA4\u6709\u6548\u660E\u7EC6\u8C03\u6574\u91CF${knownNumerator}\uFF0C\u5F85\u5224\u5B9A${unknown}\u6761\u660E\u7EC6\u3001\u6570\u91CF\u5DEE\u989D${unknownQuantity}`;
      if (unknown > 0) {
        amendment.value = 100 * knownNumerator / denominator;
        amendment.provisional = true;
        amendment.coverageNote = `\u6682\u7B97\uFF1A\u5DF2\u786E\u8BA4\u6709\u6548\u660E\u7EC6\u8C03\u6574\u91CF${knownNumerator} \xF7 \u5168\u91CF\u6709\u6548\u5546\u54C1\u6570\u91CF${denominator}\uFF1B${unknown}\u6761\u660E\u7EC6\u5F85\u5224\u5B9A\uFF0C\u4E0D\u4EE3\u8868\u5B8C\u6574\u6539\u5355\u7387\u3002`;
        amendment.note += "\uFF1B" + amendment.coverageNote;
      }
    }
  }
  if (orders.length && orders.every(
    (row) => ["sample_demand", "sample_shortage", "sample_records", "records"].every(
      (key) => finite(row[key])
    )
  )) {
    const demand = sum(orders, "sample_demand");
    sample(
      "\u8BA2\u5355\u6EE1\u8DB3\u7387",
      demand - sum(orders, "sample_shortage"),
      demand,
      sum(orders, "sample_records"),
      sum(orders, "records"),
      "\u4E2A\u5019\u9009\u539F\u5355\u4EA7\u54C1\u7EC4"
    );
  }
  const judged = assessed.filter(
    (lines) => lines.every(
      (row) => row.customer && row.order_no && Number(row.invalid) === 0 && [0, 1].includes(row.ontime)
    )
  );
  result["\u51C6\u4EA4\u7387"].counts = {
    onTime: judged.filter((lines) => lines.every((row) => row.ontime === 1)).length,
    total: assessed.length,
    known: judged.length,
    pending: assessed.length - judged.length
  };
  sample(
    "\u51C6\u4EA4\u7387",
    judged.filter((lines) => lines.every((row) => row.ontime === 1)).length,
    judged.length,
    judged.length,
    assessed.length,
    "\u5F20\u5019\u9009\u5230\u8D27\u8BA2\u5355"
  );
  if (result["\u51C6\u4EA4\u7387"].counts.pending > 0) {
    if (result["\u51C6\u4EA4\u7387"].sample) result["\u51C6\u4EA4\u7387"].sample.value = result["\u51C6\u4EA4\u7387"].value;
    result["\u51C6\u4EA4\u7387"].value = 100 * result["\u51C6\u4EA4\u7387"].counts.onTime / result["\u51C6\u4EA4\u7387"].counts.total;
    result["\u51C6\u4EA4\u7387"].note += "\uFF1B\u663E\u793A\u5DF2\u786E\u8BA4\u51C6\u4EA4\u6570\xF7\u5168\u90E8\u5E94\u7EDF\u8BA1\u5DF2\u53D1\u8D27\u6267\u884C\u5355\u6570\uFF1B\u7F3A\u5931\u6570\u636E\u7684\u6267\u884C\u5355\u4FDD\u7559\u5728\u5206\u6BCD\uFF0C\u6682\u4E0D\u8BA1\u5165\u51C6\u4EA4\u6570\uFF0C\u8865\u9F50\u540E\u91CD\u7B97";
  }
  for (const [id, names] of [
    ["orders", ["\u8BA2\u5355\u6EE1\u8DB3\u7387"]],
    ["ontime", ["\u51C6\u4EA4\u7387"]],
    ["changes", ["\u4F5C\u5E9F\u7387", "\u6539\u5355\u7387"]],
    ["stock", ["\u5468\u8F6C\u5929\u6570"]],
    ["ages", ["\u8D27\u9F84\uFF08>60\u5929\u5E93\u5B58\u5360\u6BD4\uFF09"]]
  ]) {
    for (const name of names) {
      const part = metricSection(period, id, name);
      if (part?.status === "loading")
        Object.assign(result[name], {
          value: null,
          note: "\u6B63\u5728\u8BFB\u53D6\u6240\u9009\u5468\u671F\u6570\u636E",
          loading: true
        });
      else if (part?.status === "error")
        Object.assign(result[name], {
          value: null,
          note: "\u67E5\u8BE2\u672A\u5B8C\u6210\uFF1A" + part.code
        });
      else if (!(part?.rows ?? []).filter(id === "ontime" ? ontimeFilter : filter).filter((row) => id !== "changes" || String(row.kind) === (name === "\u4F5C\u5E9F\u7387" ? "1" : "2")).length)
        Object.assign(result[name], {
          value: null,
          noRows: true,
          note: "\u6240\u9009\u5468\u671F\u53CA\u6388\u6743\u8303\u56F4\u5185\u65E0\u6765\u6E90\u6570\u636E"
        });
    }
  }
  if (period.start && period.end && period.start >= period.end)
    for (const name of metricNames)
      Object.assign(result[name], {
        value: null,
        loading: false,
        emptyPeriod: true
      });
  for (const name of metricNames)
    if (result[name]?.value == null) {
      result[name].missingReason = workbenchMetricMissingReason(
        period,
        name,
        filter,
        result[name].note
      );
      if (period.start >= period.end && !period.sections.length)
        result[name].note = result[name].missingReason;
    }
  return result;
}
function workbenchMetricMissingReason(period, name, filter = () => true, note = "") {
  if (period?.start && period?.end && period.start >= period.end)
    return "\u5F53\u524D\u5468\u671F\u5C1A\u65E0\u5DF2\u7ED3\u675F\u65E5\u671F\uFF1A\u6309\u5DF2\u7ED3\u675F\u65E5\u671F\u7EDF\u8BA1\uFF0C\u6682\u4E0D\u8BA1\u7B97\u672C\u5468\u671F\u6307\u6807\uFF1B\u4E0D\u662F\u6570\u636E\u4ECD\u5728\u52A0\u8F7D\u3002";
  const id = ["\u4F5C\u5E9F\u7387", "\u6539\u5355\u7387"].includes(name) ? "changes" : name === "\u5468\u8F6C\u5929\u6570" ? "stock" : name === "\u8D27\u9F84\uFF08>60\u5929\u5E93\u5B58\u5360\u6BD4\uFF09" ? "ages" : name === "\u51C6\u4EA4\u7387" ? "ontime" : "orders";
  const part = metricSection(period, id, name);
  if (period && period.start >= period.end && Array.isArray(period.sections) && !period.sections.length)
    return "\u672C\u5468\u671F\u6682\u65E0\u5DF2\u7ED3\u675F\u7EDF\u8BA1\u65E5\uFF1A\u8BA2\u5355\u6309T-1\u7D2F\u8BA1\uFF0C\u5F53\u524D\u533A\u95F4\u8D77\u6B62\u76F8\u540C\uFF0C\u672A\u53D1\u8D77\u7A7A\u533A\u95F4\u67E5\u8BE2\u3002\u4E0D\u662F\u4ECD\u5728\u52A0\u8F7D\uFF0C\u4E5F\u4E0D\u4EE3\u8868\u6574\u5F20\u6E90\u8868\u65E0\u6570\u636E\uFF1B\u5E93\u5B58\u6307\u6807\u4ECD\u9700\u7B5B\u9009\u5185\u7684\u6709\u6548\u5FEB\u7167\uFF0C\u7F3A\u5931\u4FDD\u6301\u672A\u77E5\uFF0C\u4E0D\u7528\u5176\u4ED6\u5468\u671F\u66FF\u4EE3\u3002";
  if (!part || part.status === "loading")
    return "\u7CFB\u7EDF\u5C1A\u672A\u5B8C\u6210\u8BFB\u53D6\uFF1A\u6240\u9009\u5468\u671F\u6570\u636E\u672A\u52A0\u8F7D\u5B8C\u6210\uFF0C\u6682\u4E0D\u80FD\u5224\u5B9A\u6E90\u8868\u7F3A\u6570\u636E\u3002";
  if (part.status !== "ready")
    return `\u7CFB\u7EDF\u8BFB\u53D6\u672A\u6210\u529F\uFF1A${part.code ?? part.status}\uFF1B${part.detail ? part.detail + "\uFF1B" : ""}\u9700\u6838\u5BF9\u67E5\u8BE2\u6216\u5B57\u6BB5\u53D1\u5E03\uFF0C\u4E0D\u662F0\u3002`;
  const source = part.rows.filter(filter).filter((row) => id !== "changes" || String(row.kind) === (name === "\u4F5C\u5E9F\u7387" ? "1" : "2"));
  if (!source.length)
    return `\u6E90\u6570\u636E\u672A\u63D0\u4F9B\uFF1A\u6240\u9009\u5468\u671F\u53CA\u5F53\u524D\u6388\u6743\u3001\u5206\u7EC4\u8303\u56F4\u7684 ${id} \u67E5\u8BE2\u7ED3\u679C\u65E0\u8BB0\u5F55\uFF1B\u4E0D\u4EE3\u8868\u6574\u5F20\u8868\u4E3A\u7A7A\u3002`;
  if (name === "\u5468\u8F6C\u5929\u6570" && source.some((row) => "national_stock_records" in row)) {
    if (!source.some((row) => Number(row.national_stock_records) > 0))
      return "\u6E90\u6570\u636E\u672A\u63D0\u4F9B\uFF1A\u5F53\u524D\u7EF4\u5EA6\u6CA1\u6709\u5DE5\u5382\u4ED3\uFF0B\u5DE5\u5382\u5916\u79DF\u4ED3\u73B0\u5B58\u91CF\u8BB0\u5F55\uFF1B\u672A\u63090\u5E93\u5B58\u8BA1\u7B97\u3002";
    if (!source.some((row) => Number(row.national_plan_records) > 0))
      return "\u6E90\u6570\u636E\u672A\u63D0\u4F9B\uFF1A\u5F53\u524D\u7EF4\u5EA6\u6CA1\u6709\u5BF9\u5E94\u7248\u672C\u7684\u6708\u5EA6\u8BA1\u5212\u8BB0\u5F55\uFF1B\u672A\u63090\u9700\u6C42\u8BA1\u7B97\u3002";
    if (source.some(
      (row) => Number(row.national_stock_invalid) > 0 || Number(row.national_plan_invalid) > 0 || Number(row.base_plan_invalid) > 0
    ))
      return "\u7CFB\u7EDF\u672A\u80FD\u8BA1\u7B97\uFF1A\u6765\u6E90\u5185\u7684\u73B0\u5B58\u91CF\u3001\u6708\u5EA6\u9700\u6C42\u6216\u8C03\u62E8\u8BA1\u5212\u7F3A\u5931\uFF0C\u6216\u8BA1\u5212\u4E3A\u8D1F\u6570\u3001\u5B58\u5728\u91CD\u590D\u7C92\u5EA6\uFF1B\u4E0D\u662F\u5546\u54C1\u8DE8\u8868\u672A\u5339\u914D\u5BFC\u81F4\u7684\u7A7A\u503C\u3002";
    return "\u7CFB\u7EDF\u672A\u80FD\u8BA1\u7B97\uFF1A\u5F53\u524D\u7EF4\u5EA6\u7684\u5FEB\u7167\u65E5\u671F\u3001\u73B0\u5B58\u91CF\u5408\u8BA1\u6216\u8BA1\u5212\u65E5\u5747\u9700\u6C42\u65E0\u6548\uFF1B\u65E5\u5747\u9700\u6C42\u4E3A0\u65F6\u4E0D\u8BA1\u7B97\u5929\u6570\u3002";
  }
  if (name === "\u8BA2\u5355\u6EE1\u8DB3\u7387" && source.some((row) => Number(row.missing_ship_date) > 0))
    return "\u6E90\u6570\u636E\u672A\u63D0\u4F9B\u6216\u672A\u552F\u4E00\u5339\u914D\uFF1A\u90E8\u5206\u6765\u6E90\u5355\uFF0B\u5BA2\u6237\uFF0B\u4EA7\u54C1\u6CA1\u6709\u5B8C\u6574\u5339\u914D\u6700\u540E\u62C6\u5355\u5B9E\u9645\u53D1\u8D27\u65E5\u671F\uFF1B" + (source.every(
      (row) => ["unmatched_order", "missing_trace", "missing_ship_time"].every((key) => finite(row[key]))
    ) ? `\u539F\u5355/\u4EA7\u54C1\u5173\u8054\u672A\u552F\u4E00\u5339\u914D${sum(source, "unmatched_order")}\u7EC4\uFF08agents_order_execute_isontime_mi.fromorderno/cust_code/new_material_code \u2192 agents_scm_execute_detail_hourly_d.cust_order_no/cust_code/material_code\uFF09\uFF1B\u7A7F\u900F\u8BB0\u5F55\u7F3A\u5931${sum(source, "missing_trace")}\u7EC4\uFF08executeorderno\uFF0Bcust_code \u2192 agents_scm_order_trace_final_di\uFF09\uFF1B\u53D1\u8D27\u65F6\u95F4\u7A7A\u503C\u6216\u7248\u672C\u51B2\u7A81${sum(source, "missing_ship_time")}\u7EC4\uFF08lastshipmenttime/update_time\uFF09\u3002` : "") + "\u65E0\u6CD5\u5B8C\u6574\u5F52\u5C5E\u53D1\u8D27\u5468\u671F\uFF1B\u672A\u4EE5\u63A5\u5355\u65E5\u671F\u6216\u52A0\u8F7D\u65F6\u95F4\u66FF\u4EE3\u3002";
  if (name === "\u51C6\u4EA4\u7387" && source.some((row) => Number(row.invalid) > 0 || row.ontime == null))
    return "\u6E90\u6570\u636E\u672A\u63D0\u4F9B\u6216\u5173\u8054\u51B2\u7A81\uFF1A\u5230\u8D27\u5468\u671F\u5185\u90E8\u5206\u6267\u884C\u5355\u7F3A\u7CFB\u7EDF\u4EA4\u671F\u4E14\u5DF2\u8FBE\u5230\u5DF2\u6709\u4EA4\u671F+\u5BF9\u5E94\u5BA2\u6237\u7C7B\u578B\u768418/12\u5C0F\u65F6\uFF0C\u6216\u5BA2\u6237\u7C7B\u578B\u65F6\u9650\u51B2\u7A81\u3001\u6536\u53D1\u4ED3\u5C5E\u6027\u7F3A\u5931/\u51B2\u7A81\uFF1B\u4E0D\u80FD\u786E\u8BA4\u5176\u4E3A\u51C6\u4EA4\u6216\u903E\u671F\u3002";
  if (name === "\u5468\u8F6C\u5929\u6570" && source.some((row) => row.source_rows === null || row.inventory === null))
    return "\u6E90\u6570\u636E\u672A\u63D0\u4F9B\u6216\u672A\u5BF9\u9F50\uFF1A\u5DE5\u5382\u4ED3\uFF0B\u5DE5\u5382\u5916\u79DF\u4ED3\u7684\u90E8\u5206\u5546\u54C1\u7F3A\u5C11\u540C\u65E5\u5E93\u5B58\u6216\u6708\u5EA6\u8BA1\u5212\u5339\u914D\uFF1B\u672A\u628A\u7F3A\u5931\u5E93\u5B58\u3001\u8BA1\u5212\u5F53\u4F5C0\uFF0C\u6682\u4E0D\u80FD\u53D1\u5E03\u5B8C\u6574\u53EF\u53D1\u8D27\u5929\u6570\u3002";
  const fields2 = name === "\u8BA2\u5355\u6EE1\u8DB3\u7387" ? ["demand", "shortage"] : name === "\u51C6\u4EA4\u7387" ? ["ontime"] : name === "\u5468\u8F6C\u5929\u6570" ? ["inventory"] : name === "\u8D27\u9F84\uFF08>60\u5929\u5E93\u5B58\u5360\u6BD4\uFF09" ? ["stock_qty", "aged_qty"] : ["numerator", "denominator"];
  const absent = fields2.filter((field) => source.some((row) => row[field] == null));
  if (absent.length && !["\u4F5C\u5E9F\u7387", "\u6539\u5355\u7387"].includes(name))
    return `\u6E90\u6570\u636E\u672A\u63D0\u4F9B\uFF1A\u8BA1\u7B97${name}\u9700\u8981\u7684 ${absent.join("\u3001")} \u5B58\u5728\u7A7A\u503C\uFF1B${note}`;
  if (source.some((row) => Number(row.source_rows) > 1))
    return `\u7CFB\u7EDF\u672A\u80FD\u8BA1\u7B97\uFF1A\u540C\u4E00\u7EDF\u8BA1\u7C92\u5EA6\u5B58\u5728\u91CD\u590D\u8BB0\u5F55\uFF0C\u4E0D\u80FD\u76F4\u63A5\u52A0\u603B\uFF1B${note}`;
  const total = (field) => source.reduce((sum2, row) => sum2 + Number(row[field] ?? 0), 0);
  if (["\u4F5C\u5E9F\u7387", "\u6539\u5355\u7387"].includes(name)) {
    const selected = source.filter((row) => String(row.kind) === (name === "\u4F5C\u5E9F\u7387" ? "1" : "2"));
    if (!selected.length)
      return name === "\u6539\u5355\u7387" ? "\u5F53\u524D\u5B9E\u9645\u53D1\u8D27\u5468\u671F\u6CA1\u6709\u53EF\u5F52\u5C5E\u7684\u6709\u6548\u5546\u54C1\u6570\u91CF\u8BB0\u5F55\uFF1A\u65E5\u8868\u9700\u6309\u6267\u884C\u5355\u53F7\uFF0B\u5BA2\u6237\u5173\u8054\u7269\u6D41lastshipmenttime\u88C5\u8F66\u5B8C\u6210\u65F6\u95F4\uFF1B\u7F3A\u65F6\u95F4\u4E0D\u4EE5OMS\u65B0\u589E\u6216WMS\u5173\u5355\u65F6\u95F4\u66FF\u4EE3\u3002" : "\u6E90\u6570\u636E\u672A\u63D0\u4F9B\uFF1Aagents_scm_execute_detail_hourly_d \u5728\u5F53\u524D\u5206\u7EC4\u6CA1\u6709\u5546\u54C1\u6570\u91CF\u7EDF\u8BA1\u8BB0\u5F55\u3002";
    if (name === "\u6539\u5355\u7387" && selected.some(
      (row) => Number(row.invalid) > 0 || row.numerator == null || row.denominator == null
    ))
      return "\u6539\u5355\u6570\u91CF\u6216\u6709\u6548\u660E\u7EC6\u6807\u8BC6\u4E0D\u8DB3\uFF1A\u9700\u5BA2\u6237\u8981\u6C42\u6539\u5355\u91CFchange_order_qty\u3001D\u6700\u540E\u4FEE\u6539\u91CFdms_last_update_qty\u3001\u8C03\u6574\u9700\u6C42\u91CF\u5907\u4EFDneed_qty_origin\u53CA\u5B8C\u6574\u7684\u5BA2\u6237\u3001\u539F\u8BA2\u5355\u3001\u5546\u54C1\u548C\u8BA2\u5355\u72B6\u6001\uFF1B\u5BA2\u6237\u8981\u6C42\u91CF\u4E3A\u7A7A\u6216\u8D1F\u503C\u4E0D\u8BA1\u5206\u5B50\uFF0C\u771F\u5B9E0\u4FDD\u7559\uFF1B\u4E0D\u8981\u6C42\u4EA4\u671F\u6216\u6539\u5355\u65F6\u95F4\u3002";
    if (selected.some(
      (row) => Number(row.invalid) > 0 || row.numerator == null || row.denominator == null
    ))
      return "\u4F5C\u5E9F\u5546\u54C1\u6570\u91CF\u6216\u7EDF\u8BA1\u8303\u56F4\u4F9D\u636E\u4E0D\u8DB3\uFF1A\u9700dms_last_update_qty\u3001change_order_qty\u6216need_qty_origin\uFF0C\u4EE5\u53CAOMS\u65B0\u589E\u65F6\u95F4header_addtime\u3001\u4F5C\u5E9F\u65F6\u95F4canceltime\u3001OMS\u6700\u665A\u53D1\u8F66\u65F6\u95F4latestsendcardate\u548C\u6267\u884C\u5546\u54C1\u884C\u6807\u8BC6\uFF1B\u6536\u53D1\u4ED3\u7684\u5DE5\u5382\u4ED3\u5C5E\u6027\u53CA\u4ED3\u5E93\u4E3B\u6570\u636E\u201C\u5F52\u5C5E\u5DE5\u5382\u63D0\u8D27\u70B9\u201D\u5173\u7CFB\u4E5F\u987B\u53EF\u6838\u5B9E\uFF1B\u5F52\u5C5E\u5173\u7CFB\u53D6\u5DF2\u786E\u8BA4\u7684agents_scm_material_in_out_summary_d.pickup_point\u7A7F\u900F\u6570\u636E\uFF0C\u6309\u4ED3\u5E93\u7F16\u7801\u552F\u4E00\u6620\u5C04\uFF0C\u4E0D\u7528\u81EA\u8EAB\u63D0\u8D27\u70B9\uFF1B\u7F3A\u5931\u6216\u51B2\u7A81\u4ECD\u4FDD\u7559\u672A\u77E5\u3002\u53D1\u8D27\u4ED3\u4E3A*\u4E14\u6709\u6548\u6570\u91CF\u5DF2\u77E5\u5927\u4E8E0\u65F6\uFF0C\u53EA\u6709\u7A7F\u900F\u8868\u6700\u65B0\u7248\u672C\u7684\u5BA2\u6237\u3001\u539F\u8BA2\u5355\u3001\u6267\u884C\u5355\u53CA\u6536\u8D27\u4ED3\u5339\u914D\uFF0C\u4E14\u53D1\u8D27\u4ED3\u5B8C\u6574\u552F\u4E00\uFF0C\u624D\u56DE\u8865deliver_wh\uFF1B\u4E0D\u4F7F\u7528\u8F83\u65E7\u7248\u672C\u8986\u76D6\u6700\u65B0\u7A7A\u503C\u3002\u4ECD\u7F3A\u53D1\u8D27\u4ED3\uFF08\u7A7A\u6216*\uFF09\u65F6\uFF0C\u53D6\u8BA2\u5355pickup_point\uFF0C\u4E0E\u6536\u8D27\u4ED3\u5F52\u5C5E\u5DE5\u5382\u63D0\u8D27\u70B9\u6BD4\u8F83\uFF1B\u4ED3\u7C7B\u53D6\u8BA2\u5355warehouse_classify\uFF0C\u517C\u5BB9\u7F16\u7801\u53CA\u65E5\u8868\u4E2D\u6587\u540D\u79F0\uFF1B\u4E24\u70B9\u4E0D\u540C\u5373\u53EF\u6392\u9664\u77ED\u62E8\uFF0C\u540C\u70B9\u4ECD\u987B\u6838\u5B9E\u53CC\u65B9\u5DE5\u5382\u4ED3/\u5916\u79DF\u4ED3\u5C5E\u6027\u3002\u771F\u5B9E0\u4FDD\u7559\uFF0C\u7F3A\u5931\u6570\u91CF\u3001\u51B2\u7A81\u5546\u54C1\u884C\u6216\u672A\u5224\u5B9A\u77ED\u62E8\u4E0D\u5F53\u4F5C0\u3002";
    if (selected.reduce((sum2, row) => sum2 + Number(row.denominator ?? 0), 0) === 0)
      return `\u7CFB\u7EDF\u672A\u80FD\u8BA1\u7B97\uFF1A\u5F53\u524D\u5206\u7EC4\u6709\u6548\u5546\u54C1\u6570\u91CF\u5206\u6BCD\u4E3A0\uFF0C\u4E0D\u80FD\u8BA1\u7B97${name}\u3002`;
  }
  if (name === "\u8BA2\u5355\u6EE1\u8DB3\u7387" && total("demand") === 0)
    return "\u7CFB\u7EDF\u672A\u80FD\u8BA1\u7B97\uFF1Aagents_order_execute_isontime_mi \u5F53\u524D\u5206\u7EC4\u9700\u6C42\u91CF\u5408\u8BA1\u4E3A0\uFF0C\u8BA2\u5355\u6EE1\u8DB3\u7387\u6CA1\u6709\u6709\u6548\u5206\u6BCD\u3002";
  if (name === "\u5468\u8F6C\u5929\u6570" && source.some((row) => stockDaily(row) === null))
    return "\u7CFB\u7EDF\u672A\u80FD\u8BA1\u7B97\uFF1A\u5E93\u5B58\u5FEB\u7167\u65E5\u671F\u3001\u6708\u5EA6\u9700\u6C42\u8BA1\u5212\u6216\u6570\u91CF\u683C\u5F0F\u65E0\u6548\uFF0C\u65E0\u6CD5\u6362\u7B97\u8BA1\u5212\u65E5\u5747\u9700\u6C42\u3002";
  if (name === "\u5468\u8F6C\u5929\u6570" && source.reduce((sum2, row) => sum2 + Number(stockDaily(row) ?? 0), 0) <= 0)
    return "\u7CFB\u7EDF\u672A\u80FD\u8BA1\u7B97\uFF1A\u540C\u8303\u56F4\u6708\u5EA6\u8BA1\u5212\u65E5\u5747\u9700\u6C42\u5408\u8BA1\u4E0D\u5927\u4E8E0\uFF0C\u53EF\u53D1\u8D27\u5929\u6570\u6CA1\u6709\u6709\u6548\u5206\u6BCD\u3002";
  if (name === "\u8D27\u9F84\uFF08>60\u5929\u5E93\u5B58\u5360\u6BD4\uFF09" && total("stock_qty") <= 0)
    return "\u7CFB\u7EDF\u672A\u80FD\u8BA1\u7B97\uFF1Aagents_scm_stock_detail_d \u5F53\u524D\u5206\u7EC4 current_stock \u5408\u8BA1\u4E0D\u5927\u4E8E0\uFF0C\u8D27\u9F84\u5360\u6BD4\u6CA1\u6709\u6709\u6548\u5206\u6BCD\u3002";
  return `\u7CFB\u7EDF\u672A\u80FD\u8BA1\u7B97\uFF1A${name}\u7684\u6709\u6548\u5206\u6BCD\u3001\u6570\u91CF\u8303\u56F4\u6216\u5224\u5B9A\u6761\u4EF6\u4E0D\u6EE1\u8DB3\uFF1B${note || "\u7F3A\u5931\u4E0D\u88650\uFF0C\u96F6\u5206\u6BCD\u4E0D\u8BA1\u7B97\u6BD4\u7387\u3002"}`;
}
function reportPeriods(start, end, now = /* @__PURE__ */ new Date()) {
  const today = new Date(now.getTime() + 8 * 36e5).toISOString().slice(0, 10);
  const limit = end < today ? end : today;
  const monthStart = start.slice(0, 7) + "-01";
  const monthEnd = new Date(Date.UTC(Number(start.slice(0, 4)), Number(start.slice(5, 7)), 1)).toISOString().slice(0, 10);
  const monthly = start === monthStart && end === monthEnd;
  const last = dayOffset(limit, -1);
  const date2 = /* @__PURE__ */ new Date(last + "T00:00:00Z");
  const weekStart = monthly ? dayOffset(last, -((date2.getUTCDay() + 6) % 7)) : start;
  const inventoryEnd = end < dayOffset(today, 1) ? end : dayOffset(today, 1);
  const month2 = { start: monthStart, end: limit, inventoryEnd, kind: "month" }, week = { start: weekStart, end: limit, inventoryEnd, kind: "week" };
  const monthBack = (period, count) => {
    const d = /* @__PURE__ */ new Date(period.start + "T00:00:00Z");
    d.setUTCMonth(d.getUTCMonth() - count);
    const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString().slice(0, 10);
    const s = d.toISOString().slice(0, 10), e = dayOffset(s, Math.round((Date.parse(period.end) - Date.parse(period.start)) / 864e5));
    return { start: s, end: e < next ? e : next, kind: "month" };
  };
  return {
    selected: monthly ? "month" : "week",
    month: month2,
    previousMonth: monthBack(month2, 1),
    yearMonth: monthBack(month2, 12),
    week,
    previousWeek: {
      start: dayOffset(week.start, -7),
      end: dayOffset(week.end, -7),
      kind: "week"
    },
    yearWeek: {
      start: dayOffset(week.start, -364),
      end: dayOffset(week.end, -364),
      kind: "week"
    }
  };
}

// prototypes/inventory-orderworkbench/report-source.js
var defaultConfig = typeof ORDER_WORKBENCH_APS_CONFIG === "undefined" ? null : ORDER_WORKBENCH_APS_CONFIG;
var numbers = /* @__PURE__ */ new Set([
  "demand",
  "shortage",
  "sample_demand",
  "sample_shortage",
  "sample_records",
  "sample_numerator",
  "sample_denominator",
  "records",
  "invalid",
  "ontime",
  "judged",
  "unjudged",
  "invalid_judgment",
  "numerator",
  "denominator",
  "source_rows",
  "available",
  "inventory",
  "aged",
  "sales_plan",
  "transfer_plan",
  "daily_demand",
  "missing_ship_date",
  "unmatched_order",
  "missing_trace",
  "missing_ship_time",
  "stock_qty",
  "aged_qty",
  "excluded",
  "names",
  "items"
]);
function decodeWorkbenchTuple(value, count) {
  const bytes = new TextEncoder().encode(String(value)), tuple2 = [];
  let cursor = 0;
  for (let field = 0; field < count; field++) {
    const colon = bytes.indexOf(58, cursor);
    const raw = new TextDecoder().decode(bytes.slice(cursor, colon));
    if (colon < cursor || !/^\d+$/.test(raw) || Number(raw) > bytes.length - colon - 1) return null;
    const length = Number(raw);
    tuple2.push(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes.slice(colon + 1, colon + 1 + length))
    );
    cursor = colon + 1 + length;
  }
  return cursor === bytes.length ? tuple2 : null;
}
async function loadWorkbenchReport(start, end, signal, options = {}) {
  const config = options.config ?? defaultConfig;
  if (!config) throw Error("ORDER_METRIC_CONFIG_REQUIRED");
  const client = createAgentQueries(config, options.execute);
  const specs = options.singlePeriod ? { selected: "month", month: options.singlePeriod } : reportPeriods(start, end, options.now);
  const primaryNames = ["month", "week"].filter((name) => specs[name]);
  const sectionIds = options.sections ?? ["orders", "ontime", "changes", "stock", "ages", "directors"];
  const base = normalizeWorkbenchBase(options.base ?? "");
  const turnoverScope = options.turnoverScope ?? (base ? "base" : "national");
  const calculate = (period) => computeWorkbenchMetrics(period, void 0, { turnoverScope });
  const restoredPeriod = (spec) => options.summary && (options.seedFacts ?? []).flatMap(
    (facts) => facts.metricCalculationVersion === metricCalculationVersion && facts.sqlSummary === true && facts.attributionVersion === 2 && (facts.base ?? "") === base ? Object.values(facts.periods ?? {}) : []
  ).find((period) => period.start === spec.start && period.end === spec.end && period.kind === spec.kind && (period.inventoryEnd ?? period.end) === (spec.inventoryEnd ?? spec.end));
  const ontimeWindows = Object.entries(specs).filter(([name]) => name !== "selected").map(([, spec]) => ({
    ...spec,
    enabled: spec.start < spec.end && !restoredPeriod(spec)?.sections?.some((part) => part.id === "ontime" && part.status === "ready")
  }));
  let ontimePeriods;
  const periodWindows = Object.entries(specs).filter(([name]) => name !== "selected").map(([, spec]) => spec);
  const needs = (spec, id) => spec.start < spec.end && !restoredPeriod(spec)?.sections?.some((part) => part.id === id && part.status === "ready" && !Object.keys(part.metricFailures ?? {}).length);
  const periodParameters = (id) => {
    const first = periodWindows.find((spec) => needs(spec, id)) ?? specs.month;
    const values2 = {
      start: first.start,
      end_exclusive: first.end,
      period_start: first.start,
      period_end: first.end,
      owner_start: first.start,
      owner_end: first.end,
      report_base: base,
      page_size: 200,
      offset: 0
    };
    for (const [index, spec] of periodWindows.entries()) {
      values2[`period_${index}_start`] = spec.start;
      values2[`period_${index}_end`] = spec.end;
      values2[`period_${index}_inventory_end`] = spec.inventoryEnd ?? spec.end;
      values2[`period_${index}_director_start`] = dayOffset(spec.end, -1).slice(0, 7) + "-01";
      values2[`period_${index}_enabled`] = id === "snapshots" ? needs(spec, "stock") || needs(spec, "ages") : needs(spec, id);
      for (const suffix of ["stock_date", "age_day", "age_date", "mapping_start", "mapping_end"])
        values2[`period_${index}_${suffix}`] = null;
    }
    return values2;
  };
  let snapshots;
  const readSnapshots = (priority) => snapshots ??= client.read("workbench.period-snapshots", periodParameters("snapshots"), {
    signal,
    priority,
    requiredColumns: periodWindows.flatMap((_, index) => ["stock_" + index, "age_" + index])
  }).then((result) => {
    if (result.rows.length !== 1)
      throw Object.assign(Error("\u5E93\u5B58\u5FEB\u7167\u7ED3\u679C\u4E0D\u5B8C\u6574"), {
        code: "INVALID_SNAPSHOT"
      });
    for (const [key, value] of Object.entries(result.rows[0]))
      if (key.startsWith("stock_") && value !== null && !/^\d{4}-\d{2}-\d{2}$/.test(value) || key.startsWith("age_") && value !== null && !/^\d{8}$/.test(value))
        throw Object.assign(Error("\u5E93\u5B58\u5FEB\u7167\u65E5\u671F\u65E0\u6548"), {
          code: "INVALID_SNAPSHOT"
        });
    return result.rows[0];
  });
  const periodReads = /* @__PURE__ */ new Map();
  const readPeriodSummary = async (name, values2, priority) => {
    if (!periodReads.has(name))
      periodReads.set(
        name,
        (async () => {
          const sourceName2 = name.startsWith("changes.") ? "changes" : name;
          const parameters = periodParameters(sourceName2);
          if (["stock", "ages"].includes(name)) {
            const days = await readSnapshots(priority);
            for (let index2 = 0; index2 < periodWindows.length; index2++) {
              const day = days["age_" + index2];
              const iso = day ? `${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6, 8)}` : null;
              parameters[`period_${index2}_stock_date`] = days["stock_" + index2];
              parameters[`period_${index2}_age_day`] = day;
              parameters[`period_${index2}_age_date`] = iso;
              parameters[`period_${index2}_mapping_start`] = iso ? iso.slice(0, 7) + "-01" : null;
              parameters[`period_${index2}_mapping_end`] = iso ? dayOffset(iso, 1) : null;
            }
          }
          const loadPackets = (queryId) => (name.startsWith("changes.") ? readWithTransientRetry : (read2) => read2())(
            () => client.readAll(queryId, parameters, {
              signal,
              priority,
              singlePageFirst: true,
              keyFields: name === "orders" ? ["section_id", "packet_index"] : ["packet_index"],
              requiredColumns: [
                ...name === "orders" ? ["section_id"] : [],
                "packet_index",
                "packet_count",
                "packet_scope_total",
                "packet_rows"
              ]
            }),
            signal
          );
          if (name === "changes.cancellation" && config.queries["workbench.changes.cancellation.partition0.periods.summary"]) {
            const results = await Promise.all(
              [0, 1].map(
                (partition) => loadPackets(`workbench.${name}.partition${partition}.periods.summary`)
              )
            );
            if (results[0].configVersion !== results[1].configVersion)
              throw Error("QUERY_CONFIG_CHANGED");
            const columns = ["period_index", ...config.queries["workbench.changes"].resultColumns];
            const partitions = results.map(
              (result3) => unpackRowPackets(
                result3.rows,
                columns,
                ["period_index", "kind", "region", "province"],
                1e5,
                workbenchPeriodPacketSize
              )
            );
            return {
              ...results[0],
              directors: [],
              rows: mergeCancellationPartitions(partitions)
            };
          }
          const result2 = await loadPackets(`workbench.${name}.periods.summary`);
          if (name === "orders" && result2.rows.some((row) => ![0, 1].includes(Number(row.section_id))))
            throw Object.assign(Error("\u6307\u6807\u4E0E\u5F52\u5C5E\u5206\u7EC4\u4E0D\u5B8C\u6574"), {
              code: "INVALID_PERIOD_PACKETS"
            });
          const directors = name === "orders" ? unpackRowPackets(
            result2.rows.filter((row) => Number(row.section_id) === 1),
            workbenchDirectorPeriodColumns,
            ["period_index", "base", "sku", "director_value", "item_value"],
            1e5,
            workbenchPeriodPacketSize
          ) : [];
          return {
            ...result2,
            directors,
            rows: unpackRowPackets(
              name === "orders" ? result2.rows.filter((row) => Number(row.section_id) === 0) : result2.rows,
              [
                "period_index",
                ...config.queries[name.startsWith("changes") ? "workbench.changes" : `workbench.${name}.summary`].resultColumns
              ],
              name.startsWith("changes") ? ["period_index", "kind", "region", "province"] : ["period_index", "base", "category", "item", "director", "names"],
              1e5,
              workbenchPeriodPacketSize
            )
          };
        })()
      );
    const sourceName = name.startsWith("changes.") ? "changes" : name;
    const result = await periodReads.get(name);
    const index = periodWindows.findIndex(
      (spec) => needs(spec, sourceName) && spec.start === (values2.period_start ?? values2.start) && spec.end === (values2.period_end ?? values2.end_exclusive)
    );
    if (index < 0 || result.rows.some(
      (row) => !Number.isInteger(Number(row.period_index)) || !periodWindows[Number(row.period_index)] || !needs(periodWindows[Number(row.period_index)], sourceName)
    ))
      throw Object.assign(Error("\u7EDF\u8BA1\u5468\u671F\u5206\u7EC4\u4E0D\u5B8C\u6574"), {
        code: "INVALID_PERIOD_PACKETS"
      });
    return {
      ...result,
      rows: result.rows.filter((row) => Number(row.period_index) === index).map(
        ({ period_index: _period, ...row }) => name === "stock" ? row : name.startsWith("changes") ? {
          ...row,
          unknown_quantity: row.unknown_quantity === null ? null : Number(row.unknown_quantity)
        } : {
          ...row,
          summary: Number(row.summary),
          ...name === "ages" ? { active_records: Number(row.active_records) } : {}
        }
      )
    };
  };
  const readOntimePeriods = async (values2, priority) => {
    if (!ontimePeriods) {
      const parameters = { ...values2, report_base: base, page_size: 200, offset: 0 };
      for (const [index2, window2] of ontimeWindows.entries()) {
        parameters[`period_${index2}_start`] = window2.start;
        parameters[`period_${index2}_end`] = window2.end;
        parameters[`period_${index2}_enabled`] = window2.enabled;
      }
      ontimePeriods = client.readAll("workbench.ontime.periods.summary", parameters, {
        signal,
        priority,
        singlePageFirst: true,
        keyFields: ["period_index", "base", "invalid", "ontime"],
        requiredColumns: ["period_index", "base", "invalid", "ontime", "packed_orders"]
      });
    }
    const result = await ontimePeriods;
    const index = ontimeWindows.findIndex(
      (window2) => window2.enabled && window2.start === values2.start && window2.end === values2.end_exclusive
    );
    if (index < 0 || result.rows.some(
      (row) => !Number.isInteger(Number(row.period_index)) || !ontimeWindows[Number(row.period_index)]?.enabled
    ))
      throw Object.assign(Error("\u51C6\u4EA4\u7EDF\u8BA1\u5468\u671F\u4E0D\u5B8C\u6574"), {
        code: "INVALID_PERIOD_PACKETS"
      });
    return {
      ...result,
      rows: result.rows.filter((row) => Number(row.period_index) === index)
    };
  };
  const reads = /* @__PURE__ */ new Map();
  const read = async (name, values2, priority = 0) => {
    signal?.throwIfAborted();
    const key = JSON.stringify([
      name,
      Object.entries(values2).sort(([a], [b]) => a.localeCompare(b))
    ]);
    if (!reads.has(key)) {
      const pending2 = (name.startsWith("changes.") && name !== "changes.cancellation" && !options.periodQueries ? readWithTransientRetry(() => readSource(name, values2, priority), signal) : readSource(name, values2, priority)).catch((error) => {
        reads.delete(key);
        throw error;
      });
      reads.set(key, pending2);
    }
    const rows = await reads.get(key);
    signal?.throwIfAborted();
    return structuredClone(rows);
  };
  const readSource = async (name, values2, priority) => {
    signal?.throwIfAborted();
    if (name === "changes.cancellation" && !options.periodQueries && config.queries["workbench.changes.cancellation.partition0"])
      return mergeCancellationPartitions(
        await Promise.all(
          [0, 1].map((partition) => read(name + ".partition" + partition, values2, priority))
        )
      );
    if (name === "directors" && options.summary && options.periodQueries && periodReads.has("orders")) {
      const index = periodWindows.findIndex(
        (spec) => needs(spec, "orders") && dayOffset(spec.end, -1).slice(0, 7) + "-01" === values2.start && spec.end === values2.end_exclusive
      );
      if (index >= 0) {
        const result2 = await periodReads.get("orders");
        return collectDirectorMembers(
          result2.directors.filter((row) => Number(row.period_index) === index).map(({ period_index: _period, ...row }) => row)
        );
      }
    }
    if (name === "ageDate" && options.summary && options.periodQueries) {
      const index = periodWindows.findIndex(
        (spec) => spec.start.replaceAll("-", "") === values2.start && (spec.inventoryEnd ?? spec.end).replaceAll("-", "") === values2.end_exclusive
      );
      if (index < 0) throw Error("INVALID_SNAPSHOT_PERIOD");
      return [{ day: (await readSnapshots(priority))["age_" + index] }];
    }
    const definition = workbenchQueries[name] ?? (name.startsWith("changes.") ? workbenchQueries.changes : void 0), logicalId = "workbench." + name.toLowerCase() + (options.summary && ["orders", "stock", "ages", "ontime"].includes(name) ? ".summary" : "");
    const summarized = logicalId.endsWith(".summary");
    const packeted = summarized && name === "stock" || options.summary && ["directors", "customers", "customerManagers"].includes(name);
    const id = logicalId + (packeted ? ".packets" : "");
    if (summarized)
      values2 = {
        ...values2,
        period_start: values2.period_start ?? values2.start,
        period_end: values2.period_end ?? values2.end_exclusive,
        owner_start: values2.period_start ?? values2.start,
        owner_end: values2.period_end ?? values2.end_exclusive
      };
    const periodSummary = options.periodQueries && options.summary && (["orders", "stock", "ages", "changes"].includes(name) || name.startsWith("changes."));
    const result = periodSummary ? await readPeriodSummary(name, values2, priority) : name === "ontime" && options.periodQueries && options.summary ? await readOntimePeriods(values2, priority) : definition.keys ? await client.readAll(
      id,
      {
        ...values2,
        report_base: base,
        page_size: 200,
        offset: 0
      },
      {
        signal,
        priority,
        keyFields: packeted ? ["packet_index"] : summarized ? name === "ontime" ? ["base", "invalid", "ontime"] : ["base", "category", "item", "director", "names"] : definition.keys,
        requiredColumns: packeted || summarized ? config.queries[id].resultColumns : definition.columns,
        singlePageFirst: true
      }
    ) : await client.read(
      id,
      { ...values2, report_base: base },
      { signal, priority, requiredColumns: definition.columns }
    );
    const sourceRows = packeted && !periodSummary ? unpackRowPackets(
      result.rows,
      config.queries[name === "directors" ? "workbench.directormembers" : logicalId].resultColumns,
      name === "directors" ? ["base", "sku", "director_value", "item_value"] : name === "stock" ? ["base", "category", "item", "director", "names"] : definition.keys
    ) : result.rows;
    const rows = name === "ontime" && summarized ? sourceRows.flatMap((row) => {
      const packed = typeof row.packed_orders === "string" ? JSON.parse(row.packed_orders) : row.packed_orders;
      if (!Array.isArray(packed))
        throw Object.assign(Error("\u51C6\u4EA4\u8BA2\u5355\u5206\u7EC4\u4E0D\u5B8C\u6574"), {
          code: "INVALID_ORDER_PACKETS"
        });
      return packed.map((order) => {
        const tuple2 = decodeWorkbenchTuple(order, 7);
        if (!tuple2)
          throw Object.assign(Error("\u51C6\u4EA4\u8BA2\u5355\u5206\u7EC4\u5B57\u6BB5\u4E0D\u5B8C\u6574"), {
            code: "INVALID_ORDER_PACKETS"
          });
        const [order_no, customer, arrival_date, ...member] = tuple2;
        return {
          order_no,
          customer,
          arrival_date,
          invalid: row.invalid,
          ontime: row.ontime,
          members: [member]
        };
      });
    }) : sourceRows;
    const normalized = rows.map(
      (row) => Object.fromEntries(
        Object.entries(row).map(([key, value]) => [
          key,
          numbers.has(key) && typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value)) ? Number(value) : value
        ])
      )
    );
    if (name === "directors" && packeted) return collectDirectorMembers(normalized);
    if (name === "directors")
      return normalized.map(
        (row) => row.director_encoding === "nullable-utf8-v1" ? { ...row, directors: decodeScalarArray(row.directors) } : row
      );
    if (name !== "ontime") return normalized;
    return normalized.flatMap((row) => {
      let members;
      try {
        members = Array.isArray(row.members) ? row.members : JSON.parse(row.members);
      } catch {
        throw Object.assign(Error("\u51C6\u4EA4\u8BA2\u5355\u7EF4\u5EA6\u4E0D\u5B8C\u6574"), {
          code: "INVALID_ORDER_DIMENSIONS"
        });
      }
      if (Array.isArray(members))
        members = members.map((member) => {
          if (Array.isArray(member)) return member;
          return decodeWorkbenchTuple(member, 4);
        });
      if (!Array.isArray(members) || !members.length || members.some((tuple2) => !Array.isArray(tuple2) || tuple2.length !== 4))
        throw Object.assign(Error("\u51C6\u4EA4\u8BA2\u5355\u7EF4\u5EA6\u4E0D\u5B8C\u6574"), {
          code: "INVALID_ORDER_DIMENSIONS"
        });
      const { members: _members, ...order } = row;
      return members.map(([base2, category, item, sku]) => ({
        ...order,
        base: base2,
        category,
        item,
        sku
      }));
    });
  };
  const section = async (id, action2) => {
    try {
      const result = await action2();
      return { id, status: "ready", ...Array.isArray(result) ? { rows: result } : result };
    } catch (error) {
      signal?.throwIfAborted();
      return {
        id,
        status: "error",
        rows: [],
        code: error.code ?? "QUERY_FAILED",
        detail: typeof error.message === "string" ? error.message.slice(0, 800) : "",
        rejectedColumns: error.rejectedColumns ?? error.failure?.rejectedColumns ?? []
      };
    }
  };
  const batchSnapshots = /* @__PURE__ */ new Map();
  const readBatchSnapshot = async (values2, priority) => {
    signal?.throwIfAborted();
    const key = JSON.stringify(values2);
    if (!batchSnapshots.has(key)) {
      const pending2 = read("ages", values2, priority).catch((error) => {
        batchSnapshots.delete(key);
        throw error;
      });
      batchSnapshots.set(key, pending2);
    }
    const rows = await batchSnapshots.get(key);
    signal?.throwIfAborted();
    return structuredClone(rows);
  };
  const load = async (spec, name) => {
    const values2 = { start: spec.start, end_exclusive: spec.end };
    const priority = name === "month" ? 30 : name === "week" ? 20 : -10;
    if (spec.start >= spec.end)
      return {
        ...spec,
        sections: [],
        metrics: calculate({ ...spec, sections: [] })
      };
    const restored = restoredPeriod(spec);
    const pending2 = sectionIds.map((id) => restored?.sections?.find((part) => part.id === id && part.status === "ready" && !Object.keys(part.metricFailures ?? {}).length) ?? { id, status: "loading", rows: [] });
    const update = () => {
      periods[name] = {
        ...spec,
        sections: [...pending2],
        metrics: calculate({ ...spec, sections: pending2 })
      };
      progress();
    };
    if (pending2.some((part) => part.status === "ready")) update();
    const [sections, attribution, sharedItems] = await Promise.all([
      Promise.all(
        sectionIds.map(
          (id) => (async () => {
            const cached = pending2.find((part) => part.id === id && part.status === "ready");
            if (cached) return cached;
            if (id === "changes" && config.queries["workbench.changes.amendment"] && config.queries["workbench.changes.cancellation"]) {
              const branches = [
                ["1", "cancellation"],
                ["2", "amendment"]
              ].filter(([kind]) => !options.changeKinds || options.changeKinds.includes(kind));
              const parts = branches.map(([kind]) => ({
                id: kind,
                status: "loading",
                rows: []
              }));
              await Promise.all(
                branches.map(async ([kind, source], index) => {
                  parts[index] = await section(
                    kind,
                    () => read("changes." + source, values2, priority + (source === "amendment" ? 1 : 0))
                  );
                  pending2[pending2.findIndex((item) => item.id === id)] = changesSection(parts);
                  update();
                })
              );
              return changesSection(parts);
            }
            return section(id, async () => {
              if (id === "directors")
                return read(
                  id,
                  {
                    start: dayOffset(spec.end, -1).slice(0, 7) + "-01",
                    end_exclusive: spec.end
                  },
                  priority
                );
              if (id !== "ages") return read(id, values2, priority);
              const dates = await read(
                "ageDate",
                {
                  start: spec.start.replaceAll("-", ""),
                  end_exclusive: (spec.inventoryEnd ?? spec.end).replaceAll("-", "")
                },
                priority
              );
              const raw = dates[0]?.day;
              if (!raw) return [];
              if (!/^\d{8}$/.test(raw))
                throw Object.assign(Error("\u5FEB\u7167\u65E5\u671F\u65E0\u6548"), {
                  code: "INVALID_SNAPSHOT"
                });
              const snapshot2 = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
              return readBatchSnapshot(
                {
                  start: raw,
                  snapshot: snapshot2,
                  mapping_start: snapshot2.slice(0, 7) + "-01",
                  mapping_end: dayOffset(snapshot2, 1),
                  ...options.summary ? { period_start: spec.start, period_end: spec.end } : {}
                },
                priority
              );
            });
          })().then((part) => {
            pending2[pending2.findIndex((item) => item.id === id)] = part;
            update();
            return part;
          })
        )
      ),
      options.summary ? null : section("directors", () => read("directors", values2)),
      options.summary ? null : section("items", () => read("items", values2))
    ]);
    if (!options.summary) applyPeriodAttributions(sections, attribution.rows, sharedItems.rows);
    return { ...spec, sections, metrics: calculate({ ...spec, sections }) };
  };
  const periods = {};
  const selected = specs.selected;
  const metadata = Object.fromEntries(
    ["directors", "customers", "customerManagers"].map((id) => [
      id,
      { id, status: "loading", rows: [] }
    ])
  );
  const restoredMetadata = options.summary && (options.seedFacts ?? []).find((facts) => facts.metricCalculationVersion === metricCalculationVersion && facts.sqlSummary === true && facts.attributionVersion === 2 && (facts.base ?? "") === base && facts.start === start && facts.end === end);
  const snapshot = (complete = false) => ({
    base,
    turnoverScope,
    metricCalculationVersion,
    displayMode: "governed-live",
    start,
    end,
    selected,
    periods: { ...periods },
    ...metadata,
    complete,
    sqlSummary: options.summary === true,
    attributionVersion: 2,
    pendingPeriods: Object.keys(specs).filter((name) => name !== "selected" && !periods[name]),
    pendingSources: Object.keys(metadata).filter((name) => metadata[name].status === "loading"),
    readAt: (/* @__PURE__ */ new Date()).toISOString(),
    source: "gea-governed-sql",
    metricRegister: "https://klvcodtump.feishu.cn/docx/S7zwdltIaoKfZ0x8oqHcStqQnGg"
  });
  const progress = () => {
    signal?.throwIfAborted();
    if (periods.month || periods[selected]) options.onProgress?.(snapshot());
  };
  const primary = Promise.all(
    primaryNames.map(async (name) => {
      periods[name] = await load(specs[name], name);
      progress();
    })
  );
  if (!options.periodQueries) await primary;
  signal?.throwIfAborted();
  const entries = Object.entries(specs).filter(
    ([name]) => name !== "selected" && !["month", "week"].includes(name)
  );
  const values = {
    start: specs[selected].start,
    end_exclusive: specs[selected].end
  };
  const loadMetadata = async () => Promise.all(
    ["directors", "customers", "customerManagers"].map(async (id) => {
      if (options.metadata === false) {
        metadata[id] = { id, status: "ready", rows: [] };
        return;
      }
      if (id === "directors") await primary;
      const range = id === "directors" ? specs.month : specs[selected];
      metadata[id] = restoredMetadata?.[id]?.status === "ready" ? restoredMetadata[id] : id === "directors" ? periods.month.sections.find((part) => part.id === "directors") ?? {
        id,
        status: "ready",
        rows: []
      } : await section(
        id,
        () => range.start >= range.end ? [] : read(
          id,
          id === "directors" ? {
            start: specs.month.start,
            end_exclusive: specs.month.end
          } : values
        )
      );
      progress();
    })
  );
  await Promise.all([
    primary,
    loadMetadata(),
    ...entries.map(async ([name, spec]) => {
      periods[name] = await load(spec, name);
      progress();
    })
  ]);
  signal?.throwIfAborted();
  return snapshot(true);
}

// prototypes/inventory-orderworkbench/metric-components.mjs
function metricDisplayState(metric, key, base = "") {
  if (metric?.emptyPeriod) return "\u6682\u65E0\u5DF2\u7ED3\u675F\u65E5\u671F";
  if (metric?.loading) return "\u52A0\u8F7D\u4E2D";
  if (metric?.value == null && metric?.missingReason?.startsWith("\u7CFB\u7EDF\u8BFB\u53D6\u672A\u6210\u529F")) return "\u67E5\u8BE2\u5931\u8D25";
  if (metric?.noRows) return "\u6682\u65E0\u6570\u636E";
  return workbenchMetricState(key, metric?.value ?? null, base);
}
function metricSnapshot(period, key, { base = "", turnoverScope = base ? "base" : "national" } = {}) {
  const saved = period.metrics[key];
  const metric = saved.emptyPeriod ? { ...saved, note: workbenchMetricMissingReason(period, key) } : saved;
  const available = !metric.emptyPeriod && period.sections.some((part) => part.id === metricSpecs[key].section && part.status === "ready");
  const rows = (id) => metricSection(period, id, key)?.status === "ready" ? metricSection(period, id, key).rows : [];
  const sum2 = (data, field) => data.length && data.every(
    (row) => row[field] !== null && row[field] !== void 0 && row[field] !== "" && Number.isFinite(Number(row[field]))
  ) ? data.reduce((total, row) => total + Number(row[field]), 0) : null;
  let numerator = null, denominator = null, quantityUnit = "\u5546\u54C1\u6570\u91CF", pending2 = null;
  if (["\u4F5C\u5E9F\u7387", "\u6539\u5355\u7387"].includes(key)) {
    const data = rows("changes").filter(
      (row) => String(row.kind) === (key === "\u4F5C\u5E9F\u7387" ? "1" : "2")
    );
    numerator = metric.provisional ? metric.population?.knownNumerator ?? null : sum2(data, metric.sample ? "sample_numerator" : "numerator");
    denominator = metric.provisional ? metric.population?.denominator ?? null : sum2(data, metric.sample ? "sample_denominator" : "denominator");
    pending2 = sum2(data, "invalid");
  } else if (key === "\u8BA2\u5355\u6EE1\u8DB3\u7387") {
    const data = rows("orders");
    denominator = sum2(data, metric.sample ? "sample_demand" : "demand");
    const shortage = sum2(data, metric.sample ? "sample_shortage" : "shortage");
    numerator = denominator !== null && shortage !== null ? denominator - shortage : null;
    pending2 = sum2(data, "invalid");
  } else if (key === "\u51C6\u4EA4\u7387") {
    numerator = available ? metric.counts?.onTime ?? null : null;
    denominator = available ? metric.counts?.total ?? null : null;
    pending2 = available ? metric.counts?.pending ?? null : null;
    quantityUnit = "\u5F20\u6267\u884C\u5355";
  } else if (key === "\u8D27\u9F84\uFF08>60\u5929\u5E93\u5B58\u5360\u6BD4\uFF09") {
    numerator = sum2(rows("ages"), "aged_qty");
    denominator = sum2(rows("ages"), "stock_qty");
    pending2 = sum2(rows("ages"), "invalid");
  } else if (key === "\u5468\u8F6C\u5929\u6570") {
    const quantities = stockComponents(rows("stock"), turnoverScope);
    numerator = quantities?.numerator ?? null;
    denominator = quantities?.denominator ?? null;
    quantityUnit = "\u5206\u5B50\uFF1A\u73B0\u5B58\u5546\u54C1\u6570\u91CF\uFF1B\u5206\u6BCD\uFF1A\u5546\u54C1\u6570\u91CF/\u5929";
  }
  return {
    value: metric.value,
    target: metricTarget(key, base),
    status: metricDisplayState(metric, key, base),
    unit: metric.unit,
    periodBasis: metricSpecs[key].dateBasis,
    ...metricSpecs[key].cancellationBoundary ? { cancellationBoundary: metricSpecs[key].cancellationBoundary } : {},
    formula: metric.note,
    note: metric.note,
    coverageNote: metric.coverageNote ?? null,
    population: metric.population ?? null,
    numerator,
    denominator,
    quantityUnit,
    pending: pending2,
    ...key === "\u51C6\u4EA4\u7387" ? {
      known: available ? metric.counts?.known ?? null : null,
      late: available && metric.counts ? metric.counts.known - metric.counts.onTime : null
    } : {},
    pendingUnit: key === "\u51C6\u4EA4\u7387" ? "\u5F20\u6267\u884C\u5355" : key === "\u8BA2\u5355\u6EE1\u8DB3\u7387" ? "\u4E2A\u5019\u9009\u539F\u5355\u4EA7\u54C1\u7EC4" : key === "\u8D27\u9F84\uFF08>60\u5929\u5E93\u5B58\u5360\u6BD4\uFF09" ? "\u4E2A\u5E93\u5B58\u6C47\u603B\u7C92\u5EA6" : "\u6761\u5019\u9009\u5546\u54C1\u660E\u7EC6",
    scope: key === "\u51C6\u4EA4\u7387" ? "\u5B8C\u6574\u5019\u9009\u6267\u884C\u5355\u5206\u6BCD\uFF08\u542B\u5F85\u5224\u5B9A\uFF09\uFF0C\u6837\u672C\u7387\u4EC5\u4F5C\u8865\u5145" : metric.provisional ? "\u6682\u7B97\u5206\u5B50/\u5168\u91CF\u6709\u6548\u91CF\u5206\u6BCD" : metric.sample ? "\u53EF\u5224\u5B9A\u6837\u672C\uFF0C\u975E\u5168\u91CF" : "\u5F53\u524D\u5361\u7247\u7EDF\u8BA1\u96C6\u5408",
    sample: metric.sample ?? null,
    provisional: metric.provisional === true,
    missingReason: metric.missingReason ?? null,
    excluded: null,
    countMeaning: "pending\u4E3A\u5DF2\u4FDD\u7559\u96C6\u5408\u5185\u5F85\u5224\u5B9A\u8BA1\u6570\uFF0C\u5355\u4F4D\u968F\u6307\u6807\u7C92\u5EA6\uFF1B\u4E0D\u662F\u5254\u9664\u6570\u3002excluded\u672A\u53D1\u5E03\uFF0C\u4E0D\u80FD\u51990\u3002"
  };
}

// prototypes/inventory-orderworkbench/metric-runtime.mjs
async function readOrderMetric(config, input, execute, signal, { now = /* @__PURE__ */ new Date() } = {}) {
  signal?.throwIfAborted();
  const metric = resolveMetricName(input.metric), spec = metricSpecs[metric];
  const date2 = (value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
  if (!date2(input.start) || !date2(input.endExclusive) || input.start >= input.endExclusive || Date.parse(input.endExclusive) - Date.parse(input.start) > 366 * 864e5)
    throw Error("INVALID_ORDER_METRIC_PERIOD");
  if (input.base !== void 0 && (typeof input.base !== "string" || input.base.length > 64))
    throw Error("INVALID_ORDER_METRIC_SCOPE");
  if (!["contract", "summary", "details", void 0].includes(input.view))
    throw Error("INVALID_ORDER_METRIC_VIEW");
  const page2 = input.page ?? 1;
  if (!Number.isSafeInteger(page2) || page2 < 1 || page2 > 5e3)
    throw Error("INVALID_ORDER_METRIC_PAGE");
  if (config.agentId !== "inventory-orderworkbench" || config.metricRuntime?.version !== metricCalculationVersion || input.expectedVersion !== void 0 && input.expectedVersion !== metricCalculationVersion)
    throw Error("ORDER_METRIC_VERSION_STALE");
  const base = normalizeWorkbenchBase(input.base ?? ""), scope = base ? "base" : "national", contract = metricContract(metric, config, scope);
  const today = new Date(now.getTime() + 8 * 36e5).toISOString().slice(0, 10);
  const end = input.endExclusive < today ? input.endExclusive : today;
  const inventoryEnd = input.endExclusive < dayOffset(today, 1) ? input.endExclusive : dayOffset(today, 1);
  const period = { start: input.start, end, inventoryEnd, kind: "range" };
  const envelope = {
    readonly: true,
    metric,
    version: metricCalculationVersion,
    revision: config.metricRuntime.revision,
    period: {
      start: period.start,
      endExclusive: period.end,
      inventoryEndExclusive: period.inventoryEnd
    },
    requestedPeriod: { start: input.start, endExclusive: input.endExclusive },
    base,
    contract
  };
  if (input.view === "contract") return envelope;
  const facts = await loadWorkbenchReport(input.start, input.endExclusive, signal, {
    config,
    execute,
    now,
    singlePeriod: period,
    sections: [spec.section],
    changeKinds: spec.kind ? [spec.kind] : void 0,
    metadata: false,
    summary: true,
    periodQueries: false,
    base,
    turnoverScope: scope
  });
  const currentPeriod = facts.periods.month;
  const current = metricSnapshot(currentPeriod, metric, {
    base,
    turnoverScope: scope
  });
  const sources = currentPeriod.sections.map((part) => ({
    id: part.id,
    status: metricSection(currentPeriod, part.id, metric)?.status ?? part.status,
    code: metricSection(currentPeriod, part.id, metric)?.code ?? part.code,
    detail: metricSection(currentPeriod, part.id, metric)?.detail ?? part.detail,
    rows: part.rows.length,
    dates: [
      ...new Set(part.rows.map((row) => row.stock_date ?? row.snapshot_date).filter(Boolean))
    ]
  }));
  const result = { ...envelope, current, sources, readAt: facts.readAt };
  if (input.view === "details") {
    if (!spec.details)
      return {
        ...result,
        details: {
          availability: "not-published",
          reason: "\u5F53\u524D\u7EDF\u4E00\u5165\u53E3\u672A\u53D1\u5E03\u8BE5\u6307\u6807\u539F\u59CB\u660E\u7EC6\uFF1B\u4E0D\u4EE3\u8868\u5E95\u8868\u65E0\u6570\u636E\u6216\u65E0\u6743\u9650\u3002"
        }
      };
    const client = createQueryClient(config, execute);
    const values = {
      start: period.start,
      end_exclusive: period.end,
      report_base: base,
      page_size: 200,
      offset: (page2 - 1) * 200
    };
    const selected = Object.fromEntries(
      Object.values(config.queries[spec.details].parameterSpec).map((p) => [
        p.name,
        values[p.name]
      ])
    );
    const details = await client.read(spec.details, selected, {
      signal,
      requiredColumns: config.queries[spec.details].resultColumns
    });
    return {
      ...result,
      details: {
        ...details,
        page: page2,
        pageSize: 200,
        availability: "available",
        scope: "\u5F53\u524D\u9875\u660E\u7EC6\uFF0C\u4E0D\u66FF\u4EE3\u5B8C\u6574\u6C47\u603B\uFF1B\u4E0D\u63A8\u65AD\u5168\u56FD\u96C6\u4E2D\u5206\u5E03\u3002"
      }
    };
  }
  return result;
}
export {
  computeWorkbenchMetrics,
  metricCalculationVersion,
  metricContract,
  metricSnapshot,
  readOrderMetric,
  resolveMetricName
};
