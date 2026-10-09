/** 面向浏览器的 GEA 通知 API 安全投影；此处不会执行任何动作。 */
export interface NotificationItem {
    id: string;
    interactionRequestId: string | null;
    title: string | null;
    summary: string | null;
    body: string | null;
    content: string | null;
    state: string | null;
    kind: string | null;
    eventType: string | null;
    businessType: string | null;
    notifiedAt: string | null;
    actionType: string | null;
    actionText: string | null;
    version: number | null;
    dismissible: boolean | null;
    aggregateId: string | null;
    expiresAt: string | null;
    createdAt: string | null;
    source: {
        type: string | null;
        ref: string | null;
        label: string | null;
    } | null;
    target: {
        type: string | null;
        value: string | null;
    } | null;
    approval: {
        instanceId: string | null;
        actions: string[];
        actionable: boolean | null;
        bizKey: string | null;
        version: number | null;
    } | null;
}
/** 投影返回的通知项；详情身份与请求不一致时拒绝返回。 */
export declare function notificationDetail(value: unknown, expectedId?: string): NotificationItem;
/** 保留服务端总数；遇到重复记录或分页不一致时拒绝隐藏缺失数据。 */
export declare function notificationPage(value: unknown, pageSize: number): {
    items: NotificationItem[];
    total: number;
    unreadCount: number;
    pageSize: number;
    coverage: string;
};
