import { useRef, useState, type ReactNode } from 'react';
import type { Bucket } from './api';
import { num, pct, shortDate, longDate, delta } from './format';

/** Monotone cubic path (no overshoot below zero, unlike plain splines). */
function monotonePath(pts: [number, number][]): string {
  const n = pts.length;
  if (n === 0) return '';
  if (n === 1) return `M${pts[0][0]},${pts[0][1]}`;
  const dx: number[] = [], m: number[] = [], t: number[] = new Array(n);
  for (let i = 0; i < n - 1; i++) {
    dx.push(pts[i + 1][0] - pts[i][0]);
    m.push((pts[i + 1][1] - pts[i][1]) / (dx[i] || 1));
  }
  t[0] = m[0];
  t[n - 1] = m[n - 2];
  for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) { t[i] = 0; t[i + 1] = 0; continue; }
    const a = t[i] / m[i], b = t[i + 1] / m[i], s = a * a + b * b;
    if (s > 9) { const k = 3 / Math.sqrt(s); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i]; }
  }
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += ` C${pts[i][0] + h},${pts[i][1] + h * t[i]} ${pts[i + 1][0] - h},${pts[i + 1][1] - h * t[i + 1]} ${pts[i + 1][0]},${pts[i + 1][1]}`;
  }
  return d;
}

function niceMax(v: number): number {
  if (v <= 4) return 4;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const k of [1, 2, 2.5, 5, 10]) if (k * p >= v) return k * p;
  return 10 * p;
}

export function TrendChart({
  series,
  showPrev,
  label,
  prevLabel,
}: {
  series: { day: string; count: number; prev: number }[];
  showPrev: boolean;
  label: string;
  prevLabel: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const W = 1000, H = 260, L = 40, R = 12, T = 14, B = 30;
  const max = niceMax(Math.max(1, ...series.map((s) => s.count), ...(showPrev ? series.map((s) => s.prev) : [])));
  const x = (i: number) => L + (series.length <= 1 ? 0 : (i / (series.length - 1)) * (W - L - R));
  const y = (v: number) => T + (1 - v / max) * (H - T - B);
  const cur = series.map((s, i) => [x(i), y(s.count)] as [number, number]);
  const prev = series.map((s, i) => [x(i), y(s.prev)] as [number, number]);
  const line = monotonePath(cur);
  const area = cur.length ? `${line} L${x(series.length - 1)},${y(0)} L${x(0)},${y(0)} Z` : '';
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((k) => Math.round(max * k));
  const labelEvery = Math.max(1, Math.ceil(series.length / 7));

  const onMove = (e: React.MouseEvent) => {
    const box = ref.current!.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * W;
    const i = Math.round(((px - L) / (W - L - R)) * (series.length - 1));
    setHover(Math.max(0, Math.min(series.length - 1, i)));
  };

  const h = hover != null ? series[hover] : null;
  return (
    <div className="chart-box" ref={ref} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`${label} per day`} style={{ display: 'block' }}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="var(--line-soft)" />
            <text x={L - 8} y={y(t)} textAnchor="end" dominantBaseline="middle" fontSize="12" fill="var(--faint)">
              {num(t)}
            </text>
          </g>
        ))}
        {series.map((s, i) =>
          i % labelEvery === 0 ? (
            <text key={s.day} x={x(i)} y={H - 8} textAnchor="middle" fontSize="12" fill="var(--faint)">
              {shortDate(s.day)}
            </text>
          ) : null,
        )}
        <path d={area} fill="var(--hl-soft)" />
        {showPrev && <path d={monotonePath(prev)} fill="none" stroke="var(--faint)" strokeWidth="2" strokeDasharray="5 5" />}
        <path d={line} fill="none" stroke="var(--ink)" strokeWidth="2.4" />
        {h && (
          <>
            <line x1={x(hover!)} x2={x(hover!)} y1={T} y2={H - B} stroke="var(--line)" />
            <circle cx={x(hover!)} cy={y(h.count)} r="5" fill="var(--hl)" stroke="var(--ink)" strokeWidth="2" />
          </>
        )}
      </svg>
      {h && (
        <div className="chart-tip" style={{ left: `${(x(hover!) / W) * 100}%`, top: `${(y(h.count) / H) * 100}%` }}>
          {longDate(h.day)} · <b>{num(h.count)}</b>
          {showPrev && <span style={{ opacity: 0.7 }}> (prev {num(h.prev)})</span>}
        </div>
      )}
      <div className="chart-legend">
        <span><i style={{ background: 'var(--ink)' }} />{label}</span>
        {showPrev && <span><i style={{ background: 'repeating-linear-gradient(90deg,var(--faint) 0 4px,transparent 4px 7px)' }} />{prevLabel}</span>}
      </div>
    </div>
  );
}

export function BarList({
  rows,
  head,
  render,
  showPrev,
  emptyText = 'No data for this period',
  limit = 8,
}: {
  rows: (Bucket | { key: string; count: number; pct?: number; prev?: number; country?: string | null })[];
  head: string;
  render?: (key: string, row: unknown) => ReactNode;
  showPrev?: boolean;
  emptyText?: string;
  limit?: number;
}) {
  const [all, setAll] = useState(false);
  if (!rows.length) return <div className="no-data">{emptyText}</div>;
  const total = rows.reduce((a, r) => a + r.count, 0);
  const max = Math.max(...rows.map((r) => r.count));
  const shown = all ? rows : rows.slice(0, limit);
  return (
    <>
      <table className="blist">
        <thead>
          <tr>
            <th>{head}</th>
            <th className="n">Count</th>
            <th className="n">%</th>
            {showPrev && <th className="n">vs prev</th>}
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => {
            const d = showPrev && 'prev' in r ? delta(r.count, r.prev ?? 0) : null;
            return (
              <tr key={r.key + ('country' in r ? r.country : '')}>
                <td className="bar-cell">
                  <span className="bar" style={{ width: `${(r.count / max) * 100}%` }} />
                  <span className="txt">{render ? render(r.key, r) : r.key}</span>
                </td>
                <td className="n">{num(r.count)}</td>
                <td className="n muted">{pct(r.pct ?? r.count / total)}</td>
                {showPrev && <td className={`n delta ${d?.dir}`}>{d?.label}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.length > limit && (
        <button className="btn ghost sm" style={{ marginTop: 8 }} onClick={() => setAll(!all)}>
          {all ? 'Show less' : `Show all ${rows.length}`}
        </button>
      )}
    </>
  );
}

export function HourBars({ hours }: { hours: number[] }) {
  const max = Math.max(1, ...hours);
  return (
    <>
      <div className="hours" role="img" aria-label="Engagements by hour of day">
        {hours.map((h, i) => (
          <div key={i} title={`${i}:00 — ${num(h)}`} style={{ height: `${(h / max) * 100}%`, opacity: h ? 0.85 : 0.15 }} />
        ))}
      </div>
      <div className="hours-axis"><span>12am</span><span>6am</span><span>12pm</span><span>6pm</span></div>
    </>
  );
}
