import { useState } from "react";
export type Series = {
  key: string;
  name?: string;
  color: string;
  visible?: boolean;
};
// Missing observations break a line. Neither interpolation nor a zero is inserted.
export function trendSegments(data: Record<string, unknown>[], key: string) {
  const segments: { index: number; value: number }[][] = [];
  let current: { index: number; value: number }[] = [];
  for (const [index, row] of data.entries()) {
    const value = row[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      current.push({ index, value });
    } else if (current.length) {
      segments.push(current);
      current = [];
    }
  }
  if (current.length) segments.push(current);
  return segments;
}
export function TrendChart({
  data = [],
  series,
  height = 250,
  xKey = "snapshotDate",
}: {
  data: any[];
  series: Series[];
  height?: number;
  xKey?: string;
}) {
  const [focus, setFocus] = useState<number | null>(null);
  const shown = series.filter((s) => s.visible !== false),
    values = shown.flatMap((s) =>
      data
        .map((r) => r[s.key])
        .filter((v) => typeof v === "number" && Number.isFinite(v)),
    );
  if (!values.length) return <p role="status">暂无可验证的趋势数据</p>;
  const lo = Math.min(0, ...values),
    hi = Math.max(1, ...values),
    w = 780,
    h = height - 42,
    left = 72,
    right = 18,
    top = 12,
    bottom = 30;
  const x = (i: number) =>
      left + ((w - left - right) * i) / Math.max(1, data.length - 1),
    y = (v: number) => top + ((h - top - bottom) * (hi - v)) / (hi - lo);
  const label = (v: number) =>
    v.toLocaleString("zh-CN", { maximumFractionDigits: 1 });
  return (
    <figure style={{ margin: 0 }}>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        style={{ width: "100%", height: h }}
        role="img"
        aria-label={shown.map((s) => s.name ?? s.key).join("、") + "趋势"}
      >
        {Array.from({ length: 5 }, (_, i) => {
          const v = lo + ((hi - lo) * i) / 4;
          return (
            <g key={i}>
              <line
                x1={left}
                x2={w - right}
                y1={y(v)}
                y2={y(v)}
                stroke="var(--dsw-alias-border-l3)"
              />
              <text
                x={left - 8}
                y={y(v) + 4}
                textAnchor="end"
                fontSize="11"
                fill="currentColor"
              >
                {label(v)}
              </text>
            </g>
          );
        })}
        {shown.map((s) => (
          <g key={s.key}>
            {trendSegments(data, s.key).map((seg, i) => (
              <polyline
                key={i}
                points={seg.map((p) => `${x(p.index)},${y(p.value)}`).join(" ")}
                fill="none"
                stroke={s.color}
                strokeWidth="2"
              />
            ))}
            {data.map((r, i) =>
              typeof r[s.key] === "number" && Number.isFinite(r[s.key]) ? (
                <circle
                  key={i}
                  cx={x(i)}
                  cy={y(r[s.key])}
                  r={3}
                  fill={s.color}
                  tabIndex={0}
                  onFocus={() => setFocus(i)}
                  onMouseEnter={() => setFocus(i)}
                >
                  <title>
                    {r[xKey]}：{s.name ?? s.key} {label(r[s.key])}
                  </title>
                </circle>
              ) : null,
            )}
          </g>
        ))}
        {data.map((r, i) =>
          i === 0 ||
          i === data.length - 1 ||
          i % Math.max(1, Math.ceil(data.length / 6)) === 0 ? (
            <text
              key={i}
              x={x(i)}
              y={h - 7}
              textAnchor="middle"
              fontSize="10"
              fill="currentColor"
            >
              {r[xKey]}
            </text>
          ) : null,
        )}
      </svg>
      <figcaption style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        {shown.map((s) => (
          <span key={s.key} style={{ color: s.color }}>
            ● {s.name ?? s.key}
            {focus !== null
              ? `：${data[focus]?.[s.key] == null ? "缺失" : label(data[focus][s.key])}`
              : ""}
          </span>
        ))}
        {focus !== null && <span>{data[focus]?.[xKey]}</span>}
      </figcaption>
    </figure>
  );
}
