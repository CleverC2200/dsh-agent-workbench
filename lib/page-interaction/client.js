// src/page-interaction/reference.ts
var PAGE_INTERACTION = "dsh-page-interaction-v1";
var REFERENCE_SOURCE = "page-content";
var REFERENCE_TEXT_LIMIT = 6e3;
var text = (value, limit) => typeof value === "string" ? value.trim().slice(0, limit) : "";
function referenceFields(v, content, truncated) {
  return {
    page: text(v.page, 160),
    kind: v.kind === "row" || v.kind === "table" ? v.kind : "block",
    label: text(v.label, 160) || "\u9875\u9762\u5185\u5BB9",
    text: content,
    row: text(v.row, 200),
    column: text(v.column, 200),
    scope: text(v.scope, 1e3),
    targets: Array.isArray(v.targets) ? v.targets.filter(
      (x) => typeof x === "string" && x.length <= 200
    ) : [],
    capturedAt: text(v.capturedAt, 64),
    truncated
  };
}
function pageReference(value) {
  if (!value || typeof value !== "object") return;
  const v = value;
  if (typeof v.text !== "string" || !v.text.trim()) return;
  return referenceFields(v, text(v.text, REFERENCE_TEXT_LIMIT), v.text.length > REFERENCE_TEXT_LIMIT || v.truncated === true);
}
function pageQuoteReference(value) {
  if (!value || typeof value !== "object") return;
  const raw = value.text;
  if (typeof raw !== "string" || !raw.trim() || raw.length > REFERENCE_TEXT_LIMIT) return;
  return referenceFields(value, raw, false);
}
function serializeReference(value) {
  if (!/^R[a-f0-9]{12}$/.test(value.id) || typeof value.label !== "string")
    throw Error("\u5F15\u7528\u5DF2\u5931\u6548\uFF0C\u8BF7\u91CD\u65B0\u9009\u62E9\u5185\u5BB9\u3002");
  const label = value.label.replace(/[%\[\]\\@\/\r\n]/g, encodeURIComponent);
  return `[${label}](dsh-page:${value.id}) `;
}

// src/page-interaction/owned-reference.ts
function ownedReferenceSpans(state, owned) {
  let expanded = 0;
  const spans = [];
  for (const occurrence of state.occurrences) {
    const start = occurrence.offset - expanded;
    if (occurrence.source === REFERENCE_SOURCE && owned.has(occurrence.ref))
      spans.push({ start, end: start + 1 });
    expanded += occurrence.length - 1;
  }
  return spans.reverse();
}

// src/page-interaction/client.ts
import React, { useEffect, useRef } from "react";
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
      button.setAttribute("aria-label", binding?.selecting ? "\u9000\u51FA\u9009\u62E9" : "\u9009\u62E9\u5185\u5BB9");
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
        const paired = [...triggers].filter(
          (button) => button.isConnected && button.getClientRects().length > 0 && currentPicker(button.dataset.sessionId)
        );
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
        if (typeof document === "undefined" || !document.hasFocus()) release(true);
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
      const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
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
    bindFrame(options) {
      if (options.mode !== "business" && options.mode !== "quote")
        throw Error("UNSUPPORTED_PAGE_REFERENCE_BINDING");
      const { frame, reference, page } = options;
      const business = options.mode === "business" ? options : void 0;
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
      const paired = () => retained() && (options.mode !== "quote" || options.isCurrentSession()) && currentPicker(sessionId) === binding && [...triggers].some(
        (button) => button.dataset.sessionId === sessionId && button.isConnected && button.getClientRects().length > 0
      );
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
      const ownedReferences = /* @__PURE__ */ new Set();
      let invalidated = false;
      let observedInput;
      let unobserveInput = () => {
      };
      let cleanupScheduled = false;
      const removeOwnedReferences = () => {
        if (!invalidated || !observedInput || !retained()) return;
        while (true) {
          const state = observedInput.state.getSnapshot();
          const span = ownedReferenceSpans(state, ownedReferences)[0];
          if (!span) return;
          if (!owned.ctx.bail("slash/input-consume-token", {
            guard: { kind: "span", span: { ...span, draftRev: state.draftRev } }
          }))
            return;
        }
      };
      const identityChanged = () => {
        if (!business) return;
        invalidated = true;
        for (const controller of requests.values()) controller.abort();
        removeOwnedReferences();
      };
      window.addEventListener("gea-business-identity-changed", identityChanged);
      const send = (message) => frame.contentWindow?.postMessage({ protocol: PAGE_INTERACTION, channel, ...message }, "*");
      const configure = () => {
        if (!business || generation)
          send({
            type: "configure",
            page,
            quote: !business,
            externalTrigger: [...triggers].some((button) => button.dataset.sessionId === sessionId)
          });
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
            input().notify("error", String(event.data.error || "\u5F15\u7528\u672A\u52A0\u5165\uFF0C\u8BF7\u91CD\u8BD5\u3002"));
          return;
        }
        if (event.data.type === "cancel-reference") {
          requests.get(event.data.requestId)?.abort();
          return;
        }
        if (event.data.type !== "reference" && event.data.type !== "quote" || typeof event.data.requestId !== "string")
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
          if (!paired() || business && (!ready || !generation || invalidated))
            throw Error("\u8BF7\u5148\u6253\u5F00\u5F53\u524D\u9875\u9762\u7684\u5BF9\u8BDD\uFF0C\u518D\u52A0\u5165\u63D0\u95EE\u3002");
          if (event.data.type === "quote" && options.mode !== "quote")
            throw Error("\u8BF7\u5173\u8054\u5F53\u524D\u9875\u9762\u7684\u771F\u5B9E\u5BF9\u8BDD\uFF0C\u518D\u8F6C\u5165\u8349\u7A3F\u3002");
          const selected = event.data.type === "quote" ? pageQuoteReference(event.data.reference) : pageReference(event.data.reference);
          if (!selected)
            throw Error(
              event.data.type === "quote" ? "\u8F6C\u5165\u6587\u5B57\u4E3A\u7A7A\u6216\u8D85\u8FC7\u5355\u6B21\u5F15\u7528\u957F\u5EA6\u4E0A\u9650\uFF0C\u8BF7\u68C0\u67E5\u539F\u6587\u540E\u91CD\u8BD5\u3002" : "\u672A\u8BFB\u5230\u9009\u4E2D\u5185\u5BB9\uFF0C\u8BF7\u91CD\u65B0\u9009\u62E9\u3002"
            );
          if (options.mode === "quote") {
            const quote = "\u5F15\u7528\uFF1A" + page + " \xB7 " + selected.label + "\n" + selected.text.split("\n").map((line) => "> " + line).join("\n") + "\n";
            const captured2 = options.inputActions.captureInsertion();
            const span = event.data.type === "quote" ? { ...captured2, end: captured2.start } : captured2;
            if (!active || controller.signal.aborted || !paired())
              throw Error("\u5DF2\u5207\u6362\u5BF9\u8BDD\uFF0C\u8BF7\u5728\u5F53\u524D\u9875\u9762\u91CD\u65B0\u5F15\u7528\u3002");
            if (!options.inputActions.insertText(quote, span))
              throw Error("\u8349\u7A3F\u5DF2\u53D8\u5316\u6216\u6B63\u5728\u53D1\u9001\uFF0C\u8BF7\u91CD\u65B0\u9009\u62E9\u5185\u5BB9\u3002");
            options.inputActions.persistDraft();
            send({ type: "result", requestId, ok: true });
            return;
          }
          const value = {
            ...selected,
            page,
            sessionId,
            surface: options.surface,
            tool: options.tool
          };
          const response = await fetch("/api/page-interaction/reference", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ ...value, generation, owner: options.owner }),
            signal: controller.signal
          });
          const receipt = await response.json();
          if (!active || controller.signal.aborted) return;
          if (!response.ok) throw Error(receipt.error || "\u5F15\u7528\u672A\u4FDD\u5B58\uFF0C\u8BF7\u91CD\u8BD5\u3002");
          const bindingResponse = await fetch("/api/page-interaction/binding", {
            cache: "no-store",
            signal: controller.signal
          });
          const currentBinding = await bindingResponse.json();
          if (!active || controller.signal.aborted) return;
          if (!bindingResponse.ok || currentBinding.generation !== generation)
            throw Error("\u767B\u5F55\u8EAB\u4EFD\u5DF2\u53D8\u5316\uFF0C\u8BF7\u91CD\u65B0\u9009\u62E9\u5F15\u7528\u3002");
          const access = await fetch("/api/agent-workbench/page", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ operation: "access", owner: business.owner }),
            signal: controller.signal
          });
          if (!active || controller.signal.aborted) return;
          if (!access.ok || invalidated) throw Error("\u767B\u5F55\u8EAB\u4EFD\u5DF2\u53D8\u5316\uFF0C\u8BF7\u91CD\u65B0\u9009\u62E9\u5F15\u7528\u3002");
          if (!ready || !paired()) throw Error("\u5DF2\u5207\u6362\u5BF9\u8BDD\uFF0C\u8BF7\u5728\u5F53\u524D\u9875\u9762\u91CD\u65B0\u5F15\u7528\u3002");
          const composer = input();
          const captured = options.inputActions.captureInsertion();
          const inserted = composer.insertReference(
            {
              source: REFERENCE_SOURCE,
              ref: JSON.stringify(receipt),
              label: receipt.label,
              appearance: "session",
              clipboardText: serializeReference(receipt)
            },
            {
              ...captured,
              start: captured.end
            }
          );
          if (!inserted) throw Error("\u8349\u7A3F\u5DF2\u53D8\u5316\u6216\u6B63\u5728\u53D1\u9001\uFF0C\u8BF7\u91CD\u65B0\u9009\u62E9\u5185\u5BB9\u3002");
          ownedReferences.add(JSON.stringify(receipt));
          if (!observedInput) {
            observedInput = composer;
            unobserveInput = composer.state.subscribe(() => {
              if (!invalidated || cleanupScheduled) return;
              cleanupScheduled = true;
              queueMicrotask(() => {
                cleanupScheduled = false;
                removeOwnedReferences();
              });
            });
          }
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
      if (business)
        void fetch("/api/page-interaction/binding", {
          cache: "no-store",
          signal: bindingRequest.signal
        }).then(async (response) => {
          const value = await response.json();
          if (!response.ok || typeof value.generation !== "string")
            throw Error("\u9875\u9762\u5F15\u7528\u8FDE\u63A5\u4E0D\u53EF\u7528\uFF0C\u8BF7\u91CD\u65B0\u6253\u5F00\u9875\u9762\u3002");
          if (!active) return;
          generation = value.generation;
          configure();
        }).catch((error) => {
          if (!active) return;
          if (ready && retained()) input().notify("error", String(error.message));
        });
      else configure();
      const release = () => {
        if (!active) return;
        active = false;
        releases.delete(release);
        bindingRequest.abort();
        removeOwnedReferences();
        unobserveInput();
        observedInput = void 0;
        window.removeEventListener("gea-business-identity-changed", identityChanged);
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
    for (const release of releases) release();
    for (const button of triggers) button.remove();
    triggers.clear();
  });
  ctx.inject(["slots"], (scope) => {
    if (!scope.slots?.inject) return;
    scope.effect(
      () => scope.slots.inject(
        "conversation.input.left",
        () => scope.slots.register(
          { name: "conversation.input.left", id: "page-selection", order: 50 },
          function SelectionControl({ sessionId }) {
            const anchor = useRef(null);
            useEffect(
              () => anchor.current ? api.mountTrigger(anchor.current, sessionId) : void 0,
              [sessionId]
            );
            return React.createElement("span", {
              ref: anchor,
              className: "dspi-composer-trigger"
            });
          }
        )
      )
    );
    scope.effect(() => {
      const style = document.createElement("style");
      style.textContent = ".dspi-composer-trigger{display:inline-flex;align-items:center}.dspi-composer-trigger button{display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;padding:0;border:0;border-radius:50%;background:transparent;color:var(--dsw-alias-label-secondary,#606977);cursor:pointer}.dspi-composer-trigger button:hover{background:var(--dsw-alias-interactive-bg-hover,#f2f3f5)}.dspi-composer-trigger button[aria-pressed=true]{background:#fff1f1;color:#df1d28}.dspi-composer-trigger button:disabled{opacity:.4;cursor:default}.dspi-composer-trigger button:focus-visible{outline:2px solid #d0132c;outline-offset:2px}.dspi-composer-trigger svg{width:16px;height:16px}";
      document.head.append(style);
      return () => style.remove();
    });
  });
  return api;
}
var inject = ["conversation", "inputTriggers"];
var apply = installPageInteraction;
export {
  apply,
  inject,
  installPageInteraction
};
