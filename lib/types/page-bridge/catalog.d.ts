/**
 * 页面能力目录：页面自己声明"这一屏能做什么"，桥据此生成给模型看的工具。
 *
 * 这是通用层：不出现任何具体页面/业务的名字。业务只提供一句句动作说明和参数形状，
 * 工具名、`kind` 枚举、参数表、说明文字全部由这里生成，避免每加一个页面动作
 * 就要去改工具定义和手写说明。
 *
 * 约束（同样与业务无关）：动作数量、命名、说明与参数长度都有上限；
 * 参数只允许标量，避免把复杂结构塞进模型工具。
 */
export type PageActionScalarType = 'string' | 'integer' | 'number' | 'boolean';
export type PageActionScalar = {
    type: PageActionScalarType;
    required?: boolean;
    description?: string;
    enum?: readonly string[];
};
export type PageActionParam = PageActionScalar | {
    type: 'array';
    required?: boolean;
    description?: string;
    items: {
        type: PageActionScalarType;
        description?: string;
    };
} | {
    type: 'object';
    required?: boolean;
    description?: string;
    properties: Record<string, PageActionScalar>;
};
export type PageAction = {
    /** 动作名，会作为工具 `kind` 的枚举值。 */
    name: string;
    /** 一句话说明这个动作做什么，会拼进工具说明。 */
    description: string;
    /**
     * 动作影响面：view 只改"这一屏怎么看"（默认）；data 会改业务数据。
     * 只有宿主明确放开时，data 动作才会被暴露给模型。
     */
    scope?: 'view' | 'data';
    /** 这个动作接受的参数。 */
    params?: Record<string, PageActionParam>;
};
export type PageCatalog = {
    /** 页面标识，宿主用白名单判断"这个页面允不允许被对话改"。 */
    surface: string;
    /** 工具名，例如 `gea_workbench_apply`。 */
    tool: string;
    /** 工具说明的总述，业务自己写"这个工具能改这一屏的什么"。 */
    description: string;
    /** 可解释意图的自由文本字段名（可选），例如 `reason`。 */
    reasonField?: string;
    /**
     * 页面自述的元素（通用写法）：模型只按元素和通用动词操作，
     * 只读元素照样列出来（能读），但不允许被改。
     */
    elements?: PageElement[];
    /** 页面自定义动作目录；不能与 elements 同时声明。 */
    actions?: PageAction[];
};
/** 通用动词：与页面无关，模型只会这四种操作。 */
export declare const PAGE_ACTION_VERBS: readonly ["invoke", "setValue", "select", "clear"];
export type PageActionVerb = (typeof PAGE_ACTION_VERBS)[number];
export type PageElementRole = 'row' | 'field' | 'control' | 'collection';
/**
 * 元素的影响等级：view 只改UI视图；draft 修改页面草稿（默认）；submit / approve 会提交或审批，
 * 必须由用户明确要求、且页面当前可点时才允许。
 */
export declare const PAGE_ELEMENT_EFFECTS: readonly ["view", "draft", "submit", "approve"];
export type PageElementEffect = (typeof PAGE_ELEMENT_EFFECTS)[number];
/**
 * 页面上的一个元素。页面只声明"渲染出来、人能看见/能操作"的东西；
 * 后台状态、内部缓存、接口凭据不属于元素，不在这里出现。
 */
export type PageElement = {
    /** 稳定 id，模型下指令时引用它。 */
    id: string;
    role: PageElementRole;
    /** 人能看到的文案，模型靠它对齐用户的话。 */
    label: string;
    /** 当前值（只读元素也带，供模型读）。 */
    value?: string;
    /** 可选值（下拉/切换类控件）。 */
    options?: readonly string[];
    /** 该元素支持的操作名，invoke 只能从这里选。 */
    actions?: readonly string[];
    /** 只有 field 且 editable=true 才允许 setValue。 */
    editable?: boolean;
    /** collection 的成员元素 id（用于"这一列的字段一起改"）。 */
    members?: readonly string[];
    /** 这个元素操作下去的后果等级，缺省按草稿处理。 */
    effect?: PageElementEffect;
};
export declare const PAGE_CATALOG_LIMITS: {
    readonly maxActions: 24;
    readonly maxElements: 300;
    readonly maxParamsPerAction: 12;
    readonly maxNameLength: 48;
    readonly maxDescriptionLength: 200;
    /**
     * 说明长度上限。真实页面会有几十个元素（20 行 + 筛选 + 展开行的字段），
     * 上限太小会让工具直接注册不上（页面就"不可用"）。这里给足余量，
     * 超长时由 compileElementCatalog 截断说明，绝不因为长度把工具弄没。
     */
    readonly maxToolDescriptionLength: 20000;
    /** 说明里最多逐条列出多少个"实例元素"（行/字段/集合）。 */
    readonly maxListedElements: 120;
    readonly maxEnumValues: 24;
};
/** 校验页面自述的能力目录；页面上报的内容一律按不可信数据处理。 */
export declare function validatePageCatalog(value: unknown): PageCatalog;
/**
 * 把目录编译成"给模型看的工具说明 + 参数表"。
 * `kind` 是动作名；其余参数按目录并集生成，出现在多个动作里就注明归属。
 */
export declare function compilePageCatalog(catalog: PageCatalog): {
    description: string;
    parameters: Array<{
        name: string;
    } & PageActionParam>;
};
/**
 * 元素目录：只读、按需、可收窄。
 *
 * 目录只在 `directory=true` 时返回，可按 focus 收窄并受预算上限约束，
 * 避免每次模型请求都重复携带整页元素。
 */
export declare function elementDirectory(catalog: PageCatalog, options?: {
    focus?: string;
    limit?: number;
    values?: boolean;
}): {
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
};
/** 取一次调用涉及到的最高影响等级（没有元素信息时按 draft）。 */
export declare function pageActionEffect(catalog: PageCatalog, args: Record<string, unknown>): PageElementEffect;
/**
 * 宿主侧硬校验：只读元素不能被改，后台元素根本不存在。
 * 返回 null 表示允许，否则返回拒绝原因码。
 */
export declare function resolvePageAction(catalog: PageCatalog, args: Record<string, unknown>): string | null;
