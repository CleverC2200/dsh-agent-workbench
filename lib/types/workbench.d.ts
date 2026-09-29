/**
 * Page registration and instance-to-session navigation, independent of React.
 *
 * 中文：本文件是 Agent 工作台的业务导航核心，不依赖 React。它负责登记业务页面、
 * 把“页面 + 业务实例”稳定映射到 DSH Session，并处理会话复用、并发创建、持久化和
 * 导航失效；UI 适配层只需通过 WorkbenchPorts 提供宿主能力。
 */
import type { MainPanelId } from "@deepseek-ai/dsh-client-ui-layout/client";
import type { SessionId } from "@deepseek-ai/dsh-session/types";
/** One page's session preset; page components remain ordinary DSH main entries. 中文：描述一个工作台页面及其新建 Session 时使用的预设；页面组件本身仍是普通的 DSH 主面板入口。 */
export interface WorkbenchPage {
    /** 中文：页面在主面板槽位中的唯一标识，也是工作台关联表的一级键。 */
    readonly id: MainPanelId;
    /** 中文：首次为业务实例创建 Session 时传给宿主的 Agent 预设名。 */
    readonly preset: string;
    /** Other installed presets explicitly allowed to interpret this page. */
    readonly allowedPresets?: readonly string[];
}
/** Dependencies supplied by the DSH layout adapter. 中文：工作台访问 DSH 宿主能力的端口，便于让业务控制器与具体 UI/框架解耦。 */
export interface WorkbenchPorts {
    /** 中文：可选的浏览器存储；不可用时关联关系仅在当前内存生命周期内有效。 */
    storage?: Pick<Storage, "getItem" | "setItem">;
    /** 中文：按页面预设创建持久 Session，返回宿主生成的 SessionId。 */
    create(preset: string): Promise<SessionId>;
    /** 中文：确保目标 Session 已加载到可被选择和展示的状态。 */
    prepare(id: SessionId): Promise<void>;
    /** 中文：判断本地 Session 列表中是否仍存在该 Session。 */
    available(id: SessionId): boolean;
    /** Current durable preset, including a blank Session's later preset selection. */
    presetOf?(id: SessionId): string | undefined;
    /** 中文：切换原生会话选择；undefined 表示当前没有可复用会话。 */
    select(id: SessionId | undefined): void;
    /** 中文：切换全局主面板；null 表示回到原生 Conversation。 */
    panel(id: MainPanelId | null): void;
    /** 中文：开始一次新导航并使更早导航失效，返回本次导航的取消信号。 */
    beginNavigation(): AbortSignal;
    /** 中文：让指定页面挂载原生 Conversation 列，返回撤销该挂载的函数。 */
    showConversation(id: MainPanelId): () => void;
}
/** Public workbench operations. Opening never changes an existing Session's preset. 中文：供业务插件调用的工作台接口；打开已有 Session 时不会修改它原先的预设。 */
export interface AgentWorkbench {
    /** 中文：登记页面并返回反注册函数。 */
    register(page: WorkbenchPage): () => void;
    /** 中文：打开页面的某个业务实例，可选择显式绑定宿主已创建的 Session。 */
    open(id: MainPanelId, instance?: string, sessionId?: SessionId, preset?: string): Promise<void>;
    /** 中文：把原生 Conversation 列加入指定页面，返回清理函数。 */
    showConversation(id: MainPanelId): () => void;
    /** 中文：忘记页面的本地实例关联，但不删除真实 Session。 */
    forget(id: MainPanelId): void;
}
/** Owns one selected instance per page and coalesces creation per instance. 中文：控制每个页面当前选中的业务实例，并将同一实例的并发创建请求合并为一个 Promise。 */
export declare class WorkbenchController implements AgentWorkbench {
    private readonly ports;
    /** 中文：当前仍有效的页面定义；页面卸载后会移除。 */
    private readonly pages;
    /** 中文：pageId -> instance -> SessionId 的本地关联表。 */
    private readonly sessions;
    /** 中文：记录每个页面最后一次选中的实例，用于再次进入页面时恢复。 */
    private readonly instances;
    /** 中文：尚未完成的 Session 创建任务，用于合并同页面同实例的重复打开。 */
    private readonly pending;
    /** 中文：控制器是否已销毁；销毁后不再接受页面或导航结果。 */
    private disposed;
    /**
     * 中文：创建控制器并从浏览器存储恢复“页面—实例—Session”关联。
     * 恢复时只接受结构和 SessionId 格式都合法的数据，避免损坏的本地缓存影响真实 Session。
     */
    constructor(ports: WorkbenchPorts);
    /** 中文：把当前关联表和每页选中实例写入浏览器存储；存储失败不影响本次内存态业务。 */
    private save;
    /** Register after the page's main slot; the disposer forgets its associations. 中文：应在页面主槽位就绪后登记；返回的清理函数会取消待处理创建并清除该页本地关联。 */
    register(page: WorkbenchPage): () => void;
    private permitsPreset;
    /** Called by the layout on every panel selection, including native navigation. 中文：布局每次切换主面板时调用；若目标是已登记工作台页面，则恢复该页当前实例对应且仍存在的 Session。 */
    selectPanel(id: MainPanelId | null): void;
    /**
     * Create/reuse an instance Session, or explicitly associate a host-created Session.
     * 中文：打开一个“页面 + 实例”。优先采用显式 sessionId，其次复用已绑定 Session，最后按页面预设新建；
     * 同一实例的并发创建会共用一个任务。只有页面仍存活、关联表未被替换且本次导航未过期时，
     * 才会准备 Session、保存关联并切到目标面板，避免慢请求把用户带回旧页面。
     */
    open(id: MainPanelId, instance?: string, sessionId?: SessionId, preset?: string): Promise<void>;
    /** Opt a mounted page into the native conversation column. 中文：让已登记页面选择展示原生 Conversation 列，并把宿主清理函数原样返回。 */
    showConversation(id: MainPanelId): () => void;
    /** Drop local associations, without deleting or stopping durable Sessions. 中文：只删除页面的本地映射、当前实例和待建任务，不删除也不停止宿主持久 Session。 */
    forget(id: MainPanelId): void;
    /** Invalidate pending navigation without cancelling host-owned Agent work. 中文：销毁控制器并使未完成导航的结果失效；宿主拥有的 Agent 任务仍继续运行。 */
    dispose(): void;
}
