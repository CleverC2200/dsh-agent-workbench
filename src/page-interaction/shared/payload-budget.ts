export const MODEL_PAYLOAD_BUDGET = 12_000;
const DEFAULT_MAX_ITEMS = 20;
const DEFAULT_MAX_CHARS = 200;

const DEFAULT_SAMPLE_ITEMS = 0;

const byteLength = (value: unknown): number =>
  new TextEncoder().encode(JSON.stringify(value) ?? '').length;

export function focusTokens(focus?: string): string[] {
  if (typeof focus !== 'string') return [];
  return [
    ...new Set(
      focus
        .split(/[\s,，、;；|]+/)
        .map((token) => token.trim().toLowerCase())
        .filter((token) => token.length >= 2),
    ),
  ].slice(0, 8);
}

function includesFocus(value: unknown, tokens: string[]): boolean {
  if (tokens.length === 0) return true;
  let text: string;
  try {
    text = JSON.stringify(value)?.toLowerCase() ?? '';
  } catch {
    return false;
  }
  return tokens.some((token) => text.includes(token));
}

export const truncateText = (value: string, maxChars: number): string =>
  value.length > maxChars ? value.slice(0, maxChars) + '…' : value;

type Narrowed = { value: unknown; omitted: number };

function narrow(
  value: unknown,
  tokens: string[],
  options: { maxItems: number; maxChars: number },
): Narrowed {
  if (typeof value === 'string')
    return { value: truncateText(value, options.maxChars), omitted: 0 };
  if (value === null || typeof value !== 'object') return { value, omitted: 0 };
  if (Array.isArray(value)) {
    const scalars = value.every((item) => item === null || typeof item !== 'object');
    const matched = scalars ? value : value.filter((item) => includesFocus(item, tokens));
    const kept = matched.slice(0, options.maxItems);
    const children = kept.map((item) => narrow(item, tokens, options));

    const omitted =
      value.length - kept.length + children.reduce((total, child) => total + child.omitted, 0);
    return {
      value: children.map((child) => child.value),
      omitted,
    };
  }
  const source = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  let omitted = 0;
  for (const key of Object.keys(source)) {
    const child = narrow(source[key], tokens, options);
    result[key] = child.value;
    omitted += child.omitted;
  }
  return { value: result, omitted };
}

function brief(value: unknown, maxChars: number, sampleItems: number): unknown {
  if (typeof value === 'string') return truncateText(value, maxChars);
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    const fields = [
      ...new Set(
        value
          .slice(0, 5)
          .flatMap((item) =>
            item && typeof item === 'object' && !Array.isArray(item)
              ? Object.keys(item as Record<string, unknown>)
              : [],
          ),
      ),
    ].slice(0, 20);
    return {
      count: value.length,
      ...(fields.length ? { fields } : {}),
      sample: value.slice(0, sampleItems).map((item) => brief(item, maxChars, sampleItems)),
    };
  }
  const source = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(source).map((key) => [key, brief(source[key], maxChars, sampleItems)]),
  );
}

export type CompressedPayload = {
  json: string;

  compressed: boolean;

  omitted: number;

  note?: string;
};

export function compressForModel(
  payload: unknown,
  options: {
    budgetBytes?: number;
    focus?: string;
    maxItems?: number;
    maxChars?: number;
  } = {},
): CompressedPayload {
  const budget = options.budgetBytes ?? MODEL_PAYLOAD_BUDGET;
  const tokens = focusTokens(options.focus);
  let maxItems = options.maxItems ?? DEFAULT_MAX_ITEMS;
  let maxChars = options.maxChars ?? DEFAULT_MAX_CHARS;
  const original = byteLength(payload);
  if (tokens.length === 0 && original <= budget)
    return { json: JSON.stringify(payload), compressed: false, omitted: 0 };

  const attempt = (): Narrowed =>
    tokens.length > 0
      ? narrow(payload, tokens, { maxItems, maxChars })
      : {
          value: brief(payload, maxChars, DEFAULT_SAMPLE_ITEMS),
          omitted: 0,
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
    tokens.length > 0
      ? `已按 focus「${tokens.join(' ')}」只保留相关行/字段`
      : '已只保留摘要（数量与字段名）',
    omitted > 0
      ? `另有 ${omitted} 项未保留；该数量包含不同数组的条目，不是业务行数或未展开行数`
      : undefined,
    '需要更多明细时带上更具体的 focus（用户提到的对象或字段名），不要重复整屏拉取。',
  ]
    .filter((text): text is string => text !== undefined)
    .join('；');
  return { json, compressed: true, omitted, note };
}
