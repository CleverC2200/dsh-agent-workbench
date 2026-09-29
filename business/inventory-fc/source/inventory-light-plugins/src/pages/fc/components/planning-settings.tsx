"use client";
import { useState } from "react";
import { DataPagination } from "../../../dsh-ui/controls";
import {
  useListPagination,
  type RemotePagination,
} from "./use-list-pagination.ts";
import type { CycleRule } from "../../../../../fc/src/lib/rules.ts";
import type { ImportedPlan } from "../../../../../fc/src/lib/planning.ts";

export function PlanningTable({
  rows,
  search,
  remotePagination,
}: {
  rows: ImportedPlan[];
  search: string;
  remotePagination?: RemotePagination;
}) {
  const filtered = rows.filter((row) =>
    `${row.month} ${row.sku} ${row.productName} ${row.category} ${row.materialGroup}`
      .toLowerCase()
      .includes(search.trim().toLowerCase()),
  );
  const pagination = useListPagination(filtered, search, remotePagination);
  return (
    <>
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              {[
                "仓库编号",
                "仓库名称",
                "月份",
                "SKU编码",
                "产品名称",
                "本月出货计划",
                "本月调拨计划",
                "大类",
                "物料组",
              ].map((name) => (
                <th key={name}>{name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pagination.rows.map((row) => (
              <tr key={`${row.month}:${row.sku}`}>
                <td>{row.warehouseCode ?? "—"}</td>
                <td>{row.warehouseName}</td>
                <td>{row.month}</td>
                <td>{row.sku}</td>
                <td>{row.productName}</td>
                <td>{row.outboundQty.toLocaleString("zh-CN")}</td>
                <td>{row.transferQty.toLocaleString("zh-CN")}</td>
                <td>{row.category || "—"}</td>
                <td>{row.materialGroup || "—"}</td>
              </tr>
            ))}
            {!filtered.length && (
              <tr>
                <td colSpan={9}>
                  {rows.length
                    ? "没有匹配的人工计划"
                    : "尚未导入人工计划。请下载模板维护确认量后导入；当前计算使用同步数据。"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <DataPagination
        ariaLabel="分仓计划分页"
        itemLabel="计划"
        {...pagination.props}
      />
    </>
  );
}

export function PersistedCycleSettings({
  warehouseId,
  warehouseName,
  initial,
  onSave,
  saving,
}: {
  warehouseId: string;
  warehouseName: string;
  initial: CycleRule[];
  onSave: (rules: CycleRule[]) => Promise<void>;
  saving: boolean;
}) {
  const [rules, setRules] = useState<CycleRule[]>(initial);
  const warehouseRule = initial.find(
    (rule) => rule.level === "warehouse" && rule.objectId === warehouseId,
  );
  const [level, setLevel] = useState<CycleRule["level"]>("warehouse");
  const [object, setObject] = useState("");
  const [days, setDays] = useState(String(warehouseRule?.cycleDays ?? 7));
  const [from, setFrom] = useState(warehouseRule?.effectiveFrom ?? "");
  const [to, setTo] = useState(warehouseRule?.effectiveTo ?? "");
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const labels: Record<string, string> = {
    warehouse: "分仓整体",
    category: "大类",
    "material-group": "物料组",
    sku: "SKU",
  };
  function add() {
    if (saving) return;
    const value = Number(days),
      objectId = level === "warehouse" ? warehouseId : object.trim();
    if (
      !objectId ||
      !Number.isInteger(value) ||
      value < 1 ||
      value > 365 ||
      (from && to && to < from)
    ) {
      setError("请填写对象、1–365 天整数周期和有效日期范围");
      return;
    }
    const next: CycleRule = {
      id:
        rules.find((row) => row.level === level && row.objectId === objectId)
          ?.id ?? `${level}-${objectId}`.slice(0, 64),
      level,
      objectId,
      cycleDays: value,
      status: "effective",
      ...(from ? { effectiveFrom: from } : {}),
      ...(to ? { effectiveTo: to } : {}),
    };
    const updated = [
      ...rules.filter(
        (row) => row.level !== level || row.objectId !== objectId,
      ),
      next,
    ];
    setRules(updated);
    setDirty(false);
    setError("");
    return updated;
  }
  function save() {
    if (saving) return;
    // Do not wait for setRules to commit: send the locally composed result.
    const updated = dirty ? add() : rules;
    if (updated) void onSave(updated);
  }
  return (
    <div className="cycle-settings persisted-cycle-settings">
      <p>
        SKU → 物料组 → 大类 → 分仓整体；未维护时默认 7
        天。安全库存天数＝补货周期＋3。调整后可试算，尚未保存。
      </p>
      <div className="planning-rule-form">
        <label>
          对象类型
          <select
            disabled={saving}
            value={level}
            onChange={(event) => {
              setLevel(event.target.value as CycleRule["level"]);
              setObject("");
              setDirty(true);
            }}
          >
            {Object.entries(labels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          对象
          <input
            aria-label="规则对象"
            disabled={saving || level === "warehouse"}
            value={level === "warehouse" ? warehouseName : object}
            onChange={(event) => {
              setObject(event.target.value);
              setDirty(true);
            }}
            placeholder="SKU编码 / 大类 / 物料组名称"
          />
        </label>
        <label>
          补货周期
          <span className="cycle-days-control">
            <input
              disabled={saving}
              aria-label="补货周期天数"
              type="number"
              min={1}
              max={365}
              value={days}
              onChange={(event) => {
                setDays(event.target.value);
                setDirty(true);
              }}
            />
            <span>天</span>
          </span>
        </label>
        <label>
          生效日期
          <input
            disabled={saving}
            type="date"
            value={from}
            onChange={(event) => {
              setFrom(event.target.value);
              setDirty(true);
            }}
          />
        </label>
        <label>
          结束日期
          <input
            disabled={saving}
            type="date"
            value={to}
            onChange={(event) => {
              setTo(event.target.value);
              setDirty(true);
            }}
          />
        </label>
        <button className="secondary-button" disabled={saving} onClick={add}>
          加入配置
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>对象类型</th>
              <th>对象</th>
              <th>周期</th>
              <th>生效日期</th>
              <th>结束日期</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {rules.map((rule) => (
              <tr key={rule.id}>
                <td>{labels[rule.level]}</td>
                <td>
                  {rule.level === "warehouse" ? warehouseName : rule.objectId}
                </td>
                <td>{rule.cycleDays} 天</td>
                <td>{rule.effectiveFrom || "立即"}</td>
                <td>{rule.effectiveTo || "长期"}</td>
                <td>
                  <button
                    className="secondary-button"
                    disabled={saving}
                    onClick={() =>
                      setRules((rows) =>
                        rows.filter((row) => row.id !== rule.id),
                      )
                    }
                  >
                    移除
                  </button>
                </td>
              </tr>
            ))}
            {!rules.length && (
              <tr>
                <td colSpan={6}>未维护规则，使用默认 7 天</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="cycle-save-help">
        可直接修改后预览，当前编辑内容会自动加入配置并重算；“加入配置”用于一次维护多个对象。未来生效或更高优先级规则可能影响当前实际周期。
      </p>
      <button className="primary-button" disabled={saving} onClick={save}>
        {saving ? "重算中…" : "应用本页预览并重算"}
      </button>
    </div>
  );
}
