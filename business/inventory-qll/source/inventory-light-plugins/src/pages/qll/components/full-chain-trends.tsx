import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "../../../dsh-ui/controls";
import { TrendChart } from "../../../dsh-ui/chart";
import { reportElements } from "../../../channel.js";
import { createHash } from "../../../browser-crypto";
import { referenceText } from "./structure-evidence";
import { ownContextPart } from "../../../native/context";
import type { FullChainWorkspace } from "dsh-agent-manage/inventory-compute/full-chain-types";
import styles from "./full-chain-workbench.module.css";

type Metric = "inventory" | "orders" | "aging";
type TrendResult = {
  dataMode: "MOCK_DATA_ONLY";
  workspaceId: string;
  scope: string;
  filters: Record<string, string>;
  generatedAt: string;
  trends: FullChainWorkspace["trends"];
};
const labels = {
  inventory: "库存趋势",
  orders: "订单缺口趋势",
  aging: "货龄趋势",
};
const series = {
  inventory: [
    { key: "base", name: "基地库存/件", color: "var(--ui-accent)" },
    { key: "branch", name: "分仓可用/件", color: "var(--ui-success)" },
    { key: "customer", name: "客户观察/件", color: "var(--ui-secondary)" },
  ],
  orders: [
    { key: "demandQty", name: "原始需求/件", color: "var(--ui-secondary)" },
    { key: "shortageQty", name: "发运后缺口/件", color: "var(--ui-accent)" },
  ],
  aging: [
    { key: "base", name: "基地平均货龄/天", color: "var(--ui-accent)" },
    { key: "branch", name: "分仓平均货龄/天", color: "var(--ui-success)" },
  ],
};

/** Same 30-day SQL window; absent dates/layers are display gaps, never new facts. */
export function trendView(
  trends: FullChainWorkspace["trends"],
  metric: Metric,
  capturedAt: string,
) {
  const asOf = new Date(capturedAt).toLocaleDateString("en-CA", {
    timeZone: "Asia/Shanghai",
  });
  return Array.from({ length: 30 }, (_, index) => {
    const date = new Date(`${asOf}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() - 29 + index);
    const snapshotDate = date.toISOString().slice(0, 10);
    if (metric === "orders")
      return {
        snapshotDate,
        demandQty: null,
        shortageQty: null,
        ...trends.orders.find((row) => row.snapshotDate === snapshotDate),
      };
    const values: Record<string, string | number | null> = { snapshotDate };
    for (const layer of ["base", "branch", "customer"] as const) {
      if (metric === "aging")
        values[layer] =
          trends.aging.find(
            (row) => row.snapshotDate === snapshotDate && row.layer === layer,
          )?.averageAge ?? null;
      else {
        const rows = trends.inventory.filter(
          (row) => row.snapshotDate === snapshotDate && row.layer === layer,
        );
        values[layer] = rows.length
          ? rows.reduce((sum, row) => sum + row.qty, 0)
          : null;
      }
    }
    return values;
  });
}

export function FullChainTrends({
  workspace,
  filters,
}: {
  workspace: FullChainWorkspace;
  filters: { category: string; org: string };
}) {
  const [metric, setMetric] = useState<Metric>("inventory");
  const [result, setResult] = useState<TrendResult | null>(null);
  const [state, setState] = useState("idle");
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  const organization = filters.org
    ? (workspace.categoryStructure ?? workspace.structure).find(
        (row) =>
          JSON.stringify([row.layer, row.objectId ?? row.objectName]) ===
          filters.org,
      )
    : undefined;
  const queryFilters = {
    ...workspace.filters,
    ...(filters.category ? { category: filters.category } : {}),
    ...(organization
      ? {
          [organization.layer === "base"
            ? "base"
            : organization.layer === "branch"
              ? "branch"
              : "customerId"]: organization.objectId ?? organization.objectName,
        }
      : {}),
  };
  const queryKey = JSON.stringify([
    workspace.workspaceId,
    queryFilters,
    filters.org,
  ]);
  useEffect(() => {
    request.current?.abort();
    request.current = null;
    setResult(null);
    setState("idle");
    setError("");
    return () => request.current?.abort();
  }, [queryKey]);
  const data = useMemo(
    () => (result ? trendView(result.trends, metric, result.generatedAt) : []),
    [result, metric],
  );
  const shownSeries = series[metric].filter(
    (item) => item.key !== "customer" || workspace.scope === "all-channel",
  );
  useEffect(
    () =>
      ownContextPart("trendView", {
        dataMode: "MOCK_DATA_ONLY",
        state,
        message: error || undefined,
        workspaceId: workspace.workspaceId,
        scope: workspace.scope,
        filters: queryFilters,
        organization: organization?.objectName,
        metric,
        unit: metric === "aging" ? "天" : "件",
        ...(result
          ? {
              capturedAt: result.generatedAt,
              data,
              coverage:
                "所选组织、品类与SKU的最近30天模拟历史观察；缺失日期与层级为null，不表示当前库存覆盖率。",
            }
          : {}),
        notice:
          "固定模拟输入的最近30天观察；订单限定目标月；缺失不补零。公司库存不含客户观察。风险标签仅筛选结构表。",
      }),
    [queryKey, state, error, metric, result, data],
  );
  useEffect(() => {
    if (!result || state !== "ready") return;
    const unit = metric === "aging" ? "天" : "件";
    const last = data
      .filter((row) =>
        shownSeries.some((item) => typeof row[item.key] === "number"),
      )
      .at(-1);
    const label = referenceText(
      `固定模拟 · ${labels[metric]} · ${organization?.objectName ?? "当前授权组织"} · ${queryFilters.category ?? "全部品类"} · ${queryFilters.sku ?? "全部SKU"}`,
    );
    const value = referenceText(
      `固定模拟；目标月 ${queryFilters.month}；${last ? `${last.snapshotDate}：${shownSeries.map((item) => `${item.name} ${last[item.key] ?? "缺失"}`).join("，")}` : "暂无可验证趋势"}；缺失不补零；${unit}；快照 ${result.workspaceId}`,
    );
    const unregister = reportElements("chain-trend", [
      {
        id:
          "chain:trend:" +
          createHash("sha256")
            .update(JSON.stringify([queryKey, metric, result.generatedAt]))
            .digest("hex"),
        role: "row",
        label,
        value,
      },
    ]);
    const withdraw = () => unregister();
    window.addEventListener("gea-session-changing", withdraw);
    return () => {
      window.removeEventListener("gea-session-changing", withdraw);
      withdraw();
    };
  }, [queryKey, metric, result, state, data]);
  const load = async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setResult(null);
    setState("loading");
    setError("");
    try {
      if (filters.org && !organization)
        throw Error("当前组织不在结果范围，请重新选择组织。");
      const response = await fetch("/api/workspace/trend", {
        method: "POST",
        signal: controller.signal,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workspaceId: workspace.workspaceId,
          filters: Object.fromEntries(
            Object.entries(queryFilters).filter(
              ([key, value]) =>
                workspace.filters[key as keyof typeof workspace.filters] !==
                value,
            ),
          ),
        }),
      });
      const payload = await response.json();
      controller.signal.throwIfAborted();
      if (!response.ok)
        throw Error(payload.error ?? "趋势查询失败，请重试当前范围。");
      if (
        payload.dataMode !== "MOCK_DATA_ONLY" ||
        payload.workspaceId !== workspace.workspaceId ||
        payload.scope !== workspace.scope ||
        JSON.stringify(payload.filters) !== JSON.stringify(queryFilters)
      )
        throw Error("趋势结果与当前查询范围不一致，请重试。");
      setResult(payload);
      setState("ready");
    } catch (caught) {
      if (!controller.signal.aborted) {
        setError(caught instanceof Error ? caught.message : "趋势查询失败");
        setState("error");
      }
    } finally {
      if (request.current === controller) request.current = null;
    }
  };
  return (
    <section className={styles.chartBlock} aria-label="全链库存趋势与缺口">
      <div className={styles.chartHeader}>
        <strong>趋势与缺口</strong>
        <label>
          指标{" "}
          <select
            aria-label="趋势指标"
            value={metric}
            onChange={(event) => setMetric(event.target.value as Metric)}
          >
            {Object.entries(labels).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <Button disabled={state === "loading"} onClick={() => void load()}>
          {state === "error" ? "重试当前范围" : "查询趋势"}
        </Button>
        {state === "loading" && (
          <Button
            onClick={() => {
              request.current?.abort();
              request.current = null;
              setResult(null);
              setState("cancelled");
            }}
          >
            取消查询
          </Button>
        )}
      </div>
      <p>
        目标月 {workspace.filters.month} ·{" "}
        {organization?.objectName ?? "当前授权组织"} ·{" "}
        {filters.category || "全部品类"} · SKU {workspace.filters.sku || "全部"}
        。最近30天观察，订单限定目标月；风险标签仅筛选结构表。
      </p>
      {state === "error" ? (
        <p role="alert">{error}</p>
      ) : state !== "ready" ? (
        <p role="status">
          {state === "loading"
            ? "趋势查询中…"
            : state === "cancelled"
              ? "查询已取消，趋势结果已撤下。"
              : "选择当前范围后查询趋势。"}
        </p>
      ) : (
        <>
          <TrendChart data={data} series={shownSeries} />
          <p>
            缺失期间或层级以断线表示，不补零、不插值；真实零值保留。
            {metric === "orders" &&
              "发运后缺口沿用原计算，不等同当前待分配缺口。"}
          </p>
        </>
      )}
    </section>
  );
}
