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
function projectReferenceText(text2) {
  const pattern = /@?\[([^\]\n]+)\]\(dsh-page:(R[a-f0-9]{12})\)/g;
  const labels = [];
  const ranges = [];
  let display = "", cursor = 0;
  for (const match of text2.matchAll(pattern)) {
    display += text2.slice(cursor, match.index);
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
  return { text: display + text2.slice(cursor), labels, ranges };
}
function hasPageReferences(events) {
  return events.some(
    (event) => event.type === "user/message" && /dsh-page:R[a-f0-9]{12}/.test(JSON.stringify(event.data))
  );
}
export {
  PAGE_INTERACTION,
  REFERENCE_SOURCE,
  hasPageReferences,
  pageReference,
  projectReferenceText,
  serializeReference
};
