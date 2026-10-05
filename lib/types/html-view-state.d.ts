/** UI intent only. Page owners re-check restored object IDs against their current visible data. */
export type HtmlViewPage = 'workbench-html-table' | 'gea-regional-plan' | 'plan-region-category' | 'plan-category-production' | 'inventory-fc' | 'inventory-aqkc';
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
type FcCycleChange = {
    kind: 'set';
    level: string;
    objectId: string;
    cycleDays: number;
    effectiveFrom?: string;
    effectiveTo?: string;
} | {
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
    selDay: number | null;
    selEv: string | null;
    repDim: string;
    rhythm: Rhythm[];
    rhythmEditing?: boolean;
    rhythmDraft?: Rhythm[] | null;
};
export type HtmlViewState = {
    version: 1;
    keyword: string;
    stage: string;
} | RegionalViewState | CategoryViewState | MpsViewState | FcViewState | AqkcViewState;
export declare const isHtmlViewPage: (page: string) => page is HtmlViewPage;
export declare const isBusinessViewPage: (page: string) => boolean;
/** Reject undeclared fields rather than turning a page snapshot into a generic state/authority store. */
export declare function validHtmlViewState(page: string, value: unknown): value is HtmlViewState;
export {};
