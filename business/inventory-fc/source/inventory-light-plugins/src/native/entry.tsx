import React, { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import Page from "@business-page";
import { mountBusinessFetch, clearBusinessCache } from "./api";
import { action, ready } from "../channel.js";
import { updateContext, clearContext } from "./context";
import "@business-style";

class Boundary extends React.Component<any, { error: string }> {
  state = { error: "" };
  static getDerivedStateFromError(e: Error) {
    return { error: e.message };
  }
  render() {
    return this.state.error ? (
      <p role="alert">页面暂不可用：{this.state.error}</p>
    ) : (
      this.props.children
    );
  }
}
let refreshPage = () => {};
function App() {
  const [revision, bump] = useState(0),
    [warnings, setWarnings] = useState<string[]>([]);
  useEffect(() => {
    const warn = (event: any) => {
      setWarnings((values) => [...new Set([...values, event.detail.message])]);
      updateContext("queryFailure", {
        message: event.detail.message,
        coverage: "部分或全部查询未成功，不能用缺失数据推断零值",
      });
    };
    window.addEventListener("gea-query-warning", warn);
    return () => window.removeEventListener("gea-query-warning", warn);
  }, []);
  refreshPage = () => {
    clearBusinessCache();
    clearContext();
    setWarnings([]);
    window.dispatchEvent(new Event("light-refresh"));
    bump((n) => n + 1);
  };
  return (
    <>
      {warnings.length > 0 && (
        <div
          role="alert"
          style={{ padding: 12, color: "#a34200", background: "#fff7e8" }}
        >
          {warnings.map((w) => (
            <p key={w}>{w}</p>
          ))}
        </div>
      )}
      <Boundary key={revision}>
        <Page />
      </Boundary>
    </>
  );
}
async function mount() {
  await mountBusinessFetch();
  const root = createRoot(document.getElementById("app")!);
  root.render(<App />);
  window.addEventListener("gea-page-refresh", () => refreshPage());
  window.addEventListener("gea-session-changed", () => refreshPage());
  action("refresh", "清除本页快照并重新查询 GEA", () => {
    refreshPage();
    return { refreshing: true };
  });
  window.addEventListener("gea-identity-changed", () => {
    clearBusinessCache(true);
    clearContext();
    refreshPage();
  });
}
void mount().catch((e) => {
  document.getElementById("app")!.textContent = e.message;
});
