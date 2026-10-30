import type {
  SalesPlanSubmissionItem,
  SalesPlanSubmissionOutcome,
} from './RegionalApprovalResubmitDialog.tsx';
import { salesPlanCanResubmit } from './models/salesPlanSubmitModel.ts';
import { InlineSkuDetails } from './InlineSkuDetails.tsx';
import { GroupSkuSummary } from './GroupSkuSummary.tsx';
import { DashboardTableSkeleton } from './workbench-loading.tsx';
import type { GeaSalesPlanListItem } from '../../contracts.ts';
/** 改编自 AionUi（Apache-2.0）：已替换为本地导入并使用显式 DSH Host 适配器，见 SOURCE.md。 */
import { salesPlanQueueStatusText, salesPlanStatusText } from './regionalApprovalQueryModel.ts';
import { SALES_PLAN_RETURN_CODES } from '../../salesPlanWorkflow.ts';
import {
  aggregateSalesPlanExportAmounts,
  SALES_PLAN_EXPORT_AMOUNT_PAIRS,
  type SalesPlanExportAmounts,
} from './models/salesPlanExportModel.ts';
import { useSalesPlanAccess } from './hooks/useSalesPlanAccess.ts';
import {
  salesPlanVersionEvidenceStale,
  salesPlanEditableQuantity,
  salesPlanAccessForRow,
  salesPlanStagesForRoles,
  verifySavedSalesPlan,
} from './models/salesPlanAccessModel.ts';
import { salesPlanProgressBarColor } from './models/salesPlanProgressModel.ts';
import { salesPlanVarianceClass } from './models/salesPlanVarianceModel.ts';
import {
  Alert,
  Button,
  Empty,
  Modal,
  Pagination,
  Progress,
  Select,
  Spin,
  Switch,
  Table,
  Tag,
  Typography,
} from '@arco-design/web-react';
import type { TableColumnProps } from '@arco-design/web-react';
import { IconCalendar } from '@arco-design/web-react/icon';
import {
  CheckOne,
  Down,
  Download,
  Filter,
  Refresh,
  Right,
  ChartHistogram,
  Up,
} from '@icon-park/react';
import type { TFunction } from 'i18next';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useBusinessSurfaceSession } from '../../session-context.tsx';
import {
  getAssistantSurfaceWorkbenchScope,
  readAssistantSurfaceState,
  writeAssistantSurfaceState,
} from '../../storage.ts';
import {
  APPROVAL_STAGES,
  APPROVAL_DIMENSIONS_BY_STAGE,
  isApprovalStageId,
  type ApprovalDimension,
  type ApprovalStageId,
  type ApprovalState,
  type ApprovalVersion,
} from './salesPlanDomain.ts';
const ALL_ORGANIZATIONS = 'all';
const formatPlanMonthLabel = (value: string): string =>
  salesPlanPeriodOptionLabel(value).replace(
    /^(\d{4})-(\d{1,2})$/,
    (_match, year: string, month: string) => `${year}年${Number(month)}月`,
  );
import RegionalApprovalLiveActionDialog, {
  type LiveActionKind,
} from './RegionalApprovalLiveActionDialog.tsx';
import RegionalApprovalBatchActionDialog, {
  type BatchActionItem,
  type BatchActionKind,
  type BatchActionOutcome,
} from './RegionalApprovalBatchActionDialog.tsx';
import { groupRegionalApprovalLiveRows } from './regionalApprovalQueryModel.ts';
import RegionalApprovalLiveProgress from './RegionalApprovalLiveProgress.tsx';
import { liveInputKey, type SalesPlanViewState } from './models/salesPlanViewState.ts';
import {
  aggregateRegionalApprovalLiveCategories,
  addExactDecimals,
  clampSalesPlanPageNumber,
  formatExactDecimal,
  multiplyExactDecimals,
  projectRegionalApprovalLiveDimension,
  salesPlanPeriodOptionLabel,
  subtractExactDecimals,
  toRegionalApprovalLiveRow,
  type RegionalApprovalLiveCategorySummary,
  type RegionalApprovalLiveRow,
} from './regionalApprovalQueryModel.ts';
import {
  correctionDisplay,
  correctionDecimal,
  correctionNodeQuantities,
} from './models/salesPlanCorrectionModel.ts';
import {
  useRegionalApprovalQuery,
  type RegionalApprovalQueryError,
} from './useRegionalApprovalQuery.ts';
import type { GeaSalesPlanActionReceipt, GeaSalesPlanSku } from '../../bridge.ts';
import { useWorkbenchHost, WorkbenchHostProvider } from '../../bridge.ts';
import type { PageElement } from '../../../../page-bridge/catalog.ts';
import { buildWorkbenchElements } from '../../../workbench-elements.ts';
import {
  buildSalesPlanFilterSummary,
  projectSalesPlanActionContext,
  projectSalesPlanQueryContext,
  type SalesPlanAuthorityContext,
  type SalesPlanContextApprovalStage,
} from './models/salesPlanContextModel.ts';
import styles from './RegionalApprovalWorkbench.module.css';

type ApprovalContextFilters = Record<
  'area' | 'branch' | 'department' | 'customer' | 'approval' | 'health',
  string
>;

export type RegionalApprovalContextEntity = {
  source: 'gea';
  id: string;
  organizationKey: string;
  approvalState: ApprovalState | 'returned';
  health: 'unknown';
  versionId?: string;
  seq?: number;
  status?: number;
  planTypeCode?: string;
  dealerCode?: string | null;
  orgCode?: string;
  provinceCode?: string;
  areaCode?: string;
  currentQty?: string;
  currentAmount?: string;
  targetQty?: string;
  targetAmount?: string;
  skuCount?: number;
  submitter?: string;
  returnReason?: string;
  customerCode?: string;
  quantity?: string;
  amount?: string;
  previousQuantity?: string;
  previousAmount?: string;
  adjustmentQuantity?: string;
  adjustmentAmount?: string;
};

export type RegionalApprovalWorkbenchContext = {
  analysisSummary?: ReturnType<typeof useRegionalApprovalQuery>['analysisSummary'];
  view: 'regional-approval';
  scope: {
    dimension?: ApprovalDimension;
    categoryComparison?: boolean;
    primaryVersionId?: string;
    versionReferencePlanId?: string;
    currentVersionId?: string;
    compareVersionId?: string;
    planType: string;
    month: string;
    approvalStage: SalesPlanContextApprovalStage;
    authority: 'organization';
    primaryVersion: ApprovalVersion;
    compareVersion: ApprovalVersion;
    appliedFilters: ApprovalContextFilters;
  };
  visibleEntities: RegionalApprovalContextEntity[];
  selectedEntities: RegionalApprovalContextEntity[];
  /** 当前展开的行（实时队列里就是 planId），用于让外部读到"展开了什么"。 */
  expandedPlanIds: string[];
  /** 已展开行里的可编辑字段（SKU 确认计划量）：让外部能回读改后的值。 */
  expandedFields: Array<{
    id: string;
    label: string;
    value: string;
    editable: boolean;
  }>;
  metrics: {
    visibleCount: number;
    pendingCount: number;
    warningCount: number;
    quantity: string;
    amount: string;
    targetQuantity?: string;
    targetAmount?: string;
    savedAdjustmentCount: number;
    localApprovalResultCount: number;
  };
  pagination: { page: number; pageSize: number; total: number };
  evidence: {
    source: 'gea-user-session' | 'unverified';
    permission: 'read-only' | 'user-session-action';
    completeness: 'skeleton' | 'periods-only' | 'paged-queue' | 'none';
    queryState:
      | 'loading'
      | 'error'
      | 'empty-periods'
      | 'empty'
      | 'success'
      | 'refreshing'
      | 'stale-error';
    error?: RegionalApprovalQueryError;
    dataVersion: string;
  };
  authority?: SalesPlanAuthorityContext;
};

const stageLabelKey = (stage: ApprovalStageId) =>
  `common.assistantSurface.regionalApproval.stages.${stage}` as const;

const exactMoney = (value: string) => (
  <span title={correctionDisplay(value, 'money').exact}>
    {correctionDisplay(value, 'money').display}
  </span>
);
const quantityText = (value: string) =>
  correctionDisplay(value, 'quantity').display.replace('件', '');
const exactSignedMoney = (value: string) => {
  const formatted = formatExactDecimal(value);
  return formatted.startsWith('-') ? `−¥${formatted.slice(1)}` : `¥${formatted}`;
};
const isExactZero = (value: string) => /^-?0(?:\.0+)?$/.test(value);
const formattedProgress = (value: number | undefined) =>
  value === undefined ? '—' : `${value.toFixed(1)}%`;
const projectLiveContextEntity = (
  row: RegionalApprovalLiveRow,
  dimension: ApprovalDimension,
): RegionalApprovalContextEntity => ({
  source: 'gea',
  id: row.planId,
  organizationKey:
    projectRegionalApprovalLiveDimension(row, dimension).name ??
    row.orgCode ??
    row.dealerCode ??
    row.planId,
  approvalState: row.approvalState,
  health: 'unknown',
  versionId: row.versionId,
  seq: row.seq,
  status: row.status,
  planTypeCode: row.planTypeCode,
  dealerCode: row.dealerCode,
  ...(row.orgCode ? { orgCode: row.orgCode } : {}),
  ...(row.provinceCode ? { provinceCode: row.provinceCode } : {}),
  ...(row.areaCode ? { areaCode: row.areaCode } : {}),
  currentQty: row.currentQty,
  currentAmount: row.currentAmount,
  targetAmount: row.targetAmount,
  skuCount: row.skuCount,
  ...(row.submitter ? { submitter: row.submitter } : {}),
  ...(row.returnReason ? { returnReason: row.returnReason } : {}),
});

type ExportFeedback = { type: 'success' | 'warning' | 'error'; message: string };
type LiveApprovalFilters = {
  areaCode: string;
  provinceCode: string;
  orgCode: string;
  dealerCode: string;
  status: string;
};

const EMPTY_LIVE_APPROVAL_FILTERS: LiveApprovalFilters = {
  areaCode: ALL_ORGANIZATIONS,
  provinceCode: ALL_ORGANIZATIONS,
  orgCode: ALL_ORGANIZATIONS,
  dealerCode: ALL_ORGANIZATIONS,
  status: ALL_ORGANIZATIONS,
};

const uniqueLiveNamedFilterOptions = (
  rows: readonly RegionalApprovalLiveRow[],
  valueFor: (row: RegionalApprovalLiveRow) => string | null | undefined,
  labelFor: (row: RegionalApprovalLiveRow) => string | null | undefined,
) =>
  rows
    .map((row) => ({ value: valueFor(row)?.trim(), label: labelFor(row)?.trim() }))
    .filter((option): option is { value: string; label: string | undefined } =>
      Boolean(option.value),
    )
    .filter(
      (option, index, options) =>
        options.findIndex((candidate) => candidate.value === option.value) === index,
    )
    .toSorted((left, right) =>
      (left.label ?? left.value).localeCompare(right.label ?? right.value, 'zh-CN'),
    );

type RegionalApprovalLiveTableRow =
  | {
      kind: 'plan';
      tableRowId: string;
      plan: RegionalApprovalLiveRow;
      members?: RegionalApprovalLiveRow[];
      childPlan?: boolean;
      displayDimension?: ApprovalDimension;
      children?: RegionalApprovalLiveTableRow[];
    }
  | {
      kind: 'category';
      tableRowId: string;
      plan: RegionalApprovalLiveRow;
      category: RegionalApprovalLiveCategorySummary;
    };

type PersistedApprovalWorkbenchState = {
  page: number;
  pageSize: number;
  dimension: ApprovalDimension;
  categoryComparison: boolean;
  /** 审批流程图默认收起；同一次会话内记住用户展开/收起的选择。 */
  stageLaneOpen: boolean;
  selectedRowIds: string[];
  liveActionReceipts: Record<string, GeaSalesPlanActionReceipt>;
  draftLiveFilters: LiveApprovalFilters;
  appliedLiveFilters: LiveApprovalFilters;
};

const normalizeLiveActionReceipts = (value: unknown): Record<string, GeaSalesPlanActionReceipt> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(([versionId, receipt]) => {
      if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) return false;
      const candidate = receipt as Partial<GeaSalesPlanActionReceipt>;
      return (
        candidate.versionId === versionId &&
        typeof candidate.planId === 'string' &&
        Number.isInteger(candidate.fromStatus) &&
        Number.isInteger(candidate.toStatus) &&
        typeof candidate.replayed === 'boolean' &&
        typeof candidate.requestId === 'string' &&
        typeof candidate.traceId === 'string' &&
        (candidate.auditId == null || typeof candidate.auditId === 'string')
      );
    }),
  ) as Record<string, GeaSalesPlanActionReceipt>;
};

const queryErrorKey = (error: RegionalApprovalQueryError) =>
  `common.assistantSurface.regionalApproval.query.errors.${error}` as const;

const livePriority = (row: RegionalApprovalLiveRow) => {
  if (row.approvalState === 'returned') return 0;
  if (row.approvalState === 'pending') return 1;
  return 2;
};

const RegionalApprovalWorkbench: React.FC<{
  headerControls?: React.ReactNode;
  orderType?: 'M' | 'Z';
  stateScope: string;
  t: TFunction;
  onContextChange: (
    context: RegionalApprovalWorkbenchContext,
    conversationId: string | null,
  ) => void;
  liveActionsEnabled?: boolean;
  automaticAnalysisEnabled?: boolean;
  currentUserId?: string;
  onSubmitBatch?: (items: readonly SalesPlanSubmissionItem[]) => void;
  submissionOutcomes?: readonly SalesPlanSubmissionOutcome[];
  /** 当前账号可审批的节点：由账号角色映射得出（Host 经网关解析用户角色后传入）。 */
  approvalStages?: readonly ApprovalStageId[];
  /** AG-UI 前端工具调用：agent 让页面改这一屏怎么看。 */
  toolCall?: { toolCallId: string; command: Record<string, unknown> };
  onToolResult?: (toolCallId: string, applied: boolean, error?: string) => void;
  /** 页面元素清单单独上报：它是页面能力，不属于页面状态快照。 */
  onCatalogChange?: (elements: PageElement[]) => void;
}> = ({
  headerControls,
  orderType = 'M',
  stateScope,
  t,
  onContextChange,
  liveActionsEnabled = false,
  automaticAnalysisEnabled = false,
  onSubmitBatch,
  submissionOutcomes,
  currentUserId,
  approvalStages,
  toolCall,
  onToolResult,
  onCatalogChange,
}) => {
  const { salesPlan } = useWorkbenchHost();
  const queryClient = salesPlan;
  const detailClient = salesPlan;
  const liveActionClient = salesPlan;
  const { conversationId } = useBusinessSurfaceSession();
  const scopedState = getAssistantSurfaceWorkbenchScope(stateScope);
  const [initialState] = useState<PersistedApprovalWorkbenchState>(() => {
    const saved = readAssistantSurfaceState<
      Partial<PersistedApprovalWorkbenchState> & { currentStage?: unknown }
    >('forecast', `${scopedState}:regional-approval-state`, {});
    const legacyStage = readAssistantSurfaceState<unknown>(
      'forecast',
      `${scopedState}:approval-stage`,
      'area',
    );
    const currentStage = isApprovalStageId(saved.currentStage)
      ? saved.currentStage
      : isApprovalStageId(legacyStage)
        ? legacyStage
        : 'area';

    return {
      page: typeof saved.page === 'number' && saved.page >= 1 ? Math.floor(saved.page) : 1,
      pageSize: [10, 20, 50, 100].includes(saved.pageSize ?? 0) ? saved.pageSize! : 20,
      dimension: APPROVAL_DIMENSIONS_BY_STAGE[currentStage].includes(
        saved.dimension as ApprovalDimension,
      )
        ? (saved.dimension as ApprovalDimension)
        : APPROVAL_DIMENSIONS_BY_STAGE[currentStage][0],
      categoryComparison: saved.categoryComparison === true,
      stageLaneOpen: saved.stageLaneOpen === true,
      selectedRowIds: Array.isArray(saved.selectedRowIds)
        ? saved.selectedRowIds.filter((value): value is string => typeof value === 'string')
        : [],
      liveActionReceipts: normalizeLiveActionReceipts(saved.liveActionReceipts),
      draftLiveFilters: saved.draftLiveFilters ?? EMPTY_LIVE_APPROVAL_FILTERS,
      appliedLiveFilters: saved.appliedLiveFilters ?? EMPTY_LIVE_APPROVAL_FILTERS,
    };
  });
  const [pageSize, setPageSize] = useState(initialState.pageSize);
  const [page, setPage] = useState(initialState.page);
  const [dimension, setDimension] = useState(initialState.dimension);
  const [categoryComparison, setCategoryComparison] = useState(initialState.categoryComparison);
  const [stageLaneOpen, setStageLaneOpen] = useState(initialState.stageLaneOpen);
  const [liveCategorySummaries, setLiveCategorySummaries] = useState<
    Record<string, RegionalApprovalLiveCategorySummary[]>
  >({});
  const [liveCategoriesLoading, setLiveCategoriesLoading] = useState(false);
  const [liveCategoriesError, setLiveCategoriesError] = useState(false);
  // 只有最后一次品类汇总请求可以复位加载态，避免被中断的那次把遮罩留在页面上。
  const liveCategoriesRequest = useRef(0);
  const [versionMetrics, setVersionMetrics] = useState<
    Record<
      string,
      {
        versionId?: string;
        status?: number;
        returnReason?: string | null;
        correction?: Pick<
          GeaSalesPlanListItem,
          | 'prevAdjAddQty'
          | 'prevAdjCutQty'
          | 'corrPlanAmount'
          | 'corrPlanQty'
          | 'correctionProgress'
        >;
        qty: string;
        amount: string;
        baseQty: string;
        baseAmount: string;
        targetQty: string;
        targetAmount: string;
        compareVersionId?: string;
        compareQty?: string;
        compareAmount?: string;
        compareTargetQty?: string;
        compareTargetAmount?: string;
      }
    >
  >({});
  const [inlineComparison, setInlineComparison] = useState<{
    primaryOffset: number;
    compareOffset: number;
  }>();
  const [primarySkusByPlan, setPrimarySkusByPlan] = useState<Record<string, GeaSalesPlanSku[]>>({});
  const [comparedSkusByPlan, setComparedSkusByPlan] = useState<Record<string, GeaSalesPlanSku[]>>(
    {},
  );
  const [comparedCategories, setComparedCategories] = useState<
    Record<string, RegionalApprovalLiveCategorySummary[]>
  >({});
  const [inlinePlanId, setInlinePlanId] = useState<string>();
  const [draftLiveFilters, setDraftLiveFilters] = useState<LiveApprovalFilters>(
    initialState.draftLiveFilters,
  );
  const [appliedLiveFilters, setAppliedLiveFilters] = useState<LiveApprovalFilters>(
    initialState.appliedLiveFilters,
  );
  // 节点口径只认账号角色；没有角色就一个节点都没有（界面全灰），不再用通知/任务反推。
  // 默认用登录时那一份；点刷新会重新解析角色并覆盖，管理员刚改完权限的人不必重新登录。
  const [refreshedStages, setRefreshedStages] = useState<readonly ApprovalStageId[]>();
  const roleSource = refreshedStages ?? approvalStages ?? [];
  const roleKey = [...roleSource].join(',');
  const roleStages = useMemo(
    () => [...new Set(roleSource.filter((stage) => stage !== 'customer'))],
    [roleKey],
  );
  const refreshApprovalStages = async () => {
    const client = queryClient?.approvalRoles;
    if (!client) return;
    try {
      const result = await client.invoke({});
      setRefreshedStages(salesPlanStagesForRoles(result.roles ?? []));
    } catch {
      // 角色一时读不到就沿用当前节点口径，不把用户突然变成"一个节点都不能点"。
    }
  };
  const [liveStageFilter, setLiveStageFilter] = useState<ApprovalStageId | undefined>(
    () => roleStages[0],
  );
  const previousRoleKey = useRef(roleKey);
  useEffect(() => {
    if (previousRoleKey.current === roleKey) return;
    previousRoleKey.current = roleKey;
    const firstStage = roleStages[0];
    setLiveStageFilter(firstStage);
    if (queryClient && firstStage) setDimension(APPROVAL_DIMENSIONS_BY_STAGE[firstStage][0]);
    setSelectedRowIds([]);
    setPage(1);
  }, [roleKey]);
  const [selectedRowIds, setSelectedRowIds] = useState(initialState.selectedRowIds);
  const [progressOpen, setProgressOpen] = useState(false);
  const tableViewportRef = useRef<HTMLDivElement>(null);
  const [tableViewportWidth, setTableViewportWidth] = useState(0);
  useEffect(() => {
    const viewport = tableViewportRef.current;
    if (!viewport) return;
    const observer = new ResizeObserver(([entry]) => {
      setTableViewportWidth(Math.floor(entry.contentRect.width));
    });
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  // 销售计划审批默认收起筛选，用户通过漏斗图标展开。
  const [narrowFiltersExpanded, setNarrowFiltersExpanded] = useState(false);
  const filterPanelId = React.useId();
  const [exportFeedback, setExportFeedback] = useState<ExportFeedback>();
  const [focusedLivePlanId, setFocusedLivePlanId] = useState<string>();
  const [liveAdjustmentMetrics, setLiveAdjustmentMetrics] = useState<
    Record<string, { quantity: string; amount: string }>
  >({});
  // 内联明细里当前显示的本节点确认量（用户改过但可能还没落盘）；通过时优先用这份内存值，避免丢数。
  const [livePendingValues, setLivePendingValues] = useState<
    Record<string, Record<string, string>>
  >({});
  const [invalidGroupInputs, setInvalidGroupInputs] = useState<Record<string, string[]>>({});
  const [liveActionPlanId, setLiveActionPlanId] = useState<string>();
  const [liveActionKind, setLiveActionKind] = useState<LiveActionKind>('APPROVE');
  // 对话下发的审批确认 / 退回理由草稿；审批本身仍走页面原有的对话框逻辑。
  const [approvalSubmitRequest, setApprovalSubmitRequest] = useState<{ at: number }>();
  const [approvalRemarkPatch, setApprovalRemarkPatch] = useState<{ at: number; remark: string }>();
  const [liveActionReceipts, setLiveActionReceipts] = useState(initialState.liveActionReceipts);
  const [liveAuthorityContext, setLiveAuthorityContext] = useState<SalesPlanAuthorityContext>();
  const handleLiveAdjustmentMetrics = useCallback(
    (planId: string, metrics?: { quantity: string; amount: string }) => {
      setLiveAdjustmentMetrics((current) => {
        if (metrics === undefined) {
          if (!(planId in current)) return current;
          const next = { ...current };
          delete next[planId];
          return next;
        }
        const previous = current[planId];
        if (previous?.quantity === metrics.quantity && previous.amount === metrics.amount)
          return current;
        return { ...current, [planId]: metrics };
      });
    },
    [],
  );
  const handleLivePendingValues = useCallback((planId: string, values: Record<string, string>) => {
    setLivePendingValues((current) => {
      const previous = current[planId];
      const keys = Object.keys(values);
      if (
        previous &&
        Object.keys(previous).length === keys.length &&
        keys.every((key) => previous[key] === values[key])
      )
        return current;
      return { ...current, [planId]: values };
    });
  }, []);
  const [permissionDeniedVersions, setPermissionDeniedVersions] = useState<Set<string>>(
    () => new Set(),
  );
  const [batchAction, setBatchAction] = useState<{
    kind: BatchActionKind;
    items: BatchActionItem[];
  }>();
  const [viewState, setViewState] = useState<SalesPlanViewState>(() =>
    readAssistantSurfaceState<SalesPlanViewState>(
      'forecast',
      `${scopedState}:regional-approval-detail-state`,
      {},
    ),
  );
  useEffect(() => {
    setLivePendingValues({});
    setLiveAdjustmentMetrics({});
    setInvalidGroupInputs({});
  }, [liveStageFilter]);
  const liveQueryScope = useMemo(
    () => ({
      areaCode:
        appliedLiveFilters.areaCode === ALL_ORGANIZATIONS ? undefined : appliedLiveFilters.areaCode,
      provinceCode:
        appliedLiveFilters.provinceCode === ALL_ORGANIZATIONS
          ? undefined
          : appliedLiveFilters.provinceCode,
      orgCode:
        appliedLiveFilters.orgCode === ALL_ORGANIZATIONS ? undefined : appliedLiveFilters.orgCode,
      dealerCode:
        appliedLiveFilters.dealerCode === ALL_ORGANIZATIONS
          ? undefined
          : appliedLiveFilters.dealerCode,
      status:
        appliedLiveFilters.status === ALL_ORGANIZATIONS
          ? undefined
          : Number(appliedLiveFilters.status),
    }),
    [appliedLiveFilters],
  );
  const liveQuery = useRegionalApprovalQuery({
    client: queryClient,
    page,
    pageSize,
    scope: liveQueryScope,
    loadStageProgress: queryClient !== null,
    loadAnalysisSummary: queryClient !== null,
    stage: liveStageFilter,
    roles: roleStages,
  });

  const liveFiltersDirty = JSON.stringify(draftLiveFilters) !== JSON.stringify(appliedLiveFilters);

  // 筛选范围内的完整计划集合：分组要覆盖全部数据，再按外层组织行分页。
  const allLiveRows = useMemo(
    () => (liveQuery.queueState.data?.records ?? []).map(toRegionalApprovalLiveRow),
    [liveQuery.queueState.data?.records],
  );
  const draftedAllLiveRows = useMemo(
    () =>
      allLiveRows.map((row) => {
        const metrics = versionMetrics[row.planId];
        const adjusted = inlineComparison?.primaryOffset
          ? undefined
          : liveAdjustmentMetrics[row.planId];
        const next = metrics
          ? {
              ...row,
              ...metrics.correction,
              mPlanQty:
                !inlineComparison && row.orderType !== 'Z' && metrics.versionId === row.versionId
                  ? (row.mPlanQty ?? metrics.baseQty)
                  : inlineComparison
                    ? metrics.qty
                    : metrics.baseQty,
              mPlanAmount:
                !inlineComparison && row.orderType !== 'Z' && metrics.versionId === row.versionId
                  ? (row.mPlanAmount ?? metrics.baseAmount)
                  : inlineComparison
                    ? metrics.amount
                    : metrics.baseAmount,
              currentQty: metrics.qty,
              currentAmount: metrics.amount,
              targetQty: metrics.targetQty,
              targetAmount: metrics.targetAmount,
            }
          : row;
        return adjusted
          ? {
              ...next,
              mPlanQty: orderType === 'Z' ? next.mPlanQty : adjusted.quantity,
              mPlanAmount: orderType === 'Z' ? next.mPlanAmount : adjusted.amount,
              currentQty: adjusted.quantity,
              currentAmount: adjusted.amount,
              ...(orderType === 'Z'
                ? {
                    corrPlanAmount: adjusted.amount,
                    corrPlanQty: adjusted.quantity,
                    correctionProgress:
                      Number(next.targetAmount) > 0
                        ? correctionDecimal(adjusted.amount)
                            .div(next.targetAmount)
                            .times(100)
                            .toFixed(1)
                        : null,
                  }
                : {}),
            }
          : next;
      }),
    [liveAdjustmentMetrics, allLiveRows, versionMetrics, orderType, inlineComparison],
  );
  const dimensionStage = liveStageFilter ?? 'category';
  const availableDimensions = APPROVAL_DIMENSIONS_BY_STAGE[dimensionStage];
  const liveStageProgress = liveQuery.progressState.data ?? {
    customer: 0,
    region: 0,
    province: 0,
    area: 0,
    category: 0,
  };
  /**
   * 悬停百分比时给出分子/分母：分母是该月该范围内全部状态的计划单数，分子是"已过本节点"的单数。
   * 口径见 regionalApprovalQueryModel 的 salesPlanStageTallies，矩阵锁在 tests/approval-visibility。
   */
  const stageProgressDetail = (stageId: ApprovalStageId) => {
    const tally =
      liveQuery.progressState.status === 'success'
        ? liveQuery.progressState.tallies?.[stageId]
        : undefined;
    if (!tally || tally.total <= 0) return undefined;
    return t('common.assistantSurface.regionalApproval.stageProgressDetail', {
      completed: tally.completed,
      total: tally.total,
    });
  };

  useEffect(() => {
    if (availableDimensions.includes(dimension)) return;
    setDimension(availableDimensions[0]);
  }, [availableDimensions, dimension]);

  const liveFilterOptions = useMemo(() => {
    const provinceRows =
      draftLiveFilters.areaCode !== ALL_ORGANIZATIONS
        ? allLiveRows.filter((row) => row.areaCode?.trim() === draftLiveFilters.areaCode)
        : allLiveRows;
    const organizationRows =
      draftLiveFilters.provinceCode !== ALL_ORGANIZATIONS
        ? provinceRows.filter((row) => row.provinceCode?.trim() === draftLiveFilters.provinceCode)
        : provinceRows;
    const customerRows =
      draftLiveFilters.orgCode !== ALL_ORGANIZATIONS
        ? organizationRows.filter((row) => row.orgCode?.trim() === draftLiveFilters.orgCode)
        : organizationRows;
    return {
      areas: uniqueLiveNamedFilterOptions(
        allLiveRows,
        (row) => row.areaCode,
        (row) => row.areaName ?? row.regionName,
      ),
      provinces: uniqueLiveNamedFilterOptions(
        provinceRows,
        (row) => row.provinceCode,
        (row) => row.provinceName ?? row.provinceRegionName,
      ),
      organizations: uniqueLiveNamedFilterOptions(
        organizationRows,
        (row) => row.orgCode,
        (row) => row.orgName ?? row.salesGroupName,
      ),
      customers: customerRows
        .map((row) => ({
          dealerCode: String(row.dealerCode ?? '').trim(),
          dealerName: row.dealerName?.trim(),
          baseName: row.baseName?.trim(),
        }))
        .filter(
          (option, index, options) =>
            Boolean(option.dealerCode) &&
            options.findIndex((item) => item.dealerCode === option.dealerCode) === index,
        ),
    };
  }, [
    draftLiveFilters.areaCode,
    draftLiveFilters.orgCode,
    draftLiveFilters.provinceCode,
    allLiveRows,
  ]);
  const prioritizedLiveRows = useMemo(
    () => allLiveRows.toSorted((left, right) => livePriority(left) - livePriority(right)),
    [allLiveRows],
  );
  // 外层行分页：先按维度分组，再按组织行翻页；页脚与分页器统计的都是外层行条数。
  // 分组只依赖计划本身，不依赖版本汇总 / 品类汇总，避免“汇总刷新 → 行数组更新 → effect 再跑”的相互触发。
  const liveOuterRows = useMemo(() => {
    const levels: ApprovalDimension[] = ['base', 'area', 'province', 'region', 'customer'];
    const level = levels.indexOf(dimension);
    if (level === levels.length - 1)
      return prioritizedLiveRows.map((plan) => ({ key: `plan:${plan.planId}`, members: [plan] }));
    return groupRegionalApprovalLiveRows(prioritizedLiveRows, levels[level]).map((group) => ({
      key: `group:${group.key}`,
      members: group.members,
    }));
  }, [dimension, prioritizedLiveRows]);
  const livePageCount = Math.max(1, Math.ceil(liveOuterRows.length / Math.max(1, pageSize)));
  const liveCurrentPage = Math.min(clampSalesPlanPageNumber(page), livePageCount);
  const livePageRange = useMemo(
    () => [(liveCurrentPage - 1) * pageSize, liveCurrentPage * pageSize] as const,
    [liveCurrentPage, pageSize],
  );
  const pagedOuterRows = useMemo(
    () => liveOuterRows.slice(livePageRange[0], livePageRange[1]),
    [liveOuterRows, livePageRange],
  );
  // 当前页可见的计划行（未合并版本汇总与本节点调整）：能力预取、选择、导出、详情都只看这一页。
  const liveRows = useMemo(() => pagedOuterRows.flatMap((row) => row.members), [pagedOuterRows]);
  // 展示用：把版本汇总与本节点调整叠加到当前页每条计划上（指标卡、助手上下文也读这份）。
  const draftedRowsByPlanId = useMemo(
    () => new Map(draftedAllLiveRows.map((row) => [String(row.planId), row])),
    [draftedAllLiveRows],
  );
  const draftedLiveRows = useMemo(
    () => liveRows.map((row) => draftedRowsByPlanId.get(String(row.planId)) ?? row),
    [draftedRowsByPlanId, liveRows],
  );
  // 当前位置的展示树：外层行已在分组阶段切好，组内成员不会被拆到两页。
  const liveTableRows = useMemo<RegionalApprovalLiveTableRow[]>(() => {
    const planRows = (
      plans: RegionalApprovalLiveRow[],
      childPlan = false,
    ): RegionalApprovalLiveTableRow[] =>
      plans.flatMap((plan) => [
        { kind: 'plan' as const, tableRowId: plan.planId, plan, childPlan },
        ...(categoryComparison
          ? (liveCategorySummaries[plan.planId] ?? []).map((category) => ({
              kind: 'category' as const,
              tableRowId: `${plan.planId}:category:${category.categoryName}`,
              plan,
              category,
            }))
          : []),
      ]);
    const levels: ApprovalDimension[] = ['base', 'area', 'province', 'region', 'customer'];
    const build = (
      plans: RegionalApprovalLiveRow[],
      level: number,
      parent = '',
    ): RegionalApprovalLiveTableRow[] =>
      groupRegionalApprovalLiveRows(
        plans,
        levels[level],
        liveQuery.queueState.data?.groupMetrics,
      ).flatMap((group) => {
        if (level === levels.length - 1) return planRows(group.members, true);
        if (!parent && group.members.length === 1) return planRows(group.members);
        const id = `${parent}/group:${group.key}`;
        return [
          {
            kind: 'plan',
            tableRowId: id,
            plan: group.summary,
            members: group.members,
            displayDimension: levels[level],
            children: build(group.members, level + 1, id),
          },
        ];
      });
    return build(draftedLiveRows, levels.indexOf(dimension));
  }, [
    categoryComparison,
    draftedLiveRows,
    liveCategorySummaries,
    dimension,
    liveQuery.queueState.data?.groupMetrics,
  ]);
  const liveTableRowById = useMemo(() => {
    const rows = new Map<string, RegionalApprovalLiveTableRow>();
    const visit = (tableRows: RegionalApprovalLiveTableRow[]) => {
      tableRows.forEach((row) => {
        rows.set(row.tableRowId, row);
        if (row.kind === 'plan' && row.children) visit(row.children);
      });
    };
    visit(liveTableRows);
    return rows;
  }, [liveTableRows]);
  const [expandedLiveGroups, setExpandedLiveGroups] = useState<Array<string | number>>([]);
  const expandedLiveRowKeys = useMemo(
    () => [...new Set([...expandedLiveGroups, ...(inlinePlanId ? [inlinePlanId] : [])])],
    [expandedLiveGroups, inlinePlanId],
  );
  // 对话下发的草稿改写（确认计划量），交给对应行的内联编辑器应用。
  const [draftPatch, setDraftPatch] = useState<{
    at: number;
    planId: string;
    quantity: string;
    skuCodes?: string[];
  }>();
  // 已展开行上报的"可编辑字段 + 集合"，合进本页元素清单。
  const [inlineElements, setInlineElements] = useState<
    Record<
      string,
      {
        fields: Array<{ id: string; label: string; value: string; editable: boolean }>;
        collection?: { id: string; label: string; members: string[] };
      }
    >
  >({});
  const handleInlineElements = useCallback(
    (
      planId: string,
      fields: Array<{ id: string; label: string; value: string; editable: boolean }>,
      collection?: { id: string; label: string; members: string[] },
    ) => {
      setInlineElements((current) => {
        const next = { ...current, [planId]: { fields, collection } };
        // 子组件回调身份每轮都会变，内容没变就不要触发父级重渲染。
        return JSON.stringify(next) === JSON.stringify(current) ? current : next;
      });
    },
    [],
  );

  const selectedLiveTableRowIds = useMemo(() => {
    const selected = new Set(selectedRowIds);
    const visit = (rows: RegionalApprovalLiveTableRow[]) => {
      rows.forEach((row) => {
        if (
          row.kind === 'plan' &&
          row.members?.length &&
          row.members.every((member) => selected.has(member.planId))
        ) {
          selected.add(row.tableRowId);
        }
        if (row.kind === 'plan' && row.children) visit(row.children);
      });
    };
    visit(liveTableRows);
    return [...selected];
  }, [liveTableRows, selectedRowIds]);
  /**
   * 选中行必须与表格里「勾上的那些行」一一对应：按行的 tableRowId 展开成计划，
   * 再按计划 ID 兜底。用字符串比较是为了不受上游 planId 是数字还是字符串的影响；
   * 只按 liveRows.planId 过滤时，一旦选中集合里混进分组行 id，就会出现
   * 「行是勾上的、通过/退回却是灰的」。
   */
  const selectedLiveRows = useMemo(() => {
    const ids = new Set(selectedRowIds.map((id) => String(id)));
    const picked = new Map<string, RegionalApprovalLiveRow>();
    const add = (plan: RegionalApprovalLiveRow) => picked.set(String(plan.planId), plan);
    for (const row of liveTableRows) {
      if (row.kind !== 'plan' || !ids.has(String(row.tableRowId))) continue;
      if (row.members?.length) row.members.forEach(add);
      else add(row.plan);
    }
    for (const row of liveRows) if (ids.has(String(row.planId))) add(row);
    return [...picked.values()].filter(
      (row) => row.orderType == null || row.orderType === orderType,
    );
  }, [liveRows, liveTableRows, selectedRowIds, orderType]);
  const displayStage = liveStageFilter;
  const effectiveStage: SalesPlanContextApprovalStage = liveStageFilter ?? 'all';
  const contextAppliedFilters = useMemo<ApprovalContextFilters>(
    () => ({
      area: appliedLiveFilters.areaCode,
      branch: appliedLiveFilters.provinceCode,
      department: appliedLiveFilters.orgCode,
      customer: appliedLiveFilters.dealerCode,
      approval: appliedLiveFilters.status,
      health: ALL_ORGANIZATIONS,
    }),
    [appliedLiveFilters],
  );

  const focusedLiveRow = liveRows.find((row) => row.planId === focusedLivePlanId) ?? liveRows[0];
  const comparisonLiveRow = selectedLiveRows.length === 1 ? selectedLiveRows[0] : focusedLiveRow;
  useEffect(() => {
    const requestId = ++liveCategoriesRequest.current;
    setLiveCategoriesError(false);
    setLiveCategorySummaries({});
    if (!liveRows.length) {
      setVersionMetrics({});
      setLiveCategoriesLoading(false);
      return;
    }
    const controller = new AbortController();
    const primaryOffset = inlineComparison?.primaryOffset ?? 0;
    const compareOffset = inlineComparison?.compareOffset ?? 0;
    setLiveCategoriesLoading(true);
    setVersionMetrics({});
    setPrimarySkusByPlan({});
    setComparedSkusByPlan({});
    setComparedCategories({});
    void (async () => {
      const metrics: typeof versionMetrics = {};
      const categories: typeof liveCategorySummaries = {};
      const primarySkus: typeof primarySkusByPlan = {};
      const comparedSkus: typeof comparedSkusByPlan = {};
      const comparisonCategories: typeof comparedCategories = {};
      const nodeSkus = (skus: GeaSalesPlanSku[], row: RegionalApprovalLiveRow) =>
        skus.map((sku) => {
          const qty =
            salesPlanEditableQuantity(sku, row.status, row.planTypeCode, liveStageFilter) ??
            String(sku.qty);
          return {
            ...sku,
            qty,
            amt: multiplyExactDecimals(qty, String(sku.price)) ?? String(sku.amt),
          };
        });
      for (const row of liveRows) {
        controller.signal.throwIfAborted();
        const versions =
          primaryOffset || compareOffset
            ? await detailClient.versions.invoke({ planId: row.planId, signal: controller.signal })
            : [];
        const current = versions.find((v) => v.id === row.versionId);
        const chosen = primaryOffset
          ? versions.find((v) => current && v.seq === current.seq - primaryOffset)
          : undefined;
        const versionId = primaryOffset ? chosen?.id : row.versionId;
        if (!versionId) {
          metrics[row.planId] = {
            qty: '—',
            amount: '—',
            baseQty: '—',
            baseAmount: '—',
            targetQty: '',
            targetAmount: '',
          };
          continue;
        }
        const skus = await detailClient.versionSkus.invoke({
          versionId,
          signal: controller.signal,
        });
        if (
          skus.some((sku) => sku.versionId !== versionId) ||
          new Set(skus.map((sku) => sku.skuCode)).size !== skus.length
        )
          throw new Error('INVALID_VERSION_SKUS');
        primarySkus[row.planId] = skus;
        const displaySkus =
          row.orderType === 'Z'
            ? skus.map((sku) => ({ ...sku, baseQty: sku.corrBaseQty ?? sku.qty, amtBase: sku.amt }))
            : skus;
        const aggregate = aggregateRegionalApprovalLiveCategories(
          inlineComparison
            ? nodeSkus(displaySkus, { ...row, status: chosen?.status ?? row.status })
            : displaySkus,
        );
        categories[row.planId] = aggregate;
        metrics[row.planId] = {
          versionId,
          status: chosen?.status ?? row.status,
          returnReason: chosen ? chosen.returnReason : row.returnReason,
          qty: addExactDecimals(aggregate.map((c) => c.quantity)),
          amount: addExactDecimals(aggregate.map((c) => c.amount)),
          baseQty: addExactDecimals(aggregate.map((c) => c.baseQuantity)),
          baseAmount: addExactDecimals(aggregate.map((c) => c.baseAmount)),
          targetQty: String(primaryOffset ? (chosen?.targetQty ?? '') : row.targetQty),
          targetAmount: String(primaryOffset ? (chosen?.targetAmount ?? '') : row.targetAmount),
        };
        if (orderType === 'Z' && row.orderType === 'Z') {
          const lines = skus.map((sku) => {
            const adjustment = correctionNodeQuantities(
              sku,
              row.status,
              row.planTypeCode,
              false,
              undefined,
              liveStageFilter === 'customer' ? undefined : liveStageFilter,
            );
            const add = correctionDecimal(adjustment.addQty),
              cut = correctionDecimal(adjustment.cutQty),
              price = correctionDecimal(sku.price);
            return {
              add,
              cut,
              qty: correctionDecimal(sku.qty).plus(add).minus(cut),
              amount: correctionDecimal(sku.amt)
                .plus(add.times(price).toFixed(2))
                .minus(cut.times(price).toFixed(2)),
            };
          });
          const sum = (field: 'add' | 'cut' | 'qty' | 'amount') =>
            lines.reduce((value, line) => value.plus(line[field]), correctionDecimal('0'));
          const amount = sum('amount');
          metrics[row.planId].correction = {
            prevAdjAddQty: sum('add').toFixed(),
            prevAdjCutQty: sum('cut').toFixed(),
            corrPlanQty: sum('qty').toFixed(),
            corrPlanAmount: amount.toFixed(2),
            correctionProgress:
              Number(row.targetAmount) > 0
                ? amount.div(row.targetAmount).times(100).toFixed(1)
                : null,
          };
        }
        if (inlineComparison) {
          const other = compareOffset
            ? versions.find((v) => current && v.seq === current.seq - compareOffset)
            : versions.find((v) => v.id === row.versionId);
          const otherId = compareOffset ? other?.id : row.versionId;
          if (otherId) {
            const otherSkus =
              otherId === versionId
                ? skus
                : await detailClient.versionSkus.invoke({
                    versionId: otherId,
                    signal: controller.signal,
                  });
            if (
              otherSkus.some((sku) => sku.versionId !== otherId) ||
              new Set(otherSkus.map((sku) => sku.skuCode)).size !== otherSkus.length
            )
              throw new Error('INVALID_VERSION_SKUS');
            metrics[row.planId].compareVersionId = otherId;
            comparedSkus[row.planId] = otherSkus;
            const compared = aggregateRegionalApprovalLiveCategories(
              nodeSkus(otherSkus, { ...row, status: other?.status ?? row.status }),
            );
            comparisonCategories[row.planId] = compared;
            metrics[row.planId].compareTargetQty = String(other?.targetQty ?? row.targetQty);
            metrics[row.planId].compareTargetAmount = String(
              other?.targetAmount ?? row.targetAmount,
            );
            metrics[row.planId].compareQty = addExactDecimals(compared.map((c) => c.quantity));
            metrics[row.planId].compareAmount = addExactDecimals(compared.map((c) => c.amount));
          }
        }
      }
      if (!controller.signal.aborted) {
        setVersionMetrics(metrics);
        setLiveCategorySummaries(categories);
        setPrimarySkusByPlan(primarySkus);
        setComparedSkusByPlan(comparedSkus);
        setComparedCategories(comparisonCategories);
      }
    })()
      .catch(() => {
        if (!controller.signal.aborted && liveCategoriesRequest.current === requestId)
          setLiveCategoriesError(true);
      })
      .finally(() => {
        if (liveCategoriesRequest.current === requestId) setLiveCategoriesLoading(false);
      });
    return () => controller.abort();
  }, [detailClient, liveRows, inlineComparison, orderType, liveStageFilter]);
  const historicalSummaryUnavailable = Boolean(
    inlineComparison && inlineComparison.primaryOffset > 0,
  );
  const scopeSummary = useMemo<typeof liveQuery.analysisSummary>(
    () =>
      historicalSummaryUnavailable
        ? { status: 'error', error: 'unavailable' }
        : liveQuery.analysisSummary,
    [historicalSummaryUnavailable, liveQuery.analysisSummary],
  );
  const liveAccess = useSalesPlanAccess(
    liveRows,
    detailClient,
    liveActionsEnabled && liveQuery.queueState.status === 'success',
  );

  const sourceTypeReadOnly = (row: RegionalApprovalLiveRow) =>
    Boolean(inlineComparison?.primaryOffset) ||
    (row.orderType != null && row.orderType !== orderType);

  // 能审批的节点只来自账号角色：通知、任务、服务端对象能力都不参与身份判定。
  const authorizedStages = roleStages;
  // 收起态的节点口径跟展开态高亮一致：用户选了哪个节点就显示哪个，切到「全部节点」就显示全部节点。
  const stageIndicatorStage = displayStage;
  // 首次未选择节点时使用账号角色允许的第一个节点；只自动设一次，不覆盖后续用户选择。
  const defaultStageApplied = useRef(false);
  useEffect(() => {
    if (defaultStageApplied.current) return;
    if (liveStageFilter !== undefined) {
      defaultStageApplied.current = true;
      return;
    }
    const fallback = authorizedStages[0];
    if (!fallback) return;
    defaultStageApplied.current = true;
    setLiveStageFilter(fallback);
    setDimension(APPROVAL_DIMENSIONS_BY_STAGE[fallback][0]);
    setSelectedRowIds([]);
    setPage(1);
  }, [authorizedStages, liveStageFilter]);

  const refreshLiveAuthority = () => {
    setPermissionDeniedVersions(new Set());
    liveAccess.refresh();
    liveQuery.retryQueue();
    void refreshApprovalStages();
  };
  useEffect(() => {
    if (!submissionOutcomes?.length) return;
    const attempted = new Set(submissionOutcomes.map((outcome) => outcome.planId));
    const succeeded = new Set(
      submissionOutcomes
        .filter((outcome) => outcome.status === 'success')
        .map((outcome) => outcome.planId),
    );
    setSelectedRowIds((current) => current.filter((id) => !attempted.has(id)));
    setPermissionDeniedVersions(
      (current) =>
        new Set([
          ...current,
          ...submissionOutcomes
            .filter((outcome) => outcome.permissionDenied)
            .map((outcome) => outcome.versionId),
        ]),
    );
    if (succeeded.size) {
      setLivePendingValues((current) =>
        Object.fromEntries(Object.entries(current).filter(([id]) => !succeeded.has(id))),
      );
      liveAccess.refresh();
      liveQuery.retryQueue();
      void refreshApprovalStages();
    }
  }, [submissionOutcomes]);
  const activeLiveActionRow = liveRows.find((row) => row.planId === liveActionPlanId);

  const contextFilterSummary = useMemo(
    () =>
      buildSalesPlanFilterSummary({
        periodMonth: liveQuery.selectedPeriodMonth ?? undefined,
        planTypeCode: liveQuery.selectedPlanTypeCode ?? undefined,
        approvalStage: effectiveStage,
        queueMode: 'approval',
        appliedFilters: contextAppliedFilters,
      }),
    [
      contextAppliedFilters,
      effectiveStage,
      liveQuery.selectedPeriodMonth,
      liveQuery.selectedPlanTypeCode,
    ],
  );

  // 节点身份由账号和当前选择决定；退回目标只决定通知位置。
  const liveActionRolesFor = (): readonly ApprovalStageId[] =>
    liveStageFilter ? [liveStageFilter] : roleStages;
  const liveActionDisabledReason = (
    row: RegionalApprovalLiveRow,
    kind: LiveActionKind = 'APPROVE',
  ) => {
    if (sourceTypeReadOnly(row)) return 'readOnly';
    if (
      kind === 'APPROVE' &&
      Object.values(invalidGroupInputs).some((plans) => plans.includes(row.planId))
    )
      return 'invalidQuantity';
    if (historicalSummaryUnavailable) return 'queueNotFresh';
    if (!liveActionsEnabled) return 'missingAuthority';

    if (permissionDeniedVersions.has(row.versionId)) return 'permission';
    if (liveQuery.queueState.status !== 'success') return 'queueNotFresh';
    if (liveAccess.failedVersions.has(row.versionId)) return 'detailUnavailable';
    const detail = liveAccess.entries[row.versionId];
    if (
      !detail ||
      !liveActionRolesFor().some((role) =>
        salesPlanAccessForRow(row, detail, roleStages, role)?.allowedActions.includes(kind),
      )
    )
      return 'missingAuthority';
    if (kind === 'SAVE') return undefined;

    return undefined;
  };

  /** 与单笔按钮同源的角色解析：多角色账号按当前节点过滤逐个尝试，取第一个允许该动作的角色。 */
  const liveActionAccessFor = (row: RegionalApprovalLiveRow, kind: LiveActionKind) => {
    if (sourceTypeReadOnly(row)) return undefined;
    const detail = liveAccess.entries[row.versionId];
    if (!detail) return undefined;
    for (const role of liveActionRolesFor()) {
      const access = salesPlanAccessForRow(row, detail, roleStages, role);
      if (access?.allowedActions.includes(kind)) return access;
    }
    return undefined;
  };
  const batchItemsFor = (
    rows: readonly RegionalApprovalLiveRow[],
    kind: LiveActionKind,
  ): BatchActionItem[] =>
    rows.map((row) => {
      const access = liveActionAccessFor(row, kind);
      return access
        ? {
            row,
            access,
            detail: liveAccess.entries[row.versionId],
            pendingValues: livePendingValues[row.planId],
          }
        : { row, skipReason: liveActionDisabledReason(row, kind) ?? 'missingAuthority' };
    });
  /** 分组内有可按角色审批或退回的成员时允许勾选。 */
  const resubmitAllowed = (row: RegionalApprovalLiveRow) => {
    const detail = liveAccess.entries[row.versionId];
    return Boolean(
      onSubmitBatch &&
      liveQuery.queueState.status === 'success' &&
      detail &&
      detail.currentVersion.id === row.versionId &&
      detail.currentVersion.status === row.status &&
      salesPlanCanResubmit(detail.currentVersion, roleStages, currentUserId),
    );
  };
  const liveRowSelectable = (row: RegionalApprovalLiveTableRow) => {
    if (row.kind !== 'plan') return false;
    const plans = row.members?.length ? row.members : [row.plan];
    return plans.some(
      (plan) =>
        liveActionDisabledReason(plan, 'APPROVE') === undefined ||
        liveActionDisabledReason(plan, 'REJECT') === undefined ||
        resubmitAllowed(plan),
    );
  };
  // 分组选择会包含待回写/已回写成员；这两类终态在批次中明确跳过。
  // 非终态的权限、版本或读取失败仍阻止执行，不能把未知权限当成可跳过。
  const selectedPendingActionRows = selectedLiveRows.filter(
    (row) => row.status !== 5 && row.status !== 10,
  );
  const batchDisabledReason = (kind: LiveActionKind) => {
    if (!selectedLiveRows.length || liveActionPlanId !== undefined) return undefined;
    if (!selectedPendingActionRows.length) return 'missingAuthority';
    const reasons = selectedPendingActionRows.map((row) => liveActionDisabledReason(row, kind));
    return reasons.find(Boolean);
  };
  const metrics = useMemo(() => {
    const detailMetrics = liveRows.map((row) => versionMetrics[row.planId]);
    const hasCompleteDetailMetrics =
      detailMetrics.length === liveRows.length &&
      detailMetrics.length > 0 &&
      detailMetrics.every(
        (detail) =>
          detail &&
          /^-?\d+(?:\.\d+)?$/.test(detail.baseQty) &&
          /^-?\d+(?:\.\d+)?$/.test(detail.baseAmount),
      );
    const serverSummary = historicalSummaryUnavailable
      ? undefined
      : liveQuery.queueState.data?.summary;
    return {
      visibleCount: liveRows.length,
      pendingCount: liveRows.filter((row) => row.approvalState === 'pending').length,
      warningCount: liveRows.filter((row) => row.approvalState === 'returned').length,
      // 汇总读展示行（含版本汇总与本节点调整），和表格里看到的数保持一致。
      quantity: serverSummary
        ? (serverSummary.planQty ?? '—')
        : draftedLiveRows.length === 0
          ? '0'
          : draftedLiveRows.every((row) => /^-?\d+(?:\.\d+)?$/.test(row.currentQty))
            ? addExactDecimals(draftedLiveRows.map((row) => row.currentQty))
            : hasCompleteDetailMetrics
              ? addExactDecimals(detailMetrics.map((detail) => detail!.baseQty))
              : '—',
      amount: serverSummary
        ? (serverSummary.planAmount ?? '—')
        : draftedLiveRows.length === 0
          ? '0'
          : draftedLiveRows.every((row) => /^-?\d+(?:\.\d+)?$/.test(row.currentAmount))
            ? addExactDecimals(draftedLiveRows.map((row) => row.currentAmount))
            : hasCompleteDetailMetrics
              ? addExactDecimals(detailMetrics.map((detail) => detail!.baseAmount))
              : '—',
      targetAmount:
        serverSummary?.targetAmount ??
        addExactDecimals(draftedLiveRows.map((row) => row.targetAmount)),
      savedAdjustmentCount: 0,
      localApprovalResultCount: 0,
    };
  }, [
    scopeSummary,
    draftedLiveRows,
    liveRows,
    versionMetrics,
    historicalSummaryUnavailable,
    liveQuery.queueState.data?.summary,
  ]);
  const dashboardReady = liveQuery.queueState.status === 'success' && !liveCategoriesLoading;
  const amountVariance =
    metrics.targetAmount !== undefined && metrics.amount !== '—'
      ? subtractExactDecimals(metrics.amount, metrics.targetAmount)
      : undefined;

  useEffect(() => {
    writeAssistantSurfaceState<PersistedApprovalWorkbenchState>(
      'forecast',
      `${scopedState}:regional-approval-state`,
      {
        ...readAssistantSurfaceState<Record<string, unknown>>(
          'forecast',
          `${scopedState}:regional-approval-state`,
          {},
        ),
        page,
        pageSize,
        dimension,
        categoryComparison,
        stageLaneOpen,
        selectedRowIds,
        liveActionReceipts,
        draftLiveFilters,
        appliedLiveFilters,
      },
    );
  }, [
    categoryComparison,
    stageLaneOpen,
    dimension,
    liveActionReceipts,
    draftLiveFilters,
    appliedLiveFilters,
    page,
    pageSize,
    scopedState,
    selectedRowIds,
  ]);

  useEffect(() => {
    writeAssistantSurfaceState(
      'forecast',
      `${scopedState}:regional-approval-detail-state`,
      viewState,
    );
  }, [viewState, scopedState]);

  useEffect(() => {
    setLiveActionPlanId(undefined);
    setLiveAuthorityContext(undefined);
    setPermissionDeniedVersions(new Set());
  }, [appliedLiveFilters, liveQuery.selectedPeriodMonth, page, pageSize]);

  useEffect(() => {
    if (liveQuery.queueState.status !== 'success') return;
    // 分页改为按分组后的外层行：页码只受本地页数约束，数据变化后越界就回到最后一页。
    if (page !== liveCurrentPage) setPage(liveCurrentPage);
  }, [liveQuery.queueState.status, page, liveCurrentPage]);

  const liveEvidence = useMemo<RegionalApprovalWorkbenchContext['evidence']>(() => {
    const queueData = liveQuery.queueState.data;
    const queryError =
      liveQuery.queueState.status === 'error'
        ? liveQuery.queueState.error
        : liveQuery.periodsState.status === 'error'
          ? liveQuery.periodsState.error
          : undefined;
    if (queueData) {
      return {
        source: 'gea-user-session',
        permission: 'read-only',
        completeness: 'paged-queue',
        queryState: queryError
          ? 'stale-error'
          : liveQuery.queueState.status === 'loading' || liveQuery.periodsState.status === 'loading'
            ? 'refreshing'
            : queueData.records.length === 0
              ? 'empty'
              : 'success',
        error: queryError,
        dataVersion: 'sales-plan-v1.11',
      };
    }

    if (liveQuery.periodsState.status === 'success') {
      return {
        source: 'gea-user-session',
        permission: 'read-only',
        completeness: 'periods-only',
        queryState:
          liveQuery.periods.length === 0
            ? 'empty-periods'
            : liveQuery.queueState.status === 'error'
              ? 'error'
              : 'loading',
        error: queryError,
        dataVersion: 'sales-plan-v1.11',
      };
    }

    return {
      source: 'unverified',
      permission: 'read-only',
      completeness: 'none',
      queryState: queryError ? 'error' : 'loading',
      error: queryError,
      dataVersion: 'unverified',
    };
  }, [liveQuery.periods.length, liveQuery.periodsState, liveQuery.queueState]);

  // 这一屏"渲染出来的元素"：行 / 控件 / 可编辑字段，供页面桥声明给模型。
  const catalogElements = useMemo<PageElement[]>(() => {
    const fields = liveRows.flatMap((row) =>
      expandedLiveRowKeys.includes(row.planId) ? (inlineElements[row.planId]?.fields ?? []) : [],
    );
    // 每一行都给一个"整行一起改"的集合：不必先展开，页面收到后会自己展开并加载 SKU。
    const collections = liveRows.map((row) => {
      const label = projectRegionalApprovalLiveDimension(row, dimension).name ?? row.planId;
      const members = inlineElements[row.planId]?.collection?.members ?? [];
      return {
        id: `collection:${row.planId}:qty`,
        label: `${label} 全部 SKU 的确认计划量（无需展开，填同一个值）`,
        members,
      };
    });
    return buildWorkbenchElements({
      rows: liveRows.map((row) => ({
        planId: row.planId,
        // label 不带勾选状态：勾选变化不该让元素清单整份变掉（它已经在页面状态里）。
        label: projectRegionalApprovalLiveDimension(row, dimension).name ?? row.planId,
        value: String(row.currentAmount ?? ''),
        expanded: expandedLiveRowKeys.includes(row.planId),
      })),
      selectedPlanIds: selectedRowIds,
      stage: liveStageFilter ?? 'all',
      stageOptions: [
        { value: 'all', label: '不限阶段' },
        ...roleStages.map((stage) => ({
          value: stage,
          label: t(stageLabelKey(stage)),
        })),
      ],
      filters: [
        {
          field: 'areaCode',
          label: '大区筛选',
          value: appliedLiveFilters.areaCode,
          options: liveFilterOptions.areas.map((option) => ({
            value: option.value,
            label: option.label ?? option.value,
          })),
        },
        {
          field: 'provinceCode',
          label: '省区筛选',
          value: appliedLiveFilters.provinceCode,
          options: liveFilterOptions.provinces.map((option) => ({
            value: option.value,
            label: option.label ?? option.value,
          })),
        },
        {
          field: 'orgCode',
          label: '组织筛选',
          value: appliedLiveFilters.orgCode,
          options: liveFilterOptions.organizations.map((option) => ({
            value: option.value,
            label: option.label ?? option.value,
          })),
        },
        {
          field: 'dealerCode',
          label: '经销商筛选',
          value: appliedLiveFilters.dealerCode,
          options: liveFilterOptions.customers.map((option) => ({
            value: option.dealerCode,
            label: option.dealerName ?? option.baseName ?? option.dealerCode,
          })),
        },
        {
          field: 'status',
          label: '状态筛选',
          value: appliedLiveFilters.status,
          options: [],
        },
      ],
      page,
      pages: liveQuery.queueState.data?.pages ?? 1,
      fields,
      collections,
      ...(() => {
        // 工具栏动作：只有按钮当前可点时才声明，和人工能点的范围一致。
        const actionRow = selectedLiveRows.length === 1 ? selectedLiveRows[0] : undefined;
        const actionElements: Array<{
          id: string;
          label: string;
          actions: string[];
          effect?: 'submit' | 'approve';
        }> = [];
        if (liveActionsEnabled && actionRow) {
          if (!liveActionDisabledReason(actionRow))
            actionElements.push({
              id: 'action:approve',
              label: `通过（${projectRegionalApprovalLiveDimension(actionRow, dimension).name ?? actionRow.planId}）`,
              actions: ['invoke'],
              // 通过会真的落审批状态：对话必须在用户明确要求、并带上 confirm 时才下发。
              effect: 'approve',
            });
          if (actionRow.status !== 5 && !liveActionDisabledReason(actionRow, 'REJECT'))
            actionElements.push({
              id: 'action:reject',
              label: `退回（${projectRegionalApprovalLiveDimension(actionRow, dimension).name ?? actionRow.planId}）`,
              actions: ['invoke'],
              effect: 'approve',
            });
        }
        return actionElements.length === 0 ? {} : { actionElements };
      })(),
      ...(activeLiveActionRow
        ? {
            dialog: {
              label: `${liveActionKind === 'REJECT' ? '退回' : '通过'}审批对话框（${
                projectRegionalApprovalLiveDimension(activeLiveActionRow, dimension).name ??
                activeLiveActionRow.planId
              }）`,
              actions: liveActionKind === 'APPROVE' ? [] : ['confirm', 'cancel'],
              fields:
                liveActionKind === 'REJECT'
                  ? [
                      {
                        id: 'dialog:approval:remark',
                        label: '退回理由',
                        value: '',
                        editable: true,
                      },
                    ]
                  : [],
            },
          }
        : {}),
    });
  }, [
    appliedLiveFilters,
    dimension,
    expandedLiveRowKeys,
    inlineElements,
    liveFilterOptions,
    liveQuery.queueState.data?.pages,
    liveRows,
    liveStageFilter,
    page,
    roleStages,
    selectedRowIds,
    t,
  ]);

  useEffect(() => {
    const selectedAuthority =
      selectedLiveRows.length === 1
        ? liveAuthorityContext?.planId === selectedLiveRows[0].planId &&
          liveAuthorityContext.source === 'gea-user-session-action'
          ? liveAuthorityContext
          : projectSalesPlanQueryContext(selectedLiveRows[0], contextFilterSummary)
        : undefined;
    const authority =
      selectedAuthority ??
      (liveQuery.queueState.status === 'success'
        ? projectSalesPlanQueryContext(undefined, contextFilterSummary)
        : undefined);
    onContextChange(
      {
        ...(automaticAnalysisEnabled ? { analysisSummary: scopeSummary } : {}),
        view: 'regional-approval',
        scope: {
          dimension,
          categoryComparison,
          primaryVersionId: inlineComparison
            ? versionMetrics[focusedLiveRow?.planId ?? '']?.versionId
            : focusedLiveRow?.versionId,
          compareVersionId: inlineComparison
            ? versionMetrics[focusedLiveRow?.planId ?? '']?.compareVersionId
            : undefined,
          versionReferencePlanId: focusedLiveRow?.planId,
          currentVersionId: focusedLiveRow?.versionId,
          planType:
            liveQuery.selectedPlanTypeCode ??
            (liveQuery.selectedPeriods.length > 1 ? 'mixed' : 'unknown'),
          month: liveQuery.selectedPeriodMonth ?? '',
          approvalStage: effectiveStage,
          authority: 'organization',
          primaryVersion: inlineComparison?.primaryOffset ? 'previous' : 'current',
          compareVersion: inlineComparison?.compareOffset === 0 ? 'current' : 'previous',
          appliedFilters: contextAppliedFilters,
        },
        visibleEntities: draftedLiveRows.map((row) => projectLiveContextEntity(row, dimension)),
        selectedEntities: selectedLiveRows.map((row) => projectLiveContextEntity(row, dimension)),
        expandedPlanIds: expandedLiveRowKeys.filter((id): id is string => typeof id === 'string'),
        expandedFields: liveRows
          .filter((row) => expandedLiveRowKeys.includes(row.planId))
          .flatMap((row) => inlineElements[row.planId]?.fields ?? [])
          .slice(0, 120),
        metrics,
        pagination: {
          // 与界面一致：分页对象是分组后的外层组织行。
          page: liveCurrentPage,
          pageSize,
          total: liveOuterRows.length,
        },
        evidence: liveEvidence,
        authority,
      },
      conversationId,
    );
  }, [
    automaticAnalysisEnabled,
    scopeSummary,
    dimension,
    categoryComparison,
    inlineComparison,
    focusedLiveRow?.planId,
    focusedLiveRow?.versionId,
    contextAppliedFilters,
    conversationId,
    metrics,
    liveQuery.queueState.data,
    liveQuery.selectedPeriodMonth,
    liveQuery.selectedPeriods.length,
    liveQuery.selectedPlanTypeCode,
    liveEvidence,
    liveAuthorityContext,
    draftedLiveRows,
    liveRows,
    liveCurrentPage,
    liveOuterRows,
    expandedLiveRowKeys,
    inlineElements,
    onContextChange,
    page,
    pageSize,
    selectedLiveRows,
    contextFilterSummary,
  ]);

  const selectLivePlanContext = (row: RegionalApprovalLiveRow) => {
    setLiveAuthorityContext(projectSalesPlanQueryContext(row, contextFilterSummary));
  };

  const changeStage = (stage: ApprovalStageId) => {
    if (orderType === 'Z' && liveStageFilter === stage) return;
    // 再点当前节点就回到「全部节点」；没权限的节点已置灰，切不过来。
    const nextStage = liveStageFilter === stage ? undefined : stage;
    setLiveStageFilter(nextStage);
    setDimension(APPROVAL_DIMENSIONS_BY_STAGE[nextStage ?? 'category'][0]);
    setDraftLiveFilters((current) => ({ ...current, status: ALL_ORGANIZATIONS }));
    setAppliedLiveFilters((current) => ({ ...current, status: ALL_ORGANIZATIONS }));
    setSelectedRowIds([]);
    setPage(1);
    return;
  };

  const updateLiveDraftFilter = (field: keyof LiveApprovalFilters, value: string) => {
    if (field === 'status') setLiveStageFilter(undefined);
    const next = { ...draftLiveFilters, [field]: value };
    if (field === 'areaCode') {
      next.provinceCode = ALL_ORGANIZATIONS;
      next.orgCode = ALL_ORGANIZATIONS;
      next.dealerCode = ALL_ORGANIZATIONS;
    } else if (field === 'provinceCode') {
      next.orgCode = ALL_ORGANIZATIONS;
      next.dealerCode = ALL_ORGANIZATIONS;
    } else if (field === 'orgCode') {
      next.dealerCode = ALL_ORGANIZATIONS;
    }
    setDraftLiveFilters(next);
    setAppliedLiveFilters(next);
    setSelectedRowIds([]);
    setPage(1);
    setExportFeedback(undefined);
  };

  const applyFilters = () => {
    setAppliedLiveFilters(draftLiveFilters);
    setSelectedRowIds([]);
    setPage(1);
    return;
  };

  const resetFilters = () => {
    setDraftLiveFilters(EMPTY_LIVE_APPROVAL_FILTERS);
    setAppliedLiveFilters(EMPTY_LIVE_APPROVAL_FILTERS);
    setLiveStageFilter(undefined);
    setSelectedRowIds([]);
    setPage(1);
    setExportFeedback(undefined);
    return;
  };

  // AG-UI 前端工具：右侧对话让页面改这一屏怎么看，只改视图，不改任何 GEA 数据。
  // 参数是外部来源，先按当前可见行核对 planId，再走和手动操作一样的 setState；
  // 结果统一按 AG-UI 的 tool 消息回填（失败必须带 error）。
  const appliedToolCallRef = useRef<string>();
  // 始终指向最新的字段上报，供 apply 等待"值真的落上去"。
  const inlineElementsRef = useRef(inlineElements);
  inlineElementsRef.current = inlineElements;
  // 元素清单改变时上报给页面桥（独立通道，不进页面状态快照）。
  useEffect(() => {
    onCatalogChange?.(catalogElements);
  }, [catalogElements, onCatalogChange]);
  useEffect(() => {
    if (!toolCall || appliedToolCallRef.current === toolCall.toolCallId) return;
    appliedToolCallRef.current = toolCall.toolCallId;
    void (async () => {
      const { toolCallId, command } = toolCall;
      const settled = (applied: boolean, error?: string) =>
        onToolResult?.(toolCallId, applied, error);

      const args = command;
      const kind = typeof args.kind === 'string' ? args.kind : '';
      const targets = [
        ...(typeof args.target === 'string' ? [args.target] : []),
        ...(Array.isArray(args.targets)
          ? (args.targets as unknown[]).filter(
              (value): value is string => typeof value === 'string',
            )
          : []),
      ];
      const value = typeof args.value === 'string' ? args.value : undefined;
      const action = typeof args.action === 'string' ? args.action : undefined;
      const rejectWith = (error: string) => settled(false, error);

      switch (kind) {
        case 'invoke': {
          for (const id of targets) {
            if (id === 'filters' && action === 'reset') {
              resetFilters();
              continue;
            }
            if (id === 'action:approve' || id === 'action:reject') {
              const row = selectedLiveRows.length === 1 ? selectedLiveRows[0] : undefined;
              if (!row) return rejectWith('NO_SELECTED_ROW');
              const kind = id === 'action:approve' ? 'APPROVE' : 'REJECT';
              if (liveActionDisabledReason(row, kind === 'REJECT' ? 'REJECT' : undefined))
                return rejectWith('ACTION_NOT_ALLOWED');
              selectLivePlanContext(row);
              setLiveActionKind(kind);
              setLiveActionPlanId(row.planId);
              continue;
            }
            if (id === 'dialog:approval') {
              if (action === 'confirm') {
                setApprovalSubmitRequest({ at: Date.now() });
                continue;
              }
              if (action === 'cancel') {
                setLiveActionPlanId(undefined);
                continue;
              }
              return rejectWith('ACTION_NOT_ALLOWED');
            }
            if (id.startsWith('row:')) {
              const planId = id.slice('row:'.length);
              if (action === 'expand') {
                setExpandedLiveGroups((current) =>
                  current.includes(planId) ? current : [...current, planId],
                );
              } else if (action === 'collapse') {
                setExpandedLiveGroups((current) =>
                  current.filter((candidate) => candidate !== planId),
                );
              } else if (action === 'openDetail') {
                const row = liveRows.find((candidate) => candidate.planId === planId);
                if (!row) return rejectWith('PLAN_NOT_ON_CURRENT_PAGE');
                selectLivePlanContext(row);
                setFocusedLivePlanId(row.planId);
                setInlinePlanId(row.planId);
              } else {
                return rejectWith('ACTION_NOT_ALLOWED');
              }
              continue;
            }
            return rejectWith('UNKNOWN_ELEMENT');
          }
          break;
        }
        case 'select': {
          if (targets.some((id) => !id.startsWith('row:'))) return rejectWith('UNKNOWN_ELEMENT');
          setSelectedRowIds([...new Set(targets.map((id) => id.slice('row:'.length)))]);
          break;
        }
        case 'setValue': {
          if (value === undefined) return rejectWith('MISSING_VALUE');
          for (const id of targets) {
            if (id === 'stage') {
              const stage = value === 'all' ? undefined : (value as ApprovalStageId);
              setLiveStageFilter(stage);
              setDimension(APPROVAL_DIMENSIONS_BY_STAGE[stage ?? 'category'][0]);
              setDraftLiveFilters((current) => ({
                ...current,
                status: ALL_ORGANIZATIONS,
              }));
              setAppliedLiveFilters((current) => ({
                ...current,
                status: ALL_ORGANIZATIONS,
              }));
              setSelectedRowIds([]);
              setPage(1);
              continue;
            }
            if (id === 'pager') {
              const next = Number(value);
              const pages = liveQuery.queueState.data?.pages ?? 1;
              if (!Number.isInteger(next) || next < 1 || next > pages)
                return rejectWith('PAGE_OUT_OF_RANGE');
              setPage(next);
              setSelectedRowIds([]);
              continue;
            }
            if (id.startsWith('filter:')) {
              updateLiveDraftFilter(id.slice('filter:'.length) as keyof LiveApprovalFilters, value);
              continue;
            }
            if (id === 'dialog:approval:remark') {
              setApprovalRemarkPatch({ at: Date.now(), remark: value });
              continue;
            }
            if (id.startsWith('field:') || id.startsWith('collection:')) {
              if (id.startsWith('field:') && !id.endsWith(':qty'))
                return rejectWith('READ_ONLY_FIELD');
              const planId = id.split(':')[1];
              const row = liveRows.find((candidate) => candidate.planId === planId);
              if (!row) return rejectWith('PLAN_NOT_ON_CURRENT_PAGE');
              // 复用界面自己的编辑权限判断：不允许编辑的计划，对话也改不了。
              if (!inlineSkuAccess(row).detail) return rejectWith('NO_EDIT_PERMISSION');
              const skuCode = id.startsWith('field:') ? id.split(':')[2] : undefined;
              setExpandedLiveGroups((current) =>
                current.includes(row.planId) ? current : [...current, row.planId],
              );
              setDraftPatch({
                at: Date.now(),
                planId: row.planId,
                quantity: value,
                ...(skuCode === undefined ? {} : { skuCodes: [skuCode] }),
              });
              // 等字段真的变成目标值再回执：只报"收到"会让模型以为改好了。
              const landedDeadline = Date.now() + 4000;
              let landed = false;
              while (Date.now() < landedDeadline) {
                await new Promise((resolve) => setTimeout(resolve, 150));
                const reported = inlineElementsRef.current[row.planId]?.fields ?? [];
                const target = skuCode
                  ? reported.filter((field) => field.id.endsWith(`:${skuCode}:qty`))
                  : reported.filter((field) => field.id.endsWith(':qty'));
                if (target.length > 0 && target.every((field) => field.value === value)) {
                  landed = true;
                  break;
                }
              }
              if (!landed) return rejectWith('VALUE_NOT_APPLIED');
              continue;
            }
            return rejectWith('UNKNOWN_ELEMENT');
          }
          break;
        }
        case 'clear': {
          setInlinePlanId(undefined);
          setExpandedLiveGroups([]);
          break;
        }
        default:
          return rejectWith('UNKNOWN_VERB');
      }
      settled(true);
    })();
  }, [toolCall]);

  const exportScope = JSON.stringify([
    scopedState,
    liveQueryScope,
    liveQuery.selectedPeriodMonth,
    liveStageFilter,
    page,
    pageSize,
  ]);
  const exportScopeRef = useRef(exportScope);
  const exportRowsRef = useRef(liveRows);
  const exportMountedRef = useRef(true);
  const exportRequestRef = useRef<AbortController | null>(null);
  const [exporting, setExporting] = useState(false);
  useEffect(() => () => exportRequestRef.current?.abort(), [exportScope, liveRows]);
  exportScopeRef.current = exportScope;
  exportRowsRef.current = liveRows;
  useEffect(() => {
    exportMountedRef.current = true;
    return () => {
      exportMountedRef.current = false;
    };
  }, []);
  const exportQueue = async () => {
    if (exportRequestRef.current) return;

    if (liveQuery.queueState.status !== 'success' || liveRows.length === 0) {
      setExportFeedback({
        type: 'warning',
        message: t('common.assistantSurface.regionalApproval.exportFeedback.empty'),
      });
      return;
    }
    const request = new AbortController();
    exportRequestRef.current = request;
    setExporting(true);
    const timeout = window.setTimeout(() => request.abort(), 30_000);
    let readingDetails = false;
    const scopeChanged = () =>
      !exportMountedRef.current ||
      exportScopeRef.current !== exportScope ||
      exportRowsRef.current !== liveRows;
    try {
      const XLSX = await import('xlsx-republish');
      if (
        !exportMountedRef.current ||
        exportScopeRef.current !== exportScope ||
        exportRowsRef.current !== liveRows
      )
        return;
      if (
        liveRows.some(
          (row) =>
            [row.planId, row.versionId, row.periodId, row.dealerCode].some(
              (value) => !String(value ?? '').trim(),
            ) ||
            [row.targetQty, row.targetAmount].some((value) => !/^-?\d+(?:\.\d+)?$/.test(value)),
        )
      ) {
        setExportFeedback({
          type: 'error',
          message: t('common.assistantSurface.regionalApproval.exportFeedback.missingData'),
        });
        return;
      }
      readingDetails = true;
      const amounts: SalesPlanExportAmounts[] = [];
      let nextRow = 0;
      await Promise.all(
        Array.from({ length: Math.min(4, liveRows.length) }, async () => {
          while (nextRow < liveRows.length) {
            request.signal.throwIfAborted();
            const index = nextRow++;
            const row = liveRows[index];
            // oxlint-disable-next-line no-await-in-loop -- bound detail reads to four concurrent requests；详情读取并发限制为四个。
            const skus = await (detailClient ?? salesPlan).versionSkus.invoke({
              versionId: row.versionId,
              signal: request.signal,
            });
            amounts[index] = aggregateSalesPlanExportAmounts(row, skus);
          }
        }),
      );
      request.signal.throwIfAborted();
      if (scopeChanged()) return;
      readingDetails = false;
      const numericValue = (value: string) => {
        const numeric = Number(value);
        return Number.isFinite(numeric) &&
          Math.abs(numeric) <= Number.MAX_SAFE_INTEGER &&
          value.replace(/[-.]/g, '').replace(/^0+/, '').replace(/0+$/, '').length <= 15 &&
          !String(numeric).includes('e') &&
          isExactZero(subtractExactDecimals(String(numeric), value))
          ? numeric
          : value;
      };
      const headers = [
        'planId',
        'versionId',
        'periodId',
        'dealerCode',
        'status',
        'seq',
        'areaCode',
        'areaName',
        'provinceCode',
        'provinceName',
        'orgCode',
        'orgName',
        'baseName',
        'dealerName',
        'skuCount',
        'targetQty',
        'targetAmount',
        'qty',
        'amt',
        'regionConfirmedQty',
        'regionConfirmedAmount',
        'provinceConfirmedQty',
        'provinceConfirmedAmount',
        'areaConfirmedQty',
        'areaConfirmedAmount',
        'categoryConfirmedQty',
        'categoryConfirmedAmount',
        'submitter',
        'submitTime',
        'finishedAt',
        'updatedAt',
        'returnReason',
        'statusCode',
      ] as const;
      const sheet = XLSX.utils.aoa_to_sheet([
        headers.map((field) =>
          t(`common.assistantSurface.regionalApproval.exportColumns.${field}`),
        ),
        ...liveRows.map((row, index) => [
          row.planId,
          row.versionId,
          row.periodId,
          row.dealerCode,
          salesPlanStatusText(row.status, row.planTypeCode, t),
          row.seq,
          row.areaCode ?? '',
          row.areaName ?? row.regionName ?? '',
          row.provinceCode ?? '',
          row.provinceName ?? row.provinceRegionName ?? '',
          row.orgCode ?? '',
          row.orgName ?? row.salesGroupName ?? '',
          row.baseName ?? '',
          row.dealerName ?? '',
          row.skuCount,
          numericValue(row.targetQty),
          numericValue(row.targetAmount),
          ...SALES_PLAN_EXPORT_AMOUNT_PAIRS.flatMap((fields) =>
            fields.map((field) =>
              amounts[index][field] == null ? null : numericValue(amounts[index][field]),
            ),
          ),
          row.submitter ?? '',
          row.submitTime ?? '',
          row.finishedAt ?? '',
          row.updatedAt ?? '',
          row.returnReason ?? '',
          row.status,
        ]),
      ]);
      sheet['!cols'] = headers.map(() => ({ wch: 24 }));
      for (let row = 2; row <= liveRows.length + 1; row++) {
        for (const field of [
          'targetAmount',
          ...SALES_PLAN_EXPORT_AMOUNT_PAIRS.map((pair) => pair[1]),
        ] as const) {
          const column = XLSX.utils.encode_col(headers.indexOf(field));
          if (sheet[`${column}${row}`]?.t === 'n') sheet[`${column}${row}`].z = '#,##0.00';
        }
      }
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(
        workbook,
        sheet,
        t('common.assistantSurface.regionalApproval.exportColumns.sheet'),
      );
      const exportLabel = (key: string) =>
        t(`common.assistantSurface.regionalApproval.exportScope.${key}`);
      const metadata = [
        [exportLabel('scope'), exportLabel('currentPage')],
        [exportLabel('month'), liveQuery.selectedPeriodMonth ?? '—'],
        [exportLabel('version'), exportLabel('currentVersion')],
        [exportLabel('page'), liveCurrentPage],
        [exportLabel('pageSize'), pageSize],
        [exportLabel('exported'), liveRows.length],
        [exportLabel('total'), liveOuterRows.length],
        [
          exportLabel('stage'),
          t(`common.assistantSurface.regionalApproval.stages.${liveStageFilter ?? 'all'}`),
        ],
        ...(['areaCode', 'provinceCode', 'orgCode', 'dealerCode', 'status'] as const).map(
          (field) => [exportLabel(field), String(liveQueryScope[field] ?? exportLabel('all'))],
        ),
      ];
      const scopeSheet = XLSX.utils.aoa_to_sheet(metadata);
      scopeSheet['!cols'] = [{ wch: 20 }, { wch: 42 }];
      XLSX.utils.book_append_sheet(workbook, scopeSheet, exportLabel('sheet'));
      const data = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
      const url = URL.createObjectURL(
        new Blob([data], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }),
      );
      const link = document.createElement('a');
      link.href = url;
      link.download = `sales-plan-approval-${liveQuery.selectedPeriodMonth ?? 'period'}-${liveStageFilter ?? 'all'}-page-${liveCurrentPage}.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
      setExportFeedback({
        type: 'success',
        message: t('common.assistantSurface.regionalApproval.exportFeedback.successLive', {
          count: liveRows.length,
        }),
      });
    } catch {
      request.abort();
      if (!scopeChanged()) {
        setExportFeedback({
          type: 'error',
          message: t(
            readingDetails
              ? 'common.assistantSurface.regionalApproval.exportFeedback.detailsFailed'
              : 'common.assistantSurface.regionalApproval.exportFeedback.failed',
          ),
        });
      }
    } finally {
      window.clearTimeout(timeout);
      if (exportRequestRef.current === request) {
        exportRequestRef.current = null;
        if (exportMountedRef.current) setExporting(false);
      }
    }
    return;
  };

  // 节点条始终展示全部节点：角色决定能进哪些节点，没权限的节点置灰不可点，
  // 明细由数据权限决定，因此「全部节点」这一视图保留。
  const stageAuthorized = (id: ApprovalStageId) =>
    (authorizedStages as readonly ApprovalStageId[]).includes(id);

  // 先保留可读的最小宽度，再把面板剩余空间分配给内容列。
  // Keep the approval queue dense once its columns have enough room to scan.
  // The expanded SKU table deliberately follows a separate, roomier layout.
  const liveMinimumWidths =
    orderType === 'Z' ? [220, 112, 136, 136, 120, 136] : [220, 112, 136, 136];
  // 选择框与展开按钮各占 40px，必须一起计入列宽预算。
  const liveMinimumWidth = liveMinimumWidths.reduce(
    (total, width) => total + width,
    inlineComparison ? 396 : 260,
  );
  const liveTableWidth = Math.max(
    liveMinimumWidth,
    Math.min(tableViewportWidth || liveMinimumWidth, 960),
  );
  const liveExtraWidth = Math.max(0, liveTableWidth - liveMinimumWidth);
  const liveColumnWeights =
    orderType === 'Z' ? [0.28, 0.14, 0.14, 0.16, 0.12, 0.16] : [0.44, 0.2, 0.2, 0.16];
  const liveColumnWidths = liveMinimumWidths.map(
    (width, index) => width + liveExtraWidth * liveColumnWeights[index],
  );
  const pinLiveColumns = tableViewportWidth >= liveTableWidth;
  const liveApprovalStatusTag = (
    tableRow: Extract<RegionalApprovalLiveTableRow, { kind: 'plan' }>,
  ) => {
    const row = tableRow.plan;
    return (
      <Tag
        className={styles.approvalStatusTag}
        data-approval-tone={
          row.approvalState === 'approved'
            ? 'success'
            : row.approvalState === 'returned'
              ? 'warning'
              : 'neutral'
        }
        color={
          row.approvalState === 'approved'
            ? 'green'
            : row.approvalState === 'returned'
              ? 'orange'
              : 'gray'
        }
        data-testid={`regional-approval-status-${row.planId}`}
      >
        {(tableRow.members ? tableRow.members.every(sourceTypeReadOnly) : sourceTypeReadOnly(row))
          ? `${t(row.orderType === 'M' ? 'common.correction.monthlySourceReadOnly' : 'common.correction.correctionSourceReadOnly')} · ${salesPlanStatusText(row.status, row.planTypeCode, t)}`
          : tableRow.members && new Set(tableRow.members.map((member) => member.status)).size > 1
            ? t('common.assistantSurface.regionalApproval.mixedApprovalStatus')
            : salesPlanQueueStatusText(
                row.status,
                row.planTypeCode,
                liveStageFilter ?? 'category',
                t,
              )}
      </Tag>
    );
  };

  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const month = liveQuery.selectedPeriodMonth;
  const timeProgress =
    orderType !== 'Z' || !month || !/^\d{4}-\d{2}$/.test(month)
      ? undefined
      : month < currentMonth
        ? 100
        : month > currentMonth
          ? 0
          : (now.getDate() / new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()) * 100;
  const liveColumns: TableColumnProps<RegionalApprovalLiveTableRow>[] = [
    {
      title: t('common.assistantSurface.regionalApproval.columns.organization'),
      width: liveColumnWidths[0],
      fixed: pinLiveColumns ? 'left' : undefined,
      render: (_, tableRow) => {
        if (tableRow.kind === 'category') {
          return (
            <div
              className={styles.categoryOrganizationCell}
              data-testid={`regional-approval-category-row-${tableRow.plan.planId}-${tableRow.category.categoryName}`}
            >
              <div>
                <Button
                  type="text"
                  size="small"
                  className={styles.categoryDetailTrigger}
                  aria-expanded={expandedLiveGroups.includes(tableRow.tableRowId)}
                  onClick={() =>
                    setExpandedLiveGroups((current) =>
                      current.includes(tableRow.tableRowId)
                        ? current.filter((id) => id !== tableRow.tableRowId)
                        : [...current, tableRow.tableRowId],
                    )
                  }
                >
                  {t('common.assistantSurface.regionalApproval.categoryRows.name', {
                    category: tableRow.category.categoryName,
                  })}
                </Button>
                <small>
                  {t('common.assistantSurface.regionalApproval.categoryRows.skuCount', {
                    count: tableRow.category.skuCount,
                  })}
                </small>
              </div>
            </div>
          );
        }
        const row = tableRow.plan;
        const projection = projectRegionalApprovalLiveDimension(
          tableRow.plan,
          tableRow.displayDimension ?? (tableRow.childPlan ? 'customer' : dimension),
        );
        const organizationName =
          projection.name ??
          t('common.assistantSurface.regionalApproval.query.unnamedOrganization');
        const rowExpanded = tableRow.members
          ? expandedLiveGroups.includes(tableRow.tableRowId)
          : inlinePlanId === row.planId;
        return (
          <div className={styles.organizationCell}>
            <div className={styles.organizationTitle}>
              <Button
                type="text"
                size="small"
                className={styles.detailTrigger}
                onClick={() => {
                  if (tableRow.members) {
                    setExpandedLiveGroups((current) =>
                      current.includes(tableRow.tableRowId)
                        ? current.filter((id) => id !== tableRow.tableRowId)
                        : [...current, tableRow.tableRowId],
                    );
                    return;
                  }
                  selectLivePlanContext(row);
                  setFocusedLivePlanId(row.planId);
                  setInlinePlanId((current) => (current === row.planId ? undefined : row.planId));
                }}
                aria-label={t(
                  tableRow.members
                    ? 'common.assistantSurface.regionalApproval.expandOrganization'
                    : 'common.assistantSurface.regionalApproval.liveAdjustment.openFor',
                  {
                    plan: organizationName,
                  },
                )}
                aria-expanded={
                  tableRow.members ? expandedLiveGroups.includes(tableRow.tableRowId) : undefined
                }
                title={
                  organizationName ===
                  t('common.assistantSurface.regionalApproval.query.unnamedOrganization')
                    ? t('common.assistantSurface.regionalApproval.query.unnamedOrganizationHint')
                    : organizationName
                }
              >
                {/* 展开态用名称前置小三角体现，不再单独占一列控件。 */}
                <span
                  className={styles.organizationCaret}
                  data-expanded={rowExpanded}
                  aria-hidden="true"
                >
                  {rowExpanded ? <Down size={12} /> : <Right size={12} />}
                </span>
                {organizationName}
              </Button>
              {liveApprovalStatusTag(tableRow)}
            </div>
            <span
              className={styles.organizationPath}
              data-testid={`regional-approval-scope-${row.planId}`}
              title={projection.context.join(' / ')}
            >
              {tableRow.members
                ? t('common.assistantSurface.regionalApproval.organizationGroupCount', {
                    count: tableRow.members.length,
                  })
                : projection.context.length > 0
                  ? projection.context.map((name, index) => (
                      <React.Fragment key={`${name}-${index}`}>
                        {index > 0 ? ' / ' : null}
                        <span>{name}</span>
                      </React.Fragment>
                    ))
                  : '—'}
            </span>
            {!liveRowSelectable(tableRow) &&
              (tableRow.members ?? [row]).some((plan) => {
                const version = liveAccess.entries[plan.versionId]?.currentVersion;
                return (
                  plan.status === 6 &&
                  version?.status === 6 &&
                  !salesPlanCanResubmit(version, roleStages, currentUserId)
                );
              }) && (
                <div role="note" className={styles.resubmitUnavailable}>
                  {t(
                    'common.assistantSurface.regionalApproval.liveSubmit.disabled.unconfirmedSubmitter',
                  )}
                </div>
              )}
          </div>
        );
      },
    },
    {
      title: t('common.correction.target'),
      width: liveColumnWidths[1],
      render: (_, tableRow) => {
        const row = tableRow.plan;
        if (tableRow.kind === 'category') {
          const categories = liveCategorySummaries[row.planId] ?? [];
          const baseTotal = addExactDecimals(categories.map((item) => item.baseAmount));
          const categoryTarget =
            /^-?\d+(?:\.\d+)?$/.test(row.targetAmount) &&
            /^-?\d+(?:\.\d+)?$/.test(baseTotal) &&
            Number(baseTotal) !== 0
              ? String(
                  (Number(row.targetAmount) * Number(tableRow.category.baseAmount)) /
                    Number(baseTotal),
                )
              : '';
          return (
            <div className={styles.stackCell}>
              <span>{categoryTarget ? exactMoney(Number(categoryTarget).toFixed(2)) : '—'}</span>
            </div>
          );
        }
        return (
          <div className={styles.stackCell}>
            <span>
              {/^-?\d+(?:\.\d+)?$/.test(row.targetAmount)
                ? exactMoney(row.targetAmount)
                : t('common.assistantSurface.regionalApproval.versionTargetMissing')}
            </span>
          </div>
        );
      },
    },
    {
      title: inlineComparison
        ? t('common.assistantSurface.regionalApproval.inlineComparison.monthlyPrimary')
        : t('common.correction.plan'),
      width: liveColumnWidths[2],
      render: (_, tableRow) =>
        tableRow.kind === 'category' ? (
          <div
            className={styles.stackCell}
            data-testid={`regional-approval-month-plan-${tableRow.tableRowId}`}
          >
            <span>{exactMoney(tableRow.category.amount)}</span>
            {/* 品类汇总行也带数量，单位跟指标卡一致：业务方 2026-09-23 反馈"数量要带件"。 */}
            <small>
              {/^-?\d+(?:\.\d+)?$/.test(tableRow.category.quantity ?? '')
                ? `${quantityText(tableRow.category.quantity)} ${t('common.assistantSurface.regionalApproval.scopeTotals.quantityUnit')}`
                : '—'}
            </small>
          </div>
        ) : (
          <div
            className={styles.stackCell}
            data-testid={`regional-approval-month-plan-${tableRow.tableRowId}`}
          >
            <span>
              {/^-?\d+(?:\.\d+)?$/.test(tableRow.plan.mPlanAmount ?? '')
                ? exactMoney(tableRow.plan.mPlanAmount!)
                : '—'}
            </span>
            <small title={correctionDisplay(tableRow.plan.mPlanQty, 'quantity').exact}>
              {/^-?\d+(?:\.\d+)?$/.test(tableRow.plan.mPlanQty ?? '')
                ? `${quantityText(tableRow.plan.mPlanQty!)} ${t('common.assistantSurface.regionalApproval.scopeTotals.quantityUnit')}`
                : '—'}
            </small>
          </div>
        ),
    },
    {
      title: t('common.correction.progress'),
      width: liveColumnWidths[3],
      render: (_, tableRow) => {
        if (tableRow.kind === 'plan') {
          const progress = {
            amount:
              tableRow.plan.amountProgress == null
                ? undefined
                : Number(tableRow.plan.amountProgress),
          };
          return (
            <div className={styles.categoryProgressCell}>
              {/* V1.8 #09：达成率用进度条 + 百分比，百分比前不再带「金额」。 */}
              <strong
                title={
                  Number(tableRow.plan.targetAmount) === 0
                    ? t('common.correction.noTarget')
                    : undefined
                }
              >
                {formattedProgress(progress.amount)}
              </strong>
              <div
                className={styles.correctionProgress}
                role={timeProgress == null ? undefined : 'img'}
                aria-label={
                  timeProgress == null
                    ? undefined
                    : `月达成进度 ${formattedProgress(progress.amount)}，时间进度 ${timeProgress.toFixed(1)}%`
                }
              >
                <Progress
                  percent={Math.min(Math.max(progress.amount ?? 0, 0), 100)}
                  showText={false}
                  size="small"
                  color={salesPlanProgressBarColor(progress.amount)}
                />
                {timeProgress != null && <i style={{ left: `${timeProgress}%` }} />}
              </div>
              <small title={tableRow.plan.shipmentError ?? undefined}>
                {tableRow.plan.shipAmount == null ? '—' : exactMoney(tableRow.plan.shipAmount)} /{' '}
                {tableRow.plan.shipQty == null ? (
                  '—'
                ) : (
                  <span title={correctionDisplay(tableRow.plan.shipQty, 'quantity').exact}>
                    {`${quantityText(tableRow.plan.shipQty)} ${t('common.assistantSurface.regionalApproval.scopeTotals.quantityUnit')}`}
                  </span>
                )}
              </small>
              {tableRow.plan.shipmentError && (
                <small title={tableRow.plan.shipmentError}>
                  {t('common.correction.shipmentUnavailable')}
                </small>
              )}
            </div>
          );
        }
        const { category } = tableRow;
        const categories = liveCategorySummaries[tableRow.plan.planId] ?? [];
        const baseTotal = addExactDecimals(categories.map((item) => item.baseAmount));
        const categoryTarget =
          /^-?\d+(?:\.\d+)?$/.test(tableRow.plan.targetAmount) &&
          /^-?\d+(?:\.\d+)?$/.test(baseTotal) &&
          Number(baseTotal) !== 0
            ? (Number(tableRow.plan.targetAmount) * Number(category.baseAmount)) / Number(baseTotal)
            : undefined;
        // 品类金额进度统一按「计划金额 ÷ 目标金额」计算，避免把原计划金额误当作分母。
        const categoryProgress =
          categoryTarget && categoryTarget !== 0
            ? (Number(category.amount) / categoryTarget) * 100
            : undefined;
        return (
          <div className={styles.categoryProgressCell}>
            <strong>{formattedProgress(categoryProgress)}</strong>
            <Progress
              percent={Math.min(categoryProgress ?? 0, 100)}
              showText={false}
              size="small"
              color={salesPlanProgressBarColor(categoryProgress)}
            />
          </div>
        );
      },
    },
  ];

  if (orderType === 'Z')
    liveColumns.push(
      {
        title: t('common.correction.adjustment'),
        width: liveColumnWidths[4],
        render: (_, tableRow) =>
          tableRow.kind === 'category' ||
          sourceTypeReadOnly(tableRow.plan) ||
          tableRow.plan.prevAdjAddQty == null ||
          tableRow.plan.prevAdjCutQty == null ? (
            '—'
          ) : (
            <span>
              <span className={styles.variancePositive}>
                +{quantityText(tableRow.plan.prevAdjAddQty)}
              </span>{' '}
              /{' '}
              <span className={styles.varianceNegative}>
                −{quantityText(tableRow.plan.prevAdjCutQty)}
              </span>
            </span>
          ),
      },
      {
        title: t('common.correction.correctedProgress'),
        width: liveColumnWidths[5],
        render: (_, tableRow) =>
          tableRow.kind === 'category' || sourceTypeReadOnly(tableRow.plan) ? (
            '—'
          ) : (
            <div
              className={styles.categoryProgressCell}
              title={
                Number(tableRow.plan.targetAmount) === 0
                  ? t('common.correction.noTarget')
                  : undefined
              }
            >
              <strong>
                {formattedProgress(
                  tableRow.plan.correctionProgress == null
                    ? undefined
                    : Number(tableRow.plan.correctionProgress),
                )}
              </strong>
              <div
                className={styles.correctionProgress}
                role="img"
                aria-label={`纠偏后进度 ${formattedProgress(tableRow.plan.correctionProgress == null ? undefined : Number(tableRow.plan.correctionProgress))}，时间进度 ${timeProgress?.toFixed(1) ?? '—'}%`}
              >
                <Progress
                  percent={Math.max(
                    0,
                    Math.min(100, Number(tableRow.plan.correctionProgress ?? 0)),
                  )}
                  showText={false}
                  size="small"
                  color={salesPlanProgressBarColor(
                    tableRow.plan.correctionProgress == null
                      ? undefined
                      : Number(tableRow.plan.correctionProgress),
                  )}
                />
                {timeProgress != null && <i style={{ left: `${timeProgress}%` }} />}
              </div>
            </div>
          ),
      },
    );

  const comparisonText = (key: string) =>
    t(`common.assistantSurface.regionalApproval.inlineComparison.${key}`);
  const comparisonMetric = (tableRow: RegionalApprovalLiveTableRow) => {
    if (tableRow.kind === 'category') {
      const categories = comparedCategories[tableRow.plan.planId];
      if (!categories) return undefined;
      const category = categories.find(
        (item) => item.categoryName === tableRow.category.categoryName,
      );
      return { quantity: category?.quantity ?? '0', amount: category?.amount ?? '0' };
    }
    const members = tableRow.members ?? [tableRow.plan];
    const values = members.map((row) => versionMetrics[row.planId]);
    if (
      values.some((value) => value?.compareQty === undefined || value.compareAmount === undefined)
    )
      return undefined;
    return {
      quantity: addExactDecimals(values.map((value) => value.compareQty!)),
      amount: addExactDecimals(values.map((value) => value.compareAmount!)),
    };
  };
  const metricCell = (quantity?: string, amount?: string) => (
    <div className={styles.stackCell}>
      <span>{amount === undefined ? '—' : exactMoney(amount)}</span>
      <small>
        {quantity === undefined
          ? '—'
          : `${quantityText(quantity)} ${t('common.assistantSurface.regionalApproval.scopeTotals.quantityUnit')}`}
      </small>
    </div>
  );
  if (inlineComparison) {
    liveColumns[3] = {
      title: comparisonText('monthlyCompared'),
      width: 136,
      render: (_, row) => {
        const value = comparisonMetric(row);
        return metricCell(value?.quantity, value?.amount);
      },
    };
    liveColumns.push({
      title: comparisonText('difference'),
      width: 136,
      render: (_, row) => {
        const value = comparisonMetric(row);
        const quantity = row.kind === 'category' ? row.category.quantity : row.plan.currentQty;
        const amount = row.kind === 'category' ? row.category.amount : row.plan.currentAmount;
        return value && quantity !== '—' && amount !== '—'
          ? metricCell(
              subtractExactDecimals(quantity, value.quantity),
              subtractExactDecimals(amount, value.amount),
            )
          : metricCell();
      },
    });
  }
  liveColumns.push({
    title: comparisonText('returnReason'),
    width: 180,
    render: (_, row) => {
      const members = row.kind === 'plan' ? (row.members ?? [row.plan]) : [row.plan];
      const reasons = [
        ...new Set(
          members
            .map((member) =>
              versionMetrics[member.planId]
                ? versionMetrics[member.planId].returnReason
                : member.returnReason,
            )
            .filter((value): value is string => Boolean(value?.trim())),
        ),
      ];
      return reasons.length ? (
        <div className={styles.returnReasons}>
          {reasons.map((reason) => (
            <div key={reason}>{reason}</div>
          ))}
        </div>
      ) : (
        '—'
      );
    },
  });

  const hasReturnedSelection = selectedLiveRows.some((row) => row.status >= 6 && row.status <= 9);
  const submissionItems = (): SalesPlanSubmissionItem[] =>
    selectedPendingActionRows.flatMap((row): SalesPlanSubmissionItem[] => {
      const label =
        projectRegionalApprovalLiveDimension(row, dimension).name ?? row.dealerName ?? row.planId;
      const period = liveQuery.periods.find(
        (period) => period.periodId === row.periodId && period.planTypeCode === row.planTypeCode,
      );
      if (!period) return [];
      if (row.status >= 6 && row.status <= 9) {
        return resubmitAllowed(row)
          ? [
              {
                kind: 'resubmit',
                planId: row.planId,
                versionId: row.versionId,
                label,
                period,
                row,
                approvalRole: liveStageFilter,
                pendingValues: livePendingValues[row.planId],
              },
            ]
          : [];
      }
      const access = liveActionAccessFor(row, 'APPROVE');
      return access && !liveActionDisabledReason(row, 'APPROVE')
        ? [
            {
              kind: 'approve',
              planId: row.planId,
              versionId: row.versionId,
              label,
              row,
              period,
              access,
              pendingValues: livePendingValues[row.planId],
            },
          ]
        : [];
    });
  const selectedSubmissionItems = submissionItems();
  const resubmitDisabledReason =
    selectedSubmissionItems.length !== selectedPendingActionRows.length
      ? t('common.assistantSurface.regionalApproval.liveSubmit.disabled.sourceAuthority')
      : undefined;
  const primaryActionDisabledReason =
    batchDisabledReason('APPROVE') ??
    (onSubmitBatch &&
    selectedLiveRows.length > 1 &&
    selectedSubmissionItems.length !== selectedPendingActionRows.length
      ? 'missingAuthority'
      : undefined);
  const approvalActionButtons = (
    <>
      {liveActionsEnabled ? (
        <Button
          size="small"
          status="danger"
          disabled={
            selectedLiveRows.length === 0 ||
            liveActionPlanId !== undefined ||
            batchDisabledReason('REJECT') !== undefined
          }
          title={
            batchDisabledReason('REJECT')
              ? t(
                  `common.assistantSurface.regionalApproval.liveAction.disabled.${batchDisabledReason('REJECT')}`,
                )
              : undefined
          }
          onClick={() => {
            if (!selectedLiveRows.length) return;
            if (selectedLiveRows.length === 1) {
              const row = selectedLiveRows[0];
              selectLivePlanContext(row);
              setLiveActionKind('REJECT');
              setLiveActionPlanId(row.planId);
              return;
            }
            setBatchAction({ kind: 'REJECT', items: batchItemsFor(selectedLiveRows, 'REJECT') });
          }}
        >
          {t('common.assistantSurface.regionalApproval.liveAction.reject')}
        </Button>
      ) : null}
      {liveActionsEnabled && hasReturnedSelection ? (
        <Button
          type="primary"
          size="small"
          disabled={Boolean(resubmitDisabledReason) || liveActionPlanId !== undefined}
          title={resubmitDisabledReason}
          onClick={() => {
            if (resubmitDisabledReason) return;
            onSubmitBatch?.(selectedSubmissionItems);
          }}
        >
          {t(
            `common.assistantSurface.regionalApproval.liveSubmit.${selectedLiveRows.length > 1 ? 'openBatch' : 'open'}`,
          )}
        </Button>
      ) : liveActionsEnabled ? (
        <Button
          type="primary"
          size="small"
          loading={liveActionKind === 'APPROVE' && liveActionPlanId !== undefined}
          disabled={
            selectedLiveRows.length === 0 ||
            liveActionPlanId !== undefined ||
            primaryActionDisabledReason !== undefined
          }
          title={
            primaryActionDisabledReason
              ? t(
                  `common.assistantSurface.regionalApproval.liveAction.disabled.${primaryActionDisabledReason}`,
                )
              : undefined
          }
          onClick={() => {
            if (!selectedLiveRows.length || primaryActionDisabledReason) return;
            if (selectedLiveRows.length === 1) {
              const row = selectedLiveRows[0];
              selectLivePlanContext(row);
              setLiveActionKind('APPROVE');
              setLiveActionPlanId(row.planId);
              return;
            }
            if (onSubmitBatch) onSubmitBatch(selectedSubmissionItems);
            else
              setBatchAction({
                kind: 'APPROVE',
                items: batchItemsFor(selectedLiveRows, 'APPROVE'),
              });
          }}
        >
          {t('common.assistantSurface.regionalApproval.liveAction.approve')}
        </Button>
      ) : null}
    </>
  );

  const liveActionDialog =
    activeLiveActionRow && liveActionsEnabled ? (
      <RegionalApprovalLiveActionDialog
        key={`${activeLiveActionRow.versionId}:${liveActionKind}`}
        visible
        embedded={false}
        autoSubmitApproval={liveActionKind === 'APPROVE'}
        row={activeLiveActionRow}
        approvalStage={liveStageFilter ?? (roleStages.length === 1 ? roleStages[0] : 'customer')}
        initialAction={liveActionKind}
        t={t}
        client={liveActionClient}
        approvalStages={roleStages}
        evidence={liveAccess.entries[activeLiveActionRow.versionId]}
        pendingValues={livePendingValues[activeLiveActionRow.planId]}
        onPermissionDenied={(versionId) =>
          setPermissionDeniedVersions((current) => new Set(current).add(versionId))
        }
        remarkPatch={approvalRemarkPatch}
        submitRequest={approvalSubmitRequest}
        onSucceeded={async (receipt, request) => {
          setLivePendingValues((current) => {
            if (!(activeLiveActionRow.planId in current)) return current;
            const next = { ...current };
            delete next[activeLiveActionRow.planId];
            return next;
          });
          if (request.action === 'SAVE') {
            const before = liveAccess.entries[receipt.versionId];
            if (!before || !detailClient) throw new Error('Save verification unavailable');
            const after = await detailClient.detail.invoke({ planId: receipt.planId });
            if (!verifySavedSalesPlan(before, after, request, receipt))
              throw new Error('Save readback mismatch');
          } else {
            setLiveActionReceipts((current) => ({ ...current, [receipt.versionId]: receipt }));
          }
          setLiveAuthorityContext(
            projectSalesPlanActionContext(activeLiveActionRow, receipt, contextFilterSummary),
          );
          setSelectedRowIds([]);
          setLiveActionPlanId(undefined);
          refreshLiveAuthority();
        }}
        onRefresh={refreshLiveAuthority}
        // 退回/通过只要没被服务端受理，勾选立刻收掉：留着会让人以为这批还能直接再点一次。
        onAttemptFailed={() => setSelectedRowIds([])}
        onFailed={() => {
          setLiveActionPlanId(undefined);
          setExportFeedback({
            type: 'error',
            message: t('common.assistantSurface.regionalApproval.liveAction.errors.failed'),
          });
        }}
        onClose={() => setLiveActionPlanId(undefined)}
      />
    ) : null;

  /** 多选批量审批：逐笔提交并逐笔回报结果，成功的先刷新权威队列，失败的保留在弹窗里。 */
  const liveBatchActionDialog =
    batchAction && liveActionsEnabled ? (
      <RegionalApprovalBatchActionDialog
        visible
        kind={batchAction.kind}
        items={batchAction.items}
        t={t}
        client={liveActionClient}
        onPermissionDenied={(versionId) =>
          setPermissionDeniedVersions((current) => new Set(current).add(versionId))
        }
        onCompleted={async (outcomes: readonly BatchActionOutcome[]) => {
          if (outcomes.some((outcome) => outcome.status === 'success')) refreshLiveAuthority();
        }}
        onClose={() => {
          setBatchAction(undefined);
          setSelectedRowIds([]);
        }}
      />
    ) : null;

  const inlineSkuAccess = (row: RegionalApprovalLiveRow) => {
    const detail =
      liveAccess.entries[row.versionId] ??
      Object.values(liveAccess.entries).find(
        (candidate) =>
          candidate.currentVersion.planId === row.planId &&
          candidate.currentVersion.id === row.versionId,
      );
    if (!detail) return { detail: undefined, role: undefined, canEdit: false };
    // 能编辑/审批的角色只来自账号角色；没有审批角色时只能靠服务端给的详情可读能力。
    const accessRoles = liveActionRolesFor();
    const editableRole = accessRoles
      .map((candidate) => ({
        candidate,
        access: salesPlanAccessForRow(row, detail, roleStages, candidate),
      }))
      .find(
        ({ access }) =>
          access?.allowedActions.includes('SAVE') || access?.allowedActions.includes('APPROVE'),
      );
    const actionContextAllowsEdit = detail.actionContext?.allowedActions.some(
      (action) => action === 'SAVE' || action === 'APPROVE',
    );
    const returnedDraftEditable =
      row.status >= 6 &&
      row.status <= 9 &&
      accessRoles.some((role) => role !== 'customer' && roleStages.includes(role)) &&
      !salesPlanVersionEvidenceStale(detail, row);
    return {
      detail,
      role: editableRole?.candidate ?? liveStageFilter ?? roleStages[0],
      canEdit: Boolean(editableRole || actionContextAllowsEdit || returnedDraftEditable),
    };
  };

  const handleGroupPendingValues = (changes: Record<string, Record<string, string>>) => {
    setLivePendingValues((current) =>
      Object.fromEntries(
        [...new Set([...Object.keys(current), ...Object.keys(changes)])].map((planId) => [
          planId,
          { ...current[planId], ...changes[planId] },
        ]),
      ),
    );
    for (const [planId, values] of Object.entries(changes)) {
      const row = liveRows.find((plan) => plan.planId === planId);
      if (!row) continue;
      const skus = primarySkusByPlan[planId];
      if (!skus) continue;
      const pending = { ...livePendingValues[planId], ...values };
      const quantities = skus.map(
        (sku) =>
          pending[String(sku.skuCode)] ??
          salesPlanEditableQuantity(sku, row.status, row.planTypeCode, liveStageFilter) ??
          String(sku.qty),
      );
      const amounts = skus.map((sku, index) =>
        multiplyExactDecimals(quantities[index], String(sku.price)),
      );
      if (amounts.every((amount): amount is string => amount !== undefined))
        handleLiveAdjustmentMetrics(planId, {
          quantity: addExactDecimals(quantities),
          amount: addExactDecimals(amounts),
        });
      if (conversationId) {
        const key = liveInputKey(conversationId, planId, row.versionId, inlineSkuAccess(row).role);
        setViewState((current) => ({
          ...current,
          liveInputs: { ...current.liveInputs, [key]: { ...current.liveInputs?.[key], ...values } },
        }));
      }
    }
  };

  return (
    <main
      className={styles.root}
      aria-label={t('common.assistantSurface.regionalApproval.ariaLabel')}
      data-testid="regional-approval-workbench"
    >
      <h1
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: 'hidden',
          clip: 'rect(0, 0, 0, 0)',
          whiteSpace: 'nowrap',
          border: 0,
        }}
      >
        {t('common.assistantSurface.regionalApproval.title')}
      </h1>
      <header className={styles.header}>
        <div className={styles.titleLine}>
          {headerControls}
          {null}
          {null}
        </div>
        <div className={styles.headerRight}>
          {/* 流程图默认收起：收起态只在标题行右侧留一个「当前节点」入口，点开才占一整行。 */}
          <Button
            type="text"
            size="small"
            className={styles.stageLaneToggle}
            data-testid="regional-approval-flow-toggle"
            aria-expanded={stageLaneOpen}
            aria-controls="regional-approval-stage-lane"
            aria-label={t(
              `common.assistantSurface.regionalApproval.stageLaneToggle.${stageLaneOpen ? 'collapse' : 'expand'}`,
            )}
            title={t(
              `common.assistantSurface.regionalApproval.stageLaneToggle.${stageLaneOpen ? 'collapse' : 'expand'}`,
            )}
            onClick={() => setStageLaneOpen((open) => !open)}
          >
            <span>
              {t('common.assistantSurface.regionalApproval.stageLaneToggle.current', {
                stage: stageIndicatorStage
                  ? t(stageLabelKey(stageIndicatorStage))
                  : t('common.assistantSurface.regionalApproval.stages.all'),
              })}
            </span>
            {stageLaneOpen ? <Up size={12} /> : <Down size={12} />}
          </Button>
          <Button
            type="outline"
            size="small"
            data-testid="regional-approval-version-compare"
            disabled={liveQuery.queueState.status !== 'success' || !comparisonLiveRow}
            title={t(
              comparisonLiveRow
                ? 'common.assistantSurface.regionalApproval.versionCompare'
                : 'common.assistantSurface.regionalApproval.versionCompareUnavailable',
            )}
            onClick={() => {
              const row = comparisonLiveRow;
              if (!row || liveQuery.queueState.status !== 'success') return;
              selectLivePlanContext(row);
              setFocusedLivePlanId(row.planId);
              setInlineComparison((current) =>
                current ? undefined : { primaryOffset: 0, compareOffset: 1 },
              );
            }}
            aria-pressed={Boolean(inlineComparison)}
          >
            {t('common.assistantSurface.regionalApproval.versionCompare')}
          </Button>
          {inlineComparison && (
            <div
              className={styles.versionComparisonBar}
              role="group"
              aria-label={comparisonText('title')}
              title={comparisonText('hint')}
            >
              {(['primaryOffset', 'compareOffset'] as const).map((field, index) => (
                <div key={field} className={styles.versionComparisonField}>
                  <span>{comparisonText(index === 0 ? 'primary' : 'compared')}</span>
                  <Select
                    size="small"
                    dropdownMenuClassName={styles.brandSelectMenu}
                    aria-label={comparisonText(index === 0 ? 'primary' : 'compared')}
                    value={inlineComparison[field]}
                    onChange={(value: number) =>
                      setInlineComparison((current) =>
                        current ? { ...current, [field]: value } : current,
                      )
                    }
                  >
                    {Array.from(
                      {
                        length: Math.max(2, ...liveRows.map((row) => row.seq)),
                      },
                      (_, offset) => (
                        <Select.Option key={offset} value={offset}>
                          {offset === 0
                            ? comparisonText('current')
                            : offset === 1
                              ? comparisonText('previous')
                              : t(
                                  'common.assistantSurface.regionalApproval.inlineComparison.earlier',
                                  {
                                    count: offset,
                                  },
                                )}
                        </Select.Option>
                      ),
                    )}
                  </Select>
                </div>
              ))}
            </div>
          )}
          <div
            className={styles.scope}
            aria-label={t('common.assistantSurface.regionalApproval.scopeAria')}
          >
            <span className={styles.monthField}>
              <small>{t('common.assistantSurface.regionalApproval.planMonth')}</small>
              <span className={styles.monthSelect}>
                <IconCalendar aria-hidden="true" className={styles.monthCalendarIcon} />
                <Spin
                  loading={
                    liveQuery.periodsState.status === 'loading' && liveQuery.periods.length === 0
                  }
                  size={14}
                >
                  <Select
                    size="small"
                    dropdownMenuClassName={styles.brandSelectMenu}
                    value={liveQuery.selectedPeriodMonth}
                    aria-label={t('common.assistantSurface.regionalApproval.query.periodSelect')}
                    placeholder={t('common.assistantSurface.regionalApproval.query.noPeriod')}
                    renderFormat={(_option, value) =>
                      value == null ? '' : formatPlanMonthLabel(String(value))
                    }
                    onChange={(periodMonth) => {
                      setSelectedRowIds([]);
                      setPage(1);
                      liveQuery.selectPeriodMonth(periodMonth);
                    }}
                    disabled={liveQuery.periods.length === 0}
                  >
                    {liveQuery.periodMonths.map((periodMonth) => (
                      <Select.Option key={periodMonth} value={periodMonth}>
                        {formatPlanMonthLabel(periodMonth)}
                      </Select.Option>
                    ))}
                  </Select>
                </Spin>
              </span>
            </span>
            {null}
          </div>
        </div>
      </header>

      <div
        className={styles.stageViewport}
        data-testid="regional-approval-flow-lane"
        data-collapsed={!stageLaneOpen}
      >
        <nav
          id="regional-approval-stage-lane"
          className={styles.stageLane}
          data-live-status={true}
          aria-label={t('common.assistantSurface.regionalApproval.stageLane')}
        >
          {APPROVAL_STAGES.map((stage, index) => {
            const state =
              liveQuery.progressState.status !== 'success'
                ? 'unavailable'
                : stage.id !== 'category' &&
                    (liveQuery.progressState.statusTotals?.[
                      SALES_PLAN_RETURN_CODES[stage.id] ?? -1
                    ] ?? 0) > 0
                  ? 'critical'
                  : liveStageProgress[stage.id] === 100
                    ? 'completed'
                    : 'partial';
            return (
              <React.Fragment key={stage.id}>
                <Button
                  type="text"
                  className={styles.stageButton}
                  data-state={state}
                  data-selected={liveStageFilter === stage.id}
                  data-testid={`regional-approval-stage-${stage.id}`}
                  aria-current={stage.id === displayStage ? 'step' : undefined}
                  aria-pressed={liveStageFilter === stage.id}
                  disabled={
                    liveQuery.progressState.status !== 'success' || !stageAuthorized(stage.id)
                  }
                  onClick={() => changeStage(stage.id)}
                >
                  <span className={styles.stageMarker}>
                    {state === 'completed' ? <CheckOne size={14} /> : index + 1}
                  </span>
                  <span className={styles.stageCopy}>
                    <strong>
                      {stage.id === displayStage ? (
                        <span style={{ color: 'rgb(var(--warning-6))' }} aria-hidden>
                          {'➜'}{' '}
                        </span>
                      ) : null}
                      {t(stageLabelKey(stage.id))}
                    </strong>
                    <small title={stageProgressDetail(stage.id)}>
                      {t('common.assistantSurface.regionalApproval.stageProgress', {
                        progress: liveStageProgress[stage.id],
                      })}
                    </small>
                  </span>
                </Button>
                {null}
              </React.Fragment>
            );
          })}
        </nav>
      </div>

      <div className={styles.content}>
        {liveQuery.periodsState.status === 'error' ? (
          <Alert
            className={styles.queryAlert}
            type="error"
            showIcon
            title={t(
              liveQuery.periodsState.error === 'workflow'
                ? 'common.assistantSurface.regionalApproval.query.workflowErrorTitle'
                : 'common.assistantSurface.regionalApproval.query.periodErrorTitle',
            )}
            content={t(queryErrorKey(liveQuery.periodsState.error))}
            action={
              <Button size="small" onClick={liveQuery.retryPeriods}>
                {t('common.assistantSurface.regionalApproval.query.retry')}
              </Button>
            }
          />
        ) : null}
        {liveQuery.periodsState.status === 'success' && liveQuery.periods.length === 0 ? (
          <Alert
            className={styles.queryAlert}
            type="info"
            showIcon
            title={t('common.assistantSurface.regionalApproval.query.noPeriod')}
            content={t('common.assistantSurface.regionalApproval.query.noPeriodDescription')}
          />
        ) : null}
        <section
          className={styles.queue}
          aria-label={t('common.assistantSurface.regionalApproval.queue.ariaLabel')}
        >
          <header className={styles.dashboardHeader}>
            <div className={styles.dashboardSectionTitle}>
              {t('common.assistantSurface.regionalApproval.scopeTotals.overview')}
            </div>
            <div
              className={styles.queueMetrics}
              role="region"
              aria-label={t('common.assistantSurface.regionalApproval.scopeTotals.pageTitle')}
              title={t('common.assistantSurface.regionalApproval.scopeTotals.pageTitle')}
            >
              <span>
                <small>
                  {t('common.assistantSurface.regionalApproval.scopeTotals.targetAmount')}
                </small>
                <strong
                  title={
                    !dashboardReady || metrics.targetAmount === undefined
                      ? undefined
                      : correctionDisplay(metrics.targetAmount, 'money').exact
                  }
                >
                  {!dashboardReady || metrics.targetAmount === undefined
                    ? '—'
                    : correctionDisplay(metrics.targetAmount, 'money').display}
                </strong>
              </span>
              <span>
                <small>
                  {t('common.assistantSurface.regionalApproval.scopeTotals.planAmount')}
                </small>
                <strong
                  title={
                    !dashboardReady ? undefined : correctionDisplay(metrics.amount, 'money').exact
                  }
                >
                  {!dashboardReady ? '—' : correctionDisplay(metrics.amount, 'money').display}
                </strong>
              </span>
              <span>
                <small>
                  {t('common.assistantSurface.regionalApproval.scopeTotals.amountVariance')}
                </small>
                <strong
                  title={
                    !dashboardReady || amountVariance === undefined
                      ? undefined
                      : exactSignedMoney(amountVariance)
                  }
                  className={salesPlanVarianceClass(
                    amountVariance,
                    styles.variancePositive,
                    styles.varianceNegative,
                  )}
                >
                  {!dashboardReady || amountVariance === undefined
                    ? '—'
                    : correctionDisplay(amountVariance, 'money').display}
                </strong>
              </span>
              <span>
                <small>
                  {t('common.assistantSurface.regionalApproval.scopeTotals.planQuantity')}
                </small>
                <strong
                  title={
                    !dashboardReady || metrics.quantity === '—'
                      ? undefined
                      : correctionDisplay(metrics.quantity, 'quantity').exact
                  }
                >
                  {!dashboardReady || metrics.quantity === '—'
                    ? '—'
                    : `${quantityText(metrics.quantity)} ${t('common.assistantSurface.regionalApproval.scopeTotals.quantityUnit')}`}
                </strong>
              </span>
              {liveQuery.queueState.status === 'loading' || liveCategoriesLoading ? (
                <Spin className={styles.dashboardSpinner} size={14} />
              ) : null}
              {liveQuery.queueState.status === 'error' ||
              (dashboardReady && metrics.amount === '—') ? (
                <Button
                  className={styles.dashboardMessage}
                  size="mini"
                  onClick={refreshLiveAuthority}
                >
                  {t('common.assistantSurface.regionalApproval.scopeTotals.retry')}
                </Button>
              ) : null}
            </div>
          </header>
          {liveCategoriesError ? (
            <div
              role="alert"
              data-testid="regional-approval-sku-coverage-error"
              className={styles.skuCoverageError}
            >
              {t('common.assistantSurface.regionalApproval.skuCoverageIncomplete')}
            </div>
          ) : null}
          <div className={styles.queueHeader}>
            <div className={styles.controlToolbar}>
              <div className={styles.dimensionControls}>
                <label className={styles.categorySwitch}>
                  <Switch
                    size="small"
                    checked={categoryComparison}
                    aria-label={t('common.assistantSurface.regionalApproval.categoryComparison')}
                    onChange={setCategoryComparison}
                  />
                  <span>{t('common.assistantSurface.regionalApproval.categoryComparison')}</span>
                </label>
                <div
                  className={styles.dimensionTabs}
                  role="tablist"
                  aria-label={t('common.assistantSurface.regionalApproval.dimensions.ariaLabel')}
                >
                  {availableDimensions.map((candidate) => (
                    <Button
                      key={candidate}
                      size="small"
                      type="text"
                      role="tab"
                      aria-selected={candidate === dimension}
                      data-active={candidate === dimension}
                      onClick={() => {
                        setSelectedRowIds([]);
                        setLiveAuthorityContext(undefined);
                        setDimension(candidate);
                      }}
                    >
                      {t(`common.assistantSurface.regionalApproval.dimensions.${candidate}`)}
                    </Button>
                  ))}
                </div>
              </div>
              <div
                className={styles.toolbarActions}
                data-testid="regional-approval-toolbar-actions"
              >
                <Button
                  className={styles.advancedToggle}
                  size="small"
                  aria-label={t('common.assistantSurface.regionalApproval.filters.toggle')}
                  aria-controls={filterPanelId}
                  aria-expanded={narrowFiltersExpanded}
                  data-active={narrowFiltersExpanded}
                  onClick={() => setNarrowFiltersExpanded((expanded) => !expanded)}
                >
                  <Filter size={16} strokeWidth={3} />
                </Button>
                <Button
                  size="small"
                  icon={<ChartHistogram size={16} />}
                  aria-label={t('common.assistantSurface.regionalApproval.toolbar.progress')}
                  title={t('common.assistantSurface.regionalApproval.toolbar.progress')}
                  onClick={() => setProgressOpen(true)}
                />
                {
                  <Button
                    size="small"
                    icon={<Refresh size={14} />}
                    loading={liveQuery.refreshing}
                    loadingFixedWidth
                    disabled={liveQuery.refreshing}
                    onClick={() => {
                      setPermissionDeniedVersions(new Set());
                      liveAccess.refresh();
                      liveQuery.refresh();
                      void refreshApprovalStages();
                    }}
                    aria-label={t('common.assistantSurface.regionalApproval.toolbar.refreshData')}
                    title={t('common.assistantSurface.regionalApproval.toolbar.refreshData')}
                  />
                }
                <Button
                  size="small"
                  icon={<Download size={14} />}
                  disabled={liveQuery.queueState.status !== 'success'}
                  onClick={() => void exportQueue()}
                  loading={exporting}
                  aria-label={t('common.assistantSurface.regionalApproval.toolbar.exportPage')}
                  title={t('common.assistantSurface.regionalApproval.toolbar.exportPage')}
                />
                <div className={styles.approvalToolbarActions}>{approvalActionButtons}</div>
              </div>
            </div>
          </div>
          <section
            className={styles.controls}
            hidden={!narrowFiltersExpanded && !exportFeedback}
            aria-label={t('common.assistantSurface.regionalApproval.filters.ariaLabel')}
          >
            <div
              id={filterPanelId}
              className={styles.advancedControls}
              data-expanded={narrowFiltersExpanded}
            >
              <div className={`${styles.filterRow} ${styles.liveFilterRow}`}>
                <div className={styles.fieldControl}>
                  <span>{t('common.assistantSurface.regionalApproval.filters.area')}</span>
                  <Select
                    size="small"
                    dropdownMenuClassName={styles.brandSelectMenu}
                    value={draftLiveFilters.areaCode}
                    aria-label={t('common.assistantSurface.regionalApproval.filters.area')}
                    onChange={(value) => updateLiveDraftFilter('areaCode', value)}
                  >
                    <Select.Option value={ALL_ORGANIZATIONS}>
                      {t('common.assistantSurface.regionalApproval.filters.allAreas')}
                    </Select.Option>
                    {liveFilterOptions.areas.map((option) => (
                      <Select.Option key={option.value} value={option.value}>
                        {option.label ?? option.value}
                      </Select.Option>
                    ))}
                  </Select>
                </div>
                <div className={styles.fieldControl}>
                  <span>{t('common.assistantSurface.regionalApproval.filters.branch')}</span>
                  <Select
                    size="small"
                    dropdownMenuClassName={styles.brandSelectMenu}
                    value={draftLiveFilters.provinceCode}
                    aria-label={t('common.assistantSurface.regionalApproval.filters.branch')}
                    onChange={(value) => updateLiveDraftFilter('provinceCode', value)}
                  >
                    <Select.Option value={ALL_ORGANIZATIONS}>
                      {t('common.assistantSurface.regionalApproval.filters.allBranches')}
                    </Select.Option>
                    {liveFilterOptions.provinces.map((option) => (
                      <Select.Option key={option.value} value={option.value}>
                        {option.label ?? option.value}
                      </Select.Option>
                    ))}
                  </Select>
                </div>
                <div className={styles.fieldControl}>
                  <span>{t('common.assistantSurface.regionalApproval.filters.department')}</span>
                  <Select
                    size="small"
                    dropdownMenuClassName={styles.brandSelectMenu}
                    value={draftLiveFilters.orgCode}
                    aria-label={t('common.assistantSurface.regionalApproval.filters.department')}
                    onChange={(value) => updateLiveDraftFilter('orgCode', value)}
                  >
                    <Select.Option value={ALL_ORGANIZATIONS}>
                      {t('common.assistantSurface.regionalApproval.filters.allDepartments')}
                    </Select.Option>
                    {liveFilterOptions.organizations.map((option) => (
                      <Select.Option key={option.value} value={option.value}>
                        {option.label ?? option.value}
                      </Select.Option>
                    ))}
                  </Select>
                </div>
                <div className={styles.fieldControl}>
                  <span>{t('common.assistantSurface.regionalApproval.filters.customer')}</span>
                  <Select
                    size="small"
                    dropdownMenuClassName={styles.brandSelectMenu}
                    value={draftLiveFilters.dealerCode}
                    aria-label={t('common.assistantSurface.regionalApproval.filters.customer')}
                    onChange={(value) => updateLiveDraftFilter('dealerCode', value)}
                    showSearch
                  >
                    <Select.Option value={ALL_ORGANIZATIONS}>
                      {t('common.assistantSurface.regionalApproval.filters.allCustomers')}
                    </Select.Option>
                    {liveFilterOptions.customers.map((option) => (
                      <Select.Option key={option.dealerCode} value={option.dealerCode}>
                        {option.dealerName ?? option.dealerCode}
                        {option.baseName ? ` · ${option.baseName}` : ''}
                      </Select.Option>
                    ))}
                  </Select>
                </div>
                <div className={styles.fieldControl}>
                  <span>{t('common.assistantSurface.regionalApproval.filters.approval')}</span>
                  <Select
                    size="small"
                    dropdownMenuClassName={styles.brandSelectMenu}
                    value={draftLiveFilters.status}
                    aria-label={t('common.assistantSurface.regionalApproval.filters.approval')}
                    onChange={(value) => updateLiveDraftFilter('status', value)}
                  >
                    <Select.Option value={ALL_ORGANIZATIONS}>
                      {t('common.assistantSurface.regionalApproval.filters.allApprovals')}
                    </Select.Option>
                    {Array.from({ length: 11 }, (_, index) => String(index)).map((value) => (
                      <Select.Option key={value} value={value}>
                        {salesPlanStatusText(
                          Number(value),
                          liveQuery.selectedPlanTypeCode ?? 'Y',
                          t,
                        )}
                      </Select.Option>
                    ))}
                  </Select>
                </div>
                {null}
                {/* 删掉「组织范围」标题行后，状态标签跟查询/重置放在同一格，不丢信息也不挤占筛选列。 */}
                <div className={styles.filterActions}>
                  {null}
                  {liveFiltersDirty ? (
                    <Tag color="orange">
                      {t('common.assistantSurface.regionalApproval.filters.dirty')}
                    </Tag>
                  ) : null}
                  <Button size="small" onClick={applyFilters} disabled={!liveFiltersDirty}>
                    {t('common.assistantSurface.regionalApproval.filters.query')}
                  </Button>
                  <Button size="small" icon={<Refresh size={14} />} onClick={resetFilters}>
                    {t('common.assistantSurface.regionalApproval.filters.reset')}
                  </Button>
                </div>
              </div>
            </div>
            {exportFeedback ? (
              <Alert
                className={styles.exportFeedback}
                type={exportFeedback.type}
                content={exportFeedback.message}
                closable
                onClose={() => setExportFeedback(undefined)}
              />
            ) : null}
          </section>
          <div ref={tableViewportRef} className={styles.tableViewport}>
            <div
              className={styles.querySpin}
              aria-busy={liveQuery.queueState.status === 'loading' || liveCategoriesLoading}
            >
              {liveQuery.queueState.status === 'loading' || liveCategoriesLoading ? (
                <DashboardTableSkeleton label="销售计划加载中" embedded />
              ) : (
                <>
                  {liveQuery.queueState.status === 'error' ? (
                    <Alert
                      className={styles.queryAlert}
                      type="error"
                      showIcon
                      title={t('common.assistantSurface.regionalApproval.query.queueErrorTitle')}
                      content={t(queryErrorKey(liveQuery.queueState.error))}
                      action={
                        <Button size="small" onClick={refreshLiveAuthority}>
                          {t('common.assistantSurface.regionalApproval.query.retry')}
                        </Button>
                      }
                    />
                  ) : null}
                  {liveQuery.queueState.status === 'success' && liveRows.length === 0 ? (
                    <Empty
                      description={
                        <div>
                          <strong>
                            {t('common.assistantSurface.regionalApproval.query.emptyQueue')}
                          </strong>
                          <br />
                          <small>
                            {t('common.assistantSurface.regionalApproval.query.emptyQueueHint')}
                          </small>
                        </div>
                      }
                    />
                  ) : (
                    <Table
                      rowKey="tableRowId"
                      onRow={(record) => ({
                        'data-page-target': (record.kind === 'plan' && record.members
                          ? record.members
                          : [record.plan]
                        )
                          .map((plan) => `row:${plan.planId}`)
                          .join('\n'),
                        'data-page-label': [
                          projectRegionalApprovalLiveDimension(record.plan, dimension).name ??
                            record.plan.planId,
                          record.kind === 'category' ? record.category.categoryName : '',
                        ]
                          .filter(Boolean)
                          .join(' · '),
                      })}
                      columns={liveColumns}
                      data={liveTableRows}
                      className={styles.organizationTable}
                      tableLayoutFixed
                      indentSize={20}
                      expandedRowRender={(record) => {
                        if (record.kind === 'plan' && record.members)
                          return (
                            <GroupSkuSummary
                              key={`${record.tableRowId}:${inlineComparison?.primaryOffset ?? 0}:${liveStageFilter ?? 'all'}`}
                              members={record.members.map((member) => ({
                                ...member,
                                versionId:
                                  versionMetrics[member.planId]?.versionId ?? member.versionId,
                                status: versionMetrics[member.planId]?.status ?? member.status,
                                skuCount:
                                  primarySkusByPlan[member.planId]?.length ?? member.skuCount,
                              }))}
                              skusByPlan={primarySkusByPlan}
                              comparedSkusByPlan={comparedSkusByPlan}
                              comparison={Boolean(inlineComparison)}
                              loading={liveCategoriesLoading}
                              failed={liveCategoriesError}
                              onRetry={refreshLiveAuthority}
                              approvalRole={liveStageFilter}
                              pendingValues={
                                inlineComparison?.primaryOffset ? undefined : livePendingValues
                              }
                              editablePlans={
                                new Set(
                                  record.members
                                    .filter(
                                      (member) =>
                                        inlineSkuAccess(member).canEdit &&
                                        !sourceTypeReadOnly(member),
                                    )
                                    .map((member) => member.planId),
                                )
                              }
                              detailsByPlan={Object.fromEntries(
                                record.members.flatMap((member) => {
                                  const detail = inlineSkuAccess(member).detail;
                                  return detail ? [[member.planId, detail]] : [];
                                }),
                              )}
                              onPendingValuesChange={handleGroupPendingValues}
                              onValidityChange={(invalid) =>
                                setInvalidGroupInputs((current) => {
                                  const next = { ...current };
                                  if (invalid)
                                    next[record.tableRowId] = record.members!.map(
                                      (member) => member.planId,
                                    );
                                  else delete next[record.tableRowId];
                                  return next;
                                })
                              }
                              t={t}
                            />
                          );
                        const access = inlineSkuAccess(record.plan);
                        return (
                          <InlineSkuDetails
                            orderType={orderType}
                            comparison={Boolean(inlineComparison)}
                            loading={liveCategoriesLoading}
                            comparedSkus={comparedSkusByPlan[record.plan.planId]}
                            unavailable={
                              !liveCategoriesLoading && !primarySkusByPlan[record.plan.planId]
                            }
                            selectedSkus={primarySkusByPlan[record.plan.planId]}
                            key={
                              conversationId
                                ? liveInputKey(
                                    conversationId,
                                    record.plan.planId,
                                    versionMetrics[record.plan.planId]?.versionId ??
                                      record.plan.versionId,
                                    access.role,
                                  )
                                : `${record.plan.planId}:${versionMetrics[record.plan.planId]?.versionId ?? record.plan.versionId}:${access.role ?? 'view'}`
                            }
                            initialInputValues={
                              conversationId
                                ? viewState.liveInputs?.[
                                    liveInputKey(
                                      conversationId,
                                      record.plan.planId,
                                      versionMetrics[record.plan.planId]?.versionId ??
                                        record.plan.versionId,
                                      access.role,
                                    )
                                  ]
                                : undefined
                            }
                            onInputChange={
                              conversationId
                                ? (changes) => {
                                    const key = liveInputKey(
                                      conversationId,
                                      record.plan.planId,
                                      versionMetrics[record.plan.planId]?.versionId ??
                                        record.plan.versionId,
                                      access.role,
                                    );
                                    setViewState((current) => ({
                                      ...current,
                                      liveInputs: {
                                        ...current.liveInputs,
                                        [key]: { ...current.liveInputs?.[key], ...changes },
                                      },
                                    }));
                                  }
                                : undefined
                            }
                            row={{
                              ...record.plan,
                              status:
                                versionMetrics[record.plan.planId]?.status ?? record.plan.status,
                              versionId:
                                versionMetrics[record.plan.planId]?.versionId ??
                                record.plan.versionId,
                            }}
                            t={t}
                            detail={sourceTypeReadOnly(record.plan) ? undefined : access.detail}
                            approvalRole={access.role}
                            canEdit={
                              record.kind === 'plan' &&
                              access.canEdit &&
                              !sourceTypeReadOnly(record.plan)
                            }
                            categoryName={
                              record.kind === 'category' ? record.category.categoryName : undefined
                            }
                            onMetricsChange={
                              record.kind === 'plan' &&
                              !record.members &&
                              !sourceTypeReadOnly(record.plan)
                                ? (metrics) =>
                                    handleLiveAdjustmentMetrics(record.plan.planId, metrics)
                                : undefined
                            }
                            onPendingValuesChange={
                              record.kind === 'plan' &&
                              !record.members &&
                              !sourceTypeReadOnly(record.plan)
                                ? (values) => handleLivePendingValues(record.plan.planId, values)
                                : undefined
                            }
                            draftPatch={
                              draftPatch && draftPatch.planId === record.plan.planId
                                ? draftPatch
                                : undefined
                            }
                            onElementsChange={(fields, collection) =>
                              handleInlineElements(record.plan.planId, fields, collection)
                            }
                          />
                        );
                      }}
                      // V1.8 #10：去掉行首独立展开箭头，展开/收起统一走组织名称；这里只保留展开能力。
                      // 宽度必须给非 0 值：Arco 计算固定列偏移时用 `width || 40`，给 0 会被当成 40，左列会压掉 40px。
                      expandProps={{ width: 1, icon: () => null }}
                      expandedRowKeys={expandedLiveRowKeys}
                      onExpandedRowsChange={setExpandedLiveGroups}
                      rowClassName={(row) =>
                        row.kind === 'category'
                          ? styles.categoryComparisonRow
                          : row.members
                            ? styles.organizationGroupRow
                            : ''
                      }
                      rowSelection={{
                        type: 'checkbox',
                        checkAll: false,
                        fixed: pinLiveColumns,
                        columnWidth: 40,
                        selectedRowKeys: selectedLiveTableRowIds,
                        onChange: (keys) => {
                          // 分组行的勾选状态是「组内成员全部选中」的派生结果，不能按 key 是否存在直接重算：
                          // 取消分组时只去掉分组 key，成员计划还在选，下一次渲染又把分组派生成勾选，表现为取消不掉。
                          const next = new Set(keys.map(String));
                          const displayed = new Set(selectedLiveTableRowIds);
                          const planIds = new Set(selectedRowIds);
                          const coveredPlans = (row: RegionalApprovalLiveTableRow | undefined) =>
                            row?.kind !== 'plan'
                              ? []
                              : row.members?.length
                                ? row.members.map((member) => member.planId)
                                : [row.plan.planId];
                          for (const key of next)
                            if (!displayed.has(key))
                              coveredPlans(liveTableRowById.get(key)).forEach((planId) =>
                                planIds.add(planId),
                              );
                          for (const key of displayed) {
                            if (next.has(key)) continue;
                            const row = liveTableRowById.get(key);
                            // 分组行只有在成员仍全部保留时才是「用户取消了整个分组」；
                            // 否则它只是成员变化引起的派生取消，交给成员自己的 key 处理。
                            if (row?.kind === 'plan' && row.members?.length) {
                              const members = row.members.map((member) => member.planId);
                              if (!members.every((planId) => next.has(planId))) continue;
                              members.forEach((planId) => planIds.delete(planId));
                              continue;
                            }
                            coveredPlans(row).forEach((planId) => planIds.delete(planId));
                          }
                          setSelectedRowIds([...planIds]);
                        },
                        checkboxProps: (row) => ({
                          // 只要行里有能提交或退回的计划就允许勾选；整行都不可操作才置灰，
                          // 保证「能勾上的行，按钮一定点得动」。
                          disabled: !liveRowSelectable(row),
                        }),
                      }}
                      pagination={false}
                      size="small"
                      scroll={{ x: liveTableWidth }}
                    />
                  )}
                </>
              )}
            </div>
            <footer className={styles.queueFooter} data-testid="regional-approval-queue-footer">
              <span className={styles.footerTotal}>
                {t('common.assistantSurface.regionalApproval.pagination.total', {
                  count: liveOuterRows.length,
                  formattedCount: liveOuterRows.length.toLocaleString('zh-CN'),
                })}
              </span>
              <div className={styles.footerControls}>
                <div className={styles.pageSizeControl}>
                  <span>{t('common.assistantSurface.regionalApproval.pagination.pageSize')}</span>
                  <Select
                    size="small"
                    dropdownMenuClassName={styles.brandSelectMenu}
                    value={pageSize}
                    aria-label={t('common.assistantSurface.regionalApproval.pagination.pageSize')}
                    onChange={(value) => {
                      setPageSize(Number(value));
                      setPage(1);
                    }}
                  >
                    {[10, 20, 50, 100].map((size) => (
                      <Select.Option key={size} value={size}>
                        {t('common.assistantSurface.regionalApproval.pagination.pageSizeValue', {
                          count: size,
                        })}
                      </Select.Option>
                    ))}
                  </Select>
                </div>
                <Pagination
                  size="small"
                  current={liveCurrentPage}
                  pageSize={pageSize}
                  total={liveOuterRows.length}
                  onChange={(next) => setPage(Math.min(Math.max(1, next), livePageCount))}
                />
                <span className={styles.footerPageCount}>
                  {t('common.assistantSurface.regionalApproval.pagination.pages', {
                    count: liveOuterRows.length === 0 ? 0 : livePageCount,
                  })}
                </span>
              </div>
            </footer>
          </div>
        </section>
      </div>

      <Modal
        visible={progressOpen}
        title={t('common.assistantSurface.regionalApproval.progressDialog.title', {
          stage: t('common.assistantSurface.regionalApproval.progressDialog.allStages'),
        })}
        footer={
          <Button onClick={() => setProgressOpen(false)}>
            {t('common.assistantSurface.regionalApproval.progressDialog.close')}
          </Button>
        }
        onCancel={() => setProgressOpen(false)}
        className={styles.progressModal}
      >
        <Typography.Paragraph type="secondary">
          {t('common.assistantSurface.regionalApproval.progressDialog.liveScope', {
            month: liveQuery.selectedPeriodMonth ?? '—',
            stage: t(`common.assistantSurface.regionalApproval.stages.${liveStageFilter ?? 'all'}`),
          })}
        </Typography.Paragraph>
        <div className={styles.progressList} data-testid="regional-approval-progress-results">
          {
            <RegionalApprovalLiveProgress
              key={JSON.stringify([liveQuery.selectedPeriodMonth, liveQueryScope, liveStageFilter])}
              records={liveQuery.analysisRecords}
              status={liveQuery.analysisSummary.status}
              error={liveQuery.analysisSummary.error}
              t={t}
              onRetry={liveQuery.retryQueue}
            />
          }
        </div>
      </Modal>

      {liveActionDialog}
      {liveBatchActionDialog}
    </main>
  );
};

const SalesPlanWorkbench: React.FC<React.ComponentProps<typeof RegionalApprovalWorkbench>> = (
  props,
) => {
  const [orderType, setOrderType] = useState<'M' | 'Z'>('M');
  const context = useRef<RegionalApprovalWorkbenchContext>();
  const onContextChange: typeof props.onContextChange = useCallback(
    (value, id) => {
      context.current = value;
      props.onContextChange(value, id);
    },
    [props.onContextChange],
  );
  const host = useWorkbenchHost();
  const orderHost = useMemo(
    () => ({
      ...host,
      salesPlan: {
        ...host.salesPlan,
        list: {
          invoke: (query: Parameters<typeof host.salesPlan.list.invoke>[0]) =>
            host.salesPlan.list.invoke({ ...query, orderType }),
        },
      },
    }),
    [host, orderType],
  );
  const select = (value: 'M' | 'Z') => {
    if (value === orderType) return;
    if (context.current)
      props.onContextChange(
        {
          ...context.current,
          selectedEntities: [],
          evidence: { ...context.current.evidence, queryState: 'loading' },
        },
        null,
      );
    setOrderType(value);
  };
  const headerControls = (
    <div
      role="tablist"
      aria-label={props.t('common.correction.tabs')}
      className={styles.orderTabs}
      style={{ '--plan-tab-index': orderType === 'M' ? 0 : 1 } as React.CSSProperties}
    >
      {(['M', 'Z'] as const).map((value) => (
        <Button
          size="small"
          key={value}
          role="tab"
          aria-selected={orderType === value}
          type={orderType === value ? 'primary' : 'secondary'}
          onClick={() => select(value)}
        >
          {props.t(value === 'M' ? 'common.correction.monthly' : 'common.correction.correction')}
        </Button>
      ))}
    </div>
  );
  return (
    <WorkbenchHostProvider value={orderHost}>
      <RegionalApprovalWorkbench
        {...props}
        key={orderType}
        orderType={orderType}
        stateScope={orderType === 'M' ? props.stateScope : `${props.stateScope}:correction`}
        headerControls={headerControls}
        onContextChange={onContextChange}
      />
    </WorkbenchHostProvider>
  );
};
export default SalesPlanWorkbench;
