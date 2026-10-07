import React, { useEffect, useRef, useState } from "react";
import { loadPersonal, reset } from "./data";
import { readSignal, dataMode } from "./mock-input";
import {
  createPageViewState,
  usePageViewField,
} from "../../../../../shared/view-state.js";
import { dedupeRisks, summarize, type ObjectData, type Risk } from "./model";
import { Button, DataPagination } from "../dsh-ui/controls";
import { WorkbenchLoading } from "../dsh-ui/workbench-loading";
import {
  draft,
  action,
  reportElements,
} from "../../../../../shared/channel.js";
import {
  pageContext,
  updateContext,
  withdraw,
  confirmContext,
  clearContext,
} from "../native/context";
import css from "./style.module.css";
import { ObjectPicker } from "./object-picker";
import { coverageNotes } from "./coverage";
const fmt = (v: number | null) =>
  v === null ? "—" : v.toLocaleString("zh-CN", { maximumFractionDigits: 1 });
function Details({ value }: { value: any }) {
  if (
    value == null ||
    (Array.isArray(value) && !value.length) ||
    (typeof value === "object" && !Object.keys(value).length)
  )
    return <span>—</span>;
  if (Array.isArray(value))
    return (
      <div>
        {value.map((v, i) => (
          <section key={i}>
            <Details value={v} />
          </section>
        ))}
      </div>
    );
  if (typeof value === "object")
    return (
      <dl>
        {Object.entries(value).map(([key, v]) => (
          <div key={key}>
            <dt>{key === "label" ? "指标" : key === "value" ? "内容" : key}</dt>
            <dd>
              <Details value={v} />
            </dd>
          </div>
        ))}
      </dl>
    );
  return <span>{String(value)}</span>;
}
const types = ["全部", "缺货", "低库存", "货龄", "大日期", "滞库"];
const tone = (type: string) =>
  type === "缺货"
    ? "risk"
    : ["货龄", "大日期", "低库存"].includes(type)
      ? "warn"
      : "neutral";
function Section({
  number,
  title,
  children,
}: {
  number: string;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={css.sectionHead}>
      <h2>
        <span>{number}</span>
        {title}
      </h2>
      <span className={css.line} />
      {children}
    </div>
  );
}
function Badge({
  children,
  state = "neutral",
}: {
  children: React.ReactNode;
  state?: string;
}) {
  return (
    <span className={css.badge} data-tone={state}>
      {children}
    </span>
  );
}
export default function Personal({
  view: ownedView,
}: { view?: ReturnType<typeof createPageViewState> } = {}) {
  const [permissionWarnings, setPermissionWarnings] = useState<string[]>([]);
  const [objects, setObjects] = useState<ObjectData[]>([]),
    [errors, setErrors] = useState<string[]>([]),
    [loading, setLoading] = useState(true),
    [revision, setRevision] = useState(0);
  const [view] = useState(
    () => ownedView ?? createPageViewState("inventory-personal"),
  );
  const [selected, setSelected] = usePageViewField(
    React,
    view,
    "selected",
    "全部",
  );
  const [type, setType] = usePageViewField(React, view, "riskType", "全部");
  const [page, setPage] = usePageViewField(React, view, "page", 1);
  const [size, setSize] = usePageViewField(React, view, "size", 10);
  const [feedbackNotes, setFeedbackNotes] = usePageViewField(
    React,
    view,
    "feedbackNotes",
    {},
  );
  const [role, setRole] = useState("全部"),
    [detail, setDetail] = useState<Risk | null>(null),
    [feedback, setFeedback] = useState<Risk | null>(null),
    [note, setNote] = useState(""),
    [busy, setBusy] = useState(false);
  const writeNote = (value: string) => {
    setNote(value);
    if (feedback) setFeedbackNotes({ ...feedbackNotes, [feedback.id]: value });
  };
  const dialog = useRef<HTMLDialogElement>(null);
  const draftAction = useRef(new AbortController());
  const lifetime = useRef(new AbortController()),
    intent = useRef(0),
    transitioning = useRef(false),
    pending = useRef<any>(),
    current = useRef<any>();
  const [referenceReady, setReferenceReady] = useState(false);
  const [publicationError, setPublicationError] = useState(""),
    [publicationRevision, setPublicationRevision] = useState(0);
  useEffect(() => {
    const cancel = () => lifetime.current.abort();
    window.addEventListener("gea-session-changing", cancel);
    window.addEventListener("gea-identity-changed", cancel);
    return () => {
      cancel();
      reset();
      clearContext();
      window.removeEventListener("gea-session-changing", cancel);
      window.removeEventListener("gea-identity-changed", cancel);
    };
  }, []);
  useEffect(() => {
    setPermissionWarnings([]);
    const warn = (e: any) =>
      setPermissionWarnings((values) => [
        ...new Set([...values, e.detail.message]),
      ]);
    window.addEventListener("gea-query-warning", warn);
    return () => window.removeEventListener("gea-query-warning", warn);
  }, [revision]);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setErrors([]);
    setObjects([]);
    loadPersonal(
      (o) => {
        if (active) setObjects(o);
      },
      AbortSignal.any([lifetime.current.signal, readSignal()]),
    )
      .then((result) => {
        if (active) setErrors(result.errors);
      })
      .catch((e) => {
        if (active) setErrors([e.message]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [revision]);
  const scope = objects.filter(
    (o) =>
      (role === "全部" ||
        (role === "基地" && o.kind === "base") ||
        (role === "分仓" && o.kind === "branch")) &&
      (selected === "全部" || o.id === selected),
  );
  const summary = summarize(scope),
    risks = dedupeRisks(scope.flatMap((o) => o.risks)),
    filtered = risks.filter((r) => type === "全部" || r.tags.includes(type));
  useEffect(() => {
    if (
      !loading &&
      selected !== "全部" &&
      !objects.some((o) => o.id === selected)
    )
      setSelected("全部");
  }, [loading, objects, selected]);
  useEffect(() => {
    if (!loading && page > Math.max(1, Math.ceil(filtered.length / size)))
      setPage(Math.max(1, Math.ceil(filtered.length / size)));
  }, [loading, filtered.length, page, size]);
  current.current = { objects, selected, type, role, loading };
  const transition = async (
    requested: any,
    commit: () => void,
    operation?: AbortSignal,
  ) => {
    const signal = operation
      ? AbortSignal.any([lifetime.current.signal, operation])
      : lifetime.current.signal;
    signal.throwIfAborted();
    draftAction.current.abort();
    draftAction.current = new AbortController();
    const sequence = ++intent.current;
    transitioning.current = true;
    setReferenceReady(false);
    setDetail(null);
    setFeedback(null);
    setNote("");
    try {
      await withdraw(requested, signal);
      signal.throwIfAborted();
      if (sequence !== intent.current)
        throw Error("操作已被后续筛选或刷新替代");
      commit();
    } finally {
      if (sequence === intent.current && !lifetime.current.signal.aborted) {
        transitioning.current = false;
        setPublicationRevision((value) => value + 1);
      }
    }
  };
  const applyFilter = async (args: any, operation?: AbortSignal) => {
    lifetime.current.signal.throwIfAborted();
    operation?.throwIfAborted();
    if (
      !args ||
      typeof args !== "object" ||
      Array.isArray(args) ||
      Object.keys(args).some((key) => !["objectId", "riskType"].includes(key))
    )
      throw Error("筛选参数无效");
    const value = current.current;
    if (!Object.keys(args).length) return { unchanged: true };
    if (transitioning.current && pending.current?.refresh)
      throw Error("正在刷新，请等待当前读取后再筛选");
    const target = {
      objectId: transitioning.current
        ? pending.current.objectId
        : value.selected,
      riskType: transitioning.current ? pending.current.riskType : value.type,
      ...args,
    };
    if (
      args.objectId !== undefined &&
      args.objectId !== "全部" &&
      !value.objects.some((o: ObjectData) => o.id === args.objectId)
    )
      throw Error("对象不在已读取授权范围");
    if (args.riskType !== undefined && !types.includes(args.riskType))
      throw Error("风险类型无效");
    if (
      !transitioning.current &&
      target.objectId === value.selected &&
      target.riskType === value.type
    )
      return { unchanged: true };
    pending.current = target;
    await transition(
      target,
      () => {
        setRole("全部");
        setSelected(target.objectId);
        setType(target.riskType);
        setPage(1);
      },
      operation,
    );
    return { filtering: true };
  };
  const refresh = async (operation?: AbortSignal) => {
    lifetime.current.signal.throwIfAborted();
    operation?.throwIfAborted();
    pending.current = { refresh: true };
    await transition(
      { refresh: true },
      () => {
        reset();
        setObjects([]);
        setLoading(true);
        setSelected("全部");
        setType("全部");
        setRole("全部");
        setRevision((value) => value + 1);
      },
      operation,
    );
    return { refreshing: true };
  };
  useEffect(() => {
    const stopFilter = action(
      "filter",
      "切换已读取授权对象与风险类型",
      (args, options) => applyFilter(args, options?.signal),
    );
    const stopRefresh = action(
      "refresh",
      "重新读取当前授权库存范围",
      (_args, options) => refresh(options?.signal),
    );
    return () => {
      stopFilter();
      stopRefresh();
    };
  }, []);
  const showError = (error: any) => {
    if (!lifetime.current.signal.aborted)
      setPublicationError(String(error.message ?? error).slice(0, 600));
  };
  useEffect(() => {
    if (transitioning.current) return;
    setReferenceReady(false);
    let active = true,
      release: (() => void) | undefined;
    const filters = {
      allowedFields: ["objectId", "riskType"],
      current: { objectId: selected, riskType: type },
      options: {
        objectId: ["全部", ...objects.map((o) => o.id)],
        riskType: types,
      },
    };
    void updateContext("personalWorkbench", {
      loading,
      scope: scope.map((o) => ({
        id: o.id,
        name: o.name,
        snapshot: o.snapshot,
        error: o.error,
      })),
      summary,
      risks: filtered.slice((page - 1) * size, page * size),
      pagination: { number: page, size, totalRows: filtered.length },
      dataMode,
      filters,
      errors: [...errors, ...permissionWarnings],
      eventsAvailable: false,
      feedbackAvailable: false,
      roleAssignmentAvailable: false,
    })
      .then((accepted) => {
        if (!active || !accepted || loading) return;
        release = reportElements("personal-facts", [
          ...metrics.map((m) => ({
            id: "personal:metric:" + m.title,
            role: "field",
            label: m.title,
            value: m.value === null ? "未知" : String(m.value) + m.unit,
          })),
          ...objects.map((o) => {
            const risks = dedupeRisks(o.risks);
            return {
              id: "personal:object:" + o.id,
              role: "field",
              label: o.name,
              value: o.error
                ? "风险待核验"
                : risks.length
                  ? risks[0].type + " · " + risks.length + "项"
                  : "暂未识别风险",
            };
          }),
          ...filtered.slice((page - 1) * size, page * size).map((r) => ({
            id: "personal:risk:" + r.id,
            role: "row",
            label: r.object + " · " + r.sku + " · " + r.type,
            value: r.issue,
          })),
        ]);
        setPublicationError("");
        setReferenceReady(true);
      })
      .catch(showError);
    return () => {
      active = false;
      release?.();
    };
  }, [
    objects,
    selected,
    role,
    type,
    loading,
    errors,
    permissionWarnings,
    page,
    size,
    publicationRevision,
  ]);
  useEffect(() => {
    if (detail || feedback) dialog.current?.showModal();
    else dialog.current?.close();
  }, [detail, feedback]);
  async function prepareFeedbackDraft() {
    const signal = AbortSignal.any([
      lifetime.current.signal,
      draftAction.current.signal,
    ]);
    setBusy(true);
    try {
      if (
        !(await confirmContext(signal)) ||
        pageContext().parts.personalWorkbench.loading
      )
        throw Error("当前范围读取未完成");
      await draft(
        "模拟个人库存事项 " +
          feedback!.object +
          " · " +
          feedback!.sku +
          "\n未发送反馈草稿：" +
          note,
        { signal },
      );
      signal.throwIfAborted();
      setFeedback(null);
    } catch (e) {
      setErrors((old) => [...old, (e as Error).message]);
    } finally {
      setBusy(false);
    }
  }
  const objectLabel = scope.length
    ? `${scope.filter((o) => o.kind === "base").length} 个基地 / ${scope.filter((o) => o.kind === "branch").length} 个分仓`
    : "—";
  const snapshots = [...new Set(scope.map((o) => o.snapshot).filter(Boolean))];
  const snapshotLabel =
    snapshots.length === 1 ? snapshots[0] : snapshots.length ? "多源快照" : "—";
  const riskCount = (t: string) =>
    risks.filter((r) => r.tags.includes(t)).length;
  const knownGaps = scope.filter(
    (o) => o.inventory !== null && o.target !== null,
  );
  const gapBadge =
    knownGaps.length === scope.length && scope.length
      ? `${knownGaps.filter((o) => o.inventory! > o.target!).length}高${knownGaps.filter((o) => o.inventory! < o.target!).length}低`
      : "—";
  const metrics = [
    {
      title: "当前库存",
      value: summary.inventory,
      unit: "件",
      badge: objectLabel,
      partial: summary.partial.inventory,
      state: "neutral",
      label: "汇总口径",
      sub: "当前可见对象",
    },
    {
      title: "库存差额",
      value: summary.gap,
      unit: "件",
      badge: summary.partial.gap ? "对已知目标" : gapBadge,
      partial: summary.partial.gap,
      state: summary.gap !== null && summary.gap !== 0 ? "warn" : "neutral",
      label: summary.partial.target ? "已知目标" : "目标库存",
      sub: summary.target === null ? "未返回" : fmt(summary.target) + "件",
    },
    {
      title: "平均货龄",
      value: summary.age,
      unit: "天",
      badge: `${scope.filter((o) => o.age !== null).length}/${scope.length}对象可核验`,
      partial: summary.partial.age,
      state: "neutral",
      label: summary.partial.over30 ? "已知31天以上" : "31天以上",
      sub: summary.over30 === null ? "未返回" : fmt(summary.over30) + "件",
    },
    {
      title: "当前缺货",
      value: summary.shortage,
      unit: "件",
      badge: scope.length ? `已识别 ${riskCount("缺货")} 项` : "暂无对象",
      partial: summary.partial.shortage,
      state:
        summary.shortage !== null && summary.shortage > 0 ? "risk" : "neutral",
      label: "订单缺口",
      sub:
        risks.find((r) => r.type === "缺货")?.object ||
        (summary.shortage === null ? "明细未返回" : "当前未识别"),
    },
    {
      title: "滞库风险",
      value: summary.mixedStagnant ? riskCount("滞库") : summary.stagnant,
      unit: summary.mixedStagnant ? "项" : "件",
      badge: summary.mixedStagnant
        ? "分口径识别"
        : `已识别 ${riskCount("滞库")} 项`,
      partial: summary.partial.stagnant,
      state: riskCount("滞库") > 0 ? "warn" : "neutral",
      label: summary.mixedStagnant ? "基地动销/分仓货龄" : "高库存低动销",
      sub:
        risks.find((r) => r.type === "滞库")?.object ||
        (summary.stagnant === null ? "来源待核验" : "当前未识别"),
    },
  ];
  if (loading && !objects.length)
    return <WorkbenchLoading title="库存管理工作台" cards={5} compact />;
  return (
    <main
      className={css.page}
      data-page-reference-ready={referenceReady}
      data-page-reference-scope={selected + " · " + snapshots.join(" / ")}
    >
      <header className={css.header}>
        <div className={css.titleRow}>
          <h1>库存管理工作台</h1>
          <span role="status">固定模拟数据 · 未请求真实库存</span>
          <Button
            disabled={loading}
            onClick={() => void refresh().catch(showError)}
          >
            刷新
          </Button>
        </div>
        <div className={css.headRow}>
          <ObjectPicker
            objects={objects}
            selected={selected}
            onSelect={(id) =>
              void applyFilter({ objectId: id }).catch(showError)
            }
          />
          <div className={css.dataTime} title={snapshots.join("；")}>
            数据时间：<b>{snapshotLabel}</b>
            {loading ? " · 加载中" : ""}
          </div>
        </div>
      </header>
      <div className={css.content}>
        {publicationError && (
          <p role="alert" className={css.warning}>
            {publicationError}
          </p>
        )}
        {(errors.length > 0 || permissionWarnings.length > 0) && (
          <p role="alert" className={css.warning}>
            {[...errors, ...permissionWarnings].join("；")}
          </p>
        )}
        {scope.some((o) => o.error) && (
          <p role="alert" className={css.warning}>
            {scope
              .filter((o) => o.error)
              .map((o) => o.name + "：" + o.error)
              .join("；")}
          </p>
        )}
        <Section number="一" title="今日运营情况分析">
          <small>
            {selected === "全部" ? "当前授权范围" : scope[0]?.name || "—"}
          </small>
        </Section>
        <section className={css.analysis}>
          {!scope.length ? (
            "暂无已返回的授权对象"
          ) : (
            <>
              当前范围包括 {scope.filter((o) => o.kind === "base").length}{" "}
              个基地、{scope.filter((o) => o.kind === "branch").length}{" "}
              个分仓。当前库存 {fmt(summary.inventory)} 件；
              {summary.shortage === null
                ? "当前缺货待核验"
                : `${summary.partial.shortage ? "已知" : ""}当前缺货 ${fmt(summary.shortage)} 件`}
              ；
              {summary.age === null
                ? "平均货龄待核验"
                : `${summary.partial.age ? "已知范围" : ""}平均货龄 ${fmt(summary.age)} 天`}
              。
              {risks.length
                ? `已识别 ${risks.length} 个待复核对象，优先核对当前订单缺口，再处理货龄和滞库风险。`
                : "已返回数据中暂未识别风险。"}
              <p>
                “部分”表示目标、动销或货龄尚未覆盖全部对象，不能将已知值当作全量结论。昨日延续与反馈进展尚未接入。
              </p>
            </>
          )}
        </section>
        <Section number="二" title="关注的指标情况" />
        {scope.some((o) => coverageNotes(o).length > 0) && (
          <details className={css.coverage}>
            <summary>
              数据完整性说明 ·{" "}
              {scope.filter((o) => coverageNotes(o).length > 0).length}{" "}
              个对象需核验
            </summary>
            <p>
              空值不等于零。以下说明仅针对本工作台当前授权查询结果；源库是否确实无记录，还需数据提供方确认。
            </p>
            {scope
              .filter((o) => coverageNotes(o).length > 0)
              .map((o) => (
                <div key={o.id}>
                  <b>{o.name}</b>
                  <span>{coverageNotes(o).join("；")}</span>
                </div>
              ))}
          </details>
        )}
        <div className={css.metrics} aria-label="关注的指标情况">
          {metrics.map((m) => (
            <button
              key={m.title}
              data-page-block
              data-page-target={"personal:metric:" + m.title}
              data-page-label={m.title}
              className={css.metric}
              title={`${m.title}：${m.value === null ? "待核验" : fmt(m.value) + m.unit}${m.partial ? "（部分，未覆盖全部对象）" : ""}；${m.label}：${m.sub}`}
              onClick={() => {
                setDetail({
                  id: m.title,
                  objectId: selected,
                  object: "当前范围",
                  sku: "",
                  category: "",
                  type: m.title,
                  tags: [],
                  priority: 0,
                  issue: m.title,
                  action: "",
                  role: "",
                  details: scope.map((o) => ({
                    对象: o.name,
                    快照: o.snapshot || "未返回",
                    当前库存: o.inventory,
                    目标库存: o.target,
                    平均货龄: o.age,
                    货龄计算库存: o.ageWeight,
                    三十一天以上: o.over30,
                    当前缺货: o.shortage,
                    滞库: o.stagnant,
                    滞库口径: o.kind === "base" ? "高库存低动销" : "90天及以上",
                    缺值说明:
                      coverageNotes(o).join("；") || "当前指标均有可用返回值",
                    数据覆盖:
                      Object.entries(o.partial ?? {})
                        .filter(([, v]) => v)
                        .map(
                          ([k]) =>
                            ((
                              ({
                                target: "目标",
                                age: "货龄",
                                over30: "货龄库存",
                                shortage: "缺口",
                                stagnant: "动销",
                                inventory: "库存",
                              }) as Record<string, string>
                            )[k] ?? k) + "不完整",
                        )
                        .join("、") || "以已返回数据为准",
                  })),
                });
              }}
            >
              <div>
                <span>
                  {m.title}
                  {m.partial && <small> · 部分</small>}
                </span>
                <Badge state={m.state}>{m.badge}</Badge>
              </div>
              <strong data-tone={m.state} data-empty={m.value === null}>
                {m.title === "库存差额" && m.value !== null && m.value > 0
                  ? "+"
                  : ""}
                {m.value === null ? "待核验" : fmt(m.value)}
                <em>{m.value === null ? "" : m.unit}</em>
              </strong>
              <footer>
                <span>{m.label}</span>
                <b>{m.sub}</b>
              </footer>
            </button>
          ))}
        </div>
        <div className={css.objects} aria-label="对象风险速览">
          {objects.map((o) => {
            const first = dedupeRisks(o.risks)[0];
            const count = dedupeRisks(o.risks).length;
            return (
              <button
                key={o.id}
                data-page-block
                data-page-target={"personal:object:" + o.id}
                data-page-label={o.name}
                title={
                  o.error
                    ? "风险待核验"
                    : first?.issue || "已返回数据中暂未识别风险"
                }
                onClick={() =>
                  void applyFilter({ objectId: o.id }).catch(showError)
                }
                aria-pressed={selected === o.id}
              >
                <i
                  className={css.dot}
                  data-tone={first ? tone(first.type) : "neutral"}
                />
                <b>{o.name}</b>
                <span>
                  {o.error
                    ? "风险待核验"
                    : first
                      ? `${first.type} · ${count} 项`
                      : "暂未识别风险"}
                </span>
              </button>
            );
          })}
        </div>
        <Section number="三" title="今日优先处理事项">
          <nav className={css.filters} aria-label="风险类型">
            {types.map((t) => (
              <button
                key={t}
                aria-pressed={type === t}
                onClick={() =>
                  void applyFilter({ riskType: t }).catch(showError)
                }
              >
                {t}
                {type !== t &&
                  risks.some((r) => t === "全部" || r.tags.includes(t)) && (
                    <i aria-label="有待处理事项" />
                  )}
              </button>
            ))}
          </nav>
          <small>{loading ? "加载中" : `共 ${filtered.length} 条`}</small>
        </Section>
        <section className={css.tablePanel}>
          <div className={css.scroll}>
            <table>
              <thead>
                <tr>
                  {[
                    "优先级",
                    "风险类型",
                    "对象",
                    "关键问题",
                    "建议动作",
                    "责任角色",
                    "反馈状态",
                    "操作",
                  ].map((t) => (
                    <th key={t}>{t}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.slice((page - 1) * size, page * size).map((r, i) => (
                  <tr
                    key={r.id}
                    data-page-target={"personal:risk:" + r.id}
                    data-page-label={r.object + " · " + r.sku + " · " + r.type}
                  >
                    <td>
                      <span
                        className={css.priority}
                        data-tone={
                          r.priority === 1
                            ? "risk"
                            : r.priority === 2
                              ? "warn"
                              : "neutral"
                        }
                      >
                        {r.priority}
                      </span>
                    </td>
                    <td>
                      <Badge state={tone(r.type)}>{r.type}</Badge>
                      {r.tags.filter((t) => t !== r.type).join(" / ")}
                    </td>
                    <td>
                      <b>{r.object}</b>
                      <small>
                        {r.category} · {r.sku}
                      </small>
                    </td>
                    <td>{r.issue}</td>
                    <td>{r.action}</td>
                    <td>{r.role || "—"}</td>
                    <td>
                      <i className={css.dot} data-tone="neutral" />
                      未接入
                    </td>
                    <td>
                      <div className={css.rowActions}>
                        <button onClick={() => setDetail(r)}>查看明细</button>
                        <button
                          onClick={() => {
                            setFeedback(r);
                            setNote(feedbackNotes[r.id] ?? "");
                          }}
                        >
                          补充进展
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!filtered.length && (
            <p className={css.empty}>当前筛选暂无已识别事项</p>
          )}
          <DataPagination
            pageNumber={page}
            pageSize={size}
            totalCount={filtered.length}
            onPageChange={setPage}
            pageSizeOptions={[10, 20, 50]}
            onPageSizeChange={(n) => {
              setSize(n);
              setPage(1);
            }}
          />
        </section>
        <Section number="四" title="当前需协同事件" />
        <section className={css.event}>
          <div className={css.eventTitle}>
            <b>协同事件数据尚未接入</b>
            <Badge>未接入</Badge>
          </div>
          <div className={css.eventBody}>
            目前可在上方风险事项中查看明细、补充进展并交给对话整理草稿。事件状态与历史反馈未返回，不能视为没有待办事件。
          </div>
        </section>
      </div>
      <dialog
        ref={dialog}
        className={css.dialog}
        onCancel={() => {
          setDetail(null);
          setFeedback(null);
        }}
      >
        <header>
          <h2>{feedback ? "补充进展" : detail?.issue}</h2>
          <Button
            onClick={() => {
              setDetail(null);
              setFeedback(null);
            }}
          >
            关闭
          </Button>
        </header>
        {feedback ? (
          <>
            <p>
              {feedback.object} · {feedback.sku}
            </p>
            <label>
              原因说明与处理计划
              <textarea
                value={note}
                onChange={(e) => writeNote(e.target.value)}
                maxLength={8000}
                placeholder="原因、处理计划、责任角色、预计完成时间"
              />
            </label>
            <p>当前文字作为未提交字段保留。插入右侧输入框只形成未发送草稿。</p>
            <Button
              disabled={!note.trim() || busy}
              onClick={() => void prepareFeedbackDraft()}
            >
              插入未发送草稿
            </Button>
          </>
        ) : (
          <Details value={detail?.details} />
        )}
      </dialog>
    </main>
  );
}
