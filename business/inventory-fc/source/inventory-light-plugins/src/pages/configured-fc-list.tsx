import { mergeFcPlans } from '../../../../../shared/fc-plan-merge';
import { fcSubmissionIdentity } from '../../../../../shared/fc-submission-identity';
import { fcSubmissionProvenance, type FcStoredVersions } from '../../../../../shared/fc-provenance';
import { persistAndSubmitFc, verifyFcReceiptArchive } from './fc-submission-persistence';
import { fcPersistence } from './fc-storage-client';
import type { FcStoreScope } from '../../../../../shared/fc-persistence';
import { ConfiguredFactsPage } from '../../../../../shared/configured-facts-page';
import { CurrentShortageList } from '../../../../../shared/current-shortage-list';
import { knownNumber } from '../../../../../shared/configured-overview';
import { call } from '../channel.js';
import { dmsWorkbookRows } from '../fc-feedback';
import { updateContext } from '../native/context';
import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { z } from 'zod';
import { OriginalBusinessList } from '../../../../../shared/original-business-list';
import { Modal, DataPagination } from '../dsh-ui/controls';
import { downloadWorkbook, readWorkbook } from '../dsh-ui/workbook';
import { memoryStorage } from '../native/memory-storage';
import {
  IMPORT_FIELDS,
  defaultPlanTemplateMonth,
  currentPlanningMonth,
  nextMonth,
  type ImportedPlan,
} from '../../../fc/src/lib/planning';
import {
  applyFcPlan,
  summarizeFcRows,
  validateFcSubmission,
  planKey,
  quantity,
  readFcActionRows,
  rowKey,
  validateFcImport,
  type FcReadScope,
  type FcRow,
} from './fc-workflow';

const draftSchema = z.object({
  quantities: z.record(z.string(), z.number().finite().min(0).max(1e9)),
  reasons: z.record(z.string(), z.string().max(500)),
  dirty: z.boolean(),
});
const planDraftSchema = z.object({
  fileName: z.string(),
  rows: z.array(z.record(z.string(), z.union([z.string(), z.number()]))),
  importedAt: z.string(),
});
type PlanDraft = z.infer<typeof planDraftSchema>;
type Draft = z.infer<typeof draftSchema>;
const emptyDraft = (): Draft => ({ quantities: {}, reasons: {}, dirty: false });
function loadDraft(key: string) {
  try {
    return draftSchema.parse(JSON.parse(memoryStorage.getItem(key) ?? 'null'));
  } catch {
    return emptyDraft();
  }
}
function loadPlan(key: string): PlanDraft | null {
  try {
    return planDraftSchema.parse(JSON.parse(memoryStorage.getItem(key) ?? 'null'));
  } catch {
    return null;
  }
}
const keyFor = (kind: string, month: string) => `branch-inventory:v1:${kind}:configured:${month}`;
type Trial = {
  scope: string;
  plans: ImportedPlan[];
  recommended: number | null;
  missingCount: number;
  forwardTurnover: number | null;
};
const WorkflowContext = createContext<{
  trial: Trial | null;
  planningPlans: ImportedPlan[];
  setPlanningPlans: (plans: ImportedPlan[]) => void;
  storedVersions: FcStoredVersions;
  recordVersion: (warehouse: string, kind: 'plans' | 'cycles', record: any) => void;
  setTrial: (trial: Trial | null) => void;
} | null>(null);
export function FcWorkflowProvider({ children }: { children: React.ReactNode }) {
  const [trial, setTrialState] = useState<Trial | null>(null);
  const [planningPlans, setPlanningPlans] = useState<ImportedPlan[]>([]);
  const [storedVersions, setStoredVersions] = useState<FcStoredVersions>({});
  const setTrial = useCallback((next: Trial | null) => {
    setTrialState(next);
    if (next) setPlanningPlans(next.plans);
  }, []);
  const recordVersion = useCallback(
    (warehouse: string, kind: 'plans' | 'cycles', record: any) =>
      setStoredVersions((previous) => ({
        ...previous,
        [warehouse]: { ...previous[warehouse], [kind]: record },
      })),
    [],
  );
  useEffect(() => {
    updateContext(
      'localPlanning',
      trial ? { status: 'user_import_trial', ...trial } : { status: 'inactive' },
    );
  }, [trial]);
  useEffect(() => {
    const clear = () => {
      setTrialState(null);
      setPlanningPlans([]);
      setStoredVersions({});
    };
    window.addEventListener('workbench-fc-view-restored', clear);
    window.addEventListener('gea-identity-changed', clear);
    window.addEventListener('gea-session-changing', clear);
    return () => {
      window.removeEventListener('workbench-fc-view-restored', clear);
      window.removeEventListener('gea-identity-changed', clear);
      window.removeEventListener('gea-session-changing', clear);
    };
  }, []);
  return (
    <WorkflowContext.Provider
      value={{ trial, setTrial, planningPlans, setPlanningPlans, storedVersions, recordVersion }}
    >
      {children}
    </WorkflowContext.Provider>
  );
}
export const fcTrialScope = (asOf: string, days: number, warehouse = '') =>
  JSON.stringify([asOf, days, warehouse]);
export function useFcWorkflow() {
  const value = useContext(WorkflowContext);
  if (!value) throw Error('缺少分仓工作台上下文');
  return value;
}
const text = (value: unknown) => (value == null ? '-' : String(value));
const numeric = (value: unknown) =>
  value == null ? '-' : Number(value).toLocaleString('zh-CN', { maximumFractionDigits: 2 });

export function FcConfiguredList(
  props: React.ComponentProps<typeof OriginalBusinessList> & { actionScope: FcReadScope },
) {
  const { actionScope: scope } = props;
  const { planningPlans, setTrial, storedVersions } = useFcWorkflow();
  const month = scope.input.asOf.slice(0, 7),
    days = scope.input.cycleDays ?? 7;
  const draftKey = keyFor('order-draft', month),
    planDraftKey = keyFor('plan-draft', month);
  const [draft, setDraft] = useState(() => loadDraft(draftKey));
  const [quantityInputs, setQuantityInputs] = useState<Record<string, string>>({});
  useEffect(() => setQuantityInputs({}), [draftKey]);
  const [planDraft, setPlanDraft] = useState(() => loadPlan(planDraftKey));
  const [detailRow, setDetailRow] = useState<FcRow | null>(null);
  const [dialog, setDialog] = useState<'template' | 'import' | 'draft' | 'export' | null>(null);
  const [templateMonth, setTemplateMonth] = useState(defaultPlanTemplateMonth);
  const [importErrors, setImportErrors] = useState<
    { row: number; field: string; message: string }[]
  >([]);
  const [importPlans, setImportPlans] = useState<ImportedPlan[]>([]);
  const [exportRows, setExportRows] = useState<FcRow[]>([]);
  const [previewState, setPreviewState] = useState<'loading' | 'ready' | 'failed'>('ready');
  const [incompletePreviewCount, setIncompletePreviewCount] = useState(0);
  const [previewProgress, setPreviewProgress] = useState<{ loaded: number; total: number } | null>(
    null,
  );
  const [exportWarehouse, setExportWarehouse] = useState('');
  const [dmsFields, setDmsFields] = useState({
    customerCode: '',
    addressCode: '',
    pupCode: '',
  });
  const [dmsReceipt, setDmsReceipt] = useState<{
    orderCode: string;
    aiPreOrderCode: string;
  } | null>(null);
  const [receiptArchived, setReceiptArchived] = useState(false);
  const pendingReceipts = fcPersistence.pendingReceipts();
  const warehouseReceiptPending = pendingReceipts.some(
    (pending) => pending.warehouseCode === exportWarehouse,
  );
  const [consumptionReviewed, setConsumptionReviewed] = useState(false);
  useEffect(() => setConsumptionReviewed(false), [exportRows, draft, exportWarehouse]);
  useEffect(() => {
    setDmsFields({ customerCode: '', addressCode: '', pupCode: '' });
    setDmsReceipt(null);
  }, [exportWarehouse]);
  const [dialogPage, setDialogPage] = useState(1);
  const [busy, setBusy] = useState(false),
    [notice, setNotice] = useState('');
  const active = useRef<AbortController | null>(null);
  const scopeId = JSON.stringify([scope.viewId, scope.input]);
  useEffect(() => {
    active.current?.abort();
    setBusy(false);
    setDialog(null);
    setDetailRow(null);
    setNotice('');
    setDmsReceipt(null);
    return () => active.current?.abort();
  }, [scopeId]);
  useEffect(() => {
    const restore = () => {
      active.current?.abort();
      setDmsReceipt(null);
      setDmsFields({ customerCode: '', addressCode: '', pupCode: '' });
      setBusy(false);
      setDraft(loadDraft(draftKey));
      setQuantityInputs({});
      setPlanDraft(loadPlan(planDraftKey));
      setDialog(null);
      setDetailRow(null);
    };
    window.addEventListener('workbench-fc-view-restored', restore);
    window.addEventListener('gea-identity-changed', restore);
    window.addEventListener('gea-session-changing', restore);
    return () => {
      window.removeEventListener('workbench-fc-view-restored', restore);
      window.removeEventListener('gea-identity-changed', restore);
      window.removeEventListener('gea-session-changing', restore);
    };
  }, [draftKey, planDraftKey]);
  const plans = planningPlans;
  const save = (next: Draft) => {
    setDraft(next);
    memoryStorage.setItem(draftKey, JSON.stringify(next));
  };
  const run = async (work: (signal: AbortSignal) => Promise<void>) => {
    active.current?.abort();
    const task = new AbortController();
    active.current = task;
    setBusy(true);
    setNotice('');
    try {
      await work(task.signal);
    } catch (error) {
      if (!task.signal.aborted)
        setNotice(error instanceof Error ? error.message : '操作失败，请重试');
    } finally {
      if (!task.signal.aborted) setBusy(false);
    }
  };
  const updateQuantity = (row: FcRow, raw: string) => {
    const value = raw.trim() ? Number(raw) : 0;
    if (!Number.isFinite(value) || value < 0 || value > 1e9) return;
    const key = rowKey(row);
    // Keep the editing text separate from the numeric draft used by exports.
    setQuantityInputs((current) => ({ ...current, [key]: raw }));
    save({ ...draft, quantities: { ...draft.quantities, [key]: value }, dirty: true });
  };
  const displayPlan = (row: FcRow, field: string) => {
    const nextMonth = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 1);
    const next = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}`;
    const plan = plans.find(
      (item) =>
        planKey(item) === rowKey(row) && item.month === (field.includes('_next_') ? next : month),
    );
    if (!plan) return null;
    if (field.endsWith('_out')) return numeric(plan.outboundQty);
    if (field.endsWith('_transfer')) return numeric(plan.transferQty);
    if (field.endsWith('_source')) return '人工导入';
    if (field === 'missing_plan_status') return '已试算';
    return null;
  };
  const renderCell = (row: FcRow, column: { field: string }) => {
    if (scope.viewId === 'plan') {
      const value = displayPlan(row, column.field);
      if (value !== null) return value;
    }
    if (scope.viewId === 'replenishment') {
      if (column.field === 'sku')
        return (
          <button type="button" className="secondary-button" onClick={() => setDetailRow(row)}>
            {text(row.sku)}
          </button>
        );
      const key = rowKey(row);
      if (column.field === 'missing_actualQty')
        return (
          <input
            className="fc-quantity-input"
            type="number"
            aria-label={`${text(row.sku)}实际补货量`}
            disabled={
              busy ||
              (dialog === 'export' && Boolean(dmsReceipt)) ||
              knownNumber(row.recommended_qty) === null
            }
            min={0}
            max={1e9}
            step="any"
            value={
              quantityInputs[key] ??
              draft.quantities[key] ??
              text(row.recommended_qty).replace('-', '')
            }
            onChange={(event) => updateQuantity(row, event.target.value)}
            onBlur={() =>
              setQuantityInputs((current) => {
                const next = { ...current };
                delete next[key];
                return next;
              })
            }
          />
        );
      if (column.field === 'missing_reason')
        return (
          <input
            className="fc-reason-input"
            aria-label={`${text(row.sku)}调整原因`}
            disabled={busy || (dialog === 'export' && Boolean(dmsReceipt))}
            maxLength={500}
            value={draft.reasons[key] ?? ''}
            onChange={(event) =>
              save({
                ...draft,
                dirty: true,
                reasons: { ...draft.reasons, [key]: event.target.value },
              })
            }
          />
        );
    }
    return props.renderCell(row, column);
  };
  const importFile = (file: File) =>
    run(async (signal) => {
      const rows = await readWorkbook(file);
      signal.throwIfAborted();
      const source = await readFcActionRows({ ...scope, viewId: 'plan' }, signal);
      const parsed = validateFcImport(rows, source);
      signal.throwIfAborted();
      setImportErrors(parsed.errors);
      setImportPlans(parsed.plans);
      setDialogPage(1);
      setDialog('import');
      const next = { fileName: file.name, rows, importedAt: new Date().toISOString() };
      setPlanDraft(next);
      if (!parsed.errors.length) memoryStorage.setItem(planDraftKey, JSON.stringify(next));
    });
  const previewDraft = (mode: 'draft' | 'export') => {
    setDialog(mode);
    setPreviewState('loading');
    setIncompletePreviewCount(0);
    setPreviewProgress(null);
    setExportRows([]);
    setDmsReceipt(null);
    setDialogPage(1);
    return run(async (signal) => {
      try {
        const rows = (
          await readFcActionRows({ ...scope, viewId: 'replenishment' }, signal, (loaded, total) => {
            if (!signal.aborted) setPreviewProgress({ loaded, total });
          })
        ).map((row) => applyFcPlan(row, plans, scope.input.asOf, days));
        signal.throwIfAborted();
        const candidates = rows.filter((row) =>
          mode === 'draft'
            ? Object.hasOwn(draft.quantities, rowKey(row)) ||
              Object.hasOwn(draft.reasons, rowKey(row))
            : Object.hasOwn(draft.quantities, rowKey(row)) ||
              knownNumber(row.recommended_qty) === null ||
              quantity(row.recommended_qty) > 0,
        );
        const selected = candidates.filter(
          (row) => String(row.warehouse_code ?? '').trim() && String(row.sku ?? '').trim(),
        );
        setIncompletePreviewCount(candidates.length - selected.length);
        const warehouses = [
          ...new Set<string>(selected.map((row: FcRow) => String(row.warehouse_code))),
        ];
        setExportWarehouse(warehouses.length === 1 ? warehouses[0] : '');
        setExportRows(selected);
        setPreviewState('ready');
      } catch (error) {
        if (!signal.aborted) setPreviewState('failed');
        throw error;
      }
    });
  };
  const downloadTemplate = () =>
    run(async (signal) => {
      const rows = await readFcActionRows({ ...scope, viewId: 'plan' }, signal);
      const records = rows.map((row) => {
        const local = plans.find(
          (item) => planKey(item) === rowKey(row) && item.month === templateMonth,
        );
        const sameMonth = String(row.stat_month ?? '') === templateMonth.replace('-', '');
        const planMonth = String(row.stat_month ?? '');
        const nextPeriod =
          /^\d{6}$/.test(planMonth) &&
          templateMonth === nextMonth(planMonth.slice(0, 4) + '-' + planMonth.slice(4));
        return [
          text(row.warehouse_code),
          text(row.warehouse_name),
          templateMonth,
          text(row.sku),
          text(row.material_name),
          local?.outboundQty ??
            (sameMonth
              ? (row.month_out_plan ?? '')
              : nextPeriod
                ? (row.period_next_out ?? row.future30_qty ?? '')
                : ''),
          local?.transferQty ?? (sameMonth ? (row.warehouse_month_transfer_plan ?? '') : ''),
        ];
      });
      signal.throwIfAborted();
      downloadWorkbook(
        [[...IMPORT_FIELDS], ...records],
        `分仓计划-${templateMonth}.xlsx`,
        '分仓计划导入',
      );
      setDialog(null);
      setNotice('Excel 模板已下载');
    });
  const applyImport = () =>
    run(async (signal) => {
      if (!planDraft) return;
      const source = await readFcActionRows({ ...scope, viewId: 'plan' }, signal);
      const parsed = validateFcImport(planDraft.rows, source);
      setImportErrors(parsed.errors);
      setImportPlans(parsed.plans);
      if (parsed.errors.length) return;
      const rows = await readFcActionRows(
        {
          ...scope,
          viewId: 'replenishment',
          input: {
            ...scope.input,
            filters: scope.input.filters?.warehouse_code
              ? { warehouse_code: scope.input.filters.warehouse_code }
              : {},
          },
        },
        signal,
      );
      const mergedPlans = mergeFcPlans(plans, parsed.plans);
      const calculated = rows.map((row) => applyFcPlan(row, mergedPlans, scope.input.asOf, days));
      const summary = summarizeFcRows(calculated);
      signal.throwIfAborted();
      setTrial({
        scope: fcTrialScope(scope.input.asOf, days, scope.input.filters?.warehouse_code),
        plans: mergedPlans,
        ...summary,
      });
      setDialog(null);
      setNotice('计划已导入并完成试算');
    });
  const exportCsv = () =>
    run(async (signal) => {
      const rows = await readFcActionRows(scope, signal);
      const columns: { field: string; label: string; valueField?: string }[] = props.columns;
      const escape = (value: unknown) => {
        const valueText = value == null ? '' : String(value);
        return (
          '"' +
          (/^[=+\-@\t\r]/.test(valueText) && typeof value !== 'number'
            ? "'" + valueText
            : valueText
          ).replaceAll('"', '""') +
          '"'
        );
      };
      const content = [
        columns.map((column) => column.label),
        ...rows.map((source) => {
          const row = applyFcPlan(source, plans, scope.input.asOf, days);
          return columns.map((column) =>
            column.field === 'missing_actualQty'
              ? (draft.quantities[rowKey(row)] ?? row.recommended_qty)
              : column.field === 'missing_reason'
                ? (draft.reasons[rowKey(row)] ?? '')
                : (displayPlan(row, column.field) ?? row[column.valueField ?? column.field]),
          );
        }),
      ]
        .map((row) => row.map(escape).join(','))
        .join('\r\n');
      signal.throwIfAborted();
      const url = URL.createObjectURL(
        new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8' }),
      );
      const link = document.createElement('a');
      link.href = url;
      link.download = `分仓-${props.view.title}-${scope.input.asOf}.csv`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice('CSV 已导出');
    });
  const previewRows =
    dialog === 'export'
      ? exportRows.filter((row) => String(row.warehouse_code) === exportWarehouse)
      : exportRows;
  const confirmExport = () => {
    try {
      validateFcSubmission(previewRows, draft.quantities, draft.reasons);
    } catch (error) {
      setNotice((error as Error).message);
      return;
    }
    const selected = previewRows.filter(
      (row) => (draft.quantities[rowKey(row)] ?? quantity(row.recommended_qty)) > 0,
    );
    if (!exportWarehouse || !selected.length) {
      setNotice('请选择分仓，并填写大于0的补货量');
      return;
    }
    const warehouseName = String(selected[0].warehouse_name ?? exportWarehouse);
    downloadWorkbook(
      dmsWorkbookRows(
        selected.map((row) => ({
          sku: String(row.sku),
          productName: String(row.material_name ?? ''),
          quantity: draft.quantities[rowKey(row)] ?? quantity(row.recommended_qty),
        })),
      ),
      `DMS补货-${warehouseName}-${month}.xlsx`,
      'DMS导入',
    );
    const keys = new Set(selected.map(rowKey));
    save({
      quantities: Object.fromEntries(
        Object.entries(draft.quantities).filter(([key]) => !keys.has(key)),
      ),
      reasons: Object.fromEntries(Object.entries(draft.reasons).filter(([key]) => !keys.has(key))),
      dirty: false,
    });
    setDialog(null);
    setNotice('补货清单已导出');
  };
  const submitDms = () =>
    run(async (signal) => {
      if (!exportWarehouse) throw Error('请选择分仓');
      if (warehouseReceiptPending) throw Error('该分仓有待核对的回执归档，请先核对再开始下一批');
      const selected = previewRows.filter(
        (row) => (draft.quantities[rowKey(row)] ?? quantity(row.recommended_qty)) > 0,
      );
      validateFcSubmission(previewRows, draft.quantities, draft.reasons);
      if (!selected.length) throw Error('请填写大于0的补货量');
      const remarks = previewRows
        .filter((row) => draft.reasons[rowKey(row)]?.trim())
        .map(
          (row) =>
            `${row.sku}: ${draft.quantities[rowKey(row)] ?? row.recommended_qty}；${draft.reasons[rowKey(row)].trim()}`,
        )
        .join('\n');
      if (remarks.length > 500)
        throw Error('调整说明超过DMS备注500字限制，请精简后提交；草稿已保留');
      const fields = Object.fromEntries(
        Object.entries(dmsFields).map(([key, value]) => [key, value.trim()]),
      );
      if (Object.values(fields).some((value) => !value))
        throw Error('请填写客户、收货地址和提货点编码');
      const order = {
        ...fields,
        ...(remarks ? { orderRemarks: remarks } : {}),
        orderModel: 'cg',
        itemList: selected
          .map((row) => ({
            productCode: String(row.sku),
            quantity: draft.quantities[rowKey(row)] ?? quantity(row.recommended_qty),
          }))
          .sort((a, b) => a.productCode.localeCompare(b.productCode)),
      };
      const provenance = await fcSubmissionProvenance({
        warehouse: exportWarehouse,
        asOf: scope.input.asOf,
        plans,
        days,
        rules: scope.input.fcCycleRules ?? [],
        cycleWarehouse: scope.input.fcCycleWarehouse,
        stored: storedVersions,
        rows: previewRows,
      });
      signal.throwIfAborted();
      if (
        provenance.calculationContext.planSource === 'human-trial' ||
        provenance.calculationContext.cycleSource === 'page-trial'
      )
        throw Error('请先保存当前人工计划或周期规则，再提交补货');
      const currentRows = (
        await readFcActionRows(
          {
            ...scope,
            viewId: 'replenishment',
            input: {
              ...scope.input,
              filters: { ...scope.input.filters, warehouse_code: exportWarehouse },
            },
          },
          signal,
        )
      )
        .map((row) => applyFcPlan(row, plans, scope.input.asOf, days))
        .filter(
          (row) =>
            String(row.warehouse_code) === exportWarehouse &&
            Boolean(String(row.sku ?? '').trim()) &&
            (Object.hasOwn(draft.quantities, rowKey(row)) ||
              knownNumber(row.recommended_qty) === null ||
              quantity(row.recommended_qty) > 0),
        );
      const currentProvenance = await fcSubmissionProvenance({
        warehouse: exportWarehouse,
        asOf: scope.input.asOf,
        plans,
        days,
        rules: scope.input.fcCycleRules ?? [],
        cycleWarehouse: scope.input.fcCycleWarehouse,
        stored: storedVersions,
        rows: currentRows,
      });
      signal.throwIfAborted();
      if (provenance.snapshotVersion !== currentProvenance.snapshotVersion)
        throw Error('库存、订单或计划数据已变化，请重新打开确认清单复核后提交');
      const confirmationRows = previewRows
        .map((row) => ({
          sku: String(row.sku),
          productName: String(row.material_name ?? ''),
          recommendedQty: Number(row.recommended_qty),
          actualQty: draft.quantities[rowKey(row)] ?? Number(row.recommended_qty),
          reason: draft.reasons[rowKey(row)] ?? '',
        }))
        .sort((a, b) => a.sku.localeCompare(b.sku));
      const { aiPreOrderCode, legacyAiPreOrderCode } = await fcSubmissionIdentity({
        warehouseCode: exportWarehouse,
        month,
        snapshotVersion: provenance.snapshotVersion,
        planRevision: provenance.planRevision,
        cycleRevision: provenance.cycleRevision,
        consumptionReviewed,
        rows: confirmationRows,
        order,
      });
      signal.throwIfAborted();
      const readiness = (await call(
        'branch-dms',
        {
          operation: 'preflight',
          warehouseCode: exportWarehouse,
          order: { aiPreOrderCode, ...order },
        },
        { signal },
      )) as { ready?: boolean; scope?: string };
      signal.throwIfAborted();
      if (readiness?.ready !== true || readiness.scope !== 'local-configuration')
        throw Error('提交前配置检查未通过，请刷新页面并检查Host版本');
      const receipt = await persistAndSubmitFc(
        exportWarehouse,
        {
          stage: 'confirmed',
          ...provenance,
          month,
          consumptionReviewed,
          aiPreOrderCode,
          rows: confirmationRows,
        },
        signal,
        async () =>
          call(
            'branch-dms',
            {
              operation: 'submit',
              warehouseCode: exportWarehouse,
              order: { aiPreOrderCode, ...order },
            },
            { signal },
          ),
        (received) => {
          signal.throwIfAborted();
          setReceiptArchived(false);
          setDmsReceipt(received);
          setNotice(`DMS已返回订单号：${received.orderCode}；正在保存回执，请勿重复下单。`);
        },
        legacyAiPreOrderCode,
      );
      signal.throwIfAborted();
      setDmsReceipt(receipt);
      setReceiptArchived(true);
      setNotice(`已暂存至DMS，订单号：${receipt.orderCode}。尚未审核或推单。`);
      try {
        await call('branch-dms-open', {}, { signal });
        signal.throwIfAborted();
        setNotice(
          `已暂存至DMS，订单号：${receipt.orderCode}；已请求打开订单管理。若未打开，请点击“进入DMS订单管理”，无需重新提交。`,
        );
      } catch {
        if (!signal.aborted)
          setNotice(
            `已暂存至DMS，订单号：${receipt.orderCode}；跳转未完成，请点击“进入DMS订单管理”重试，无需重新提交。`,
          );
      }
    });
  const verifyReceiptArchive = (pending: FcStoreScope) =>
    run(async (signal) => {
      const receipt = await verifyFcReceiptArchive(pending, signal);
      signal.throwIfAborted();
      if (pending.warehouseCode === exportWarehouse && receipt.orderCode === dmsReceipt?.orderCode)
        setReceiptArchived(true);
      setNotice(`DMS订单 ${receipt.orderCode} 的回执归档已核实；未重新下单。`);
    });
  const loginDms = () =>
    run(async (signal) => {
      await call('branch-dms-open', {}, { signal });
      signal.throwIfAborted();
      setNotice('已请求打开DMS订单管理；此操作不会重复下单。');
    });
  const count = new Set([...Object.keys(draft.quantities), ...Object.keys(draft.reasons)]).size;
  const toolbar = (
    <>
      {scope.viewId === 'replenishment' &&
        pendingReceipts.map((pending) => (
          <button
            key={JSON.stringify(pending)}
            type="button"
            className="secondary-button"
            disabled={busy}
            onClick={() => void verifyReceiptArchive(pending)}
          >
            核对回执归档（{pending.warehouseCode}）
          </button>
        ))}
      {scope.viewId === 'plan' && (
        <>
          <button
            type="button"
            className="secondary-button"
            disabled={busy || props.loading}
            onClick={() => {
              setNotice('');
              setDialog('template');
            }}
          >
            下载模板
          </button>
          <label className={`secondary-button file-button ${busy ? 'fc-action-disabled' : ''}`}>
            导入 Excel
            <input
              aria-label="导入分仓计划Excel"
              type="file"
              accept=".xlsx"
              disabled={busy || props.loading}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void importFile(file);
                event.currentTarget.value = '';
              }}
            />
          </label>
          {planDraft && (
            <button
              type="button"
              className="secondary-button"
              disabled={busy}
              onClick={() => {
                setImportErrors([]);
                setImportPlans([]);
                setDialogPage(1);
                setDialog('import');
              }}
            >
              导入草稿
            </button>
          )}
        </>
      )}
      {scope.viewId === 'replenishment' && (
        <>
          <button
            type="button"
            className="secondary-button"
            disabled={busy || props.loading}
            onClick={() => void previewDraft('draft')}
          >
            草稿（{count}）
          </button>
          <button
            type="button"
            className="primary-button panel-primary"
            disabled={busy || props.loading}
            onClick={() => void previewDraft('export')}
          >
            提交
          </button>
        </>
      )}
      <button
        type="button"
        className="secondary-button"
        disabled={busy || props.loading}
        onClick={() => void exportCsv()}
      >
        CSV
      </button>
      {busy && !dialog && <span role="status">正在读取…</span>}
    </>
  );
  const visibleRows = (dialog === 'import' ? importPlans : previewRows).slice(
    (dialogPage - 1) * 10,
    dialogPage * 10,
  );
  return (
    <>
      <OriginalBusinessList
        {...props}
        toolbarActions={toolbar}
        renderCell={renderCell}
        result={
          props.result
            ? {
                ...props.result,
                rows: props.result.rows.map((row: FcRow) =>
                  applyFcPlan(row, plans, scope.input.asOf, days),
                ),
              }
            : props.result
        }
      />
      {notice && (
        <p role="status" className="fc-workflow-notice">
          {notice}
        </p>
      )}
      <Modal
        visible={detailRow !== null}
        title="SKU补货依据"
        footer={null}
        onCancel={() => setDetailRow(null)}
        style={{ width: 'min(1100px, calc(100vw - 32px))' }}
      >
        {detailRow && (
          <>
            <p>
              {text(detailRow.warehouse_name)} · {text(detailRow.sku)} ·{' '}
              {text(detailRow.material_name)}
            </p>
            <p>
              建议补货 {text(detailRow.recommended_qty)} 件；目标库存{' '}
              {text(detailRow.target_inventory_qty)} 件；订单剩余需求{' '}
              {text(detailRow.current_order_remaining)} 件；调拨中{' '}
              {text(detailRow.open_transfer_reported_qty)} 件。
            </p>
            <p>
              {text(detailRow.calculation_status)}
              。目标按本月计划日均向上取整×（周期+3天），先扣订单尚未占用的需求，再扣调拨中量；缺项待核实。
            </p>
            <CurrentShortageList
              key={rowKey(detailRow)}
              config={scope.config}
              initialFilters={{
                warehouse_code: String(detailRow.warehouse_code),
                sku: String(detailRow.sku),
              }}
            />
            <ConfiguredFactsPage
              key={'age' + rowKey(detailRow)}
              config={scope.config}
              embedded
              date={scope.input.asOf}
              viewIds={['inventory']}
              initialFilters={{
                warehouse_code: String(detailRow.warehouse_code),
                material_code: String(detailRow.sku),
              }}
            />
            <ConfiguredFactsPage
              key={'base' + rowKey(detailRow)}
              config={scope.config}
              embedded
              date={scope.input.asOf}
              viewIds={['base-resources']}
              initialFilters={{ sku: String(detailRow.sku) }}
            />
            <p>基地可用库存仅供参考；供货关系、在途和未来排产未齐时不作供货承诺。</p>
          </>
        )}
      </Modal>
      <Modal
        visible={dialog !== null}
        title={
          dialog === 'template'
            ? '下载分仓计划模板'
            : dialog === 'import'
              ? 'Excel 导入校验与预览'
              : dialog === 'draft'
                ? '补货草稿'
                : '确认补货订单'
        }
        footer={null}
        onCancel={() => {
          active.current?.abort();
          setBusy(false);
          setDialog(null);
        }}
        style={{ width: 'min(760px, calc(100vw - 32px))' }}
      >
        <div className="fc-workflow-dialog">
          {(dialog === 'draft' || dialog === 'export') && previewState !== 'ready' ? (
            <div role="status" aria-live="polite">
              {previewState === 'loading' ? (
                <p>
                  {previewProgress
                    ? `正在读取补货清单：${previewProgress.loaded} / ${previewProgress.total} 条…`
                    : '正在读取补货清单，请稍候…'}
                </p>
              ) : (
                <button
                  type="button"
                  className="secondary-button"
                  disabled={busy}
                  onClick={() => void previewDraft(dialog)}
                >
                  重新读取
                </button>
              )}
            </div>
          ) : dialog === 'template' ? (
            <label>
              计划月份{' '}
              <select
                aria-label="模板计划月份"
                value={templateMonth}
                onChange={(event) => setTemplateMonth(event.target.value)}
              >
                {[currentPlanningMonth(), nextMonth(currentPlanningMonth())].map((value) => (
                  <option key={value} value={value}>
                    {value.slice(0, 4)}年{Number(value.slice(5, 7))}月
                  </option>
                ))}
              </select>
            </label>
          ) : dialog === 'import' ? (
            <>
              <p>
                {planDraft?.fileName} · {planDraft?.rows.length ?? 0}行
              </p>
              {importErrors.length > 0 ? (
                <ul role="alert">
                  {importErrors.map((error, index) => (
                    <li key={index}>
                      第{error.row}行 · {error.field}：{error.message}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>确认后在当前页面试算；不修改数据库。</p>
              )}
              {visibleRows.length > 0 && (
                <div className="table-scroll">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>分仓/SKU</th>
                        <th>月份</th>
                        <th>出货计划</th>
                        <th>调拨计划</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importPlans.slice((dialogPage - 1) * 10, dialogPage * 10).map((plan) => (
                        <tr key={planKey(plan) + plan.month}>
                          <td>
                            {plan.warehouseName} / {plan.sku}
                          </td>
                          <td>{plan.month}</td>
                          <td>{numeric(plan.outboundQty)}</td>
                          <td>{numeric(plan.transferQty)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : (
            <>
              {incompletePreviewCount > 0 && (
                <p role="alert">
                  {incompletePreviewCount}条记录缺少分仓或商品编码，已排除出本次提交和导出，请核对源数据。
                </p>
              )}
              {dialog === 'export' && (
                <label>
                  分仓{' '}
                  <select
                    aria-label="导出补货分仓"
                    disabled={busy}
                    value={exportWarehouse}
                    onChange={(event) => {
                      setDmsReceipt(null);
                      setExportWarehouse(event.target.value);
                      setDialogPage(1);
                    }}
                  >
                    <option value="">请选择分仓</option>
                    {[
                      ...new Map(
                        exportRows.map((row) => [
                          String(row.warehouse_code),
                          String(row.warehouse_name ?? row.warehouse_code),
                        ]),
                      ).entries(),
                    ].map(([code, name]) => (
                      <option key={code} value={code}>
                        {name}（{code}）
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {dialog === 'export' && (
                <fieldset disabled={busy || Boolean(dmsReceipt)}>
                  <legend>DMS 暂存信息</legend>
                  {(
                    [
                      ['customerCode', '客户编码'],
                      ['addressCode', '收货地址编码'],
                      ['pupCode', '提货点编码'],
                    ] as const
                  ).map(([field, label]) => (
                    <label key={field}>
                      {label}{' '}
                      <input
                        aria-label={label}
                        value={dmsFields[field]}
                        maxLength={500}
                        onChange={(event) =>
                          setDmsFields((current) => ({
                            ...current,
                            [field]: event.target.value,
                          }))
                        }
                      />
                    </label>
                  ))}
                  <p>
                    数量单位：件；默认速冻、配送、不拼车、同意缺货分批到货。请核对提货点与所选分仓。
                  </p>
                </fieldset>
              )}
              {dmsReceipt && dialog === 'export' && (
                <div>
                  <p>
                    预订单号：{dmsReceipt.aiPreOrderCode}；DMS订单号：{dmsReceipt.orderCode}
                  </p>
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={busy || !receiptArchived}
                    onClick={() => void previewDraft('export')}
                  >
                    重新读取，准备下一批
                  </button>
                  {!receiptArchived && (
                    <p role="alert">DMS已收单，回执归档待核对，请先核对归档再开始下一批。</p>
                  )}
                  <p>
                    重新读取后请复核数量和保留的人工调整；相同快照和确认内容仍返回原批次，数据或确认内容变化后形成新批次。
                  </p>
                </div>
              )}

              <p>
                {previewRows.length}个SKU
                {dialog === 'export'
                  ? '，可暂存至DMS，或仅导出Excel。暂存成功前请保留草稿；结果未知时请先在DMS核查。'
                  : ''}
              </p>
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>分仓/SKU</th>
                      <th>建议</th>
                      <th>实际补货量</th>
                      <th>调整原因</th>
                      {dialog === 'draft' && <th>操作</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.slice((dialogPage - 1) * 10, dialogPage * 10).map((row) => (
                      <tr key={rowKey(row)}>
                        <td>
                          {text(row.warehouse_name)} / {text(row.sku)}
                        </td>
                        <td>{numeric(row.recommended_qty)}</td>
                        <td>{renderCell(row, { field: 'missing_actualQty' })}</td>
                        <td>{renderCell(row, { field: 'missing_reason' })}</td>
                        {dialog === 'draft' && (
                          <td>
                            <button
                              type="button"
                              className="text-button"
                              onClick={() => {
                                const quantities = { ...draft.quantities },
                                  reasons = { ...draft.reasons };
                                delete quantities[rowKey(row)];
                                delete reasons[rowKey(row)];
                                save({ quantities, reasons, dirty: true });
                                setExportRows((rows) =>
                                  rows.filter((item) => rowKey(item) !== rowKey(row)),
                                );
                              }}
                            >
                              撤销
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {dialog !== 'template' && (dialog === 'import' || previewState === 'ready') && (
            <DataPagination
              ariaLabel="操作预览分页"
              pageNumber={dialogPage}
              pageSize={10}
              totalCount={dialog === 'import' ? importPlans.length : previewRows.length}
              onPageChange={setDialogPage}
            />
          )}
          {notice && <p role="alert">{notice}</p>}
          <div className="fc-workflow-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                active.current?.abort();
                setBusy(false);
                setDialog(null);
              }}
            >
              取消
            </button>
            {dialog === 'template' && (
              <button
                type="button"
                className="primary-button"
                disabled={busy || !/^20\d{2}-(0[1-9]|1[0-2])$/.test(templateMonth)}
                onClick={() => void downloadTemplate()}
              >
                下载模板
              </button>
            )}
            {dialog === 'import' && (
              <button
                type="button"
                className="primary-button"
                disabled={busy || importErrors.length > 0 || !planDraft?.rows.length}
                onClick={() => void applyImport()}
              >
                确认导入并重算
              </button>
            )}
            {dialog === 'export' && previewState === 'ready' && (
              <>
                <label>
                  <input
                    type="checkbox"
                    checked={consumptionReviewed}
                    disabled={busy || Boolean(dmsReceipt)}
                    onChange={(e) => setConsumptionReviewed(e.target.checked)}
                  />
                  已复核库存消化与本次补货数量
                </label>
                <button
                  type="button"
                  className="primary-button"
                  disabled={
                    busy || !previewRows.length || Boolean(dmsReceipt) || warehouseReceiptPending
                  }
                  onClick={() => void submitDms()}
                >
                  确认暂存至DMS
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  disabled={busy}
                  onClick={() => void loginDms()}
                >
                  进入DMS订单管理
                </button>
                <button
                  type="button"
                  className="primary-button"
                  disabled={busy || !previewRows.length}
                  onClick={confirmExport}
                >
                  仅导出Excel
                </button>
              </>
            )}
          </div>
        </div>
      </Modal>
    </>
  );
}
