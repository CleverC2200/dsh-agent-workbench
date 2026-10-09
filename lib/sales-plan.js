// src/workbench/original/salesPlanWorkflow.ts
var SALES_PLAN_WORKFLOW_ROWS = Object.entries({
  Y: ["0", "1", "2", "3", "4", "Y"],
  DC: ["0", "2", "3", "4", "Y"],
  FC: ["0", "4", "Y"],
  JD: ["0", "4", "Y"],
  TM: ["0", "4", "Y"],
  XN: ["0", "2", "3", "4", "Y"]
}).flatMap(([typeCode, nodes]) => nodes.map((nodeNum, examineLevel) => ({ typeCode, examineLevel, nodeNum })));
var SALES_PLAN_ROLES = ["customer", "region", "province", "area", "category"];
var SALES_PLAN_RETURN_CODES = {
  customer: 6,
  region: 7,
  province: 8,
  area: 9
};
var NODE_ROLES = {
  "0": "customer",
  "1": "region",
  "2": "province",
  "3": "area",
  "4": "category"
};
var liveWorkflowRows;
function replaceSalesPlanWorkflowRows(rows) {
  liveWorkflowRows = rows.map((row) => ({ ...row }));
}
var salesPlanWorkflow = (typeCode, rows = liveWorkflowRows ?? SALES_PLAN_WORKFLOW_ROWS) => {
  const chain = rows.filter((row) => row.typeCode === typeCode).toSorted((a, b) => a.examineLevel - b.examineLevel);
  const valid = chain.length >= 2 && chain[0].examineLevel === 0 && chain[0].nodeNum === "0" && chain.at(-1)?.nodeNum === "Y" && chain.every(
    (row, index) => Number.isSafeInteger(row.examineLevel) && row.examineLevel >= 0 && (index === 0 || row.examineLevel > chain[index - 1].examineLevel) && Boolean(row.nodeNum) && (row.nodeNum !== "Y" || index === chain.length - 1)
  ) && new Set(chain.map((row) => row.nodeNum)).size === chain.length;
  const roles = chain.slice(0, -1).map((row) => NODE_ROLES[row.nodeNum]);
  const rolesKnown = Boolean(
    valid && roles.every(Boolean) && roles.at(-1) === "category" && roles.every(
      (role, index) => index === 0 || SALES_PLAN_ROLES.indexOf(role) > SALES_PLAN_ROLES.indexOf(roles[index - 1])
    )
  );
  const roleIndex = (role) => rolesKnown ? roles.indexOf(role) : -1;
  const pending = (role) => {
    const index = roleIndex(role);
    return index < 0 ? void 0 : Number(chain[index].nodeNum);
  };
  const actor = (status) => {
    if (!rolesKnown || !Number.isInteger(status) || status === 5 || status === 10) return void 0;
    if (status >= 6 && status <= 9) {
      return roles.find((role, index) => Number(chain[index].nodeNum) + 6 === status);
    }
    return roles?.[chain.findIndex((row) => Number(row.nodeNum) === status && row.nodeNum !== "Y")];
  };
  const nextStatus = (index) => {
    const next = chain[index + 1];
    return next ? next.nodeNum === "Y" ? 5 : Number(next.nodeNum) : void 0;
  };
  const transition = (status, action) => {
    if (!valid) return void 0;
    if (status === 10) return void 0;
    const role = actor(status);
    if (!role || role === "customer") return void 0;
    const index = roleIndex(role);
    if (action === "SAVE") return status;
    if (action === "REJECT") {
      const previous = chain[index - 1]?.nodeNum;
      return previous && /^\d+$/.test(previous) ? Number(previous) + 6 : void 0;
    }
    return nextStatus(index);
  };
  const pendingStatuses = (role) => {
    const status = pending(role);
    if (status === void 0) return [];
    const returned = role === "category" ? void 0 : status + 6;
    return returned === void 0 ? [status] : [status, returned];
  };
  const queueStatuses = (role) => role === "category" ? [...pendingStatuses(role), 5, 10] : pendingStatuses(role);
  const visibility = (status, role) => {
    if (!rolesKnown || pending(role) === void 0) return "denied";
    if (pendingStatuses(role).includes(status)) return "writable";
    if (status === 5 || status === 10) return "read-only";
    const index = roleIndex(role);
    if (status >= 6) {
      return index > 0 && Number(chain[index - 1].nodeNum) + 6 === status ? "read-only" : "denied";
    }
    const active = actor(status);
    return active && roleIndex(active) > index ? "read-only" : "denied";
  };
  return {
    valid,
    rolesKnown,
    chain,
    actor,
    pending,
    pendingStatuses,
    queueStatuses,
    transition,
    visibility,
    confirmationRoles: (status) => {
      const role = status === 10 && rolesKnown ? "category" : actor(status);
      return role && rolesKnown ? roles.slice(0, roleIndex(role) + 1).toReversed() : [];
    },
    statusLabelCode: (status) => {
      if (status === 0 || status === 5 || status >= 6 && status <= 10) return status;
      if (!rolesKnown) return void 0;
      return actor(status) ? status : void 0;
    },
    /** 原始 DMS 节点保持不透明；即使未提供角色名称也可安全使用。 */
    nextNode: (nodeNum) => {
      const index = chain.findIndex((row) => row.nodeNum === nodeNum);
      return valid && index >= 0 ? chain[index + 1]?.nodeNum : void 0;
    },
    resubmit: (status) => {
      const role = actor(status);
      return status >= 6 && status <= 9 && role ? nextStatus(roleIndex(role)) : void 0;
    }
  };
};

// src/workbench/original/workbenches/regionalApproval/regionalApprovalQueryModel.ts
var VISIBLE_SALES_PLAN_STATUSES_BY_STAGE = Object.fromEntries(
  SALES_PLAN_ROLES.map((role) => [role, salesPlanWorkflow("Y").pendingStatuses(role)])
);
var DECIMAL_PATTERN = /^(-?)(\d+)(?:\.(\d+))?$/;
var parseDecimal = (value) => {
  const match = value.trim().match(DECIMAL_PATTERN);
  if (!match) return void 0;
  const fraction = match[3] ?? "";
  return {
    negative: match[1] === "-",
    digits: BigInt(`${match[2]}${fraction}`),
    scale: fraction.length
  };
};
var powerOfTen = (scale) => BigInt(`1${"0".repeat(scale)}`);
var addExactDecimals = (values) => {
  const parsed = values.map(parseDecimal);
  if (parsed.some((value) => value === void 0)) return "\u2014";
  const decimals = parsed;
  const scale = Math.max(0, ...decimals.map((value) => value.scale));
  const total = decimals.reduce((sum, value) => {
    const signed = value.negative ? -value.digits : value.digits;
    return sum + signed * powerOfTen(scale - value.scale);
  }, BigInt(0));
  const negative = total < BigInt(0);
  const absolute = negative ? -total : total;
  const raw = absolute.toString().padStart(scale + 1, "0");
  const integer = scale === 0 ? raw : raw.slice(0, -scale);
  const fraction = scale === 0 ? "" : raw.slice(-scale);
  return `${negative ? "-" : ""}${integer}${fraction ? `.${fraction}` : ""}`;
};
var parseExactDecimal = (value) => {
  const match = value.match(/^([+-]?)(\d+)(?:\.(\d+))?$/);
  if (!match) return void 0;
  const fraction = match[3] ?? "";
  const coefficient = BigInt(`${match[2]}${fraction}`) * (match[1] === "-" ? BigInt(-1) : BigInt(1));
  return { coefficient, scale: fraction.length };
};
var multiplyExactDecimals = (left, right, targetScale = 2) => {
  const leftDecimal = parseExactDecimal(left);
  const rightDecimal = parseExactDecimal(right);
  if (!leftDecimal || !rightDecimal) return void 0;
  const product = leftDecimal.coefficient * rightDecimal.coefficient;
  const productScale = leftDecimal.scale + rightDecimal.scale;
  const scaleFactor = BigInt(`1${"0".repeat(Math.max(0, productScale - targetScale))}`);
  const absolute = product < 0 ? -product : product;
  const rounded = productScale > targetScale ? absolute / scaleFactor + (absolute % scaleFactor * BigInt(2) >= scaleFactor ? BigInt(1) : BigInt(0)) : absolute * BigInt(`1${"0".repeat(targetScale - productScale)}`);
  const signed = product < 0 ? -rounded : rounded;
  const negative = signed < 0;
  const raw = (negative ? -signed : signed).toString().padStart(targetScale + 1, "0");
  return `${negative ? "-" : ""}${raw.slice(0, -targetScale)}.${raw.slice(-targetScale)}`;
};

// src/workbench/original/workbenches/regionalApproval/models/salesPlanDetailModel.ts
var salesPlanSkusMatchVersion = (versionId, skus) => skus.every((sku) => sku.versionId === versionId);

// src/workbench/original/http-error.ts
var BackendHttpError = class extends Error {
  status;
  /** 来自后端 `ErrorResponse.code` 的机器可读错误码；解析失败时为 `''`。 */
  code;
  /** 来自 `ErrorResponse.error` 的后端可读消息；解析失败时为原始响应体。 */
  backendMessage;
  /** 存在时，保存来自 `ErrorResponse.details` 的结构化后端元数据。 */
  details;
  /** 解析后的原始响应体（JSON 响应为对象，文本或非 JSON 响应为字符串）。 */
  body;
  constructor(params) {
    const { method, path, status, body } = params;
    let code = "";
    let backendMessage = "";
    let details;
    if (body && typeof body === "object") {
      const b = body;
      if (typeof b.code === "string") code = b.code;
      if (typeof b.error === "string") backendMessage = b.error;
      details = b.details;
    } else if (typeof body === "string") {
      backendMessage = body;
    }
    super(`Backend ${method} ${path} failed (${status}): ${JSON.stringify(body)}`);
    this.name = "BackendHttpError";
    this.status = status;
    this.code = code;
    this.backendMessage = backendMessage;
    this.details = details;
    this.body = body;
  }
};
function isBackendHttpError(error) {
  if (error instanceof BackendHttpError) return true;
  if (error && typeof error === "object" && "name" in error && error.name === "BackendHttpError" && "status" in error && typeof error.status === "number" && "code" in error && typeof error.code === "string") {
    return true;
  }
  return false;
}

// src/workbench/original/workbenches/regionalApproval/models/salesPlanActionModel.ts
var SalesPlanActionError = class extends Error {
  constructor(kind, retrySameIntent, retryAfterMs, options) {
    super(kind, options);
    this.kind = kind;
    this.retrySameIntent = retrySameIntent;
    this.retryAfterMs = retryAfterMs;
    this.name = "SalesPlanActionError";
  }
};
var DECIMAL_PATTERN2 = /^[+-]?(\d+)(?:\.(\d{1,3}))?$/;
var POSITIVE_LONG_PATTERN = /^[1-9]\d*$/;
var MAX_SIGNED_LONG = BigInt("9223372036854775807");
var salesPlanApprovalNodeForStatus = (status, typeCode = "Y", workflowRows) => {
  const role = salesPlanWorkflow(typeCode, workflowRows).actor(status);
  return role && role !== "customer" ? SALES_PLAN_ROLES.indexOf(role) + 1 : void 0;
};
var salesPlanActionTargetStatus = (action, status, typeCode = "Y", workflowRows) => salesPlanWorkflow(typeCode, workflowRows).transition(status, action);
var isValidAdjustment = (adjustment) => {
  const value = adjustment.adjustQty.trim();
  const decimal = value.match(DECIMAL_PATTERN2);
  const skuCode = adjustment.skuCode;
  return Boolean(
    decimal && decimal[1].replace(/^0+/, "").length <= 15 && POSITIVE_LONG_PATTERN.test(skuCode) && BigInt(skuCode) <= MAX_SIGNED_LONG
  );
};
var validateSalesPlanActionInput = (input, workflowRows) => {
  const { request } = input;
  if (!input.planId.trim() || !input.versionId.trim()) throw new SalesPlanActionError("validation", false);
  const flow = salesPlanWorkflow(input.planTypeCode ?? "Y", workflowRows);
  if (![1, 2, 3, 4, 6, 7, 8, 9].includes(request.expectedStatus)) throw new SalesPlanActionError("validation", false);
  if (request.approvalRole && !["region", "province", "area", "category"].includes(request.approvalRole)) throw new SalesPlanActionError("validation", false);
  const approvalNodeOrder = request.approvalRole ? SALES_PLAN_ROLES.indexOf(request.approvalRole) + 1 : salesPlanApprovalNodeForStatus(request.expectedStatus, input.planTypeCode, workflowRows);
  if (request.action === "SAVE" && (!/^[a-f0-9]{64}$/.test(request.expectedSnapshot ?? "") || !request.adjustments?.length && request.adjustmentMode !== "ABSOLUTE_NET")) {
    throw new SalesPlanActionError("validation", false);
  }
  if (approvalNodeOrder === void 0) throw new SalesPlanActionError("validation", false);
  const remark = request.remark?.trim() ?? "";
  if (Array.from(remark).length > 1e3) throw new SalesPlanActionError("validation", false);
  if (request.action === "REJECT" && !remark) throw new SalesPlanActionError("validation", false);
  if (request.approvalRole ? !flow.rolesKnown || request.action === "REJECT" && flow.pending(request.approvalRole) === void 0 : salesPlanActionTargetStatus(request.action, request.expectedStatus, input.planTypeCode, workflowRows) === void 0) {
    throw new SalesPlanActionError("validation", false);
  }
  if (request.action === "REJECT" && request.adjustments?.length) {
    throw new SalesPlanActionError("validation", false);
  }
  if (approvalNodeOrder === 1 && request.adjustments?.length) {
    throw new SalesPlanActionError("validation", false);
  }
  const skuCodes = /* @__PURE__ */ new Set();
  for (const adjustment of request.adjustments ?? []) {
    if (!isValidAdjustment(adjustment) || skuCodes.has(adjustment.skuCode)) {
      throw new SalesPlanActionError("validation", false);
    }
    skuCodes.add(adjustment.skuCode);
  }
};
var retryAfterMsFromDetails = (details) => {
  if (!details || typeof details !== "object") return void 0;
  const value = details.retryAfterMs;
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : void 0;
};
var TECHNICAL_ERROR_PATTERN = /payload\.|GEA_HTTP|[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+|为必填字段|\bnull\b|\bundefined\b|https?:\/\/|[{}<>[\]"]/;
var businessSafeErrorMessage = (message) => {
  if (typeof message !== "string") return void 0;
  const text = message.trim();
  if (!text || text.length > 80 || TECHNICAL_ERROR_PATTERN.test(text)) return void 0;
  return text;
};
var reportSalesPlanError = (scope, detail) => {
  const id = Math.random().toString(36).slice(2, 8).toUpperCase();
  console.warn(`[gea-error] ${scope} \u9519\u8BEF\u7F16\u53F7=${id}`, detail);
  return id;
};
var classifySalesPlanActionError = (error) => {
  if (error instanceof SalesPlanActionError) return error;
  if (isBackendHttpError(error)) {
    if (error.status === 400) return new SalesPlanActionError("validation", false, void 0, { cause: error });
    if (error.status === 401) return new SalesPlanActionError("authentication", false, void 0, { cause: error });
    if (error.status === 403) return new SalesPlanActionError("permission", false, void 0, { cause: error });
    if (error.status === 409) return new SalesPlanActionError("conflict", false, void 0, { cause: error });
    if (error.status === 429) {
      return new SalesPlanActionError("rateLimited", true, retryAfterMsFromDetails(error.details), { cause: error });
    }
    if (error.status >= 500) return new SalesPlanActionError("unavailable", true, void 0, { cause: error });
    return new SalesPlanActionError("failed", false, void 0, { cause: error });
  }
  if (error instanceof TypeError) return new SalesPlanActionError("unavailable", true, void 0, { cause: error });
  return new SalesPlanActionError("failed", false, void 0, { cause: error });
};
var salesPlanActionReceiptMatches = (input, requestId, receipt) => {
  if (receipt.planId !== input.planId || receipt.versionId !== input.versionId || receipt.fromStatus !== input.request.expectedStatus || receipt.requestId !== requestId || !receipt.traceId?.trim() || !receipt.auditId?.trim()) return false;
  const flow = salesPlanWorkflow(input.planTypeCode ?? "Y");
  if (input.serverRoleResult) {
    const role = input.request.approvalRole;
    if (!flow.rolesKnown || !role || receipt.approvalRole !== role) return false;
    if (input.request.action === "SAVE") return receipt.toStatus === receipt.fromStatus;
    if (input.request.action === "REJECT") {
      const pending = flow.pending(role);
      return pending !== void 0 && receipt.toStatus === flow.transition(pending, "REJECT");
    }
    if (receipt.toStatus === 5) {
      return Array.isArray(receipt.approvedRoles) && SALES_PLAN_ROLES.filter((r) => r !== "customer" && flow.pending(r) !== void 0).every((r) => receipt.approvedRoles.includes(r));
    }
    return receipt.toStatus === receipt.fromStatus || [1, 2, 3, 4].includes(receipt.toStatus) && flow.actor(receipt.toStatus) !== void 0;
  }
  return receipt.toStatus === salesPlanActionTargetStatus(input.request.action, input.request.expectedStatus, input.planTypeCode) || input.serverWorkflowResult === true && input.request.action === "APPROVE" && salesPlanActionTargetStatus("APPROVE", input.request.expectedStatus, input.planTypeCode) !== void 0 && receipt.toStatus === input.request.expectedStatus;
};
var normalizedInput = (input) => {
  const { remark, adjustments, ...request } = input.request;
  return {
    planId: input.planId,
    versionId: input.versionId,
    planTypeCode: input.planTypeCode,
    ...input.serverRoleResult ? { serverRoleResult: true } : {},
    ...input.serverWorkflowResult ? { serverWorkflowResult: true } : {},
    request: {
      ...request,
      ...remark?.trim() ? { remark: remark.trim() } : {},
      ...adjustments?.length || request.adjustmentMode === "ABSOLUTE_NET" && request.action !== "REJECT" ? {
        adjustments: (adjustments ?? []).map((adjustment) => ({
          skuCode: adjustment.skuCode,
          adjustQty: adjustment.adjustQty
        }))
      } : {}
    }
  };
};
var SalesPlanActionAttempt = class {
  constructor(client, createId = () => crypto.randomUUID()) {
    this.client = client;
    this.createId = createId;
  }
  // command 一旦生成便不可替换，保证重试携带同一 requestId 和 idempotencyKey。
  command;
  input;
  inFlight;
  receipt;
  failure;
  submit(input) {
    validateSalesPlanActionInput(input);
    if (this.receipt) return Promise.resolve(this.receipt);
    if (this.inFlight) return this.inFlight;
    if (this.command) return Promise.reject(this.failure ?? new SalesPlanActionError("failed", false));
    this.input = normalizedInput(input);
    this.command = {
      planId: this.input.planId,
      versionId: this.input.versionId,
      request: this.input.request,
      idempotencyKey: `gea-sales-plan-action:${this.createId()}`,
      requestId: this.createId()
    };
    return this.invoke();
  }
  retry() {
    if (this.receipt) return Promise.resolve(this.receipt);
    if (this.inFlight) return this.inFlight;
    if (!this.command || !this.failure?.retrySameIntent) {
      return Promise.reject(this.failure ?? new SalesPlanActionError("failed", false));
    }
    return this.invoke();
  }
  invoke() {
    const command = this.command;
    const input = this.input;
    if (!command || !input) return Promise.reject(new SalesPlanActionError("failed", false));
    this.failure = void 0;
    this.inFlight = this.client.action.invoke(command).then((receipt) => {
      if (!salesPlanActionReceiptMatches(input, command.requestId, receipt)) {
        throw new SalesPlanActionError("unavailable", true);
      }
      this.receipt = receipt;
      return receipt;
    }).catch((error) => {
      const classified = classifySalesPlanActionError(error);
      this.failure = classified;
      throw classified;
    }).finally(() => {
      this.inFlight = void 0;
    });
    return this.inFlight;
  }
};

// src/workbench/original/workbenches/regionalApproval/models/salesPlanQuantityModel.ts
var salesPlanEditableQuantity = (sku, status, typeCode = "Y", role) => {
  const fields = {
    customer: "qty",
    region: "regionConfirmedQty",
    province: "provinceConfirmedQty",
    area: "areaConfirmedQty",
    category: "categoryConfirmedQty"
  };
  const flow = salesPlanWorkflow(typeCode);
  const roles = role ? SALES_PLAN_ROLES.slice(0, SALES_PLAN_ROLES.indexOf(role) + 1).toReversed().filter((r) => r === role || flow.pending(r) !== void 0) : flow.confirmationRoles(status);
  for (const candidate of roles) {
    const value = sku[fields[candidate]];
    if (value !== null && value !== void 0) return String(value);
  }
  return void 0;
};

// src/workbench/original/workbenches/regionalApproval/models/salesPlanAccessModel.ts
var NODE_ROLES2 = [
  ["region", "sales_plan_region_approver", "\u533A\u57DF\u5BA1\u6279"],
  ["province", "sales_plan_province_approver", "\u7701\u533A\u5BA1\u6279"],
  ["area", "sales_plan_area_approver", "\u5927\u533A\u5BA1\u6279"],
  ["category", "sales_plan_category_approver", "\u54C1\u7C7B\u5BA1\u6279"]
];
var salesPlanStagesForRoles = (roles = []) => NODE_ROLES2.filter(
  ([, code, name]) => roles.some((role) => {
    const roleCode = (role?.code ?? "").trim().toLowerCase();
    const roleName = (role?.name ?? "").trim();
    return roleCode.length > 0 && roleCode === code || roleName.length > 0 && roleName === name;
  })
).map(([stage]) => stage);
var salesPlanVersionEvidenceStale = (detail, expected) => {
  const v = detail?.currentVersion;
  if (!v) return true;
  if (v.planId !== expected.planId || v.id !== expected.versionId || v.effective !== true) return true;
  if (v.status !== expected.status || ![1, 2, 3, 4, 6, 7, 8, 9].includes(v.status)) return true;
  const context = detail?.actionContext;
  return Boolean(
    context && (context.versionId !== v.id || context.status !== v.status || !/^[a-f0-9]{64}$/.test(context.snapshotHash) || !Array.isArray(context.allowedActions))
  );
};
var salesPlanAccessForRow = (row, detail, grantedStages = [], stage, workflowRows) => {
  const v = detail.currentVersion, context = detail.actionContext;
  const typeCode = row.planTypeCode ?? v.planTypeCode;
  const flow = salesPlanWorkflow(typeCode, workflowRows);
  if (v.id !== row.versionId || v.planId !== row.planId || !v.effective || v.status !== row.status || ![1, 2, 3, 4, 6, 7, 8, 9].includes(row.status) || row.planTypeCode !== void 0 && row.planTypeCode !== v.planTypeCode) return void 0;
  const supported = context?.policy === "role-visible-v1";
  if (context && (context.versionId !== v.id || context.status !== v.status || !/^[a-f0-9]{64}$/.test(context.snapshotHash) || !Array.isArray(context.allowedActions))) return void 0;
  const knownActions = (actions) => actions.every((a) => ["SAVE", "APPROVE", "REJECT"].includes(a));
  if (context && !knownActions(context.allowedActions)) return void 0;
  if (supported && (!Array.isArray(context.roleActions) || context.roleActions.some((entry) => !entry || !["region", "province", "area", "category"].includes(entry.role) || !Array.isArray(entry.allowedActions) || !knownActions(entry.allowedActions)) || new Set(context.roleActions.map((entry) => entry.role)).size !== context.roleActions.length)) return void 0;
  const roles = [...new Set(grantedStages)].filter((role2) => role2 !== "customer");
  const role = stage ?? (roles.length === 1 ? roles[0] : void 0);
  if (!role || role === "customer" || !roles.includes(role)) return void 0;
  const roleEntry = supported ? context.roleActions.find((entry) => entry.role === role) : void 0;
  const nodeOrder = SALES_PLAN_ROLES.indexOf(role) + 1;
  const grantedRoleActions = ["APPROVE", "REJECT"];
  const allowedActions = supported ? [.../* @__PURE__ */ new Set([...grantedRoleActions, ...roleEntry?.allowedActions ?? []])] : context && (context.nodeOrder === nodeOrder || context.allowedActions.length === 0) ? context.allowedActions : ["APPROVE", "REJECT"];
  return {
    versionId: v.id,
    status: v.status,
    nodeOrder,
    approvalRole: role,
    allowedActions: [...allowedActions].filter((action) => action !== "REJECT" || flow.pending(role) !== void 0),
    ...context?.snapshotHash ? { snapshotHash: context.snapshotHash } : {},
    roleContractSupported: supported
  };
};
var verifySavedSalesPlan = (before, after, request, receipt) => {
  const version = before.currentVersion;
  if (request.action !== "SAVE" || request.expectedStatus !== version.status || !version.effective || !salesPlanSkusMatchVersion(version.id, before.skus) || receipt.planId !== version.planId || receipt.versionId !== version.id || receipt.fromStatus !== version.status || receipt.toStatus !== version.status || after.currentVersion.id !== version.id || after.currentVersion.planId !== version.planId || after.currentVersion.status !== version.status || after.currentVersion.seq !== version.seq || after.currentVersion.planTypeCode !== version.planTypeCode || !after.currentVersion.effective || !salesPlanSkusMatchVersion(version.id, after.skus) || before.skus.length !== after.skus.length || !after.logs.some(
    (log) => `sales-plan-log:${log.id}` === receipt.auditId && log.planId === version.planId && log.requestId === receipt.requestId && log.traceId === receipt.traceId && log.actionCode === "SAVE" && log.versionId === version.id && log.fromStatus === version.status && log.toStatus === version.status
  ))
    return false;
  const deltas = new Map((request.adjustments ?? []).map((item) => [String(item.skuCode), String(item.adjustQty)]));
  const sourceCodes = new Set(before.skus.map((sku) => String(sku.skuCode)));
  if (deltas.size !== request.adjustments?.length || [...deltas.keys()].some((code) => !sourceCodes.has(code))) return false;
  return before.skus.every((sku) => {
    const code = String(sku.skuCode);
    const saved = after.skus.find((item) => String(item.skuCode) === code);
    const baseline = salesPlanEditableQuantity(sku, version.status, version.planTypeCode, request.approvalRole);
    const actual = saved && salesPlanEditableQuantity(saved, version.status, version.planTypeCode, request.approvalRole);
    if (baseline === void 0 || actual === void 0) return false;
    const expected = addExactDecimals([baseline, deltas.get(code) ?? "0"]);
    const node = request.approvalRole ? SALES_PLAN_ROLES.indexOf(request.approvalRole) + 1 : salesPlanApprovalNodeForStatus(version.status, version.planTypeCode);
    const amount = node === 5 ? saved?.categoryConfirmedAmount : node === 4 ? saved?.areaConfirmedAmount : node === 3 ? saved?.provinceConfirmedAmount : saved?.regionConfirmedAmount;
    const expectedAmount = multiplyExactDecimals(expected, String(sku.price));
    const equal = (left, right) => /^0(?:\.0+)?$/.test(addExactDecimals([String(left), `-${right}`]));
    return expected !== "\u2014" && expectedAmount !== void 0 && equal(actual, expected) && equal(saved?.price, String(sku.price)) && equal(amount, expectedAmount);
  });
};

// src/workbench/original/workbenches/regionalApproval/models/salesPlanLocalDraftModel.ts
var DECIMAL = /^[+-]?\d{1,15}(?:\.\d{1,3})?$/;
var salesPlanDraftSnapshot = (row, detail) => {
  const version = detail.currentVersion;
  if (version.planId !== row.planId || version.id !== row.versionId || version.status !== row.status || !version.effective || !salesPlanSkusMatchVersion(row.versionId, detail.skus))
    return void 0;
  return JSON.stringify([
    row.planId,
    row.versionId,
    row.status,
    detail.skus.map((sku) => [
      String(sku.skuCode),
      salesPlanEditableQuantity(sku, row.status),
      String(sku.price),
      sku.qty,
      sku.regionConfirmedQty,
      sku.provinceConfirmedQty,
      sku.areaConfirmedQty,
      sku.categoryConfirmedQty
    ]).toSorted((left, right) => String(left[0]).localeCompare(String(right[0])))
  ]);
};
var salesPlanDraftMatches = (draft, row, detail, role) => {
  if (!draft || draft.planId !== row.planId || draft.versionId !== row.versionId || draft.status !== row.status || draft.sourceSnapshot !== salesPlanDraftSnapshot(row, detail) || !Array.isArray(draft.adjustments) || typeof draft.remark !== "string" || Array.from(draft.remark).length > 1e3)
    return false;
  const codes = /* @__PURE__ */ new Set();
  if (draft.role !== void 0 && !["region", "province", "area", "category"].includes(draft.role)) return false;
  const baselineRole = role ?? draft.role;
  return draft.adjustments.every((adjustment) => {
    if (!adjustment || typeof adjustment.skuCode !== "string" || typeof adjustment.adjustQty !== "string" || !DECIMAL.test(adjustment.adjustQty) || codes.has(adjustment.skuCode))
      return false;
    codes.add(adjustment.skuCode);
    const sku = detail.skus.find((item) => String(item.skuCode) === adjustment.skuCode);
    const baseline = sku && salesPlanEditableQuantity(sku, row.status, row.planTypeCode ?? "Y", baselineRole);
    const qty = baseline === void 0 ? "\u2014" : addExactDecimals([baseline, adjustment.adjustQty]);
    return !!sku && qty !== "\u2014" && !qty.startsWith("-") && multiplyExactDecimals(qty, String(sku.price)) !== void 0;
  });
};
var salesPlanLocalDraftValid = (draft, planId, versionId) => {
  if (!draft || typeof draft !== "object" || Array.isArray(draft)) return false;
  const value = draft;
  if (value.planId !== planId || value.versionId !== versionId || !Number.isInteger(value.status)) return false;
  if (typeof value.sourceSnapshot !== "string" || value.sourceSnapshot.length > 2e5) return false;
  if (typeof value.remark !== "string" || Array.from(value.remark).length > 1e3 || !Array.isArray(value.adjustments)) return false;
  const codes = /* @__PURE__ */ new Set();
  return value.adjustments.every((adjustment) => {
    if (!adjustment || typeof adjustment !== "object" || typeof adjustment.skuCode !== "string" || typeof adjustment.adjustQty !== "string" || !DECIMAL.test(adjustment.adjustQty) || codes.has(adjustment.skuCode)) return false;
    codes.add(adjustment.skuCode);
    return true;
  });
};
var storageKey = (scope) => `gea-dsh:sales-plan-local-drafts:v1:${encodeURIComponent(scope)}`;
var readSalesPlanLocalDrafts = (scope) => {
  if (!scope) return {};
  try {
    const value = JSON.parse(window.localStorage.getItem(storageKey(scope)) ?? "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
};
var writeSalesPlanLocalDrafts = (scope, drafts) => {
  window.localStorage.setItem(storageKey(scope), JSON.stringify(drafts));
};

// src/workbench/original/workbenches/regionalApproval/models/salesPlanCorrectionModel.ts
import { Decimal } from "decimal.js";
var Exact = Decimal.clone({ precision: 60, rounding: Decimal.ROUND_HALF_UP });
function correctionDecimal(value) {
  if (typeof value !== "string" || !/^[+-]?\d+(?:\.\d+)?$/.test(value))
    throw new Error("\u7EA0\u504F\u6570\u636E\u7F3A\u5931\u6216\u683C\u5F0F\u9519\u8BEF");
  return new Exact(value);
}
function correctionDecision(sku, status, typeCode, includeCurrent = true, workflowRows, selectedRole) {
  const flow = salesPlanWorkflow(typeCode, workflowRows);
  const roles = selectedRole ? SALES_PLAN_ROLES.slice(0, SALES_PLAN_ROLES.indexOf(selectedRole) + 1).toReversed().filter((role) => role === selectedRole || flow.pending(role) !== void 0) : flow.confirmationRoles(status);
  for (const role of includeCurrent ? roles : roles.slice(1)) {
    const add = role === "customer" ? sku.adjAddQty : sku[`${role}AdjAddQty`];
    const cut = role === "customer" ? sku.adjCutQty : sku[`${role}AdjCutQty`];
    if (add == null && cut == null) continue;
    if (add == null || cut == null) throw new Error("\u7EA0\u504F\u8FFD\u52A0\u4E0E\u8FFD\u51CF\u5B57\u6BB5\u4E0D\u5B8C\u6574");
    const a = correctionDecimal(add), c = correctionDecimal(cut);
    if (a.isNegative() || c.isNegative() || !a.isZero() && !c.isZero())
      throw new Error("\u7EA0\u504F\u8C03\u6574\u5FC5\u987B\u662F\u7EDD\u5BF9\u51C0\u91CF");
    return a.minus(c).toFixed();
  }
  throw new Error("\u7EA0\u504F\u7EE7\u627F\u6570\u636E\u7F3A\u5931");
}
function correctionLine(sku, input) {
  if (!/^[+-]?\d{1,15}(?:\.\d{1,3})?$/.test(input))
    throw new Error("\u8C03\u6574\u91CF\u6700\u591A\u4E09\u4F4D\u5C0F\u6570");
  const base = correctionDecimal(sku.qty), price = correctionDecimal(sku.price), delta = correctionDecimal(input);
  const qty = base.plus(delta);
  if (base.isNegative() || price.isNegative() || qty.isNegative())
    throw new Error("\u7EA0\u504F\u540E\u8BA1\u5212\u6570\u91CF\u4E0D\u53EF\u4E3A\u8D1F");
  if (qty.gte("1000000000000000")) throw new Error("\u7EA0\u504F\u540E\u8BA1\u5212\u6570\u91CF\u8D85\u51FA\u8303\u56F4");
  return {
    baseQty: base.toFixed(),
    qty: qty.toFixed(),
    amount: qty.times(price).toFixed(2),
    delta: delta.toFixed(),
    deltaAmount: delta.times(price).toFixed(2),
    addQty: delta.isNegative() ? "0" : delta.toFixed(),
    cutQty: delta.isNegative() ? delta.negated().toFixed() : "0",
    participates: !base.isZero() || !delta.isZero()
  };
}
function correctionMetrics(row) {
  const ratio = (n, d) => {
    try {
      const denominator = correctionDecimal(d);
      return denominator.gt(0) ? correctionDecimal(n).div(denominator).times(100).toFixed(2) : void 0;
    } catch {
      return void 0;
    }
  };
  let netAmount;
  try {
    netAmount = correctionDecimal(row.corrPlanAmount).minus(correctionDecimal(row.mPlanAmount)).toFixed(2);
  } catch {
  }
  return {
    amountProgress: ratio(row.shipAmount, row.mPlanAmount),
    qtyProgress: ratio(row.shipQty, row.mPlanQty),
    correctionProgress: ratio(row.corrPlanAmount, row.targetAmount),
    netAmount
  };
}
function correctionAccess(detail, workflowRows, selectedRole, stages = []) {
  const v = detail.currentVersion;
  if (v.orderType !== "Z" || detail.correctionContext?.contract !== "absolute-net-v1" || detail.correctionContext.monthlyApproved !== true) return void 0;
  return salesPlanAccessForRow({ planId: v.planId, versionId: v.id, status: v.status, planTypeCode: v.planTypeCode }, detail, stages, selectedRole, workflowRows);
}
function correctionAdjustments(detail, edits, workflowRows, selectedRole) {
  return detail.skus.flatMap((sku) => {
    const delta = edits[sku.skuCode] ?? correctionDecision(
      sku,
      detail.currentVersion.status,
      detail.currentVersion.planTypeCode,
      true,
      workflowRows,
      selectedRole
    );
    const line = correctionLine(sku, delta);
    return [{ skuCode: sku.skuCode, adjustQty: line.delta }];
  });
}
function verifyCorrectionAction(before, after, request, receipt) {
  const v = before.currentVersion, a = after.currentVersion;
  const flow = salesPlanWorkflow(v.planTypeCode), role = request.approvalRole ?? flow.actor(v.status);
  if (!role || role === "customer" || a.id !== v.id || a.planId !== v.planId || a.seq !== v.seq || !a.effective || a.orderType !== "Z" || !salesPlanActionReceiptMatches({ planId: v.planId, versionId: v.id, planTypeCode: v.planTypeCode, request, serverRoleResult: request.approvalPolicy === "role-visible-v1" }, receipt.requestId, receipt) || receipt.planId !== v.planId || receipt.versionId !== v.id || receipt.fromStatus !== v.status || receipt.toStatus !== a.status || !after.logs.some(
    (l) => l.requestId === receipt.requestId && l.versionId === v.id && l.planId === v.planId && l.actionCode === request.action && l.fromStatus === v.status && l.toStatus === a.status && `sales-plan-log:${l.id}` === receipt.auditId
  ))
    return false;
  const decisions = new Map(
    (request.adjustments ?? []).map((x) => [x.skuCode, x.adjustQty])
  );
  if (new Set(after.skus.map((x) => x.skuCode)).size !== after.skus.length || after.skus.some(
    (x) => x.versionId !== v.id || !before.skus.some((s) => s.skuCode === x.skuCode)
  ))
    return false;
  const equal = (x, y) => {
    try {
      return correctionDecimal(x).eq(correctionDecimal(y));
    } catch {
      return x == null && y == null;
    }
  };
  return before.skus.every((sku) => {
    const saved = after.skus.find((x) => x.skuCode === sku.skuCode);
    const delta = decisions.get(sku.skuCode);
    if (request.action !== "REJECT" && delta != null && correctionLine(sku, delta).participates === false)
      return !saved;
    if (!saved || !equal(saved.qty, sku.qty) || !equal(saved.price, sku.price))
      return false;
    for (const other of ["region", "province", "area", "category"]) {
      for (const suffix of [
        "AdjAddQty",
        "AdjCutQty",
        "ConfirmedQty",
        "ConfirmedAmount"
      ]) {
        if (other !== role || request.action === "SAVE" && suffix.startsWith("Confirmed")) {
          if (!equal(saved[`${other}${suffix}`], sku[`${other}${suffix}`]))
            return false;
        }
      }
    }
    if (request.action === "REJECT")
      return [
        "AdjAddQty",
        "AdjCutQty",
        "ConfirmedQty",
        "ConfirmedAmount"
      ].every((s) => saved[`${role}${s}`] == null);
    if (delta == null) return false;
    const expected = correctionLine(sku, delta);
    return equal(saved[`${role}AdjAddQty`], expected.addQty) && equal(saved[`${role}AdjCutQty`], expected.cutQty) && (request.action === "SAVE" || equal(saved[`${role}ConfirmedQty`], expected.qty) && equal(saved[`${role}ConfirmedAmount`], expected.amount));
  });
}

// src/workbench/original/workbenches/regionalApproval/models/salesPlanSubmitModel.ts
var SalesPlanSubmitError = class extends Error {
  constructor(kind, retrySameIntent, retryAfterMs, options) {
    super(kind, options);
    this.kind = kind;
    this.retrySameIntent = retrySameIntent;
    this.retryAfterMs = retryAfterMs;
    this.name = "SalesPlanSubmitError";
  }
};
var POSITIVE_LONG_PATTERN2 = /^[1-9]\d*$/;
var MAX_SIGNED_LONG2 = BigInt("9223372036854775807");
var MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
var CHANNEL_PATTERN = /^[a-z0-9]{1,12}$/;
var BUSINESS_PLAN_ID_PATTERN = /^p-([a-z0-9]{1,12})-(\d{4}-(?:0[1-9]|1[0-2]))-\d{5}$/;
var fail = (kind = "validation") => {
  throw new SalesPlanSubmitError(kind, false);
};
var validateText = (value, max) => {
  const normalized = value.trim();
  if (!normalized || Array.from(value).length > max) return fail();
  return normalized;
};
var validateOptionalText = (value, max) => {
  if (value === null || value === void 0 || value === "") return void 0;
  if (Array.from(value).length > max) return fail();
  return value;
};
var validatePositiveLong = (value) => {
  if (!POSITIVE_LONG_PATTERN2.test(value) || BigInt(value) > MAX_SIGNED_LONG2) return fail();
  return value;
};
var parseUnsignedDecimal = (value, maxInteger, maxFraction, targetScale) => {
  const match = value.trim().match(/^(\d+)(?:\.(\d+))?$/);
  if (!match) return fail();
  const integerDigits = match[1].replace(/^0+/, "").length || 1;
  const fraction = match[2] ?? "";
  if (integerDigits > maxInteger || fraction.length > maxFraction) return fail();
  const integer = BigInt(match[1]);
  const paddedFraction = fraction.padEnd(targetScale, "0");
  const scaled = integer * BigInt(`1${"0".repeat(targetScale)}`) + BigInt(paddedFraction || "0");
  return {
    scaled,
    canonical: `${integer.toString()}${targetScale > 0 ? `.${paddedFraction}` : ""}`
  };
};
var fixedDecimal = (scaled, scale) => {
  const raw = scaled.toString().padStart(scale + 1, "0");
  return scale === 0 ? raw : `${raw.slice(0, -scale)}.${raw.slice(-scale)}`;
};
var salesPlanChannelCodeForPlanId = (planId, periodMonth) => {
  const match = planId.trim().match(BUSINESS_PLAN_ID_PATTERN);
  return match?.[2] === periodMonth ? match[1] : void 0;
};
var validateSku = (sku) => {
  const qty = parseUnsignedDecimal(sku.qty, 15, 3, 3);
  const price = parseUnsignedDecimal(sku.price, 14, 4, 4);
  return {
    item: {
      skuCode: validatePositiveLong(sku.skuCode),
      productCategName: validateText(sku.productCategName, 128),
      baseQty: parseUnsignedDecimal(sku.baseQty, 15, 3, 3).canonical,
      qty: qty.canonical,
      price: price.canonical
    },
    qty: qty.scaled,
    roundedAmount: (qty.scaled * price.scaled + BigInt(5e4)) / BigInt(1e5)
  };
};
var prepareSalesPlanResubmit = (source, rows) => {
  const version = source.detail.currentVersion;
  const nextStatus = salesPlanWorkflow(version.planTypeCode, rows).resubmit(version.status);
  const correction = version.orderType === "Z";
  if (correction && (source.detail.correctionContext?.contract !== "absolute-net-v1" || source.detail.correctionContext.monthlyApproved !== true)) return fail("sourceMismatch");
  if (!nextStatus || !version.effective || version.planId !== source.planId || version.id !== source.versionId || version.periodId !== source.period.periodId || version.planTypeCode !== source.period.planTypeCode || version.status < 6 || version.status > 9 || !["M", "Z"].includes(version.orderType ?? "") || source.skus.length < 1 || source.skus.length > 5e3) {
    return fail("sourceMismatch");
  }
  if (!MONTH_PATTERN.test(source.period.periodMonth)) return fail();
  const derivedChannelCode = salesPlanChannelCodeForPlanId(version.planId, source.period.periodMonth);
  const suppliedChannelCode = source.channelCode?.trim();
  if (!derivedChannelCode || suppliedChannelCode !== void 0 && (!CHANNEL_PATTERN.test(suppliedChannelCode) || suppliedChannelCode !== derivedChannelCode)) {
    return fail("sourceMismatch");
  }
  const channelCode = suppliedChannelCode ?? derivedChannelCode;
  validatePositiveLong(source.period.periodId);
  validatePositiveLong(version.dealerCode);
  const planTypeCode = validateText(source.period.planTypeCode, 32);
  const submitterCode = validateText(source.currentUser.id, 64);
  const submitterName = validateOptionalText(source.currentUser.username, 128);
  const skuCodes = /* @__PURE__ */ new Set();
  let totalQty = BigInt(0);
  let totalAmount = BigInt(0);
  const items = source.skus.map((sku) => {
    if (sku.versionId !== version.id || skuCodes.has(sku.skuCode)) return fail("sourceMismatch");
    skuCodes.add(sku.skuCode);
    const validated = validateSku(sku);
    if (correction) {
      const line = correctionLine(sku, correctionDecision(sku, 0, version.planTypeCode, true, rows));
      totalQty += parseUnsignedDecimal(line.qty, 15, 3, 3).scaled;
      totalAmount += parseUnsignedDecimal(line.amount, 16, 2, 2).scaled;
      return { ...validated.item, adjAddQty: line.addQty, adjCutQty: line.cutQty };
    }
    totalQty += validated.qty;
    totalAmount += validated.roundedAmount;
    return validated.item;
  });
  const versionQty = parseUnsignedDecimal(version.targetQty, 15, 3, 3).canonical;
  const versionAmount = parseUnsignedDecimal(version.targetAmount, 16, 2, 2).canonical;
  return {
    request: {
      ...correction ? { adjustmentMode: "ABSOLUTE_NET" } : {},
      orderType: version.orderType,
      status: nextStatus,
      periodId: source.period.periodId,
      periodMonth: source.period.periodMonth,
      planTypeCode,
      channelCode,
      dealerCode: version.dealerCode,
      orgCode: validateOptionalText(version.orgCode, 64),
      provinceCode: validateOptionalText(version.provinceCode, 64),
      areaCode: validateOptionalText(version.areaCode, 64),
      baseName: validateOptionalText(version.baseName, 64),
      targetQty: versionQty,
      targetAmount: versionAmount,
      submitterCode,
      submitterName,
      items
    },
    sourceSummary: {
      skuCount: items.length,
      submittedQty: fixedDecimal(totalQty, 3),
      submittedAmount: fixedDecimal(totalAmount, 2)
    },
    expected: {
      planId: version.planId,
      previousVersionId: version.id,
      nextSeq: version.seq + 1,
      nextStatus
    }
  };
};
var retryAfterMsFromDetails2 = (details) => {
  if (!details || typeof details !== "object") return void 0;
  const value = details.retryAfterMs;
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : void 0;
};
var classifySalesPlanSubmitError = (error) => {
  if (error instanceof SalesPlanSubmitError) return error;
  if (isBackendHttpError(error)) {
    if (error.status === 400) return new SalesPlanSubmitError("validation", false, void 0, { cause: error });
    if (error.status === 401) return new SalesPlanSubmitError("authentication", false, void 0, { cause: error });
    if (error.status === 403) return new SalesPlanSubmitError("permission", false, void 0, { cause: error });
    if (error.status === 409) return new SalesPlanSubmitError("conflict", false, void 0, { cause: error });
    if (error.status === 429) {
      return new SalesPlanSubmitError("rateLimited", false, retryAfterMsFromDetails2(error.details), { cause: error });
    }
    if (error.status >= 500 && error.details && typeof error.details === "object" && "retrySameIntent" in error.details && error.details.retrySameIntent === true) return new SalesPlanSubmitError("unavailable", true, void 0, { cause: error });
    if (error.status >= 500) return new SalesPlanSubmitError("serviceUnavailable", false, void 0, { cause: error });
    return new SalesPlanSubmitError("failed", false, void 0, { cause: error });
  }
  if (error instanceof TypeError) return new SalesPlanSubmitError("unavailable", true, void 0, { cause: error });
  return new SalesPlanSubmitError("failed", false, void 0, { cause: error });
};
var salesPlanSubmitReceiptMatches = (input, requestId, receipt) => receipt.planId === input.expected.planId && receipt.versionId !== input.expected.previousVersionId && receipt.versionId.trim().length > 0 && receipt.seq === input.expected.nextSeq && receipt.status === input.expected.nextStatus && receipt.requestId === requestId && receipt.traceId.trim().length > 0 && receipt.auditId.trim().length > 0;
var SalesPlanSubmitAttempt = class _SalesPlanSubmitAttempt {
  constructor(client, createId = () => crypto.randomUUID()) {
    this.client = client;
    this.createId = createId;
  }
  static MAX_CALLS = 3;
  command;
  input;
  inFlight;
  receipt;
  failure;
  callCount = 0;
  submit(input) {
    if (this.receipt) return Promise.resolve(this.receipt);
    if (this.inFlight) return this.inFlight;
    if (this.command) return Promise.reject(this.failure ?? new SalesPlanSubmitError("failed", false));
    this.input = input;
    this.command = {
      source: { planId: input.expected.planId, versionId: input.expected.previousVersionId },
      request: input.request,
      idempotencyKey: `gea-sales-plan-submit:${this.createId()}`,
      requestId: this.createId()
    };
    return this.invoke();
  }
  retry() {
    if (this.receipt) return Promise.resolve(this.receipt);
    if (this.inFlight) return this.inFlight;
    if (!this.command || !this.failure?.retrySameIntent) {
      return Promise.reject(this.failure ?? new SalesPlanSubmitError("failed", false));
    }
    if (this.callCount >= _SalesPlanSubmitAttempt.MAX_CALLS) {
      return Promise.reject(this.exhausted());
    }
    return this.invoke();
  }
  invoke() {
    const command = this.command;
    const input = this.input;
    if (!command || !input) return Promise.reject(new SalesPlanSubmitError("failed", false));
    if (this.callCount >= _SalesPlanSubmitAttempt.MAX_CALLS) return Promise.reject(this.exhausted());
    this.callCount += 1;
    this.failure = void 0;
    this.inFlight = this.client.submit.invoke(command).then((receipt) => {
      if (!salesPlanSubmitReceiptMatches(input, command.requestId, receipt)) {
        throw new SalesPlanSubmitError("unavailable", true);
      }
      this.receipt = receipt;
      return receipt;
    }).catch((error) => {
      let classified = classifySalesPlanSubmitError(error);
      if (classified.retrySameIntent && this.callCount >= _SalesPlanSubmitAttempt.MAX_CALLS) {
        classified = this.exhausted(classified);
      }
      this.failure = classified;
      throw classified;
    }).finally(() => {
      this.inFlight = void 0;
    });
    return this.inFlight;
  }
  exhausted(cause = this.failure) {
    const error = new SalesPlanSubmitError("retryExhausted", false, void 0, { cause });
    this.failure = error;
    return error;
  }
};
var salesPlanResubmitReadbackMatches = (previousVersionId, receipt, detail, request) => {
  const current = detail.currentVersion;
  if (request?.orderType === "Z") {
    if (current.orderType !== "Z" || detail.skus.length !== request.items.length || new Set(detail.skus.map((s) => s.skuCode)).size !== detail.skus.length) return false;
    const matches = request.items.every((item) => {
      const sku = detail.skus.find((s) => s.skuCode === item.skuCode && s.versionId === receipt.versionId);
      if (!sku) return false;
      try {
        if (!["qty", "price", "baseQty", "adjAddQty", "adjCutQty"].every((field) => correctionDecimal(sku[field]).eq(correctionDecimal(item[field])))) return false;
      } catch {
        return false;
      }
      return ["region", "province", "area", "category"].every((role) => ["AdjAddQty", "AdjCutQty", "ConfirmedQty", "ConfirmedAmount"].every((suffix) => sku[role + suffix] == null));
    });
    if (!matches) return false;
  }
  const old = detail.versions.find((row) => row.id === previousVersionId);
  return current.planId === receipt.planId && current.id === receipt.versionId && current.seq === receipt.seq && current.status === receipt.status && current.effective === true && old?.effective === false && old.planId === receipt.planId && detail.logs.some((log) => log.requestId === receipt.requestId && log.planId === receipt.planId && log.versionId === receipt.versionId && log.actionCode === "RESUBMIT");
};
export {
  SALES_PLAN_RETURN_CODES,
  SALES_PLAN_ROLES,
  SALES_PLAN_WORKFLOW_ROWS,
  SalesPlanActionAttempt,
  SalesPlanActionError,
  SalesPlanSubmitAttempt,
  SalesPlanSubmitError,
  businessSafeErrorMessage,
  classifySalesPlanActionError,
  classifySalesPlanSubmitError,
  correctionAccess,
  correctionAdjustments,
  correctionDecimal,
  correctionDecision,
  correctionLine,
  correctionMetrics,
  prepareSalesPlanResubmit,
  readSalesPlanLocalDrafts,
  replaceSalesPlanWorkflowRows,
  reportSalesPlanError,
  salesPlanAccessForRow,
  salesPlanActionReceiptMatches,
  salesPlanActionTargetStatus,
  salesPlanApprovalNodeForStatus,
  salesPlanChannelCodeForPlanId,
  salesPlanDraftMatches,
  salesPlanDraftSnapshot,
  salesPlanEditableQuantity,
  salesPlanLocalDraftValid,
  salesPlanResubmitReadbackMatches,
  salesPlanStagesForRoles,
  salesPlanSubmitReceiptMatches,
  salesPlanVersionEvidenceStale,
  salesPlanWorkflow,
  validateSalesPlanActionInput,
  verifyCorrectionAction,
  verifySavedSalesPlan,
  writeSalesPlanLocalDrafts
};
