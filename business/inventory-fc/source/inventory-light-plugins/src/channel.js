import { sqlQueryError } from "./query-error.js";
let context;
let channel,
  sequence = 0;
const pending = new Map(),
  handlers = new Map();
let readyResolve;
export const ready = new Promise((resolve) => {
  readyResolve = resolve;
});
window.addEventListener("message", (event) => {
  if (
    event.source !== window.parent ||
    event.origin !== new URL(document.referrer).origin ||
    typeof event.data?.context?.session !== "string" ||
    typeof event.data?.context?.plugin !== "string" ||
    event.data?.protocol !== "gea-html-v1" ||
    event.data?.type !== "connect" ||
    !event.ports[0] ||
    channel
  )
    return;
  context = event.data.context;
  channel = event.ports[0];
  channel.onmessage = (event) => {
    const message = event.data;
    if (message.type === "context") {
      const previousSession = context?.session;
      if (previousSession && previousSession !== message.context?.session) {
        for (const [id, item] of pending) {
          clearTimeout(item.timer);
          item.cleanup?.();
          item.reject(Error("页面会话已切换，请重新操作"));
          channel.postMessage({ type: "cancel", id });
        }
        pending.clear();
      }
      context = message.context;
      if (context?.session) channel.postMessage({type: "theme:subscribe", session: context.session});
      if (context?.session && previousSession !== context.session)
        window.dispatchEvent(new Event("gea-session-changed"));
    }
    if (message.type === "theme" && context && message.context?.session === context.session && message.context?.plugin === context.plugin) {
      if (message.version !== "1.0.0" || !["light", "dark"].includes(message.colorScheme) ||
          !message.tokens || !["--workbench-page", "--workbench-text", "--workbench-font-size"].every(name => typeof message.tokens[name] === "string") ||
          Object.entries(message.tokens).some(([name,value]) => !/^--workbench-[a-z-]+$/.test(name) || typeof value !== "string" || value.length > 500)) {
        document.getElementById("app").textContent = "共享样式版本不兼容，请重新打开页面";
        return;
      }
      for (const [name,value] of Object.entries(message.tokens)) document.body.style.setProperty(name,value);
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
              detail: { message: error.message.slice(0, 600) },
            }),
          );
        item.reject(error);
      } else item.resolve(message.result);
    }
    if (message.type === "invoke") {
      const handler = handlers.get(message.name);
      const session = context?.session;
      Promise.resolve()
        .then(() => {
          if (!handler) throw Error("页面未注册该操作");
          return handler(message.arguments);
        })
        .then(
          (result) =>
            channel.postMessage({ type: "invoked", id: message.id, session, result }),
          (error) =>
            channel.postMessage({
              type: "invoked",
              id: message.id,
              session,
              error: error.message,
            }),
        );
    }
    if (message.type === "identity-changed") {
      for (const item of pending.values()) {
        clearTimeout(item.timer);
        item.cleanup?.();
        item.reject(Error("登录身份已变化，请重新加载"));
      }
      pending.clear();
      window.dispatchEvent(new Event("gea-identity-changed"));
    }
  };
  channel.start();
  channel.postMessage({type: "theme:subscribe", session: context.session});
  readyResolve(event.data.context);
});
window.parent.postMessage({ protocol: "gea-html-v1", type: "ready" }, "*");
export async function call(method, parameters = {}, options = {}) {
  await ready;
  options.signal?.throwIfAborted();
  const id = String(++sequence);
  return new Promise((resolve, reject) => {
    const cleanup = () => options.signal?.removeEventListener("abort", abort);
    const abort = () => {
      if (!pending.delete(id)) return;
      clearTimeout(timer);
      cleanup();
      channel.postMessage({ type: "cancel", id });
      reject(options.signal.reason ?? Error("请求已取消"));
    };
    const timer = setTimeout(() => {
      pending.delete(id);
      cleanup();
      channel.postMessage({ type: "cancel", id });
      const error = Error("业务请求超时");
      reject(method === "sql" ? sqlQueryError(error) : error);
    }, 120000);
    pending.set(id, { resolve, reject, timer, method, cleanup });
    options.signal?.addEventListener("abort", abort, {once: true});
    channel.postMessage({ type: "request", id, method, parameters, session: context?.session });
  });
}
export function action(name, description, handler) {
  handlers.set(name, handler);
  void ready.then(() =>
    channel.postMessage({ type: "register", name, description, session: context?.session }),
  );
}
export function ask(text, context) {
  return call("conversation", { text, context });
}
export function publish(context) {
  return call("context", context);
}
