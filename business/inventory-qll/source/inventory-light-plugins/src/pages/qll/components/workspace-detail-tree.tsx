("use client");

import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Button,
  Tooltip,
  type TableProps,
} from "../../../dsh-ui/controls";
import { Table } from "./viewport-table";

import type {
  FullChainWorkspace,
  WorkspaceDetailNode,
} from "dsh-agent-manage/inventory-compute/full-chain-types";
import { appPath } from "../../../../../qll/src/lib/app-path.ts";
import { workspaceViewKey } from "../../../../../qll/src/lib/workspace-stream.ts";
import styles from "./full-chain-workbench.module.css";
import {useTreePages} from './use-tree-pages';

const quantity = (value: unknown) =>
  typeof value === "number"
    ? value.toLocaleString("zh-CN", { maximumFractionDigits: 2 })
    : value == null
      ? "—"
      : String(value);
export function WorkspaceDetailTree({
  workspace,
  kind,
}: {
  workspace: FullChainWorkspace;
  kind: "aging" | "orders";
}) {
  const viewKey = workspaceViewKey(workspace);
  const treePages = useTreePages(workspace, kind);
  const roots =
    (kind === "aging" ? workspace.agingDetails : workspace.orderDetails) ?? [];
  const [expanded, setExpanded] = useState<(string | number)[]>([]);
  useEffect(()=>treePages.retainVisible(roots.map(treePages.attach),expanded),[viewKey,roots,treePages,JSON.stringify(expanded)]);
  const [selected, setSelected] = useState<WorkspaceDetailNode | null>(null);
  const [result, setResult] = useState(workspace);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    controller.current?.abort();
    setExpanded([]);
    setSelected(null);
    setResult(workspace);
    setBusy(false);
    setFailed("");
    return () => controller.current?.abort();
  }, [viewKey]);
  useEffect(() => {
    if (!selected || !Object.keys(selected.filters).length)
      setResult(workspace);
  }, [workspace, selected]);
  const select = async (row: WorkspaceDetailNode) => {
    if (row.expandable) treePages.activate(row);
    controller.current?.abort();
    setSelected(row);
    setFailed("");
    setExpanded((keys) =>
      row.expandable && !keys.includes(row.key) ? [...keys, row.key] : keys,
    );
    if (!Object.keys(row.filters).length) {
      setResult(workspace);
      setBusy(false);
      return;
    }
    const request = new AbortController();
    controller.current = request;
    setBusy(true);
    try {
      const response = await fetch(appPath('/api/workspace/trend'), {
        method:'POST', headers:{'content-type':'application/json'},
        body:JSON.stringify({workspaceId:workspace.workspaceId,filters:row.filters}),
        signal: request.signal,
        cache: "no-store",
      });
      const payload = await response.json();
      if (!response.ok || !payload.trends)
        throw new Error(payload.error || "当前明细加载失败，未替换全国数据。");
      if (request.signal.aborted) return;
      setResult({...workspace,trends:payload.trends});
    } catch (error) {
      if (!request.signal.aborted) setFailed(error instanceof Error ? error.message : "当前明细加载失败，未替换全国数据。");
    } finally {
      if (!request.signal.aborted) setBusy(false);
    }
  };
  const field = (
    title: string,
    key: string,
    width = 135,
  ): NonNullable<TableProps<WorkspaceDetailNode>["columns"]>[number] => ({
    title,
    width,
    align: "right",
    render: (_: unknown, row: WorkspaceDetailNode) => quantity(row.values[key]),
  });
  const columns: TableProps<WorkspaceDetailNode>["columns"] = [
    {
      title: "对象 / 大类 / SKU",
      width: 220,
      render: (_, row) => (
        <strong className={styles.objectName}>{row.label}</strong>
      ),
    },
    ...(kind === "aging"
      ? [
          field("批次库存/件", "currentQty"),
          field("平均货龄/天", "averageAgeDays"),
          field("最长货龄/天", "maxAgeDays"),
          ...[
            ["0–30天/件", "age0to30"],
            ["31–40天/件", "age31to40"],
            ["41–60天/件", "age41to60"],
            [">60天/件", "age60Plus"],
          ].map(([title, key]) => field(title, key)),
          field("分层超期/件", "riskQty"),
          field("60–89天关注/件", "attentionQty"),
          field("7天后超期/件", "day7"),
          field("14天后超期/件", "day14"),
          field("计算速度/件·日", "dailyVelocity"),
          {
            title: "速度口径",
            width: 200,
            render: (_: unknown, row: WorkspaceDetailNode) =>
              row.values.velocityBasis,
          },
          {
            title: "阈值 / 预测说明",
            width: 260,
            render: (_: unknown, row: WorkspaceDetailNode) => (
              <Tooltip content={row.values.forecastReason}>
                <span>
                  {row.values.threshold} · {row.values.forecastReason}
                </span>
              </Tooltip>
            ),
          },
        ]
      : [
          field("本月订单量/件", "orderQty"),
          field("订单数/张", "orderCount"),
          field("本月需求/件", "demandQty"),
          field("本月发货/件", "shippedQty"),
          field("发运后缺口/件", "shortageQty"),
          field("缺货SKU/个", "shortageSkus"),
          field("影响订单/张", "affectedOrders"),
          {
            title: "满足率/%",
            width: 130,
            render: (_: unknown, row: WorkspaceDetailNode) =>
              quantity(row.values.rate),
          },
          field("库存/件", "currentQty"),
          field("可用库存/件", "availableQty"),
          field("当前待分配单量/件", "pendingQty", 165),
          field("当前已分配/件", "allocatedQty"),
          {
            title: "已备占用/件",
            width: 150,
            render: (_: unknown, row: WorkspaceDetailNode) => (
              <Tooltip content={row.values.preparedReason}>
                <span>不可用</span>
              </Tooltip>
            ),
          },
          field("近7日订单/件", "orderQty7d"),
          field("近7日发货/件", "shippedQty7d"),
          field("近7日缺口/件", "shortageQty7d"),
          {
            title: "可协同库存/件",
            width: 170,
            render: (_: unknown, row: WorkspaceDetailNode) => (
              <Tooltip content={row.values.collaborativeReason}>
                <span>待验证</span>
              </Tooltip>
            ),
          },
        ]),
    { title: "责任角色", width: 140, render: (_, row) => row.values.owner },
    { title: "建议动作", width: 220, render: (_, row) => row.values.action },
    {
      title: "数据日期",
      width: 130,
      render: (_, row) => row.values.sourceDate,
    },
  ];
  const trend =
    kind === "aging"
      ? result.trends.aging
          .filter((row) => !selected || row.layer === selected.layer)
          .map((row) => ({
            snapshotDate: row.snapshotDate,
            value: row.averageAge,
          }))
      : selected && !Object.keys(selected.filters).length
        ? []
        : result.trends.orders.map((row) => ({
            snapshotDate: row.snapshotDate,
            value: row.shortageQty,
          }));
  // No nationwide age series is inferred by averaging independent layer means.
  const displayTrend = kind === "aging" && !selected ? [] : trend;
  return (
    <div data-detail-kind={kind}>
      {kind === "aging" && (
        <p className={styles.evidenceLine}>
          按库龄源的批次库存计算，覆盖范围/日期可能与库存水位不同；7/14天为届时剩余超期库存，缺批次日期或速度不预测。
        </p>
      )}
      {kind === "orders" && (
        <p className={styles.evidenceLine}>
          本月履约与当前待分配独立展示；近7日按下单时间，截至{" "}
          {workspace.orderExecution?.windowEnd ?? "—"}
          ，仅统计已入库记录，不代表窗口数据完整；不把已分配量当已备量。
        </p>
      )}
      {kind === "orders" &&
        workspace.orderExecution?.orderQty != null &&
        workspace.orderExecution.shippedQty != null &&
        workspace.orderExecution.shippedQty >
          workspace.orderExecution.orderQty && (
          <Alert
            type="warning"
            content="源表本月发货量高于订单量，请核对统计范围；不据此反推已备量，异常范围的满足率保持待核实。"
          />
        )}
      <Table<WorkspaceDetailNode>
        rowKey="key"
        columns={columns}
        data={roots.map(treePages.attach)}
        loading={busy}
        pagination={false}
        renderChildFooter={treePages.footer}
        scroll={{ x: kind === "aging" ? 2750 : 3100 }}
        expandedRowKeys={expanded}
        onExpandedRowsChange={setExpanded}
        expandProps={{ strictTreeData: false }}
        onExpand={(row, open) => {
          if (open) treePages.activate(row);
        }}
        rowClassName={(row) =>
          selected?.key === row.key ? styles.selectedRow : ""
        }
        onRow={(row) => ({ onClick: () => void select(row) })}
      />
      {failed && (
        <Alert
          type="error"
          content={failed}
          action={
            <Button onClick={() => selected && void select(selected)}>
              重试
            </Button>
          }
        />
      )}
      
    </div>
  );
}
