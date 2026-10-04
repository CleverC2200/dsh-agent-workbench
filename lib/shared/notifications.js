// src/shared/notifications.ts
function record(value) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("NOTIFICATION_INVALID_RESPONSE");
  return value;
}
function optional(value) {
  if (value === null || value === void 0) return null;
  if (typeof value !== "string")
    throw new Error("NOTIFICATION_INVALID_RESPONSE");
  return value;
}
function count(value) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
    throw new Error("NOTIFICATION_INVALID_RESPONSE");
  return value;
}
function optionalNumber(value) {
  if (value === null || value === void 0) return null;
  return typeof value === "number" && Number.isSafeInteger(value) ? value : null;
}
function optionalBoolean(value) {
  return value === null || value === void 0 ? null : typeof value === "boolean" ? value : null;
}
function notificationDetail(value, expectedId) {
  const row = record(value);
  if (typeof row.id !== "string" || !row.id || expectedId !== void 0 && row.id !== expectedId)
    throw new Error("NOTIFICATION_INVALID_RESPONSE");
  const source = row.source == null ? null : record(row.source);
  return {
    id: row.id,
    interactionRequestId: optional(row.interaction_request_id),
    title: optional(row.title),
    summary: optional(row.summary),
    body: optional(row.content ?? row.body),
    content: optional(row.content ?? row.body),
    state: optional(row.state),
    kind: optional(row.kind),
    eventType: optional(row.event_type),
    businessType: optional(row.business_type),
    notifiedAt: optional(row.notified_at),
    actionType: optional(row.action_type),
    actionText: optional(row.action_text),
    version: optionalNumber(row.version),
    dismissible: optionalBoolean(row.dismissible),
    aggregateId: optional(row.aggregate_id),
    expiresAt: optional(row.expires_at),
    createdAt: optional(row.created_at),
    source: source ? {
      type: optional(source.type),
      ref: optional(source.ref),
      label: optional(source.label)
    } : null,
    target: row.target == null ? null : (() => {
      const target = record(row.target);
      return { type: optional(target.type), value: optional(target.value) };
    })(),
    approval: row.approval == null ? null : (() => {
      const approval = record(row.approval);
      return {
        instanceId: optional(approval.instance_id),
        actions: Array.isArray(approval.actions) && approval.actions.every((item) => typeof item === "string") ? approval.actions : [],
        actionable: optionalBoolean(approval.actionable),
        bizKey: optional(approval.biz_key),
        version: optionalNumber(approval.version)
      };
    })()
  };
}
function notificationPage(value, pageSize) {
  const row = record(value);
  if (!Array.isArray(row.items))
    throw new Error("NOTIFICATION_INVALID_RESPONSE");
  const items = row.items.map((item) => notificationDetail(item));
  const total = count(row.total);
  if (items.length > pageSize || items.length > total || new Set(items.map((item) => item.id)).size !== items.length)
    throw new Error("NOTIFICATION_INVALID_RESPONSE");
  return {
    items,
    total,
    unreadCount: count(row.unread_count),
    pageSize,
    coverage: items.length === total ? "complete" : "partial"
  };
}
export {
  notificationDetail,
  notificationPage
};
