window.__ModuleLoader__.load({id:"@cleverc2200/dsh-agent-workbench",factory:(require)=>{var module={exports:{}};var exports=module.exports;const WORKBENCH_MODULE_STYLES="/* ../../official-latest-standard/packages/client/ui-chat/src/client/chat/MessageItem.module.css */\n.MessageItem_userRow {\n  display: flex;\n  flex-direction: column;\n  align-items: flex-end;\n  gap: 6px;\n}\n.MessageItem_userStack {\n  display: flex;\n  flex-direction: column;\n  align-items: flex-end;\n  gap: 8px;\n  min-width: 0;\n  max-width: min(calc(var(--dsh-chat-content-width, 748px) * 0.702), 82%);\n}\n.MessageItem_bubble {\n  max-width: 100%;\n  background: var(--dsw-specific-bubble);\n  border-radius: var(--dsw-radius-xl);\n  padding: 10px 16px;\n  font-size: var(--dsh-content-font-size, 14px);\n  line-height: calc(22px + var(--dsh-content-font-delta, 0px));\n  color: var(--dsw-alias-label-primary);\n  white-space: pre-wrap;\n  word-break: break-word;\n}\n.MessageItem_referenceSummary {\n  color: var(--dsw-alias-label-tertiary);\n  font-size: var(--dsh-content-font-size-secondary, 13px);\n  line-height: calc(18px + var(--dsh-content-font-delta-secondary, 0px));\n}\n.MessageItem_contextRow {\n  padding: 2px 0;\n}\n.MessageItem_compactionRow {\n  --dsh-compaction-header-height: calc(24px + var(--dsh-content-font-delta, 0px));\n  padding: 2px 0;\n}\n.MessageItem_compactionButton {\n  display: flex;\n  align-items: center;\n  width: 100%;\n  height: var(--dsh-compaction-header-height);\n  min-width: 0;\n  padding: 0;\n  border: none;\n  border-radius: var(--dsw-radius-sm);\n  background: none;\n  color: var(--dsw-alias-label-tertiary);\n  transition: color 100ms ease;\n  font: inherit;\n  text-align: left;\n}\n.MessageItem_compactionRow:has(.MessageItem_compactionBody) .MessageItem_compactionButton {\n  position: sticky;\n  top: 0;\n  z-index: 7;\n  border-radius: 0;\n  background: var(--dsw-alias-bg-base);\n}\n.MessageItem_compactionBody :has(> [data-code-block-banner]) {\n  top: var(--dsh-compaction-header-height);\n}\n.MessageItem_compactionRow:has(.MessageItem_compactionBody) .MessageItem_compactionButton:hover {\n  background: var(--dsw-alias-interactive-bg-hover-solid);\n}\n.MessageItem_compactionButton:not(:disabled) {\n  cursor: pointer;\n}\n.MessageItem_compactionButton:hover {\n  color: var(--dsw-alias-label-secondary);\n}\n.MessageItem_compactionButton:not(:disabled):hover {\n  background: var(--dsw-alias-interactive-bg-hover);\n}\n.MessageItem_compactionLeading {\n  flex: none;\n  display: inline-grid;\n  place-items: center;\n  width: calc(16px + var(--dsh-content-font-delta, 0px));\n  height: calc(16px + var(--dsh-content-font-delta, 0px));\n  margin-right: 6px;\n  color: inherit;\n}\n.MessageItem_compactionLeading svg {\n  width: calc(14px + var(--dsh-content-font-delta, 0px));\n  height: calc(14px + var(--dsh-content-font-delta, 0px));\n}\n.MessageItem_compactionContextIcon,\n.MessageItem_compactionDisclosureIcon {\n  display: inline-flex;\n  grid-area: 1 / 1;\n  align-items: center;\n  justify-content: center;\n}\n.MessageItem_compactionDisclosureIcon {\n  opacity: 0;\n}\n.MessageItem_compactionButton:not(:disabled):hover .MessageItem_compactionContextIcon,\n.MessageItem_compactionButton:not(:disabled):focus-visible .MessageItem_compactionContextIcon {\n  opacity: 0;\n}\n.MessageItem_compactionButton:not(:disabled):hover .MessageItem_compactionDisclosureIcon,\n.MessageItem_compactionButton:not(:disabled):focus-visible .MessageItem_compactionDisclosureIcon {\n  opacity: 1;\n}\n.MessageItem_compactionTitle {\n  flex: none;\n  font-size: var(--dsh-content-font-size-secondary, 13px);\n  line-height: calc(24px + var(--dsh-content-font-delta, 0px));\n  color: inherit;\n}\n.MessageItem_compactionSep {\n  flex: none;\n  width: 2px;\n  height: 2px;\n  margin: 0 8px;\n  border-radius: 1px;\n  background: var(--dsw-alias-label-caption);\n}\n.MessageItem_compactionSummary {\n  flex: 1 1 auto;\n  min-width: 0;\n  overflow: hidden;\n  color: inherit;\n  font-size: var(--dsh-content-font-size-secondary, 13px);\n  line-height: calc(24px + var(--dsh-content-font-delta, 0px));\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n.MessageItem_compactionBody {\n  padding: 4px 0 4px calc(22px + var(--dsh-content-font-delta, 0px));\n  color: var(--dsw-alias-label-tertiary);\n  font-size: var(--dsh-content-font-size-secondary, 13px);\n  line-height: calc(24px + var(--dsh-content-font-delta, 0px));\n}\n.MessageItem_retryRow {\n  color: var(--dsw-alias-label-tertiary);\n  font-size: var(--dsh-content-font-size-secondary, 13px);\n  line-height: calc(20px + var(--dsh-content-font-delta-secondary, 0px));\n}\n.MessageItem_retrySummary {\n  display: inline-flex;\n  align-items: center;\n  width: fit-content;\n  max-width: 100%;\n  padding: 2px 0;\n  gap: 7px;\n  border-radius: var(--dsw-radius-sm);\n  color: inherit;\n  cursor: pointer;\n  list-style: none;\n  user-select: none;\n}\n.MessageItem_retrySummary::-webkit-details-marker {\n  display: none;\n}\n.MessageItem_retrySummary::after {\n  flex: none;\n  width: 6px;\n  height: 6px;\n  margin-right: 2px;\n  border-right: 1.5px solid currentcolor;\n  border-bottom: 1.5px solid currentcolor;\n  content: \"\";\n  transform: rotate(-45deg);\n  transition: transform 120ms ease;\n}\n.MessageItem_retrySummary:hover {\n  color: var(--dsw-alias-label-secondary);\n}\n@media (prefers-reduced-motion: reduce) {\n  .MessageItem_compactionButton {\n    transition: none;\n  }\n}\n.MessageItem_retrySummary:focus-visible {\n  outline: 1.5px solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));\n  outline-offset: 2px;\n}\n.MessageItem_retryText {\n  min-width: 0;\n  overflow-wrap: anywhere;\n}\n.MessageItem_retryRow[open] .MessageItem_retrySummary::after {\n  transform: rotate(45deg);\n}\n.MessageItem_retryDetails {\n  display: grid;\n  gap: 2px;\n  margin-top: 3px;\n  padding-left: 14px;\n  overflow-wrap: anywhere;\n  font-size: var(--dsh-content-font-size-secondary, 13px);\n  line-height: calc(18px + var(--dsh-content-font-delta-secondary, 0px));\n}\n.MessageItem_retryDetailLabel {\n  color: var(--dsw-alias-label-secondary);\n}\n.MessageItem_turnErrorRow {\n  display: grid;\n  grid-template-columns: 10px minmax(0, 1fr) auto;\n  gap: 8px;\n  align-items: start;\n  padding: 2px 0;\n  font-size: var(--dsh-content-font-size-secondary, 13px);\n  line-height: calc(20px + var(--dsh-content-font-delta-secondary, 0px));\n}\n.MessageItem_turnErrorDot {\n  margin-top: 5px;\n}\n.MessageItem_turnErrorCopy {\n  min-width: 0;\n  overflow-wrap: anywhere;\n}\n.MessageItem_turnErrorTitle {\n  margin-right: 6px;\n  color: var(--dsw-alias-state-error-primary);\n  font-weight: 600;\n}\n.MessageItem_turnErrorMessage {\n  color: var(--dsw-alias-label-secondary);\n}\n.MessageItem_turnErrorCode {\n  color: var(--dsw-alias-label-tertiary);\n  font: var(--dsw-font-markdown-code-block-small);\n}\n.MessageItem_maxTokensTitle {\n  margin-right: 6px;\n  color: var(--dsw-alias-state-warn-primary);\n  font-weight: 600;\n}\n.MessageItem_attachmentRow {\n  display: flex;\n  flex-wrap: wrap;\n  justify-content: flex-end;\n  max-width: 100%;\n  gap: 8px;\n}\n.MessageItem_fileCard {\n  display: inline-flex;\n  flex: 0 0 240px;\n  align-items: center;\n  gap: 10px;\n  width: 240px;\n  min-height: 64px;\n  padding: 8px 12px;\n  border: 0.5px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.12));\n  border-radius: var(--dsw-radius-xl);\n  background: var(--dsw-specific-input-major, transparent);\n  box-sizing: border-box;\n}\n.MessageItem_fileIcon {\n  flex: none;\n  width: 28px;\n  height: 28px;\n}\n.MessageItem_fileContent {\n  display: flex;\n  flex: 1;\n  flex-direction: column;\n  min-width: 0;\n}\n.MessageItem_fileName {\n  overflow: hidden;\n  white-space: nowrap;\n  text-overflow: ellipsis;\n  color: var(--dsw-alias-label-primary);\n  font-size: 14px;\n  font-weight: 500;\n  line-height: 22px;\n}\n.MessageItem_fileMeta {\n  overflow: hidden;\n  white-space: nowrap;\n  text-overflow: ellipsis;\n  color: var(--dsw-alias-label-tertiary, rgba(0, 0, 0, 0.45));\n  font-size: 12px;\n  line-height: 15px;\n}\n\n/* ../../official-latest-standard/packages/client/ui-chat/src/client/chat/ContextBody.module.css */\n.ContextBody_text {\n  margin: 0;\n  color: var(--dsw-alias-label-secondary);\n  font: inherit;\n  white-space: pre-wrap;\n  overflow-wrap: anywhere;\n}\n.ContextBody_fields {\n  display: flex;\n  flex-direction: column;\n  gap: 2px;\n  margin: 8px 0 0;\n  padding-top: 8px;\n  border-top: 0.5px solid var(--dsw-alias-border-l2);\n}\n.ContextBody_field {\n  display: flex;\n  gap: 8px;\n  min-width: 0;\n}\n.ContextBody_fieldKey {\n  flex: none;\n  min-width: 96px;\n  color: var(--dsw-alias-label-caption);\n}\n.ContextBody_fieldValue {\n  flex: 1 1 auto;\n  min-width: 0;\n  margin: 0;\n  color: var(--dsw-alias-label-tertiary);\n  overflow-wrap: anywhere;\n}\n.ContextBody_files {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 4px 12px;\n  margin: 0 0 8px;\n  padding: 0;\n  list-style: none;\n}\n.ContextBody_file {\n  display: flex;\n  align-items: baseline;\n  gap: 6px;\n  min-width: 0;\n}\n.ContextBody_filePath {\n  color: var(--dsw-alias-label-secondary);\n  overflow-wrap: anywhere;\n}\n.ContextBody_fileAction {\n  color: var(--dsw-alias-label-caption);\n}\n.ContextBody_catalogNotice {\n  margin: 0 0 6px;\n  color: var(--dsw-alias-label-caption);\n}\n.ContextBody_entries {\n  display: flex;\n  flex-direction: column;\n  gap: 4px;\n  margin: 0;\n  padding: 0;\n  list-style: none;\n}\n.ContextBody_entry {\n  display: flex;\n  gap: 8px;\n  min-width: 0;\n}\n.ContextBody_entryName {\n  flex: none;\n  color: var(--dsw-alias-label-secondary);\n}\n.ContextBody_entryDescription {\n  flex: 1 1 auto;\n  min-width: 0;\n  overflow: hidden;\n  color: var(--dsw-alias-label-tertiary);\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n.ContextBody_sections {\n  display: flex;\n  flex-direction: column;\n  gap: 8px;\n  margin: 0;\n}\n.ContextBody_section {\n  display: flex;\n  flex-direction: column;\n  gap: 2px;\n  min-width: 0;\n}\n.ContextBody_sectionName {\n  color: var(--dsw-alias-label-caption);\n}\n.ContextBody_sectionText {\n  margin: 0;\n  color: var(--dsw-alias-label-secondary);\n  white-space: pre-wrap;\n  overflow-wrap: anywhere;\n}\n.ContextBody_relaySender {\n  margin: 0 0 6px;\n  color: var(--dsw-alias-label-caption);\n  overflow-wrap: anywhere;\n}\n.ContextBody_recalls {\n  display: flex;\n  flex-direction: column;\n  gap: 2px;\n  margin: 0 0 8px;\n  padding: 0;\n  list-style: none;\n}\n.ContextBody_recall {\n  display: flex;\n  gap: 8px;\n  min-width: 0;\n}\n.ContextBody_recallLabel {\n  color: var(--dsw-alias-label-secondary);\n  overflow-wrap: anywhere;\n}\n.ContextBody_recallCounts {\n  flex: none;\n  color: var(--dsw-alias-label-caption);\n}\n\n/* ../../official-latest-standard/packages/client/ui-chat/src/client/chat/ContextInjectionRow.module.css */\n.ContextInjectionRow_root {\n  min-width: 0;\n}\n.ContextInjectionRow_root[data-open] {\n  padding-bottom: 4px;\n}\n.ContextInjectionRow_chevron {\n  color: var(--dsw-alias-label-secondary);\n}\n.ContextInjectionRow_sep {\n  flex: none;\n  width: 2px;\n  height: 2px;\n  margin: 0 8px;\n  border-radius: 1px;\n  background: var(--dsw-alias-label-caption);\n}\n.ContextInjectionRow_source {\n  flex: none;\n  min-width: 0;\n  overflow: hidden;\n  color: var(--dsw-alias-label-tertiary);\n  font-size: var(--dsh-content-font-size-secondary, 13px);\n  line-height: calc(24px + var(--dsh-content-font-delta, 0px));\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n.ContextInjectionRow_summary {\n  flex: 1 1 auto;\n  min-width: 0;\n  overflow: hidden;\n  color: var(--dsw-alias-label-tertiary);\n  font-size: var(--dsh-content-font-size-secondary, 13px);\n  line-height: calc(24px + var(--dsh-content-font-delta, 0px));\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n.ContextInjectionRow_body {\n  box-sizing: border-box;\n  width: calc(100% - 22px - var(--dsh-content-font-delta, 0px));\n  max-height: 141px;\n  margin: 4px 0 0 calc(22px + var(--dsh-content-font-delta, 0px));\n  overflow: auto;\n  padding: 10px 16px 12px 12px;\n  border: none;\n  border-radius: var(--dsw-radius-md);\n  background: var(--dsw-alias-markdown-code-block);\n  color: var(--dsw-alias-label-tertiary);\n  font: 400 11px/16px var(--ds-font-family-code);\n}\n.ContextInjectionRow_toolChanges {\n  white-space: nowrap;\n}\n\n/* ../../official-latest-standard/packages/client/ui-chat/src/client/chat/MessageIconActions.module.css */\n.MessageIconActions_actions {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  height: calc(28px + var(--dsh-content-font-delta, 0px));\n}\n.MessageIconActions_timeStart {\n  padding-right: 12px;\n  font-size: var(--dsh-content-font-size-secondary, 13px);\n  line-height: calc(24px + var(--dsh-content-font-delta, 0px));\n  color: var(--dsw-alias-label-tertiary);\n  white-space: nowrap;\n}\n.MessageIconActions_timeEnd {\n  font-size: calc(var(--dsh-content-font-size-secondary, 13px) - 1px);\n  line-height: calc(24px + var(--dsh-content-font-delta, 0px));\n  color: inherit;\n  white-space: nowrap;\n}\n.MessageIconActions_endInfo {\n  display: inline-flex;\n  align-items: center;\n  gap: 8px;\n  min-width: 0;\n  margin-left: 8px;\n  color: var(--dsw-alias-label-tertiary);\n}\n@media (hover: hover) {\n  [data-actions-reveal=hover] .MessageIconActions_actions,\n  :is([data-chat-flow-kind=user], [data-chat-flow-kind=steering]):has(~ :is([data-chat-flow-kind=user], [data-chat-flow-kind=steering])) .MessageIconActions_actions {\n    opacity: 0;\n    transition: opacity 80ms ease;\n  }\n  [data-actions-reveal=hover]:hover .MessageIconActions_actions,\n  [data-actions-reveal=hover]:focus-within .MessageIconActions_actions,\n  :is([data-chat-flow-kind=user], [data-chat-flow-kind=steering]):has(~ :is([data-chat-flow-kind=user], [data-chat-flow-kind=steering])):hover .MessageIconActions_actions,\n  :is([data-chat-flow-kind=user], [data-chat-flow-kind=steering]):has(~ :is([data-chat-flow-kind=user], [data-chat-flow-kind=steering])):focus-within .MessageIconActions_actions {\n    opacity: 1;\n  }\n}\n.MessageIconActions_action {\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  width: calc(28px + var(--dsh-content-font-delta, 0px));\n  height: calc(28px + var(--dsh-content-font-delta, 0px));\n  padding: 6px;\n  border: none;\n  border-radius: var(--dsw-radius-sm);\n  background: transparent;\n  color: var(--dsw-alias-label-tertiary);\n  cursor: pointer;\n}\n.MessageIconActions_action svg {\n  width: calc(15px + var(--dsh-content-font-delta, 0px));\n  height: calc(15px + var(--dsh-content-font-delta, 0px));\n}\n.MessageIconActions_actions[data-clock=end] .MessageIconActions_action svg {\n  width: calc(17px + var(--dsh-content-font-delta, 0px));\n  height: calc(17px + var(--dsh-content-font-delta, 0px));\n}\n.MessageIconActions_action:hover {\n  background: var(--dsw-alias-interactive-bg-hover);\n  color: var(--dsw-alias-label-secondary);\n}\n.MessageIconActions_action[data-unavailable] {\n  cursor: default;\n  opacity: 0.4;\n}\n.MessageIconActions_action[data-unavailable]:hover {\n  background: transparent;\n  color: var(--dsw-alias-label-tertiary);\n}\n.MessageIconActions_visuallyHidden {\n  position: absolute;\n  width: 1px;\n  height: 1px;\n  overflow: hidden;\n  clip: rect(0 0 0 0);\n  white-space: nowrap;\n}\n";"use strict";
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

// src/page-interaction/reference-message.tsx
var import_react6 = require("react");

// ../../official-latest-standard/packages/client/ui-chat/src/client/chat/MessageItem.tsx
var import_react5 = require("react");
var import_dsh_client_ui_primitives5 = require("@deepseek-ai/dsh-client-ui-primitives");

// ../../official-latest-standard/packages/client/ui-chat/src/client/chat/CompactionItem.tsx
var import_react = require("react");
var import_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");

// ../../official-latest-standard/packages/client/ui-chat/src/client/markdown-labels.ts
function markdownLabels(t) {
  return {
    code: { copyLabel: t("copy"), copiedLabel: t("copied"), toolbarLabels: { codeLabel: t("codeBlock.title"), wrapLabel: t("codeBlock.wrap"), unwrapLabel: t("codeBlock.unwrap") } },
    footnotes: t("markdown.footnotes")
  };
}

// ../../official-latest-standard/packages/client/ui-chat/src/client/chat/MessageItem.module.css
var MessageItem_default = {
  userRow: "MessageItem_userRow",
  userStack: "MessageItem_userStack",
  bubble: "MessageItem_bubble",
  referenceSummary: "MessageItem_referenceSummary",
  contextRow: "MessageItem_contextRow",
  compactionRow: "MessageItem_compactionRow",
  compactionButton: "MessageItem_compactionButton",
  compactionBody: "MessageItem_compactionBody",
  compactionLeading: "MessageItem_compactionLeading",
  compactionContextIcon: "MessageItem_compactionContextIcon",
  compactionDisclosureIcon: "MessageItem_compactionDisclosureIcon",
  compactionTitle: "MessageItem_compactionTitle",
  compactionSep: "MessageItem_compactionSep",
  compactionSummary: "MessageItem_compactionSummary",
  retryRow: "MessageItem_retryRow",
  retrySummary: "MessageItem_retrySummary",
  retryText: "MessageItem_retryText",
  retryDetails: "MessageItem_retryDetails",
  retryDetailLabel: "MessageItem_retryDetailLabel",
  turnErrorRow: "MessageItem_turnErrorRow",
  turnErrorDot: "MessageItem_turnErrorDot",
  turnErrorCopy: "MessageItem_turnErrorCopy",
  turnErrorTitle: "MessageItem_turnErrorTitle",
  turnErrorMessage: "MessageItem_turnErrorMessage",
  turnErrorCode: "MessageItem_turnErrorCode",
  maxTokensTitle: "MessageItem_maxTokensTitle",
  attachmentRow: "MessageItem_attachmentRow",
  fileCard: "MessageItem_fileCard",
  fileIcon: "MessageItem_fileIcon",
  fileContent: "MessageItem_fileContent",
  fileName: "MessageItem_fileName",
  fileMeta: "MessageItem_fileMeta"
};

// ../../official-latest-standard/packages/client/ui-chat/src/client/chat/CompactionItem.tsx
var import_jsx_runtime = require("react/jsx-runtime");
var CompactionItem = (0, import_react.memo)(function CompactionItem2({
  node,
  title,
  fallbackSummary,
  t
}) {
  const [expanded, setExpanded] = (0, import_react.useState)(false);
  const labels = (0, import_react.useMemo)(() => markdownLabels(t), [t]);
  const expandable = node.summary !== null;
  const open = expandable && expanded;
  const summary = node.shadowedItemCount !== null && node.shadowedTokenCount !== null ? t("message.compaction.completed", {
    items: node.shadowedItemCount,
    tokens: node.shadowedTokenCount
  }) : fallbackSummary ?? (expandable ? t("message.compaction.expand") : t("message.compaction.unavailable"));
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: MessageItem_default.compactionRow, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
      "button",
      {
        type: "button",
        className: MessageItem_default.compactionButton,
        disabled: !expandable,
        "aria-expanded": expandable ? open : void 0,
        onClick: () => {
          setExpanded((value) => !value);
        },
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: MessageItem_default.compactionLeading, "aria-hidden": true, children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: MessageItem_default.compactionContextIcon, "data-compaction-icon": "context", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconApiOutlineRegular, {}) }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "span",
              {
                className: MessageItem_default.compactionDisclosureIcon,
                "data-compaction-disclosure": open ? "expanded" : "collapsed",
                children: open ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconChevronDownOutlineRegular, {}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconChevronRightOutlineRegular, {})
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: MessageItem_default.compactionTitle, children: title ?? t("message.compaction") }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: MessageItem_default.compactionSep, "aria-hidden": true }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: MessageItem_default.compactionSummary, children: summary })
        ]
      }
    ),
    open && node.summary !== null && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: MessageItem_default.compactionBody, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.MarkdownText, { text: node.summary, labels }) })
  ] });
});

// ../../official-latest-standard/packages/client/ui-chat/src/client/chat/ContextInjectionRow.tsx
var import_react2 = require("react");
var import_dsh_client_ui_primitives3 = require("@deepseek-ai/dsh-client-ui-primitives");

// ../../official-latest-standard/packages/client/ui-chat/src/client/chat/ContextBody.tsx
var import_dsh_client_ui_primitives2 = require("@deepseek-ai/dsh-client-ui-primitives");

// ../../official-latest-standard/packages/client/ui-chat/src/client/chat/ContextBody.module.css
var ContextBody_default = {
  text: "ContextBody_text",
  fields: "ContextBody_fields",
  field: "ContextBody_field",
  fieldKey: "ContextBody_fieldKey",
  fieldValue: "ContextBody_fieldValue",
  files: "ContextBody_files",
  file: "ContextBody_file",
  filePath: "ContextBody_filePath",
  fileAction: "ContextBody_fileAction",
  catalogNotice: "ContextBody_catalogNotice",
  entries: "ContextBody_entries",
  entry: "ContextBody_entry",
  entryName: "ContextBody_entryName",
  entryDescription: "ContextBody_entryDescription",
  sections: "ContextBody_sections",
  section: "ContextBody_section",
  sectionName: "ContextBody_sectionName",
  sectionText: "ContextBody_sectionText",
  relaySender: "ContextBody_relaySender",
  recalls: "ContextBody_recalls",
  recall: "ContextBody_recall",
  recallLabel: "ContextBody_recallLabel",
  recallCounts: "ContextBody_recallCounts"
};

// ../../official-latest-standard/packages/client/ui-chat/src/client/chat/ContextBody.tsx
var import_jsx_runtime2 = require("react/jsx-runtime");
var MAX_CHARS = 2e4;
var MAX_ENTRIES = 200;
function asRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : null;
}
function contentRuns(content) {
  const runs = [];
  for (const block of content) {
    if (block.type !== "text") {
      runs.push({ block });
      continue;
    }
    const last = runs[runs.length - 1];
    if (last !== void 0 && "text" in last) last.text += block.text;
    else runs.push({ text: block.text });
  }
  return runs;
}
function unknownBlocks(content) {
  return contentRuns(content).flatMap((run) => "block" in run ? [run.block] : []);
}
function boundedText(text3, t) {
  return text3.length > MAX_CHARS ? `${text3.slice(0, MAX_CHARS)}
${t("json.truncated", { total: text3.length })}` : text3;
}
function fieldValue(value, t) {
  const text3 = typeof value === "string" ? value : typeof value === "number" || typeof value === "boolean" ? String(value) : JSON.stringify(value);
  return boundedText(text3, t);
}
function SourceFields({ source, formRendered, t }) {
  const record2 = asRecord(source);
  if (record2 === null) return null;
  const hidden = formRendered ? ["kind", "form"] : ["kind"];
  const rows = Object.entries(record2).filter(([key]) => !hidden.includes(key));
  if (rows.length === 0) return null;
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("dl", { className: ContextBody_default.fields, "data-context-fields": true, children: rows.map(([key, value]) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: ContextBody_default.field, children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("dt", { className: ContextBody_default.fieldKey, children: key }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("dd", { className: ContextBody_default.fieldValue, children: fieldValue(value, t) })
  ] }, key)) });
}
function UnknownBlocks({ blocks, t }) {
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_jsx_runtime2.Fragment, { children: blocks.map((block, index) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
    import_dsh_client_ui_primitives2.JsonBlock,
    {
      label: t("message.unknownBlock"),
      payload: block,
      truncatedLabel: (total) => t("json.truncated", { total })
    },
    index
  )) });
}
function ModelFacingContent({ content, t }) {
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_jsx_runtime2.Fragment, { children: contentRuns(content).map((run, index) => "text" in run ? run.text !== "" && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("pre", { className: ContextBody_default.text, "data-context-text": true, children: boundedText(run.text, t) }, index) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
    import_dsh_client_ui_primitives2.JsonBlock,
    {
      label: t("message.unknownBlock"),
      payload: run.block,
      truncatedLabel: (total) => t("json.truncated", { total })
    },
    index
  )) });
}
function OpaqueBody({ content, source, t }) {
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(ModelFacingContent, { content, t }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(SourceFields, { source, formRendered: false, t })
  ] });
}
function instructionChanges(source) {
  const record2 = asRecord(source);
  const list = record2 === null ? void 0 : record2["changes"];
  if (!Array.isArray(list)) return null;
  const changes = [];
  const seen = /* @__PURE__ */ new Set();
  for (const entry of list) {
    const change = asRecord(entry);
    if (change === null) return null;
    const path = change["path"];
    if (typeof path !== "string" || path === "") return null;
    const action = change["action"];
    if (action !== "set" && action !== "replace" && action !== "remove") return null;
    const digest = change["digest"];
    if (seen.has(path)) continue;
    seen.add(path);
    changes.push({ action, path, ...typeof digest === "string" ? { digest } : {} });
  }
  return changes.length === 0 ? null : changes;
}
function instructionAction(action, baseline) {
  if (action === "remove") return "message.context.instructions.removed";
  if (baseline) return "message.context.instructions.loaded";
  return action === "set" ? "message.context.instructions.added" : "message.context.instructions.updated";
}
function InstructionsBody({ content, source, t }) {
  const changes = instructionChanges(source);
  if (changes === null) return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(OpaqueBody, { content, source, t });
  const baseline = asRecord(source)?.["baseline"] === true;
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("ul", { className: ContextBody_default.files, "data-context-files": true, children: changes.map((change) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("li", { className: ContextBody_default.file, title: change.digest, children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: ContextBody_default.filePath, children: change.path }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: ContextBody_default.fileAction, children: t(instructionAction(change.action, baseline)) })
    ] }, change.path)) }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(ModelFacingContent, { content, t })
  ] });
}
function catalogEntries(source) {
  const record2 = asRecord(source);
  const list = record2 === null ? void 0 : record2["entries"];
  if (!Array.isArray(list)) return null;
  const entries2 = [];
  for (const item of list) {
    const entry = asRecord(item);
    if (entry === null) return null;
    const name = entry["name"];
    const description = entry["description"];
    if (typeof name !== "string" || name === "" || typeof description !== "string") return null;
    entries2.push({ name, description });
  }
  return entries2;
}
function CatalogBody({ content, source, t }) {
  const entries2 = catalogEntries(source);
  if (entries2 === null) return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(OpaqueBody, { content, source, t });
  const update = asRecord(source)?.["update"] === true;
  const shown = entries2.slice(0, MAX_ENTRIES);
  const rest = unknownBlocks(content);
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
    update && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: ContextBody_default.catalogNotice, "data-context-catalog-update": true, children: t("message.context.catalog.replaced") }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("ul", { className: ContextBody_default.entries, "data-context-entries": true, children: shown.map((entry, index) => (
      // Index key: a hand-edited or foreign log may repeat a name, and a
      // duplicate React key would drop a row the model did see.
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("li", { className: ContextBody_default.entry, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("code", { className: ContextBody_default.entryName, children: entry.name }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: ContextBody_default.entryDescription, children: entry.description })
      ] }, index)
    )) }),
    shown.length < entries2.length && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: ContextBody_default.catalogNotice, "data-context-entries-truncated": true, children: t("message.context.catalog.more", { count: entries2.length - shown.length }) }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(UnknownBlocks, { blocks: rest, t })
  ] });
}
function snapshotSections(source) {
  const record2 = asRecord(source);
  const list = record2 === null ? void 0 : record2["sections"];
  if (!Array.isArray(list)) return null;
  const sections = [];
  for (const item of list) {
    const section = asRecord(item);
    if (section === null) return null;
    const name = section["name"];
    const text3 = section["text"];
    if (typeof name !== "string" || name === "" || typeof text3 !== "string") return null;
    sections.push({ name, text: text3 });
  }
  return sections.length === 0 ? null : sections;
}
function SnapshotBody({ content, source, t }) {
  const sections = snapshotSections(source);
  if (sections === null) return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(OpaqueBody, { content, source, t });
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: ContextBody_default.catalogNotice, "data-context-snapshot-supersedes": true, children: t("message.context.snapshot.supersedes") }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("dl", { className: ContextBody_default.sections, "data-context-sections": true, children: sections.map((section, index) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: ContextBody_default.section, children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("dt", { className: ContextBody_default.sectionName, children: section.name }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("dd", { className: ContextBody_default.sectionText, children: boundedText(section.text, t) })
    ] }, index)) })
  ] });
}
function NoticeBody({ content, t }) {
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(ModelFacingContent, { content, t });
}
function RelayBody({ content, source, t }) {
  const sender = relaySender(source);
  if (sender === null) return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(OpaqueBody, { content, source, t });
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: ContextBody_default.relaySender, "data-context-relay-sender": true, children: t("message.context.relay.from", { session: sender }) }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(ModelFacingContent, { content, t })
  ] });
}
function relaySender(source) {
  const sender = asRecord(source)?.["senderSessionId"];
  return typeof sender === "string" && sender !== "" ? sender : null;
}
function recalledSessions(source) {
  const record2 = asRecord(source);
  const list = record2 === null ? void 0 : record2["references"];
  if (!Array.isArray(list)) return null;
  const sessions = [];
  for (const item of list) {
    const reference = asRecord(item);
    if (reference === null) return null;
    const label = reference["label"];
    const retained = reference["retainedMessages"];
    const omitted = reference["omittedMessages"];
    const truncated = reference["truncated"];
    if (typeof label !== "string" || label === "" || typeof retained !== "number" || typeof omitted !== "number" || typeof truncated !== "boolean") return null;
    sessions.push({ label, retained, omitted, truncated });
  }
  return sessions.length === 0 ? null : sessions;
}
function RecallBody({ content, source, t }) {
  const sessions = recalledSessions(source);
  if (sessions === null) return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(OpaqueBody, { content, source, t });
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("ul", { className: ContextBody_default.recalls, "data-context-recalls": true, children: sessions.map((session, index) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("li", { className: ContextBody_default.recall, children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: ContextBody_default.recallLabel, children: session.label }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: ContextBody_default.recallCounts, children: t("message.context.recall.counts", {
        retained: session.retained,
        omitted: session.omitted
      }) }),
      session.truncated && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: ContextBody_default.recallCounts, children: t("message.context.recall.truncated") })
    ] }, index)) }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(ModelFacingContent, { content, t })
  ] });
}
function noticeSummary(source) {
  const summary = asRecord(source)?.["summary"];
  return typeof summary === "string" && summary !== "" ? summary : null;
}
function contextBody(form, props) {
  const opaque = { rendered: null, summary: null, body: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(OpaqueBody, { ...props }) };
  switch (form) {
    case "instructions":
      return instructionChanges(props.source) === null ? opaque : { rendered: "instructions", summary: null, body: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(InstructionsBody, { ...props }) };
    case "catalog":
      return catalogEntries(props.source) === null ? opaque : { rendered: "catalog", summary: null, body: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(CatalogBody, { ...props }) };
    case "snapshot":
      return snapshotSections(props.source) === null ? opaque : { rendered: "snapshot", summary: null, body: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(SnapshotBody, { ...props }) };
    case "notice": {
      const summary = noticeSummary(props.source);
      return summary === null ? opaque : { rendered: "notice", summary, body: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(NoticeBody, { ...props }) };
    }
    case "relay":
      return relaySender(props.source) === null ? opaque : { rendered: "relay", summary: null, body: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(RelayBody, { ...props }) };
    case "recall":
      return recalledSessions(props.source) === null ? opaque : { rendered: "recall", summary: null, body: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(RecallBody, { ...props }) };
    case null:
      return opaque;
    /* v8 ignore next 4 -- closed-union backstop; the compiler rejects a new
    KnownContextForm here rather than letting it degrade to opaque silently. */
    default: {
      const unreachable = form;
      throw new Error(`unreachable context form: ${String(unreachable)}`);
    }
  }
}

// ../../official-latest-standard/packages/client/ui-chat/src/client/chat/ContextInjectionRow.module.css
var ContextInjectionRow_default = {
  root: "ContextInjectionRow_root",
  chevron: "ContextInjectionRow_chevron",
  sep: "ContextInjectionRow_sep",
  source: "ContextInjectionRow_source",
  summary: "ContextInjectionRow_summary",
  body: "ContextInjectionRow_body",
  toolChanges: "ContextInjectionRow_toolChanges"
};

// ../../official-latest-standard/packages/client/ui-chat/src/client/chat/ContextInjectionRow.tsx
var import_jsx_runtime3 = require("react/jsx-runtime");
function ContextInjectionRow({ content, source, producer, form, t }) {
  const [open, setOpen] = (0, import_react2.useState)(false);
  const { rendered, summary, body } = contextBody(form, { content, source, t });
  const toolBlocks = content.length > 0 && content.every((block) => block.type === "tool-addition" || block.type === "tool-removal") ? content : void 0;
  const added = toolBlocks?.flatMap((block) => block.type === "tool-addition" ? [block.toolName] : []) ?? [];
  const removed = toolBlocks?.flatMap((block) => block.type === "tool-removal" ? [block.toolName] : []) ?? [];
  const single = toolBlocks?.length === 1 ? toolBlocks[0] : void 0;
  const toolSummary = toolBlocks === void 0 || single !== void 0 ? null : added.length > 0 && removed.length > 0 ? t("message.toolsChanged", { added: added.length, removed: removed.length }) : added.length > 0 ? t("message.toolsAddedCount", { count: added.length }) : t("message.toolsRemovedCount", { count: removed.length });
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
    import_dsh_client_ui_primitives3.DisclosureRow,
    {
      className: ContextInjectionRow_default.root,
      icon: toolBlocks !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives3.IconBrowseOutlineRegular, { size: 14 }) : producer.role === "recall" ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { "data-context-recall-icon": true, children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives3.ReferenceIconRegular, { kind: "session" }) }) : /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives3.IconContextInjectionOutlineRegular, { size: 14 }),
      chevronClassName: ContextInjectionRow_default.chevron,
      title: single !== void 0 ? t(single.type === "tool-addition" ? "message.toolAdded" : "message.toolRemoved", { name: single.toolName }) : t(toolBlocks !== void 0 ? "message.toolsUpdated" : producer.role === "recall" ? "message.contextRecall" : "message.contextInjection"),
      collapsedContent: toolSummary !== null ? /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_jsx_runtime3.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: ContextInjectionRow_default.sep, "aria-hidden": true }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: ContextInjectionRow_default.summary, children: toolSummary })
      ] }) : toolBlocks !== void 0 || producer.label === null ? void 0 : (
        /* ToolRow's separator shape: an aria-hidden dot, so the accessible name
           stays the two readable parts and the two disclosure rows expose one
           name shape. A source that names no producer drops the dot with it. */
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_jsx_runtime3.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: ContextInjectionRow_default.sep, "aria-hidden": true }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: ContextInjectionRow_default.source, "data-context-source": true, children: producer.label }),
          summary !== null && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_jsx_runtime3.Fragment, { children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: ContextInjectionRow_default.sep, "aria-hidden": true }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: ContextInjectionRow_default.summary, "data-context-summary": true, children: summary })
          ] })
        ] })
      ),
      keepContentWhenOpen: true,
      open: open && single === void 0,
      expandable: single === void 0,
      expandOnRowClick: true,
      onToggle: () => {
        setOpen((value) => !value);
      },
      children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: ContextInjectionRow_default.body, "data-context-injection-body": true, "data-context-form": rendered ?? void 0, children: toolBlocks === void 0 ? body : /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: ContextInjectionRow_default.toolChanges, children: [
        added.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { children: t("message.toolsAdded", { names: added.join(", ") }) }),
        removed.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { children: t("message.toolsRemoved", { names: removed.join(", ") }) })
      ] }) })
    }
  );
}

// ../../official-latest-standard/packages/client/ui-chat/src/client/chat/MessageIconActions.tsx
var import_react4 = require("react");
var import_dsh_client_ui_primitives4 = require("@deepseek-ai/dsh-client-ui-primitives");

// ../../official-latest-standard/packages/client/ui-chat/src/client/chat/message-chrome.ts
function pad2(n) {
  return String(n).padStart(2, "0");
}
function startOfLocalDay(ms) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
function msUntilNextLocalMidnight(ms) {
  const next = new Date(ms);
  next.setHours(24, 0, 0, 0);
  return Math.max(next.getTime() - ms, 1);
}
function formatMessageClock(time, t, now = Date.now()) {
  const d = new Date(time);
  const n = new Date(now);
  const clock = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  if (d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate()) {
    return clock;
  }
  const params = { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() };
  const md = d.getFullYear() === n.getFullYear() ? t("clock.md", params) : t("clock.ymd", params);
  return `${md} ${clock}`;
}

// ../../official-latest-standard/packages/client/ui-chat/src/client/chat/use-calendar-day.ts
var import_react3 = require("react");
function useCalendarDay() {
  const [day, setDay] = (0, import_react3.useState)(() => startOfLocalDay(Date.now()));
  (0, import_react3.useEffect)(() => {
    let timer;
    const arm = () => {
      const now = Date.now();
      setDay(startOfLocalDay(now));
      timer = setTimeout(arm, msUntilNextLocalMidnight(now));
    };
    timer = setTimeout(arm, msUntilNextLocalMidnight(Date.now()));
    return () => {
      clearTimeout(timer);
    };
  }, []);
  return day;
}

// ../../official-latest-standard/packages/client/ui-chat/src/client/chat/MessageIconActions.module.css
var MessageIconActions_default = {
  actions: "MessageIconActions_actions",
  timeStart: "MessageIconActions_timeStart",
  timeEnd: "MessageIconActions_timeEnd",
  endInfo: "MessageIconActions_endInfo",
  action: "MessageIconActions_action",
  visuallyHidden: "MessageIconActions_visuallyHidden"
};

// ../../official-latest-standard/packages/client/ui-chat/src/client/chat/MessageIconActions.tsx
var import_jsx_runtime4 = require("react/jsx-runtime");
function MessageIconActions({
  text: text3,
  time,
  clock,
  onBranch,
  branchUnavailable = false,
  className,
  extraActions,
  usageAction,
  t
}) {
  const day = useCalendarDay();
  const reasonId = (0, import_react4.useId)();
  const [copied, setCopied] = (0, import_react4.useState)(false);
  const copyPending = (0, import_react4.useRef)(false);
  const copyTimer = (0, import_react4.useRef)(null);
  const copyEpoch = (0, import_react4.useRef)(0);
  (0, import_react4.useEffect)(() => () => {
    copyEpoch.current += 1;
    copyPending.current = false;
    if (copyTimer.current !== null) clearTimeout(copyTimer.current);
  }, []);
  const onCopy = (0, import_react4.useCallback)(() => {
    if (copied || copyPending.current) return;
    const epoch = copyEpoch.current;
    copyPending.current = true;
    void (0, import_dsh_client_ui_primitives4.writeClipboard)(text3).then((ok) => {
      if (epoch !== copyEpoch.current) return;
      copyPending.current = false;
      if (!ok) return;
      setCopied(true);
      copyTimer.current = window.setTimeout(() => {
        copyTimer.current = null;
        setCopied(false);
      }, 1e3);
    });
  }, [copied, text3]);
  const clockEl = time === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: clock === "start" ? MessageIconActions_default.timeStart : MessageIconActions_default.timeEnd, children: formatMessageClock(time, t, day) });
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: className === void 0 ? MessageIconActions_default.actions : `${MessageIconActions_default.actions} ${className}`, "data-clock": clock, children: [
    clock === "start" ? clockEl : null,
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_dsh_client_ui_primitives4.Tooltip, { label: copied ? t("copied") : t("copy"), side: "bottom", children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { type: "button", className: MessageIconActions_default.action, "aria-label": copied ? t("copied") : t("copy"), onClick: onCopy, children: copied ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_dsh_client_ui_primitives4.IconCheckOutlineRegular, {}) : /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_dsh_client_ui_primitives4.IconCopyOutlineRegular, {}) }) }),
    extraActions,
    onBranch !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_dsh_client_ui_primitives4.Tooltip, { label: branchUnavailable ? t("message.branchUnavailable") : t("message.branch"), side: "bottom", children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
      "button",
      {
        type: "button",
        className: MessageIconActions_default.action,
        "aria-label": t("message.branch"),
        "aria-disabled": branchUnavailable || void 0,
        "aria-describedby": branchUnavailable ? reasonId : void 0,
        "data-unavailable": branchUnavailable || void 0,
        onClick: branchUnavailable ? void 0 : onBranch,
        children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_dsh_client_ui_primitives4.IconBranchOutlineRegular, {})
      }
    ) }),
    onBranch !== void 0 && branchUnavailable && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { id: reasonId, className: MessageIconActions_default.visuallyHidden, children: t("message.branchUnavailable") }),
    clock === "end" ? /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { className: MessageIconActions_default.endInfo, children: [
      usageAction,
      clockEl
    ] }) : usageAction
  ] });
}

// ../../official-latest-standard/packages/client/ui-chat/src/client/chat/MessageItem.tsx
var import_jsx_runtime5 = require("react/jsx-runtime");
function contentParts(content) {
  const texts = [];
  const attachments = [];
  const rest = [];
  for (const block of content) {
    const b = block;
    if (b.type === "text" && typeof b.text === "string") texts.push(b.text);
    else if (b.type === "image" && b.attachment !== void 0) {
      attachments.push({ type: "image", image: { attachment: b.attachment } });
    } else if (b.type === "file" && b.attachment !== void 0) {
      attachments.push({ type: "file", file: b.attachment });
    } else rest.push(block);
  }
  return { text: texts.join(""), attachments, rest };
}
function retrySeconds(milliseconds) {
  return Math.max(1, Math.ceil(milliseconds / 1e3));
}
function failureMessage(message, code, t) {
  if (code === "ACCOUNT_SIGNED_OUT") return t("message.failure.accountSignedOut");
  if (code === "ACCOUNT_SIGN_IN_REQUIRED") return t("message.failure.accountSignInRequired");
  if (code === "QUOTA" || code === "ACCOUNT_QUOTA") return t("message.failure.quota");
  return code === "AUTH" ? t("message.failure.auth") : message;
}
function ModelRetryItem({ node, active, t }) {
  const deadline = (0, import_react5.useMemo)(() => Date.now() + node.delayMs, [node.delayMs, node.seq]);
  const scheduledSeconds = retrySeconds(node.delayMs);
  const maximum = node.mode === "normal" ? node.maxRetries : "\u221E";
  const [countdown, setCountdown] = (0, import_react5.useState)(() => ({
    deadline,
    seconds: retrySeconds(deadline - Date.now())
  }));
  const remainingSeconds = countdown.deadline === deadline ? countdown.seconds : retrySeconds(deadline - Date.now());
  (0, import_react5.useEffect)(() => {
    if (!active) return;
    const updateCountdown = () => {
      const next = retrySeconds(deadline - Date.now());
      setCountdown((current) => current.deadline === deadline && current.seconds === next ? current : { deadline, seconds: next });
      return next;
    };
    if (updateCountdown() === 1) return;
    const timer = window.setInterval(() => {
      if (updateCountdown() === 1) window.clearInterval(timer);
    }, 250);
    return () => {
      window.clearInterval(timer);
    };
  }, [active, deadline]);
  const label = active ? t("message.retry.active") : node.retryState === "cancelled" ? t("message.retry.cancelled") : node.retryState === "started" ? t("message.retry.started") : t("message.retry.scheduled");
  const seconds = active ? remainingSeconds : scheduledSeconds;
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("details", { className: MessageItem_default.retryRow, "data-active": active || void 0, children: [
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("summary", { className: MessageItem_default.retrySummary, children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: MessageItem_default.retryText, role: "status", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives5.TextShimmer, { active, children: t("message.retry.status", { label, retry: node.retry, maximum, seconds }) }) }) }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: MessageItem_default.retryDetails, children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: MessageItem_default.retryDetailLabel, children: t("message.retry.delay") }),
        t("duration.milliseconds", { milliseconds: Math.round(node.delayMs) })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: MessageItem_default.retryDetailLabel, children: t("message.retry.failure") }),
        failureMessage(node.failure.message, node.failure.code, t)
      ] })
    ] })
  ] });
}
function TurnErrorItem({ node, t }) {
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: MessageItem_default.turnErrorRow, role: "status", children: [
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives5.StateDot, { state: "error", className: MessageItem_default.turnErrorDot }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: MessageItem_default.turnErrorCopy, children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: MessageItem_default.turnErrorTitle, children: node.code === "ACCOUNT_SIGNED_OUT" ? t("message.accountStopped") : t("message.turnError") }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: MessageItem_default.turnErrorMessage, children: failureMessage(node.message, node.code, t) })
    ] }),
    node.code !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("code", { className: MessageItem_default.turnErrorCode, children: node.code })
  ] });
}
function TurnMaxTokensItem({ t }) {
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: MessageItem_default.turnErrorRow, role: "status", children: [
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives5.StateDot, { state: "warning", className: MessageItem_default.turnErrorDot }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: MessageItem_default.turnErrorCopy, children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: MessageItem_default.maxTokensTitle, children: t("message.maxTokens") }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: MessageItem_default.turnErrorMessage, children: t("message.maxTokens.hint") })
    ] })
  ] });
}
function UserStyleBubble({
  content,
  renderMessageImages,
  actions,
  pending = false,
  echo = false,
  referenceLabels = [],
  skillNames = [],
  previewAttachments,
  references,
  t
}) {
  const { text: text3, attachments: contentAttachments, rest } = contentParts(content);
  const attachments = previewAttachments ?? contentAttachments;
  const compactImages = attachments.length > 1;
  const truncated = (total) => t("json.truncated", { total });
  const showBubble = text3 !== "" || rest.length > 0;
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(
    "div",
    {
      className: MessageItem_default.userRow,
      "data-pending-steering": pending || void 0,
      "data-submission-echo": echo || void 0,
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: MessageItem_default.userStack, children: [
          attachments.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: MessageItem_default.attachmentRow, "data-message-attachments": true, children: attachments.map((attachment, index) => attachment.type === "image" ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_react5.Fragment, { children: renderMessageImages({
            images: [attachment.image],
            align: "end",
            compact: compactImages
          }) }, `image:${index}`) : /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { className: MessageItem_default.fileCard, title: attachment.file.name, children: [
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives5.FileTypeIcon, { path: attachment.file.name, className: MessageItem_default.fileIcon }),
            /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { className: MessageItem_default.fileContent, children: [
              /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: MessageItem_default.fileName, children: attachment.file.name }),
              /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: MessageItem_default.fileMeta, children: [(0, import_dsh_client_ui_primitives5.fileExtension)(attachment.file.name).toUpperCase().slice(0, 8), (0, import_dsh_client_ui_primitives5.fileSizeText)(attachment.file.bytes)].filter(Boolean).join(" ") })
            ] })
          ] }, `file:${index}`)) }),
          showBubble && /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: MessageItem_default.bubble, children: [
            (0, import_dsh_client_ui_primitives5.projectUserText)(text3, referenceLabels, skillNames, "skill", references),
            rest.map((block, i) => /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives5.JsonBlock, { label: t("message.extraBlock"), payload: block, truncatedLabel: truncated }, i))
          ] }),
          referenceLabels.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: MessageItem_default.referenceSummary, children: t("message.referenceSummary", { labels: referenceLabels.join(t("message.referenceSeparator")) }) })
        ] }),
        actions?.(text3)
      ]
    }
  );
}
var UserMessageNodeView = (0, import_react5.memo)(function UserMessageNodeView2({
  node,
  renderMessageImages,
  openFile,
  openSkill,
  t
}) {
  const data = node.data;
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
    UserStyleBubble,
    {
      content: data.content,
      references: { openFile, openSkill },
      renderMessageImages,
      ...data.referenceLabels === void 0 ? {} : { referenceLabels: data.referenceLabels },
      ...data.skillNames === void 0 ? {} : { skillNames: data.skillNames },
      t,
      actions: (text3) => /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
        MessageIconActions,
        {
          text: text3,
          time: data.time,
          clock: "start",
          className: MessageItem_default.actions,
          t
        }
      )
    }
  );
});
var ContextMessageNodeView = (0, import_react5.memo)(function ContextMessageNodeView2({ node, t }) {
  const data = node.data;
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
    ContextInjectionRow,
    {
      content: data.content,
      source: data.source,
      producer: data.producer,
      form: data.form,
      t
    }
  );
});
var CompactionNodeView = (0, import_react5.memo)(function CompactionNodeView2({ node, t }) {
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(CompactionItem, { node: node.data, t });
});
var RetryNodeView = (0, import_react5.memo)(function RetryNodeView2({ node, t }) {
  const data = node.data;
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(ModelRetryItem, { node: data.current, active: data.current.retryState === "scheduled", t });
});
var TurnErrorNodeView = (0, import_react5.memo)(function TurnErrorNodeView2({ node, t }) {
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(TurnErrorItem, { node: node.data, t });
});
var TurnMaxTokensNodeView = (0, import_react5.memo)(function TurnMaxTokensNodeView2({ t }) {
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(TurnMaxTokensItem, { t });
});
var UnknownNodeView = (0, import_react5.memo)(function UnknownNodeView2({ node, t }) {
  const data = node.data;
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: MessageItem_default.contextRow, children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
    import_dsh_client_ui_primitives5.JsonBlock,
    {
      label: t("message.unknownSurface", { type: data.type }),
      payload: data.data,
      truncatedLabel: (total) => t("json.truncated", { total })
    }
  ) });
});

// src/page-interaction/reference-message.tsx
var import_dsh_client_ui_primitives6 = require("@deepseek-ai/dsh-client-ui-primitives");

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
function projectReferenceText(text3) {
  const pattern = /@?\[([^\]\n]+)\]\(dsh-page:(R[a-f0-9]{12})\)/g;
  const labels = [];
  const ranges = [];
  let display = "", cursor = 0;
  for (const match of text3.matchAll(pattern)) {
    display += text3.slice(cursor, match.index);
    let label = match[1];
    try {
      label = decodeURIComponent(label);
    } catch {
    }
    const start = display.length;
    display += label;
    ranges.push({ start, end: display.length });
    labels.push(label);
    cursor = match.index + match[0].length;
  }
  return { text: display + text3.slice(cursor), labels, ranges };
}

// src/page-interaction/reference-message.tsx
var import_jsx_runtime6 = require("react/jsx-runtime");
function mountReferenceMessages(ctx) {
  for (const key of ["user", "steering"]) {
    ctx.slots.inject(
      "conversation.chat.node",
      () => ctx.slots.register(
        { name: "conversation.chat.node", key, priority: -1, locale: "chat" },
        ReferenceMessage
      )
    );
  }
}
function ReferenceMessage(props) {
  const { node, t, renderMessageImages, openFile, openSkill } = props;
  const { content, time, referenceLabels = [], skillNames = [] } = node.data;
  const raw = content.filter((block) => block.type === "text").map((block) => block.text).join("");
  const display = projectReferenceText(raw);
  if (!display.ranges.length) return /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(UserMessageNodeView, { ...props });
  const attachments = content.filter(
    (block) => (block.type === "image" || block.type === "file") && "attachment" in block
  );
  const rest = content.filter(
    (block) => block.type !== "text" && block.type !== "image" && block.type !== "file"
  );
  const decorate = (text3) => (0, import_dsh_client_ui_primitives6.projectUserText)(text3, referenceLabels, skillNames, "skill", { openFile, openSkill });
  const runs = [];
  let cursor = 0;
  for (const range of display.ranges) {
    runs.push(
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(import_react6.Fragment, { children: decorate(display.text.slice(cursor, range.start)) }, `text:${cursor}`)
    );
    runs.push(
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { "data-page-reference-label": true, children: display.text.slice(range.start, range.end) }, `reference:${range.start}`)
    );
    cursor = range.end;
  }
  runs.push(/* @__PURE__ */ (0, import_jsx_runtime6.jsx)(import_react6.Fragment, { children: decorate(display.text.slice(cursor)) }, `text:${cursor}`));
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: MessageItem_default.userRow, "data-page-reference-message": true, children: [
    /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: MessageItem_default.userStack, children: [
      attachments.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { className: MessageItem_default.attachmentRow, "data-message-attachments": true, children: attachments.map(
        (block, index) => block.type === "image" ? /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(import_react6.Fragment, { children: renderMessageImages({
          images: [{ attachment: block.attachment }],
          align: "end",
          compact: attachments.length > 1
        }) }, index) : block.type === "file" ? /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("span", { className: MessageItem_default.fileCard, title: block.attachment.name, children: [
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(import_dsh_client_ui_primitives6.FileTypeIcon, { path: block.attachment.name, className: MessageItem_default.fileIcon }),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("span", { className: MessageItem_default.fileContent, children: [
            /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: MessageItem_default.fileName, children: block.attachment.name }),
            /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: MessageItem_default.fileMeta, children: [
              (0, import_dsh_client_ui_primitives6.fileExtension)(block.attachment.name).toUpperCase().slice(0, 8),
              (0, import_dsh_client_ui_primitives6.fileSizeText)(block.attachment.bytes)
            ].filter(Boolean).join(" ") })
          ] })
        ] }, index) : null
      ) }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: MessageItem_default.bubble, children: [
        runs,
        rest.map((block, index) => /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
          import_dsh_client_ui_primitives6.JsonBlock,
          {
            label: t("message.extraBlock"),
            payload: block,
            truncatedLabel: (total) => t("json.truncated", { total })
          },
          index
        ))
      ] }),
      referenceLabels.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { className: MessageItem_default.referenceSummary, children: t("message.referenceSummary", {
        labels: referenceLabels.join(t("message.referenceSeparator"))
      }) })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(MessageIconActions, { text: raw, time, clock: "start", className: MessageItem_default.actions, t })
  ] });
}

// src/business-views.tsx
var import_react21 = require("react");

// src/client/locales.ts
var copy = {
  aiWorkbench: ["AI\u5DE5\u4F5C\u53F0", "AI workspace"],
  startConversation: ["\u65B0\u5EFA\u5BF9\u8BDD", "New conversation"],
  thinking: ["\u6DF1\u5EA6\u601D\u8003\u4E2D", "Thinking"],
  thinkingFor: ["\u6DF1\u5EA6\u601D\u8003\u4E2D\uFF0C\u7528\u65F6 {duration}", "Thinking for {duration}"],
  navigationLogin: ["\u8BF7\u767B\u5F55\u4EE5\u6253\u5F00\u98DE\u4E66\u6D88\u606F\u3002", "Sign in to open the Feishu message."],
  navigationLoginAction: ["\u767B\u5F55\u5E76\u7EE7\u7EED", "Sign in and continue"],
  navigationOpening: ["\u6B63\u5728\u6253\u5F00\u6D88\u606F\u5BF9\u5E94\u9875\u9762\u2026", "Opening the message destination\u2026"],
  navigationExpired: ["\u6D88\u606F\u94FE\u63A5\u5DF2\u8FC7\u671F\u6216\u64A4\u9500\uFF0C\u8BF7\u91CD\u65B0\u83B7\u53D6\u901A\u77E5\u3002", "This message link has expired or was revoked. Request a new notification."],
  navigationForbidden: ["\u5F53\u524D\u8D26\u53F7\u65E0\u6743\u67E5\u770B\u6B64\u6D88\u606F\uFF0C\u8BF7\u6838\u5BF9\u767B\u5F55\u8D26\u53F7\u3002", "This account cannot view the message. Check your signed-in account."],
  navigationUnavailable: ["\u6682\u65F6\u65E0\u6CD5\u5B9A\u4F4D\u6D88\u606F\u76EE\u6807\uFF0C\u8BF7\u786E\u8BA4\u5BF9\u5E94\u529F\u80FD\u5DF2\u5B89\u88C5\uFF0C\u6216\u5728\u6D88\u606F\u5F85\u529E\u4E2D\u67E5\u770B\u3002", "The destination could not be located. Check that its feature is installed or open the inbox."],
  navigationFailed: ["\u6D88\u606F\u6253\u5F00\u6216\u56DE\u6267\u672A\u5B8C\u6210\uFF0C\u8BF7\u91CD\u8BD5\u3002", "Opening the message or confirming arrival did not finish. Retry."],
  accountMenu: ["\u8D26\u6237\u83DC\u5355", "Account menu"],
  settings: ["\u8BBE\u7F6E", "Settings"],
  logout: ["\u9000\u51FA\u767B\u5F55", "Sign out"],
  loggingOut: ["\u6B63\u5728\u9000\u51FA\u2026", "Signing out\u2026"],
  pageDiscoveryFailed: ["\u4E1A\u52A1\u9875\u9762\u6682\u65F6\u65E0\u6CD5\u52A0\u8F7D\u3002", "Business pages could not be loaded."],
  retryAction: ["\u91CD\u8BD5", "Retry"],
  logoutFailed: ["\u9000\u51FA\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5\u3002", "Sign-out failed. Retry."],
  close: ["\u5173\u95ED", "Close"],
  inboxUnreadMessages: ["\u6761\u672A\u8BFB\u6D88\u606F", "unread messages"],
  inboxStatusLabel: ["\u72B6\u6001\uFF1A", "Status:"],
  inboxAll: ["\u5168\u90E8", "All"],
  inboxBusinessType: ["\u4E1A\u52A1\u7C7B\u578B", "Business type"],
  inboxSubject: ["\u4E3B\u9898", "Subject"],
  inboxContent: ["\u5185\u5BB9", "Content"],
  inboxStatus: ["\u72B6\u6001", "Status"],
  inboxCurrentStatus: ["\u5F53\u524D\u72B6\u6001", "Current status"],
  inboxMessageSubject: ["\u6D88\u606F\u4E3B\u9898", "Message subject"],
  inboxQueryInfo: ["\u67E5\u8BE2\u4FE1\u606F", "Query information"],
  businessInbox: ["\u4E1A\u52A1\u5F85\u529E", "Business inbox"],
  notificationContent: ["\u6D88\u606F\u5185\u5BB9", "Message content"],
  notificationCreatedAt: ["\u521B\u5EFA\u65F6\u95F4", "Created at"],
  notificationDetail: ["\u5F85\u529E\u8BE6\u60C5", "Task details"],
  notificationUnread: ["\u672A\u8BFB", "Unread"],
  notificationRead: ["\u5DF2\u8BFB", "Read"],
  notificationDismissed: ["\u5DF2\u5FFD\u7565", "Dismissed"],
  inboxReadOnly: [
    "GEA \u901A\u77E5\u4E0E\u4E1A\u52A1\u5F85\u529E \xB7 \u53EA\u8BFB\u67E5\u770B\uFF0C\u4E0D\u6539\u53D8\u5904\u7406\u72B6\u6001",
    "GEA notifications and business tasks \xB7 viewing does not change state"
  ],
  inboxMutationHint: [
    "\u72B6\u6001\u53D8\u66F4\u4F1A\u63D0\u4EA4\u5F53\u524D\u7248\u672C\uFF1B\u51B2\u7A81\u65F6\u8BF7\u5237\u65B0\u540E\u518D\u51B3\u5B9A\u3002",
    "State changes use the current version; refresh before retrying a conflict."
  ],
  markRead: ["\u6807\u8BB0\u5DF2\u8BFB", "Mark as read"],
  notificationNotifiedAt: ["\u901A\u77E5\u65F6\u95F4", "Notification time"],
  notificationResultUnknown: ["\u6682\u65F6\u65E0\u6CD5\u786E\u8BA4\u5904\u7406\u7ED3\u679C\uFF0C\u8BF7\u91CD\u8BD5\u539F\u64CD\u4F5C\u3002", "The result is unknown. Retry the original action."],
  notificationRetryOriginal: ["\u91CD\u8BD5\u539F\u64CD\u4F5C", "Retry original action"],
  notificationConflict: ["\u6D88\u606F\u72B6\u6001\u5DF2\u53D8\u5316\uFF0C\u6B63\u5728\u5237\u65B0\uFF0C\u8BF7\u6838\u5BF9\u540E\u518D\u64CD\u4F5C\u3002", "The message changed. Refreshing; review it before acting again."],
  markSelectedRead: ["\u6279\u91CF\u6807\u8BB0\u5DF2\u8BFB", "Mark selected as read"],
  dismissNotification: ["\u5FFD\u7565\u5F85\u529E", "Dismiss task"],
  approveNotification: ["\u540C\u610F", "Approve"],
  rejectNotification: ["\u9A73\u56DE", "Reject"],
  refreshInbox: ["\u5237\u65B0\u6D88\u606F", "Refresh messages"],
  backToInbox: ["\u8FD4\u56DE\u6D88\u606F\u5217\u8868", "Back to messages"],
  unreadCount: ["\u672A\u8BFB\u6570", "Unread"],
  notificationNoContent: ["\u6682\u65E0\u6D88\u606F\u5185\u5BB9", "No message content"],
  notificationTitle: ["\u6807\u9898", "Title"],
  notificationState: ["\u901A\u77E5\u72B6\u6001", "Notification state"],
  notificationSource: ["\u6765\u6E90", "Source"],
  inboxBusinessTypeSalesPlan: ["\u9500\u552E\u8BA1\u5212", "Sales plan"],
  inboxBusinessTypeFallback: ["\u4E1A\u52A1\u5F85\u529E", "Business task"],
  inboxNotificationKindApproval: ["\u5BA1\u6279\u901A\u77E5", "Approval notice"],
  inboxSourceSalesPlanApproval: ["\u9500\u552E\u8BA1\u5212\u5BA1\u6279", "Sales plan approval"],
  inboxSourceFallback: ["\u4E1A\u52A1\u7CFB\u7EDF", "Business system"],
  inboxSessionUnavailable: [
    "\u6765\u6E90\u4F1A\u8BDD\u5B9A\u4F4D\u5C1A\u672A\u63A5\u5165\uFF0C\u4FDD\u7559 GEA \u6765\u6E90\u5F15\u7528\u4F9B\u6838\u5BF9\u3002",
    "Session navigation is not connected. The GEA source reference is preserved for comparison."
  ],
  requestTimeout: ["\u8BF7\u6C42\u8D85\u65F6\uFF0C\u8BF7\u91CD\u8BD5\u3002", "The request timed out. Retry."],
  networkError: [
    "\u65E0\u6CD5\u8FDE\u63A5 GEA\uFF0C\u8BF7\u68C0\u67E5\u7F51\u7EDC\u540E\u91CD\u8BD5\u3002",
    "Cannot connect to GEA. Check the network and retry."
  ],
  title: ["GEA \u9500\u552E\u8BA1\u5212", "GEA sales plans"],
  intro: [
    "\u67E5\u8BE2\u8BA1\u5212\u3001\u67E5\u770B\u7248\u672C\u4E0E SKU\uFF0C\u786E\u8BA4\u8303\u56F4\u540E\u4EA4\u7ED9\u53EA\u8BFB\u4F1A\u8BDD\u3002",
    "Inspect plans, versions and SKUs, then confirm the input for a read-only session."
  ],
  welcomeLogin: [
    "\u6B22\u8FCE\u4F7F\u7528 GEA \u5DE5\u4F5C\u53F0",
    "Welcome to your GEA workspace"
  ],
  production: ["\u6B63\u5F0F", "Production"],
  test: ["\u6D4B\u8BD5", "Test"],
  scanInstructions: [
    "\u7528\u624B\u673A\u98DE\u4E66\u626B\u4E00\u626B\uFF0C\u5F00\u59CB\u4ECA\u5929\u7684\u5DE5\u4F5C\u3002",
    "Scan with Lark on your phone to get started."
  ],
  qrPreparing: ["\u6B63\u5728\u51C6\u5907\u4E8C\u7EF4\u7801\u2026", "Preparing your QR code\u2026"],
  loading: ["\u6B63\u5728\u52A0\u8F7D\u2026", "Loading\u2026"],
  qrUnavailable: ["\u4E8C\u7EF4\u7801\u6682\u672A\u5C31\u7EEA", "QR code unavailable"],
  qrWaiting: ["\u7B49\u5F85\u626B\u7801", "Ready to scan"],
  qrExpired: ["\u4E8C\u7EF4\u7801\u5DF2\u8FC7\u671F", "QR code expired"],
  qrExpiredHint: ["\u70B9\u4E0B\u65B9\u6309\u94AE\uFF0C\u6362\u4E00\u5F20\u65B0\u7684\u4E8C\u7EF4\u7801", "Use the button below to get a new code."],
  loginTipTitle: ["\u5C0F\u63D0\u793A", "A quick tip"],
  loginTip: [
    "\u626B\u7801\u540E\uFF0C\u8BF7\u5728\u624B\u673A\u98DE\u4E66\u4E2D\u786E\u8BA4\u767B\u5F55\uFF1B\u65E0\u9700\u5728\u8FD9\u91CC\u8F93\u5165\u5BC6\u7801\u3002",
    "After scanning, confirm sign-in in Lark. No password is needed here."
  ],
  loginFooter: ["GEA \u4E1A\u52A1\u5DE5\u4F5C\u53F0", "GEA business workspace"],
  changeEnvironment: [
    "\u5207\u6362\u73AF\u5883 / \u91CD\u65B0\u767B\u5F55",
    "Change environment / sign in again"
  ],
  login: ["\u98DE\u4E66\u626B\u7801\u767B\u5F55", "Sign in with Lark QR"],
  dshConversation: ["DSH \u5BF9\u8BDD", "DSH conversation"],
  modelDiscovering: ["\u6B63\u5728\u83B7\u53D6 GEA \u6A21\u578B\u2026", "Discovering GEA models\u2026"],
  modelDiscovered: [
    "\u5DF2\u83B7\u53D6\u6A21\u578B\uFF08\u5C1A\u672A\u9A8C\u8BC1\u63A8\u7406\uFF09\uFF1A",
    "Model discovered (inference not verified): "
  ],
  modelFailed: ["\u6A21\u578B\u83B7\u53D6\u5931\u8D25\uFF1A", "Model discovery failed: "],
  refreshQr: ["\u5237\u65B0\u4E8C\u7EF4\u7801", "Refresh QR code"],
  signedOut: ["\u5C1A\u672A\u767B\u5F55 GEA", "Not signed in to GEA"],
  signedIn: ["\u5DF2\u767B\u5F55", "Signed in"],
  environment: ["GEA \u73AF\u5883", "GEA environment"],
  pending: ["\u7B49\u5F85\u98DE\u4E66\u626B\u7801\u786E\u8BA4", "Waiting for Lark confirmation"],
  expired: ["\u4E8C\u7EF4\u7801\u5DF2\u8FC7\u671F\uFF0C\u8BF7\u91CD\u65B0\u83B7\u53D6", "QR expired. Get a new code."],
  loginExpired: [
    "GEA \u767B\u5F55\u5DF2\u5931\u6548\uFF0C\u8BF7\u91CD\u65B0\u626B\u7801",
    "GEA login expired. Sign in again."
  ],
  loginHelp: [
    "\u767B\u5F55\u4EC5\u4FDD\u7559\u5728\u5F53\u524D\u670D\u52A1\u8FDB\u7A0B\u4E2D\uFF0C\u91CD\u542F\u540E\u9700\u91CD\u65B0\u767B\u5F55\u3002",
    "Login stays in this server process; restart requires signing in again."
  ],
  query: ["\u67E5\u8BE2\u8BA1\u5212", "Query plans"],
  periods: ["\u5237\u65B0\u9500\u552E\u5468\u671F", "Refresh periods"],
  period: ["\u9500\u552E\u5468\u671F", "Period"],
  periodMonth: ["\u5468\u671F\u6708\u4EFD", "Period month"],
  planTypeCode: ["\u8BA1\u5212\u7C7B\u578B", "Plan type"],
  status: ["\u72B6\u6001\u7801", "Status code"],
  all: ["\u4E0D\u9650", "Any"],
  empty: ["\u672C\u6B21\u67E5\u8BE2\u6CA1\u6709\u8BB0\u5F55", "No records returned"],
  noQuery: [
    "\u767B\u5F55\u540E\u9009\u62E9\u7B5B\u9009\u6761\u4EF6\u5E76\u67E5\u8BE2\u8BA1\u5212",
    "Sign in, choose filters and query plans"
  ],
  busy: ["\u6B63\u5728\u5904\u7406\u2026", "Working\u2026"],
  failure: ["\u64CD\u4F5C\u672A\u5B8C\u6210", "Operation failed"],
  forbidden: [
    "\u5F53\u524D\u8D26\u53F7\u6CA1\u6709\u6B64\u6570\u636E\u7684\u8BFB\u53D6\u6743\u9650",
    "This account cannot read the requested data"
  ],
  retry: [
    "\u8BF7\u91CD\u8BD5\u5F53\u524D\u64CD\u4F5C\uFF1B\u82E5\u6301\u7EED\u5931\u8D25\uFF0C\u8BF7\u8054\u7CFB\u670D\u52A1\u7BA1\u7406\u5458\u3002",
    "Retry this action. Contact the service administrator if it keeps failing."
  ],
  stale: [
    "\u9009\u62E9\u5DF2\u5931\u6548\uFF0C\u8BF7\u91CD\u65B0\u67E5\u8BE2\u5E76\u786E\u8BA4\u6570\u636E\u8303\u56F4\u3002",
    "This selection expired. Query again and confirm the input."
  ],
  tooLarge: [
    "\u8F93\u5165\u8D85\u51FA\u9650\u5236\uFF0C\u8BF7\u51CF\u5C11\u9009\u4E2D\u7684 SKU \u6216\u53D6\u6D88\u9644\u52A0\u8BE6\u60C5\u540E\u91CD\u65B0\u9884\u89C8\u3002",
    "Input exceeds the limit. Select fewer SKUs or omit detail, then preview again."
  ],
  unknown: ["\u672A\u63D0\u4F9B", "Not provided"],
  planId: ["\u8BA1\u5212\u6807\u8BC6", "Plan ID"],
  versionId: ["\u7248\u672C\u6807\u8BC6", "Version ID"],
  id: ["\u8BB0\u5F55\u6807\u8BC6", "Record ID"],
  periodId: ["\u5468\u671F\u6807\u8BC6", "Period ID"],
  seq: ["\u7248\u672C\u5E8F\u53F7", "Version sequence"],
  dealer: ["\u7ECF\u9500\u5546 / \u7EC4\u7EC7", "Dealer / organization"],
  dealerName: ["\u7ECF\u9500\u5546", "Dealer"],
  dealerCode: ["\u7ECF\u9500\u5546\u7F16\u7801", "Dealer code"],
  orgName: ["\u7EC4\u7EC7", "Organization"],
  provinceName: ["\u7701\u533A", "Province"],
  areaName: ["\u533A\u57DF", "Area"],
  currentQty: ["\u5F53\u524D\u6570\u91CF", "Current quantity"],
  targetQty: ["\u76EE\u6807\u6570\u91CF", "Target quantity"],
  currentAmount: ["\u5F53\u524D\u91D1\u989D", "Current amount"],
  targetAmount: ["\u76EE\u6807\u91D1\u989D", "Target amount"],
  updatedAt: ["\u66F4\u65B0\u65F6\u95F4", "Updated at"],
  returnReason: ["\u9000\u56DE\u539F\u56E0", "Return reason"],
  effective: ["\u662F\u5426\u751F\u6548", "Effective"],
  skuCount: ["SKU \u6570", "SKU count"],
  select: ["\u9009\u62E9", "Select"],
  page: ["\u9875\u7801", "Page"],
  previous: ["\u4E0A\u4E00\u9875", "Previous"],
  next: ["\u4E0B\u4E00\u9875", "Next"],
  total: ["\u67E5\u8BE2\u603B\u6570", "Total matches"],
  returned: ["\u5B9E\u9645\u8FD4\u56DE", "Returned"],
  fetchedAt: ["\u83B7\u53D6\u65F6\u95F4", "Fetched at"],
  live: ["GEA \u6570\u636E \xB7 \u53EA\u8BFB", "GEA data \xB7 read only"],
  detail: ["\u67E5\u770B\u5F53\u524D\u8BA1\u5212\u8BE6\u60C5", "View current plan detail"],
  versions: ["\u67E5\u770B\u7248\u672C\u5217\u8868", "View versions"],
  currentDetail: ["\u5F53\u524D\u8BA1\u5212\u8BE6\u60C5", "Current plan detail"],
  detailHelp: [
    "\u6B64\u5904\u662F\u63A5\u53E3\u8FD4\u56DE\u7684\u5F53\u524D\u8BA1\u5212\u8BE6\u60C5\uFF0C\u4E0D\u4EE3\u8868\u6240\u9009\u5386\u53F2\u7248\u672C\u3002",
    "This is the current plan detail returned by GEA; it does not describe a selected historical version."
  ],
  includeDetail: ["\u53D1\u9001\u65F6\u5305\u542B\u5F53\u524D\u8BA1\u5212\u8BE6\u60C5", "Include current plan detail"],
  noVersions: ["\u63A5\u53E3\u6CA1\u6709\u8FD4\u56DE\u7248\u672C", "No versions returned"],
  chooseVersion: ["\u9009\u62E9\u8981\u5206\u6790\u7684\u7248\u672C", "Choose the version to analyze"],
  selectedVersion: ["\u6240\u9009\u7248\u672C", "Selected version"],
  skus: ["\u67E5\u770B\u6240\u9009\u7248\u672C SKU", "View selected version SKUs"],
  skuCode: ["SKU \u7F16\u7801", "SKU code"],
  materialDescription: ["\u7269\u6599\u63CF\u8FF0", "Material description"],
  productCategName: ["\u54C1\u7C7B", "Category"],
  baseQty: ["\u57FA\u51C6\u6570\u91CF", "Base quantity"],
  qty: ["\u6570\u91CF", "Quantity"],
  price: ["\u5355\u4EF7", "Price"],
  amt: ["\u91D1\u989D", "Amount"],
  amtBase: ["\u57FA\u51C6\u91D1\u989D", "Base amount"],
  regionConfirmedQty: ["\u533A\u57DF\u786E\u8BA4\u6570\u91CF", "Region confirmed quantity"],
  regionConfirmedAmount: ["\u533A\u57DF\u786E\u8BA4\u91D1\u989D", "Region confirmed amount"],
  provinceConfirmedQty: ["\u7701\u533A\u786E\u8BA4\u6570\u91CF", "Province confirmed quantity"],
  provinceConfirmedAmount: ["\u7701\u533A\u786E\u8BA4\u91D1\u989D", "Province confirmed amount"],
  areaConfirmedQty: ["\u5927\u533A\u786E\u8BA4\u6570\u91CF", "Area confirmed quantity"],
  areaConfirmedAmount: ["\u5927\u533A\u786E\u8BA4\u91D1\u989D", "Area confirmed amount"],
  categoryConfirmedQty: ["\u54C1\u7C7B\u786E\u8BA4\u6570\u91CF", "Category confirmed quantity"],
  categoryConfirmedAmount: ["\u54C1\u7C7B\u786E\u8BA4\u91D1\u989D", "Category confirmed amount"],
  noSkus: ["\u63A5\u53E3\u6CA1\u6709\u8FD4\u56DE SKU", "No SKUs returned"],
  includeSkus: ["\u53D1\u9001\u65F6\u5305\u542B\u6240\u9009 SKU", "Include selected SKUs"],
  allSkus: ["\u9009\u62E9\u5168\u90E8\u5DF2\u8FD4\u56DE SKU", "Select all returned SKUs"],
  selectedCount: ["\u5DF2\u9009\u6761\u6570", "Selected count"],
  complete: ["\u63A5\u53E3\u8FD4\u56DE\u5B8C\u6574", "Complete upstream result"],
  partial: ["\u63A5\u53E3\u4EC5\u8FD4\u56DE\u90E8\u5206\u8BB0\u5F55", "Partial upstream result"],
  unknownCoverage: [
    "\u63A5\u53E3\u672A\u63D0\u4F9B\u603B\u6570\uFF0C\u8986\u76D6\u8303\u56F4\u672A\u77E5",
    "Total not provided; coverage unknown"
  ],
  preview: ["\u9884\u89C8\u53D1\u9001\u8303\u56F4", "Preview input"],
  previewTitle: ["\u786E\u8BA4\u4F1A\u8BDD\u8F93\u5165", "Confirm session input"],
  previewHelp: [
    "\u4EE5\u4E0B\u5185\u5BB9\u5C06\u4F5C\u4E3A\u56FA\u5B9A\u5FEB\u7167\u4FDD\u5B58\u5230\u4F1A\u8BDD\uFF1B\u540E\u7EED\u67E5\u8BE2\u4E0D\u4F1A\u4FEE\u6539\u5B83\u3002",
    "This input is saved as a fixed snapshot. Later queries do not change it."
  ],
  fullInput: ["\u67E5\u770B\u5B8C\u6574\u53D1\u9001\u5185\u5BB9", "View full input"],
  missing: ["\u7F3A\u5931\u4F9D\u636E", "Missing evidence"],
  missingDetail: ["\u672A\u5305\u542B\u5F53\u524D\u8BA1\u5212\u8BE6\u60C5", "Current plan detail omitted"],
  missingVersion: ["\u672A\u9009\u62E9\u7248\u672C", "No version selected"],
  missingSkus: ["\u672A\u5305\u542B SKU", "SKUs omitted"],
  bytes: ["\u8F93\u5165\u5927\u5C0F / \u4E0A\u9650\uFF08\u5B57\u8282\uFF09", "Input / limit (bytes)"],
  analysis: ["\u786E\u8BA4\u5E76\u5F00\u59CB\u5206\u6790", "Confirm and analyze"],
  analysisScope: ["\u5206\u6790\u8303\u56F4", "Analysis scope"],
  analysisSummaryScope: ["\u8BA1\u5212\u6C47\u603B\uFF08\u4E0D\u542BSKU\uFF09", "Plan summary (without SKUs)"],
  analysisDetailsScope: ["\u5B8C\u6574\u660E\u7EC6\uFF08\u542BSKU\uFF09", "Full details (with SKUs)"],
  analysisScopeHelp: [
    "\u6C47\u603B\u4EC5\u542B\u5F53\u524D\u7248\u672C\u7684\u91D1\u989D\u3001\u6570\u91CF\u3001\u7EC4\u7EC7\u4E0E\u72B6\u6001\uFF1B\u5B8C\u6574\u660E\u7EC6\u5305\u542B SKU\uFF0C\u53EF\u80FD\u8D85\u51FA\u8F93\u5165\u9650\u5236\u3002",
    "Summary includes only the current version's amounts, quantities, organization and status. Full details include SKUs and may exceed the input limit."
  ],
  analysisTooLarge: [
    "\u6240\u9009\u5185\u5BB9\u8D85\u51FA\u6A21\u578B\u8F93\u5165\u9650\u5236\u3002\u8BF7\u9009\u62E9\u201C\u8BA1\u5212\u6C47\u603B\uFF08\u4E0D\u542BSKU\uFF09\u201D\u6216\u51CF\u5C11\u8BA1\u5212\u6570\u91CF\u540E\u91CD\u65B0\u9884\u89C8\uFF1B\u672A\u53D1\u9001\u4EFB\u4F55\u5185\u5BB9\u3002",
    "The selection exceeds the model input limit. Choose Plan summary (without SKUs) or select fewer plans, then preview again. Nothing was sent."
  ],
  receipt: ["\u786E\u8BA4\u5E76\u9A8C\u8BC1\u4F20\u9012", "Confirm and verify handoff"],
  receiptMode: [
    "\u672C\u5730\u9A8C\u8BC1\u56DE\u6267\uFF1A\u4EC5\u9A8C\u8BC1\u6570\u636E\u4F20\u9012\uFF0C\u4E0D\u662F\u771F\u5B9E AI \u5206\u6790\u3002",
    "Local receipt: verifies data handoff, not real AI analysis."
  ],
  modelMode: ["\u771F\u5B9E\u6A21\u578B\u5206\u6790", "Model analysis"],
  sessionHelp: [
    "\u5206\u6790\u5F00\u59CB\u540E\uFF0C\u53EF\u5728\u6807\u51C6\u4F1A\u8BDD\u4E2D\u53D6\u6D88\u3001\u67E5\u770B\u5931\u8D25\u539F\u56E0\u6216\u660E\u786E\u91CD\u8BD5\uFF0C\u5E76\u7EE7\u7EED\u8FFD\u95EE\u6B64\u5FEB\u7167\u3002",
    "In the standard session, cancel, inspect failures, explicitly retry, or ask follow-up questions about this snapshot."
  ],
  openSession: ["\u6253\u5F00\u5DF2\u63D0\u4EA4\u4F1A\u8BDD", "Open submitted session"],
  approvalWorkspace: ["\u9500\u552E\u8BA1\u5212\u5BA1\u6279\u5DE5\u4F5C\u533A", "Sales plan approval workspace"],
  approvalEyebrow: ["\u53EA\u8BFB\u5BA1\u6279\u9A8C\u8BC1", "Read-only approval validation"],
  approvalTitle: ["\u9500\u552E\u8BA1\u5212\u5BA1\u6279", "Sales plan approval"],
  versionLabel: ["\u7248\u672C", "Version"],
  latestVersion: ["\u6700\u65B0\u7248\u672C", "Latest version"],
  mixed: ["\u591A\u6761\u8BB0\u5F55", "Multiple records"],
  organizationValue: ["\u7EC4\u7EC7\u503C", "Organization value"],
  readOnlyBanner: [
    "\u6682\u4E0D\u53EF\u64CD\u4F5C\uFF1A\u5F53\u524D\u4EC5\u5C55\u793A GEA \u6570\u636E\uFF0C\u5BA1\u6279\u548C\u5199\u56DE\u63A5\u53E3\u5C1A\u672A\u63A5\u5165\u3002",
    "Actions are unavailable: this view is read-only until GEA approval APIs are connected."
  ],
  businessNavigation: ["\u4E1A\u52A1\u5BFC\u822A", "Business navigation"],
  openBusinessNavigation: ["\u5C55\u5F00\u4E1A\u52A1\u83DC\u5355", "Expand business menu"],
  newConversation: ["\u65B0\u4F1A\u8BDD", "New conversation"],
  geaBusiness: ["Synear GEA", "Synear GEA"],
  brandSubtitle: ["\u667A\u80FD\u4F53\u5DE5\u4F5C\u53F0", "Agent workspace"],
  functionArea: ["\u4E1A\u52A1\u5DE5\u4F5C\u53F0", "Business workbenches"],
  workspaceArea: ["\u5386\u53F2\u4F1A\u8BDD", "Session history"],
  homeEyebrow: ["\u601D\u5FF5\u4F01\u4E1A AI \u534F\u4F5C\u4F19\u4F34", "Synear enterprise AI copilot"],
  homeTitle: [
    "\u8BA9 AI \u8FDB\u5165\u5DE5\u4F5C\u6D41\u7A0B\uFF0C\u8BA9\u667A\u80FD\u6210\u4E3A\u7EC4\u7EC7\u751F\u4EA7\u529B\u3002",
    "Put AI into the workflow, and make intelligence the organisation's output."
  ],
  homeDescription: [
    "\u4ECE\u4F60\u6B63\u5728\u89E3\u51B3\u7684\u4E1A\u52A1\u95EE\u9898\u51FA\u53D1\uFF0C\u5206\u6790\u6570\u636E\u3001\u534F\u540C\u8BA1\u5212\u3001\u63A8\u52A8\u4EFB\u52A1\u95ED\u73AF\u3002\u9009\u62E9\u4E00\u4E2A\u573A\u666F\u5F00\u59CB\uFF0C\u4E5F\u53EF\u4EE5\u76F4\u63A5\u63D0\u51FA\u4F60\u7684\u95EE\u9898\u3002",
    "Start from the business question in front of you: analyse data, align plans and close the loop. Pick a scenario, or just ask."
  ],
  homeFunctions: ["\u5E38\u7528\u529F\u80FD", "Common tasks"],
  homeFunctionsHint: ["\u628A\u5DE5\u4F5C\u4EA4\u7ED9 AI \u534F\u52A9", "Hand the work to AI"],
  homeQuestions: ["\u63A8\u8350\u95EE\u9898", "Suggested questions"],
  homeQuestionsHint: ["\u4ECE\u4E00\u4E2A\u597D\u95EE\u9898\u5F00\u59CB", "Start with a good question"],
  homeAlerts: ["\u9884\u8B66\u4E8B\u4EF6", "Alerts"],
  homeAlertsHint: ["\u6709\u9700\u8981\u5173\u6CE8\u7684\u65B0\u53D8\u5316", "New changes worth a look"],
  homeAlertsEmpty: ["\u6682\u65F6\u6CA1\u6709\u9700\u8981\u5173\u6CE8\u7684\u9884\u8B66", "No alerts need attention right now"],
  homeAlertsFailed: [
    "\u9884\u8B66\u6682\u65F6\u53D6\u4E0D\u5230\uFF0C\u53EF\u4EE5\u5148\u53BB\u4E1A\u52A1\u5F85\u529E\u67E5\u770B",
    "Alerts are unavailable; open the business inbox instead"
  ],
  homeAlertsOpenAll: ["\u67E5\u770B\u5168\u90E8\u5F85\u529E", "Open the business inbox"],
  homeFunctionsPanelHint: ["\u70B9\u4E00\u6761\u5C31\u76F4\u63A5\u586B\u8FDB\u8F93\u5165\u6846", "Pick one to fill the prompt"],
  homeQuestionsPanelHint: ["\u70B9\u4E00\u6761\u5C31\u76F4\u63A5\u586B\u8FDB\u8F93\u5165\u6846", "Pick one to fill the prompt"],
  businessFunctions: ["\u4E1A\u52A1\u529F\u80FD", "Business functions"],
  planManagement: ["\u8BA1\u5212\u7BA1\u7406", "Plan management"],
  salesPlan: ["\u9500\u552E\u8BA1\u5212", "Sales plan"],
  regionalPlanWorkbench: ["\u533A\u57DF\u8BA1\u5212\u5DE5\u4F5C\u53F0", "Regional plan workbench"],
  categoryPlanWorkbench: ["\u54C1\u7C7B\u8BA1\u5212\u5DE5\u4F5C\u53F0", "Category plan workbench"],
  mpsPlanWorkbench: ["\u4E3B\u751F\u4EA7\u8BA1\u5212(MPS)", "MPS workbench"],
  apiLog: ["\u63A5\u53E3\u65E5\u5FD7", "API logs"],
  inboxNotConnected: [
    "\u6D88\u606F\u5F85\u529E\u63A5\u53E3\u5C1A\u672A\u63A5\u5165",
    "Message inbox service is not connected"
  ],
  messageInbox: ["\u6D88\u606F\u5F85\u529E", "Message inbox"],
  agentPanel: ["\u9700\u6C42\u9884\u6D4B", "Demand forecast"],
  agentPanelModel: [
    "GEA Personal Model \xB7 \u53EA\u8BFB\u5206\u6790",
    "GEA Personal Model \xB7 read-only analysis"
  ],
  agentPanelHelp: [
    "\u5206\u6790\u7ED3\u679C\u5C06\u5728 dsh \u4F1A\u8BDD\u4E2D\u751F\u6210\uFF1B\u6B64\u9762\u677F\u4E0D\u6267\u884C\u5BA1\u6279\u6216\u5199\u56DE\u3002",
    "Analysis runs in a dsh session; this panel does not approve or write back."
  ],
  agentReady: ["\u5DF2\u51C6\u5907\u5206\u6790", "Ready to analyze"],
  agentWaiting: ["\u7B49\u5F85\u9009\u62E9\u8BA1\u5212", "Waiting for a plan"],
  sendToSession: ["\u53D1\u9001\u5230 dsh \u4F1A\u8BDD", "Send to dsh session"],
  agentReadOnly: [
    "\u4EC5\u53D1\u9001\u660E\u786E\u9009\u62E9\u7684\u53EA\u8BFB\u5FEB\u7167\u3002",
    "Only the selected read-only snapshot is sent."
  ],
  agentAnalysisTitle: ["\u5BA1\u6279\u5EFA\u8BAE", "Approval guidance"],
  agentAnalysisEmpty: [
    "\u9009\u62E9\u8BA1\u5212\u540E\uFF0CAgent \u5C06\u5728 dsh \u4F1A\u8BDD\u4E2D\u751F\u6210\u9700\u6C42\u9884\u6D4B\u548C\u5BA1\u6279\u5EFA\u8BAE\u3002",
    "Select a plan to generate demand-forecast and approval guidance in a dsh session."
  ],
  agentComposerPlaceholder: [
    "\u53D1\u9001\u6D88\u606F\u5230 Demand Forecast and Plan Submission Assistant\u2026",
    "Send a message to Demand Forecast and Plan Submission Assistant\u2026"
  ],
  agentInputDisabled: [
    "\u5F53\u524D\u9875\u9762\u53EA\u53D1\u9001\u53EA\u8BFB\u5FEB\u7167\uFF0C\u6D88\u606F\u8F93\u5165\u5728 dsh \u4F1A\u8BDD\u4E2D\u8FDB\u884C\u3002",
    "This page sends read-only snapshots; message input is available in the dsh session."
  ],
  readOnlyPreview: [
    "\u53EA\u8BFB\u9884\u89C8 \xB7 \u4E0D\u6267\u884C\u5BA1\u6279\u5199\u56DE",
    "Read-only preview \xB7 no approval writeback"
  ],
  approvalQueue: ["\u5BA1\u6279\u6838\u5BF9\u961F\u5217", "Approval review queue"],
  planCount: ["\u8BA1\u5212\u6570", "Plans"],
  targetSummary: ["\u76EE\u6807\u6570\u91CF / \u91D1\u989D", "Target quantity / amount"],
  currentSummary: ["\u5F53\u524D\u6570\u91CF / \u91D1\u989D", "Current quantity / amount"],
  progress: ["\u8BA1\u5212\u8FDB\u5EA6", "Plan progress"],
  organizationView: ["\u7EC4\u7EC7\u89C6\u56FE", "Organization view"],
  allOrganizations: ["\u5168\u90E8", "All"],
  byBase: ["\u6309\u57FA\u5730", "By base"],
  byRegion: ["\u6309\u5927\u533A", "By region"],
  byProvince: ["\u6309\u7701\u533A", "By province"],
  byArea: ["\u6309\u533A\u57DF", "By area"],
  byDealer: ["\u6309\u5BA2\u6237", "By customer"],
  noOrganizationData: [
    "\u5F53\u524D\u7ED3\u679C\u672A\u63D0\u4F9B\u8BE5\u7EC4\u7EC7\u7EF4\u5EA6",
    "The result does not provide this organization dimension"
  ],
  approvalStages: ["\u5BA1\u6279\u8282\u70B9", "Approval stages"],
  stageDataPending: [
    "\u8282\u70B9\u72B6\u6001\u5F85\u63A5\u53E3\u63D0\u4F9B",
    "Stage status pending upstream data"
  ],
  stageCustomerAi: ["\u5BA2\u6237\u786E\u8BA4 AI", "Customer AI confirmation"],
  stageAreaApproval: ["\u57CE\u5E02\u7ECF\u7406\u5BA1\u6279", "City manager approval"],
  stageProvinceApproval: ["\u7701\u533A\u5BA1\u6279", "Province approval"],
  stageRegionApproval: ["\u5927\u533A\u5BA1\u6279", "Region approval"],
  stageCategoryPlan: ["\u54C1\u7C7B\u8BA1\u5212", "Category planning"]
};
var zh = Object.fromEntries(
  Object.entries(copy).map(([key, values]) => [key, values[0]])
);
var en = Object.fromEntries(
  Object.entries(copy).map(([key, values]) => [key, values[1]])
);

// src/client/inbox.tsx
var import_react7 = require("react");
var import_jsx_runtime7 = require("react/jsx-runtime");
function Inbox({ t, navigation, view, onViewChange }) {
  const { pageNo, readState: state } = view;
  const [selectedIds, setSelectedIds] = (0, import_react7.useState)(/* @__PURE__ */ new Set());
  const [selected, setSelected] = (0, import_react7.useState)(null);
  const [selectedReceipt, setSelectedReceipt] = (0, import_react7.useState)();
  const navigationOwned = (0, import_react7.useRef)(false);
  (0, import_react7.useLayoutEffect)(() => {
    if (navigation?.notificationId) {
      navigationOwned.current = true;
      setDetailResult(null);
      setSelected(navigation.notificationId);
      setSelectedReceipt(navigation.receipt);
    } else if (navigationOwned.current) {
      navigationOwned.current = false;
      setSelected(null);
      setSelectedReceipt(void 0);
      setDetailResult(null);
      setData(null);
      setSelectedIds(/* @__PURE__ */ new Set());
    }
  }, [navigation?.receipt]);
  const [revision, setRevision] = (0, import_react7.useState)(0);
  const [detailRevision, setDetailRevision] = (0, import_react7.useState)(0);
  const [data, setData] = (0, import_react7.useState)(null);
  const [detailResult, setDetailResult] = (0, import_react7.useState)(null);
  const [error, setError] = (0, import_react7.useState)(null);
  const [busy, setBusy] = (0, import_react7.useState)(true);
  const [mutationBusy, setMutationBusy] = (0, import_react7.useState)(false);
  const [mutationError, setMutationError] = (0, import_react7.useState)(null);
  const attempt = (0, import_react7.useRef)(null);
  const writing = (0, import_react7.useRef)(false);
  const [retryPending, setRetryPending] = (0, import_react7.useState)(false);
  const refresh = () => setRevision((value) => value + 1);
  const mutate = async (payload) => {
    if (writing.current || attempt.current && attempt.current !== payload) return;
    writing.current = true;
    attempt.current = payload;
    setMutationBusy(true);
    setMutationError(null);
    try {
      await readNotifications(payload);
      attempt.current = null;
      setRetryPending(false);
      setSelectedIds(/* @__PURE__ */ new Set());
      setDetailResult(null);
      refresh();
      setDetailRevision((value) => value + 1);
    } catch (reason) {
      const code = reason instanceof Error ? reason.message : "";
      const rejected = /^(NOTIFICATION_|APPROVAL_|INVALID_|LOGIN_REQUIRED|STALE_|GEA_HTTP_40[13])/.test(code);
      setRetryPending(!rejected);
      if (rejected) {
        attempt.current = null;
        setSelectedIds(/* @__PURE__ */ new Set());
        setDetailResult(null);
        refresh();
        setDetailRevision((value) => value + 1);
      }
      setMutationError(rejected ? notificationError(reason) : "notificationResultUnknown");
    } finally {
      writing.current = false;
      setMutationBusy(false);
    }
  };
  const mutationNotice = mutationError && /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { role: "alert", children: [
    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { children: t(mutationError) }),
    retryPending && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("button", { disabled: mutationBusy, onClick: () => attempt.current && mutate(attempt.current), children: t("notificationRetryOriginal") })
  ] });
  (0, import_react7.useEffect)(() => {
    const controller = new AbortController();
    setSelectedIds(/* @__PURE__ */ new Set());
    setError(null);
    setBusy(true);
    void readNotifications({ pageNo, state }, controller.signal).then((result) => {
      if (!controller.signal.aborted) setData(result.value);
    }).catch((reason) => {
      if (!controller.signal.aborted) {
        setData(null);
        setError(notificationError(reason));
      }
    }).finally(() => {
      if (!controller.signal.aborted) setBusy(false);
    });
    return () => controller.abort();
  }, [pageNo, revision, state]);
  (0, import_react7.useEffect)(() => {
    if (!selected) return;
    const controller = new AbortController();
    void readNotifications({ id: selected }, controller.signal).then((result) => {
      if (!controller.signal.aborted) setDetailResult({ id: selected, navigationReceipt: selectedReceipt, detail: result.value.detail });
    }).catch((reason) => {
      if (!controller.signal.aborted) setDetailResult({ id: selected, navigationReceipt: selectedReceipt, error: notificationError(reason) });
    });
    return () => controller.abort();
  }, [selected, detailRevision, selectedReceipt]);
  const currentDetail = detailResult?.id === selected && detailResult?.navigationReceipt === selectedReceipt ? detailResult : null;
  const detailBusy = Boolean(selected && !currentDetail);
  const detailError = currentDetail?.error;
  const detail = detailError ? null : currentDetail?.detail ?? (navigation ? null : data?.items.find((item) => item.id === selected));
  const openDetail = (id) => {
    setDetailResult(null);
    setSelectedReceipt(void 0);
    setSelected(id);
  };
  const drawer = (0, import_react7.useRef)(null);
  (0, import_react7.useLayoutEffect)(() => {
    if (selected) drawer.current?.showModal();
    else drawer.current?.close();
  }, [selected]);
  (0, import_react7.useEffect)(() => {
    if (!navigation || selected !== navigation.notificationId || selectedReceipt !== navigation.receipt) return;
    if (detailError) {
      navigation.failed(Error("NAVIGATION_TARGET_UNAVAILABLE"));
      return;
    }
    if (!currentDetail?.detail || !drawer.current?.open) return;
    if (currentDetail.detail.interactionRequestId !== navigation.interactionRequestId) {
      navigation.failed(Error("NAVIGATION_TARGET_UNAVAILABLE"));
      return;
    }
    navigation.visible();
  }, [navigation, currentDetail, detailError, selected, selectedReceipt]);
  const badge = (value) => /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: `gea-inbox-status ${value === "unread" ? "is-unread" : ""}`, children: stateLabel(value, t) });
  return /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("section", { className: "gea-inbox", "aria-label": t("messageInbox"), children: [
    selectedIds.size > 0 && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("div", { className: "gea-inbox-selection-actions", children: /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("button", { disabled: busy || mutationBusy || retryPending, onClick: () => {
      const items = data?.items.filter((item) => selectedIds.has(item.id) && item.state === "unread" && item.version !== null).map((item) => ({ notificationId: item.id, expectedVersion: item.version }));
      if (items?.length && items.length === selectedIds.size) void mutate({ operation: "batch-read", idempotencyKey: crypto.randomUUID(), items });
    }, children: t("markSelectedRead") }) }),
    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("div", { className: "gea-inbox-toolbar", children: /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("label", { className: "gea-inbox-filter", children: [
      t("inboxStatusLabel"),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("select", { disabled: mutationBusy, "aria-label": t("notificationState"), value: state, onChange: (event) => {
        setData(null);
        onViewChange({ pageNo: 1, readState: event.target.value });
      }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("option", { value: "", children: t("inboxAll") }),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("option", { value: "unread", children: t("notificationUnread") }),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("option", { value: "read", children: t("notificationRead") }),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("option", { value: "dismissed", children: t("notificationDismissed") })
      ] })
    ] }) }),
    /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "gea-inbox-content", children: [
      error && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { role: "alert", children: t(error) }),
      !selected && mutationNotice,
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("div", { className: "gea-inbox-table-scroll", children: /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("table", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("tr", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("th", { className: "gea-inbox-select-col", children: /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: "visually-hidden", children: t("select") }) }),
          /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("th", { children: t("inboxBusinessType") }),
          /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("th", { children: t("inboxSubject") }),
          /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("th", { children: t("inboxContent") }),
          /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("th", { children: t("notificationNotifiedAt") }),
          /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("th", { children: t("inboxStatus") })
        ] }) }),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("tbody", { children: [
          data?.items.map((item) => /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("tr", { className: item.state === "unread" ? "is-unread" : "", onClick: () => openDetail(item.id), children: [
            /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("td", { className: "gea-inbox-select-col", children: /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("input", { type: "checkbox", disabled: busy || mutationBusy || retryPending || item.state !== "unread" || item.version === null, "aria-label": `${t("select")} ${item.title ?? item.id}`, checked: selectedIds.has(item.id), onChange: (event) => {
              event.stopPropagation();
              setSelectedIds((current) => {
                const next = new Set(current);
                event.target.checked ? next.add(item.id) : next.delete(item.id);
                return next;
              });
            }, onClick: (event) => event.stopPropagation() }) }),
            /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("td", { children: /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: "gea-inbox-kind", children: businessTypeText(item, t) }) }),
            /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("td", { children: /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("button", { className: "gea-inbox-subject", onClick: () => openDetail(item.id), children: item.title ?? item.id }) }),
            /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("td", { children: /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: "gea-inbox-summary", children: (item.summary?.trim() || item.body?.trim() || t("notificationNoContent")).slice(0, 160) }) }),
            /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("td", { className: "gea-inbox-date", children: formatDate(item.notifiedAt ?? item.createdAt) }),
            /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("td", { children: badge(item.state) })
          ] }, item.id)),
          !data && busy && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("tr", { className: "gea-inbox-loading-row", children: /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("td", { colSpan: 6, children: [
            /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { role: "status", children: t("busy") }),
            /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("div", { className: "gea-inbox-placeholder", "aria-hidden": "true" })
          ] }) })
        ] })
      ] }) }),
      data && /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(import_jsx_runtime7.Fragment, { children: [
        data.items.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { className: "gea-inbox-empty", children: t("empty") }),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("footer", { className: "gea-inbox-pagination", children: [
          /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("span", { children: [
            t("total"),
            ": ",
            data.total,
            " \xB7 ",
            t("page"),
            ": ",
            pageNo
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("button", { disabled: busy || pageNo === 1, onClick: () => {
              setData(null);
              onViewChange({ ...view, pageNo: pageNo - 1 });
            }, children: t("previous") }),
            /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("button", { disabled: busy || pageNo * data.pageSize >= data.total, onClick: () => {
              setData(null);
              onViewChange({ ...view, pageNo: pageNo + 1 });
            }, children: t("next") })
          ] })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
      "dialog",
      {
        ref: drawer,
        className: "gea-inbox-drawer",
        "aria-labelledby": "gea-inbox-detail-title",
        onCancel: () => setSelected(null),
        onClick: (event) => {
          if (event.target === event.currentTarget) setSelected(null);
        },
        children: /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "gea-inbox-drawer-layout", children: [
          /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("header", { className: "gea-inbox-drawer-header", children: [
            /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("h2", { id: "gea-inbox-detail-title", children: t("notificationDetail") }),
            /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("button", { "aria-label": t("close"), onClick: () => setSelected(null), autoFocus: true, children: /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.5", "aria-hidden": "true", children: /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("path", { d: "m6 6 12 12M18 6 6 18" }) }) })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "gea-inbox-drawer-body", children: [
            mutationNotice,
            /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("div", { className: "gea-inbox-detail-loading", role: "status", children: detailBusy ? t("busy") : null }),
            detailError && /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { role: "alert", children: [
              /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { children: t(detailError) }),
              /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("button", { onClick: () => {
                setDetailResult(null);
                setDetailRevision((value) => value + 1);
              }, children: t("refreshInbox") })
            ] }),
            detail && /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("article", { "aria-busy": detailBusy, children: [
              /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("dl", { className: "gea-inbox-info", children: [
                /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { children: [
                  /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("dt", { children: t("notificationSource") }),
                  /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("dd", { children: sourceText(detail, t) })
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { children: [
                  /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("dt", { children: t("notificationCreatedAt") }),
                  /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("dd", { children: formatDate(detail.createdAt) })
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { children: [
                  /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("dt", { children: t("inboxCurrentStatus") }),
                  /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("dd", { children: badge(detail.state) })
                ] })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: "gea-inbox-label", children: t("inboxMessageSubject") }),
              /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("h3", { children: detail.title ?? detail.id }),
              /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: "gea-inbox-label", children: t("notificationContent") }),
              detail.actionText && /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "gea-inbox-action", children: [
                /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { children: detail.actionText }),
                targetText(detail, t) && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("small", { children: targetText(detail, t) })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { className: "gea-inbox-body", children: detail.content?.trim() ? detail.content : detail.body?.trim() ? detail.body : detail.summary?.trim() ? detail.summary : t("notificationNoContent") }),
              /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("fieldset", { disabled: mutationBusy || retryPending || detailBusy, className: "gea-inbox-detail-actions", children: [
                detail.state === "unread" && detail.version !== null && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("button", { disabled: mutationBusy, onClick: () => mutate({ operation: "read", id: detail.id, expectedVersion: detail.version, idempotencyKey: `read-${detail.id}-${detail.version}` }), children: t("markRead") }),
                detail.dismissible === true && detail.state !== "dismissed" && detail.version !== null && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("button", { disabled: mutationBusy, onClick: () => mutate({ operation: "dismiss", id: detail.id, expectedVersion: detail.version, idempotencyKey: `dismiss-${detail.id}-${detail.version}` }), children: t("dismissNotification") }),
                detail.approval?.actionable === true && detail.approval.version !== null && detail.approval.actions.includes("APPROVE") && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("button", { disabled: mutationBusy, onClick: () => mutate({ operation: "approval-action", id: detail.id, action: "APPROVE", expectedVersion: detail.approval?.version, idempotencyKey: `approve-${detail.id}-${detail.approval?.version}` }), children: t("approveNotification") }),
                detail.approval?.actionable === true && detail.approval.version !== null && detail.approval.actions.includes("REJECT") && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("button", { disabled: mutationBusy, onClick: () => mutate({ operation: "approval-action", id: detail.id, action: "REJECT", expectedVersion: detail.approval?.version, idempotencyKey: `reject-${detail.id}-${detail.approval?.version}` }), children: t("rejectNotification") })
              ] })
            ] })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("footer", { className: "gea-inbox-drawer-footer", children: /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("button", { "aria-label": t("backToInbox"), onClick: () => setSelected(null), children: t("close") }) })
        ] })
      }
    )
  ] });
}
var businessTypeLabels = {
  sales_forecast: "inboxBusinessTypeSalesPlan",
  sales_plan: "inboxBusinessTypeSalesPlan"
};
var notificationKindLabels = {
  approval: "inboxNotificationKindApproval"
};
var notificationSourceLabels = {
  "sales_plan.approval_required": "inboxSourceSalesPlanApproval",
  "sales_plan.approval": "inboxSourceSalesPlanApproval"
};
var technicalTargetTypes = /* @__PURE__ */ new Set(["agent", "system", "service", "user", "internal"]);
function readableText(value, labels, fallback, t) {
  const raw = value?.trim() ?? "";
  if (!raw) return t("unknown");
  const mapped = labels.map((table) => table[raw.toLowerCase()]).find(Boolean);
  if (mapped) return t(mapped);
  return /^[a-z0-9][a-z0-9._:-]*$/.test(raw) ? t(fallback) : raw;
}
function businessTypeText(item, t) {
  return readableText(
    item.businessType ?? item.kind,
    [businessTypeLabels, notificationKindLabels],
    "inboxBusinessTypeFallback",
    t
  );
}
function sourceText(item, t) {
  return readableText(
    item.source?.label ?? item.source?.type,
    [notificationSourceLabels],
    "inboxSourceFallback",
    t
  );
}
function targetText(item, t) {
  const target = item.target;
  if (!target) return "";
  const type = target.type?.trim() ?? "";
  return [
    technicalTargetTypes.has(type.toLowerCase()) ? "" : type,
    target.value ? readableText(
      target.value,
      [businessTypeLabels, notificationKindLabels],
      "inboxBusinessTypeFallback",
      t
    ) : ""
  ].filter(Boolean).join(" \xB7 ");
}
function stateLabel(state, t) {
  switch (state) {
    case "unread":
      return t("notificationUnread");
    case "read":
      return t("notificationRead");
    case "dismissed":
      return t("notificationDismissed");
    default:
      return state ?? t("unknown");
  }
}
function formatDate(value) {
  if (!value) return "\u2014";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const pad = (part) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}
async function readNotifications(query, signal) {
  const response = await fetch("/api/gea-proof/notifications", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(query),
    signal
  });
  if (!response.ok) throw new Error("GEA_HTTP_" + response.status);
  const result = await response.json();
  if (!result.ok) throw new Error(result.error.code);
  return result;
}
function notificationError(reason) {
  const code = reason instanceof Error ? reason.message : "";
  if (code === "NOTIFICATION_STATE_CONFLICT" || code === "APPROVAL_VERSION_CONFLICT") return "notificationConflict";
  return ["LOGIN_REQUIRED", "GEA_HTTP_401", "NOTIFICATION_UNAUTHENTICATED"].includes(code) ? "loginExpired" : ["GEA_HTTP_403", "NOTIFICATION_TENANT_FORBIDDEN"].includes(code) ? "forbidden" : code === "GEA_REQUEST_TIMEOUT" ? "requestTimeout" : code === "GEA_NETWORK_ERROR" ? "networkError" : "retry";
}

// src/client/desktop-navigation.tsx
var import_react8 = require("react");
var import_jsx_runtime8 = require("react/jsx-runtime");
function createNavigationSelection() {
  let value = null;
  const listeners = /* @__PURE__ */ new Set();
  return {
    getSnapshot: () => value,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    set(next) {
      value = next;
      listeners.forEach((listener) => listener());
    }
  };
}
async function request(action, body = {}, signal) {
  const response = await fetch("/api/gea-proof/navigation/" + action, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal
  });
  if (!response.ok) throw Error("NAVIGATION_REQUEST_FAILED");
  const result = await response.json();
  if (result.ok !== true) throw Error("NAVIGATION_REQUEST_FAILED");
  return result.value;
}
function DesktopNavigation({ t, open, login }) {
  const [view, setView] = (0, import_react8.useState)({ state: "idle" });
  const active = (0, import_react8.useRef)();
  const [revision, setRevision] = (0, import_react8.useState)(0);
  const [busy, setBusy] = (0, import_react8.useState)(false);
  (0, import_react8.useEffect)(() => {
    const controller = new AbortController();
    let timer;
    let identityRevision;
    const consume = (next) => {
      if (controller.signal.aborted) return;
      if (identityRevision !== void 0 && next.identityRevision !== void 0 && identityRevision !== next.identityRevision) {
        active.current?.controller.abort();
        active.current = void 0;
      }
      if (next.identityRevision !== void 0) identityRevision = next.identityRevision;
      if (next.state !== "ready") {
        if (next.state !== "error" && active.current && (next.state !== "idle" || !active.current.done)) {
          active.current.controller.abort();
          active.current = void 0;
        }
        setView(next);
        return;
      }
      if (active.current?.receipt === next.receipt) return;
      active.current?.controller.abort();
      const task = { receipt: next.receipt, controller: new AbortController(), done: false, failed: false };
      active.current = task;
      setView(next);
      void open(next, task.controller.signal).then(async () => {
        if (controller.signal.aborted || task.controller.signal.aborted || active.current !== task) return;
        task.done = true;
        const completed = await request("finish", { receipt: next.receipt, outcome: "visible" }, controller.signal);
        if (!controller.signal.aborted && active.current === task) setView(completed);
      }).catch(() => {
        if (controller.signal.aborted || task.controller.signal.aborted || active.current !== task) return;
        task.failed = true;
        setView({ state: "error", receipt: next.receipt, code: "NAVIGATION_TARGET_UNAVAILABLE" });
      });
    };
    const poll = async () => {
      try {
        consume(await request("poll", {}, controller.signal));
      } catch {
        if (!controller.signal.aborted) setView({ state: "error", code: "NAVIGATION_REQUEST_FAILED" });
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(poll, 1500);
      }
    };
    void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
      active.current?.controller.abort();
      active.current = void 0;
    };
  }, [open, revision]);
  const action = async (dismiss) => {
    if (busy) return;
    setBusy(true);
    try {
      const next = dismiss && view.state === "error" && view.receipt ? await request("finish", { receipt: view.receipt, outcome: "dismissed" }) : await request("retry");
      active.current?.controller.abort();
      active.current = void 0;
      setView(next);
      setRevision((value) => value + 1);
    } catch {
      setView({ state: "error", code: "NAVIGATION_REQUEST_FAILED" });
    } finally {
      setBusy(false);
    }
  };
  if (view.state === "idle" || view.state === "unavailable") return null;
  const code = view.state === "error" ? view.code : "";
  const message = view.state === "login" ? "navigationLogin" : view.state === "ready" ? "navigationOpening" : /EXPIRED|REVOKED/.test(code) ? "navigationExpired" : /FORBIDDEN/.test(code) ? "navigationForbidden" : /UNSUPPORTED|UNAVAILABLE|INCOMPLETE/.test(code) ? "navigationUnavailable" : "navigationFailed";
  return /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { role: view.state === "error" ? "alert" : "status", style: { position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", zIndex: 1e4, padding: "12px 18px", border: "1px solid #cbd5e1", borderRadius: 8, background: "var(--background,#fff)", color: "var(--foreground,#182230)", boxShadow: "0 4px 16px #0002", maxWidth: "80vw" }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { children: t(message) }),
    " ",
    view.state === "login" && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("button", { onClick: login, children: t("navigationLoginAction") }),
    view.state === "error" && /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)(import_jsx_runtime8.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("button", { disabled: busy, onClick: () => void action(false), children: t("retry") }),
      " ",
      view.receipt && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("button", { disabled: busy, onClick: () => void action(true), children: t("close") })
    ] })
  ] });
}

// node_modules/@icon-park/react/es/runtime/index.js
var import_react9 = __toESM(require("react"));
var _excluded = ["size", "strokeWidth", "strokeLinecap", "strokeLinejoin", "theme", "fill", "className", "spin"];
function ownKeys(object2, enumerableOnly) {
  var keys = Object.keys(object2);
  if (Object.getOwnPropertySymbols) {
    var symbols = Object.getOwnPropertySymbols(object2);
    enumerableOnly && (symbols = symbols.filter(function(sym) {
      return Object.getOwnPropertyDescriptor(object2, sym).enumerable;
    })), keys.push.apply(keys, symbols);
  }
  return keys;
}
function _objectSpread(target) {
  for (var i = 1; i < arguments.length; i++) {
    var source = null != arguments[i] ? arguments[i] : {};
    i % 2 ? ownKeys(Object(source), true).forEach(function(key) {
      _defineProperty(target, key, source[key]);
    }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)) : ownKeys(Object(source)).forEach(function(key) {
      Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key));
    });
  }
  return target;
}
function _defineProperty(obj, key, value) {
  if (key in obj) {
    Object.defineProperty(obj, key, { value, enumerable: true, configurable: true, writable: true });
  } else {
    obj[key] = value;
  }
  return obj;
}
function _objectWithoutProperties(source, excluded) {
  if (source == null) return {};
  var target = _objectWithoutPropertiesLoose(source, excluded);
  var key, i;
  if (Object.getOwnPropertySymbols) {
    var sourceSymbolKeys = Object.getOwnPropertySymbols(source);
    for (i = 0; i < sourceSymbolKeys.length; i++) {
      key = sourceSymbolKeys[i];
      if (excluded.indexOf(key) >= 0) continue;
      if (!Object.prototype.propertyIsEnumerable.call(source, key)) continue;
      target[key] = source[key];
    }
  }
  return target;
}
function _objectWithoutPropertiesLoose(source, excluded) {
  if (source == null) return {};
  var target = {};
  var sourceKeys = Object.keys(source);
  var key, i;
  for (i = 0; i < sourceKeys.length; i++) {
    key = sourceKeys[i];
    if (excluded.indexOf(key) >= 0) continue;
    target[key] = source[key];
  }
  return target;
}
var DEFAULT_ICON_CONFIGS = {
  size: "1em",
  strokeWidth: 4,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  rtl: false,
  theme: "outline",
  colors: {
    outline: {
      fill: "#333",
      background: "transparent"
    },
    filled: {
      fill: "#333",
      background: "#FFF"
    },
    twoTone: {
      fill: "#333",
      twoTone: "#2F88FF"
    },
    multiColor: {
      outStrokeColor: "#333",
      outFillColor: "#2F88FF",
      innerStrokeColor: "#FFF",
      innerFillColor: "#43CCF8"
    }
  },
  prefix: "i"
};
function guid() {
  return "icon-" + ((1 + Math.random()) * 4294967296 | 0).toString(16).substring(1);
}
function IconConverter(id, icon, config) {
  var fill = typeof icon.fill === "string" ? [icon.fill] : icon.fill || [];
  var colors = [];
  var theme = icon.theme || config.theme;
  switch (theme) {
    case "outline":
      colors.push(typeof fill[0] === "string" ? fill[0] : "currentColor");
      colors.push("none");
      colors.push(typeof fill[0] === "string" ? fill[0] : "currentColor");
      colors.push("none");
      break;
    case "filled":
      colors.push(typeof fill[0] === "string" ? fill[0] : "currentColor");
      colors.push(typeof fill[0] === "string" ? fill[0] : "currentColor");
      colors.push("#FFF");
      colors.push("#FFF");
      break;
    case "two-tone":
      colors.push(typeof fill[0] === "string" ? fill[0] : "currentColor");
      colors.push(typeof fill[1] === "string" ? fill[1] : config.colors.twoTone.twoTone);
      colors.push(typeof fill[0] === "string" ? fill[0] : "currentColor");
      colors.push(typeof fill[1] === "string" ? fill[1] : config.colors.twoTone.twoTone);
      break;
    case "multi-color":
      colors.push(typeof fill[0] === "string" ? fill[0] : "currentColor");
      colors.push(typeof fill[1] === "string" ? fill[1] : config.colors.multiColor.outFillColor);
      colors.push(typeof fill[2] === "string" ? fill[2] : config.colors.multiColor.innerStrokeColor);
      colors.push(typeof fill[3] === "string" ? fill[3] : config.colors.multiColor.innerFillColor);
      break;
  }
  return {
    size: icon.size || config.size,
    strokeWidth: icon.strokeWidth || config.strokeWidth,
    strokeLinecap: icon.strokeLinecap || config.strokeLinecap,
    strokeLinejoin: icon.strokeLinejoin || config.strokeLinejoin,
    colors,
    id
  };
}
var IconContext = /* @__PURE__ */ (0, import_react9.createContext)(DEFAULT_ICON_CONFIGS);
var IconProvider = IconContext.Provider;
function IconWrapper(name, rtl, render) {
  return function(props) {
    var size = props.size, strokeWidth = props.strokeWidth, strokeLinecap = props.strokeLinecap, strokeLinejoin = props.strokeLinejoin, theme = props.theme, fill = props.fill, className = props.className, spin = props.spin, extra = _objectWithoutProperties(props, _excluded);
    var ICON_CONFIGS = (0, import_react9.useContext)(IconContext);
    var id = (0, import_react9.useMemo)(guid, []);
    var svgProps = IconConverter(id, {
      size,
      strokeWidth,
      strokeLinecap,
      strokeLinejoin,
      theme,
      fill
    }, ICON_CONFIGS);
    var cls = [ICON_CONFIGS.prefix + "-icon"];
    cls.push(ICON_CONFIGS.prefix + "-icon-" + name);
    if (rtl && ICON_CONFIGS.rtl) {
      cls.push(ICON_CONFIGS.prefix + "-icon-rtl");
    }
    if (spin) {
      cls.push(ICON_CONFIGS.prefix + "-icon-spin");
    }
    if (className) {
      cls.push(className);
    }
    return /* @__PURE__ */ import_react9.default.createElement("span", _objectSpread(_objectSpread({}, extra), {}, {
      className: cls.join(" ")
    }), render(svgProps));
  };
}

// node_modules/@icon-park/react/es/icons/Api.js
var import_react10 = __toESM(require("react"));
var Api_default = IconWrapper("api", true, function(props) {
  return /* @__PURE__ */ import_react10.default.createElement("svg", {
    width: props.size,
    height: props.size,
    viewBox: "0 0 48 48",
    fill: "none"
  }, /* @__PURE__ */ import_react10.default.createElement("path", {
    d: "M37 22.0001L34 25.0001L23 14.0001L26 11.0001C27.5 9.50002 33 7.00005 37 11.0001C41 15.0001 38.5 20.5 37 22.0001Z",
    fill: props.colors[1],
    stroke: props.colors[0],
    strokeWidth: props.strokeWidth,
    strokeLinecap: props.strokeLinecap,
    strokeLinejoin: props.strokeLinejoin
  }), /* @__PURE__ */ import_react10.default.createElement("path", {
    d: "M42 6L37 11",
    stroke: props.colors[0],
    strokeWidth: props.strokeWidth,
    strokeLinecap: props.strokeLinecap,
    strokeLinejoin: props.strokeLinejoin
  }), /* @__PURE__ */ import_react10.default.createElement("path", {
    d: "M11 25.9999L14 22.9999L25 33.9999L22 36.9999C20.5 38.5 15 41 11 36.9999C7 32.9999 9.5 27.5 11 25.9999Z",
    fill: props.colors[1],
    stroke: props.colors[0],
    strokeWidth: props.strokeWidth,
    strokeLinecap: props.strokeLinecap,
    strokeLinejoin: props.strokeLinejoin
  }), /* @__PURE__ */ import_react10.default.createElement("path", {
    d: "M23 32L27 28",
    stroke: props.colors[0],
    strokeWidth: props.strokeWidth,
    strokeLinecap: props.strokeLinecap,
    strokeLinejoin: props.strokeLinejoin
  }), /* @__PURE__ */ import_react10.default.createElement("path", {
    d: "M6 42L11 37",
    stroke: props.colors[0],
    strokeWidth: props.strokeWidth,
    strokeLinecap: props.strokeLinecap,
    strokeLinejoin: props.strokeLinejoin
  }), /* @__PURE__ */ import_react10.default.createElement("path", {
    d: "M16 25L20 21",
    stroke: props.colors[0],
    strokeWidth: props.strokeWidth,
    strokeLinecap: props.strokeLinecap,
    strokeLinejoin: props.strokeLinejoin
  }));
});

// node_modules/@icon-park/react/es/icons/Clear.js
var import_react11 = __toESM(require("react"));
var Clear_default = IconWrapper("clear", false, function(props) {
  return /* @__PURE__ */ import_react11.default.createElement("svg", {
    width: props.size,
    height: props.size,
    viewBox: "0 0 48 48",
    fill: "none"
  }, /* @__PURE__ */ import_react11.default.createElement("path", {
    fillRule: "evenodd",
    clipRule: "evenodd",
    d: "M20 5.91406H28V13.9141H43V21.9141H5V13.9141H20V5.91406Z",
    stroke: props.colors[0],
    strokeWidth: props.strokeWidth,
    strokeLinecap: props.strokeLinecap,
    strokeLinejoin: props.strokeLinejoin
  }), /* @__PURE__ */ import_react11.default.createElement("path", {
    d: "M8 40H40V22H8V40Z",
    fill: props.colors[1],
    stroke: props.colors[0],
    strokeWidth: props.strokeWidth,
    strokeLinejoin: props.strokeLinejoin
  }), /* @__PURE__ */ import_react11.default.createElement("path", {
    d: "M16 39.8976V33.9141",
    stroke: props.colors[2],
    strokeWidth: props.strokeWidth,
    strokeLinecap: props.strokeLinecap,
    strokeLinejoin: props.strokeLinejoin
  }), /* @__PURE__ */ import_react11.default.createElement("path", {
    d: "M24 39.8977V33.8977",
    stroke: props.colors[2],
    strokeWidth: props.strokeWidth,
    strokeLinecap: props.strokeLinecap,
    strokeLinejoin: props.strokeLinejoin
  }), /* @__PURE__ */ import_react11.default.createElement("path", {
    d: "M32 39.8976V33.9141",
    stroke: props.colors[2],
    strokeWidth: props.strokeWidth,
    strokeLinecap: props.strokeLinecap,
    strokeLinejoin: props.strokeLinejoin
  }), /* @__PURE__ */ import_react11.default.createElement("path", {
    d: "M12 40H36",
    stroke: props.colors[0],
    strokeWidth: props.strokeWidth,
    strokeLinecap: props.strokeLinecap,
    strokeLinejoin: props.strokeLinejoin
  }));
});

// node_modules/@icon-park/react/es/icons/Close.js
var import_react12 = __toESM(require("react"));
var Close_default = IconWrapper("close", false, function(props) {
  return /* @__PURE__ */ import_react12.default.createElement("svg", {
    width: props.size,
    height: props.size,
    viewBox: "0 0 48 48",
    fill: "none"
  }, /* @__PURE__ */ import_react12.default.createElement("path", {
    d: "M8 8L40 40",
    stroke: props.colors[0],
    strokeWidth: props.strokeWidth,
    strokeLinecap: props.strokeLinecap,
    strokeLinejoin: props.strokeLinejoin
  }), /* @__PURE__ */ import_react12.default.createElement("path", {
    d: "M8 40L40 8",
    stroke: props.colors[0],
    strokeWidth: props.strokeWidth,
    strokeLinecap: props.strokeLinecap,
    strokeLinejoin: props.strokeLinejoin
  }));
});

// node_modules/@icon-park/react/es/icons/Copy.js
var import_react13 = __toESM(require("react"));
var Copy_default = IconWrapper("copy", true, function(props) {
  return /* @__PURE__ */ import_react13.default.createElement("svg", {
    width: props.size,
    height: props.size,
    viewBox: "0 0 48 48",
    fill: "none"
  }, /* @__PURE__ */ import_react13.default.createElement("path", {
    d: "M13 12.4316V7.8125C13 6.2592 14.2592 5 15.8125 5H40.1875C41.7408 5 43 6.2592 43 7.8125V32.1875C43 33.7408 41.7408 35 40.1875 35H35.5163",
    stroke: props.colors[0],
    strokeWidth: props.strokeWidth,
    strokeLinecap: props.strokeLinecap,
    strokeLinejoin: props.strokeLinejoin
  }), /* @__PURE__ */ import_react13.default.createElement("path", {
    d: "M32.1875 13H7.8125C6.2592 13 5 14.2592 5 15.8125V40.1875C5 41.7408 6.2592 43 7.8125 43H32.1875C33.7408 43 35 41.7408 35 40.1875V15.8125C35 14.2592 33.7408 13 32.1875 13Z",
    fill: props.colors[1],
    stroke: props.colors[0],
    strokeWidth: props.strokeWidth,
    strokeLinejoin: props.strokeLinejoin
  }));
});

// node_modules/@icon-park/react/es/icons/Delete.js
var import_react14 = __toESM(require("react"));
var Delete_default = IconWrapper("delete", false, function(props) {
  return /* @__PURE__ */ import_react14.default.createElement("svg", {
    width: props.size,
    height: props.size,
    viewBox: "0 0 48 48",
    fill: "none"
  }, /* @__PURE__ */ import_react14.default.createElement("path", {
    d: "M9 10V44H39V10H9Z",
    fill: props.colors[1],
    stroke: props.colors[0],
    strokeWidth: props.strokeWidth,
    strokeLinejoin: props.strokeLinejoin
  }), /* @__PURE__ */ import_react14.default.createElement("path", {
    d: "M20 20V33",
    stroke: props.colors[2],
    strokeWidth: props.strokeWidth,
    strokeLinecap: props.strokeLinecap,
    strokeLinejoin: props.strokeLinejoin
  }), /* @__PURE__ */ import_react14.default.createElement("path", {
    d: "M28 20V33",
    stroke: props.colors[2],
    strokeWidth: props.strokeWidth,
    strokeLinecap: props.strokeLinecap,
    strokeLinejoin: props.strokeLinejoin
  }), /* @__PURE__ */ import_react14.default.createElement("path", {
    d: "M4 10H44",
    stroke: props.colors[0],
    strokeWidth: props.strokeWidth,
    strokeLinecap: props.strokeLinecap,
    strokeLinejoin: props.strokeLinejoin
  }), /* @__PURE__ */ import_react14.default.createElement("path", {
    d: "M16 10L19.289 4H28.7771L32 10H16Z",
    fill: props.colors[1],
    stroke: props.colors[0],
    strokeWidth: props.strokeWidth,
    strokeLinejoin: props.strokeLinejoin
  }));
});

// node_modules/@icon-park/react/es/icons/Refresh.js
var import_react15 = __toESM(require("react"));
var Refresh_default = IconWrapper("refresh", true, function(props) {
  return /* @__PURE__ */ import_react15.default.createElement("svg", {
    width: props.size,
    height: props.size,
    viewBox: "0 0 48 48",
    fill: "none"
  }, /* @__PURE__ */ import_react15.default.createElement("path", {
    d: "M42 8V24",
    stroke: props.colors[0],
    strokeWidth: props.strokeWidth,
    strokeLinecap: props.strokeLinecap,
    strokeLinejoin: props.strokeLinejoin
  }), /* @__PURE__ */ import_react15.default.createElement("path", {
    d: "M6 24L6 40",
    stroke: props.colors[0],
    strokeWidth: props.strokeWidth,
    strokeLinecap: props.strokeLinecap,
    strokeLinejoin: props.strokeLinejoin
  }), /* @__PURE__ */ import_react15.default.createElement("path", {
    d: "M42 24C42 14.0589 33.9411 6 24 6C18.9145 6 14.3216 8.10896 11.0481 11.5M6 24C6 33.9411 14.0589 42 24 42C28.8556 42 33.2622 40.0774 36.5 36.9519",
    stroke: props.colors[0],
    strokeWidth: props.strokeWidth,
    strokeLinecap: props.strokeLinecap,
    strokeLinejoin: props.strokeLinejoin
  }));
});

// node_modules/@icon-park/react/es/icons/ReplayMusic.js
var import_react16 = __toESM(require("react"));
var ReplayMusic_default = IconWrapper("replay-music", true, function(props) {
  return /* @__PURE__ */ import_react16.default.createElement("svg", {
    width: props.size,
    height: props.size,
    viewBox: "0 0 48 48",
    fill: "none"
  }, /* @__PURE__ */ import_react16.default.createElement("path", {
    d: "M21 24V18L26 21L31 24L26 27L21 30V24Z",
    fill: props.colors[1],
    stroke: props.colors[0],
    strokeWidth: props.strokeWidth,
    strokeLinejoin: props.strokeLinejoin
  }), /* @__PURE__ */ import_react16.default.createElement("path", {
    d: "M11.2721 36.7279C14.5294 39.9853 19.0294 42 24 42C33.9411 42 42 33.9411 42 24C42 14.0589 33.9411 6 24 6C19.0294 6 14.5294 8.01472 11.2721 11.2721C9.6141 12.9301 6 17 6 17",
    stroke: props.colors[0],
    strokeWidth: props.strokeWidth,
    strokeLinecap: props.strokeLinecap,
    strokeLinejoin: props.strokeLinejoin
  }), /* @__PURE__ */ import_react16.default.createElement("path", {
    d: "M6 9V17H14",
    stroke: props.colors[0],
    strokeWidth: props.strokeWidth,
    strokeLinecap: props.strokeLinecap,
    strokeLinejoin: props.strokeLinejoin
  }));
});

// node_modules/@icon-park/react/es/icons/Search.js
var import_react17 = __toESM(require("react"));
var Search_default = IconWrapper("search", true, function(props) {
  return /* @__PURE__ */ import_react17.default.createElement("svg", {
    width: props.size,
    height: props.size,
    viewBox: "0 0 48 48",
    fill: "none"
  }, /* @__PURE__ */ import_react17.default.createElement("path", {
    d: "M21 38C30.3888 38 38 30.3888 38 21C38 11.6112 30.3888 4 21 4C11.6112 4 4 11.6112 4 21C4 30.3888 11.6112 38 21 38Z",
    fill: props.colors[1],
    stroke: props.colors[0],
    strokeWidth: props.strokeWidth,
    strokeLinejoin: props.strokeLinejoin
  }), /* @__PURE__ */ import_react17.default.createElement("path", {
    d: "M26.657 14.3431C25.2093 12.8954 23.2093 12 21.0001 12C18.791 12 16.791 12.8954 15.3433 14.3431",
    stroke: props.colors[2],
    strokeWidth: props.strokeWidth,
    strokeLinecap: props.strokeLinecap,
    strokeLinejoin: props.strokeLinejoin
  }), /* @__PURE__ */ import_react17.default.createElement("path", {
    d: "M33.2216 33.2217L41.7069 41.707",
    stroke: props.colors[0],
    strokeWidth: props.strokeWidth,
    strokeLinecap: props.strokeLinecap,
    strokeLinejoin: props.strokeLinejoin
  }));
});

// node_modules/@icon-park/react/es/icons/Sync.js
var import_react18 = __toESM(require("react"));
var Sync_default = IconWrapper("sync", true, function(props) {
  return /* @__PURE__ */ import_react18.default.createElement("svg", {
    width: props.size,
    height: props.size,
    viewBox: "0 0 48 48",
    fill: "none"
  }, /* @__PURE__ */ import_react18.default.createElement("path", {
    d: "M30 7.979L19 8.00006V18.0001H4V32H20.9995",
    stroke: props.colors[0],
    strokeWidth: props.strokeWidth,
    strokeLinecap: props.strokeLinecap,
    strokeLinejoin: props.strokeLinejoin
  }), /* @__PURE__ */ import_react18.default.createElement("path", {
    d: "M20 42L31 41.9789V31.5789H44V18H30.3448",
    stroke: props.colors[0],
    strokeWidth: props.strokeWidth,
    strokeLinecap: props.strokeLinecap,
    strokeLinejoin: props.strokeLinejoin
  }));
});

// src/workbench/api-log-center.tsx
var import_react20 = require("react");
var import_jsx_runtime9 = require("react/jsx-runtime");
var methodClass = (method) => method === "GET" ? "is-get" : method === "POST" ? "is-post" : "";
var displayTime = (value) => new Intl.DateTimeFormat("zh-CN", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false
}).format(new Date(value));
var pretty = (value) => value == null ? "\u65E0" : typeof value === "string" ? value : JSON.stringify(value, null, 2);
var replayLabel = (entry) => {
  if ("replayAvailable" in entry && !entry.replayAvailable) {
    if (entry.replayPolicy === "blocked") return "\u7981\u6B62\u91CD\u53D1";
    return "\u5F53\u524D\u4E0D\u53EF\u91CD\u53D1";
  }
  if (entry.replayPolicy === "safe") return "\u53EF\u76F4\u63A5\u91CD\u53D1";
  if (entry.replayPolicy === "idempotent") return "\u786E\u8BA4\u540E\u5E42\u7B49\u91CD\u53D1";
  return "\u7981\u6B62\u91CD\u53D1";
};
var replayNote = (record2, catalog) => {
  if (record2.replayAvailable)
    return catalog?.replayNote ?? "\u8BE5\u8BF7\u6C42\u53EF\u5728\u5F53\u524D\u8EAB\u4EFD\u5185\u91CD\u53D1";
  if (record2.replayPolicy === "blocked")
    return catalog?.replayNote ?? "\u8BE5\u8C03\u7528\u672A\u767B\u8BB0\uFF0C\u4E0D\u80FD\u91CD\u53D1";
  return "\u5F53\u524D\u8EAB\u4EFD\u3001\u73AF\u5883\u6216\u539F\u8BF7\u6C42\u6761\u4EF6\u5DF2\u5931\u6548\uFF0C\u4E0D\u80FD\u91CD\u53D1";
};
function Outcome({ record: record2 }) {
  const label = record2.outcome === "pending" ? "\u8FDB\u884C\u4E2D" : record2.outcome === "success" ? "\u6210\u529F" : "\u5931\u8D25";
  return /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { className: `gea-api-outcome is-${record2.outcome}`, children: label });
}
function CodeBlock({
  title,
  value,
  onCopy
}) {
  return /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("section", { className: "gea-api-code-section", children: [
    /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "gea-api-code-heading", children: [
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("h3", { children: title }),
      /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(
        "button",
        {
          type: "button",
          onClick: () => onCopy(value),
          title: `\u590D\u5236${title}`,
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(Copy_default, { size: 15 }),
            "\u590D\u5236"
          ]
        }
      )
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("pre", { tabIndex: 0, children: pretty(value) })
  ] });
}
function ApiLogCenter({ environment, onClose, request: request3 }) {
  const [snapshot, setSnapshot] = (0, import_react20.useState)();
  const [selectedCatalog, setSelectedCatalog] = (0, import_react20.useState)("all");
  const [selectedRecord, setSelectedRecord] = (0, import_react20.useState)();
  const [search, setSearch] = (0, import_react20.useState)("");
  const [outcomeFilter, setOutcomeFilter] = (0, import_react20.useState)("all");
  const [live, setLive] = (0, import_react20.useState)(true);
  const [loading, setLoading] = (0, import_react20.useState)(true);
  const [error, setError] = (0, import_react20.useState)("");
  const [busyReplay, setBusyReplay] = (0, import_react20.useState)("");
  const [confirmReplay, setConfirmReplay] = (0, import_react20.useState)("");
  const [confirmClear, setConfirmClear] = (0, import_react20.useState)(false);
  const [copied, setCopied] = (0, import_react20.useState)("");
  const refreshing = (0, import_react20.useRef)(false);
  const centerRef = (0, import_react20.useRef)(null);
  const detailRef = (0, import_react20.useRef)(null);
  (0, import_react20.useEffect)(() => {
    centerRef.current?.focus();
  }, []);
  const refresh = (0, import_react20.useCallback)(
    async (signal, silent = false) => {
      if (refreshing.current) return;
      refreshing.current = true;
      if (!silent) setLoading(true);
      try {
        const next = await request3(
          "api-log/snapshot",
          {},
          signal
        );
        setSnapshot(next);
        setError("");
        setSelectedRecord(
          (current) => current && next.records.some((record2) => record2.id === current) ? current : next.records[0]?.id
        );
      } catch (cause) {
        if (!signal?.aborted)
          setError(cause instanceof Error ? cause.message : "\u63A5\u53E3\u65E5\u5FD7\u52A0\u8F7D\u5931\u8D25");
      } finally {
        refreshing.current = false;
        if (!silent) setLoading(false);
      }
    },
    [request3]
  );
  (0, import_react20.useEffect)(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    const timer = live ? window.setInterval(() => void refresh(controller.signal, true), 1500) : void 0;
    return () => {
      controller.abort();
      if (timer !== void 0) window.clearInterval(timer);
    };
  }, [live, refresh]);
  const counts = (0, import_react20.useMemo)(() => {
    const result = /* @__PURE__ */ new Map();
    for (const record2 of snapshot?.records ?? [])
      if (record2.catalogId)
        result.set(record2.catalogId, (result.get(record2.catalogId) ?? 0) + 1);
    return result;
  }, [snapshot]);
  const groups = (0, import_react20.useMemo)(() => {
    const result = /* @__PURE__ */ new Map();
    for (const entry of snapshot?.catalog ?? []) {
      const values = result.get(entry.group) ?? [];
      values.push(entry);
      result.set(entry.group, values);
    }
    return [...result];
  }, [snapshot]);
  const filteredRecords = (0, import_react20.useMemo)(() => {
    const keyword = search.trim().toLowerCase();
    return (snapshot?.records ?? []).filter((record2) => {
      if (selectedCatalog !== "all" && record2.catalogId !== selectedCatalog)
        return false;
      if (outcomeFilter === "error" && record2.outcome !== "error") return false;
      if (!keyword) return true;
      return [
        record2.catalogName,
        record2.group,
        record2.request.method,
        record2.request.url,
        record2.response?.status,
        record2.error?.message
      ].join(" ").toLowerCase().includes(keyword);
    });
  }, [outcomeFilter, search, selectedCatalog, snapshot]);
  const activeRecord = filteredRecords.find((record2) => record2.id === selectedRecord) ?? filteredRecords[0];
  const activeCatalog = snapshot?.catalog.find(
    (entry) => entry.id === activeRecord?.catalogId
  );
  const selectedCatalogEntry = snapshot?.catalog.find(
    (entry) => entry.id === selectedCatalog
  );
  const copy3 = (0, import_react20.useCallback)(async (value) => {
    try {
      await navigator.clipboard.writeText(pretty(value));
      setCopied("\u5DF2\u590D\u5236");
      window.setTimeout(() => setCopied(""), 1200);
    } catch {
      setCopied("\u590D\u5236\u5931\u8D25");
    }
  }, []);
  const replay = (0, import_react20.useCallback)(
    async (record2) => {
      setBusyReplay(record2.id);
      setError("");
      try {
        const result = await request3("api-log/replay", {
          id: record2.id,
          confirmed: record2.replayPolicy === "idempotent"
        });
        setConfirmReplay("");
        await refresh(void 0, true);
        setSelectedRecord(result.recordId);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "\u91CD\u53D1\u5931\u8D25");
      } finally {
        setBusyReplay("");
      }
    },
    [refresh, request3]
  );
  const clear = (0, import_react20.useCallback)(async () => {
    setLoading(true);
    try {
      const next = await request3("api-log/clear", {});
      setSnapshot(next);
      setSelectedRecord(void 0);
      setConfirmClear(false);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "\u6E05\u7A7A\u5931\u8D25");
    } finally {
      setLoading(false);
    }
  }, [request3]);
  const selectRecord = (0, import_react20.useCallback)((id) => {
    setSelectedRecord(id);
    if (!window.matchMedia("(max-width: 680px)").matches) return;
    window.requestAnimationFrame(() => {
      const reducedMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)"
      ).matches;
      detailRef.current?.scrollIntoView({
        behavior: reducedMotion ? "auto" : "smooth",
        block: "start"
      });
      detailRef.current?.focus({ preventScroll: true });
    });
  }, []);
  return /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("main", { ref: centerRef, className: "gea-api-log-center", tabIndex: -1, children: [
    /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("header", { className: "gea-api-log-header", children: [
      /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "gea-api-log-title", children: [
        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { className: "gea-api-log-mark", "aria-hidden": "true", children: /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(Api_default, { size: 21 }) }),
        /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("h1", { children: "\u63A5\u53E3\u65E5\u5FD7\u4E2D\u5FC3" }),
          /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("p", { children: [
            environment === "production" ? "\u751F\u4EA7\u73AF\u5883" : "\u6D4B\u8BD5\u73AF\u5883",
            " \xB7 Host \u771F\u5B9E\u4E0A\u6E38\u8C03\u7528 \xB7 \u6700\u591A\u4FDD\u7559 ",
            snapshot?.limit ?? 500,
            " \u6761"
          ] })
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "gea-api-log-actions", children: [
        /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "gea-api-search", children: [
          /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("label", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(Search_default, { size: 16 }),
            /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { className: "sr-only", children: "\u641C\u7D22\u8C03\u7528\u8BB0\u5F55" }),
            /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
              "input",
              {
                value: search,
                onChange: (event) => setSearch(event.target.value),
                placeholder: "\u641C\u7D22\u63A5\u53E3\u3001\u5730\u5740\u3001\u72B6\u6001"
              }
            )
          ] }),
          search && /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
            "button",
            {
              type: "button",
              onClick: () => setSearch(""),
              title: "\u6E05\u7A7A\u641C\u7D22",
              "aria-label": "\u6E05\u7A7A\u641C\u7D22",
              children: /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(Clear_default, { size: 14 })
            }
          )
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(
          "button",
          {
            type: "button",
            className: live ? "is-active" : "",
            "aria-pressed": live,
            onClick: () => setLive((value) => !value),
            title: live ? "\u6682\u505C\u5B9E\u65F6\u5237\u65B0" : "\u5F00\u542F\u5B9E\u65F6\u5237\u65B0",
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(Sync_default, { size: 16, spin: live && loading }),
              live ? "\u5B9E\u65F6" : "\u5DF2\u6682\u505C"
            ]
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(
          "button",
          {
            type: "button",
            onClick: () => void refresh(),
            disabled: loading,
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(Refresh_default, { size: 16, spin: loading }),
              "\u5237\u65B0"
            ]
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(
          "button",
          {
            type: "button",
            onClick: () => setConfirmClear(true),
            disabled: !snapshot?.records.length,
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(Delete_default, { size: 16 }),
              "\u6E05\u7A7A"
            ]
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("button", { type: "button", className: "gea-api-close", onClick: onClose, children: [
          /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(Close_default, { size: 17 }),
          "\u8FD4\u56DE\u5DE5\u4F5C\u53F0"
        ] })
      ] })
    ] }),
    confirmClear && /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "gea-api-inline-confirm", role: "alert", children: [
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { children: "\u53EA\u6E05\u7A7A\u5F53\u524D\u8FDB\u7A0B\u5185\u7684\u8131\u654F\u8BB0\u5F55\uFF0C\u4E0D\u5F71\u54CD\u63A5\u53E3\u76EE\u5F55\u548C\u4E1A\u52A1\u6570\u636E\u3002" }),
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("button", { type: "button", onClick: () => void clear(), children: "\u786E\u8BA4\u6E05\u7A7A" }),
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("button", { type: "button", onClick: () => setConfirmClear(false), children: "\u53D6\u6D88" })
    ] }),
    error && /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("div", { className: "gea-api-error", role: "alert", children: error }),
    /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "gea-api-layout", children: [
      /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("nav", { className: "gea-api-catalog", "aria-label": "\u63A5\u53E3\u76EE\u5F55", children: [
        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("div", { className: "gea-api-pane-heading", children: /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("h2", { children: "\u63A5\u53E3\u76EE\u5F55" }),
          /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("span", { children: [
            snapshot?.catalog.length ?? 0,
            " \u4E2A\u5DF2\u767B\u8BB0\u63A5\u53E3"
          ] })
        ] }) }),
        /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(
          "button",
          {
            type: "button",
            className: `gea-api-catalog-item${selectedCatalog === "all" ? " is-selected" : ""}`,
            onClick: () => setSelectedCatalog("all"),
            "aria-pressed": selectedCatalog === "all",
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { className: "gea-api-method", children: "ALL" }),
              /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { children: "\u5168\u90E8\u8C03\u7528" }),
              /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("strong", { children: snapshot?.records.length ?? 0 })
            ]
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("div", { className: "gea-api-catalog-scroll", children: groups.map(([group, entries2]) => /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("section", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("h3", { children: group }),
          entries2.map((entry) => /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(
            "button",
            {
              type: "button",
              className: `gea-api-catalog-item${selectedCatalog === entry.id ? " is-selected" : ""}`,
              onClick: () => setSelectedCatalog(entry.id),
              "aria-pressed": selectedCatalog === entry.id,
              title: `${entry.description} ${entry.replayNote}`,
              children: [
                /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
                  "span",
                  {
                    className: `gea-api-method ${methodClass(entry.method)}`,
                    children: entry.method
                  }
                ),
                /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { children: entry.name }),
                /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("strong", { children: counts.get(entry.id) ?? 0 })
              ]
            },
            entry.id
          ))
        ] }, group)) })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("section", { className: "gea-api-call-list", "aria-label": "\u8C03\u7528\u8BB0\u5F55", children: [
        /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "gea-api-pane-heading", children: [
          /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("h2", { children: "\u8C03\u7528\u8BB0\u5F55" }),
            /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("span", { children: [
              filteredRecords.length,
              " \u6761\u5339\u914D\u8BB0\u5F55"
            ] })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "gea-api-filter-tabs", "aria-label": "\u72B6\u6001\u7B5B\u9009", children: [
            /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
              "button",
              {
                type: "button",
                className: outcomeFilter === "all" ? "is-active" : "",
                onClick: () => setOutcomeFilter("all"),
                "aria-pressed": outcomeFilter === "all",
                children: "\u5168\u90E8"
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
              "button",
              {
                type: "button",
                className: outcomeFilter === "error" ? "is-active" : "",
                onClick: () => setOutcomeFilter("error"),
                "aria-pressed": outcomeFilter === "error",
                children: "\u5931\u8D25"
              }
            )
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("div", { className: "gea-api-call-scroll", children: loading && !snapshot ? /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("div", { className: "gea-api-empty", role: "status", children: "\u6B63\u5728\u52A0\u8F7D\u63A5\u53E3\u8C03\u7528\u2026" }) : filteredRecords.length ? filteredRecords.map((record2) => /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(
          "button",
          {
            type: "button",
            className: `gea-api-call-row${activeRecord?.id === record2.id ? " is-selected" : ""}`,
            onClick: () => selectRecord(record2.id),
            "aria-pressed": activeRecord?.id === record2.id,
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { className: "gea-api-call-time", children: displayTime(record2.startedAt) }),
              /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
                "span",
                {
                  className: `gea-api-method ${methodClass(record2.request.method)}`,
                  children: record2.request.method
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("span", { className: "gea-api-call-main", children: [
                /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("strong", { children: record2.catalogName }),
                /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("small", { children: record2.request.path })
              ] }),
              record2.replayedFrom && /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { className: "gea-api-replayed", children: "\u91CD\u53D1" }),
              /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { className: "gea-api-call-duration", children: record2.durationMs == null ? "\u2014" : `${record2.durationMs} ms` }),
              /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(Outcome, { record: record2 })
            ]
          },
          record2.id
        )) : /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "gea-api-empty", children: [
          /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(Api_default, { size: 34 }),
          /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("strong", { children: snapshot?.records.length ? "\u6CA1\u6709\u5339\u914D\u7684\u8C03\u7528" : "\u8FD8\u6CA1\u6709\u63A5\u53E3\u8C03\u7528" }),
          /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { children: snapshot?.records.length ? "\u8C03\u6574\u63A5\u53E3\u6216\u641C\u7D22\u6761\u4EF6" : "\u4F7F\u7528\u5DE5\u4F5C\u53F0\u540E\uFF0C\u8FD9\u91CC\u4F1A\u81EA\u52A8\u51FA\u73B0\u771F\u5B9E\u4E0A\u6E38\u8BB0\u5F55" })
        ] }) })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
        "aside",
        {
          ref: detailRef,
          className: "gea-api-detail",
          "aria-label": "\u8C03\u7528\u8BE6\u60C5",
          tabIndex: -1,
          children: activeRecord ? /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(import_jsx_runtime9.Fragment, { children: [
            /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "gea-api-detail-heading", children: [
              /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { children: [
                /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { className: "gea-api-detail-group", children: activeRecord.group }),
                /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("h2", { children: activeRecord.catalogName }),
                /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("code", { children: activeRecord.request.path })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(Outcome, { record: activeRecord })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("dl", { className: "gea-api-facts", children: [
              /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { children: [
                /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("dt", { children: "\u65B9\u6CD5" }),
                /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("dd", { children: activeRecord.request.method })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { children: [
                /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("dt", { children: "\u54CD\u5E94" }),
                /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("dd", { children: activeRecord.response?.status ?? "\u2014" })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { children: [
                /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("dt", { children: "\u8017\u65F6" }),
                /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("dd", { children: activeRecord.durationMs == null ? "\u2014" : `${activeRecord.durationMs} ms` })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { children: [
                /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("dt", { children: "\u65F6\u95F4" }),
                /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("dd", { children: new Date(activeRecord.startedAt).toLocaleString("zh-CN", {
                  hour12: false
                }) })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { children: [
                /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("dt", { children: "\u8BB0\u5F55\u73AF\u5883" }),
                /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("dd", { children: activeRecord.environment === "production" ? "\u751F\u4EA7\u73AF\u5883" : "\u6D4B\u8BD5\u73AF\u5883" })
              ] }),
              activeRecord.request.headers["x-request-id"] && /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { children: [
                /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("dt", { children: "\u8BF7\u6C42 ID" }),
                /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("dd", { children: activeRecord.request.headers["x-request-id"] })
              ] }),
              activeRecord.request.headers["idempotency-key"] && /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { children: [
                /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("dt", { children: "\u5E42\u7B49\u952E" }),
                /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("dd", { children: activeRecord.request.headers["idempotency-key"] })
              ] })
            ] }),
            activeCatalog && /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("details", { className: "gea-api-contract", children: [
              /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("summary", { children: "\u67E5\u770B\u63A5\u53E3\u5B9A\u4E49\u4E0E\u8BF7\u6C42\u5B57\u6BB5" }),
              /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("p", { children: activeCatalog.description }),
              activeCatalog.requestFields.length ? /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("div", { className: "gea-api-field-list", children: activeCatalog.requestFields.map((field) => /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("code", { children: field }, field)) }) : /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("p", { children: "\u65E0\u4E1A\u52A1\u8BF7\u6C42\u5B57\u6BB5" })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("section", { className: "gea-api-replay-panel", children: [
              /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { children: [
                /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("strong", { children: replayLabel(activeRecord) }),
                /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { children: replayNote(activeRecord, activeCatalog) })
              ] }),
              activeRecord.replayAvailable && activeRecord.replayPolicy === "safe" && /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(
                "button",
                {
                  type: "button",
                  onClick: () => void replay(activeRecord),
                  disabled: busyReplay === activeRecord.id,
                  children: [
                    /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(ReplayMusic_default, { size: 16 }),
                    busyReplay === activeRecord.id ? "\u6B63\u5728\u91CD\u53D1" : "\u91CD\u53D1\u8BF7\u6C42"
                  ]
                }
              ),
              activeRecord.replayAvailable && activeRecord.replayPolicy === "idempotent" && confirmReplay !== activeRecord.id && /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(
                "button",
                {
                  type: "button",
                  className: "is-caution",
                  onClick: () => setConfirmReplay(activeRecord.id),
                  children: [
                    /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(ReplayMusic_default, { size: 16 }),
                    "\u51C6\u5907\u5E42\u7B49\u91CD\u53D1"
                  ]
                }
              )
            ] }),
            confirmReplay === activeRecord.id && /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "gea-api-write-confirm", role: "alert", children: [
              /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("strong", { children: "\u786E\u8BA4\u91CD\u53D1\u8FD9\u6B21\u5199\u8BF7\u6C42\uFF1F" }),
              /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { children: "\u7CFB\u7EDF\u4F1A\u590D\u7528\u539F\u8BF7\u6C42\u4F53\u3001\u8BF7\u6C42 ID \u548C\u5E42\u7B49\u952E\uFF0C\u4E0D\u4F1A\u521B\u5EFA\u65B0\u7684\u64CD\u4F5C\u610F\u56FE\u3002" }),
              /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { children: [
                /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
                  "button",
                  {
                    type: "button",
                    onClick: () => void replay(activeRecord),
                    disabled: busyReplay === activeRecord.id,
                    children: busyReplay === activeRecord.id ? "\u6B63\u5728\u91CD\u53D1" : "\u786E\u8BA4\u6309\u539F\u5E42\u7B49\u952E\u91CD\u53D1"
                  }
                ),
                /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("button", { type: "button", onClick: () => setConfirmReplay(""), children: "\u53D6\u6D88" })
              ] })
            ] }),
            activeRecord.replayedFrom && /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("p", { className: "gea-api-origin", children: [
              "\u7531\u8BB0\u5F55 ",
              activeRecord.replayedFrom.slice(0, 8),
              "\u2026 \u91CD\u53D1\u4EA7\u751F"
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
              CodeBlock,
              {
                title: "\u8BF7\u6C42\u5730\u5740",
                value: activeRecord.request.url,
                onCopy: copy3
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
              CodeBlock,
              {
                title: "\u8BF7\u6C42\u5934",
                value: activeRecord.request.headers,
                onCopy: copy3
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
              CodeBlock,
              {
                title: "\u8BF7\u6C42\u6B63\u6587",
                value: activeRecord.request.body,
                onCopy: copy3
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
              CodeBlock,
              {
                title: "\u54CD\u5E94\u5934",
                value: activeRecord.response?.headers ?? null,
                onCopy: copy3
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
              CodeBlock,
              {
                title: "\u54CD\u5E94\u6B63\u6587",
                value: activeRecord.response?.body ?? activeRecord.error ?? null,
                onCopy: copy3
              }
            )
          ] }) : selectedCatalogEntry ? /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(import_jsx_runtime9.Fragment, { children: [
            /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "gea-api-detail-heading", children: [
              /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { children: [
                /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { className: "gea-api-detail-group", children: selectedCatalogEntry.group }),
                /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("h2", { children: selectedCatalogEntry.name }),
                /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("code", { children: selectedCatalogEntry.path })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
                "span",
                {
                  className: `gea-api-method ${methodClass(selectedCatalogEntry.method)}`,
                  children: selectedCatalogEntry.method
                }
              )
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("section", { className: "gea-api-definition", children: [
              /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("h3", { children: "\u63A5\u53E3\u8BF4\u660E" }),
              /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("p", { children: selectedCatalogEntry.description })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("section", { className: "gea-api-definition", children: [
              /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("h3", { children: "\u8BF7\u6C42\u5B57\u6BB5" }),
              selectedCatalogEntry.requestFields.length ? /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("div", { className: "gea-api-field-list", children: selectedCatalogEntry.requestFields.map((field) => /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("code", { children: field }, field)) }) : /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("p", { children: "\u65E0\u4E1A\u52A1\u8BF7\u6C42\u5B57\u6BB5" })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("section", { className: "gea-api-definition", children: [
              /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("h3", { children: replayLabel(selectedCatalogEntry) }),
              /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("p", { children: selectedCatalogEntry.replayNote })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "gea-api-empty is-compact", children: [
              /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(Api_default, { size: 30 }),
              /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("strong", { children: "\u5F53\u524D\u7B5B\u9009\u4E0B\u8FD8\u6CA1\u6709\u8C03\u7528" }),
              /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { children: "\u4F7F\u7528\u5BF9\u5E94\u4E1A\u52A1\u80FD\u529B\u540E\uFF0C\u8FD9\u91CC\u4F1A\u51FA\u73B0\u771F\u5B9E\u8BF7\u6C42\u548C\u54CD\u5E94" })
            ] })
          ] }) : /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "gea-api-empty", children: [
            /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(Api_default, { size: 34 }),
            /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("strong", { children: "\u9009\u62E9\u63A5\u53E3\u6216\u8C03\u7528\u8BB0\u5F55" }),
            /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { children: "\u8FD9\u91CC\u4F1A\u663E\u793A\u63A5\u53E3\u5B9A\u4E49\u3001\u8131\u654F\u8BF7\u6C42\u3001\u54CD\u5E94\u548C\u91CD\u53D1\u89C4\u5219" })
          ] })
        }
      )
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("div", { className: "gea-api-copy-status", "aria-live": "polite", children: copied })
  ] });
}

// src/client/native-pages.css
var native_pages_default = '/* Existing Inbox and API Log styles, scoped to their native pages. */\n.gea-inbox-quick-action{\n  display: grid;\n  width: 28px;\n  height: 28px;\n  place-items: center;\n  padding: 0;\n  border: 0;\n  border-radius: 6px;\n  background: transparent;\n  color: var(--workbench-muted, #687282);\n  cursor: pointer;\n}\n.gea-inbox-quick-action:hover,\n.gea-inbox-quick-action[aria-current="page"]{\n  background: var(--workbench-brand-soft, #fff0f2);\n  color: var(--workbench-brand, #df1732);\n}\n.gea-inbox{ --inbox-brand: var(--workbench-brand); --inbox-muted: var(--workbench-muted); --inbox-border: var(--workbench-border); --inbox-panel: var(--workbench-surface); --inbox-bg: var(--workbench-page); height: 100%; overflow: auto; color: var(--workbench-text); background: var(--inbox-bg); font: var(--workbench-font-size)/1.5 var(--workbench-font-family); }\n.gea-inbox *,\n.gea-inbox *::before,\n.gea-inbox *::after{ box-sizing: border-box; }\n.gea-inbox-header,\n.gea-inbox-toolbar{ display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 16px 24px; background: var(--inbox-panel); border-bottom: 1px solid var(--inbox-border); }\n.gea-inbox-heading{ display: flex; align-items: center; gap: 24px; }\n.gea-inbox h1{ margin: 0; font-size: 18px; font-weight: 600; }\n.gea-inbox-unread{ color: var(--inbox-muted); font-size: 13px; }\n.gea-inbox button,\n.gea-inbox select{ font: inherit; color: inherit; border: 1px solid var(--inbox-border); border-radius: 4px; background: var(--inbox-panel); padding: 7px 12px; cursor: pointer; }\n.gea-inbox button:hover:not(:disabled){ background: var(--inbox-bg); }\n.gea-inbox button:disabled{ opacity: .5; cursor: default; }\n.gea-inbox :is(button, select):focus-visible{ outline: 2px solid var(--inbox-brand); outline-offset: 2px; }\n.gea-inbox ::selection{ background: #fbd4d4; color: #601010; }\n.gea-inbox-toolbar{ padding-block: 12px; flex-wrap: wrap; }\n.gea-inbox-filter{ display: flex; align-items: center; gap: 12px; }\n.gea-inbox-filter select{ min-width: 120px; background: var(--inbox-bg); }\n.gea-inbox-hint,\n.gea-inbox-provenance{ color: var(--inbox-muted); font-size: 12px; }\n.gea-inbox-content{ max-width: 1440px; margin: auto; padding: 16px 24px; }\n.gea-inbox-table-scroll{ overflow-x: auto; }\n.gea-inbox-loading-row td{ height: 420px; vertical-align: top; color: var(--inbox-muted); }\n.gea-inbox-placeholder{ height: 340px; background: repeating-linear-gradient(to bottom, var(--inbox-border) 0 1px, transparent 1px 52px); }\n.gea-inbox-detail-loading{ height: 24px; color: var(--inbox-muted); font-size: 12px; }\n.gea-inbox table{ border-collapse: collapse; width: 100%; min-width: 900px; table-layout: fixed; }\n.gea-inbox th,\n.gea-inbox td{ padding: 14px 16px; text-align: left; border-bottom: 1px solid var(--inbox-border); line-height: 1.6; overflow-wrap: anywhere; }\n.gea-inbox th{ font-size: 13px; font-weight: 600; }\n.gea-inbox th:nth-child(1){ width: 4%; }\n.gea-inbox th:nth-child(2){ width: 14%; }\n.gea-inbox th:nth-child(3){ width: 25%; }\n.gea-inbox th:nth-child(4){ width: 28%; }\n.gea-inbox th:nth-child(5){ width: 18%; }\n.gea-inbox th:nth-child(6){ width: 11%; }\n.gea-inbox-select-col{ text-align: center !important; }\n.gea-inbox tbody tr{ background: var(--inbox-panel); cursor: pointer; }\n.gea-inbox tbody tr:hover{ background: light-dark(#fff7f7, #302629); }\n.gea-inbox .gea-inbox-subject{ text-align: left; padding: 0; border: 0; background: transparent; line-height: 1.6; font-size: 14px; font-weight: 400; }\n.gea-inbox tr.is-unread .gea-inbox-subject{ font-weight: 500; }\n.gea-inbox-summary{ display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; color: var(--inbox-muted); }\n.gea-inbox-kind,\n.gea-inbox-status{ display: inline-block; font-size: 12px; line-height: 1.6; padding: 2px 7px; border-radius: 3px; background: var(--inbox-bg); color: var(--inbox-muted); }\n.gea-inbox-kind,\n.gea-inbox-status.is-unread{ background: light-dark(#fdecec, #492525); color: light-dark(#bd1515, #ffabab); }\n.gea-inbox-provenance summary{ cursor: pointer; }\n.gea-inbox-date{ font-variant-numeric: tabular-nums; font-size: 13px; }\n.gea-inbox-pagination{ display: flex; align-items: center; justify-content: space-between; gap: 12px; padding-block: 16px; color: var(--inbox-muted); }\n.gea-inbox-pagination > div{ display: flex; gap: 8px; }\n.gea-inbox-empty{ text-align: center; padding: 48px 16px; color: var(--inbox-muted); background: var(--inbox-panel); margin: 0; }\n.gea-inbox-header-actions{ display: flex; gap: 8px; align-items: center; }\n.gea-inbox-action{ display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin: 0 0 18px; padding: 10px 12px; border: 1px solid var(--inbox-border); border-radius: 6px; background: var(--inbox-bg); font-weight: 600; }\n.gea-inbox-action small{ color: var(--inbox-muted); font-weight: 400; }\n.gea-inbox-detail-actions{ display: flex; flex-wrap: wrap; gap: 8px; margin: 16px 0; border: 0; padding: 0; min-width: 0; }\n.gea-inbox-drawer{ position: fixed; inset: 0 0 0 auto; margin: 0; padding: 0; width: min(520px, 100%); max-width: 100%; height: 100%; max-height: 100%; border: 0; background: var(--inbox-panel); color: inherit; }\n.gea-inbox-drawer::backdrop{ background: #1d212999; }\n.gea-inbox-drawer-layout{ height: 100%; display: flex; flex-direction: column; }\n.gea-inbox-drawer-header{ display: flex; align-items: center; justify-content: space-between; padding: 8px 20px; min-height: 48px; border-bottom: 1px solid var(--inbox-border); }\n.gea-inbox-drawer-header h2{ margin: 0; font-size: 16px; }\n.gea-inbox-drawer-header button{ display: flex; border: 0; padding: 8px; }\n.gea-inbox-drawer-body{ flex: 1; min-height: 0; overflow-y: auto; padding: 32px 36px; }\n.gea-inbox-detail-status{ display: flex; gap: 12px; margin-bottom: 24px; }\n.gea-inbox-info{ display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; margin: 0 0 28px; }\n.gea-inbox dt,\n.gea-inbox-label{ display: block; font-size: 13px; color: var(--inbox-muted); margin-bottom: 6px; }\n.gea-inbox dd{ margin: 0; overflow-wrap: anywhere; line-height: 1.6; }\n.gea-inbox h3{ font-size: 16px; line-height: 1.6; margin: 0 0 24px; overflow-wrap: anywhere; }\n.gea-inbox-body{ white-space: pre-wrap; overflow-wrap: anywhere; background: light-dark(#fafbfc, #1b1d21); border: 1px solid var(--inbox-border); border-radius: 6px; padding: 16px; margin: 0; line-height: 1.8; }\n.gea-inbox-drawer-footer{ padding: 16px 20px; display: flex; justify-content: flex-end; border-top: 1px solid var(--inbox-border); }\n@media (max-width: 600px){.gea-inbox-header,\n.gea-inbox-toolbar{ padding: 12px 16px; }\n.gea-inbox-heading{ gap: 12px; flex-wrap: wrap; }\n.gea-inbox-content{ padding: 12px 16px; }\n.gea-inbox-info{ grid-template-columns: 1fr; }\n.gea-inbox-drawer-body{ padding: 20px 16px; }}\n.gea-native-page .sr-only{\n  position: absolute;\n  width: 1px;\n  height: 1px;\n  padding: 0;\n  margin: -1px;\n  overflow: hidden;\n  clip: rect(0, 0, 0, 0);\n  white-space: nowrap;\n  border: 0;\n}\n.gea-api-log-center button:focus-visible,\n.gea-api-log-center input:focus-visible,\n.gea-api-log-center pre:focus-visible{\n  outline: 2px solid #ed4348;\n  outline-offset: 2px;\n}\n.gea-api-log-center{\n  --api-accent: var(--workbench-brand);\n  --api-accent-soft: var(--workbench-brand-soft);\n  --api-ink: var(--workbench-text);\n  --api-muted: var(--workbench-muted);\n  --api-line: var(--workbench-border);\n  height: 100%;\n  min-height: 0;\n  display: flex;\n  flex-direction: column;\n  color: var(--api-ink);\n  background: var(--workbench-page);\n}\n.AppFrame_frame.gea-api-fullscreen{\n  grid-template-columns: minmax(0, 1fr) 0 0 !important;\n}\n.AppFrame_frame.gea-api-fullscreen .AppFrame_sidebarCol,\n.AppFrame_frame.gea-api-fullscreen .AppFrame_rightbarCol{\n  display: none !important;\n}\n.gea-api-log-center button,\n.gea-api-log-center input{ font: inherit; }\n.gea-api-log-header{\n  flex: 0 0 auto;\n  min-height: 68px;\n  padding: 12px 16px 12px 20px;\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 20px;\n  border-bottom: 1px solid var(--api-line);\n  background: #fff;\n}\n.gea-api-log-title,\n.gea-api-log-actions,\n.gea-api-log-title > div,\n.gea-api-log-actions button,\n.gea-api-search,\n.gea-api-search label{ display: flex; align-items: center; }\n.gea-api-log-title{ gap: 11px; min-width: 260px; }\n.gea-api-log-title > div{ align-items: flex-start; flex-direction: column; gap: 2px; }\n.gea-api-log-title h1{ margin: 0; font-size: 18px; line-height: 1.25; letter-spacing: -0.01em; }\n.gea-api-log-title p{ margin: 0; color: var(--api-muted); font-size: 12px; }\n.gea-api-log-mark{\n  width: 38px;\n  height: 38px;\n  display: grid;\n  place-items: center;\n  border-radius: 10px;\n  color: #fff;\n  background: var(--api-accent);\n}\n.gea-api-log-actions{ justify-content: flex-end; flex-wrap: wrap; gap: 7px; }\n.gea-api-log-actions > button,\n.gea-api-code-heading button,\n.gea-api-replay-panel button,\n.gea-api-write-confirm button,\n.gea-api-inline-confirm button{\n  min-height: 34px;\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  gap: 6px;\n  padding: 0 10px;\n  border: 1px solid #d9dce3;\n  border-radius: 8px;\n  color: #3b4351;\n  background: #fff;\n  cursor: pointer;\n}\n.gea-api-log-actions > button:hover:not(:disabled),\n.gea-api-code-heading button:hover,\n.gea-api-replay-panel button:hover:not(:disabled),\n.gea-api-write-confirm button:hover:not(:disabled),\n.gea-api-inline-confirm button:hover:not(:disabled){\n  color: var(--api-accent);\n  border-color: #ed8c91;\n}\n.gea-api-log-actions > button:disabled,\n.gea-api-replay-panel button:disabled,\n.gea-api-write-confirm button:disabled{ opacity: 0.48; cursor: not-allowed; }\n.gea-api-log-actions > button.is-active{ color: #166534; border-color: #acd9bd; background: #f1fbf5; }\n.gea-api-log-actions .gea-api-close{ color: #fff; border-color: var(--api-accent); background: var(--api-accent); }\n.gea-api-log-actions .gea-api-close:hover{ color: #fff; border-color: #b9252b; background: #b9252b; }\n.gea-api-search{\n  width: min(260px, 25vw);\n  min-width: 190px;\n  height: 36px;\n  gap: 8px;\n  padding: 0 10px;\n  border: 1px solid #d9dce3;\n  border-radius: 8px;\n  color: #596273;\n  background: #f8f9fb;\n}\n.gea-api-search label{ flex: 1; min-width: 0; gap: 8px; }\n.gea-api-search:focus-within{ border-color: #ed8c91; background: #fff; }\n.gea-api-search input{ width: 100%; min-width: 0; border: 0; outline: 0; color: var(--api-ink); background: transparent; }\n.gea-api-search input::placeholder{ color: #626b7b; }\n.gea-api-search button{ flex: 0 0 auto; padding: 2px; border: 0; color: #596273; background: transparent; cursor: pointer; }\n.gea-api-inline-confirm,\n.gea-api-error{\n  flex: 0 0 auto;\n  min-height: 42px;\n  padding: 8px 16px 8px 20px;\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  border-bottom: 1px solid #f2c6c8;\n  color: #7a2024;\n  background: #fff5f5;\n}\n.gea-api-inline-confirm span{ flex: 1; }\n.gea-api-inline-confirm button{ min-height: 28px; }\n.gea-api-error{ color: #8f1d23; }\n.gea-api-layout{\n  flex: 1 1 0;\n  min-height: 0;\n  display: grid;\n  grid-template-columns: 260px minmax(430px, 1fr) minmax(360px, 430px);\n  background: #fff;\n}\n.gea-api-catalog,\n.gea-api-call-list,\n.gea-api-detail{ min-width: 0; min-height: 0; }\n.gea-api-catalog,\n.gea-api-call-list{ display: flex; flex-direction: column; border-right: 1px solid var(--api-line); }\n.gea-api-pane-heading{\n  flex: 0 0 58px;\n  padding: 10px 14px;\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 10px;\n  border-bottom: 1px solid var(--api-line);\n  background: #fbfbfc;\n}\n.gea-api-pane-heading h2{ margin: 0; font-size: 14px; line-height: 1.3; }\n.gea-api-pane-heading span{ color: var(--api-muted); font-size: 12px; }\n.gea-api-catalog > .gea-api-catalog-item{ flex: 0 0 auto; margin: 8px 8px 0; }\n.gea-api-catalog-scroll,\n.gea-api-call-scroll,\n.gea-api-detail{ overflow: auto; scrollbar-color: #bec3cd transparent; scrollbar-width: thin; }\n.gea-api-catalog-scroll{ padding: 6px 8px 14px; }\n.gea-api-catalog-scroll section + section{ margin-top: 15px; }\n.gea-api-catalog-scroll h3{\n  margin: 0 8px 6px;\n  color: #5f6877;\n  font-size: 11px;\n  font-weight: 600;\n}\n.gea-api-catalog-item{\n  width: calc(100% - 16px);\n  min-height: 36px;\n  margin: 1px 8px;\n  padding: 6px 8px;\n  display: grid;\n  grid-template-columns: 42px minmax(0, 1fr) auto;\n  align-items: center;\n  gap: 7px;\n  border: 0;\n  border-radius: 8px;\n  color: #3e4654;\n  background: transparent;\n  text-align: left;\n  cursor: pointer;\n}\n.gea-api-catalog-item:hover{ background: #f2f3f6; }\n.gea-api-catalog-item.is-selected{ color: #9d1f25; background: var(--api-accent-soft); }\n.gea-api-catalog-item > span:nth-last-child(2){ overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }\n.gea-api-catalog-item strong{ color: #5f6877; font-size: 11px; font-variant-numeric: tabular-nums; }\n.gea-api-method{\n  min-width: 38px;\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  color: #6b7280;\n  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;\n  font-size: 10px;\n  font-weight: 700;\n  letter-spacing: 0.02em;\n}\n.gea-api-method.is-get{ color: #146c43; }\n.gea-api-method.is-post{ color: #9d1f25; }\n.gea-api-filter-tabs{ display: flex; gap: 2px; padding: 2px; border-radius: 7px; background: #eceef2; }\n.gea-api-filter-tabs button{ min-width: 40px; height: 25px; border: 0; border-radius: 5px; color: #667085; background: transparent; font-size: 12px; cursor: pointer; }\n.gea-api-filter-tabs button.is-active{ color: #29303d; background: #fff; }\n.gea-api-call-row{\n  width: 100%;\n  min-height: 58px;\n  padding: 8px 12px;\n  display: grid;\n  grid-template-columns: 66px 44px minmax(130px, 1fr) auto 64px 54px;\n  align-items: center;\n  gap: 7px;\n  border: 0;\n  border-bottom: 1px solid #eef0f3;\n  color: #3d4552;\n  background: #fff;\n  text-align: left;\n  cursor: pointer;\n}\n.gea-api-call-row:hover{ background: #fafafb; }\n.gea-api-call-row.is-selected{ background: #fff4f4; box-shadow: inset 3px 0 0 var(--api-accent); }\n.gea-api-call-time,\n.gea-api-call-duration{ color: #596273; font-size: 11px; font-variant-numeric: tabular-nums; }\n.gea-api-call-main{ min-width: 0; display: flex; flex-direction: column; gap: 3px; }\n.gea-api-call-main strong{ overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; }\n.gea-api-call-main small{ overflow: hidden; color: #596273; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }\n.gea-api-replayed{ padding: 2px 5px; border-radius: 4px; color: #73510d; background: #fff7dc; font-size: 10px; }\n.gea-api-outcome{ display: inline-flex; justify-content: center; padding: 3px 6px; border-radius: 5px; font-size: 11px; font-weight: 600; }\n.gea-api-outcome.is-success{ color: #166534; background: #edf9f1; }\n.gea-api-outcome.is-error{ color: #a52228; background: #fff0f0; }\n.gea-api-outcome.is-pending{ color: #705512; background: #fff8df; }\n.gea-api-detail{ padding: 18px 18px 30px; background: #fff; }\n.gea-api-detail-heading{ display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }\n.gea-api-detail-heading h2{ margin: 3px 0 4px; font-size: 18px; letter-spacing: -0.01em; }\n.gea-api-detail-heading code{ display: block; color: #596273; font-size: 11px; overflow-wrap: anywhere; }\n.gea-api-detail-group{ color: var(--api-accent); font-size: 11px; font-weight: 600; }\n.gea-api-facts{ margin: 18px 0 0; padding: 12px 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px 18px; border-top: 1px solid var(--api-line); border-bottom: 1px solid var(--api-line); }\n.gea-api-facts div{ min-width: 0; }\n.gea-api-facts dt{ color: #596273; font-size: 11px; }\n.gea-api-facts dd{ margin: 3px 0 0; color: #313845; font-size: 12px; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }\n.gea-api-replay-panel{ margin-top: 16px; display: flex; align-items: center; justify-content: space-between; gap: 12px; }\n.gea-api-replay-panel > div{ min-width: 0; display: flex; flex-direction: column; gap: 3px; }\n.gea-api-replay-panel strong{ font-size: 12px; }\n.gea-api-replay-panel span{ color: #596273; font-size: 11px; line-height: 1.45; }\n.gea-api-replay-panel button{ flex: 0 0 auto; color: var(--api-accent); border-color: #efb2b5; }\n.gea-api-replay-panel button.is-caution{ color: #815b0b; border-color: #e3cc83; background: #fffaf0; }\n.gea-api-write-confirm{ margin-top: 10px; padding: 12px; display: flex; flex-direction: column; gap: 5px; border: 1px solid #efd79a; border-radius: 10px; color: #624810; background: #fffaf0; }\n.gea-api-write-confirm strong{ font-size: 12px; }\n.gea-api-write-confirm span{ font-size: 11px; line-height: 1.5; }\n.gea-api-write-confirm > div{ margin-top: 6px; display: flex; gap: 7px; }\n.gea-api-write-confirm > div button:first-child{ color: #fff; border-color: #8a6413; background: #8a6413; }\n.gea-api-origin{ margin: 10px 0 0; color: #6f5721; font-size: 11px; }\n.gea-api-contract{ margin-top: 14px; padding: 10px 12px; border: 1px solid #e1e4e9; border-radius: 9px; background: #fafbfc; }\n.gea-api-contract summary{ color: #3d4552; font-size: 12px; font-weight: 600; cursor: pointer; }\n.gea-api-contract p{ margin: 8px 0; color: #596273; font-size: 12px; line-height: 1.6; }\n.gea-api-contract .gea-api-field-list{ margin-top: 9px; }\n.gea-api-definition{ margin-top: 22px; padding-top: 16px; border-top: 1px solid var(--api-line); }\n.gea-api-definition h3{ margin: 0 0 7px; font-size: 12px; }\n.gea-api-definition p{ margin: 0; color: #596273; font-size: 12px; line-height: 1.65; }\n.gea-api-field-list{ display: flex; flex-wrap: wrap; gap: 6px; }\n.gea-api-field-list code{ padding: 4px 7px; border: 1px solid #e1e4e9; border-radius: 6px; color: #4b5565; background: var(--workbench-page); font-size: 11px; }\n.gea-api-code-section{ margin-top: 18px; }\n.gea-api-code-heading{ margin-bottom: 7px; display: flex; align-items: center; justify-content: space-between; }\n.gea-api-code-heading h3{ margin: 0; font-size: 12px; }\n.gea-api-code-heading button{ min-height: 26px; padding: 0 7px; border-color: transparent; color: #596273; background: transparent; font-size: 11px; }\n.gea-api-code-section pre{\n  max-height: 260px;\n  margin: 0;\n  padding: 11px 12px;\n  overflow: auto;\n  border: 1px solid #e3e6eb;\n  border-radius: 10px;\n  color: #28303d;\n  background: #f8f9fb;\n  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;\n  font-size: 11px;\n  line-height: 1.55;\n  white-space: pre-wrap;\n  overflow-wrap: anywhere;\n}\n.gea-api-empty{ height: 100%; min-height: 180px; padding: 28px; display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 8px; color: #626b7b; text-align: center; }\n.gea-api-empty strong{ color: #4a5260; font-size: 13px; }\n.gea-api-empty span{ max-width: 280px; font-size: 12px; line-height: 1.55; }\n.gea-api-empty.is-compact{ height: auto; min-height: 150px; margin-top: 12px; border-top: 1px solid var(--api-line); }\n.gea-api-copy-status{ position: fixed; z-index: 40; right: 20px; bottom: 18px; min-height: 28px; color: #166534; font-size: 12px; pointer-events: none; }\n.gea-api-catalog-scroll::-webkit-scrollbar,\n.gea-api-call-scroll::-webkit-scrollbar,\n.gea-api-detail::-webkit-scrollbar,\n.gea-api-code-section pre::-webkit-scrollbar{ width: 8px; height: 8px; }\n.gea-api-catalog-scroll::-webkit-scrollbar-thumb,\n.gea-api-call-scroll::-webkit-scrollbar-thumb,\n.gea-api-detail::-webkit-scrollbar-thumb,\n.gea-api-code-section pre::-webkit-scrollbar-thumb{ border: 2px solid transparent; border-radius: 8px; background: #bec3cd; background-clip: padding-box; }\n@media (max-width: 1100px){.gea-api-log-header{ align-items: flex-start; flex-direction: column; gap: 10px; }\n.gea-api-log-actions{ width: 100%; justify-content: flex-start; }\n.gea-api-search{ flex: 1 1 220px; width: auto; }\n.gea-api-layout{ grid-template-columns: 220px minmax(380px, 1fr); grid-template-rows: minmax(300px, 47%) minmax(0, 1fr); }\n.gea-api-detail{ grid-column: 1 / -1; border-top: 1px solid var(--api-line); }}\n@media (max-width: 680px){.gea-api-log-center{ overflow: auto; }\n.gea-api-log-header{ position: sticky; z-index: 5; top: 0; }\n.gea-api-log-title p{ max-width: 300px; }\n.gea-api-log-actions > button{ flex: 1 1 auto; }\n.gea-api-search{ flex-basis: 100%; min-width: 100%; }\n.gea-api-layout{ flex: none; display: flex; flex-direction: column; }\n.gea-api-catalog{ min-height: 260px; max-height: 42vh; border-right: 0; border-bottom: 1px solid var(--api-line); }\n.gea-api-call-list{ min-height: 360px; max-height: 58vh; border-right: 0; border-bottom: 1px solid var(--api-line); }\n.gea-api-detail{ min-height: 420px; overflow: visible; }\n.gea-api-call-row{ grid-template-columns: 58px 40px minmax(110px, 1fr) 52px; }\n.gea-api-call-row .gea-api-replayed,\n.gea-api-call-duration{ display: none; }}\n@media (prefers-reduced-motion: reduce){.gea-api-log-center svg{ animation: none !important; }}\n';

// src/business-views.tsx
var import_jsx_runtime10 = require("react/jsx-runtime");
var PANEL = "gea-proof";
var INBOX = "gea-inbox";
var API_LOG_PANEL = "gea-api-log";
function mountBusinessViews(ctx) {
  ctx.effect(() => ctx.locale.register("geaProof", { zh, en }));
  const t = ctx.locale.bind("geaProof");
  ctx.inject(["businessAccount"], (scope) => {
    const ctx2 = scope;
    const identity = scope.businessAccount;
    const incoming = createNavigationSelection();
    const inboxViews = /* @__PURE__ */ new Map();
    const inboxViewListeners = /* @__PURE__ */ new Set();
    const initialInboxView = { pageNo: 1, readState: "" };
    const subscribeInboxView = (listener) => {
      inboxViewListeners.add(listener);
      return () => {
        inboxViewListeners.delete(listener);
      };
    };
    ctx2.effect(() => () => {
      inboxViews.clear();
      inboxViewListeners.clear();
    });
    function InboxPage() {
      const navigation = (0, import_react21.useSyncExternalStore)(incoming.subscribe, incoming.getSnapshot);
      const accountScope = (0, import_react21.useSyncExternalStore)(identity.subscribe, identity.getSnapshot).scope;
      const view = (0, import_react21.useSyncExternalStore)(subscribeInboxView, () => inboxViews.get(accountScope) ?? initialInboxView);
      return /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("section", { className: "agent-workbench-ui gea-native-page", style: { height: "100%", overflow: "auto" }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("style", { children: native_pages_default }),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(Inbox, { t, navigation: navigation?.panel === INBOX ? navigation : null, view, onViewChange: (next) => {
          inboxViews.set(accountScope, next);
          for (const changed of inboxViewListeners) changed();
        } }, accountScope ?? "unconfirmed")
      ] });
    }
    function LogPage() {
      const [environment, setEnvironment] = (0, import_react21.useState)("production");
      (0, import_react21.useEffect)(() => {
        const controller = new AbortController();
        void request2("status", {}, controller.signal).then((status) => {
          if (!controller.signal.aborted) setEnvironment(status.environment);
        }).catch(() => {
        });
        return () => controller.abort();
      }, []);
      return /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("section", { className: "agent-workbench-ui gea-native-page", style: { height: "100%" }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("style", { children: native_pages_default }),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(ApiLogCenter, { environment, request: request2, onClose: () => void ctx2.agentWorkbench.open(PANEL) })
      ] });
    }
    for (const [id, label, component] of [
      [API_LOG_PANEL, "apiLog", LogPage]
    ]) ctx2.slots.inject("main", () => {
      const unregister = ctx2.agentWorkbench.register({ id, label: () => t(label) });
      const dispose = ctx2.slots.register({ name: "main", key: id }, component);
      return () => {
        dispose();
        unregister();
      };
    });
    ctx2.slots.inject("main", () => ctx2.agentWorkbench.registerFrame({ id: INBOX, label: () => t("businessInbox"), kind: "local", body: InboxPage, resourceId: "gea-readonly" }));
    ctx2.slots.inject("main", () => ctx2.agentWorkbench.registerFrame({ id: PANEL, label: () => t("salesPlan"), kind: "native", resourceId: "gea-readonly", src: () => `/api/agent-workbench/native?locale=${encodeURIComponent(ctx2.locale.getSnapshot().active)}`, visibleRequest: { subscribe: incoming.subscribe, getSnapshot: () => {
      const navigation = incoming.getSnapshot();
      return navigation?.panel === PANEL ? navigation.receipt : void 0;
    } }, onVisible: (receipt) => {
      const navigation = incoming.getSnapshot();
      if (identity.getSnapshot().status?.authenticated && navigation?.panel === PANEL && navigation.receipt === receipt) navigation.visible();
    } }));
    const openNavigation = async (target, signal) => {
      if (![PANEL, INBOX].includes(target.panel)) throw Error("NAVIGATION_TARGET_UNSUPPORTED");
      signal.throwIfAborted();
      let clear = () => {
      };
      const arrival = new Promise((resolve, reject) => {
        const cancel = () => {
          if (incoming.getSnapshot()?.receipt === target.receipt) incoming.set(null);
          reject(Error("NAVIGATION_REQUEST_CANCELLED"));
        };
        const timer = setTimeout(() => {
          cancel();
        }, 3e4);
        clear = () => {
          clearTimeout(timer);
          signal.removeEventListener("abort", cancel);
        };
        signal.addEventListener("abort", cancel, { once: true });
        incoming.set({ ...target, visible: resolve, failed: reject });
        if (signal.aborted) cancel();
      });
      try {
        await Promise.all([ctx2.agentWorkbench.open(target.panel), arrival]);
        signal.throwIfAborted();
      } finally {
        clear();
      }
    };
    ctx2.slots.inject("shell.overlay", () => ctx2.slots.register({ name: "shell.overlay", id: "gea-desktop-navigation" }, () => /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(DesktopNavigation, { t, open: openNavigation, login: () => void ctx2.agentWorkbench.open(PANEL) })));
  });
}
async function request2(endpoint, payload = {}, signal) {
  const response = await fetch("/api/gea-proof/" + endpoint, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal });
  const result = await response.json();
  if (!response.ok || result.ok !== true) throw Error(result.error?.message ?? "GEA_REQUEST_FAILED");
  return result.value;
}

// src/client.ts
var import_react27 = __toESM(require("react"), 1);

// src/resource-selection.ts
async function resourceWorkspace(request3, signal, cwd) {
  if (cwd?.trim()) return cwd;
  const configResponse = await request3("/api/agent-workbench/config", {
    signal,
    cache: "no-store"
  });
  if (!configResponse.ok) throw Error("WORKBENCH_WORKSPACE_UNAVAILABLE");
  const config = await configResponse.json();
  if (typeof config.cwd !== "string" || !config.cwd.trim())
    throw Error("WORKBENCH_WORKSPACE_REQUIRED");
  return config.cwd;
}
async function selectResource(host, id, signal, currentCwd, beforeOpen) {
  const cwd = await resourceWorkspace(host.fetch, signal, currentCwd);
  const response = await host.fetch("/api/agent-manage/resources/select", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id, cwd }),
    signal
  });
  const resource = await response.json();
  if (!response.ok || typeof resource.preset !== "string")
    throw Error(resource.error ?? "RESOURCE_SELECTION_FAILED");
  signal.throwIfAborted();
  const { workspaceId } = await host.workspace(cwd);
  signal.throwIfAborted();
  const sessionId = await host.create({ workspaceId });
  signal.throwIfAborted();
  await host.select(sessionId, resource.preset);
  signal.throwIfAborted();
  await host.open(
    sessionId,
    typeof resource.skill === "string" ? resource.skill : void 0,
    signal,
    (projection) => {
      if (typeof projection.preset !== "string" || projection.preset !== resource.preset)
        throw Error("PAGE_SESSION_PRESET_UNAVAILABLE");
      beforeOpen?.({
        sessionId: projection.sessionId,
        preset: projection.preset,
        ...projection.cwd === void 0 ? {} : { cwd: projection.cwd },
        ...resource.interpreters ? { interpreters: resource.interpreters } : {}
      });
    }
  );
  return { sessionId, preset: resource.preset };
}
function mountNativeResourceSelection(ctx, ready) {
  let active;
  return ctx.inject(
    ["sessions", "workspaces", "remote", "remote.agentPresets", "conversation", "uiWorkspace"],
    (scope) => {
      const host = {
        fetch: (...args) => fetch(...args),
        workspace: (path) => scope.workspaces.create({ path }),
        create: (options) => scope.sessions.create({ workspaceId: options.workspaceId }),
        select: async (id, preset) => {
          const result = await scope.remote.agentPresets.select(id, preset);
          if (!result.ok) throw Error(result.error.message);
        },
        open: async (id, skill, signal, beforeOpen) => {
          const reference = scope.sessions.retain(id, {
            source: "agentResourceSelection",
            signal
          });
          try {
            await reference.ready;
            signal.throwIfAborted();
            if (skill) {
              const input = scope.conversation.input.for(reference.binding.ctx);
              const state = input.state.getSnapshot();
              if (state.draft || reference.binding.ctx.bail("slash/input-insert-text", {
                text: `/${skill} `,
                span: { start: 0, end: 0, draftRev: state.draftRev }
              }) !== true)
                throw Error("RESOURCE_DRAFT_CHANGED");
            }
            signal.throwIfAborted();
            const preset = reference.binding.session.projections.faceOf("agentPreset").getSnapshot();
            if (preset !== null && (typeof preset !== "string" || !preset))
              throw Error("PAGE_SESSION_PRESET_UNAVAILABLE");
            const cwd = scope.sessions.list.getSnapshot().byId[reference.sessionId]?.cwd;
            beforeOpen?.({
              sessionId: reference.sessionId,
              preset,
              ...typeof cwd === "string" ? { cwd } : {}
            });
            signal.throwIfAborted();
            scope.uiWorkspace.openSession(id);
          } finally {
            reference.release();
          }
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
    }
  );
}

// src/company/ui.tsx
var import_react24 = __toESM(require("react"), 1);
var import_react_dom = require("react-dom");

// ../../official-latest-standard/packages/client/ui-primitives/src/icons/index.tsx
var import_react22 = require("react");

// ../../official-latest-standard/packages/client/ui-primitives/src/icons/shared-artwork.tsx
var import_jsx_runtime11 = require("react/jsx-runtime");
var NewChatOutlineArtwork = ({ size = 16, className, strokeWidth }) => /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("svg", { width: size, height: size, className, viewBox: "0 0 16 16", fill: "none", xmlns: "http://www.w3.org/2000/svg", "aria-hidden": "true", strokeWidth, children: [
  /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("path", { d: "M2.37091 11.2501C1.58745 9.89288 1.32067 8.29835 1.61969 6.76006C1.91872 5.22177 2.76342 3.8433 3.99826 2.87846C5.2331 1.91362 6.77494 1.42737 8.33988 1.50925C9.90482 1.59113 11.3875 2.23562 12.5149 3.32406C13.6425 4.41269 14.3387 5.87206 14.4754 7.4334C14.612 8.99474 14.18 10.5529 13.2587 11.8209C12.3375 13.0888 10.9891 13.9813 9.46194 14.3337C8.18691 14.628 6.85895 14.5294 5.64989 14.0605C5.1712 13.8748 4.76962 13.4932 4.26534 13.3967C3.67413 13.2835 2.95257 13.5598 2.03794 14.3337", stroke: "currentColor" }),
  /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("path", { d: "M8 5V11", stroke: "currentColor" }),
  /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("path", { d: "M5 8H11", stroke: "currentColor" })
] });

// ../../official-latest-standard/packages/client/ui-primitives/src/icons/index.tsx
var import_jsx_runtime12 = require("react/jsx-runtime");
var ICON_REGULAR_STROKE = 1;
var IconNewChatOutlineRegular = (props) => /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(NewChatOutlineArtwork, { ...props, strokeWidth: ICON_REGULAR_STROKE });
var IconPanelLeftOutlineArtwork = ({ size = 16, className, strokeWidth }) => /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("svg", { width: size, height: size, className, viewBox: "0 0 16 16", fill: "none", xmlns: "http://www.w3.org/2000/svg", "aria-hidden": "true", strokeWidth, children: [
  /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("path", { d: "M13.5 1.5H2.5C1.94772 1.5 1.5 1.94772 1.5 2.5V13.5C1.5 14.0523 1.94772 14.5 2.5 14.5H13.5C14.0523 14.5 14.5 14.0523 14.5 13.5V2.5C14.5 1.94772 14.0523 1.5 13.5 1.5Z", stroke: "currentColor" }),
  /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("path", { d: "M5.5 1.5V14.5", stroke: "currentColor" })
] });
var IconPanelLeftOutlineRegular = (props) => /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(IconPanelLeftOutlineArtwork, { ...props, strokeWidth: ICON_REGULAR_STROKE });
var IconPluginPinwheelOutlineArtwork = ({ size = 16, className, strokeWidth }) => /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("svg", { width: size, height: size, className, viewBox: "0 0 16 16", fill: "none", xmlns: "http://www.w3.org/2000/svg", "aria-hidden": "true", strokeWidth, children: [
  /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("path", { d: "M7.84457 5.06199C11.6605 4.93876 14.7962 6.14848 14.8484 7.76397C14.8875 8.97461 13.1838 10.0696 10.7215 10.5942", stroke: "currentColor" }),
  /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("path", { d: "M5.12742 8.07731C5.00419 4.26138 6.21391 1.12568 7.8294 1.07351C9.04004 1.03441 10.135 2.73808 10.6596 5.20037", stroke: "currentColor" }),
  /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("path", { d: "M8.02457 10.6802C4.20865 10.8034 1.07294 9.5937 1.02077 7.97821C0.981678 6.76758 2.68535 5.67262 5.14763 5.14798", stroke: "currentColor" }),
  /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("path", { d: "M10.7476 7.89535C10.8708 11.7113 9.66109 14.847 8.0456 14.8991C6.83496 14.9382 5.74 13.2346 5.21536 10.7723", stroke: "currentColor" })
] });
var IconPluginPinwheelOutlineRegular = (props) => /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(IconPluginPinwheelOutlineArtwork, { ...props, strokeWidth: ICON_REGULAR_STROKE });

// src/company/locales.ts
var copy2 = {
  identityObservationFailed: [
    "\u65E0\u6CD5\u786E\u8BA4 GEA \u8EAB\u4EFD\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002",
    "Unable to confirm the GEA identity. Please try again later."
  ],
  pageRecoveryPending: ["\u6B63\u5728\u6062\u590D\u5DF2\u5173\u8054\u9875\u9762\u2026", "Restoring the associated page\u2026"],
  pageRecoveryIdentityUnavailable: [
    "\u8D26\u53F7\u4FE1\u606F\u6682\u4E0D\u53EF\u7528\uFF0C\u8BF7\u91CD\u8BD5\u540E\u6062\u590D\u9875\u9762\u3002",
    "Identity information is unavailable. Retry before restoring this page."
  ],
  navigationLogin: ["\u8BF7\u767B\u5F55\u4EE5\u6253\u5F00\u98DE\u4E66\u6D88\u606F\u3002", "Sign in to open the Feishu message."],
  navigationLoginAction: ["\u767B\u5F55\u5E76\u7EE7\u7EED", "Sign in and continue"],
  navigationOpening: ["\u6B63\u5728\u6253\u5F00\u6D88\u606F\u5BF9\u5E94\u9875\u9762\u2026", "Opening the message destination\u2026"],
  navigationExpired: [
    "\u6D88\u606F\u94FE\u63A5\u5DF2\u8FC7\u671F\u6216\u64A4\u9500\uFF0C\u8BF7\u91CD\u65B0\u83B7\u53D6\u901A\u77E5\u3002",
    "This message link has expired or was revoked. Request a new notification."
  ],
  navigationForbidden: [
    "\u5F53\u524D\u8D26\u53F7\u65E0\u6743\u67E5\u770B\u6B64\u6D88\u606F\uFF0C\u8BF7\u6838\u5BF9\u767B\u5F55\u8D26\u53F7\u3002",
    "This account cannot view the message. Check your signed-in account."
  ],
  navigationUnavailable: [
    "\u6682\u65F6\u65E0\u6CD5\u5B9A\u4F4D\u6D88\u606F\u76EE\u6807\uFF0C\u8BF7\u786E\u8BA4\u5BF9\u5E94\u529F\u80FD\u5DF2\u5B89\u88C5\uFF0C\u6216\u5728\u6D88\u606F\u5F85\u529E\u4E2D\u67E5\u770B\u3002",
    "The destination could not be located. Check that its feature is installed or open the inbox."
  ],
  navigationFailed: [
    "\u6D88\u606F\u6253\u5F00\u6216\u56DE\u6267\u672A\u5B8C\u6210\uFF0C\u8BF7\u91CD\u8BD5\u3002",
    "Opening the message or confirming arrival did not finish. Retry."
  ],
  accountMenu: ["\u8D26\u6237\u83DC\u5355", "Account menu"],
  settings: ["\u8BBE\u7F6E", "Settings"],
  logout: ["\u9000\u51FA\u767B\u5F55", "Sign out"],
  loggingOut: ["\u6B63\u5728\u9000\u51FA\u2026", "Signing out\u2026"],
  logoutFailed: ["\u9000\u51FA\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5\u3002", "Sign-out failed. Retry."],
  close: ["\u5173\u95ED", "Close"],
  inboxUnreadMessages: ["\u6761\u672A\u8BFB\u6D88\u606F", "unread messages"],
  inboxStatusLabel: ["\u72B6\u6001\uFF1A", "Status:"],
  inboxAll: ["\u5168\u90E8", "All"],
  inboxBusinessType: ["\u4E1A\u52A1\u7C7B\u578B", "Business type"],
  inboxSubject: ["\u4E3B\u9898", "Subject"],
  inboxContent: ["\u5185\u5BB9", "Content"],
  inboxStatus: ["\u72B6\u6001", "Status"],
  inboxCurrentStatus: ["\u5F53\u524D\u72B6\u6001", "Current status"],
  inboxMessageSubject: ["\u6D88\u606F\u4E3B\u9898", "Message subject"],
  inboxQueryInfo: ["\u67E5\u8BE2\u4FE1\u606F", "Query information"],
  businessInbox: ["\u4E1A\u52A1\u5F85\u529E", "Business inbox"],
  notificationContent: ["\u6D88\u606F\u5185\u5BB9", "Message content"],
  notificationCreatedAt: ["\u521B\u5EFA\u65F6\u95F4", "Created at"],
  notificationDetail: ["\u5F85\u529E\u8BE6\u60C5", "Task details"],
  notificationUnread: ["\u672A\u8BFB", "Unread"],
  notificationRead: ["\u5DF2\u8BFB", "Read"],
  notificationDismissed: ["\u5DF2\u5FFD\u7565", "Dismissed"],
  inboxReadOnly: [
    "GEA \u901A\u77E5\u4E0E\u4E1A\u52A1\u5F85\u529E \xB7 \u53EA\u8BFB\u67E5\u770B\uFF0C\u4E0D\u6539\u53D8\u5904\u7406\u72B6\u6001",
    "GEA notifications and business tasks \xB7 viewing does not change state"
  ],
  inboxMutationHint: [
    "\u72B6\u6001\u53D8\u66F4\u4F1A\u63D0\u4EA4\u5F53\u524D\u7248\u672C\uFF1B\u51B2\u7A81\u65F6\u8BF7\u5237\u65B0\u540E\u518D\u51B3\u5B9A\u3002",
    "State changes use the current version; refresh before retrying a conflict."
  ],
  markRead: ["\u6807\u8BB0\u5DF2\u8BFB", "Mark as read"],
  notificationNotifiedAt: ["\u901A\u77E5\u65F6\u95F4", "Notification time"],
  notificationResultUnknown: [
    "\u6682\u65F6\u65E0\u6CD5\u786E\u8BA4\u5904\u7406\u7ED3\u679C\uFF0C\u8BF7\u91CD\u8BD5\u539F\u64CD\u4F5C\u3002",
    "The result is unknown. Retry the original action."
  ],
  notificationRetryOriginal: ["\u91CD\u8BD5\u539F\u64CD\u4F5C", "Retry original action"],
  notificationConflict: [
    "\u6D88\u606F\u72B6\u6001\u5DF2\u53D8\u5316\uFF0C\u6B63\u5728\u5237\u65B0\uFF0C\u8BF7\u6838\u5BF9\u540E\u518D\u64CD\u4F5C\u3002",
    "The message changed. Refreshing; review it before acting again."
  ],
  markSelectedRead: ["\u6279\u91CF\u6807\u8BB0\u5DF2\u8BFB", "Mark selected as read"],
  dismissNotification: ["\u5FFD\u7565\u5F85\u529E", "Dismiss task"],
  approveNotification: ["\u540C\u610F", "Approve"],
  rejectNotification: ["\u9A73\u56DE", "Reject"],
  refreshInbox: ["\u5237\u65B0\u6D88\u606F", "Refresh messages"],
  backToInbox: ["\u8FD4\u56DE\u6D88\u606F\u5217\u8868", "Back to messages"],
  unreadCount: ["\u672A\u8BFB\u6570", "Unread"],
  notificationNoContent: ["\u6682\u65E0\u6D88\u606F\u5185\u5BB9", "No message content"],
  notificationTitle: ["\u6807\u9898", "Title"],
  notificationState: ["\u901A\u77E5\u72B6\u6001", "Notification state"],
  notificationSource: ["\u6765\u6E90", "Source"],
  inboxBusinessTypeSalesPlan: ["\u9500\u552E\u8BA1\u5212", "Sales plan"],
  inboxBusinessTypeFallback: ["\u4E1A\u52A1\u5F85\u529E", "Business task"],
  inboxNotificationKindApproval: ["\u5BA1\u6279\u901A\u77E5", "Approval notice"],
  inboxSourceSalesPlanApproval: ["\u9500\u552E\u8BA1\u5212\u5BA1\u6279", "Sales plan approval"],
  inboxSourceFallback: ["\u4E1A\u52A1\u7CFB\u7EDF", "Business system"],
  inboxSessionUnavailable: [
    "\u6765\u6E90\u4F1A\u8BDD\u5B9A\u4F4D\u5C1A\u672A\u63A5\u5165\uFF0C\u4FDD\u7559 GEA \u6765\u6E90\u5F15\u7528\u4F9B\u6838\u5BF9\u3002",
    "Session navigation is not connected. The GEA source reference is preserved for comparison."
  ],
  requestTimeout: ["\u8BF7\u6C42\u8D85\u65F6\uFF0C\u8BF7\u91CD\u8BD5\u3002", "The request timed out. Retry."],
  networkError: [
    "\u65E0\u6CD5\u8FDE\u63A5 GEA\uFF0C\u8BF7\u68C0\u67E5\u7F51\u7EDC\u540E\u91CD\u8BD5\u3002",
    "Cannot connect to GEA. Check the network and retry."
  ],
  title: ["GEA \u9500\u552E\u8BA1\u5212", "GEA sales plans"],
  intro: [
    "\u67E5\u8BE2\u8BA1\u5212\u3001\u67E5\u770B\u7248\u672C\u4E0E SKU\uFF0C\u786E\u8BA4\u8303\u56F4\u540E\u4EA4\u7ED9\u53EA\u8BFB\u4F1A\u8BDD\u3002",
    "Inspect plans, versions and SKUs, then confirm the input for a read-only session."
  ],
  welcomeLogin: ["\u6B22\u8FCE\u4F7F\u7528 GEA \u5DE5\u4F5C\u53F0", "Welcome to your GEA workspace"],
  production: ["\u6B63\u5F0F", "Production"],
  test: ["\u6D4B\u8BD5", "Test"],
  scanInstructions: [
    "\u7528\u624B\u673A\u98DE\u4E66\u626B\u4E00\u626B\uFF0C\u5F00\u59CB\u4ECA\u5929\u7684\u5DE5\u4F5C\u3002",
    "Scan with Lark on your phone to get started."
  ],
  qrPreparing: ["\u6B63\u5728\u51C6\u5907\u4E8C\u7EF4\u7801\u2026", "Preparing your QR code\u2026"],
  loading: ["\u6B63\u5728\u52A0\u8F7D\u2026", "Loading\u2026"],
  qrUnavailable: ["\u4E8C\u7EF4\u7801\u6682\u672A\u5C31\u7EEA", "QR code unavailable"],
  qrWaiting: ["\u7B49\u5F85\u626B\u7801", "Ready to scan"],
  qrExpired: ["\u4E8C\u7EF4\u7801\u5DF2\u8FC7\u671F", "QR code expired"],
  qrExpiredHint: ["\u70B9\u4E0B\u65B9\u6309\u94AE\uFF0C\u6362\u4E00\u5F20\u65B0\u7684\u4E8C\u7EF4\u7801", "Use the button below to get a new code."],
  loginTipTitle: ["\u5C0F\u63D0\u793A", "A quick tip"],
  loginTip: [
    "\u626B\u7801\u540E\uFF0C\u8BF7\u5728\u624B\u673A\u98DE\u4E66\u4E2D\u786E\u8BA4\u767B\u5F55\uFF1B\u65E0\u9700\u5728\u8FD9\u91CC\u8F93\u5165\u5BC6\u7801\u3002",
    "After scanning, confirm sign-in in Lark. No password is needed here."
  ],
  loginFooter: ["GEA \u4E1A\u52A1\u5DE5\u4F5C\u53F0", "GEA business workspace"],
  changeEnvironment: ["\u5207\u6362\u73AF\u5883 / \u91CD\u65B0\u767B\u5F55", "Change environment / sign in again"],
  login: ["\u98DE\u4E66\u626B\u7801\u767B\u5F55", "Sign in with Lark QR"],
  dshConversation: ["DSH \u5BF9\u8BDD", "DSH conversation"],
  modelDiscovering: ["\u6B63\u5728\u83B7\u53D6 GEA \u6A21\u578B\u2026", "Discovering GEA models\u2026"],
  modelDiscovered: ["\u5DF2\u83B7\u53D6\u6A21\u578B\uFF08\u5C1A\u672A\u9A8C\u8BC1\u63A8\u7406\uFF09\uFF1A", "Model discovered (inference not verified): "],
  modelFailed: ["\u6A21\u578B\u83B7\u53D6\u5931\u8D25\uFF1A", "Model discovery failed: "],
  refreshQr: ["\u5237\u65B0\u4E8C\u7EF4\u7801", "Refresh QR code"],
  signedOut: ["\u5C1A\u672A\u767B\u5F55 GEA", "Not signed in to GEA"],
  signedIn: ["\u5DF2\u767B\u5F55", "Signed in"],
  environment: ["GEA \u73AF\u5883", "GEA environment"],
  pending: ["\u7B49\u5F85\u98DE\u4E66\u626B\u7801\u786E\u8BA4", "Waiting for Lark confirmation"],
  expired: ["\u4E8C\u7EF4\u7801\u5DF2\u8FC7\u671F\uFF0C\u8BF7\u91CD\u65B0\u83B7\u53D6", "QR expired. Get a new code."],
  loginExpired: ["GEA \u767B\u5F55\u5DF2\u5931\u6548\uFF0C\u8BF7\u91CD\u65B0\u626B\u7801", "GEA login expired. Sign in again."],
  loginHelp: [
    "\u767B\u5F55\u4EC5\u4FDD\u7559\u5728\u5F53\u524D\u670D\u52A1\u8FDB\u7A0B\u4E2D\uFF0C\u91CD\u542F\u540E\u9700\u91CD\u65B0\u767B\u5F55\u3002",
    "Login stays in this server process; restart requires signing in again."
  ],
  query: ["\u67E5\u8BE2\u8BA1\u5212", "Query plans"],
  periods: ["\u5237\u65B0\u9500\u552E\u5468\u671F", "Refresh periods"],
  period: ["\u9500\u552E\u5468\u671F", "Period"],
  periodMonth: ["\u5468\u671F\u6708\u4EFD", "Period month"],
  planTypeCode: ["\u8BA1\u5212\u7C7B\u578B", "Plan type"],
  status: ["\u72B6\u6001\u7801", "Status code"],
  all: ["\u4E0D\u9650", "Any"],
  empty: ["\u672C\u6B21\u67E5\u8BE2\u6CA1\u6709\u8BB0\u5F55", "No records returned"],
  noQuery: ["\u767B\u5F55\u540E\u9009\u62E9\u7B5B\u9009\u6761\u4EF6\u5E76\u67E5\u8BE2\u8BA1\u5212", "Sign in, choose filters and query plans"],
  busy: ["\u6B63\u5728\u5904\u7406\u2026", "Working\u2026"],
  failure: ["\u64CD\u4F5C\u672A\u5B8C\u6210", "Operation failed"],
  forbidden: ["\u5F53\u524D\u8D26\u53F7\u6CA1\u6709\u6B64\u6570\u636E\u7684\u8BFB\u53D6\u6743\u9650", "This account cannot read the requested data"],
  retry: [
    "\u8BF7\u91CD\u8BD5\u5F53\u524D\u64CD\u4F5C\uFF1B\u82E5\u6301\u7EED\u5931\u8D25\uFF0C\u8BF7\u8054\u7CFB\u670D\u52A1\u7BA1\u7406\u5458\u3002",
    "Retry this action. Contact the service administrator if it keeps failing."
  ],
  stale: [
    "\u9009\u62E9\u5DF2\u5931\u6548\uFF0C\u8BF7\u91CD\u65B0\u67E5\u8BE2\u5E76\u786E\u8BA4\u6570\u636E\u8303\u56F4\u3002",
    "This selection expired. Query again and confirm the input."
  ],
  tooLarge: [
    "\u8F93\u5165\u8D85\u51FA\u9650\u5236\uFF0C\u8BF7\u51CF\u5C11\u9009\u4E2D\u7684 SKU \u6216\u53D6\u6D88\u9644\u52A0\u8BE6\u60C5\u540E\u91CD\u65B0\u9884\u89C8\u3002",
    "Input exceeds the limit. Select fewer SKUs or omit detail, then preview again."
  ],
  unknown: ["\u672A\u63D0\u4F9B", "Not provided"],
  planId: ["\u8BA1\u5212\u6807\u8BC6", "Plan ID"],
  versionId: ["\u7248\u672C\u6807\u8BC6", "Version ID"],
  id: ["\u8BB0\u5F55\u6807\u8BC6", "Record ID"],
  periodId: ["\u5468\u671F\u6807\u8BC6", "Period ID"],
  seq: ["\u7248\u672C\u5E8F\u53F7", "Version sequence"],
  dealer: ["\u7ECF\u9500\u5546 / \u7EC4\u7EC7", "Dealer / organization"],
  dealerName: ["\u7ECF\u9500\u5546", "Dealer"],
  dealerCode: ["\u7ECF\u9500\u5546\u7F16\u7801", "Dealer code"],
  orgName: ["\u7EC4\u7EC7", "Organization"],
  provinceName: ["\u7701\u533A", "Province"],
  areaName: ["\u533A\u57DF", "Area"],
  currentQty: ["\u5F53\u524D\u6570\u91CF", "Current quantity"],
  targetQty: ["\u76EE\u6807\u6570\u91CF", "Target quantity"],
  currentAmount: ["\u5F53\u524D\u91D1\u989D", "Current amount"],
  targetAmount: ["\u76EE\u6807\u91D1\u989D", "Target amount"],
  updatedAt: ["\u66F4\u65B0\u65F6\u95F4", "Updated at"],
  returnReason: ["\u9000\u56DE\u539F\u56E0", "Return reason"],
  effective: ["\u662F\u5426\u751F\u6548", "Effective"],
  skuCount: ["SKU \u6570", "SKU count"],
  select: ["\u9009\u62E9", "Select"],
  page: ["\u9875\u7801", "Page"],
  previous: ["\u4E0A\u4E00\u9875", "Previous"],
  next: ["\u4E0B\u4E00\u9875", "Next"],
  total: ["\u67E5\u8BE2\u603B\u6570", "Total matches"],
  returned: ["\u5B9E\u9645\u8FD4\u56DE", "Returned"],
  fetchedAt: ["\u83B7\u53D6\u65F6\u95F4", "Fetched at"],
  live: ["GEA \u6570\u636E \xB7 \u53EA\u8BFB", "GEA data \xB7 read only"],
  detail: ["\u67E5\u770B\u5F53\u524D\u8BA1\u5212\u8BE6\u60C5", "View current plan detail"],
  versions: ["\u67E5\u770B\u7248\u672C\u5217\u8868", "View versions"],
  currentDetail: ["\u5F53\u524D\u8BA1\u5212\u8BE6\u60C5", "Current plan detail"],
  detailHelp: [
    "\u6B64\u5904\u662F\u63A5\u53E3\u8FD4\u56DE\u7684\u5F53\u524D\u8BA1\u5212\u8BE6\u60C5\uFF0C\u4E0D\u4EE3\u8868\u6240\u9009\u5386\u53F2\u7248\u672C\u3002",
    "This is the current plan detail returned by GEA; it does not describe a selected historical version."
  ],
  includeDetail: ["\u53D1\u9001\u65F6\u5305\u542B\u5F53\u524D\u8BA1\u5212\u8BE6\u60C5", "Include current plan detail"],
  noVersions: ["\u63A5\u53E3\u6CA1\u6709\u8FD4\u56DE\u7248\u672C", "No versions returned"],
  chooseVersion: ["\u9009\u62E9\u8981\u5206\u6790\u7684\u7248\u672C", "Choose the version to analyze"],
  selectedVersion: ["\u6240\u9009\u7248\u672C", "Selected version"],
  skus: ["\u67E5\u770B\u6240\u9009\u7248\u672C SKU", "View selected version SKUs"],
  skuCode: ["SKU \u7F16\u7801", "SKU code"],
  materialDescription: ["\u7269\u6599\u63CF\u8FF0", "Material description"],
  productCategName: ["\u54C1\u7C7B", "Category"],
  baseQty: ["\u57FA\u51C6\u6570\u91CF", "Base quantity"],
  qty: ["\u6570\u91CF", "Quantity"],
  price: ["\u5355\u4EF7", "Price"],
  amt: ["\u91D1\u989D", "Amount"],
  amtBase: ["\u57FA\u51C6\u91D1\u989D", "Base amount"],
  regionConfirmedQty: ["\u533A\u57DF\u786E\u8BA4\u6570\u91CF", "Region confirmed quantity"],
  regionConfirmedAmount: ["\u533A\u57DF\u786E\u8BA4\u91D1\u989D", "Region confirmed amount"],
  provinceConfirmedQty: ["\u7701\u533A\u786E\u8BA4\u6570\u91CF", "Province confirmed quantity"],
  provinceConfirmedAmount: ["\u7701\u533A\u786E\u8BA4\u91D1\u989D", "Province confirmed amount"],
  areaConfirmedQty: ["\u5927\u533A\u786E\u8BA4\u6570\u91CF", "Area confirmed quantity"],
  areaConfirmedAmount: ["\u5927\u533A\u786E\u8BA4\u91D1\u989D", "Area confirmed amount"],
  categoryConfirmedQty: ["\u54C1\u7C7B\u786E\u8BA4\u6570\u91CF", "Category confirmed quantity"],
  categoryConfirmedAmount: ["\u54C1\u7C7B\u786E\u8BA4\u91D1\u989D", "Category confirmed amount"],
  noSkus: ["\u63A5\u53E3\u6CA1\u6709\u8FD4\u56DE SKU", "No SKUs returned"],
  includeSkus: ["\u53D1\u9001\u65F6\u5305\u542B\u6240\u9009 SKU", "Include selected SKUs"],
  allSkus: ["\u9009\u62E9\u5168\u90E8\u5DF2\u8FD4\u56DE SKU", "Select all returned SKUs"],
  selectedCount: ["\u5DF2\u9009\u6761\u6570", "Selected count"],
  complete: ["\u63A5\u53E3\u8FD4\u56DE\u5B8C\u6574", "Complete upstream result"],
  partial: ["\u63A5\u53E3\u4EC5\u8FD4\u56DE\u90E8\u5206\u8BB0\u5F55", "Partial upstream result"],
  unknownCoverage: ["\u63A5\u53E3\u672A\u63D0\u4F9B\u603B\u6570\uFF0C\u8986\u76D6\u8303\u56F4\u672A\u77E5", "Total not provided; coverage unknown"],
  preview: ["\u9884\u89C8\u53D1\u9001\u8303\u56F4", "Preview input"],
  previewTitle: ["\u786E\u8BA4\u4F1A\u8BDD\u8F93\u5165", "Confirm session input"],
  previewHelp: [
    "\u4EE5\u4E0B\u5185\u5BB9\u5C06\u4F5C\u4E3A\u56FA\u5B9A\u5FEB\u7167\u4FDD\u5B58\u5230\u4F1A\u8BDD\uFF1B\u540E\u7EED\u67E5\u8BE2\u4E0D\u4F1A\u4FEE\u6539\u5B83\u3002",
    "This input is saved as a fixed snapshot. Later queries do not change it."
  ],
  fullInput: ["\u67E5\u770B\u5B8C\u6574\u53D1\u9001\u5185\u5BB9", "View full input"],
  missing: ["\u7F3A\u5931\u4F9D\u636E", "Missing evidence"],
  missingDetail: ["\u672A\u5305\u542B\u5F53\u524D\u8BA1\u5212\u8BE6\u60C5", "Current plan detail omitted"],
  missingVersion: ["\u672A\u9009\u62E9\u7248\u672C", "No version selected"],
  missingSkus: ["\u672A\u5305\u542B SKU", "SKUs omitted"],
  bytes: ["\u8F93\u5165\u5927\u5C0F / \u4E0A\u9650\uFF08\u5B57\u8282\uFF09", "Input / limit (bytes)"],
  analysis: ["\u786E\u8BA4\u5E76\u5F00\u59CB\u5206\u6790", "Confirm and analyze"],
  analysisScope: ["\u5206\u6790\u8303\u56F4", "Analysis scope"],
  analysisSummaryScope: ["\u8BA1\u5212\u6C47\u603B\uFF08\u4E0D\u542BSKU\uFF09", "Plan summary (without SKUs)"],
  analysisDetailsScope: ["\u5B8C\u6574\u660E\u7EC6\uFF08\u542BSKU\uFF09", "Full details (with SKUs)"],
  analysisScopeHelp: [
    "\u6C47\u603B\u4EC5\u542B\u5F53\u524D\u7248\u672C\u7684\u91D1\u989D\u3001\u6570\u91CF\u3001\u7EC4\u7EC7\u4E0E\u72B6\u6001\uFF1B\u5B8C\u6574\u660E\u7EC6\u5305\u542B SKU\uFF0C\u53EF\u80FD\u8D85\u51FA\u8F93\u5165\u9650\u5236\u3002",
    "Summary includes only the current version's amounts, quantities, organization and status. Full details include SKUs and may exceed the input limit."
  ],
  analysisTooLarge: [
    "\u6240\u9009\u5185\u5BB9\u8D85\u51FA\u6A21\u578B\u8F93\u5165\u9650\u5236\u3002\u8BF7\u9009\u62E9\u201C\u8BA1\u5212\u6C47\u603B\uFF08\u4E0D\u542BSKU\uFF09\u201D\u6216\u51CF\u5C11\u8BA1\u5212\u6570\u91CF\u540E\u91CD\u65B0\u9884\u89C8\uFF1B\u672A\u53D1\u9001\u4EFB\u4F55\u5185\u5BB9\u3002",
    "The selection exceeds the model input limit. Choose Plan summary (without SKUs) or select fewer plans, then preview again. Nothing was sent."
  ],
  receipt: ["\u786E\u8BA4\u5E76\u9A8C\u8BC1\u4F20\u9012", "Confirm and verify handoff"],
  receiptMode: [
    "\u672C\u5730\u9A8C\u8BC1\u56DE\u6267\uFF1A\u4EC5\u9A8C\u8BC1\u6570\u636E\u4F20\u9012\uFF0C\u4E0D\u662F\u771F\u5B9E AI \u5206\u6790\u3002",
    "Local receipt: verifies data handoff, not real AI analysis."
  ],
  modelMode: ["\u771F\u5B9E\u6A21\u578B\u5206\u6790", "Model analysis"],
  sessionHelp: [
    "\u5206\u6790\u5F00\u59CB\u540E\uFF0C\u53EF\u5728\u6807\u51C6\u4F1A\u8BDD\u4E2D\u53D6\u6D88\u3001\u67E5\u770B\u5931\u8D25\u539F\u56E0\u6216\u660E\u786E\u91CD\u8BD5\uFF0C\u5E76\u7EE7\u7EED\u8FFD\u95EE\u6B64\u5FEB\u7167\u3002",
    "In the standard session, cancel, inspect failures, explicitly retry, or ask follow-up questions about this snapshot."
  ],
  openSession: ["\u6253\u5F00\u5DF2\u63D0\u4EA4\u4F1A\u8BDD", "Open submitted session"],
  approvalWorkspace: ["\u9500\u552E\u8BA1\u5212\u5BA1\u6279\u5DE5\u4F5C\u533A", "Sales plan approval workspace"],
  approvalEyebrow: ["\u53EA\u8BFB\u5BA1\u6279\u9A8C\u8BC1", "Read-only approval validation"],
  approvalTitle: ["\u9500\u552E\u8BA1\u5212\u5BA1\u6279", "Sales plan approval"],
  versionLabel: ["\u7248\u672C", "Version"],
  latestVersion: ["\u6700\u65B0\u7248\u672C", "Latest version"],
  mixed: ["\u591A\u6761\u8BB0\u5F55", "Multiple records"],
  organizationValue: ["\u7EC4\u7EC7\u503C", "Organization value"],
  readOnlyBanner: [
    "\u6682\u4E0D\u53EF\u64CD\u4F5C\uFF1A\u5F53\u524D\u4EC5\u5C55\u793A GEA \u6570\u636E\uFF0C\u5BA1\u6279\u548C\u5199\u56DE\u63A5\u53E3\u5C1A\u672A\u63A5\u5165\u3002",
    "Actions are unavailable: this view is read-only until GEA approval APIs are connected."
  ],
  businessNavigation: ["\u4E1A\u52A1\u5BFC\u822A", "Business navigation"],
  openBusinessNavigation: ["\u5C55\u5F00\u4E1A\u52A1\u83DC\u5355", "Expand business menu"],
  newConversation: ["\u65B0\u4F1A\u8BDD", "New conversation"],
  geaBusiness: ["Synear GEA", "Synear GEA"],
  brandSubtitle: ["\u667A\u80FD\u4F53\u5DE5\u4F5C\u53F0", "Agent workspace"],
  functionArea: ["\u4E1A\u52A1\u5DE5\u4F5C\u53F0", "Business workbenches"],
  workspaceArea: ["\u5386\u53F2\u4F1A\u8BDD", "Session history"],
  homeEyebrow: ["\u601D\u5FF5\u4F01\u4E1A AI \u534F\u4F5C\u4F19\u4F34", "Synear enterprise AI copilot"],
  homeTitle: [
    "\u8BA9 AI \u8FDB\u5165\u5DE5\u4F5C\u6D41\u7A0B\uFF0C\u8BA9\u667A\u80FD\u6210\u4E3A\u7EC4\u7EC7\u751F\u4EA7\u529B\u3002",
    "Put AI into the workflow, and make intelligence the organisation's output."
  ],
  homeDescription: [
    "\u4ECE\u4F60\u6B63\u5728\u89E3\u51B3\u7684\u4E1A\u52A1\u95EE\u9898\u51FA\u53D1\uFF0C\u5206\u6790\u6570\u636E\u3001\u534F\u540C\u8BA1\u5212\u3001\u63A8\u52A8\u4EFB\u52A1\u95ED\u73AF\u3002\u9009\u62E9\u4E00\u4E2A\u573A\u666F\u5F00\u59CB\uFF0C\u4E5F\u53EF\u4EE5\u76F4\u63A5\u63D0\u51FA\u4F60\u7684\u95EE\u9898\u3002",
    "Start from the business question in front of you: analyse data, align plans and close the loop. Pick a scenario, or just ask."
  ],
  homeFunctions: ["\u5E38\u7528\u529F\u80FD", "Common tasks"],
  homeFunctionsHint: ["\u628A\u5DE5\u4F5C\u4EA4\u7ED9 AI \u534F\u52A9", "Hand the work to AI"],
  homeQuestions: ["\u63A8\u8350\u95EE\u9898", "Suggested questions"],
  homeQuestionsHint: ["\u4ECE\u4E00\u4E2A\u597D\u95EE\u9898\u5F00\u59CB", "Start with a good question"],
  homeAlerts: ["\u9884\u8B66\u4E8B\u4EF6", "Alerts"],
  homeAlertsHint: ["\u6709\u9700\u8981\u5173\u6CE8\u7684\u65B0\u53D8\u5316", "New changes worth a look"],
  homeAlertsEmpty: ["\u6682\u65F6\u6CA1\u6709\u9700\u8981\u5173\u6CE8\u7684\u9884\u8B66", "No alerts need attention right now"],
  homeAlertsFailed: [
    "\u9884\u8B66\u6682\u65F6\u53D6\u4E0D\u5230\uFF0C\u53EF\u4EE5\u5148\u53BB\u4E1A\u52A1\u5F85\u529E\u67E5\u770B",
    "Alerts are unavailable; open the business inbox instead"
  ],
  homeAlertsOpenAll: ["\u67E5\u770B\u5168\u90E8\u5F85\u529E", "Open the business inbox"],
  homeFunctionsPanelHint: ["\u70B9\u4E00\u6761\u5C31\u76F4\u63A5\u586B\u8FDB\u8F93\u5165\u6846", "Pick one to fill the prompt"],
  homeQuestionsPanelHint: ["\u70B9\u4E00\u6761\u5C31\u76F4\u63A5\u586B\u8FDB\u8F93\u5165\u6846", "Pick one to fill the prompt"],
  businessFunctions: ["\u4E1A\u52A1\u529F\u80FD", "Business functions"],
  planManagement: ["\u8BA1\u5212\u7BA1\u7406", "Plan management"],
  salesPlan: ["\u9500\u552E\u8BA1\u5212", "Sales plan"],
  regionalPlanWorkbench: ["\u533A\u57DF\u8BA1\u5212\u5DE5\u4F5C\u53F0", "Regional plan workbench"],
  categoryPlanWorkbench: ["\u54C1\u7C7B\u8BA1\u5212\u5DE5\u4F5C\u53F0", "Category plan workbench"],
  mpsPlanWorkbench: ["\u4E3B\u751F\u4EA7\u8BA1\u5212(MPS)", "MPS workbench"],
  apiLog: ["\u63A5\u53E3\u65E5\u5FD7", "API logs"],
  inboxNotConnected: ["\u6D88\u606F\u5F85\u529E\u63A5\u53E3\u5C1A\u672A\u63A5\u5165", "Message inbox service is not connected"],
  messageInbox: ["\u6D88\u606F\u5F85\u529E", "Message inbox"],
  agentPanel: ["\u9700\u6C42\u9884\u6D4B", "Demand forecast"],
  agentPanelModel: ["GEA Personal Model \xB7 \u53EA\u8BFB\u5206\u6790", "GEA Personal Model \xB7 read-only analysis"],
  agentPanelHelp: [
    "\u5206\u6790\u7ED3\u679C\u5C06\u5728 dsh \u4F1A\u8BDD\u4E2D\u751F\u6210\uFF1B\u6B64\u9762\u677F\u4E0D\u6267\u884C\u5BA1\u6279\u6216\u5199\u56DE\u3002",
    "Analysis runs in a dsh session; this panel does not approve or write back."
  ],
  agentReady: ["\u5DF2\u51C6\u5907\u5206\u6790", "Ready to analyze"],
  agentWaiting: ["\u7B49\u5F85\u9009\u62E9\u8BA1\u5212", "Waiting for a plan"],
  sendToSession: ["\u53D1\u9001\u5230 dsh \u4F1A\u8BDD", "Send to dsh session"],
  agentReadOnly: ["\u4EC5\u53D1\u9001\u660E\u786E\u9009\u62E9\u7684\u53EA\u8BFB\u5FEB\u7167\u3002", "Only the selected read-only snapshot is sent."],
  agentAnalysisTitle: ["\u5BA1\u6279\u5EFA\u8BAE", "Approval guidance"],
  agentAnalysisEmpty: [
    "\u9009\u62E9\u8BA1\u5212\u540E\uFF0CAgent \u5C06\u5728 dsh \u4F1A\u8BDD\u4E2D\u751F\u6210\u9700\u6C42\u9884\u6D4B\u548C\u5BA1\u6279\u5EFA\u8BAE\u3002",
    "Select a plan to generate demand-forecast and approval guidance in a dsh session."
  ],
  agentComposerPlaceholder: [
    "\u53D1\u9001\u6D88\u606F\u5230 Demand Forecast and Plan Submission Assistant\u2026",
    "Send a message to Demand Forecast and Plan Submission Assistant\u2026"
  ],
  agentInputDisabled: [
    "\u5F53\u524D\u9875\u9762\u53EA\u53D1\u9001\u53EA\u8BFB\u5FEB\u7167\uFF0C\u6D88\u606F\u8F93\u5165\u5728 dsh \u4F1A\u8BDD\u4E2D\u8FDB\u884C\u3002",
    "This page sends read-only snapshots; message input is available in the dsh session."
  ],
  readOnlyPreview: ["\u53EA\u8BFB\u9884\u89C8 \xB7 \u4E0D\u6267\u884C\u5BA1\u6279\u5199\u56DE", "Read-only preview \xB7 no approval writeback"],
  approvalQueue: ["\u5BA1\u6279\u6838\u5BF9\u961F\u5217", "Approval review queue"],
  planCount: ["\u8BA1\u5212\u6570", "Plans"],
  targetSummary: ["\u76EE\u6807\u6570\u91CF / \u91D1\u989D", "Target quantity / amount"],
  currentSummary: ["\u5F53\u524D\u6570\u91CF / \u91D1\u989D", "Current quantity / amount"],
  progress: ["\u8BA1\u5212\u8FDB\u5EA6", "Plan progress"],
  organizationView: ["\u7EC4\u7EC7\u89C6\u56FE", "Organization view"],
  allOrganizations: ["\u5168\u90E8", "All"],
  byBase: ["\u6309\u57FA\u5730", "By base"],
  byRegion: ["\u6309\u5927\u533A", "By region"],
  byProvince: ["\u6309\u7701\u533A", "By province"],
  byArea: ["\u6309\u533A\u57DF", "By area"],
  byDealer: ["\u6309\u5BA2\u6237", "By customer"],
  noOrganizationData: [
    "\u5F53\u524D\u7ED3\u679C\u672A\u63D0\u4F9B\u8BE5\u7EC4\u7EC7\u7EF4\u5EA6",
    "The result does not provide this organization dimension"
  ],
  approvalStages: ["\u5BA1\u6279\u8282\u70B9", "Approval stages"],
  stageDataPending: ["\u8282\u70B9\u72B6\u6001\u5F85\u63A5\u53E3\u63D0\u4F9B", "Stage status pending upstream data"],
  stageCustomerAi: ["\u5BA2\u6237\u786E\u8BA4 AI", "Customer AI confirmation"],
  stageAreaApproval: ["\u57CE\u5E02\u7ECF\u7406\u5BA1\u6279", "City manager approval"],
  stageProvinceApproval: ["\u7701\u533A\u5BA1\u6279", "Province approval"],
  stageRegionApproval: ["\u5927\u533A\u5BA1\u6279", "Region approval"],
  stageCategoryPlan: ["\u54C1\u7C7B\u8BA1\u5212", "Category planning"]
};
var zh2 = Object.fromEntries(
  Object.entries(copy2).map(([key, values]) => [key, values[0]])
);
var en2 = Object.fromEntries(
  Object.entries(copy2).map(([key, values]) => [key, values[1]])
);

// src/company/navigation.ts
var BUSINESS_MENU_PRESET = [
  {
    key: "supply",
    title: "\u4EA7\u9500\u534F\u540C",
    icon: "synergy",
    items: [{ id: "inventory-apsplan", title: "\u4EA7\u9500\u534F\u540C\u5DE5\u4F5C\u53F0" }]
  },
  {
    key: "plan",
    title: "\u8BA1\u5212\u7BA1\u7406",
    icon: "calendar",
    items: [
      { id: "plan-region-category", title: "\u54C1\u7C7B\u8BA1\u5212\u5DE5\u4F5C\u53F0(\u5F00\u53D1\u4E2D)" },
      { id: "gea-proof", title: "\u9500\u552E\u8BA1\u5212" },
      { id: "gea-regional-plan", title: "\u533A\u57DF\u8BA1\u5212(\u5F00\u53D1\u4E2D)" },
      { id: "plan-category-production", title: "\u4E3B\u751F\u4EA7\u8BA1\u5212(MPS)(\u5F00\u53D1\u4E2D)" },
      { id: "plan-capacity-assessment", title: "\u4EA7\u80FD\u8BC4\u4F30(\u5F85\u8BBE\u8BA1)" }
    ]
  },
  {
    key: "inventory",
    title: "\u5E93\u5B58\u7BA1\u7406",
    icon: "warehouse",
    items: [
      { id: "inventory-qll", title: "\u5168\u94FE\u5E93\u5B58\u5DE5\u4F5C\u53F0" },
      { id: "inventory-aqkc", title: "\u57FA\u5730\u5E93\u5B58" },
      { id: "inventory-fc", title: "\u5206\u4ED3\u5E93\u5B58" },
      { id: "inventory-customer", title: "\u5BA2\u6237\u5E93\u5B58(\u5F00\u53D1\u4E2D)" }
    ]
  },
  // 保留开发中页面入口；页面仍遵守 mock 数据限制。
  {
    key: "orders",
    title: "\u8BA2\u5355\u7BA1\u7406",
    icon: "orders",
    items: [
      { id: "inventory-orderworkbench", title: "\u8BA2\u5355\u7BA1\u7406\u5DE5\u4F5C\u53F0(\u5F00\u53D1\u4E2D)" },
      { id: "inventory-orderfulfillment", title: "\u8BA2\u5355\u5C65\u7EA6(\u5F00\u53D1\u4E2D)" }
    ]
  }
];
function resolveBusinessMenu(preset, available) {
  return preset.map((group) => ({
    key: group.key,
    title: group.title,
    icon: group.icon,
    flat: group.flat === true,
    entries: group.items.map((item) => ({
      id: item.id,
      title: item.title,
      disabled: !available.has(item.id)
    }))
  })).filter((group) => group.entries.length > 0);
}

// src/company/agent-avatar.tsx
var import_jsx_runtime13 = require("react/jsx-runtime");
function AgentAvatar({ className }) {
  return /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)(
    "svg",
    {
      className,
      viewBox: "0 0 96 96",
      role: "img",
      "aria-hidden": "true",
      focusable: "false",
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("defs", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("linearGradient", { id: "gea-agent-tile", x1: "0", y1: "0", x2: "1", y2: "1", children: [
            /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("stop", { offset: "0", stopColor: "#fff6f7" }),
            /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("stop", { offset: "1", stopColor: "#ffe3e7" })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("linearGradient", { id: "gea-agent-head", x1: "0", y1: "0", x2: "0", y2: "1", children: [
            /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("stop", { offset: "0", stopColor: "#e8464f" }),
            /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("stop", { offset: "1", stopColor: "#c8121d" })
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("rect", { width: "96", height: "96", rx: "26", fill: "url(#gea-agent-tile)" }),
        /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("g", { transform: "translate(48 48) scale(0.88) translate(-48 -48)", children: [
          /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("path", { d: "M48 31V21", stroke: "#d71920", strokeWidth: "3.2", strokeLinecap: "round" }),
          /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("circle", { cx: "48", cy: "17.5", r: "4.4", fill: "#e8464f" }),
          /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("rect", { x: "17.5", y: "47", width: "7", height: "15", rx: "3.5", fill: "#f5b3b8" }),
          /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("rect", { x: "71.5", y: "47", width: "7", height: "15", rx: "3.5", fill: "#f5b3b8" }),
          /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("rect", { x: "23", y: "31", width: "50", height: "43", rx: "15", fill: "url(#gea-agent-head)" }),
          /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("rect", { x: "33", y: "41.5", width: "30", height: "22", rx: "11", fill: "#fff7f8" }),
          /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("circle", { cx: "42", cy: "52.5", r: "3.6", fill: "#c8121d" }),
          /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("circle", { cx: "54", cy: "52.5", r: "3.6", fill: "#c8121d" })
        ] })
      ]
    }
  );
}

// src/company/business-icons.ts
var BUSINESS_GROUP_ICON_PATHS = {
  synergy: [
    "M955.934118 656.986353a30.117647 30.117647 0 0 1 30.117647 30.117647 271.058824 271.058824 0 0 1-396.649412 240.278588l6.927059 29.515294a30.117647 30.117647 0 0 1-56.922353 18.913883l-1.686588-5.180236-24.094118-102.4-0.783059-5.360941v-0.783059a30.117647 30.117647 0 0 1 50.898824-28.129882 210.823529 210.823529 0 0 0 362.134588-146.793412 30.117647 30.117647 0 0 1 30.117647-30.117647zM752.941176 0a210.823529 210.823529 0 0 1 210.522353 199.258353L963.764706 210.823529v132.517647a30.117647 30.117647 0 0 1-59.753412 5.421177L903.529412 343.341176V210.823529a150.588235 150.588235 0 0 0-140.709647-150.287058L752.941176 60.235294h-542.117647a150.588235 150.588235 0 0 0-150.287058 140.709647L60.235294 210.823529v542.117647a150.588235 150.588235 0 0 0 140.709647 150.287059L210.823529 903.529412h186.24753a30.117647 30.117647 0 0 1 5.421176 59.753412l-5.421176 0.481882H210.823529a210.823529 210.823529 0 0 1-210.522353-199.258353L0 752.941176v-542.117647A210.823529 210.823529 0 0 1 199.258353 0.301176L210.823529 0h542.117647z m145.468236 434.115765l1.746823 5.180235 24.094118 102.4 0.783059 5.360941v0.783059a30.117647 30.117647 0 0 1-50.898824 28.190118A210.823529 210.823529 0 0 0 512 722.823529a30.117647 30.117647 0 1 1-60.235294 0 271.058824 271.058824 0 0 1 396.649412-240.278588l-6.927059-29.515294a30.117647 30.117647 0 0 1 56.922353-18.913882zM361.411765 421.647059a30.117647 30.117647 0 0 1 5.421176 59.753412L361.411765 481.882353H180.705882a30.117647 30.117647 0 0 1-5.421176-59.753412L180.705882 421.647059h180.705883z m301.17647-180.705883a30.117647 30.117647 0 0 1 5.421177 59.753412L662.588235 301.176471H180.705882a30.117647 30.117647 0 0 1-5.421176-59.753412L180.705882 240.941176h481.882353z"
  ],
  orders: [
    "M825.6 64A70.4 70.4 0 0 1 896 134.4l0.064 399.744A70.4 70.4 0 0 1 960 604.288V889.6a70.4 70.4 0 0 1-70.4 70.4H134.4A70.4 70.4 0 0 1 64 889.6V604.288a70.4 70.4 0 0 1 70.4-70.4l-6.4 0.32V134.4a70.4 70.4 0 0 1 62.72-70.016L198.4 64zM234.176 597.824H134.4a6.4 6.4 0 0 0-6.4 6.4V889.6a6.4 6.4 0 0 0 6.4 6.4h755.2a6.4 6.4 0 0 0 6.4-6.4V604.288a6.4 6.4 0 0 0-6.4-6.4l-110.336-0.064 0.064 41.664a70.4 70.4 0 0 1-55.296 68.8l-7.424 1.216-7.488 0.384-1.28 0.32H295.04a296.384 296.384 0 0 1-3.84-1.6 70.336 70.336 0 0 1-56.96-69.12l-0.064-41.664zM825.6 128H198.4a6.4 6.4 0 0 0-6.4 6.4v398.592h106.24l-0.064 0.832h1.408L299.52 628.8l1.984 14.144 6.592 3.008h393.28l9.6-2.24 3.008-16.384v-93.44h1.28l0.064-0.832H832V134.4a6.4 6.4 0 0 0-6.4-6.4z",
    "M672 192a32 32 0 0 1 5.76 63.488L672 256h-320a32 32 0 0 1-5.76-63.488L352 192h320zM672 320a32 32 0 0 1 5.76 63.488L672 384h-320a32 32 0 0 1-5.76-63.488L352 320h320zM672 448a32 32 0 0 1 5.76 63.488L672 512h-320a32 32 0 0 1-5.76-63.488L352 448h320z"
  ]
};

// src/company/brand-logo.png
var brand_logo_default = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGAAAABgCAYAAADimHc4AAAy5UlEQVR4nOV9B7xVxbX+mpm9T7mFey8XpKMIREBN5G8M5uVJgMTYUDECsWA3McaGJXYEFTVYQ2LD+qKiiUhEo+LzJUA0ahITxQAWijQpl3b7vafsPfP/rTUze88591wEJYnv97Ye7in77LLKt761Zs0cBv/GTSnFYdEiDqNHhwxARR+Ul4NqaekFAPvlAYaw5cuHyPWf7iPrNvUMmpv7saYGXwb5SgjCJAcWsKTfxHv22cH3GbBEjBz5ewHwKmNstTmHYIyF8CXd2L/6hEopPCcHxmQk9GQSVCbTHwC+mXv//ZHyb387SC5bup9auarWX78W2JYtEDa3QJDNQqAUMN8DyRgoxoBLBYIBsEwWRDoN/tAhII84ssE7/Yx5fPDgnzHGPlYAnDEmQcU6/j+nACv4yBoTPqhs7oCwtXVsMH/+2OCN1/9f2XvvptWHH0KuvgHy6RTIvn2BfWU/KYYOVWKfAQA9ejLWtStjlRXAk0kGQgBICaq9XYVr1oD8YJkKF/wB1KLXeWXv3hBOvrjd++lV1zAhZiopOV0EY18+LfwzN7xn9eyzwnndVSl1dva1+QuaL7owUMOGqiyAakglVMOhI4KWq6/KZ176XZBbsVyGLS1KKrVbj7CtVWX/uEg2nXFavpExpU46SYUN22aRl02YIIwh/B/YECKUcgXfP2xt/Fn7A/dvUGNGq3YAtZ2DahwzKt92371BbtkyGWaysSDxIaUKg7wKcjkVZrMqREtvaVFhU5MK6+tVuG2rCrduUcHmzSqoq1PB9u20Dx0jDFX7fz0uG8vKcurI76l83aaHgHNQCxd68CXa2D8ruBLm6ue9oK35isx995+dfPKp6qYlSyHs3i1MnnEmJMaP52L4cAaJhP5iGAAEIcEKPfI5gPZ2UG1toJqb9aOtjd4D/JvNggpDULkcgNSxAaqrge/VA3ifPsD79YHgv1+Dth+clK86/jg//+ycKxKM3YVKYKNHB/Al2Lw9bvULFniMscBY/4W5hx+61r/vvr3a3/8HtA8YECTvukuUn3CC4AMGkPZVPg+QyQAoCSoISLCqsRGgvgGgfgdAUxNAexuotnb9OSoJBY7PMagGAbAgBIXKCgJQQR7y+QDAT4DYf3/wR4+GxI03ei3XXBOmb7v1Z0qp+YyxD74s7IjtUUrJGAKsUkp9E9568x649dYRDS+/ArJXzyB5yWSROvVUxvr2BaUkWS8zlk5W3dgIats2UNu3G6G3a0GHgbbwED1D6dco4DAAhtZvnqPnMFRiPk/7q2wOwoZ6YF26QPLUSZB9/reh99Qzgr388juJ74z5D2RhX4agvEcUYK3JBLjrM1On3AB33OW1tbcHifPPF8kLLmR86BBgMtRCRcGjtTY3g6qrA7VlC6iGRmAZI3T8DAUe5AFyef0XLR69xXzGUPD4Pu6Hz1GpqBDzsO+HmzeB6t4NkkccBe0PPBB2SSRF8MrLj/sD9j17avZqPk1N+7cq4QtDEOGphpx+cvHfH+NTpn635aWXFd9//7B8+nTPO+JIYIIDtLUSZKDFqsYGgI0bSfBo7SqbIQsmOEIFGMsnwUZekAeGn5O1I9Ro6CHFSC107VFKewLBlQRRXgHBqk8gN+dZSI87TtTf84ug5twfnRVu3NjAu3a9AubM4Riz/11K+EIeYINZXqnR/NfPzA4uu7xXw6ZNQdl5PxKpn17J2N79AdozJCCyyJZmUBs3gdqwQcNMLqeFjrCBGJ7NActkgAUaRvB9hsLG/XIGaqwCyENCYPjaBm2EKIwLCGvkEVIrRikItm4BqKkBb+hQaJ39TLb2vPOS8OCDE2HatLnwwQcMJkwANnFi+L9DAYzBwhtu8EbfeGMQKHW2mn7zg9kpN/jZmuqwbMoNwj/zLIB0koIrBdq2VlBo8es/BWho0FCCAs5mtBKyWQ01uSzFBnpOitFKIE+wQiclWJiR2tolChlI8AyJAHoTKgQ/I89Q9DdsbAApRNBl/2Fe7oILXk8cfezJjLGNUFamgz9m6JhpGwb3pVQA4vyiadMECj+n1HX+5Eum18/8hYJBg1TFnXdyccQRWqAEASGoHdtBrV4NsLkOIJeh4IiCZaiATEY/kE6i0PF7VugW822QDdHCY3ynv2jx6F0oNLR8+0CBkzcYz8PvegLChoagvLbWCx9/9F1x8IgjGGPb2nOt5/lvv3O+GPntaxhj8+keMXGcMEH9KxSxezGAMQAj/Hw+e5N3xhlTtj3xROiP+AYvu+NOzocfBKqlWcNBLg/y008BVn9CDEdju7HwTAZUJgsMBU+B13oAQk7ewIvJCVDYlBvY/MB6gYYYeg8c6LEwBOZ1GAIXAuS2hqC8b29PznrwHXHwiGNQ+EqpC8LLJt/bMOthKDvjjFfUqpVPwr4Db8H6Ed6u0nesvjQeYDE/VOFNfNJpU7bPfjrw//NbIn3HXcRyKDnCI7a2gly9GtTaNcDaDLPJtINqzwDLZbF2o2lm1sAPeoQVuHQFb2AHhWqCLTEpFGygIYaCbiRsfA//lxp2QAHjHGRTc1DWr48nZ81a1nbot8ZUMrYlUOp6cfFFNzfce6/MpVMq25bhNf36MTjllPaKM0+fDUOGPcgY+3tUupg2jcGNNzJYuDCW2ahRRtNYF/x8QXyXFaCUIraTU+oS/5xzfl7/2GOB+Na3RNmddzE2aKDGc2Q5iLPLVwDUbQZA4WfagWUzWvgZ9AD9XHtDjoRPjMXgPAmVYMcoAYVuFKKppoUix/rpAvEzbf3KxgOPY/wJ0t1qPfnoo0v5yDFHMsY2hErN4D/5yZUtDzwQhrVdueTAQj8B+camkLW2iYq9ekDF2WdBeNv0cwWIx3cFihZOneqNmjZN7i5sebsj/LxS472fXvHzHY89FvKvHSTKbpnO2L77ALS26Buv3wHy4+UAyDgwc7VlA8L6dhNsEYpMEM4b9oMCNriPrIa4vClJoMUT5SQFxBivFWKNzsF+A0UgOIQNzWF51xpPPvDACj5yzHcZY3WqreVuOG3Spa1PzQ5YbY0Q+Zw2Qqkg0a+vUOlUKLdtZ9nevbYlQbyHAlVK1eTf+tPDwZYtnurf9wPRs/fmZO++2wFgEwCsB4B1jLEs3HgjqKlTOUzb9dyC7UaS9bXgnrvfbLns8jQM2AfK772PMB/hBjgDtW07qI8/Ati2TVNPZD6tbQQ3lGChEmwJIR8nWIqgB/m+VQBat8Z4DT8G+/F9N9gSyyG8Iaghpdi/nIHMZMPyLpVCPvLIJ7ljj/9O2vfX5Dese8o790entv7upYBVdfHwOmhQgpBeQi6Tlamycl7+zOwd+WOOOzrB2F9aleqTfOftl9g5Pzyo+dMN4FdVAZSlIZ9IgerSBfK9ewXJb4xYW3bccfO9gQPRW9515faFFED4R7xOVeZf+t3fgpNOGtTmeWHljNuFOPposmrNdHaA+ugjgK1bNRSh4NEryPoN7BDzcdmNZjgqNEzHfkaBVscBUgBZp8Z6Sy214DXO6+tE3k+EV9PeIAwTCV+wxx7fEIyfMDqVTq8IPljynDj3vBNbFywIWEU5Cd98m/4GoZSJUPLkzHvachdd8r0yxt5USu0TvjZ/Pv/lvUOac7k8r67CpE3JbBbCTAbCpiYuN9dx2LQZErXdQZ0wTlZfPvlpPmDQtYyx9buihJ1D0KJFggkRZFateMj/6ZWDdrS2BVXXXO15h38XZHMTcXBobAK1dCnAljrNcFrbtFdgAQ2ZjsX6wGC95fhYRsgbqmqeE8wQy4mxPoIdwnXjDYTzMe0k20fvAAZSSplkXPD77t+RHz9hzDqAdcG7f1soTjplVOtf3wlYKuXp4p+mOFoFTKaCkPl33tGuLrrkBCP8QcHcOfPDH/9kUMO2bQGvqvRZKgWqshIYVly710Ji8FdAjBylRE2Vyq1YKXc8+SsRvvjipIqpUw9XSp2FtHbhwoXe6J1UXjtVgNEeJlpniZNPnrj5o4+C8mOO8fwTx2tYQSG2tID86EOAjRs0xKDFo/VjUtPeFkON4fbMWn1QqACGuG8DraGOGs/RynWgRXqJQiYvwNhA14gubGknIPdRqVBy9st7Wvlpp49KAqzb950/LxJnn3toy9JlAU/4HgZ/C854DMm5EvkAEjffGMjLrzjFZ+w1pdRXw9lPzFMXXjKguaEhTPjCk43NoBqbQdZtBTRpfOCVMc4Y79ePlY8ZzXvddis0Pv98sOncc3t0X736FaXUJMbY7J0pwdtJZRODT//sfff+vOXXvw4Tgwby9Hnn6QyXWEwG5PKPQa1ZQ+WDqEZvnyPrMcU0CrS25GAx3xbbApssmezVspzI0g3DMUJGhZAy7LXafxlXngLF77yjMbjgwpECYG34h9feEOed//WWVZ8E3Pc8UrxWGQk/5EJ5+UCmr7+G566/4YwkY/NySn1TPv7YPLjkkr3amlvClCeExJqSwO8x8BnaBgPsIpBKQYhljrXroOHxX0Hbm29C7Rmne0wpWXfLLajcXymlNjLGFnYGR515AGNCyPZlS2cmb7+9S5Pvh1VnnsXZPnsDtLTq4Ll2LahPPtH1nUjomttTqdkwHqrpkNCxvmNw3tZ0Qh1co4eBnwhe3KTKKIC8QHUMYMT5gfFg4yaRADg4P+fXT/uTLzugZeOmgHmeF+J56Qta/FIIxfJBmL7iUi+8+dbzkow9k1NqpHjw/heCyZdWZ7K50BNcoLfRsB5eAkMPxBiPoKWPhA0BnuAQMAbZ5Suh7vY7oWrsMdzfZ2+57uabRa+BA2crpQ6EadPq3YGqSNA7YT1Hwo9+OH/rw4+E6aOPFulrrwHwPOLvVLd/f7Gu3aPwEfcx+Brh6zqPpZym4GaFbCqZkRdIXc/R5QUNOxG2W+y3Vu6+tFfvvIf7CwVQds7ZkHv+eWjfUS+FJ3gUzO1+noewE5b/5Mde/r4HLkkw9ou8UmP43XfOy115VWVOypBzLtALkYN0EJR5QeCIjNhAUp5zyCJ5qCyHRP/+UP/hx0HN4EFezav//Uj5gAE/xBJHccGvUAE4gK7f89vmPf93ddLJwzKVlarL7bdzPmyoLim3tYJcsgRg/XpdRmgzDyqs6YKayuZ1rSdvFGDYjS4R6yomFFQxZZTVapw3WazFiujyHMgx0tcU0lELkrYQi0DoxYzTMc3e9A3Pw7GEoOL0SV74qyev9xi7Ja/UifzW6b/KXT+lHIeJBAdOJQ37HboGy7KwBwardpFZkCLwhIECyKMnhBLCVAK456nGljZZe9nlrN9ddx7EGFuqnn2Wu0qwx9EHQ9bDKNk/Lf3II/s3ZrMyfexYzgcPwkYpghq1bi2o9etAIdNBODJcnx6YfFHGi0kX1nts8c0pL1OJOR5YgWgQRSKDMRATW3sBGul3nFsHygsiHZE0FDBPCMa18I1OrOWj8PMV40/EzPh2FH5WqUn8pmnPZa6bUp5lTHIWC5++Yw9uIRD/Q6u3qYdRjTB47ikFvuBEucNMhnmcQdvsp3j9O+/cgCOGncYAU/NA6Clrf/qpa4P5r6pEr17MH/nteNy2fgeoFSsBmpq1pbcZ7LdwY8rMhPW2xIDJFZYTTHZLpQWTWDFTtSSBRzKNbdwxjcjoNfNxhOO8jrYiyNFgLZB1hRVHHuEHD8160PeTVymlzpRXX/l424w7pDZ7ReVo92sFx48cT79pfcR6KjeKEErR8xw2jQkhmuvqZNnTT39fSfk1xtj7biyIPUBbP/ruyamnZg9olVKWH3kEx+4CKjUg9KxYAXJzHfF7aDWsBy3flJSjB3J/m2y5dR7zXI/jIpvRDxto4/+spbkWb3ajzLWEcHa2YUEuCGXlNw4RctaDT/pdu50fKHUhTL748fYZd8jQE6xY+Fq0pYKk85e8E0t/8bUI54HCxfvzGZPtc+fypmXLLqLvzpnDOrKgUaPQ+r32uXMuDv/n98qv7Qb+iBEAoW4NgbotoNavj+r3REUxBpgBFKR4zBW6HTJEjm8s3gZdi8sqEryWqOqA8IUWT0JxnaWDp5TYdIyQ5TU1PHzo4cXe0GGnKxVcAxddeGvzvfeFCqmODKnC4Z678+MVnTSyBIoOhUpgAHkkBp4Q9evXK/+5505SSt2Ag0DWC7jDfPBQo/x5L3y1JQhU4tARgnXrRgPnmNki9rMdO3R1ExMtW2gjypkphCGycs3/daUzxnxUBvJnCzsqehTeVak2TlucdxMp97ETJbB8UxPkpk4dEG7c8Lz6wckofKk8j7MwFn4p+XbYOvnQ3g0KlBvLRkZGXqAU89D8Xn6lPNvaehrtik3JkQdMnEh31/7nt89j819V3PNkYvhwTjUWpJhbt2rrNwInyLGeYARM9XxnIEUPrOB7Rrxk+R082GwO7pe6QUs3Xf5fQlIlhaejOEOG4r3wQhU/+JBxTatWSRCc03hyJ6fb1S1mWPGZuYkH3CgAvd7nnDe++3dIP//8JKXUHWCSMj4VXWHOnFBJ2SP/6vyjGrdvZ4nBg4To00cLHy19wwZQ9Q26jo8lhixWOJHtoBJMldNQzqjETFZvSws2e415DD1Tlup00EgkiCh3su9FEbgEEpQQXnQMBhAIpppWrQoZCp9KHF98cy6nw/vC9VDBeRCGsm3Bwv0B4GDTPyX4NCBXQHUcXfnGn8oRqf2hwxgrT2ve39wMErsY8Lnl/Ug9TX2ftevAi3STYMdQTEzfidqbDoUI0yPhFwqvMwG6+1hl2P0LYsNOhBSdSirMDSi73SMbi40ijgA6f0Hrt7EAP0ME8LDO+/ZbrGnt6nH0xUWLmDdn4v0KOFfZ116dCH/5q/LSKfAH7quHDZHLb94MsGN7XGqwMGRaAalsbNmMtB0I+gYjegkMQmP9eHHFwmadBNWdBcRdhQn3XPTc4fjF597drZgQ2COSQgz8IMbjX5zXwDnjLStWQMOCPx6DwRhhiE9E+AnD2vwbb/xHS2sr8/r25VhqJYtvaQHYvBlUU7OBHz3EaAfVdaENH5b12HHZuIZjM0V7wSWbw1lhIO0ssH6WlziH6/C8s9CyWxsr8ZQwUb+KSyL6HRuQuf1ECJYLQ5V59+8HAsBAhCGbB/xn2dKlXXKMhT4OTHu+DrQNTSDr6iLBoxJQ8DS4YoKv7VBjhtdH9XmsFqLrRXUdc72lJKE6F0qJ0FD8lZ1une0XC3AXD1R07fTUsRj7kTNKXaQEjU4+QCiWLOUhwEiw77d/vGyMWrIE02jl9dgLAEepkGoi9GAjFSZWNKRoE6zCYpoekSpMpLSnx6MexVb5WfetChhGx+/sLFaUOp973gLhl6K7nwF99GCdn68gprnerXRlNfjoQ2h88+3/wLc87M2X7/9jeLhmHfCyNBM1Nbqmg9wfq544+BJVNV3Bx9HQLXfJ+M0ikZQWFttFIe7q1pmSXFm75R2XJXXIPXYnQNh9yRtYXLtyEknMf6RgPLN1C7QuW3Ig5gdcZbM1+aUf7JfBBqaaGs7K0rqlEJlOfb2p61usx7KyGYs1NRztcih4dD+HouymsKBI2hHX362DFL5XipLi5l5iAZQU7190H+5L69fW0TswajdeGC/ATQrBMlJB+4qVgwBgLwzSQ2H16u45AEhVVVEIJ/ynameL4fQmo40gBzkWzlIUpNWO14/KIfIVp68uhyT/LbJ/HAUrVQjjnGo5hYe3ZmVxwJ7HGegtKmnQZhp1C+RqL49x6uJ2iiOGQLr3pDsoIkptntOnNIrn5Dm2RuTctilbsxyAqli3tgoAvuLlAIb4GzagsqWoKNODF0gzW1uoqVZ3K9jGKBNMUUn5EPA/SiI6SURcIXzWppxSQ/R9rGBSd4TOI3ZnK8w7nGug2kDhRTMh6H5ohK6T6y4uf2iPjw9H+/gelVsIFWjIEvR0WqfsgkOYaMZs8yaRD8NhXvDJyq/A5k14IMVxrhbW75FyYq0f/5ryArIcUoAp9fID9wf+3e+Bv99XaJ6va33UoVCslSJMiQdcGKhNGyF3989BYtCn75ljBSHgWIR3/PHABw8G5fvmMCW4UqRB1zvMuAI+XbMWcnffDRI9OzoH7sYB8iF4ffsAGzsWxIEHUt8P+a/1brxGfWPm1LFQEa6DJUsgnD8fwjVrQeFcCGOoMRzZ/fGvVlyubgtk164d5Kl1a/fBpiq6Fj+hSwrI81taCfN1oxQK3XSjlZdDYuZMEKefDsz3P3cS424M/9l3ILSfdDIwX+irDkJI3jAFvKuuBmof3wPnkLW1kL34En0OhCMuiEKLCy+E5E030fyBzxN3EcdVUxOIW26BtttvB4Wd2BIhSOnCo/Fs/Vp/N1dfD7ktmwd64bYdPQPEekR/xFpkO6gArPmYXnw7JMWSKUi8+CLwMWPofZnLaUzFDNgYFV2YxdWiek1xUsQoRdcT6thBB2kjoIl3EpI3Twf/+ut0tzNeE40dG1c21htbKVqosWi6EbufOSlCaDIJbPjw6LqACxogSl55JfgzZpBwkO0RjbbJZCkvLmiZZtQCSVdQWQnpGTNApVPQfONNpASJ126c0o0N+G6urQ1yW7fXeqqpvht2eTHP02GS6vxmYAUVgHUcAwfip1dp4WOQTiQ0dgoRjeoUh9ZSLITuvQSmqjff1G8EEvhXvwretddq1oWlRRxK5Lzg+MXPS+G1C/e4yd/9Tj/BIcNsHvjQocCn36KTSXwfmw44qtMNvoXHde8tgiWnNT49dRq0vfAC5Ba/D+BrJaByo++iLLmCfHs7hI3NNZ5sbulKikJNItxggS1v28axhq97/SGVBHH22XpABS+UmJCguV65ec9T5ZThCIShFS6TKOAdtnBlMmTmeRCu/xSCWbNoEoUMQvAnTsSGJ1CBYVN4batWQW7WAzQOwVEpneBEBzKAp8EJ2uvWQfDCi9F3cT//jDOBY+DMZYEJXZnH4VT527kgsekA788dAsV7snEODbJvHxDjJwLg/GTSRQiceZA680xom3wpKMYhVAEN2FsWROyIKuEhhK0tXT2ZyyV1NGd64Jxmq9iJcqaAH0rge/cG1rePpoSoBLypTz+F9sP+EyQGn06svbPN/VxZKzY3wocMidwWLR89IXPi9yF4/x8F3y2VXBUroWAfG7yx7QBfY3MxBVZaRoLOlT3/x5B/7PGdXr97Tn/+f0PqiV/prg7DPMRBB2mB4+BTie4Jy6CCttakJ9sz8Xh/NotdxbqP304HtbeGOE1WojGfex7k/+c1ivwsndLthYSPTHtMCaHsDJKYLpDrD9DyXFzBz8rLIkgpPlZnxy343LCTOEcBYBjcDUMhQrF9O+Sfe46gFb2x1JhBlMaQYYSQmzcPktt3AOtWCyAxm2LAy8pNOUa3zVDwLdCeSVxzOezm01rBkfzI8lH4dtZhwa3YqGpuGSEKsdmOASN+htoCxPgTKdC50ukQhBW2igjqMco//IjG/OIbxhjk+ZB+fh6Ec+cSXBgci7M19yTuIDImRijMlSsg/+Asw+ZMguhcSfTtMACeSoFEOHXaId3rR+FTmcG2vKRTcQxx5GQlR4I2+YBVROTxnIPHysrMBENFrIYGVLAYZ2r8UeZnuG2BVeNnZjKEhiYFrH9/SC1cBFCNid5ubIO/AtmLL+5ozcjT8Rx79QDv/J9EgugMeoo/i262uhoyN9+iYc6dWeNkvniPOLteEPUuFHxHOMIRDgBZ3xCjhLNTBDm2c85kxqbVmL4hEgnlsVSqHSxe5bIggzxw05tPbYIsWvDEuaDYcgqiu5LgHXiAFj5SW4e5dBAcBnKmgxlLJIAfOqLEeeIzEDHAfdGSTEKkSwOFYiq+MjKodBmoQ79ZdOwiJeMxq6qhbO5vdfGxQ1re8eokLpeQTAFUd+lQBrHCR6t3cZ8OKZXyGTAvXVbvQUXlNiZEH0kMSDdV4UVbF3KrMMUl2ALnNxcQLPsAkij8ioqSFDFCB/y2NIELYQInaZewNN16qJNE7hee06WzHRQcvZsiOJFPPtlhn4Ibw+tPJsEfe2xJgykUvX7fmmbUTBzJx5ioMyaCM3FIIZQRKvASSfBru7Z6rKbrNkinsPSgwlyWUXKFyigR8GIlG4LpQi8mShiY1qyB9u+MATHxB0RXC1CWhuokAJ78tNMoqyb2QNLUgalA+PgP1oE8D+Rbb0J25kwdoyLrjGsstmfTcvMI6zFXWb0awnffM9Q20AHUPY9tfUdBISWNkqaOjhCxM2scxN78out24caNA1o5eJ5EeRl4tTVbPdGze52orISgpVURB87l9BCarXlYrRaYgp0KpG8Gb9IyBukJUH99B4K/vhMpsFio1EM5diywioq43lJqw89QgNkMtJ5xJsDKlY7AC62x5Ned5xyDPV1jibPZmI5r0CVTnbIsNwEseO30OdkTu7BTPEqGL0VFF0h022uDJ/r3Ww7du0G4aTNgD73M50BiaRbpGXfKCdgTb+0ZeTMKcdj+kMObwmHKjvfUOV0cMgSge3eHOxf2cxYci7qdQxA46a+T4NuZAgvex3IEbh7ifdF+aJ74fkMDtP7oXGBNTdqbTZkjuia3MQyvC+NmeQVUPPQo8K7Vug9KV0MgcCzfLUfY+03v1Q0Sffqs8sp69fu4qVcvCP6xlHnYVo0e4HnYqKo9wLSUSBwda2oGVttVlwcwRxg5ElL3/gLyDz8KMpvRRSmnqw0T45gp6qvgvXpDYsYMgFRKj65RVVSBxOYvmxPgsgbGM/CmkFen77kH2qbcQCN0dFy6LhYdV1dgXXeNR0EkKZoDw+biljbN2kp5Ti4L4Qsv0MIgnZUirDXb50iR4V6kxoVbZPkG+8kjaHxDX7XXqxcka2o+Rsdclu/TF+ede6RRbKs2p+dEeiWl2mpHPcg3/wTi+ON1gub5BDveBReBd8GFepy4lNkX36nFS8xGuS4FoxDxxqMA/crLAD8+T1sn5hIYXyb+AMrGjdPl8lIDOoXRqvA53TlOpd0GubPPguCPr+tjF2mAvlVVDWxHvbYeW0yLiirxLRIFx5b66qooFtj7tIMx0VwyowTjAQgsXPXqjVnbh2gKK7zBg9ZhRMcZhkEuBxJHd6hnwpmGwBjkpk2lLJklknrKEeYJmBhhyQKx2sQDSsDMQ+ED3zOFO0rybJkjnwOWTELw5z9D/je/0ZaJ031eeQXkH/5ABT9qAjDrwpHSKysog2XlFcDKy+MHsi73eUU5BXnaD2c2ptOAy6SJa68hGmssLB7hs7NhnEZimrXpTKOKFoIynyFzDLRZm/hiptRiDciWG8zEDa00Yisqidxs0ECc5L2GM84zZQceuDRRXo5zZVWYz0NINQyuR3PsQT0OweL3of0HEwBwrDiRJHZCyiChc22tdgjRPKiK6TynSRIoWPSEZArkX/8CmQkTIhqqTyche+qpoN5+ixSE+9J3yCCwmojBiRU+LBxFfTp6inP0Hp4XD45ZrrVknEyC15Xw9bVh5oyVXrRui93WPQqMXMuFlvuludJYBeCaDXEOYVurtn6cI2LzAJIlw2Kjqiwrg4phQ5cxIdo8xMvkwQe/nRs86Li2xe8rDEhBPgCB9fMI7ywUCci9+DuQh3wdEj+5AMThhwP06NFxzHZnG62alSdqGMydA/kHHtT1J2ON1jLDujpowwX3fvhDEN//PrC999ZVWFcaHQEk+jim5Yaq4p8NGyA/dWo0woXPebdaUN2706Ii6OE03w2BGS3epdlu/mNmSKJHy7Y2aLzicugy7UYaC5Dbt8OmKVNMDcgmY3E8wK9VDhoElcMPftNOt0UXPHTT6ae/vf3JJ1XK99ChIFleBn5bO3hBAMJgLu1scZueMlom0ma8cZIdi6kkO0IIwm47sIUyg7cFO2q3jvZJJY3lF8q6MBLEZ+xYjmC6p9Uo2KCBdhxcfgAnluPcNrwn56hGaFGOoi0ZrZpReQGrV3k02mQCgnQawuYmyIQKQs4B01kMzwGyIir50ywdOey00/jAJ544jDH2J2tS76mDh68XTz7ZL8R1U6Xk+dZWWpcZAzFeiu5zxy5evfgRuSym+RiwOuH7pbbofRwU4Shk02PUYUeaD6ov2lDdYsF25gedvVYoXFu/MtdAx25o1IqgXMGhw0YXbuZvC2pou6F97nuAsTPM5iAwA0gYR20ciIaflVRlmJIMH16HMidbwGVWcKWP8pHf/kNZn94qH4QyRFYSSghI03Y2i3tR2AOKrEcHTRqIRoGahxYuYrX7wPfNX3yggAOcKbmTeUZmXVA9/qCPw5xH4fE7fl68LwnBCh8FLqU2MKMYai4uUm0xDNFCLcoIH7+CUIMxE7Ff6LgpVag/c+gqnkcEMuzWo4eqPuyw/2GMtdK0VXde8KcTx8/fPGeuTPse98IQEgwAI7ZvWq3pYu14bDwEW2BmLsMu7jQrLN4VWWuU33fc//NvhUew7DWe+Vhc33IE77zUFBKFrlmNpZcYhPE1TkMitgOM4AahBykF8kyd6aDNccC5yUNPOEHs/dvfjmeMzcVOUJSXhbfXYeTI9TgqGiAdtZOP8aCOK1nnj4KSuYnCNN2yEIeouEKw31PF0S0+TunCWudiLr1PCaLv7B8NLxZbvf1LKYRhLwYNNATp54jr+EDE0JCEAkdlMGpHtyVoU59SKQDhjRyJ8POaOUWIE8UULibBGGurHjfuN9VDh0A+lBIpVB5PYDRNDzxxkeUWwFPJ246ZScGHnUhV7abVF5ck2G4qyBZYiuwgYn+xwOP9dJJlRrUoydIeQPJRWviW+dBRdFND2GPffaF67NjfMsaaDfTr9vRRo0bRvhV9+z/GjjwSQ6sIKIozcq+c0TRpGQ9uXBJdOc4MO+alMSOySnCU4VgjdJI8u4IrtV9xf5baFcGz0p9qj4jvwwo/qmY6Y7o6uKLQ0QuUY/laCRgHLPRQ7wJnCOEidfTRqnzQoEfxfKOmTdOETN8Ik7jUFhPiwy7jT3ytS21XnM1PpSWkWRrf9MHjC4q7v+jmi9dxKL7XYk9wsIbtpIJR7FUd4kaJ77BOz+0CXJEzOoW2Qks31s6091u4iZYnIOhxXhvKaY9hrb9nZSWrOPbYPzLf/zvJ2kzSi67TCcYj1517zh/XPPqYTHse92QImJIlQAEuMp9wJiG7t2NQv0Q467jFJwXzohDDiqs6nX6/6I3i6aYdd+6I824+4TZQFQjfZLM20FLwtTmAwf7QBl9cL8KwFDyOh913+SDc/5RTRP/Zs49ljL3kLl0TpbBG+Jwnk6+XTzr1j5VVXTiuGoInxANbL8CTUhISVQadgOxYWzSbvQiaYgHolr0CKRQ5SSlhR4rpiHfR5x2tv5A40HfNwyUThYI3o1lF7xHOR3BjYgRzArK5N/yOAAZCyrAmnebpSZP+BgAvu9ZfoAB7yZil1o4ac0PXU06BvJTEbUnTjEEetWw0HdMxE+kxdzABS1cH4xEqCjBFfLoYBsDFoyKpW3yO4g1daGQ5HZXFdi2o2zkmVqGau9u5DgZ2jPXHHhDDjs6T3LzAftdM0kPqGUrof9IPWPejjppCk+Fx/VFnK1AAeQEmB0K8Xn3+j1/o3qePyAZhiNldHA/QI1yLKLKYqP3CliViQVvLK5WtKnrf+U5JDtuh3ubwYKNwa9VFk+ciOhg35enPTLVaCz727JCEH98bUUvr/UQ93XzA9v84gsXzhzLs3q2bqPzx+b/nyeSrz6Jsi1bNYp39EAMoNXjDbbe+/8m11/nc97gfhixhYgHWL3zGAJuKcGxMxwRGyahO0IwYDQTgHzsKGwm/iAUpY96fxfkLL76w9uRGjygaFQ4fx3taRdkefjtuGzEZQzwIVjDB0phP1k6fGRRA6CHvj7sgcPOEUKl8IAdff73se/PNwxljy0qtmNVhyTKzUClqankuCKbL3/9++soFCwPhCy9v5/+af1Hr1Nnl3LyWuc6YI2XYwWiLxI4wlCu4omDaYY5BkZhVCRgrjhExG4lxXgvf9Owbz0PBxoPpMbwENggbRdh8yFY6kfXESarp98HiZD4IB40Y4fW8+sqZRvgl14zrrI4sEYp8IW4vu/rqd6srK728hJDigIGgnDI5AqXc+j0bhGKXtpQ1fm7Ls6oIT5QNgiXobCm3iPcp3DsWcEwQ8J/oWozAbI2eLNoRvsvpA6WFb+Od9Q7yCEy4ChIyzXqo5gMgu6VSXsV11630yitvQOhxKg6frQC77C4uMlJ7+PfO7HnVlbkQR384V9hBr4Wu/8aBKX7EN2k5c9yiTcIpiBOgh/fsIIgLS3bqq/1rMb7IuguoZIlM3IWaqEXEHTY0/F4HVnCMKWY7FoZ0LNBJWARdUe8n/racUH4Qqn6TJ6uaY4/FtUNbJzgy3eV1Q3FdM1OiWBIodVm4ePG9Hz43N0j6nofDcTGx0yfWC+zqeIDNr3ragvnMNMMWhGUqcyv9MD0zlLTYwXWXwxbQnvj7MeTrrNzCAP3vKCUKvHpd9Whfeh0xn5hquwxHOrxfrwtnEzLb6xMv2OR5AnguH+x31JF+19umT8V6/2etnst2acn673wnaF254ulPjzvu5HVLlwVJT3gCl2ABBth6hYN91OtDcw/0mjnIgVEJ2sXihlg9+QHHGexz3RAVy9ItCHcMqm4qFZc7HEBy40ukBK0sTZfjieSWPpPwCVK0hUcY7yRZccnBZsNm3VBzTR5OVMkHwcCBA72e8+a9Uvn1rx+jMhmCnp0t5P3ZY4m4ktYUycsG7HtOj5kz3+varZuH1FTnB/qCseyK+YG9OG1JlsaZm3AaU6m0S9irIiggoRiX1lVEExCj52ZesnlQUDSsw0xbjuJHhPemdk9/o2KZCzs2ubRlZIvxMbZrGIrhKmq4tV5Lhoe1/jDs3qXS6/nLX66oOOCA06Zms1Rp/qxV1D9z+Xo8gP65LdaulDphn3t/+Vb2zLN6t+eyIeNcYLKG1q49HyEIg1A8KyZul0WP0AKy8KSMdcaUPoYtVEJU13EX5i5RD4rmiBUxoijmRBPlzHGN8LQXxNBjy+5U+TRsJyIWtrfTUQx5ugm6XTgXA35+T33FUUcdxxjb8ayGHrlHfj/AoaZrlVJjBzc2LVxx4QVVmTCkBU5xRAg3rJ0LpuOAbtLSQtcC11ZENM0tELB4On8MNh2XfokaaJ2coTCbLoIim6Gbt6iub/BaC19DjYUVt/ZDEGSUZLm+9VIN5jHMovArQskH331Xpuasc7DW89Hu/ErfLv+GjKkVYVB+Tyl1BGQz81dednlNC052wtCPnsA6JkaWf9l38cLxBnWMgMi67RYHb62caKknO6vFwFThGqLFBTxdRnCWs4g69rRl4+eGxxfAo5MJ20EVE4h13hPP0Exgp52UsotUfMiM29qrL71sHNOrrtOPXfxTfsTH/GAbnuAvSqnDme+/+sllV3RrbG8LhO952KhkheFWFXUmrP+ahsJoljl35rKygv1tb0khuERTVQvUXLwZCy5oJXS4fiTYuIRiS+yxJ7gqNnUeuw6QSbRqPU8MumtGa9XkyxB2Fuyu8HdbAUVKwB+4+a5XVT1vzaWT99lctyVIJjwvF4R0UFliDU2rBNvEIm3RigzMLdEVeoKdxxW9dIRu8d9Vgi7+6Ykc7sA4blEQNtaukUxjfZw0aqqpYSv6aRra28dO8HwQ9Kiq8va+565tVWedcyJj7PXPI/zPpQB9bywwP2GIq8B+e1DPHs9VXnb5IZ8sXozLxItASr2gitMnb1eVtXUhVAKjo2EeEJcQXOGaRY5iO3RLFAXRonDWl0szcbNWbwOxtfKo9OBmyg4F1bFCl1zw2n3hEc8fMHiw1/sXM5enjjzq+6bM8LmEX3gPn2NzBnHKg3WrZ2294qpTV8yZg9YT4vrN9FuOjhdQALZ1IuMJLOJB+m+sgNgjCsrQBRdv4awQhKyAoahF3C754RqGSy8LICuqbipbVpYpqWDY0Ufxqjtvn+8PPeB0+i2yL/jbxF9IAXR5tsKHjVphePHW6TfP2HjHnaltTU0YF3CqOBV6MFmzLSso+AImBLaCahM2g9cGngohp/DybYbtxp14PNcN2PExXKFbqhoNpjh9KtRSSgtxB0G3RMLre9lk6HbbbTexsoqptGTzHvhN4i/8a6qGorI5EyeiIn6hlHqz4tBDH+p+28/+36oFCzC5CXnCE4FdCoZ6jGJKykzGHC8PEAGTYUFOkHUgCOGIArihmGThBmaswqxnuDGAVi4xdaaCAGy/bzNbj4PIBaEfSj7okK97Nddevbxs3IkXMMZ+PxWAT9PJ0Rf+8c8v7AHuZt1RKezAltdsm37LlfUPzkp/umEDTY9SCY9+DgTX1HQDrShKyQtigBsXnGnKxaWJyJrNm661W6arBa0DuoUZy/F1wsoIbrwgkL4C1aumRnT90Q+h+9VXzYTqrrjmcxO2k4y+6SY9K30PbHtUASV+T/6A/D/eu3n7Aw+O2z77GdjS3KxzI9+jvEE5sSBe+KmwTcpS2OIY0IH1FEFMASQ56xhR270BLbsfxiUrePwdmhrfF30njocu55//euJbh+FQIs3o+Gf8DPqe/U15B5IW6eXwlwJjJygpj+gyYcJ1tU88edjWefNgW2OTTio9getbM1phnKzSGVApNWBd4nzFJehizq89xwR0U3izS2tScMXmqHxAvyFWm0rxnseNhbJJk/5Rfuzxt7Kyst8Q1utfV8W6zh7/veE97gElhjc1ASlL44oqY1vfWHRpwzPPjsnOnw9b16yBVrO8t/SpTZLZ1dVdaClkQvoZek3BYL9DJW2pwCpAZ9Am3ui5DPgbMrR0fBmA6NW7N6S/dzhUTBj/VsXRY+8DgOcYY9hhwuYoxSf+EwT/L1GA3Yzranngohi53IjcRx+e0fjSS9/PLVrUo/XtP8P2HTugXf+GHsI0w6XlcbJPtN6aqYLaspA7IhzVeyw1NTEAR6dMe73iYYiTT6QPwLBHs7qyAqoOOQTEyMMaqscd91Lyawf/F6uo+AMtVvhPgpt/mwLshjeFv08Wz6dWtQBwZPvCBeMa33hjtHx/cW1+yVJoWrsGGnMBZIxh4/6aIpIJM5oma9DKKEjHXg1lOMOBXpvgLrDDu4IzqO7XD5L7748rZzVVHDby7YojjpgHAC/Sr2obeZDX7kIZ+X+lAuxGNzlnDnN/Tcgo4xuZ5R99u3Xx4m9mln0wNFixsjtfvx5ymzdBvr4eMi0tEOAkCDNsaDe7QDYJ3PfALy+HVE0NJHv2Atm7DyQG7rsjMWzI8oqDDno79bXhiwDgr0zwzXZiiJowQcCzz1LB8V8tiz0ehHdlc1gSw9+ugfvvR06NPw+LPyk+H9dsUJnMXriGCq5rmln+0dDg0/X981u39wu3b+sWNDdVQRB2oR8LQlOVMiNSyayoqGxSVVXbE3vttTGxd/9P0/vt9wEIfykArGQVFRstvNC5UWcLF/Jpo0bp4NphJcZ/zfb/AQ4uuLu0V9ODAAAAAElFTkSuQmCC";

// src/company/formal-components.tsx
var import_jsx_runtime14 = require("react/jsx-runtime");
function AgentWelcome({
  agent,
  onFill
}) {
  return /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("section", { className: "gea-agent-welcome", "aria-label": agent.name, children: [
    /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { className: "gea-agent-identity", children: [
      /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(AgentAvatar, { className: "gea-agent-avatar" }),
      /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("h2", { children: agent.name }),
      /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("p", { className: "gea-agent-intro", children: [
        agent.intro,
        /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("b", { children: agent.boundary })
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { className: "gea-agent-block gea-agent-prompts", children: [
      /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("h3", { children: "\u4F60\u53EF\u4EE5\u8FD9\u6837\u95EE" }),
      agent.prompts.map((prompt) => /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("button", { type: "button", onClick: () => onFill(prompt), children: prompt }, prompt))
    ] })
  ] });
}
function GeaHomeHero({
  copy: copy3
}) {
  return /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("section", { className: "gea-home-hero", "aria-label": copy3.label, children: [
    /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("img", { className: "gea-home-logo", src: brand_logo_default, alt: "", width: 81, height: 81 }),
    /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("p", { className: "gea-home-eyebrow", children: copy3.eyebrow }),
    /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("h1", { className: "gea-home-title", children: copy3.title }),
    /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("p", { className: "gea-home-description", children: copy3.description })
  ] });
}
function ConversationToolbar({
  view,
  onViewChange,
  onHistory,
  onNewConversation,
  error,
  tools = [],
  onOpenTool,
  onCloseTools,
  toolsExpanded = false,
  onAssociateCurrent,
  associateDisabled = false,
  children
}) {
  const choices = [
    {
      view: "center",
      label: "\u4E2D\u95F4\u533A\u57DF\u6700\u5927\uFF0C\u9690\u85CF\u4F1A\u8BDD\u533A",
      icon: /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)(import_jsx_runtime14.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("rect", { x: "3", y: "3", width: "7", height: "7", rx: "1" }),
        /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("rect", { x: "14", y: "3", width: "7", height: "7", rx: "1" }),
        /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("rect", { x: "3", y: "14", width: "7", height: "7", rx: "1" }),
        /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("rect", { x: "14", y: "14", width: "7", height: "7", rx: "1" })
      ] })
    },
    {
      view: "split",
      label: "\u540C\u65F6\u663E\u793A\u4E2D\u95F4\u533A\u57DF\u548C\u4F1A\u8BDD\u533A",
      icon: /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)(import_jsx_runtime14.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("rect", { x: "3", y: "3", width: "18", height: "18", rx: "2" }),
        /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("path", { d: "M12 3v18" })
      ] })
    },
    {
      view: "chat",
      label: "\u4F1A\u8BDD\u533A\u6700\u5927\uFF0C\u9690\u85CF\u4E2D\u95F4\u533A\u57DF",
      icon: /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("path", { d: "M4 4h16v13H9l-5 4V4Zm4 4h8m-8 4h6" })
    }
  ];
  return /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { className: "gea-conversation-toolbar", role: "toolbar", "aria-label": "\u5BF9\u8BDD\u533A\u89C6\u56FE\u4E0E\u4F1A\u8BDD\u64CD\u4F5C", children: [
    /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("div", { className: "gea-conversation-view-switch", role: "group", "aria-label": "\u533A\u57DF\u663E\u793A\u65B9\u5F0F", children: choices.map((choice) => /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(
      "button",
      {
        type: "button",
        "aria-label": choice.label,
        title: choice.label,
        "aria-pressed": view === choice.view,
        onClick: () => onViewChange(choice.view),
        children: /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(
          "svg",
          {
            "aria-hidden": "true",
            viewBox: "0 0 24 24",
            fill: "none",
            stroke: "currentColor",
            strokeWidth: "1.8",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            children: choice.icon
          }
        )
      },
      choice.view
    )) }),
    /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(
      "button",
      {
        type: "button",
        className: "gea-conversation-toolbar-action",
        "aria-label": "\u5386\u53F2\u5BF9\u8BDD",
        title: "\u5386\u53F2\u5BF9\u8BDD",
        onClick: onHistory,
        children: /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(
          "svg",
          {
            "aria-hidden": "true",
            viewBox: "0 0 24 24",
            fill: "none",
            stroke: "currentColor",
            strokeWidth: "1.8",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            children: /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("path", { d: "M3 10a9 9 0 1 1 0 4M3 4v6h6M12 7v5l3 2" })
          }
        )
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(
      "button",
      {
        type: "button",
        className: "gea-conversation-toolbar-action",
        "aria-label": "\u65B0\u5EFA\u5BF9\u8BDD",
        title: "\u65B0\u5EFA\u5BF9\u8BDD",
        onClick: onNewConversation,
        children: /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)(
          "svg",
          {
            "aria-hidden": "true",
            viewBox: "0 0 24 24",
            fill: "none",
            stroke: "currentColor",
            strokeWidth: "1.8",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("rect", { x: "3", y: "3", width: "18", height: "18", rx: "2" }),
              /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("path", { d: "M12 7v10M7 12h10" })
            ]
          }
        )
      }
    ),
    onAssociateCurrent && /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(
      "button",
      {
        type: "button",
        className: "gea-conversation-toolbar-action",
        "aria-label": "\u5173\u8054\u5F53\u524D\u5BF9\u8BDD",
        title: "\u5173\u8054\u5F53\u524D\u5BF9\u8BDD",
        disabled: associateDisabled,
        onClick: onAssociateCurrent,
        children: "\u2194"
      }
    ),
    children,
    tools.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)(
      "select",
      {
        className: "gea-conversation-toolbar-tool",
        "aria-label": "\u539F\u751F\u5DE5\u5177",
        value: "",
        onChange: (event) => {
          if (event.target.value) onOpenTool?.(event.target.value);
        },
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("option", { value: "", disabled: true, children: "\u5DE5\u5177" }),
          tools.map((tool) => /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("option", { value: tool.kind, children: tool.title() }, tool.providerId + ":" + tool.id))
        ]
      }
    ),
    toolsExpanded && /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(
      "button",
      {
        type: "button",
        className: "gea-conversation-toolbar-action",
        "aria-label": "\u5173\u95ED\u539F\u751F\u5DE5\u5177\u5E76\u6062\u590D\u89C6\u56FE",
        onClick: onCloseTools,
        children: "\xD7"
      }
    ),
    error && /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { className: "gea-conversation-toolbar-error", role: "alert", title: error, children: "\u5BF9\u8BDD\u64CD\u4F5C\u5931\u8D25" })
  ] });
}
function NavIcon({ kind }) {
  if (kind === "synergy" || kind === "orders") {
    return /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(
      "svg",
      {
        className: "gea-shell-nav-icon",
        "aria-hidden": "true",
        width: "18",
        height: "18",
        viewBox: "0 0 1024 1024",
        fill: "currentColor",
        children: /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("g", { transform: "translate(512 512) scale(0.75) translate(-512 -512)", children: BUSINESS_GROUP_ICON_PATHS[kind].map((d, index) => /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("path", { d }, index)) })
      }
    );
  }
  const paths = {
    newChat: /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)(import_jsx_runtime14.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("path", { d: "M20 12a7.5 7.5 0 0 1-10.6 6.8L5 20l1.3-4.1A7.5 7.5 0 1 1 20 12Z" }),
      /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("path", { d: "M12 8.8v6.4M8.8 12h6.4" })
    ] }),
    apps: /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)(import_jsx_runtime14.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("rect", { x: "4", y: "4", width: "6.5", height: "6.5", rx: "1.4" }),
      /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("rect", { x: "13.5", y: "4", width: "6.5", height: "6.5", rx: "1.4" }),
      /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("rect", { x: "4", y: "13.5", width: "6.5", height: "6.5", rx: "1.4" }),
      /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("rect", { x: "13.5", y: "13.5", width: "6.5", height: "6.5", rx: "1.4" })
    ] }),
    bot: /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)(import_jsx_runtime14.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("rect", { x: "5", y: "7", width: "14", height: "11", rx: "2" }),
      /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("path", { d: "M12 4v3M8 12h.01M16 12h.01M9 18v2M15 18v2" })
    ] }),
    bell: /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)(import_jsx_runtime14.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("path", { d: "M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" }),
      /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("path", { d: "M10 21h4" })
    ] }),
    desktop: /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)(import_jsx_runtime14.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("rect", { x: "4", y: "5", width: "16", height: "11", rx: "1.5" }),
      /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("path", { d: "M9 20h6M12 16v4" })
    ] }),
    users: /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)(import_jsx_runtime14.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("circle", { cx: "9", cy: "9", r: "3" }),
      /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("path", { d: "M3.5 19c.7-3 2.5-4.5 5.5-4.5s4.8 1.5 5.5 4.5M16 6.5a2.5 2.5 0 0 1 0 5M17 14.5c1.9.2 3.1 1.6 3.5 3.5" })
    ] }),
    calendar: /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)(import_jsx_runtime14.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("rect", { x: "4", y: "5", width: "16", height: "15", rx: "2" }),
      /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("path", { d: "M8 3v4M16 3v4M4 10h16M8 14h2M14 14h2M8 17h2" })
    ] }),
    warehouse: /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)(import_jsx_runtime14.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("path", { d: "m3 10 9-6 9 6v10H3z" }),
      /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("path", { d: "M8 20v-6h8v6M6 10h12" })
    ] }),
    grid: /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)(import_jsx_runtime14.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("rect", { x: "3", y: "3", width: "7", height: "7", rx: "1.5" }),
      /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("rect", { x: "14", y: "3", width: "7", height: "7", rx: "1.5" }),
      /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("rect", { x: "3", y: "14", width: "7", height: "7", rx: "1.5" }),
      /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("rect", { x: "14", y: "14", width: "7", height: "7", rx: "1.5" })
    ] }),
    folder: /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(import_jsx_runtime14.Fragment, { children: /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("path", { d: "M3 7V5.5A1.5 1.5 0 0 1 4.5 4h4l2 2.5h9A1.5 1.5 0 0 1 21 8v10.5A1.5 1.5 0 0 1 19.5 20h-15A1.5 1.5 0 0 1 3 18.5Z" }) })
  };
  return /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(
    "svg",
    {
      className: "gea-shell-nav-icon",
      "aria-hidden": "true",
      width: "18",
      height: "18",
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "1.6",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      children: paths[kind]
    }
  );
}
function Chevron({ open }) {
  return /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(
    "svg",
    {
      className: `gea-shell-chevron${open ? " is-open" : ""}`,
      "aria-hidden": "true",
      width: "14",
      height: "14",
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "1.8",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      children: /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("path", { d: "m7 10 5 5 5-5" })
    }
  );
}

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
var homeConversation = {
  name: "AI \u5DE5\u4F5C\u53F0Agent",
  intro: "\u6211\u53EF\u4EE5\u4ECE\u4F60\u6B63\u5728\u89E3\u51B3\u7684\u95EE\u9898\u5165\u624B\uFF1A\u627E\u6570\u636E\u3001\u770B\u8BA1\u5212\u8FDB\u5EA6\u3001\u76EF\u5E93\u5B58\u548C\u4EA4\u4ED8\u98CE\u9669\u3002",
  boundary: "\u6240\u6709\u52A8\u4F5C\u5148\u7ED9\u5EFA\u8BAE\uFF0C\u518D\u7531\u4F60\u786E\u8BA4\u3002",
  actions: [
    {
      icon: "chart",
      tone: "brand",
      label: "\u770B\u672C\u6708\u8BA1\u5212\u5EFA\u8BAE",
      detail: "\u4EFB\u52A1\u5934\u3001\u603B\u91CF\u5EFA\u8BAE\u3001\u5173\u952E\u53D8\u5316\u3001\u98CE\u9669\u63D0\u793A",
      prompt: "\u770B\u672C\u6708\u8BA1\u5212\u5EFA\u8BAE"
    },
    {
      icon: "alert",
      tone: "brand",
      label: "\u770B\u9700\u8981\u91CD\u70B9\u5173\u6CE8\u7684\u5546\u54C1",
      detail: "\u53D1\u8D27\u6982\u7387\u504F\u4F4E\u3001\u5E93\u5B58\u6216\u8D27\u9F84\u504F\u9AD8\u7684\u5546\u54C1",
      prompt: "\u770B\u9700\u8981\u91CD\u70B9\u5173\u6CE8\u7684\u5546\u54C1"
    },
    {
      icon: "box",
      tone: "info",
      label: "\u770B\u5E93\u5B58\u4E0E\u4F9B\u5E94\u98CE\u9669",
      detail: "\u5E93\u5B58\u3001\u5728\u9014\u4E0E\u7F3A\u8D27\u98CE\u9669",
      prompt: "\u770B\u5E93\u5B58\u4E0E\u4F9B\u5E94\u98CE\u9669"
    },
    {
      icon: "users",
      tone: "success",
      label: "\u770B\u5BA2\u6237\u63D0\u62A5\u4E0E\u5BA1\u6279\u8FDB\u5EA6",
      detail: "\u5230\u54EA\u4E00\u6B65\u3001\u5361\u5728\u8C01\u624B\u91CC",
      prompt: "\u770B\u5BA2\u6237\u63D0\u62A5\u4E0E\u5BA1\u6279\u8FDB\u5EA6"
    }
  ],
  prompts: [
    "\u672C\u6708\u54EA\u4E9B\u5BA2\u6237\u8FD8\u6CA1\u63D0\u62A5\uFF1F",
    "\u54EA\u4E9B\u5546\u54C1\u9700\u8981\u91CD\u70B9\u590D\u6838\uFF1F",
    "\u73B0\u5728\u6700\u9700\u8981\u5173\u6CE8\u7684\u98CE\u9669\u662F\u4EC0\u4E48\uFF1F",
    "\u4F60\u80FD\u5E2E\u6211\u505A\u4EC0\u4E48\uFF1F"
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

// src/company/shell.css
var shell_default = `/* Formal GEA0.0.135 508feea3b0c285a61e4c06179a705866b1429b8e company-owned rules.
 * Private host selectors are removed; public ownership translations preserve declaration bytes. */

.gea-workbench-shell {
  position: relative;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}

[data-gea-hidden-session-chrome] {
  display: none !important;
}

.gea-workbench-frame {
  display: block;
  border: 0;
  width: 100%;
  height: 100%;
  background: #f8f9fb;
}

.gea-sidebar-region {
  display: flex !important;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  /* \u4E24\u4E2A\u62BD\u5C49\uFF08\u4E1A\u52A1\u5DE5\u4F5C\u53F0\u83DC\u5355 / \u5386\u53F2\u4F1A\u8BDD\u5217\u8868\uFF09\u7EDF\u4E00\u6B63\u6587\u8272\uFF0C\u6539\u8FD9\u4E00\u5904\u5373\u53EF\u3002 */
  --gea-sidebar-ink: var(--workbench-text);
  --gea-menu-left: 10px;
}

.gea-sidebar-drawer {
  display: flex;
  flex: 0 0 auto;
  flex-direction: column;
  min-height: 0;
}

.gea-drawer-function {
  order: 1;
}

.gea-drawer-workspace {
  order: 3;
}

.gea-sidebar-tab {
  display: flex;
  width: 100%;
  min-width: 0;
  flex: 0 0 auto;
  align-items: center;
  gap: 7px;
  padding: 8px var(--gea-menu-left, 10px);
  border: 0 !important;
  border-radius: 7px;
  background: transparent !important;
  color: var(--gea-sidebar-ink);
  font: inherit;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  transition:
    background-color 140ms ease,
    color 140ms ease;
}

.gea-sidebar-tab:hover {
  background: #eceff2 !important;
  color: #202531;
}

.gea-sidebar-tab[aria-expanded='true'] {
  /* \u5C55\u5F00\u6001\u7528\u6D45\u7EA2\u5E95\uFF0C\u4E0D\u518D\u94FA\u767D\u5361\u7247\uFF1A\u767D\u5361\u7247\u4F1A\u548C\u53F3\u4FA7\u539F\u751F\u56FE\u6807\u538B\u51FA\u8FB9\u7F18\uFF0C\u770B\u7740\u50CF\u88AB\u5207\u6389\u3002 */
  background: #fff0f2 !important;
  /* \u6D45\u7EA2\u5E95\u4E0A #df1732 \u53EA\u6709 4.41:1\uFF0C\u7EDF\u4E00\u6539\u6210 #d0132c\uFF084.98:1\uFF09\u3002 */
  color: #d0132c;
  font-weight: 600;
  box-shadow: none;
}

.gea-sidebar-tab:focus-visible {
  outline: 2px solid #9aa4b2;
  outline-offset: -2px;
  box-shadow: none;
}

.gea-sidebar-tab[aria-expanded='true'],
.gea-sidebar-tab.is-active {
  border: 0 !important;
  outline-color: transparent !important;
  box-shadow: none !important;
}

.gea-sidebar-tab .gea-drawer-title {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.gea-sidebar-tab .gea-shell-chevron {
  margin-left: auto;
}

.gea-sidebar-panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.gea-drawer-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.gea-panel-function {
  order: 2;
  flex: 1 1 auto;
  overflow: auto;
}

.gea-sidebar-panel .gea-shell-navigation,
.gea-sidebar-panel .gea-shell-navigation-content {
  height: auto;
  min-height: 0;
  /* \u4E24\u4E2A\u62BD\u5C49\u5171\u7528\u4E00\u5757\u5E95\u8272\uFF1A\u83DC\u5355\u4E0D\u518D\u81EA\u5DF1\u94FA\u7070\u5E95\uFF0C\u8DDF\u539F\u751F\u4F1A\u8BDD\u5217\u8868\u4FDD\u6301\u4E00\u81F4\u3002 */
  background: transparent;
}

[data-gea-drawer='function'] > [data-slot='sidebar.workspaces'],
[data-gea-drawer='none'] > [data-slot='sidebar.workspaces'] {
  display: none !important;
}

[data-gea-drawer='workspace'] > [data-slot='sidebar.workspaces'] {
  display: flex !important;
  flex-direction: column;
  position: relative;
  /* \u4F1A\u8BDD\u5217\u8868\u5728\u300C\u5386\u53F2\u4F1A\u8BDD\u300D\u4E0B\u9762\u5F80\u4E0B\u957F\uFF0C\u81EA\u5DF1\u6EDA\u3002
     \u8FD9\u91CC\u4E0D\u505A\u6EDA\u52A8\u5BB9\u5668\uFF1A\u539F\u751F\u90A3\u4E00\u884C\u7684\u641C\u7D22/\u6392\u5E8F/\u65B0\u5EFA\u6309\u94AE\u8981\u80FD\u4E0A\u79FB\u5230\u62BD\u5C49\u6807\u9898\u90A3\u4E00\u884C\u3002 */
  flex: 1 1 auto;
  min-height: 0;
  overflow: visible;
}

[data-gea-drawer='workspace'] > [data-slot='sidebar.workspaces'] > * {
  flex: 1 1 auto;
  min-height: 0;
}

[data-gea-drawer='workspace'] .gea-drawer-workspace .gea-sidebar-tab {
  padding-right: 8px;
}

[data-gea-drawer='workspace'] .gea-sidebar-panel {
  display: none;
}

@keyframes gea-panel-down {
  from {
    opacity: 0;
    transform: translateY(-12px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

.gea-panel-function {
  animation: gea-panel-down 200ms ease-out;
}

[data-gea-drawer='workspace'] > [data-slot='sidebar.workspaces'] {
  animation: gea-panel-down 220ms ease-out;
}

@media (prefers-reduced-motion: reduce) {
  .gea-panel-function,
  [data-gea-drawer='workspace'] > [data-slot='sidebar.workspaces'] {
    animation: none;
  }
}

[data-gea-narrow] .gea-sidebar-drawer,
[data-gea-narrow] .gea-sidebar-panel {
  display: none;
}

.gea-sidebar-drawer,
.gea-sidebar-panel {
  transition: opacity 120ms ease-out;
}

[data-sidebar-collapsed] .gea-sidebar-drawer,
[data-sidebar-collapsed] .gea-sidebar-panel {
  opacity: 0;
  pointer-events: none;
}

.gea-sidebar-rail {
  display: none;
}

[data-gea-narrow] .gea-sidebar-rail {
  order: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 6px 0;
  /* \u56FA\u5B9A\u6210\u6536\u8D77\u6001\u7684\u5217\u5BBD\u5E76\u8D34\u5DE6\uFF0C\u5BBD\u5EA6\u52A8\u753B\u8FC7\u7A0B\u4E2D\u56FE\u6807\u4E0D\u518D\u6A2A\u5411\u6F02\u79FB\u3002 */
  align-self: flex-start;
  /* \u56FE\u6807\u5217\u4E0E\u54C1\u724C\u540C\u5BBD\uFF0C\u4FDD\u6301\u6536\u8D77\u4FA7\u680F\u7684\u540C\u4E00\u6761\u4E2D\u7EBF\u3002 */
  width: 56px;
  max-width: 100%;
}

[data-gea-narrow] .gea-sidebar-rail-item {
  width: 36px;
  height: 36px;
}

[data-gea-narrow] .gea-new-session {
  display: none !important;
}

.gea-new-session {
  justify-content: flex-start !important;
  margin-left: -12px !important;
  padding-left: 7px !important;
}

.gea-new-session :is(svg, img) {
  margin-right: 8px;
}

.gea-sidebar-rail-item {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: #3d4654;
  cursor: pointer;
}

.gea-sidebar-rail-item:hover {
  background: #eceef2;
  color: #202531;
}

.gea-sidebar-rail-item.is-active {
  background: #fff0f2;
  color: #df1732;
}

.gea-sidebar-rail-item:focus-visible {
  outline: 2px solid #df1732;
  outline-offset: 2px;
}

.gea-inbox-quick-action {
  position: absolute;
  top: 50%;
  right: 42px;
  z-index: 1;
  display: grid;
  width: 28px;
  height: 28px;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #687282;
  cursor: pointer;
  transform: translateY(-50%);
}

.gea-inbox-quick-action:hover,
.gea-inbox-quick-action[aria-current='page'] {
  background: #fff0f2;
  color: #df1732;
}

[data-gea-narrow] .gea-inbox-quick-action {
  display: none;
}

.gea-shell-navigation {
  box-sizing: border-box;
  height: 100%;
  min-width: 0;
  container: gea-sidebar / inline-size;
  background: var(--workbench-muted-surface);
  color: var(--gea-sidebar-ink);
  font-family: 'Microsoft YaHei UI', 'PingFang SC', 'Noto Sans CJK SC', Arial, sans-serif;
  font-size: 12px;
  line-height: 1.7;
}

.gea-shell-navigation-content {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 0 14px 12px;
  background: var(--workbench-muted-surface);
}

.gea-shell-navigation * {
  box-sizing: border-box;
}

.gea-shell-navigation svg,
.gea-shell-logo,
.gea-user-avatar {
  flex-shrink: 0;
}

.gea-shell-brand {
  display: flex;
  align-items: center;
  gap: 16px;
  height: 54px;
  flex-shrink: 0;
  border-bottom: 1px solid #e3e6ea;
  color: #20232a;
  font-size: 14px;
  font-weight: 700;
}

.gea-shell-navigation-content::after {
  display: none;
}

.gea-shell-logo {
  display: block;
  width: 38px;
  height: 38px;
  margin-right: 10px;
  object-fit: contain;
}

[data-gea-narrow] .gea-sidebar-brand {
  justify-content: center !important;
  /* \u548C\u56FE\u6807\u5217\u540C\u5BBD\uFF0856px\uFF09\u5E76\u8D34\u540C\u4E00\u6761\u5DE6\u8FB9\u7F18\uFF0C\u5706\u6807\u624D\u4F1A\u843D\u5728\u56FE\u6807\u5217\u7684\u4E2D\u7EBF\u4E0A\u3002 */
  width: 56px;
  min-width: 56px;
  max-width: 56px;
  padding-left: 0 !important;
  padding-right: 0 !important;
}

[data-gea-narrow] .gea-sidebar-brand-row {
  padding-left: 0 !important;
}

[data-gea-narrow] .gea-shell-logo {
  width: 26px;
  height: 26px;
  margin-right: 0 !important;
}

.gea-sidebar-brand {
  height: auto;
  min-height: 44px;
  overflow: visible;
}

[data-slot='sidebar.brand.name'] {
  min-width: 0;
}

.gea-brand-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 1px;
  cursor: default;
}

[data-slot='sidebar.brand.name'] span {
  color: #d70a1c;
  font-family: 'PingFang SC', 'Microsoft YaHei UI', 'Noto Sans CJK SC', Arial, sans-serif;
  font-size: 19px;
  font-weight: 700;
  line-height: 1.25;
  letter-spacing: 0.2px;
}

.gea-brand-subtitle {
  /* \u5BF9\u6BD4\u5EA6\uFF1A\u539F\u6765 #96999f \u5728 #f9fafb \u4E0A\u53EA\u6709 2.73:1\uFF0C\u52A0\u6DF1\u5230 5.06:1\uFF08WCAG AA\uFF09\u3002 */
  color: #666c76;
  font-size: 11px;
  font-weight: 400;
  line-height: 1.3;
  letter-spacing: 0.6px;
}

.gea-shell-caption {
  padding: 4px 7px;
  color: var(--gea-sidebar-ink);
  font-size: 12px;
}

.gea-shell-navigation-content > button,
.gea-shell-workspaces > button {
  border: 0 !important;
  border-radius: 6px;
  background: transparent !important;
  color: inherit;
  font: inherit;
  cursor: pointer;
  min-height: 38px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  text-align: left;
}

.gea-shell-navigation button:disabled {
  opacity: 0.65;
  cursor: default;
}

.gea-shell-navigation button.is-active {
  background: #fff0f2;
  /* \u6D45\u7EA2\u5E95\u4E0A #df1732 \u53EA\u6709 4.41:1\uFF0C\u7EDF\u4E00\u6539\u6210 #d0132c\uFF084.98:1\uFF09\u3002 */
  color: #d0132c;
  font-weight: 600;
}

.gea-shell-navigation-content > .gea-shell-child {
  padding-left: 40px;
}

.gea-shell-navigation-content > button:hover,
.gea-shell-navigation-content > .gea-shell-child:hover {
  background: #eceef2 !important;
  color: #202531;
}

.gea-shell-navigation button:focus-visible {
  /* \u767B\u8BB0 20\uFF1A\u9009\u4E2D\u6001\u4E0E\u7126\u70B9\u73AF\u90FD\u4E0D\u518D\u7528\u6DF1\u7EA2\u63CF\u8FB9\u3002 */
  outline: 2px solid #9aa4b2;
  outline-offset: 2px;
}

.gea-shell-navigation button.is-active,
.gea-shell-navigation button[aria-pressed='true'],
.gea-shell-nav-child.is-active,
.gea-shell-nav-heading.is-active {
  border: 0 !important;
  outline-color: transparent !important;
  box-shadow: none !important;
}

.gea-shell-group {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 18px 12px 4px;
  color: var(--gea-sidebar-ink);
  font-size: 13px;
}

.gea-shell-group::before {
  content: '';
  width: 7px;
  height: 7px;
  margin-right: 3px;
  border: 1.5px solid #9aa2af;
  border-radius: 2px;
}

.gea-shell-plugin-group {
  display: grid;
  gap: 2px;
  margin-top: 2px;
  padding-top: 4px;
}

.gea-shell-plugin {
  min-height: 32px !important;
  padding-block: 6px !important;
  padding-left: 40px !important;
  color: var(--gea-sidebar-ink) !important;
  font-size: 12px !important;
  border: 0 !important;
  background: transparent !important;
  box-shadow: none !important;
}

.gea-shell-plugin:hover {
  color: #df1732 !important;
  background: #fffafb !important;
}

.gea-shell-plugin.is-active {
  color: #d0132c !important;
  background: #fff0f2 !important;
}

.gea-shell-plugin-dot {
  width: 5px;
  height: 5px;
  flex: 0 0 auto;
  border-radius: 50%;
  background: #c7ced8;
}

.gea-shell-plugin:hover .gea-shell-plugin-dot,
.gea-shell-plugin.is-active .gea-shell-plugin-dot {
  background: #df1732;
}

.gea-shell-nav-section {
  display: grid;
  gap: 2px;
  margin: 8px 0 0 4px;
}

.gea-shell-nav-heading,
.gea-shell-nav-item {
  width: 100%;
  min-height: 38px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border: 0 !important;
  border-radius: 6px;
  background: transparent !important;
  color: var(--gea-sidebar-ink);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.gea-shell-nav-heading {
  font-weight: 600;
}

.gea-shell-nav-heading:hover,
.gea-shell-nav-item:hover {
  background: #fffafb !important;
  color: #df1732;
}

.gea-shell-nav-item.is-active {
  background: #fff0f2 !important;
  color: #d0132c;
  font-weight: 700;
}

.gea-shell-nav-icon {
  flex: 0 0 auto;
  color: currentColor;
}

.gea-shell-chevron {
  margin-left: auto;
  transition: transform 160ms ease;
}

.gea-shell-chevron.is-open {
  transform: rotate(180deg);
}

.gea-shell-nav-children {
  display: grid;
  gap: 1px;
  padding: 1px 0 3px 28px;
}

.gea-shell-nav-child {
  min-height: 36px;
  padding: 7px 12px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--gea-sidebar-ink);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.gea-shell-nav-child:hover {
  background: #fffafb;
  color: #df1732;
}

.gea-shell-nav-child.is-active {
  background: #fff0f2;
  color: #d0132c;
  font-weight: 700;
}

.gea-shell-nav-child:disabled {
  background: transparent;
  color: #a7aeb8;
  cursor: default;
  opacity: 1;
}

.gea-shell-nav-child:disabled:hover {
  background: transparent;
  color: #a7aeb8;
}

.gea-shell-nav-section.is-flat {
  margin-top: 2px;
}

.gea-shell-nav-heading:focus-visible,
.gea-shell-nav-item:focus-visible,
.gea-shell-nav-child:focus-visible {
  outline: 2px solid #df1732;
  outline-offset: 2px;
}

.gea-panel-function .gea-shell-navigation {
  margin-left: 0;
  padding-left: 0;
}

.gea-panel-function .gea-shell-navigation-content {
  padding-left: 0;
  padding-right: 0;
}

.gea-panel-function .gea-shell-nav-section {
  margin-left: 0;
}

.gea-panel-function .gea-shell-nav-heading,
.gea-panel-function .gea-shell-nav-item {
  padding-left: var(--gea-menu-left, 10px);
}

.gea-panel-function .gea-shell-nav-children {
  padding-left: 0;
}

.gea-panel-function .gea-shell-nav-child {
  padding-left: calc(var(--gea-menu-left, 10px) + 28px);
}

.gea-shell-user {
  display: flex;
  align-items: center;
  gap: 8px;
  border-top: 1px solid #e3e6ea;
  padding: 14px 8px 0;
  margin-top: auto;
}

.gea-user-avatar {
  display: grid;
  place-items: center;
  border-radius: 50%;
  width: 22px;
  height: 22px;
  background: #f39830;
  color: white;
}

.gea-user-avatar > img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: inherit;
}

@container gea-sidebar (max-width: 100px) {
  .gea-shell-navigation-content {
    padding: 0 8px 12px;
  }

  .gea-shell-label,
  .gea-shell-caption {
    display: none;
  }

  .gea-shell-brand,
  .gea-shell-group,
  .gea-shell-user {
    justify-content: center;
    gap: 0;
  }

  .gea-shell-group {
    padding: 12px 0 3px;
  }

  .gea-shell-navigation button {
    justify-content: center;
    gap: 0;
    padding: 7px 0;
  }
}

.gea-login-frame {
  position: fixed;
  inset: 0;
  z-index: 1000;
  width: 100vw;
  height: 100dvh;
}

.gea-agent-welcome {
  /* \u9996\u9875\u539F\u6765\u7528\u7EDD\u5BF9\u5B9A\u4F4D\u3001\u5E95\u8FB9\u53EA\u7559 104px\uFF1A\u8F93\u5165\u533A\u6BD4\u8FD9\u9AD8\u65F6\u4F1A\u76D6\u4F4F\u8F93\u5165\u6846\u3001\u70B9\u4E0D\u8FDB\u53BB\u3002
     \u6539\u6210\u548C\u4E1A\u52A1\u9875\u4E00\u6837\u7684"\u4E0A\u6B22\u8FCE\u533A\u3001\u4E0B\u8F93\u5165\u533A"\u5F39\u6027\u6392\u5E03\u3002 */
  position: relative;
  inset: auto;
  order: -1;
  flex: 1 1 auto;
  min-height: 0;
  z-index: 1;
  overflow: auto;
  padding: 28px 18px 16px;
  background: var(--workbench-surface);
  color: var(--workbench-body);
}

.gea-agent-identity {
  text-align: center;
}

.gea-agent-avatar {
  display: block;
  width: 72px;
  height: 72px;
  margin: 0 auto 8px;
}

.gea-agent-identity h2 {
  margin: 0 0 10px;
  color: var(--workbench-text);
  font-size: 17px;
  font-weight: 600;
}

.gea-agent-intro {
  margin: 0;
  padding: 9px 11px;
  border: 1px solid var(--workbench-border);
  border-radius: 10px;
  background: var(--workbench-surface);
  color: var(--workbench-body);
  font-size: 12px;
  line-height: 1.75;
  text-align: left;
}

.gea-agent-intro b {
  color: var(--workbench-text);
  font-weight: 600;
}

.gea-agent-block {
  margin-top: 16px;
}

.gea-agent-block h3 {
  margin: 0 0 8px;
  color: var(--workbench-body);
  font-size: 12px;
  font-weight: 600;
}

.gea-agent-actions {
  display: grid;
  gap: 7px;
}

.gea-agent-actions button,
.gea-agent-prompts button {
  display: flex;
  width: 100%;
  min-height: 48px;
  align-items: center;
  gap: 10px;
  padding: 9px 11px;
  border: 1px solid var(--workbench-border);
  border-radius: 10px;
  background: var(--workbench-surface);
  color: var(--workbench-body);
  font: inherit;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
  transition:
    border-color 150ms ease,
    background-color 150ms ease,
    color 150ms ease;
}

.gea-agent-actions button:hover,
.gea-agent-prompts button:hover {
  border-color: var(--workbench-brand);
  background: var(--workbench-hover);
  color: var(--workbench-selected-text);
}

.gea-agent-action-icon {
  flex: none;
  color: #e1251b;
}

.gea-agent-action-icon[data-tone='info'] {
  color: #185fa5;
}

.gea-agent-action-icon[data-tone='success'] {
  color: #0f6e56;
}

.gea-agent-action-copy {
  display: grid;
  min-width: 0;
  flex: 1 1 auto;
  gap: 1px;
  text-align: left;
}

.gea-agent-action-title {
  color: var(--workbench-text);
  font-size: 13px;
  font-weight: 600;
  line-height: 1.4;
}

.gea-agent-action-detail {
  color: #9a9a96;
  font-size: 11px;
  line-height: 1.45;
}

.gea-agent-action-arrow {
  margin-left: auto;
  color: #9a9a96;
  font-size: 12px;
  font-weight: 400;
}

.gea-agent-prompts {
  padding-top: 2px;
}

.gea-agent-prompts button {
  min-height: 34px;
  margin-bottom: 7px;
  padding: 7px 14px;
  border-radius: 999px;
  color: var(--workbench-body);
}

@media (max-height: 940px) {
  .gea-agent-action-detail {
    display: none;
  }

  .gea-agent-intro {
    padding: 7px 10px;
  }

  .gea-agent-block {
    margin-top: 12px;
  }

  .gea-agent-prompts button {
    min-height: 32px;
    margin-bottom: 6px;
    padding: 6px 12px;
  }

  .gea-agent-actions button:nth-child(n + 3) {
    display: none;
  }
}

@media (max-height: 780px) {
  .gea-agent-avatar {
    display: none;
  }
}

.gea-home-hero {
  order: -1;
  width: 100%;
  /* \u4E3B\u89C6\u89C9\u4FDD\u6301\u5C45\u4E2D\uFF08\u767B\u8BB0 30 \u7684"\u6587\u5B57\u5DE6\u5BF9\u9F50"\u7ECF\u9A8C\u6536\u6539\u56DE\uFF09\u3002\u8FD9\u4E24\u5904\u53EA\u9632\u7A84\u5217\u6EA2\u51FA\uFF0C\u4E0D\u6539\u53D8\u5C45\u4E2D\u5F62\u6001\u3002 */
  max-width: min(900px, 100%);
  min-width: 0;
  margin: 0 auto 24px;
  padding: 0 24px;
  text-align: center;
}

.gea-home-logo {
  display: block;
  width: 81px;
  height: 81px;
  margin: 0 auto 13px;
  object-fit: contain;
}

.gea-home-eyebrow {
  margin: 0 0 18px;
  color: #d71920;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 2.6px;
}

.gea-home-title {
  max-width: 850px;
  margin: 0 auto;
  overflow-wrap: anywhere;
  color: #292b2e;
  font-size: clamp(26px, 2.6vw, 40px);
  font-weight: 650;
  line-height: 1.5;
  letter-spacing: -0.7px;
}

.gea-home-description {
  max-width: 760px;
  margin: 20px auto 24px;
  overflow-wrap: anywhere;
  color: #919399;
  font-size: 13px;
  line-height: 1.95;
}

.gea-home-cards {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.gea-home-card {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 12px;
  padding: 15px 17px;
  border: 1px solid #ebebee !important;
  border-radius: 11px;
  background: #fff !important;
  box-shadow: 0 2px 3px rgb(28 33 40 / 1%);
  text-align: left;
  cursor: pointer;
  transition:
    border-color 160ms ease,
    box-shadow 160ms ease,
    transform 160ms ease;
}

.gea-home-card:hover {
  border-color: #e7b6bb !important;
  background: #fffdfd !important;
  box-shadow: 0 5px 20px rgb(28 33 40 / 5%);
  transform: translateY(-2px);
}

.gea-home-card[aria-expanded='true'] {
  border-color: #e7b6bb !important;
  background: #fffdfd !important;
  box-shadow: 0 5px 20px rgb(28 33 40 / 5%);
}

.gea-home-card[aria-expanded='true'] .gea-home-card-arrow {
  color: #df1732;
  transform: rotate(90deg);
}

.gea-home-card:focus-visible {
  outline: 2px solid #df1732;
  outline-offset: 2px;
}

.gea-home-card-icon {
  display: grid;
  width: 33px;
  height: 33px;
  flex: none;
  place-items: center;
  border-radius: 9px;
  background: #f7f7f8;
  color: #777c84;
}

.gea-home-card-copy {
  display: grid;
  min-width: 0;
  flex: 1 1 auto;
  gap: 3px;
}

.gea-home-card-copy strong {
  color: #2c2f34;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.4;
}

.gea-home-card-copy small {
  color: #a0a4aa;
  font-size: 11px;
  line-height: 1.4;
}

.gea-home-card-arrow {
  flex: none;
  color: #b1b5bc;
  font-size: 15px;
  transition:
    transform 160ms ease,
    color 160ms ease;
}

.gea-home-card-badge {
  display: inline-block;
  margin-left: 7px;
  padding: 1px 6px;
  border-radius: 4px;
  background: #f5e8e9;
  color: #c85158;
  font-size: 10px;
  font-style: normal;
  font-weight: 500;
  line-height: 1.5;
}

.gea-home-panel {
  margin-top: 14px;
  padding: 15px 17px;
  border: 1px solid #ececef;
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 4px 16px rgb(28 33 40 / 4%);
  text-align: left;
}

.gea-home-panel-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 11px;
}

.gea-home-panel-head strong {
  color: #2c2f34;
  font-size: 13px;
  font-weight: 600;
}

.gea-home-panel-head small {
  color: #a0a4aa;
  font-size: 11px;
}

.gea-home-panel-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.gea-home-panel-item {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid #eef0f3 !important;
  border-radius: 10px;
  background: #fcfcfd !important;
  color: #3f4856;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.gea-home-panel-item:hover {
  border-color: #e7a4ae !important;
  background: #fff5f6 !important;
}

.gea-home-panel-item:focus-visible {
  outline: 2px solid #df1732;
  outline-offset: 2px;
}

.gea-home-panel-copy {
  display: grid;
  min-width: 0;
  flex: 1 1 auto;
  gap: 2px;
}

.gea-home-panel-copy strong {
  color: #2c2f34;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.gea-home-panel-copy small {
  color: #9a9a96;
  font-size: 11px;
  line-height: 1.45;
}

.gea-home-panel-note {
  margin: 2px 0 0;
  color: #9a9a96;
  font-size: 12px;
  line-height: 1.7;
}

.gea-home-panel-foot {
  display: flex;
  justify-content: flex-end;
  margin-top: 11px;
}

.gea-home-panel-more {
  padding: 7px 13px;
  border: 1px solid #e9d7da !important;
  border-radius: 999px;
  background: #fff7f8 !important;
  color: #c14049;
  font: inherit;
  font-size: 11px;
  cursor: pointer;
}

.gea-home-panel-more:hover {
  border-color: #e7a4ae !important;
  background: #fff0f2 !important;
}

.gea-home-prompts {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  margin-top: 16px;
}

.gea-home-panel .gea-home-prompts {
  justify-content: flex-start;
  margin-top: 0;
}

.gea-home-prompts button {
  padding: 8px 14px;
  border: 1px solid #ececef !important;
  border-radius: 999px;
  background: #fff !important;
  color: #5f5f5a;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

.gea-home-prompts button:hover {
  border-color: #e7a4ae !important;
  background: #fff5f6 !important;
  color: #c52138;
}

.gea-home-prompts button:focus-visible {
  outline: 2px solid #df1732;
  outline-offset: 2px;
}

@media (max-height: 800px) {
  .gea-home-logo {
    width: 62px;
    height: 62px;
    margin-bottom: 8px;
  }

  .gea-home-eyebrow {
    margin-bottom: 12px;
  }

  .gea-home-description {
    margin: 14px auto 16px;
  }

  .gea-home-card {
    padding: 11px 13px;
  }
}

.gea-inbox {
  --inbox-brand: #c91414;
  --inbox-muted: light-dark(#626975, #b6bdc8);
  --inbox-border: light-dark(#e5e6eb, #41444c);
  --inbox-panel: light-dark(#fff, #24262b);
  --inbox-bg: light-dark(#f2f3f5, #1b1d21);
  height: 100%;
  overflow: auto;
  color: light-dark(#1d2129, #edf0f5);
  background: var(--inbox-bg);
  font-size: 14px;
  font-family:
    -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans',
    sans-serif;
}

.gea-inbox *,
.gea-inbox *::before,
.gea-inbox *::after {
  box-sizing: border-box;
}

.gea-inbox-header,
.gea-inbox-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 24px;
  background: var(--inbox-panel);
  border-bottom: 1px solid var(--inbox-border);
}

.gea-inbox-heading {
  display: flex;
  align-items: center;
  gap: 24px;
}

.gea-inbox h1 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

.gea-inbox-unread {
  color: var(--inbox-muted);
  font-size: 13px;
}

.gea-inbox button,
.gea-inbox select {
  font: inherit;
  color: inherit;
  border: 1px solid var(--inbox-border);
  border-radius: 4px;
  background: var(--inbox-panel);
  padding: 7px 12px;
  cursor: pointer;
}

.gea-inbox button:hover:not(:disabled) {
  background: var(--inbox-bg);
}

.gea-inbox button:disabled {
  opacity: 0.5;
  cursor: default;
}

.gea-inbox :is(button, select):focus-visible {
  outline: 2px solid var(--inbox-brand);
  outline-offset: 2px;
}

.gea-inbox ::selection {
  background: #fbd4d4;
  color: #601010;
}

.gea-inbox-toolbar {
  padding-block: 12px;
  flex-wrap: wrap;
}

.gea-inbox-filter {
  display: flex;
  align-items: center;
  gap: 12px;
}

.gea-inbox-filter select {
  min-width: 120px;
  background: var(--inbox-bg);
}

.gea-inbox-hint,
.gea-inbox-provenance {
  color: var(--inbox-muted);
  font-size: 12px;
}

.gea-inbox-content {
  max-width: 1440px;
  margin: auto;
  padding: 16px 24px;
}

.gea-inbox-table-scroll {
  overflow-x: auto;
}

.gea-inbox-loading-row td {
  height: 420px;
  vertical-align: top;
  color: var(--inbox-muted);
}

.gea-inbox-placeholder {
  height: 340px;
  background: repeating-linear-gradient(to bottom, var(--inbox-border) 0 1px, transparent 1px 52px);
}

.gea-inbox-detail-loading {
  height: 24px;
  color: var(--inbox-muted);
  font-size: 12px;
}

.gea-inbox table {
  border-collapse: collapse;
  width: 100%;
  min-width: 900px;
  table-layout: fixed;
}

.gea-inbox th,
.gea-inbox td {
  padding: 14px 16px;
  text-align: left;
  border-bottom: 1px solid var(--inbox-border);
  line-height: 1.6;
  overflow-wrap: anywhere;
}

.gea-inbox th {
  font-size: 13px;
  font-weight: 600;
}

.gea-inbox th:nth-child(1) {
  width: 4%;
}

.gea-inbox th:nth-child(2) {
  width: 14%;
}

.gea-inbox th:nth-child(3) {
  width: 25%;
}

.gea-inbox th:nth-child(4) {
  width: 28%;
}

.gea-inbox th:nth-child(5) {
  width: 18%;
}

.gea-inbox th:nth-child(6) {
  width: 11%;
}

.gea-inbox-select-col {
  text-align: center !important;
}

.gea-inbox tbody tr {
  background: var(--inbox-panel);
  cursor: pointer;
}

.gea-inbox tbody tr:hover {
  background: light-dark(#fff7f7, #302629);
}

.gea-inbox .gea-inbox-subject {
  text-align: left;
  padding: 0;
  border: 0;
  background: transparent;
  line-height: 1.6;
  font-size: 14px;
  font-weight: 400;
}

.gea-inbox tr.is-unread .gea-inbox-subject {
  font-weight: 500;
}

.gea-inbox-summary {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  color: var(--inbox-muted);
}

.gea-inbox-kind,
.gea-inbox-status {
  display: inline-block;
  font-size: 12px;
  line-height: 1.6;
  padding: 2px 7px;
  border-radius: 3px;
  background: var(--inbox-bg);
  color: var(--inbox-muted);
}

.gea-inbox-kind,
.gea-inbox-status.is-unread {
  background: light-dark(#fdecec, #492525);
  color: light-dark(#bd1515, #ffabab);
}

.gea-inbox-provenance summary {
  cursor: pointer;
}

.gea-inbox-date {
  font-variant-numeric: tabular-nums;
  font-size: 13px;
}

.gea-inbox-pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-block: 16px;
  color: var(--inbox-muted);
}

.gea-inbox-pagination > div {
  display: flex;
  gap: 8px;
}

.gea-inbox-empty {
  text-align: center;
  padding: 48px 16px;
  color: var(--inbox-muted);
  background: var(--inbox-panel);
  margin: 0;
}

.gea-inbox-header-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.gea-inbox-action {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin: 0 0 18px;
  padding: 10px 12px;
  border: 1px solid var(--inbox-border);
  border-radius: 6px;
  background: var(--inbox-bg);
  font-weight: 600;
}

.gea-inbox-action small {
  color: var(--inbox-muted);
  font-weight: 400;
}

.gea-inbox-detail-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 16px 0;
  border: 0;
  padding: 0;
  min-width: 0;
}

.gea-inbox-drawer {
  position: fixed;
  inset: 0 0 0 auto;
  margin: 0;
  padding: 0;
  width: min(520px, 100%);
  max-width: 100%;
  height: 100%;
  max-height: 100%;
  border: 0;
  background: var(--inbox-panel);
  color: inherit;
}

.gea-inbox-drawer::backdrop {
  background: #1d212999;
}

.gea-inbox-drawer-layout {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.gea-inbox-drawer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 20px;
  min-height: 48px;
  border-bottom: 1px solid var(--inbox-border);
}

.gea-inbox-drawer-header h2 {
  margin: 0;
  font-size: 16px;
}

.gea-inbox-drawer-header button {
  display: flex;
  border: 0;
  padding: 8px;
}

.gea-inbox-drawer-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 32px 36px;
}

.gea-inbox-detail-status {
  display: flex;
  gap: 12px;
  margin-bottom: 24px;
}

.gea-inbox-info {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 20px;
  margin: 0 0 28px;
}

.gea-inbox dt,
.gea-inbox-label {
  display: block;
  font-size: 13px;
  color: var(--inbox-muted);
  margin-bottom: 6px;
}

.gea-inbox dd {
  margin: 0;
  overflow-wrap: anywhere;
  line-height: 1.6;
}

.gea-inbox h3 {
  font-size: 16px;
  line-height: 1.6;
  margin: 0 0 24px;
  overflow-wrap: anywhere;
}

.gea-inbox-body {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  background: light-dark(#fafbfc, #1b1d21);
  border: 1px solid var(--inbox-border);
  border-radius: 6px;
  padding: 16px;
  margin: 0;
  line-height: 1.8;
}

.gea-inbox-drawer-footer {
  padding: 16px 20px;
  display: flex;
  justify-content: flex-end;
  border-top: 1px solid var(--inbox-border);
}

@media (max-width: 600px) {
  .gea-inbox-header,
  .gea-inbox-toolbar {
    padding: 12px 16px;
  }

  .gea-inbox-heading {
    gap: 12px;
    flex-wrap: wrap;
  }

  .gea-inbox-content {
    padding: 12px 16px;
  }

  .gea-inbox-info {
    grid-template-columns: 1fr;
  }

  .gea-inbox-drawer-body {
    padding: 20px 16px;
  }
}

.gea-shell-navigation-content > .gea-shell-brand {
  height: 54px;
  border-radius: 0;
  border-bottom: 1px solid #e0e3eb;
  font-size: 16px;
  color: #111;
  padding: 0;
  gap: 16px;
}

.gea-shell-workspaces {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.gea-shell-user .gea-user-avatar {
  width: 27px;
  height: 27px;
  font-size: 9px;
  font-weight: 700;
}

.gea-logout-control {
  width: 100%;
}

.gea-logout-button {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 36px;
  padding: 8px 12px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: inherit;
  cursor: pointer;
}

.gea-logout-button:hover {
  background: rgba(128, 128, 128, 0.12);
}

.gea-logout-button:focus-visible {
  outline: 2px solid #165dff;
  outline-offset: -2px;
}

.gea-logout-button:disabled {
  cursor: wait;
  opacity: 0.6;
}

.gea-logout-control [role='alert'] {
  display: block;
  padding: 4px 12px;
  color: #c62828;
  font-size: 12px;
}

.gea-account-menu {
  position: fixed;
  z-index: 1000;
  width: 200px;
  padding: 5px;
  border: 1px solid rgba(128, 128, 128, 0.2);
  border-radius: 10px;
  background: light-dark(#fff, #242424);
  color: light-dark(#202020, #eee);
  box-shadow: 0 6px 24px #0002;
}

.gea-shell-navigation-content > button,
.gea-shell-workspaces > button,
.gea-shell-group {
  min-width: 0;
  max-width: 100%;
  white-space: nowrap;
}

.gea-shell-navigation button > span,
.gea-shell-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@container gea-sidebar (max-width: 100px) {
  .gea-shell-navigation-content > button,
  .gea-shell-navigation-content > button.is-active {
    padding-inline: 0;
    width: 100%;
  }

  .gea-shell-navigation-content .gea-shell-label {
    display: none;
  }
}

[data-sidebar-collapsed] > :has(.gea-shell-navigation),
[data-sidebar-collapsed] .gea-shell-navigation,
[data-sidebar-collapsed]:has(.gea-shell-navigation) > :first-child {
  background: transparent !important;
  box-shadow: none !important;
}

[data-slot='main.conversation'] [data-gea-wide] {
  max-width: 100%;
  overflow-x: auto;
  overscroll-behavior-x: contain;
}

[data-slot='main.conversation'] table[data-gea-wide] {
  display: block;
}

.gea-shell-navigation .gea-shell-collaboration {
  margin-top: 12px;
  font-weight: 600;
}

.gea-conversation-toolbar {
  position: absolute;
  z-index: 16;
  top: 0;
  right: 0;
  left: 0;
  display: flex;
  box-sizing: border-box;
  height: 58px;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding: 0 20px;
  border-bottom: 1px solid #e5e9f0;
  background: #fff;
}

.gea-conversation-view-switch {
  display: flex;
  flex: none;
  align-items: center;
  gap: 1px;
  height: 32px;
  box-sizing: border-box;
  margin-right: 6px;
  padding: 2px;
  border: 1px solid #dfe4eb;
  border-radius: 12px;
  background: #f5f7fa;
}

.gea-conversation-toolbar button {
  display: grid;
  width: 32px;
  height: 32px;
  flex: 0 0 auto;
  place-items: center;
  box-sizing: border-box;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 7px;
  background: transparent;
  color: #606977;
  cursor: pointer;
  transition:
    background-color 0.2s ease,
    border-color 0.2s ease,
    color 0.2s ease;
}

.gea-conversation-toolbar button:hover {
  border-color: #e8ebf0;
  background: #fbfcfd;
  color: #df1d28;
}

.gea-conversation-view-switch button {
  width: 26px;
  height: 26px;
  border: 0;
  border-radius: 6px;
}

.gea-conversation-toolbar button[aria-pressed='true'] {
  background: #fff;
  color: #df1d28;
  box-shadow: 0 1px 3px rgba(15, 34, 64, 0.14);
}

.gea-conversation-toolbar button:focus-visible {
  outline: 2px solid #d0132c;
  outline-offset: 2px;
}

.gea-conversation-toolbar svg {
  width: 16px;
  height: 16px;
}

.gea-conversation-toolbar-tool {
  min-width: 44px;
  max-width: 160px;
  width: 160px;
  flex: 1 1 44px;
}

@media (max-width: 1200px) {
  .gea-conversation-toolbar {
    gap: 4px;
    padding-inline: 8px;
  }
}

.gea-conversation-toolbar-action {
  margin: 0;
}

.gea-conversation-toolbar-error {
  position: absolute;
  right: 10px;
  top: 58px;
  padding: 5px 8px;
  border: 1px solid #e7acb5;
  border-radius: 5px;
  background: #fff6f7;
  color: #b51931;
  font-size: 12px;
}

.gea-agent-welcome > .gea-agent-identity,
.gea-agent-welcome > .gea-agent-block {
  width: 100%;
  max-width: var(--gea-conversation-content-max-width, 760px);
  box-sizing: border-box;
  margin-left: auto;
  margin-right: auto;
}

.gea-identity-warning {
  position: fixed;
  top: 54px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 100;
  margin: 0;
  max-width: calc(100vw - 32px);
  padding: 6px 12px;
  border: 1px solid var(--dsw-alias-danger-border, #e7acb5);
  border-radius: 6px;
  background: var(--dsw-alias-bg-primary, #fff);
  color: var(--dsw-alias-danger, #b51931);
  font-size: 12px;
}
`;

// src/company/layout.css
var layout_default = "/* Owned containers replacing the old portal anchors. Visual rules stay in shell.css. */\n.gea-sidebar-owned {\n  height: 100%;\n  min-height: 0;\n  display: flex;\n  flex-direction: column;\n  box-sizing: border-box;\n  padding: 12px;\n}\n.gea-sidebar-owned[data-gea-narrow] {\n  padding-inline: 0;\n}\n.gea-sidebar-brand-row,\n.gea-sidebar-brand {\n  display: flex;\n  align-items: center;\n  min-width: 0;\n}\n.gea-sidebar-brand-row {\n  position: relative;\n}\nhtml[data-platform='darwin'] .gea-sidebar-brand-row > .gea-inbox-quick-action {\n  right: 0;\n}\n.gea-sidebar-brand {\n  flex: 1;\n}\n.gea-sidebar-region {\n  flex: 1;\n}\n.gea-sidebar-footer {\n  display: flex;\n  align-items: center;\n  flex: none;\n}\n.gea-sidebar-footer > div:first-child {\n  flex: 1;\n  min-width: 0;\n}\n.gea-workspace-owned {\n  order: 4;\n  flex: 1;\n  min-height: 0;\n  overflow: hidden;\n}\n.gea-workspace-owned[hidden] {\n  display: none;\n}\n.gea-account-launcher {\n  --gea-sidebar-ink: var(--workbench-text);\n}\n.gea-company-main {\n  height: 100%;\n  min-height: 0;\n  display: flex;\n  flex-direction: column;\n  overflow: hidden;\n  background: white;\n}\n.gea-native-content {\n  flex: 1;\n  min-height: 0;\n  display: flex;\n  flex-direction: column;\n  overflow: hidden;\n}\n.gea-main-views {\n  display: flex;\n  flex-direction: column;\n  flex: 1 0 auto;\n  min-height: 0;\n}\n.gea-home-position {\n  flex: 1;\n  min-height: 0;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n}\n.gea-native-history {\n  flex: 1;\n  min-height: 0;\n  display: flex;\n  flex-direction: column;\n}\n.gea-native-history[hidden] {\n  display: none;\n}\n.gea-cold-start {\n  order: -1;\n  flex: 0 1 auto;\n  min-height: 0;\n  display: flex;\n  flex-direction: column;\n  overflow: auto;\n}\n.gea-owned-sidebar-toggle,\n.gea-shell-leading .gea-inbox-quick-action {\n  position: static;\n  transform: none;\n  flex: none;\n}\n.gea-native-selectors {\n  box-sizing: border-box;\n  width: calc(100% - var(--dsh-composer-side-clearance) - var(--dsh-composer-side-clearance));\n  max-width: var(--dsh-composer-card-max-width);\n  margin-left: auto;\n  margin-right: auto;\n  margin-bottom: 8px;\n}\n.gea-directory-owned {\n  height: 100%;\n  min-height: 0;\n  overflow: auto;\n  padding: 24px;\n  box-sizing: border-box;\n}\n.gea-sidebar-window-row {\n  display: flex;\n  flex: none;\n  align-items: center;\n  justify-content: flex-end;\n  height: 52px;\n  box-sizing: border-box;\n  margin: -12px -12px 0;\n  padding: 0 12px 2px;\n}\n.gea-sidebar-window-row + .gea-sidebar-brand-row {\n  margin-top: -12px;\n}\nhtml[data-fullscreen] .gea-sidebar-window-row {\n  justify-content: flex-start;\n}\n.gea-shell-leading {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n}\n.gea-plugin-entry {\n  flex: none;\n  margin-bottom: 8px;\n}\n";

// src/company/formal-static-controls.css
var formal_static_controls_default = "/* SPDX-License-Identifier: MIT; @deepseek-ai/dsh-client-ui-sidebar and dsh-client-ui-conversation, formal channel52a8570d. */\n/* Exact static declarations from the active formal UI; only selector ownership changes. */\n.gea-formal-new-session{box-sizing:border-box;border:.5px solid var(--dsw-alias-border-l3);background:var(--dsw-alias-button-elevated-fill);height:38px;color:var(--dsw-alias-label-primary);cursor:pointer;border-radius:12px;flex:none;justify-content:center;align-items:center;gap:6px;margin:0 2px 8px;padding:8px 16px;font-size:14px;font-weight:500;line-height:22px;display:flex;overflow:hidden}\n.gea-formal-new-session:hover{background:var(--dsw-alias-button-floating-hover)}\n.gea-formal-new-session-label{white-space:nowrap;max-width:200px;overflow:hidden}\n.gea-formal-workspace{max-width:min(100%,360px);min-height:28px;color:var(--dsw-alias-label-primary);cursor:pointer;background:0 0;border:none;border-radius:16px;align-items:center;gap:4px;padding:0 8px;font-size:13px;font-weight:500;line-height:20px;display:inline-flex}\n.gea-formal-workspace:not(:disabled):hover,.gea-formal-workspace[aria-expanded=true]{background:var(--dsw-alias-interactive-bg-hover)}\n.gea-formal-workspace:disabled{cursor:default}\n.gea-formal-folder{color:var(--dsw-alias-label-primary);flex:none}\n.gea-formal-workspace-label{text-overflow:ellipsis;white-space:nowrap;min-width:0;overflow:hidden}\n.gea-formal-workspace-chevron{color:var(--dsw-alias-label-caption);flex:none}\n.gea-native-selectors{align-items:center;gap:2px;min-width:0;margin-top:4px;padding:0 16px 0 20px;display:flex}\n";

// src/company/formal-static-icons.tsx
var import_react23 = __toESM(require("react"), 1);
var IconNewChatOutline16 = ({ size = 16, className }) => import_react23.default.createElement("svg", {
  width: size,
  height: size,
  className,
  viewBox: "0 0 16 16",
  fill: "none",
  xmlns: "http://www.w3.org/2000/svg",
  children: import_react23.default.createElement("path", {
    d: "M8.00003 0.3237C3.76075 0.3237 0.32373 3.76072 0.32373 8C0.32373 9.17603 0.589121 10.2922 1.0632 11.2901L1.35291 11.8989L2.5705 11.3205L2.28079 10.7117C1.89079 9.89074 1.67301 8.97167 1.67301 8C1.67301 4.50546 4.50549 1.67298 8.00003 1.67298C11.4946 1.67298 14.3271 4.50546 14.3271 8C14.3271 11.4945 11.4946 14.327 8.00003 14.327C7.28473 14.327 6.76077 14.277 6.29621 14.1487C5.83857 14.0224 5.40441 13.8109 4.88514 13.4488C4.12569 12.919 3.03778 12.7316 2.141 13.2978L2.12682 13.307L2.11264 13.3171L1.34886 13.854L1.79659 15.188L2.86122 14.4384C3.19068 14.2305 3.68325 14.2542 4.11326 14.5539C4.72789 14.9826 5.30042 15.2724 5.93762 15.4484C6.56803 15.6224 7.22776 15.6763 8.00003 15.6763C12.2393 15.6763 15.6763 12.2393 15.6763 8C15.6763 3.76072 12.2393 0.3237 8.00003 0.3237ZM7.32033 4.82535V7.32536H4.82538V8.67464H7.32033V11.1747H8.6696V8.67464H11.1747V7.32536H8.6696V4.82535H7.32033Z",
    fill: "currentColor"
  })
});
var IconChevronDownOutline14 = ({ size = 14, className }) => import_react23.default.createElement("svg", {
  width: size,
  height: size,
  className,
  viewBox: "0 0 14 14",
  fill: "none",
  xmlns: "http://www.w3.org/2000/svg",
  children: import_react23.default.createElement("path", {
    d: "M11.8486 5.5L11.4238 5.92383L8.69727 8.65137C8.44157 8.90706 8.21562 9.13382 8.01172 9.29785C7.79912 9.46883 7.55595 9.61756 7.25 9.66602C7.08435 9.69222 6.91565 9.69222 6.75 9.66602C6.44405 9.61756 6.20088 9.46883 5.98828 9.29785C5.78438 9.13382 5.55843 8.90706 5.30273 8.65137L2.57617 5.92383L2.15137 5.5L3 4.65137L3.42383 5.07617L6.15137 7.80273C6.42595 8.07732 6.59876 8.24849 6.74023 8.3623C6.87291 8.46904 6.92272 8.47813 6.9375 8.48047C6.97895 8.48703 7.02105 8.48703 7.0625 8.48047C7.07728 8.47813 7.12709 8.46904 7.25977 8.3623C7.40124 8.24849 7.57405 8.07732 7.84863 7.80273L10.5762 5.07617L11 4.65137L11.8486 5.5Z",
    fill: "currentColor"
  })
});
var IconFolderOpen16 = ({ size = 16, className }) => import_react23.default.createElement("svg", {
  width: size,
  height: size,
  className,
  viewBox: "0 0 16 16",
  fill: "none",
  children: [import_react23.default.createElement("path", {
    d: "M5.19629 1.57104C5.81144 1.5711 6.38623 1.8786 6.72754 2.39038L7.19922 3.09839C7.28454 3.22635 7.42824 3.30344 7.58203 3.30347H12.1699C13.5039 3.30348 14.5859 4.38548 14.5859 5.71948V6.62671C15.2694 7.02689 15.6605 7.85012 15.4385 8.68726L14.3848 12.658C14.1037 13.7164 13.1449 14.4527 12.0498 14.4529H2.91699C1.51651 14.4529 0.451662 13.2814 0.501954 11.9519V3.98706C0.501954 2.65305 1.58396 1.57104 2.91797 1.57104H5.19629ZM3.7793 7.75562C3.30994 7.75562 2.89883 8.07153 2.77832 8.52515L1.91602 11.7722C1.74167 12.4291 2.23734 13.073 2.91699 13.073H12.0498C12.5191 13.0728 12.9304 12.757 13.0508 12.3035L14.1045 8.33374C14.1819 8.04202 13.9619 7.756 13.6602 7.75562H3.7793ZM2.91797 2.9519C2.34625 2.9519 1.88281 3.41534 1.88281 3.98706V7.2937C2.33068 6.7269 3.02249 6.37476 3.7793 6.37476H13.2051V5.71948C13.2051 5.14777 12.7416 4.68434 12.1699 4.68433H7.58203C6.96675 4.6843 6.39209 4.37595 6.05078 3.86401L5.5791 3.15601C5.49379 3.02821 5.34995 2.95196 5.19629 2.9519H2.91797Z",
    fill: "currentColor"
  }), import_react23.default.createElement("path", {
    opacity: "0.2",
    d: "M13.6602 7.75525C13.9618 7.7556 14.1815 8.04179 14.1045 8.33337L13.0508 12.3031C12.9304 12.7567 12.5191 13.0725 12.0498 13.0726H2.91701C2.23744 13.0725 1.7417 12.4287 1.91603 11.7719L2.77834 8.52478C2.89898 8.07146 3.31018 7.75532 3.77931 7.75525H13.6602ZM5.1963 2.95154C5.34985 2.95159 5.49377 3.02803 5.57912 3.15564L6.0508 3.86365C6.39205 4.37553 6.96685 4.68385 7.58205 4.68396H12.1699C12.7416 4.68396 13.2049 5.14754 13.2051 5.71912V6.37439H3.77931C3.02267 6.37444 2.33067 6.72671 1.88283 7.29333V3.98669C1.88299 3.4152 2.34649 2.95168 2.91798 2.95154H5.1963Z",
    fill: "currentColor"
  })]
});
var IconFolderClose16 = ({ size = 16, className }) => import_react23.default.createElement("svg", {
  width: size,
  height: size,
  className,
  viewBox: "0 0 16 16",
  fill: "none",
  children: import_react23.default.createElement("path", {
    transform: "translate(1.5 2.429)",
    d: "M5.05582 0.518756L4.50669 0.86654L5.05582 0.518756ZM13 9.4837L13.65 9.4837L13.65 3.53962L13 3.53962L12.35 3.53962L12.35 9.4837L13 9.4837ZM11.3264 1.86603L11.3264 1.21603L6.52313 1.21603L6.52313 1.86603L6.52313 2.51603L11.3264 2.51603L11.3264 1.86603ZM5.58054 1.34727L6.12968 0.999489L5.60495 0.170972L5.05582 0.518756L4.50669 0.86654L5.03141 1.69506L5.58054 1.34727ZM4.11323 1.23058e-13L4.11323 -0.65L1.67359 -0.65L1.67359 5.00699e-14L1.67359 0.65L4.11323 0.65L4.11323 1.23058e-13ZM0 1.67359L-0.65 1.67359L-0.65 9.4837L0 9.4837L0.65 9.4837L0.65 1.67359L0 1.67359ZM11.3264 11.1573L11.3264 10.5073L1.67359 10.5073L1.67359 11.1573L1.67359 11.8073L11.3264 11.8073L11.3264 11.1573ZM0 9.4837L-0.65 9.4837C-0.65 10.767 0.390308 11.8073 1.67359 11.8073L1.67359 11.1573L1.67359 10.5073C1.10828 10.5073 0.65 10.049 0.65 9.4837L0 9.4837ZM1.67359 5.00699e-14L1.67359 -0.65C0.390307 -0.65 -0.65 0.390309 -0.65 1.67359L0 1.67359L0.65 1.67359C0.65 1.10828 1.10828 0.65 1.67359 0.65L1.67359 5.00699e-14ZM5.05582 0.518756L5.60495 0.170972C5.28121 -0.340193 4.71829 -0.65 4.11323 -0.65L4.11323 1.23058e-13L4.11323 0.65C4.27282 0.65 4.4213 0.731715 4.50669 0.86654L5.05582 0.518756ZM6.52313 1.86603L6.52313 1.21603C6.36354 1.21603 6.21507 1.13431 6.12968 0.999489L5.58054 1.34727L5.03141 1.69506C5.35515 2.20622 5.91808 2.51603 6.52313 2.51603L6.52313 1.86603ZM13 3.53962L13.65 3.53962C13.65 2.25634 12.6097 1.21603 11.3264 1.21603L11.3264 1.86603L11.3264 2.51603C11.8917 2.51603 12.35 2.97431 12.35 3.53962L13 3.53962ZM13 9.4837L12.35 9.4837C12.35 10.049 11.8917 10.5073 11.3264 10.5073L11.3264 11.1573L11.3264 11.8073C12.6097 11.8073 13.65 10.767 13.65 9.4837L13 9.4837Z",
    fill: "currentColor"
  })
});

// src/company/ui.tsx
var import_jsx_runtime15 = require("react/jsx-runtime");
var DIRECTORY = "agent-workbench";
var INBOX2 = "gea-inbox";
var PLUGINS = "plugins";
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
var unavailableAccount = {
  state: "unknown",
  scope: null,
  subject: null,
  status: null,
  error: void 0
};
var noSubscribe = () => () => {
};
function CompanyWelcome({
  page,
  onFill,
  language = "zh"
}) {
  const agent = page ? agents[page] ?? homeConversation : void 0;
  const copy3 = language === "en" ? en2 : zh2;
  return agent ? /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(AgentWelcome, { agent, onFill: (prompt) => onFill?.(prompt) }) : /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
    GeaHomeHero,
    {
      copy: {
        label: copy3.geaBusiness,
        eyebrow: copy3.homeEyebrow,
        title: copy3.homeTitle,
        description: copy3.homeDescription
      }
    }
  );
}
function mountCompanyUI(ctx, workbench, Resources, restorePageSession = async () => {
}) {
  ctx.effect(() => ctx.locale.register("companyWorkbench", { zh: zh2, en: en2 }));
  const t = ctx.locale.bind("companyWorkbench");
  const SidebarGeometry = import_react24.default.createContext({ collapsed: false, expand: () => {
  } });
  ctx.effect(() => {
    const style = document.createElement("style");
    style.dataset.companyWorkbench = "formal-508feea";
    style.textContent = formal_static_controls_default + "\n" + shell_default + "\n" + layout_default;
    document.head.append(style);
    return () => style.remove();
  });
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
  function IdentityWarning() {
    (0, import_react24.useSyncExternalStore)(
      (listener) => ctx.locale.subscribe(listener),
      () => ctx.locale.getSnapshot().active,
      () => ctx.locale.getSnapshot().active
    );
    const authority = (0, import_react24.useSyncExternalStore)(
      subscribeAccount,
      () => account,
      () => account
    );
    const identity = (0, import_react24.useSyncExternalStore)(
      authority?.subscribe ?? noSubscribe,
      authority?.getSnapshot ?? (() => unavailableAccount),
      authority?.getSnapshot ?? (() => unavailableAccount)
    );
    return identity.error ? /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
      "p",
      {
        role: "alert",
        "data-gea-identity-error": "",
        className: "agent-workbench-ui gea-identity-warning",
        children: t("identityObservationFailed")
      }
    ) : null;
  }
  ctx.slots.inject(
    "shell.overlay",
    () => ctx.slots.register(
      { name: "shell.overlay", id: "gea-identity-warning", locale: "companyWorkbench" },
      IdentityWarning
    )
  );
  function Account({
    wide,
    settingsOpen,
    openSettings,
    settingsShortcut
  }) {
    (0, import_react24.useSyncExternalStore)(
      (listener) => ctx.locale.subscribe(listener),
      () => ctx.locale.getSnapshot().active,
      () => ctx.locale.getSnapshot().active
    );
    const authority = (0, import_react24.useSyncExternalStore)(
      subscribeAccount,
      () => account,
      () => account
    );
    const identity = (0, import_react24.useSyncExternalStore)(
      authority?.subscribe ?? noSubscribe,
      authority?.getSnapshot ?? (() => unavailableAccount),
      authority?.getSnapshot ?? (() => unavailableAccount)
    );
    const user = identity.status?.authenticated ? identity.status.user : null;
    const name = user?.name ?? "", avatarUrl = user?.avatar ?? "";
    const [failedAvatar, setFailedAvatar] = (0, import_react24.useState)(null);
    (0, import_react24.useEffect)(() => {
      setFailedAvatar(null);
    }, [avatarUrl]);
    const menu = (0, import_react24.useRef)(null), trigger = (0, import_react24.useRef)(null);
    const [position, setPosition] = (0, import_react24.useState)(null);
    const pending = (0, import_react24.useRef)();
    const [busy, setBusy] = (0, import_react24.useState)(false), [failed, setFailed] = (0, import_react24.useState)(false);
    const close = () => {
      pending.current?.abort();
      setBusy(false);
      setPosition(null);
    };
    (0, import_react24.useEffect)(() => () => pending.current?.abort(), [authority]);
    (0, import_react24.useEffect)(() => {
      if (settingsOpen) close();
    }, [settingsOpen]);
    (0, import_react24.useEffect)(() => {
      if (!position) return;
      menu.current?.querySelector("button")?.focus();
      const outside = (event) => {
        if (event.target instanceof Node && !menu.current?.contains(event.target) && !trigger.current?.contains(event.target))
          close();
      };
      const resize = () => close();
      const escape = (event) => {
        if (event.key === "Escape") {
          close();
          trigger.current?.focus();
        }
      };
      document.addEventListener("pointerdown", outside);
      document.addEventListener("keydown", escape);
      window.addEventListener("resize", resize);
      window.addEventListener("blur", resize);
      return () => {
        document.removeEventListener("pointerdown", outside);
        document.removeEventListener("keydown", escape);
        window.removeEventListener("resize", resize);
        window.removeEventListener("blur", resize);
      };
    }, [position]);
    const logout = async () => {
      if (!authority || busy) return;
      const controller = new AbortController();
      pending.current = controller;
      setBusy(true);
      setFailed(false);
      try {
        await authority.logout(controller.signal);
        controller.signal.throwIfAborted();
        setPosition(null);
      } catch {
        if (!controller.signal.aborted) setFailed(true);
      } finally {
        if (!controller.signal.aborted) setBusy(false);
      }
    };
    return /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)(import_jsx_runtime15.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)(
        "button",
        {
          ref: trigger,
          type: "button",
          className: "gea-sidebar-tab gea-account-launcher",
          "aria-label": t("accountMenu"),
          "aria-haspopup": "menu",
          "aria-expanded": position !== null,
          "aria-keyshortcuts": settingsShortcut?.aria,
          onClick: (event) => {
            if (position) {
              close();
              return;
            }
            const rect = event.currentTarget.getBoundingClientRect();
            setPosition({
              left: Math.min(rect.left, window.innerWidth - 212),
              bottom: window.innerHeight - rect.top + 6
            });
          },
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { className: "gea-user-avatar", "aria-hidden": "true", children: avatarUrl && failedAvatar !== avatarUrl ? /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
              "img",
              {
                src: avatarUrl,
                alt: "",
                referrerPolicy: "no-referrer",
                onError: () => setFailedAvatar(avatarUrl)
              },
              avatarUrl
            ) : name.slice(0, 1) || "G" }),
            wide && /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { children: name || t("signedOut") })
          ]
        }
      ),
      position && (0, import_react_dom.createPortal)(
        /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)(
          "div",
          {
            ref: menu,
            role: "menu",
            "aria-label": t("accountMenu"),
            className: "gea-account-menu",
            style: position,
            onClick: (event) => event.stopPropagation(),
            onKeyDown: (event) => {
              event.stopPropagation();
              if (event.key === "Escape") {
                event.preventDefault();
                close();
                trigger.current?.focus();
              }
              if (event.key === "Tab") close();
              if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
                event.preventDefault();
                const items = Array.from(
                  menu.current?.querySelectorAll("button:not(:disabled)") ?? []
                );
                const index = items.indexOf(document.activeElement);
                const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (index + (event.key === "ArrowUp" ? -1 : 1) + items.length) % items.length;
                items[next]?.focus();
              }
            },
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)(
                "button",
                {
                  type: "button",
                  role: "menuitem",
                  className: "gea-logout-button",
                  onClick: () => {
                    close();
                    openSettings();
                  },
                  children: [
                    /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { "aria-hidden": "true", children: "\u2699" }),
                    /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { children: t("settings") })
                  ]
                }
              ),
              name && /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "gea-logout-control", children: [
                /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)(
                  "button",
                  {
                    type: "button",
                    role: "menuitem",
                    className: "gea-logout-button",
                    title: t("logout"),
                    "aria-label": t("logout"),
                    disabled: busy,
                    onClick: () => void logout(),
                    children: [
                      /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
                        "svg",
                        {
                          "aria-hidden": "true",
                          width: "16",
                          height: "16",
                          viewBox: "0 0 24 24",
                          fill: "none",
                          stroke: "currentColor",
                          strokeWidth: "1.5",
                          children: /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("path", { d: "M10 4H4v16h6M14 8l4 4-4 4M8 12h10" })
                        }
                      ),
                      /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { children: t(busy ? "loggingOut" : "logout") })
                    ]
                  }
                ),
                failed && /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { role: "alert", children: t("logoutFailed") })
              ] })
            ]
          }
        ),
        document.body
      )
    ] });
  }
  function Sidebar({
    collapsed,
    width,
    usePanelInfo,
    renderSlot
  }) {
    (0, import_react24.useSyncExternalStore)(
      (listener) => ctx.locale.subscribe(listener),
      () => ctx.locale.getSnapshot().active,
      () => ctx.locale.getSnapshot().active
    );
    const darwin = typeof document !== "undefined" && document.documentElement.dataset.platform === "darwin";
    const sidebarToggle = /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
      "button",
      {
        type: "button",
        className: "gea-inbox-quick-action gea-owned-sidebar-toggle",
        "aria-label": "\u6536\u8D77\u4FA7\u8FB9\u680F",
        onClick: () => ctx.layout.toggleSidebar(),
        children: /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(IconPanelLeftOutlineRegular, { size: 16 })
      }
    );
    const documentState = (0, import_react24.useSyncExternalStore)(
      workbench.subscribe,
      workbench.getSnapshot,
      workbench.getSnapshot
    );
    const layoutPanel = usePanelInfo((value) => value.activePanelId);
    const activePanel = layoutPanel ?? documentState.selectedDocument?.id;
    const business = Boolean(
      activePanel && ![DIRECTORY, PLUGINS, "gea-api-log"].includes(activePanel)
    );
    const [drawer, setDrawer] = (0, import_react24.useState)(
      () => business ? "function" : "workspace"
    );
    const previousBusiness = (0, import_react24.useRef)(business);
    (0, import_react24.useEffect)(() => {
      if (business && !previousBusiness.current) setDrawer("function");
      previousBusiness.current = business;
    }, [business]);
    const [sections, setSections] = (0, import_react24.useState)({
      supply: true,
      plan: true,
      inventory: true,
      orders: true
    });
    const [entries2, setEntries] = (0, import_react24.useState)(() => ctx.slots.entries("main"));
    (0, import_react24.useEffect)(() => {
      const refresh = () => setEntries([...ctx.slots.entries("main")]);
      const offs = [
        ctx.slots.subscribe("main", refresh),
        ctx.slots.subscribe("sidebar.panellist", refresh),
        workbench.subscribe(refresh)
      ];
      return () => offs.forEach((off) => off());
    }, []);
    const available = new Map([
      ...entries2.filter((entry) => entry.options.key).map(
        (entry) => [entry.options.key, workbench.label(entry.options.key)]
      ),
      ...documentState.pages.map((page) => [page.id, workbench.label(page.id)])
    ]);
    const menu = resolveBusinessMenu(BUSINESS_MENU_PRESET, available);
    const expandSidebar = () => {
      if (collapsed) ctx.layout.toggleSidebar();
    };
    (0, import_react24.useEffect)(
      () => workbench.subscribeHistory(() => {
        setDrawer("workspace");
        expandSidebar();
      }),
      [collapsed]
    );
    const newConversation = () => {
      workbench.leaveDocument();
      setDrawer("workspace");
      expandSidebar();
      ctx.uiWorkspace.startSession();
    };
    const toggleDrawer = (name) => setDrawer((value) => value === name ? "none" : name);
    const pluginLabel = ctx.slots.entries("sidebar.panellist").find((entry) => entry.options.id === PLUGINS)?.options.label;
    const modules = [{ id: DIRECTORY, label: "\u5DE5\u4F5C\u53F0" }];
    return /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)(
      "aside",
      {
        className: "gea-sidebar-owned",
        "data-gea-narrow": collapsed || width <= 100 ? "" : void 0,
        "data-sidebar-collapsed": collapsed ? "" : void 0,
        "aria-label": t("businessNavigation"),
        children: [
          darwin && /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("div", { className: "gea-sidebar-window-row", "data-window-drag": true, children: sidebarToggle }),
          /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(SidebarGeometry.Provider, { value: { collapsed, expand: expandSidebar }, children: /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "gea-sidebar-brand-row", children: [
            /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "gea-sidebar-brand", children: [
              renderSlot("sidebar.brand.mark", { size: 38 }),
              !collapsed && renderSlot("sidebar.brand.name", {})
            ] }),
            !collapsed && /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)(import_jsx_runtime15.Fragment, { children: [
              /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
                "button",
                {
                  type: "button",
                  className: "gea-inbox-quick-action",
                  "aria-label": t("messageInbox"),
                  title: "\u4E1A\u52A1\u4EE3\u529E",
                  disabled: !available.has(INBOX2),
                  onClick: () => void workbench.open(INBOX2),
                  children: /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(NavIcon, { kind: "bell" })
                }
              ),
              !darwin && sidebarToggle
            ] })
          ] }) }),
          !collapsed && /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)(
            "button",
            {
              type: "button",
              className: "gea-formal-new-session gea-new-session",
              "aria-label": t("newConversation"),
              onClick: newConversation,
              children: [
                /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(IconNewChatOutline16, { size: 14 }),
                /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { className: "gea-formal-new-session-label", children: "AI\u5DE5\u4F5C\u53F0" })
              ]
            }
          ),
          !collapsed && available.has(PLUGINS) && /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)(
            "button",
            {
              type: "button",
              className: "gea-sidebar-tab gea-plugin-entry" + (activePanel === PLUGINS ? " is-active" : ""),
              "aria-current": activePanel === PLUGINS ? "page" : void 0,
              onClick: () => void workbench.open(PLUGINS),
              children: [
                /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(IconPluginPinwheelOutlineRegular, { size: 16 }),
                /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { children: typeof pluginLabel === "function" ? pluginLabel() : pluginLabel ?? PLUGINS })
              ]
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "gea-sidebar-region", "data-gea-drawer": drawer, children: [
            /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("div", { className: "gea-sidebar-rail", "data-gea-sidebar-rail": true, children: [
              ["newChat", t("newConversation"), newConversation, false],
              [
                "apps",
                t("functionArea"),
                () => {
                  setDrawer("function");
                  expandSidebar();
                },
                drawer === "function"
              ],
              [
                "folder",
                t("workspaceArea"),
                () => {
                  setDrawer("workspace");
                  expandSidebar();
                },
                drawer === "workspace"
              ]
            ].map(([kind, label, action, selected]) => /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
              "button",
              {
                type: "button",
                className: "gea-sidebar-rail-item" + (selected ? " is-active" : ""),
                title: label,
                "aria-label": label,
                "aria-current": selected ? "page" : void 0,
                onClick: action,
                children: /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(NavIcon, { kind })
              },
              kind
            )) }),
            /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("div", { className: "gea-sidebar-drawer gea-drawer-function", children: /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)(
              "button",
              {
                type: "button",
                className: "gea-sidebar-tab",
                "aria-expanded": drawer === "function",
                "aria-controls": "gea-panel-function",
                onClick: () => toggleDrawer("function"),
                children: [
                  /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { className: "gea-drawer-title", children: t("functionArea") }),
                  /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(Chevron, { open: drawer === "function" })
                ]
              }
            ) }),
            /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("div", { className: "gea-sidebar-drawer gea-drawer-workspace", children: /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)(
              "button",
              {
                type: "button",
                className: "gea-sidebar-tab",
                "aria-expanded": drawer === "workspace",
                "aria-controls": "gea-panel-workspace",
                onClick: () => toggleDrawer("workspace"),
                children: [
                  /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { className: "gea-drawer-title", children: t("workspaceArea") }),
                  /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(Chevron, { open: drawer === "workspace" })
                ]
              }
            ) }),
            drawer === "function" && /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("div", { className: "gea-sidebar-panel gea-panel-function", id: "gea-panel-function", children: /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("nav", { className: "gea-shell-navigation", "aria-label": t("businessNavigation"), children: /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "gea-shell-navigation-content", children: [
              menu.map((group) => /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)(
                "div",
                {
                  className: "gea-shell-nav-section" + (group.flat ? " is-flat" : ""),
                  children: [
                    !group.flat && /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)(
                      "button",
                      {
                        type: "button",
                        className: "gea-shell-nav-heading",
                        "aria-expanded": sections[group.key],
                        onClick: () => setSections((value) => ({ ...value, [group.key]: !value[group.key] })),
                        children: [
                          /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(NavIcon, { kind: group.icon }),
                          /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { children: group.title }),
                          /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(Chevron, { open: sections[group.key] })
                        ]
                      }
                    ),
                    (group.flat || sections[group.key]) && /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("div", { className: "gea-shell-nav-children", children: group.entries.map(({ id, title, disabled }) => /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
                      "button",
                      {
                        type: "button",
                        disabled,
                        "data-gea-business-entry": id,
                        "aria-current": activePanel === id ? "page" : void 0,
                        className: "gea-shell-nav-child" + (activePanel === id ? " is-active" : ""),
                        onClick: () => void workbench.open(id),
                        children: /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { className: "gea-shell-label", children: title })
                      },
                      id
                    )) })
                  ]
                },
                group.key
              )),
              /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("div", { className: "gea-shell-plugin-group", children: modules.filter((module2) => available.has(module2.id)).map((module2) => /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)(
                "button",
                {
                  type: "button",
                  className: "gea-shell-nav-child gea-shell-plugin" + (activePanel === module2.id ? " is-active" : ""),
                  "aria-current": activePanel === module2.id ? "page" : void 0,
                  onClick: () => void workbench.open(module2.id),
                  children: [
                    /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { className: "gea-shell-plugin-dot", "aria-hidden": "true" }),
                    /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { className: "gea-shell-label", children: module2.label })
                  ]
                },
                module2.id
              )) })
            ] }) }) }),
            /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("div", { className: "gea-workspace-owned", hidden: drawer !== "workspace", children: renderSlot("sidebar.workspaces", { wide: !collapsed, expandSidebar }) })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("footer", { className: "gea-sidebar-footer", children: [
            renderSlot("sidebar.settings", { wide: !collapsed }),
            renderSlot("sidebar.footer.action", { wide: !collapsed })
          ] })
        ]
      }
    );
  }
  function Conversation({
    sessionId,
    useSession,
    useConversation,
    useSessions,
    renderFactorySlot
  }) {
    (0, import_react24.useSyncExternalStore)(
      (listener) => ctx.locale.subscribe(listener),
      () => ctx.locale.getSnapshot().active,
      () => ctx.locale.getSnapshot().active
    );
    const session = useSession((value) => value), conversation = useConversation((value) => value);
    const catalogue = useSessions((value) => value);
    const documentState = (0, import_react24.useSyncExternalStore)(
      workbench.subscribe,
      workbench.getSnapshot,
      workbench.getSnapshot
    );
    const [historyError, setHistoryError] = (0, import_react24.useState)("");
    const authority = (0, import_react24.useSyncExternalStore)(
      subscribeAccount,
      () => account,
      () => account
    );
    const identity = (0, import_react24.useSyncExternalStore)(
      authority?.subscribe ?? noSubscribe,
      authority?.getSnapshot ?? (() => unavailableAccount),
      authority?.getSnapshot ?? (() => unavailableAccount)
    );
    const recovery = workbench.recoveryTarget();
    const recoveryKey = recovery ? JSON.stringify([
      recovery.page,
      recovery.sessionId,
      recovery.preset,
      recovery.cwd,
      recovery.subject,
      recovery.resourceId
    ]) : void 0;
    const directoryReady = catalogue.phase === "ready";
    const savedListed = recovery ? catalogue.ids.includes(recovery.sessionId) : false;
    const savedCwd = recovery ? catalogue.byId[recovery.sessionId]?.cwd : void 0;
    (0, import_react24.useEffect)(() => {
      if (!recovery) return;
      if (catalogue.phase !== "ready") return;
      const savedSession = catalogue.byId[recovery.sessionId];
      if (!catalogue.ids.includes(recovery.sessionId) || !savedSession) {
        setHistoryError(`Session unavailable: ${recovery.sessionId}`);
        return;
      }
      if (recovery.cwd && savedSession.cwd !== recovery.cwd) {
        setHistoryError("PAGE_SESSION_WORKSPACE_MISMATCH");
        return;
      }
      if (recovery.resourceId) {
        if (identity.state !== "confirmed" || identity.error) return;
        if (identity.status?.authenticated !== true || !recovery.subject || identity.subject !== recovery.subject) {
          workbench.forgetSession(recovery.page);
          workbench.leaveDocument();
          return;
        }
      }
      const controller = new AbortController();
      setHistoryError("");
      void restorePageSession(recovery.page, recovery.sessionId, controller.signal, recovery).then(() => {
        controller.signal.throwIfAborted();
        if (recovery.resourceId && authority?.getSnapshot().subject !== recovery.subject)
          throw Error("PAGE_IDENTITY_CHANGED");
        return workbench.open(recovery.page);
      }).catch((error) => {
        if (!controller.signal.aborted)
          setHistoryError(error instanceof Error ? error.message : String(error));
      });
      return () => controller.abort();
    }, [
      recoveryKey,
      directoryReady,
      savedListed,
      savedCwd,
      identity.state,
      identity.scope,
      identity.subject,
      identity.status?.authenticated,
      identity.error,
      authority
    ]);
    const previousMainSession = (0, import_react24.useRef)(sessionId);
    (0, import_react24.useEffect)(() => {
      const changed = previousMainSession.current !== sessionId;
      previousMainSession.current = sessionId;
      if (!sessionId) {
        if (changed) workbench.leaveDocument();
        return;
      }
      if (changed && !recovery) setHistoryError("");
      const page = workbench.takeHistoryPage();
      if (!page) {
        const state = workbench.getSnapshot();
        if (state.selection && state.selection.sessionId !== sessionId || changed && state.selectedDocument && !state.selection)
          workbench.leaveDocument();
        return;
      }
      const controller = new AbortController();
      void restorePageSession(page, sessionId, controller.signal).then(() => {
        controller.signal.throwIfAborted();
        return workbench.open(page);
      }).catch((error) => {
        if (!controller.signal.aborted)
          setHistoryError(error instanceof Error ? error.message : String(error));
      });
      return () => controller.abort();
    }, [sessionId]);
    const blank = !session || !conversation || conversation.activeTargets.size === 0 && session.blank && !session.running && !session.promptAttempted;
    const loading = session?.openState === "loading" && !blank;
    const positions = (0, import_react24.useMemo)(() => {
      function Home() {
        return /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
          GeaHomeHero,
          {
            copy: {
              label: t("geaBusiness"),
              eyebrow: t("homeEyebrow"),
              title: t("homeTitle"),
              description: t("homeDescription")
            }
          }
        );
      }
      function Choices({
        useWorkspaces,
        renderSlot,
        selectWorkspace,
        t: t2
      }) {
        const workspaces = useWorkspaces((value) => value.items), current = workspaces.find((workspace) => workspace.sessionIds.includes(sessionId));
        const [open, setOpen] = (0, import_react24.useState)(false);
        const anchorRef = (0, import_react24.useRef)(null);
        return /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "gea-native-selectors", children: [
          /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)(
            "button",
            {
              ref: anchorRef,
              type: "button",
              className: "gea-formal-workspace",
              "aria-label": t2("hero.chooseWorkspace"),
              "aria-haspopup": "menu",
              onClick: () => setOpen((value) => !value),
              "aria-expanded": open,
              children: [
                current?.title === void 0 ? /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(IconFolderClose16, { className: "gea-formal-folder", size: 16 }) : /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(IconFolderOpen16, { className: "gea-formal-folder", size: 16 }),
                /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { className: "gea-formal-workspace-label", children: current?.title ?? t2("hero.chooseWorkspace") }),
                /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(IconChevronDownOutline14, { className: "gea-formal-workspace-chevron", size: 12 })
              ]
            }
          ),
          renderSlot("conversation.hero.workspace", {
            open,
            anchorRef,
            selectedId: current?.workspaceId,
            onPick: (id) => {
              setOpen(false);
              void selectWorkspace(id);
            },
            onClose: () => setOpen(false)
          }),
          renderSlot("conversation.hero.agentPreset", {})
        ] });
      }
      return {
        views: function MainViews(props) {
          return /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "gea-main-views", children: [
            blank && /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("div", { className: "gea-home-position", children: /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(Home, {}) }),
            /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("div", { className: "gea-native-history", hidden: blank, children: props.renderSlot("conversation.session", {}) }),
            blank && /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(Choices, { ...props })
          ] });
        },
        widthControls: function ColdStart(props) {
          return sessionId === void 0 ? /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "gea-cold-start", children: [
            /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("div", { className: "gea-home-position", children: /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(Home, {}) }),
            /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(Choices, { ...props })
          ] }) : null;
        }
      };
    }, [blank, sessionId, ctx.locale.getSnapshot().active]);
    const documents = documentState.visitedDocuments.map((page) => /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
      "div",
      {
        style: {
          height: "100%",
          minHeight: 0,
          display: documentState.selectedDocument?.id === page.id ? "flex" : "none",
          flexDirection: "column"
        },
        children: renderFactorySlot("agent-workbench.document", {
          page,
          active: documentState.selectedDocument?.id === page.id,
          navigationError: documentState.selectedDocument?.id === page.id ? historyError : void 0
        })
      },
      page.id
    ));
    return /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)(import_jsx_runtime15.Fragment, { children: [
      documents,
      !documentState.selectedDocument && /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("section", { className: "gea-company-main", children: [
        recovery && !historyError && /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("p", { role: identity.error ? "alert" : "status", children: (ctx.locale.getSnapshot().active === "en" ? en2 : zh2)[identity.error ? "pageRecoveryIdentityUnavailable" : "pageRecoveryPending"] }),
        historyError && /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("p", { role: "alert", children: historyError }),
        /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("div", { className: "gea-native-content", children: renderFactorySlot(
          "conversation.content",
          { variant: "embedded", phase: loading ? "settling" : "active", hero: false },
          { slots: positions }
        ) })
      ] })
    ] });
  }
  function Directory({ sessionId, useSessions }) {
    const documentState = (0, import_react24.useSyncExternalStore)(
      workbench.subscribe,
      workbench.getSnapshot,
      workbench.getSnapshot
    );
    (0, import_react24.useSyncExternalStore)(
      (listener) => ctx.locale.subscribe(listener),
      () => ctx.locale.getSnapshot().active,
      () => ctx.locale.getSnapshot().active
    );
    const [entries2, setEntries] = (0, import_react24.useState)(() => ctx.slots.entries("main"));
    (0, import_react24.useEffect)(() => {
      const refresh = () => setEntries([...ctx.slots.entries("main")]);
      const offs = [
        ctx.slots.subscribe("main", refresh),
        ctx.slots.subscribe("sidebar.panellist", refresh),
        workbench.subscribe(refresh)
      ];
      return () => offs.forEach((off) => off());
    }, []);
    const cwd = useSessions((value) => sessionId ? value.byId[sessionId]?.cwd : void 0);
    return /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("section", { className: "gea-directory-owned", children: [
      /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("h1", { children: "\u5DE5\u4F5C\u53F0" }),
      /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
        "button",
        {
          type: "button",
          className: "gea-home-panel-item",
          onClick: () => {
            workbench.leaveDocument();
            ctx.layout.selectPanel(null);
          },
          children: "\u539F\u751F\u5BF9\u8BDD"
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("section", { className: "gea-home-panel", children: [
        /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("div", { className: "gea-home-panel-head", children: /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("strong", { children: "\u5DF2\u63A5\u5165\u9875\u9762" }) }),
        /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("div", { className: "gea-home-panel-list", children: [
          .../* @__PURE__ */ new Set([
            ...entries2.filter(
              (entry) => entry.options.key && ![DIRECTORY, "conversation"].includes(entry.options.key)
            ).map((entry) => entry.options.key),
            ...documentState.pages.filter((page) => page.id !== DIRECTORY).map((page) => page.id)
          ])
        ].map((id) => {
          const label = ctx.slots.entries("sidebar.panellist").find((panel) => panel.options.id === id)?.options.label;
          return /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
            "button",
            {
              type: "button",
              className: "gea-home-panel-item",
              onClick: () => void workbench.open(id),
              children: typeof label === "function" ? label() : label ?? workbench.label(id)
            },
            id
          );
        }) })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(Resources, { cwd })
    ] });
  }
  ctx.slots.inject(
    "sidebar",
    () => ctx.slots.register(
      {
        name: "sidebar",
        priority: -20,
        locale: "companyWorkbench",
        children: {
          "sidebar.brand.mark": { kind: "single", scope: "root" },
          "sidebar.brand.name": { kind: "single", scope: "root" },
          "sidebar.panellist": { kind: "list", scope: "root" },
          "sidebar.workspaces": { kind: "single", scope: "root" },
          "sidebar.settings": { kind: "single", scope: "root" },
          "sidebar.footer.action": { kind: "list", scope: "root" }
        }
      },
      Sidebar
    )
  );
  ctx.slots.inject(
    "settings.launcher",
    () => ctx.slots.register(
      { name: "settings.launcher", priority: -20, locale: "companyWorkbench" },
      Account
    )
  );
  ctx.slots.inject(
    "sidebar.brand.mark",
    () => ctx.slots.register(
      { name: "sidebar.brand.mark", priority: -10, locale: "companyWorkbench" },
      function Brand() {
        const geometry = import_react24.default.useContext(SidebarGeometry);
        return /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
          "span",
          {
            className: "gea-brand-switch",
            title: t("openBusinessNavigation"),
            onClick: (event) => {
              event.stopPropagation();
              if (geometry.collapsed) geometry.expand();
            },
            children: /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("img", { className: "gea-shell-logo", src: brand_logo_default, alt: "" })
          }
        );
      }
    )
  );
  ctx.slots.inject(
    "sidebar.brand.name",
    () => ctx.slots.register(
      { name: "sidebar.brand.name", priority: -10, locale: "companyWorkbench" },
      function BrandName() {
        return /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "gea-brand-copy", onClick: (event) => event.stopPropagation(), children: [
          /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { className: "gea-brand-title", children: t("geaBusiness") }),
          /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("div", { className: "gea-brand-subtitle", children: t("brandSubtitle") })
        ] });
      }
    )
  );
  ctx.slots.inject(
    "shell.leading",
    () => ctx.slots.register({ name: "shell.leading", priority: -20, locale: "companyWorkbench" }, () => /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "gea-shell-leading", children: [
      /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
        "button",
        {
          type: "button",
          className: "gea-inbox-quick-action",
          "aria-label": t("openBusinessNavigation"),
          onClick: () => ctx.layout.toggleSidebar(),
          children: /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(IconPanelLeftOutlineRegular, { size: 16 })
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
        "button",
        {
          type: "button",
          className: "gea-inbox-quick-action",
          "aria-label": t("newConversation"),
          onClick: () => {
            workbench.leaveDocument();
            ctx.uiWorkspace.startSession();
          },
          children: /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(IconNewChatOutlineRegular, { size: 16 })
        }
      )
    ] }))
  );
  ctx.slots.inject(
    "main.conversation",
    () => ctx.slots.register(
      { name: "main.conversation", priority: -20, locale: "companyWorkbench" },
      Conversation
    )
  );
  ctx.slots.inject("main", () => {
    const dispose = ctx.slots.register(
      {
        name: "main",
        key: DIRECTORY,
        children: { "agent-workbench.directory": { kind: "single", scope: "session-maybe" } }
      },
      ({ renderSlot }) => renderSlot("agent-workbench.directory", {})
    );
    const unregister = workbench.register({ id: DIRECTORY, label: "\u5DE5\u4F5C\u53F0" });
    return () => {
      dispose();
      unregister();
    };
  });
  ctx.slots.inject(
    "agent-workbench.directory",
    () => ctx.slots.register({ name: "agent-workbench.directory" }, Directory)
  );
}

// src/html-view-state.ts
var pages = /* @__PURE__ */ new Set(["workbench-html-table", "gea-regional-plan", "plan-region-category", "plan-category-production", "inventory-fc", "inventory-aqkc"]);
var isHtmlViewPage = (page) => pages.has(page);
var isBusinessViewPage = (page) => page === "inventory-fc" || page === "inventory-aqkc";
var object = (v) => !!v && typeof v === "object" && !Array.isArray(v);
var text2 = (v) => typeof v === "string" && v.length <= 1e4;
var number = (v) => typeof v === "number" && Number.isFinite(v);
var boolean = (v) => typeof v === "boolean";
var nullable = (test) => (v) => v === null || test(v);
var array = (test) => (v) => Array.isArray(v) && v.length <= 5e3 && v.every(test);
var record = (test) => (v) => object(v) && Object.keys(v).length <= 5e3 && Object.entries(v).every(([key, value]) => text2(key) && !["__proto__", "constructor", "prototype"].includes(key) && test(value));
var strings = array(text2);
function shape(value, fields, required = Object.keys(fields)) {
  return object(value) && required.every((key) => Object.hasOwn(value, key)) && Object.keys(value).every((key) => Object.hasOwn(fields, key) && fields[key](value[key]));
}
var version = (v) => v === 1;
var filters = (v) => shape(v, { search: text2, businessOnly: boolean, urgentOnly: boolean, riskOnly: boolean, ageFilters: strings, orderStatusV2: text2 });
var draft = (v) => shape(v, { quantities: record(number), reasons: record(text2), dirty: boolean });
var plan = (v) => shape(v, { fileName: text2, rows: array(record((v2) => text2(v2) || number(v2))), importedAt: text2 });
var cycle = (v) => shape(v, { sku: text2, materialGroup: text2, category: text2, warehouse: text2, default: text2, effectiveFrom: text2, effectiveTo: text2, reason: text2, temporary: boolean });
var preferences = (v) => shape(v, { aiOpen: boolean, frozenColumns: strings, columnOrder: strings });
var cycleLevel = (v) => ["warehouse", "category", "material-group", "sku"].includes(v);
var cycleOverride = (v) => object(v) && (v.kind === "remove" ? shape(v, { kind: (kind) => kind === "remove", level: cycleLevel, objectId: text2 }) : shape(v, { kind: (kind) => kind === "set", level: cycleLevel, objectId: text2, cycleDays: number, effectiveFrom: text2, effectiveTo: text2 }, ["kind", "level", "objectId", "cycleDays"]));
var cycleEdit = (v) => shape(v, { level: cycleLevel, object: text2, days: text2, from: text2, to: text2, overrides: array(cycleOverride) });
var entries = (kind, check) => (v) => array((row) => shape(row, { key: (key) => text2(key) && new RegExp(`^branch-inventory:v[12]:${kind}:`).test(key), value: check }))(v);
var rhythm = (v) => shape(v, { id: text2, type: text2, from: nullable(number), to: nullable(number), perWeek: nullable(number), win: text2, kind: text2, short: text2, name: text2 });
var avatar = (v) => shape(v, { style: text2, outfit: text2, mood: text2, scene: text2, color: text2 });
var voice = (v) => shape(v, { tone: text2, rate: number, pitch: number });
var persona = (v) => shape(v, { name: text2, address: text2, tone: text2, greeting: text2 });
var sku = (v) => shape(v, { id: text2, code: text2, name: text2, net: number, base: text2, shop: text2, lineId: text2 });
var line = (v) => shape(v, { id: text2, base: text2, center: text2, shop: text2, tunnel: text2, ton: number, series: text2, dayPcs: number });
var transfer = (v) => shape(v, { id: text2, from: text2, to: text2, code: text2, name: text2 });
function validHtmlViewState(page, value) {
  if (!isHtmlViewPage(page) || !object(value) || value.version !== 1)
    return false;
  switch (page) {
    case "workbench-html-table":
      return shape(value, { version, keyword: text2, stage: text2 });
    case "gea-regional-plan":
      return shape(value, { version, date: text2, selDay: nullable(number), selEv: nullable(text2), repDim: text2, rhythm: array(rhythm), rhythmEditing: boolean, rhythmDraft: nullable(array(rhythm)) }, ["version", "date", "selDay", "selEv", "repDim", "rhythm"]);
    case "plan-region-category":
      return shape(value, { version, category: nullable(text2), view: text2, draft: text2, eventStatus: text2, drill: nullable(text2), eventId: nullable(text2), suggestionId: nullable(text2), taskId: nullable(text2), detail: nullable(text2) }, ["version"]);
    case "plan-category-production":
      return shape(value, { version, tab: text2, preview: nullable(text2), pullType: text2, months: strings, shipPeriod: text2, weights: (v) => shape(v, { report: number, growth: number, ship: number }), demandEdits: record(number), masterOpen: boolean, masterTab: number, masterBlanks: boolean, masterSearch: text2, masterSelected: nullable(text2), masterSkus: array(sku), masterLines: array(line), masterTransfers: array(transfer), plansOpen: boolean, shipBase: text2, shipRemaining: record(number), avatar, voice, persona, studioOpen: boolean, studioTab: text2, assistantDraft: text2 }, ["version"]);
    case "inventory-fc":
      return shape(value, { version, filters: entries("filters", filters), drafts: entries("order-draft", draft), plans: entries("plan-draft", plan), cycles: entries("cycle-preview", cycle), preferences: entries("preferences", preferences), cycleEdits: entries("cycle-edit", cycleEdit) }, ["version", "filters", "drafts", "plans", "cycles", "preferences"]);
    case "inventory-aqkc":
      return shape(value, { version, activeBoardTab: text2, pathSelection: nullable(strings), expandedBaseId: nullable(text2), expandedCategoryId: nullable(text2), expandedSkuId: nullable(text2), skuExpanded: boolean, detailTab: text2 }, ["version"]);
  }
}

// src/workbench.ts
var WORKBENCH_PRESENTATION_KEY = "agent-workbench.presentation.v2";
function presentation(value) {
  const state = value;
  const text3 = (value2) => typeof value2 === "string" && value2.length > 0;
  if (!state || state.version !== 2 || state.page !== void 0 && !text3(state.page) || !Array.isArray(state.selections) || !Array.isArray(state.views))
    return;
  if (state.selections.some(
    (item) => !item || !text3(item.page) || typeof item.sessionId !== "string" || !/^session-[0-9a-f-]{36}$/.test(item.sessionId) || item.preset !== null && !text3(item.preset) || item.ownerScope !== null && !text3(item.ownerScope) || item.cwd !== void 0 && !text3(item.cwd) || item.subject !== void 0 && item.subject !== null && !text3(item.subject) || typeof item.active !== "boolean"
  ))
    return;
  if (state.views.some(
    (item) => !item || !text3(item.page) || !text3(item.scope) || !validHtmlViewState(item.page, item.state)
  ))
    return;
  return state;
}
var WorkbenchController = class {
  constructor(ports, memory) {
    this.ports = ports;
    this.memory = memory;
    const saved = presentation(memory?.getSnapshot());
    if (!saved) return;
    this.rememberedPage = saved.page;
    for (const { page, active, sessionId, preset, ownerScope, cwd, subject } of saved.selections) {
      let selections = this.associations.get(page);
      if (!selections) {
        selections = /* @__PURE__ */ new Map();
        this.associations.set(page, selections);
      }
      selections.set(preset, {
        sessionId,
        preset,
        ownerScope,
        ...cwd ? { cwd } : {},
        ...subject === void 0 ? {} : { subject }
      });
      if (active) this.activePresets.set(page, preset);
    }
    for (const { page, scope, state } of saved.views) {
      let values = this.htmlViews.get(page);
      if (!values) {
        values = /* @__PURE__ */ new Map();
        this.htmlViews.set(page, values);
      }
      values.set(scope, structuredClone(state));
    }
  }
  pages = /* @__PURE__ */ new Map();
  documents = /* @__PURE__ */ new Map();
  associations = /* @__PURE__ */ new Map();
  activePresets = /* @__PURE__ */ new Map();
  rememberedPage;
  htmlViews = /* @__PURE__ */ new Map();
  selectedDocument;
  visited = /* @__PURE__ */ new Set();
  snapshot = { pages: [], visitedDocuments: [] };
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
      if (this.pages.get(page.id) !== page) return;
      this.pages.delete(page.id);
      this.documents.delete(page.id);
      this.visited.delete(page.id);
      this.associations.delete(page.id);
      this.activePresets.delete(page.id);
      this.htmlViews.delete(page.id);
      if (this.selectedDocument?.id === page.id) this.selectedDocument = void 0;
      if (this.rememberedPage === page.id) this.rememberedPage = void 0;
      this.changed();
    };
  }
  async open(id) {
    if (this.disposed) return false;
    if (!this.pages.has(id) && !this.ports.hasPanel?.(id))
      throw Error(`Unknown workbench page: ${id}`);
    const document2 = this.documents.get(id);
    if (document2) {
      this.selectedDocument = document2;
      this.rememberedPage = void 0;
      this.visited.add(id);
      this.changed();
      this.ports.document(this.currentSelection(id)?.sessionId);
    } else {
      this.leaveDocument();
      this.ports.panel(id);
    }
    return true;
  }
  registerFrame(page) {
    if (!this.ports.document) throw Error("WORKBENCH_DOCUMENT_UNAVAILABLE");
    const unregister = this.register(page);
    this.documents.set(page.id, page);
    this.changed();
    return unregister;
  }
  associateSession(page, selection) {
    if (!this.documents.has(page)) throw Error(`Unknown workbench Document: ${page}`);
    let selections = this.associations.get(page);
    if (!selections) {
      selections = /* @__PURE__ */ new Map();
      this.associations.set(page, selections);
    }
    selections.set(selection.preset, selection);
    this.activePresets.set(page, selection.preset);
    this.changed();
  }
  /** A hint for a declared interpretation; identity confirmation and authorization remain external. */
  selectionFor(page, preset, ownerScope, cwd) {
    const selection = this.associations.get(page)?.get(preset);
    return selection?.ownerScope === ownerScope && (cwd === void 0 || selection.cwd === cwd) ? selection : void 0;
  }
  currentSelection(page) {
    if (!this.activePresets.has(page)) return void 0;
    return this.associations.get(page)?.get(this.activePresets.get(page));
  }
  recoveryTarget() {
    const page = this.rememberedPage;
    const selection = page && this.documents.has(page) ? this.currentSelection(page) : void 0;
    const resourceId = page && this.documents.get(page)?.resourceId;
    return selection && page ? { page, ...selection, ...resourceId ? { resourceId } : {} } : void 0;
  }
  forgetSession(page) {
    this.associations.delete(page);
    this.activePresets.delete(page);
    this.changed();
  }
  readHtmlViewState(page, scope) {
    if (!this.documents.has(page)) return void 0;
    if (isBusinessViewPage(page) && !scope) return void 0;
    const value = this.htmlViews.get(page)?.get(isBusinessViewPage(page) ? scope : "static");
    return value === void 0 ? void 0 : structuredClone(value);
  }
  saveHtmlViewState(page, scope, value) {
    if (this.disposed || !this.documents.has(page))
      throw Error("HTML_DOCUMENT_UNREGISTERED");
    if (isBusinessViewPage(page) && !scope) throw Error("HTML_VIEW_SCOPE_REQUIRED");
    if (!validHtmlViewState(page, value)) throw Error("INVALID_HTML_VIEW_STATE");
    let values = this.htmlViews.get(page);
    if (!values) {
      values = /* @__PURE__ */ new Map();
      this.htmlViews.set(page, values);
    }
    values.set(isBusinessViewPage(page) ? scope : "static", structuredClone(value));
    this.persist();
  }
  leaveDocument() {
    this.rememberedPage = void 0;
    if (!this.selectedDocument) {
      this.changed();
      return;
    }
    this.selectedDocument = void 0;
    this.changed();
  }
  getSnapshot = () => this.snapshot;
  label(id) {
    const label = this.pages.get(id)?.label;
    return typeof label === "function" ? label() : label ?? id;
  }
  subscribe = (listener) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  showHistory(page) {
    this.rememberedPage = void 0;
    this.historyPage = page;
    this.changed();
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
    this.snapshot = {
      pages: [...this.pages.values()],
      visitedDocuments: [...this.visited].map((id) => this.documents.get(id)),
      selectedDocument: this.selectedDocument,
      selection: this.selectedDocument ? this.currentSelection(this.selectedDocument.id) : void 0
    };
    if (!this.disposed) this.persist();
    for (const listener of this.listeners) listener();
  }
  persist() {
    this.memory?.set({
      version: 2,
      ...this.selectedDocument?.id || this.rememberedPage ? { page: this.selectedDocument?.id ?? this.rememberedPage } : {},
      selections: [...this.associations].flatMap(
        ([page, values]) => [...values.values()].map((selection) => ({
          page,
          ...selection,
          active: this.activePresets.get(page) === selection.preset
        }))
      ),
      views: [...this.htmlViews].flatMap(
        ([page, values]) => [...values].map(([scope, state]) => ({ page, scope, state }))
      )
    });
  }
  dispose() {
    this.disposed = true;
    this.pages.clear();
    this.documents.clear();
    this.associations.clear();
    this.activePresets.clear();
    this.htmlViews.clear();
    this.visited.clear();
    this.selectedDocument = void 0;
    this.rememberedPage = void 0;
    this.changed();
  }
};

// src/client.ts
var import_dsh_client_store = require("@deepseek-ai/dsh-client-store");

// theme/tokens.css
var tokens_default = '/* Shared workbench resource 1.1.1. State belongs to DSH ui-theme.\n * html + body specificity keeps the adapter stable when base sheets reload.\n * Inline user token overrides retain priority. Status palettes stay upstream. */\nhtml body {\n  --workbench-theme-version: "1.1.1";\n  --workbench-font-family: "Microsoft YaHei UI", "PingFang SC", "Noto Sans CJK SC", Arial, sans-serif;\n  --workbench-font-size: var(--dsh-content-font-size, 14px);\n  --workbench-page: #f7f8fa;\n  --workbench-surface: #ffffff;\n  --workbench-subtle: #fafafa;\n  --workbench-muted-surface: #f5f6f8;\n  --workbench-text: #20232a;\n  --workbench-body: #555d68;\n  --workbench-muted: #626b78;\n  --workbench-border: #e3e6ea;\n  --workbench-control-border: #d9dde3;\n  --workbench-brand: #df1732;\n  --workbench-selected-text: #d0132c;\n  --workbench-brand-hover: #c91029;\n  --workbench-brand-soft: #fff0f2;\n  --workbench-hover: #fffafb;\n}\n\nhtml body[data-ds-dark-theme] {\n  --workbench-page: #1b1d21;\n  --workbench-surface: #24262b;\n  --workbench-subtle: #282b31;\n  --workbench-muted-surface: #30343b;\n  --workbench-text: #edf0f5;\n  --workbench-body: #c7cdd6;\n  --workbench-muted: #aab3bf;\n  --workbench-border: #414751;\n  --workbench-control-border: #59616e;\n  --workbench-brand: #ff8092;\n  --workbench-selected-text: #ff9aa8;\n  --workbench-brand-hover: #ff9aa8;\n  --workbench-brand-soft: #442630;\n  --workbench-hover: #35272e;\n}\n\n.agent-workbench-ui {\n  background: var(--workbench-page);\n  color: var(--workbench-text);\n  font: var(--workbench-font-size)/1.5 var(--workbench-font-family);\n}\n.agent-workbench-ui button { padding: 10px 14px; border: 1px solid var(--workbench-border); border-radius: 8px; background: var(--workbench-surface); color: var(--workbench-text); font: inherit; cursor: pointer; }\n.agent-workbench-ui button:not(:disabled):hover { background: var(--workbench-hover); border-color: var(--workbench-brand); }\n.agent-workbench-ui button:focus-visible { outline: 2px solid var(--workbench-brand); outline-offset: 2px; }\n\n.agent-workbench-ui button[aria-current="page"] { color: var(--workbench-selected-text); background: var(--workbench-brand-soft); border-color: var(--workbench-brand); }\n.agent-workbench-ui button:disabled { color: var(--workbench-muted); background: var(--workbench-muted-surface); cursor: default; }\n';

// src/page-interaction/reference-message.css
var reference_message_default = "[data-page-reference-label] {\n  color: var(--workbench-brand);\n  background: var(--workbench-brand-soft);\n  border-radius: 4px;\n  padding: 0 3px;\n}\n";

// src/frame-presenter.tsx
var import_react26 = require("react");

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
      const result = await options.request(
        options.endpoint,
        {
          sessionId: options.sessionId,
          toolMessages: pending,
          ...options.catalog ? { catalog: options.catalog() } : {},
          pageSource: "self-report"
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
          catalog: null,
          pageSource: "self-report"
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
    channel.port1.postMessage({ type: "theme", context, version: "1.1.1", colorScheme: snapshot.active.colorScheme, fontSize: snapshot.fontSize, tokens: snapshot.active.tokens });
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
          const text3 = message.parameters?.text;
          if (typeof text3 !== "string" || !text3.trim() || text3.length > 1e4 || JSON.stringify(message.parameters?.context ?? {}).length > 1e5) throw Error("INVALID_PAGE_QUESTION");
          await call("context", message.parameters?.context, task.signal);
          if (!alive() || task.signal.aborted) return;
          await execution.prompt(connection, text3, AbortSignal.any([signal, lifetime.signal, task.signal]));
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
var import_react25 = __toESM(require("react"), 1);
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
            const quote = "\u5F15\u7528\uFF1A" + page + " \xB7 " + selected.label + "\n" + selected.text.split("\n").map((line2) => "> " + line2).join("\n") + "\n";
            const captured = options.inputActions.captureInsertion();
            const span = event.data.type === "quote" ? { ...captured, end: captured.start } : captured;
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
            const anchor = (0, import_react25.useRef)(null);
            (0, import_react25.useEffect)(
              () => anchor.current ? api.mountTrigger(anchor.current, sessionId) : void 0,
              [sessionId]
            );
            return import_react25.default.createElement("span", {
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

// src/frame-presenter.css
var frame_presenter_default = "/* Business Document geometry. Formal 508feea visuals and shipped Workbench width contract. */\n.agent-workbench-document {\n  position: relative;\n  height: 100%;\n  min-height: 0;\n  display: flex;\n  flex-direction: column;\n  --workbench-ai-width: var(--workbench-ai-preferred-width, 440px);\n}\n.agent-workbench-business {\n  display: flex;\n  flex-direction: column;\n  min-height: 0;\n  min-width: 0;\n  overflow: hidden;\n}\n.agent-workbench-html {\n  flex: 1;\n  height: 100%;\n  width: 100%;\n  min-height: 0;\n  min-width: 0;\n  border: 0;\n  display: block;\n}\n.agent-workbench-document-body {\n  position: relative;\n  min-height: 0;\n  flex: 1;\n  display: grid;\n  grid-template-columns: minmax(0, 1fr) var(--workbench-ai-width);\n}\n.agent-workbench-native-conversation {\n  background: var(--workbench-surface);\n  color: var(--workbench-body);\n  display: flex;\n  flex-direction: column;\n  min-height: 0;\n  min-width: 0;\n  border-left: 1px solid #adb9c8;\n  overflow: hidden;\n  box-sizing: border-box;\n}\n.agent-workbench-document-body.view-center,\n.agent-workbench-document-body.view-chat {\n  grid-template-columns: minmax(0, 1fr);\n}\n.agent-workbench-document-body > [hidden] {\n  display: none;\n}\n.agent-workbench-document-body.view-chat > .agent-workbench-native-conversation {\n  background: var(--workbench-surface);\n  color: var(--workbench-body);\n  border-left: 0;\n}\n.gea-page-toolbar-seat {\n  position: relative;\n  flex: none;\n  height: 58px;\n}\n.agent-workbench-column-handle {\n  position: absolute;\n  top: 0;\n  bottom: 0;\n  right: calc(var(--workbench-ai-width) - 4px);\n  width: 8px;\n  z-index: 11;\n  cursor: col-resize;\n  touch-action: none;\n}\n.agent-workbench-page-status {\n  margin: 24px 16px;\n  color: var(--workbench-muted);\n}\n.workbench-page-conversation {\n  flex: 1;\n  min-height: 0;\n  display: flex;\n  flex-direction: column;\n  overflow: hidden;\n}\n@media (max-width: 1200px) {\n  .agent-workbench-document {\n    --workbench-ai-width: 360px;\n  }\n  .agent-workbench-column-handle {\n    display: none;\n  }\n}\n@media (max-width: 1024px) {\n  .agent-workbench-document {\n    --workbench-ai-width: 320px;\n  }\n}\n@media (max-width: 860px) {\n  .agent-workbench-document {\n    --workbench-ai-width: 300px;\n  }\n}\n\n/* Formal conversation widgets consume the shared theme in the Core Document seat. */\n.agent-workbench-document .gea-conversation-toolbar,\n.agent-workbench-document .gea-agent-welcome {\n  background: var(--workbench-surface);\n  color: var(--workbench-text);\n  border-color: var(--workbench-border);\n}\n.agent-workbench-document .gea-agent-identity h2,\n.agent-workbench-document .gea-agent-intro b {\n  color: var(--workbench-text);\n}\n.agent-workbench-document .gea-agent-intro,\n.agent-workbench-document .gea-agent-prompts button {\n  background: var(--workbench-surface);\n  color: var(--workbench-body);\n  border-color: var(--workbench-border);\n}\n.agent-workbench-document .gea-agent-block h3 {\n  color: var(--workbench-body);\n}\n.agent-workbench-document .gea-agent-prompts button:hover {\n  background: var(--workbench-hover);\n  border-color: var(--workbench-brand);\n}\n.agent-workbench-document .gea-conversation-view-switch {\n  background: var(--workbench-muted-surface);\n  border-color: var(--workbench-border);\n}\n.agent-workbench-document .gea-conversation-toolbar button {\n  color: var(--workbench-body);\n}\n.agent-workbench-document .gea-conversation-toolbar button[aria-pressed='true'] {\n  color: var(--workbench-selected-text);\n}\n.agent-workbench-document .gea-conversation-toolbar-tool {\n  height: 32px;\n  max-width: 140px;\n  background: var(--workbench-surface);\n  color: var(--workbench-text);\n  border: 1px solid var(--workbench-control-border);\n  border-radius: 7px;\n  font: inherit;\n}\n";

// src/html-view-channel.ts
var HTML_VIEW_PROTOCOL = "dsh-workbench-view-v1";
function connectHtmlViewState(frame, page, scope, workbench, signal) {
  if (!isHtmlViewPage(page))
    return () => {
    };
  const channel = crypto.randomUUID();
  let generation = 0;
  let alive = true;
  const send = (type) => frame.contentWindow?.postMessage({ protocol: HTML_VIEW_PROTOCOL, type, page, version: 1, channel, generation, state: workbench.readHtmlViewState(page, scope) }, "*");
  const receive = (event) => {
    if (!alive || signal.aborted || event.source !== frame.contentWindow || event.data?.protocol !== HTML_VIEW_PROTOCOL || event.data.page !== page || event.data.version !== 1)
      return;
    if (workbench.getSnapshot().selectedDocument?.id !== page)
      return;
    if (event.data.type === "ready") {
      send("restore");
      return;
    }
    if (event.data.type !== "save" || event.data.channel !== channel || event.data.generation !== generation || isBusinessViewPage(page) && !scope)
      return;
    try {
      workbench.saveHtmlViewState(page, scope, event.data.state);
    } catch (error) {
      frame.contentWindow?.postMessage({ protocol: HTML_VIEW_PROTOCOL, type: "rejected", page, version: 1, channel, generation, error: error instanceof Error ? error.message : String(error) }, "*");
    }
  };
  const loaded = () => {
    generation++;
    send("request-ready");
  };
  window.addEventListener("message", receive);
  frame.addEventListener("load", loaded);
  const dispose = () => {
    if (!alive)
      return;
    alive = false;
    signal.removeEventListener("abort", dispose);
    window.removeEventListener("message", receive);
    frame.removeEventListener("load", loaded);
    frame.contentWindow?.postMessage({ protocol: HTML_VIEW_PROTOCOL, type: "released", page, version: 1, channel, generation }, "*");
  };
  signal.addEventListener("abort", dispose, { once: true });
  if (signal.aborted)
    dispose();
  else
    send("request-ready");
  return dispose;
}

// src/frame-presenter.tsx
var import_jsx_runtime16 = require("react/jsx-runtime");
var unknownIdentity = { state: "unknown", scope: null, status: null };
var noSubscribe2 = () => () => {
};
var emptyGuide = [];
function mountFramePresentation(ctx, resources, t, workbench) {
  ctx.effect(() => {
    const style = document.createElement("style");
    style.dataset.workbenchDocument = "layout";
    style.textContent = frame_presenter_default;
    document.head.append(style);
    return () => style.remove();
  });
  let rememberedConversationWidth;
  let execution;
  const backendListeners = /* @__PURE__ */ new Set();
  ctx.inject(["businessAccount", "remote.session"], (scope) => {
    const owned = createExecution(scope, scope.businessAccount);
    execution = owned;
    for (const changed of backendListeners) changed();
    scope.effect(() => () => {
      if (execution === owned) {
        execution = void 0;
        for (const changed of backendListeners) changed();
      }
    });
  });
  const interaction = installPageInteraction(ctx);
  const pageViews = /* @__PURE__ */ new Map();
  let tools;
  const toolListeners = /* @__PURE__ */ new Set();
  ctx.inject(["sidebarRight", "sidebarRightTabs"], (scope) => {
    tools = scope;
    for (const notify of toolListeners) notify();
    scope.effect(() => () => {
      if (tools === scope) {
        tools = void 0;
        for (const notify of toolListeners) notify();
      }
    });
  });
  function Document({
    page,
    active,
    navigationError,
    sessionId,
    useSession,
    useProjection,
    inputActions,
    renderSlot
  }) {
    (0, import_react26.useSyncExternalStore)(
      (listener) => ctx.locale.subscribe(listener),
      () => ctx.locale.getSnapshot()
    );
    const currentExecution = (0, import_react26.useSyncExternalStore)(
      (listener) => {
        backendListeners.add(listener);
        return () => {
          backendListeners.delete(listener);
        };
      },
      () => execution
    );
    const identity = (0, import_react26.useSyncExternalStore)(
      currentExecution?.identity.subscribe ?? noSubscribe2,
      currentExecution?.identity.getSnapshot ?? (() => unknownIdentity)
    );
    const identityReady = identity.state === "confirmed" && identity.error === void 0 && identity.status?.authenticated === true;
    const frame = (0, import_react26.useRef)(null);
    const documentElement = (0, import_react26.useRef)(null);
    const [preferredWidth, setPreferredWidth] = (0, import_react26.useState)(() => rememberedConversationWidth ?? 440);
    const [space, setSpace] = (0, import_react26.useState)({ viewport: window.innerWidth, document: 0 });
    const maximumWidth = Math.max(
      300,
      Math.min(space.viewport * 0.7, space.document ? space.document - 400 : Infinity)
    );
    const conversationWidth = Math.min(maximumWidth, Math.max(300, Math.round(preferredWidth)));
    const drag = (0, import_react26.useRef)();
    const syncToolPresentation = (0, import_react26.useRef)();
    (0, import_react26.useLayoutEffect)(() => {
      const target = documentElement.current;
      const measure = () => {
        const width = target.getBoundingClientRect().width;
        setSpace({ viewport: window.innerWidth, document: width });
        syncToolPresentation.current?.();
      };
      measure();
      window.addEventListener("resize", measure);
      const observer = typeof ResizeObserver === "undefined" ? void 0 : new ResizeObserver(measure);
      observer?.observe(target);
      return () => {
        window.removeEventListener("resize", measure);
        observer?.disconnect();
      };
    }, []);
    const resizeConversation = (x) => {
      const current = drag.current;
      if (!current) return;
      const width = Math.min(
        maximumWidth,
        Math.max(300, Math.round(current.width + current.x - x))
      );
      rememberedConversationWidth = width;
      setPreferredWidth(width);
    };
    const [loaded, setLoaded] = (0, import_react26.useState)(0), [busy, setBusy] = (0, import_react26.useState)(false), [error, setError] = (0, import_react26.useState)("");
    const [interpreters, setInterpreters] = (0, import_react26.useState)([]);
    const resourceRows = (0, import_react26.useRef)([]);
    const resourceRowsOwner = (0, import_react26.useRef)();
    const resourceHost = resources();
    const [view, setView] = (0, import_react26.useState)(
      () => pageViews.get(page.id) ?? "split"
    );
    const documentState = (0, import_react26.useSyncExternalStore)(workbench.subscribe, workbench.getSnapshot);
    const selection = documentState.selectedDocument?.id === page.id ? documentState.selection : void 0;
    const session = useSession((value) => value);
    const currentPreset = useProjection("agentPreset");
    const associated = active && selection?.sessionId === sessionId && selection !== void 0 && (!page.resourceId || selection.ownerScope === identity.scope && identityReady);
    const frameKey = page.resourceId && identityReady ? identity.scope ?? void 0 : void 0;
    const viewScope = isBusinessViewPage(page.id) && associated && identity.subject && sessionId ? JSON.stringify([identity.subject, sessionId]) : void 0;
    (0, import_react26.useEffect)(() => {
      if (!active || page.kind !== "html" || !frame.current || isBusinessViewPage(page.id) && !viewScope)
        return;
      const controller = new AbortController();
      const stop = connectHtmlViewState(
        frame.current,
        page.id,
        viewScope,
        workbench,
        controller.signal
      );
      return () => {
        controller.abort();
        stop();
      };
    }, [active, page, viewScope, workbench]);
    const restoreView = (0, import_react26.useRef)();
    const currentTools = (0, import_react26.useSyncExternalStore)(
      (listener) => {
        toolListeners.add(listener);
        return () => {
          toolListeners.delete(listener);
        };
      },
      () => tools
    );
    const guide = (0, import_react26.useSyncExternalStore)(
      currentTools ? (listener) => currentTools.sidebarRightTabs.subscribe(listener) : noSubscribe2,
      () => currentTools?.sidebarRightTabs.guide() ?? emptyGuide
    );
    const [toolsExpanded, setToolsExpanded] = (0, import_react26.useState)(
      () => currentTools?.sidebarRight.isExpanded() ?? false
    );
    const changeView = (next) => {
      restoreView.current = void 0;
      if (currentTools?.sidebarRight.isExpanded()) {
        currentTools.sidebarRight.toggleExpanded();
        setToolsExpanded(false);
      }
      pageViews.set(page.id, next);
      setView(next);
    };
    const openTool = (kind) => {
      if (!associated || !currentTools?.sidebarRightTabs.get(kind)) return;
      try {
        if (!currentTools.sidebarRight.isExpanded()) restoreView.current = view;
        currentTools.sidebarRight.openTab(kind);
        setToolsExpanded(currentTools.sidebarRight.isExpanded());
        setView("center");
      } catch (failure) {
        setError(failure instanceof Error ? failure.message : String(failure));
      }
    };
    const closeTools = () => {
      if (currentTools?.sidebarRight.isExpanded()) currentTools.sidebarRight.toggleExpanded();
      setToolsExpanded(false);
      setView(restoreView.current ?? pageViews.get(page.id) ?? "split");
      restoreView.current = void 0;
    };
    syncToolPresentation.current = () => {
      if (!associated) return;
      const expanded = currentTools?.sidebarRight.isExpanded() ?? false;
      setToolsExpanded(expanded);
      if (expanded && view !== "center") {
        restoreView.current ??= view;
        setView("center");
      } else if (!expanded && restoreView.current) {
        setView(restoreView.current);
        restoreView.current = void 0;
      }
    };
    (0, import_react26.useLayoutEffect)(() => {
      syncToolPresentation.current?.();
    }, [associated, currentTools]);
    const pending = (0, import_react26.useRef)();
    const preparationOwner = (0, import_react26.useRef)();
    const preparation = (0, import_react26.useRef)();
    const connectionTransition = (0, import_react26.useRef)(Promise.resolve());
    const title = typeof page.label === "function" ? page.label() : page.label ?? page.id;
    const src = typeof page.src === "function" ? page.src() : page.src;
    const Body = page.kind === "local" ? page.body : void 0;
    const visibleReceipt = (0, import_react26.useSyncExternalStore)(
      page.visibleRequest?.subscribe ?? noSubscribe2,
      page.visibleRequest?.getSnapshot ?? (() => void 0)
    );
    const sendTheme = () => {
      const theme = ctx.theme.getTheme();
      frame.current?.contentWindow?.postMessage(
        {
          protocol: "agent-workbench-theme",
          dark: theme.active.colorScheme === "dark",
          fontSize: theme.fontSize
        },
        "*"
      );
    };
    (0, import_react26.useEffect)(() => {
      const off = ctx.on("theme/change", sendTheme);
      return () => {
        off();
      };
    }, []);
    (0, import_react26.useEffect)(() => {
      const ready = (event) => {
        if (event.source === frame.current?.contentWindow && event.data?.protocol === "agent-workbench-theme")
          sendTheme();
      };
      window.addEventListener("message", ready);
      return () => window.removeEventListener("message", ready);
    }, []);
    (0, import_react26.useEffect)(
      () => () => {
        pending.current?.controller.abort();
        pending.current = void 0;
        preparation.current?.abort();
      },
      [active]
    );
    (0, import_react26.useEffect)(() => {
      const flight = pending.current;
      if (page.resourceId && flight && (flight.scope !== identity.scope || !identityReady)) {
        flight.controller.abort();
        if (pending.current === flight) {
          pending.current = void 0;
          setBusy(false);
        }
      }
      if (selection && page.resourceId && identity.state === "confirmed" && !identity.error && (!identity.status?.authenticated || !identity.subject || identity.subject !== selection.subject)) {
        workbench.forgetSession(page.id);
        setError(t("pageChanged"));
      }
    }, [
      identity.scope,
      identity.subject,
      identity.state,
      identity.error,
      identity.status?.authenticated,
      identityReady,
      selection
    ]);
    (0, import_react26.useEffect)(() => {
      if (!active || page.kind !== "native" || !frame.current) return;
      frame.current.contentWindow?.postMessage(
        { type: "gea:identity-snapshot", snapshot: identity },
        window.location.origin
      );
    }, [active, identity, loaded, page]);
    (0, import_react26.useEffect)(() => {
      if (active && loaded && identityReady) page.onVisible?.(visibleReceipt);
    }, [active, loaded, identityReady, page, visibleReceipt]);
    (0, import_react26.useEffect)(() => {
      if (!associated || session?.openState !== "open" || !loaded || !frame.current || !currentExecution || !page.resourceId)
        return;
      const controller = new AbortController();
      let connection;
      let reference;
      let disposeBridge = () => {
      }, disposeReference = () => {
      }, disposeTheme = () => {
      };
      const target = frame.current;
      const alive = () => !controller.signal.aborted && selection.ownerScope === currentExecution.identity.getSnapshot().scope;
      const setup = connectionTransition.current.then(async () => {
        controller.signal.throwIfAborted();
        reference = ctx.sessions.retain(selection.sessionId, {
          source: "agentResourceSelection",
          signal: controller.signal
        });
        await reference.ready;
        controller.signal.throwIfAborted();
        connection = await currentExecution.open(
          page,
          reference.sessionId,
          page.resourceId,
          controller.signal
        );
        if (!alive()) {
          await currentExecution.close(connection);
          connection = void 0;
          return;
        }
        if (page.kind === "html") {
          const bridge = connectHtmlFrame(
            target,
            connection,
            currentExecution,
            () => ctx.theme.getTheme(),
            controller.signal,
            (failure) => {
              if (alive()) {
                setError(failure instanceof Error ? failure.message : String(failure));
                if (connection) void currentExecution.close(connection).catch(() => {
                });
              }
            }
          );
          disposeBridge = bridge;
          const off = ctx.on("theme/change", () => bridge.sendTheme());
          disposeTheme = () => {
            off();
          };
        } else
          target.contentWindow?.postMessage(
            { type: "workbench:session", sessionId: selection.sessionId, owner: connection.owner },
            window.location.origin
          );
        disposeReference = interaction.bindFrame({
          mode: "business",
          frame: target,
          reference,
          page: title,
          surface: connection.binding.surface,
          tool: connection.binding.tool,
          owner: connection.owner
        });
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
        if (page.kind === "native")
          target.contentWindow?.postMessage(
            { type: "workbench:session", sessionId: null },
            window.location.origin
          );
        connectionTransition.current = setup.catch(() => {
        }).then(async () => {
          try {
            if (connection) {
              const owned = connection;
              connection = void 0;
              await currentExecution.close(owned);
            }
          } finally {
            reference?.release();
            reference = void 0;
          }
        }).catch(() => {
        });
      };
    }, [associated, selection, session?.openState, loaded, currentExecution, page, title]);
    (0, import_react26.useEffect)(() => {
      if (page.resourceId || !associated || session?.openState !== "open" || !inputActions || !loaded || !frame.current)
        return;
      const controller = new AbortController();
      const reference = ctx.sessions.retain(selection.sessionId, {
        source: "agentResourceSelection",
        signal: controller.signal
      });
      let unbind = () => {
      };
      void reference.ready.then(() => {
        controller.signal.throwIfAborted();
        unbind = interaction.bindFrame({
          mode: "quote",
          frame: frame.current,
          reference,
          page: title,
          inputActions,
          isCurrentSession: () => ctx.sessions.retainInfo(reference.sessionId).getSnapshot().retainedBy.mainView !== void 0
        });
      }).catch((failure) => {
        if (!controller.signal.aborted)
          setError(failure instanceof Error ? failure.message : String(failure));
      });
      return () => {
        controller.abort();
        unbind();
        reference.release();
      };
    }, [page.resourceId, associated, session?.openState, selection, inputActions, loaded, title]);
    const connect = async (cwd, ownerSignal, interpreter = selection?.preset ?? page.resourceId, reuse = true) => {
      if (!ownerSignal) preparation.current?.abort();
      const host = resources();
      if (!host || !currentExecution || !page.resourceId) {
        setError(t("pageWait"));
        return;
      }
      if (!identityReady) {
        setError(identity.error ?? t("pageLogin"));
        return;
      }
      pending.current?.controller.abort();
      const controller = new AbortController();
      const flight = { controller, scope: identity.scope };
      pending.current = flight;
      setBusy(true);
      setError("");
      const signal = ownerSignal ? AbortSignal.any([controller.signal, ownerSignal]) : controller.signal;
      try {
        const requested = await resourceWorkspace(host.fetch, signal, cwd);
        const { path: directory } = await host.workspace(requested);
        signal.throwIfAborted();
        const associated2 = (selected) => {
          signal.throwIfAborted();
          if (identity.scope !== currentExecution.identity.getSnapshot().scope || workbench.getSnapshot().selectedDocument?.id !== page.id)
            throw Error(t("pageChanged"));
          const { interpreters: choices, ...projection } = selected;
          if (choices)
            setInterpreters(
              resourceRows.current.filter(
                (row) => choices.includes(row.id) && row.kind === "prompt" && row.installed && row.enabled
              )
            );
          workbench.associateSession(page.id, {
            ...projection,
            ownerScope: identity.scope,
            ...identity.subject ? { subject: identity.subject } : {}
          });
        };
        let cached = reuse ? workbench.selectionFor(page.id, interpreter ?? null, identity.scope, directory) : void 0;
        if (!cached && reuse && selection && identity.subject && selection.subject === identity.subject && selection.preset === (interpreter ?? null) && selection.cwd === directory) cached = selection;
        if (cached)
          await host.open(cached.sessionId, void 0, signal, (selected) => {
            if (selected.preset !== cached.preset || selected.cwd !== directory)
              throw Error("PAGE_SESSION_RECOVERY_MISMATCH");
            associated2(selected);
          });
        else await selectResource(host, interpreter, signal, directory, associated2);
      } catch (failure) {
        if (!signal.aborted) setError(failure instanceof Error ? failure.message : String(failure));
      } finally {
        if (pending.current === flight) {
          pending.current = void 0;
          setBusy(false);
        }
      }
    };
    const newPlainConversation = async () => {
      const host = resources();
      if (!host) {
        setError(t("pageWait"));
        return;
      }
      pending.current?.controller.abort();
      const controller = new AbortController();
      const flight = { controller, scope: null };
      pending.current = flight;
      setBusy(true);
      setError("");
      try {
        const cwd = await resourceWorkspace(host.fetch, controller.signal);
        const { workspaceId } = await host.workspace(cwd);
        controller.signal.throwIfAborted();
        const id = await host.create({ workspaceId });
        controller.signal.throwIfAborted();
        await host.open(id, void 0, controller.signal, (selected) => {
          controller.signal.throwIfAborted();
          if (workbench.getSnapshot().selectedDocument?.id !== page.id)
            throw Error(t("pageChanged"));
          workbench.associateSession(page.id, {
            ...selected,
            ownerScope: identity.scope,
            subject: identity.subject
          });
        });
      } catch (failure) {
        if (!controller.signal.aborted)
          setError(failure instanceof Error ? failure.message : String(failure));
      } finally {
        if (pending.current === flight) {
          pending.current = void 0;
          setBusy(false);
        }
      }
    };
    const associateCurrent = () => {
      if (!sessionId || session?.openState !== "open" || currentPreset === void 0) return;
      workbench.associateSession(page.id, {
        sessionId,
        preset: currentPreset,
        ownerScope: identity.scope,
        subject: identity.subject,
        cwd: ctx.sessions.list.getSnapshot().byId[sessionId]?.cwd
      });
      setError("");
    };
    (0, import_react26.useEffect)(() => {
      const host = resourceHost;
      if (!active || !host || !currentExecution || !page.resourceId || !identity.scope || !identityReady)
        return;
      const catalogOwner = resourceRowsOwner.current;
      if (selection && catalogOwner?.scope === identity.scope && catalogOwner.pageId === page.id && catalogOwner.resourceId === page.resourceId && catalogOwner.execution === currentExecution && catalogOwner.host === host)
        return;
      setInterpreters([]);
      resourceRows.current = [];
      resourceRowsOwner.current = void 0;
      const owner = identity.scope + "\0" + page.resourceId;
      const prepare = (!selection || selection.ownerScope !== identity.scope && selection.subject === identity.subject) && preparationOwner.current !== owner;
      if (prepare) preparationOwner.current = owner;
      const controller = new AbortController();
      preparation.current = controller;
      void (async () => {
        const cwd = await resourceWorkspace(host.fetch, controller.signal);
        const response = await host.fetch(
          "/api/agent-manage/resources?" + new URLSearchParams({ cwd }),
          { signal: controller.signal, cache: "no-store" }
        );
        if (!response.ok) throw Error("RESOURCE_LIST_UNAVAILABLE");
        const rows = await response.json();
        controller.signal.throwIfAborted();
        resourceRows.current = rows;
        resourceRowsOwner.current = {
          pageId: page.id,
          resourceId: page.resourceId,
          scope: identity.scope,
          execution: currentExecution,
          host
        };
        const resource = rows.find((row) => row.id === page.resourceId);
        const allowed = resource?.interpreters ?? [page.resourceId];
        setInterpreters(
          rows.filter(
            (row) => allowed.includes(row.id) && row.kind === "prompt" && row.installed && row.enabled
          )
        );
        if (prepare && resource?.installed && resource.enabled)
          await connect(cwd, controller.signal);
      })().catch((failure) => {
        if (!controller.signal.aborted)
          setError(failure instanceof Error ? failure.message : String(failure));
      });
      return () => {
        controller.abort();
        if (preparation.current === controller) preparation.current = void 0;
        if (preparationOwner.current === owner) preparationOwner.current = void 0;
      };
    }, [
      active,
      identity.scope,
      identityReady,
      currentExecution,
      resourceHost,
      page.id,
      page.resourceId
    ]);
    const toolbar = /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("div", { className: "gea-page-toolbar-seat", children: /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(
      ConversationToolbar,
      {
        view,
        onViewChange: changeView,
        onHistory: () => workbench.showHistory(page.id),
        onNewConversation: () => {
          if (page.resourceId)
            void connect(void 0, void 0, selection?.preset ?? page.resourceId, false);
          else void newPlainConversation();
        },
        onAssociateCurrent: !page.resourceId ? associateCurrent : void 0,
        associateDisabled: !sessionId || session?.openState !== "open" || currentPreset === void 0,
        error: error || navigationError || "",
        tools: associated ? guide : emptyGuide,
        onOpenTool: openTool,
        onCloseTools: closeTools,
        toolsExpanded,
        children: identityReady && interpreters.length > 1 && /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(
          "select",
          {
            className: "gea-conversation-toolbar-tool",
            "aria-label": t("pageInterpreter"),
            disabled: busy,
            value: currentPreset ?? selection?.preset ?? page.resourceId,
            onChange: (event) => void connect(void 0, void 0, event.target.value),
            children: interpreters.map((resource) => /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("option", { value: resource.id, children: resource.label }, resource.id))
          }
        )
      }
    ) });
    return /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)(
      "section",
      {
        ref: documentElement,
        className: "agent-workbench-ui agent-workbench-document",
        style: { "--workbench-ai-preferred-width": conversationWidth + "px" },
        children: [
          page.resourceId && identity.error !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("p", { className: "agent-workbench-page-status", role: "alert", title: identity.error, children: t("pageIdentityFailed") }),
          /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("div", { className: "agent-workbench-document-body view-" + view, children: [
            /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("div", { className: "agent-workbench-business", hidden: view === "chat", children: [
              view === "center" && toolbar,
              Body ? /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("div", { className: "agent-workbench-html", children: /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(Body, {}) }) : /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(
                "iframe",
                {
                  ref: frame,
                  title,
                  src,
                  ...page.kind === "html" ? { sandbox: "allow-scripts allow-downloads" } : {},
                  className: "agent-workbench-html",
                  onLoad: () => {
                    setLoaded((value) => value + 1);
                    sendTheme();
                  }
                },
                frameKey
              )
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(
              "div",
              {
                role: "separator",
                "aria-label": "\u8C03\u6574\u4E1A\u52A1\u4E0EAI\u680F\u5BBD",
                "aria-orientation": "vertical",
                className: "agent-workbench-column-handle",
                hidden: view !== "split",
                onPointerDown: (event) => {
                  if (event.button !== 0 || space.viewport <= 1200 || drag.current) return;
                  event.preventDefault();
                  event.currentTarget.setPointerCapture(event.pointerId);
                  drag.current = {
                    pointer: event.pointerId,
                    x: event.clientX,
                    width: conversationWidth
                  };
                },
                onPointerMove: (event) => {
                  if (drag.current?.pointer === event.pointerId) resizeConversation(event.clientX);
                },
                onPointerUp: (event) => {
                  if (drag.current?.pointer !== event.pointerId) return;
                  resizeConversation(event.clientX);
                  drag.current = void 0;
                  event.currentTarget.releasePointerCapture(event.pointerId);
                },
                onPointerCancel: () => {
                  drag.current = void 0;
                },
                onLostPointerCapture: () => {
                  drag.current = void 0;
                }
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)(
              "aside",
              {
                className: "agent-workbench-native-conversation",
                "aria-label": "AI\u5BF9\u8BDD",
                hidden: view === "center",
                children: [
                  view !== "center" && toolbar,
                  associated && session?.openState === "open" ? renderSlot("agent-workbench.conversation", { page: page.id }) : /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("p", { className: "agent-workbench-page-status", role: error ? "alert" : "status", children: error || navigationError || (associated ? session?.openError?.message : void 0) || t(
                    associated ? "pageWorking" : !page.resourceId ? busy ? "pageCreating" : "pageStaticHint" : !currentExecution || identity.state === "unknown" ? "pageWait" : !identity.status?.authenticated ? "pageLogin" : !resources() || !page.resourceId ? "pageWait" : busy ? "pageWorking" : "pageHint"
                  ) })
                ]
              }
            )
          ] })
        ]
      }
    );
  }
  ctx.effect(
    () => ctx.slots.registerFactory(
      {
        name: "agent-workbench.document",
        scope: "session-maybe",
        children: { "agent-workbench.conversation": { kind: "single", scope: "session-maybe" } }
      },
      Document
    )
  );
  ctx.slots.inject(
    "agent-workbench.conversation",
    () => ctx.slots.register(
      { name: "agent-workbench.conversation" },
      ({
        page,
        renderFactorySlot
      }) => {
        const language = ctx.locale.getSnapshot().active;
        const positions = (0, import_react26.useMemo)(
          () => ({
            views: function BusinessViews({
              useSession,
              inputActions,
              renderSlot
            }) {
              const blank = useSession(
                (session) => session.blank && !session.running && !session.promptAttempted
              );
              return /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)(import_jsx_runtime16.Fragment, { children: [
                blank && /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(
                  CompanyWelcome,
                  {
                    page,
                    language,
                    onFill: (text3) => inputActions?.setDraft(text3)
                  }
                ),
                renderSlot("conversation.session", {})
              ] });
            }
          }),
          [page, language]
        );
        return /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("div", { className: "workbench-page-conversation", children: renderFactorySlot(
          "conversation.content",
          { variant: "embedded", phase: "active", hero: false },
          { slots: positions }
        ) });
      }
    )
  );
  return async (page, id, signal, expected) => {
    const reference = ctx.sessions.retain(id, { source: "agentResourceSelection", signal });
    try {
      await reference.ready;
      signal.throwIfAborted();
      const preset = reference.binding.session.projections.faceOf("agentPreset").getSnapshot();
      if (preset !== null && (typeof preset !== "string" || !preset))
        throw Error("PAGE_SESSION_PRESET_UNAVAILABLE");
      const cwd = ctx.sessions.list.getSnapshot().byId[reference.sessionId]?.cwd;
      if (expected && (preset !== expected.preset || cwd !== expected.cwd))
        throw Error("PAGE_SESSION_RECOVERY_MISMATCH");
      const account = execution?.identity.getSnapshot();
      if (expected?.subject && account?.subject !== expected.subject)
        throw Error("PAGE_SESSION_IDENTITY_MISMATCH");
      workbench.associateSession(page, {
        sessionId: id,
        preset,
        ownerScope: account?.scope ?? null,
        ...account?.subject ? { subject: account.subject } : {},
        ...typeof cwd === "string" ? { cwd } : {}
      });
    } finally {
      reference.release();
    }
  };
}
function createExecution(ctx, account) {
  const request3 = async (operation, input, signal) => {
    const response = await fetch("/api/agent-workbench/page", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ operation, ...input }),
      signal
    });
    const value = await response.json();
    signal.throwIfAborted();
    if (!response.ok) throw Error(value.error ?? "PAGE_REQUEST_FAILED");
    return value;
  };
  return {
    identity: account,
    async open(page, sessionId, resourceId, signal) {
      const result = await request3("open", { pageId: page.id, sessionId, resourceId }, signal);
      return { page, sessionId, resourceId, owner: result.owner, binding: result.binding };
    },
    call: (connection, operation, parameters, signal) => request3(
      operation === "page-bridge" ? "catalog" : operation,
      { owner: connection.owner, parameters },
      signal
    ),
    close: async (connection) => {
      await request3("close", { owner: connection.owner }, AbortSignal.timeout(5e3));
    },
    prompt: async (connection, text3, signal) => {
      signal.throwIfAborted();
      const result = await ctx.remote.session.prompt(
        {
          sessionId: connection.sessionId,
          requestId: crypto.randomUUID(),
          mode: "queue",
          content: [{ type: "text", text: text3 }]
        },
        signal
      );
      signal.throwIfAborted();
      if (!result.ok) throw Error(result.error.message);
    }
  };
}

// src/client.ts
var inject = [
  "slots",
  "layout",
  "locale",
  "theme",
  "uiWorkspace",
  "sessions",
  "workspaces"
];
var zh3 = {
  title: "\u5DE5\u4F5C\u53F0",
  pages: "\u5DF2\u63A5\u5165\u9875\u9762",
  conversation: "\u539F\u751F\u5BF9\u8BDD",
  failed: "\u9875\u9762\u76EE\u5F55\u8BFB\u53D6\u5931\u8D25",
  retry: "\u91CD\u8BD5",
  empty: "\u6682\u65E0\u5DF2\u63A5\u5165\u9875\u9762",
  resources: "\u63D0\u793A\u8BCD\u4E0E Skill",
  start: "\u5F00\u59CB\u65B0\u804A\u5929",
  useSkill: "\u5728\u65B0\u804A\u5929\u4E2D\u4F7F\u7528",
  unavailable: "\u4E0D\u53EF\u9009\u7528",
  missing: "\u5F53\u524D\u4E0D\u53EF\u7528 Skill",
  resourcesFailed: "\u8D44\u6E90\u6E05\u5355\u8BFB\u53D6\u5931\u8D25\uFF0C\u8BF7\u5237\u65B0\u3002",
  selectionFailed: "\u8D44\u6E90\u9009\u7528\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5\u3002",
  resourceWorking: "\u6B63\u5728\u88C5\u8F7D",
  resourcesRefresh: "\u5237\u65B0\u8D44\u6E90",
  pageConnect: "\u8FDE\u63A5\u9875\u9762\u4E0E\u539F\u751F\u5BF9\u8BDD",
  pageNewChat: "\u5F00\u59CB\u65B0\u7684\u9875\u9762\u5BF9\u8BDD",
  pageWorking: "\u6B63\u5728\u8FDE\u63A5\u2026",
  pageChanged: "\u767B\u5F55\u8EAB\u4EFD\u5DF2\u53D8\u5316\uFF0C\u8BF7\u91CD\u65B0\u9009\u7528\u9875\u9762\u80FD\u529B\u3002",
  pageHint: "\u4E1A\u52A1\u8BFB\u53D6\u9700\u767B\u5F55\u5E76\u9009\u7528\u9875\u9762\u80FD\u529B\u3002",
  pageWait: "\u9875\u9762\u80FD\u529B\u5C1A\u672A\u5C31\u7EEA\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002",
  pageLogin: "\u8BF7\u5148\u767B\u5F55 GEA\uFF0C\u518D\u8FDE\u63A5\u9875\u9762\u80FD\u529B\u3002",
  pageSessionUnavailable: "\u9875\u9762\u539F\u751F\u4F1A\u8BDD\u672A\u5C31\u7EEA\u3002",
  pageStaticHint: "\u9009\u62E9\u5386\u53F2\u5BF9\u8BDD\u3001\u65B0\u5EFA\u5BF9\u8BDD\uFF0C\u6216\u5173\u8054\u5F53\u524D\u5BF9\u8BDD\u3002",
  pageCreating: "\u6B63\u5728\u521B\u5EFA\u539F\u751F\u5BF9\u8BDD\u2026",
  pageInterpreter: "\u9009\u62E9\u89E3\u8BFB\u80FD\u529B",
  pageIdentityFailed: "\u65E0\u6CD5\u786E\u8BA4 GEA \u8EAB\u4EFD\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002"
};
var en3 = {
  title: "Workbench",
  pages: "Available pages",
  conversation: "Conversation",
  failed: "Page directory unavailable",
  retry: "Retry",
  empty: "No pages available",
  resources: "Prompts and Skills",
  start: "Start a new chat",
  useSkill: "Use in a new chat",
  unavailable: "Unavailable",
  missing: "Unavailable Skills",
  resourcesFailed: "Resource list unavailable. Please refresh.",
  selectionFailed: "Unable to select this resource. Please retry.",
  resourceWorking: "Loading",
  resourcesRefresh: "Refresh resources",
  pageConnect: "Connect page and Conversation",
  pageNewChat: "Start a new page chat",
  pageWorking: "Connecting\u2026",
  pageChanged: "Your identity changed. Select this page resource again.",
  pageHint: "Business reads require login and a selected page resource.",
  pageWait: "Page capability is not ready. Please retry shortly.",
  pageLogin: "Sign in to GEA before connecting this page.",
  pageSessionUnavailable: "The page Conversation is unavailable.",
  pageStaticHint: "Choose history, start a new conversation, or associate the current conversation.",
  pageCreating: "Creating a native conversation\u2026",
  pageInterpreter: "Choose Interpreter",
  pageIdentityFailed: "Unable to confirm the GEA identity. Please try again later."
};
function apply(ctx) {
  mountReferenceMessages(ctx);
  ctx.effect(() => ctx.locale.register("agentWorkbench", { zh: zh3, en: en3 }));
  const t = ctx.locale.bind("agentWorkbench");
  ctx.effect(() => {
    const style = document.createElement("style");
    style.dataset.agentWorkbenchTheme = "1.1.1";
    style.textContent = tokens_default + reference_message_default + (typeof WORKBENCH_MODULE_STYLES === "undefined" ? "" : WORKBENCH_MODULE_STYLES);
    document.head.append(style);
    return () => style.remove();
  });
  const workbench = new WorkbenchController(
    {
      panel: (id) => ctx.layout.selectPanel(id),
      hasPanel: (id) => ctx.slots.entries("main").some((entry) => entry.options.key === id),
      document: (id) => {
        if (id) ctx.uiWorkspace.openSession(id);
        else ctx.layout.selectPanel(null);
      }
    },
    (0, import_dsh_client_store.createSnapshotStore)(
      { version: 2, selections: [], views: [] },
      { persist: { name: WORKBENCH_PRESENTATION_KEY } }
    )
  );
  ctx.provide("agentWorkbench", workbench);
  ctx.effect(() => () => workbench.dispose());
  let nativeResources;
  mountNativeResourceSelection(ctx, (host) => {
    nativeResources = host;
  });
  const restorePageSession = mountFramePresentation(
    ctx,
    () => nativeResources,
    (key) => t(key),
    workbench
  );
  function Resources({ cwd }) {
    const [rows, setRows] = (0, import_react27.useState)([]);
    const [resourceRevision, refreshResources] = (0, import_react27.useState)(0);
    const [error, setError] = (0, import_react27.useState)("");
    const [selectionError, setSelectionError] = (0, import_react27.useState)(false);
    const [busy, setBusy] = (0, import_react27.useState)("");
    const pending = (0, import_react27.useRef)();
    (0, import_react27.useEffect)(() => {
      const lifetime = new AbortController();
      void resourceWorkspace(fetch, lifetime.signal, cwd).then(
        (path) => fetch("/api/agent-manage/resources?" + new URLSearchParams({ cwd: path }), {
          signal: lifetime.signal,
          cache: "no-store"
        })
      ).then(async (response) => {
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
        await selectResource(
          nativeResources,
          id,
          controller.signal,
          cwd,
          () => workbench.leaveDocument()
        );
      } catch (failure) {
        if (!controller.signal.aborted) {
          console.error("[agent-workbench] resource selection failed", {
            id,
            error: failure instanceof Error ? failure.message : String(failure)
          });
          setSelectionError(true);
          setError(String(failure));
        }
      } finally {
        if (!controller.signal.aborted) setBusy("");
      }
    };
    return import_react27.default.createElement(
      "section",
      { className: "gea-home-panel" },
      import_react27.default.createElement(
        "div",
        { className: "gea-home-panel-head" },
        import_react27.default.createElement("strong", null, t("resources"))
      ),
      import_react27.default.createElement(
        "button",
        {
          className: "gea-home-panel-more",
          type: "button",
          disabled: Boolean(busy),
          onClick: () => refreshResources((value) => value + 1)
        },
        t("resourcesRefresh")
      ),
      error ? import_react27.default.createElement(
        "p",
        { role: "alert" },
        selectionError ? t("selectionFailed") : t("resourcesFailed")
      ) : null,
      ...rows.map(
        (row) => import_react27.default.createElement(
          "div",
          { key: row.id },
          import_react27.default.createElement(
            "button",
            {
              className: "gea-home-panel-item",
              type: "button",
              disabled: !row.enabled || Boolean(busy),
              onClick: () => void choose(row.id)
            },
            row.label + " \xB7 " + (busy === row.id ? t("resourceWorking") : !row.enabled ? t("unavailable") : row.kind === "skill" ? t("useSkill") : t("start"))
          ),
          row.missingSkills?.length ? import_react27.default.createElement("p", null, t("missing") + ": " + row.missingSkills.join(", ")) : null,
          row.error ? import_react27.default.createElement("p", { role: "alert" }, row.error) : null
        )
      )
    );
  }
  mountCompanyUI(ctx, workbench, Resources, restorePageSession);
  mountBusinessViews(ctx);
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
    import_react27.default.useSyncExternalStore(
      (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      () => discoveryRevision
    );
    return discoveryError ? import_react27.default.createElement(
      "p",
      { role: "alert" },
      t("failed") + ": " + discoveryError,
      " ",
      import_react27.default.createElement("button", { onClick: () => retry() }, t("retry"))
    ) : null;
  }
  ctx.slots.inject(
    "shell.overlay",
    () => ctx.slots.register({ name: "shell.overlay", id: "workbench-page-discovery" }, DiscoveryNotice)
  );
  ctx.effect(() => {
    const controller = new AbortController();
    const registered = /* @__PURE__ */ new Set();
    const cleanup = [];
    let loading = false;
    const discover = async () => {
      if (loading || controller.signal.aborted) return;
      loading = true;
      try {
        const response = await fetch("/api/agent-workbench/pages", {
          cache: "no-store",
          signal: controller.signal
        });
        if (!response.ok) throw Error(`HTTP ${response.status}`);
        const pages2 = await response.json();
        controller.signal.throwIfAborted();
        for (const page of pages2) {
          if (registered.has(page.id)) continue;
          registered.add(page.id);
          const dispose = workbench.registerFrame({
            id: page.id,
            label: page.name,
            src: page.url,
            kind: "html",
            pluginId: page.pluginId,
            resourceId: page.resourceId
          });
          cleanup.push(dispose);
        }
        discoveryError = "";
      } catch (error) {
        if (!controller.signal.aborted)
          discoveryError = error instanceof Error ? error.message : String(error);
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
