// Inline-SVG charts for the Final Report. Pure string builders — no runtime
// dependency, no client JS — so they render identically in the browser preview
// and in the Playwright HTML→PDF pipeline. Brand palette only.

import { esc } from "./doc-shell";

export interface Bar {
  label: string; // x-axis label (lab code, point…)
  value: number;
  color: string; // bar fill (verdict colour)
}
export interface RefLine {
  value: number; // y position (e.g. ±2, ±3, ±1) — drawn at +value and −value
  label: string; // e.g. "±2"
  color: string;
}

const GREEN = "#88a77b";
const AXIS = "#9a9a9a";
const GRID = "#e3e3e3";
const INK = "#444";

/**
 * Symmetric vertical bar chart with a zero baseline and ± reference lines.
 * Bars grow up (positive) or down (negative) from the centre. Used for
 * z-scores (refs ±2, ±3) and Eₙ (ref ±1).
 */
export function barChart(
  bars: Bar[],
  refs: RefLine[],
  opts: { caption: string; yMaxMin?: number } = { caption: "" }
): string {
  if (bars.length === 0) return "";
  const W = 720;
  const H = 250;
  const m = { top: 26, right: 14, bottom: 48, left: 40 };
  const plotW = W - m.left - m.right;
  const plotH = H - m.top - m.bottom;
  const y0 = m.top + plotH / 2; // zero baseline

  const maxData = Math.max(...bars.map((b) => Math.abs(b.value)).filter((v) => !Number.isNaN(v)), 0);
  const maxRef = Math.max(...refs.map((r) => Math.abs(r.value)), 0);
  const yMax = Math.max(opts.yMaxMin ?? 0, maxRef * 1.25, maxData * 1.15, 0.5);
  const py = (v: number) => (v / yMax) * (plotH / 2); // value → pixel offset from baseline

  const step = plotW / bars.length;
  const bw = Math.min(46, step * 0.62);

  const els: string[] = [];

  // reference lines (+ and −) with right-edge labels
  for (const r of refs) {
    for (const sign of [1, -1]) {
      const y = y0 - sign * py(r.value);
      els.push(
        `<line x1="${m.left}" y1="${y.toFixed(1)}" x2="${m.left + plotW}" y2="${y.toFixed(1)}" stroke="${r.color}" stroke-width="1" stroke-dasharray="4 3" opacity="0.8"/>`
      );
    }
    const yTop = y0 - py(r.value);
    els.push(
      `<text x="${m.left + plotW - 2}" y="${(yTop - 2).toFixed(1)}" text-anchor="end" font-size="8.5" fill="${r.color}">${esc(r.label)}</text>`
    );
  }

  // zero baseline
  els.push(`<line x1="${m.left}" y1="${y0}" x2="${m.left + plotW}" y2="${y0}" stroke="${AXIS}" stroke-width="1.2"/>`);
  els.push(`<text x="${m.left - 5}" y="${y0 + 3}" text-anchor="end" font-size="8.5" fill="${INK}">0</text>`);

  // bars + labels
  bars.forEach((b, i) => {
    const cx = m.left + step * (i + 0.5);
    const x = cx - bw / 2;
    if (!Number.isNaN(b.value)) {
      const h = Math.min(py(Math.abs(b.value)), plotH / 2);
      const top = b.value >= 0 ? y0 - h : y0;
      els.push(
        `<rect x="${x.toFixed(1)}" y="${top.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(h, 0.5).toFixed(1)}" fill="${b.color}" rx="1.5"/>`
      );
      const vy = b.value >= 0 ? top - 3 : top + h + 9;
      els.push(
        `<text x="${cx.toFixed(1)}" y="${vy.toFixed(1)}" text-anchor="middle" font-size="8" fill="${INK}">${esc(b.value.toFixed(2))}</text>`
      );
    }
    // x label (rotate if crowded)
    const rotate = bars.length > 8;
    els.push(
      rotate
        ? `<text x="${cx.toFixed(1)}" y="${H - m.bottom + 12}" text-anchor="end" font-size="8" fill="${INK}" transform="rotate(-45 ${cx.toFixed(1)} ${H - m.bottom + 12})">${esc(b.label)}</text>`
        : `<text x="${cx.toFixed(1)}" y="${H - m.bottom + 13}" text-anchor="middle" font-size="8.5" fill="${INK}">${esc(b.label)}</text>`
    );
  });

  // frame + caption
  els.unshift(`<rect x="${m.left}" y="${m.top}" width="${plotW}" height="${plotH}" fill="#fff" stroke="${GRID}"/>`);
  const caption = opts.caption
    ? `<text x="${m.left}" y="16" font-size="9.5" font-weight="700" fill="${GREEN}" font-family="sans-serif">${esc(opts.caption)}</text>`
    : "";

  return `<svg class="chart" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;margin:6px 0 10px;font-family:'Sofia Sans Condensed',sans-serif;">${caption}${els.join("")}</svg>`;
}

// shared verdict → colour mapping (matches the report tables)
export const VERDICT_COLOR: Record<string, string> = {
  satisfactory: GREEN,
  warning: "#b8860b",
  action: "#9e2b2b",
  A: GREEN,
  N: "#9e2b2b",
};
