// src/page-interaction/shared/payload-budget.ts
var MODEL_PAYLOAD_BUDGET = 12e3;
var DEFAULT_MAX_ITEMS = 20;
var DEFAULT_MAX_CHARS = 200;
var DEFAULT_SAMPLE_ITEMS = 0;
var byteLength = (value) => new TextEncoder().encode(JSON.stringify(value) ?? "").length;
function focusTokens(focus) {
  if (typeof focus !== "string") return [];
  return [
    ...new Set(
      focus.split(/[\s,，、;；|]+/).map((token) => token.trim().toLowerCase()).filter((token) => token.length >= 2)
    )
  ].slice(0, 8);
}
function includesFocus(value, tokens) {
  if (tokens.length === 0) return true;
  let text;
  try {
    text = JSON.stringify(value)?.toLowerCase() ?? "";
  } catch {
    return false;
  }
  return tokens.some((token) => text.includes(token));
}
var truncateText = (value, maxChars) => value.length > maxChars ? value.slice(0, maxChars) + "\u2026" : value;
function narrow(value, tokens, options) {
  if (typeof value === "string")
    return { value: truncateText(value, options.maxChars), omitted: 0 };
  if (value === null || typeof value !== "object") return { value, omitted: 0 };
  if (Array.isArray(value)) {
    const scalars = value.every((item) => item === null || typeof item !== "object");
    const matched = scalars ? value : value.filter((item) => includesFocus(item, tokens));
    const kept = matched.slice(0, options.maxItems);
    const children = kept.map((item) => narrow(item, tokens, options));
    const omitted2 = value.length - kept.length + children.reduce((total, child) => total + child.omitted, 0);
    return {
      value: children.map((child) => child.value),
      omitted: omitted2
    };
  }
  const source = value;
  const result = {};
  let omitted = 0;
  for (const key of Object.keys(source)) {
    const child = narrow(source[key], tokens, options);
    result[key] = child.value;
    omitted += child.omitted;
  }
  return { value: result, omitted };
}
function brief(value, maxChars, sampleItems) {
  if (typeof value === "string") return truncateText(value, maxChars);
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    const fields = [
      ...new Set(
        value.slice(0, 5).flatMap(
          (item) => item && typeof item === "object" && !Array.isArray(item) ? Object.keys(item) : []
        )
      )
    ].slice(0, 20);
    return {
      count: value.length,
      ...fields.length ? { fields } : {},
      sample: value.slice(0, sampleItems).map((item) => brief(item, maxChars, sampleItems))
    };
  }
  const source = value;
  return Object.fromEntries(
    Object.keys(source).map((key) => [key, brief(source[key], maxChars, sampleItems)])
  );
}
function compressForModel(payload, options = {}) {
  const budget = options.budgetBytes ?? MODEL_PAYLOAD_BUDGET;
  const tokens = focusTokens(options.focus);
  let maxItems = options.maxItems ?? DEFAULT_MAX_ITEMS;
  let maxChars = options.maxChars ?? DEFAULT_MAX_CHARS;
  const original = byteLength(payload);
  if (tokens.length === 0 && original <= budget)
    return { json: JSON.stringify(payload), compressed: false, omitted: 0 };
  const attempt = () => tokens.length > 0 ? narrow(payload, tokens, { maxItems, maxChars }) : {
    value: brief(payload, maxChars, DEFAULT_SAMPLE_ITEMS),
    omitted: 0
  };
  let narrowed = attempt();
  let json = JSON.stringify(narrowed.value);
  while (byteLength(json) > budget && (maxItems > 1 || maxChars > 60)) {
    if (maxItems > 1) maxItems = Math.max(1, Math.floor(maxItems / 2));
    else maxChars = Math.max(60, Math.floor(maxChars / 2));
    narrowed = attempt();
    json = JSON.stringify(narrowed.value);
  }
  const omitted = narrowed.omitted;
  const note = [
    tokens.length > 0 ? `\u5DF2\u6309 focus\u300C${tokens.join(" ")}\u300D\u53EA\u4FDD\u7559\u76F8\u5173\u884C/\u5B57\u6BB5` : "\u5DF2\u53EA\u4FDD\u7559\u6458\u8981\uFF08\u6570\u91CF\u4E0E\u5B57\u6BB5\u540D\uFF09",
    omitted > 0 ? `\u53E6\u6709 ${omitted} \u9879\u672A\u4FDD\u7559\uFF1B\u8BE5\u6570\u91CF\u5305\u542B\u4E0D\u540C\u6570\u7EC4\u7684\u6761\u76EE\uFF0C\u4E0D\u662F\u4E1A\u52A1\u884C\u6570\u6216\u672A\u5C55\u5F00\u884C\u6570` : void 0,
    "\u9700\u8981\u66F4\u591A\u660E\u7EC6\u65F6\u5E26\u4E0A\u66F4\u5177\u4F53\u7684 focus\uFF08\u7528\u6237\u63D0\u5230\u7684\u5BF9\u8C61\u6216\u5B57\u6BB5\u540D\uFF09\uFF0C\u4E0D\u8981\u91CD\u590D\u6574\u5C4F\u62C9\u53D6\u3002"
  ].filter((text) => text !== void 0).join("\uFF1B");
  return { json, compressed: true, omitted, note };
}
export {
  MODEL_PAYLOAD_BUDGET,
  compressForModel,
  focusTokens,
  truncateText
};
