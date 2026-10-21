/** UI intent only. Page owners re-check restored object IDs against their current visible data. */
export type HtmlViewPage =
  | 'workbench-html-table'
  | 'gea-regional-plan'
  | 'plan-region-category'
  | 'plan-category-production'
  | 'inventory-qll'
  | 'inventory-fc'
  | 'inventory-aqkc'
  | 'inventory-dealer'
  | 'inventory-customer'
  | 'inventory-orderworkbench'
  | 'inventory-orderfulfillment'
  | 'inventory-personal'
  | 'inventory-apsplan'
  | 'inventory-dms';
type Rhythm = {
  id: string;
  type: string;
  from: number | null;
  to: number | null;
  perWeek: number | null;
  win: string;
  kind: string;
  short: string;
  name: string;
};
type Entry<T> = {
  key: string;
  value: T;
};
type FcFilters = {
  search: string;
  businessOnly: boolean;
  urgentOnly: boolean;
  riskOnly: boolean;
  ageFilters: string[];
  orderStatusV2: string;
};
/** Versioned transport projections of the existing Repository records, excluding applied/action facts. */
type FcDraft = {
  quantities: Record<string, number>;
  reasons: Record<string, string>;
  dirty: boolean;
};
type FcPlan = {
  fileName: string;
  rows: Record<string, string | number>[];
  importedAt: string;
};
type FcCycle = {
  sku: string;
  materialGroup: string;
  category: string;
  warehouse: string;
  default: string;
  effectiveFrom: string;
  effectiveTo: string;
  reason: string;
  temporary: boolean;
};
type FcPreferences = {
  aiOpen: boolean;
  frozenColumns: string[];
  columnOrder: string[];
};
type FcCycleChange =
  | {
      kind: 'set';
      level: string;
      objectId: string;
      cycleDays: number;
      effectiveFrom?: string;
      effectiveTo?: string;
    }
  | {
      kind: 'remove';
      level: string;
      objectId: string;
    };
type FcCycleEdit = {
  level: string;
  object: string;
  days: string;
  from: string;
  to: string;
  overrides: FcCycleChange[];
};
export type FcViewState = {
  version: 1;
  filters: Entry<FcFilters>[];
  drafts: Entry<FcDraft>[];
  plans: Entry<FcPlan>[];
  cycles: Entry<FcCycle>[];
  preferences: Entry<FcPreferences>[];
  cycleEdits?: Entry<FcCycleEdit>[];
};
export type AqkcViewState = {
  version: 1;
  activeBoardTab?: string;
  pathSelection?: string[] | null;
  expandedBaseId?: string | null;
  expandedCategoryId?: string | null;
  expandedSkuId?: string | null;
  skuExpanded?: boolean;
  detailTab?: string;
};
export type MpsViewState = {
  version: 1;
  tab?: string;
  preview?: string | null;
  pullType?: string;
  months?: string[];
  shipPeriod?: string;
  weights?: {
    report: number;
    growth: number;
    ship: number;
  };
  demandEdits?: Record<string, number>;
  masterOpen?: boolean;
  masterTab?: number;
  masterBlanks?: boolean;
  masterSearch?: string;
  masterSelected?: string | null;
  masterSkus?: {
    id: string;
    code: string;
    name: string;
    net: number;
    base: string;
    shop: string;
    lineId: string;
  }[];
  masterLines?: {
    id: string;
    base: string;
    center: string;
    shop: string;
    tunnel: string;
    ton: number;
    series: string;
    dayPcs: number;
  }[];
  masterTransfers?: {
    id: string;
    from: string;
    to: string;
    code: string;
    name: string;
  }[];
  plansOpen?: boolean;
  shipBase?: string;
  shipRemaining?: Record<string, number>;
  avatar?: {
    style: string;
    outfit: string;
    mood: string;
    scene: string;
    color: string;
  };
  voice?: {
    tone: string;
    rate: number;
    pitch: number;
  };
  persona?: {
    name: string;
    address: string;
    tone: string;
    greeting: string;
  };
  studioOpen?: boolean;
  studioTab?: string;
  assistantDraft?: string;
};
export type CategoryViewState = {
  version: 1;
  category?: string | null;
  view?: string;
  draft?: string;
  eventStatus?: string;
  drill?: string | null;
  eventId?: string | null;
  suggestionId?: string | null;
  taskId?: string | null;
  detail?: string | null;
};
export type RegionalViewState = {
  version: 1;
  date: string;
  module?: string;
  selDay: number | null;
  selEv: string | null;
  repDim: string;
  rhythm: Rhythm[];
  rhythmEditing?: boolean;
  rhythmDraft?: Rhythm[] | null;
};
export type CustomerViewState = {
  version: 1;
  role?: string;
  path?: string[];
  metric?: string;
  tab?: string;
  status?: string;
  region?: string;
  search?: string;
  page?: number;
  assistant?: boolean;
};
export type OrderWorkbenchViewState = {
  version: 1;
  mode?: string;
  month?: string;
  week?: string;
  weekInitialized?: boolean;
  event?: string;
  task?: string;
};
export type FulfillmentViewState = {
  version: 1;
  fulfillmentBaseFilter?: string;
  deliveryOrgFilter?: string;
  deliveryChannelFilter?: string;
  warehouseProviderFilter?: string;
  deliveryOrderNumberQuery?: string;
  deliveryCustomerQuery?: string;
  deliveryRegionQuery?: string;
  deliveryBaseQuery?: string;
  deliveryStatusQuery?: string;
  dimension?: 'deliveryDimensionPanel' | 'warehouseDimensionPanel' | 'itemDimensionPanel';
  order?: string;
  customer?: string;
  warehouse?: string;
  status?: string;
  page?: number;
  size?: number;
};
export type DealerViewState = {
  version: 1;
  customer?: string;
  tab?: string;
  page?: number;
  pageSize?: number;
  search?: string;
  catalogSearch?: string;
  catalogFilters?: { search: string; category: string; productTag: string };
  stockCategory?: string;
  stockAction?: string;
  orderPanel?: string;
  view?: string;
  cart?: Record<
    string,
    {
      key: string;
      customerCode: string;
      code: string;
      name: string;
      quantity: number;
      suggestedQuantity: number | null;
      reason: string;
      evidence?: string;
      source: 'manual' | 'suggestion';
      status: 'local-only';
      selectedAt: string;
      unitPrice?: number | null;
      category?: string;
      policyId?: string;
    }
  >;
  orderHeaders?: Record<string, { car: string; pickup: string; receive: string }>;
};
export type QllViewState = {
  version: 1;
  asOf?: string;
  scope?: 'company' | 'all-channel';
  month?: string;
  tab?: string;
  sku?: string;
  risk?: string;
  structureFilters?: { category: string; org: string };
};
export type PersonalViewState = {
  version: 1;
  selected?: string;
  riskType?: string;
  page?: number;
  size?: number;
  feedbackNotes?: Record<string, string>;
};
export type ApsViewState = {
  version: 1;
  matrixMode?: string;
  selectedBase?: string;
  baseTab?: string;
  search?: string;
  selectedYearKey?: string;
  selectedMonthKey?: string;
  selectedWeekKey?: string;
  activeWorkspace?: string;
  analysisScope?: string;
  productionDimension?: string;
  salesMetricTab?: string;
  selectedSalesOrg?: string;
  selectedMetric?: string | null;
  categoryTab?: string;
  selectedCategory?: string;
  selectedCategoryRowKey?: string;
  selectedBaseRowKey?: string;
  selectedDay?: number;
  timeGranularity?: 'year' | 'month' | 'week' | 'day';
  sidebarCollapsed?: boolean;
  chatWidth?: number;
};
export type DmsViewState = {
  version: 1;
  type?: 'Y' | 'XN' | 'DC' | 'FC' | 'JD' | 'TM';
  order?: 'M' | 'Z';
  outcome?: 'success' | 'failure' | 'timeout-before' | 'lost-receipt' | 'partial';
};
export type HtmlViewState =
  | {
      version: 1;
      keyword: string;
      stage: string;
    }
  | QllViewState
  | RegionalViewState
  | CategoryViewState
  | MpsViewState
  | FcViewState
  | AqkcViewState
  | CustomerViewState
  | OrderWorkbenchViewState
  | FulfillmentViewState
  | DealerViewState
  | PersonalViewState
  | ApsViewState
  | DmsViewState;
const pages = new Set<string>([
  'workbench-html-table',
  'gea-regional-plan',
  'plan-region-category',
  'plan-category-production',
  'inventory-qll',
  'inventory-fc',
  'inventory-aqkc',
  'inventory-dealer',
  'inventory-customer',
  'inventory-orderworkbench',
  'inventory-orderfulfillment',
  'inventory-personal',
  'inventory-apsplan',
  'inventory-dms',
]);
export const isHtmlViewPage = (page: string): page is HtmlViewPage => pages.has(page);
export const isBusinessViewPage = (page: string): boolean =>
  [
    'gea-regional-plan',
    'plan-region-category',
    'plan-category-production',
    'inventory-qll',
    'inventory-fc',
    'inventory-aqkc',
    'inventory-dealer',
    'inventory-customer',
    'inventory-orderworkbench',
    'inventory-orderfulfillment',
    'inventory-personal',
    'inventory-apsplan',
    'inventory-dms',
  ].includes(page);
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === 'string' && v.length <= 10000;
const number = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const positiveInteger = (v: unknown) => Number.isSafeInteger(v) && (v as number) > 0;
const boolean = (v: unknown): v is boolean => typeof v === 'boolean';
const nullable = (test: (v: unknown) => boolean) => (v: unknown) => v === null || test(v);
const array = (test: (v: unknown) => boolean) => (v: unknown) =>
  Array.isArray(v) && v.length <= 5000 && v.every(test);
const record = (test: (v: unknown) => boolean) => (v: unknown) =>
  object(v) &&
  Object.keys(v).length <= 5000 &&
  Object.entries(v).every(
    ([key, value]) =>
      text(key) && !['__proto__', 'constructor', 'prototype'].includes(key) && test(value),
  );
const strings = array(text);
type Fields = Record<string, (v: unknown) => boolean>;
function shape(value: unknown, fields: Fields, required = Object.keys(fields)): boolean {
  return (
    object(value) &&
    required.every((key) => Object.hasOwn(value, key)) &&
    Object.keys(value).every((key) => Object.hasOwn(fields, key) && fields[key](value[key]))
  );
}
const version = (v: unknown) => v === 1;
const filters = (v: unknown) =>
  shape(v, {
    search: text,
    businessOnly: boolean,
    urgentOnly: boolean,
    riskOnly: boolean,
    ageFilters: strings,
    orderStatusV2: text,
  });
const draft = (v: unknown) =>
  shape(v, { quantities: record(number), reasons: record(text), dirty: boolean });
const plan = (v: unknown) =>
  shape(v, { fileName: text, rows: array(record((v) => text(v) || number(v))), importedAt: text });
const cycle = (v: unknown) =>
  shape(v, {
    sku: text,
    materialGroup: text,
    category: text,
    warehouse: text,
    default: text,
    effectiveFrom: text,
    effectiveTo: text,
    reason: text,
    temporary: boolean,
  });
const preferences = (v: unknown) =>
  shape(v, { aiOpen: boolean, frozenColumns: strings, columnOrder: strings });
const cycleLevel = (v: unknown) =>
  ['warehouse', 'category', 'material-group', 'sku'].includes(v as string);
const cycleOverride = (v: unknown) =>
  object(v) &&
  (v.kind === 'remove'
    ? shape(v, { kind: (kind) => kind === 'remove', level: cycleLevel, objectId: text })
    : shape(
        v,
        {
          kind: (kind) => kind === 'set',
          level: cycleLevel,
          objectId: text,
          cycleDays: number,
          effectiveFrom: text,
          effectiveTo: text,
        },
        ['kind', 'level', 'objectId', 'cycleDays'],
      ));
const cycleEdit = (v: unknown) =>
  shape(v, {
    level: cycleLevel,
    object: text,
    days: text,
    from: text,
    to: text,
    overrides: array(cycleOverride),
  });
const entries = (kind: string, check: (v: unknown) => boolean) => (v: unknown) =>
  array((row) =>
    shape(row, {
      key: (key) => text(key) && new RegExp(`^branch-inventory:v[12]:${kind}:`).test(key),
      value: check,
    }),
  )(v);
const rhythm = (v: unknown) =>
  shape(v, {
    id: text,
    type: text,
    from: nullable(number),
    to: nullable(number),
    perWeek: nullable(number),
    win: text,
    kind: text,
    short: text,
    name: text,
  });
const avatar = (v: unknown) =>
  shape(v, { style: text, outfit: text, mood: text, scene: text, color: text });
const voice = (v: unknown) => shape(v, { tone: text, rate: number, pitch: number });
const persona = (v: unknown) => shape(v, { name: text, address: text, tone: text, greeting: text });
const sku = (v: unknown) =>
  shape(v, { id: text, code: text, name: text, net: number, base: text, shop: text, lineId: text });
const line = (v: unknown) =>
  shape(v, {
    id: text,
    base: text,
    center: text,
    shop: text,
    tunnel: text,
    ton: number,
    series: text,
    dayPcs: number,
  });
const transfer = (v: unknown) =>
  shape(v, { id: text, from: text, to: text, code: text, name: text });
/** Reject undeclared fields rather than turning a page snapshot into a generic state/authority store. */
export function validHtmlViewState(page: string, value: unknown): value is HtmlViewState {
  if (!isHtmlViewPage(page) || !object(value) || value.version !== 1) return false;
  switch (page) {
    case 'inventory-apsplan':
      return shape(
        value,
        {
          version,
          matrixMode: text,
          selectedBase: text,
          baseTab: text,
          search: text,
          selectedYearKey: (v) => text(v) && /^20\d{2}$/.test(v as string),
          selectedMonthKey: (v) => text(v) && /^(0[1-9]|1[0-2])$/.test(v as string),
          selectedWeekKey: text,
          activeWorkspace: text,
          analysisScope: text,
          productionDimension: text,
          salesMetricTab: text,
          selectedSalesOrg: text,
          selectedMetric: nullable(text),
          categoryTab: text,
          selectedCategory: text,
          selectedCategoryRowKey: text,
          selectedBaseRowKey: text,
          selectedDay: (v) => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 31,
          timeGranularity: (v) => ['year', 'month', 'week', 'day'].includes(v as string),
          sidebarCollapsed: boolean,
          chatWidth: (v) => number(v) && v >= 240 && v <= 1000,
        },
        ['version'],
      );
    case 'inventory-dms':
      return shape(
        value,
        {
          version,
          type: (v) => ['Y', 'XN', 'DC', 'FC', 'JD', 'TM'].includes(v as string),
          order: (v) => ['M', 'Z'].includes(v as string),
          outcome: (v) =>
            ['success', 'failure', 'timeout-before', 'lost-receipt', 'partial'].includes(
              v as string,
            ),
        },
        ['version'],
      );
    case 'inventory-dealer':
      return shape(
        value,
        {
          version,
          customer: text,
          tab: text,
          page: positiveInteger,
          pageSize: positiveInteger,
          search: text,
          catalogSearch: text,
          catalogFilters: (v) => shape(v, { search: text, category: text, productTag: text }),
          stockCategory: text,
          stockAction: text,
          orderPanel: text,
          view: text,
          cart: record((v) =>
            shape(
              v,
              {
                key: text,
                customerCode: text,
                code: text,
                name: text,
                quantity: number,
                suggestedQuantity: nullable(number),
                reason: text,
                evidence: text,
                source: (v) => ['manual', 'suggestion'].includes(v as string),
                status: (v) => v === 'local-only',
                selectedAt: text,
                unitPrice: nullable(number),
                category: text,
                policyId: text,
              },
              [
                'key',
                'customerCode',
                'code',
                'name',
                'quantity',
                'suggestedQuantity',
                'reason',
                'source',
                'status',
                'selectedAt',
              ],
            ),
          ),
          orderHeaders: record((v) => shape(v, { car: text, pickup: text, receive: text })),
        },
        ['version'],
      );
    case 'inventory-personal':
      return shape(
        value,
        {
          version,
          selected: text,
          riskType: (v) =>
            ['全部', '缺货', '低库存', '货龄', '大日期', '滞库'].includes(v as string),
          page: positiveInteger,
          size: (v) => [10, 20, 50].includes(v as number),
          feedbackNotes: record(text),
        },
        ['version'],
      );
    case 'inventory-qll':
      return shape(
        value,
        {
          version,
          asOf: (v) => text(v) && (v === '' || /^20\d{2}-\d{2}-\d{2}$/.test(v as string)),
          scope: (v) => ['company', 'all-channel'].includes(v as string),
          month: (v) => text(v) && /^20\d{2}-(0[1-9]|1[0-2])$/.test(v as string),
          tab: text,
          sku: text,
          risk: text,
          structureFilters: (v) => shape(v, { category: text, org: text }),
        },
        ['version'],
      );
    case 'inventory-customer':
      return shape(
        value,
        {
          version,
          role: text,
          path: strings,
          metric: text,
          tab: text,
          status: text,
          region: text,
          search: text,
          page: positiveInteger,
          assistant: boolean,
        },
        ['version'],
      );
    case 'inventory-orderworkbench':
      return shape(
        value,
        {
          version,
          mode: (v) => ['month', 'week'].includes(v as string),
          month: text,
          week: text,
          weekInitialized: boolean,
          event: (v) => ['focus', 'all'].includes(v as string),
          task: (v) => ['all', 'pending', 'done'].includes(v as string),
        },
        ['version'],
      );
    case 'inventory-orderfulfillment':
      return shape(
        value,
        {
          version,
          fulfillmentBaseFilter: text,
          deliveryOrgFilter: text,
          deliveryChannelFilter: text,
          warehouseProviderFilter: text,
          deliveryOrderNumberQuery: text,
          deliveryCustomerQuery: text,
          deliveryRegionQuery: text,
          deliveryBaseQuery: text,
          deliveryStatusQuery: text,
          dimension: (v) =>
            v === 'deliveryDimensionPanel' ||
            v === 'warehouseDimensionPanel' ||
            v === 'itemDimensionPanel',
          order: text,
          customer: text,
          warehouse: text,
          status: text,
          page: positiveInteger,
          size: (v) => [10, 20, 50].includes(v as number),
        },
        ['version'],
      );
    case 'workbench-html-table':
      return shape(value, { version, keyword: text, stage: text });
    case 'gea-regional-plan':
      return shape(
        value,
        {
          version,
          date: text,
          module: (v) =>
            ['overview', 'follow', 'category', 'review', 'analysis'].includes(v as string),
          selDay: nullable(number),
          selEv: nullable(text),
          repDim: text,
          rhythm: array(rhythm),
          rhythmEditing: boolean,
          rhythmDraft: nullable(array(rhythm)),
        },
        ['version', 'date', 'selDay', 'selEv', 'repDim', 'rhythm'],
      );
    case 'plan-region-category':
      return shape(
        value,
        {
          version,
          category: nullable(text),
          view: text,
          draft: text,
          eventStatus: text,
          drill: nullable(text),
          eventId: nullable(text),
          suggestionId: nullable(text),
          taskId: nullable(text),
          detail: nullable(text),
        },
        ['version'],
      );
    case 'plan-category-production':
      return shape(
        value,
        {
          version,
          tab: text,
          preview: nullable(text),
          pullType: text,
          months: strings,
          shipPeriod: text,
          weights: (v) => shape(v, { report: number, growth: number, ship: number }),
          demandEdits: record(number),
          masterOpen: boolean,
          masterTab: number,
          masterBlanks: boolean,
          masterSearch: text,
          masterSelected: nullable(text),
          masterSkus: array(sku),
          masterLines: array(line),
          masterTransfers: array(transfer),
          plansOpen: boolean,
          shipBase: text,
          shipRemaining: record(number),
          avatar,
          voice,
          persona,
          studioOpen: boolean,
          studioTab: text,
          assistantDraft: text,
        },
        ['version'],
      );
    case 'inventory-fc':
      return shape(
        value,
        {
          version,
          filters: entries('filters', filters),
          drafts: entries('order-draft', draft),
          plans: entries('plan-draft', plan),
          cycles: entries('cycle-preview', cycle),
          preferences: entries('preferences', preferences),
          cycleEdits: entries('cycle-edit', cycleEdit),
        },
        ['version', 'filters', 'drafts', 'plans', 'cycles', 'preferences'],
      );
    case 'inventory-aqkc':
      return shape(
        value,
        {
          version,
          activeBoardTab: text,
          pathSelection: nullable(strings),
          expandedBaseId: nullable(text),
          expandedCategoryId: nullable(text),
          expandedSkuId: nullable(text),
          skuExpanded: boolean,
          detailTab: text,
        },
        ['version'],
      );
  }
}
