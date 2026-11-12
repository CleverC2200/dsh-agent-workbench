const labels = { positive: "正向结论", risk: "风险结论", rhythm: "节奏分析" };
const dimensions = { base: "基地", item: "品项", director: "应责总监" };

/** The Agent uses visible controls; structured content is rendered as text, never as uploaded HTML. */
export function mountReportImport({
  document,
  state,
  preview,
  commit,
  changed,
  ask,
}) {
  const window = document.defaultView;
  const style = document.createElement("style");
  style.textContent =
    ".wb-import-overlay{position:fixed;inset:0;z-index:1500;background:#10203866;display:grid;place-items:center;padding:24px}.wb-import-overlay[hidden]{display:none}.wb-import-dialog{box-sizing:border-box;min-width:0;background:var(--dsw-color-bg,#fff);color:var(--dsw-color-text,#172b4d);border-radius:16px;width:min(920px,100%);max-height:90vh;overflow:auto;padding:26px;box-shadow:0 16px 80px #10203833}.wb-import-head,.wb-import-footer{display:flex;justify-content:space-between;gap:12px;align-items:center}.wb-import-dialog button{border:1px solid #d8dee8;border-radius:8px;background:white;padding:8px 14px;cursor:pointer;color:inherit}.wb-import-dialog button:disabled{opacity:.45;cursor:default}.wb-import-dialog .primary{background:#e7193e;color:white;border-color:#e7193e}.wb-import-note{font-size:13px;line-height:1.7;color:#67758a;background:#f5f7fa;padding:12px;border-radius:8px}.wb-import-card{border:1px solid #e2e7ee;border-radius:10px;padding:16px;margin:12px 0;white-space:pre-wrap;line-height:1.7}.wb-import-card h4{margin:0 0 7px;color:#d9193d}.wb-import-card p{margin:5px 0}.wb-import-footer{position:sticky;bottom:-26px;background:var(--dsw-color-bg,#fff);padding:16px 0;margin-top:18px;display:flex;flex-direction:column;align-items:stretch;gap:16px}.wb-import-help,.wb-import-actions{display:flex;gap:10px;flex-wrap:wrap}.wb-import-actions{justify-content:flex-end;border-top:1px solid #e2e7ee;padding-top:14px}.wb-import-footer button{white-space:nowrap;min-height:38px}.wb-import-help button{flex:1 1 auto}.wb-import-actions button{flex:0 0 auto;min-width:92px}@media(max-width:480px){.wb-import-overlay{padding:12px}.wb-import-dialog{padding:18px}.wb-import-footer{bottom:-18px}.wb-import-help button{flex:1 1 100%}}";
  document.head.append(style);
  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "wb-summary-edit";
  trigger.textContent = "AI 填充";
  trigger.id = "wbImportOpen";
  document.querySelector(".wb-summary-actions").prepend(trigger);
  const overlay = document.createElement("div");
  overlay.className = "wb-import-overlay";
  overlay.hidden = true;
  overlay.innerHTML =
    '<section class="wb-import-dialog" role="dialog" aria-modal="true" aria-labelledby="wbImportHeading"><div class="wb-import-head"><h2 id="wbImportHeading">工作台内容填充预览</h2><button type="button" id="wbImportClose" aria-label="关闭导入预览">关闭</button></div><p class="wb-import-note" id="wbImportNote"></p><div id="wbImportContent"></div><p id="wbImportStatus" role="status"></p><div class="wb-import-footer"><div class="wb-import-help"><button id="wbImportExample" type="button">查看格式示例</button><button id="wbImportAsk" type="button">交给右侧 Agent</button></div><div class="wb-import-actions"><button id="wbImportCancel" type="button">取消</button> <button id="wbImportCommit" type="button" class="primary" disabled>确认导入</button></div></div></section>';
  document.body.append(overlay);
  const find = (id) => overlay.querySelector("#" + id);
  let pending = null,
    pendingValue = null,
    previewRequest = null,
    busy = false,
    showingExample = false,
    sending = false,
    generation = 0;
  const show = (message) => {
    find("wbImportStatus").textContent = message;
  };
  const refresh = () => {
    find("wbImportCommit").disabled =
      busy || showingExample || !pending?.canCommit;
    find("wbImportExample").disabled = busy;
    find("wbImportClose").disabled = busy && !previewRequest;
    find("wbImportCancel").disabled = busy && !previewRequest;
    find("wbImportCancel").textContent =
      pending && !pending.canCommit && !showingExample ? "关闭" : "取消";
    find("wbImportAsk").disabled = busy || sending;
  };
  const card = (title, lines) => {
    const node = document.createElement("article");
    node.className = "wb-import-card";
    const heading = document.createElement("h4");
    heading.textContent = title;
    node.append(heading);
    for (const line of lines) {
      const p = document.createElement("p");
      p.textContent = line;
      node.append(p);
    }
    find("wbImportContent").append(node);
  };
  function render(data, example = false) {
    overlay.hidden = false;
    showingExample = example;
    find("wbImportExample").textContent =
      example && pending ? "返回导入预览" : "查看格式示例";
    const batch = data.batch;
    find("wbImportNote").textContent =
      `${example ? "格式示例，仅用于查看效果，不会写入业务报告。" : "仅填充当前周期的导入内容，已有人工摘要、补充和修改优先保留。"}\n目标周期：${batch.period.start} 至 ${batch.period.end}（结束日不含）。省区不在本版写入范围。`;
    find("wbImportContent").replaceChildren();
    if (Object.keys(batch.summary).length)
      card(
        "本期结论摘要",
        Object.entries(batch.summary).map(
          ([key, value]) => `${labels[key]}：${value}`,
        ),
      );
    for (const row of batch.unmet)
      card(`${dimensions[row.dimension]} · ${row.entity}`, [
        `原因：${row.reason}`,
        `改善措施：${row.measure}`,
      ]);
    for (const row of batch.short)
      card(`短期追进 · ${row.direction}`, [
        `改善措施：${row.measure}`,
        `对应问题：${row.issue}`,
      ]);
    for (const row of batch.long)
      card(`长期机制 · ${row.mechanism}`, [
        row.content,
        `目标：${row.goal}`,
        `状态：${row.status}`,
      ]);
    show(
      example
        ? "示例未保存"
        : data.unchanged
          ? "与已导入内容一致，重复写入不会新增。"
          : "预览已准备，尚未写入工作台。请在此点击“确认导入”，或点击“取消”放弃。聊天回复不会提交。",
    );
    refresh();
  }
  function assertReady() {
    const current = state();
    if (!current.ready || !current.period)
      throw Error("请等待当前报告读取完成，并先保存人工编辑");
    return current;
  }
  function prepare(value, signal) {
    signal?.throwIfAborted();
    const current = assertReady();
    if (typeof value !== "string" || value.length > 60000)
      throw Error("导入内容为空或过大，请拆分批次");
    const batch = JSON.parse(value);
    if (previewRequest?.key === current.key && previewRequest.value === value) return;
    if (busy) throw Error("正在处理另一批导入");
    if (pending?.canCommit && pending.key === current.key && pendingValue === value &&
        pending.editVersion === current.editVersion) {
      render(pending);
      return;
    }
    const epoch = ++generation;
    pending = null;
    pendingValue = null;
    const controller = new AbortController();
    const request = previewRequest = { controller, key: current.key, value, batchId: batch?.batchId };
    busy = true;
    showingExample = false;
    overlay.hidden = false;
    find("wbImportContent").replaceChildren();
    find("wbImportNote").textContent = `目标周期：${current.period.start} 至 ${current.period.end}（结束日不含）。已有人工内容会保留。`;
    show("正在读取报告并校验导入内容，尚未写入。请等待预览完成，可点击取消。重复发送同一批内容不会重复校验。");
    refresh();
    changed();
    const deadline = window.setTimeout(() => controller.abort(Error("预览校验超时，未写入，请使用同一批次重试")), 60000);
    let onAbort;
    const aborted = new Promise((_, reject) => {
      onAbort = () => reject(controller.signal.reason);
      controller.signal.addEventListener("abort", onAbort, { once: true });
    });
    // The action acknowledges the visible loading dialog; the page owns this read-only job.
    void (async () => {
      try {
        const result = await Promise.race([preview(batch, controller.signal), aborted]);
        controller.signal.throwIfAborted();
        if (epoch !== generation || state().key !== current.key)
          throw Error("统计周期已切换，请重新预览");
        pending = { ...result, key: current.key };
        pendingValue = value;
        render(pending);
      } catch (error) {
        if (previewRequest === request) show("预览失败：" + error.message);
      } finally {
        window.clearTimeout(deadline);
        controller.signal.removeEventListener("abort", onAbort);
        if (previewRequest === request) {
          previewRequest = null;
          busy = false;
          refresh();
          window.setTimeout(changed, 0);
        }
      }
    })();
  }
  async function save(value, signal, confirmed) {
    if (
      busy ||
      showingExample ||
      !pending?.canCommit ||
      value !== pending.previewId ||
      confirmed !== true
    )
      throw Error("请先预览并明确确认当前批次");
    const current = assertReady();
    const prepared = pending,
      epoch = generation;
    if (current.key !== pending.key) throw Error("统计周期已切换，请重新预览");
    busy = true;
    refresh();
    show("正在写入并核对数据库回执…");
    try {
      const result = await commit(prepared, signal);
      signal?.throwIfAborted();
      if (generation !== epoch || state().key !== current.key)
        throw Error("原周期写入已确认，当前周期未修改，请返回原周期查看");
      prepared.canCommit = false;
      show(
        result.unchanged
          ? "内容已存在，未重复新增。"
          : "已写入工作台并保存到数据库。",
      );
    } catch (error) {
      show("写入未确认：" + error.message + "。未将预览当作保存结果。");
      throw error;
    } finally {
      busy = false;
      refresh();
      window.setTimeout(changed, 0);
    }
  }
  trigger.onclick = () => {
    overlay.hidden = false;
    if (pending) render(pending);
    else {
      showingExample = false;
      find("wbImportContent").replaceChildren();
      find("wbImportNote").textContent =
        "把经营复盘文件或具体内容发给右侧 Agent，说明需要填充的周期和区域。Agent 会自动打开预览，只有你在这里点击“确认导入”才会写入。";
      show("尚未收到待填充内容");
    }
  };
  const cancel = () => {
    if (busy && !previewRequest) return;
    previewRequest?.controller.abort(Error("已取消预览，未写入"));
    previewRequest = null;
    busy = false;
    const saved = pending && !pending.canCommit;
    generation++;
    pending = null;
    pendingValue = null;
    overlay.hidden = true;
    find("wbImportContent").replaceChildren();
    show(
      saved ? "已关闭预览，已保存内容不受影响。" : "已取消导入，未写入工作台。",
    );
    refresh();
    changed();
  };
  find("wbImportClose").onclick = cancel;
  find("wbImportCancel").onclick = cancel;
  const onKeydown = (event) => {
    if (event.key === "Escape" && !overlay.hidden) cancel();
  };
  window.addEventListener("keydown", onKeydown);
  find("wbImportAsk").onclick = async () => {
    if (busy || sending) return;
    sending = true;
    refresh();
    try {
      await ask(
        "请使用 operations-workbook-exception-import skill，读取我提供的经营复盘文件或明确文本，为当前周期生成结论摘要、基地/应责总监/品项未达成项和短期/长期改善措施的填充预览。缺少文件或内容时说明需要的输入；不要虚构数据，不覆盖人工维护内容。",
      );
      overlay.hidden = true;
    } catch (error) {
      show("发送失败：" + error.message);
    } finally {
      sending = false;
      refresh();
    }
  };
  find("wbImportExample").onclick = () => {
    if (busy) return;
    if (showingExample && pending) {
      render(pending);
      return;
    }
    const current = state();
    render(
      {
        batch: {
          period: current.period ?? {
            start: "当前周期开始日",
            end: "当前周期结束日",
          },
          summary: {
            positive: "示例：已完成经营复盘，重点事项已分解。",
            risk: "示例：部分订单备货节奏需要进一步核实。",
            rhythm: "示例：本周追进异常，下周复核改善效果。",
          },
          unmet: [
            {
              dimension: "base",
              entity: "示例基地",
              reason: "示例：备货与交付节奏存在偏差，具体原因待核验。",
              measure: "示例：核对异常订单并明确追进责任与计划。",
            },
          ],
          short: [
            {
              direction: "示例：异常订单追进",
              measure: "逐单核实备货与交付计划，未确认项继续跟进。",
              issue: "备货和交付节奏偏差（示例）",
            },
          ],
          long: [
            {
              mechanism: "示例：滚动复盘机制",
              content: "按周复核异常原因及整改进度。",
              goal: "形成可跟踪的改善闭环（示例）",
              status: "建议，待确认",
            },
          ],
        },
      },
      true,
    );
    changed();
  };
  find("wbImportCommit").onclick = (event) => {
    if (!event.isTrusted) return;
    void save(pending?.previewId, undefined, true).catch((error) =>
      show(error.message),
    );
  };
  const invalidate = () => {
    if (previewRequest) {
      previewRequest.controller.abort(Error("页面周期或身份已切换"));
      previewRequest = null;
      busy = false;
    }
    generation++;
    pending = null;
    pendingValue = null;
    overlay.hidden = true;
    refresh();
  };
  window.addEventListener("gea-identity-changed", invalidate);
  window.addEventListener("gea-session-changing", invalidate);
  return {
    get busy() {
      return busy;
    },
    context: () => ({
      status: find("wbImportStatus").textContent,
      processing: previewRequest !== null,
      previewId: pending?.previewId ?? null,
      canCommit: pending?.canCommit ?? false,
      awaitingUserConfirmation:
        !overlay.hidden && !showingExample && !!pending?.canCommit,
      confirmationMode: "dialog-only",
      counts: pending?.counts ?? null,
      scope: state().scope,
      authorizedBases:
        state().scope?.base || state().scope?.bases?.join("、") || "",
      period: state().period,
      batchId: pending?.batch?.batchId ?? previewRequest?.batchId ?? null,
    }),
    elements: () => [
      {
        id: "report:import-scope",
        role: "field",
        label: "填充授权基地（服务端再次校验）",
        value: (
          state().scope?.base ||
          state().scope?.bases?.join("、") ||
          "当前报告未读取完成"
        ).slice(0, 190),
      },
      {
        id: "report:import-preview",
        role: "control",
        label: "AI 填充：启动导入预览校验，完成状态见 importPreview",
        actions: ["preview"],
        effect: "draft",
      },
    ],
    apply: async (args, signal) => {
      if (args.kind !== "invoke") throw Error("不支持的导入操作");
      if (args.target === "report:import-preview" && args.action === "preview")
        return prepare(args.value, signal);
      if (args.target === "report:import-commit" || args.action === "commit")
        throw Error("必须由用户在导入预览弹窗点击“确认导入”，聊天确认不能提交");
      throw Error("不支持的导入目标");
    },
    invalidate,
    dispose() {
      invalidate();
      trigger.remove();
      overlay.remove();
      style.remove();
      window.removeEventListener("gea-identity-changed", invalidate);
      window.removeEventListener("gea-session-changing", invalidate);
      window.removeEventListener("keydown", onKeydown);
    },
  };
}
