import { dmsWorkbookRows } from '../fc-feedback';
import { updateContext } from '../native/context';
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
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
  recommended: number;
  forwardTurnover: number | null;
};
const WorkflowContext = createContext<{
  trial: Trial | null;
  setTrial: (trial: Trial | null) => void;
} | null>(null);
export function FcWorkflowProvider({ children }: { children: React.ReactNode }) {
  const [trial, setTrial] = useState<Trial | null>(null);
  useEffect(() => {
    updateContext(
      'localPlanning',
      trial ? { status: 'user_import_trial', ...trial } : { status: 'inactive' },
    );
  }, [trial]);
  useEffect(() => {
    const clear = () => setTrial(null);
    window.addEventListener('workbench-fc-view-restored', clear);
    window.addEventListener('gea-identity-changed', clear);
    return () => {
      window.removeEventListener('workbench-fc-view-restored', clear);
      window.removeEventListener('gea-identity-changed', clear);
    };
  }, []);
  return (
    <WorkflowContext.Provider value={{ trial, setTrial }}>{children}</WorkflowContext.Provider>
  );
}
export const fcTrialScope = (asOf: string, days: number) => JSON.stringify([asOf, days]);
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
  const { trial, setTrial } = useFcWorkflow();
  const month = scope.input.asOf.slice(0, 7),
    days = scope.input.cycleDays ?? 7;
  const draftKey = keyFor('order-draft', month),
    planDraftKey = keyFor('plan-draft', month);
  const [draft, setDraft] = useState(() => loadDraft(draftKey));
  const [quantityInputs, setQuantityInputs] = useState<Record<string, string>>({});
  useEffect(() => setQuantityInputs({}), [draftKey]);
  const [planDraft, setPlanDraft] = useState(() => loadPlan(planDraftKey));
  const [dialog, setDialog] = useState<'template' | 'import' | 'draft' | 'export' | null>(null);
  const [templateMonth, setTemplateMonth] = useState(defaultPlanTemplateMonth);
  const [importErrors, setImportErrors] = useState<
    { row: number; field: string; message: string }[]
  >([]);
  const [importPlans, setImportPlans] = useState<ImportedPlan[]>([]);
  const [exportRows, setExportRows] = useState<FcRow[]>([]);
  const [exportWarehouse, setExportWarehouse] = useState('');
  const [dialogPage, setDialogPage] = useState(1);
  const [busy, setBusy] = useState(false),
    [notice, setNotice] = useState('');
  const active = useRef<AbortController | null>(null);
  const scopeId = JSON.stringify([scope.viewId, scope.input]);
  useEffect(() => {
    active.current?.abort();
    setBusy(false);
    setDialog(null);
    setNotice('');
    return () => active.current?.abort();
  }, [scopeId]);
  useEffect(() => {
    const restore = () => {
      active.current?.abort();
      setDraft(loadDraft(draftKey));
      setQuantityInputs({});
      setPlanDraft(loadPlan(planDraftKey));
      setDialog(null);
    };
    window.addEventListener('workbench-fc-view-restored', restore);
    window.addEventListener('gea-identity-changed', restore);
    return () => {
      window.removeEventListener('workbench-fc-view-restored', restore);
      window.removeEventListener('gea-identity-changed', restore);
    };
  }, [draftKey, planDraftKey]);
  const plans = trial?.scope === fcTrialScope(scope.input.asOf, days) ? trial.plans : [];
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
      const key = rowKey(row);
      if (column.field === 'missing_actualQty')
        return (
          <input
            className="fc-quantity-input"
            type="number"
            aria-label={`${text(row.sku)}实际补货量`}
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
  const previewDraft = (mode: 'draft' | 'export') =>
    run(async (signal) => {
      const rows = (await readFcActionRows({ ...scope, viewId: 'replenishment' }, signal)).map(
        (row) => applyFcPlan(row, plans, scope.input.asOf, days),
      );
      const selected = rows.filter((row) =>
        mode === 'draft'
          ? Object.hasOwn(draft.quantities, rowKey(row)) ||
            Object.hasOwn(draft.reasons, rowKey(row))
          : (draft.quantities[rowKey(row)] ?? quantity(row.recommended_qty)) > 0,
      );
      if (
        selected.some(
          (row) => !String(row.warehouse_code ?? '').trim() || !String(row.sku ?? '').trim(),
        )
      )
        throw Error('补货清单缺少分仓或商品编码，未导出');
      const warehouses = [...new Set(selected.map((row) => String(row.warehouse_code)))];
      setExportWarehouse(warehouses.length === 1 ? warehouses[0] : '');
      setExportRows(selected);
      setDialogPage(1);
      setDialog(mode);
    });
  const downloadTemplate = () =>
    run(async (signal) => {
      const rows = await readFcActionRows({ ...scope, viewId: 'plan' }, signal);
      const records = rows.map((row) => {
        const local = plans.find(
          (item) => planKey(item) === rowKey(row) && item.month === templateMonth,
        );
        const sameMonth = String(row.plan_month ?? '').slice(0, 7) === templateMonth;
        return [
          text(row.warehouse_code),
          text(row.warehouse_name),
          templateMonth,
          text(row.sku),
          text(row.material_name),
          local?.outboundQty ?? (sameMonth ? (row.month_out_plan ?? '') : ''),
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
        { ...scope, viewId: 'replenishment', input: { ...scope.input, filters: {} } },
        signal,
      );
      const calculated = rows.map((row) => applyFcPlan(row, parsed.plans, scope.input.asOf, days));
      const recommended = calculated.reduce(
        (total, row) => total + quantity(row.recommended_qty),
        0,
      );
      const demand = calculated.reduce((total, row) => total + quantity(row.calculation_daily), 0);
      const stock = calculated.reduce(
        (total, row) =>
          total + quantity(row.available_qty) + quantity(row.open_transfer_reported_qty),
        0,
      );
      signal.throwIfAborted();
      setTrial({
        scope: fcTrialScope(scope.input.asOf, days),
        plans: parsed.plans,
        recommended,
        forwardTurnover: demand > 0 ? stock / demand : null,
      });
      setDialog(null);
      setNotice('计划已导入并完成试算');
    });
  const exportCsv = () =>
    run(async (signal) => {
      const rows = await readFcActionRows(scope, signal);
      const columns: { field: string; label: string }[] = props.columns;
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
                : (displayPlan(row, column.field) ?? row[column.field]),
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
  const count = new Set([...Object.keys(draft.quantities), ...Object.keys(draft.reasons)]).size;
  const toolbar = (
    <>
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
      {busy && <span role="status">正在读取…</span>}
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
        visible={dialog !== null}
        title={
          dialog === 'template'
            ? '下载分仓计划模板'
            : dialog === 'import'
              ? 'Excel 导入校验与预览'
              : dialog === 'draft'
                ? '补货草稿'
                : '确认导出补货清单'
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
          {dialog === 'template' ? (
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
              {dialog === 'export' && (
                <label>
                  分仓{' '}
                  <select
                    aria-label="导出补货分仓"
                    value={exportWarehouse}
                    onChange={(event) => {
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
              <p>
                {previewRows.length}个SKU
                {dialog === 'export' ? '，确认后导出Excel并清除对应草稿；未向业务系统下单。' : ''}
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
          {dialog !== 'template' && (
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
            {dialog === 'export' && (
              <button
                type="button"
                className="primary-button"
                disabled={busy || !previewRows.length}
                onClick={confirmExport}
              >
                确认导出
              </button>
            )}
          </div>
        </div>
      </Modal>
    </>
  );
}
