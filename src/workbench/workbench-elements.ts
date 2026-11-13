import { PAGE_CATALOG_LIMITS, type PageElement } from '../page-bridge/catalog.ts';

export type WorkbenchElementInput = {
  rows: Array<{
    planId: string;
    label: string;
    value: string;
    expanded: boolean;
  }>;
  selectedPlanIds: string[];

  stage: string;
  stageOptions: Array<{ value: string; label: string }>;

  filters: Array<{
    field: string;
    label: string;
    value: string;
    options: Array<{ value: string; label: string }>;
  }>;
  page: number;
  pages: number;

  detail?: { planId: string; label: string };

  fields: Array<{ id: string; label: string; value: string; editable: boolean }>;

  collections: Array<{ id: string; label: string; members: string[] }>;

  actionElements?: Array<{
    id: string;
    label: string;
    value?: string;
    actions: string[];

    effect?: 'submit' | 'approve';
  }>;

  dialog?: {
    label: string;
    actions: string[];
    fields?: Array<{ id: string; label: string; value: string; editable: boolean }>;
  };
};

const optionText = (options: Array<{ value: string; label: string }>) =>
  options.map((option) =>
    option.label && option.label !== option.value
      ? `${option.label}(${option.value})`
      : option.value,
  );

const MAX_OPTIONS = PAGE_CATALOG_LIMITS.maxEnumValues;
const withOptions = (options: Array<{ value: string; label: string }>) => {
  const all = optionText(options);
  const listed = all.slice(0, MAX_OPTIONS);
  return {
    listed,
    truncated: all.length > listed.length ? all.length : 0,
  };
};
const withCount = (label: string, total: number) =>
  `${label}（共 ${total} 项，只列出前 ${MAX_OPTIONS} 项，也可直接填名称或编码）`;

const optionalValue = (value: string | undefined) => {
  const text = (value ?? '').slice(0, 200);
  return text.length === 0 ? {} : { value: text };
};
const text = (value: string, max: number) => value.slice(0, max);

export function buildWorkbenchElements(input: WorkbenchElementInput): PageElement[] {
  const elements: PageElement[] = [];
  for (const row of input.rows) {
    elements.push({
      id: `row:${row.planId}`,
      role: 'row',
      label: text(row.label || row.planId, 200),
      ...optionalValue(row.value),
      actions: [row.expanded ? 'collapse' : 'expand', 'openDetail', 'select'],
    });
  }
  if (input.detail)
    elements.push({
      id: 'detail',
      role: 'control',
      label: text(`详情抽屉（${input.detail.label}）`, 200),
      ...optionalValue(input.detail.planId),
      actions: ['close'],
    });
  const stage = withOptions(input.stageOptions);
  elements.push({
    id: 'stage',
    role: 'control',
    label: '审批阶段',
    ...optionalValue(input.stage),
    ...(stage.listed.length === 0 ? {} : { options: stage.listed }),
    editable: true,
  });
  for (const filter of input.filters) {
    const options = withOptions(filter.options);
    elements.push({
      id: `filter:${filter.field}`,
      role: 'control',
      label:
        options.truncated === 0
          ? text(filter.label || filter.field, 200)
          : text(withCount(filter.label || filter.field, options.truncated), 200),
      ...optionalValue(filter.value),
      ...(options.listed.length === 0 ? {} : { options: options.listed }),
      editable: true,
    });
  }
  elements.push({
    id: 'filters',
    role: 'control',
    label: '筛选',
    actions: ['reset'],
  });
  elements.push({
    id: 'pager',
    role: 'control',
    label: text(`分页（共 ${input.pages} 页）`, 200),
    value: String(input.page),
    editable: true,
  });
  for (const field of input.fields)
    elements.push({
      id: field.id,
      role: 'field',
      label: text(field.label || field.id, 200),
      ...optionalValue(field.value),
      ...(field.editable ? { editable: true } : {}),
    });
  for (const collection of input.collections)
    elements.push({
      id: collection.id,
      role: 'collection',
      label: text(collection.label || collection.id, 200),
      members: collection.members,
    });
  for (const action of input.actionElements ?? [])
    elements.push({
      id: action.id,
      role: 'control',
      label: text(action.label || action.id, 200),
      ...optionalValue(action.value),
      actions: action.actions,
      ...(action.effect === undefined ? {} : { effect: action.effect }),
    });
  if (input.dialog) {
    elements.push({
      id: 'dialog:approval',
      role: 'control',
      label: text(input.dialog.label || '审批对话框', 200),
      ...(input.dialog.actions.length === 0 ? {} : { actions: input.dialog.actions }),
    });
    for (const field of input.dialog.fields ?? [])
      elements.push({
        id: field.id,
        role: 'field',
        label: text(field.label || field.id, 200),
        ...optionalValue(field.value),
        ...(field.editable ? { editable: true } : {}),
      });
  }

  if (elements.length <= PAGE_CATALOG_LIMITS.maxElements) return elements;
  const keep = new Set<string>();
  for (const element of elements)
    if (element.role === 'control' || element.role === 'row') keep.add(element.id);
  for (const element of elements)
    if (
      keep.size < PAGE_CATALOG_LIMITS.maxElements &&
      (element.role === 'collection' || element.role === 'field')
    )
      keep.add(element.id);
  return elements
    .filter((element) => keep.has(element.id))
    .slice(0, PAGE_CATALOG_LIMITS.maxElements);
}
