import {
  focusTokens,
  truncateText,
} from '@cleverc2200/dsh-agent-workbench/page-interaction/payload-budget';

export type PageActionScalarType = 'string' | 'integer' | 'number' | 'boolean';

export type PageActionScalar = {
  type: PageActionScalarType;
  required?: boolean;
  description?: string;
  enum?: readonly string[];
};

export type PageActionParam =
  | PageActionScalar
  | {
      type: 'array';
      required?: boolean;
      description?: string;
      items: { type: PageActionScalarType; description?: string };
    }
  | {
      type: 'object';
      required?: boolean;
      description?: string;
      properties: Record<string, PageActionScalar>;
    };

export type PageAction = {
  name: string;

  description: string;

  scope?: 'view' | 'data';

  params?: Record<string, PageActionParam>;
};

export type PageCatalog = {
  surface: string;

  tool: string;

  description: string;

  reasonField?: string;

  elements?: PageElement[];

  actions?: PageAction[];
};

export const PAGE_ACTION_VERBS = ['invoke', 'setValue', 'select', 'clear'] as const;
export type PageActionVerb = (typeof PAGE_ACTION_VERBS)[number];

export type PageElementRole = 'row' | 'field' | 'control' | 'collection';

export const PAGE_ELEMENT_EFFECTS = ['view', 'draft', 'submit', 'approve'] as const;
export type PageElementEffect = (typeof PAGE_ELEMENT_EFFECTS)[number];

export type PageElement = {
  id: string;
  role: PageElementRole;

  label: string;

  value?: string;

  options?: readonly string[];

  actions?: readonly string[];

  editable?: boolean;

  members?: readonly string[];

  effect?: PageElementEffect;
};

export const PAGE_CATALOG_LIMITS = {
  maxActions: 24,
  maxElements: 300,
  maxParamsPerAction: 12,
  maxNameLength: 48,
  maxDescriptionLength: 200,

  maxToolDescriptionLength: 20_000,

  maxListedElements: 120,
  maxEnumValues: 24,
} as const;

const NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]*$/;

const SURFACE_PATTERN = /^[a-z][a-z0-9._-]*$/;

const ELEMENT_PATTERN = /^[A-Za-z][A-Za-z0-9:._\-\u4e00-\u9fa5]*$/;
const ELEMENT_ROLES = ['row', 'field', 'control', 'collection'] as const;

function catalogElements(value: unknown): PageElement[] {
  if (!Array.isArray(value) || value.length > PAGE_CATALOG_LIMITS.maxElements)
    throw new Error('INVALID_PAGE_CATALOG');
  const elements: PageElement[] = value.map((raw) => {
    const element = catalogObject(raw);
    if (
      Object.keys(element).some(
        (key) =>
          key !== 'id' &&
          key !== 'role' &&
          key !== 'label' &&
          key !== 'value' &&
          key !== 'options' &&
          key !== 'actions' &&
          key !== 'editable' &&
          key !== 'members' &&
          key !== 'effect',
      )
    )
      throw new Error('INVALID_PAGE_CATALOG');
    const id = catalogText(element.id, 120);
    if (!ELEMENT_PATTERN.test(id)) throw new Error('INVALID_PAGE_CATALOG');
    const role = element.role;
    if (!ELEMENT_ROLES.includes(role as (typeof ELEMENT_ROLES)[number]))
      throw new Error('INVALID_PAGE_CATALOG');
    const label = catalogText(element.label, 200);
    const text = (candidate: unknown, max: number) =>
      candidate === undefined ? undefined : catalogText(candidate, max, true);
    const list = (
      candidate: unknown,
      max: number,
      allowEmpty = false,
    ): readonly string[] | undefined => {
      if (candidate === undefined) return undefined;
      if (!Array.isArray(candidate) || candidate.length > max)
        throw new Error('INVALID_PAGE_CATALOG');
      return candidate.map((item) => catalogText(item, 120, allowEmpty));
    };
    if (element.editable !== undefined && typeof element.editable !== 'boolean')
      throw new Error('INVALID_PAGE_CATALOG');
    if (
      element.effect !== undefined &&
      !(PAGE_ELEMENT_EFFECTS as readonly unknown[]).includes(element.effect)
    )
      throw new Error('INVALID_PAGE_CATALOG');

    if (element.editable === true && role !== 'field' && role !== 'control')
      throw new Error('INVALID_PAGE_CATALOG');
    return {
      id,
      role: role as PageElementRole,
      label,
      ...(text(element.value, 200) === undefined
        ? {}
        : { value: text(element.value, 200) as string }),
      ...(list(element.options, PAGE_CATALOG_LIMITS.maxEnumValues, true) === undefined
        ? {}
        : { options: list(element.options, PAGE_CATALOG_LIMITS.maxEnumValues, true)! }),
      ...(list(element.actions, 8) === undefined ? {} : { actions: list(element.actions, 8)! }),
      ...(element.editable === undefined ? {} : { editable: element.editable }),
      ...(list(element.members, 300) === undefined ? {} : { members: list(element.members, 300)! }),
      ...(element.effect === undefined ? {} : { effect: element.effect as PageElementEffect }),
    };
  });
  if (new Set(elements.map((element) => element.id)).size !== elements.length)
    throw new Error('INVALID_PAGE_CATALOG');
  return elements;
}

function catalogObject(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('INVALID_PAGE_CATALOG');
  return value as Record<string, unknown>;
}

function catalogText(value: unknown, max: number, allowEmpty = false): string {
  if (typeof value !== 'string' || (!allowEmpty && value.length === 0) || value.length > max)
    throw new Error('INVALID_PAGE_CATALOG');
  return value;
}

function catalogScalar(value: unknown): PageActionScalar {
  const param = catalogObject(value);
  const type = param.type;
  if (type !== 'string' && type !== 'integer' && type !== 'number' && type !== 'boolean')
    throw new Error('INVALID_PAGE_CATALOG');
  if (param.required !== undefined && typeof param.required !== 'boolean')
    throw new Error('INVALID_PAGE_CATALOG');
  if (
    param.description !== undefined &&
    (typeof param.description !== 'string' ||
      param.description.length > PAGE_CATALOG_LIMITS.maxDescriptionLength)
  )
    throw new Error('INVALID_PAGE_CATALOG');
  if (
    param.enum !== undefined &&
    (!Array.isArray(param.enum) ||
      param.enum.length === 0 ||
      param.enum.length > PAGE_CATALOG_LIMITS.maxEnumValues ||
      param.enum.some((item) => typeof item !== 'string' || !NAME_PATTERN.test(item as string)))
  )
    throw new Error('INVALID_PAGE_CATALOG');
  return {
    type,
    ...(param.required === undefined ? {} : { required: param.required }),
    ...(param.description === undefined ? {} : { description: param.description as string }),
    ...(param.enum === undefined ? {} : { enum: param.enum as readonly string[] }),
  };
}

function catalogParams(value: unknown): Record<string, PageActionParam> {
  const params = catalogObject(value);
  const entries = Object.entries(params);
  if (entries.length > PAGE_CATALOG_LIMITS.maxParamsPerAction)
    throw new Error('INVALID_PAGE_CATALOG');
  const result: Record<string, PageActionParam> = {};
  for (const [name, raw] of entries) {
    if (!NAME_PATTERN.test(name)) throw new Error('INVALID_PAGE_CATALOG');
    const param = catalogObject(raw);
    if (param.type === 'array') {
      const items = catalogObject(param.items);
      if (
        Object.keys(param).some(
          (key) => key !== 'type' && key !== 'required' && key !== 'description' && key !== 'items',
        )
      )
        throw new Error('INVALID_PAGE_CATALOG');
      const itemType = items.type;
      if (
        itemType !== 'string' &&
        itemType !== 'integer' &&
        itemType !== 'number' &&
        itemType !== 'boolean'
      )
        throw new Error('INVALID_PAGE_CATALOG');
      result[name] = {
        type: 'array',
        ...(param.required === undefined ? {} : { required: param.required as boolean }),
        ...(param.description === undefined ? {} : { description: param.description as string }),
        items: {
          type: itemType,
          ...(items.description === undefined ? {} : { description: items.description as string }),
        },
      };
      continue;
    }
    if (param.type === 'object') {
      if (
        Object.keys(param).some(
          (key) =>
            key !== 'type' && key !== 'required' && key !== 'description' && key !== 'properties',
        )
      )
        throw new Error('INVALID_PAGE_CATALOG');
      const properties = catalogObject(param.properties);
      result[name] = {
        type: 'object',
        ...(param.required === undefined ? {} : { required: param.required as boolean }),
        ...(param.description === undefined ? {} : { description: param.description as string }),
        properties: Object.fromEntries(
          Object.entries(properties).map(([key, value]) => [key, catalogScalar(value)]),
        ),
      };
      continue;
    }
    result[name] = catalogScalar(param);
  }
  return result;
}

export function validatePageCatalog(value: unknown): PageCatalog {
  const catalog = catalogObject(value);
  if (
    Object.keys(catalog).some(
      (key) =>
        key !== 'surface' &&
        key !== 'tool' &&
        key !== 'description' &&
        key !== 'reasonField' &&
        key !== 'elements' &&
        key !== 'actions',
    )
  )
    throw new Error('INVALID_PAGE_CATALOG');
  const surface = catalogText(catalog.surface, PAGE_CATALOG_LIMITS.maxNameLength);
  if (!SURFACE_PATTERN.test(surface)) throw new Error('INVALID_PAGE_CATALOG');
  const tool = catalogText(catalog.tool, PAGE_CATALOG_LIMITS.maxNameLength);
  if (!NAME_PATTERN.test(tool)) throw new Error('INVALID_PAGE_CATALOG');
  const description = catalogText(
    catalog.description,
    PAGE_CATALOG_LIMITS.maxToolDescriptionLength,
  );
  const reasonField =
    catalog.reasonField === undefined
      ? undefined
      : catalogText(catalog.reasonField, PAGE_CATALOG_LIMITS.maxNameLength);
  if (reasonField !== undefined && !NAME_PATTERN.test(reasonField))
    throw new Error('INVALID_PAGE_CATALOG');
  const elements = catalog.elements === undefined ? undefined : catalogElements(catalog.elements);
  if (catalog.actions !== undefined && !Array.isArray(catalog.actions))
    throw new Error('INVALID_PAGE_CATALOG');
  const actions: PageAction[] = (catalog.actions ?? []).map((raw) => {
    const action = catalogObject(raw);
    if (
      Object.keys(action).some(
        (key) => key !== 'name' && key !== 'description' && key !== 'scope' && key !== 'params',
      )
    )
      throw new Error('INVALID_PAGE_CATALOG');
    if (action.scope !== undefined && action.scope !== 'view' && action.scope !== 'data')
      throw new Error('INVALID_PAGE_CATALOG');
    const name = catalogText(action.name, PAGE_CATALOG_LIMITS.maxNameLength);
    if (!NAME_PATTERN.test(name)) throw new Error('INVALID_PAGE_CATALOG');
    return {
      name,
      description: catalogText(action.description, PAGE_CATALOG_LIMITS.maxDescriptionLength),
      scope: (action.scope as 'view' | 'data' | undefined) ?? 'view',
      ...(action.params === undefined ? {} : { params: catalogParams(action.params) }),
    };
  });
  if (new Set(actions.map((action) => action.name)).size !== actions.length)
    throw new Error('INVALID_PAGE_CATALOG');
  if (actions.length === 0 && (elements?.length ?? 0) === 0)
    throw new Error('INVALID_PAGE_CATALOG');
  if (actions.length > PAGE_CATALOG_LIMITS.maxActions) throw new Error('INVALID_PAGE_CATALOG');
  return {
    surface,
    tool,
    description,
    ...(reasonField === undefined ? {} : { reasonField }),
    ...(elements === undefined ? {} : { elements }),
    ...(actions.length === 0 ? {} : { actions }),
  };
}

function paramDescription(catalog: PageCatalog, name: string): string | undefined {
  const declared = catalog.actions ?? [];
  const owners = declared.filter((action) => action.params?.[name]).map((action) => action.name);
  const own = declared
    .map((action) => action.params?.[name]?.description)
    .find((text) => text !== undefined);
  if (owners.length <= 1) return own;
  return `${owners.join(' / ')} 使用：${own ?? ''}`.trim();
}

export function compilePageCatalog(catalog: PageCatalog): {
  description: string;
  parameters: Array<{ name: string } & PageActionParam>;
} {
  if (catalog.elements) return compileElementCatalog(catalog);
  const declared = catalog.actions ?? [];
  const parameters: Array<{ name: string } & PageActionParam> = [
    {
      name: 'kind',
      type: 'string',
      required: true,
      enum: declared.map((action) => action.name),
      description: declared.map((action) => `${action.name}（${action.description}）`).join('；'),
    },
  ];
  const seen = new Set<string>(['kind']);
  for (const action of declared) {
    for (const [name, param] of Object.entries(action.params ?? {})) {
      if (seen.has(name)) continue;
      seen.add(name);
      const description = paramDescription(catalog, name);

      const requiredIn = declared
        .filter((action) => action.params?.[name]?.required === true)
        .map((action) => action.name);
      parameters.push({
        ...param,
        name,
        required: false,
        description: [
          description,
          requiredIn.length === 0 ? undefined : `${requiredIn.join(' / ')} 必填`,
        ]
          .filter((text): text is string => Boolean(text))
          .join('｜'),
      });
    }
  }
  if (catalog.reasonField !== undefined && !seen.has(catalog.reasonField)) {
    parameters.push({
      name: catalog.reasonField,
      type: 'string',
      required: false,
      description: '可选：一句话说明为什么改这一屏。',
    });
  }
  const lines = declared.map((action) => {
    const params = Object.entries(action.params ?? {})
      .map(([name, param]) => `${name}${param.required ? '（必填）' : ''}`)
      .join(', ');
    return `- ${action.name}：${action.description}${params ? `｜参数：${params}` : '｜无参数'}`;
  });
  const description = `${catalog.description}\n可用的动作（kind）：\n${lines.join('\n')}`;
  if (description.length > PAGE_CATALOG_LIMITS.maxToolDescriptionLength)
    throw new Error('INVALID_PAGE_CATALOG');
  return { description, parameters };
}

function compileElementCatalog(catalog: PageCatalog): {
  description: string;
  parameters: Array<{ name: string } & PageActionParam>;
} {
  const elements = catalog.elements ?? [];
  const interactive = elements.filter(
    (element) =>
      element.editable === true ||
      (element.actions?.length ?? 0) > 0 ||
      element.role === 'collection',
  );
  const readOnly = elements.filter((element) => !interactive.includes(element));
  const count = (effect: PageElement['effect']) =>
    elements.filter((element) => element.effect === effect).length;
  const description = [
    catalog.description,
    '',

    `可操作元素 ${interactive.length} 个（可编辑 ${
      elements.filter((element) => element.editable === true).length
    }、可点 ${
      elements.filter((element) => (element.actions?.length ?? 0) > 0).length
    }、提交类 ${count('submit')}、审批类 ${count('approve')}）；只读元素 ${readOnly.length} 个。`,
    '元素目录不在说明里：先用 directory=true 取这一屏的 id、名称与当前值（只关心某几行/某字段时带 focus=用户提到的对象或字段名），拿到 id 再用 kind 操作。',
    '',
    '规则：invoke 只能执行元素列出的可执行动作；setValue 只能写「可编辑」的 field，或用 collection 一次写它的成员字段；select 只能选可操作元素；后台状态、内部缓存、接口都不在清单里，禁止臆造 id。' +
      '标了「提交类」「审批类」的元素默认不要动：只有用户这一轮明确要求提交/审批时才调用，并且必须带 confirm=true；页面没标这类元素就说明它不提供该动作，不要找别的办法绕过。',
  ].join('\n');

  const bounded =
    description.length > PAGE_CATALOG_LIMITS.maxToolDescriptionLength
      ? `${description.slice(0, PAGE_CATALOG_LIMITS.maxToolDescriptionLength)}\n…（说明超长已截断；规则同上）`
      : description;
  return {
    description: bounded,
    parameters: [
      {
        name: 'kind',
        type: 'string',

        enum: [...PAGE_ACTION_VERBS, 'directory'],
        description:
          'invoke 执行元素动作；setValue 写可编辑字段；select 选中元素；clear 关浮层/清当前筛选；directory 只取元素目录（等价于传 directory=true）。只要目录时也可以不传 kind。',
      },
      {
        name: 'target',
        type: 'string',
        description: '单个元素 id（invoke 必填；setValue 也可以只写一个）',
      },
      {
        name: 'targets',
        type: 'array',
        items: { type: 'string' },
        description: '多个元素 id（select 必填；setValue 批量改字段时用）',
      },
      {
        name: 'action',
        type: 'string',
        description: 'invoke 使用：元素列出的可执行动作名',
      },
      {
        name: 'value',
        type: 'string',
        description: 'setValue 使用：要写入的值',
      },
      {
        name: catalog.reasonField ?? 'reason',
        type: 'string',
        description: '可选：一句话说明为什么改这一屏。',
      },
      {
        name: 'confirm',
        type: 'boolean',
        description:
          '提交类/审批类元素必填 true，表示用户这一轮明确要求提交或审批；其它情况不要传。',
      },
      {
        name: 'directory',
        type: 'boolean',
        description:
          'true 时只返回这一屏的元素目录（id、名称、当前值、能不能改），不下发任何操作。',
      },
      {
        name: 'focus',
        type: 'string',
        description:
          '只看与这些关键词相关的行或字段（用户提到的对象名、编码、字段名）；不带 focus 默认只回摘要。',
      },
      {
        name: 'values',
        type: 'boolean',
        description:
          'directory=true 时带上：除字段索引外再回当前值与可选项（默认不带，省上下文）。',
      },
    ],
  };
}

export function elementDirectory(
  catalog: PageCatalog,
  options: { focus?: string; limit?: number; values?: boolean } = {},
): {
  counts: {
    total: number;
    interactive: number;
    readOnly: number;
    submit: number;
    approve: number;
  };
  entries: Array<{
    id: string;
    role?: string;
    label?: string;
    value?: string;
    options?: readonly string[];
    editable?: boolean;
    actions?: readonly string[];
    effect?: PageElementEffect;
  }>;
  omitted: number;
  note: string;
} {
  const elements = catalog.elements ?? [];
  const tokens = focusTokens(options.focus);
  const limit = Math.max(1, options.limit ?? PAGE_CATALOG_LIMITS.maxListedElements);
  const interactive = (element: PageElement) =>
    element.editable === true ||
    (element.actions?.length ?? 0) > 0 ||
    element.role === 'collection';
  const matched = elements.filter(
    (element) =>
      tokens.length === 0 ||
      tokens.some((token) =>
        [element.id, element.label, element.value, ...(element.options ?? [])]
          .filter((value): value is string => typeof value === 'string')
          .some((value) => value.toLowerCase().includes(token)),
      ),
  );

  const ordered = [
    ...matched.filter(interactive),
    ...matched.filter((element) => !interactive(element)),
  ];
  const kept = ordered.slice(0, limit);

  const withValues = options.values === true;
  return {
    counts: {
      total: elements.length,
      interactive: elements.filter(interactive).length,
      readOnly: elements.filter((element) => !interactive(element)).length,
      submit: elements.filter((element) => element.effect === 'submit').length,
      approve: elements.filter((element) => element.effect === 'approve').length,
    },
    entries: kept.map((element) => ({
      id: element.id,
      ...(element.role === undefined ? {} : { role: element.role }),
      ...(element.label === undefined ? {} : { label: truncateText(element.label, 40) }),
      ...(!withValues || element.value === undefined
        ? {}
        : { value: truncateText(element.value, 60) }),
      ...(!withValues || !element.options?.length ? {} : { options: element.options.slice(0, 20) }),
      ...(element.editable === true ? { editable: true } : {}),
      ...(element.actions?.length ? { actions: element.actions } : {}),
      ...(element.effect === undefined ? {} : { effect: element.effect }),
    })),
    omitted: ordered.length - kept.length,
    note:
      (tokens.length > 0
        ? `已按 focus「${tokens.join(' ')}」收窄目录`
        : '只回了目录，没有下发任何操作') +
      (withValues
        ? '；含当前值与可选项。'
        : '；默认只给字段索引（id／名称／能不能改），要看当前值或可选项再带 values=true，并尽量配 focus。'),
  };
}

export function pageActionEffect(
  catalog: PageCatalog,
  args: Record<string, unknown>,
): PageElementEffect {
  if (!catalog.elements) return 'draft';
  const byId = new Map(catalog.elements.map((element) => [element.id, element]));
  const targets = [
    ...(typeof args.target === 'string' ? [args.target] : []),
    ...(Array.isArray(args.targets)
      ? (args.targets as unknown[]).filter((value): value is string => typeof value === 'string')
      : []),
  ];
  let effect: PageElementEffect = targets.length ? 'view' : 'draft';
  const visited = new Set<string>();
  for (const id of targets) {
    if (visited.has(id)) continue;
    visited.add(id);
    const element = byId.get(id);
    if (args.kind === 'setValue' && element?.role === 'collection')
      targets.push(...(element.members ?? []));
    const declared = element?.effect ?? 'draft';
    if (declared === 'approve') return 'approve';
    if (declared === 'submit') effect = 'submit';
    else if (declared === 'draft' && effect === 'view') effect = 'draft';
  }
  return effect;
}

export function resolvePageAction(
  catalog: PageCatalog,
  args: Record<string, unknown>,
): string | null {
  if (!catalog.elements) return null;
  const byId = new Map(catalog.elements.map((element) => [element.id, element]));
  const kind = typeof args.kind === 'string' ? args.kind : '';
  if (!(PAGE_ACTION_VERBS as readonly string[]).includes(kind)) return 'INVALID_PAGE_ACTION';
  const one = typeof args.target === 'string' ? args.target : undefined;
  const many = Array.isArray(args.targets)
    ? (args.targets as unknown[]).filter((value): value is string => typeof value === 'string')
    : [];
  const targets = [...(one === undefined ? [] : [one]), ...many];
  if (kind === 'clear') return null;
  if (targets.length === 0) return 'MISSING_TARGET';
  for (const id of targets) {
    const element = byId.get(id);
    if (!element) return 'UNKNOWN_ELEMENT';
    if (kind === 'setValue') {
      if (element.role === 'collection') continue;
      if ((element.role !== 'field' && element.role !== 'control') || element.editable !== true)
        return 'ELEMENT_NOT_EDITABLE';
      continue;
    }
    if (kind === 'invoke') {
      const action = typeof args.action === 'string' ? args.action : '';
      if (!element.actions?.includes(action)) return 'ACTION_NOT_ALLOWED';

      if ((element.effect === 'submit' || element.effect === 'approve') && args.confirm !== true)
        return 'CONFIRMATION_REQUIRED';
      continue;
    }
    if (kind === 'select') {
      if (!element.actions?.includes('select')) return 'ELEMENT_NOT_SELECTABLE';
      continue;
    }
  }
  if (kind === 'setValue' && typeof args.value !== 'string') return 'MISSING_VALUE';
  if (kind === 'invoke' && typeof args.action !== 'string') return 'MISSING_ACTION';
  return null;
}
