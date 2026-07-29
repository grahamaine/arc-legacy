import { useId, useRef, useState } from "react";

export interface SparkPoint {
  /** X value (e.g. unix seconds). Only used for ordering + tooltip labels. */
  x: number;
  /** Y value plotted on the vertical axis. */
  y: number;
  /** Optional pre-formatted label for the tooltip (falls back to y). */
  label?: string;
}

/**
 * A single-series area + line sparkline, drawn as inline SVG so it inherits the
 * app theme and ships no chart library. Per the dataviz method a lone series
 * needs no legend — the surrounding card title names it — and it gets a hover
 * crosshair + tooltip by default. Colour is the app accent throughout.
 */
export function Sparkline({
  data,
  height = 64,
  formatValue = (n) => n.toLocaleString(undefined, { maximumFractionDigits: 6 }),
  ariaLabel,
}: {
  data: SparkPoint[];
  height?: number;
  formatValue?: (n: number) => string;
  ariaLabel?: string;
}) {
  const gradId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  // A flat/empty series has nothing to plot.
  if (data.length < 2) {
    return (
      <div className="spark" style={{ height }}>
        <p className="spark-empty">Not enough history yet.</p>
      </div>
    );
  }

  // Fixed internal coordinate space; the SVG scales to its container width.
  const W = 300;
  const H = height;
  const padY = 6;
  const ys = data.map((d) => d.y);
  const min = Math.min(...ys);
  const max = Math.max(...ys);
  const span = max - min || 1;

  const xAt = (i: number) => (i / (data.length - 1)) * W;
  const yAt = (v: number) => padY + (1 - (v - min) / span) * (H - padY * 2);

  const linePts = data.map((d, i) => `${xAt(i)},${yAt(d.y)}`).join(" ");
  const areaPts = `0,${H} ${linePts} ${W},${H}`;

  const onMove = (e: React.PointerEvent) => {
    const el = wrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const rel = (e.clientX - rect.left) / rect.width; // 0..1
    const idx = Math.round(rel * (data.length - 1));
    setHover(Math.max(0, Math.min(data.length - 1, idx)));
  };

  const active = hover != null ? data[hover] : null;
  const activeLeftPct = hover != null ? (xAt(hover) / W) * 100 : 0;

  return (
    <div
      className="spark"
      ref={wrapRef}
      style={{ height }}
      onPointerMove={onMove}
      onPointerLeave={() => setHover(null)}
      role="img"
      aria-label={
        ariaLabel ??
        `Trend from ${formatValue(data[0].y)} to ${formatValue(data[data.length - 1].y)}`
      }
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        width="100%"
        height={H}
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={areaPts} fill={`url(#${gradId})`} />
        <polyline
          points={linePts}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        {hover != null && (
          <>
            <line
              x1={xAt(hover)}
              y1={0}
              x2={xAt(hover)}
              y2={H}
              stroke="var(--accent)"
              strokeOpacity="0.4"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
            <circle
              cx={xAt(hover)}
              cy={yAt(data[hover].y)}
              r="3.5"
              fill="var(--accent)"
              stroke="var(--bg)"
              strokeWidth="1.5"
              vectorEffect="non-scaling-stroke"
            />
          </>
        )}
      </svg>
      {active && (
        <div
          className="spark-tip"
          style={{
            left: `${activeLeftPct}%`,
            transform: `translateX(${activeLeftPct > 60 ? "-100%" : "0"})`,
          }}
        >
          {active.label ?? formatValue(active.y)}
        </div>
      )}
    </div>
  );
}
